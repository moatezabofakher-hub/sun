'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const isWindows=fs.existsSync(path.join(root,'upgrade-125'));
const core=require(isWindows?path.join(root,'upgrade-125/ta-currency-exchange-core-142.js'):
 path.join(root,'app/src/main/assets/www/static/ta-currency-exchange-core-142.js'));
const fx=(id,fromCurrency,toCurrency,fromAmount,toAmount,equivalentSyp,date='2026-11-17T12:00:00Z')=>
 ({id,date,fromCurrency,toCurrency,fromAmount,toAmount,equivalentSyp});
test('Two currency legs post once and keep negative/positive signed amounts',()=>{
 const a=fx('fx_test_1001','SYP','USD',15000000,1000,15000000);
 const result=core.analyze([a]);
 assert.equal(result.movements.length,2);
 assert.deepEqual(result.movements.map(m=>[m.currency,m.inflow,m.outflow]),
 [['SYP',0,15000000],['USD',1000,0]]);
 assert.deepEqual(core.balances({SYP:20000000,USD:0},[a],'office'),{SYP:5000000,USD:1000});
});
test('Weighted average uses quantities and recognizes realized gain/loss, not principal',()=>{
 const xs=[
  fx('fx_test_2001','SYP','USD',14000000,1000,14000000,'2026-11-15T12:00:00Z'),
  fx('fx_test_2002','SYP','USD',32000000,2000,32000000,'2026-11-16T12:00:00Z'),
  fx('fx_test_2003','USD','SYP',1000,17000000,17000000,'2026-11-17T12:00:00Z')
 ];
 const result=core.analyze(xs);
 assert.ok(Math.abs(result.byId.get('fx_test_2003').averageCostSyp-(46000000/3000))<0.0001);
 assert.ok(Math.abs(result.byId.get('fx_test_2003').gainSyp-(17000000-46000000/3))<0.01);
 assert.ok(Math.abs(result.profitSyp-(17000000-46000000/3))<0.01);
 assert.equal(result.holdings.USD.quantity,2000);
});
test('Selling without documented purchase cost never invents profit',()=>{
 const result=core.analyze([fx('fx_test_3001','USD','SYP',100,1600000,1600000)]);
 assert.equal(result.byId.get('fx_test_3001').gainSyp,null);
 assert.equal(result.profitSyp,0);
 assert.equal(result.unknownCostCount,1);
});
test('Enforce unique IDs, positive amounts, different currencies, and enabled codes',()=>{
 const a=fx('fx_test_4001','SYP','USD',1000000,100,1000000);
 assert.throws(()=>core.analyze([a,a]),/تكرار/);
 assert.throws(()=>core.prepare({...a,toCurrency:'SYP'}),/مختلفتين/);
 assert.throws(()=>core.prepare({...a,fromAmount:-1}),/غير صالح/);
 assert.throws(()=>core.prepare({...a,toCurrency:'EUR'},['SYP','USD']),/غير مفعلة/);
});
test('Exchange profit separated by staff scope without duplicating office cash',()=>{
 const a=fx('fx_test_5001','SYP','USD',1500000,100,1500000);
 const b={...fx('fx_test_5002','SYP','USD',400000,25,400000),'agentId':'agent_1'};
 const all=core.analyze([a,b],'all'),office=core.analyze([a,b],'office'),staff=core.analyze([a,b],'agent_1');
 assert.equal(all.movements.length,4);
 assert.equal(office.movements.length,2);
 assert.equal(staff.movements.length,2);
});
test('Manager, solo and employee UI files are present in the corresponding mobile repository',()=>{
 if(isWindows){
  for(const f of ['apply-currency-exchange-142.cjs','ta-currency-exchange-ui-142.js','ta-windows-fx-agent-sync-142.js'])
   assert.ok(fs.existsSync(path.join(root,'upgrade-125',f)),f);
 }else{
  for(const f of ['ta-currency-exchange-ui-142.js','ta-currency-exchange-core-142.js']){
   assert.ok(fs.existsSync(path.join(root,'app/src/main/assets/www/static',f)),f);
  }
 }
});

test('Two directors importing the same employee FX transaction converge with no duplicate gain',()=>{
 const merge=require(isWindows?path.join(root,'upgrade-125/tiqany-peer-merge-133.js'):
   path.join(root,'app/src/main/assets/www/static/tiqany-peer-merge.js'));
 const ledger={settings:{companyName:'شركة'},categories:[],items:[],accounts:[],invoices:[],vouchers:[],
   warehouses:[{id:'wh_main',name:'الرئيسي'}],transfers:[],expenses:[],capitalMovements:[],
   shareholderOwners:[],shareholderMovements:[],currencyExchanges:[],fieldSync:{agents:[],imported:[],events:[]}};
 const base=merge.snapshot(ledger),phone=JSON.parse(JSON.stringify(base)),desktop=JSON.parse(JSON.stringify(base));
 const original=fx('op_'+'a'.repeat(32),'SYP','USD',1500000,100,1500000);
 const origin={agentId:'agent_123',operationId:original.id,localNumber:'FX-1',agentName:'الموظف',receivedAt:'2026-11-17T10:00:00Z'};
 phone.currencyExchanges=[{...original,agentId:'agent_123',source:'agent',note:'',fieldOrigin:origin}];
 desktop.currencyExchanges=[{...phone.currencyExchanges[0],fieldOrigin:{...origin,receivedAt:'2026-11-17T11:00:00Z'}}];
 const result=merge.merge(base,phone,desktop);
 assert.equal(result.ok,true,JSON.stringify(result.conflicts||[]));
 assert.equal(result.snapshot.currencyExchanges.length,1);
 assert.equal(core.analyze(result.snapshot.currencyExchanges).movements.length,2);
});

test('Partially uncosted FX sale realizes only profit for known prior lots and never reuses them',()=>{
 const rows=[
   fx('fx_partial_001','SYP','USD',1500000,100,1500000,'2026-11-14T11:00:00Z'),
   fx('fx_partial_002','USD','SYP',150,2550000,2550000,'2026-11-15T11:00:00Z'),
   fx('fx_partial_003','USD','SYP',50,900000,900000,'2026-11-16T11:00:00Z')
 ];
 const result=core.analyze(rows);
 assert.equal(result.byId.get('fx_partial_002').gainSyp,200000);
 assert.equal(result.byId.get('fx_partial_002').costOfSoldSyp,1500000);
 assert.equal(result.byId.get('fx_partial_002').coveredAmount,100);
 assert.equal(result.byId.get('fx_partial_002').uncoveredAmount,50);
 assert.equal(result.byId.get('fx_partial_003').gainSyp,null);
 assert.equal(result.unknownCostCount,2);
 assert.equal(result.holdings.USD.quantity,0);
 assert.equal(result.profitSyp,200000);
});


test('Editing the same FX operation replaces its cash legs and recomputes profit exactly once',()=>{
 const purchase=fx('fx_edit_1001','SYP','USD',1500000,100,1500000,'2026-11-14T11:00:00Z');
 const sale=fx('fx_edit_1002','USD','SYP',80,1600000,1600000,'2026-11-15T11:00:00Z');
 const before=core.analyze([purchase,sale]);
 assert.equal(before.byId.get(sale.id).gainSyp,400000);
 const revised={...sale,fromAmount:90,toAmount:1800000,equivalentSyp:1800000};
 const after=core.analyze([purchase,revised]);
 assert.equal(after.movements.length,4);
 assert.equal(after.byId.size,2);
 assert.equal(after.byId.get(sale.id).gainSyp,450000);
 assert.equal(after.holdings.USD.quantity,10);
 assert.deepEqual(core.balances({SYP:3000000,USD:0},[purchase,revised]),{SYP:3300000,USD:10});
});
test('FX user interface contains editable operation and per-currency trading totals',()=>{
 const uiFile=isWindows?path.join(root,'upgrade-125/ta-currency-exchange-ui-142.js'):
   path.join(root,'app/src/main/assets/www/static/ta-currency-exchange-ui-142.js');
 const ui=fs.readFileSync(uiFile,'utf8');
 assert.match(ui,/TiqanyFxUI\.edit/);
 assert.match(ui,/taFxEditId/);
 assert.match(ui,/إجمالي المبالغ المتداولة حسب العملة/);
 assert.match(ui,/costOfSoldSyp/);
 assert.doesNotThrow(()=>new Function(ui));
});
