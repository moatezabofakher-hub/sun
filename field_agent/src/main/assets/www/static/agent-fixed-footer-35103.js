/* 3.5.103 — route-aware employee invoice/voucher footer visibility and clearance.
 * Presentation only; operation posting, security and ledger logic remain unchanged.
 */
(function(){'use strict';
  if(typeof Agent==='undefined')return;
  const A=Agent;
  const root=document.documentElement;
  const main=()=>document.getElementById('screen');
  const dock=()=>document.getElementById('bottom');
  let watchedFooter=null;
  let frameQueued=false;
  let footerResize=null;
  function measure(){
    frameQueued=false;
    const invoice=document.body.classList.contains('ta-agent-invoice-workspace');
    const voucher=document.body.classList.contains('ta-agent-voucher-workspace');
    const footer=invoice?document.querySelector('.ta-agent-invoice-save-footer'):
      voucher?document.querySelector('.ta-agent-voucher-save-footer'):null;
    if(watchedFooter!==footer){
      if(footerResize)footerResize.disconnect();
      watchedFooter=footer;
      if(footerResize&&footer)footerResize.observe(footer);
    }
    const height=footer?Math.ceil(footer.getBoundingClientRect().height):0;
    const value=height+'px';
    if(height>0){
      if(root.style.getPropertyValue('--ta-agent-fixed-footer-height')!==value){
        root.style.setProperty('--ta-agent-fixed-footer-height',value);
      }
    }else root.style.removeProperty('--ta-agent-fixed-footer-height');
  }
  function queueMeasure(){
    if(frameQueued)return;
    frameQueued=true;
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(measure);
    else measure();
  }
  function updateWorkspace(){
    const screen=A.screen;
    const view=main();
    const invoice=screen==='invoice'&&!!view?.querySelector('.agent-main-invoice');
    const voucher=screen==='voucher'&&!!view?.querySelector('.ta-agent-voucher-save-footer');
    document.body.classList.toggle('ta-agent-invoice-workspace',invoice);
    document.body.classList.toggle('ta-agent-voucher-workspace',voucher);
    // Preserve the normal application's own hide state on ordinary pages.
    const navigation=dock();
    if(navigation){
      if(invoice||voucher){
        navigation.classList.add('hide');
        navigation.style.setProperty('display','none','important');
      }else navigation.style.removeProperty('display');
    }
    queueMeasure();
  }
  const oldShow=A.show.bind(A);
  A.show=async function(...args){
    const result=await oldShow(...args);
    updateWorkspace();
    return result;
  };
  if(typeof ResizeObserver==='function')footerResize=new ResizeObserver(queueMeasure);
  document.addEventListener('DOMContentLoaded',()=>{
    const screen=main();
    if(screen&&typeof MutationObserver==='function'){
      // Any rerender that replaces invoice/voucher content must refresh the route-specific footer.
      new MutationObserver(updateWorkspace).observe(screen,{childList:true,subtree:false});
    }
    updateWorkspace();
    window.addEventListener('resize',queueMeasure,{passive:true});
    window.addEventListener('orientationchange',queueMeasure,{passive:true});
  });
})();
