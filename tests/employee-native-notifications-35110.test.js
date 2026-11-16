const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const dir=path.resolve(__dirname,'../field_agent/src/main');
const man=fs.readFileSync(path.join(dir,'AndroidManifest.xml'),'utf8');const java=fs.readFileSync(path.join(dir,'java/com/sunshine/accounting/MainActivity.java'),'utf8');
const js=fs.readFileSync(path.join(dir,'assets/www/static/agent-manager-notifications-35107.js'),'utf8');
test('Android notification permission requested at runtime, manager channel and notification click supported',()=>{
 assert.match(man,/android\.permission\.POST_NOTIFICATIONS/);
 assert.match(java,/ActivityResultContracts\.RequestPermission/);
 assert.match(java,/MANAGER_NOTICE_CHANNEL = "tiqany_manager_updates"/);
 assert.match(java,/createNotificationChannel/);
 assert.match(java,/new ManagerNotificationBridge\(\), "AndroidManagerNotifications"/);
 assert.match(java,/ContextCompat\.checkSelfPermission\(MainActivity\.this, Manifest\.permission\.POST_NOTIFICATIONS\)/);
 assert.match(java,/new Notification\.Builder/);
 assert.match(java,/setContentIntent\(pending\)/);
 assert.match(java,/openManagerNotification/);
 assert.match(java,/manager\.areNotificationsEnabled\(\)/);
});
function setup(){let saved=0;let posted=[];const el={hidden:false,textContent:''};const state={companyId:'c1',exchangeRate:100,managerPublishedRate:100,items:[],accounts:[],stock:{},categories:[],warehouseTransfers:[],cashTransfers:[],ops:[]};
 const a={state,screen:'home',ready:()=>true,escape:String,save:async()=>{saved++;},toast:()=>{},onLocalSyncResult:async function(data){if(data==='failure'){this.lanSyncMessage='failure';return;}this.state={...this.state,...data};this.lanSyncMessage='✅ done';},show:async()=>{},navigate:async()=>{}};
 const ctx=vm.createContext({Agent:a,window:{AndroidManagerNotifications:{postUpdates:raw=>posted.push(JSON.parse(raw))}},document:{getElementById:()=>el,addEventListener:()=>{}},Date});vm.runInContext(js,ctx);return {a,posted,saved:()=>saved};}
test('authenticated saved changes notify Android once, not on repeat or failed sync',async()=>{const o=setup();await o.a.onLocalSyncResult({managerPublishedRate:110,stock:{a:3}});assert.equal(o.posted.length,1);assert.equal(o.posted[0].length,2);assert.equal(o.a.state.managerNotifications.length,2);await o.a.onLocalSyncResult({managerPublishedRate:110,stock:{a:3}});await o.a.onLocalSyncResult('failure');assert.equal(o.posted.length,1);});
test('failed persistence does not emit a system notification',async()=>{const o=setup();o.a.save=async()=>{throw Error('disk');};await o.a.onLocalSyncResult({managerPublishedRate:112});assert.equal(o.posted.length,0);});
