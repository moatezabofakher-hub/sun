/* 121 — Non-revenue capital-to-office-cash transfers; never create debts, vouchers, or expenses. */
(function(root){
'use strict';
const round=(n,c)=>c==='SYP'?Math.round(n):Math.round((n+Number.EPSILON)*100)/100;
const escapeText=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const TYPES=Object.freeze({receive:'استلام مبلغ',pay:'دفع مبلغ'});
const ledger=()=>Array.isArray(State.capitalMovements)?State.capitalMovements:[];
function validMove(m){return m&&typeof m.id==='string'&&Object.hasOwn(TYPES,m.direction)&&['SYP','USD'].includes(m.currency)&&Number.isFinite(Number(m.amount))&&Number(m.amount)>0&&Number(m.amount)<=1e12;}
const CapitalLedger={
 busy:false,
 total(){
   const totals={SYP:0,USD:0};
   for(const m of ledger())if(validMove(m))totals[m.currency]=round(totals[m.currency]+(m.direction==='receive'?1:-1)*Number(m.amount),m.currency);
   return totals;
 },
 cashMovements(){
   return ledger().filter(validMove).map(m=>({id:m.id,docType:'capital',date:m.date||'',ref:'رأس المال',party:'رأس مال الشركة',desc:(TYPES[m.direction]||'حركة رأس مال')+(m.note?' · '+String(m.note).slice(0,200):''),currency:m.currency,inflow:m.direction==='receive'?Number(m.amount):0,outflow:m.direction==='pay'?Number(m.amount):0}));
 },
 card(){
   const s=this.total();
   return `<button type="button" class="ta-capital-card" onclick="CapitalLedger.open()" aria-label="رأس المال، استلام مبلغ أو دفع مبلغ">
      <span class="ta-capital-icon" aria-hidden="true"><i class="fas fa-piggy-bank"></i></span>
      <span class="ta-capital-card-text"><strong>رأس المال</strong><small>الرصيد المتبقي من المبالغ المدخلة إلى الصندوق بعد المبالغ المعادة</small>
      <span class="ta-capital-amount">${Accounting.format(s.SYP,'SYP')} <span class="ta-capital-divider">|</span> ${Accounting.format(s.USD,'USD')}</span></span>
      <i class="fas fa-chevron-left" aria-hidden="true"></i>
   </button>`;
 },
 open(){
   const history=ledger().slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,12);
   UI.openModal(`<div dir="rtl" class="space-y-3 text-right ta-capital-modal">
      <h3 class="font-black text-lg text-slate-950"><i class="fas fa-piggy-bank text-pink-500 ml-2"></i>رأس المال</h3>
      <p class="text-xs text-slate-700">حركات داخلية بين رأس المال والصندوق الرئيسي فقط؛ لا تدخل في المبيعات أو الأرباح أو المصاريف أو ديون العملاء.</p>
      <div class="grid grid-cols-2 gap-3">
       <button type="button" class="ta-capital-green" onclick="CapitalLedger.openForm('receive')"><i class="fas fa-arrow-down"></i><strong>استلام مبلغ</strong><small>من رأس المال إلى الصندوق</small></button>
       <button type="button" class="ta-capital-green" onclick="CapitalLedger.openForm('pay')"><i class="fas fa-arrow-up"></i><strong>دفع مبلغ</strong><small>من الصندوق إلى رأس المال</small></button>
      </div>
      <h4 class="font-black text-sm text-slate-700">آخر حركات رأس المال</h4>
      <div class="max-h-52 overflow-auto divide-y border rounded-xl bg-white text-xs">${history.length?history.map(m=>`<div class="px-3 py-2 flex justify-between gap-2"><span class="font-bold">${escapeText(TYPES[m.direction]||'حركة') }<span class="block text-slate-500 font-normal">${escapeText((m.date||'').replace('T',' ').slice(0,19))}${m.note?' · '+escapeText(m.note):''}</span></span><b dir="ltr" class="shrink-0">${m.direction==='receive'?'+':'−'} ${Accounting.format(Number(m.amount),m.currency)}</b></div>`).join(''):'<p class="p-4 text-center text-slate-500">لا توجد حركات رأس مال بعد</p>'}</div>
      <button type="button" class="w-full border rounded-xl py-2 font-bold" onclick="UI.forceCloseModal()">إغلاق</button>
   </div>`);
 },
 openForm(direction){
   if(!Object.hasOwn(TYPES,direction))return;
   const receiving=direction==='receive';
   UI.openModal(`<div dir="rtl" class="space-y-3 text-right ta-capital-modal">
      <h3 class="text-lg font-black text-slate-950">${TYPES[direction]}</h3>
      <p class="text-sm text-slate-700">${receiving?'إضافة مبلغ من رأس المال إلى الصندوق الرئيسي.':'إعادة مبلغ من الصندوق الرئيسي إلى رأس المال.'} لا تؤثر هذه الحركة على الأرباح أو الذمم.</p>
      <label class="block font-bold text-sm" for="capitalCurrency">العملة</label>
      <select id="capitalCurrency" class="w-full border-2 rounded-xl p-3 bg-white"><option value="SYP">الليرة السورية (SYP)</option><option value="USD">الدولار الأمريكي (USD)</option></select>
      <label class="block font-bold text-sm" for="capitalAmount">المبلغ</label>
      <input id="capitalAmount" type="number" inputmode="decimal" step="any" min="0" max="1000000000000" class="w-full border-2 rounded-xl p-3 text-lg font-black" placeholder="0" />
      <label class="block font-bold text-sm" for="capitalNote">بيان الحركة (اختياري)</label>
      <input id="capitalNote" maxlength="200" class="w-full border rounded-xl p-3" placeholder="مثال: رأس المال الافتتاحي" />
      <button class="ta-capital-green w-full" type="button" onclick="CapitalLedger.save('${direction}')"><i class="fas fa-save"></i><strong>حفظ ${TYPES[direction]}</strong></button>
      <button type="button" class="w-full border rounded-xl py-3" onclick="CapitalLedger.open()">رجوع</button>
   </div>`);
 },
 officeCash(){
   if(typeof FieldCash!=='undefined')return FieldCash.summary('office');
   if(typeof SoloCashbox!=='undefined')return SoloCashbox.summary();
   return Accounting.getCashboxSummary();
 },
 async save(direction){
   if(this.busy||!Object.hasOwn(TYPES,direction))return;
   const currency=document.getElementById('capitalCurrency')?.value;
   const raw=Number(document.getElementById('capitalAmount')?.value);
   const note=String(document.getElementById('capitalNote')?.value||'').trim().slice(0,200);
   if(!['SYP','USD'].includes(currency)||!Number.isFinite(raw)||raw<=0||raw>1e12)return UI.toast('أدخل مبلغًا موجبًا وعملة صحيحة','error');
   const amount=round(raw,currency);
   if(!(amount>0))return UI.toast('المبلغ أقل من أصغر وحدة معتمدة لهذه العملة','warn');
   if(direction==='pay'){
     const cash=this.officeCash(),available=currency==='SYP'?cash.sypCash:cash.usdCash;
     if(amount>available+0.00001)return UI.toast('رصيد الصندوق الرئيسي غير كافٍ لدفع هذا المبلغ','error');
   }
   const uuid=typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():
      (typeof crypto!=='undefined'&&crypto.getRandomValues?'c'+Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''):null);
   if(!uuid)return UI.toast('تعذر إنشاء معرّف آمن للحركة','error');
   const move={id:'capital_'+uuid,direction,amount,currency,note,date:new Date().toISOString(),kind:'capital-transfer'};
   this.busy=true;
   State.capitalMovements=ledger().concat([move]);
   try{
     await StorageEngine.saveState();
     UI.forceCloseModal();
     AppNav.navigate('reports',{tab:'cashbox'},true);
     UI.toast('حُفظت حركة رأس المال وتحدّث رصيد الصندوق دون التأثير على الأرباح والديون','success');
   }catch(err){State.capitalMovements=ledger().filter(m=>m.id!==move.id);UI.toast('لم تُحفظ حركة رأس المال: '+(err?.message||err),'error');}
   finally{this.busy=false;}
 }
};
root.CapitalLedger=CapitalLedger;
if(typeof module==='object'&&module.exports)module.exports=CapitalLedger;
})(typeof globalThis==='object'?globalThis:this);
