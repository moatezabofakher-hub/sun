/* 3.5.37 — Individual representative cashboxes, immutable history & compact field settings.
 * Cash hand-offs move cash between two tills without affecting customers or profit. */
(function(){
'use strict';
const F=FieldSync;
const esc=v=>F.escape(v);
const round=(v,c)=>c==='SYP'?Math.round(v):Math.round((v+Number.EPSILON)*100)/100;
const cfg=()=>F.data();
const FieldCash={
  summary(scope='all'){
    const movements=[];let sypCash=0,usdCash=0;
    const add=(m)=>{
      if(!['SYP','USD'].includes(m.currency))return;
      const inflow=Number(m.inflow||0),outflow=Number(m.outflow||0);
      if(!Number.isFinite(inflow+outflow)||inflow<0||outflow<0)return;
      if(m.currency==='SYP')sypCash=round(sypCash+inflow-outflow,'SYP');
      else usdCash=round(usdCash+inflow-outflow,'USD');
      movements.push(m);
    };
    const matches=doc=>scope==='all'||(scope==='office'?!doc?.fieldOrigin?.agentId:doc?.fieldOrigin?.agentId===scope);
    for(const inv of (State.invoices||[])){
      if(!matches(inv))continue;
      const paid=Number(inv.paidAmount||0);
      if(!(paid>0))continue;
      const incoming=['sale','purchase_return'].includes(inv.type);
      add({id:inv.id,date:inv.date||'',ref:'فاتورة #'+(inv.number||''),party:State.accounts.find(a=>a.id===inv.accountId)?.name||'عميل نقدي',desc:inv.fieldOrigin?.agentName||'فاتورة',currency:inv.currency,inflow:incoming?paid:0,outflow:incoming?0:paid});
    }
    for(const v of (State.vouchers||[])){
      if(!matches(v))continue;
      const amount=Number(v.amount||0);if(!(amount>0))continue;
      const incoming=v.type==='receipt';
      add({id:v.id,date:v.date||'',ref:'سند #'+(v.number||''),party:State.accounts.find(a=>a.id===v.accountId)?.name||'حساب عام',desc:v.note||v.fieldOrigin?.agentName||'سند مالي',currency:v.currency,inflow:incoming?amount:0,outflow:incoming?0:amount});
    }
    if(scope==='all'||scope==='office')for(const e of (State.expenses||[])){
      const amount=Number(e.amount||0);if(amount>0)add({id:e.id,date:e.date||'',ref:'مصروف',party:e.category||'مصاريف',desc:e.note||'مصروف نقدي',currency:e.currency,inflow:0,outflow:amount});
    }
    for(const tr of cfg().cashTransfers){
      if(scope==='all')continue; // internal transfer cancels out in the combined till
      if(scope!=='office'&&scope!==tr.agentId)continue;
      const managerIn=tr.direction==='fromAgent';
      const incoming=scope==='office'?managerIn:!managerIn;
      const label=cfg().agents.find(a=>a.id===tr.agentId)?.name||'مندوب';
      add({id:tr.id,date:tr.date,ref:incoming?'استلام دفعة':'تسليم دفعة',party:label,desc:tr.note||'مناقلة نقدية بين الصندوقين',currency:tr.currency,inflow:incoming?tr.amount:0,outflow:incoming?0:tr.amount});
    }
    movements.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return {sypCash,usdCash,movements};
  },
  warehouseDocuments(warehouseId){
    const groups=new Map();
    for(const tr of (State.transfers||[])){
      if(tr.fromWarehouseId!==warehouseId&&tr.toWarehouseId!==warehouseId)continue;
      const key=String(tr.batchId||tr.id);
      if(!groups.has(key))groups.set(key,{id:key,date:tr.date||'',note:tr.note||'',fromWarehouseId:tr.fromWarehouseId,toWarehouseId:tr.toWarehouseId,
        fromName:(State.warehouses||[]).find(w=>w.id===tr.fromWarehouseId)?.name||tr.fromWarehouseId,
        toName:(State.warehouses||[]).find(w=>w.id===tr.toWarehouseId)?.name||tr.toWarehouseId,lines:[]});
      groups.get(key).lines.push({id:tr.id,itemId:tr.itemId,itemName:(State.items||[]).find(i=>i.id===tr.itemId)?.name||tr.itemName||tr.itemId,quantity:Number(tr.quantity||tr.quantityBase||0),quantityBase:Number(tr.quantityBase||0),unitName:tr.unitName||'الوحدة الأساسية'});
    }
    return [...groups.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date))||a.id.localeCompare(b.id));
  },
  openTransfer(direction,preferred='all'){
    const agents=cfg().agents.filter(a=>!a.archived&&!a.disabled);
    if(!agents.length)return UI.toast('يجب إنشاء مندوب أولاً','warn');
    const current=agents.some(a=>a.id===preferred)?preferred:agents[0].id;
    UI.openModal(`<div dir="rtl" class="space-y-3 text-right">
      <h3 class="text-lg font-black">${direction==='fromAgent'?'استلام دفعة من المندوب':'إعطاء دفعة للمندوب'}</h3>
      <p class="text-xs text-slate-600">نقل نقدي بين الصندوق الرئيسي وصندوق المندوب؛ لا يُحتسب بيعاً أو مصروفاً ولا يؤثر على ذمم العملاء.</p>
      <label class="block text-xs font-bold">المندوب</label><select id="agentCashTransferAgent" class="w-full border rounded-xl p-3">${agents.map(a=>`<option value="${esc(a.id)}" ${a.id===current?'selected':''}>${esc(a.name)}</option>`).join('')}</select>
      <label class="block text-xs font-bold">العملة</label><select id="agentCashTransferCurrency" class="w-full border rounded-xl p-3"><option value="SYP">الليرة السورية SYP</option><option value="USD">الدولار USD</option></select>
      <label class="block text-xs font-bold">المبلغ</label><input id="agentCashTransferAmount" type="number" min="0.01" step="any" inputmode="decimal" class="w-full border rounded-xl p-3" placeholder="0"/>
      <label class="block text-xs font-bold">البيان (اختياري)</label><input id="agentCashTransferNote" maxlength="200" class="w-full border rounded-xl p-3" placeholder="تفاصيل الدفعة"/>
      <button type="button" class="ta-primary-3d w-full rounded-xl p-3 font-black" onclick="FieldCash.saveTransfer('${direction}')">حفظ وإثبات حركة الصندوق</button>
      <button type="button" class="bg-slate-100 w-full rounded-xl p-3" onclick="UI.forceCloseModal()">إلغاء</button></div>`);
  },
  async saveTransfer(direction){
    if(this.busy)return;
    const agentId=document.getElementById('agentCashTransferAgent')?.value;
    const currency=document.getElementById('agentCashTransferCurrency')?.value;
    const amount=Number(document.getElementById('agentCashTransferAmount')?.value);
    const note=String(document.getElementById('agentCashTransferNote')?.value||'').trim();
    if(!['fromAgent','toAgent'].includes(direction)||!cfg().agents.some(a=>a.id===agentId&&!a.archived&&!a.disabled)||!['USD','SYP'].includes(currency)||!Number.isFinite(amount)||amount<=0||amount>1e12)return UI.toast('المندوب أو المبلغ أو العملة غير صالح','error');
    const fixed=round(amount,currency);if(fixed<=0)return UI.toast('المبلغ أصغر من أصغر وحدة مسموحة لهذه العملة','warn');
    // Cash may be negative in historical datasets. Do not fabricate cash receipts; reject
    // new hand-offs exceeding the available source till balance.
    const fromBox=this.summary(direction==='fromAgent'?agentId:'office');
    const available=currency==='SYP'?fromBox.sypCash:fromBox.usdCash;
    if(fixed>available+0.001)return UI.toast('رصيد الصندوق المرسل غير كافٍ لهذه الدفعة','error');
    const transfer={id:'cash_'+FieldProtocol.uuid(),agentId,direction,amount:fixed,currency,note:note.slice(0,200),date:new Date().toISOString()};
    this.busy=true;cfg().cashTransfers.push(transfer);
    try{await StorageEngine.saveState();UI.forceCloseModal();AppNav.navigate('reports',{tab:'cashbox',cashAgentId:agentId},true);UI.toast('تم إثبات الدفعة في الصندوقين وستصل للمندوب عبر المزامنة','success');}
    catch(e){cfg().cashTransfers=cfg().cashTransfers.filter(t=>t.id!==transfer.id);UI.toast('لم تُحفظ الدفعة: '+e.message,'error');}
    finally{this.busy=false;}
  }
};
window.FieldCash=FieldCash;
// Recover older posted field operations that predate the explicit append-only archive.
// These are read-only reconstructions, and never posted to the ledger a second time.
F.historyFor=function(a){
  const archive=new Map();
  for(const o of cfg().operationHistory||[])if(o.agentId===a.id)archive.set(o.id,o);
  for(const invoice of (State.invoices||[])){
    const x=invoice.fieldOrigin;
    if(x?.agentId!==a.id||!x.operationId||archive.has(x.operationId))continue;
    archive.set(x.operationId,{id:x.operationId,kind:invoice.type,companyId:cfg().companyId,agentId:a.id,warehouseId:a.warehouseId,
      localNumber:x.localNumber||'F-'+(invoice.number||''),date:invoice.date,currency:invoice.currency,exchangeRate:invoice.exchangeRate,
      accountId:invoice.accountId,rows:(invoice.rows||[]).map(r=>({itemId:r.itemId,itemName:r.itemName||'',unitName:r.unitName,unitFactor:r.unitFactor,qty:r.qty,price:r.price,total:r.total})),
      netTotal:invoice.netTotal,paidAmount:invoice.paidAmount,discountValue:invoice.discountValue||0,discountType:invoice.discountType||'amount',
      taxValue:invoice.taxValue||0,taxType:invoice.taxType||'percent',note:invoice.note||'',restoredFromLedger:true});
  }
  for(const voucher of (State.vouchers||[])){
    const x=voucher.fieldOrigin;
    if(x?.agentId!==a.id||!x.operationId||archive.has(x.operationId))continue;
    archive.set(x.operationId,{id:x.operationId,kind:voucher.type,companyId:cfg().companyId,agentId:a.id,warehouseId:a.warehouseId,
      localNumber:x.localNumber||'V-'+(voucher.number||''),date:voucher.date,currency:voucher.currency,exchangeRate:voucher.exchangeRate,
      accountId:voucher.accountId,amount:voucher.amount,note:voucher.note||'',linkedInvoiceOpId:x.linkedInvoiceOperationId||'',restoredFromLedger:true});
  }
  return [...archive.values()].sort((x,y)=>String(x.date||'').localeCompare(String(y.date||''))||x.id.localeCompare(y.id));
};
F.historyPage=function(a,start=0){
  const history=this.historyFor(a);let offset=Math.min(Math.max(0,Math.trunc(Number(start)||0)),history.length);
  const page=[],max=350000;
  let bytes=0;
  while(offset<history.length&&page.length<35){
    const op=history[offset],size=JSON.stringify(op).length;
    if(page.length&&bytes+size>max)break;
    if(size>max){offset++;continue;} // huge corrupted legacy entry must not stall all subsequent history
    bytes+=size;page.push(op);offset++;
  }
  return {ops:page,nextCursor:offset,total:history.length};
};
F.transferHistoryPage=function(a,start=0){
  const docs=FieldCash.warehouseDocuments(a.warehouseId),offset=Math.max(0,Math.trunc(Number(start)||0));
  const src=JSON.stringify(docs);let checksum=2166136261;
  for(let i=0;i<src.length;i++){checksum^=src.charCodeAt(i);checksum=Math.imul(checksum,16777619);}
  const revision=String(checksum>>>0);
  const page=docs.slice(offset,offset+35);
  return {docs:page,offset,nextCursor:Math.min(docs.length,offset+page.length),total:docs.length,revision};
};
const oldCatalog=F.catalog.bind(F);
F.catalog=function(a,historyCursor=0,transferCursor=0){
 const snapshot=oldCatalog(a,historyCursor);
 snapshot.warehouseTransfers=[]; // delivered in bounded, resumable pages
 snapshot.warehouseHistoryPage=this.transferHistoryPage(a,transferCursor);
 return snapshot;
};
// The old manager screen stays available as separate task-oriented panels.
const previousOpen=F.open.bind(F);
F.open=function(){
 const c=cfg();
 UI.openModal(`<div class="ta-field-panel space-y-3 text-right" dir="rtl">
 <h3 class="text-lg font-black text-slate-900">إدارة المندوبين والمزامنة المحلية</h3>
 <div class="grid grid-cols-2 gap-2">
  <button type="button" class="bg-teal-700 text-white rounded-2xl p-4 font-black" onclick="FieldSync.showCreateAgent()"><i class="fas fa-user-plus block text-xl mb-2"></i>إنشاء مندوب</button>
  <button type="button" class="bg-slate-900 text-white rounded-2xl p-4 font-black" onclick="FieldSync.showAgents()"><i class="fas fa-users block text-xl mb-2"></i>المندوبون (${c.agents.filter(a=>!a.archived).length})</button>
  <button type="button" class="bg-blue-700 text-white rounded-2xl p-4 font-black" onclick="FieldSync.showOperations()"><i class="fas fa-list-check block text-xl mb-2"></i>عمليات المندوب</button>
  <button type="button" class="bg-amber-600 text-white rounded-2xl p-4 font-black" onclick="FieldSync.showSyncTools()"><i class="fas fa-arrows-rotate block text-xl mb-2"></i>المزامنة والملفات</button>
 </div>
 <div class="rounded-xl border bg-teal-50 p-3 text-xs"><b>الاتصال المحلي التلقائي</b><div id="fieldLanStatus" class="mt-1">جارٍ التحقق من الاستقبال…</div><button type="button" class="rounded-lg border bg-white p-2 mt-2 w-full font-bold" onclick="FieldSync.startLanReceiver()">إعادة تشغيل الاستقبال</button></div>
 <div class="rounded-xl border p-3"><b class="text-sm">طلبات ربط الأجهزة الجديدة</b><div id="fieldPairingRequests">${this.pairingCards?.()||'بانتظار الطلبات…'}</div></div>
 <button class="w-full p-3 bg-slate-100 rounded-xl font-bold" onclick="UI.forceCloseModal()">إغلاق</button></div>`);
 if(window.AndroidLocalSync)this.startLanReceiver(true);
};
F.showCreateAgent=function(){
 const opts=(State.warehouses||[]).map(w=>`<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('');
 UI.openModal(`<div dir="rtl" class="ta-field-panel text-right space-y-3"><h3 class="font-black text-lg">إنشاء مندوب</h3>
 <input id="fieldNewAgent" class="w-full border rounded-xl p-3" placeholder="اسم المندوب" maxlength="70"/>
 <input id="fieldNewVehicle" class="w-full border rounded-xl p-3" placeholder="السيارة / خط التوزيع" maxlength="70"/>
 <select id="fieldNewWarehouse" class="w-full border rounded-xl p-3">${opts}</select>
 <p class="text-xs text-slate-600">اختر مستودع السيارة الخاص بالمندوب؛ تُنقل المواد إليه من شاشة المناقلات.</p>
 <button class="ta-primary-3d w-full p-3 rounded-xl font-black" onclick="FieldSync.addAgent()">حفظ المندوب</button>
 <button class="w-full p-3 rounded-xl bg-slate-100" onclick="FieldSync.open()">رجوع</button></div>`);
};
F.showAgents=function(){
 const c=cfg(),agents=c.agents.filter(a=>!a.archived);
 UI.openModal(`<div dir="rtl" class="ta-field-panel text-right space-y-3"><h3 class="font-black text-lg">المندوبون المسجلون</h3>
 ${agents.length?agents.map(a=>`<div class="border rounded-xl p-3 space-y-2 bg-white"><div class="font-bold">${esc(a.name)} · ${esc(a.vehicleName||'')}</div>
 <p class="text-xs text-slate-500">${esc(WarehouseController.name(a.warehouseId))} · ${a.disabled?'موقوف':'مفعّل'}</p>
 <div class="grid grid-cols-2 gap-2 text-xs font-bold"><button class="bg-blue-100 rounded-lg p-2" onclick="FieldSync.showEditAgent('${a.id}')">تعديل</button>
 <button class="bg-rose-100 text-rose-800 rounded-lg p-2" onclick="FieldSync.confirmRemoveAgent('${a.id}')">حذف</button>
 <button class="bg-teal-100 rounded-lg p-2" onclick="FieldSync.exportProvision('${a.id}')">تجهيز البيانات</button>
 <button class="bg-slate-100 rounded-lg p-2" onclick="FieldSync.exportAck('${a.id}')">تأكيد الاستلام</button>
 <button class="bg-amber-100 rounded-lg p-2" onclick="FieldSync.showActivation('${a.id}')">كود التفعيل</button>
 <button class="bg-slate-100 rounded-lg p-2" onclick="FieldSync.toggleAgent('${a.id}')">${a.disabled?'إعادة تشغيل':'إيقاف'}</button></div></div>`).join(''):'<p class="text-xs text-slate-500">لا يوجد مندوبون.</p>'}
 ${c.agents.some(a=>a.archived)?`<details class="bg-rose-50 border rounded-xl p-2"><summary class="font-bold text-xs">أرشيف المندوبين</summary>${c.agents.filter(a=>a.archived).map(a=>`<p class="p-2 text-xs">${esc(a.name)} <button class="bg-white p-1 border rounded" onclick="FieldSync.restoreAgent('${a.id}')">استعادة</button></p>`).join('')}</details>`:''}
 <button class="w-full p-3 rounded-xl bg-slate-100" onclick="FieldSync.open()">رجوع</button></div>`);
};
F.historyViewLimit=100;
F.showOperations=function(agentId='all'){
 const c=cfg(),records=[...(State.invoices||[]).filter(i=>i.fieldOrigin?.agentId).map(x=>({kind:'فاتورة',id:x.id,agentId:x.fieldOrigin.agentId,number:x.fieldOrigin.localNumber||x.number,date:x.date,display:`${x.netTotal} ${x.currency}`})),
 ...(State.vouchers||[]).filter(v=>v.fieldOrigin?.agentId).map(x=>({kind:'سند عميل',id:x.id,agentId:x.fieldOrigin.agentId,number:x.fieldOrigin.localNumber||x.number,date:x.date,display:`${x.amount} ${x.currency}`})),
 ...c.cashTransfers.map(x=>({kind:x.direction==='fromAgent'?'دفعة من المندوب':'دفعة للمندوب',id:x.id,agentId:x.agentId,number:x.id.slice(-8),date:x.date,display:`${x.amount} ${x.currency}`})),
 ...c.agents.flatMap(a=>FieldCash.warehouseDocuments(a.warehouseId).map(x=>({kind:'مناقلة مستودع',id:x.id+'_'+a.id,agentId:a.id,number:x.id,date:x.date,display:x.lines.length+' صنف'})))].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const all=agentId==='all',list=records.filter(r=>all||r.agentId===agentId);
 UI.openModal(`<div dir="rtl" class="ta-field-panel text-right space-y-3"><h3 class="font-black text-lg">عمليات المندوب</h3>
 <select class="w-full border rounded-xl p-3" onchange="FieldSync.historyViewLimit=100;FieldSync.showOperations(this.value)"><option value="all">كل العمليات (${records.length})</option>${c.agents.map(a=>`<option value="${a.id}" ${a.id===agentId?'selected':''}>${esc(a.name)}</option>`).join('')}</select>
 <div class="max-h-[55vh] overflow-y-auto">${list.length?list.slice(0,this.historyViewLimit).map(x=>`<div class="border-b p-3 text-xs"><b>${esc(x.kind)} #${esc(x.number)}</b><span class="block">${esc(c.agents.find(a=>a.id===x.agentId)?.name||'مندوب')} · ${esc(String(x.date).slice(0,16).replace('T',' '))}</span><b>${esc(x.display)}</b></div>`).join(''):'<p class="text-slate-500 p-3">لا توجد عمليات للمندوب المختار.</p>'}</div>
 ${list.length>this.historyViewLimit?`<button type="button" class="w-full bg-teal-50 border rounded-xl p-3 font-black text-xs" onclick="FieldSync.historyViewLimit+=100;FieldSync.showOperations('${esc(agentId)}')">عرض المزيد (${list.length-this.historyViewLimit})</button>`:''}
 <button class="w-full p-3 bg-slate-100 rounded-xl" onclick="FieldSync.open()">رجوع</button></div>`);
};
F.showSyncTools=function(){
 const c=cfg();
 UI.openModal(`<div dir="rtl" class="ta-field-panel text-right space-y-3"><h3 class="font-black text-lg">المزامنة والملفات الاحتياطية</h3>
 <p class="text-xs text-slate-600">المزامنة المحلية تلقائية عند اتصال الجهازين عبر الشبكة نفسها. الملفات بديل يدوي عند الحاجة.</p>
 <div class="bg-teal-50 border rounded-xl p-3"><b class="text-xs">عدد عمليات المندوبين المستلمة: ${c.imported.length}</b><div id="fieldLanStatus" class="text-xs p-2">جاهز للاستقبال</div><button class="w-full bg-teal-700 text-white p-2 rounded-xl" onclick="FieldSync.startLanReceiver()">إعادة تشغيل الاتصال</button></div>
 <label class="text-xs font-bold">استلام ملف العمليات</label><input id="fieldImportFile" type="file" class="w-full text-xs" accept="application/json,.json" onchange="FieldSync.previewFile(this)"/>
 <button class="w-full p-3 bg-slate-100 rounded-xl" onclick="FieldSync.open()">رجوع</button></div>`);
};
// Mutations triggered in nested panels return to their logical parent.
const oldAdd=F.addAgent.bind(F);F.addAgent=async function(){await oldAdd();};
const oldEdit=F.saveAgentEdit.bind(F);F.saveAgentEdit=async function(id){await oldEdit(id);};
})();
