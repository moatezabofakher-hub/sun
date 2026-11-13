/* Automatic encrypted LAN sync. Works when both Android WebViews are running.
 * The authoritative manager remains the only writer of company ledger records.
 */
(function(){
 'use strict';
 const ONLINE_PERIOD=12000;  // pull updated prices/stock even with zero new sales
 const OFFLINE_RETRY=20000;
 const BUSY_RETRY=1250;
 const A=Agent;
 A.autoSyncStarted=false;
 A.autoSyncTimer=null;
 A.autoSyncState='waiting';
 A.markSyncState=function(state){
   this.autoSyncState=state;
   const text={connected:'● متصل بالمركز',connecting:'◌ جارٍ الاتصال',offline:'○ بانتظار الرئيسي',waiting:'◌ بانتظار التفعيل'}[state]||state;
   const badge=document.getElementById('agentSyncConnection');
   if(badge){badge.textContent=text;badge.style.background=state==='connected'?'#0c7b66':state==='offline'?'#6b637a':'#235c6c';}
   const status=document.getElementById('agentAutoSyncStatus');
   if(status)status.textContent=state==='connected'?'✅ متصل — إرسال واستقبال تلقائي كل 12 ثانية':
      state==='connecting'?'جارٍ البحث عن الرئيسي في الشبكة المحلية…':
      state==='offline'?'بانتظار اتصال الرئيسي؛ سنعيد المحاولة تلقائيًا':
      'بانتظار ربط المندوب وتفعيل جهازه';
 };
 A.scheduleAutoSync=function(delay=0){
   if(!this.autoSyncStarted)return;
   if(this.autoSyncTimer!==null)clearTimeout(this.autoSyncTimer);
   this.autoSyncTimer=setTimeout(()=>{this.autoSyncTimer=null;this.autoSyncTick();},Math.max(0,delay));
 };
 A.autoSyncTick=async function(){
  try {
   if(!this.autoSyncStarted)return;
   if(document.hidden){this.scheduleAutoSync(OFFLINE_RETRY);return;}
   if(this.lanSyncBusy||this.busy){this.scheduleAutoSync(BUSY_RETRY);return;}
   if(!window.AndroidLocalSync?.send||!this.ready()||!await this.active()){
     this.markSyncState('waiting');this.scheduleAutoSync(OFFLINE_RETRY);return;
   }
   this.markSyncState('connecting');
   await this.syncOneTap({quiet:true});
   // A manual request might win the race while signature verification awaits.
   if(!this.lanSyncBusy && this.autoSyncTimer===null)this.scheduleAutoSync(BUSY_RETRY);
   // The native result callback schedules the next sync after ACK/error.
  } catch(e) {
   this.lanSyncMessage=String(e?.message||e);
   this.finishAutoSync(false);
  }
 };
 A.finishAutoSync=function(success){
   if(!this.autoSyncStarted)return;
   this.markSyncState(success?'connected':'offline');
   this.scheduleAutoSync(success && this.pending?.length ? 750 : success ? ONLINE_PERIOD : OFFLINE_RETRY);
 };
 A.startAutoSync=function(){
   if(this.autoSyncStarted){this.scheduleAutoSync(0);return;}
   this.autoSyncStarted=true;
   this.markSyncState('waiting');
   this.scheduleAutoSync(0);
 };
 document.addEventListener('visibilitychange',()=>{
   if(!document.hidden && A.autoSyncStarted)A.scheduleAutoSync(0);
 });
 const init=A.init.bind(A);
 A.init=async function(){await init();if(this.state)this.startAutoSync();};
 const activate=A.activate.bind(A);
 A.activate=async function(...args){await activate(...args);if(this.ready())this.startAutoSync();};
 const importFile=A.importFile.bind(A);
 A.importFile=async function(...args){
   const priorBusy=this.busy;
   this.busy=true; // prevent concurrent auto-pull from replacing the imported provision
   try{await importFile(...args);}finally{this.busy=priorBusy;}
   if(this.ready())this.startAutoSync();
 };
 // Wake the sync loop right after a successfully persisted field operation.
 for(const name of ['saveInvoice','saveVoucher','saveInvoicePayment']){
   if(typeof A[name]!=='function')continue;
   const original=A[name].bind(A);
   A[name]=async function(...args){
     const before=this.state?.ops?.length||0;
     await original(...args);
     if((this.state?.ops?.length||0)>before)this.scheduleAutoSync(250);
   };
 }
})();
