'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/index.html'),'utf8');
const range = (start,end) => {
  const a=html.indexOf(start), b=html.indexOf(end,a+start.length);
  assert.ok(a>=0 && b>a, `missing ${start} -> ${end}`);
  return html.slice(a,b);
};
const els={};
const modals=[]; const dialog=[]; const toasts=[];
let clears=0, saves=0, navs=[];
let pendingRAF=[];
const makeElement=(id,extra={})=>Object.assign({id,value:'',disabled:false,textContent:'',classList:{remove:()=>{},add:()=>{},contains:()=>false},focus:()=>{},scrollIntoView:()=>{}},extra);
const document={
  getElementById:id=>els[id] || null,
  createElement:tag=>{
    const element=makeElement('new',{
      className:'',innerHTML:'',remove(){if(els.appProtectionLock===this){delete els.appProtectionLock;delete els.appUnlockPinPanel;delete els.appUnlockPin;delete els.appUnlockError;delete els.retryAppBiometric;}}
    });
    return element;
  },
  body:{appendChild(e){els[e.id]=e;if(e.id==='appProtectionLock'){
    els.appUnlockPinPanel=makeElement('appUnlockPinPanel',{isHidden:e.innerHTML.includes('class="hidden mt-3"'),classList:{remove:()=>{els.appUnlockPinPanel.isHidden=false}}});
    els.appUnlockPin=makeElement('appUnlockPin');
    els.appUnlockError=makeElement('appUnlockError');
    els.retryAppBiometric=makeElement('retryAppBiometric');
  }}}
};
let context={ console,document,Map,Date,Math,Number,String,JSON,Array,Object,Set,Promise,
  window:{NativeSecurity:{authenticate:()=>{}}},
  UI:{openModal:m=>{modals.push(m);els.protectionVerifyPin=makeElement('protectionVerifyPin');},forceCloseModal:()=>{},toast:(...x)=>toasts.push(x),showDeleteConfirm:(...x)=>dialog.push(x)},
  StorageEngine:{saveState:async()=>{saves++},clearAll:async()=>{clears++}},
  AppNav:{navigate:(...x)=>navs.push(x),renderCurrent:()=>{}},
  requestAnimationFrame:fn=>pendingRAF.push(fn),
  AppEscape:{text:s=>String(s).replaceAll('<','&lt;')},
  crypto:{getRandomValues:x=>x},
  TextEncoder, btoa, atob, setTimeout,clearTimeout
};
context.globalThis=context;
vm.runInNewContext(range('const State =','const StorageEngine =')+'\n'+range('const SettingsController =','const ProtectionController =')+'\n'+range('const ProtectionController =','window.__nativeBiometricReply =')+'\n globalThis.securityTest = {State,SettingsController,ProtectionController};',context,{timeout:6000});
const {State,SettingsController,ProtectionController}=context.securityTest;
ProtectionController.verifyPin=async(pin)=>pin==='1234';
const runFrames=async()=>{const frames=pendingRAF.splice(0);frames.forEach(f=>f());await new Promise(r=>setImmediate(r));};
const check=async()=>{
  State.settings.companyLogo='DATA:image/mock';
  SettingsController.removeLogo();
  assert.equal(State.settings.companyLogo,'DATA:image/mock','without PIN, logo untouched');
  assert.match(modals.at(-1),/يجب تعيين رمز الحماية أولاً/);
  assert.equal(ProtectionController.pendingSuccess,null,'no callback to allow later bypass');
  SettingsController.confirmResetAll();
  assert.equal(clears,0,'no PIN means never clear');
  assert.equal(dialog.length,0,'must not show irreversible confirmation with no PIN');
  assert.match(modals.at(-1),/تعيين رمز الحماية/);
  ProtectionController.goToPinSetup(); await runFrames();
  assert.equal(navs.at(-1)[0],'settings','setup button routes to settings');

  State.settings.appProtection.pinHash='hash';State.settings.appProtection.pinSalt='salt';
  State.settings.appProtection.protectDeletion=false;
  SettingsController.removeLogo(true);
  assert.match(modals.at(-1),/أدخل رمز الحماية لحذف شعار الشركة/);
  els.protectionVerifyPin.value='bad';
  await ProtectionController.verifyPromptPin();
  assert.equal(State.settings.companyLogo,'DATA:image/mock','wrong PIN must not delete');
  els.protectionVerifyPin.value='1234';
  await ProtectionController.verifyPromptPin(); await new Promise(r=>setImmediate(r));
  assert.equal(State.settings.companyLogo,'','correct PIN can remove logo');
  assert.ok(saves>=1);

  SettingsController.confirmResetAll();
  assert.match(modals.at(-1),/أدخل رمز الحماية للسماح بتصفير قاعدة البيانات/);
  assert.equal(dialog.length,0,'reset must not reach confirmation before verification');
  els.protectionVerifyPin.value='1234';
  await ProtectionController.verifyPromptPin();
  assert.equal(dialog.length,1,'correct PIN next requires confirmation');
  assert.equal(clears,0,'no clear without explicit final confirmation');
  await dialog.at(-1)[2]();
  assert.equal(clears,1,'confirmed reset clears DB');

  State.settings.appProtection.lockApp=true;
  State.settings.appProtection.fingerprintEnabled=true;
  ProtectionController.verifyFingerprint=async()=>true;
  ProtectionController.showAppLock();
  assert.ok(els.appProtectionLock,'lock UI exists before biometric');
  assert.ok(els.appUnlockPinPanel.isHidden,'PIN input should be hidden until requested');
  assert.match(els.appProtectionLock.innerHTML,/استخدام رمز الحماية/);
  await runFrames();
  assert.equal(els.appProtectionLock,undefined,'biometric success opens immediately');

  ProtectionController.verifyFingerprint=async()=>false;
  ProtectionController.showAppLock(); await runFrames();
  assert.ok(els.appProtectionLock,'failed/cancelled fingerprint leaves app locked');
  ProtectionController.showUnlockPin();
  assert.equal(els.appUnlockPinPanel.isHidden,false,'PIN option reveals input');
  els.appUnlockPin.value='1234'; await ProtectionController.unlockApp();
  assert.equal(els.appProtectionLock,undefined,'correct PIN immediately opens app');
  console.log('PASS: blocked destructive actions without PIN, correct PIN required, second reset confirmation, biometric first, fallback PIN, automatic unlock');
};
check().catch(err=>{console.error(err);process.exitCode=1});
