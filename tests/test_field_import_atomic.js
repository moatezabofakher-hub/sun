'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const FieldProtocol=require('../app/src/main/assets/www/static/field-protocol.js');
const src=fs.readFileSync('app/src/main/assets/www/static/field-main.js','utf8');
const make=()=>{
  const saved=[];let shouldFail=false;
  const State={settings:{companyName:'اختبار',allowNegativeStockSales:false},license:{isActivated:true,opsUsedCount:0},warehouses:[{id:'wh_1',name:'سيارة'}],items:[{id:'i1',name:'سائل جلي',currency:'USD',units:[{name:'عبوة',factor:1,salePrice:3}]}],accounts:[{id:'c1',name:'عميل',type:'customer'}],invoices:[],vouchers:[],fieldSync:{companyId:'co1',agents:[{id:'agent_12345678',name:'المندوب 1',warehouseId:'wh_1',vehicleName:'سيارة 1',key:FieldProtocol.b64u(require('node:crypto').randomBytes(32))}],imported:[],events:[]}};
  const sandbox={State,FieldProtocol,console,window:{AndroidFiles:{saveBackup(json,name){saved.push({json,name});}}},
    StorageEngine:{saveState:async()=>{if(shouldFail)throw Error('disk full')}},
    Accounting:{getItemBaseStock:()=>10},UI:{forceCloseModal(){},toast(){}},AppEscape:{text:v=>v},WarehouseController:{name:()=>''},LicenseManager:{MAX_TRIAL_OPS:100},Date,Map,Set,Array,Object,JSON,Number,String,Promise};
  vm.createContext(sandbox);vm.runInContext(src+'\n globalThis.FieldSync=FieldSync;',sandbox);
  return {sandbox,State,saved,fail(){shouldFail=true;}};
};
const op={id:'op_abcdefgh001',agentId:'agent_12345678',companyId:'co1',warehouseId:'wh_1',date:'2026-11-13T10:00:00Z',kind:'sale',currency:'USD',exchangeRate:15000,accountId:'c1',rows:[{itemId:'i1',unitName:'عبوة',unitFactor:1,qty:2,price:3,total:6}],paidAmount:4};
(async()=>{
  const a=make();const o=FieldProtocol.validateOps([op],a.State.fieldSync.agents[0].id,'co1','wh_1',a.State.items,a.State.accounts)[0];
  a.sandbox.FieldSync.staged={agent:a.State.fieldSync.agents[0],ops:[o]};
  await a.sandbox.FieldSync.confirmImport();
  assert.equal(a.State.invoices.length,1);assert.equal(a.State.vouchers.length,0);
  assert.equal(a.State.invoices[0].remainingAmount,2);
  assert.equal(a.State.invoices[0].fieldOrigin.agentName,'المندوب 1');
  assert.equal(a.State.fieldSync.imported.length,1);
  assert.equal(a.saved.length,1);
  a.sandbox.FieldSync.staged={agent:a.State.fieldSync.agents[0],ops:[o]};
  await a.sandbox.FieldSync.confirmImport();
  assert.equal(a.State.invoices.length,1,'Duplicate cannot post again');
  const b=make();b.fail();b.sandbox.FieldSync.staged={agent:b.State.fieldSync.agents[0],ops:[o]};
  await b.sandbox.FieldSync.confirmImport();
  assert.equal(b.State.invoices.length,0);assert.equal(b.State.fieldSync.imported.length,0,'Atomic rollback on save failure');
  console.log('PASS: manager import records source, issues authenticated ACK, refuses duplicates, and rolls back on storage failure.');
})().catch(e=>{console.error(e);process.exitCode=1});
