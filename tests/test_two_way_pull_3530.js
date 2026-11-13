'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const protocol=require('../app/src/main/assets/www/static/field-protocol.js');
const lan=require('../app/src/main/assets/www/static/field-lan-crypto.js');
const key=protocol.b64u(crypto.randomBytes(32)),companyId='company_1234567890',agentId='agent_1234567890';
let sent,saveFails=false,saves=0;
const dom={getElementById:()=>null,querySelectorAll:()=>[],addEventListener:()=>{}};
const scope={FieldProtocol:protocol,FieldLanCrypto:lan,crypto:crypto.webcrypto,TextEncoder,TextDecoder,
 atob,btoa,console,document:dom,setTimeout,clearTimeout,window:{AndroidLocalSync:{send:(co,p)=>{sent={co,p}}}}};
vm.createContext(scope);
for(const path of ['field_agent/src/main/assets/www/static/agent.js'])vm.runInContext(fs.readFileSync(path,'utf8'),scope);
vm.runInContext('globalThis.instance=Agent',scope);
const rep=scope.instance;
rep.state={companyId,agentId,key,warehouseId:'wh_car_1',companyName:'Old Company',agentName:'Rep',vehicleName:'Car',
 items:[{id:'i1',name:'Dish Soap',units:[{name:'unit',salePrice:3}]}],categories:[],accounts:[{id:'c1',name:'Customer'}],
 ops:[],knownIds:[],snapshotIds:[],stock:{i1:15},license:'ACTIVATED',exchangeRate:15000};
rep.active=async()=>true;rep.show=async()=>{};rep.toast=()=>{};rep.syncPaint=()=>{};
rep.save=async()=>{if(saveFails)throw Error('No storage');saves++};
function catalog({price=4,customer='Customer Updated',stock=13}={}) {return {kind:'provision',companyId,agentId,key,warehouseId:'wh_car_1',
 companyName:'Updated Company',agentName:'Rep',vehicleName:'Car',exchangeRate:16000,issuedAt:new Date().toISOString(),
 items:[{id:'i1',name:'Dish Soap',units:[{name:'unit',salePrice:price}]}],categories:[{id:'food',name:'Products'}],
 accounts:[{id:'c1',name:customer}],stock:{i1:stock},knownIds:[]};}
async function ackFor(req,options={}){return lan.pack({kind:'sync_result',companyId,agentId,requestNonce:req.nonce,knownIds:[],serverAt:new Date().toISOString(),catalog:catalog(options)},key,companyId,agentId)}
(async()=>{
 await rep.syncOneTap();
 const req=await lan.open(JSON.parse(sent.p),key,companyId,agentId);
 assert.equal(req.kind,'operations');assert.equal(req.operations.length,0,'pull updates must work with zero new operations');
 const ack=await ackFor(req);
 await rep.onLocalSyncResult(JSON.stringify({data:JSON.stringify(ack)}));
 assert.equal(rep.state.items[0].units[0].salePrice,4);
 assert.equal(rep.state.accounts[0].name,'Customer Updated');
 assert.equal(rep.state.stock.i1,13);assert.equal(rep.state.exchangeRate,16000);
 assert.equal(rep.state.ops.length,0);assert.equal(rep.state.lastSyncSummary.itemsChanged,1);
 assert.equal(rep.state.lastSyncSummary.accountsChanged,1);assert.equal(rep.state.lastSyncSummary.stockChanged,1);
 assert.equal(rep.state.lastSyncSummary.confirmed,0);
 assert(rep.state.lastSyncAt);assert.equal(saves,1);
 assert(rep.lanSyncMessage.includes('الاتجاهين'));
 await rep.syncOneTap();const req2=await lan.open(JSON.parse(sent.p),key,companyId,agentId);
 await rep.onLocalSyncResult(JSON.stringify({data:JSON.stringify(await ackFor(req2))}));
 assert.equal(rep.state.lastSyncSummary.itemsChanged,0);assert.equal(rep.state.lastSyncSummary.accountsChanged,0);
 const old=JSON.stringify(rep.state);saveFails=true;
 await rep.syncOneTap();const req3=await lan.open(JSON.parse(sent.p),key,companyId,agentId);
 await rep.onLocalSyncResult(JSON.stringify({data:JSON.stringify(await ackFor(req3,{price:20}))}));
 assert.equal(JSON.stringify(rep.state),old,'failed database write must revert all changes');
 assert(rep.lanSyncMessage.includes('لم تكتمل'));
 await rep.syncOneTap();const req4=await lan.open(JSON.parse(sent.p),key,companyId,agentId);
 const bad=await lan.pack({kind:'sync_result',companyId,agentId,requestNonce:req4.nonce,knownIds:[],catalog:{...catalog(),warehouseId:'wh_different'}},key,companyId,agentId);
 await rep.onLocalSyncResult(JSON.stringify({data:JSON.stringify(bad)}));
 assert.equal(JSON.stringify(rep.state),old,'wrong warehouse update must be rejected');
 const lanUi=fs.readFileSync('field_agent/src/main/assets/www/static/agent-lan-ui.js','utf8');
 const exp=fs.readFileSync('field_agent/src/main/assets/www/static/agent-experience.js','utf8');
 assert(!lanUi.includes('Agent.renderHome='),'LAN wrapper must not put another sync button on homepage');
 assert(!exp.includes('<strong>مزامنة الإدارة</strong>'),'homepage quick tile removed');
 assert(lanUi.includes('original()'),'manual file-based fallback retained');
 assert(lanUi.includes('this.lanSyncBusy'),'busy state displayed');
 console.log('PASS: zero-operation pull, refreshed prices/accounts/stock, summary, idempotent re-pull, failure rollback, warehouse binding, homepage de-duplication.');
})().catch(e=>{console.error(e);process.exitCode=1});
