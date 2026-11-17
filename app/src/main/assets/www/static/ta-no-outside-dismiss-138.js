/* Tiqany popup policy: tapping outside a popup cannot close it. */
(function(){
 'use strict';
 // Capture first, before legacy backdrop click handlers. Explicit close/save/back controls work.
 const overlays=[
   '#modalContainer','#dialogContainer','#itmCurrencyPopup','#soloDefaultCurrencyPopup',
   '#appProtectionLock','#agentDialog','#agentNewCustomerModal','#agentItemPicker',
   '#agentPosNameList','.dialog-mask','.agent-picker-mask','.modal-overlay',
   '.popup-overlay','.dialog-overlay','.modal-backdrop','.popup-backdrop',
   '[data-ta-popup-backdrop]'
 ].join(',');
 function blockBackdrop(event){
   const t=event.target;
   if(!t||typeof t.matches!=='function')return;
   if(t.matches(overlays)){
     event.preventDefault();event.stopImmediatePropagation();return;
   }
   if(t.matches('dialog[open]')&&typeof t.getBoundingClientRect==='function'){
     const r=t.getBoundingClientRect();
     if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom){
       event.preventDefault();event.stopImmediatePropagation();
     }
   }
 }
 ['pointerdown','mousedown','touchstart','click'].forEach(type=>
   document.addEventListener(type,blockBackdrop,{capture:true,passive:false}));
})();
