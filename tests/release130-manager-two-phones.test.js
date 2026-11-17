'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.join(__dirname,'../app/src/main/assets/www');
const source=fs.readFileSync(path.join(base,'static/tiqany-manager-sync-130.js'),'utf8');
const index=fs.readFileSync(path.join(base,'index.html'),'utf8');
const java=fs.readFileSync(path.join(__dirname,'../app/src/main/java/com/sunshine/accounting/MainManagerPeerSync.java'),'utf8');
const activity=fs.readFileSync(path.join(__dirname,'../app/src/main/java/com/sunshine/accounting/MainActivity.java'),'utf8');
const core=require(path.join(base,'static/tiqany-peer-merge.js'));
const events=require(path.join(base,'static/tiqany-peer-events.js'));
const ids={one:'business_'+''.padStart(32,'1'),two:'business_'+''.padStart(32,'2')};
const verifier={pinAlgo:'pbkdf2-sha256-v1',pinSalt:'YWJjZGVmZ2hpamtsbW5vcA==',pinHash:'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU=',protectDeletion:true,protectDeviceAddition:true,securityQuestions:[],lockApp:true};
function state(uid,filled=false){
 return {
  settings:{companyUid:uid,companySetupCompleted:filled,companyName:filled?'شركة المدير':'',companyPhone:filled?'0990000000':'',
   companyAddress:filled?'المستودع 1':'',exchangeRate:12000,invoicePrintTitle:filled?'فاتورة الشركة':'',
   printerSize:filled?80:58,customFutureSetting:{receipt:'a'},appProtection:filled?{...verifier}:{}},
  license:{serial:'LICENSE-'+uid.slice(-2),activated:true},
  categories:[],items:filled?[{id:'p1',name:'صابون'}]:[],accounts:filled?[{id:'a1',name:'تاجر'}]:[],
  invoices:filled?[{id:'inv1',number:1,type:'sale',netTotal:500}]:[],
  vouchers:[],warehouses:[{id:'wh_main',name:'الرئيسي'}],transfers:[],expenses:[],capitalMovements:[],
  fieldSync:{companyId:filled?'company_source':'',agents:filled?[{id:'agent1',name:'بائع'}]:[],
    imported:[],events:[],cashTransfers:[],operationHistory:[],revisionAudit:[]},
  alertCenter:{entries:[]}
 };
}
function fixture(id,filled){
 const nativeServerId=id.slice(9),db=new Map(),sent=[],notifications=[],timers=[];
 const State=state(id,filled),profile='active-'+id.slice(-2);
 const ProfileManager={activeId:profile,registry:{profiles:[{id:profile,name:State.settings.companyName}]},
  generateId:()=>id,getRecord:async key=>db.get(key)||null,putBatch:async records=>{
   for(const r of records)db.set(r.id,r);
  },makeCheckpoint:async()=>{}};
 const status={host:'',port:0,serverId:'',approved:false};
 const native={
  start:()=> 'ready',selectProfile:()=> 'selected',
  serverConfig:()=>JSON.stringify({serverId:nativeServerId,ready:true,host:'192.168.1.10',port:49379,key:'Z'.repeat(43)}),
  clientStatus:()=>JSON.stringify(status),
  clientConfigure:(host,port,key,serverId)=>{Object.assign(status,{host,port,serverId,approved:false});return 'saved';},
  clientApprove:()=>{status.approved=true;},clientUnlink:()=>{Object.assign(status,{host:'',port:0,serverId:'',approved:false});},
  reply:()=>{},clientRequest:()=>{throw Error('test link not connected');}
 };
 const window={AndroidManagerPeer:native,TiqanyPeerMerge:core,TiqanyPeerEvents:events,
  confirm:()=>true};
 const htmlElements=new Map();
 const document={createElement:()=>({textContent:'',append(){} }),head:{appendChild(){}},
  getElementById:(id)=>htmlElements.get(id)||null,
  addEventListener(){},visibilityState:'visible'};
 const notificationsObj={filterPeerEvents:e=>e,saved:e=>notifications.push(...e)};
 const context={window,State,ProfileManager,StorageEngine:{saveState:async()=>{}},
  ManagerNotifications:notificationsObj,Views:{renderSettings(){}},UI:{toast(){}},
  AppNav:{current:()=>({screen:'home'}),renderCurrent(){},navigate(){},isDirty:false,isModalDirty:false,activeOperationGuard:false},
  document,console,Date,Math,JSON,Promise,setInterval:()=>0,setTimeout:(cb,ms)=>{if(ms<=1000)queueMicrotask(cb);return 0;},
  clearTimeout:()=>{},queueMicrotask,ProtectionController:{requestPin:(_,fn)=>fn()},CompanyLifecycle:{conflictJournal:async()=>null,
   validateConflictJournal(){},restoreConflictJournal:async()=>{}}};
 vm.runInNewContext(source,context,{filename:'tiqany-manager-sync-130.js'});
 return {State,manager:window.TiqanyManagerSync,native,status,db,context,notifications,profile};
}
function pair(from,to){
 from.native.clientConfigure('192.168.1.10',49379,'Z'.repeat(43),to.manager.serverStatus().serverId);
 from.native.clientRequest=raw=>{const input=JSON.parse(raw);
   queueMicrotask(async()=>{
     let reply;try{reply=await to.manager.handle(input);}
     catch(e){reply={ok:false,error:String(e?.message||e)}}
     from.context.window.__tiqanyManagerReply(JSON.stringify(reply));
   });
 };
}
test('Android bridge is separate, encrypted, and owns QR+two-way transport',()=>{
 assert.match(java,/class MainManagerPeerSync/);
 assert.match(java,/selectProfile\(String profileId\)/);
 assert.match(java,/AES\/GCM\/NoPadding/);
 assert.match(java,/DeviceVault\.protectSecret/);
 assert.match(java,/clientRequest\(/);
 assert.match(java,/ServerSocket/);
 assert.match(java,/BarcodeFormat\.QR_CODE/);
 assert.match(activity,/addJavascriptInterface\(mainManagerPeerSync,"AndroidManagerPeer"\)/);
});
test('Manager settings panel and all three inline active-only header icons exist',()=>{
 assert.match(index,/مزامنة أجهزة مدير|tiqany-manager-sync-130.js/);
 assert.match(index,/id="ta-manager-phone-connection"[^>]*hidden/);
 assert.match(index,/id="salesStaffCounterButton"[^>]*hidden/);
 assert.match(index,/id="ta-desktop-phone-connection"[^>]*hidden/);
 assert.doesNotMatch(index,/class="ta-staff-counter-label">متصل</);
 assert.match(source,/flex-direction:row!important;flex-wrap:nowrap!important/);
 assert.match(source,/#ta-manager-phone-connection\[hidden\]/);
});
test('First connection from established Android manager to blank Android manager transfers everything one-way',async()=>{
 const full=fixture(ids.one,true),blank=fixture(ids.two,false);
 pair(blank,full);
 const old=core.canonical(core.snapshot(full.State));
 assert.equal(await blank.manager.sync(false),true);
 assert.equal(blank.State.settings.companyName,'شركة المدير');
 assert.equal(blank.State.settings.companyPhone,'0990000000');
 assert.equal(blank.State.settings.invoicePrintTitle,'فاتورة الشركة');
 assert.equal(blank.State.settings.printerSize,80);
 assert.equal(blank.State.settings.customFutureSetting.receipt,'a');
 assert.equal(blank.State.settings.appProtection.pinHash,verifier.pinHash);
 assert.equal(blank.State.settings.appProtection.fingerprintEnabled,false);
 assert.equal(blank.State.invoices[0].id,'inv1');
 assert.equal(blank.State.fieldSync.agents[0].id,'agent1');
 assert.equal(blank.State.license.serial,'LICENSE-22');
 assert.equal(core.canonical(core.snapshot(full.State)),old);
 assert.equal(full.State.alertCenter.entries.length,0);
 assert.equal(blank.status.approved,true);
 assert.equal(full.manager.lastServer>0,true);
});
test('Previously linked phones exchange sales, vouchers, and settings in both directions',async()=>{
 const full=fixture(ids.one,true),blank=fixture(ids.two,false);
 pair(blank,full);
 assert.equal(await blank.manager.sync(false),true);
 full.State.invoices.push({id:'inv2',number:2,type:'sale',netTotal:660});
 assert.equal(await blank.manager.sync(true),true);
 assert.equal(blank.State.invoices.length,2);
 blank.State.vouchers.push({id:'v1',type:'receipt',amount:120});
 blank.State.settings.invoicePrintTitle='عنوان جديد';
 assert.equal(await blank.manager.sync(true),true);
 assert.equal(full.State.vouchers[0].id,'v1');
 assert.equal(full.State.settings.invoicePrintTitle,'عنوان جديد');
 assert.ok(blank.notifications.some(n=>n.collection==='invoices'));
 assert.ok(full.notifications.some(n=>n.collection==='vouchers'));
 assert.ok(full.notifications.some(n=>n.collection==='settings'));
});
test('Unpaired two populated managers must never merge, even if names match',async()=>{
 const one=fixture(ids.one,true),two=fixture(ids.two,true);pair(one,two);
 assert.equal(await one.manager.sync(false),false);
 assert.equal(one.State.invoices.length,1);
 assert.equal(two.State.invoices.length,1);
});
test('Manager-to-manager settings choose the edit nearest to sync without recording conflicts',async()=>{
  const one=fixture(ids.one,true),two=fixture(ids.two,false);pair(two,one);
  assert.equal(await two.manager.sync(false),true);
  const instant=Date.now();
  one.State.settings.invoicePrintTitle='A';
  two.State.settings.invoicePrintTitle='B';
  one.State.settings._syncSettingTimes={invoicePrintTitle:{updatedAt:new Date(instant-60000).toISOString(),deviceId:'one'}};
  two.State.settings._syncSettingTimes={invoicePrintTitle:{updatedAt:new Date(instant-1000).toISOString(),deviceId:'two'}};
  assert.equal(await two.manager.sync(true),true);
  assert.equal(one.State.settings.invoicePrintTitle,'B');
  assert.equal(two.State.settings.invoicePrintTitle,'B');
  assert.ok(!two.manager.conflicts?.details?.some(x=>x.recordId==='invoicePrintTitle'));
});

test('Synchronizing an unchanged password must not disable the phone own biometric enrollment',()=>{
 const full=fixture(ids.one,true);
 full.State.settings.appProtection.fingerprintEnabled=true;
 full.State.settings.appProtection.fingerprintCredentialId='local-key';
 const snapshot=core.snapshot(full.State);
 core.apply(full.State,snapshot);
 assert.equal(full.State.settings.appProtection.fingerprintEnabled,true);
 assert.equal(full.State.settings.appProtection.fingerprintCredentialId,'local-key');
 const changed=JSON.parse(JSON.stringify(snapshot));
 changed.sharedSettings.managerSecurity.pinHash='Z'+changed.sharedSettings.managerSecurity.pinHash.slice(1);
 core.apply(full.State,changed);
 assert.equal(full.State.settings.appProtection.fingerprintEnabled,false);
 assert.equal(full.State.settings.appProtection.fingerprintCredentialId,'');
});

test('Manager-to-manager QR button reaches Android scanner in QR-only mode',()=>{
 const scanner=activity.slice(activity.indexOf('public void scan(String target)'),activity.indexOf('private void showNativeExitConfirmation()'));
 assert.match(source,/NativeBarcode\.scan\('manager-peer'\)/);
 assert.match(scanner,/!"manager-peer"\.equals\(target\)/);
 assert.match(scanner,/"peer"\.equals\(target\)\s*\|\|\s*"manager-peer"\.equals\(target\)/);
 assert.match(scanner,/options\.setDesiredBarcodeFormats\(ScanOptions\.QR_CODE\)/);
 assert.match(scanner,/صوّر رمز QR للموبايل المدير الآخر/);
 assert.match(source,/if\(target==='manager-peer'\)/);
});

test('Hotspot QR advertises real host and port keys, not profile-scoped preference keys',()=>{
 assert.match(java,/qr\.put\("host",c\.getString\("host"\)\)/);
 assert.match(java,/qr\.put\("port",c\.getInt\("port"\)\)/);
 assert.doesNotMatch(java,/c\.getString\(k\("host"\)\)/);
 assert.doesNotMatch(java,/c\.getInt\(k\("port"\)\)/);
 assert.match(java,/name\.startsWith\("ap"\)/);
 assert.match(java,/name\.startsWith\("swlan"\)/);
 assert.match(java,/name\.startsWith\("tun"\)/);
 assert.match(source,/if\(!this\.serverStatus\(\)\.ready\)native\.start\(\)/);
 assert.match(source,/VPN/);
});
