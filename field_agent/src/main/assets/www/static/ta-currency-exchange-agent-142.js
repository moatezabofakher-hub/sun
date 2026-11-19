/* Tiqany Acc employee currency exchange v142: signed append-only operation. */
(function(){
'use strict';
const A=typeof Agent!=='undefined'?Agent:window.Agent, E=window.TiqanyCurrencyExchangeCore;
if(!A||!E)return;
const esc=v=>A.escape(String(v??''));
const allowed=()=>[...new Set((Array.isArray(A.state?.allowedCurrencies)?A.state.allowedCurrencies:['USD','SYP']).filter(v=>/^[A-Z]{3}$/.test(v)))];
const ops=()=>A.state?.ops||[];
const fmt=(n,c)=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:c==='SYP'?0:2})+' '+c;
function sources(){
 const base=A.cashSummary();
 return {SYP:Number(base.syp)||0,USD:Number(base.usd)||0,...(base.otherCurrencies||{})};
}


const localRates=()=>A.state?.currencyExchangeRatesSyp||{};
const canEditRate=()=>A.can?.('fxSharedRate')===true;
const validatedRate=(n)=>Number.isFinite(Number(n))&&Number(n)>0&&Number(n)<1e12;
function rateOperation(changes){
 return {id:'op_'+FieldProtocol.uuid(),kind:'fx_rate_change',date:new Date().toISOString(),
  agentId:A.state.agentId,companyId:A.state.companyId,warehouseId:A.state.warehouseId,
  currency:'SYP',exchangeRate:Number(A.state.exchangeRate),
  rates:changes,localNumber:A.nextLocalNumber('XR')};
}
function storeFxChanges(changes){
 const out={...localRates()};
 for(const [currency,change] of Object.entries(changes))out[currency]={...(out[currency]||{}),...change};
 return out;
}
A.renderFxRates=function(){
 const list=allowed().filter(c=>c!=='SYP'),current=localRates(),edit=canEditRate();
 const generic=list.map(c=>{
  const value=c==='USD'?Number(this.state.exchangeRate)||0:Number(this.state.currencyRatesSyp?.[c])||0;
  return '<div style="border:1px solid #a4d2b5;background:#edfff5;border-radius:12px;padding:12px;margin:8px 0">'+
   '<strong>سعر صرف '+esc(c)+' مقابل الليرة السورية</strong>'+
   '<div style="font-size:20px;font-weight:900;color:#065f46">'+(value>0?value.toLocaleString('en-US')+' ل.س':'لم يحدده المدير بعد')+'</div></div>';
 }).join('');
 return '<div class="hero"><h2>أسعار صرف العملات</h2><p>سعر الصرف العام لكل عملة مقابل الليرة السورية. يُحدَّث بواسطة المدير عند المزامنة، والدولار هو سعر الفواتير المعتمد.</p></div>'+
 '<section class="panel">'+generic+'</section>'+
 '<div class="hero"><h2>أسعار التصريف</h2><p>أسعار شراء ومبيع العملات المخصصة لعمليات التصريف فقط.</p></div>'+
 '<section class="panel">'+
 (!edit?'<p class="tiny" style="color:#9f1239">تعديل هذه الأسعار مقفل بصلاحيات المدير؛ يمكنك الاطلاع عليها فقط.</p>':
 '<p class="tiny">يمكنك تعديل الأسعار وسيُرسل التعديل إلى المدير عند المزامنة التالية.</p>')+
 list.map(c=>'<div style="padding:12px;margin-bottom:12px;border:1px solid #9fbad0;border-radius:12px;background:#f1f7ff">'+
 '<strong>'+esc(c)+' مقابل الليرة السورية</strong>'+
 '<label class="label">سعر الشراء</label><input id="agentFxBuy_'+c+'" class="field" type="number" min="0" step="any" '+(edit?'':'readonly ')+'value="'+esc(current[c]?.buy??'')+'">'+
 '<label class="label">سعر المبيع</label><input id="agentFxSell_'+c+'" class="field" type="number" min="0" step="any" '+(edit?'':'readonly ')+'value="'+esc(current[c]?.sell??'')+'"></div>').join('')+
 (edit?'<button class="primary" onclick="Agent.saveFxRates()">حفظ وإرسال الأسعار في المزامنة</button>':'')+
 '<button class="secondary" onclick="Agent.goBack()">رجوع</button></section>';
};
A.saveFxRates=async function(){
 if(this.busy||!this.requireRight('fxSharedRate'))return;
 const changes={};
 try{
  for(const c of allowed().filter(c=>c!=='SYP')){
   const b=(document.getElementById('agentFxBuy_'+c)?.value||'').trim();
   const t=(document.getElementById('agentFxSell_'+c)?.value||'').trim();
   const prev=localRates()[c]||{},change={};
   if(b&&(!validatedRate(b)))throw Error('سعر الشراء غير صالح: '+c);
   if(t&&(!validatedRate(t)))throw Error('سعر المبيع غير صالح: '+c);
   if(b&&Number(b)!==Number(prev.buy))change.buy=Number(b);
   if(t&&Number(t)!==Number(prev.sell))change.sell=Number(t);
   if(Object.keys(change).length)changes[c]=change;
  }
  if(!Object.keys(changes).length){this.toast('لم يتم تغيير أي سعر');return;}
  const op=rateOperation(changes);
  FieldProtocol.validateOps([op],this.state.agentId,this.state.companyId,this.state.warehouseId,this.state.items,this.state.accounts);
  this.busy=true;
  const priorOps=this.state.ops.slice(),priorRates=this.state.currencyExchangeRatesSyp;
  this.state.currencyExchangeRatesSyp=storeFxChanges(changes);this.state.ops.push(op);
  try{await this.save();}
  catch(err){this.state.currencyExchangeRatesSyp=priorRates;this.state.ops=priorOps;throw err;}
  this.toast('حُفظت أسعار الصرف وسيُرحّل تعديلها عند المزامنة');await this.show('home');
 }catch(e){this.toast('تعذر حفظ الأسعار: '+e.message);}
 finally{this.busy=false;}
};

A.renderCurrencyExchange=function(){
 const choices=allowed();
 if(choices.length<2)return '<div class="panel">يجب تفعيل عملتين على الأقل في التطبيق الرئيسي.</div>';
 const sel=id=>'<select id="'+id+'" class="field">'+choices.map(c=>'<option value="'+c+'">'+c+'</option>').join('')+'</select>';
 return '<div class="hero"><h2>تصريف عملة</h2><p>يمكن تعديل سعر الصرف من داخل العملية إذا سمح المدير.</p></div>'+
 '<section class="panel">'+
 '<label class="label">العملة المدفوعة</label>'+sel('agentFxFrom')+
 '<label class="label">العملة المشتراة</label>'+sel('agentFxTo')+
 '<label class="label">المبلغ المدفوع</label><input id="agentFxSpent" class="field" type="number" min="0" step="any">'+
 '<div id="agentFxRatePane" data-changed="0" style="padding:12px;background:#ebf4ff;border:1px solid #a4c5ea;border-radius:12px">'+
 '<div id="agentFxSellRateBlock"><label class="label" id="agentFxSellRateLabel">سعر مبيع العملة المدفوعة</label>'+
 '<input id="agentFxSellRate" class="field" type="number" min="0.000001" step="any" inputmode="decimal" '+(canEditRate()?'':'readonly')+'></div>'+
 '<div id="agentFxBuyRateBlock"><label class="label" id="agentFxBuyRateLabel">سعر شراء العملة المستلمة</label>'+
 '<input id="agentFxBuyRate" class="field" type="number" min="0.000001" step="any" inputmode="decimal" '+(canEditRate()?'':'readonly')+'></div>'+
 '<p class="tiny">'+(canEditRate()?'يمكن تغيير السعر، وسيُحفظ ويرحّل التعديل مع العملية.':'السعر معتمد من المدير، وتعديله غير مسموح.')+'</p></div>'+
 '<label class="label">المبلغ المستلم</label><input id="agentFxReceived" class="field" type="number" min="0" step="any" readonly>'+
 '<div id="agentFxSypContainer"><label class="label">القيمة المكافئة بالليرة</label><input id="agentFxSyp" class="field" type="number" min="0" step="any" readonly></div>'+
 '<p class="tiny" id="agentFxRateHint"></p>'+
 '<label class="label">بيان اختياري</label><input id="agentFxNote" maxlength="200" class="field">'+
 '<p class="tiny" id="agentFxCashHint"></p>'+
 '<button type="button" class="primary" onclick="Agent.saveCurrencyExchange()">حفظ عملية التصريف</button>'+
 '<button type="button" class="secondary" onclick="Agent.goBack()">إلغاء</button></section>';
};
A.paintCurrencyExchange=function(){
 const el=id=>document.getElementById(id);
 const from=el('agentFxFrom'),to=el('agentFxTo');
 if(!from||!to)return;
 if(from.options.length>1&&from.value===to.value)to.selectedIndex=1;
 const paid=el('agentFxSpent'),received=el('agentFxReceived'),equiv=el('agentFxSyp');
 const sell=el('agentFxSellRate'),buy=el('agentFxBuyRate'),pane=el('agentFxRatePane'),hint=el('agentFxRateHint');
 const refresh=()=>{
  el('agentFxSellRateBlock').hidden=from.value==='SYP';
  el('agentFxBuyRateBlock').hidden=to.value==='SYP';
  el('agentFxSellRateLabel').textContent='سعر مبيع '+from.value+' مقابل الليرة';
  el('agentFxBuyRateLabel').textContent='سعر شراء '+to.value+' مقابل الليرة';
  sell.value=from.value==='SYP'?'':localRates()[from.value]?.sell??'';
  buy.value=to.value==='SYP'?'':localRates()[to.value]?.buy??'';
  pane.dataset.changed='0';
 };
 const quote=()=>{
  const f=from.value,t=to.value,rateSet={...localRates()};
  if(f!=='SYP')rateSet[f]={...(rateSet[f]||{}),sell:Number(sell.value)};
  if(t!=='SYP')rateSet[t]={...(rateSet[t]||{}),buy:Number(buy.value)};
  try{
   const q=E.quote(f,t,Number(paid.value),rateSet);
   received.value=q.toAmount;equiv.value=q.equivalentSyp;
   hint.textContent='وفق سعر الصرف: '+fmt(q.toAmount,t)+' مقابل '+fmt(q.fromAmount,f);
  }catch(err){
   received.value='';equiv.value='';
   hint.textContent='أدخل مبلغاً وسعر صرف صالحاً. لا يمكن تجاوز السعر المعتمد دون الصلاحية.';
  }
  el('agentFxSypContainer').hidden=f==='SYP'||t==='SYP';
  el('agentFxCashHint').textContent='رصيد الصندوق المتاح: '+fmt(Number(sources()[f]||0),f);
 };
 from.addEventListener('change',()=>{refresh();quote();});
 to.addEventListener('change',()=>{refresh();quote();});
 paid.addEventListener('input',quote);
 if(canEditRate()){
  for(const input of [sell,buy])input.addEventListener('input',()=>{pane.dataset.changed='1';quote();});
 }
 refresh();quote();
};
A.saveCurrencyExchange=async function(){
 if(this.busy)return;
 this.busy=true;
 try{
  if(!await this.active())throw Error('يجب تفعيل تطبيق موظف البيع');
  const val=id=>document.getElementById(id)?.value;
  const fromCurrency=val('agentFxFrom'),toCurrency=val('agentFxTo');
  const fromAmount=Number(val('agentFxSpent')),toAmount=Number(val('agentFxReceived'));
  const equivalentSyp=fromCurrency==='SYP'?fromAmount:toCurrency==='SYP'?toAmount:Number(val('agentFxSyp'));
  const changed=document.getElementById('agentFxRatePane')?.dataset.changed==='1';
  if(changed&&!canEditRate())throw Error('ليس لديك صلاحية تعديل سعر الصرف');
  const changes={},set={...localRates()};
  if(changed){
   if(fromCurrency!=='SYP'){
    const sell=Number(val('agentFxSellRate'));if(!validatedRate(sell))throw Error('سعر مبيع غير صالح');
    changes[fromCurrency]={...(changes[fromCurrency]||{}),sell};
    set[fromCurrency]={...(set[fromCurrency]||{}),sell};
   }
   if(toCurrency!=='SYP'){
    const buy=Number(val('agentFxBuyRate'));if(!validatedRate(buy))throw Error('سعر شراء غير صالح');
    changes[toCurrency]={...(changes[toCurrency]||{}),buy};
    set[toCurrency]={...(set[toCurrency]||{}),buy};
   }
  }
  const q=E.quote(fromCurrency,toCurrency,fromAmount,set);
  if(Math.abs(q.toAmount-toAmount)>1/E.scale(toCurrency)+1e-6||Math.abs(q.equivalentSyp-equivalentSyp)>1)
    throw Error('القيم لا تطابق سعر الصرف المسموح');
  const event=E.prepare({id:'op_'+FieldProtocol.uuid(),date:new Date().toISOString(),
   fromCurrency,toCurrency,fromAmount,toAmount,equivalentSyp,agentId:this.state.agentId,source:'agent',note:val('agentFxNote')||''},allowed());
  if(event.fromAmount>Number(sources()[event.fromCurrency]||0)+1e-6)throw Error('رصيد صندوق العملة المدفوعة غير كافٍ');
  const opsToStore=[];
  if(changed)opsToStore.push(rateOperation(changes));
  const op={...event,kind:'currency_exchange',companyId:this.state.companyId,warehouseId:this.state.warehouseId,
    currency:event.fromCurrency,exchangeRate:Number(this.state.exchangeRate),localNumber:this.nextLocalNumber('FX'),
    fxRateChanged:changed,fxRatesUsed:{fromSell:Number(val('agentFxSellRate'))||null,toBuy:Number(val('agentFxBuyRate'))||null}};
  opsToStore.push(op);
  FieldProtocol.validateOps(opsToStore,this.state.agentId,this.state.companyId,this.state.warehouseId,this.state.items,this.state.accounts);
  const priorOps=this.state.ops.slice(),priorRates=this.state.currencyExchangeRatesSyp;
  if(changed)this.state.currencyExchangeRatesSyp=storeFxChanges(changes);
  this.state.ops.push(...opsToStore);
  try{await this.save();}
  catch(err){this.state.currencyExchangeRatesSyp=priorRates;this.state.ops=priorOps;throw err;}
  this.toast('تم حفظ التصريف. سيتم إرسال العملية'+(changed?' وأسعارها':'')+' للمدير عند المزامنة');
  this.stack=['home','invoices'];await this.show('invoices');
 }catch(error){this.toast('تعذر حفظ التصريف: '+error.message);}
 finally{this.busy=false;}
};

function foreignSummary(entries, codes) {
 const fields=E.foreignTotals(entries,codes).map(t=>{
  const amount=(label,units)=>'<div><span>'+label+'</span><bdi dir="ltr">'+E.formatForeignUnits(units,t.code)+' '+esc(t.code)+'</bdi></div>';
  return '<section class="ta-fx-summary-card" data-fx-summary="'+esc(t.code)+'"><strong>'+esc(t.code)+'</strong>'+
   amount('إجمالي الشراء',t.bought)+amount('إجمالي المبيع',t.sold)+amount('المبلغ المتاح',t.sold-t.bought)+'</section>';
 }).join('');
 return '<div class="ta-fx-summary"><h4>ملخص تصريف العملات الأجنبية</h4>'+
  (fields||'<p>لا توجد عملات أجنبية لعرضها</p>')+'</div>';
}

A.currencyExchangeList=function(){
 const entries=ops().filter(o=>o.kind==='currency_exchange').slice().reverse();
 return '<div class="hero"><h2>عمليات التصريف</h2><p>سجل تصريف العملات من صندوقك.</p></div>'+
 foreignSummary(entries,[...allowed(),...(A.state.addedCurrencies||[]).map(c=>c.code)])+
 '<section class="panel"><button class="primary" onclick="Agent.navigate(\'currency_exchange\')">＋ تصريف عملة</button>'+
 (entries.length?entries.map(o=>'<div class="itemrow"><b>'+esc(o.localNumber||o.id)+'</b>'+
 '<span class="pill '+((A.state.knownIds||[]).includes(o.id)?'':'wait')+'">'+((A.state.knownIds||[]).includes(o.id)?'تمت المزامنة':'بانتظار المزامنة')+'</span>'+
 '<p class="tiny">'+esc(String(o.date).slice(0,16).replace('T',' '))+'</p>'+
 '<div class="itemhead"><span class="agent-cash-outflow">−'+fmt(o.fromAmount,o.fromCurrency)+'</span><span class="agent-cash-inflow">+'+fmt(o.toAmount,o.toCurrency)+'</span></div></div>').join(''):'<p class="muted">لا توجد عمليات تصريف</p>')+
 '<button class="secondary" onclick="Agent.goBack()">رجوع</button></section>';
};
const priorHome=A.renderHome;
A.renderHome=function(...args){return priorHome.apply(this,args).replace('</div>', '</div>')+
 '<div class="grid"><button type="button" class="tile" onclick="Agent.navigate(\'currency_exchange\')" style="background:linear-gradient(135deg,#dffdf3,#c2eeff);color:#064e3b;border:2px solid #059669"><span class="glyph"><img src="static/ta-fx-exchange-146.svg" alt="" width="70" height="70" style="width:64px;height:64px;max-width:100%;object-fit:contain"></span><strong>تصريف عملة</strong><small>شراء وبيع العملات</small></button>'+ 
 '<button type="button" class="tile" onclick="Agent.navigate(\'fx_rates\')" style="background:linear-gradient(135deg,#047857,#065f46)!important;color:#fff!important;border:2px solid #064e3b!important"><span class="glyph"><img src="static/ta-fx-rates-146.svg" alt="" width="70" height="70" style="width:64px;height:64px;max-width:100%;object-fit:contain"></span><strong>سعر الصرف</strong><small>شراء ومبيع مقابل الليرة</small></button></div>';};
const priorInvoices=A.renderInvoices;
if(typeof priorInvoices==='function')A.renderInvoices=function(...args){
 return priorInvoices.apply(this,args).replace('<section class="panel">','<div class="grid" style="margin-bottom:12px"><button class="tile" onclick="Agent.navigate(\'currency_exchange_list\')"><span class="glyph">💱</span><strong>عمليات التصريف</strong></button></div><section class="panel">');
};
const priorShow=A.show;
A.show=async function(route,...args){
 if(route==='currency_exchange'||route==='currency_exchange_list'||route==='fx_rates'){
  if(!this.ready()||!await this.active())return priorShow.call(this,'home',...args);
  const old=this.screen;this.screen=route;
  document.getElementById('screen').innerHTML=route==='currency_exchange'?this.renderCurrencyExchange():route==='fx_rates'?this.renderFxRates():this.currencyExchangeList();
  document.getElementById('agentScreenTitle').textContent=route==='currency_exchange'?'تصريف عملة':route==='fx_rates'?'سعر الصرف':'عمليات التصريف';
  document.getElementById('agentBack')?.classList.remove('hide');
  if(route==='currency_exchange')this.paintCurrencyExchange();
  if(old!==route){const view=document.getElementById('screen');if(view)view.scrollTop=0;}
  return;
 }
 return priorShow.call(this,route,...args);
};
window.TiqanyFxAgent={allowed,sources};
})();