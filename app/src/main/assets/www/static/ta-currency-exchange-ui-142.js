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
const baseCash=window.FieldCash||window.SoloCashbox;
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
function newForm(){
 const available=currencies();
 if(available.length<2)return UI.toast('فعّل عملتين على الأقل من الإعدادات أولاً','warn');
 UI.openModal('<div dir="rtl" class="text-right space-y-2">'+
 '<h3 class="text-lg font-black text-slate-900">تصريف عملة</h3>'+
 '<p class="text-xs text-slate-600">تخرج القيمة من صندوق العملة المدفوعة وتدخل إلى صندوق العملة المشتراة في قيد واحد.</p>'+
 '<label class="block text-xs font-bold">العملة التي ندفع بها</label>'+choose(available,'taFxFrom')+
 '<label class="block text-xs font-bold">العملة التي نشتريها</label>'+choose(available,'taFxTo')+
 input('taFxSpent','المبلغ المدفوع')+input('taFxReceived','المبلغ المستلم')+
 '<div id="taFxSypEquiv">'+input('taFxEquivalent','القيمة المكافئة بالليرة السورية (للمحاسبة)')+'</div>'+
 '<label class="block text-xs font-bold">بيان (اختياري)</label><input id="taFxNote" maxlength="200" class="w-full border rounded-xl p-3">'+
 '<p id="taFxBalance" class="text-xs font-bold rounded-xl bg-sky-50 text-sky-900 p-3"></p>'+
 '<button type="button" class="ta-primary-3d w-full rounded-xl p-3 bg-emerald-700 text-white font-black" onclick="TiqanyFxUI.save()">حفظ عملية التصريف</button>'+
 '<button type="button" class="w-full rounded-xl p-3 bg-slate-100" onclick="UI.forceCloseModal()">إلغاء</button></div>');
 const from=document.getElementById('taFxFrom'),to=document.getElementById('taFxTo');
 if(to&&to.options.length>1)to.selectedIndex=1;
 const update=()=>{
   const c=from.value,d=to.value;
   document.getElementById('taFxSypEquiv').hidden=c==='SYP'||d==='SYP';
   document.getElementById('taFxBalance').textContent='رصيد الصندوق المتاح: '+fmt(cashAvailable(c),c);
 };
 from.addEventListener('change',update);to.addEventListener('change',update);update();
}
let saving=false;
async function save(){
 if(saving)return;
 const val=id=>document.getElementById(id)?.value;
 const fromCurrency=val('taFxFrom'),toCurrency=val('taFxTo');
 const fromAmount=Number(val('taFxSpent')),toAmount=Number(val('taFxReceived'));
 const equivalentSyp=(fromCurrency==='SYP'?fromAmount:toCurrency==='SYP'?toAmount:Number(val('taFxEquivalent')));
 const id='fx_'+(typeof FieldProtocol!=='undefined'?FieldProtocol.uuid():crypto.randomUUID().replace(/-/g,''));
 let e;
 try{
  e=E.prepare({id,fromCurrency,toCurrency,fromAmount,toAmount,equivalentSyp,
    date:new Date().toISOString(),agentId:'',source:'manager',note:val('taFxNote')||''},currencies());
  if(e.fromAmount>cashAvailable(e.fromCurrency)+1e-6)throw Error('رصيد صندوق العملة المدفوعة غير كافٍ');
  if(rows().some(x=>x.id===e.id))throw Error('العملية مكررة');
  const candidate=[...rows(),e];E.analyze(candidate);
  saving=true;State.currencyExchanges=candidate;
  try{await StorageEngine.saveState();}catch(err){State.currencyExchanges=candidate.filter(x=>x.id!==e.id);throw err;}
  UI.forceCloseModal();UI.toast('تم حفظ التصريف في الصندوقين','success');AppNav.renderCurrent();
 }catch(err){UI.toast('تعذر حفظ التصريف: '+err.message,'error');}
 finally{saving=false;}
}
function list(){
 const history=E.analyze(rows());
 const entries=[...history.byId.values()].reverse();
 UI.openModal('<div dir="rtl" class="space-y-3 text-right">'+
 '<h3 class="text-lg font-black">عمليات التصريف ('+entries.length+')</h3>'+
 '<button type="button" class="ta-primary-3d w-full bg-emerald-700 text-white rounded-xl p-3 font-bold" onclick="TiqanyFxUI.newForm()">＋ تصريف عملة جديد</button>'+
 '<div class="max-h-[55vh] overflow-y-auto">'+(entries.length?entries.map(e=>
 '<div class="rounded-xl border p-3 mb-2 text-xs bg-white"><b>'+esc(e.id.slice(-10))+' · '+esc(e.date.slice(0,16).replace('T',' '))+'</b>'+
 '<div class="mt-2 text-rose-700">− '+fmt(e.fromAmount,e.fromCurrency)+'</div>'+
 '<div class="text-emerald-700">+ '+fmt(e.toAmount,e.toCurrency)+'</div>'+
 (e.agentId?'<div>موظف البيع: '+esc((State.fieldSync?.agents||[]).find(a=>a.id===e.agentId)?.name||e.agentId)+'</div>':'')+
 '<div class="font-bold">أرباح التصريف: '+(e.gainSyp===null?'تكلفة الشراء غير محددة':fmt(e.gainSyp,'SYP'))+'</div>'+
 '<div class="text-slate-500">'+esc(e.note||'')+'</div></div>').join(''):'<p class="text-slate-500">لا توجد عمليات تصريف مسجلة</p>')+'</div>'+
 '<button type="button" class="w-full bg-slate-100 p-3 rounded-xl" onclick="UI.forceCloseModal()">رجوع</button></div>');
}
const oldDash=Views.renderDashboard;
if(typeof oldDash==='function')Views.renderDashboard=function(main,...args){
 const result=oldDash.call(this,main,...args),grid=main.querySelector('.ta-action-grid');
 if(grid)grid.insertAdjacentHTML('beforeend','<button type="button" class="ta-action-card ta-quick-exchange" onclick="TiqanyFxUI.newForm()" style="background:linear-gradient(135deg,#e0f7ff,#bcf7d2);border:2px solid #28a682"><span class="ta-icon-box ta-tone-teal"><i class="fas fa-dollar-sign"></i><i class="fas fa-euro-sign"></i></span><span class="ta-card-footer"><strong>تصريف عملة</strong></span></button>');
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
 main.insertAdjacentHTML('afterbegin','<div class="space-y-2 mb-3">'+
 '<button type="button" onclick="CapitalLedger.open()" class="w-full p-3 rounded-xl font-black text-right" style="background:#16804a;color:white"><i class="fas fa-wallet ml-2"></i> رأس المال</button>'+
 '<button type="button" onclick="AppNav.navigate(\'reports\',{tab:\'cashbox\'},true)" class="w-full p-3 rounded-xl border bg-white font-black text-right">صافي الصناديق</button></div>');
 if((params?.tab||'cashbox')==='pnl'){
   const r=E.analyze(rows());let profit=0;
   for(const e of r.byId.values())if(e.gainSyp!==null && TimeFilter.matches(e.date,TimeFilter.mode(params?.period||TimeFilter.defaultMode()),params?.date||TimeFilter.defaultStart(),params?.end||TimeFilter.defaultEnd()))profit+=e.gainSyp;
   main.insertAdjacentHTML('beforeend','<div class="bg-emerald-50 border border-emerald-300 rounded-xl p-3 font-bold text-emerald-900">أرباح التصريف: '+fmt(profit,'SYP')+(r.unknownCostCount?' · توجد '+r.unknownCostCount+' عملية دون تكلفة شراء معروفة':'')+'</div>');
 }
 return result;
};
window.TiqanyFxUI={newForm,save,list,core:E};
})();