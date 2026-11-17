/* Tiqany focus policy: never open the virtual keyboard merely by opening a screen/modal.
 * Native taps, keyboard navigation and explicit interaction with text fields still work.
 */
(function(){
 'use strict';
 if(typeof document==='undefined'||typeof HTMLElement==='undefined')return;
 const editable=function(el){
   if(!el||!el.tagName)return false;
   const tag=String(el.tagName).toUpperCase();
   if(tag==='TEXTAREA'||el.isContentEditable===true)return true;
   if(tag!=='INPUT')return false;
   return !/^(hidden|checkbox|radio|button|submit|reset|file|color|range|date|datetime-local|month|time|week|image)$/.test(String(el.type||'text').toLowerCase());
 };
 let explicitUntil=0;
 const intent=(event)=>{
   const target=event.target;
   const field=target?.closest?.('input,textarea,[contenteditable="true"],[role="textbox"]');
   if(field&&editable(field))explicitUntil=Date.now()+1100;
 };
 // Hardware keyboard Tab is an intentional navigation action, not auto-focus.
 document.addEventListener('pointerdown',intent,{capture:true,passive:true});
 document.addEventListener('touchstart',intent,{capture:true,passive:true});
 document.addEventListener('mousedown',intent,{capture:true,passive:true});
 document.addEventListener('click',intent,{capture:true,passive:true});
 document.addEventListener('keydown',(event)=>{
   if(event.key==='Tab')explicitUntil=Date.now()+1100;
 },true);
 const originalFocus=HTMLElement.prototype.focus;
 HTMLElement.prototype.focus=function(...args){
   if(editable(this)&&Date.now()>explicitUntil){
     // Caller is drawing a form/verification popup, not the user selecting a field.
     return;
   }
   return originalFocus.apply(this,args);
 };
 const stripAutofocus=(root)=>{
   if(!root||root.nodeType!==1)return;
   if(root.hasAttribute?.('autofocus'))root.removeAttribute('autofocus');
   root.querySelectorAll?.('[autofocus]').forEach(el=>el.removeAttribute('autofocus'));
 };
 const start=()=>{
   stripAutofocus(document.documentElement);
   if(typeof MutationObserver==='function')new MutationObserver(records=>{
     for(const rec of records){
       if(rec.type==='attributes'&&rec.attributeName==='autofocus')
         rec.target?.removeAttribute('autofocus');
       for(const node of rec.addedNodes||[])stripAutofocus(node);
     }
   }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['autofocus']});
 };
 if(document.documentElement)start();
 else document.addEventListener('DOMContentLoaded',start,{once:true});
})();
