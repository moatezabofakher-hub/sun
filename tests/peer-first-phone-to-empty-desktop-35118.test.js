'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const core=require('../app/src/main/assets/www/static/tiqany-peer-merge.js');
const source=fs.readFileSync(path.resolve(__dirname,'../app/src/main/assets/www/static/tiqany-peer-controller.js'),'utf8');
const UID_PHONE='business_'+'1'.repeat(32),UID_PC='business_'+'2'.repeat(32);
const verifier={pinAlgo:'pbkdf2-sha256-v1',pinSalt:'YWJjZGVmZ2hpamtsbW5vcA==',pinHash:'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU=',fingerprintEnabled:true,fingerprintCredentialId:'android-only',securityQuestions:[],lockApp:false};
const state=(uid,filled)=>({settings:{companyUid:uid,companyName:'شركة الهاتف',appProtection:{...verifier}},
 categories:[],items:filled?[{id:'item1',name:'صابون'}]:[],accounts:filled?[{id:'customer1',name:'زبون'}]:[],invoices:filled?[{id:'invoice1',number:1}]:[],vouchers:[],warehouses:[{id:'wh_main',name:'المستودع الرئيسي'}],transfers:[],expenses:[],fieldSync:{companyId:'',agents:[],imported:[],events:[]},alertCenter:{entries:[]}});
function harness({phoneFilled=true,desktopFilled=false}={}){
 const State=state(UID_PHONE,phoneFilled),desktopState=state(UID_PC,desktopFilled),asks=[],messages=[],requests=[],approvals=[],prompts=[],scheduled=[];
 const WindowsSnapshot=core.snapshot(desktopState);
 const w={TiqanyPeerMerge:core,confirm:(message)=>{prompts.push(message);return true;}};
 const AndroidPeerSync={status:()=>JSON.stringify({host:'192.168.1.10',port:39271,serverId:'a'.repeat(32),approved:false}),bindServerId:()=>true,approve(){approvals.push('approved')}};
 w.AndroidPeerSync=AndroidPeerSync;
 const c={window:w,AndroidPeerSync,State,Views:{renderSettings(){}},console,Date,document:{getElementById:()=>null,head:{append(){}},createElement(){return {textContent:''}}},
 ProfileManager:{activeId:'mobile-profile',getRecord:async()=>null,putBatch:async()=>{},makeCheckpoint:async()=>{}},
 StorageEngine:{saveState:async()=>{}},SettingsDraftController:{changed:()=>false},
 AppNav:{isDirty:false,isModalDirty:false,activeOperationGuard:false,current:()=>({screen:'home'}),renderCurrent(){}},
 ProtectionController:{requestPin(msg,callback){asks.push({msg,callback})},promptPinSetup(){asks.push({setup:true})}},
 UI:{toast(...args){messages.push(args)}},setInterval:()=>0,setTimeout:fn=>{scheduled.push(fn);return 0;},clearTimeout:()=>{},confirm:()=>true};
 vm.runInNewContext(source,c);const peer=w.TiqanyPeerSync;peer.call=async msg=>{
  requests.push(msg);
  if(msg.action==='fetch')return {ok:true,appVersion:'3.5.159',snapshot:WindowsSnapshot,ticket:'ticket'+requests.length,
    companyUid:UID_PC,desktopEmpty:!desktopFilled,serverId:'a'.repeat(32),profileId:'desktop-profile',conflictResolutions:{},resolvedReceipts:[]};
  if(msg.action==='commit')return {ok:true};
  return {ok:false};
 };
 peer.receiptsFor=async()=>[];peer.saveResolved=async()=>{};peer.saveBase=async()=>{};peer.clearConflicts=async()=>{};
 return {peer,asks,messages,requests,approvals,prompts,State,async runScheduled(){const tasks=scheduled.splice(0);for(const task of tasks)await task();}};
}
test('QR-paired Android requires explicit first-copy confirmation without a redundant PIN after pairing',async()=>{
 const h=harness();
 await h.peer.sync(false);
 assert.equal(h.requests.filter(x=>x.action==='commit').length,0,'Do not commit before first-copy acknowledgement');
 assert.equal(h.approvals.length,0);
 assert.equal(h.asks.length,0,'No extra PIN prompt should interrupt trusted QR pairing');
 assert.equal(h.prompts.length,1);
 assert.match(h.prompts[0],/الكمبيوتر المقترن فارغ/);
 await h.runScheduled();
 const commit=h.requests.find(x=>x.action==='commit');
 assert.ok(commit,'Confirmed QR-paired upload must commit');
 assert.equal(commit.provision.companyUid,UID_PHONE);
 assert.equal(commit.provision.fieldCompanyId,'company_'+UID_PHONE.slice('business_'.length));
 assert.equal(commit.provision.protection.pinHash,verifier.pinHash);
 assert.equal(commit.provision.protection.fingerprintEnabled,false);
 assert.equal(commit.provision.protection.lockApp,false,'Do not enable the app lock when transferring credentials');
 assert.equal(commit.snapshot.invoices.length,1);
 assert.equal(commit.snapshot.accounts[0].id,'customer1');
 assert.equal(h.approvals.length,1);
 assert.equal(h.State.settings.companyUid,UID_PHONE);
 assert.equal(h.State.fieldSync.companyId,commit.provision.fieldCompanyId);
});
test('QR-confirmed first transfer refuses a different snapshot after the explicit confirmation',async()=>{
 const h=harness();await h.peer.sync(false);
 assert.equal(h.prompts.length,1);
 h.State.invoices.push({id:'invoice2',number:2});
 await h.runScheduled();
 assert.equal(h.requests.some(x=>x.action==='commit'),false);
 assert.equal(h.approvals.length,0);
});
test('when Windows has company data, the phone cannot import a foreign company despite having a password',async()=>{
 const h=harness({phoneFilled:true,desktopFilled:true});await h.peer.sync(false);
 assert.equal(h.asks.length,0);
 assert.equal(h.requests.some(x=>x.action==='commit'),false);
 assert.equal(h.approvals.length,0);
});
