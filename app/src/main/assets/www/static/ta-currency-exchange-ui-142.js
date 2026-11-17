/* Tiqany Acc v142 - local currency exchange UI, manager and independent. */
(function(root){
'use strict';
if(typeof document==='undefined'||typeof State==='undefined'||!root.TiqanyFxLedger)return;
const F=root.TiqanyFxLedger, $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,c)=>Accounting.format(n,c);
let busy=false;
const Ctrl={
  available(c){
    const sums=typeof FieldCash!=='undefined'?FieldCash.summary('office'):Accounting.getCashboxSummary();
    return c==='USD'?Number(sums.usdCash)||0:Number(sums.sypCash)||0;
  },
  open(){
    const currencies=F.activeCurrencies(State);
    if(currencies.length<2){UI.toast('يجب تفعيل عملتين مدعومتين في إعدادات العملة قبل التصريف','warn');return;}
    const options=currencies.map(c=>'<option value="'+esc(c)+'">'+(c==='USD'?'دولار أمريكي':'ليرة سورية')+' ('+esc(c)+')</option>').join('');
    UI.openModal('<div dir="rtl" class="ta-fx-modal space-y-3">'+
      '<div class="flex justify-between items-center"><h3 class="font-black text-lg text-blue-950"><i class="fas fa-dollar-sign"></i> <i class="fas fa-euro-sign"></i> تصريف عملة</h3><button type="button" onclick="UI.requestCloseModal()" class="bg-slate-100 rounded-xl px-3 py-2">رجوع</button></div>'+
      '<p class="text-xs text-slate-600">شراء عملة من صندوق عملة أخرى. يتم تسجيل الخصم والإضافة معاً، ويُحتسب ربح التصريف عند توفر تكلفة شراء سابقة.</p>'+
      '<label class="block text-sm font-bold">العملة المستخدمة في الشراء<select id="taFxFrom" class="w-full mt-1 border rounded-xl p-3">'+options+'</select></label>'+
      '<label class="block text-sm font-bold">العملة المشتراة<select id="taFxTo" class="w-full mt-1 border rounded-xl p-3">'+options+'</select></label>'+
      '<label class="block text-sm font-bold">المبلغ المخصوم من الصندوق<input id="taFxPaid" inputmode="decimal" type="number" min="0" step="any" class="w-full mt-1 border rounded-xl p-3" placeholder="المبلغ المدفوع"></label>'+
      '<label class="block text-sm font-bold">المبلغ المضاف إلى الصندوق<input id="taFxReceived" inputmode="decimal" type="number" min="0" step="any" class="w-full mt-1 border rounded-xl p-3" placeholder="المبلغ المشترى"></label>'+
      '<label class="block text-sm font-bold">البيان (اختياري)<input id="taFxNote" maxlength="200" class="w-full mt-1 border rounded-xl p-3" placeholder="ملاحظات التصريف"></label>'+
      '<div id="taFxPreview" class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm font-bold"></div>'+
      '<div class="grid grid-cols-2 gap-2"><button type="button" class="rounded-xl p-3 font-black text-white bg-emerald-700" id="taFxSave">حفظ التصريف</button><button type="button" class="rounded-xl p-3 font-black bg-slate-100 text-slate-900" onclick="UI.requestCloseModal()">إلغاء</button></div>'+
      '<h4 class="font-extrabold text-sm">آخر عمليات التصريف</h4><div class="divide-y text-xs max-h-44 overflow-auto">'+
      F.ensure(State).slice(-8).reverse().map(t=>'<div class="p-2">'+esc(fmt(t.fromAmount,t.fromCurrency))+' ← '+esc(fmt(t.toAmount,t.toCurrency))+'<small class="block">'+esc(String(t.date||'').slice(0,10))+'</small></div>').join('')+
      '</div></div>');
    $('taFxFrom').value=currencies.includes('SYP')?'SYP':currencies[0];
    $('taFxTo').value=currencies.find(c=>c!==$('taFxFrom').value)||currencies[0];
    for(const key of ['taFxFrom','taFxTo','taFxPaid','taFxReceived'])$(key).addEventListener('input',()=>this.preview());
    $('taFxSave').addEventListener('click',()=>this.save());
    this.preview();
  },
  preview(){
    const from=$('taFxFrom')?.value,to=$('taFxTo')?.value,paid=Number($('taFxPaid')?.value),recv=Number($('taFxReceived')?.value);
    const box=$('taFxPreview');if(!box)return;
    const available=this.available(from);
    let text='المتوفر في صندوق '+from+': '+fmt(available,from);
    if(from===to)text+=' | اختر عملتين مختلفتين';
    else if(paid>0&&recv>0){
      try{const q=F.quote(State,{fromCurrency:from,toCurrency:to,fromAmount:paid,toAmount:recv});
        text+=' | سعر العملية: '+q.rate.toLocaleString('en-US',{maximumFractionDigits:6})+' '+from+' لكل '+to;
        text+=' | '+(q.costBasisKnown?'أرباح التصريف المتوقعة: '+fmt(q.profitUSD,'USD'):'تكلفة الشراء السابقة غير متوفرة: لن يتم تسجيل ربح تقديري');
        if(paid>available+1e-7)text+=' | الرصيد غير كافٍ';
      }catch(e){text+=' | '+e.message;}
    }
    box.textContent=text;
  },
  async save(){
    if(busy)return;
    const from=$('taFxFrom')?.value,to=$('taFxTo')?.value,paid=Number($('taFxPaid')?.value),recv=Number($('taFxReceived')?.value),note=$('taFxNote')?.value;
    const previous=F.ensure(State).slice();
    busy=true;const btn=$('taFxSave');if(btn)btn.disabled=true;
    try{
      F.record(State,{fromCurrency:from,toCurrency:to,fromAmount:paid,toAmount:recv,note},this.available(from));
      await StorageEngine.saveState();
      UI.forceCloseModal();
      AppNav.renderCurrent();
      UI.toast('تم تسجيل التصريف في الصندوقين','success');
    }catch(err){
      State.fxTrades=previous;
      UI.toast(err.message||'تعذر حفظ تصريف العملة','error');
    }finally{busy=false;if(btn?.isConnected)btn.disabled=false;}
  }
};
root.TiqanyFxExchange=Ctrl;
if(typeof Views!=='undefined'){
 const dashboard=Views.renderDashboard;
 Views.renderDashboard=function(main,...args){
   const result=dashboard.call(this,main,...args);
   const modules=main.querySelector('.ta-module-grid');
   if(modules&&!modules.querySelector('.ta-fx-launch')){
     modules.insertAdjacentHTML('beforeend','<button type="button" onclick="TiqanyFxExchange.open()" class="ta-module-card ta-fx-launch"><span class="ta-icon-box ta-tone-blue"><i class="fas fa-dollar-sign"></i><i class="fas fa-euro-sign"></i></span><strong>تصريف عملة</strong></button>');
   }
   return result;
 };
 const reports=Views.renderReports;
 Views.renderReports=function(main,params){
   const result=reports.call(this,main,params);
   const toolbar=main.firstElementChild;
   if(!toolbar)return result;
   const capital=main.querySelector('.ta-capital-card');
   if(capital){main.insertBefore(capital,toolbar);}
   else if(typeof CapitalLedger!=='undefined')toolbar.insertAdjacentHTML('beforebegin',CapitalLedger.card());
   const cashTitle=[...main.querySelectorAll('span')].find(e=>e.textContent?.trim()==='صافي صندوق الليرة السورية');
   const pair=cashTitle?.parentElement?.parentElement;
   if(pair&&pair.classList?.contains('grid'))main.insertBefore(pair,toolbar);
   for(const card of main.querySelectorAll('.ta-capital-card'))card.classList.add('ta-fx-capital-green');
   if(params?.tab==='pnl'){
     const period=TimeFilter.mode(params.period||TimeFilter.defaultMode());
     const start=params.date||TimeFilter.defaultStart(),end=params.end||TimeFilter.defaultEnd();
     const gains=F.profit(State,t=>TimeFilter.matches(t.date,period,start,end));
     const profitCard=document.createElement('section');
     profitCard.className='ta-fx-profit-line bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl p-3 my-3 font-bold';
     profitCard.setAttribute('aria-label','أرباح التصريف');
     profitCard.innerHTML='<span>أرباح التصريف</span><strong dir="ltr" class="block mt-1">'+esc(fmt(gains,'USD'))+'</strong>';
     const anchor=main.querySelector('.ta-capital-card')||main.firstElementChild;
     anchor?.insertAdjacentElement('afterend',profitCard);
   }
   return result;
 };
}
const style=document.createElement('style');
style.textContent='.ta-capital-card.ta-fx-capital-green{background:linear-gradient(150deg,#2ca65a,#08723b 60%,#064d2b)!important;border:1px solid #4cc980!important;box-shadow:0 5px 0 #04512b,0 10px 18px #06452b55!important}.ta-capital-card.ta-fx-capital-green *{color:#fff!important}.ta-fx-launch .ta-icon-box{display:flex;align-items:center;justify-content:center;gap:5px}.ta-fx-launch .ta-icon-box i{font-size:1.1em}';
document.head.appendChild(style);
})(typeof globalThis==='object'?globalThis:this);
