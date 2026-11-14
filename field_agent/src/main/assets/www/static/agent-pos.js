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
   <p class="tiny">الإعدادات خاصة بنقطة البيع، وتُحفظ على جهاز موظف البيع. تسجَّل المبيعات في صندوق موظف البيع وتُرسل مع مزامنته المعتادة.</p>
  </section>`;
  return html+settings;
};
A.savePosSettings=async function(){
  const account=document.getElementById('agentPosAccount')?.value||'';
  const tier=document.getElementById('agentPosTier')?.value||'account';
  if(account && !(this.state.accounts||[]).some(a=>String(a.id)===account))return this.toast('حساب غير متاح للموظف بيع');
  if(!['account','wholesale','center','consumer'].includes(tier))return;
  const oldA=this.state.posAccountId,oldT=this.state.posPriceTier,oldH=this.state.posScanFromHome;
  this.state.posAccountId=account;this.state.posPriceTier=tier;this.state.posScanFromHome=document.getElementById('agentPosHomeScan')?.checked===true;
  try{await this.save();this.toast('تم حفظ ضبط نقطة البيع');}
  catch(e){this.state.posAccountId=oldA;this.state.posPriceTier=oldT;this.state.posScanFromHome=oldH;this.toast('تعذّر حفظ إعدادات نقطة البيع');}
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
const originalRender=A.renderInvoice.bind(A);
A.renderInvoice=function(){
  let html=originalRender();
  if(!this.posMode)return html;
  html=html.replace('فاتورة مبيعات',this.posViewId?'عرض نقطة بيع نقدية':this.editingId?'تعديل نقطة البيع النقدية':'نقطة البيع السريعة');
  // Existing invoice screen provides product grid, search, scanning, row editing and save/print.
  // Add the simplified names-only picker without changing the protected invoice form.
  const namesBtn='<button type="button" class="secondary" onclick="Agent.openPosNameList()">☷ اختيار مادة من قائمة الأسماء</button>';
  html=html.replace('إضافة مواد', 'إضافة مواد');
  html=html.replace('<div class="agent-main-invoice">',`<div class="agent-main-invoice" data-point-of-sale="true"><div class="agent-pos-names-compact">${this.posViewId?'<p class="tiny">عرض فقط — هذه الفاتورة للقراءة دون تعديل.</p>':''}${namesBtn}</div>`);
  // In alternate render layouts insert next to search field.
  if(!html.includes(namesBtn))html='<div class="panel">'+namesBtn+'</div>'+html;
  return html;
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
  if(this.posMode&&this.screen==='invoice')this.quickAddIndex(itemIndex);
  return true;
};
const originalGoBack=A.goBack.bind(A);
A.goBack=function(){
  if(document.getElementById('agentPosNameList')){this.closePosNameList();return;}
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
