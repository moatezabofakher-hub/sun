'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const base=path.resolve(__dirname,'../app/src/main/assets/www');
const FX=require(path.join(base,'static/ta-currency-exchange-142.js'));
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const ui=fs.readFileSync(path.join(base,'static/ta-currency-exchange-ui-142.js'),'utf8');
test('15,000,000 SYP buys 1,000 USD: exactly two opposing cash postings, not income',()=>{
 const s={settings:{primaryCurrency:'USD',secondaryCurrency:'SYP'},fxTrades:[]};
 const buy=FX.record(s,{fromCurrency:'SYP',toCurrency:'USD',fromAmount:15000000,toAmount:1000,at:'2026-11-17T12:00:00.000Z'},15000000);
 assert.equal(buy.profitUSD,0);
 assert.equal(FX.cashMovements(s).length,2);
 assert.deepEqual(FX.cashMovements(s).map(p=>[p.currency,p.inflow,p.outflow]),[['SYP',0,15000000],['USD',1000,0]]);
 const sale=FX.record(s,{fromCurrency:'USD',toCurrency:'SYP',fromAmount:1000,toAmount:16000000,at:'2026-11-17T13:00:00.000Z'},1000);
 assert.equal(sale.averageCost,15000);
 assert.equal(sale.profitSyp,1000000);
 assert.equal(sale.profitUSD,62.5);
 assert.equal(FX.profit(s),62.5);
 const postings=FX.cashMovements(s),sum=c=>postings.filter(p=>p.currency===c).reduce((a,p)=>a+p.inflow-p.outflow,0);
 assert.equal(sum('SYP'),1000000);assert.equal(sum('USD'),0);
});
test('Arithmetic average of historical purchase prices is used; the new purchase does not alter a saved gain',()=>{
 const s={fxTrades:[]};
 FX.record(s,{fromCurrency:'SYP',toCurrency:'USD',fromAmount:15000,toAmount:1,at:'2026-11-01T00:00:00.000Z'},15000);
 FX.record(s,{fromCurrency:'SYP',toCurrency:'USD',fromAmount:34000,toAmount:2,at:'2026-11-02T00:00:00.000Z'},34000);
 const sold=FX.record(s,{fromCurrency:'USD',toCurrency:'SYP',fromAmount:1,toAmount:18000,at:'2026-11-03T00:00:00.000Z'},3);
 assert.equal(sold.averageCost,16000);
 assert.equal(sold.profitSyp,2000);
 FX.record(s,{fromCurrency:'SYP',toCurrency:'USD',fromAmount:19000,toAmount:1,at:'2026-11-04T00:00:00.000Z'},20000);
 assert.equal(sold.profitSyp,2000);
});
test('Trade posting rejects unfunded outflow, same currency, unsupported 3rd currency and invalid decimal',()=>{
 const s={fxTrades:[]};
 assert.throws(()=>FX.record(s,{fromCurrency:'SYP',toCurrency:'USD',fromAmount:200,toAmount:1},199),/غير كاف/);
 assert.throws(()=>FX.quote(s,{fromCurrency:'USD',toCurrency:'USD',fromAmount:1,toAmount:1}),/مختلفتين/);
 assert.throws(()=>FX.quote(s,{fromCurrency:'EUR',toCurrency:'USD',fromAmount:1,toAmount:1}),/غير مدعومة/);
 assert.throws(()=>FX.quote(s,{fromCurrency:'USD',toCurrency:'SYP',fromAmount:1.111,toAmount:100}),/العشرية/);
 assert.equal(s.fxTrades.length,0);
});
test('UI and persistent state are connected to the same ledger',()=>{
 assert.match(ui,/TiqanyFxExchange=Ctrl/);
 assert.match(ui,/تصريف عملة/);
 assert.match(html,/fxTrades: State\.fxTrades/);
 assert.match(html,/State\.fxTrades = Array\.isArray\(d\.fxTrades\)/);
 assert.match(html,/ta-currency-exchange-142\.js/);
 assert.match(html,/ta-currency-exchange-ui-142\.js/);
});
