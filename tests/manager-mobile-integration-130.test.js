'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.resolve(__dirname,'../app/src/main/assets/www/static');
const core=require(path.join(base,'tiqany-manager-merge-130.js'));
const events=require(path.join(base,'tiqany-peer-events.js'));
const clientSrc=fs.readFileSync(path.join(base,'tiqany-manager-client-130.js'),'utf8');
const serverSrc=fs.readFileSync(path.join(base,'tiqany-manager-server-130.js'),'utf8');
const uidA='business_'+'a'.repeat(32),uidB='business_'+'b'.repeat(32),serverId='1'.repeat(32);
const verifier={pinSalt:'YWJjZGVmZ2hpamtsbW5vcA==',pinHash:'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU=',pinAlgo:'pbkdf2-sha256-v1',
  securityQuestions:[],lockApp:true,protectDeletion:true,protectDeviceAddition:true,
  fingerprintEnabled:true,fingerprintCredentialId:'device-secret'};
function state(uid,filled){
 return {settings:{companyUid:uid,companyName:filled?'متجر الزهرة':'',
   companyPhone:filled?'0933000111':'',companyAddress:filled?'السويداء':'',
   companySetupCompleted:filled,exchangeRate:14500,
   customReportLayout:{showNotes:false},appProtection:{...verifier}},
   license:{activationCode:'DEVICE-'+uid.slice(-1)},categories:[],
   items:filled?[{id:'soap',name:'صابون'}]:[],
   accounts:filled?[{id:'customer',name:'زبون'}]:[],
   invoices:filled?[{id:'sale',type:'sale',number:8,accountId:'customer',total:1500}]:[],
   vouchers:filled?[{id:'receipt',type:'receipt',amount:100}]:[],
   warehouses:[{id:'wh_main',name:'المستودع الرئيسي'}],transfers:[],expenses:[],capitalMovements:[],
   fieldSync:{companyId:'company_'+uid.slice(9),agents:filled?[{id:'agent1',name:'موظف'}]:[],imported:[],events:[]},
   alertCenter:{entries:[]}};
}
function instance(mode,uid,filled){
 const State=state(uid,filled),rows=new Map(),alerts=[];
 const registry={profiles:[{id:uid,name:State.settings.companyName}],activeId:uid};
 const pm={registry,activeId:uid,generateId:()=>uid,makeCheckpoint:async()=>{},getRecord:async key=>rows.get(key)||null,
    putBatch:async rs=>{for(const r of rs)rows.set(r.id,r)}};
 const storage={saveState:async()=>{}};
 const peerWindow={TiqanyManagerPeerMerge:core,TiqanyPeerEvents:events,
   confirm:()=>true};
 let reply=null;
 const desktopFacade={config:async()=>({serverId,key:'abc',ready:true,port:5000,ips:['192.168.1.10']}),
   reply:(id,data)=>{if(reply)reply(data);},changed:()=>{}};
 const clientFacade={status:()=>JSON.stringify({host:'192.168.1.10',port:5000,serverId,approved:false}),
   approve:()=>true,bindServerId:()=>true,request:()=>{}};
 const doc={getElementById:()=>null,querySelector:()=>null,createElement:()=>({textContent:''}),
   head:{append:()=>{}},addEventListener:()=>{},visibilityState:'visible'};
 const ManagerNotifications={filterPeerEvents:entries=>entries,saved:entries=>alerts.push(...entries)};
 const ProtectionController={requestPin:(message,fn)=>fn()};
 const context={State,StorageEngine:storage,ProfileManager:pm,ManagerNotifications,ProtectionController,
    Views:{renderSettings(){}},UI:{toast(){}},AppNav:{current:()=>({screen:'home'}),renderCurrent(){},
    isDirty:false,isModalDirty:false,activeOperationGuard:false},window:peerWindow,
    AndroidManagerPeerClient:clientFacade,AndroidManagerPeerServerFacade:desktopFacade,
    AndroidManagerPeerDesktop:{onPeerRequest(){},onPeerStatus(){}},
    console,Date,JSON,document:doc,setInterval:()=>0,setTimeout:()=>0,clearTimeout:()=>{},confirm:()=>true};
 peerWindow.AndroidManagerPeerClient=clientFacade;
 peerWindow.AndroidManagerPeerServerFacade=desktopFacade;
 peerWindow.AndroidManagerPeerDesktop=context.AndroidManagerPeerDesktop;
 vm.runInNewContext(mode==='server'?serverSrc:clientSrc,context);
 const peer=peerWindow[mode==='server'?'TiqanyManagerPeerServer':'TiqanyManagerPeerClient'];
 peer.server={serverId,ready:true,port:5000};
 peer.updatePresence=()=>{};
 peer.renderConnection=()=>{};
 peer.renderConflictButton=()=>{};
 peer.outage=async()=>{};
 peer.recovered=()=>{};
 peer.message=()=>{};
 peer.updateHeaderConnection=()=>{};
 peer.saveBase=async()=>{};
 peer.clearConflicts=async()=>{};
 peer.saveResolved=async()=>{};
 peer.receiptsFor=async()=>[];
 return {peer,State,pm,rows,alerts,desktopFacade,clientFacade,setReply:cb=>reply=cb};
}
test('first pairing mobile source is the only writer when the other manager is empty',async()=>{
 const main=instance('server',uidA,true);
 const empty=instance('client',uidB,false);
 const calls=[];
 empty.peer.call=async data=>{
   calls.push(data);
   return new Promise(async (resolve,reject)=>{
     main.setReply(resolve);
     try{await main.peer.handleRequest({requestId:'req'+calls.length,data})}
     catch(e){reject(e)}
   });
 };
 // First pass asks the user, but does not commit or mutate the owner.
 assert.equal(await empty.peer.sync(false),false);
 assert.equal(calls.filter(x=>x.action==='commit').length,0);
 assert.equal(await empty.peer.sync(false),true);
 assert.equal(empty.State.invoices.length,1);
 assert.equal(empty.State.vouchers.length,1);
 assert.equal(empty.State.fieldSync.agents[0].id,'agent1');
 assert.equal(empty.State.settings.companyName,'متجر الزهرة');
 assert.equal(empty.State.settings.companyPhone,'0933000111');
 assert.equal(empty.State.settings.companyAddress,'السويداء');
 assert.equal(empty.State.settings.customReportLayout.showNotes,false);
 assert.equal(empty.State.settings.appProtection.fingerprintEnabled,false);
 assert.equal(empty.State.license.activationCode,'DEVICE-b');
 assert.equal(empty.pm.registry.profiles[0].name,'متجر الزهرة');
 assert.equal(main.State.invoices.length,1);
 assert.equal(main.State.settings.companyUid,uidA);
 assert.equal(calls.filter(x=>x.action==='commit').length,1);
 assert.equal(calls.at(-1).provision,undefined);
});
test('connected managers generate distinct sale, receipt, and settings-change alerts',()=>{
 const before=core.snapshot(state(uidA,true));
 const after=JSON.parse(JSON.stringify(before));
 after.invoices.push({id:'next-sale',type:'sale',number:9,amount:300});
 after.vouchers.push({id:'next-voucher',type:'receipt',amount:200});
 after.sharedSettings.customReportLayout={showNotes:true};
 const notices=events.records(before,after,'موبايل المدير').entries;
 assert.ok(notices.some(n=>n.collection==='invoices'));
 assert.ok(notices.some(n=>n.collection==='vouchers'));
 assert.ok(notices.some(n=>n.collection==='settings'&&n.recordId==='customReportLayout'));
});
