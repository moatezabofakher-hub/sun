/* Direct user initiated reconnect and new-page top navigation. */
(function(){'use strict';
 const A=Agent;
 A.requestSyncFromHeader=function(){
   if(!this.ready()){this.toast('اربط هاتف المندوب بالتطبيق الرئيسي أولاً');return;}
   if(this.lanSyncBusy){this.toast('تجري المزامنة الآن، سيعاد الاتصال عند انتهائها');this.scheduleAutoSync?.(2000);return;}
   this.markSyncState?.('connecting');
   this.syncOneTap({quiet:false});
 };
 const originalShow=A.show.bind(A);
 A.show=async function(route,...args){const changed=this.screen!==route;
   const result=await originalShow(route,...args);
   if(changed){const root=document.getElementById('screen');if(root)root.scrollTop=0;window.scrollTo?.(0,0);}
   return result;
 };
})();
