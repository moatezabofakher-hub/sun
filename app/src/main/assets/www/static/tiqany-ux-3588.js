/* 3.5.88 shared manager/solo UI: requires existing AppNav, UI, InvoiceController, Views. */
(function(){'use strict';
 if(typeof AppNav==='undefined'||typeof InvoiceController==='undefined'||typeof UI==='undefined')return;
 const desktop=!!window.WindowsPeerSync;
 if(desktop)document.documentElement.classList.add('ta-ux-desktop');
 const payInfo={cash:['نقدي','fa-money-bill-wave','cash'],credit:['آجل (ذمم)','fa-clock','credit'],partial:['دفعات','fa-hand-holding-dollar','partial']};
 const q=(sel,root=document)=>root.querySelector(sel);
 function enhanceInvoice(){
  const root=q('.invoice-entry-top');if(!root)return;
  root.classList.add('ta-ux-compact');
  const cur=q('.ta-invoice-currency-choice',root),d=InvoiceController.draft;
  if(cur&&!cur.dataset.ux388){cur.dataset.ux388='1';const c=d?.currency==='SYP'?'الليرة السورية':'الدولار الأمريكي';cur.innerHTML='<i class="fas fa-coins" aria-hidden="true"></i><span class="ta-ux-currency-label">العملة</span><strong class="ta-ux-currency-value">'+c+'</strong>'+(cur.disabled?'':'<i class="fas fa-rotate" aria-hidden="true"></i>');}
  const wh=q('select[onchange*="changeWarehouse"]',root);
  if(wh){const parent=wh.parentElement;parent?.classList.add('ta-ux-warehouse');const label=q('label',parent);if(label)label.innerHTML='<i class="fas fa-warehouse" aria-hidden="true"></i> المستودع';}
  const pricing=q('.ta-invoice-pricing-choice',root);
  if(pricing){const label=q('label',pricing);if(label)label.innerHTML='<i class="fas fa-tags" aria-hidden="true"></i> طريقة تسعير الفاتورة';}
  const party=q('select[onchange*="changeInvoiceAccount"]',root);
  if(party){const box=party.parentElement;box?.classList.add('ta-invoice-party-highlight');if(desktop)box?.classList.add('ta-ux-client-dark');}
  const day=q('input[onchange*="changeInvoiceDatePart"]',root);
  if(day){if(day.type!=='date')day.type='date';day.setAttribute('aria-label','تاريخ الفاتورة: اختر من التقويم');const parent=day.parentElement;
   if(parent&&!q('.ta-ux-date-button',parent)){
    const btn=document.createElement('button');btn.type='button';btn.className='ta-ux-date-button';btn.setAttribute('aria-label','فتح التقويم لاختيار تاريخ الفاتورة');btn.innerHTML='<i class="fas fa-calendar-days" aria-hidden="true"></i>';
    btn.onclick=()=>{try{day.showPicker();}catch(_){day.focus();day.click();}};parent.insertBefore(btn,day);
   }
  }
  const payment=q('button[onclick*="changePaymentMethod"]',root);
  if(payment){const box=payment.parentElement,mode=d?.paymentMethod||'cash';const choice=payInfo[mode]||payInfo.cash;
   const html='<details class="ta-payment-selector ta-payment-'+mode+'" aria-label="طريقة الدفع"><summary><span><i class="fas '+choice[1]+' ta-payment-icon" aria-hidden="true"></i> طريقة الدفع: '+choice[0]+'</span><i class="fas fa-chevron-down" aria-hidden="true"></i></summary><div class="ta-payment-options">'+Object.entries(payInfo).map(([key,[name,icon]])=>'<button type="button" class="ta-pay-'+key+'" aria-current="'+(mode===key)+'" onclick="InvoiceController.changePaymentMethod(\''+key+'\')"><i class="fas '+icon+'" aria-hidden="true"></i><span>'+name+'</span></button>').join('')+'</div></details>';
   box.outerHTML=html;
  }
  const usb=q('button[onclick*="openScanner"]');if(usb)usb.classList.add('ta-ux-usb');
  ensureBalances();
 }
 function balanceText(v,c){return v===null||!Number.isFinite(v)?'—':Accounting.format(v,c);}
 function ensureBalances(){
  const main=q('#mainContent'),save=q('button[onclick*="InvoiceController.saveInvoice(true)"]',main);
  if(!save)return;
  const row=save.parentElement;if(!row)return;
  if(!q('#taDraftBalance3588',main)){
   const node=document.createElement('div');node.id='taDraftBalance3588';node.className='ta-ux-draft-balances';row.insertAdjacentElement('beforebegin',node);
  }
  updateBalances();
 }
 function updateBalances(){
  const output=q('#taDraftBalance3588'),d=InvoiceController.draft;
  if(!output||!d)return;
  const c=d.currency==='SYP'?'SYP':'USD';
  if(!d.accountId){output.innerHTML='<h3>رصيد العميل ('+c+')</h3><p>اختر العميل لعرض الرصيد السابق والرصيد النهائي المتوقع.</p>';return;}
  if(!window.InvoiceDualBalances){output.textContent='الرصيد غير متاح مؤقتاً';return;}
  try{
   const calc=InvoiceDualBalances.managerBalance(d,State.accounts,State.invoices,State.vouchers);
   const before=balanceText(calc.before[c],c),after=balanceText(calc.after[c],c);
   output.innerHTML='<h3><i class="fas fa-scale-balanced" aria-hidden="true"></i> أرصدة العميل بعملة الفاتورة ('+c+')</h3><div class="ta-ux-balance-pair"><div><span>الرصيد السابق</span><strong dir="ltr">'+before+'</strong></div><div class="ta-ux-final"><span>الرصيد النهائي المتوقع</span><strong dir="ltr">'+after+'</strong></div></div>';
  }catch(e){console.warn('Invoice draft balance display:',e);output.textContent='تعذّر حساب الرصيد المتوقع؛ لم تتغيّر بيانات الفاتورة.';}
 }
 // v3.5.90: all full pages rely on normal Back/navigation, never an extra red X.
 function removeLegacyPageExit(){
  const main=q('#mainContent');
  main?.querySelectorAll(':scope > .ta-page-exit-line').forEach(node=>node.remove());
 }
 function popupExit(){
  const dlg=q('#dialogContainer');if(dlg&&!dlg.classList.contains('hidden')){
   const box=q('#dialogBox');if(box&&!q('.ta-close3d, .ta-popup-exit-red',box))mountExit(box,()=>{dlg.classList.add('hidden');dlg.removeAttribute('data-dialog-type');});
  }
  const mc=q('#modalContainer');if(mc&&!mc.classList.contains('hidden')){
   const box=q('#modalBox');if(box&&!q('.ta-close3d, .ta-popup-exit-red',box))mountExit(box,()=>UI.requestCloseModal());
  }
  document.querySelectorAll('[role="dialog"]:not(#modalBox):not(#dialogBox)').forEach(box=>{
   if(!box.getClientRects().length||q('.ta-close3d, .ta-popup-exit-red',box))return;
   const parent=box.closest('.hidden, [hidden]');if(parent)return;
   if(box.closest('#modalContainer, #dialogContainer'))return;
   if(box.id==='taDeviceOverlay')return;
   const close=()=>{const cancel=Array.from(box.querySelectorAll('button')).find(b=>/إلغاء|إغلاق|رجوع|×/.test(b.textContent||'')&&!/حذف|حفظ|تأكيد/.test(b.textContent||''));if(cancel)cancel.click();else if(box.closest('.ta-overlay'))box.closest('.ta-overlay').remove();};
   mountExit(box,close);
  });
 }
 function mountExit(box,callback){
  box.classList.add('ta-ux-popup-frame');
  // Reuse existing popup close controls (including scanner close), retaining their
  // original cleanup handlers. Never mistake an item-delete X for a popup close.
  const existing=Array.from(box.querySelectorAll('button')).find(btn=>{
   const action=btn.getAttribute('onclick')||'';
   const label=(btn.getAttribute('aria-label')||'')+' '+(btn.getAttribute('title')||'');
   const icon=!!btn.querySelector('.fa-times,.fa-xmark,.fa-close')||/^[×✕✖]$/.test((btn.textContent||'').trim());
   return icon&&(/(?:CloseModal|stopBarcodeScanner|closeExitDialog)/.test(action)||/إغلاق|اغلاق|close/i.test(label));
  });
  if(existing){
   existing.classList.add('ta-close3d');
   existing.setAttribute('aria-label','إغلاق النافذة');
   existing.type='button';
   box.prepend(existing);
   return;
  }
  const btn=document.createElement('button');btn.type='button';btn.className='ta-close3d';btn.setAttribute('aria-label','إغلاق النافذة');btn.textContent='×';btn.onclick=callback;box.prepend(btn);
 }
 const oldPaint=InvoiceController.paintForm;
 InvoiceController.paintForm=function(...args){const out=oldPaint.apply(this,args);enhanceInvoice();removeLegacyPageExit();return out;};
 const oldTotals=InvoiceController.updateTotalsDOM;
 InvoiceController.updateTotalsDOM=function(...args){const out=oldTotals.apply(this,args);updateBalances();return out;};
 const oldRender=Views.render;
 Views.render=function(...args){const out=oldRender.apply(this,args);removeLegacyPageExit();enhanceInvoice();popupExit();return out;};
 const oldBack=AppNav.handleBackButton;
 AppNav.handleBackButton=function(...args){
  const modal=q('#modalContainer');
  if(InvoiceController.barcodeScanActive){InvoiceController.stopBarcodeScanner();UI.forceCloseModal();return;}
  const pay=q('.ta-payment-selector[open]');if(pay){pay.open=false;return;}
  if(modal&&!modal.classList.contains('hidden')&&q('#itemGridCardsContainer')){
   const hasPending=Object.values(InvoiceController.gridPending||{}).some(x=>Number(x)>0);
   if(!hasPending){UI.forceCloseModal();return;}
   UI.showUnsavedDialog(()=>{InvoiceController.applyGridSelection();},()=>UI.forceCloseModal());return;
  }
  if(modal?.classList.contains('hidden')&&q('#dialogContainer')?.classList.contains('hidden')){
   const opened=Array.from(document.querySelectorAll('#mainContent details[open]')).reverse();
   if(opened.length){opened[0].open=false;return;}
  }
  return oldBack.apply(this,args);
 };
 const oldRequest=UI.requestCloseModal;
 UI.requestCloseModal=function(...args){if(InvoiceController.barcodeScanActive){InvoiceController.stopBarcodeScanner();UI.forceCloseModal();return;}return oldRequest.apply(this,args);};
 function ensure(){removeLegacyPageExit();popupExit();enhanceInvoice();}
 document.addEventListener('DOMContentLoaded',()=>{ensure();const main=q('#mainContent'),mod=q('#modalContainer'),dlg=q('#dialogContainer');
  const cb=()=>queueMicrotask(ensure);
  for(const el of [main,mod,dlg])if(el)new MutationObserver(cb).observe(el,{childList:true,subtree:false,attributes:false});
 });
 window.TiqanyInvoiceEnhancements3588={updateBalances,enhanceInvoice};
})();
