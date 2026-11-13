'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const protocol=require('../app/src/main/assets/www/static/field-protocol.js');
const file=p=>fs.readFileSync(p,'utf8');
const helper={};vm.runInNewContext(file('app/src/main/assets/www/static/invoice-dual-balances.js'),helper);
const dual=helper.InvoiceDualBalances;
const prior={USD:18.25,SYP:75000};
const usd=dual.pair(prior,{kind:'sale',currency:'USD',netTotal:20.5,paidAmount:5.25});
assert.equal(usd.after.USD,33.5);assert.equal(usd.after.SYP,75000);
const syp=dual.pair(prior,{kind:'sale_return',currency:'SYP',netTotal:20000,paidAmount:0});
assert.equal(syp.after.SYP,55000);assert.equal(syp.after.USD,18.25);
const managerResult=dual.managerBalance({id:'one',type:'sale',accountId:'a1',currency:'USD',date:'2026-11-13T11:00:00Z',netTotal:6,paidAmount:2},
 [{id:'a1',type:'customer',openingUsd:10,openingSyp:10000}],
 [{id:'one',type:'sale',accountId:'a1',currency:'USD',date:'2026-11-13T11:00:00Z',netTotal:6,paidAmount:2}],[]);
assert.equal(managerResult.after.USD,14);assert.equal(managerResult.after.SYP,10000);
const oldid='op_0123456789abcdef0123456789abcdef';
const editid='op_fedcba9876543210fedcba9876543210';
const companyId='company_444',agentId='agent_444',warehouseId='wh_car444';
const row=(qty)=>({itemId:'i1',itemName:'شامبو',unitName:'علبة',unitFactor:1,qty,price:10,total:qty*10});
const original={id:oldid,kind:'sale',companyId,agentId,warehouseId,localNumber:'F-8',date:'2026-11-13T09:00:00Z',currency:'USD',exchangeRate:15000,accountId:'a1',rows:[row(1)],netTotal:10,paidAmount:4,subTotal:10};
const replacement={...structuredClone(original),revision:1,rows:[row(2)],netTotal:20,paidAmount:4,subTotal:20};
const op={id:editid,kind:'document_edit',companyId,agentId,warehouseId,localNumber:'F-8',date:'2026-11-13T10:00:00Z',currency:'USD',exchangeRate:15000,targetOperationId:oldid,originalKind:'sale',baseRevision:0,revision:1,before:original,replacement};
const items=[{id:'i1',name:'شامبو',currency:'USD',units:[{name:'علبة',factor:1,salePrice:10}]}];
const accounts=[{id:'a1',name:'زبون',type:'customer',openingSyp:0,openingUsd:0}];
const validated=protocol.validateOps([op],agentId,companyId,warehouseId,items,accounts,[original]);
assert.equal(validated[0].replacement.netTotal,20);
assert.throws(()=>protocol.validateOps([{...op,baseRevision:2}],agentId,companyId,warehouseId,items,accounts,[original]),/مراجعة|الإصدار/);
const stock=protocol.applyStock({i1:9},[original,op],[original.id]);
assert.equal(stock.i1,8,'unsynced revision reduces stock by difference only');
const state={settings:{companyName:'SAN SHINE',exchangeRate:15000,allowNegativeStockSales:false},license:{isActivated:true,opsUsedCount:0},
 fieldSync:{companyId,agents:[{id:agentId,name:'أحمد',warehouseId,vehicleName:'سيارة'}],imported:[{id:oldid,agentId,kind:'sale'}],events:[],operationHistory:[original],cashTransfers:[]},
 items,accounts,warehouses:[],categories:[],invoices:[{id:'field_'+oldid,number:1,type:'sale',accountId:'a1',currency:'USD',exchangeRate:15000,warehouseId,date:original.date,rows:[row(1)],subTotal:10,netTotal:10,paidAmount:4,remainingAmount:6,
 fieldOrigin:{agentId,operationId:oldid,agentName:'أحمد'}}],vouchers:[],expenses:[],transfers:[]};
let fail=false,saves=0;
const sandbox={State:state,FieldProtocol:protocol,console,window:{},StorageEngine:{saveState:async()=>{if(fail)throw Error('save failed');saves++}},Accounting:{getItemBaseStock:()=>9,getAccountStatement:()=>({usdBalance:6,sypBalance:0})},UI:{toast(){}},AppEscape:{text:String},WarehouseController:{name:x=>x},LicenseManager:{MAX_TRIAL_OPS:100},crypto:crypto.webcrypto,TextDecoder,TextEncoder,atob,btoa,Map,Set,Array,Object,JSON,Date,Math,Number,String};
sandbox.window=sandbox;vm.createContext(sandbox);
for(const f of ['field-main.js','field-cash.js','field-revisions.js'])vm.runInContext(file('app/src/main/assets/www/static/'+f),sandbox,{filename:f});
const FieldSync=vm.runInContext('FieldSync',sandbox);const agent=state.fieldSync.agents[0];
(async()=>{
 assert.equal(await FieldSync.commitLanOperations(agent,validated),1);
 assert.equal(state.invoices.length,1,'edit must not duplicate original invoice');
 assert.equal(state.invoices[0].netTotal,20);
 assert.equal(state.invoices[0].fieldRevision,1);
 assert.equal(state.invoices[0].fieldOrigin.editedByAgent,true);
 assert.equal(state.fieldSync.revisionAudit.length,1);
 assert.equal(state.fieldSync.operationHistory.length,2,'original updated and immutable revision event appended');
 assert.equal(await FieldSync.commitLanOperations(agent,validated),0,'identical edit idempotent');
 assert.equal(saves,1);
 const next={...replacement,revision:2,rows:[row(3)],subTotal:30,netTotal:30};
 const newEd={...op,id:'op_abcdefabcdefabcdefabcdefabcdefab',baseRevision:1,revision:2,description:'second edit',date:'2026-11-13T11:00:00Z',before:replacement,replacement:next};
 fail=true;
 await assert.rejects(FieldSync.commitLanOperations(agent,[newEd]),/save failed/);
 assert.equal(state.invoices[0].netTotal,20,'failed save leaves previous posted doc unchanged');
 assert.equal(state.fieldSync.revisionAudit.length,1,'failed save does not retain new audit');
 fail=false;
 assert.equal(await FieldSync.commitLanOperations(agent,[newEd]),1);
 assert.equal(state.invoices[0].netTotal,30);
 await assert.rejects(FieldSync.commitLanOperations(agent,[{...newEd,id:'op_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',baseRevision:1,date:'2026-11-13T12:00:00Z'}]),/تعارض|مراجعة|تغير/);
 console.log('PASS 3.5.44 dual balances, correct stock difference, revision posting, idempotency, history, rollback, stale rejection');
})().catch(e=>{console.error(e);process.exitCode=1});
