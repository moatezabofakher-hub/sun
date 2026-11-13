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
  function validateOps(ops, agentId, companyId, warehouseId, items, accounts, history=null) {
    if(!Array.isArray(ops)||ops.length>2000)throw Error('عدد العمليات غير صالح');
    const itemMap=new Map(items.map(x=>[x.id,x])); const accMap=new Map(accounts.map(x=>[x.id,x]));
    const seen=new Set(),newAccountIds=new Set();
    const normalizeName=s=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase();
    const duplicateCustomer=(a,b)=>normalizeName(a.name)===normalizeName(b.name) && (!a.phone||!b.phone||String(a.phone).replace(/[\s()+-]/g,'')===String(b.phone).replace(/[\s()+-]/g,''));
    return ops.map(op=>{
      if(!op||typeof op.id!=='string'||!/^[a-zA-Z0-9_-]{8,90}$/.test(op.id)||seen.has(op.id))throw Error('معرف عملية غير صالح أو مكرر داخل الملف');
      seen.add(op.id);
      if(op.agentId!==agentId||op.companyId!==companyId||op.warehouseId!==warehouseId)throw Error('العملية تابعة لمندوب أو شركة أو مستودع آخر');
      if(typeof op.date!=='string'||!/^\d{4}-\d\d-\d\d/.test(op.date)||isNaN(Date.parse(op.date)))throw Error('تاريخ عملية غير صالح');
      const code=currency(op.currency);
      const rate=positiveNumber(op.exchangeRate);
      if(!['sale','sale_return','receipt','payment','expense','customer_create','document_edit'].includes(op.kind))throw Error('نوع عملية غير مصرح به');
      if(op.kind==='document_edit'){
        if(!/^op_[a-f0-9]{32}$/i.test(op.targetOperationId||''))throw Error('معرف المستند المعدّل غير صالح');
        if(!Number.isInteger(op.baseRevision)||op.baseRevision<0||op.baseRevision>1000)throw Error('رقم مراجعة غير صالح');
        if(!op.replacement||typeof op.replacement!=='object'||!['sale','sale_return','receipt','payment'].includes(op.replacement.kind))throw Error('المستند البديل غير صالح');
        const next=validateOps([op.replacement],agentId,companyId,warehouseId,items,accounts)[0];
        if(next.id!==op.targetOperationId||next.localNumber!==op.localNumber||next.kind!==op.originalKind)throw Error('لا يجوز تغيير رقم المستند أو نوعه أثناء التعديل');
        if(Number(next.revision)!==op.baseRevision+1)throw Error('مراجعة المستند لا تطابق الإصدار الجديد');
        if(history){
          const previous=history.find(x=>x.id===op.targetOperationId);
          if(!previous||previous.agentId!==agentId||previous.kind!==next.kind||Number(previous.revision||0)!==op.baseRevision)
            throw Error('تعذر تعديل مستند غير مُرحّل أو تغير في الحساب الرئيسي؛ حدث بيانات المندوب');
        }
        return {...op,revision:op.baseRevision+1,replacement:next};
      }
      if(op.kind==='customer_create'){
        if(op.accountId||op.rows||op.amount!=null)throw Error('إنشاء الزبون ليس حركة مالية');
        const src=op.account;
        if(!src||src.type!=='customer'||typeof src.id!=='string'||!/^acc_field_[a-f0-9]{32}$/i.test(src.id))throw Error('معرّف الزبون أو نوعه غير صحيح');
        const name=String(src.name||'').trim().replace(/\s+/g,' '),phone=String(src.phone||'').trim(),address=String(src.address||'').trim(),paymentTerms=String(src.paymentTerms||'').trim();
        if(name.length<2||name.length>120||phone.length>50||address.length>500||paymentTerms.length>200)throw Error('اسم الزبون أو بياناته غير صحيحة');
        if(newAccountIds.has(src.id))throw Error('تكررت إضافة نفس الزبون ضمن العمليات');
        const existing=accMap.get(src.id);
        if(!existing && [...accMap.values()].some(x=>x.type==='customer'&&duplicateCustomer(x,{name,phone})))throw Error('يوجد زبون مسجل بالاسم والهاتف نفسه؛ راجع الإدارة لتفادي التكرار');
        const account={id:src.id,name,type:'customer',phone,address,paymentTerms,creditLimitUsd:0,openingSyp:0,openingUsd:0,createdAt:op.date.slice(0,10)};
        newAccountIds.add(src.id);
        if(!existing)accMap.set(account.id,account); // allow later invoices/sندات in this ordered batch
        return {...op,account,exchangeRate:rate};
      }
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
            baseCurrency:itm.currency,basePrice:Number(unit.salePrice)||0,
            bomComponents:itm.isBundle?(itm.bundleComponents||[]).map(b=>({itemId:b.itemId,quantity:Number(b.quantity)})):undefined};
        });
        const subTotal=money(rows.reduce((a,r)=>a+r.total,0),code);
        const discountType=op.discountType==='percent'?'percent':'amount';
        const taxType=op.taxType==='amount'?'amount':'percent';
        const rawDiscount=Number(op.discountValue||0),rawTax=Number(op.taxValue||0);
        if(!Number.isFinite(rawDiscount)||!Number.isFinite(rawTax)||rawDiscount<0||rawTax<0||rawDiscount>1e10||rawTax>1e10)
          throw Error('الحسم أو الضريبة غير صالح');
        // Percentages may have more than two decimals; currency amounts may not.
        const discountValue=discountType==='percent'?rawDiscount:money(rawDiscount,code);
        const taxValue=taxType==='percent'?rawTax:money(rawTax,code);
        if(discountType==='percent'&&discountValue>100)throw Error('نسبة الحسم تجاوزت 100%');
        if(taxType==='percent'&&taxValue>100)throw Error('نسبة الضريبة تجاوزت 100%');
        const discountAmount=money(discountType==='percent'?subTotal*discountValue/100:discountValue,code);
        if(discountAmount>subTotal)throw Error('الحسم أكبر من إجمالي الأصناف');
        const taxAmount=money(taxType==='percent'?(subTotal-discountAmount)*taxValue/100:taxValue,code);
        const sum=money(subTotal-discountAmount+taxAmount,code);
        if(op.netTotal!=null&&Math.abs(sum-Number(op.netTotal))>(code==='USD'?0.011:0.51))throw Error('صافي الفاتورة لا يطابق الحسم والضريبة');
        const paid=money(op.paidAmount||0,code);
        if(paid>sum)throw Error('المقبوض أكبر من قيمة الفاتورة');
        if(op.accountId && !accMap.has(op.accountId))throw Error('الزبون غير موجود');
        if(paid<sum && !op.accountId)throw Error('الفاتورة الآجلة تحتاج حساب عميل');
        if(op.accountId && accMap.get(op.accountId).type!=='customer')throw Error('الفاتورة مرتبطة بغير حساب عميل');
        return {...op,rows,subTotal,discountType,discountValue,discountAmount,
          taxType,taxValue,taxAmount,netTotal:sum,paidAmount:paid,exchangeRate:rate};
      }
      if(op.kind==='expense'){
        // Expenses are independent of customer receivables and have a required category.
        if(op.accountId)throw Error('المصروف لا يُربط بحساب زبون');
        const category=String(op.category||'').trim(),note=String(op.note||'').trim();
        if(category.length<2||category.length>80||note.length>200)throw Error('نوع المصروف أو بيانه غير صالح');
        const value=money(op.amount,code);if(value<=0)throw Error('مبلغ المصروف يجب أن يكون موجبًا');
        return {...op,amount:value,category,note,exchangeRate:rate};
      }
      if(!op.accountId||!accMap.has(op.accountId))throw Error('السند يحتاج حسابًا صحيحًا');
      const value=money(op.amount,code);if(value<=0)throw Error('مبلغ السند يجب أن يكون أكبر من الصفر');
      return {...op,amount:value,exchangeRate:rate};
    });
  }
  function toLedgerDocuments(ops, agent, startingInvoice, startingVoucher) {
    const invoices=[],vouchers=[],expenses=[],customers=[];
    for(const op of ops){
      const origin={agentId:agent.id,agentName:agent.name,vehicleName:agent.vehicleName||'',operationId:op.id,localNumber:op.localNumber||'',receivedAt:new Date().toISOString()};
      if(op.kind==='customer_create'){
        customers.push({...op.account,fieldOrigin:origin});
      }else if(op.kind==='sale'||op.kind==='sale_return'){
        const net=op.netTotal,paid=op.paidAmount;
        invoices.push({id:'field_'+op.id,number:++startingInvoice,type:op.kind,warehouseId:agent.warehouseId,date:op.date,accountId:op.accountId||'',currency:op.currency,exchangeRate:op.exchangeRate,paymentMethod:paid>=net?'cash':paid>0?'partial':'credit',rows:op.rows.map((r,i)=>({...r,rowId:'fieldrow_'+op.id+'_'+i,discount:0})),subTotal:op.subTotal??net,discountValue:op.discountValue||0,discountType:op.discountType||'amount',discountAmount:op.discountAmount||0,taxValue:op.taxValue||0,taxType:op.taxType||'percent',taxAmount:op.taxAmount||0,netTotal:net,paidAmount:paid,remainingAmount:money(net-paid,op.currency),note:op.note||'',fieldOrigin:origin});
      }else if(op.kind==='expense'){
        expenses.push({id:'field_'+op.id,category:op.category,amount:op.amount,currency:op.currency,
          exchangeRate:op.exchangeRate,date:op.date,note:op.note||'',updatedAt:new Date().toISOString(),
          fieldOrigin:origin});
      }else{
        vouchers.push({id:'field_'+op.id,number:++startingVoucher,type:op.kind,date:op.date,accountId:op.accountId,currency:op.currency,amount:op.amount,exchangeRate:op.exchangeRate,accountCurrency:op.currency,accountAmount:op.amount,note:op.note||'',linkedInvoiceId:op.linkedInvoiceOpId?'field_'+op.linkedInvoiceOpId:'',fieldOrigin:{...origin,linkedInvoiceOperationId:op.linkedInvoiceOpId||''}});
      }
    }
    return {invoices,vouchers,expenses,customers};
  }
  function applyStock(baseStock, ops, ackIds, items=[]) {
    const result={...baseStock},acked=new Set(ackIds||[]),catalog=new Map((items||[]).map(it=>[it.id,it]));
    const move=(doc,mul)=>{if(!doc||!['sale','sale_return'].includes(doc.kind))return;
      for(const row of doc.rows||[]){const item=catalog.get(row.itemId);
        const parts=item?.isBundle?(row.bomComponents||item.bundleComponents):[{itemId:row.itemId,quantity:1}];
        const delta=(doc.kind==='sale_return'?1:-1)*Number(row.qty)/Number(row.unitFactor)*mul;
        for(const part of parts||[]){if(!part||!Number.isFinite(Number(part.quantity)))continue;
          result[part.itemId]=(Number(result[part.itemId])||0)+delta*Number(part.quantity);}
      }};
    for(const op of ops||[]){if(acked.has(op.id))continue;
      if(op.kind==='document_edit'){move(op.before,-1);move(op.replacement,1);}else move(op,1);
    }
    // Kits are virtual: do not double count a sale as both kit and components.
    for(const it of items||[]){if(!it.isBundle)continue;const parts=it.bundleComponents||[];
      result[it.id]=parts.length?Math.max(0,Math.floor(Math.min(...parts.map(x=>Number(result[x.itemId]||0)/Number(x.quantity||1)))*10000)/10000):0;
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
