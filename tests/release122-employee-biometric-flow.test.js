'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const lock=fs.readFileSync(path.join(__dirname,'../field_agent/src/main/assets/www/static/employee-password-lock.js'),'utf8');
function createHarness({enabled=true,lockApp=true,authSuccess=true}={}){
  const storage=new Map();
  const state={companyId:'company_test',agentId:'agent_test',deviceId:'TD-123',employeeAuth:{hash:'hash123',salt:'salt123',lockApp}};
  const KEY='tiqany.employee.biometric.v1.company_test:agent_test:TD-123';
  if(enabled)storage.set(KEY,JSON.stringify({enabled:true,credentialHash:'hash123'}));
  const handlers=new Map();
  const docListeners=new Map();
  const classSets=new Map();
  function element(id=''){
    const cls=new Set();classSets.set(id,cls);
    if(id==='ta-employee-login-form')cls.add('hide');
    const node={id,style:{},inert:false,innerHTML:'',textContent:'',value:'',disabled:false,focus(){},
      classList:{add:s=>cls.add(s),remove:s=>cls.delete(s),contains:s=>cls.has(s)},
      setAttribute(){},remove(){if(id==='ta-employee-lock')overlay=null;},
      addEventListener:(name,cb)=>handlers.set(`${id}:${name}`,cb),
      querySelector(q){
        const id=q==='form'?'ta-employee-login-form':q==='input'?'ta-employee-login-pin':q.startsWith('#')?q.slice(1):null;
        return id?lookup(id):null;
      }
    };
    return node;
  }
  const children=new Map();let overlay=null;
  function lookup(id){if(id==='ta-employee-lock')return overlay;
    if(!children.has(id))children.set(id,element(id));return children.get(id);}
  const body={classList:{add(){},remove(){}},appendChild(n){overlay=n;n.remove=()=>{overlay=null;};},};
  const doc={head:{appendChild(){}},body,visibilityState:'visible',hidden:false,
    getElementById:lookup,
    createElement:()=>element(),addEventListener:(name,cb)=>docListeners.set(name,cb)};
  let nativeCalls=0;let lastRequestId='';let Agent={state,screen:'home',escape:String,save:async()=>true,show:async()=>true};
  const native={authenticateBiometricOnly(id){nativeCalls++;lastRequestId=id;
    if(authSuccess)queueMicrotask(()=>win.__nativeBiometricReply?.(id,true,''));
    else queueMicrotask(()=>win.__nativeBiometricReply?.(id,false,'ألغي التحقق'));
  }};
  const win={NativeSecurity:native,addEventListener(){}};
  const ctx={Agent,document:doc,window:win,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    setTimeout,clearTimeout,Math,Date,Promise,console};
  vm.runInNewContext(lock,ctx);
  return {state,doc,win,storage,handlers,children,docListeners,api:win.TiqanyEmployeeLock,
    overlay:()=>overlay, nativeCalls:()=>nativeCalls, lastRequestId:()=>lastRequestId};
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('fingerprint is shown first and unlocks without entering the manager-issued password',async()=>{
  const h=createHarness();h.api.enforce();
  const html=h.overlay().innerHTML;
  assert.match(html,/id="ta-employee-biometric-btn"/);
  assert.match(html,/id="ta-employee-login-form" class="hide"/);
  await delay(450);
  assert.equal(h.nativeCalls(),1);
  assert.equal(h.api.isUnlocked(),true);
  assert.equal(h.overlay(),null);
});
test('cancelled fingerprint stays on biometric screen until user chooses password instead',async()=>{
  const h=createHarness({authSuccess:false});h.api.enforce();await delay(450);
  assert.equal(h.api.isUnlocked(),false);
  assert.ok(h.overlay());
  assert.equal(h.children.get('ta-employee-login-form').classList.contains('hide'),true);
  assert.equal(h.nativeCalls(),1,'no automatic retry loop after cancellation');
  h.handlers.get('ta-employee-password-alternative:click')();
  assert.equal(h.children.get('ta-employee-login-form').classList.contains('hide'),false);
});
test('returning to a pre-existing locked screen prompts fingerprint again',async()=>{
  const h=createHarness({authSuccess:false});h.api.enforce();await delay(430);
  h.doc.hidden=true;h.doc.visibilityState='hidden';h.docListeners.get('visibilitychange')();
  h.doc.hidden=false;h.doc.visibilityState='visible';h.docListeners.get('visibilitychange')();
  await delay(430);
  assert.equal(h.nativeCalls(),2);
});
test('manager disabling lock preserves fingerprint enrollment for next reenable',async()=>{
  const h=createHarness({lockApp:false,authSuccess:false});
  h.api.enforce();assert.equal(h.overlay(),null);assert.equal(h.api.biometricReady(),true);
  h.state.employeeAuth.lockApp=true;h.api.enforce();await delay(430);
  assert.equal(h.nativeCalls(),1);
  assert.match(h.overlay().innerHTML,/id="ta-employee-biometric-btn"/);
});
test('a rotated employee password requires new approval and does not silently trust an old fingerprint',()=>{
  const h=createHarness();h.state.employeeAuth.hash='changed';
  assert.equal(h.api.biometricReady(),false);
  h.api.enforce();assert.doesNotMatch(h.overlay().innerHTML,/id="ta-employee-biometric-btn"/);
});
