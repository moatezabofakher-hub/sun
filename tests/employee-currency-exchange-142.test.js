'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const mobile=path.resolve(__dirname,'../app/src/main/assets/www/static');
const agent=path.resolve(__dirname,'../field_agent/src/main/assets/www/static');
const Fx=require(path.join(mobile,'ta-currency-exchange-142.js'));
const Protocol=require(path.join(agent,'field-protocol.js'));
const operation=(n,from,to,spent,received,time)=>({
 id:'op_'+n.repeat(32),kind:'currency_exchange',companyId:'company_1',agentId:'employee_1',warehouseId:'warehouse_1',
 localNumber:'FX-'+n,date:time,currency:from,exchangeRate:15000,
 fromCurrency:from,toCurrency:to,fromAmount:spent,toAmount:received,note:'تصريف'
});
test('Authenticated field FX operation is not a customer receipt, expense or invoice',()=>{
 const op=operation('a','SYP','USD',15000000,1000,'2026-11-17T11:00:00.000Z');
 const validated=Protocol.validateOps([op],op.agentId,op.companyId,op.warehouseId,[],[]);
 assert.equal(validated[0].kind,'currency_exchange');
 const docs=Protocol.toLedgerDocuments(validated,{id:op.agentId,name:'موظف اختبار'},0,0);
 assert.equal(docs.fxTrades.length,1);
 assert.deepEqual([docs.invoices.length,docs.vouchers.length,docs.expenses.length],[0,0,0]);
 for(const candidate of [{...op,toCurrency:'SYP'},{...op,toCurrency:'EUR'},
   {...op,fromAmount:15000000.25},{...op,accountId:'customer_fake'}]){
   assert.throws(()=>Protocol.validateOps([candidate],op.agentId,op.companyId,op.warehouseId,[],[]));
 }
});
test('Manager commits only funded employee FX and keeps it out of manager cash',()=>{
 const state={settings:{primaryCurrency:'USD',secondaryCurrency:'SYP',primaryOnlyMode:false},fxTrades:[]};
 const manager={};
 const cash={summary:scope=>{
  const rows=Fx.cashMovements(state,scope);
  const balance=currency=>rows.filter(r=>r.currency===currency).reduce((s,r)=>s+r.inflow-r.outflow,0);
  return {sypCash:15000000+balance('SYP'),usdCash:balance('USD')};
 }};
 const context=vm.createContext({FieldSync:manager,State:state,FieldCash:cash,TiqanyFxLedger:Fx,globalThis:null});
 context.globalThis=context;
 vm.runInContext(fs.readFileSync(path.join(mobile,'ta-field-fx-142.js'),'utf8'),context);
 const who={id:'employee_1',name:'موظف اختبار'};
 manager.postFxTrades(who,{fxTrades:[operation('a','SYP','USD',15000000,1000,'2026-11-17T11:00:00.000Z')]});
 assert.equal(cash.summary('employee_1').usdCash,1000);
 assert.equal(Fx.cashMovements(state,'office').length,0);
 assert.throws(()=>manager.postFxTrades(who,{fxTrades:[operation('b','USD','SYP',1001,16000000,'2026-11-17T11:30:00.000Z')]}),/غير كاف/);
 assert.throws(()=>manager.postFxTrades(who,{fxTrades:[operation('a','SYP','USD',15000000,1000,'2026-11-17T11:00:00.000Z')]}),/مكررة/);
 manager.postFxTrades(who,{fxTrades:[operation('c','USD','SYP',1000,16000000,'2026-11-17T12:00:00.000Z')]});
 assert.equal(Fx.profit(state),62.5);
});
test('Employee home and cash views expose FX without a phantom voucher',()=>{
 const script=fs.readFileSync(path.join(agent,'ta-agent-fx-142.js'),'utf8');
 const view=fs.readFileSync(path.join(mobile,'ta-currency-exchange-ui-142.js'),'utf8');
 assert.match(script,/تصريف عملة/);
 assert.match(script,/op_.*FieldProtocol.uuid/);
 assert.match(script,/snapshotIds/);
 assert.match(view,/أرباح التصريف/);
});
