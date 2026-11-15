/* Tiqany 3.5.88 employee UI: payment picker, popups, Back, QR-return, online status. */
(function(){'use strict';if(typeof Agent==='undefined')return;
const A=Agent,modeInfo={cash:['نقدي','fa-money-bill-wave'],credit:['آجل (ذمم)','fa-clock'],partial:['دفعات','fa-hand-holding-dollar']};
const one=(s,root=document)=>root.querySelector(s);
function enhanceInvoice(){
 const top=one('#screen .invoice-entry-top');if(!top)return;top.classList.add('ta-ux-compact');
 const cur=one('.ta-invoice-currency-choice',top);if(cur&&!cur.dataset.ux388){cur.dataset.ux388='1';cur.innerHTML='<i class="fas fa-coins" aria-hidden="true"></i><span class="ta-ux-currency-label">العملة</span><strong class="ta-ux-currency-value">'+(A.currency==='SYP'?'الليرة السورية':'الدولار الأمريكي')+'</strong><i class="fas fa-rotate" aria-hidden="true"></i>';}
 const wh=Array.from(top.querySelectorAll('label')).find(x=>/المستودع الذي تتأثر به/.test(x.textContent||''));if(wh){wh.parentElement?.classList.add('ta-ux-warehouse');wh.innerHTML='<i class="fas fa-warehouse" aria-hidden="true"></i> المستودع';}
 const party=one('#fAccount',top);party?.closest('.ta-invoice-party-highlight')?.classList.add('ta-ux-client-dark');
 const date=one('#fDate',top);if(date&&!one('.ta-ux-date-button',date.parentElement)){
  const b=document.createElement('button');b.type='button';b.className='ta-ux-date-button';b.innerHTML='<i class="fas fa-calendar-days" aria-hidden="true"></i>';b.setAttribute('aria-label','فتح تقويم تاريخ الفاتورة');b.onclick=()=>{try{date.showPicker();}catch(_){date.focus();date.click();}};date.parentElement.insertBefore(b,date);
 }
 const pay=one('button[onclick*="changeInvoicePayment"]',top);if(pay){
  const group=pay.parentElement,mode=A.invoiceMeta?.paymentMode||'cash',chosen=modeInfo[mode]||modeInfo.cash;
  group.outerHTML='<details class="ta-payment-selector ta-payment-'+mode+'" aria-label="طريقة الدفع"><summary><span><i class="fas '+chosen[1]+' ta-payment-icon" aria-hidden="true"></i> طريقة الدفع: '+chosen[0]+'</span><i class="fas fa-chevron-down"></i></summary><div class="ta-payment-options">'+Object.entries(modeInfo).map(([v,[label,icon]])=>'<button type="button" class="ta-pay-'+v+'" aria-current="'+(v===mode)+'" onclick="Agent.changeInvoicePayment(\''+v+'\')"><i class="fas '+icon+'"></i><span>'+label+'</span></button>').join('')+'</div></details>';
 }
}
function pageX(){const root=one('#screen');if(!root||one(':scope > .ta-page-exit-line',root))return;const row=document.createElement('div');row.className='ta-page-exit-line';row.innerHTML='<button type="button" class="ta-close3d" aria-label="إغلاق الصفحة أو الرجوع" title="إغلاق أو رجوع">×</button>';row.firstChild.onclick=()=>A.goBack();root.prepend(row);}
function addX(card,close){if(!card||one('.ta-close3d',card))return;card.classList.add('ta-ux-popup-frame');const b=document.createElement('button');b.type='button';b.className='ta-close3d';b.textContent='×';b.setAttribute('aria-label','إغلاق النافذة');b.onclick=close;card.prepend(b);}
function popX(){const dlg=one('#agentDialog');if(dlg&&!dlg.classList.contains('hide'))addX(one('.dialog-card',dlg),()=>A.dismissDialog());
 const customer=one('#agentNewCustomerModal');if(customer&&!customer.classList.contains('hide'))addX(one('.dialog-card',customer),()=>A.closeCustomerForm?.());
 const picker=one('#agentItemPicker');if(picker)addX(one('.agent-picker-content',picker),()=>closePicker());
 document.querySelectorAll('.dialog-mask:not(.hide):not(#agentDialog):not(#agentNewCustomerModal),.agent-picker-mask:not(#agentItemPicker)').forEach(mask=>{
  const card=one('.dialog-card,.agent-picker-content',mask);if(card)addX(card,()=>{const cancel=Array.from(card.querySelectorAll('button')).find(b=>/إلغاء|إغلاق|×/.test(b.textContent||'')&&!/حفظ|حذف/.test(b.textContent||''));if(cancel)cancel.click();else mask.classList.add('hide');});
 });
}
function closePicker(){const picked=Object.values(A.gridPending||{}).some(x=>Number(x)>0);if(!picked){A.closeInvoiceItemGrid();return;}
 A.confirmAction('مواد لم تُضَف بعد','هناك مواد محددة في الشبكة. هل تريد إغلاقها دون إضافتها إلى الفاتورة؟',()=>A.closeInvoiceItemGrid());
}
const originalBack=A.goBack;A.goBack=async function(...args){
 if(one('#agentItemPicker')){closePicker();return;}
 const open=one('#screen .ta-payment-selector[open]');if(open){open.open=false;return;}
 if(one('#agentNewCustomerModal:not(.hide)')){this.closeCustomerForm?.();return;}
 const dialog=one('#agentDialog:not(.hide)');if(dialog){this.dismissDialog();return;}
 const details=Array.from(document.querySelectorAll('#screen details[open]'));if(details.length){details.at(-1).open=false;return;}
 return originalBack.apply(this,args);
};
const originalShow=A.show;
A.show=async function(...args){const val=await originalShow.apply(this,args);enhanceInvoice();pageX();popX();return val;};
const originalOpenGrid=A.openInvoiceItemGrid;
if(typeof originalOpenGrid==='function')A.openInvoiceItemGrid=function(...args){const val=originalOpenGrid.apply(this,args);popX();return val;};
const pair=window.AgentPairing;
if(pair&&typeof pair.onQrScanned==='function'){
 const oldPair=pair.onQrScanned;
 pair.onQrScanned=async function(...args){const oldEndpoint=JSON.stringify(A.state?.localQrTarget||{});const out=await oldPair.apply(this,args);
  if(JSON.stringify(A.state?.localQrTarget||{})!==oldEndpoint){
   // The native QR Activity has already closed; return to the connection request.
   await A.show(A.ready()?'sync':'setup');this.paint();
   const status=one('#agentPairStatus');status?.scrollIntoView?.({block:'nearest'});
  }
  return out;
 };
}
function connectionStatus(){const sync=one('#agentAutoSyncStatus'),page=one('#screen');if(!sync||!page)return;
 let badge=one('#taAgentPresence3588');if(!badge){badge=document.createElement('div');badge.id='taAgentPresence3588';sync.insertAdjacentElement('beforebegin',badge);}
 const state=A.autoSyncState||'waiting';badge.className='ta-peer-presence '+(state==='connected'?'connected':state==='offline'?'offline':'connecting');badge.textContent=state==='connected'?'● متصل بالمسؤول':state==='offline'?'● غير متصل — البحث عن البديل':'◌ جارٍ الاتصال';
}
const origMark=A.markSyncState;
if(typeof origMark==='function')A.markSyncState=function(...args){const val=origMark.apply(this,args);connectionStatus();return val;};
document.addEventListener('DOMContentLoaded',()=>{pageX();const screen=one('#screen');if(screen)new MutationObserver(()=>queueMicrotask(()=>{pageX();enhanceInvoice();popX();connectionStatus();})).observe(screen,{childList:true,subtree:false});
 const dialog=one('#agentDialog');if(dialog)new MutationObserver(popX).observe(dialog,{attributes:true,attributeFilter:['class']});
 const cust=one('#agentNewCustomerModal');if(cust)new MutationObserver(popX).observe(cust,{attributes:true,attributeFilter:['class']});
});
})();
