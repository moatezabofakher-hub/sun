/* Technical Accountant Field: unified premium UI + field-safe navigation.
 * The field operations remain append-only to preserve synchronization guarantees.
 */
(function(){
'use strict';
const existingShow=Agent.show.bind(Agent);
const originalPrint=Agent.printOp.bind(Agent);
Agent.stack=['home'];
Agent.gridCategory='all';
Agent.gridSearch='';
Agent.invoiceMeta={accountId:'',currency:'USD',paymentMode:'cash',paid:'',date:'',note:''};
Agent.voucherKind='receipt';
Agent.dialogAction=null;
Agent.printerInfo={state:'disconnected',message:'لم تتصل بالطابعة بعد',address:''};
Agent.kindName=k=>({sale:'فاتورة مبيعات',sale_return:'مردود مبيعات',receipt:'سند قبض',payment:'سند دفع',expense:'إيصال مصروف'})[k]||'عملية';
Agent.money=(n,cur)=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:cur==='USD'?2:0,maximumFractionDigits:cur==='USD'?2:0});
Agent.currentTotal=()=>FieldProtocol.money(Agent.draft.reduce((s,r)=>s+Number(r.total),0),Agent.currency||'USD');
Agent.defaultDate=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
Agent.captureInvoiceMeta=function(){
 const val=id=>document.getElementById(id)?.value;
 this.invoiceMeta={accountId:val('fAccount')??this.invoiceMeta.accountId,currency:val('fCurrency')??this.invoiceMeta.currency,
 paymentMode:val('fPaymentMethod')??this.invoiceMeta.paymentMode,paid:val('fPaid')??this.invoiceMeta.paid,
 date:val('fDate')??this.invoiceMeta.date,note:val('fNote')??this.invoiceMeta.note};
};
Agent.modeChanged=function(mode){this.invoiceMeta.paymentMode=mode;
 const el=document.getElementById('fPaid'),box=document.getElementById('paidAmountBox');
 if(el){el.value=mode==='cash'?this.currentTotal():mode==='credit'?0:(this.invoiceMeta.paid||0);this.invoiceMeta.paid=el.value;}
 if(box)box.classList.toggle('hide',mode==='cash'||mode==='credit');
};
Agent.dismissDialog=function(){document.getElementById('agentDialog')?.classList.add('hide');this.dialogAction=null;};
Agent.confirmAction=function(title,message,action){this.dialogAction=action;
 document.getElementById('dialogTitle').textContent=title;
 document.getElementById('dialogMessage').textContent=message;
 document.getElementById('agentDialog').classList.remove('hide');
 const leaving=title==='تأكيد الخروج من التطبيق';
 const accept=document.getElementById('dialogAccept');if(accept)accept.textContent=leaving?'نعم، خروج':'تأكيد';
 const cancel=document.getElementById('agentDialogCancel');if(cancel)cancel.textContent=leaving?'البقاء في التطبيق':'إلغاء';};
Agent.acceptDialog=function(){const fn=this.dialogAction;this.dismissDialog();if(fn)fn();};
Agent.bottomRoutes=['home','invoices','ops','sync','settings'];
Agent.navigate=async function(route){
 if(this.screen===route){await this.show(route);return;}
 if(this.screen==='invoice'&&this.draft.length){this.confirmAction('توجد فاتورة لم تُحفظ','هل تريد ترك الفاتورة وفقدان المواد المختارة؟',()=>{this.draft=[];this.stack=this.bottomRoutes.includes(route)?(route==='home'?['home']:['home',route]):[...this.stack,route];this.show(route);});return;}
 if(this.screen==='voucher'&&document.getElementById('vAmount')?.value){this.confirmAction('سند لم يُحفظ','سيتم تجاهل السند الذي أدخلته. هل تريد المتابعة؟',()=>{this.stack=this.bottomRoutes.includes(route)?(route==='home'?['home']:['home',route]):[...this.stack,route];this.show(route);});return;}
 this.stack=this.bottomRoutes.includes(route)?(route==='home'?['home']:['home',route]):[...this.stack,route]; await this.show(route);
};
Agent.goBack=async function(){
 if(!document.getElementById('agentDialog').classList.contains('hide')){this.dismissDialog();return;}
 if(this.screen==='invoice'&&this.draft.length){this.confirmAction('العودة دون حفظ','ستُلغى مواد الفاتورة غير المحفوظة فقط. العمليات السابقة لن تتأثر.',()=>{this.draft=[];this.goBack();});return;}
 if(this.screen==='voucher'&&document.getElementById('vAmount')?.value){this.confirmAction('العودة دون حفظ','هل تريد تجاهل بيانات السند غير المحفوظ؟',()=>{this.stack.pop();this.show(this.stack[this.stack.length-1]||'home');});return;}
 if(this.screen==='expense' && (document.getElementById('eAmount')?.value||document.getElementById('eNote')?.value)){
    this.confirmAction('إيصال مصروف غير محفوظ','هل تريد تجاهل بيانات المصروف والعودة؟',()=>this.goBackDiscardExpense());return;
 }
 if(this.screen==='home'){
   this.stack=['home'];
   this.confirmAction('تأكيد الخروج من التطبيق','هل تريد الخروج من تطبيق المندوب أم البقاء في التطبيق؟',()=>{
     if(window.Android?.exitApp)window.Android.exitApp();else this.toast('الخروج المباشر متاح في تطبيق أندرويد');
   });
   return;
 }
 if(this.bottomRoutes.includes(this.screen)){
    this.stack=['home'];await this.show('home');return;
 }
 if(this.stack.length>1){this.stack.pop();await this.show(this.stack[this.stack.length-1]);return;}
 this.stack=['home'];await this.show('home');
};
Agent.goBackDiscardExpense=function(){this.stack.pop();if(!this.stack.length)this.stack=['home'];this.show(this.stack[this.stack.length-1]);};
let lastAgentBack=0;
function agentHardwareBack(){const now=Date.now();if(now-lastAgentBack<200)return;lastAgentBack=now;Agent.goBack();}
window.onAndroidBackPressed=agentHardwareBack;
try{history.pushState({agentBackGuard:true},'');window.addEventListener('popstate',()=>{
 history.pushState({agentBackGuard:true},'');agentHardwareBack();
});}catch(_){}
document.addEventListener('keydown',e=>{if(e.key==='Escape'||e.key==='BrowserBack'){e.preventDefault();agentHardwareBack();}});
const originalStartInvoice=Agent.startInvoice.bind(Agent);
Agent.startInvoice=function(kind){
 if(this.screen==='invoice'&&this.draft.length){
  this.confirmAction('فاتورة غير محفوظة','هل تريد تجاهل الأصناف المختارة وفتح فاتورة جديدة؟',()=>{this.draft=[];this.startInvoice(kind);});return;
 }
 this.invoiceMeta={accountId:'',currency:'USD',paymentMode:'cash',paid:'',date:this.defaultDate(),note:''};this.currency='USD';this.gridSearch='';this.gridCategory='all';
 this.draft=[];this.draftKind=kind;this.navigate('invoice');};
Agent.switchInvoiceKind=function(kind){if(kind===this.draftKind)return;
 const act=()=>{this.draft=[];this.draftKind=kind;this.show('invoice');};
 if(this.draft.length)this.confirmAction('تغيير نوع الفاتورة','تغيير النوع يمسح الأصناف غير المحفوظة.',act);else act();
};
Agent.renderHome=function(){const o=this.state.ops||[],pending=this.pending.length;
 const today=new Date().toISOString().slice(0,10),todayOps=o.filter(x=>x.date.slice(0,10)===today);
 return `<div class="hero"><h2>أهلًا ${this.escape(this.state.agentName)} 👋</h2><p>${this.escape(this.state.companyName)} · ${this.escape(this.state.vehicleName)} · المستودع المتنقل</p>
  <div class="stats"><div class="stat"><b>${todayOps.filter(x=>x.kind==='sale').length}</b><small>مبيعات اليوم</small></div><div class="stat"><b>${pending}</b><small>لم تُزامن</small></div><div class="stat"><b>${this.state.items.length}</b><small>مادة معتمدة</small></div></div></div>
  <section class="panel"><h3>العمليات السريعة</h3><div class="grid">
  <button class="tile" onclick="Agent.startInvoice('sale')"><span class="glyph">🛒</span><strong>فاتورة مبيعات</strong><small>اختيار مواد من شبكة الأصناف</small></button>
  <button class="tile" onclick="Agent.startInvoice('sale_return')"><span class="glyph">↩</span><strong>مردود مبيعات</strong><small>إرجاع المواد إلى السيارة</small></button>
  <button class="tile" onclick="Agent.startVoucher('receipt')"><span class="glyph">💵</span><strong>سند قبض</strong><small>استلام دفعة من عميل</small></button>
  <button class="tile" onclick="Agent.startVoucher('payment')"><span class="glyph">💳</span><strong>سند دفع</strong><small>تسجيل دفع مصرح به</small></button>
  <button class="tile" onclick="Agent.navigate('expense')"><span class="glyph">🧾</span><strong>إيصال مصروف</strong><small>تسجيل مصروف على صندوق المندوب</small></button>
  <button class="tile" onclick="Agent.navigate('stock')"><span class="glyph">📦</span><strong>رصيد السيارة</strong><small>جرد المستودع المتنقل</small></button>
  </div></section>
  <section class="panel"><h3>الطباعة السريعة</h3><p class="form-help">طابعة حرارية 80 مم / 58 مم عبر البلوتوث المباشر</p>
  <button class="secondary" onclick="Agent.navigate('printer')">🖨️ ربط واختيار الطابعة</button></section>`;
};
Agent.renderInvoice=function(){
 const cur=this.currency||this.invoiceMeta.currency||'USD',kind=this.draftKind;
 const meta=this.invoiceMeta;const net=this.currentTotal();
 const accounts=this.state.accounts||[],items=this.state.items||[];
 const cats=this.state.categories||[];const categoryRows=cats.map(c=>typeof c==='string'?{id:c,name:c}:{id:c.id,name:c.name});
 if(!categoryRows.length){for(const it of items){const id=it.categoryId||it.category||'other';if(!categoryRows.some(x=>x.id===id))categoryRows.push({id,name:it.categoryName||'بدون مجموعة'});}}
 const mode=meta.paymentMode||'cash';const payment=mode==='cash'?net:mode==='credit'?0:Math.min(Number(meta.paid||0),net);
 return `<div class="hero"><h2>${kind==='sale'?'فاتورة مبيعات':'مردود مبيعات'}</h2><p>نفس تخطيط الفواتير في التطبيق الرئيسي — كل عملية تُحفظ محليًا حتى مزامنتها مع الإدارة</p></div>
 <section class="panel"><h3>بيانات الفاتورة</h3>
 <div class="agent-mode"><button type="button" class="${kind==='sale'?'current':''}" onclick="Agent.switchInvoiceKind('sale')">مبيعات</button>
 <button type="button" class="${kind==='sale_return'?'current':''}" onclick="Agent.switchInvoiceKind('sale_return')">مردود مبيعات</button></div>
 <div class="agent-invoice-header">
  <div><label>التاريخ والوقت</label><input id="fDate" type="datetime-local" class="field" value="${this.escape(meta.date||this.defaultDate())}" onchange="Agent.captureInvoiceMeta()"></div>
  <div><label>العملة</label><select id="fCurrency" class="field" onchange="Agent.captureInvoiceMeta();Agent.reprice(this.value)"><option ${cur==='USD'?'selected':''}>USD</option><option ${cur==='SYP'?'selected':''}>SYP</option></select></div>
  <div class="wide"><label>الزبون</label><select id="fAccount" class="field" onchange="Agent.captureInvoiceMeta()"><option value="">نقدي دون حساب</option>${accounts.map(a=>`<option value="${this.escape(a.id)}" ${meta.accountId===a.id?'selected':''}>${this.escape(a.name)}</option>`).join('')}</select></div>
 </div></section>
 <section class="panel"><div class="agent-grid-header"><h3>إضافة مواد من الشبكة</h3><span class="pill">${items.length} مادة</span></div>
  <div class="row"><div><label class="label">بحث باسم المادة</label><input id="itemGridQuery" class="field" placeholder="اكتب اسم المادة..." value="${this.escape(this.gridSearch)}" oninput="Agent.filterGrid()"></div>
  <div><label class="label">المجموعة</label><select id="itemGridCategory" class="field" onchange="Agent.filterGrid()"><option value="all">جميع المجموعات</option>${categoryRows.map(c=>`<option value="${this.escape(c.id)}" ${this.gridCategory===c.id?'selected':''}>${this.escape(c.name)}</option>`).join('')}</select></div></div>
  <div class="row" style="margin-top:10px"><button type="button" class="secondary" onclick="document.getElementById('itemGridQuery')?.focus()">▦ إضافة مواد</button><button type="button" class="secondary" onclick="Agent.scanInvoiceBarcode()">📷 مسح باركود</button></div>
  <div id="agentItemGrid" class="item-grid">${this.renderItemGrid()}</div>
  <p class="form-help">اضغط على بطاقة الصنف لإضافة وحدة واحدة فورًا، ثم عدّل الكمية أو الوحدة من القائمة أسفل الشبكة.</p>
  <div class="row"><div><label class="label">الصنف</label><select id="fItem" class="field" onchange="Agent.paintUnits()">${items.map(i=>`<option value="${this.escape(i.id)}">${this.escape(i.name)}</option>`).join('')}</select></div><div><label class="label">الوحدة</label><select id="fUnit" class="field"></select></div></div>
  <div class="row"><div><label class="label">الكمية</label><input class="field ltr" id="fQty" type="number" step="0.001" min="0.001" value="1"></div><div style="flex:1.3;align-self:end"><button class="secondary" onclick="Agent.captureInvoiceMeta();Agent.addRow()">+ إضافة المادة</button></div></div>
 </section>
 <section class="panel"><div class="invoice-selected"><h3>المواد المضافة (${this.draft.length})</h3>
  ${this.draft.length?this.draft.map((r,i)=>`<div class="itemrow"><div class="itemhead"><b>${i+1}. ${this.escape(r.itemName)}</b><button type="button" class="mini-btn" aria-label="إنقاص وحدة" onclick="Agent.decrementRow(${i})">×</button></div><div class="itemhead"><span class="tiny">${this.money(r.qty,cur)} ${this.escape(r.unitName)} × ${this.money(r.price,cur)}</span><b>${this.money(r.total,cur)} ${cur}</b></div></div>`).join(''):'<p class="muted">لم تُضف أصناف بعد</p>'}
  </div>
  <div class="money-total"><span>إجمالي الفاتورة</span><span>${this.money(net,cur)} ${cur}</span></div>
  <label class="label">طريقة الدفع</label><select class="field" id="fPaymentMethod" onchange="Agent.modeChanged(this.value)"><option value="cash" ${mode==='cash'?'selected':''}>نقدي</option><option value="credit" ${mode==='credit'?'selected':''}>آجل</option><option value="partial" ${mode==='partial'?'selected':''}>جزئي</option></select>
  <div id="paidAmountBox" class="${mode==='cash'||mode==='credit'?'hide':''}"><label class="label">المبلغ المقبوض / المعاد</label><input type="number" id="fPaid" class="field ltr" min="0" step="any" value="${payment}" oninput="Agent.captureInvoiceMeta()"></div>
  <label class="label">ملاحظة</label><textarea id="fNote" class="field" rows="2" oninput="Agent.captureInvoiceMeta()">${this.escape(meta.note)}</textarea>
  <button class="primary" onclick="Agent.saveInvoice()">✓ حفظ الفاتورة</button>
  <p class="form-help">بعد اعتمادها محليًا لا يمكن حذفها أو تغيير قيمتها بصمت؛ تُسجّل التصحيحات من الإدارة للمحافظة على سلامة المزامنة.</p>
 </section>`;
};
Agent.renderItemGrid=function(){const query=(this.gridSearch||'').trim().toLocaleLowerCase(),cat=this.gridCategory;
 const filtered=this.state.items.map((it,i)=>({it,i})).filter(({it})=>(cat==='all'||String(it.categoryId||it.category||'other')===cat)&&(!query||String(it.name).toLocaleLowerCase().includes(query)));
 if(!filtered.length)return '<p class="tiny">لا توجد مواد مطابقة للبحث.</p>';
 return filtered.slice(0,300).map(({it,i})=>{const chosen=this.draft.filter(r=>r.itemId===it.id).reduce((s,r)=>s+r.qty/r.unitFactor,0);
  const balance=Number(this.stock[it.id]||0);return `<button type="button" class="item-pick" data-item-index="${i}" onclick="Agent.quickAddIndex(${i})"><b>${this.escape(it.name)}</b><small>المتاح: ${balance.toFixed(2)} من الوحدة الأساسية</small><span class="qty">+ إضافة</span>${chosen>0?`<span class="grid-count">${chosen.toFixed(2)} في الفاتورة</span>`:''}</button>`;}).join('');};
Agent.filterGrid=function(){const q=document.getElementById('itemGridQuery'),c=document.getElementById('itemGridCategory');this.gridSearch=q?.value||'';this.gridCategory=c?.value||'all';const target=document.getElementById('agentItemGrid');if(target)target.innerHTML=this.renderItemGrid();};
Agent.scanInvoiceBarcode=function(){
 if(window.NativeBarcode?.scan){window.NativeBarcode.scan('invoice');return;}
 this.toast('مسح الباركود بالكاميرا متاح عند تشغيل التطبيق على أندرويد');
};
Agent.addScannedBarcode=function(value){
 const barcode=String(value||'').trim();if(!barcode)return false;
 const index=this.state.items.findIndex(it=>String(it.barcode||'').trim()===barcode);
 if(index<0){this.toast('الباركود غير موجود في المواد المعتمدة: '+barcode.slice(0,18));return false;}
 this.quickAddIndex(index);return true;
};
window.__nativeBarcodeResult=(target,code,message)=>{if(message)Agent.toast(message);if(target==='invoice'&&code)Agent.addScannedBarcode(code);};
window.__nativeBarcodeBatchResult=codes=>{if(!Array.isArray(codes))return;let added=0;
 for(const code of codes)if(Agent.addScannedBarcode(code))added++;
 if(added)Agent.toast('تمت إضافة '+added+' مادة من الماسح');};
Agent.quickAddIndex=function(index){const it=this.state.items[index];if(!it)return;
 this.captureInvoiceMeta();const select=document.getElementById('fItem');if(select)select.value=it.id;this.paintUnits();const qty=document.getElementById('fQty');if(qty)qty.value='1';this.addRow();};
Agent.decrementRow=function(index){const row=this.draft[index];if(!row)return;
 const newQty=Number((row.qty-1).toFixed(4));if(newQty<=0)this.draft.splice(index,1);
 else {row.qty=newQty;row.total=FieldProtocol.money(newQty*row.price,this.currency||'USD');}
 this.captureInvoiceMeta();this.show('invoice');};
const oldReprice=Agent.reprice.bind(Agent);
Agent.reprice=function(cur){this.captureInvoiceMeta();if(cur===this.currency)return;
 this.invoiceMeta.currency=cur;this.invoiceMeta.paid='';this.invoiceMeta.paymentMode='cash';oldReprice(cur);};
const oldAddRow=Agent.addRow.bind(Agent);
Agent.addRow=function(){this.captureInvoiceMeta();return oldAddRow();};
const oldRemoveRow=Agent.removeRow.bind(Agent);
Agent.removeRow=function(i){this.captureInvoiceMeta();return oldRemoveRow(i);};
Agent.startVoucher=function(kind){
 if(this.screen==='voucher'&&document.getElementById('vAmount')?.value){
  this.confirmAction('سند غير محفوظ','هل تريد فتح سند آخر وإلغاء البيانات الحالية؟',()=>{this.voucherKind=kind;this.show('voucher');});return;
 }
 this.voucherKind=kind;this.navigate('voucher');};
Agent.switchVoucherKind=function(kind){
 if(this.voucherKind===kind)return;
 if(document.getElementById('vAmount')?.value){this.confirmAction('تغيير نوع السند','تغيير نوع السند سيلغي البيانات المدخلة في النموذج.',()=>{this.voucherKind=kind;this.show('voucher');});return;}
 this.voucherKind=kind;this.show('voucher');};
Agent.renderVoucher=function(){const k=this.voucherKind||'receipt';return `<div class="hero"><h2>${k==='receipt'?'سند قبض':'سند دفع'}</h2><p>سند مالي مرتبط بحساب العميل، يُرحّل إلى المحاسب الرئيسي عند المزامنة.</p></div>
 <section class="panel"><h3>معلومات السند</h3><div class="agent-mode"><button class="${k==='receipt'?'current':''}" onclick="Agent.switchVoucherKind('receipt')">قبض</button><button class="${k==='payment'?'current':''}" onclick="Agent.switchVoucherKind('payment')">دفع</button></div>
  <select id="vKind" class="hide"><option ${k==='receipt'?'selected':''} value="receipt">قبض</option><option ${k==='payment'?'selected':''} value="payment">دفع</option></select>
  <label class="label">العميل</label><select id="vAcc" class="field">${this.state.accounts.map(a=>`<option value="${this.escape(a.id)}">${this.escape(a.name)}</option>`).join('')}</select>
  <div class="row"><div><label class="label">التاريخ</label><input id="vDate" type="datetime-local" class="field" value="${this.defaultDate()}"></div><div><label class="label">العملة</label><select id="vCurrency" class="field"><option>USD</option><option>SYP</option></select></div></div>
  <label class="label">المبلغ</label><input type="number" id="vAmount" class="field ltr" placeholder="0.00" min="0.01" step="any">
  <label class="label">البيان</label><textarea id="vNote" class="field" rows="2" placeholder="بيان السند (اختياري)"></textarea>
  <button class="primary" onclick="Agent.saveVoucher()">✓ حفظ ${k==='receipt'?'سند القبض':'سند الدفع'}</button></section>`;};
// Persist a new operation atomically; on storage failure do not leave a ghost entry in memory.
Agent.appendOperation=async function(op){const before=this.state.ops.slice();this.state.ops.push(op);
 try{await this.save();}catch(e){this.state.ops=before;throw e;}};
Agent.saveInvoice=async function(){if(this.busy)return;this.busy=true;
 try{if(!await this.active())throw Error('يجب تفعيل المندوب أولًا');
  if(!this.draft.length)throw Error('أضف مادة واحدة على الأقل');this.captureInvoiceMeta();
  const meta=this.invoiceMeta,currency=this.currency||'USD',net=this.currentTotal();
  const paid=FieldProtocol.money(meta.paymentMode==='cash'?net:meta.paymentMode==='credit'?0:Number(meta.paid||0),currency);
  if(paid>net)throw Error('المقبوض أكبر من قيمة الفاتورة');
  if(paid<net&&!meta.accountId)throw Error('اختر العميل للفاتورة الآجلة أو الجزئية');
  const op={id:'op_'+FieldProtocol.uuid(),kind:this.draftKind,companyId:this.state.companyId,agentId:this.state.agentId,warehouseId:this.state.warehouseId,
   localNumber:'F-'+(this.state.ops.length+1),date:new Date(meta.date||Date.now()).toISOString(),currency,exchangeRate:Number(this.state.exchangeRate),accountId:meta.accountId||'',paidAmount:paid,
   rows:JSON.parse(JSON.stringify(this.draft)),note:String(meta.note||'').slice(0,200)};
  FieldProtocol.validateOps([op],this.state.agentId,this.state.companyId,this.state.warehouseId,this.state.items,this.state.accounts);
  await this.appendOperation(op);this.draft=[];this.invoiceMeta={accountId:'',currency:'USD',paymentMode:'cash',paid:'',date:'',note:''};
  this.toast('حُفظت الفاتورة محليًا. تبقى للمزامنة مع الإدارة');this.stack=['home','ops'];await this.show('ops');
 }catch(e){this.toast('لم تُحفظ الفاتورة: '+e.message);}finally{this.busy=false;}};
Agent.saveVoucher=async function(){if(this.busy)return;this.busy=true;
 try{if(!await this.active())throw Error('يجب تفعيل المندوب أولًا');
  const currency=document.getElementById('vCurrency')?.value,accountId=document.getElementById('vAcc')?.value,
   amount=FieldProtocol.money(document.getElementById('vAmount')?.value,currency),kind=this.voucherKind;
  if(!accountId||amount<=0)throw Error('اختر العميل وأدخل مبلغًا صحيحًا');
  const op={id:'op_'+FieldProtocol.uuid(),kind,companyId:this.state.companyId,agentId:this.state.agentId,warehouseId:this.state.warehouseId,
   localNumber:'V-'+(this.state.ops.length+1),date:new Date(document.getElementById('vDate')?.value||Date.now()).toISOString(),currency,exchangeRate:Number(this.state.exchangeRate),accountId,amount,note:String(document.getElementById('vNote')?.value||'').slice(0,200)};
  FieldProtocol.validateOps([op],this.state.agentId,this.state.companyId,this.state.warehouseId,this.state.items,this.state.accounts);
  await this.appendOperation(op);this.toast('حُفظ السند محليًا');this.stack=['home','ops'];await this.show('ops');
 }catch(e){this.toast('لم يُحفظ السند: '+e.message);}finally{this.busy=false;}};
Agent.renderOps=function(){const ops=this.state.ops.slice().reverse(),kind=this.opsFilter||'all';
 const filtered=ops.filter(o=>kind==='all'||o.kind===kind);
 return `<div class="hero"><h2>الفواتير والسندات</h2><p>سجل العمليات الميدانية وأرصدة المندوب. لا توجد تقارير أرباح في هذا التطبيق.</p></div><div class="panel">
  <div class="stats"><div class="stat"><b>${ops.length}</b><small>المحفوظة</small></div><div class="stat"><b>${this.pending.length}</b><small>بانتظار المزامنة</small></div><div class="stat"><b>${ops.length-this.pending.length}</b><small>تمت مزامنتها</small></div></div>
  <label class="label">عرض نوع الحركة</label><select class="field" onchange="Agent.opsFilter=this.value;Agent.show('ops')"><option value="all">كل العمليات</option>${['sale','sale_return','receipt','payment','expense'].map(k=>`<option value="${k}" ${kind===k?'selected':''}>${this.kindName(k)}</option>`).join('')}</select>
  ${filtered.length?filtered.map(o=>{const net=o.rows?o.rows.reduce((s,r)=>s+Number(r.total),0):Number(o.amount);
   const remaining=o.kind==='sale'?this.invoiceRemaining(o):0;
   return `<div class="itemrow"><div class="itemhead"><b>${this.escape(o.localNumber)} · ${this.kindName(o.kind)}</b><span class="pill ${this.state.knownIds.includes(o.id)?'':'wait'}">${this.state.knownIds.includes(o.id)?'مرحّلة':'بانتظار المزامنة'}</span></div>
    <p class="tiny">${this.escape(o.date.slice(0,16).replace('T',' '))} · ${this.escape(o.kind==='expense' ? o.category : (this.state.accounts.find(a=>a.id===o.accountId)?.name||'نقدي'))}</p>
    <div class="itemhead"><b>${this.money(net,o.currency)} ${o.currency}</b><button class="secondary" style="margin:0;width:auto;padding:6px 12px" onclick="Agent.printOp('${o.id}')">🖨 طباعة</button></div>
    ${o.kind==='sale'&&remaining>0?`<button class="secondary" onclick="Agent.openInvoicePayment('${o.id}')">+ تسجيل دفعة من هذا العميل · ${this.money(remaining,o.currency)} ${o.currency}</button>`:''}
   </div>`;}).join(''):'<p class="muted">لا توجد حركات في هذا التصنيف.</p>'}</div>`;};
Agent.invoiceRemaining=function(inv){const receipts=this.state.ops.filter(o=>o.kind==='receipt'&&o.linkedInvoiceOpId===inv.id&&o.currency===inv.currency);
 return FieldProtocol.money(Math.max(0,inv.rows.reduce((s,r)=>s+Number(r.total),0)-Number(inv.paidAmount||0)-receipts.reduce((s,o)=>s+Number(o.amount),0)),inv.currency);};
Agent.openInvoicePayment=function(id){this.selectedInvoiceId=id;this.navigate('payment');};
Agent.renderPayment=function(){const inv=this.state.ops.find(o=>o.id===this.selectedInvoiceId&&o.kind==='sale');if(!inv)return '<div class="panel">الفاتورة غير موجودة</div>';
 const balance=this.invoiceRemaining(inv);return `<div class="hero"><h2>تسجيل دفعة على فاتورة</h2><p>${this.escape(inv.localNumber)} · ${this.escape(this.state.accounts.find(a=>a.id===inv.accountId)?.name||'عميل')}</p></div>
  <div class="panel"><div class="money-total"><span>المتبقي</span><b>${this.money(balance,inv.currency)} ${inv.currency}</b></div>
  <label class="label">المبلغ المقبوض</label><input type="number" id="fieldPaymentAmount" min="0.01" max="${balance}" step="any" class="field ltr" value="${balance}">
  <label class="label">البيان</label><input id="fieldPaymentNote" class="field" value="دفعة مرتبطة بالفاتورة ${this.escape(inv.localNumber)}">
  <p class="note-safe">ستُسجل الدفعة كسند قبض مستقل مرتبط بهذه الفاتورة، ويظهر في الحساب الرئيسي بعد المزامنة، دون تسجيلها مرتين.</p>
  <button class="primary" onclick="Agent.saveInvoicePayment()">✓ حفظ الدفعة</button></div>`;};
Agent.saveInvoicePayment=async function(){if(this.busy)return;this.busy=true;
 try{const inv=this.state.ops.find(o=>o.id===this.selectedInvoiceId&&o.kind==='sale');if(!inv||!inv.accountId)throw Error('لا يمكن تسجيل دفعة دون عميل مرتبط بالفاتورة');
  if(!await this.active())throw Error('الترخيص غير مفعل');const remaining=this.invoiceRemaining(inv);const amount=FieldProtocol.money(document.getElementById('fieldPaymentAmount').value,inv.currency);
  if(amount<=0||amount>remaining)throw Error('الدفعة غير صحيحة أو تتجاوز الرصيد المتبقي');
  const op={id:'op_'+FieldProtocol.uuid(),kind:'receipt',companyId:this.state.companyId,agentId:this.state.agentId,warehouseId:this.state.warehouseId,
   localNumber:'V-'+(this.state.ops.length+1),date:new Date().toISOString(),currency:inv.currency,exchangeRate:inv.exchangeRate,
   accountId:inv.accountId,amount,linkedInvoiceOpId:inv.id,note:String(document.getElementById('fieldPaymentNote')?.value||'').slice(0,200)};
  FieldProtocol.validateOps([op],this.state.agentId,this.state.companyId,this.state.warehouseId,this.state.items,this.state.accounts);
  await this.appendOperation(op);this.stack=['home','ops'];await this.show('ops');this.toast('تم حفظ سند القبض وربطه بالفاتورة');
 }catch(e){this.toast(e.message)}finally{this.busy=false;}};
Agent.renderPrinter=function(){const p=this.printerInfo;return `<div class="hero"><h2>الطابعة الحرارية</h2><p>اقتران واتصال مباشر من داخل تطبيق المندوب عبر Bluetooth Classic / SPP.</p></div>
  <div class="panel"><h3>حالة الاتصال</h3><div class="note-safe" id="nativePrinterStatus">${this.escape(p.message||'لم يتم الاتصال')}</div>
  <button class="primary" onclick="Agent.pairPrinter()">🔍 البحث والاقتران بطابعة جديدة</button>
  <button class="secondary" onclick="Agent.choosePrinter()">🖨 اختيار طابعة مقترنة</button>
  <button class="secondary" onclick="Agent.connectPrinter()">↻ إعادة الاتصال بالطابعة المحفوظة</button>
  <button class="secondary" onclick="Agent.disconnectPrinter()">قطع الاتصال</button></div>
  <div class="panel"><h3>إعدادات ورق الطباعة</h3>
  <label class="label">عرض الورق</label><select id="agentPrintWidth" class="field" onchange="Agent.updatePrinterWidth(this.value)"><option value="80" ${this.state.printerWidth!==58?'selected':''}>80 مم</option><option value="58" ${this.state.printerWidth===58?'selected':''}>58 مم</option></select>
  <p class="form-help">تستخدم الفواتير صورة نقطية لإظهار العربية والأرقام بصورة متوافقة مع معظم الطابعات الحرارية، ويجب اختبارها على الطابعة الفعلية.</p></div>`;};
Agent.renderSettings=function(){return `<div class="hero"><h2>الضبط</h2><p>إعدادات المندوب وإدارة الاتصال والطباعة — دون صلاحيات إدارة أرباح الشركة.</p></div>
 <section class="panel"><h3>معلومات التفعيل</h3><div class="itemrow"><b>المندوب</b><p class="tiny">${this.escape(this.state.agentName)}</p></div><div class="itemrow"><b>السيارة</b><p class="tiny">${this.escape(this.state.vehicleName)}</p></div><div class="itemrow"><b>الجهاز</b><p class="tiny ltr">${this.escape(this.state.deviceId)}</p></div><p class="form-help">إصدار المندوب 1.2.8. لا يمكن تغيير الشركة أو مستودع السيارة من تطبيق المندوب. التعديل يأتي بملف تجهيز معتمد من الإدارة.</p></section>
 <section class="panel"><h3>إعدادات الطباعة</h3><button class="primary" onclick="Agent.navigate('printer')">🖨 إعداد البلوتوث والطابعة</button></section>
 <section class="panel"><h3>المزامنة والنسخ</h3><button class="secondary" onclick="Agent.navigate('sync')">⇄ إرسال واستقبال العمليات</button><button class="secondary" onclick="Agent.exportOutbox()" ${this.pending.length?'':'disabled'}>تصدير العمليات غير المُزامنة</button></section>`;};
Agent.pairPrinter=function(){if(window.AndroidPrinter?.pairPrinter)window.AndroidPrinter.pairPrinter();else this.toast('الاقتران المباشر متاح داخل APK فقط');};
Agent.connectPrinter=function(){if(window.AndroidPrinter?.connectSaved)window.AndroidPrinter.connectSaved();else this.toast('يتطلب الاتصال نسخة أندرويد');};
Agent.disconnectPrinter=function(){if(window.AndroidPrinter?.disconnect)window.AndroidPrinter.disconnect();};
Agent.updatePrinterWidth=async function(value){const old=this.state.printerWidth;this.state.printerWidth=Number(value)===58?58:80;
 try{await this.save();this.toast('تم حفظ عرض ورق الطباعة')}catch(e){this.state.printerWidth=old;this.toast('لم تحفظ إعدادات الطباعة');}};
Agent.printOp=async function(id){this.printingNow=true;this.toast('جارٍ تجهيز أمر الطباعة...');return originalPrint(id);};
window.__nativePrinterEvent=function(detail,message){const event=typeof detail==='object'&&detail!==null?detail:{state:String(detail||''),message:String(message||'')};
 Agent.printerInfo=event;
 const x=document.getElementById('nativePrinterStatus');if(x)x.textContent=event.message||event.state;
 if(event.state==='printed'||event.state==='connected'||event.state==='error'||event.state==='disconnected')Agent.toast(event.message||event.state);
};
const previousShow=Agent.show.bind(Agent);
Agent.show=async function(route){
 // Original renderer still handles activation, provisioning, and sync; specialized screens are rendered here.
 if(route==='printer'||route==='settings'||route==='payment'){
  this.screen=route;
  if(!this.ready()||!await this.active()){await previousShow('home');return;}
  const element=document.getElementById('screen');element.innerHTML=route==='printer'?this.renderPrinter():route==='settings'?this.renderSettings():this.renderPayment();
  if(route==='printer')try{window.AndroidPrinter?.getStatus?.();}catch(_){}
 }else await previousShow(route);
 const active=this.ready()&&await this.active();const back=document.getElementById('agentBack');
 back?.classList.toggle('hide',!active||this.stack.length<2);
 const header=document.getElementById('agentScreenTitle');if(header)header.textContent=this.screen==='home'?'المحاسب التقني':({invoice:'الفاتورة',ops:'الفواتير والسندات',sync:'المزامنة',voucher:'سند مالي',printer:'الطابعة',settings:'الضبط',stock:'مستودع السيارة',payment:'تسجيل دفعة'})[this.screen]||'المحاسب التقني';
 const sub=document.getElementById('agentScreenSubtitle');if(sub)sub.textContent=active?'نسخة المندوب · '+this.state.companyName:'نسخة المندوب · تطبيق التوزيع';
 const vehicle=document.getElementById('agentVehicleHeader');if(vehicle)vehicle.textContent=this.state.vehicleName||'جهاز المندوب';
 document.getElementById('bottom')?.classList.toggle('hide',!active);
 document.querySelectorAll('.bottom button').forEach(b=>b.classList.toggle('active',b.id==='nav-'+this.screen));
 if(this.screen==='invoice')this.paintUnits();
};
// Activate setup after the baseline app's initialization, preserving the IndexedDB namespace.
})();
