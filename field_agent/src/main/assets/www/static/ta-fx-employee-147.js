/* v3.5.147 — field employee currency buy/sell chooser, synchronized codes and quotes. */
(function(){
'use strict';
const A=typeof Agent!=='undefined'?Agent:window.Agent,E=window.TiqanyCurrencyExchangeCore;
if(!A||!E)return;
const esc=x=>A.escape(String(x??'')),fmt=(n,c)=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:c==='SYP'?0:2})+' '+(c==='SYP'?'ل.س':c);
const allowed=()=>[...new Set(['USD',...(A.state.allowedCurrencies||[]),...(A.state.addedCurrencies||[]).map(x=>x.code)])].filter(c=>/^[A-Z]{3}$/.test(c)&&c!=='SYP');
const label=c=>A.state.addedCurrencies?.find(x=>x.code===c)?.name||({USD:'الدولار الأمريكي',EUR:'اليورو',SYP:'الليرة السورية'}[c]||c);
const local=()=>A.state.currencyExchangeRatesSyp||{};
const quoted=(c,side)=>Number(local()?.[c]?.[side])||(c==='USD'?Number(A.state.exchangeRate)||0:0);
const canEdit=()=>A.can?.('fxSharedRate')===true;
function renderMenu(){
 const styles='<style>'+
 '.ta-fx-agent-choice-153{display:grid!important;grid-template-columns:minmax(0,1fr)!important;grid-template-rows:96px minmax(36px,auto) minmax(34px,auto)!important;justify-items:center!important;align-items:center!important;align-content:center!important;row-gap:12px!important;min-width:0!important;min-height:230px!important;padding:16px 9px!important;text-align:center!important;overflow:visible!important;}'+
 '.ta-fx-agent-choice-153 .ta-fx-agent-icon-153{display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:center!important;gap:10px!important;position:static!important;transform:none!important;width:100%!important;height:96px!important;font-size:initial!important;}'+
 '.ta-fx-agent-choice-153 .ta-fx-agent-arrow-153{display:grid!important;place-items:center!important;flex:0 0 64px!important;height:72px!important;position:static!important;font-size:43px!important;line-height:1!important;border-radius:20px!important;background:linear-gradient(145deg,#e9f8ff,#98c9ef)!important;box-shadow:inset 0 2px #fff,0 5px 0 #7eb1d7,0 8px 12px #16486836!important;}'+
 '.ta-fx-agent-choice-153 .ta-fx-agent-bill-153{position:static!important;flex:0 0 auto!important;font-size:34px!important;line-height:1!important;filter:drop-shadow(0 3px 3px #123b6240)!important;}'+
 '.ta-fx-agent-choice-153 .ta-fx-agent-title-153{display:block!important;position:static!important;transform:none!important;z-index:1!important;min-height:36px!important;width:100%!important;margin:0!important;padding:0!important;line-height:1.5!important;font-size:clamp(16px,3.8vw,22px)!important;font-weight:900!important;white-space:nowrap!important;overflow:visible!important;text-align:center!important;}'+
 '.ta-fx-agent-choice-153 .ta-fx-agent-price-153{display:block!important;position:static!important;transform:none!important;min-height:34px!important;width:100%!important;margin:0!important;padding:0!important;line-height:1.5!important;font-size:clamp(12px,2.8vw,15px)!important;font-weight:600!important;text-align:center!important;overflow-wrap:anywhere!important;}'+
 '.ta-fx-agent-choice-153 bdi{display:inline!important;unicode-bidi:isolate!important;}'+
 '@media(max-width:370px){.ta-fx-agent-choice-153{padding:11px 4px!important;row-gap:9px!important;}.ta-fx-agent-choice-153 .ta-fx-agent-icon-153{gap:5px!important;}.ta-fx-agent-choice-153 .ta-fx-agent-arrow-153{flex-basis:51px!important;height:60px!important;font-size:34px!important;}.ta-fx-agent-choice-153 .ta-fx-agent-bill-153{font-size:28px!important;}}'+
 '</style>';
 return styles+
 '<div class="hero"><h2>تصريف عملة</h2><p>اختر شراء أو مبيع لكل عملة مفعّلة، بسعر الصرف المزامن من المدير.</p></div>'+
 '<section class="panel">'+allowed().map(code=>'<div style="background:#edf6ff;border:1px solid #97b5d3;border-radius:14px;margin:8px 0;padding:12px">'+
 '<strong>'+esc(label(code))+' ('+esc(code)+')</strong>'+
 '<div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:8px">'+
 '<button type="button" class="tile ta-fx-agent-choice-153" onclick="Agent.openTrade147(\''+code+'\',\'buy\')" style="background:#d5f8e5;border:2px solid #19865c;color:#0d5541" aria-label="شراء '+esc(label(code))+'">'+
 '<span class="ta-fx-agent-icon-153" aria-hidden="true"><span class="ta-fx-agent-arrow-153">⬇️</span><span class="ta-fx-agent-bill-153">💵</span></span>'+
 '<strong class="ta-fx-agent-title-153">شراء <bdi>'+esc(code)+'</bdi></strong>'+
 '<small class="ta-fx-agent-price-153">سعر الشراء <bdi>'+fmt(quoted(code,'buy'),'SYP')+'</bdi></small></button>'+
 '<button type="button" class="tile ta-fx-agent-choice-153" onclick="Agent.openTrade147(\''+code+'\',\'sell\')" style="background:#dcecff;border:2px solid #487fc1;color:#184881" aria-label="مبيع '+esc(label(code))+'">'+
 '<span class="ta-fx-agent-icon-153" aria-hidden="true"><span class="ta-fx-agent-arrow-153">⬆️</span><span class="ta-fx-agent-bill-153">💵</span></span>'+
 '<strong class="ta-fx-agent-title-153">مبيع <bdi>'+esc(code)+'</bdi></strong>'+
 '<small class="ta-fx-agent-price-153">سعر المبيع <bdi>'+fmt(quoted(code,'sell'),'SYP')+'</bdi></small></button></div></div>').join('')+
 '<button type="button" class="secondary" onclick="Agent.goBack()">رجوع</button></section>';
}

A.openTrade147=function(currency,side){
 if(!allowed().includes(currency)||!['buy','sell'].includes(side))return this.toast('عملة غير مفعّلة');
 this.fx147Currency=currency;this.fx147Side=side;this.navigate('currency_exchange');
};
A.renderCurrencyExchange=function(){
 const code=this.fx147Currency||'USD',buy=this.fx147Side!=='sell',side=buy?'شراء':'مبيع',rate=quoted(code,buy?'buy':'sell');
 const permission=canEdit();
 return '<div class="hero"><h2>'+side+' '+esc(label(code))+'</h2><p>المبلغ وسعر الصرف المزامن وقيمة الليرة.</p></div>'+
 '<section class="panel">'+
 '<label class="label">المبلغ المراد '+side+'ه ('+code+')</label>'+
 '<input id="agentFx147Amount" class="field" type="number" min="0.01" step="any" inputmode="decimal">'+
 '<label class="label">سعر '+(buy?'الشراء':'المبيع')+' (ل.س لكل 1 '+code+')</label>'+
 '<input id="agentFx147Rate" class="field" type="number" min="0.000001" step="any" inputmode="decimal" '+(permission?'':'readonly ')+'value="'+(rate||'')+'">'+
 '<p class="tiny">'+(permission?'يمكن تعديل السعر؛ يُرسل التغيير إلى المدير بالمزامنة.':'السعر معتمد من المدير. لا تملك صلاحية تعديله.')+'</p>'+
 '<label class="label">القيمة بالليرة السورية (ل.س)</label>'+
 '<div id="agentFx147Total" class="panel" style="background:#e0fbe9;border:2px solid #3cb27e;font-size:20px;font-weight:bold">— ل.س</div>'+
 '<p id="agentFx147Balance" class="tiny"></p><p id="agentFx147Preview" class="tiny"></p>'+
 '<label class="label">بيان اختياري</label><input id="agentFx147Note" class="field" maxlength="200">'+
 '<button type="button" class="primary" onclick="Agent.saveCurrencyExchange()">حفظ '+side+' '+code+'</button>'+
 '<button type="button" class="secondary" onclick="Agent.navigate(\'currency_exchange_menu\')">رجوع للتصريف</button></section>';
};
A.paintCurrencyExchange=function(){
 const amount=document.getElementById('agentFx147Amount'),rate=document.getElementById('agentFx147Rate');
 if(!amount||!rate)return;
 const code=this.fx147Currency||'USD',buy=this.fx147Side!=='sell';
 const update=()=>{
  const sum=Math.round(Number(amount.value)*Number(rate.value));
  document.getElementById('agentFx147Total').textContent=sum>0&&Number.isFinite(sum)?fmt(sum,'SYP'):'أدخل المبلغ والسعر';
  const cash=window.TiqanyFxAgent?.sources?.()||{},from=buy?'SYP':code;
  document.getElementById('agentFx147Balance').textContent='الرصيد المتاح: '+fmt(cash[from]||0,from);
  document.getElementById('agentFx147Preview').textContent=buy?'يُضاف المبلغ المشترى إلى صندوق '+code:'تخرج العملة من صندوق '+code+' وتدخل قيمتها إلى صندوق الليرة';
 };
 amount.addEventListener('input',update);rate.addEventListener('input',update);update();
};
A.saveCurrencyExchange=async function(){
 if(this.busy)return;this.busy=true;
 try{
  if(!await this.active())throw Error('يجب تفعيل تطبيق موظف البيع');
  const code=this.fx147Currency||'USD',side=this.fx147Side==='sell'?'sell':'buy',isBuy=side==='buy';
  if(!allowed().includes(code))throw Error('عملة غير مفعّلة');
  const amountRaw=Number(document.getElementById('agentFx147Amount')?.value),
    price=Number(document.getElementById('agentFx147Rate')?.value);
  if(!Number.isFinite(amountRaw)||amountRaw<=0||amountRaw>1e12||!Number.isFinite(price)||price<=0||price>=1e12)
   throw Error('أدخل مبلغاً وسعراً صالحين');
  const amount=Math.round(amountRaw*E.scale(code))/E.scale(code),syp=Math.round(amount*price);
  if(!(amount>0&&syp>0&&syp<1e12))throw Error('قيمة التصريف غير صالحة');
  const fromCurrency=isBuy?'SYP':code,toCurrency=isBuy?code:'SYP';
  const available=window.TiqanyFxAgent?.sources?.()||{};
  const fromAmount=isBuy?syp:amount,toAmount=isBuy?amount:syp;
  if(fromAmount>Number(available[fromCurrency]||0)+1e-6)throw Error('رصيد الصندوق غير كافٍ');
  const previous=local(),oldRate=quoted(code,side);
  const changed=Math.abs(price-oldRate)>1e-9;
  if(changed&&!canEdit())throw Error('ليس لديك صلاحية تغيير سعر الصرف المزامن');
  const entries=[];
  if(changed)entries.push({kind:'fx_rate_change',id:'op_'+FieldProtocol.uuid(),date:new Date().toISOString(),
    agentId:this.state.agentId,companyId:this.state.companyId,warehouseId:this.state.warehouseId,
    currency:'SYP',exchangeRate:Number(this.state.exchangeRate),localNumber:this.nextLocalNumber('XR'),
    rates:{[code]:{[side]:price}}});
  const event=E.prepare({id:'op_'+FieldProtocol.uuid(),date:new Date().toISOString(),
    fromCurrency,toCurrency,fromAmount,toAmount,equivalentSyp:syp,agentId:this.state.agentId,
    source:'agent',note:document.getElementById('agentFx147Note')?.value||''},['SYP',code]);
  entries.push({...event,kind:'currency_exchange',companyId:this.state.companyId,warehouseId:this.state.warehouseId,
    currency:fromCurrency,exchangeRate:Number(this.state.exchangeRate),localNumber:this.nextLocalNumber('FX'),
    fxRateChanged:changed,fxRatesUsed:{fromSell:isBuy?null:price,toBuy:isBuy?price:null}});
  FieldProtocol.validateOps(entries,this.state.agentId,this.state.companyId,this.state.warehouseId,this.state.items,this.state.accounts);
  const beforeOps=this.state.ops.slice(),beforeRates=this.state.currencyExchangeRatesSyp;
  this.state.ops.push(...entries);
  if(changed)this.state.currencyExchangeRatesSyp={...previous,[code]:{...(previous[code]||{}),[side]:price}};
  try{await this.save();}
  catch(err){this.state.ops=beforeOps;this.state.currencyExchangeRatesSyp=beforeRates;throw err;}
  this.toast('تم حفظ التصريف'+(changed?' وتغيير سعر الصرف':'')+' وسيتم ترحيله عند المزامنة');
  this.stack=['home','invoices'];await this.show('invoices');
 }catch(err){this.toast('تعذر حفظ التصريف: '+err.message);}
 finally{this.busy=false;}
};
const oldHome=A.renderHome;
A.renderHome=function(...args){
 return oldHome.apply(this,args).replace("Agent.navigate('currency_exchange')","Agent.navigate('currency_exchange_menu')");
};
const oldShow=A.show;
A.show=async function(route,...args){
 if(route==='currency_exchange_menu'){
  if(!this.ready()||!await this.active())return oldShow.call(this,'home',...args);
  this.screen=route;
  document.getElementById('screen').innerHTML=renderMenu();
  document.getElementById('agentScreenTitle').textContent='تصريف عملة';
  document.getElementById('agentBack')?.classList.remove('hide');
  const view=document.getElementById('screen');if(view)view.scrollTop=0;
  return;
 }
 return oldShow.call(this,route,...args);
};
window.TiqanyFxEmployee147={renderMenu,allowed,quoted};
})();
