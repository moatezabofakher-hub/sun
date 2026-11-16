'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const WEB=path.resolve(__dirname,'../app/src/main/assets/www/static');
const source=name=>fs.readFileSync(path.join(WEB,name),'utf8');
const platform='Android';
const isWindows=platform==='Windows';

function pairingHarness(){
  const agent={id:'agent-one',name:'موظف',employeeAuth:{hash:'valid'},permissions:{}};
  const data={agents:[agent],companyId:'company_abc'};const storage=[];const notifications=[];
  let nextAuth=null, authCall=null;
  const f={data:()=>data,escape:s=>String(s),catalog:()=>({kind:'catalog'}),pairingBusy:false,lanBusy:false,busy:false};
  const ctx={
    FieldSync:f,FieldPairCrypto:{VERSION:1,createSigner:async()=>({publicKey:'pub'}),issueGrant:async()=>({license:'signed'}),seal:async()=>({encrypted:true})},
    FieldProtocol:{b64u:()=>('x'.repeat(43)),uuid:()=>('id'.repeat(20))},
    TiqanyEmployeeAuth:{valid:auth=>auth?.hash==='valid'},
    State:{settings:{companyName:'شركة',appProtection:{pinHash:'x',pinSalt:'s'}}},
    ProtectionController:{requestPin:(message,callback,options)=>{authCall={message,options};nextAuth=callback;}},
    StorageEngine:{saveState:async()=>storage.push('save')},
    ProfileManager:{activeId:'business-one'},
    document:{getElementById:id=>id==='pairAgent_req1'?{value:'agent-one'}:null},
    UI:{toast:(message,type)=>notifications.push({message,type})},
    crypto:webcrypto,window:{AndroidLocalSync:{reply(){}}},Map,Date,setTimeout,clearTimeout,
  };
  vm.createContext(ctx);vm.runInContext(source('field-pair-manager.js'),ctx);
  f.pairingRequests.set('req1',{id:'req1',deviceId:'TD-'+'A'.repeat(32),createdAt:Date.now(),status:'pending',key:{}});
  return {f,agent,storage,notifications,ctx,call:()=>authCall,approve:async()=>nextAuth?.()};
}

test(platform+': employee code matching cannot approve a pairing without manager verification',async()=>{
  const h=pairingHarness();
  h.f.approvePairing('req1');
  assert.match(h.call().message,/مطابقة رقم الأمان/);
  assert.equal(h.call().options?.passwordOnly,isWindows?true:undefined);
  assert.equal(h.agent.pairedDeviceId,undefined);
  assert.equal(h.storage.length,0);
  assert.equal(h.f.pairingRequests.get('req1').status,'pending');
  await h.approve();
  assert.equal(h.agent.pairedDeviceId,'TD-'+'A'.repeat(32));
  assert.equal(h.storage.length,1);
  assert.equal(h.f.pairingRequests.get('req1').status,'approved');
});

test(platform+': expired or changed business pairing rejected even after PIN approval',async()=>{
 const h=pairingHarness();h.f.approvePairing('req1');
 h.ctx.ProfileManager.activeId='another-company';await h.approve();
 assert.equal(h.storage.length,0);assert.equal(h.agent.pairedDeviceId,undefined);
 h.ctx.ProfileManager.activeId='business-one';h.f.approvePairing('req1');
 h.f.pairingRequests.get('req1').createdAt=Date.now()-10*60*1000;
 await h.approve();assert.equal(h.storage.length,0);
});

function editHarness(){
 const permissions={priceTier:false,currency:false,balances:false,editPrices:false,exchangeRate:false,stock:false,createAccounts:false,createItems:false,editOperations:false,deleteOperations:false};
 const agent={id:'staff1',name:'موظف',vehicleName:'سيارة',permissions:{...permissions},employeeAuth:{hash:'valid'}};
 const state={settings:{appProtection:{pinHash:'hash',pinSalt:'salt'},exchangeRate:14500},fieldSync:{companyId:'company_a',agents:[agent],imported:[],events:[]},warehouses:[],accounts:[],items:[],categories:[]};
 const dom={editFieldAgentName:'موظف',editFieldAgentVehicle:'سيارة',editFieldEmployeePassword:'',editFieldEmployeeConfirm:'',editFieldManagerApprovalPin:''};
 let proposed={...permissions},asked=null,callback=null,saves=0;const notifications=[];
 const ctx={
  State:state,document:{readyState:'loading',addEventListener(){},getElementById:k=>({value:dom[k]||''}),querySelector:()=>null,querySelectorAll:()=>[]},
  ProtectionController:{requestPin:(message,cb,options)=>{asked={message,options};callback=cb;},verifyPin:async()=>true},
  TiqanyEmployeeAuth:{create:async()=>({hash:'pass'})},UI:{toast:(...v)=>notifications.push(v),openModal(){}},
  StorageEngine:{saveState:async()=>{saves++;}},
  ProfileManager:{activeId:'business-one'},AppEscape:{text:s=>String(s)},
  FieldProtocol:{uuid:()=>('1'.repeat(30))},FieldCash:{summary:()=>({})},
  Accounting:{},WarehouseController:{name:()=>''},window:{},
  crypto:webcrypto,TextEncoder,btoa,atob,Date,setTimeout,clearTimeout,console};
 vm.createContext(ctx);vm.runInContext(source('field-main.js'),ctx);
 const manager=vm.runInContext('FieldSync',ctx);
 manager.readAccountPicker=()=>null;
 manager.readPermissions=()=>({...proposed});manager.open=()=>{};
 return {agent,ctx,manager,dom,setPermissions:p=>{proposed={...p};},get saves(){return saves;},asked:()=>asked,approve:async()=>callback?.(),notifications};
}

test(platform+': changing staff permission requires fingerprint/PIN, prevents changes until success',async()=>{
 const h=editHarness();const next={...h.agent.permissions,editPrices:true};h.setPermissions(next);
 await h.manager.saveAgentEdit('staff1');
 assert.match(h.asked().message,/تغيير صلاحيات/);
 assert.equal(h.asked().options?.passwordOnly,isWindows?true:undefined);
 assert.equal(h.agent.permissions.editPrices,false);
 assert.equal(h.saves,0);
 await h.approve();
 assert.equal(h.agent.permissions.editPrices,true);
 assert.equal(h.saves,1);
});

test(platform+': changing only staff name does not re-request permission approval',async()=>{
 const h=editHarness();h.dom.editFieldAgentName='موظف مبيعات';
 await h.manager.saveAgentEdit('staff1');
 assert.equal(h.asked(),null);
 assert.equal(h.saves,1);
 assert.equal(h.agent.name,'موظف مبيعات');
});

test(platform+': stale staff permission decision cannot overwrite a concurrent update',async()=>{
 const h=editHarness();h.setPermissions({...h.agent.permissions,editPrices:true});
 await h.manager.saveAgentEdit('staff1');
 h.agent.permissions={...h.agent.permissions,deleteOperations:true};
 await h.approve();assert.equal(h.saves,0);assert.equal(h.agent.permissions.editPrices,false);
});

if(isWindows){
 test('Windows: QR reveal is password-protected and expires after 60 seconds',()=>{
  const src=source('tiqany-peer-controller.js');
  const methods=src.slice(src.indexOf('  authorizedSettingsSection:null,'),src.indexOf('  updateHeaderConnection(active){'));
  const ctx={desktop:true,State:{settings:{appProtection:{pinHash:'h',pinSalt:'s'}}},
    ProfileManager:{activeId:'business-one'},UI:{toast(){}},ProtectionController:{requestPin(message,cb,opts){ctx.request={message,cb,opts};}},
    document:{getElementById:()=>null},setTimeout:()=>1,clearTimeout:()=>{},Date};
  const peer=vm.runInNewContext('({'+methods+'})',ctx);
  let render=0;peer.renderConnection=()=>{render++;};
  peer.revealPairingQr();assert.equal(peer.qrRevealExpiresAt,0);
  assert.equal(ctx.request.opts.passwordOnly,true);
  ctx.request.cb();assert.ok(peer.qrRevealExpiresAt>Date.now());assert.equal(render,1);
  peer.hidePairingQr();assert.equal(peer.qrRevealExpiresAt,0);
  assert.match(src,/if\(this\.qrRevealProfile!==ProfileManager\.activeId\|\|Date\.now\(\)>=this\.qrRevealExpiresAt\)/);
 });
}else{
 test('Android: scanning a Windows QR requires single-use biometric-first authorization',async()=>{
  const src=source('tiqany-peer-controller.js');
  const methods=src.slice(src.indexOf('  scanPairing(){'),src.indexOf('  conflictsKey(){'));
  const scan=[],msg=[];let approval=null,configured=0;
  const ctx={desktop:false,State:{settings:{appProtection:{protectDeviceAddition:true}}},ProfileManager:{activeId:'company-a'},Date,t:s=>s,
   window:{NativeBarcode:{scan:kind=>scan.push(kind)},AndroidPeerSync:{},confirm:()=>true},
   NativeBarcode:{scan:kind=>scan.push(kind)},AndroidPeerSync:{configure:()=>{configured++;return 'saved';},bindServerId:()=>true},
   document:{getElementById:()=>({value:''})}};
  const peer=vm.runInNewContext('({'+methods+'})',ctx);
  peer.authorizePairing=(msg,cb)=>{approval=cb;};peer.message=t=>msg.push(t);peer.base=async()=>null;
  peer.renderConnection=()=>{};
  await peer.acceptPairing('{}');assert.equal(configured,0);assert.match(msg.at(-1),/التحقق/);
  peer.scanPairing();assert.equal(scan.length,0);
  approval();assert.equal(scan[0],'peer');assert.ok(peer.scanApproval);
  const payload=JSON.stringify({type:'tiqany-windows-main',v:1,host:'192.168.1.3',port:39271,key:'a'.repeat(43),serverId:'a'.repeat(32)});
  await peer.acceptPairing(payload);assert.equal(configured,1);assert.equal(peer.scanApproval,null);
  await peer.acceptPairing(payload);assert.equal(configured,1,'replayed QR cannot bypass a new approval');
 });
}
