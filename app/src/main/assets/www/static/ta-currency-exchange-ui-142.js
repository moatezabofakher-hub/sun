/* Tiqany Acc v142: exchange entry, invoices register, cashbox and P&L hooks. */
(function(){
'use strict';
const E=window.TiqanyCurrencyExchangeCore;
if(!E||typeof Views==='undefined'||typeof UI==='undefined')return;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,c)=>Number(v||0).toLocaleString('en-US',{maximumFractionDigits:c==='SYP'?0:2})+' '+c;
const rows=()=>Array.isArray(State.currencyExchanges)?State.currencyExchanges:(State.currencyExchanges=[]);
const currencies=()=>{
  const standard=(typeof CurrencyCatalog!=='undefined'?CurrencyCatalog.active():['USD','SYP']);
  const extra=(State.settings.addedCurrencies||[]).map(c=>String(c.code||'').toUpperCase()).filter(c=>/^[A-Z]{3}$/.test(c));
  return [...new Set([...standard,...extra])];
};

const exchangeRates=()=>State.settings?.currencyExchangeRatesSyp||{};
function ratesForm(){
 const list=currencies().filter(c=>c!=='SYP');
 if(!list.length)return UI.toast('فعّل عملة أجنبية أولاً','warn');
 const current=exchangeRates();
 const cards=list.map(c=>'<div class="rounded-xl bg-white border border-sky-200 p-3">'+
  '<h4 class="font-black text-slate-900">'+esc(c)+' مقابل الليرة السورية</h4>'+
  '<label class="block text-xs font-bold mt-2">سعر الشراء (الليرات المدفوعة لشراء وحدة '+esc(c)+')</label>'+
  '<input id="taFxRateBuy_'+c+'" type="number" min="0" step="any" inputmode="decimal" autocomplete="off" class="w-full border rounded-lg p-2" placeholder="سعر الشراء" value="'+esc(current[c]?.buy??'')+'">'+
  '<label class="block text-xs font-bold mt-2">سعر المبيع (الليرات المقبوضة عند بيع وحدة '+esc(c)+')</label>'+
  '<input id="taFxRateSell_'+c+'" type="number" min="0" step="any" inputmode="decimal" autocomplete="off" class="w-full border rounded-lg p-2" placeholder="سعر المبيع" value="'+esc(current[c]?.sell??'')+'"></div>').join('');
 UI.openModal('<div dir="rtl" class="text-right space-y-3"><h3 class="text-lg font-black">سعر الصرف</h3>'+
  '<p class="text-xs text-slate-600">سعر شراء ومبيع كل عملة مقابل الليرة السورية. تُطبق الأسعار عند إنشاء تصريف جديد، وتبقى العمليات السابقة بقيمها المحفوظة.</p>'+
  '<div class="max-h-[55vh] overflow-y-auto space-y-2">'+cards+'</div>'+
  '<button type="button" class="ta-primary-3d w-full rounded-xl p-3 bg-emerald-700 text-white font-black" onclick="TiqanyFxUI.saveRates()">حفظ أسعار الصرف</button>'+
  '<button type="button" class="w-full rounded-xl p-3 bg-slate-100" onclick="UI.forceCloseModal()">إلغاء</button></div>');
}
async function saveRates(){
 const existing=exchangeRates(),next={...existing};let count=0;
 try{
  for(const c of currencies().filter(c=>c!=='SYP')){
   const buyText=document.getElementById('taFxRateBuy_'+c)?.value.trim()||'';
   const sellText=document.getElementById('taFxRateSell_'+c)?.value.trim()||'';
   if(!buyText&&!sellText){delete next[c];continue;}
   const buy=Number(buyText),sell=Number(sellText);
   if(!(Number.isFinite(buy)&&buy>0&&Number.isFinite(sell)&&sell>0&&buy<1e12&&sell<1e12))
     throw Error('أدخل سعر شراء ومبيع صالحين للعملة '+c);
   next[c]={buy,sell};count++;
  }
  if(!count)throw Error('أدخل أسعار عملة واحدة على الأقل');
  State.settings.currencyExchangeRatesSyp=next;
  try{await StorageEngine.saveState();}
  catch(err){State.settings.currencyExchangeRatesSyp=existing;throw err;}
  UI.toast('تم حفظ أسعار الشراء والمبيع','success');UI.forceCloseModal();
 }catch(err){UI.toast('تعذر حفظ سعر الصرف: '+err.message,'error');}
}

const baseCash=typeof FieldCash!=='undefined'?FieldCash:(typeof SoloCashbox!=='undefined'?SoloCashbox:(window.FieldCash||window.SoloCashbox));
let rawSummary=null;
if(baseCash&&typeof baseCash.summary==='function'){
 rawSummary=baseCash.summary.bind(baseCash);
 baseCash.summary=function(scope='all'){
   const data=rawSummary(scope);
   const fx=E.analyze(rows(),scope);
   const values={SYP:Number(data.sypCash)||0,USD:Number(data.usdCash)||0};
   for(const m of fx.movements)values[m.currency]=(Number(values[m.currency])||0)+m.inflow-m.outflow;
   // Keep exact negative historical balances; never hide an out-of-balance book.
   for(const c of Object.keys(values))values[c]=Math.round((values[c])*E.scale(c))/E.scale(c);
   return {...data,sypCash:values.SYP||0,usdCash:values.USD||0,otherCurrencies:values,
     movements:[...(data.movements||[]),...fx.movements].sort((a,b)=>String(b.date).localeCompare(String(a.date)))};
 };
}
function cashAvailable(c){
 const b=baseCash?.summary?.('office');
 if(!b)return 0;
 return c==='SYP'?Number(b.sypCash)||0:c==='USD'?Number(b.usdCash)||0:Number(b.otherCurrencies?.[c])||0;
}
function choose(list,id){return '<select id="'+id+'" class="w-full border border-slate-300 rounded-xl bg-white p-3 text-sm">'+list.map(c=>'<option value="'+esc(c)+'">'+esc(typeof CurrencyCatalog!=='undefined'?CurrencyCatalog.label(c):c)+'</option>').join('')+'</select>';}
function input(id,title,required=true){
 return '<label class="block text-xs font-bold text-slate-800 mb-1">'+title+'</label><input id="'+id+'" class="w-full p-3 rounded-xl border border-slate-300 mb-2" type="number" min="0" step="any" inputmode="decimal" '+(required?'required ':'')+'autocomplete="off">';
}
function newForm(editId=''){
 const old=editId?rows().find(x=>x.id===editId):null;
 if(editId&&(!old||old.agentId))return UI.toast('لا يمكن تعديل عملية موظف البيع المرحّلة من المدير','warn');
 const active=currencies();
 if(active.length<2)return UI.toast('فعّل عملتين أولاً','warn');
 UI.openModal('<div dir="rtl" class="text-right space-y-2">'+
 '<h3 class="text-lg font-black text-slate-900">'+(old?'تعديل عملية التصريف':'تصريف عملة')+'</h3>'+
 '<input type="hidden" id="taFxEditId" value="'+esc(old?.id||'')+'">'+
 '<p class="text-xs text-slate-600">يمكن تغيير سعر شراء ومبيع العملة من هذه العملية. تتأثر العملية الحالية، ويُحفظ السعر الجديد للعمليات التالية بعد تأكيد الحفظ.</p>'+
 '<label class="block text-xs font-bold">العملة التي ندفع بها</label>'+choose(active,'taFxFrom')+
 '<label class="block text-xs font-bold">العملة التي نشتريها</label>'+choose(active,'taFxTo')+
 input('taFxSpent','المبلغ المدفوع')+
 '<div id="taFxRatePane" class="rounded-xl p-3 border border-indigo-200 bg-indigo-50 space-y-2" data-changed="0">'+
 '<div id="taFxSellRateBlock"><label class="block text-xs font-bold" id="taFxSellRateLabel">سعر مبيع العملة المدفوعة مقابل الليرة</label>'+
 '<input type="number" min="0.000001" step="any" id="taFxSellRate" inputmode="decimal" autocomplete="off" class="w-full border rounded-lg p-3"></div>'+
 '<div id="taFxBuyRateBlock"><label class="block text-xs font-bold" id="taFxBuyRateLabel">سعر شراء العملة المستلمة مقابل الليرة</label>'+
 '<input type="number" min="0.000001" step="any" id="taFxBuyRate" inputmode="decimal" autocomplete="off" class="w-full border rounded-lg p-3"></div></div>'+
 input('taFxReceived','المبلغ المستلم')+
 '<p id="taFxQuoteHint" class="text-xs text-teal-800 bg-teal-50 p-2 rounded-lg"></p>'+
 '<div id="taFxSypEquiv">'+input('taFxEquivalent','القيمة المكافئة بالليرة السورية')+'</div>'+
 '<label class="block text-xs font-bold">بيان (اختياري)</label><input id="taFxNote" maxlength="200" class="w-full border rounded-xl p-3">'+
 '<p id="taFxBalance" class="text-xs font-bold rounded-xl bg-sky-50 text-sky-900 p-3"></p>'+
 '<p id="taFxCostPreview" class="text-xs font-bold rounded-xl bg-emerald-50 text-emerald-900 p-3"></p>'+
 '<button type="button" class="ta-primary-3d w-full rounded-xl p-3 bg-emerald-700 text-white font-black" onclick="TiqanyFxUI.save()">'+(old?'حفظ تعديل التصريف':'حفظ عملية التصريف')+'</button>'+
 '<button type="button" class="w-full rounded-xl p-3 bg-slate-100" onclick="UI.forceCloseModal()">إلغاء</button></div>');
 const el=id=>document.getElementById(id);
 const from=el('taFxFrom'),to=el('taFxTo'),paid=el('taFxSpent');
 const received=el('taFxReceived'),equivalent=el('taFxEquivalent');
 const quoteHint=el('taFxQuoteHint'),ratePane=el('taFxRatePane');
 const sellRate=el('taFxSellRate'),buyRate=el('taFxBuyRate');
 const rateValue=(c,side)=>{
  const stored=Number(exchangeRates()?.[c]?.[side]);
  const prior=old?.fxRatesUsed||{};
  if(old?.fromCurrency===c&&side==='sell'){
   const recorded=Number(prior.fromSell);
   if(recorded>0)return recorded;
   if(old.toCurrency==='SYP')return old.equivalentSyp/old.fromAmount;
  }
  if(old?.toCurrency===c&&side==='buy'){
   const recorded=Number(prior.toBuy);
   if(recorded>0)return recorded;
   if(old.fromCurrency==='SYP')return old.equivalentSyp/old.toAmount;
  }
  return stored>0?stored:'';
 };
 const refreshRateControls=()=>{
  const c=from.value,d=to.value;
  el('taFxSellRateBlock').hidden=c==='SYP';
  el('taFxBuyRateBlock').hidden=d==='SYP';
  el('taFxSellRateLabel').textContent='سعر مبيع '+c+' مقابل الليرة السورية';
  el('taFxBuyRateLabel').textContent='سعر شراء '+d+' مقابل الليرة السورية';
  sellRate.value=c==='SYP'?'':rateValue(c,'sell');
  buyRate.value=d==='SYP'?'':rateValue(d,'buy');
  ratePane.dataset.changed='0';
 };
 const effectiveRates=()=>{
  const c=from.value,d=to.value,r={...exchangeRates()};
  if(c!=='SYP'){
   const n=Number(sellRate.value);
   if(!(n>0&&Number.isFinite(n)))throw Error('سعر مبيع '+c+' غير صالح');
   r[c]={...(r[c]||{}),sell:n};
  }
  if(d!=='SYP'){
   const n=Number(buyRate.value);
   if(!(n>0&&Number.isFinite(n)))throw Error('سعر شراء '+d+' غير صالح');
   r[d]={...(r[d]||{}),buy:n};
  }
  return r;
 };
 const update=()=>{
  const c=from.value,d=to.value;
  el('taFxSypEquiv').hidden=c==='SYP'||d==='SYP';
  const availableCash=cashAvailable(c)+(old?.fromCurrency===c?old.fromAmount:0)-(old?.toCurrency===c?old.toAmount:0);
  el('taFxBalance').textContent='رصيد الصندوق المتاح بعد عكس العملية السابقة: '+fmt(availableCash,c);
  const p=el('taFxCostPreview');
  const fromAmount=Number(paid.value),toAmount=Number(received.value);
  const equivalentSyp=c==='SYP'?fromAmount:d==='SYP'?toAmount:Number(equivalent.value);
  if(!(fromAmount>0&&toAmount>0&&equivalentSyp>0)){p.textContent='أدخل المبالغ لعرض التكلفة والربح.';return;}
  try{
   const id=old?.id||'fx_preview_00000000';
   const preview=E.prepare({id,date:old?.date||new Date().toISOString(),fromCurrency:c,toCurrency:d,fromAmount,toAmount,equivalentSyp},active);
   const candidate=old?rows().map(e=>e.id===id?preview:e):[...rows(),preview];
   const result=E.analyze(candidate).byId.get(id);
   p.textContent='المغطى: '+fmt(result.coveredAmount,c)+' | المعلّق: '+fmt(result.pendingAmount,c)+
     ' | الربح الحالي: '+(result.gainSyp===null?'0 SYP (تكلفة مؤجلة)':fmt(result.gainSyp,'SYP'));
  }catch(err){p.textContent='تعذّر حساب المعاينة: '+err.message;}
 };
 const quote=()=>{
  try{
   const q=E.quote(from.value,to.value,Number(paid.value),effectiveRates());
   received.value=q.toAmount;equivalent.value=q.equivalentSyp;
   received.readOnly=true;equivalent.readOnly=true;
   quoteHint.textContent='السعر المعتمد للعملية: '+fmt(q.fromAmount,from.value)+' = '+fmt(q.toAmount,to.value);
  }catch(err){
   received.readOnly=false;equivalent.readOnly=false;
   quoteHint.textContent='أدخل سعر شراء/مبيع صالحاً لحساب المبالغ تلقائياً، أو أدخل المبلغ المستلم يدوياً.';
  }
  update();
 };
 from.addEventListener('change',()=>{refreshRateControls();quote();});
 to.addEventListener('change',()=>{refreshRateControls();quote();});
 paid.addEventListener('input',quote);
 for(const rate of [sellRate,buyRate])rate.addEventListener('input',()=>{ratePane.dataset.changed='1';quote();});
 received.addEventListener('input',update);equivalent.addEventListener('input',update);
 if(old){
  from.value=old.fromCurrency;to.value=old.toCurrency;
  paid.value=old.fromAmount;received.value=old.toAmount;equivalent.value=old.equivalentSyp;
  el('taFxNote').value=old.note||'';
 }else if(to.options.length>1)to.selectedIndex=1;
 refreshRateControls();
 if(old){
  quoteHint.textContent='أسعار العملية السابقة محفوظة؛ تعديل السعر هنا يعيد حساب العملية فقط بعد الحفظ.';
  update();
 }else quote();
}

let saving=false;
async function save(){
 if(saving)return;
 const val=id=>document.getElementById(id)?.value;
 const editId=val('taFxEditId')||'';
 const old=editId?rows().find(x=>x.id===editId):null;
 const fromCurrency=val('taFxFrom'),toCurrency=val('taFxTo');
 const fromAmount=Number(val('taFxSpent')),toAmount=Number(val('taFxReceived'));
 const equivalentSyp=fromCurrency==='SYP'?fromAmount:toCurrency==='SYP'?toAmount:Number(val('taFxEquivalent'));
 try{
  if(editId&&(!old||old.agentId))throw Error('عملية التصريف غير قابلة للتعديل من المدير');
  const id=old?.id||'fx_'+(typeof FieldProtocol!=='undefined'?FieldProtocol.uuid():crypto.randomUUID().replace(/-/g,''));
  const e=E.prepare({id,fromCurrency,toCurrency,fromAmount,toAmount,equivalentSyp,
    date:old?.date||new Date().toISOString(),agentId:'',source:old?.source||'manager',note:val('taFxNote')||''},currencies());
  const ratesBefore=exchangeRates(),newRates={...ratesBefore};
  const rateChanged=document.getElementById('taFxRatePane')?.dataset.changed==='1';
  const sellRate=fromCurrency==='SYP'?null:Number(val('taFxSellRate'));
  const buyRate=toCurrency==='SYP'?null:Number(val('taFxBuyRate'));
  if(rateChanged){
   if(fromCurrency!=='SYP'&&!(Number.isFinite(sellRate)&&sellRate>0&&sellRate<1e12))
    throw Error('سعر المبيع غير صالح');
   if(toCurrency!=='SYP'&&!(Number.isFinite(buyRate)&&buyRate>0&&buyRate<1e12))
    throw Error('سعر الشراء غير صالح');
   const changed={...ratesBefore};
   if(fromCurrency!=='SYP')changed[fromCurrency]={...(changed[fromCurrency]||{}),sell:sellRate};
   if(toCurrency!=='SYP')changed[toCurrency]={...(changed[toCurrency]||{}),buy:buyRate};
   const quote=E.quote(fromCurrency,toCurrency,fromAmount,changed);
   if(Math.abs(quote.toAmount-toAmount)>1/E.scale(toCurrency)+1e-6||Math.abs(quote.equivalentSyp-equivalentSyp)>1)
    throw Error('المبالغ لا تطابق سعر الصرف المعدل');
   Object.assign(newRates,changed);
  }
  e.fxRatesUsed={fromSell:sellRate>0?sellRate:null,toBuy:buyRate>0?buyRate:null};
  if(!old&&rows().some(x=>x.id===e.id))throw Error('العملية مكررة');
  // Reverse the previous legs before applying edited legs, atomically.
  // Validate ALL impacted currencies, not just the newly-paid currency.
  const delta=new Map(),adjust=(c,n)=>delta.set(c,(delta.get(c)||0)+n);
  if(old){adjust(old.fromCurrency,old.fromAmount);adjust(old.toCurrency,-old.toAmount);}
  adjust(e.fromCurrency,-e.fromAmount);adjust(e.toCurrency,e.toAmount);
  for(const [currency,amount] of delta)
    if(cashAvailable(currency)+amount< -1e-6)throw Error('رصيد صندوق '+currency+' غير كافٍ بعد تعديل التصريف');
  const previous=rows();
  const candidate=old?previous.map(x=>x.id===old.id?e:x):[...previous,e];
  E.analyze(candidate);
  saving=true;State.currencyExchanges=candidate;
  if(rateChanged)State.settings.currencyExchangeRatesSyp=newRates;
  try{await StorageEngine.saveState();}
  catch(err){State.currencyExchanges=previous;if(rateChanged)State.settings.currencyExchangeRatesSyp=ratesBefore;throw err;}
  UI.toast(old?'تم تحديث التصريف وأرصدة الصناديق والأرباح':'تم حفظ التصريف في الصندوقين','success');
  if(old)list();else UI.forceCloseModal();
  AppNav.renderCurrent();
 }catch(err){UI.toast('تعذر حفظ التصريف: '+err.message,'error');}
 finally{saving=false;}
}

async function removeExchange(id){
 if(saving)return;
 const old=rows().find(x=>x.id===id);
 if(!old||old.agentId)return UI.toast('عملية موظف البيع المرحّلة لا تُحذف من المدير حفاظاً على المزامنة','warn');
 if(!window.confirm('حذف عملية التصريف نهائياً؟ ستُعكس حركتا الصندوق ويُعاد حساب أرباح التصريف والتكاليف المؤجلة.'))return;
 try{
  // Removal reverses BOTH cash legs; reject if later spending needs the received money.
  if(cashAvailable(old.toCurrency)-old.toAmount < -1e-6)
   throw Error('لا يمكن حذف العملية: رصيد '+old.toCurrency+' غير كافٍ لعكس المبلغ المستلم');
  const before=rows(),next=before.filter(e=>e.id!==id);
  E.analyze(next);
  saving=true;State.currencyExchanges=next;
  try{await StorageEngine.saveState();}
  catch(err){State.currencyExchanges=before;throw err;}
  UI.toast('تم حذف التصريف وعكس القيود وإعادة حساب الأرباح','success');
  list();AppNav.renderCurrent();
 }catch(err){UI.toast('تعذر حذف التصريف: '+err.message,'error');}
 finally{saving=false;}
}

function list(){
 const history=E.analyze(rows());
 const entries=[...history.byId.values()].reverse(),totals=new Map();
 for(const e of entries){
  if(!totals.has(e.fromCurrency))totals.set(e.fromCurrency,{sold:0,bought:0});
  if(!totals.has(e.toCurrency))totals.set(e.toCurrency,{sold:0,bought:0});
  totals.get(e.fromCurrency).sold+=e.fromAmount;
  totals.get(e.toCurrency).bought+=e.toAmount;
 }
 const summary=[...totals.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([c,t])=>
  '<div class="rounded-lg bg-slate-50 border p-2"><b>'+esc(c)+'</b> · إجمالي المتداول '+fmt(t.sold+t.bought,c)+
  '<div class="text-xs">مدفوع '+fmt(t.sold,c)+' · مستلم '+fmt(t.bought,c)+'</div></div>').join('');
 UI.openModal('<div dir="rtl" class="space-y-3 text-right">'+
 '<h3 class="text-lg font-black">عمليات التصريف ('+entries.length+')</h3>'+
 '<div class="rounded-xl border border-sky-300 p-3 bg-white"><h4 class="font-black mb-2">إجمالي المبالغ المتداولة حسب العملة</h4>'+
 (summary||'<p class="text-slate-500">لا يوجد تداول بعد</p>')+'</div>'+
 '<button type="button" class="ta-primary-3d w-full bg-emerald-700 text-white rounded-xl p-3 font-bold" onclick="TiqanyFxUI.newForm()">＋ تصريف عملة جديد</button>'+
 '<div class="max-h-[55vh] overflow-y-auto">'+(entries.length?entries.map(e=>
 '<div class="rounded-xl border p-3 mb-2 text-xs bg-white"><b>'+esc(e.id.slice(-10))+' · '+esc(window.TiqanyReportDate148?.localClock(e.date)||e.date.slice(0,16).replace('T',' '))+'</b>'+
 '<div class="mt-2 text-rose-700">− '+fmt(e.fromAmount,e.fromCurrency)+'</div>'+
 '<div class="text-emerald-700">+ '+fmt(e.toAmount,e.toCurrency)+'</div>'+
 (e.agentId?'<div>موظف البيع: '+esc((State.fieldSync?.agents||[]).find(a=>a.id===e.agentId)?.name||e.agentId)+'</div>':'')+
 '<div>تكلفة الجزء المباع: '+(e.costOfSoldSyp===null?'غير محددة':fmt(e.costOfSoldSyp,'SYP'))+'</div>'+
 (e.fromCurrency!=='SYP'?'<div>المغطى بتكلفة معروفة: '+fmt(e.coveredAmount,e.fromCurrency)+' · غير المغطى: '+fmt(e.uncoveredAmount,e.fromCurrency)+'</div>':'')+
 (e.pendingAmount>0?'<div class="text-amber-700">ربح كمية معلقة: 0 SYP · بانتظار شراء '+fmt(e.pendingAmount,e.fromCurrency)+'</div>':'')+
 (e.deferredCoveredAmount>0?'<div class="text-emerald-700">تسوية مبيعات سابقة: '+fmt(e.deferredCoveredAmount,e.toCurrency)+' · ربح/خسارة التسوية: '+fmt(e.deferredGainSyp,'SYP')+'</div>':'')+
 '<div class="font-bold">أرباح التصريف: '+(e.gainSyp===null?'0 SYP (لم تُعرف تكلفة الشراء بعد)':fmt(e.gainSyp,'SYP'))+'</div>'+
 '<div class="text-slate-500">'+esc(e.note||'')+'</div>'+
 (e.agentId?'<div class="text-amber-700">عملية موظف البيع مرحّلة للمدير (للقراءة فقط)</div>':
 '<div class="flex gap-2 mt-2"><button type="button" class="flex-1 rounded-lg border p-2 bg-blue-700 text-white" onclick="TiqanyFxUI.edit(\''+esc(e.id)+'\')">تعديل العملية</button>'+
 '<button type="button" class="ta-fx-delete-149 flex-1 rounded-lg border p-2 bg-red-700 text-white font-black" style="background:#b91c1c!important;color:#fff!important;border:2px solid #991b1b!important;box-shadow:0 4px 0 #7f1d1d!important" onclick="TiqanyFxUI.remove(\''+esc(e.id)+'\')"><i class="fas fa-trash-alt ml-2" aria-hidden="true"></i> حذف العملية</button></div>')+
 '</div>').join(''):'<p class="text-slate-500">لا توجد عمليات تصريف مسجلة</p>')+'</div>'+
 '<button type="button" class="w-full bg-slate-100 p-3 rounded-xl" onclick="UI.forceCloseModal()">رجوع</button></div>');
}
const oldDash=Views.renderDashboard;
if(typeof oldDash==='function')Views.renderDashboard=function(main,...args){
 const result=oldDash.call(this,main,...args),grid=main.querySelector('.ta-action-grid');
 if(grid)grid.insertAdjacentHTML('beforeend','<button type="button" class="ta-action-card ta-quick-exchange" onclick="TiqanyFxUI.newForm()" style="background:linear-gradient(135deg,#e0f7ff,#bcf7d2);border:2px solid #28a682"><span class="ta-icon-box ta-tone-teal"><img src="static/ta-fx-exchange-146.svg" alt="" width="70" height="70" style="width:70px;height:70px;max-width:100%;object-fit:contain;filter:drop-shadow(0 3px 3px #12496255)" /></span><span class="ta-card-footer"><strong>تصريف عملة</strong></span></button>');
 if(grid)grid.insertAdjacentHTML('beforeend','<button type="button" class="ta-action-card ta-quick-fx-rates" onclick="TiqanyFxUI.ratesForm()" style="background:linear-gradient(135deg,#e0edff,#d5e5ff);border:2px solid #507cdb"><span class="ta-icon-box ta-tone-blue"><img src="static/ta-fx-rates-146.svg" alt="" width="70" height="70" style="width:70px;height:70px;max-width:100%;object-fit:contain;filter:drop-shadow(0 3px 3px #294d8355)" /></span><span class="ta-card-footer"><strong>سعر الصرف</strong></span></button>');
 return result;
};
const oldList=Views.renderInvoicesList;
if(typeof oldList==='function')Views.renderInvoicesList=function(main,...args){
 const result=oldList.call(this,main,...args);
 main.insertAdjacentHTML('afterbegin','<button type="button" onclick="TiqanyFxUI.list()" class="ta-primary-3d w-full rounded-xl p-3 mb-3 bg-sky-700 text-white font-black"><i class="fas fa-money-bill-transfer ml-2"></i> عمليات التصريف ('+rows().length+')</button>');
 return result;
};
const oldReport=Views.renderReports;
if(typeof oldReport==='function')Views.renderReports=function(main,params,...args){
 const result=oldReport.call(this,main,params,...args);
 const netBoxes=baseCash?.summary?.('all')||{sypCash:0,usdCash:0,otherCurrencies:{}};
 const balances=netBoxes.otherCurrencies||{};
 const tradedCodes=currencies().filter(c=>c!=='SYP'&&c!=='USD'&&
   rows().some(e=>e.fromCurrency===c||e.toCurrency===c));
 const cards=['SYP','USD',...new Set(tradedCodes)].map((code,index)=>{
   const label=code==='SYP'?'الرصيد ل.س':code==='USD'?'الرصيد دولار':'رصيد '+code;
   const value=code==='SYP'?netBoxes.sypCash:code==='USD'?netBoxes.usdCash:balances[code];
   const background=index===0?'bg-emerald-700':index===1?'bg-slate-900':'bg-blue-900';
   return '<div class="'+background+' text-white p-3 rounded-2xl"><span class="block text-xs font-bold mb-1">'+esc(label)+'</span><strong class="block text-base sm:text-lg font-extrabold" dir="auto">'+esc(fmt(value||0,code))+'</strong></div>';
 }).join('');
 main.insertAdjacentHTML('afterbegin','<div class="space-y-2 mb-3">'+CapitalLedger.card()+
   '<div class="grid grid-cols-2 gap-2.5">'+cards+'</div></div>');

 if((params?.tab||'cashbox')==='pnl'){
   // Realized profit is computed from persisted FX events, including deferred
   // matching on a later buy. It is already included ONCE in the net P&L,
   // so this tile only explains the amount; it never adds another posting.
   const report=E.analyze(rows());
   const period=TimeFilter.mode(params?.period||TimeFilter.defaultMode());
   const date=params?.date||TimeFilter.defaultStart();
   const end=params?.end||TimeFilter.defaultEnd();
   const scope=typeof ReportAgentFilter!=='undefined'
      ?ReportAgentFilter.active(params?.agentId):(params?.agentId||'all');
   const matched=[...report.byId.values()].filter(e=>
     e.gainSyp!==null&&TimeFilter.matches(e.date,period,date,end)&&
     (scope==='all'||scope===(e.agentId||'office')));
   const profit=Math.round(matched.reduce((n,e)=>n+e.gainSyp,0)*100)/100;
   const currentRate=Number(State.settings.exchangeRate)||1;
   const pending=Object.entries(report.pendingSales||{}).filter(([,v])=>v.quantity>0)
     .map(([c,v])=>fmt(v.quantity,c)).join(' · ');
   const details=matched.filter(e=>e.gainSyp!==0).slice(-12).reverse();
   const body='<section data-ta-fx-profit-report="true" class="rounded-2xl border border-teal-300 bg-teal-50 p-3 mb-3 text-right" dir="rtl">'+
      '<div class="flex justify-between gap-3 items-center"><strong class="text-teal-900 text-sm">أرباح التصريف</strong>'+
      '<strong class="text-base '+(profit<0?'text-rose-700':'text-emerald-700')+'">'+fmt(profit,'SYP')+'</strong></div>'+
      '<div class="text-xs text-teal-800">المقابل التوضيحي: '+fmt(profit/currentRate,'USD')+'</div>'+
      '<div class="text-xs font-bold text-slate-700 mt-1">إجمالي أرباح التصريف لجميع الفترات: '+fmt(report.profitSyp,'SYP')+'</div>'+
      '<p class="text-xs text-teal-800 mt-2">صافي الربح = أرباح المبيعات + أرباح التصريف المحققة − المصاريف. لا تُعد مبالغ شراء العملة مصاريف.</p>'+
      (pending?'<p class="text-xs font-bold text-amber-800 mt-2">كمية تنتظر تسوية التكلفة: '+esc(pending)+'؛ ربحها الحالي صفر.</p>':'')+
      (details.length?'<div class="mt-2 pt-2 border-t border-teal-200 space-y-1">'+
      details.map(e=>'<div class="flex justify-between gap-2 text-xs border-b border-teal-100 py-1"><span>'+
        esc(window.TiqanyReportDate148?.calendarDate(e.date)||String(e.date||'').slice(0,10))+' · '+(e.deferredCoveredAmount>0?'تسوية بيع سابق':'تصريف عملة')+
        '</span><b class="'+(e.gainSyp<0?'text-rose-700':'text-emerald-800')+'">'+fmt(e.gainSyp,'SYP')+'</b></div>').join('')+
      '</div>':'<p class="text-xs text-slate-600 mt-2">لا توجد أرباح تصريف محققة ضمن الفترة المحددة.</p>')+
      '</section>';
   const expenses=main.querySelector('.bg-orange-50');
   const before=expenses?.parentElement;
   if(before?.parentElement===main)before.insertAdjacentHTML('beforebegin',body);
   else main.insertAdjacentHTML('afterbegin',body);
 }
 return result;
};
function stageAgentExchanges(operations,agent){
 const candidate=rows().slice(),found=new Set(candidate.map(x=>x.id)),accepted=[],rateChanges=[];
 const base=baseCash?.summary?.(agent.id)||{};
 const till={...base.otherCurrencies,SYP:Number(base.sypCash)||0,USD:Number(base.usdCash)||0};
 const signed=(kind,c,amt)=>{
   if(!c||!Number.isFinite(Number(amt)))return;
   till[c]=(Number(till[c])||0)+(kind==='in'?1:-1)*Number(amt);
 };
 const ordered=(operations||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id)));
 for(const raw of ordered){
  if(raw.kind==='fx_rate_change'){
   if(agent?.permissions?.fxSharedRate!==true)throw Error('موظف البيع غير مخوّل بتعديل أسعار التصريف');
   const rates=raw.rates||{},codes=Object.keys(rates);
   if(!codes.length||codes.length>32)throw Error('أسعار صرف غير مكتملة');
   const cleaned={};
   for(const code of codes){
    const r=rates[code]||{},change={};
    if(!/^[A-Z]{3}$/.test(code)||code==='SYP')throw Error('رمز عملة غير صالح');
    for(const side of ['buy','sell'])if(Object.prototype.hasOwnProperty.call(r,side)){
      const n=Number(r[side]);
      if(!Number.isFinite(n)||n<=0||n>=1e12)throw Error('سعر صرف غير صالح');
      change[side]=n;
    }
    if(!Object.keys(change).length)throw Error('تعديل سعر صرف فارغ');
    cleaned[code]=change;
   }
   rateChanges.push(cleaned);
   continue;
  }
  if(raw.kind==='currency_exchange'){
   if(raw.agentId!==agent.id)throw Error('محاولة تصريف من صندوق موظف آخر');
   const e=E.prepare(raw,currencies());
   if(found.has(e.id))throw Error('معرف عملية التصريف مكرر');
   if(e.fromAmount>Number(till[e.fromCurrency]||0)+0.000001)
     throw Error('رصيد صندوق موظف البيع غير كافٍ لتصريف '+e.fromCurrency);
   signed('out',e.fromCurrency,e.fromAmount);
   signed('in',e.toCurrency,e.toAmount);
   accepted.push({...e,source:'agent',agentId:agent.id,
     fieldOrigin:{agentId:agent.id,agentName:agent.name,operationId:e.id,localNumber:raw.localNumber||'',receivedAt:new Date().toISOString()}});
   found.add(e.id);
  }else if(raw.kind==='sale'||raw.kind==='receipt'){
   signed('in',raw.currency,raw.kind==='sale'?raw.paidAmount:raw.amount);
  }else if(['sale_return','payment','expense'].includes(raw.kind)){
   signed('out',raw.currency,raw.kind==='sale_return'?raw.paidAmount:raw.amount);
  }
 }
 if(accepted.length){
   E.analyze([...candidate,...accepted]);
   State.currencyExchanges=[...candidate,...accepted];
 }
 if(rateChanges.length){
   const next={...exchangeRates()};
   for(const rates of rateChanges)for(const [currency,value] of Object.entries(rates))
     next[currency]={...(next[currency]||{}),...value};
   State.settings.currencyExchangeRatesSyp=next;
 }
 return accepted.length+rateChanges.length;
}

if(!document.getElementById('taFxCapitalGreen142')){
 const st=document.createElement('style');st.id='taFxCapitalGreen142';
 st.textContent='.ta-capital-card{background:linear-gradient(145deg,#198c51,#07572f)!important;color:#fff!important;border-color:#38ac77!important;box-shadow:0 6px 0 #04452a,0 10px 18px #023e2633!important}.ta-capital-card .ta-capital-card-text strong,.ta-capital-card .ta-capital-card-text small,.ta-capital-card .ta-capital-amount,.ta-capital-card .ta-capital-divider,.ta-capital-card>i{color:#fff!important}.ta-capital-card .ta-capital-icon{background:linear-gradient(145deg,#157e49,#07552e)!important;color:#fff!important;border-color:#35ac78!important}';
 document.head.appendChild(st);
}
window.TiqanyFxUI={newForm,edit:newForm,save,list,remove:removeExchange,ratesForm,saveRates,stageAgentExchanges,core:E};
})();