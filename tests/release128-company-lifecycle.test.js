'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base=path.join(__dirname,'../app/src/main/assets/www');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const source=fs.readFileSync(path.join(base,'static/company-lifecycle-128.js'),'utf8');
function environment(){
  const records=new Map([
    ['main',{id:'main',data:{invoices:[{id:'inv1'}]}}],
    ['profile:old',{id:'profile:old',data:{}}],
    ['archived_profile:former',{id:'archived_profile:former',data:{}}],
    ['backup:old:2026',{id:'backup:old:2026',data:{}}],
    ['peer_conflicts:old',{id:'peer_conflicts:old',data:{profileId:'old',details:[{id:'c1'}],decisions:{}}}],
    ['peer_conflict_audit:old',{id:'peer_conflict_audit:old',data:{version:2,entries:[{id:'c2'}]}}]
  ]);
  const State={settings:{companyName:'',companyPhone:'',companyAddress:'',companySetupCompleted:false},license:{activated:true},invoices:[{id:'invoice1'}],accounts:[{id:'client1'}],fieldSync:{agents:[{id:'seller'}]}};
  const DEFAULT_PROFILE={settings:{companyName:'',companyPhone:'',companyAddress:'',companySetupCompleted:false},license:{activated:false},invoices:[],accounts:[],fieldSync:{companyId:'',agents:[],imported:[],events:[]},items:[],vouchers:[],warehouses:[{id:'wh_main',name:'المستودع الرئيسي'}],transfers:[],expenses:[],capitalMovements:[],alertCenter:{entries:[]}};
  const transaction=()=>{const tx={oncomplete:null,onabort:null,onerror:null,objectStore:()=>({clear:()=>records.clear(),put:r=>records.set(r.id,r)})};queueMicrotask(()=>tx.oncomplete?.());return tx;};
  const StorageEngine={db:{transaction},clearAll:async()=>{throw Error('unpatched reset')}};
  const ProfileManager={activeId:'old',registry:{profiles:[{id:'old'}]},generateId:()=> 'business_new_random',getRecord:async id=>records.get(id)||null,putBatch:async rows=>{for(const x of rows)records.set(x.id,x)},backupPayload:()=>({app:'AlRaedAccountingERP',profileId:'old',data:State})};
  const staged=[],location={reload:()=>staged.push('reload')};
  const BackupController={stageLatest(){}};
  const LicenseManager={persistFallbackStorage:()=>staged.push('persist-license')};
  const localStorage={clear:()=>staged.push('clear-local')},sessionStorage={clear:()=>staged.push('clear-session')};
  const window={AndroidAutoBackup:{stageSnapshot:raw=>staged.push(JSON.parse(raw))},TiqanyPeerSync:{conflictLog:{details:[1]},resolvedHistory:[1],approved:true,renderConflictButton(){}}};
  const context={State,DEFAULT_PROFILE,StorageEngine,ProfileManager,BackupController,LicenseManager,window,localStorage,sessionStorage,location,console,queueMicrotask,setTimeout,document:{getElementById:()=>null},AppNav:{renderCurrent(){}},UI:{toast(){}},JSON,Date,Promise};
  vm.runInNewContext(source,context);
  return {c:window.CompanyLifecycle,context,records,staged};
}
test('new installs never ship a commercial company name',()=>{
  assert.match(html,/companyName:\s*''/);
  assert.doesNotMatch(html,/companyName:\s*'مؤسسة الرائد التجارية'/);
  assert.match(html,/companySetupCompleted:\s*false/);
  assert.match(html,/static\/company-lifecycle-128.js/);
  assert.match(html,/CompanyLifecycle.showIfRequired\(\)/);
});
test('first-run requests required real company identity, but skips existing genuine companies',()=>{
  const {c,context}=environment();
  assert.equal(c.needsSetup(),true);
  context.State.settings.companyName='شركة المستخدم';
  assert.equal(c.needsSetup(),false);
  context.State.settings.companyName='';
  context.State.settings.companySetupCompleted=true;
  assert.equal(c.needsSetup(),false);
});
test('authorized reset wipes all stored profile, ledger, backup and conflict records in one transaction',async()=>{
  const {c,context,records,staged}=environment();
  c.show=()=>staged.push('show-registration');
  await context.StorageEngine.clearAll();
  assert.deepEqual([...records.keys()].sort(),['main','profile:business_new_random','profile_registry'].sort());
  assert.equal(context.State.accounts.length,0);
  assert.equal(context.State.invoices.length,0);
  assert.equal(context.State.settings.companyName,'');
  assert.equal(context.State.settings.companyPhone,'');
  assert.equal(context.State.settings.companyAddress,'');
  assert.equal(context.State.license.activated,true); // device activation is not a customer's ledger
  assert.equal(context.ProfileManager.activeId,'business_new_random');
  assert.equal(staged.some(x=>typeof x==='object'&&x.peerConflictJournal?.active==null&&x.peerConflictJournal?.resolved==null),true);
  assert.ok(staged.includes('reload'));
});
test('backup includes unresolved conflict details and resolved decisions',async()=>{
  const {c}=environment();
  const journal=await c.conflictJournal();
  assert.equal(journal.active.details[0].id,'c1');
  assert.equal(journal.resolved.entries[0].id,'c2');
  assert.match(html,/payload.peerConflictJournal=await CompanyLifecycle.conflictJournal\(\)/);
});
test('approved restore recreates live and historical conflicts for the restored company',async()=>{
  const {c,context,records}=environment();
  const backup={peerConflictJournal:{version:1,active:{profileId:'old',details:[{id:'open1'}],decisions:{}},resolved:{version:2,entries:[{id:'closed1'}]}}};
  context.ProfileManager.activeId='new_local';
  await c.restoreConflictJournal(backup);
  assert.equal(records.get('peer_conflicts:new_local').data.profileId,'new_local');
  assert.equal(records.get('peer_conflicts:new_local').data.details[0].id,'open1');
  assert.equal(records.get('peer_conflict_audit:new_local').data.entries[0].id,'closed1');
  assert.equal(context.window.TiqanyPeerSync.conflictLog.details[0].id,'open1');
});
test('invalid conflict archives cannot be silently applied',()=>{
  const {c}=environment();
  assert.throws(()=>c.validateConflictJournal({peerConflictJournal:{version:1,active:{details:'invalid',decisions:{}},resolved:null}}));
});
test('restore passes source backup metadata through all approval paths',()=>{
  assert.match(html,/CompanyLifecycle.validateConflictJournal\(sourceBackup\)/);
  assert.match(html,/await CompanyLifecycle.restoreConflictJournal\(sourceBackup\)/);
});
