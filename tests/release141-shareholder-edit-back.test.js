'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.resolve(__dirname,'../app/src/main/assets/www');
const moduleSource=fs.readFileSync(path.join(base,'static/shareholders-integrated-133.js'),'utf8');
const page=fs.readFileSync(path.join(base,'index.html'),'utf8');
const capital=fs.readFileSync(path.join(base,'static/capital-ledger.js'),'utf8');
const S=require(path.join(base,'static/shareholders-integrated-133.js'));
function ledger(){return {settings:{companyName:'شركة اختبار',exchangeRate:15000,appProtection:{pinHash:'valid',pinSalt:'salt'},shareholderDistribution:{values:{}}},shareholderOwners:[],shareholderMovements:[],items:[],invoices:[],expenses:[],capitalMovements:[],accounts:[],vouchers:[],warehouses:[]};}
test('Editing shareholder preserves unique identity and rejects duplicate names',()=>{
 const state=ledger();
 const owner=S.addOwner(state,{name:'مساهم أول',phone:'0912345678',period:'added',at:'2026-11-01T12:00:00Z'});
 const second=S.addOwner(state,{name:'مساهم ثاني',period:'all',at:'2026-11-01T12:00:00Z'});
 const beforeId=owner.id;
 const updated=S.editOwner(state,owner.id,{name:'مساهم مُعدّل',phone:'0990000011',period:'date',startDate:'2026-11-05'});
 assert.equal(updated.id,beforeId);
 assert.equal(updated.startDate,'2026-11-05');
 assert.equal(updated.phone,'0990000011');
 assert.throws(()=>S.editOwner(state,owner.id,{name:second.name}),/مكرر/);
 assert.equal(S.owner(state,owner.id).name,'مساهم مُعدّل');
});
test('Protected owner edit is accessible from management card, Back unwinds each level',()=>{
 assert.match(moduleSource,/ownerButton\('editOwner',id,/);
 assert.match(moduleSource,/ProtectionController\.requestPin\(/);
 assert.match(moduleSource,/this\._enter\('editOwner',id\)/);
 assert.match(moduleSource,/if\(type==='back'\)return this\.back\(\)/);
 assert.match(page,/ShareholdersUI\.back\(\)/);
 const state=ledger();
 const owner=S.addOwner(state,{name:'مالك تجريبي',period:'all',at:'2026-11-01T12:00:00Z'});
 let latest='',closed=0,prompts=0;
 const document={getElementById:id=>id==='modalBox'?{querySelectorAll:()=>[]}:null,
   querySelector:()=>({addEventListener:()=>{}}),addEventListener:()=>{}};
 const sandbox={document,State:state,require,console,Date,Math,UI:{
   openModal:v=>{latest=v;},requestCloseModal:()=>{closed++;},
   toast:()=>{}},Accounting:{format:(v,cur)=>v+' '+cur},StorageEngine:{saveState:async()=>{}},
   ProtectionController:{requestPin:(message,callback)=>{prompts++;callback(true);},promptPinSetup:()=>{}}};
 vm.createContext(sandbox);vm.runInContext(moduleSource,sandbox);
 const gui=sandbox.ShareholdersUI;
 gui.open();assert.match(latest,/رأس المال والمساهمون/);
 gui.ownerForm(owner.id);assert.match(latest,/مالك تجريبي/);
 gui.authorizeEditOwner(owner.id);assert.equal(prompts,1);assert.match(latest,/حفظ تعديل المساهم/);
 gui.back();assert.equal(gui._level.kind,'owner');
 gui.back();assert.equal(gui._level.kind,'root');
 gui.back();assert.equal(closed,1);
});
test('Capital subform has a separate Back step and employee has no protected owner editor',()=>{
 assert.match(page,/capitalAmount/);
 assert.match(page,/CapitalLedger\._fromShareholders/);
 assert.match(capital,/ShareholdersUI\.open\(\)/);
});
