// Targeted smoke tests of the actual shipped financial functions; no demo records installed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const start = html.indexOf('const Accounting = {');
const end = html.indexOf('const AppNav = {',start);
assert(start>=0 && end>start,'Accounting engine must be present');
const source = html.slice(start,end);
const State = {
 settings:{exchangeRate:15000},
 items:[{id:'A',openingStockBase:10}],
 invoices:[], vouchers:[],accounts:[{id:'C',type:'customer',openingSyp:0,openingUsd:0}]
};
const sandbox={State,console};
vm.createContext(sandbox);
vm.runInContext(source+'\n globalThis.Accounting=Accounting;',sandbox);
const a=sandbox.Accounting;
assert.equal(a.round(12.345,'USD'),12.35);
assert.equal(a.round(1499.9,'SYP'),1500);
assert.equal(a.convert(2,'USD','SYP',15000),30000);
assert.equal(a.convert(30000,'SYP','USD',15000),2);
assert.equal(a.parseNum('۱۲۳'),123);
assert.equal(a.parseNum('١٢٣'),123);
assert.equal(a.getItemBaseStock('A'),10);
State.invoices.push({id:'sale',type:'sale',date:'2026-11-11',accountId:'C',netTotal:10,paidAmount:4,currency:'USD',exchangeRate:15000,number:1,rows:[{itemId:'A',qty:2,unitFactor:1}]});
assert.equal(a.getItemBaseStock('A'),8);
assert.equal(a.getItemBaseStock('A','sale'),10);
let statement=a.getAccountStatement('C');
assert.equal(statement.usdBalance,6);
State.vouchers.push({id:'receipt',type:'receipt',accountId:'C',amount:6,currency:'USD',date:'2026-11-11T12:00:00',exchangeRate:15000,number:1});
statement=a.getAccountStatement('C');
assert.equal(statement.usdBalance,0);
console.log('PASS: Accounting conversions, currency rounding, Arabic digits, stock updates, invoice and receipt balance.');
