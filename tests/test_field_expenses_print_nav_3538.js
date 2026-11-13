'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const FieldProtocol=require('../app/src/main/assets/www/static/field-protocol.js');
const companyId='company_9876543210',agentId='agent_9876543210',warehouseId='wh_car_8';
const op={id:'op_9876543210123',kind:'expense',agentId,companyId,warehouseId,localNumber:'E-1',
 date:'2026-11-13T12:00:00Z',currency:'USD',exchangeRate:15000,category:'نقل ومحروقات',amount:7.50,note:'وقود سيارة'};
const items=[],accounts=[{id:'c1',name:'عميل',type:'customer'}];
const [valid]=FieldProtocol.validateOps([op],agentId,companyId,warehouseId,items,accounts);
assert.equal(valid.category,'نقل ومحروقات');
assert.throws(()=>FieldProtocol.validateOps([{...op,accountId:'c1'}],agentId,companyId,warehouseId,items,accounts),/لا يُربط/);
assert.throws(()=>FieldProtocol.validateOps([{...op,category:''}],agentId,companyId,warehouseId,items,accounts),/نوع المصروف/);
const docs=FieldProtocol.toLedgerDocuments([valid],{id:agentId,name:'أحمد',warehouseId},0,0);
assert.equal(docs.vouchers.length,0);assert.equal(docs.invoices.length,0);assert.equal(docs.expenses.length,1);
assert.equal(docs.expenses[0].fieldOrigin.agentName,'أحمد');
let failSave=false;
const state={settings:{companyName:'SAN SHINE',companyPhone:'0933333333',exchangeRate:15000,allowNegativeStockSales:false},license:{isActivated:true,opsUsedCount:0},
 fieldSync:{companyId,agents:[{id:agentId,name:'أحمد',warehouseId,key:FieldProtocol.b64u(crypto.randomBytes(32))}],imported:[],events:[],operationHistory:[],cashTransfers:[]},
 items,accounts,categories:[],invoices:[],vouchers:[],expenses:[],transfers:[],warehouses:[]};
const managerCtx={State:state,FieldProtocol,console,window:{},StorageEngine:{saveState:async()=>{if(failSave)throw Error('disk full');}},
 Accounting:{getItemBaseStock:()=>0,getAccountStatement:()=>({sypBalance:0,usdBalance:0})},UI:{forceCloseModal(){},toast(){}},AppEscape:{text:String},WarehouseController:{name:String},LicenseManager:{MAX_TRIAL_OPS:100},Date,Map,Set,Array,Object,JSON,Number,String,Promise};
managerCtx.window=managerCtx;vm.createContext(managerCtx);
for(const f of ['field-main.js','field-cash.js'])vm.runInContext(fs.readFileSync('app/src/main/assets/www/static/'+f,'utf8'),managerCtx,{filename:f});
const manager=vm.runInContext('FieldSync',managerCtx);const cash=managerCtx.FieldCash;
const close=(a,b)=>assert.ok(Math.abs(a-b)<0.001,`${a} !== ${b}`);
(async()=>{
  // Fund the agent via a posted cash sale then deduct only from their own till.
  state.invoices.push({id:'inv1',type:'sale',date:'2026-11-13T09:00:00Z',currency:'USD',accountId:'',paidAmount:20,fieldOrigin:{agentId,agentName:'أحمد'}});
  close(cash.summary(agentId).usdCash,20);
  assert.equal(await manager.commitLanOperations(state.fieldSync.agents[0],[valid]),1);
  close(cash.summary(agentId).usdCash,12.5);
  close(cash.summary('office').usdCash,0);
  close(cash.summary('all').usdCash,12.5);
  assert.equal(state.vouchers.length,0,'no customer vouchers should be produced for expenses');
  assert.equal(state.expenses[0].fieldOrigin.operationId,valid.id);
  assert.equal(manager.historyFor(state.fieldSync.agents[0]).filter(x=>x.kind==='expense').length,1);
  assert.equal(await manager.commitLanOperations(state.fieldSync.agents[0],[valid]),0,'idempotent retry');
  assert.equal(state.expenses.length,1);
  failSave=true;
  const op2={...valid,id:'op_9876543210124',amount:1};
  await assert.rejects(manager.commitLanOperations(state.fieldSync.agents[0],[op2]),/disk full/);
  assert.equal(state.expenses.length,1,'rollback expense on failed storage write');
  assert.equal(state.fieldSync.imported.length,1,'do not acknowledge uncommitted expense');
  console.log('PASS 3.5.38: expenses post once to agent till, not office or customer, archive and rollback atomically');
})().catch(e=>{console.error(e);process.exitCode=1;});

// Isolated Android-WebView-like agent exercise (no network, no phone required).
const capturedText=[],printed=[],drawnLogos=[];
class FakeCanvas{
 constructor(){this.width=0;this.height=0;this.context={fillStyle:'',font:'',textBaseline:'',direction:'',textAlign:'',
  fillRect(){},fillText(t){capturedText.push(String(t));},measureText(t){return {width:String(t).length*7};},
  drawImage(){drawnLogos.push(true);},beginPath(){},setLineDash(){},moveTo(){},lineTo(){},stroke(){},
  getImageData:()=>({data:new Uint8ClampedArray(this.width*this.height*4).fill(255)})};}
 getContext(){return this.context;}
}
const fields={eCategory:{value:'نقل ومحروقات'},eCurrency:{value:'USD'},eAmount:{value:'3.50'},eDate:{value:'2026-11-13'},eNote:{value:'وقود الرحلة'},
 agentDialog:{classList:{contains:()=>true,add(){},remove(){}}},dialogTitle:{},dialogMessage:{},dialogAccept:{},agentDialogCancel:{}};
const doc={getElementById:id=>fields[id]||null,addEventListener(){},querySelectorAll:()=>[],fonts:{ready:Promise.resolve()},createElement:()=>new FakeCanvas()};
const agentCtx={FieldProtocol,console,window:{AndroidPrinter:{printBase64:raw=>printed.push(Buffer.from(raw,'base64'))}},
 document:doc,history:{pushState(){}},Date,Math,Number,Array,Object,JSON,Promise,Set,Map,Uint8Array,Uint8ClampedArray,
 Image:class{constructor(){this.width=100;this.height=80;}set src(v){this.onload?.();}},
 btoa:raw=>Buffer.from(raw,'binary').toString('base64')};
agentCtx.window=agentCtx;
agentCtx.AndroidPrinter={printBase64:raw=>printed.push(Buffer.from(raw,'base64'))};
agentCtx.addEventListener=()=>{};vm.createContext(agentCtx);
for(const file of ['agent.js','agent-experience.js','agent-invoice-parity.js','agent-cash-history.js','agent-expenses.js','agent-print-parity.js']){
 vm.runInContext(fs.readFileSync('field_agent/src/main/assets/www/static/'+file,'utf8'),agentCtx,{filename:file});
}
const A=vm.runInContext('Agent',agentCtx);
(async()=>{
 A.state={...A.blank,companyId,agentId,warehouseId,companyName:'SAN SHINE',companyPhone:'0933333333',companyLogo:'data:image/png;base64,AAAA',
  accountBalanceBefore:12,accountBalanceAfter:16,agentCash:{usdCash:20,sypCash:0},
  accounts:[{id:'c1',name:'زبون',type:'customer',usdBalance:25,sypBalance:0}],ops:[],knownIds:[],snapshotIds:[],exchangeRate:15000};
 A.active=async()=>true;A.save=async()=>{};A.show=async(route)=>{A.screen=route;};A.toast=()=>{};A.scheduleAutoSync=()=>{};
 assert.match(A.renderHome().slice(0,130),/صندوق المندوب/,'cashbox comes BEFORE greeting/actions');
 assert.equal(A.cashSummary().usd,20);
 A.stack=['home','expense'];A.screen='expense';await A.saveExpense();
 assert.equal(A.state.ops.length,1);assert.equal(A.state.ops[0].kind,'expense');assert.equal(A.state.ops[0].category,'نقل ومحروقات');
 assert.equal(A.cashSummary().usd,16.5,'pending expense reduces local field cash');
 assert.equal(A.balanceFor('c1').usd,25,'expense cannot change customer balance');
 assert.equal(A.screen,'ops');
 const invoice={id:'op_invoice_987654321',kind:'sale',accountId:'c1',localNumber:'F-1',
  date:'2026-11-13T10:00:00Z',currency:'USD',exchangeRate:15000,
  rows:[{itemName:'منظف',unitName:'علبة',qty:2,price:5,total:10}],subTotal:10,netTotal:10,paidAmount:6,
  accountBalanceBefore:12,accountBalanceAfter:16};
 A.state.ops.push(invoice);
 await A.printOp(invoice.id);
 assert.ok(capturedText.includes('0933333333'),'synced company phone in printed invoice');
 assert.ok(capturedText.includes('SAN SHINE'),'synced company name in printed invoice');
 assert.ok(capturedText.includes('رصيد قبل الفاتورة'));
 assert.ok(capturedText.includes('الرصيد النهائي'));
 assert.ok(capturedText.some(x=>x.includes('12.00')),'invoice-era previous balance');
 assert.ok(capturedText.some(x=>x.includes('16.00')),'invoice-era final balance');
 assert.ok(drawnLogos.length,'the synced logo was drawn onto receipt');
 assert.equal(printed.length,1);
 A.stack=['home','ops','cashbox'];A.screen='cashbox';await A.goBack();assert.equal(A.screen,'ops');
 await A.goBack();assert.equal(A.screen,'home');
 A.confirmAction=(title,message,cb)=>{A.lastDialog=title;A.dialogAction=cb;};
 await A.goBack();assert.equal(A.lastDialog,'تأكيد الخروج من التطبيق');
 assert.equal(A.screen,'home','home back cannot immediately terminate app');
 assert.match(fs.readFileSync('app/src/main/assets/www/index.html','utf8'),/bottomDestinations\.has\(screen\)/);
 console.log('PASS 3.5.38: agent form, top cashbox, saved balance labels, logo/phone printing, nested back and home exit prompt');
})().catch(e=>{console.error(e);process.exitCode=1;});
