 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..',false?'web/index.html':'app/src/main/assets/www/index.html'),'utf8');
function fixture({activePin=true}={}){
  const start=html.indexOf('const ProfileManager = {'),end=html.indexOf('\n        };',start);
  assert.ok(start>0&&end>start,'ProfileManager source missing');
  const objectText=html.slice(start+'const ProfileManager = '.length,end+10);
  const data={settings:{companyName:'شركة اختبار',appProtection:activePin?{pinHash:'CURRENT_HASH',pinSalt:'CURRENT_SALT'}:{}},items:[],categories:[],accounts:[],invoices:[],vouchers:[],warehouses:[],transfers:[],expenses:[],fieldSync:{},alertCenter:{}};
  const state=structuredClone(data);state.license={status:'active'};
  let approval,checks=0,commits=0;const modals=[],toasts=[];
  const appNav={isDirty:false,activeOperationGuard:false,navigate(){}};
  const context={State:state,Date,AppEscape:{text:s=>String(s)},
    ProtectionController:{requestPin:(_,cb)=>{checks++;approval=cb},promptPinSetup:(msg)=>modals.push(msg),async hashPin(pin){return pin==='correct'?'BACKUP_HASH':'INVALID'},verifyPin:async p=>p==='correct'},
    UI:{toast:(...x)=>toasts.push(x),openModal:x=>modals.push(x),forceCloseModal(){}},
    StorageEngine:{async saveState(){commits++;}},AppNav:appNav,SettingsController:{closeAllSections(){}},
    window:{TiqanyRecovery:{restoreCommitted(){}}},document:{getElementById(id){return id==='backupSourceApprovalPin'?{value:'correct'}:null}}};
  const manager=vm.runInNewContext('(()=>{const BackupRestoreApprovalCapability=Object.freeze({});return ('+objectText+');})()',context);
  manager.activeId='primary';manager.registry={profiles:[{id:'primary',name:'شركة اختبار'}]};
  manager.makeCheckpoint=async()=>{};manager.newState=()=>structuredClone(data);
  return {manager,context,state,modals,toasts,get approval(){return approval},get checks(){return checks},get commits(){return commits}};
}
const backup=(name='استيراد')=>({settings:{companyName:name,appProtection:{pinHash:'BACKUP_HASH',pinSalt:'BACKUP_SALT',pinAlgo:'sha256-v1'}},items:[{id:'new'}],categories:[],accounts:[],invoices:[],vouchers:[],warehouses:[],transfers:[],expenses:[],fieldSync:{},alertCenter:{}});
test('restore never modifies a protected business without PIN/biometric callback',async()=>{
 const f=fixture(),d=backup();assert.equal(await f.manager.restoreParsed(d),false);
 assert.equal(f.checks,1);assert.equal(f.commits,0);
 assert.deepEqual(f.state.items,[]);
 assert.equal(await f.manager.applyRestore(d),false);assert.equal(f.commits,0);
 await f.approval();assert.equal(f.commits,1);assert.equal(f.state.items.length,1);
 assert.equal(f.state.settings.appProtection.pinHash,'CURRENT_HASH','do not replace local PIN from untrusted backup');
});
test('fresh installation must prove source backup PIN before importing',async()=>{
 const f=fixture({activePin:false}),parsed=backup();assert.equal(await f.manager.restoreParsed(parsed),false);
 assert.equal(f.commits,0);assert.ok(f.modals.some(m=>String(m).includes('backupSourceApprovalPin')));
 await f.manager.confirmBackupSourcePin();assert.equal(f.commits,1);
 assert.equal(f.state.settings.appProtection.pinHash,'BACKUP_HASH');
 assert.equal(f.state.settings.appProtection.fingerprintEnabled,false,'do not transplant device biometric approval');
});
test('legacy backup and no current PIN must require setup rather than silently overwrite',async()=>{
 const f=fixture({activePin:false}),d=backup();d.settings.appProtection={};
 assert.equal(await f.manager.restoreParsed(d),false);assert.equal(f.commits,0);
 assert.ok(f.modals.some(m=>String(m).includes('استعادة النسخة الاحتياطية')));
});

test('wrong backup PIN cannot import into a new installation',async()=>{
 const f=fixture({activePin:false}),d=backup();
 await f.manager.restoreParsed(d);
 f.context.document.getElementById=()=>({value:'wrong'});
 await f.manager.confirmBackupSourcePin();
 assert.equal(f.commits,0);assert.equal(f.state.items.length,0);
 assert.ok(f.toasts.some(x=>String(x[0]).includes('غير صحيحة')));
});
