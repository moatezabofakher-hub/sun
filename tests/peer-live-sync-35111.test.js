'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const merge=require('../app/src/main/assets/www/static/tiqany-peer-merge.js');
const script=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/static/tiqany-peer-controller.js'),'utf8');
function create(){
 const scheduled=[],State={settings:{companyName:'A',exchangeRate:10},items:[],accounts:[],invoices:[],vouchers:[],categories:[],warehouses:[],transfers:[],expenses:[],fieldSync:{}};
 const w={TiqanyPeerMerge:merge};const doc={visibilityState:'visible',head:{append(){}},createElement(){return {textContent:''};},getElementById(){return null;},addEventListener(){}};
 let approved=true;const android={status(){return JSON.stringify({host:'192.168.1.2',port:39271,serverId:'aa'.repeat(16),approved});},request(){},approve(){}};
 const StorageEngine={saveState:async()=>true};
 const ctx={State,window:w,AndroidPeerSync:android,StorageEngine,console,document:doc,UI:{toast(){}},AppNav:{isDirty:false,isModalDirty:false,activeOperationGuard:false,current(){return {screen:'home'};},renderCurrent(){}},SettingsDraftController:{changed(){return false;}},ProfileManager:{activeId:'p1',getRecord:async()=>null,putBatch:async()=>{}},Views:{renderSettings(){}},setTimeout(fn,delay){scheduled.push({fn,delay});return scheduled.length;},clearTimeout(){},setInterval(){}};
 w.AndroidPeerSync=android;vm.runInNewContext(script,ctx);
 return {scheduled,peer:w.TiqanyPeerSync,State,StorageEngine,setApproved:v=>approved=v};
}
test('main phone schedules sync only after a committed save and configured approved pairing',async()=>{
 const x=create();let times=0;x.peer.sync=async()=>{times++;return true;};
 x.setApproved(false);await x.StorageEngine.saveState();assert.equal(x.scheduled.length,0);
 x.setApproved(true);x.State.items.push({id:'a',name:'item'});await x.StorageEngine.saveState();assert.equal(x.scheduled.length,1);assert.equal(x.scheduled[0].delay,120);
 x.scheduled[0].fn();assert.equal(times,1);
});
test('phone postpones save-triggered sync during a pending probe instead of issuing overlapping requests',async()=>{
 const x=create();let times=0;x.peer.sync=async()=>{times++;return true;};x.peer.pending={};
 await x.StorageEngine.saveState();x.scheduled[0].fn();assert.equal(times,0);assert.equal(x.scheduled.length,2);
 x.peer.pending=null;x.scheduled[1].fn();assert.equal(times,1);
});
test('phone detects Windows version changes, never syncs unchanged revision, and retries rejected revisions',async()=>{
 const x=create();let value='session1:1',times=0,success=true;
 x.peer.call=async()=>({ok:true,serverId:'aa'.repeat(16),version:value});x.peer.sync=async()=>{times++;return success;};
 await x.peer.probe();await x.peer.probe();assert.equal(times,1);
 value='session1:2';await x.peer.probe();assert.equal(times,2);
 value='session1:3';success=false;await x.peer.probe();assert.equal(x.peer.lastRemoteVersion,null);
 success=true;await x.peer.probe();assert.equal(times,4);
});
