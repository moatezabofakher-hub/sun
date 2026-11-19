/* Existing forms render their buttons from several different templates. */
(() => {
  const actions = [
    [/^(?:حفظ(?:\s|$)|نعم$|تأكيد الحفظ$)/, 'positive'],
    [/^(?:حذف(?:\s|$)|خروج$|إغلاق التطبيق$|الخروج بدون تعديل$|تجاهل التغييرات$)/, 'negative'],
    [/^(?:إلغاء|لا|البقاء)$/, 'neutral']
  ];
  function paint(button) {
    const label = (button.getAttribute('aria-label') || button.textContent).trim();
    const tone = actions.find(([pattern]) => pattern.test(label))?.[1];
    if (tone) button.dataset.actionTone = tone;
    else delete button.dataset.actionTone;
  }
  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.matches('button')) paint(node);
    node.querySelectorAll('button').forEach(paint);
  }
  scan(document.body);
  new MutationObserver(records => {
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      const button = target?.closest('button');
      if (button) paint(button);
      record.addedNodes.forEach(scan);
    }
  }).observe(document.body, {subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label']});
})();

/* Read-only cash sales register, including point-of-sale invoices. */
document.addEventListener('DOMContentLoaded',function(){
 'use strict';
 const employee = typeof Agent !== 'undefined' && typeof Views === 'undefined';
 let visibleCount = 10;
 let currentRows = [];
 const isPos = inv=>employee ? (inv.posSale===true || inv.source==='agent-pos') : POSController.isPOS(inv);
 function register(records, period, start, end) {
   const html = [];
   const escape = employee ? v=>Agent.escape(String(v??'')) : v=>AppEscape.text(String(v??''));
   const rows = records.filter(inv=>{
     if(!inv || (inv.type||inv.kind)!=='sale') return false;
     const pos = isPos(inv);
     const method = inv.paymentMethod||inv.paymentMode;
     const paidInFull = !method && Number(inv.netTotal)>0 && Number(inv.paidAmount)>=Number(inv.netTotal);
     if(!pos && method!=='cash' && !paidInFull) return false;
     return employee || TimeFilter.matches(inv.date,period,start,end);
   }).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
   currentRows = rows;
   const accounts = new Map(((employee?Agent.state:State).accounts||[]).map(a=>[a.id,a]));
   for(const [index,inv] of rows.slice(0,visibleCount).entries()) {
     const pos = isPos(inv);
     const type = pos ? 'نقطة بيع نقدية' : 'فاتورة بيع نقدية';
     const account = accounts.get(inv.accountId);
     const number = inv.number||inv.localNumber||inv.ref||inv.id;
     const title = type+' · '+escape(number);
     const link = employee && !pos ? '<strong>'+title+'</strong>' : '<button type="button" data-cash-index="'+index+'">'+title+'</button>';
     html.push('<li>'+link+'<span>'+escape(account?.name||inv.partyName||inv.accountName||'عميل نقدي')+'</span><span>'+escape(String(inv.date||'').slice(0,16).replace('T',' '))+'</span><b>'+escape(inv.netTotal)+' '+escape(inv.currency)+'</b></li>');
   }
   return '<details class="ta-cash-register" open><summary>فواتير البيع النقدية ('+rows.length+')</summary>'+(html.length?'<ul>'+html.join('')+'</ul>':'<p>لا توجد فواتير بيع نقدية ضمن الفترة المحددة.</p>')+(rows.length>visibleCount?'<button type="button" data-cash-more>المزيد</button>':'')+'</details>';
 }
 document.addEventListener('click',event=>{
   const control=event.target.closest?.('.ta-cash-register button');
   if(!control) return;
   if(control.hasAttribute('data-cash-more')) {
     visibleCount+=10;
     if(employee) Agent.show('reports');
     else AppNav.renderCurrent();
     return;
   }
   const inv=currentRows[Number(control.dataset.cashIndex)];
   if(!inv) return;
   if(employee) Agent.viewPosInvoice(inv.id);
   else InvoiceController.openSavedInvoice(inv.id,'view');
 });
 if(employee) {
   const render = Agent.renderReports;
   Agent.renderReports = function(...args){return render.apply(this,args)+register(this.state.ops||[]);};
 } else if(typeof Views!=='undefined') {
   const render = Views.renderReports;
   Views.renderReports = function(root,params={}) {
     const result = render.call(this,root,params);
     if(!['cashbox','pnl'].includes(params.tab||'cashbox')) return result;
     let invoices = State.invoices||[];
     if(typeof ReportAgentFilter!=='undefined' && params.tab==='pnl') {
       const scope = ReportAgentFilter.active(params.agentId);
       invoices = invoices.filter(i=>i && ReportAgentFilter.matches(i,scope));
     } else if(params.cashAgentId && params.cashAgentId!=='all') {
       invoices = invoices.filter(i=>i && (params.cashAgentId==='office'?!i.fieldOrigin?.agentId:i.fieldOrigin?.agentId===params.cashAgentId));
     }
     const section = document.createElement('div');
     section.innerHTML = register(invoices,TimeFilter.mode(params.period||TimeFilter.defaultMode()),params.date||TimeFilter.defaultStart(),params.end||TimeFilter.defaultEnd());
     root.prepend(section.firstElementChild);
     return result;
   };
 }
},{once:true});
