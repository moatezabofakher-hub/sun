/* Tiqany Acc Field POS: reuse authenticated field operations, outbox and stock checks.
   The POS is a sales-entry mode, not a second ledger. */
(function(){
'use strict';
const A=Agent;
const esc=value=>A.escape(String(value??''));
const savedHome=A.renderHome.bind(A);
A.renderHome=function(){
  const html=savedHome();
  return html.replace('<button class="tile" onclick="Agent.startInvoice(\'sale_return\')">',
    '<button class="tile" onclick="Agent.startPOS()"><span class="glyph">▦</span><strong>نقطة البيع</strong><small>بيع نقدي سريع • شبكة أصناف • باركود</small></button><button class="tile" onclick="Agent.startInvoice(\'sale_return\')">');
};
const savedSettings=A.renderSettings.bind(A);
A.renderSettings=function(){
  const html=savedSettings();
  const settings=`<section class="panel" id="agentPosSettings"><h3>ضبط الفواتير — نقطة البيع</h3>
   <label class="label">حساب نقطة البيع الافتراضي</label>
   <select class="field" id="agentPosAccount" onchange="Agent.savePosSettings()"><option value="">الزبون النقدي (دون ذمم)</option>${(this.state.accounts||[]).map(acc=>`<option value="${esc(acc.id)}" ${this.state.posAccountId===acc.id?'selected':''}>${esc(acc.name)}</option>`).join('')}</select>
   <label class="label">تسعير نقطة البيع</label><select class="field" id="agentPosTier" onchange="Agent.savePosSettings()">
     ${[['account','حسب الحساب / الإعدادات'],['wholesale','الجملة'],['center','المركز'],['consumer','المستهلك']].map(([id,title])=>`<option value="${id}" ${String(this.state.posPriceTier||'account')===id?'selected':''}>${title}</option>`).join('')}</select>
   <label class="label"><input id="agentPosHomeScan" type="checkbox" ${this.state.posScanFromHome===true?'checked':''} onchange="Agent.savePosSettings()"> فتح نقطة بيع جديدة عند قراءة باركود من الرئيسية (قارئ خارجي)</label>
   <label class="label agent-pos-next-setting"><input id="agentPosAutoNext" type="checkbox" ${this.state.posAutoNextOnFinish!==false?'checked':''} onchange="Agent.savePosSettings()"> فتح نقطة بيع جديدة بعد الحفظ أو تأكيد الخروج من عملية غير مكتملة</label>
   <p class="tiny">الإعدادات خاصة بنقطة البيع، وتُحفظ على جهاز موظف البيع. تسجَّل المبيعات في صندوق موظف البيع وتُرسل مع مزامنته المعتادة.</p>
  </section>`;
  return html+settings;
};
A.savePosSettings=async function(){
  const account=document.getElementById('agentPosAccount')?.value||'';
  const tier=document.getElementById('agentPosTier')?.value||'account';
  if(account && !(this.state.accounts||[]).some(a=>String(a.id)===account))return this.toast('حساب غير متاح للموظف بيع');
  if(!['account','wholesale','center','consumer'].includes(tier))return;
  const oldA=this.state.posAccountId,oldT=this.state.posPriceTier,oldH=this.state.posScanFromHome,oldN=this.state.posAutoNextOnFinish;
  this.state.posAccountId=account;this.state.posPriceTier=tier;this.state.posScanFromHome=document.getElementById('agentPosHomeScan')?.checked===true;
  this.state.posAutoNextOnFinish=document.getElementById('agentPosAutoNext')?.checked!==false;
  try{await this.save();this.toast('تم حفظ ضبط نقطة البيع');}
  catch(e){this.state.posAccountId=oldA;this.state.posPriceTier=oldT;this.state.posScanFromHome=oldH;this.state.posAutoNextOnFinish=oldN;this.toast('تعذّر حفظ إعدادات نقطة البيع');}
};
A.startPOS=async function(){
  if(this.draft?.length && this.screen==='invoice'){
    this.confirmAction('فاتورة غير محفوظة','هل تريد ترك الفاتورة الحالية؟',()=>{this.draft=[];this.startPOS();});return;
  }
  this.posMode=true;this.posViewId=null;
  this._posStart=true;
  try {this.startInvoice('sale');} finally {this._posStart=false;}
  // startInvoice creates a draft using the field-app's normal transaction controls.
  this.invoiceMeta.accountId=this.state.accounts.some(a=>a.id===this.state.posAccountId)?this.state.posAccountId:'';
  this.invoiceMeta.paymentMode='cash';this.invoiceMeta.paid='';
  this.stack=['home','invoice'];await this.show('invoice');
};
const defaultPrice=A.unitPrice.bind(A);
A.unitPrice=function(item,unit,currency){
  if(!this.posMode)return defaultPrice(item,unit,currency);
  const tier=this.state.posPriceTier||'account';
  if(!['wholesale','center','consumer'].includes(tier))return defaultPrice(item,unit,currency);
  const price=tier==='consumer'?(unit.consumerPrice??unit.centerPrice??unit.salePrice):
    tier==='center'?(unit.centerPrice??unit.salePrice):(unit.wholesalePrice??unit.salePrice);
  const n=Number(price||0),rate=Number(this.state.exchangeRate)||1;
  return FieldProtocol.money(item.currency===currency?n:item.currency==='USD'?n*rate:n/rate,currency);
};
const defaultPaymentChange=A.changeInvoicePayment.bind(A);
A.changeInvoicePayment=function(mode){
  if(this.posMode && mode!=='cash')return this.toast('نقطة البيع مخصصة للبيع النقدي؛ استخدم فاتورة المبيعات للبيع الآجل');
  return defaultPaymentChange(mode);
};
const defaultKindChange=A.switchInvoiceKind.bind(A);
A.switchInvoiceKind=function(kind){
  if(this.posMode && kind!=='sale')return this.toast('نقطة البيع تدعم المبيعات النقدية فقط');
  return defaultKindChange(kind);
};
// A true point-of-sale screen, not a renamed ordinary sales invoice.
// It reuses the existing stock checks, authenticated invoice posting, edit
// operations, and sync outbox without creating a separate accounting ledger.
const originalRender=A.renderInvoice.bind(A);
A.renderInvoice=function(){
  if(!this.posMode)return originalRender();
  const m=this.invoiceMeta||{},c=this.currency||'USD',calc=typeof this.invoiceCalc==='function'?this.invoiceCalc():{subTotal:(this.draft||[]).reduce((n,r)=>n+Number(r.total||0),0),netTotal:(this.draft||[]).reduce((n,r)=>n+Number(r.total||0),0)};
  const curLabel=c==='SYP'?'ل.س':'$USD';
  const heading=this.posViewId?'عرض نقطة البيع النقدية':this.editingId?'تعديل نقطة البيع النقدية':'نقطة البيع النقدية';
  const accounts=(this.state.accounts||[]).map(account=>`<option value="${esc(account.id)}" ${String(m.accountId||'')===String(account.id)?'selected':''}>${esc(account.name)}</option>`).join('');
  const products=(this.draft||[]).map((r,i)=>{
    const item=this.state.items.find(it=>it.id===r.itemId);
    return `<div class="agent-pos-line"><div class="agent-pos-line-top"><strong>${esc(r.itemName||item?.name||'صنف')}</strong><button type="button" class="agent-pos-remove" onclick="Agent.removeRow(${i})" aria-label="حذف المادة">×</button></div>
      <div class="agent-pos-line-fields"><label>الوحدة<select onchange="Agent.changeRowUnit(${i},this.value)">${(item?.units||[{name:r.unitName}]).map(u=>`<option ${u.name===r.unitName?'selected':''} value="${esc(u.name)}">${esc(u.name)}</option>`).join('')}</select></label>
      <label>الكمية<input type="number" step="any" min="0.001" value="${Number(r.qty)||0}" onchange="Agent.changeRowValue(${i},'qty',this.value);Agent.show('invoice')"></label>
      <label>السعر<input type="number" step="any" min="0" value="${Number(r.price)||0}" onchange="Agent.changeRowValue(${i},'price',this.value);Agent.show('invoice')"></label>
      <div class="agent-pos-row-total"><small>المجموع</small><b id="rowTotal_${i}">${this.money(r.total,c)} ${curLabel}</b></div></div></div>`;
  }).join('');
  return `<div class="agent-pos-screen" data-point-of-sale="true" dir="rtl">
    <div class="agent-pos-heading"><div><small>${this.posViewId?'عرض فقط — للقراءة دون تعديل':'شاشة البيع السريع'}</small><h2>${heading}</h2></div><span class="agent-pos-ident">${this.editingId?'تعديل':'نقدي'}</span></div>
    <div class="agent-pos-controls"><div class="agent-pos-control"><label for="fAccount">حساب نقطة البيع</label><select id="fAccount" onchange="Agent.captureInvoiceMeta();Agent.accountPricingChanged(this.value)"><option value="">الزبون النقدي</option>${accounts}</select></div>
      <div class="agent-pos-control"><label for="fDate">التاريخ</label><input id="fDate" type="datetime-local" value="${esc(m.date||(this.defaultDate?.()||''))}" onchange="Agent.captureInvoiceMeta()"></div>
      <div class="agent-pos-control"><label>عملة الفاتورة</label><button type="button" class="agent-pos-currency" onclick="Agent.changeInvoiceCurrency()">${curLabel} ⇆ تغيير العملة</button></div></div>
    <input type="hidden" id="fCurrency" value="${esc(c)}"><input type="hidden" id="fPaymentMethod" value="cash"><input type="hidden" id="fPaid" value="${calc.netTotal}">
    <div class="agent-pos-actions"><button type="button" onclick="Agent.openInvoiceItemGrid()">▦ شبكة المواد</button>
      <button type="button" onclick="Agent.openPosNameList()">☷ قائمة الأسماء</button>
      <button type="button" class="agent-pos-scan" onclick="Agent.scanInvoiceBarcode()">▣ مسح باركود</button></div>
    <div class="agent-pos-cart"><div class="agent-pos-cart-title"><strong>سلة نقطة البيع</strong><span>${this.draft.length} صنف</span></div>
      ${products||'<button type="button" class="agent-pos-blank" onclick="Agent.openInvoiceItemGrid()">السلة فارغة — اضغط لإضافة المواد من الشبكة</button>'}</div>
    <div class="agent-pos-summary"><div class="agent-pos-sub"><span>مجموع الأصناف</span><b id="invSubTotalTxt">${this.money(calc.subTotal,c)} ${curLabel}</b></div>
      <div class="agent-pos-adjustments"><label>الحسم العام<div class="agent-pos-adjust-row"><input id="invoiceDiscount" type="number" min="0" step="any" value="${Number(m.discountValue||0)}" oninput="Agent.changeInvoiceAdjustment();Agent.posUpdateTotals()"><select id="invoiceDiscountType" onchange="Agent.changeInvoiceAdjustment();Agent.posUpdateTotals()"><option value="amount" ${m.discountType!=='percent'?'selected':''}>${curLabel}</option><option value="percent" ${m.discountType==='percent'?'selected':''}>%</option></select></div></label>
      <label>الضريبة / الإضافة<div class="agent-pos-adjust-row"><input id="invoiceTax" type="number" min="0" step="any" value="${Number(m.taxValue||0)}" oninput="Agent.changeInvoiceAdjustment();Agent.posUpdateTotals()"><select id="invoiceTaxType" onchange="Agent.changeInvoiceAdjustment();Agent.posUpdateTotals()"><option value="percent" ${m.taxType!=='amount'?'selected':''}>%</option><option value="amount" ${m.taxType==='amount'?'selected':''}>${curLabel}</option></select></div></label></div>
      <div class="agent-pos-grand"><strong>المبلغ المطلوب</strong><b id="invNetTotalTxt">${this.money(calc.netTotal,c)} ${curLabel}</b></div>
      <input type="hidden" id="invPaidInput" value="${calc.netTotal}"><input type="hidden" id="invRemainingTxt" value="0">
      <label class="agent-pos-note-label">ملاحظات<textarea id="fNote" rows="2" placeholder="ملاحظة اختيارية" oninput="Agent.invoiceMeta.note=this.value">${esc(m.note||'')}</textarea></label></div>
    <div class="agent-pos-save" dir="rtl"><button type="button" onclick="Agent.saveInvoice()">حفظ البيع</button><button type="button" onclick="Agent.saveInvoice(true)">حفظ وطباعة</button></div>
    <div class="ta-agent-pos-footer" role="group" aria-label="المبلغ الإجمالي والحفظ في نقطة البيع">
      <div class="ta-agent-pos-total"><span>المبلغ الإجمالي المستحق</span><b id="agentPosFooterDue">${this.money(calc.netTotal,c)} ${curLabel}</b></div>
      <div class="ta-agent-pos-actions"><button type="button" onclick="Agent.saveInvoice()">حفظ</button><button type="button" onclick="Agent.saveInvoice(true)">حفظ وطباعة</button></div>
    </div>
  </div>`;
};
A.posUpdateTotals=function(){
  const calc=this.invoiceCalc(),currency=this.currency==='SYP'?'ل.س':'$USD';
  for(const [id,amount] of [['invSubTotalTxt',calc.subTotal],['invNetTotalTxt',calc.netTotal]]){
    const node=document.getElementById(id);if(node)node.textContent=this.money(amount,this.currency)+' '+currency;
  }
  const due=document.getElementById('agentPosFooterDue');if(due)due.textContent=this.money(calc.netTotal,this.currency)+' '+currency;
  const paid=document.getElementById('invPaidInput');if(paid)paid.value=String(calc.netTotal);
  const hidden=document.getElementById('fPaid');if(hidden)hidden.value=String(calc.netTotal);
};
A.openPosNameList=function(){
  if(!this.posMode)return;
  let overlay=document.getElementById('agentPosNameList');
  if(!overlay){overlay=document.createElement('div');overlay.id='agentPosNameList';overlay.className='agent-picker-mask';document.body.appendChild(overlay);}
  overlay.innerHTML=`<div class="agent-picker-content" role="dialog" aria-modal="true" aria-label="اختيار المادة بالاسم">
   <div class="itemhead"><strong>اختيار مادة بالاسم</strong><button class="secondary" style="width:auto" onclick="Agent.closePosNameList()">× إغلاق</button></div>
   <input id="agentPosNameSearch" type="search" class="field" placeholder="ابحث باسم المادة..." oninput="Agent.filterPosNames(this.value)" autocomplete="off">
   <div id="agentPosNameItems" style="max-height:60vh;overflow:auto;padding:8px 0"></div>
   </div>`;
  this.filterPosNames('');document.getElementById('agentPosNameSearch')?.focus();
};
A.filterPosNames=function(query){
  const box=document.getElementById('agentPosNameItems');if(!box)return;
  const q=String(query||'').trim().toLocaleLowerCase();
  const items=(this.state.items||[]).map((item,index)=>({item,index})).filter(x=>String(x.item.name||'').toLocaleLowerCase().includes(q)).slice(0,400);
  box.innerHTML=items.map(x=>`<button type="button" class="secondary" style="text-align:right" onclick="Agent.addPosNamed(${x.index})">${esc(x.item.name)}</button>`).join('')||'<p class="muted">لا توجد مواد مطابقة.</p>';
};
A.addPosNamed=function(index){
  if(!this.posMode)return;
  const filter=document.getElementById('agentPosNameSearch')?.value||'';
  this.quickAddIndex(index);
  // Keep the names-only picker open for multiple additions.
  this.openPosNameList();const search=document.getElementById('agentPosNameSearch');if(search){search.value=filter;this.filterPosNames(filter);}
};
A.closePosNameList=function(){document.getElementById('agentPosNameList')?.remove();};
A.openPosFromBarcode=async function(value){
  if(this.state.posScanFromHome!==true||this.screen!=='home')return false;
  if(!document.getElementById('agentDialog')?.classList.contains('hide'))return false;
  const itemIndex=this.state.items.findIndex(i=>String(i.barcode||'').trim()===String(value||'').trim());
  if(itemIndex<0)return false;
  await this.startPOS();
  if(this.posMode&&this.screen==='invoice'){
    const item=this.state.items[itemIndex];
    const before=(this.draft||[]).filter(r=>r.itemId===item.id).reduce((n,r)=>n+Number(r.qty||0),0);
    this.quickAddIndex(itemIndex);
    const after=(this.draft||[]).filter(r=>r.itemId===item.id).reduce((n,r)=>n+Number(r.qty||0),0);
    if(after>before)return true;
  }
  return false;
};
const originalGoBack=A.goBack.bind(A);
A.goBack=function(){
  if(document.getElementById('agentPosNameList')){this.closePosNameList();return;}
  if(this.posMode && this.screen==='invoice' && this.draft?.length){
    this.confirmAction('الرجوع من نقطة البيع','هل تريد تجاهل الأصناف غير المحفوظة؟',()=>{
      this.draft=[];
      if(this.state.posAutoNextOnFinish!==false)this.startPOS();
      else {this.posMode=false;this.stack=['home'];this.show('home');}
    });return;
  }
  if(this.posMode && this.screen==='invoice' && !this.draft?.length){
    this.posMode=false;this.stack=['home'];this.show('home');return;
  }
  return originalGoBack();
};
const previousShow=A.show.bind(A);
A.show=async function(route){
  if(route!=='invoice' && !this.posSaving)this.posMode=false;
  return previousShow(route);
};
const normalSave=A.saveInvoice.bind(A);
A.saveInvoice=async function(andPrint=false){
  if(!this.posMode||this.editingId)return normalSave(andPrint);
  if(this.busy)return;
  this.posSaving=true;
  this.invoiceMeta.paymentMode='cash';
  const oldCount=this.state.ops.length;
  try{
    // Existing posting logic enforces stock, licence and transaction validation.
    await normalSave(andPrint);
    if(this.state.ops.length>oldCount){
      if(this.state.posAutoNextOnFinish===false){this.posMode=false;this.stack=['home'];await previousShow('home');return;}
      this.posMode=true;this.draft=[];this.invoiceMeta.accountId=this.state.accounts.some(a=>a.id===this.state.posAccountId)?this.state.posAccountId:'';
      this.invoiceMeta.paymentMode='cash';this.invoiceMeta.paid='';
      this.stack=['home','invoice'];await previousShow('invoice');
      this.toast('حُفظ البيع؛ نقطة بيع جديدة جاهزة');
    }
  }finally{this.posSaving=false;}
};
// Preserve POS identity across original field operations, including edits and sync.
const posAppend=A.appendOperation.bind(A);
A.appendOperation=async function(op){
  const previous=this.editingId && (this.state.ops||[]).find(x=>x.id===this.editingId);
  if(op?.kind==='sale' && ((this.posMode && !this.editingId) || previous?.source==='agent-pos'))op.source='agent-pos';
  return posAppend(op);
};
const posEdit=A.editDocument.bind(A);
A.editDocument=function(id){
  const op=(this.state.ops||[]).find(o=>o.id===id);
  this.posMode=op?.kind==='sale' && op.source==='agent-pos';
  this.posViewId=null;
  return posEdit(id);
};
// Normal sale forms must not inherit a POS mode from the preceding transaction.
const posStart=A.startInvoice.bind(A);
A.startInvoice=function(kind){
  if(!this._posStart)this.posMode=false;
  return posStart(kind);
};
// A read-only POS receipt opens inside the same point-of-sale visual language.
A.viewPosInvoice=function(id){
  const op=(this.state.ops||[]).find(x=>x.id===id && x.kind==='sale' && x.source==='agent-pos');
  if(!op)return this.toast('هذه الفاتورة ليست نقطة بيع مسجلة');
  // Render the SAME POS layout, backed by a copy of the saved invoice.
  this.posViewId=id;
  this.posMode=true;
  this.editingId=null;
  this.draft=JSON.parse(JSON.stringify(op.rows||[]));
  this.draftKind='sale';this.currency=op.currency;
  const net=Number(op.netTotal??this.draft.reduce((sum,r)=>sum+Number(r.total||0),0));
  const paid=Number(op.paidAmount||0);
  const date=new Date(op.date);
  this.invoiceMeta={accountId:op.accountId||'',currency:op.currency,paymentMode:'cash',paid:String(paid),
    date:Number.isFinite(date.getTime())?new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16):this.defaultDate(),
    note:op.note||'',discountValue:op.discountValue||0,discountType:op.discountType||'amount',
    taxValue:op.taxValue||0,taxType:op.taxType||'percent'};
  this.navigate('pos_view');
};
A.renderPosView=function(){
  const op=(this.state.ops||[]).find(x=>x.id===this.posViewId);
  if(!op)return '<div class="panel">الفاتورة غير موجودة.</div>';
  return `<div class="panel" data-pos-mode="view"><strong>نقطة البيع النقدية — عرض الفاتورة ${esc(op.localNumber||'')}</strong></div>`+this.renderInvoice();
};
const posShow=A.show.bind(A);
A.show=async function(route){
  if(route==='pos_view'){
    this.screen='pos_view';
    const el=document.getElementById('screen');
    if(el){
      el.innerHTML=this.renderPosView();
      // Make the same POS form strictly read-only, including add/remove and payment controls.
      el.querySelectorAll('input,select,textarea,button').forEach(input=>{input.disabled=true;});
      const actions=document.createElement('div');actions.className='panel';
      const op=(this.state.ops||[]).find(x=>x.id===this.posViewId);
      if(op){actions.innerHTML=`<button type="button" class="primary" onclick="Agent.editDocument('${esc(op.id)}')">✎ تعديل نقطة البيع</button><button type="button" class="secondary" onclick="Agent.printOp('${esc(op.id)}')">🖨 طباعة</button><button type="button" class="secondary" onclick="Agent.goBack()">رجوع</button>`;el.appendChild(actions);}
    }
    return;
  }
  this.posViewId=null;
  return posShow(route);
};
const posInvoiceList=A.renderInvoices.bind(A);
A.renderInvoices=function(){
  let html=posInvoiceList();
  // Invoice list is shared with all sales; edit POS from the POS screen, not a regular sale.
  for(const op of (this.state.ops||[]).filter(o=>o.kind==='sale' && o.source==='agent-pos')){
    const print=`<button class="secondary" style="width:auto;margin:0;padding:7px 12px" onclick="Agent.printOp('${op.id}')">🖨 طباعة</button>`;
    const view=`<button type="button" class="secondary" style="width:auto;margin:0;padding:7px 12px" onclick="Agent.viewPosInvoice('${op.id}')">👁 عرض نقطة البيع</button>`;
    html=html.replace(print,view+print);
    html=html.replace(String(op.localNumber||op.id)+' · '+this.kindName(op.kind),String(op.localNumber||op.id)+' · نقطة بيع نقدية');
  }
  return html;
};
})();
