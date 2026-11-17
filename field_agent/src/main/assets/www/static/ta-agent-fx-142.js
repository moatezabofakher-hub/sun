/* Tiqany Acc v142: employee cash exchange form and offline pending postings.
   Signed employee ops are validated and booked by the manager before acknowledgement. */
(function(root){
'use strict';
if(typeof document==='undefined'||typeof Agent==='undefined')return;
const A=Agent;
const esc=v=>A.escape(v);
const cents=c=>c==='SYP'?0:2;
const precision=(v,c)=>Number(Number(v).toFixed(cents(c)));
const label=c=>c==='USD'?'دولار أمريكي USD':'ليرة سورية SYP';
let busy=false;
const E={
 currencies(){
   const a=Array.isArray(A.state?.enabledCurrencies)?A.state.enabledCurrencies:['USD','SYP'];
   return [...new Set(a)].filter(c=>['USD','SYP'].includes(c));
 },
 balance(c){const box=A.cashSummary?.()||{};return c==='USD'?Number(box.usd||0):Number(box.syp||0);},
 form(){
   const cs=this.currencies();
   if(cs.length<2)return '<div class="hero"><h2>تصريف عملة</h2></div><div class="panel"><p>يجب تفعيل الدولار والليرة في إعدادات المدير قبل إجراء التصريف.</p><button class="secondary" onclick="Agent.show(\'home\')">رجوع</button></div>';
   const options=cs.map(c=>'<option value="'+c+'">'+label(c)+'</option>').join('');
   return '<div class="hero"><h2>تصريف عملة $ €</h2><p>شراء عملة من صندوق العملة الأخرى</p></div>'+
   '<div class="panel"><label class="label">العملة التي ندفع منها</label><select id="agentFxFrom" class="field">'+options+'</select>'+
   '<label class="label">العملة التي نشتريها</label><select id="agentFxTo" class="field">'+options+'</select>'+
   '<label class="label">المبلغ المدفوع</label><input id="agentFxPaid" class="field" type="number" step="any" inputmode="decimal" min="0" placeholder="المبلغ المخصوم">'+
   '<label class="label">المبلغ المشترى</label><input id="agentFxReceived" class="field" type="number" step="any" inputmode="decimal" min="0" placeholder="المبلغ المضاف">'+
   '<label class="label">بيان العملية</label><input id="agentFxNote" class="field" maxlength="200" placeholder="اختياري">'+
   '<div id="agentFxPreview" class="panel" style="background:#eaf5ff;margin-top:10px;font-weight:bold"></div>'+
   '<p class="tiny">يُحتسب ربح التصريف بسعر التكلفة المسجل لدى المدير عند المزامنة، دون اعتباره إيراداً بمجرد شراء العملة.</p>'+
   '<div class="grid"><button id="agentFxSave" class="primary" onclick="AgentFxExchange.save()">حفظ التصريف</button>'+
   '<button class="secondary" onclick="Agent.show(\'home\')">رجوع</button></div></div>';
 },
 preview(){
  const a=document.getElementById('agentFxFrom'),b=document.getElementById('agentFxTo'),paid=Number(document.getElementById('agentFxPaid')?.value),got=Number(document.getElementById('agentFxReceived')?.value);
  const box=document.getElementById('agentFxPreview');if(!box||!a||!b)return;
  let text='الرصيد المتاح: '+this.balance(a.value).toLocaleString('en-US')+' '+a.value;
  if(a.value===b.value)text+=' | اختر عملتين مختلفتين';
  if(paid>0&&got>0)text+=' | معدل التصريف: '+(paid/got).toLocaleString('en-US',{maximumFractionDigits:6})+' '+a.value+' لكل '+b.value;
  if(paid>this.balance(a.value))text+=' | الرصيد لا يكفي';
  box.textContent=text;
 },
 async save(){
  if(busy)return;
  busy=true;const btn=document.getElementById('agentFxSave');if(btn)btn.disabled=true;
  try{
   if(!await A.active())throw Error('يجب تفعيل التطبيق أولاً');
   const from=document.getElementById('agentFxFrom')?.value,to=document.getElementById('agentFxTo')?.value;
   const paid=Number(document.getElementById('agentFxPaid')?.value),got=Number(document.getElementById('agentFxReceived')?.value);
   if(!this.currencies().includes(from)||!this.currencies().includes(to)||from===to)throw Error('العملتان غير مفعّلتين أو متطابقتان');
   if(!Number.isFinite(paid)||!Number.isFinite(got)||paid<=0||got<=0||paid>1e12||got>1e12)throw Error('مبالغ التصريف غير صالحة');
   if(precision(paid,from)!==paid||precision(got,to)!==got)throw Error('عدد المنازل العشرية غير صالح');
   if(this.balance(from)+1e-7<paid)throw Error('الرصيد في الصندوق غير كافٍ');
   const previousSequence=A.state.localSequence,previousOps=A.state.ops.slice();
   const op={id:'op_'+FieldProtocol.uuid(),kind:'currency_exchange',companyId:A.state.companyId,agentId:A.state.agentId,
     warehouseId:A.state.warehouseId,localNumber:A.nextLocalNumber('FX'),date:new Date().toISOString(),
     currency:from,fromCurrency:from,toCurrency:to,fromAmount:paid,toAmount:got,
     exchangeRate:Number(A.state.exchangeRate)||15000,note:String(document.getElementById('agentFxNote')?.value||'').trim().slice(0,200)};
   try{
    const checked=FieldProtocol.validateOps([op],A.state.agentId,A.state.companyId,A.state.warehouseId,A.state.items,A.state.accounts);
    A.state.ops.push(checked[0]);await A.save();
   }catch(err){A.state.ops=previousOps;A.state.localSequence=previousSequence;throw err;}
   await A.show('home');A.toast('تم تسجيل التصريف؛ ستُرحّل الحركة إلى المدير عند المزامنة');
  }catch(err){A.toast('تعذر حفظ التصريف: '+err.message);}
  finally{busy=false;if(btn?.isConnected)btn.disabled=false;}
 }
};
root.AgentFxExchange=E;
const oldShow=A.show;
A.show=async function(where,...args){
 if(where==='currency_exchange'){
  if(!await this.active())return oldShow.call(this,'home',...args);
  await oldShow.call(this,'home',...args);
  this.screen=where;
  document.getElementById('screen').innerHTML=E.form();
  const cs=E.currencies(),from=document.getElementById('agentFxFrom'),to=document.getElementById('agentFxTo');
  if(from&&to){from.value=cs.includes('SYP')?'SYP':cs[0];to.value=cs.find(c=>c!==from.value)||cs[0];}
  for(const id of ['agentFxFrom','agentFxTo','agentFxPaid','agentFxReceived'])document.getElementById(id)?.addEventListener('input',()=>E.preview());
  E.preview();
  return;
 }
 const r=await oldShow.call(this,where,...args);
 if(where==='home'&&this.ready()){
  const grid=document.querySelector('#screen .grid');
  if(grid&&!grid.querySelector('.ta-agent-fx-tile'))
   grid.insertAdjacentHTML('beforeend','<button type="button" class="tile ta-agent-fx-tile" onclick="Agent.show(\'currency_exchange\')"><span class="glyph" aria-hidden="true">$ €</span><strong>تصريف عملة</strong><small>شراء وبيع العملات بين الصناديق</small></button>');
 }
 return r;
};
const oldCash=A.cashSummary;
if(typeof oldCash==='function')A.cashSummary=function(...args){
 const box=oldCash.apply(this,args);
 const accepted=new Set(this.state.snapshotIds||[]);
 const rows=(this.state.ops||[]).filter(op=>op.kind==='currency_exchange');
 for(const op of rows){
   const amount=Number(op.fromAmount),receive=Number(op.toAmount);
   if(!(amount>0)||!(receive>0))continue;
   if(!accepted.has(op.id)){
    if(op.fromCurrency==='SYP')box.syp-=amount;else if(op.fromCurrency==='USD')box.usd-=amount;
    if(op.toCurrency==='SYP')box.syp+=receive;else if(op.toCurrency==='USD')box.usd+=receive;
   }
   box.movements.push({id:op.id+':out',date:op.date,currency:op.fromCurrency,amount:-amount,desc:'تصريف عملة — مدفوع',pending:!accepted.has(op.id)});
   box.movements.push({id:op.id+':in',date:op.date,currency:op.toCurrency,amount:receive,desc:'تصريف عملة — مستلم',pending:!accepted.has(op.id)});
 }
 box.syp=Math.round(box.syp);box.usd=precision(box.usd,'USD');
 box.movements.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 return box;
};
})(typeof globalThis==='object'?globalThis:this);
