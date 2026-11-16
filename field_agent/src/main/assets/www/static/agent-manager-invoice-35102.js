/* 3.5.103: keep the employee invoice/voucher footer docked to the viewport.
 * Do not change the ledger, saving actions, agent permissions, or stored currency codes. */
(function(){'use strict';
const A=window.Agent||Agent;
let observedFooter=null;
const footerObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>measureFooter()):null;
function measureFooter(){
 const footer=observedFooter;
 if(!footer||!footer.isConnected)return;
 const height=Math.ceil(footer.getBoundingClientRect().height);
 if(height>0&&document.documentElement.style.getPropertyValue('--ta-agent-operation-footer-height')!==height+'px')
   document.documentElement.style.setProperty('--ta-agent-operation-footer-height',height+'px');
}
function syncWorkspace(){
 const screen=document.getElementById('screen');
 const invoice=A.screen==='invoice'&&!!screen?.querySelector('.ta-agent-invoice-save-footer');
 const voucher=A.screen==='voucher'&&!!screen?.querySelector('.ta-agent-voucher-footer');
 document.body.classList.toggle('ta-agent-invoice-workspace',invoice);
 document.body.classList.toggle('ta-agent-voucher-workspace',voucher);
 const dock=document.getElementById('bottom');
 if(dock&&(invoice||voucher))dock.classList.add('hide');
 const footer=invoice?screen.querySelector('.ta-agent-invoice-save-footer'):voucher?screen.querySelector('.ta-agent-voucher-footer'):null;
 if(footer!==observedFooter){
   if(observedFooter&&footerObserver)footerObserver.unobserve(observedFooter);
   observedFooter=footer;
   if(footer&&footerObserver)footerObserver.observe(footer);
 }
 if(footer)measureFooter();
 else document.documentElement.style.removeProperty('--ta-agent-operation-footer-height');
}
const oldShow=A.show;
A.show=async function(...args){
 try{return await oldShow.apply(this,args);}
 finally{syncWorkspace();}
};
const connect=()=>{
 const screen=document.getElementById('screen');
 if(screen&&typeof MutationObserver==='function')
   new MutationObserver(syncWorkspace).observe(screen,{childList:true});
 syncWorkspace();
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',connect,{once:true});
else connect();
window.addEventListener?.('resize',syncWorkspace,{passive:true});
})();
