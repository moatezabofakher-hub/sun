'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../field_agent/src/main');
const lock=fs.readFileSync(path.join(root,'assets/www/static/employee-password-lock.js'),'utf8');
const java=fs.readFileSync(path.join(root,'java/com/sunshine/accounting/MainActivity.java'),'utf8');
const manager=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/static/field-main.js'),'utf8');
test('manager decides whether app lock is required, without deleting employee biometric preference',()=>{
 const state={companyId:'company_abc',agentId:'agent_abc',deviceId:'TD-123',employeeAuth:{hash:'abc123',salt:'salt',lockApp:true}};
 const store=new Map();const body={classList:{add(){},remove(){}},appendChild(){}};
 const doc={head:{appendChild(){}},body,createElement:()=>({style:{},set textContent(v){},set innerHTML(v){}}),getElementById:()=>null,addEventListener(){}};
 const Agent={state,escape:s=>String(s),save:async()=>true,show:async()=>true};
 const ctx={Agent,document:doc,localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},window:{addEventListener(){},NativeSecurity:{authenticateBiometricOnly(){},}},setTimeout,clearTimeout,console,Math,Date,Promise};
 vm.runInNewContext(lock,ctx);
 const api=ctx.window.TiqanyEmployeeLock;
 assert.equal(api.isUnlocked(),false,'default manager lock requires unlocking');
 store.set('tiqany.employee.biometric.v1.company_abc:agent_abc:TD-123',JSON.stringify({enabled:true,credentialHash:'abc123'}));
 assert.equal(api.biometricReady(),true);
 state.employeeAuth.lockApp=false;
 assert.equal(api.isUnlocked(),true,'manager disabled lock');
 assert.equal(api.biometricReady(),true,'the fingerprint survives the disabled lock');
 state.employeeAuth.lockApp=true;
 assert.equal(api.isUnlocked(),false,'manager can reenable lock without deleting the fingerprint');
 assert.equal(api.biometricReady(),true);
 state.employeeAuth.hash='rotated';
 assert.equal(api.biometricReady(),false,'password rotation invalidates old device authorization');
});
test('biometrics use Android BiometricPrompt without device-screen PIN fallback',()=>{
 assert.match(java,/authenticateBiometricOnly\(String requestId, String language\)/);
 assert.match(java,/biometricOnly\s*\?\s*BiometricManager.Authenticators.BIOMETRIC_STRONG/);
 assert.match(lock,/TiqanyEmployeeAuth\.verify\(pin,cfg\(\)\)/);
 assert.doesNotMatch(lock,/TiqanyEmployeeAuth\.create\(/);
 assert.match(manager,/قفل تطبيق الموظف بكلمة السر أو البصمة/);
});
test('local backup scheduling accepts two hours and prunes only auto files',()=>{
 for(const m of ['app','field_agent']){
  const base=path.join(__dirname,'../'+m+'/src/main/java/com/sunshine/accounting');
  const mgr=fs.readFileSync(path.join(base,'AutoBackupManager.java'),'utf8');
  const worker=fs.readFileSync(path.join(base,'BackupWorker.java'),'utf8');
  assert.match(mgr,/hours == 2 \|\| hours == 6/);
  assert.match(worker,/pruneAutoBackups\(dir, name\)/);
  assert.match(worker,/i=20; i<items\.size\(\)/);
 }
});
