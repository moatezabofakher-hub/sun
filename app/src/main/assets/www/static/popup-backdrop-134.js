/* v3.5.134: dismiss all popup overlays ONLY via system Back or explicit controls.
   Capture before inline onclick handlers to prevent backdrop tap/click close.
   Never block interaction inside the actual dialog/card.
*/
(function(root){
 'use strict';
 if(typeof document==='undefined')return;
 const overlays='#modalContainer,#dialogContainer,.dialog-mask,.agent-picker-mask,.popup-overlay,.modal-overlay';
 const surfaces='#modalBox,#dialogBox,.dialog-card,.agent-picker-content,[role="dialog"],.popup-card,.modal-card';
 function outside(e){
   const target=e.target;
   if(!target||typeof target.closest!=='function')return false;
   const layer=target.closest(overlays);
   if(!layer)return false;
   // A backdrop may contain decorative wrappers; all interactive dialog
   // descendants remain clickable and keyboard-accessible.
   const card=target.closest(surfaces);
   return !card || !layer.contains(card);
 }
 function block(e){
   if(!outside(e))return;
   if(e.cancelable)e.preventDefault();
   e.stopImmediatePropagation();
 }
 for(const kind of ['pointerdown','mousedown','touchstart','click','dblclick']){
   document.addEventListener(kind,block,{capture:true,passive:false});
 }
 root.PopupBackdrop134={outside,block};
})(typeof globalThis==='object'?globalThis:this);
