'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const start = html.indexOf('const ProtectionController =');
const end = html.indexOf('window.__nativeBiometricReply =',start);
assert.ok(start>=0 && end>start, 'ProtectionController source exists');
assert.ok(!html.includes('protectionCurrentPin'), 'previous PIN input not required in collapsed password panel');
const els = {
  protectLockApp:{checked:true}, protectDeletion:{checked:false},
  protectionPin:{value:''}, protectionPinConfirm:{value:''},
  securityQuestion1:{value:'school'}, securityQuestion2:{value:'friend'},
  securityAnswer1:{value:''},securityAnswer2:{value:''}
};
let modal='',saves=0,renders=0,closed=0;
const toasts=[];
const settings={appProtection:{pinHash:'valid-hash',pinSalt:'old-salt',pinAlgo:'sha256-v1',lockApp:false,protectDeletion:false,securityQuestions:[]}};
const context={
 console, Date, TextEncoder, Uint8Array, btoa,atob, setTimeout,
 document:{getElementById:id=>els[id]||null},
 State:{settings},
 UI:{openModal:markup=>{modal=markup;els.protectionVerifyPin={value:'',focus:()=>{}}},forceCloseModal:()=>{closed++},toast:(msg,type)=>{toasts.push([msg,type])}},
 StorageEngine:{saveState:async()=>{saves++}},
 AppNav:{renderCurrent:()=>{renders++}},
 requestAnimationFrame:fn=>fn(),
 crypto:{getRandomValues:x=>x},
};
context.globalThis=context;
vm.runInNewContext(html.slice(start,end)+'\nglobalThis.P = ProtectionController;',context);
const P=context.P;
P.verifyPin=async pin => pin==='1234';
(async()=>{
 await P.saveSettings();
 assert.match(modal,/أدخل كلمة السر الحالية لتأكيد حفظ إعدادات الحماية/);
 assert.equal(saves,0,'do not save before verification');
 assert.equal(renders,0,'do not rerender settings before verification');
 assert.equal(settings.appProtection.lockApp,false);
 els.protectionVerifyPin.value='wrong';
 await P.verifyPromptPin();
 assert.equal(saves,0,'invalid PIN cannot save');
 assert.equal(settings.appProtection.lockApp,false);
 assert.match(toasts.at(-1)[0],/غير صحيح/);
 els.protectionVerifyPin.value='1234';
 await P.verifyPromptPin();
 assert.equal(saves,1,'valid PIN saves once');
 assert.equal(renders,1,'render only after success');
 assert.equal(settings.appProtection.lockApp,true);
 assert.equal(closed,1,'verification window closed');
 // Saving unchanged settings still prompts, as requested.
 await P.saveSettings();
 assert.match(modal,/التحقق من الحماية/);
 assert.equal(saves,1);
 // A fresh installation without a configured PIN must still support PIN setup.
 settings.appProtection={lockApp:false,protectDeletion:false,securityQuestions:[]};
 els.protectLockApp.checked=false;
 els.protectionPin.value='5678';els.protectionPinConfirm.value='5678';
 els.securityAnswer1.value='first-answer'; els.securityAnswer2.value='second-answer';
 P.randomBytes=()=>new Uint8Array(16);
 P.hashPin=async (pin,salt,algo)=>`hashed:${pin}`;
 await P.saveSettings();
 assert.equal(saves,2,'initial PIN setup still works');
 assert.equal(settings.appProtection.pinHash,'hashed:5678');
 assert.equal(settings.appProtection.securityQuestions.length,2);
 console.log('PASS: save protection prompts for current PIN, rejects invalid PIN, keeps settings open until verified, initial PIN setup intact.');
})().catch(e=>{console.error(e);process.exitCode=1});
