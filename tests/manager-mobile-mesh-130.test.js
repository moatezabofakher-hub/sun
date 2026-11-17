'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const web=path.join(root,'app/src/main/assets/www'),java=path.join(root,'app/src/main/java/com/sunshine/accounting');
const files={index:fs.readFileSync(path.join(web,'index.html'),'utf8'),
  client:fs.readFileSync(path.join(web,'static/tiqany-manager-client-130.js'),'utf8'),
  server:fs.readFileSync(path.join(web,'static/tiqany-manager-server-130.js'),'utf8'),
  facade:fs.readFileSync(path.join(web,'static/tiqany-manager-facade-130.js'),'utf8'),
  ui:fs.readFileSync(path.join(web,'static/tiqany-manager-ui-130.js'),'utf8'),
  events:fs.readFileSync(path.join(web,'static/tiqany-peer-events.js'),'utf8'),
  native:fs.readFileSync(path.join(java,'MainManagerPeerServer.java'),'utf8'),
  main:fs.readFileSync(path.join(java,'MainActivity.java'),'utf8'),
  clientNative:fs.readFileSync(path.join(java,'MainPhonePeerSync.java'),'utf8'),
  lifecycle:fs.readFileSync(path.join(web,'static/company-lifecycle-128.js'),'utf8')};
for(const [name,content] of Object.entries(files))if(!['index','native','main','clientNative'].includes(name))
  test('130 JavaScript parses: '+name,()=>assert.doesNotThrow(()=>new Function(content)));
test('independent AES-GCM server and mobile-manager client are registered',()=>{
 assert.match(files.native,/AES\/GCM\/NoPadding/);
 assert.match(files.native,/DeviceVault\.protectSecret/);
 assert.match(files.native,/ArrayBlockingQueue/);
 assert.match(files.native,/isTrustedPage|allowed\(\)/);
 assert.match(files.main,/addJavascriptInterface\(managerPhonePeerSync, "AndroidManagerPeerClient"\)/);
 assert.match(files.main,/addJavascriptInterface\(managerPeerServer, "AndroidManagerPeerServer"\)/);
 assert.match(files.clientNative,/tiqany_mobile_manager_link/);
 assert.match(files.clientNative,/__tiqanyManagerReply/);
 assert.match(files.client,/TiqanyManagerPeerMerge/);
 assert.match(files.server,/TiqanyManagerPeerMerge/);
 assert.match(files.client,/desktop=false/);
 assert.match(files.server,/desktop=true/);
});
test('settings are separate from Windows and the employee app',()=>{
 assert.match(files.index,/static\/tiqany-manager-client-130\.js/);
 assert.match(files.index,/static\/tiqany-manager-server-130\.js/);
 assert.match(files.client,/data-settings-section="mobile-manager-sync"/);
 assert.match(files.client,/TiqanyManagerPeerClient/);
 assert.match(files.server,/TiqanyManagerPeerServer/);
 assert.match(files.client,/manager_peer_base:/);
 assert.match(files.client,/manager_peer_conflicts:/);
 assert.match(files.client,/manager_peer_conflict_audit:/);
 assert.match(files.client,/tiqany-mobile-manager/);
 assert.match(files.main,/manager-peer/);
 assert.match(files.lifecycle,/openManagerPairingFirst\(\)/);
});
test('mobile-manager connection badge only appears when online, and employee badge no longer displays the word connected',()=>{
 assert.match(files.index,/id="ta-mobile-mobile-connection"/);
 assert.match(files.index,/ta-two-phones/);
 assert.doesNotMatch(files.index,/class="ta-staff-counter-label">متصل/);
 assert.match(files.index,/#topAppBar \.ta-header-connections \[hidden\]\{display:none!important/);
 assert.match(files.ui,/mm.hidden=!connected/);
 assert.match(files.ui,/staff.hidden=count<=0/);
 assert.match(files.ui,/pc.hidden=!pc.classList.contains\('ta-link-online'\)/);
 assert.match(files.index,/flex-direction:row!important/);
});
test('every company setting can trigger a peer event',()=>{
 assert.match(files.events,/new Set\(\[\.\.\.Object\.keys\(oldSettings\),\.\.\.Object\.keys\(newSettings\)\]\)/);
 assert.match(files.server,/incomingEvents/);
 assert.match(files.server,/ManagerNotifications\.saved\(notificationsToDeliver\)/);
});
test('manager merge excludes identity/bindings while carrying future company settings',()=>{
 const merge=require(path.join(web,'static/tiqany-manager-merge-130.js'));
 const state={settings:{companyName:'شركة التفصيل',companyUid:'business_'+'1'.repeat(32),
  companyAddress:'السويداء',specialSetting:{a:123},deviceToken:'private-token',
  appProtection:{pinHash:'h',pinSalt:'s',fingerprintEnabled:true,fingerprintCredentialId:'biometric-hardware'}},
  categories:[],items:[],accounts:[],invoices:[],vouchers:[],warehouses:[{id:'wh_main'}],
  transfers:[],expenses:[],capitalMovements:[],fieldSync:{}};
 const snap=merge.snapshot(state);
 assert.equal(snap.sharedSettings.companyName,'شركة التفصيل');
 assert.deepEqual(snap.sharedSettings.specialSetting,{a:123});
 assert.equal(snap.sharedSettings.deviceToken,undefined);
 assert.equal(snap.sharedSettings.companyUid,undefined);
 assert.equal(snap.sharedSettings.appProtection,undefined); // PIN never crosses normal peer reconciliation
});
