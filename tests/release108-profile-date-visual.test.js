'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const root=path.resolve(__dirname,'..');const web=path.join(root,'app/src/main/assets/www');
const html=fs.readFileSync(path.join(web,'index.html'),'utf8');
const date=fs.readFileSync(path.join(web,'static/ta-date-view-35107.js'),'utf8');
const css=fs.readFileSync(path.join(web,'static',false?'agent-forms-35107.css':'tiqany-forms-35107.css'),'utf8');
function makeProfile(){
 const start=html.indexOf('const ProfileManager = {');assert.ok(start>=0);
 const end=html.indexOf('\n        };',start);assert.ok(end>start);
 const objectText=html.slice(start+'const ProfileManager = '.length,end+10);
 const old={settings:{companyName:'شركة ألف',appProtection:{pinHash:'hash',pinSalt:'salt'}},accounts:[{id:'acc-a'}],invoices:[{id:'inv-a'}],vouchers:[],categories:[],items:[],warehouses:[],transfers:[],expenses:[],fieldSync:{},alertCenter:{},license:{active:true}};
 let state=JSON.parse(JSON.stringify(old));
 const data=new Map();const registry={version:1,activeId:'a',profiles:[{id:'a',name:'شركة ألف',createdAt:'2020-01-01'},{id:'b',name:'شركة باء',createdAt:'2020-01-01'}]};
 data.set('profile:b',{id:'profile:b',data:{...JSON.parse(JSON.stringify(old)),settings:{...old.settings,companyName:'شركة باء'},accounts:[{id:'acc-b'}],invoices:[{id:'inv-b'}]}});
 let dirty=false, fail=false;const toast=[];
 const ctx={State:state,SoloSanitize:{ledger:o=>JSON.parse(JSON.stringify(o)),documents:x=>x,notifications:x=>x},DEFAULT_PROFILE:{...old,accounts:[],invoices:[],vouchers:[],items:[],categories:[],transfers:[],expenses:[]},AppEscape:{text:x=>x},Date,crypto:{getRandomValues(buf){buf.fill(3);return buf;}},
 StorageEngine:{db:{},async saveState(){}},UI:{toast:(...x)=>toast.push(x),forceCloseModal(){},openModal(){}},
 AppNav:{isDirty:false,isModalDirty:false,activeOperationGuard:false,clearDirty(){},clearModalDirty(){},stack:[],renderCurrent(){}},
 SettingsController:{closeAllSections(){}},SettingsDraftController:{section:null,changed(){return false},revert(){}},
 ProtectionController:{async hashPin(pin){return pin==='valid'?'hash':'wrong'},requestPin(_,cb){cb()},promptPinSetup(){}},BackupController:{stageLatest(){}},
 document:{getElementById(id){return id==='profileRestoreArchivedPin'?{value:'valid'}:null}},window:{}};
 const manager=vm.runInNewContext('('+objectText+')',ctx);
 manager.registry=registry;manager.activeId='a';
 manager.getRecord=async id=>data.get(id)||null;
 manager.putBatch=async records=>{if(fail)throw Error('write failed');for(const x of records)data.set(x.id,x);};
 manager.commitProfileBatch=async(records,deletes=[])=>{if(fail)throw Error('write failed');for(const x of records)data.set(x.id,x);for(const id of deletes)data.delete(id);};
 return {manager,ctx,data,toast,getState:()=>state,setFail(v){fail=v;}};
}
test('Date inputs render one visible DD/MM/YYYY layer above invisible native control',()=>{
 assert.match(css,/Only one date rendering layer/);assert.match(css,/opacity:0!important/);
 assert.match(css,/\.ta-date-readable/);assert.match(date,/input\.dataset\.taDateDecorated/);
});
test('Active business archives all records, switches to another, offers restoration',async()=>{
 const {manager,data,ctx}=makeProfile();await manager.archiveActiveProfile();
 assert.equal(manager.activeId,'b');assert.equal(ctx.State.settings.companyName,'شركة باء');
 assert.equal(manager.registry.profiles.length,1);assert.equal(manager.registry.deletedProfiles.length,1);
 assert.equal(manager.registry.deletedProfiles[0].name,'شركة ألف');
 assert.equal(data.get('archived_profile:a').data.invoices[0].id,'inv-a');assert.equal(data.has('profile:a'),false);
 await manager.restoreArchivedProfile(); // restore target must be chosen first
 assert.equal(manager.registry.profiles.length,1);
 manager.pendingArchiveRestore='a';await manager.restoreArchivedProfile();
 assert.equal(manager.registry.profiles.length,2);assert.equal(data.get('profile:a').data.settings.companyName,'شركة ألف');
 assert.equal(ctx.State.settings.companyName,'شركة باء');
});
test('A storage failure cannot remove business or affect active data',async()=>{
 const {manager,ctx,setFail}=makeProfile();setFail(true);
 await manager.archiveActiveProfile();
 assert.equal(manager.activeId,'a');assert.equal(ctx.State.settings.companyName,'شركة ألف');
 assert.equal(manager.registry.deletedProfiles,undefined);
});
test('Last remaining business is replaced by clean empty ledger; archived copy survives',async()=>{
 const {manager,data,ctx}=makeProfile();manager.registry.profiles=[manager.registry.profiles[0]];
 await manager.archiveActiveProfile();
 assert.equal(manager.registry.profiles.length,1);assert.notEqual(manager.activeId,'a');
 assert.equal(data.get('archived_profile:a').data.invoices[0].id,'inv-a');
 assert.equal(ctx.State.invoices.length,0);
});
test('Restoring archived business rejects wrong PIN',async()=>{
 const {manager,ctx}=makeProfile();await manager.archiveActiveProfile();
 manager.pendingArchiveRestore='a';ctx.document.getElementById=()=>({value:'wrong'});
 await manager.restoreArchivedProfile();assert.equal(manager.registry.profiles.length,1);
});
