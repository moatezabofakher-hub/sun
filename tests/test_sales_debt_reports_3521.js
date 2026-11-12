const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const a=html.indexOf('const LedgerReports = {');
const b=html.indexOf('const Views = {',a);
assert.ok(a>=0&&b>a);
const State={
 settings:{companyName:'شركة اختبار',exchangeRate:15000},
 items:[{id:'one',name:'صنف أول'},{id:'two',name:'صنف ثان'}],
 accounts:[{id:'a',name:'عميل'}, {id:'b',name:'مورد'}],
 invoices:[
  {type:'sale',date:'2026-11-13T10:30',currency:'USD',netTotal:27,rows:[
   {itemId:'one',itemName:'صنف أول',unitName:'عبوة',qty:2,total:20,price:10},
   {itemId:'two',itemName:'صنف ثان',unitName:'عبوة',qty:1,total:10,price:10}]},
  {type:'sale_return',date:'2026-11-13T12:30',currency:'USD',netTotal:9,rows:[
   {itemId:'one',itemName:'صنف أول',unitName:'عبوة',qty:1,total:9,price:9}]},
  {type:'sale',date:'2026-11-12T12:30',currency:'SYP',netTotal:3000,rows:[
   {itemId:'one',itemName:'صنف أول',unitName:'عبوة',qty:1,total:3000,price:3000}]},
  {type:'purchase',date:'2026-11-13T12:30',currency:'USD',netTotal:999,rows:[]}
 ]
};
const statements={a:{usdBalance:12,sypBalance:-2500},b:{usdBalance:-8,sypBalance:1000}};
const sandbox={State,console,Map,Date,JSON,Math,Number,String,Intl,
 Accounting:{round:(x,c)=>Math.round(x*(c==='USD'?100:1))/(c==='USD'?100:1),
  formatItemQuantity:q=>String(q),format:(n,c)=>String(n)+' '+c,
  getAccountStatement:id=>statements[id] },
 AppEscape:{text:x=>String(x).replace(/</g,'&lt;')},
 UI:{setHeader(){}},AppNav:{navigate(){}},ThermalPrinter:{printSummaryReport(){}}
};
vm.createContext(sandbox);
vm.runInContext(html.slice(a,b)+'\n globalThis.LedgerReports=LedgerReports;',sandbox);
const r=sandbox.LedgerReports;
const day=r.sales('custom','2026-11-13');
assert.equal(day.totals.USD,18,'returns and discount/tax allocation must reconcile');
assert.equal(day.invoiceTotals.USD,18);
assert.equal(day.items.length,2);
assert.equal(day.items.find(x=>x.id==='one').qty,1);
assert.equal(day.items.find(x=>x.id==='one').total,9);
assert.equal(day.items.find(x=>x.id==='two').total,9);
assert.equal(day.totals.SYP,0);
const all=r.sales('all');
assert.equal(all.totals.SYP,3000,'preserve original currencies');
assert.equal(all.totals.USD,18);
const range=r.sales('range','2026-11-13','2026-11-14');
assert.equal(range.totals.SYP,0);
assert.equal(range.totals.USD,18);
const debit=r.debts('debit'),credit=r.debts('credit');
assert.equal(debit.totals.USD,12);
assert.equal(debit.totals.SYP,1000);
assert.equal(credit.totals.USD,8);
assert.equal(credit.totals.SYP,2500);
assert.ok(html.includes('border-bottom:1.5px dashed'), 'thermal receipt visual dividers');
assert.ok(html.includes('ctx.setLineDash([4, 6])'), 'thermal raster row dividers');
assert.ok(html.includes('profile_registry'), 'profile metadata maintained in IndexedDB');
assert.ok(html.includes('profileId: typeof ProfileManager'), 'backup holds profile identification');
console.log('PASS: Invoice totals reconcile with discounts, tax and returns; units/currencies isolated; debt sides and profile backup metadata.');
