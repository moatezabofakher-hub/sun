'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const protocol=require('../app/src/main/assets/www/static/field-protocol.js');
const lan=require('../app/src/main/assets/www/static/field-lan-crypto.js');
const key=protocol.b64u(crypto.randomBytes(32)),companyId='company_1234567890',agentId='agent_1234567890';
const agent={id:agentId,name:'Rep',vehicleName:'Van',warehouseId:'wh_car',key,disabled:false};
const state={fieldSync:{companyId,agents:[agent],imported:[],events:[]},
 items:[{id:'i1',name:'SLES',currency:'USD',category:'cat',units:[{name:'bottle',factor:1,salePrice:5}]}],
 accounts:[{id:'c1',name:'New Customer',type:'customer'}],categories:[{id:'cat',name:'Products'}],
 settings:{companyName:'SunShine',exchangeRate:15500,allowNegativeStockSales:false},invoices:[],vouchers:[],
 license:{isActivated:true,opsUsedCount:0}};
let saved=0,response;
const scope={State:state,FieldProtocol:protocol,FieldLanCrypto:lan,AppEscape:{text:String},WarehouseController:{name:()=>''},
 Accounting:{getItemBaseStock:()=>19,getAccountStatement:()=>({sypBalance:0,usdBalance:0})},LicenseManager:{MAX_TRIAL_OPS:100},StorageEngine:{saveState:async()=>{saved++}},
 UI:{toast:()=>{}},document:{getElementById:()=>null},window:{AndroidLocalSync:{reply:(_,ans)=>{response=JSON.parse(ans)}}},
 crypto:crypto.webcrypto,TextEncoder,TextDecoder,atob,btoa,console,setTimeout,clearTimeout};
vm.createContext(scope);
vm.runInContext(fs.readFileSync('app/src/main/assets/www/static/field-main.js','utf8')+'\nglobalThis.Manager=FieldSync;',scope);
(async()=>{
 const req={kind:'operations',companyId,agentId,warehouseId:'wh_car',nonce:'nonce_12345678',operations:[]};
 const pkt=await lan.pack(req,key,companyId,agentId);
 await scope.Manager.receiveLanPacket('1',JSON.stringify(pkt));
 assert(!response.error,'manager should accept pull-only request');
 const ack=await lan.open(response,key,companyId,agentId);
 assert.equal(ack.accepted,0);
 assert.equal(ack.catalog.items[0].units[0].salePrice,5);
 assert.equal(ack.catalog.accounts[0].name,'New Customer');
 assert.equal(ack.catalog.stock.i1,19);
 assert.equal(ack.catalog.exchangeRate,15500);
 assert.equal(ack.requestNonce,'nonce_12345678');
 assert.equal(saved,0,'pull-only request must not generate financial transactions');
 assert.equal(state.invoices.length,0);assert.equal(state.fieldSync.imported.length,0);
 console.log('PASS: manager delivers fresh catalog and car stock on zero-operation pull with no ledger mutation.');
})().catch(e=>{console.error(e);process.exitCode=1});
