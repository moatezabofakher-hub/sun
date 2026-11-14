/* 3.5.35: Sales invoice screen mirrors the manager's compact invoice entry form.
 * Same item grid, row editors, discount, tax, totals and Bluetooth actions.
 * Field inventory remains restricted to this agent's car warehouse.
 */
(function(){
'use strict';
const A=Agent;
const esc=v=>A.escape(v);
const round=(n,c)=>c==='SYP'?Math.round(n):Math.round((n+Number.EPSILON)*100)/100;
const value=id=>document.getElementById(id)?.value;
const money=(n,c)=>A.money(n,c);
const initialMeta=()=>({accountId:'',currency:'USD',paymentMode:'cash',paid:'',date:A.defaultDate(),note:'',discountValue:0,discountType:'amount',taxValue:0,taxType:'percent'});
A.balanceQuery='';
A.balanceFor=function(accountId){
 const acc=(this.state.accounts||[]).find(a=>String(a.id)===String(accountId));
 if(!acc)return null;
 const available=Number.isFinite(Number(acc.sypBalance))&&Number.isFinite(Number(acc.usdBalance))&&
   Object.prototype.hasOwnProperty.call(acc,'sypBalance')&&Object.prototype.hasOwnProperty.call(acc,'usdBalance');
 if(!available)return {available:false};
 let syp=Number(acc.sypBalance),usd=Number(acc.usdBalance);
 // The manager's snapshot already contains its accepted operations.
 const accepted=new Set(this.state.snapshotIds||[]);
 for(const op of this.state.ops||[]){
  if(op.kind==='expense'||op.accountId!==accountId||accepted.has(op.id))continue;
  const c=op.currency,net=op.netTotal==null?
    (op.rows||[]).reduce((sum,r)=>sum+Number(r.total||0),0):Number(op.netTotal);
  const amount=['sale','sale_return'].includes(op.kind)?
    (net-Number(op.paidAmount||0))*(op.kind==='sale'?1:-1):
    Number(op.amount||0)*(op.kind==='receipt'?-1:1);
  if(c==='SYP')syp=round(syp+amount,'SYP');else if(c==='USD')usd=round(usd+amount,'USD');
 }
 return {available:true,syp:round(syp,'SYP'),usd:round(usd,'USD')};
};
// Balance at the time of creating the draft; never project across currencies.
A.draftAccountBalance=function(){
 const m=this.invoiceMeta||{},id=m.accountId||'',c=this.currency||'USD';
 if(!id)return {available:false,unselected:true};
 const current=this.balanceFor(id);
 if(!current?.available)return {available:false,unsynced:true};
 let before=c==='SYP'?current.syp:current.usd;
 // On edits, remove the already-posted invoice impact before projecting its replacement.
 const original=this.editingId&&(this.state.ops||[]).find(op=>op.id===this.editingId);
 if(original&&original.accountId===id&&original.currency===c&&['sale','sale_return'].includes(original.kind)){
   const net=Number(original.netTotal??(original.rows||[]).reduce((sum,r)=>sum+Number(r.total||0),0));
   before-=DraftInvoiceBalancePreview.sign(original.kind)*(net-Number(original.paidAmount||0));
 }
 const calc=this.invoiceCalc();
 return DraftInvoiceBalancePreview.project(before,{kind:this.draftKind,currency:c,netTotal:calc.netTotal,paidAmount:calc.paidAmount});
};
A.draftBalanceHTML=function(){
 const p=this.draftAccountBalance(),c=this.currency||'USD';
 const label=x=>this.balanceLabel(x,c);
 const msg=p.unselected?'اختر زبوناً لعرض الرصيد. البيع النقدي دون حساب لا يغيّر ذمم العملاء.':p.unsynced?
   'الرصيد السابق غير متاح قبل استلام كشف الحسابات من الرئيسي بالمزامنة.':!p.available?
   'تحقق من قيم الفاتورة والمبلغ المدفوع.':'يتحدّث الرصيد النهائي فور تعديل الكمية أو طريقة الدفع.';
 return `<div class="mt-3 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-xs" data-agent-draft-balance="${c}">
  <div class="font-extrabold text-sky-900 mb-2">رصيد العميل (${c})</div>
  <div class="grid grid-cols-2 gap-2"><div class="rounded-lg border border-sky-200 bg-white p-2"><div class="text-[11px] text-slate-600 font-bold">الرصيد السابق</div><strong id="agentDraftBalanceBefore" class="block text-slate-800 mt-1">${p.available?esc(label(p.before)):'—'}</strong></div>
  <div class="rounded-lg border border-emerald-200 bg-emerald-50 p-2"><div class="text-[11px] text-emerald-800 font-bold">الرصيد النهائي المتوقع</div><strong id="agentDraftBalanceAfter" class="block text-emerald-800 mt-1">${p.available?esc(label(p.after)):'—'}</strong></div></div>
  <p id="agentDraftBalanceHint" class="mt-2 text-[10px] text-slate-600">${msg}</p></div>`;
};
A.paintDraftBalance=function(){
 const box=document.querySelector('[data-agent-draft-balance]');if(box)box.outerHTML=this.draftBalanceHTML();
};
A.balanceLabel=function(n,c){const v=Number(n||0);return (v>0.001?'عليه':v<-.001?'له':'مسدد')+' · '+money(Math.abs(v),c)+' '+c;};
A.accountBalanceHTML=function(id){
 if(!id)return '<span class="text-xs text-slate-500">اختر زبونًا لعرض رصيده الحالي.</span>';
 const balance=this.balanceFor(id);
 if(!balance?.available)return '<span class="text-xs text-amber-800">لم يُستلم كشف أرصدة من الرئيسي بعد؛ اتصل بالمركز للمزامنة.</span>';
 return `<div class="grid grid-cols-2 gap-2 text-[11px] font-bold"><div class="bg-white rounded-lg p-2 border border-sky-200">${esc(this.balanceLabel(balance.usd,'USD'))}</div><div class="bg-white rounded-lg p-2 border border-sky-200">${esc(this.balanceLabel(balance.syp,'SYP'))}</div></div>`;
};
A.renderAccounts=function(){
 const rows=(this.state.accounts||[]).filter(a=>[a.name,a.phone,a.address].some(v=>String(v||'').toLowerCase().includes((this.balanceQuery||'').toLowerCase())));
 const updated=this.state.lastSyncAt||this.state.issuedAt;
 return `<div class="hero"><h2>أرصدة الحسابات</h2><p>الذمم الحالية بحسب آخر كشف من الرئيسي مع حركاتك المحلية غير المشمولة في الكشف.</p></div>
  <section class="panel"><label class="label">البحث باسم الزبون</label><input class="field" id="balanceAccountSearch" value="${esc(this.balanceQuery)}" placeholder="اسم الحساب..." oninput="Agent.balanceQuery=this.value;Agent.paintAccountList()">
   <p class="form-help">${updated?'تاريخ آخر كشف: '+esc(new Date(updated).toLocaleString('ar')):'لم تكتمل المزامنة الأولى بعد'}. الأرصدة لا تشمل عمليات المندوبين الآخرين غير المرسلة إلى المركز.</p>
   <div id="agentAccountList">${this.accountRowsHTML(rows)}</div></section>`;
};
A.accountRowsHTML=function(rows){return rows.length?rows.map(acc=>`
 <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 my-2">
  <div class="font-extrabold text-xs text-slate-900 mb-2">${esc(acc.name)} ${acc.pendingSync?'<span class="pill wait">بانتظار المزامنة</span>':''}</div>${acc.phone?`<p class="tiny">☎ ${esc(acc.phone)}</p>`:''}${acc.address?`<p class="tiny">📍 ${esc(acc.address)}</p>`:''}${this.accountBalanceHTML(acc.id)}
 </div>`).join(''):'<p class="text-xs text-slate-400 p-3">لا توجد حسابات مطابقة</p>';};
A.paintAccountList=function(){const list=document.getElementById('agentAccountList');if(list)list.innerHTML=this.accountRowsHTML((this.state.accounts||[]).filter(a=>[a.name,a.phone,a.address].some(v=>String(v||'').toLowerCase().includes((this.balanceQuery||'').toLowerCase()))));};
A.paintInvoiceAccountBalance=function(){const panel=document.getElementById('invoiceAccountBalance');if(panel)panel.innerHTML=this.accountBalanceHTML(value('fAccount')||'');};
const oldHome=A.renderHome.bind(A);
A.renderHome=function(){return oldHome().replace('<!-- no-account-balance-shortcut -->','') .replace('</div></section>\n  <section class="panel"><h3>الطباعة السريعة', '<button class="tile" onclick="Agent.navigate(\'accounts\')"><span class="glyph">⚖</span><strong>أرصدة الحسابات</strong><small>ذمم العملاء بالدولار والليرة</small></button></div></section>\n  <section class="panel"><h3>الطباعة السريعة');};
A.invoiceCalc=function(){
 const c=this.currency||'USD',m=this.invoiceMeta||{};
 const sub=round(this.draft.reduce((s,r)=>s+Number(r.total||0),0),c);
 const dv=Number(m.discountValue||0),tv=Number(m.taxValue||0);
 const disc=round(m.discountType==='percent'?sub*dv/100:dv,c);
 const tax=round(m.taxType==='amount'?tv:(sub-disc)*tv/100,c);
 const net=round(sub-disc+tax,c);
 const paid=m.paymentMode==='cash'?net:m.paymentMode==='credit'?0:round(Number(m.paid||0),c);
 return {subTotal:sub,discountAmount:disc,taxAmount:tax,netTotal:net,paidAmount:paid,remainingAmount:round(net-paid,c)};
};
A.currentTotal=function(){return this.invoiceCalc().netTotal;};
A.captureInvoiceMeta=function(){
 const m=this.invoiceMeta||initialMeta();
 for(const [key,id] of [['accountId','fAccount'],['date','fDate'],['note','fNote'],['currency','fCurrency'],['discountValue','invoiceDiscount'],['discountType','invoiceDiscountType'],['taxValue','invoiceTax'],['taxType','invoiceTaxType']]){
  if(document.getElementById(id))m[key]=value(id);
 }
 if(document.getElementById('invPaidInput') && m.paymentMode==='partial')m.paid=value('invPaidInput');
 this.invoiceMeta=m;
};
A.startInvoice=function(kind){
 if(this.screen==='invoice'&&this.draft.length){
  this.confirmAction('فاتورة غير محفوظة','هل تريد تجاهل الأصناف وفتح فاتورة أخرى؟',()=>{this.draft=[];this.startInvoice(kind);});return;
 }
 this.invoiceMeta=initialMeta();this.currency='USD';this.draft=[];this.draftKind=kind||'sale';this.gridCategory='all';this.gridSearch='';this.navigate('invoice');
};
A.changeInvoiceCurrency=function(){
 this.captureInvoiceMeta();const next=this.currency==='USD'?'SYP':'USD';
 const rate=Number(this.state.exchangeRate);
 if(!Number.isFinite(rate)||rate<=0)return this.toast('سعر الصرف غير صالح');
 this.draft.forEach(r=>{r.price=round(next==='SYP'?Number(r.price)*rate:Number(r.price)/rate,next);r.total=round(r.qty*r.price,next);});
 this.currency=next;this.invoiceMeta.currency=next;this.invoiceMeta.paid='';this.invoiceMeta.paymentMode='cash';this.show('invoice');
};
A.changeInvoicePayment=function(mode){this.captureInvoiceMeta();this.invoiceMeta.paymentMode=mode;this.invoiceMeta.paid=mode==='partial'?'':mode==='credit'?'0':String(this.invoiceCalc().netTotal);this.show('invoice');};
A.changeInvoiceAdjustment=function(){this.captureInvoiceMeta();this.refreshInvoiceTotals();};
A.refreshInvoiceTotals=function(){
 const c=this.currency||'USD',x=this.invoiceCalc();
 for(const [id,num] of [['invSubTotalTxt',x.subTotal],['invNetTotalTxt',x.netTotal],['invRemainingTxt',x.remainingAmount],['invPaidInput',x.paidAmount]]){
  const el=document.getElementById(id);if(el){if(id==='invPaidInput' && this.invoiceMeta.paymentMode==='partial')continue;if('value'in el)el.value=String(num);else el.textContent=money(num,c)+' '+c;}
 }
 this.paintDraftBalance();
};
A.changeRowUnit=function(i,unitName){
 this.captureInvoiceMeta();const r=this.draft[i],it=this.state.items.find(x=>x.id===r?.itemId),u=it?.units.find(x=>x.name===unitName);
 if(!r||!u)return;
 r.unitName=u.name;r.unitFactor=Number(u.factor);r.price=this.unitPrice(it,u,this.currency);r.total=round(r.qty*r.price,this.currency);
 this.show('invoice');
};
A.unitPrice=function(it,u,c){
 const acc=this.state.accounts.find(a=>a.id===(document.getElementById('fAccount')?.value||this.invoiceMeta?.accountId));
 const tier=['wholesale','center','consumer'].includes(acc?.priceTier) ? acc.priceTier : (['wholesale','center','consumer'].includes(this.state.defaultPriceTier)?this.state.defaultPriceTier:'wholesale');
 const price=tier==='consumer'?(u.consumerPrice??u.centerPrice??u.salePrice):(tier==='center'?(u.centerPrice??u.salePrice):(u.wholesalePrice??u.salePrice));
 const raw=Number(price||0),rate=Number(this.state.exchangeRate)||1;
 return round(it.currency===c?raw:it.currency==='USD'?raw*rate:raw/rate,c);
};
A.accountPricingChanged=function(id){this.captureInvoiceMeta();this.invoiceMeta.accountId=id;for(const row of this.draft){if(row.manuallyPriced)continue;const it=this.state.items.find(x=>x.id===row.itemId);const u=it?.units?.find(x=>x.name===row.unitName);if(!it||!u)continue;row.price=this.unitPrice(it,u,this.currency);row.total=round(row.price*row.qty,this.currency);}this.show('invoice');};
A.changeRowValue=function(i,key,v){
 const r=this.draft[i];if(!r)return;
 const n=Number(String(v).trim().replace(',','.'));if(!Number.isFinite(n)||n<0||n>1e10)return;
 r[key]=key==='price'?round(n,this.currency):n;if(key==='price')r.manuallyPriced=true;
 r.total=round(Number(r.qty)*Number(r.price),this.currency);
 const node=document.getElementById('rowTotal_'+i);if(node)node.textContent=money(r.total,this.currency);
 this.refreshInvoiceTotals();
};
A.removeRow=function(i){this.captureInvoiceMeta();this.draft.splice(i,1);this.show('invoice');};
A.decrementRow=function(i){this.captureInvoiceMeta();const r=this.draft[i];if(!r)return;if(r.qty<=1)this.draft.splice(i,1);else {r.qty=round(r.qty-1,'USD');r.total=round(r.qty*r.price,this.currency);}this.show('invoice');};
A.remainingStockForItem=function(itemId){
 const items=this.state.items||[],catalog=new Map(items.map(x=>[x.id,x])),available={...this.stock};
 for(const r of this.draft||[]){const it=catalog.get(r.itemId);const parts=it?.isBundle?(r.bomComponents||it.bundleComponents):[{itemId:r.itemId,quantity:1}];for(const b of parts||[]){available[b.itemId]=(Number(available[b.itemId])||0)-Number(r.qty)/Number(r.unitFactor||1)*Number(b.quantity||0);}}
 const item=catalog.get(itemId);if(!item)return 0;
 if(item.isBundle){const parts=item.bundleComponents||[];return parts.length?Math.max(0,Math.min(...parts.map(x=>Number(available[x.itemId]||0)/Number(x.quantity||1)))):0;}
 return Math.max(0,Number(available[itemId])||0);
};
A.addGridItem=function(id){
 const it=this.state.items.find(x=>x.id===id);if(!it)return;
 const u=it.units?.[0];if(!u)return this.toast('لا توجد وحدة معتمدة للصنف');
 const available=this.remainingStockForItem(it.id);
 if(this.draftKind==='sale'&&(1/Number(u.factor))>available+1e-5)return this.toast(available<=1e-5?'نفدت كمية المادة «'+it.name+'» من مستودع المندوب':'الكمية المتاحة من «'+it.name+'» غير كافية');
 this.captureInvoiceMeta();let r=this.draft.find(r=>r.itemId===it.id&&r.unitName===u.name);
 if(r){r.qty=round(r.qty+1,'USD');r.total=round(r.qty*r.price,this.currency);}
 else{const p=this.unitPrice(it,u,this.currency);this.draft.push({itemId:it.id,itemName:it.name,unitName:u.name,unitFactor:Number(u.factor),qty:1,price:p,total:round(p,this.currency),bomComponents:it.isBundle?JSON.parse(JSON.stringify(it.bundleComponents||[])):undefined});}
 this.show('invoice');this.renderPickerItems();
};
A.removeGridOne=function(id){
 this.captureInvoiceMeta();const it=this.state.items.find(x=>x.id===id);if(!it)return;
 let i=this.draft.findIndex(r=>r.itemId===id&&r.unitName===it.units?.[0]?.name);
 if(i<0)i=this.draft.findIndex(r=>r.itemId===id);if(i<0)return;
 const r=this.draft[i];if(r.qty<=1)this.draft.splice(i,1);else{r.qty=round(r.qty-1,'USD');r.total=round(r.qty*r.price,this.currency);}
 this.show('invoice');this.renderPickerItems();
};
A.openInvoiceItemGrid=function(){
 this.captureInvoiceMeta();this.gridSearch='';this.gridCategory='all';
 let overlay=document.getElementById('agentItemPicker');
 if(!overlay){overlay=document.createElement('div');overlay.id='agentItemPicker';overlay.className='agent-picker-mask';document.body.appendChild(overlay);}
 overlay.innerHTML=`<div class="agent-picker-content" role="dialog" aria-modal="true" aria-label="شبكة اختيار وإضافة المواد للفاتورة">
 <div class="flex items-center justify-between border-b pb-2.5 mb-3"><h3 class="font-bold text-sm flex items-center gap-1.5 text-slate-900"><i class="fas fa-grip text-emerald-600"></i> شبكة اختيار وإضافة المواد للفاتورة</h3><button type="button" onclick="Agent.closeInvoiceItemGrid()" class="w-7 h-7 rounded-full bg-slate-100">×</button></div>
 <input id="agentPickerSearch" type="search" placeholder="ابحث باسم المادة أو الباركود..." class="w-full pr-3 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold" oninput="Agent.gridSearch=this.value;Agent.renderPickerItems()">
 <div id="agentPickerCats" class="flex gap-1.5 overflow-x-auto pb-2 mt-2"></div>
 <div id="agentPickerItems" class="grid grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto p-0.5"></div>
 <div class="flex justify-end pt-3 mt-3 border-t"><button type="button" class="bg-slate-900 text-white font-bold px-5 py-2 rounded-xl text-xs" onclick="Agent.closeInvoiceItemGrid()">إغلاق الشبكة</button></div>
 </div>`;
 this.renderPickerItems();
};
A.closeInvoiceItemGrid=function(){document.getElementById('agentItemPicker')?.remove();};
A.setPickerCategory=function(id){this.gridCategory=id;this.renderPickerItems();};
A.renderPickerItems=function(){
 const box=document.getElementById('agentPickerItems');if(!box)return;
 const cats=[{id:'all',name:'كل المجموعات'}];
 for(const raw of (this.state.categories||[])){
  const cat=typeof raw==='string'?{id:raw,name:raw}:{id:raw.id||raw.name,name:raw.name||raw.id};
  if(cat.id && !cats.some(c=>c.id===cat.id))cats.push(cat);
 }
 for(const it of (this.state.items||[])){
  const id=it.categoryId||it.category||'other';if(!cats.some(c=>c.id===id))cats.push({id,name:it.categoryName||String(id)});
 }
 const pills=document.getElementById('agentPickerCats');
 if(pills)pills.innerHTML=cats.map(c=>`<button type="button" class="px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${this.gridCategory===c.id?'bg-emerald-600 text-white':'bg-slate-100 text-slate-600'}" onclick="Agent.setPickerCategory('${esc(c.id)}')">${esc(c.name)}</button>`).join('');
 const q=String(this.gridSearch||'').toLowerCase().trim();
 const items=(this.state.items||[]).filter(it=>(this.gridCategory==='all'||String(it.categoryId||it.category||'other')===String(this.gridCategory))&&(!q||String(it.name).toLowerCase().includes(q)||String(it.barcode||'').toLowerCase().includes(q)));
 box.innerHTML=items.length?items.map(it=>{
  const u=it.units?.[0]||{name:'وحدة',salePrice:0,factor:1};
  const chosen=this.draft.filter(r=>r.itemId===it.id).reduce((n,r)=>n+Number(r.qty),0);
  const stock=Number(this.stock[it.id]||0);
  const unitStock=round(stock*Number(u.factor||1),'USD');
  const outOfStock=this.draftKind==='sale'&&stock<=1e-5;
  return `<div class="relative bg-slate-50 border ${outOfStock?'border-rose-400 bg-rose-50':chosen>0?'border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50/40':'border-slate-200'} rounded-2xl p-2.5 cursor-pointer flex flex-col justify-between text-right shadow-2xs" role="button" tabindex="0" onclick="Agent.addGridItem('${esc(it.id)}')" onkeydown="if(event.key==='Enter')Agent.addGridItem('${esc(it.id)}')">
   ${chosen>0?`<span class="absolute -top-1.5 -left-1.5 bg-emerald-600 text-white text-[10px] font-extrabold w-6 h-6 rounded-full flex items-center justify-center">${chosen}</span><button type="button" class="invoice-grid-decrement" onclick="event.stopPropagation();Agent.removeGridOne('${esc(it.id)}')">×</button>`:''}
   <div><div class="h-24 mb-2 bg-white border border-slate-200 rounded-xl flex items-center justify-center overflow-hidden text-slate-400">${/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(it.photoData||'')?`<img src="${it.photoData}" alt="صورة المادة" loading="lazy" class="w-full h-full object-contain">`:'<i class="fas fa-box-open text-3xl"></i>'}</div><span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded ${it.currency==='USD'?'bg-amber-100 text-amber-800':'bg-blue-100 text-blue-700'}">${esc(it.currency||'USD')}</span><h4 class="font-extrabold text-xs text-slate-900 my-2">${esc(it.name)}</h4></div>
   <div class="pt-1.5 border-t border-slate-200"><div class="font-extrabold text-xs text-emerald-700">${money(this.unitPrice(it,u,this.currency),this.currency)} ${esc(this.currency)} <span class="text-[9px] text-slate-500">/ ${esc(u.name)}</span></div>
   <div class="flex items-center justify-between text-[10px] mt-1"><span class="${outOfStock?'text-rose-700 font-extrabold':'text-slate-500'}">${outOfStock?'نفدت الكمية':'المتاح: '+unitStock+' '+esc(u.name)}</span><span class="${outOfStock?'text-rose-700':'text-emerald-600'} font-bold">${outOfStock?'تنبيه':' + إضافة'}</span></div></div></div>`;
 }).join(''):'<div class="col-span-full p-6 text-center text-xs text-slate-500">لا توجد مواد مطابقة</div>';
};
A.renderInvoice=function(){
 const meta=this.invoiceMeta||initialMeta(),c=this.currency||'USD',kind=this.draftKind||'sale',calc=this.invoiceCalc();
 const items=this.state.items||[];
 const mode=meta.paymentMode||'cash';
 return `<div class="agent-main-invoice">
 <div class="invoice-entry-top rounded-2xl p-3 mb-3 space-y-2.5">
  <div class="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 pb-2"><div class="flex items-center gap-1"><span class="bg-slate-900 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md">#F-${this.state.ops.length+1}</span><i class="fas fa-file-invoice text-emerald-600 text-[10px]"></i>
   <select class="bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold" onchange="Agent.captureInvoiceMeta();Agent.switchInvoiceKind(this.value)"><option value="sale" ${kind==='sale'?'selected':''}>فاتورة مبيعات</option><option value="sale_return" ${kind==='sale_return'?'selected':''}>مردود مبيعات</option></select></div>
   <button type="button" onclick="Agent.changeInvoiceCurrency()" class="bg-amber-50 border border-amber-300 text-amber-900 px-2 py-1 rounded-lg text-[10px] font-extrabold flex items-center gap-1"><i class="fas fa-coins text-amber-600"></i><span>${c==='SYP'?'ليرة سورية':'دولار'}</span><span class="text-[9px] bg-white px-1 py-0.5 rounded border">تبديل</span></button></div>
  <div class="mb-1.5 rounded-lg bg-sky-50 border border-sky-200 px-2 py-1.5"><label class="block text-[10px] font-extrabold text-sky-900 mb-1">المستودع الذي تتأثر به هذه الفاتورة</label><div class="bg-white rounded-lg p-2 border border-sky-300 text-xs font-bold">${esc(this.state.vehicleName||'مستودع المندوب')} — محدد من الإدارة</div></div>
  <div class="grid grid-cols-2 gap-1.5 text-[10px]"><div class="min-w-0 ta-invoice-party-highlight"><label class="font-bold text-slate-700 flex items-center gap-1 mb-0.5"><i class="fas fa-user text-emerald-600"></i>العميل</label><select id="fAccount" aria-label="العميل" class="ta-invoice-party-select w-full border border-slate-300 rounded-lg px-2 py-1.5 text-[11px] font-bold bg-slate-50" onchange="Agent.accountPricingChanged(this.value)"><option value="">-- عميل نقدي مباشر --</option>${this.state.accounts.map(a=>`<option value="${esc(a.id)}" ${meta.accountId===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select><button type="button" class="mt-1 w-full bg-emerald-50 border border-emerald-300 text-emerald-800 font-extrabold text-[10px] p-1.5 rounded-lg" onclick="Agent.openCustomerForm('invoice')">+ إضافة زبون جديد</button></div>
  <div><label class="flex items-center gap-1 font-bold text-slate-700 mb-0.5"><i class="fas fa-calendar-days text-blue-600"></i>التاريخ</label><input id="fDate" class="w-full min-w-0 border border-slate-300 rounded-lg px-1.5 py-1.5 text-[10px]" type="datetime-local" value="${esc(meta.date||this.defaultDate())}" onchange="Agent.captureInvoiceMeta()"></div></div>
  <div id="invoiceAccountBalance" class="bg-sky-50 border border-sky-200 rounded-lg p-2 text-xs">${this.accountBalanceHTML(meta.accountId)}</div>
  <div class="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold">
  <button type="button" onclick="Agent.changeInvoicePayment('cash')" class="py-2 rounded-lg ${mode==='cash'?'bg-emerald-600 text-white shadow-xs':'text-slate-600'}"><i class="fas fa-money-bill-wave ml-1"></i> نقدي</button>
  <button type="button" onclick="Agent.changeInvoicePayment('credit')" class="py-2 rounded-lg ${mode==='credit'?'bg-rose-600 text-white shadow-xs':'text-slate-600'}"><i class="fas fa-clock ml-1"></i> آجل (ذمم)</button>
  <button type="button" onclick="Agent.changeInvoicePayment('partial')" class="py-2 rounded-lg ${mode==='partial'?'bg-blue-600 text-white shadow-xs':'text-slate-600'}"><i class="fas fa-sliders ml-1"></i> دفع جزئي</button>
  </div></div>
  <input type="hidden" id="fCurrency" value="${esc(c)}">
 <div class="bg-white rounded-2xl border border-slate-200 p-3 mb-3 shadow-xs space-y-2"><div class="flex items-center justify-between"><span class="font-bold text-xs text-slate-700"><i class="fas fa-grip text-emerald-600 ml-1"></i> إضافة أصناف إلى الفاتورة:</span></div>
  <div class="flex items-center gap-2"><button type="button" onclick="Agent.openInvoiceItemGrid()" class="flex-1 min-w-0 bg-emerald-600 text-white font-extrabold py-2.5 px-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs"><i class="fas fa-table-cells-large"></i><span>إضافة مواد</span></button><button type="button" onclick="Agent.scanInvoiceBarcode()" aria-label="فتح كاميرا ماسح الباركود" class="w-9 h-9 shrink-0 bg-slate-900 text-white rounded-lg text-sm flex items-center justify-center"><i class="fas fa-camera"></i></button></div></div>
 <div class="invoice-added-items rounded-2xl overflow-hidden mb-3 shadow-xs"><div class="invoice-added-title px-3 py-2 text-xs font-extrabold flex items-center justify-between"><span><i class="fas fa-boxes-stacked ml-1"></i> الأصناف المضافة إلى الفاتورة</span><span>${this.draft.length} صنف</span></div>
 ${this.draft.length?`<div class="divide-y divide-slate-100">${this.draft.map((r,i)=>{
  const it=items.find(x=>x.id===r.itemId),available=Number(this.stock[r.itemId]||0)*Number(r.unitFactor||1);
  return `<div class="invoice-added-row p-3"><div class="flex items-center justify-between mb-2"><div class="flex items-center gap-1.5 flex-wrap"><span class="invoice-row-index">${i+1}</span><span class="font-extrabold text-xs text-slate-900">${esc(r.itemName)}</span><span class="text-[10px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded">عملة الأصل: ${esc(it?.currency||c)}</span><span class="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded">متاح: ${round(available,'USD')} ${esc(r.unitName)}</span></div><button type="button" class="ta-field-icon-button text-rose-700 p-1 rounded-lg text-xs" onclick="Agent.removeRow(${i})"><i class="fas fa-trash-can"></i></button></div>
  <div class="grid grid-cols-4 gap-1.5 items-end text-xs"><div><label class="text-[10px] text-slate-500 block">الوحدة</label><select class="w-full border border-slate-300 rounded-lg px-1.5 py-1.5 font-bold bg-white text-xs" onchange="Agent.changeRowUnit(${i},this.value)">${(it?.units||[{name:r.unitName}]).map(u=>`<option value="${esc(u.name)}" ${u.name===r.unitName?'selected':''}>${esc(u.name)}</option>`).join('')}</select></div>
  <div><label class="text-[10px] text-slate-500 block">الكمية</label><input type="text" inputmode="decimal" dir="ltr" value="${r.qty}" onfocus="this.select()" oninput="Agent.changeRowValue(${i},'qty',this.value)" class="w-full border border-slate-300 rounded-lg px-2 py-1.5 font-bold text-center"></div>
  <div><label class="text-[10px] text-slate-500 block">السعر (${c})</label><input type="text" inputmode="decimal" dir="ltr" value="${r.price}" onfocus="this.select()" oninput="Agent.changeRowValue(${i},'price',this.value)" class="w-full border border-slate-300 rounded-lg px-2 py-1.5 font-bold text-center"></div>
  <div class="text-left"><label class="text-[10px] text-slate-500 block">الإجمالي</label><div id="rowTotal_${i}" class="font-extrabold text-slate-900 py-1.5 px-1 bg-slate-100 rounded-lg text-center truncate">${money(r.total,c)}</div></div></div></div>`;}).join('')}</div>`:`<div onclick="Agent.openInvoiceItemGrid()" class="p-6 text-center text-slate-400 text-xs cursor-pointer"><i class="fas fa-table-cells-large text-2xl mb-1 text-emerald-500"></i><p class="font-bold text-slate-600">الفاتورة فارغة حالياً - اضغط هنا لفتح شبكة المواد وإضافتها</p></div>`}</div>
 <div class="bg-white rounded-2xl border border-slate-200 p-3.5 mb-4 shadow-xs space-y-2.5 text-xs"><div class="flex items-center justify-between font-bold text-slate-700"><span>إجمالي الأصناف:</span><span id="invSubTotalTxt" class="text-sm">${money(calc.subTotal,c)} ${c}</span></div>
 <div class="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
  <div><label class="block text-[11px] font-bold text-slate-600 mb-1">الحسم العام على الفاتورة</label><div class="flex"><input type="number" id="invoiceDiscount" min="0" step="any" value="${esc(meta.discountValue||0)}" oninput="Agent.changeInvoiceAdjustment()" class="w-full border border-slate-300 rounded-r-xl px-2.5 py-1.5 font-bold text-center"><select id="invoiceDiscountType" onchange="Agent.changeInvoiceAdjustment()" class="bg-slate-100 border border-r-0 border-slate-300 rounded-l-xl px-2 font-bold"><option value="amount" ${meta.discountType!=='percent'?'selected':''}>${c}</option><option value="percent" ${meta.discountType==='percent'?'selected':''}>%</option></select></div></div>
  <div><label class="block text-[11px] font-bold text-slate-600 mb-1">الضريبة / الإضافات</label><div class="flex"><input type="number" id="invoiceTax" min="0" step="any" value="${esc(meta.taxValue||0)}" oninput="Agent.changeInvoiceAdjustment()" class="w-full border border-slate-300 rounded-r-xl px-2.5 py-1.5 font-bold text-center"><select id="invoiceTaxType" onchange="Agent.changeInvoiceAdjustment()" class="bg-slate-100 border border-r-0 border-slate-300 rounded-l-xl px-2 font-bold"><option value="percent" ${meta.taxType!=='amount'?'selected':''}>%</option><option value="amount" ${meta.taxType==='amount'?'selected':''}>${c}</option></select></div></div>
 </div><div class="bg-slate-900 text-white p-3 rounded-xl flex items-center justify-between"><span class="font-bold text-xs">الصافي النهائي المطلوب:</span><span id="invNetTotalTxt" class="font-extrabold text-base text-emerald-400">${money(calc.netTotal,c)} ${c}</span></div>
 <div class="grid grid-cols-2 gap-2 pt-1"><div><label class="block text-[11px] font-bold text-emerald-700 mb-1">المبلغ المدفوع (دفعة الفاتورة)</label><input id="invPaidInput" type="number" step="any" min="0" value="${mode==='partial'?esc(meta.paid):calc.paidAmount}" ${mode==='partial'?'':'readonly'} oninput="Agent.invoiceMeta.paid=this.value;Agent.refreshInvoiceTotals()" class="w-full border ${mode==='partial'?'border-emerald-500 bg-white':'border-slate-200 bg-slate-100'} rounded-xl px-3 py-2 font-extrabold text-center text-sm"></div><div><label class="block text-[11px] font-bold text-rose-700 mb-1">المبلغ المتبقي (ذمم على الحساب)</label><div id="invRemainingTxt" class="w-full border border-slate-200 bg-rose-50 text-rose-700 rounded-xl px-3 py-2 font-extrabold text-center text-sm">${money(calc.remainingAmount,c)} ${c}</div></div></div>
 ${this.draftBalanceHTML()}
 <input type="hidden" id="fPaid" value="${esc(meta.paid||'')}"><label class="block text-[11px] text-slate-500">البيان / ملاحظة</label><textarea id="fNote" class="w-full border border-slate-300 rounded-xl p-2" rows="2" oninput="Agent.invoiceMeta.note=this.value">${esc(meta.note||'')}</textarea></div>
 <div class="grid grid-cols-2 gap-2"><button type="button" onclick="Agent.saveInvoiceAndPrint()" class="bg-emerald-600 text-white font-extrabold py-3 px-2 rounded-2xl text-xs flex items-center justify-center gap-1.5 shadow-sm"><i class="fab fa-bluetooth-b text-base"></i>حفظ وطباعة بلوتوث</button><button type="button" onclick="Agent.saveInvoice()" class="bg-slate-900 text-white font-extrabold py-3 px-2 rounded-2xl text-xs flex items-center justify-center gap-1.5 shadow-sm"><i class="fas fa-floppy-disk text-emerald-400"></i>حفظ الفاتورة</button></div>
 <p class="form-help">البيع يخص مخزون السيارة فقط. الفواتير المحفوظة تُرحّل دون تكرار ولا يمكن تعديلها بصمت بعد المزامنة.</p>
 </div>`;
};
A.scanInvoiceBarcode=function(){if(window.NativeBarcode?.scan)window.NativeBarcode.scan('invoice');else this.toast('مسح الباركود متاح داخل Android APK');};
A.quickAddIndex=function(i){const it=this.state.items[i];if(it)this.addGridItem(it.id);};
A.addRow=function(){this.addGridItem(value('fItem'));};
A.saveInvoiceAndPrint=function(){return this.saveInvoice(true);};
A.saveInvoice=async function(andPrint=false){if(this.busy)return;this.busy=true;
 try{
  if(!await this.active())throw Error('يجب تفعيل جهاز المندوب');
  if(!this.draft.length||this.draft.length>100)throw Error('أضف أصنافًا إلى الفاتورة');
  this.captureInvoiceMeta();
  const m=this.invoiceMeta,c=this.currency||'USD',calc=this.invoiceCalc();
  if(!Number.isFinite(calc.netTotal)||calc.netTotal<0||!Number.isFinite(calc.paidAmount)||calc.paidAmount<0)throw Error('قيم الفاتورة غير صحيحة');
  for(const k of ['discountValue','taxValue'])if(!Number.isFinite(Number(m[k]))||Number(m[k])<0)throw Error('الحسم أو الضريبة غير صحيح');
  if(calc.discountAmount>calc.subTotal|| (m.discountType==='percent'&&Number(m.discountValue)>100)||(m.taxType==='percent'&&Number(m.taxValue)>100))throw Error('الحسم أو الضريبة خارج المجال');
  if(calc.paidAmount>calc.netTotal)throw Error('المقبوض أكبر من صافي الفاتورة');
  if(calc.paidAmount<calc.netTotal&&!m.accountId)throw Error('اختر العميل في الفاتورة الآجلة أو الجزئية');
  for(const r of this.draft){
   if(!Number.isFinite(r.qty)||r.qty<=0||!Number.isFinite(r.price)||r.price<0)throw Error('الكمية أو السعر غير صحيح');
  }
  if(this.draftKind==='sale')for(const itemId of new Set(this.draft.map(r=>r.itemId))){
   const used=this.draft.filter(r=>r.itemId===itemId).reduce((s,r)=>s+Number(r.qty)/Number(r.unitFactor),0);
   if(used>(this.availableForEdit?this.availableForEdit(itemId):Number(this.stock[itemId]||0))+1e-5)throw Error('رصيد السيارة لا يكفي: '+(this.state.items.find(i=>i.id===itemId)?.name||itemId));
  }
  const preBalance=m.accountId?this.balanceFor(m.accountId):null;
  const balances=preBalance?.available?InvoiceDualBalances.pair({SYP:preBalance.syp,USD:preBalance.usd},
    {currency:c,kind:this.draftKind,netTotal:calc.netTotal,paidAmount:calc.paidAmount}):
    {before:{SYP:null,USD:null},after:{SYP:null,USD:null}};
  const before=balances.before[c],after=balances.after[c];
  const op={id:'op_'+FieldProtocol.uuid(),kind:this.draftKind,companyId:this.state.companyId,agentId:this.state.agentId,warehouseId:this.state.warehouseId,
   localNumber:'F-'+(this.state.ops.length+1),date:new Date(m.date||Date.now()).toISOString(),currency:c,exchangeRate:Number(this.state.exchangeRate),accountId:m.accountId||'',paidAmount:calc.paidAmount,
   subTotal:calc.subTotal,discountValue:Number(m.discountValue||0),discountType:m.discountType||'amount',taxValue:Number(m.taxValue||0),taxType:m.taxType||'percent',netTotal:calc.netTotal,
   rows:JSON.parse(JSON.stringify(this.draft)),note:String(m.note||'').slice(0,200),
   accountBalanceBefore:before,accountBalanceAfter:after,
   accountBalanceBeforeByCurrency:balances.before,accountBalanceAfterByCurrency:balances.after};
  FieldProtocol.validateOps([op],this.state.agentId,this.state.companyId,this.state.warehouseId,this.state.items,this.state.accounts);
  await this.appendOperation(op);
  this.closeInvoiceItemGrid();this.draft=[];this.invoiceMeta=initialMeta();
  this.stack=['home','ops'];await this.show('ops');this.toast('حُفظت الفاتورة محليًا وستُزامن تلقائيًا');
  if(andPrint)await this.printOp(op.id);
 }catch(e){this.toast('لم تُحفظ الفاتورة: '+e.message);}finally{this.busy=false;}
};
const oldOps=A.renderOps.bind(A);
A.renderOps=function(){return oldOps();};
const oldRemaining=A.invoiceRemaining.bind(A);
A.invoiceRemaining=function(op){if(op.netTotal==null)return oldRemaining(op);
 const receipts=this.state.ops.filter(o=>o.kind==='receipt'&&o.linkedInvoiceOpId===op.id&&o.currency===op.currency);
 return Math.max(0,round(op.netTotal-Number(op.paidAmount||0)-receipts.reduce((s,o)=>s+Number(o.amount||0),0),op.currency));
};
const oldPrint=A.printOp.bind(A);
A.printOp=function(id){return oldPrint(id);};
const originalShow=A.show.bind(A);
A.show=async function(route){if(route==='accounts'){
 this.screen=route;const active=this.ready()&&await this.active();
 if(!active)return originalShow('home');
 document.getElementById('screen').innerHTML=this.renderAccounts();
 document.getElementById('agentBack')?.classList.toggle('hide',this.stack.length<2);
 document.getElementById('agentScreenTitle').textContent='أرصدة الحسابات';
 document.getElementById('bottom')?.classList.remove('hide');
 document.querySelectorAll('.bottom button').forEach(b=>b.classList.toggle('active',false));
 }else await originalShow(route);};
})();
