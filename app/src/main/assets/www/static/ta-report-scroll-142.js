/* v142: preserve report and shareholder modal scroll while navigating Back.
   Leaving reports is intentionally not remembered. */
(function(){
'use strict';
if(typeof document==='undefined'||typeof AppNav==='undefined')return;
const frame=fn=>(typeof requestAnimationFrame==='function'?requestAnimationFrame(fn):Promise.resolve().then(fn));
function currentScroll(){
 const main=document.getElementById('mainContent');
 const modal=document.getElementById('modalBox');
 const overlay=document.getElementById('modalContainer');
 return {y:window.scrollY||0,main:main?.scrollTop||0,modal:modal?.scrollTop||0,overlay:overlay?.scrollTop||0};
}
function restore(s){
 frame(()=>{const main=document.getElementById('mainContent'),modal=document.getElementById('modalBox'),overlay=document.getElementById('modalContainer');
 if(main)main.scrollTop=s.main;
 if(modal)modal.scrollTop=s.modal;
 if(overlay)overlay.scrollTop=s.overlay;
 try{window.scrollTo({top:s.y,left:window.scrollX||0,behavior:'instant'});}catch(_){window.scrollTo(0,s.y);}
 });
}
if(typeof ShareholdersUI!=='undefined'){
 const oldBack=ShareholdersUI.back;
 ShareholdersUI.back=function(...args){
   const scroll=currentScroll();
   const result=oldBack.apply(this,args);
   if(AppNav.current()?.screen==='reports')restore(scroll);
   return result;
 };
 const oldOwner=ShareholdersUI.ownerForm;
 if(typeof oldOwner==='function')ShareholdersUI.ownerForm=function(...args){
   const scroll=currentScroll(),result=oldOwner.apply(this,args);
   if(AppNav.current()?.screen==='reports')restore(scroll);
   return result;
 };
}
const originalNavigate=AppNav.navigate;
AppNav.navigate=function(screen,params,replace){
 const preserve=this.current()?.screen==='reports'&&screen==='reports';
 const before=preserve?currentScroll():null;
 const result=originalNavigate.call(this,screen,params,replace);
 if(before)restore(before);
 return result;
};
})();