'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const FieldProtocol = require('../app/src/main/assets/www/static/field-protocol.js');
const FieldLanCrypto = require('../app/src/main/assets/www/static/field-lan-crypto.js');
const namespace = {companyId:'company_1234567890',agentId:'agent_1234567890',warehouseId:'wh_car_1'};
const key = FieldProtocol.b64u(crypto.randomBytes(32));
const agent = {id:namespace.agentId,name:'مندوب 1',vehicleName:'سيارة 1',warehouseId:namespace.warehouseId,key,disabled:false,archived:false};
const state = {fieldSync:{companyId:namespace.companyId,agents:[agent],imported:[],events:[]},
  items:[{id:'i1',name:'منظف',currency:'USD',units:[{name:'علبة',factor:1,salePrice:3}]}],
  accounts:[{id:'c1',name:'عميل',type:'customer'}],
  invoices:[],vouchers:[],categories:[],
  license:{isActivated:true,opsUsedCount:0},
  settings:{allowNegativeStockSales:false,companyName:'شركة تجريبية',exchangeRate:15000}
};
const vmScope = {FieldProtocol,FieldLanCrypto,State:state,AppEscape:{text:String},
  WarehouseController:{name:()=>''},
  Accounting:{getItemBaseStock:()=>100,getAccountStatement:()=>({sypBalance:0,usdBalance:0})},
  LicenseManager:{MAX_TRIAL_OPS:100},
  UI:{toast:()=>{},forceCloseModal:()=>{}},
  document:{getElementById:()=>null},
  window:{AndroidLocalSync:{reply:(id,data)=>{vmScope.lastReply={id,data};}}},
  crypto:crypto.webcrypto,TextEncoder,TextDecoder,atob,btoa,setTimeout,clearTimeout,console,
  StorageEngine:{saveState:async()=>{vmScope.saves++;}},saves:0, lastReply:null
};
vm.createContext(vmScope);
vm.runInContext(fs.readFileSync('app/src/main/assets/www/static/field-main.js','utf8')+'\nglobalThis.FieldSyncUnderTest=FieldSync;',vmScope);
const main=vmScope.FieldSyncUnderTest;
const operation=(id)=>({id,kind:'sale',...namespace,date:'2026-11-13T09:00:00.000Z',currency:'USD',exchangeRate:15000,accountId:'c1',paidAmount:6,rows:[{itemId:'i1',unitName:'علبة',unitFactor:1,qty:2,price:3,total:6}]});
let reqCounter=0;
async function send(ops,nonce){
 const payload={kind:'operations',...namespace,issuedAt:new Date().toISOString(),nonce,operations:ops};
 const packet=await FieldLanCrypto.pack(payload,key,namespace.companyId,namespace.agentId);
 await main.receiveLanPacket(String(++reqCounter),JSON.stringify(packet));
 return JSON.parse(vmScope.lastReply.data);
}
(async()=>{
 const pkt=await FieldLanCrypto.pack({kind:'operations',operations:[operation('op_12345678901')]},key,namespace.companyId,namespace.agentId);
 const unwrapped=await FieldLanCrypto.open(pkt,key,namespace.companyId,namespace.agentId);
 assert.equal(unwrapped.operations.length,1);
 await assert.rejects(FieldLanCrypto.open({...pkt,body:pkt.body.slice(0,-2)+'zz'},key,namespace.companyId,namespace.agentId),/التحقق/);
 await assert.rejects(FieldLanCrypto.open(pkt,FieldProtocol.b64u(crypto.randomBytes(32)),namespace.companyId,namespace.agentId));
 await assert.rejects(FieldLanCrypto.open(pkt,key,'company_other12345',namespace.agentId));
 assert(!JSON.stringify(pkt).includes('منظف'));
 const first=await send([operation('op_12345678901')],'nonce_12345678901');
 assert.equal(first.error,undefined);
 const ack1=await FieldLanCrypto.open(first,key,namespace.companyId,namespace.agentId);
 assert.equal(ack1.accepted,1);
 assert.deepEqual(ack1.knownIds,['op_12345678901']);
 assert.equal(ack1.requestNonce,'nonce_12345678901');
 assert.equal(state.invoices.length,1);
 assert.equal(state.invoices[0].fieldOrigin.agentName,'مندوب 1');
 assert.equal(vmScope.saves,1);
 const second=await send([operation('op_12345678901')],'nonce_12345678902');
 const ack2=await FieldLanCrypto.open(second,key,namespace.companyId,namespace.agentId);
 assert.equal(ack2.accepted,0);
 assert.equal(state.invoices.length,1);
 assert.equal(vmScope.saves,1);
 vmScope.StorageEngine.saveState=async()=>{throw Error('disk unavailable');};
 const failure=await send([operation('op_12345678902')],'nonce_12345678903');
 assert(failure.error.includes('disk unavailable'));
 assert.equal(state.invoices.length,1);
 assert.equal(state.fieldSync.imported.length,1);
 vmScope.StorageEngine.saveState=async()=>{vmScope.saves++;};
 const recovered=await send([operation('op_12345678902')],'nonce_12345678904');
 assert.equal((await FieldLanCrypto.open(recovered,key,namespace.companyId,namespace.agentId)).accepted,1);
 assert.equal(state.invoices.length,2);
 const rogue=await FieldLanCrypto.pack({kind:'operations',...namespace,nonce:'nonce_12345678905',operations:[]},FieldProtocol.b64u(crypto.randomBytes(32)),namespace.companyId,namespace.agentId);
 await main.receiveLanPacket('99',JSON.stringify(rogue));
 assert(JSON.parse(vmScope.lastReply.data).error);
 assert.equal(state.invoices.length,2);
 console.log('PASS: AES-GCM, same-company binding, tamper rejection, single import, idempotent retry, ACK after commit, failed commit rollback, authenticated peer rejection.');
})().catch(err=>{console.error(err);process.exitCode=1});
