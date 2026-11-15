/* Shared support UI for the main, independent, sales representative, and Windows applications. */
(()=>{
 'use strict';
 const SUPPORT_PHONES=Object.freeze(['963932325577','963968643771']);
 const title='التواصل مع الدعم';
 const launch=()=>`<button type="button" class="ta-support-launch" onclick="TiqanySupport.open()" aria-label="التواصل مع الدعم" data-ta-support-launch>
   <img src="static/tiqany-support-3d.svg" alt="" class="ta-support-icon" aria-hidden="true">
   <span class="ta-support-copy"><strong>التواصل مع الدعم</strong><small>مجموعة التقني للمحاسبة و المستودعات</small></span>
 </button>`;
 const dialog=()=>`<section class="ta-support-dialog" role="document" dir="rtl" data-ta-support-dialog>
   <div class="ta-support-heading"><img src="static/tiqany-support-3d.svg" class="ta-support-icon" alt=""><h2 id="taSupportTitle">${title}</h2>
     <button class="ta-support-close" type="button" aria-label="إغلاق نافذة الدعم" onclick="TiqanySupport.close()">×</button>
   </div>
   <div class="ta-support-group">مجموعة التقني للمحاسبة و المستودعات</div>
   ${SUPPORT_PHONES.map((p,i)=>`<a class="ta-support-link" href="https://wa.me/${p}" target="_blank" rel="noopener noreferrer" onclick="return TiqanySupport.routeLink(this)" aria-label="فتح واتساب على الرقم 00${p}"><span>واتساب <span aria-hidden="true">💬</span></span><b>00${p}</b></a>`).join('')}
   <p>اضغط على الرقم المطلوب لفتح المحادثة في واتساب.</p>
 </section>`;
 const state={standalone:null,previousFocus:null};
 window.TiqanySupport={
   launch,dialog,
   open(){
     state.previousFocus=document.activeElement;
     if(typeof UI!=='undefined' && UI && typeof UI.openModal==='function'){
       UI.openModal(dialog());
     } else {
       if(!state.standalone){
         const el=document.createElement('div');
         el.id='taSupportOverlay';el.className='ta-support-overlay';el.hidden=true;
         el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-labelledby','taSupportTitle');
         document.body.appendChild(el);state.standalone=el;
       }
       state.standalone.innerHTML=dialog();
       state.standalone.hidden=false;
     }
     const close=document.querySelector('#taSupportOverlay:not([hidden]) .ta-support-close,[data-ta-support-dialog] .ta-support-close');
     close?.focus();
   },
   close(){
     if(state.standalone && !state.standalone.hidden){state.standalone.hidden=true;state.standalone.innerHTML='';}
     else if(typeof UI!=='undefined' && UI && typeof UI.forceCloseModal==='function')UI.forceCloseModal();
     state.previousFocus?.focus?.();
   },
   routeLink(anchor){
     // Android WebView (appassets) intercepts same-window https://wa.me links and opens WhatsApp externally.
     // Electron intercepts target=_blank with shell.openExternal, keeping financial data in-app.
     anchor.target=(location.hostname==='appassets.androidplatform.net')?'_self':'_blank';
     return true;
   }
 };
 document.addEventListener('keydown',e=>{
   if(e.key==='Escape' && state.standalone && !state.standalone.hidden){e.preventDefault();e.stopImmediatePropagation();window.TiqanySupport.close();}
 },true);
})();
