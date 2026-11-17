/* v3.5.133 per-key settings revision stamps. Local printer, app license and pairing
 * secrets are NEVER stamped or transmitted. Used by Android and Windows manager.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.SettingsRevisionClock=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const deviceOnly=k=>['companyUid','appProtection','peerBootstrapSourceUid','deviceId',
   'btMacAddress','lastSyncEndpoint','localPrinterName','printerDeviceId','_syncSettingTimes'].includes(k)||
   /(?:privateKey|accessToken|refreshToken|pairingSecret|deviceToken)$/i.test(k);
 const canonical=x=>JSON.stringify(sort(x));
 function sort(x){if(Array.isArray(x))return x.map(sort);if(x&&typeof x==='object'){const o={};for(const k of Object.keys(x).sort())o[k]=sort(x[k]);return o;}return x}
 function settings(cfg){
   const out={};for(const [k,v] of Object.entries(cfg||{}))if(!deviceOnly(k)&&!['__proto__','constructor','prototype'].includes(k)&&v!==undefined)out[k]=v;
   const security=cfg?.appProtection;
   if(security&&typeof security==='object'&&security.pinHash&&security.pinSalt){
     out.managerSecurity={pinSalt:security.pinSalt,pinHash:security.pinHash,pinAlgo:security.pinAlgo,
       securityQuestions:Array.isArray(security.securityQuestions)?security.securityQuestions:[],
       protectDeviceAddition:security.protectDeviceAddition===true,
       protectDeletion:security.protectDeletion===true,lockApp:security.lockApp===true};
   }
   return JSON.parse(JSON.stringify(out));
 }
 let baseline=null;
 function id(){
   try{const k='tiqany-settings-device-id-v1';let existing=localStorage.getItem(k);
     if(existing&&/^[A-Za-z0-9_-]{12,128}$/.test(existing))return existing;
     const c=typeof crypto!=='undefined'?crypto:null;
     if(!c?.getRandomValues)return 'device-without-clock';
     const a=c.getRandomValues(new Uint8Array(18));
     existing='device_'+Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
     localStorage.setItem(k,existing);return existing;
   }catch(_){return 'device-without-clock'}
 }
 function remember(cfg){baseline=settings(cfg)}
 function touch(cfg,at=new Date().toISOString()){
   const fresh=settings(cfg);
   if(baseline===null){remember(cfg);return []}
   const changed=[];
   if(!cfg._syncSettingTimes||typeof cfg._syncSettingTimes!=='object'||Array.isArray(cfg._syncSettingTimes))cfg._syncSettingTimes={};
   for(const k of new Set([...Object.keys(baseline),...Object.keys(fresh)])){
     if(canonical(baseline[k])===canonical(fresh[k]))continue;
     const stamp={updatedAt:at,deviceId:id()};
     cfg._syncSettingTimes[k]=stamp;changed.push(k);
   }
   return changed;
 }
 return {settings,remember,touch,deviceOnly};
});
