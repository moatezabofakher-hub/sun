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
 if(editId&&(!old||old.agentId))return UI.toast('لا يمكن تعديل عملية موظف البيع المرحّلة من تطبيق المدير؛ يجب الحفاظ على سلامة المزامنة','warn');
 const available=currencies();
 if(available.length<2)return UI.toast('فعّل عملتين على الأقل من الإعدادات أولاً','warn');
 UI.openModal('<div dir="rtl" class="text-right space-y-2">'+
 '<h3 class="text-lg font-black text-slate-900">'+(old?'تعديل عملية التصريف':'تصريف عملة')+'</h3>'+
 '<input type="hidden" id="taFxEditId" value="'+esc(old?.id||'')+'">'+
 '<p class="text-xs text-slate-600">تخرج القيمة من صندوق العملة المدفوعة وتدخل إلى صندوق العملة المشتراة في قيد واحد.</p>'+
 '<label class="block text-xs font-bold">العملة التي ندفع بها</label>'+choose(available,'taFxFrom')+
 '<label class="block text-xs font-bold">العملة التي نشتريها</label>'+choose(available,'taFxTo')+
 input('taFxSpent','المبلغ المدفوع')+input('taFxReceived','المبلغ المستلم')+
 '<p id="taFxQuoteHint" class="text-xs text-teal-800 bg-teal-50 p-2 rounded-lg"></p>'+
 '<div id="taFxSypEquiv">'+input('taFxEquivalent','القيمة المكافئة بالليرة السورية (للمحاسبة)')+'</div>'+
 '<label class="block text-xs font-bold">بيان (اختياري)</label><input id="taFxNote" maxlength="200" class="w-full border rounded-xl p-3">'+
 '<p id="taFxBalance" class="text-xs font-bold rounded-xl bg-sky-50 text-sky-900 p-3"></p>'+
 '<p id="taFxCostPreview" class="text-xs font-bold rounded-xl bg-emerald-50 text-emerald-900 p-3"></p>'+
 '<button type="button" class="ta-primary-3d w-full rounded-xl p-3 bg-emerald-700 text-white font-black" onclick="TiqanyFxUI.save()">'+(old?'حفظ تعديل التصريف':'حفظ عملية التصريف')+'</button>'+
 '<button type="button" class="w-full rounded-xl p-3 bg-slate-100" onclick="UI.forceCloseModal()">إلغاء</button></div>');
 const from=document.getElementById('taFxFrom'),to=document.getElementById('taFxTo');
 if(old){
  from.value=old.fromCurrency;to.value=old.toCurrency;
  document.getElementById('taFxSpent').value=old.fromAmount;
  document.getElementById('taFxReceived').value=old.toAmount;
  document.getElementById('taFxEquivalent').value=old.equivalentSyp;
  document.getElementById('taFxNote').value=old.note||'';
 }else if(to&&to.options.length>1)to.selectedIndex=1;

 const receivedInput=document.getElementById('taFxReceived');
 const equivalentInput=document.getElementById('taFxEquivalent');
 const paidInput=document.getElementById('taFxSpent');
 const quoteHint=document.getElementById('taFxQuoteHint');
 const applyCurrentRates=()=>{
  // Existing exchanges are not repriced on opening an edit dialog.
  try{
   const paid=Number(paidInput.value),fromCurrency=from.value,toCurrency=to.value;
   if(!(paid>0)||fromCurrency===toCurrency)throw Error('اختر عملتين وأدخل المبلغ المدفوع');
   const q=E.quote(fromCurrency,toCurrency,paid,exchangeRates());
   receivedInput.value=q.toAmount;
   equivalentInput.value=q.equivalentSyp;
   receivedInput.readOnly=true;equivalentInput.readOnly=true;
   quoteHint.textContent='السعر المعتمد: '+fmt(paid,fromCurrency)+' = '+fmt(q.toAmount,toCurrency)+' وفق أسعار الشراء والمبيع المحفوظة.';
  }catch(err){
   receivedInput.readOnly=false;equivalentInput.readOnly=false;
   quoteHint.textContent='لا يوجد سعر صرف مكتمل لهذه العملية. أدخل المبلغ المستلم يدوياً أو اضبط الأسعار من أيقونة سعر الصرف.';
  }
  update();
 };
 const update=()=>{
   const c=from.value,d=to.value;
   document.getElementById('taFxSypEquiv').hidden=c==='SYP'||d==='SYP';
   const availableCash=cashAvailable(c)+(old?.fromCurrency===c?old.fromAmount:0)-(old?.toCurrency===c?old.toAmount:0);
   document.getElementById('taFxBalance').textContent='رصيد الصندوق المتاح بعد عكس العملية السابقة: '+fmt(availableCash,c);
   const p=document.getElementById('taFxCostPreview');
   const fromAmount=Number(document.getElementById('taFxSpent').value),toAmount=Number(document.getElementById('taFxReceived').value);
   const equivalentSyp=c==='SYP'?fromAmount:d==='SYP'?toAmount:Number(document.getElementById('taFxEquivalent').value);
   if(!(fromAmount>0&&toAmount>0&&equivalentSyp>0)){p.textContent='أدخل المبالغ لعرض تكلفة الجزء المتاح وأرباحه قبل الحفظ.';return;}
   try{
     const id=old?.id||'fx_preview_00000000';
     const preview=E.prepare({id,date:old?.date||new Date().toISOString(),fromCurrency:c,toCurrency:d,fromAmount,toAmount,equivalentSyp},available);
     const candidate=old?rows().map(e=>e.id===old.id?preview:e):[...rows(),preview];
     const result=E.analyze(candidate).byId.get(id);
     p.textContent='تكلفة الجزء المباع: '+(result.costOfSoldSyp===null?'غير معروفة':fmt(result.costOfSoldSyp,'SYP'))+
       ' | المغطى: '+fmt(result.coveredAmount,c)+
       ' | بلا تكلفة: '+fmt(result.uncoveredAmount,c)+
       ' | المعلق حالياً: '+fmt(result.pendingAmount,c)+' | أرباح محسوبة: '+(result.gainSyp===null?'0 SYP (تكلفة مؤجلة)':fmt(result.gainSyp,'SYP'));
   }catch(err){p.textContent='تعذّر حساب المعاينة: '+err.message;}
 };
 for(const el of [from,to])el.addEventListener('change',applyCurrentRates);
 paidInput.addEventListener('input',applyCurrentRates);
 receivedInput.addEventListener('input',update);
 equivalentInput.addEventListener('input',update);
 if(old){quoteHint.textContent='تُحفظ أسعار العملية السابقة كما هي حتى تغيّر العملة أو المبلغ المدفوع.';update();}
 else applyCurrentRates();
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
  try{await StorageEngine.saveState();}
  catch(err){State.currencyExchanges=previous;throw err;}
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
 '<div class="rounded-xl border p-3 mb-2 text-xs bg-white"><b>'+esc(e.id.slice(-10))+' · '+esc(e.date.slice(0,16).replace('T',' '))+'</b>'+
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
 '<button type="button" class="flex-1 rounded-lg border p-2 bg-red-700 text-white font-black" onclick="TiqanyFxUI.remove(\''+esc(e.id)+'\')">حذف العملية</button></div>')+
 '</div>').join(''):'<p class="text-slate-500">لا توجد عمليات تصريف مسجلة</p>')+'</div>'+
 '<button type="button" class="w-full bg-slate-100 p-3 rounded-xl" onclick="UI.forceCloseModal()">رجوع</button></div>');
}
const oldDash=Views.renderDashboard;
if(typeof oldDash==='function')Views.renderDashboard=function(main,...args){
 const result=oldDash.call(this,main,...args),grid=main.querySelector('.ta-action-grid');
 if(grid)grid.insertAdjacentHTML('beforeend','<button type="button" class="ta-action-card ta-quick-exchange" onclick="TiqanyFxUI.newForm()" style="background:linear-gradient(135deg,#e0f7ff,#bcf7d2);border:2px solid #28a682"><span class="ta-icon-box ta-tone-teal"><i class="fas fa-dollar-sign"></i><i class="fas fa-euro-sign"></i></span><span class="ta-card-footer"><strong>تصريف عملة</strong></span></button>');
 if(grid)grid.insertAdjacentHTML('beforeend','<button type="button" class="ta-action-card ta-quick-fx-rates" onclick="TiqanyFxUI.ratesForm()" style="background:linear-gradient(135deg,#e0edff,#d5e5ff);border:2px solid #507cdb"><span class="ta-icon-box ta-tone-blue"><i class="fas fa-money-bill-trend-up"></i></span><span class="ta-card-footer"><strong>سعر الصرف</strong></span></button>');
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
 const extra=Object.entries(netBoxes.otherCurrencies||{}).filter(([code])=>!['USD','SYP'].includes(code)).map(([code,n])=>fmt(n,code)).join(' · ');
 main.insertAdjacentHTML('afterbegin','<div class="space-y-2 mb-3">'+
  CapitalLedger.card()+
  '<button type="button" onclick="AppNav.navigate(\'reports\',{tab:\'cashbox\'},true)" class="w-full p-3 rounded-xl border bg-slate-900 text-white font-black text-right"><i class="fas fa-landmark ml-2"></i> صافي الصناديق <span class="block text-xs font-medium mt-2">'+fmt(netBoxes.sypCash,'SYP')+' · '+fmt(netBoxes.usdCash,'USD')+(extra?' · '+esc(extra):'')+'</span></button></div>');

 if((params?.tab||'cashbox')==='pnl'){
   const r=E.analyze(rows());let profit=0;
   for(const e of r.byId.values())if(e.gainSyp!==null && TimeFilter.matches(e.date,TimeFilter.mode(params?.period||TimeFilter.defaultMode()),params?.date||TimeFilter.defaultStart(),params?.end||TimeFilter.defaultEnd()))profit+=e.gainSyp;
   main.insertAdjacentHTML('beforeend','<div class="bg-emerald-50 border border-emerald-300 rounded-xl p-3 font-bold text-emerald-900">أرباح التصريف: '+fmt(profit,'SYP')+(r.unknownCostCount?' · توجد '+r.unknownCostCount+' عملية دون تكلفة شراء معروفة':'')+'</div>');
 }
 return result;
};
function stageAgentExchanges(operations,agent){
 const candidate=rows().slice(),found=new Set(candidate.map(x=>x.id)),accepted=[];
 const base=baseCash?.summary?.(agent.id)||{};
 const till={...base.otherCurrencies,SYP:Number(base.sypCash)||0,USD:Number(base.usdCash)||0};
 const signed=(kind,c,amt)=>{
   if(!c||!Number.isFinite(Number(amt)))return;
   till[c]=(Number(till[c])||0)+(kind==='in'?1:-1)*Number(amt);
 };
 const ordered=(operations||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id)));
 for(const raw of ordered){
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
 return accepted.length;
}

if(!document.getElementById('taFxCapitalGreen142')){
 const st=document.createElement('style');st.id='taFxCapitalGreen142';
 st.textContent='.ta-capital-card{background:linear-gradient(145deg,#198c51,#07572f)!important;color:#fff!important;border-color:#38ac77!important;box-shadow:0 6px 0 #04452a,0 10px 18px #023e2633!important}.ta-capital-card .ta-capital-card-text strong,.ta-capital-card .ta-capital-card-text small,.ta-capital-card .ta-capital-amount,.ta-capital-card .ta-capital-divider,.ta-capital-card>i{color:#fff!important}.ta-capital-card .ta-capital-icon{background:linear-gradient(145deg,#157e49,#07552e)!important;color:#fff!important;border-color:#35ac78!important}';
 document.head.appendChild(st);
}
window.TiqanyFxUI={newForm,edit:newForm,save,list,remove:removeExchange,ratesForm,saveRates,stageAgentExchanges,core:E};
})();