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


const localRates=()=>A.state.currencyExchangeRatesSyp||{};
A.renderFxRates=function(){
 const list=allowed().filter(c=>c!=='SYP'),current=localRates();
 return '<div class="hero"><h2>سعر الصرف</h2><p>أسعار الشراء والمبيع مقابل الليرة السورية، تُستخدم في عمليات التصريف الجديدة على هذا الجهاز.</p></div>'+
 '<section class="panel">'+list.map(c=>'<div style="padding:12px;margin-bottom:12px;border:1px solid #9fbad0;border-radius:12px;background:#f1f7ff">'+
 '<strong>'+esc(c)+' مقابل الليرة السورية</strong>'+
 '<label class="label">سعر الشراء (نشتري '+esc(c)+' بالليرة)</label><input id="agentFxBuy_'+c+'" class="field" type="number" min="0" step="any" value="'+esc(current[c]?.buy??'')+'">'+
 '<label class="label">سعر المبيع (نبيع '+esc(c)+' ونقبض ليرة)</label><input id="agentFxSell_'+c+'" class="field" type="number" min="0" step="any" value="'+esc(current[c]?.sell??'')+'"></div>').join('')+
 '<button class="primary" onclick="Agent.saveFxRates()">حفظ أسعار الصرف</button><button class="secondary" onclick="Agent.goBack()">رجوع</button></section>';
};
A.saveFxRates=async function(){
 if(this.busy)return;
 const old=localRates(),next={...old};let count=0;
 try{
  for(const c of allowed().filter(c=>c!=='SYP')){
   const buyText=(document.getElementById('agentFxBuy_'+c)?.value||'').trim();
   const sellText=(document.getElementById('agentFxSell_'+c)?.value||'').trim();
   if(!buyText&&!sellText){delete next[c];continue;}
   const buy=Number(buyText),sell=Number(sellText);
   if(!Number.isFinite(buy)||!Number.isFinite(sell)||buy<=0||sell<=0||buy>=1e12||sell>=1e12)
    throw Error('أدخل سعر شراء ومبيع صالحين للعملة '+c);
   next[c]={buy,sell};count++;
  }
  if(!count)throw Error('أدخل أسعار عملة واحدة على الأقل');
  this.busy=true;this.state.currencyExchangeRatesSyp=next;
  try{await this.save();}
  catch(e){this.state.currencyExchangeRatesSyp=old;throw e;}
  this.toast('تم حفظ أسعار الصرف');await this.show('home');
 }catch(e){this.toast('تعذر حفظ الأسعار: '+e.message);}
 finally{this.busy=false;}
};

A.renderCurrencyExchange= function(){
 const choices=allowed();
 if(choices.length<2)return '<div class="panel">يجب تفعيل عملتين على الأقل في التطبيق الرئيسي.</div>';
 const sel=(id)=>'<select id="'+id+'" class="field">'+choices.map(c=>'<option value="'+c+'">'+c+'</option>').join('')+'</select>';
 return '<div class="hero"><h2>تصريف عملة</h2><p>شراء عملة من رصيد صندوق موظف البيع وتسجيل العملية للمزامنة مع الرئيسي.</p></div>'+
 '<section class="panel">'+
 '<label class="label">العملة المدفوعة</label>'+sel('agentFxFrom')+
 '<label class="label">العملة المشتراة</label>'+sel('agentFxTo')+
 '<label class="label">المبلغ المدفوع</label><input id="agentFxSpent" class="field" type="number" min="0" step="any">'+
 '<label class="label">المبلغ المستلم</label><input id="agentFxReceived" class="field" type="number" min="0" step="any">'+
 '<div id="agentFxSypContainer"><label class="label">القيمة المكافئة بالليرة</label><input id="agentFxSyp" class="field" type="number" min="0" step="any"></div>'+ 
 '<p class="tiny" id="agentFxRateHint"></p>'+
 '<label class="label">بيان اختياري</label><input id="agentFxNote" maxlength="200" class="field">'+
 '<p class="tiny" id="agentFxCashHint"></p>'+
 '<button type="button" class="primary" onclick="Agent.saveCurrencyExchange()">حفظ عملية التصريف</button>'+
 '<button type="button" class="secondary" onclick="Agent.goBack()">إلغاء</button></section>';
};
A.paintCurrencyExchange=function(){
 const from=document.getElementById('agentFxFrom'),to=document.getElementById('agentFxTo');
 if(!from||!to)return;
 const update=()=>{
  document.getElementById('agentFxSypContainer').hidden=from.value==='SYP'||to.value==='SYP';
  document.getElementById('agentFxCashHint').textContent='رصيد الصندوق المتاح: '+fmt(Number(sources()[from.value]||0),from.value);
 };
 if(from.options.length>1&&from.value===to.value)to.selectedIndex=1;
 const paid=document.getElementById('agentFxSpent'),received=document.getElementById('agentFxReceived'),equiv=document.getElementById('agentFxSyp');
 const hint=document.getElementById('agentFxRateHint');
 const quote=()=>{
  try{
   const fromAmount=Number(paid.value),fromCurrency=from.value,toCurrency=to.value;
   if(!(fromAmount>0)||fromCurrency===toCurrency)throw Error('غير مكتمل');
   const q=E.quote(fromCurrency,toCurrency,fromAmount,localRates());
   received.value=q.toAmount;equiv.value=q.equivalentSyp;
   received.readOnly=true;equiv.readOnly=true;
   hint.textContent='السعر المعتمد: '+fmt(q.toAmount,toCurrency)+' مقابل '+fmt(q.fromAmount,fromCurrency);
  }catch(e){
   received.readOnly=false;equiv.readOnly=false;
   hint.textContent='إن لم تضبط سعر الصرف لهذه العملات، أدخل المبلغ المستلم يدوياً.';
  }
  update();
 };
 from.addEventListener('change',quote);to.addEventListener('change',quote);paid.addEventListener('input',quote);quote();
};
A.saveCurrencyExchange=async function(){
 if(this.busy)return;
 this.busy=true;
 let op;
 try{
  if(!await this.active())throw Error('يجب تفعيل تطبيق موظف البيع');
  const val=id=>document.getElementById(id)?.value;
  const fromCurrency=val('agentFxFrom'),toCurrency=val('agentFxTo');
  const fromAmount=Number(val('agentFxSpent')),toAmount=Number(val('agentFxReceived'));
  const equivalentSyp=fromCurrency==='SYP'?fromAmount:toCurrency==='SYP'?toAmount:Number(val('agentFxSyp'));
  const event=E.prepare({id:'op_'+FieldProtocol.uuid(),date:new Date().toISOString(),
   fromCurrency,toCurrency,fromAmount,toAmount,equivalentSyp,agentId:this.state.agentId,source:'agent',note:val('agentFxNote')||''},allowed());
  if(event.fromAmount>Number(sources()[event.fromCurrency]||0)+1e-6)throw Error('رصيد صندوق العملة المدفوعة غير كافٍ');
  op={...event,kind:'currency_exchange',companyId:this.state.companyId,warehouseId:this.state.warehouseId,
    currency:event.fromCurrency,exchangeRate:Number(this.state.exchangeRate),localNumber:this.nextLocalNumber('FX')};
  FieldProtocol.validateOps([op],this.state.agentId,this.state.companyId,this.state.warehouseId,this.state.items,this.state.accounts);
  await this.appendOperation(op);
  this.toast('تم تسجيل التصريف محلياً وسيصل إشعار إلى الرئيسي بعد المزامنة');
  this.stack=['home','invoices'];await this.show('invoices');
 }catch(error){this.toast('تعذر حفظ التصريف: '+error.message);}
 finally{this.busy=false;}
};
A.currencyExchangeList=function(){
 const entries=ops().filter(o=>o.kind==='currency_exchange').slice().reverse();
 return '<div class="hero"><h2>عمليات التصريف</h2><p>سجل تصريف العملات من صندوقك.</p></div>'+
 '<section class="panel"><button class="primary" onclick="Agent.navigate(\'currency_exchange\')">＋ تصريف عملة</button>'+
 (entries.length?entries.map(o=>'<div class="itemrow"><b>'+esc(o.localNumber||o.id)+'</b>'+
 '<span class="pill '+((A.state.knownIds||[]).includes(o.id)?'':'wait')+'">'+((A.state.knownIds||[]).includes(o.id)?'تمت المزامنة':'بانتظار المزامنة')+'</span>'+
 '<p class="tiny">'+esc(String(o.date).slice(0,16).replace('T',' '))+'</p>'+
 '<div class="itemhead"><span class="agent-cash-outflow">−'+fmt(o.fromAmount,o.fromCurrency)+'</span><span class="agent-cash-inflow">+'+fmt(o.toAmount,o.toCurrency)+'</span></div></div>').join(''):'<p class="muted">لا توجد عمليات تصريف</p>')+
 '<button class="secondary" onclick="Agent.goBack()">رجوع</button></section>';
};
const priorHome=A.renderHome;
A.renderHome=function(...args){return priorHome.apply(this,args).replace('</div>', '</div>')+
 '<div class="grid"><button type="button" class="tile" onclick="Agent.navigate(\'currency_exchange\')" style="background:linear-gradient(135deg,#dffdf3,#c2eeff);color:#064e3b;border:2px solid #059669"><span class="glyph">💵 €</span><strong>تصريف عملة</strong><small>شراء وبيع العملات</small></button>'+ 
 '<button type="button" class="tile" onclick="Agent.navigate(\'fx_rates\')" style="background:linear-gradient(135deg,#dce9ff,#bad1ff);color:#163f81;border:2px solid #4976d5"><span class="glyph">💱</span><strong>سعر الصرف</strong><small>شراء ومبيع مقابل الليرة</small></button></div>';};
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