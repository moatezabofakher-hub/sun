(function(){
'use strict';
const F=TiqanyFinance;
const esc=v=>AppEscape.text(String(v??''));
const fmt=(n,c)=>Accounting.format(n,c);
const dateOnly=()=>{const t=new Date();return new Date(t.getTime()-t.getTimezoneOffset()*60000).toISOString().slice(0,10);};
const act='rounded-xl bg-teal-800 text-white px-4 py-3 font-bold';
const panel='rounded-xl border p-3 mb-3 space-y-2';
const field='w-full border rounded-xl p-2 bg-white text-slate-900';
const btn=(name,click)=>'<button type="button" class="'+act+'" onclick="'+esc(click)+'">'+esc(name)+'</button>';
const attr=id=>JSON.stringify(String(id));
const nav=(tab,p={})=>AppNav.navigate('reports',{tab,...p});
const records=()=>State.cashShifts || (State.cashShifts=[]);
function channelSelect(target,d) {
  return '<label>طريقة استلام أو تسليم المبلغ<select class="'+field+'" onchange="'+target+'.draft.cashChannel=this.value;'+target+'.markModified()"><option value="cash">نقد في الصندوق</option><option value="transfer" '+(d.cashChannel==='transfer'?'selected':'')+'>حوالة / بنك</option></select></label>';
}
function allocationFields(d){
  const values=d.allocations || (d.linkedInvoiceId?[{invoiceId:d.linkedInvoiceId,amount:d.accountAmount??d.amount}]:[]);
  const balances=F.settlements(State,d.id).balances;
  const rows=State.invoices.filter(i=>i.accountId && i.accountId===d.accountId && F.direction(i)===d.type && i.currency===(d.accountCurrency||d.currency) && balances.get(i.id)>0);
  return '<fieldset class="'+panel+'"><legend>توزيع السند على الفواتير</legend><small>اترك المبلغ فارغاً لإبقائه دفعة على الحساب.</small>'+
    rows.map(i=>'<label class="block">فاتورة '+esc(i.number)+' · المتبقي '+esc(fmt(balances.get(i.id),i.currency))+'<input type="number" step="any" min="0" class="'+field+'" value="'+esc(values.find(v=>v.invoiceId===i.id)?.amount??'')+'" data-allocation="'+esc(i.id)+'" oninput="FinanceDesk.allocationChanged(this)"></label>').join('')+
    (!rows.length?'<p>لا توجد فاتورة مفتوحة لهذا الحساب بعملة الترحيل المختارة.</p>':'')+'</fieldset>';
}
function allocationChanged(input){
  const d=VoucherController.draft;
  const entries=[...(input.closest('fieldset')?.querySelectorAll('[data-allocation]')||[])];
  delete d.financeTarget;
  d.allocations=entries.filter(el=>el.value!=='').map(el=>({invoiceId:el.dataset.allocation,amount:Number(el.value)}));
  VoucherController.markModified();
}
function invoicePayment(id){
  const inv=State.invoices.find(x=>x.id===id), remaining=F.settlements(State).balances.get(id);
  if (!inv || !inv.accountId || !(remaining>0)) return UI.toast('الفاتورة مسدّدة أو غير مرتبطة بحساب','warn');
  VoucherController.openAccountVoucherModal(F.direction(inv), inv.accountId);
  const d=VoucherController.draft;
  Object.assign(d,{financeTarget:id,accountCurrency:inv.currency,currency:inv.currency,amount:remaining,accountAmount:remaining,allocations:[{invoiceId:id,amount:remaining}]});
  VoucherController.paintVoucherForm(VoucherController.voucherFormHost());
}
function collection(main,p) {
  UI.setHeader('التحصيل والاستحقاقات','الفواتير المفتوحة والدفعات المتاحة للتخصيص');
  const book=F.settlements(State), today=dateOnly(), side=p.side==='payment'?'payment':'receipt', range=p.range||'due';
  const all=State.invoices.filter(i=>i.accountId && F.direction(i)===side && book.balances.get(i.id)>0).sort((a,b)=>F.age(b,today)-F.age(a,today)||F.compare(a,b));
  const rows=all.filter(i=>{const days=F.age(i,today);return range==='all'||(range==='due'?days>=0:range==='future'?days<0:range==='90'?days>90:range==='60'?days>60&&days<=90:range==='30'?days>30&&days<=60:days>=0&&days<=30);});
  const account=id=>State.accounts.find(a=>a.id===id)?.name||'حساب';
  const select=(id,options,value)=>'<select class="'+field+'" id="'+id+'">'+options.map(([k,t])=>'<option value="'+k+'" '+(k===value?'selected':'')+'>'+t+'</option>').join('')+'</select>';
  const onAccount=State.vouchers.filter(v=>v.type===side && v.accountId && F.amount(Number(v.accountAmount??v.amount)-(book.used.get(v.id)||0),v.accountCurrency||v.currency)>0);
  main.innerHTML='<div class="'+panel+'">'+select('finance-side',[['receipt','مبالغ للتحصيل'],['payment','مبالغ للدفع']],side)+select('finance-age',[['due','مستحق حتى اليوم'],['all','كل الاستحقاقات'],['future','استحقاق مستقبلي'],['0','حتى ٣٠ يوماً'],['30','٣١–٦٠ يوماً'],['60','٦١–٩٠ يوماً'],['90','أكثر من ٩٠ يوماً']],range)+'</div>'+
    rows.map(i=>'<div class="'+panel+'"><b>'+esc(account(i.accountId))+' · فاتورة '+esc(i.number)+'</b><p>'+esc(fmt(book.balances.get(i.id),i.currency))+' · '+(i.dueDate?'الاستحقاق ':'من تاريخ الفاتورة ')+esc(String(i.dueDate||i.date).slice(0,10))+'</p>'+btn(side==='receipt'?'تسجيل قبض':'تسجيل دفع','FinanceDesk.invoicePayment('+attr(i.id)+')')+'</div>').join('')+(!rows.length?'<p class="'+panel+'">لا توجد فواتير ضمن الفترة المحددة.</p>':'')+
    '<details class="'+panel+'"><summary>دفعات على الحساب ('+onAccount.length+')</summary>'+onAccount.map(v=>'<p>'+esc(account(v.accountId))+' · '+esc(fmt(F.amount(Number(v.accountAmount??v.amount)-(book.used.get(v.id)||0),v.accountCurrency||v.currency),v.accountCurrency||v.currency))+' '+btn('توزيع السند',"AppNav.navigate('voucher_form',{id:"+attr(v.id)+"})")+'</p>').join('')+'</details>';
  main.querySelectorAll('select').forEach(x=>x.onchange=()=>AppNav.navigate('reports',{tab:'collection',side:main.querySelector('#finance-side').value,range:main.querySelector('#finance-age').value},true));
}
function till(scope) {
  const cash=typeof FieldCash!=='undefined'?FieldCash.summary(scope):SoloCashbox.summary();
  return {...cash.otherCurrencies,SYP:cash.sypCash||0,USD:cash.usdCash||0};
}
const moneyList=map=>Object.entries(map).map(([c,n])=>esc(fmt(n,c))).join(' · ');
function cashShifts(main,p){
  UI.setHeader('إقفال الصندوق','عهدة الافتتاح والعدّ الفعلي وتسليم الوردية');
  const scopes=[{id:'office',name:'الصندوق الرئيسي'},...(State.fieldSync?.agents||[]).filter(a=>!a.archived).map(a=>({id:a.id,name:'صندوق '+a.name}))];
  const scope=scopes.some(s=>s.id===p.scope)?p.scope:'office';
  const history=records().filter(s=>s.scope===scope).sort((a,b)=>b.sequence-a.sequence);
  const opened=history.find(s=>!s.closedAt), baseline=till(scope);
  const expected=opened?F.tillExpected(opened.opening,opened.baseline,baseline):baseline;
  main.innerHTML='<section class="'+panel+'"><label>الصندوق<select id="finance-scope" class="'+field+'">'+scopes.map(s=>'<option value="'+esc(s.id)+'" '+(s.id===scope?'selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select></label><h3>'+(opened?'إقفال وردية '+esc(opened.cashier):'فتح وردية جديدة')+'</h3><label>'+(opened?'اسم مستلم الصندوق':'اسم أمين الصندوق')+'<input id="finance-person" class="'+field+'" maxlength="90"></label>'+
    Object.keys(expected).map(c=>'<label class="block">'+(opened?'المعدود فعلياً':'عهدة الافتتاح')+' '+esc(c)+(opened?' · المتوقع '+esc(fmt(expected[c],c)):'')+'<input class="'+field+'" data-count="'+esc(c)+'" type="number" step="any" min="0" value="'+(opened?'':Math.max(0,baseline[c]))+'"></label>').join('')+
    (opened?'<label>ملاحظة التسليم أو سبب الفرق<input id="finance-note" class="'+field+'" maxlength="250"></label>':'')+'<button type="button" id="finance-save-shift" class="'+act+'">'+(opened?'تأكيد العدّ وإقفال الوردية':'فتح الوردية')+'</button></section>'+btn('مطابقة الحوالات مع كشف البنك',"FinanceDesk.nav('bank_match')")+'<h3>الورديات المقفلة</h3>'+
    history.filter(s=>s.closedAt).map(s=>'<details class="'+panel+'"><summary>'+esc(s.cashier)+' · '+esc(new Date(s.closedAt).toLocaleString('ar-SY'))+'</summary><p>المستلم '+esc(s.receiver)+'</p><p>العهدة '+moneyList(s.opening)+'</p><p>المتوقع '+moneyList(s.expected)+'</p><p>المعدود '+moneyList(s.counted)+'</p><p>الفرق '+moneyList(s.difference)+'</p><p>'+esc(s.note)+'</p></details>').join('');
  main.querySelector('#finance-scope').onchange=e=>nav('cash_shifts',{scope:e.target.value});
  const submit=main.querySelector('#finance-save-shift');
  submit.onclick=async()=>{
    if(submit.disabled)return;
    const person=main.querySelector('#finance-person').value.trim(), counted={};
    if(!person)return UI.toast('أدخل اسم المسؤول عن استلام الصندوق','warn');
    for(const el of main.querySelectorAll('[data-count]')){
      if(el.value==='' || !Number.isFinite(el.valueAsNumber) || el.valueAsNumber<0)return UI.toast('أدخل المعدود لكل عملة، ويمكن إدخال صفر','warn');
      counted[el.dataset.count]=F.amount(el.valueAsNumber,el.dataset.count);
    }
    const current=till(scope), active=records().find(s=>s.scope===scope && !s.closedAt);
    if((active?.id||null)!==(opened?.id||null) || JSON.stringify(current)!==JSON.stringify(baseline)){cashShifts(main,p);return UI.toast('تغيّر الصندوق. راجع القيم المحدّثة قبل التأكيد','warn');}
    const now=new Date().toISOString(), sequence=(history[0]?.sequence||0)+1;
    let entry;
    if(opened){
      const difference=Object.fromEntries(Object.keys(expected).map(c=>[c,F.amount(counted[c]-expected[c],c)]));
      const note=main.querySelector('#finance-note').value.trim();
      if(Object.values(difference).some(v=>v!==0) && !note)return UI.toast('أدخل سبب الفرق قبل الإقفال','warn');
      entry={...opened,receiver:person,note,closedAt:now,counted,expected,difference};
    }else entry={id:'till_'+scope+'_'+sequence,scope,sequence,openedAt:now,cashier:person,opening:counted,baseline:current};
    submit.disabled=true;
    const before=State.cashShifts;
    State.cashShifts=[...records().filter(s=>s.id!==entry.id),entry];
    try{await StorageEngine.saveState();cashShifts(main,p);UI.toast(opened?'تم إقفال الوردية':'تم فتح الوردية','success');}
    catch(e){State.cashShifts=before;submit.disabled=false;UI.toast('تعذر حفظ الوردية','error');}
  };
}
function bank(main){
  UI.setHeader('مطابقة الحوالات','مقارنة الحوالة المسجّلة مع حركة كشف البنك');
  const entries=[...State.invoices.map(doc=>({doc,kind:'invoice',value:Number(doc.paidAmount)})),...State.vouchers.map(doc=>({doc,kind:'voucher',value:Number(doc.amount)}))]
    .filter(e=>e.doc.cashChannel==='transfer' && e.value>0).sort((a,b)=>F.compare(b.doc,a.doc));
  main.innerHTML=entries.map(({doc,kind,value},idx)=>{
    const m=doc.bankMatch,matched=m && m.currency===doc.currency && m.value===value && m.accountId===doc.accountId && m.type===doc.type;
    return '<div class="'+panel+'"><b>'+esc(kind==='invoice'?'فاتورة ':'سند ')+esc(doc.number)+' · '+esc(fmt(value,doc.currency))+'</b><p>'+esc(String(doc.date).slice(0,10))+'</p>'+
    (matched?'<strong>مطابقة · '+esc(m.ref)+' · '+esc(m.date)+'</strong>':'<label>مرجع كشف البنك<input class="'+field+'" data-ref maxlength="100"></label><label>تاريخ الحركة<input class="'+field+'" data-date type="date" value="'+dateOnly()+'"></label><label>المبلغ في الكشف ('+esc(doc.currency)+')<input class="'+field+'" type="number" step="any" min="0" data-bank-sum></label><button type="button" class="'+act+'" data-match="'+idx+'">مطابقة الحوالة</button>')+'</div>';
  }).join('')||'<p class="'+panel+'">لا توجد حوالات مسجّلة.</p>';
  for(const b of main.querySelectorAll('[data-match]'))b.onclick=async()=>{
    const parent=b.parentElement, ref=parent.querySelector('[data-ref]').value.trim(), date=parent.querySelector('[data-date]').value;
    const value=parent.querySelector('[data-bank-sum]').valueAsNumber, entry=entries[Number(b.dataset.match)],doc=entry.doc;
    if(!ref || !date || !Number.isFinite(value) || F.amount(value,doc.currency)!==F.amount(entry.value,doc.currency))return UI.toast('أدخل مرجع الكشف وتاريخه والمبلغ المطابق','warn');
    const coll=entry.kind==='invoice'?State.invoices:State.vouchers;
    if(coll.find(x=>x.id===doc.id)!==doc)return bank(main);
    const old=doc.bankMatch;
    b.disabled=true;
    doc.bankMatch={ref,date,value:entry.value,currency:doc.currency,accountId:doc.accountId,type:doc.type};
    try{await StorageEngine.saveState();bank(main);}
    catch(e){doc.bankMatch=old;b.disabled=false;UI.toast('تعذر حفظ المطابقة','error');}
  };
}
function fxReport(main,p){
  UI.setHeader('فروق العملة عند السداد','السند والفاتورة وسعرا الصرف لكل تسوية');
  const {events}=F.settlements(State);
  const visible=events.filter(e=>TimeFilter.matches(e.voucher.date,p.period||'all',p.date,p.end) && (!p.agentId || p.agentId==='all'||(e.voucher.fieldOrigin?.agentId||'office')===p.agentId));
  main.innerHTML='<div class="'+panel+'"><b>صافي فروق السداد '+fmt(visible.reduce((s,e)=>s+e.gainSyp,0),'SYP')+'</b></div>'+visible.map(e=>'<div class="'+panel+'"><b>فاتورة '+esc(e.invoice.number)+' · سند '+esc(e.voucher.number)+'</b><p>المبلغ المسدّد '+esc(fmt(e.applied,e.invoice.currency))+'</p><p>سعر الفاتورة '+esc(e.invoiceRate)+' · سعر السداد '+esc(e.paymentRate)+'</p><strong>'+esc(fmt(e.gainSyp,'SYP'))+'</strong></div>').join('');
}
// The list and the receipt can request several balances in one render.
let cached=null, invoiceList, voucherList, invoiceCount, voucherCount;
function currentBook(){
  if(!cached || invoiceList!==State.invoices || voucherList!==State.vouchers || invoiceCount!==State.invoices.length || voucherCount!==State.vouchers.length){
    cached=F.settlements(State);invoiceList=State.invoices;voucherList=State.vouchers;
    invoiceCount=invoiceList.length;voucherCount=voucherList.length;
    Promise.resolve().then(()=>{cached=null;});
  }
  return cached;
}
function paid(inv,book){return F.amount(Number(inv.netTotal||0)-remaining(inv,book),inv.currency);}
function remaining(inv,book){return (book||currentBook()).balances.get(inv.id)??F.unpaid(inv);}
window.FinanceDesk={bank,allocationChanged,allocationFields,channelSelect,invoicePayment,collection,cashShifts,fxReport,remaining,paid,nav};
})();
