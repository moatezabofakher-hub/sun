/* Syrian Pound is shown as ل.س; data/API still uses canonical ISO code SYP. */
(function(){
  'use strict';
  const update=node=>{
    if(!node)return;
    if(node.nodeType===3){
      const parent=node.parentElement;
      if(parent && parent.closest('script,style,textarea,code,pre,[contenteditable="true"]'))return;
      if(/\bSYP\b/.test(node.nodeValue))node.nodeValue=node.nodeValue.replace(/\bSYP\b/g,'ل.س');
      return;
    }
    if(node.nodeType!==1||node.matches('script,style,textarea,code,pre,[contenteditable="true"]'))return;
    const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
    let child;while((child=walker.nextNode())){
      if(!child.parentElement?.closest('script,style,textarea,code,pre,[contenteditable="true"]')&&/\bSYP\b/.test(child.nodeValue))child.nodeValue=child.nodeValue.replace(/\bSYP\b/g,'ل.س');
    }
  };
  const init=()=>{
    update(document.body);
    const obs=new MutationObserver(records=>{
      for(const m of records){
        if(m.type==='characterData')update(m.target);
        for(const n of m.addedNodes)update(n);
      }
    });
    obs.observe(document.body,{childList:true,characterData:true,subtree:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
