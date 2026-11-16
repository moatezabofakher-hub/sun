/* Tiqany 3.5.88 employee UI: payment picker, popups, Back, QR-return, online status. */
(function(){'use strict';if(typeof Agent==='undefined')return;
const A=Agent,modeInfo={cash:['نقدي','fa-money-bill-wave'],credit:['آجل (ذمم)','fa-clock'],partial:['دفعات','fa-hand-holding-dollar']};
const one=(s,root=document)=>root.querySelector(s);
function enhanceInvoice(){
 const top=one('#screen .invoice-entry-top');if(!top)return;top.classList.add('ta-ux-compact');
 const cur=one('.ta-invoice-currency-choice',top);if(cur){const badge=one('.ta-invoice-currency-code',cur);const code=A.currency==='SYP'?'ل.س':'$ USD';if(badge)badge.textContent=code;cur.setAttribute('aria-label','تبديل عملة الفاتورة؛ الحالية: '+code);}
 const wh=Array.from(top.querySelectorAll('label')).find(x=>/المستودع الذي تتأثر به/.test(x.textContent||''));if(wh){wh.parentElement?.classList.add('ta-ux-warehouse');wh.innerHTML='<i class="fas fa-warehouse" aria-hidden="true"></i> المستودع';}
 const party=one('#fAccount',top);party?.closest('.ta-invoice-party-highlight')?.classList.add('ta-ux-client-dark');
 const date=one('#agentInvoiceDate',top)||one('#fDate:not([type=hidden])',top);if(date&&!one('.ta-ux-date-button',date.parentElement)){
  const b=document.createElement('button');b.type='button';b.className='ta-ux-date-button';b.innerHTML='<i class="fas fa-calendar-days" aria-hidden="true"></i>';b.setAttribute('aria-label','فتح تقويم تاريخ الفاتورة');b.onclick=()=>{try{date.showPicker();}catch(_){date.focus();date.click();}};date.parentElement.insertBefore(b,date);
 }
 // Payment cycles on a single button in v3.5.95; do not replace it with the older popup picker.

}
function removeLegacyPageExit(){one('#screen')?.querySelectorAll(':scope > .ta-page-exit-line').forEach(node=>node.remove());} // No X on regular employee screens.
function addX(card,close){
 if(!card||one('.ta-close3d',card))return;
 card.classList.add('ta-ux-popup-frame');
 const existing=Array.from(card.querySelectorAll('button')).find(b=>{
  const action=b.getAttribute('onclick')||'';
  const label=(b.getAttribute('aria-label')||'')+' '+(b.getAttribute('title')||'');
  const icon=/^[×✕✖]$/.test((b.textContent||'').trim())||!!b.querySelector('.fa-times,.fa-xmark,.fa-close');
  return icon&&(/(?:closeInvoiceItemGrid|dismissDialog|closeCustomerForm|closePicker|forceCloseModal|requestCloseModal)/.test(action)||/إغلاق|اغلاق|close/i.test(label));
 });
 if(existing){existing.classList.add('ta-close3d');existing.type='button';existing.setAttribute('aria-label','إغلاق النافذة');card.prepend(existing);return;}
 const b=document.createElement('button');b.type='button';b.className='ta-close3d';b.textContent='×';b.setAttribute('aria-label','إغلاق النافذة');b.onclick=close;card.prepend(b);
}
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
A.show=async function(...args){const val=await originalShow.apply(this,args);enhanceInvoice();removeLegacyPageExit();popX();document.body.classList.toggle('ta-agent-operation',['invoice','voucher','receipt','payment'].includes(String(args[0]||this.screen||'')));return val;};
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
document.addEventListener('DOMContentLoaded',()=>{removeLegacyPageExit();const screen=one('#screen');if(screen)new MutationObserver(()=>queueMicrotask(()=>{removeLegacyPageExit();enhanceInvoice();popX();connectionStatus();})).observe(screen,{childList:true,subtree:false});
 const dialog=one('#agentDialog');if(dialog)new MutationObserver(popX).observe(dialog,{attributes:true,attributeFilter:['class']});
 const cust=one('#agentNewCustomerModal');if(cust)new MutationObserver(popX).observe(cust,{attributes:true,attributeFilter:['class']});
});
})();
