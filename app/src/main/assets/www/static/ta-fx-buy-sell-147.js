/* Tiqany Acc 3.5.147 — currency-specific buy/sell exchange desk.
 * The v145 weighted-average/deferred-profit core and historical entries
 * remain unchanged.  All new trades use exactly SYP and one foreign currency.
 */
(function(root){
'use strict';
const U=root.TiqanyFxUI,E=root.TiqanyCurrencyExchangeCore;
if(!U||!E||typeof State==='undefined'||typeof UI==='undefined')return;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
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
    '<button type="button" onclick="TiqanyFx147.trade(\''+code+'\',\'buy\')" class="rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-3 text-emerald-900 font-black flex flex-col items-center gap-2" aria-label="شراء '+title+'">'+
      '<span class="text-3xl"><i class="fas fa-arrow-down text-emerald-600"></i><i class="fas fa-coins text-amber-500"></i></span><span>شراء '+esc(code)+'</span>'+
      '<small class="font-medium text-xs">سعر الشراء '+money(current(code,'buy'),'SYP')+'</small></button>'+
    '<button type="button" onclick="TiqanyFx147.trade(\''+code+'\',\'sell\')" class="rounded-2xl border-2 border-blue-400 bg-blue-50 p-3 text-blue-900 font-black flex flex-col items-center gap-2" aria-label="مبيع '+title+'">'+
      '<span class="text-3xl"><i class="fas fa-arrow-up text-blue-600"></i><i class="fas fa-money-bill-wave text-emerald-500"></i></span><span>مبيع '+esc(code)+'</span>'+
      '<small class="font-medium text-xs">سعر المبيع '+money(current(code,'sell'),'SYP')+'</small></button></div></section>';
 }).join('');
 UI.openModal('<div dir="rtl" class="text-right space-y-3 max-h-[78vh] overflow-y-auto" data-ta-fx-desk="1">'+
   '<h2 class="text-xl font-black">تصريف عملة — شراء ومبيع</h2>'+
   '<p class="text-xs text-slate-700">اختر شراء أو مبيع للعملة المطلوبة. تُستخدم أسعار الصرف المحفوظة ويمكن تعديل سعر العملية.</p>'+
   cells+
   '<button type="button" onclick="TiqanyFx147.editRates()" class="w-full bg-sky-800 text-white rounded-xl p-3 font-bold"><i class="fas fa-chart-line ml-2"></i> إعداد أسعار الصرف</button>'+
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
  busy=true;
  State.currencyExchanges=candidate;
  if(changed)State.settings.currencyExchangeRatesSyp=newRates;
  try{await StorageEngine.saveState();}
  catch(error){State.currencyExchanges=before;if(changed)State.settings.currencyExchangeRatesSyp=oldRates;throw error;}
  UI.forceCloseModal();
  UI.toast('تم حفظ '+(isBuy?'شراء ':'مبيع ')+code+' في الصندوقين واحتساب أرباح التصريف','success');
  if(typeof AppNav!=='undefined')AppNav.renderCurrent();
 }catch(e){UI.toast('تعذر حفظ التصريف: '+e.message,'error');}
 finally{busy=false;}
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
  '<div class="bg-slate-800 rounded-xl p-3 text-white">'+
  '<label class="block text-xs font-bold mb-1">سعر الدولار العام الظاهر في الشريط العلوي (ل.س)</label>'+
  '<input id="ta147GeneralUsd" type="number" min="0.000001" step="any" class="w-full rounded-lg p-2 text-slate-900 font-black bg-white" value="'+esc(State.settings.exchangeRate||'')+'"></div>'+
  '<div class="max-h-[55vh] overflow-y-auto space-y-2">'+options+'</div>'+
  '<button type="button" onclick="TiqanyFx147.saveRates()" class="w-full rounded-xl bg-emerald-700 p-3 text-white font-black">حفظ أسعار الصرف</button>'+
  '<button type="button" onclick="UI.forceCloseModal()" class="w-full rounded-xl bg-slate-100 p-3">إلغاء</button></div>');
}
async function saveRates(){
 const next={...rates()},general=Number(document.getElementById('ta147GeneralUsd')?.value),oldGeneral=State.settings.exchangeRate,prior=rates();
 try{
  if(!validPrice(general))throw Error('سعر الدولار العام غير صالح');
  for(const c of codes()){
   const buyText=document.getElementById('ta147Buy_'+c)?.value.trim()||'';
   const sellText=document.getElementById('ta147Sell_'+c)?.value.trim()||'';
   if(!buyText&&!sellText)continue;
   if(!buyText||!sellText)throw Error('أدخل سعر الشراء والمبيع للعملة '+c);
   const buy=Number(buyText),sell=Number(sellText);
   if(!validPrice(buy)||!validPrice(sell))throw Error('سعر غير صالح للعملة '+c);
   next[c]={buy,sell};
  }
  State.settings.exchangeRate=general;State.settings.currencyExchangeRatesSyp=next;
  try{await StorageEngine.saveState();}
  catch(e){State.settings.exchangeRate=oldGeneral;State.settings.currencyExchangeRatesSyp=prior;throw e;}
  const heading=document.getElementById('topBarRate');
  if(heading)heading.textContent=general.toLocaleString('en-US');
  UI.forceCloseModal();
  UI.toast('تم حفظ أسعار الصرف لجميع العملات','success');
  if(typeof AppNav!=='undefined'){
   if(AppNav.current()?.screen==='invoice_form'&&typeof InvoiceController!=='undefined'&&InvoiceController.draft)
    InvoiceController.updateExchangeRate(general,true);
   else AppNav.renderCurrent();
  }
 }catch(e){UI.toast('تعذر حفظ الأسعار: '+e.message,'error');}
}
function profitDetails(){
 const report=E.analyze(State.currencyExchanges||[]);
 const operations=[...report.byId.values()].filter(x=>x.gainSyp!==null && x.gainSyp!==0).reverse();
 const items=operations.slice(0,100).map(e=>
   '<div class="flex justify-between gap-3 py-2 border-b border-slate-100 text-xs"><span>'+
   esc(String(e.date||'').slice(0,10))+' • '+esc(e.fromCurrency)+' → '+esc(e.toCurrency)+
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
  return list.length?list.map(c=>'<div class="rounded-xl border border-sky-100 bg-white p-2 mb-2">'+
    '<div class="flex justify-between items-center gap-2"><strong class="text-xs">'+esc(c.name)+' ('+esc(c.code)+')</strong>'+
    '<button type="button" class="text-rose-700 text-xs font-bold" onclick="SettingsController.removeCatalogCurrency(\''+esc(c.code)+'\')">إزالة</button></div>'+
    '<div class="text-[11px] font-bold text-indigo-800 mt-2">سعر الصرف '+esc(c.code)+' مقابل الليرة السورية</div>'+
    '<div class="text-[11px] text-slate-600">شراء: '+money(rates()[c.code]?.buy||0,'SYP')+' • مبيع: '+money(rates()[c.code]?.sell||0,'SYP')+'</div>'+
    '<button type="button" onclick="TiqanyFx147.editRates()" class="mt-2 w-full bg-indigo-700 text-white text-xs font-bold rounded-xl p-2"><i class="fas fa-coins ml-1"></i> سعر الصرف — تعديل الشراء والمبيع</button></div>').join(''):'<p class="text-xs text-slate-500">لم تُضف عملات جديدة.</p>';
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
  return result;
 };
}
const originalEdit=U.newForm;
U.newForm=function(editId=''){return editId?originalEdit(editId):chooser();};
U.ratesForm=unifiedRates;
if(UI.openRateModal)UI.openRateModal=unifiedRates;
if(typeof Views!=='undefined'&&typeof Views.renderReports==='function'){
 const previous=Views.renderReports;
 Views.renderReports=function(main,params,...args){
  const out=previous.call(this,main,params,...args);
  augmentReports(main,params);
  return out;
 };
}
root.TiqanyFx147={chooser,trade,saveTrade,editRates:unifiedRates,saveRates,profitDetails,codes,current};
})(typeof window==='object'?window:globalThis);
