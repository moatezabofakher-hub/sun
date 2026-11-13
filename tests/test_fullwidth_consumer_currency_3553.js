'use strict';
const fs=require('fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const read=x=>fs.readFileSync(x,'utf8');
const main=read('app/src/main/assets/www/index.html');
const field=read('field_agent/src/main/assets/www/static/agent-invoice-parity.js');
const mainCss=read('app/src/main/assets/www/static/glossy-ui-3549.css');
const fieldCss=read('field_agent/src/main/assets/www/static/glossy-ui-3549.css');
const managerSync=read('app/src/main/assets/www/static/field-main.js');
const nativePdf=read('app/src/main/java/com/sunshine/accounting/ReportPdfRenderer.java');
const fieldPrint=read('field_agent/src/main/assets/www/static/agent-print-parity.js');
// Navigation layouts use every available tab cell, not a centered width-limited row.
assert.equal((mainCss.match(/3\.5\.53: full-edge navigation/g)||[]).length,1);
assert.equal((fieldCss.match(/3\.5\.53: fill dock from edge/g)||[]).length,1);
assert.match(mainCss,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
assert.match(mainCss,/max-width:none!important;height:60px/);
assert.match(mainCss,/font-size:29px!important/);
assert.match(fieldCss,/left:0;right:0;width:100%;max-width:none/);
assert.match(fieldCss,/flex:1 1 0/);
assert.match(fieldCss,/width:44px;height:43px;font-size:34px/);
// Independent additional price level, with legacy fallback and propagated rep catalog.
assert.match(main,/id="itmConsumerPrice"/);
assert.match(main,/id="unitConsumer_\$\{idx\}"/);
assert.match(main,/<option value="consumer"/);
assert.match(managerSync,/consumerPrice:/);
assert.match(managerSync,/priceTier:\['wholesale','center','consumer'\]/);
assert.match(field,/tier==='consumer'/);
const start=main.indexOf('itemCostPrice(item,unit) {');
const end=main.indexOf('// Double-Entry Account Statement',start);
assert(start>=0&&end>start);
const state={items:[],accounts:[{id:'consumer',priceTier:'consumer'},{id:'wholesale',priceTier:'wholesale'}],settings:{exchangeRate:1}};
const calc=new Function('State',`return ({convert(v){return Number(v)},roundDerivedItemPrice(v){return Number(v)},${main.slice(start,end).trim()}});`)(state);
const item={id:'itm',currency:'USD',units:[{name:'حبة',factor:1,costPrice:3,salePrice:7,centerPrice:9,consumerPrice:12}]};
assert.equal(calc.itemSalePrice(item,item.units[0],'consumer'),12);
assert.equal(calc.itemSalePrice(item,item.units[0],'wholesale'),7);
assert.equal(calc.itemSalePrice(item,item.units[0],null,'center'),9);
const oldItem={...item,units:[{...item.units[0],consumerPrice:undefined}]};
assert.equal(calc.itemSalePrice(oldItem,oldItem.units[0],'consumer'),9,'Legacy consumer price defaults to center');
// Invoice currency is the only ledger printed; verify main preview, thermal, native PDF and field thermal.
assert.match(main,/const balanceCurrency = inv\.currency === 'SYP' \? 'SYP' : 'USD'/);
assert.match(main,/dual\.before\[balanceCurrency\]/);
assert.match(main,/dual\.after\[balanceCurrency\]/);
assert.match(main,/dualFmt\(dual\.before\[inv\.currency\],inv\.currency\)/);
assert.match(main,/dualFmt\(dual\.after\[inv\.currency\],inv\.currency\)/);
assert(!main.includes("['USD','SYP'].map(c=>`<div class=\"flex justify-between items-center text-sm sm:text-base font-bold\""));
assert.match(main,/previousBalances:\{\[currency\]:prev\},finalBalances:\{\[currency\]:final\}/);
assert.match(nativePdf,/beforeBalances\.has\(currency\)/);
assert.match(nativePdf,/afterBalances\.has\(currency\)/);
assert(!nativePdf.includes('for (String balanceCurrency : new String[]{"USD", "SYP"})'));
assert.match(fieldPrint,/const c=inv\.currency==='SYP'\?'SYP':'USD';/);
assert(!fieldPrint.includes("for(const c of ['USD','SYP'])drawTotalRow"));
const env={};vm.runInNewContext(read('app/src/main/assets/www/static/invoice-dual-balances.js'),env);
for(const currency of ['USD','SYP']){
 const result=env.InvoiceDualBalances.pair({USD:90,SYP:1000},{kind:'sale',currency,netTotal:10,paidAmount:0});
 assert.equal(result.after[currency],(currency==='USD'?90:1000)+10);
 assert.equal(result.after[currency==='USD'?'SYP':'USD'],currency==='USD'?1000:90);
}
console.log('PASS 3.5.53: edge-to-edge tabs; consumer price tiers; invoice-currency-only balances on all print paths');
