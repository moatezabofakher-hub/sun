/* Technical Accountant Field Sync v1 — offline authenticated transfer protocol.
 * No network/cloud dependency. Operations are append-only. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FieldProtocol = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const FORMAT = 'TA_FIELD_SYNC_1';
  const enc = new TextEncoder();
  function subtle() { if (!globalThis.crypto?.subtle) throw Error('يلزم بيئة محلية آمنة لدعم التوقيع'); return globalThis.crypto.subtle; }
  function uuid() { const b = new Uint8Array(16); globalThis.crypto.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); }
  function hex(bytes) { return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join(''); }
  function b64u(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function un64(str) { if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str)) throw Error('رمز Base64 غير صالح'); const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - str.length % 4) % 4)); return Uint8Array.from(s, c => c.charCodeAt(0)); }
  function safeJson(str) { if(typeof str!=='string'||str.length>8_000_000) throw Error('ملف المزامنة كبير أو غير صالح'); return JSON.parse(str); }
  function currency(value) { if (value !== 'SYP' && value !== 'USD') throw Error('عملة غير مدعومة في هذه النسخة'); return value; }
  function money(value, curr) { const n = Number(value); if(!Number.isFinite(n)||n<0||n>1e12) throw Error('قيمة مالية غير صحيحة'); return curr === 'SYP' ? Math.round(n) : Math.round(n*100)/100; }
  function positiveNumber(v) { const n = Number(v); if(!Number.isFinite(n) || n<=0 || n>1e10) throw Error('كمية أو سعر غير صحيح'); return n; }
  async function hmac(keyBase64, content) {
    const key = await subtle().importKey('raw', un64(keyBase64), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
    return hex(await subtle().sign('HMAC', key, enc.encode(content)));
  }
  async function seal(payload, key) {
    const data = JSON.stringify(payload);
    return {format:FORMAT, data, mac:await hmac(key,data)};
  }
  async function unseal(envelope, key) {
    if(!envelope||envelope.format!==FORMAT||typeof envelope.data!=='string'||typeof envelope.mac!=='string')throw Error('صيغة مزامنة غير معروفة');
    if (envelope.data.length>8_000_000) throw Error('الملف كبير جدًا');
    const received = envelope.mac.toLowerCase();
    const expected = await hmac(key,envelope.data);
    if(received.length!==expected.length || !/^[0-9a-f]+$/.test(received))throw Error('التحقق من أصالة الملف فشل');
    let differs = 0;for(let i=0;i<received.length;i++) differs |= received.charCodeAt(i)^expected.charCodeAt(i);
    if(differs!==0)throw Error('تم تغيير ملف المزامنة أو أنه من جهاز غير معتمد');
    return safeJson(envelope.data);
  }
  function validateOps(ops, agentId, companyId, warehouseId, items, accounts) {
    if(!Array.isArray(ops)||ops.length>2000)throw Error('عدد العمليات غير صالح');
    const itemMap=new Map(items.map(x=>[x.id,x])); const accMap=new Map(accounts.map(x=>[x.id,x]));
    const seen=new Set();
    return ops.map(op=>{
      if(!op||typeof op.id!=='string'||!/^[a-zA-Z0-9_-]{8,90}$/.test(op.id)||seen.has(op.id))throw Error('معرف عملية غير صالح أو مكرر داخل الملف');
      seen.add(op.id);
      if(op.agentId!==agentId||op.companyId!==companyId||op.warehouseId!==warehouseId)throw Error('العملية تابعة لمندوب أو شركة أو مستودع آخر');
      if(typeof op.date!=='string'||!/^\d{4}-\d\d-\d\d/.test(op.date)||isNaN(Date.parse(op.date)))throw Error('تاريخ عملية غير صالح');
      const code=currency(op.currency);
      const rate=positiveNumber(op.exchangeRate);
      if(!['sale','sale_return','receipt','payment'].includes(op.kind))throw Error('نوع عملية غير مصرح به');
      if(op.kind==='sale'||op.kind==='sale_return') {
        if(!Array.isArray(op.rows)||op.rows.length<1||op.rows.length>100)throw Error('صفوف الفاتورة غير صالحة');
        const rows=op.rows.map(r=>{
          const itm=itemMap.get(r.itemId);if(!itm)throw Error('المادة غير موجودة في الشركة: '+r.itemId);
          const factor=positiveNumber(r.unitFactor);
          const unit=(itm.units||[]).find(u=>u.name===r.unitName && Number(u.factor)===factor);
          if(!unit)throw Error('وحدة المادة غير معتمدة');
          const qty=positiveNumber(r.qty), price=money(r.price,code);
          const total=money(qty*price,code);
          if(Math.abs(total-Number(r.total))>(code==='USD'?0.011:0.51))throw Error('إجمالي بند غير مطابق');
          return {itemId:r.itemId,itemName:itm.name,unitName:r.unitName,unitFactor:factor,qty,price,total,
            baseCurrency:itm.currency,basePrice:Number(unit.salePrice)||0};
        });
        const sum=money(rows.reduce((a,r)=>a+r.total,0),code);
        const paid=money(op.paidAmount||0,code);
        if(paid>sum)throw Error('المقبوض أكبر من قيمة الفاتورة');
        if(op.accountId && !accMap.has(op.accountId))throw Error('الزبون غير موجود');
        if(paid<sum && !op.accountId)throw Error('الفاتورة الآجلة تحتاج حساب عميل');
        if(op.accountId && accMap.get(op.accountId).type!=='customer')throw Error('الفاتورة مرتبطة بغير حساب عميل');
        return {...op,rows,netTotal:sum,paidAmount:paid,exchangeRate:rate};
      }
      if(!op.accountId||!accMap.has(op.accountId))throw Error('السند يحتاج حسابًا صحيحًا');
      const value=money(op.amount,code);if(value<=0)throw Error('مبلغ السند يجب أن يكون أكبر من الصفر');
      return {...op,amount:value,exchangeRate:rate};
    });
  }
  function toLedgerDocuments(ops, agent, startingInvoice, startingVoucher) {
    const invoices=[],vouchers=[];
    for(const op of ops){
      const origin={agentId:agent.id,agentName:agent.name,vehicleName:agent.vehicleName||'',operationId:op.id,localNumber:op.localNumber||'',receivedAt:new Date().toISOString()};
      if(op.kind==='sale'||op.kind==='sale_return'){
        const net=op.netTotal,paid=op.paidAmount;
        invoices.push({id:'field_'+op.id,number:++startingInvoice,type:op.kind,warehouseId:agent.warehouseId,date:op.date,accountId:op.accountId||'',currency:op.currency,exchangeRate:op.exchangeRate,paymentMethod:paid>=net?'cash':paid>0?'partial':'credit',rows:op.rows.map((r,i)=>({...r,rowId:'fieldrow_'+op.id+'_'+i,discount:0})),subTotal:net,discountValue:0,discountType:'amount',discountAmount:0,taxValue:0,taxType:'percent',taxAmount:0,netTotal:net,paidAmount:paid,remainingAmount:money(net-paid,op.currency),note:op.note||'',fieldOrigin:origin});
      }else{
        vouchers.push({id:'field_'+op.id,number:++startingVoucher,type:op.kind,date:op.date,accountId:op.accountId,currency:op.currency,amount:op.amount,exchangeRate:op.exchangeRate,accountCurrency:op.currency,accountAmount:op.amount,note:op.note||'',linkedInvoiceId:op.linkedInvoiceOpId?'field_'+op.linkedInvoiceOpId:'',fieldOrigin:{...origin,linkedInvoiceOperationId:op.linkedInvoiceOpId||''}});
      }
    }
    return {invoices,vouchers};
  }
  function applyStock(baseStock, ops, ackIds) {
    const result={...baseStock},acked=new Set(ackIds||[]);
    for(const op of ops) {
      if(acked.has(op.id)||!['sale','sale_return'].includes(op.kind))continue;
      for(const r of op.rows){ const delta=Number(r.qty)/Number(r.unitFactor);result[r.itemId]=(Number(result[r.itemId])||0)+(op.kind==='sale_return'?delta:-delta); }
    }
    return result;
  }
  function revokeDuplicate(ops, knownIds){const ids=new Set(knownIds);return ops.filter(o=>!ids.has(o.id));}
  function decodePEM(pem) { return un64(String(pem).replace(/-----(?:BEGIN|END) PRIVATE KEY-----/g,'').replace(/\s+/g,'').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')); }
  async function issueLicense(data,pem) {
    const key=await subtle().importKey('pkcs8',decodePEM(pem),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
    const message=b64u(enc.encode(JSON.stringify(data)));
    const signature=await subtle().sign('RSASSA-PKCS1-v1_5',key,enc.encode('TAF1.'+message));
    return 'TAF1.'+message+'.'+b64u(new Uint8Array(signature));
  }
  async function verifyLicense(token,spkiB64,deviceId,companyId,agentId){
    try{
      if(typeof token!=='string'||token.length>6000||!/^TAF1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))return false;
      const [v,p,s]=token.split('.');
      const key=await subtle().importKey('spki',un64(spkiB64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
      if(!await subtle().verify('RSASSA-PKCS1-v1_5',key,un64(s),enc.encode(v+'.'+p)))return false;
      const data=JSON.parse(new TextDecoder().decode(un64(p)));
      return data.companyId===companyId&&data.agentId===agentId&&data.deviceId===deviceId&&data.role==='field'&&Date.parse(data.expiresAt)>Date.now();
    }catch{return false;}
  }
  return {FORMAT,uuid,b64u,un64,hex,seal,unseal,validateOps,toLedgerDocuments,applyStock,revokeDuplicate,currency,money,issueLicense,verifyLicense};
});
