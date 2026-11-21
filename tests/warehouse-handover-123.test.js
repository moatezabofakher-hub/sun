'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../field_agent/src/main/assets/www/static/agent.js'),'utf8');
function fixture(accepted=true,withToken=true){
 let saved=0,notices=[];
 const ctx={FieldProtocol:{uuid:()=> 'abcxyz123456',applyStock:(stock)=>stock},FieldLanCrypto:{open:async p=>p.payload},TiqanyEmployeeAuth:{resolve:(a,b)=>b||a},
  window:{AndroidLocalSync:{confirmVerifiedSync(){} }},document:{getElementById(){return null}},crypto:{subtle:{}},setTimeout,clearTimeout,TextDecoder,Date,Map,Set,JSON,Math,Number,Promise,console,globalThis:null};
 ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
 const a=vm.runInContext('Agent',ctx);
 a.state={companyId:'co',agentId:'a1',key:'key',companyName:'الشركة',agentName:'عامل',vehicleName:'سيارة',warehouseId:'old',warehouseName:'مستودع قديم',ops:[{id:'op_1',kind:'sale',localNumber:'F-12',warehouseId:'old'}],stock:{item:5},items:[],accounts:[],categories:[],exchangeRate:15000,knownIds:[],snapshotIds:[],agentCash:{sypCash:400,usdCash:10},cashTransfers:[],warehouseTransfers:[{id:'tr_old'}],historyCursor:8,warehouseHistoryCursor:3,defaultPriceTier:'wholesale',permissions:{},employeeAuth:null,accountLedgers:[],lastSyncAt:new Date().toISOString()};
 a.screen='home';a.lanSyncBusy=true;a.lanSyncQuiet=true;a.lanRequestNonce='nonce123';a.draft=[];
 a.save=async()=>{saved++;};a.show=async()=>{};a.toast=m=>notices.push(m);a.syncPaint=()=>{};a.mergeCustomerCatalog=x=>x;
 a.mergeTransferPage=(page)=>({docs:page.docs||[],cursor:page.nextCursor||0,revision:'new'});
 a.mergeHistoryPage=(page,old)=>({ops:old.ops,cursor:old.historyCursor,restoredIds:[]});
 const ack={kind:'sync_result',appVersion:'3.5.162',requestNonce:'nonce123',companyId:'co',agentId:'a1',knownIds:accepted?['op_1']:[],serverAt:new Date().toISOString(),catalog:{kind:'provision',companyId:'co',agentId:'a1',key:'key',warehouseId:'new',warehouseName:'مستودع جديد',agentName:'عامل',vehicleName:'سيارة',companyName:'الشركة',stock:{item:99},items:[],accounts:[],categories:[],exchangeRate:15000,knownIds:['op_1'],agentCash:{sypCash:400,usdCash:10},cashTransfers:[],warehouseHistoryPage:{docs:[{id:'tr_new'}],nextCursor:1},historyPage:{ops:[],nextCursor:15},warehouseSwitch:withToken?{from:'old',to:'new',id:'whs_abcdefgh123',historyCursor:15}:null}};
 return {a,ack,saved:()=>saved,notices,send:()=>a.onLocalSyncResult(JSON.stringify({data:JSON.stringify({payload:ack})}))};
}
test('employee applies authenticated warehouse change, clears old journal but preserves cash and sequence',async()=>{
 const t=fixture();await t.send();assert.equal(t.a.state.warehouseId,'new');assert.equal(t.a.state.stock.item,99);
 assert.equal(t.a.state.ops.length,0);assert.equal(t.a.state.historyCursor,15);assert.equal(t.a.state.warehouseTransfers.length,1);
 assert.equal(t.a.state.warehouseTransfers[0].id,'tr_new');assert.equal(t.a.state.agentCash.sypCash,400);
 assert.equal(t.a.state.localSequence,12);assert.equal(t.a.nextLocalNumber('F'),'F-13');assert.equal(t.saved(),1);
});
test('employee refuses switch when an operation was not durably acknowledged',async()=>{
 const t=fixture(false,true);await t.send();assert.equal(t.a.state.warehouseId,'old');assert.equal(t.a.state.ops.length,1);assert.equal(t.saved(),0);
 assert.match(t.a.lanSyncMessage,/تأكيد حفظ/);
});
test('employee refuses unauthorized warehouse change even when cash and stock look correct',async()=>{
 const t=fixture(true,false);await t.send();assert.equal(t.a.state.warehouseId,'old');assert.equal(t.saved(),0);
});
