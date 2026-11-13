'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const FieldProtocol=require('../app/src/main/assets/www/static/field-protocol.js');
const FieldLanCrypto=require('../app/src/main/assets/www/static/field-lan-crypto.js');
const agentId='agent_1234567890',companyId='company_1234567890',warehouseId='wh_car';
const key=FieldProtocol.b64u(crypto.randomBytes(32));
const fop={id:'op_12345678901',kind:'sale',companyId,agentId,warehouseId,localNumber:'S-5',date:'2026-11-13T12:00:00Z',currency:'USD',exchangeRate:15000,accountId:'c1',
 rows:[{itemId:'i1',itemName:'منظف',unitName:'علبة',unitFactor:1,qty:2,price:5,total:10}],netTotal:10,paidAmount:6};
const st={fieldSync:{companyId,agents:[{id:agentId,name:'أحمد',vehicleName:'سيارة',warehouseId,key}],imported:[{id:fop.id,agentId}],events:[],cashTransfers:[],operationHistory:[fop]},
 settings:{companyName:'SAN SHINE',exchangeRate:15000,allowNegativeStockSales:false},
 warehouses:[{id:'wh_main',name:'الرئيسي'},{id:warehouseId,name:'السيارة'}],items:[{id:'i1',name:'منظف',currency:'USD',units:[{name:'علبة',factor:1,salePrice:5}]}],
 accounts:[{id:'c1',name:'عميل',type:'customer'}],categories:[],invoices:[{id:'field_'+fop.id,number:12,type:'sale',fieldOrigin:{agentId,agentName:'أحمد',operationId:fop.id,localNumber:'S-5'},
 accountId:'c1',currency:'USD',date:fop.date,paidAmount:6,netTotal:10,rows:fop.rows}],vouchers:[],expenses:[],transfers:[
 {id:'t1',batchId:'batch1',fromWarehouseId:'wh_main',toWarehouseId:warehouseId,itemId:'i1',quantityBase:5,date:'2026-11-13',note:'حمولة سيارة'}],license:{isActivated:true,opsUsedCount:1}};
const managerScope={State:st,FieldProtocol,FieldLanCrypto,crypto:crypto.webcrypto,TextEncoder,TextDecoder,atob,btoa,Map,Date,Math,console,setTimeout,clearTimeout,
 document:{getElementById(id){return managerScope.inputs[id]||null;}},inputs:{},AppEscape:{text:x=>String(x)},WarehouseController:{name:id=>id},
 Accounting:{getItemBaseStock:()=>5,getAccountStatement:()=>({sypBalance:0,usdBalance:0})},StorageEngine:{saveState:async()=>{}},UI:{toast:(x)=>{},forceCloseModal:()=>{},openModal:html=>managerScope.lastModal=html},
 AppNav:{navigate:()=>{}},LicenseManager:{MAX_TRIAL_OPS:100}};
managerScope.window=managerScope;vm.createContext(managerScope);
for(const file of ['field-main.js','field-cash.js'])vm.runInContext(fs.readFileSync('app/src/main/assets/www/static/'+file,'utf8'),managerScope,{filename:file});
const manager=vm.runInContext('FieldSync',managerScope),cash=managerScope.FieldCash;
assert.equal(cash.summary(agentId).usdCash,6);
assert.equal(cash.summary('office').usdCash,0);
assert.equal(cash.summary('all').usdCash,6);
assert.equal(manager.historyPage(st.fieldSync.agents[0],0).ops[0].id,fop.id);
const provision=manager.catalog(st.fieldSync.agents[0],0,0);
assert.equal(provision.agentCash.usdCash,6);
assert.equal(provision.warehouseHistoryPage.docs[0].lines[0].quantityBase,5);
assert.match(managerScope.lastModal||'',/^$|./);
const agentScope={FieldProtocol,FieldLanCrypto,crypto:crypto.webcrypto,TextEncoder,TextDecoder,atob,btoa,Map,Date,Math,console,setTimeout,clearTimeout,
 document:{getElementById:()=>null,addEventListener:()=>{},querySelectorAll:()=>[]}};agentScope.window=agentScope;
vm.createContext(agentScope);
for(const file of ['agent.js','agent-experience.js','agent-invoice-parity.js','agent-cash-history.js'])vm.runInContext(fs.readFileSync('field_agent/src/main/assets/www/static/'+file,'utf8'),agentScope,{filename:file});
const A=vm.runInContext('Agent',agentScope);const agentState={...A.blank,companyId,agentId,warehouseId,agentName:'أحمد',companyName:'SAN SHINE',key,
 accounts:[{id:'c1',name:'عميل',usdBalance:4,sypBalance:0}],items:st.items,stock:{i1:5},ops:[],knownIds:[],snapshotIds:[],agentCash:provision.agentCash,cashTransfers:[],warehouseTransfers:[]};
const recovered=A.mergeHistoryPage(provision.historyPage,agentState);
assert.equal(recovered.ops.length,1);assert.equal(recovered.restoredIds[0],fop.id);
A.state={...agentState,ops:recovered.ops,historyCursor:recovered.cursor,knownIds:[fop.id],snapshotIds:[fop.id]};
assert.equal(A.pending.length,0,'restored history never re-uploads');
assert.equal(A.cashSummary().usd,6,'posted cash included only once');
A.state.ops.push({...fop,id:'op_new_123456789',localNumber:'S-6',paidAmount:2});
assert.equal(A.cashSummary().usd,8,'unsent operation adjusts till immediately');
const transferRecovery=A.mergeTransferPage(provision.warehouseHistoryPage,A.state);
assert.equal(transferRecovery.docs.length,1);
A.state.warehouseTransfers=transferRecovery.docs;
assert.match(A.renderStock(),/فواتير المناقلة/);assert.match(A.renderStock(),/حمولة سيارة/);
assert.match(A.renderInvoices(),/S-5/);assert.match(A.renderCashbox(),/صندوق المندوب/);
A.state.warehouseTransferRevision=transferRecovery.revision;A.state.warehouseHistoryCursor=transferRecovery.cursor;
const changedPage={...provision.warehouseHistoryPage,revision:'new-revision',offset:1,docs:[]};
const reset=A.mergeTransferPage(changedPage,A.state);
assert.equal(reset.cursor,0,'changed warehouse invoice must restart snapshot');assert.equal(reset.docs.length,0);
(async()=>{
 managerScope.inputs={agentCashTransferAgent:{value:agentId},agentCashTransferCurrency:{value:'USD'},agentCashTransferAmount:{value:'4'},agentCashTransferNote:{value:'تسليم الصندوق'}};
 await cash.saveTransfer('fromAgent');
 assert.equal(st.fieldSync.cashTransfers.length,1);
 assert.equal(cash.summary(agentId).usdCash,2);
 assert.equal(cash.summary('office').usdCash,4);
 assert.equal(cash.summary('all').usdCash,6,'moving money between tills must not create profit or cash');
 assert.equal(manager.catalog(st.fieldSync.agents[0]).cashTransfers.length,1);
 // End-to-end encrypted catalog on a replacement device: recover archived invoices
 // and cash hand-offs while avoiding any re-post of accepted invoices.
 A.state={...agentState,ops:[],knownIds:[],snapshotIds:[],historyCursor:0,warehouseHistoryCursor:0,warehouseTransferRevision:''};
 A.lanSyncBusy=true;A.lanRequestNonce='nonce_restore_123456';A.lanSyncQuiet=true;
 A.save=async()=>{};A.show=async()=>{};A.syncPaint=()=>{};A.toast=()=>{};
 const offer=manager.catalog(st.fieldSync.agents[0],0,0);
 const response={kind:'sync_result',companyId,agentId,knownIds:[fop.id],catalog:offer,requestNonce:A.lanRequestNonce};
 const frame=await FieldLanCrypto.pack(response,key,companyId,agentId);
 await A.onLocalSyncResult(JSON.stringify({data:JSON.stringify(frame)}));
 assert.equal(A.state.ops.length,1,'encrypted recovery installs the archived operation');
 assert.equal(A.pending.length,0,'archived operations must never be retransmitted');
 assert.equal(A.cashSummary().usd,2,'reconciled cash reflects hand-off');
 assert.equal(A.state.warehouseTransfers.length,1);
 assert.equal(A.state.historyCursor,1);
 assert.equal(A.state.warehouseHistoryCursor,1);
 // Editing an already delivered transfer invalidates the old transfer snapshot.
 st.transfers[0].quantityBase=9;
 A.lanSyncBusy=true;A.lanRequestNonce='nonce_refresh_123456';
 const newer=manager.catalog(st.fieldSync.agents[0],A.state.historyCursor,A.state.warehouseHistoryCursor);
 const newerFrame=await FieldLanCrypto.pack({...response,catalog:newer,requestNonce:A.lanRequestNonce},key,companyId,agentId);
 await A.onLocalSyncResult(JSON.stringify({data:JSON.stringify(newerFrame)}));
 assert.equal(A.state.warehouseHistoryCursor,0);
 const refresh=manager.catalog(st.fieldSync.agents[0],A.state.historyCursor,0);
 A.lanSyncBusy=true;A.lanRequestNonce='nonce_reload_123456';
 const refreshFrame=await FieldLanCrypto.pack({...response,catalog:refresh,requestNonce:A.lanRequestNonce},key,companyId,agentId);
 await A.onLocalSyncResult(JSON.stringify({data:JSON.stringify(refreshFrame)}));
 assert.equal(A.state.warehouseTransfers[0].lines[0].quantityBase,9,'edited transfer document reappears after sync');
 console.log('PASS 3.5.37: separate tills, internal cash hand-off, full journal restoration, pending deltas, invoice history, transfer document history and edit refresh.');
})().catch(e=>{console.error(e);process.exitCode=1;});
