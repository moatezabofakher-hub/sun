'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const html=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/index.html'),'utf8');
const java=fs.readFileSync(path.join(__dirname,'../app/src/main/java/com/sunshine/accounting/MainActivity.java'),'utf8');

test('Android insets are forwarded to viewport without a second bottom reserved strip',()=>{
  assert.match(java,/params\.setMargins\(bars\.left, bars\.top, bars\.right, bottomMargin\)/);
  assert.match(java,/Math\.max\(bars\.bottom, gestures\.bottom\)/);
  assert.match(java,/--ta-native-bottom-inset/);
  assert.match(java,/insets\.isVisible\(WindowInsetsCompat\.Type\.ime\(\)\)/);
  assert.match(html,/nav\.ta-bottom-nav \{bottom:0!important; padding-bottom:var\(--ta-native-bottom-inset\)!important/);
  assert.match(html,/html\.ta-ime-open nav\.ta-bottom-nav \{display:none!important;/);
  assert.match(html,/ResizeObserver\(measure\)/);
  assert.match(html,/max-width:min\(100%,520px\)/);
});

function makeHarness(){
  const start=html.indexOf('const ProtectionController =');
  const end=html.indexOf('window.__nativeBiometricReply =',start);
  assert.ok(start>=0&&end>start);
  let current=null,open=false,auths=0,frames=[];
  const fields={protectionVerifyPin:{value:'',focus(){},classList:{add(){},remove(){}}},protectionPasswordPanel:{classList:{add(){},remove(){}}},protectionBiometricPanel:{classList:{add(){},remove(){}}},protectionBiometricError:{textContent:''}};
  const doc={getElementById(id){
    if(id==='modalContainer')return {classList:{contains:(name)=>name==='hidden'&&!open}};
    if(id==='protectionApprovalPrompt')return open?{dataset:{approvalId:String(current)}}:null;
    return fields[id]||null;
  }};
  const ctx={console, Map, Object,Date,Math,Number,String,JSON,Array,Set,Promise,TextEncoder,
    setTimeout,clearTimeout,Uint8Array,btoa,atob,
    document:doc,
    State:{settings:{language:'ar',appProtection:{pinHash:'yes',pinSalt:'yes',fingerprintEnabled:true}}},
    AppEscape:{text:(x)=>String(x)},
    window:{NativeSecurity:{authenticate(){}}},
    UI:{openModal(markup){open=true;current=Number(markup.match(/data-approval-id="(\d+)"/)[1]);},forceCloseModal(){open=false;},toast(){}},
    requestAnimationFrame(fn){frames.push(fn);},
  };
  vm.runInNewContext(html.slice(start,end)+'\nglobalThis.P=ProtectionController;',ctx);
  return {
    p:ctx.P,fields,close(){open=false},getAuths:()=>auths,
    onAuthorized(){auths++},
    async flushFrames(){const list=frames.splice(0);await Promise.all(list.map(fn=>fn()));await new Promise(r=>setImmediate(r));}
  };
}

test('fingerprint success is single-use and calls the protected operation only after native approval',async()=>{
 const h=makeHarness();h.p.nativeBiometricAuthenticate=async()=>true;
 h.p.requestPin('حذف السجل',()=>h.onAuthorized());
 assert.equal(h.getAuths(),0);
 await h.flushFrames();assert.equal(h.getAuths(),1);
 await h.p.verifyApprovalBiometric(1);assert.equal(h.getAuths(),1);
});

test('cancelled fingerprint never authorizes a protected operation',async()=>{
 const h=makeHarness();let resolveNative;
 h.p.nativeBiometricAuthenticate=()=>new Promise(resolve=>{resolveNative=resolve});
 h.p.requestPin('حذف السجل',()=>h.onAuthorized());
 const running=h.flushFrames();await new Promise(r=>setImmediate(r));
 h.close();resolveNative(true);await running;
 assert.equal(h.getAuths(),0);
});

test('failed fingerprint leaves password fallback available and verifies it',async()=>{
 const h=makeHarness();h.p.nativeBiometricAuthenticate=async()=>{throw Error('Cancelled')};
 h.p.verifyPin=async pin=>pin==='1234';
 h.p.requestPin('حذف السجل',()=>h.onAuthorized());
 await h.flushFrames();assert.equal(h.getAuths(),0);
 h.p.showApprovalPassword();h.fields.protectionVerifyPin.value='1234';
 await h.p.verifyPromptPin();assert.equal(h.getAuths(),1);
});
