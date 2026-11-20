'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const base=path.resolve(__dirname,'..');
const android=fs.existsSync(path.join(base,'web'))?false:true;
const dir=android?path.join(base,'app/src/main/assets/www/static'):path.join(base,'web/static');
function source(name){return fs.readFileSync(path.join(dir,name),'utf8')}
function ctx(protect){
 const employees=[],events=[],dom={fieldNewAgent:'موظف تجريبي',fieldNewVehicle:'سيارة اختبار',fieldNewWarehouse:'w1',fieldNewEmployeePassword:'secret-staff',fieldNewEmployeeConfirm:'secret-staff'};
 let approved=null,saves=0;
 const fake={State:{fieldSync:{companyId:'company_12345',agents:employees,imported:[],events:[]},settings:{companyName:'شركة',exchangeRate:10000,appProtection:{protectDeviceAddition:protect,pinHash:'managerhash',pinSalt:'salt'}},warehouses:[{id:'w1',name:'سيارة'}],items:[],accounts:[],categories:[],license:{opsUsedCount:0}},
  UI:{toast:(...v)=>events.push(v),openModal:(html)=>events.push(['modal',html])},
  ProfileManager:{activeId:'profile1'},AppEscape:{text:x=>String(x).replaceAll('<','&lt;')},
  StorageEngine:{async saveState(){saves++}},
  ProtectionController:{requestPin(_message,cb){approved=cb},verifyPin:async s=>s==='managerpass',promptPinSetup(){throw Error('unexpected')}},
  TiqanyEmployeeAuth:{async create(password){return {hash:'hashed:'+password, salt:'salty'}},valid:v=>!!v?.hash},
  FieldProtocol:{uuid:()=>String(saves+1)+'faked',b64u:()=>('A'.repeat(43))},
  WarehouseController:{name:()=>''},
  document:{readyState:'loading',addEventListener(){},getElementById:id=>({value:dom[id]??''}),querySelector:()=>null,querySelectorAll:()=>[]},
  crypto:webcrypto,window:android?{}:{WindowsPeerSync:{}},setInterval(){},setTimeout(){},clearTimeout(){},
  TextEncoder,btoa,atob,Date,Math,Object,Set,Map,JSON,Number,console};
 vm.createContext(fake);vm.runInContext(source('field-main.js'),fake);
 const f=vm.runInContext('FieldSync',fake);
 f.readAccountPicker=()=>null;f.readPermissions=()=>({priceTier:true});f.open=()=>{};
 return {f,dom,employees,events,approve:()=>approved,saves:()=>saves,fake};
}
test('125: with protection off, employee is created without PIN and no employee password',async()=>{
 const x=ctx(false);await x.f.addAgent();assert.equal(x.approve(),null);assert.equal(x.employees.length,1);
 assert.equal(x.employees[0].employeeAuth,undefined);assert.equal(x.saves(),1);
});
test('125: protection on requires employee password plus manager authorization before creation',async()=>{
 const x=ctx(true);
 x.dom.fieldNewEmployeeConfirm='wrong';await x.f.addAgent();assert.equal(x.approve(),null);assert.equal(x.saves(),0);
 x.dom.fieldNewEmployeeConfirm='secret-staff';await x.f.addAgent();assert.equal(x.saves(),0);assert.equal(typeof x.approve(),'function');
 await x.approve()();assert.equal(x.saves(),1);assert.equal(x.employees[0].employeeAuth.hash,'hashed:secret-staff');
 assert.equal(x.employees[0].employeeAuth.lockApp,true);
});
test('125: online employee list only includes authenticated recent active employees',()=>{
 const x=ctx(false);x.employees.push({id:'a1',name:'موظف1'},{id:'a2',name:'موظف2'},{id:'a3',name:'المؤرشف',archived:true});
 x.f.markConnectedAgent('a1');x.f.markConnectedAgent('a2');x.f.markConnectedAgent('a3');
 assert.deepEqual(Array.from(x.f.connectedEmployees()).map(x=>x.id),['a1','a2']);
 x.f.connectedAt['a1']=Date.now()-40001;
 assert.deepEqual(Array.from(x.f.connectedEmployees()).map(x=>x.id),['a2']);
 x.employees[1].disabled=true;assert.equal(x.f.connectedEmployees().length,0);
});
test('125: remote change creates a stable operation ID; sync metadata produces no additional invoice alert',()=>{
 const ev=require(path.join(dir,'tiqany-peer-events.js'));
 const a={invoices:[{id:'inv1',amount:10}]};
 const b={invoices:[{id:'inv1',amount:20}]};
 const c={invoices:[{id:'inv1',amount:30}]};
 assert.equal(ev.records(a,b,'mobile').entries[0].id,ev.records(a,b,'mobile').entries[0].id);
 assert.notEqual(ev.records(a,b,'mobile').entries[0].id,ev.records(a,c,'mobile').entries[0].id);
 assert.equal(ev.records(b,b,'mobile').entries.length,0);
 assert.equal(ev.records({invoices:[{id:'k',amount:10,number:7}]},{invoices:[{id:'k',amount:20,number:7}]},'mobile').entries[0].id, ev.records({invoices:[{id:'k',number:7,amount:10}]},{invoices:[{id:'k',number:7,amount:20}]},'mobile').entries[0].id);
 const s={invoices:[],fieldImported:[]};
 const t={invoices:[{id:'field_op1',amount:10}],fieldImported:[{id:'op1',agentId:'a1'}]};
 assert.equal(ev.records(s,t,'mobile').entries.length,0,'imported operation is notified by manager import tracker only');
});
test('125: persisted peer notification delivery keys prevent replay after reconnect or archival',()=>{
 const state={alertCenter:{entries:[],seenPeerEventKeys:[]},fieldSync:{imported:[]},warehouses:[],items:[]};
 const vmContext=vm.createContext({State:state,window:{},document:{getElementById:()=>null},AppEscape:{text:String},StorageEngine:{saveState:async()=>{}},AppNav:{current:()=>({screen:'home'})},UI:{toast(){}},console});
 vm.runInContext(source('manager-notifications.js'),vmContext);
 const n=vm.runInContext('ManagerNotifications',vmContext);
 const item={eventKey:'peer:v2:abc',id:'peer:v2:abc',title:'حفظ فاتورة'};
 assert.equal(n.filterPeerEvents([item]).length,1);
 state.alertCenter.entries=[]; // history is not the replay checkpoint
 assert.equal(n.filterPeerEvents([item]).length,0);
 assert.equal(n.filterPeerEvents([{...item,id:'peer:v2:another',eventKey:'peer:v2:another'}]).length,1);
});

test('Sale notifications preserve the invoice clock and localize explicit instants in both directions',()=>{
 const events=require(path.join(dir,'tiqany-peer-events.js'));
 const instant=new Date('2026-11-19T23:44:00Z');
 const pad=n=>String(n).padStart(2,'0');
 const local=pad(instant.getDate())+'/'+pad(instant.getMonth()+1)+'/'+instant.getFullYear()+'\u00a0'+pad(instant.getHours())+':'+pad(instant.getMinutes());
 for(const source of ['mobile','windows']){
   for(const [date,display] of [['2026-11-20T02:44','20/11/2026\u00a002:44'],['2026-11-20','20/11/2026'],
       ['2026-11-20T02:44:00+03:00',local],['2026-11-19T23:44:00.000Z',local]]){
     const invoice={id:'i12',type:'sale',number:12,date,netTotal:2,currency:'USD',rows:[{}]};
     const note=events.records({},{invoices:[invoice]},source).entries[0];
     assert.equal(invoice.date,date);
     assert.ok(note.detail.includes('\u2066'+display+'\u2069'));
     assert.equal(events.forDisplay(note).detail,note.detail);
     const old={...note,operationDate:undefined,detail:'الفواتير · تاريخ العملية: '+date+' · البيان: '+date};
     const view=events.forDisplay(old);
     assert.ok(view.detail.includes('\u2066'+display+'\u2069'));
     assert.ok(view.detail.endsWith('البيان: '+date));
     assert.equal(view.id,note.id);
   }
 }
});

test('Settings revision timestamps stay silent and archived notices have Arabic descriptions',()=>{
 const events=require(path.join(dir,'tiqany-peer-events.js'));
 const after={sharedSettings:{_syncSettingTimes:{exchangeRate:{updatedAt:'2026-11-19T23:44:00Z'}}}};
 assert.equal(events.records({},after).count,0);
 assert.equal(events.summarize({},after).body,'');
 after.sharedSettings.exchangeRate=15100;
 after.sharedSettings.futureOption=true;
 const changes=events.records({},after);
 assert.equal(changes.count,2);
 for(const entry of changes.entries)assert.doesNotMatch(entry.title+entry.detail,/[A-Za-z]/);
 assert.match(events.summarize({},after).body,/سعر الصرف/);
 assert.doesNotMatch(events.summarize({},after).body,/[A-Za-z]/);
 const old={id:'old',type:'peer-operation',collection:'settings',recordId:'_syncSettingTimes',title:'_syncSettingTimes',read:false};
 assert.match(events.forDisplay(old).detail,/أوقات آخر تعديل/);
 assert.equal(old.title,'_syncSettingTimes');
});
