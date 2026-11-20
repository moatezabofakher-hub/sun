'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const repo=path.resolve(__dirname,'..');
const webRoot=fs.existsSync(path.join(repo,'web','static'))?path.join(repo,'web'):path.join(repo,'app','src','main','assets','www');
const core=require(path.join(webRoot,'static','tiqany-peer-merge.js'));
const source=fs.readFileSync(path.join(webRoot,'static','tiqany-peer-controller.js'),'utf8');
const UID_PC='business_'+'1'.repeat(32),UID_PHONE='business_'+'2'.repeat(32);
const SERVER_ID='a'.repeat(32);
const verifier={pinAlgo:'pbkdf2-sha256-v1',pinSalt:'YWJjZGVmZ2hpamtsbW5vcA==',
  pinHash:'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU=',
  securityQuestions:[],lockApp:false,protectDeletion:true,protectDeviceAddition:true,
  fingerprintEnabled:true,fingerprintCredentialId:'phone-biometric-private'};
function state(uid,filled=false){
 return {settings:{companyUid:uid,companyName:filled?'شركة المستودعات':'',companyPhone:filled?'0999999999':'',
    companyAddress:filled?'شارع المستودع':'',companySetupCompleted:filled,companyLogo:filled?'data:image/png;base64,AAAA':'',
    exchangeRate:13000,defaultPriceTier:'consumer',invoicePrintTitle:'شركة المستودعات',printFontScale:1.25,
    showCostInReports:false,posAutoNextOnFinish:false,extraFutureSetting:{enabled:true,days:12},
    btMacAddress:'ABC:device-local',appProtection:{...verifier}},
   license:{isActivated:!filled,activationCode:'LOCAL-'+uid.slice(-3)},
   categories:[],items:filled?[{id:'item1',name:'صابون'}]:[],
   accounts:filled?[{id:'customer1',name:'الزبون'}]:[],
   invoices:filled?[{id:'invoice1',number:1,accountId:'customer1',netTotal:42}]:[],
   vouchers:[],warehouses:[{id:'wh_main',name:'المستودع الرئيسي'}],
   transfers:[],expenses:[],capitalMovements:[],
   fieldSync:{companyId:filled?'company_'+uid.slice(9):'',agents:filled?[{id:'employee1',name:'موظف'}]:[],imported:[],events:[]},
   alertCenter:{entries:filled?[{id:'notify1',title:'تنبيه'}]:[]}};
}
function harness({desktop,filled,uid}){
 const State=state(uid,filled),replies=[],stored=[],windowsCalls=[],prompts=[];
 const peerWindow={TiqanyPeerMerge:core,confirm:(msg)=>{prompts.push(msg);return true}};
 const android={
   status:()=>JSON.stringify({host:'192.168.1.4',port:44112,serverId:SERVER_ID,approved:false}),
   bindServerId:()=>true,approve:()=>windowsCalls.push('approved')
 };
 if(desktop)peerWindow.WindowsPeerSync={reply:(id,data)=>replies.push({id,data})};
 else peerWindow.AndroidPeerSync=android;
 const registry={activeId:desktop?'desktop-profile':'mobile-profile',
   profiles:[{id:desktop?'desktop-profile':'mobile-profile',name:filled?'شركة المستودعات':''}]};
 const ProfileManager={activeId:registry.activeId,registry,
   generateId:()=>uid,
   getRecord:async()=>null,putBatch:async rows=>{stored.push(...rows)},
   makeCheckpoint:async()=>{windowsCalls.push('checkpoint')}};
 const StorageEngine={saveState:async()=>{windowsCalls.push('save')}};
 const AppNav={isDirty:false,isModalDirty:false,activeOperationGuard:false,current:()=>({screen:'home'}),renderCurrent:()=>{}};
 const document={getElementById:()=>null,createElement:()=>({textContent:''}),head:{append(){}},visibilityState:'visible'};
 const context={State,ProfileManager,StorageEngine,Views:{renderSettings(){}},AppNav,UI:{toast(){}},
   document,console,Date,window:peerWindow,WindowsPeerSync:desktop?peerWindow.WindowsPeerSync:undefined,AndroidPeerSync:desktop?undefined:android,
   setTimeout:()=>0,setInterval:()=>0,clearTimeout:()=>{},confirm:(msg)=>{prompts.push(msg);return true;}};
 vm.runInNewContext(source,context,{filename:'tiqany-peer-controller.js'});
 const peer=peerWindow.TiqanyPeerSync;
 peer.server={serverId:SERVER_ID};
 peer.recovered=()=>{};peer.updatePresence=()=>{};peer.renderConnection=()=>{};
 peer.renderConflictButton=()=>{};peer.message=()=>{};peer.outage=async()=>{};
 peer.receiptsFor=async()=>[];peer.saveResolved=async()=>{};peer.saveBase=async()=>{};
 peer.clearConflicts=async()=>{};
 return {State,ProfileManager,StorageEngine,peer,replies,stored,windowsCalls,prompts,context};
}
test('source-only first link exports ALL portable company settings and protection flags',async()=>{
 const h=harness({desktop:true,filled:true,uid:UID_PC});
 const p=await h.peer.firstLinkProvision(UID_PC);
 assert.equal(p.settings.companyName,'شركة المستودعات');
 assert.equal(p.settings.companyPhone,'0999999999');
 assert.equal(p.settings.companyAddress,'شارع المستودع');
 assert.equal(p.settings.companyLogo,'data:image/png;base64,AAAA');
 assert.equal(p.settings.printFontScale,1.25);
 assert.equal(p.settings.defaultPriceTier,'consumer');
 assert.equal(p.settings.invoicePrintTitle,'شركة المستودعات');
 assert.equal(p.settings.showCostInReports,false);
 assert.equal(p.settings.posAutoNextOnFinish,false);
 assert.deepEqual(JSON.parse(JSON.stringify(p.settings.extraFutureSetting)),{enabled:true,days:12});
 assert.ok(!Object.hasOwn(p.settings,'companyUid'));
 assert.ok(!Object.hasOwn(p.settings,'btMacAddress'));
 assert.ok(!Object.hasOwn(p.settings,'appProtection'));
 assert.equal(p.protection.protectDeviceAddition,true);
 assert.equal(p.protection.protectDeletion,true);
 assert.equal(p.protection.lockApp,false,'A saved biometric may not silently activate application lock on the destination');
 assert.equal(p.protection.fingerprintEnabled,false);
 assert.equal(p.protection.fingerprintCredentialId,'');
 assert.equal(h.peer.validateFirstLinkProvision(p,UID_PC),true);
 const hacked={...p,settings:{...p.settings,companyUid:UID_PHONE}};
 assert.throws(()=>h.peer.validateFirstLinkProvision(hacked,UID_PC),/مسموح/);
});
test('populated Windows is read-only during its first link to empty phone',async()=>{
 const h=harness({desktop:true,filled:true,uid:UID_PC});
 await h.peer.handleRequest({requestId:'fetch-1',data:{appVersion:'3.5.159',action:'fetch',phoneCompanyUid:UID_PHONE,phoneProfileId:'mobile-profile',phoneEmpty:true,knownServerId:'',knownServerProfileId:''}});
 const first=h.replies.at(-1).data;
 assert.equal(first.ok,true);assert.equal(first.desktopEmpty,false);
 assert.equal(first.snapshot.accounts[0].id,'customer1');
 assert.equal(first.sourceProvision.companyUid,UID_PC);
 assert.equal(first.sourceProvision.settings.companyPhone,'0999999999');
 const sourceBefore=core.canonical(core.snapshot(h.State));
 const forged=JSON.parse(JSON.stringify(first.snapshot));
 forged.accounts.push({id:'foreign-account',name:'غير مسموح'});
 await h.peer.handleRequest({requestId:'commit-forged',data:{appVersion:'3.5.159',
   action:'commit',ticket:first.ticket,serverId:SERVER_ID,profileId:'desktop-profile',
   phoneCompanyUid:UID_PHONE,snapshot:forged}});
 assert.equal(h.replies.at(-1).data.ok,false);
 assert.equal(core.canonical(core.snapshot(h.State)),sourceBefore);
 await h.peer.handleRequest({requestId:'fetch-2',data:{appVersion:'3.5.159',action:'fetch',phoneCompanyUid:UID_PHONE,phoneProfileId:'mobile-profile',phoneEmpty:true,knownServerId:'',knownServerProfileId:''}});
 const second=h.replies.at(-1).data;
 await h.peer.handleRequest({requestId:'commit-valid',data:{appVersion:'3.5.159',
   action:'commit',ticket:second.ticket,serverId:SERVER_ID,profileId:'desktop-profile',
   phoneCompanyUid:UID_PHONE,snapshot:second.snapshot}});
 assert.equal(h.replies.at(-1).data.ok,true);
 assert.equal(h.replies.at(-1).data.sourceOnly,true);
 assert.equal(core.canonical(core.snapshot(h.State)),sourceBefore);
 assert.equal(h.windowsCalls.includes('save'),false);
});
test('new empty phone receives desktop operations, company identity and all portable settings',async()=>{
 const src=harness({desktop:true,filled:true,uid:UID_PC});
 const p=await src.peer.firstLinkProvision(UID_PC),snap=core.snapshot(src.State);
 const h=harness({desktop:false,filled:false,uid:UID_PHONE});
 const out=[];
 h.peer.call=async req=>{
   out.push(req);
   if(req.action==='fetch')return {ok:true,appVersion:'3.5.159',ticket:'ticket'+out.length,snapshot:snap,
     desktopEmpty:false,sourceProvision:p,serverId:SERVER_ID,profileId:'desktop-profile',
     companyUid:UID_PC,conflictResolutions:{},resolvedReceipts:[]};
   if(req.action==='commit')return {ok:true,sourceOnly:true};
   return {ok:false};
 };
 assert.equal(await h.peer.sync(false),false);
 assert.equal(out.filter(x=>x.action==='commit').length,0);
 assert.equal(h.prompts.length,1);
 assert.equal(await h.peer.sync(false),true);
 const committed=out.filter(x=>x.action==='commit');
 assert.equal(committed.length,1);
 assert.equal(core.canonical(committed[0].snapshot),core.canonical(snap));
 assert.equal(committed[0].provision,undefined);
 assert.equal(h.State.invoices[0].id,'invoice1');
 assert.equal(h.State.settings.companyUid,UID_PC);
 assert.equal(h.State.settings.companyPhone,'0999999999');
 assert.equal(h.State.settings.companyAddress,'شارع المستودع');
 assert.equal(h.State.settings.invoicePrintTitle,'شركة المستودعات');
 assert.equal(h.State.settings.defaultPriceTier,'consumer');
 assert.equal(h.State.settings.showCostInReports,false);
 assert.equal(h.State.settings.extraFutureSetting.days,12);
 assert.equal(h.State.license.activationCode,'LOCAL-222');
 assert.equal(h.ProfileManager.registry.profiles[0].name,'شركة المستودعات');
});
test('paired managers continue to use three-way reconciliation',()=>{
 assert.match(source,/core\.merge\(saved\?\.snapshot\|\|null,stateBefore,fetched\.snapshot,decisions,history\)/);
 assert.match(source,/if\(!saved\?\.snapshot&&!bootstrap&&!desktopBootstrap\)/);
});
