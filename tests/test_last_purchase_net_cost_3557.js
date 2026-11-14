const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const modPath=path.resolve('app/src/main/assets/www/static/purchase-cost-engine.js');
const html=fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const h=require(modPath).PurchaseCostEngine;
assert(h&&html.includes('static/purchase-cost-engine.js'));
assert.match(html,/async saveState\(\)\s*\{[\s\S]{0,460}PurchaseCostEngine.refresh\(State.items, State.invoices\)/);
function item(){return {id:'it1',currency:'USD',units:[{factor:1,costPrice:10},{factor:6,costPrice:10/6}]};}
const it=item(),items=[it];
const first={id:'p1',date:'2026-11-01T09:00:00',currency:'USD',exchangeRate:15000,type:'purchase',rows:[{itemId:'it1',qty:2,unitFactor:1,price:20,total:40},{itemId:'it2',qty:1,unitFactor:1,price:60,total:60}],subTotal:100,discountAmount:10,taxAmount:20};
// 40 * (1+ (20-10)/100) / 2 = 22 USD/base unit.
let invoices=[first];assert.equal(h.refresh(items,invoices),2);assert.equal(it.units[0].costPrice,22);assert.equal(it.units[1].costPrice,3.666667);
assert.equal(it.costBeforePurchases,10);
const second={id:'p2',date:'2026-11-10T09:00:00',currency:'SYP',exchangeRate:10000,type:'purchase',rows:[{itemId:'it1',qty:12,unitFactor:6,total:240000}],discountAmount:40000,taxAmount:20000};
invoices.push(second);h.refresh(items,invoices);
assert.equal(it.units[0].costPrice,11); // 220000 SYP /10000 = 22 USD /2 base
assert.equal(it.units[1].costPrice,1.833333);
second.discountAmount=0;h.refresh(items,invoices);assert.equal(it.units[0].costPrice,13);
second.type='purchase_return';h.refresh(items,invoices);assert.equal(it.units[0].costPrice,22);
invoices=[];h.refresh(items,invoices);assert.equal(it.units[0].costPrice,10);assert.equal(it.units[1].costPrice,1.666667);assert.equal(it.lastPurchaseCostSource,undefined);
// Ignore sales and invoice paid amounts, do not alter unrelated unit prices or sale price fields.
const other={id:'other',currency:'USD',units:[{factor:1,costPrice:9,salePrice:15}]};
h.refresh([other],[{...first,type:'sale'}]);assert.equal(other.units[0].costPrice,9);assert.equal(other.units[0].salePrice,15);
// Old rows without unitFactor are base-unit purchases.
const legacy={...first,rows:[{itemId:'it1',qty:2,total:50}],discountAmount:0,taxAmount:0};
const copy=item();h.refresh([copy],[legacy]);assert.equal(copy.units[0].costPrice,25);
// Multiple rows of same material share one weighted purchase price.
const dup={...first,rows:[{itemId:'it1',qty:1,unitFactor:1,total:10},{itemId:'it1',qty:3,unitFactor:1,total:90}],discountAmount:0,taxAmount:0};
const twice=item();h.refresh([twice],[dup]);assert.equal(twice.units[0].costPrice,25);
// Empty histories leave manually entered costs unchanged.
const untouched=item();h.refresh([untouched],[]);assert.equal(untouched.units[0].costPrice,10);
console.log('PASS: latest purchase net unit costs, allocation, FX, edits, deletion, older row and legacy baseline');
