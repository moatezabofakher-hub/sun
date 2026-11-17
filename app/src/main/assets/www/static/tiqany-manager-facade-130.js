/* 3.5.130: Android-to-Android manager peer bridge (separate from Windows link). */
(function(){
'use strict';
const nat=window.AndroidManagerPeerServer;
window.AndroidManagerPeerServerFacade={
  config:async()=>{try{return JSON.parse(nat?.config?.()||'{}')}catch(_){return {ready:false}}},
  reply:(id,data)=>nat?.reply?.(String(id),JSON.stringify(data)),
  changed:()=>{}
};
window.AndroidManagerPeerDesktop={
  onPeerRequest(fn){this.requestHandler=fn},
  onPeerStatus(fn){this.statusHandler=fn}
};
// Native Java sends server requests to the authenticated server controller.
window.__managerServerRequest=req=>window.AndroidManagerPeerDesktop?.requestHandler?.(req);
window.__managerServerStatus=status=>window.AndroidManagerPeerDesktop?.statusHandler?.(status);
})();
