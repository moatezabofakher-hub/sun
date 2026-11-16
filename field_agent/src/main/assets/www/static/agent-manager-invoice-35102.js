/* 3.5.102: manager-like staff invoice workspace. Layout only: no inventory or ledger rewrites. */
(function(){'use strict';
const A=Agent;
function refreshLayout(){
 const invoice=A.screen==='invoice'&&!!document.querySelector?.('#screen .agent-main-invoice');
 document.body.classList.toggle('ta-agent-invoice-workspace',invoice);
 const dock=document.getElementById('bottom');
 if(dock&&invoice)dock.classList.add('hide');
 if(!invoice){document.documentElement.style.removeProperty('--ta-agent-invoice-footer-height');return;}
 const footer=document.querySelector('.ta-agent-invoice-save-footer');
 const height=Math.ceil(footer?.getBoundingClientRect?.().height||134);
 if(document.documentElement.style.getPropertyValue('--ta-agent-invoice-footer-height')!==height+'px')document.documentElement.style.setProperty('--ta-agent-invoice-footer-height',height+'px');
}
const originalShow=A.show.bind(A);
A.show=async function(...args){const result=await originalShow(...args);refreshLayout();return result;};
if(typeof ResizeObserver==='function'){
 const observer=new ResizeObserver(()=>refreshLayout());
 document.addEventListener('DOMContentLoaded',()=>{const main=document.getElementById('screen');if(main)observer.observe(main);});
 // A new invoice render replaces the footer element; observe its changing size as well.
 const renderShow=A.show.bind(A);
 A.show=async function(...args){const result=await renderShow(...args);const footer=document.querySelector('.ta-agent-invoice-save-footer');if(footer)observer.observe(footer);return result;};
}
window.addEventListener?.('resize',refreshLayout,{passive:true});
})();
