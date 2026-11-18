/* Tiqany Acc 3.5.147 — currency-specific buy/sell exchange desk.
 * The v145 weighted-average/deferred-profit core and historical entries
 * remain unchanged.  All new trades use exactly SYP and one foreign currency.
 */
(function(root){
'use strict';
const U=root.TiqanyFxUI,E=root.TiqanyCurrencyExchangeCore;
if(!U||!E||typeof State==='undefined'||typeof UI==='undefined')return;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const trial={begin(consume){if(!consume||typeof LicenseManager==='undefined')return null;
 if(!LicenseManager.canPerformOperation())throw Error('انتهى الحد المسموح للعمليات في النسخة التجريبية؛ فعّل التطبيق أو حدّث الترخيص');
 const old=Number(State.license.opsUsedCount)||0;
 State.license.opsUsedCount=LicenseManager.getTotalOpsUsed()+1;return old;
},done(old){if(old!==null)LicenseManager.persistFallbackStorage();},
undo(old){if(old!==null)State.license.opsUsedCount=old;}};
const money=(x,c)=>Number(x||0).toLocaleString('en-US',{maximumFractionDigits:c==='SYP'?0:2})+' '+(c==='SYP'?'ل.س':c);
const rates=()=>State.settings.currencyExchangeRatesSyp||{};
const extra=()=>Array.isArray(State.settings.addedCurrencies)?State.settings.addedCurrencies:[];
const codes=()=>[...new Set(['USD',...((typeof CurrencyCatalog!=='undefined'?CurrencyCatalog.active():['USD','SYP'])),...extra().map(x=>x.code)])].filter(c=>/^[A-Z]{3}$/.test(c)&&c!=='SYP');
const label=code=>typeof CurrencyCatalog!=='undefined'?CurrencyCatalog.label(code):code;
const current=(code,kind)=>{
 const side=kind==='buy'?'buy':'sell',value=Number(rates()[code]?.[side]);
 return value>0?value:(code==='USD'?Number(State.settings.exchangeRate)||0:0);
};
const validPrice=n=>Number.isFinite(n)&&n>0&&n<1e12;
const cashAvailable=c=>{
 const cash=typeof FieldCash!=='undefined'?FieldCash:typeof SoloCashbox!=='undefined'?SoloCashbox:root.FieldCash||root.SoloCashbox;
 const b=cash?.summary?.('office')||{};
 return c==='SYP'?Number(b.sypCash)||0:c==='USD'?Number(b.usdCash)||0:Number(b.otherCurrencies?.[c])||0;
};
function chooser(){
 const options=codes();
 if(!options.length){UI.toast('فعّل الدولار أو عملة أجنبية أولاً','warn');return;}
 const cells=options.map(code=>{
  const title=esc(label(code));
  return '<section class="rounded-xl border border-sky-200 bg-white p-3">'+
    '<div class="font-black text-slate-900 mb-2">'+title+'</div>'+
    '<div class="grid grid-cols-2 gap-3">'+
    '<button type="button" onclick="TiqanyFx147.trade(\''+code+'\',\'buy\')" class="ta-fx-choice-153 rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-3 text-emerald-900 font-black" aria-label="شراء '+esc(code)+' — '+title+'">'+
      '<span class="ta-fx-icon-153" aria-hidden="true"><i class="fas fa-arrow-down text-emerald-600"></i><i class="fas fa-coins text-amber-500"></i></span><strong class="ta-fx-title-153">شراء <bdi>'+esc(code)+'</bdi></strong>'+
      '<small class="ta-fx-price-153">سعر الشراء <bdi>'+money(current(code,'buy'),'SYP')+'</bdi></small></button>'+
    '<button type="button" onclick="TiqanyFx147.trade(\''+code+'\',\'sell\')" class="ta-fx-choice-153 rounded-2xl border-2 border-blue-400 bg-blue-50 p-3 text-blue-900 font-black" aria-label="مبيع '+esc(code)+' — '+title+'">'+
      '<span class="ta-fx-icon-153" aria-hidden="true"><i class="fas fa-arrow-up text-blue-600"></i><i class="fas fa-money-bill-wave text-emerald-500"></i></span><strong class="ta-fx-title-153">مبيع <bdi>'+esc(code)+'</bdi></strong>'+
      '<small class="ta-fx-price-153">سعر المبيع <bdi>'+money(current(code,'sell'),'SYP')+'</bdi></small></button></div></section>';
 }).join('');
 const choiceStyle='<style>'+
  '[data-ta-fx-desk] .ta-fx-choice-153{display:grid!important;grid-template-columns:minmax(0,1fr)!important;grid-template-rows:78px minmax(32px,auto) minmax(36px,auto)!important;justify-items:center!important;align-items:center!important;align-content:center!important;gap:10px!important;min-width:0!important;min-height:206px!important;padding:14px 8px!important;overflow:visible!important;text-align:center!important;}'+
  '[data-ta-fx-desk] .ta-fx-icon-153{display:flex!important;flex-flow:row nowrap!important;align-items:center!important;justify-content:center!important;gap:7px!important;width:100%!important;height:78px!important;position:static!important;transform:none!important;}'+
  '[data-ta-fx-desk] .ta-fx-icon-153 i{position:static!important;transform:none!important;flex-shrink:0!important;line-height:1.1!important;}'+
  '[data-ta-fx-desk] .ta-fx-icon-153 i:first-child{font-size:30px!important;display:grid!important;place-items:center!important;width:55px!important;height:64px!important;border-radius:17px!important;background:linear-gradient(145deg,#e8f6ff,#98c2f0)!important;box-shadow:0 4px 0 #6899cd,0 7px 10px #18416c40!important;text-shadow:0 2px 2px #fff9;}'+
  '[data-ta-fx-desk] .ta-fx-icon-153 i:last-child{font-size:28px!important;filter:drop-shadow(0 3px 3px #123b6240)!important;}'+
  '[data-ta-fx-desk] .ta-fx-title-153{display:block!important;position:static!important;transform:none!important;z-index:1!important;margin:0!important;padding:0!important;min-height:30px!important;width:100%!important;font-size:clamp(15px,3.7vw,20px)!important;line-height:1.55!important;font-weight:900!important;white-space:nowrap!important;text-align:center!important;overflow:visible!important;}'+
  '[data-ta-fx-desk] .ta-fx-price-153{display:block!important;position:static!important;transform:none!important;z-index:1!important;margin:0!important;padding:0!important;width:100%!important;min-height:32px!important;font-size:clamp(12px,2.9vw,15px)!important;line-height:1.45!important;font-weight:600!important;overflow-wrap:anywhere!important;text-align:center!important;}'+
  '[data-ta-fx-desk] .ta-fx-choice-153 bdi{display:inline!important;unicode-bidi:isolate!important;}'+
  '@media(max-width:370px){[data-ta-fx-desk] .ta-fx-choice-153{padding:10px 5px!important;gap:8px!important;}[data-ta-fx-desk] .ta-fx-icon-153{gap:4px!important;}[data-ta-fx-desk] .ta-fx-icon-153 i:first-child{width:48px!important;height:56px!important;font-size:26px!important;}[data-ta-fx-desk] .ta-fx-icon-153 i:last-child{font-size:23px!important;}}'+
  '</style>';
 UI.openModal('<div dir="rtl" class="text-right space-y-3 max-h-[78vh] overflow-y-auto" data-ta-fx-desk="1">'+
   choiceStyle+
   '<h2 class="text-xl font-black">تصريف عملة — شراء ومبيع</h2>'+
   '<p class="text-xs text-slate-700">اختر شراء أو مبيع للعملة المطلوبة. تُستخدم أسعار الصرف المحفوظة ويمكن تعديل سعر العملية.</p>'+
   cells+
   '<button type="button" onclick="TiqanyFx147.editRates()" class="ta-fx-rates-btn-149 w-full rounded-xl p-3 font-black" style="background:#047857!important;color:#fff!important;border:2px solid #065f46!important;box-shadow:0 4px 0 #064e3b!important"><i class="fas fa-chart-line ml-2"></i> إعداد أسعار الصرف</button>'+
   '<button type="button" onclick="UI.forceCloseModal()" class="w-full bg-slate-100 rounded-xl p-3 font-bold">رجوع</button></div>');
}
function trade(code,side){
 if(!codes().includes(code)||!['buy','sell'].includes(side))return UI.toast('عملة غير مفعّلة','error');
 const isBuy=side==='buy',rate=current(code,side),title=(isBuy?'شراء ':'مبيع ')+label(code);
 UI.openModal('<div dir="rtl" class="text-right space-y-3" data-ta-fx-trade="1">'+
   '<h2 class="text-xl font-black text-slate-900">'+esc(title)+'</h2>'+
   '<p class="text-xs text-slate-600">تُرحّل حركة العملة والليرة إلى الصندوقين بعملية واحدة. الربح المحقق يُحتسب بمحرّك تكلفة التصريف.</p>'+
   '<label class="block font-black text-sm">المبلغ المراد '+(isBuy?'شراؤه':'بيعه')+' ('+esc(code)+')</label>'+
   '<input id="ta147Amount" type="number" step="any" min="0.01" inputmode="decimal" autocomplete="off" class="w-full p-3 rounded-xl border-2 border-sky-300 text-lg font-black">'+
   '<label class="block font-black text-sm">سعر '+(isBuy?'الشراء':'المبيع')+' (ل.س لكل 1 '+esc(code)+')</label>'+
   '<div class="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-2 flex gap-2 items-center">'+
   '<i class="fas fa-pen text-indigo-600"></i>'+
   '<input id="ta147Rate" type="number" min="0.000001" step="any" inputmode="decimal" autocomplete="off" class="w-full rounded-lg p-3 text-lg font-black bg-white border" value="'+(rate>0?rate:'')+'" placeholder="حدّد سعر الصرف" aria-label="سعر الصرف قابل للتعديل"></div>'+
   '<label class="block font-black text-sm">قيمة المبلغ بالليرة السورية (ل.س)</label>'+
   '<div id="ta147Total" class="w-full rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-2xl font-black text-emerald-900" aria-live="polite">— ل.س</div>'+
   '<div id="ta147Balance" class="rounded-lg bg-sky-50 p-2 font-bold text-xs"></div>'+
   '<div id="ta147Preview" class="rounded-lg bg-slate-50 p-3 font-bold text-xs"></div>'+
   '<label class="block font-bold text-xs">بيان (اختياري)</label><input id="ta147Note" maxlength="200" class="w-full rounded-lg border p-3">'+
   '<button type="button" class="w-full ta-primary-3d bg-emerald-700 text-white font-black rounded-xl p-3" onclick="TiqanyFx147.saveTrade()">حفظ '+esc(title)+'</button>'+
   '<button type="button" class="w-full rounded-xl bg-slate-100 p-3" onclick="TiqanyFx147.chooser()">رجوع إلى التصريف</button>'+
   '<input type="hidden" id="ta147Currency" value="'+esc(code)+'"><input type="hidden" id="ta147Side" value="'+side+'"></div>');
 const update=()=>{
  const amount=Number(document.getElementById('ta147Amount')?.value),price=Number(document.getElementById('ta147Rate')?.value);
  const total=amount*price;
  const display=document.getElementById('ta147Total');
  const amountRounded=Math.round(amount*E.scale(code))/E.scale(code),totalRounded=Math.round(total);
  const paidCurrency=isBuy?'SYP':code;
  document.getElementById('ta147Balance').textContent='رصيد الصندوق '+paidCurrency+' المتاح: '+money(cashAvailable(paidCurrency),paidCurrency);
  if(!(amount>0&&validPrice(price)&&Number.isFinite(total)&&totalRounded>0&&totalRounded<1e12)){
   display.textContent='أدخل مبلغاً وسعر صرف صالحين';
   document.getElementById('ta147Preview').textContent='الربح الحالي يظهر بعد إدخال البيانات.';return;
  }
  display.textContent=money(totalRounded,'SYP');
  try{
   const fromCurrency=isBuy?'SYP':code,toCurrency=isBuy?code:'SYP';
   const p=E.prepare({id:'fx_preview_147',date:new Date().toISOString(),
       fromCurrency,toCurrency,fromAmount:isBuy?totalRounded:amountRounded,
       toAmount:isBuy?amountRounded:totalRounded,equivalentSyp:totalRounded},['SYP',code]);
   const result=E.analyze([...(State.currencyExchanges||[]),p]).byId.get(p.id);
   document.getElementById('ta147Preview').textContent='الربح المحقق: '+money(result.gainSyp||0,'SYP')+
    (result.pendingAmount>0?' · كمية مؤجلة التكلفة: '+money(result.pendingAmount,code):'');
  }catch(e){document.getElementById('ta147Preview').textContent=e.message;}
 };
 document.getElementById('ta147Amount').addEventListener('input',update);
 document.getElementById('ta147Rate').addEventListener('input',update);
 update();
}
let busy=false;
async function saveTrade(){
 if(busy)return;
 const val=id=>document.getElementById(id)?.value;
 const code=val('ta147Currency'),side=val('ta147Side');
 try{
  if(!codes().includes(code)||!['buy','sell'].includes(side))throw Error('عملة غير مفعّلة');
  const amountRaw=Number(val('ta147Amount')),price=Number(val('ta147Rate'));
  if(!Number.isFinite(amountRaw)||amountRaw<=0||amountRaw>1e12||!validPrice(price))throw Error('أدخل مبلغاً وسعراً صالحين');
  const amount=Math.round(amountRaw*E.scale(code))/E.scale(code),syp=Math.round(amount*price);
  if(!(amount>0&&syp>0&&syp<1e12))throw Error('المبلغ أصغر من الحد المسموح أو يتجاوز الحد');
  const isBuy=side==='buy',fromCurrency=isBuy?'SYP':code,toCurrency=isBuy?code:'SYP';
  const fromAmount=isBuy?syp:amount,toAmount=isBuy?amount:syp;
  if(cashAvailable(fromCurrency)+1e-6<fromAmount)throw Error('رصيد صندوق '+fromCurrency+' لا يكفي لهذا التصريف');
  const id='fx_'+(typeof FieldProtocol!=='undefined'?FieldProtocol.uuid():crypto.randomUUID().replace(/-/g,''));
  const entry=E.prepare({id,date:new Date().toISOString(),fromCurrency,toCurrency,
      fromAmount,toAmount,equivalentSyp:syp,source:'manager',agentId:'',note:val('ta147Note')||''},['SYP',code]);
  entry.fxRatesUsed={fromSell:isBuy?null:price,toBuy:isBuy?price:null};
  const before=State.currencyExchanges||[],oldRates=rates(),newRates={...oldRates};
  const oldRecord=oldRates[code]||{};
  const changed=Number(oldRecord[side])!==price;
  if(changed)newRates[code]={...oldRecord,[side]:price};
  const candidate=[...before,entry];E.analyze(candidate);
  const trialBefore=trial.begin(true);
  busy=true;
  State.currencyExchanges=candidate;
  if(changed)State.settings.currencyExchangeRatesSyp=newRates;
  try{await StorageEngine.saveState();}
  catch(error){State.currencyExchanges=before;if(changed)State.settings.currencyExchangeRatesSyp=oldRates;trial.undo(trialBefore);throw error;}
  trial.done(trialBefore);
  UI.forceCloseModal();
  UI.toast('تم حفظ '+(isBuy?'شراء ':'مبيع ')+code+' في الصندوقين واحتساب أرباح التصريف','success');
  if(typeof AppNav!=='undefined')AppNav.renderCurrent();
 }catch(e){UI.toast('تعذر حفظ التصريف: '+e.message,'error');}
 finally{busy=false;}
}
// The company-wide currency rate is NOT the FX trading buy/sell quotation.
// USD uses the existing invoice/general rate so the top-bar value stays intact.
// Added currencies use a separate, portable map and never modify FX profits.
const generalRates=()=>State.settings.currencyRatesSyp||{};
const generalRate=code=>code==='USD'?Number(State.settings.exchangeRate)||0:Number(generalRates()[code])||0;
function currencyRates(){
 const rows=codes().map(code=>{
  const rate=generalRate(code);
  return '<div class="rounded-xl border-2 border-emerald-200 bg-white p-3">'+
    '<label class="block text-sm font-black text-slate-900 mb-2">سعر صرف '+esc(label(code))+' مقابل الليرة السورية (ل.س)</label>'+
    '<input id="ta150General_'+esc(code)+'" data-ta150-general="'+esc(code)+'" type="number" min="0.000001" step="any" inputmode="decimal" class="w-full rounded-xl border-2 border-emerald-300 p-3 text-center font-black text-lg text-slate-900 bg-white" value="'+(rate>0?esc(rate):'')+'" placeholder="أدخل سعر صرف '+esc(code)+'" />'+
    (code==='USD'?'<p class="text-xs text-emerald-800 mt-2 font-bold">سعر الدولار المعتمد للفواتير والظاهر في الشريط العلوي</p>':'<p class="text-xs text-slate-500 mt-2">سعر صرف العملة العام مستقل عن سعر شرائها ومبيعها في التصريف</p>')+'</div>';
 }).join('');
 UI.openModal('<div dir="rtl" data-ta150-currency-rates="1" class="text-right space-y-3 max-h-[78vh] overflow-y-auto">'+
  '<h2 class="font-black text-lg">أسعار صرف العملات</h2>'+
  '<p class="text-xs text-slate-700">حدّد سعر صرف الدولار وكل عملة أجنبية مضافة مقابل الليرة السورية. أسعار شراء ومبيع التصريف تُدار بصورة مستقلة.</p>'+
  rows+
  '<button type="button" class="w-full p-3 font-black rounded-xl" style="background:#047857!important;color:#fff!important;border:2px solid #065f46!important" onclick="TiqanyFx147.saveCurrencyRates()">حفظ أسعار صرف العملات</button>'+
  '<button type="button" class="w-full p-3 rounded-xl bg-slate-100 text-slate-900 font-bold" onclick="UI.forceCloseModal()">إلغاء</button></div>');
}
async function saveCurrencyRates(){
 const priorRate=State.settings.exchangeRate,priorCurrencies=State.settings.currencyRatesSyp;
 const next={...generalRates()};
 try{
  const usdText=document.getElementById('ta150General_USD')?.value?.trim();
  const usd=Number(usdText);
  if(!usdText||!validPrice(usd))throw Error('أدخل سعر صرف الدولار الصحيح');
  for(const code of codes().filter(c=>c!=='USD')){
   const raw=document.getElementById('ta150General_'+code)?.value?.trim()||'';
   if(!raw){delete next[code];continue;}
   const rate=Number(raw);if(!validPrice(rate))throw Error('سعر صرف غير صالح للعملة '+code);
   next[code]=rate;
  }
  const trialBefore=trial.begin(usd!==Number(priorRate)||JSON.stringify(next)!==JSON.stringify(priorCurrencies||{}));
  State.settings.exchangeRate=usd;
  State.settings.currencyRatesSyp=next;
  try{await StorageEngine.saveState();}
  catch(e){State.settings.exchangeRate=priorRate;State.settings.currencyRatesSyp=priorCurrencies;trial.undo(trialBefore);throw e;}
  trial.done(trialBefore);
  const badge=document.getElementById('topBarRate');
  if(badge)badge.textContent=usd.toLocaleString('en-US');
  UI.forceCloseModal();
  UI.toast('تم حفظ أسعار صرف العملات مع الاحتفاظ بعرض الدولار في الشريط العلوي','success');
  if(typeof AppNav!=='undefined'){
   if(priorRate!==usd&&AppNav.current()?.screen==='invoice_form'&&typeof InvoiceController!=='undefined'&&InvoiceController.draft){
    InvoiceController.updateExchangeRate(usd,true);
   }else AppNav.renderCurrent();
  }
 }catch(e){UI.toast('تعذر حفظ أسعار صرف العملات: '+e.message,'error');}
}

function unifiedRates(){
 const all=codes(),existing=rates();
 const options=all.map(c=>{
  const defaultUsd=c==='USD'?Number(State.settings.exchangeRate)||'':'';
  return '<div class="rounded-xl border border-sky-200 bg-white p-3">'+
  '<strong class="font-black text-slate-900">'+esc(label(c))+'</strong>'+
  '<label class="block text-xs font-bold my-1">سعر شراء '+esc(c)+' (ل.س)</label>'+
  '<input id="ta147Buy_'+c+'" type="number" min="0.000001" step="any" inputmode="decimal" class="w-full rounded-lg p-2 border" value="'+esc(existing[c]?.buy??defaultUsd)+'">'+
  '<label class="block text-xs font-bold my-1">سعر مبيع '+esc(c)+' (ل.س)</label>'+
  '<input id="ta147Sell_'+c+'" type="number" min="0.000001" step="any" inputmode="decimal" class="w-full rounded-lg p-2 border" value="'+esc(existing[c]?.sell??defaultUsd)+'"></div>';
 }).join('');
 UI.openModal('<div dir="rtl" class="text-right space-y-3">'+
  '<h2 class="font-black text-lg">أسعار شراء ومبيع العملات</h2>'+
  '<p class="text-xs text-slate-700">سعر الدولار الظاهر أعلى الشاشة يبقى هو السعر العام للفواتير. أسعار الشراء والمبيع تُستخدم في تصريف العملات فقط.</p>'+
  '<p class="rounded-xl bg-slate-100 border border-slate-300 p-3 text-xs text-slate-700">تظهر هنا أسعار شراء ومبيع العملات الأجنبية، بما فيها الدولار. يبقى سعر الدولار العام معروضاً في الشريط العلوي ولا يتغير عند حفظ هذه الأسعار.</p>'+
  '<div class="max-h-[55vh] overflow-y-auto space-y-2">'+options+'</div>'+
  '<button type="button" onclick="TiqanyFx147.saveRates()" class="w-full rounded-xl bg-emerald-700 p-3 text-white font-black">حفظ أسعار الصرف</button>'+
  '<button type="button" onclick="UI.forceCloseModal()" class="w-full rounded-xl bg-slate-100 p-3">إلغاء</button></div>');
}
async function saveRates(){
 const next={...rates()},prior=rates();
 try{
  for(const c of codes()){
   const buyText=document.getElementById('ta147Buy_'+c)?.value.trim()||'';
   const sellText=document.getElementById('ta147Sell_'+c)?.value.trim()||'';
   if(!buyText&&!sellText)continue;
   if(!buyText||!sellText)throw Error('أدخل سعر الشراء والمبيع للعملة '+c);
   const buy=Number(buyText),sell=Number(sellText);
   if(!validPrice(buy)||!validPrice(sell))throw Error('سعر غير صالح للعملة '+c);
   next[c]={buy,sell};
  }
  const trialBefore=trial.begin(JSON.stringify(next)!==JSON.stringify(prior));
  State.settings.currencyExchangeRatesSyp=next;
  try{await StorageEngine.saveState();}
  catch(e){State.settings.currencyExchangeRatesSyp=prior;trial.undo(trialBefore);throw e;}
  trial.done(trialBefore);
  UI.forceCloseModal();
  UI.toast('تم حفظ أسعار الصرف لجميع العملات','success');
  if(typeof AppNav!=='undefined')AppNav.renderCurrent();
 }catch(e){UI.toast('تعذر حفظ الأسعار: '+e.message,'error');}
}
function profitDetails(){
 const report=E.analyze(State.currencyExchanges||[]);
 const operations=[...report.byId.values()].filter(x=>x.gainSyp!==null && x.gainSyp!==0).reverse();
 const items=operations.slice(0,100).map(e=>
   '<div class="flex justify-between gap-3 py-2 border-b border-slate-100 text-xs"><span>'+
   esc(root.TiqanyReportDate148?.calendarDate(e.date)||String(e.date||'').slice(0,10))+' • '+esc(e.fromCurrency)+' → '+esc(e.toCurrency)+
   (e.deferredGainSyp?' • تسوية أرباح مؤجلة':'')+'</span><strong class="'+(e.gainSyp<0?'text-rose-700':'text-emerald-700')+'">'+money(e.gainSyp,'SYP')+'</strong></div>').join('');
 UI.openModal('<div dir="rtl" class="text-right space-y-3"><h2 class="font-black text-lg"><i class="fas fa-chart-line text-emerald-600"></i> أرباح التصريف</h2>'+
   '<div class="bg-emerald-50 rounded-xl border border-emerald-300 p-3 font-black">'+money(report.profitSyp,'SYP')+'</div>'+
   '<p class="text-xs text-slate-600">أرباح التصريف المحققة محسوبة بطريقة الإصدار 145، ولا تتضمن تكلفة المبالغ المؤجلة حتى تتم تغطيتها.</p>'+
   '<div class="max-h-[55vh] overflow-y-auto">'+(items||'<p>لا توجد أرباح تصريف محققة.</p>')+'</div>'+
   '<button type="button" onclick="UI.forceCloseModal()" class="w-full rounded-xl bg-slate-100 p-3">إغلاق</button></div>');
}
function augmentReports(main,params){
 if((params?.tab||'cashbox')!=='pnl')return;
 const buttons=Array.from(main.querySelectorAll('button'));
 const target=buttons.find(b=>b.textContent?.trim()==='أرباح المواد');
 if(target?.parentElement){
  const row=target.parentElement;
  row.classList.remove('grid-cols-3');row.classList.add('grid-cols-4');
  row.insertAdjacentHTML('beforeend','<button type="button" onclick="TiqanyFx147.profitDetails()" class="rounded-xl bg-emerald-100 border border-emerald-400 px-2 py-2 text-xs text-emerald-900 font-black"><i class="fas fa-chart-line ml-1" aria-hidden="true"></i> أرباح التصريف</button>');
 }
}
if(typeof CurrencyCatalog!=='undefined'&&typeof CurrencyCatalog.renderAdditional==='function'){
 CurrencyCatalog.renderAdditional=function(){
  const list=extra();
  return list.length?list.map(c=>{
   const rate=generalRate(c.code);
   return '<div class="rounded-xl border border-emerald-200 bg-white p-3 mb-2">'+
    '<div class="flex justify-between items-center gap-2"><strong class="text-xs text-slate-900">'+esc(c.name)+' ('+esc(c.code)+')</strong>'+
    '<button type="button" class="text-rose-700 text-xs font-bold" onclick="SettingsController.removeCatalogCurrency(\''+esc(c.code)+'\')">إزالة</button></div>'+
    '<div class="text-xs text-slate-700 font-bold mt-2">سعر صرف '+esc(c.code)+' مقابل الليرة السورية: '+(rate>0?money(rate,'SYP'):'لم يُحدّد بعد')+'</div>'+
    '<button type="button" data-ta150-currency-rate-button="'+esc(c.code)+'" onclick="TiqanyFx147.currencyRates()" class="ta-currency-rate-150 mt-3 w-full rounded-xl p-3 font-black" style="background:#047857!important;color:#fff!important;border:2px solid #065f46!important;box-shadow:0 4px 0 #064e3b!important"><i class="fas fa-coins ml-1" style="color:#fff!important"></i> تعديل سعر الصرف</button></div>';
  }).join(''):'<p class="text-xs text-slate-500">لم تُضف عملات جديدة.</p>';
 };
}
// The authenticated staff catalog carries both the ISO code and the user-given
// currency name, plus the quote table. Existing employee permission checks stay intact.
if(typeof FieldSync!=='undefined'&&typeof FieldSync.catalog==='function'){
 const previousCatalog=FieldSync.catalog;
 FieldSync.catalog=function(agent,...args){
  const result=previousCatalog.call(this,agent,...args);
  result.addedCurrencies=extra().filter(c=>/^[A-Z]{3}$/.test(c.code)).map(c=>({code:c.code,name:String(c.name||c.code).slice(0,60)}));
  result.allowedCurrencies=[...new Set(['SYP','USD',...(result.allowedCurrencies||[]),...result.addedCurrencies.map(x=>x.code)])];
  result.currencyExchangeRatesSyp=JSON.parse(JSON.stringify(rates()));
  result.currencyRatesSyp=JSON.parse(JSON.stringify(generalRates()));
  result.generalUsdExchangeRate=Number(State.settings.exchangeRate)||0;
  return result;
 };
}
const originalEdit=U.newForm;
U.newForm=function(editId=''){return editId?originalEdit(editId):chooser();};
U.ratesForm=unifiedRates;
// Keep a separate, explicit settings action for the GENERAL invoice exchange
// rate, without displaying it when the user clicks the top-bar FX quotation.
const originalInvoiceRateModal=typeof UI.openRateModal==='function'?UI.openRateModal.bind(UI):null;
U.openGeneralRateModal=currencyRates;
UI.openRateModal=currencyRates;
if(typeof Views!=='undefined'&&typeof Views.renderReports==='function'){
 const previous=Views.renderReports;
 Views.renderReports=function(main,params,...args){
  const out=previous.call(this,main,params,...args);
  augmentReports(main,params);
  return out;
 };
}
root.TiqanyFx147={chooser,trade,saveTrade,editRates:unifiedRates,saveRates,profitDetails,codes,current,generalInvoiceRateModal:currencyRates,currencyRates,saveCurrencyRates,generalRate};
})(typeof window==='object'?window:globalThis);
