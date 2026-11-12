// Regression coverage for the exact HTML/JS shipped in v3.5.10.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app/src/main/assets/www/index.html'), 'utf8');
const i18nSrc = fs.readFileSync(path.join(root, 'app/src/main/assets/www/static/i18n.js'), 'utf8');
function cut(start, end) {
 const i = html.indexOf(start), j = html.indexOf(end, i + start.length);
 assert.ok(i >= 0 && j > i, `${start}→${end}`);
 return html.slice(i,j);
}
let saved = 0, modal = '';
const elements = new Map();
const ui = {getElementById: id => elements.get(id) || null, activeElement: null};
const ctx = {console,Map,Set,Math,Number,Date,JSON,String,Array,Promise,Intl,
 document: ui,
 StorageEngine: {saveState:async()=>{saved++;}},
 LicenseManager: {canPerformOperation:()=>true, recordNewOperation:async()=>{}},
 UI: {toast:()=>{},openModal:html=>{modal=html;},forceCloseModal:()=>{}},
 AppNav: {renderCurrent:()=>{},markModalDirty:()=>{}}
};ctx.globalThis=ctx;
vm.runInNewContext(cut('const State =','const StorageEngine =') + '\n' + cut('const Accounting =','const AppNav =') + '\n' + cut('const ItemController =','        /********************************************************************\n         * MULTI-WAREHOUSE') + '\n' + i18nSrc + '\n' + 'globalThis.Test={State,Accounting,ItemController,I18n}', ctx, {timeout:7000});
const {State,Accounting,ItemController,I18n}=ctx.Test;
const input=(value)=>({value});
for (let decimals=0;decimals<=4;decimals++) {
  State.settings.itemQuantityDecimals=decimals;
  assert.equal(Accounting.itemPricePlaceholder(),decimals ? '0.' + '0'.repeat(decimals) : '0');
  const wanted=['12','12.3','12.34','12.345','12.3456'][decimals];
  assert.equal(Accounting.limitItemPriceInput('12.3456789'), wanted);
  assert.equal(Accounting.limitItemPriceInput('١٢٫٣٤٥٦'), wanted);
  const source=input('12.3456789');ui.activeElement=source;
  ItemController.tempUnits=[{name:'Box',factor:1,costPrice:0,salePrice:0},{name:'Piece',factor:3,costPrice:0,salePrice:0}];
  ItemController.selectedCurrency='SYP';
  ItemController.onUnitPriceInput(0,'salePrice',source.value,source);
  assert.equal(source.value,wanted);
  assert.equal(ItemController.tempUnits[0].salePrice,Number(wanted));
  assert.equal(ItemController.tempUnits[1].salePrice,Accounting.roundDerivedItemPrice(Number(wanted)/3));
  assert.equal(Accounting.formatEditableItemPrice(ItemController.tempUnits[0].salePrice),wanted);
  assert.ok(!html.includes('Accounting.round(num / factor, this.selectedCurrency)'));
}
State.settings.itemQuantityDecimals=4;
const source=input('0.0001');ui.activeElement=source;
ItemController.tempUnits=[{name:'Pack',factor:1,costPrice:0,salePrice:0}];
ItemController.selectedCurrency='USD';
ItemController.onUnitPriceInput(0,'costPrice',source.value,source);
assert.equal(ItemController.tempUnits[0].costPrice,0.0001,'4 decimals must survive item input');
ItemController.onUnitPriceInput(0,'salePrice','12.3456',input('12.3456'));
assert.equal(ItemController.tempUnits[0].salePrice,12.3456);
ItemController.addUnitRow();
assert.equal(ItemController.tempUnits[1].salePrice,1.0288,'derived prices are NOT USD rounded to cents');
assert.equal(ItemController.tempUnits[1].costPrice,0,'tiny values can round to 4 decimal places');
ItemController.updateUnitFactor(1,'100');
assert.equal(ItemController.tempUnits[1].salePrice,0.1235,'unit factor prices have 4 decimal places');
ItemController.selectedCurrency='SYP';
ItemController.onUnitPriceInput(0,'salePrice','5.4321',input('5.4321'));
assert.equal(ItemController.tempUnits[0].salePrice,5.4321,'SYP unit price must not be rounded to an integer');
assert.equal(ItemController.tempUnits[1].salePrice,0.0543);
const container={innerHTML:''};elements.set('itmUnitsContainer',container);
ItemController.openItemModal(); // empty item modal should advertise configured precision
assert.ok(modal.includes('عدد الخانات العشرية المسموح بها عند إدخال أسعار المواد:'));
assert.ok(modal.includes('>4</span>'));
assert.ok(modal.includes('id="itmMainSalePrice"'));
assert.ok(modal.includes('placeholder="0.0000"'));
assert.ok(container.innerHTML.includes('oninput="ItemController.onUnitPriceInput(0, \'salePrice\', this.value, this)"'));
// An existing price with more than the current display setting must retain its original value on unedited save.
State.settings.itemQuantityDecimals=2;
ItemController.tempUnits=[{name:'Pack',factor:1,costPrice:1.23456,salePrice:12.3456}];
ItemController.selectedCurrency='USD';
for (const [key,value] of Object.entries({itmName:'Item A',itmCat:'',itmOpenStock:'5',itmMinStock:'0',itmBarcode:'',unitName_0:'Pack',unitFactor_0:'1',unitCost_0:'1.23',unitSale_0:'12.35'})) elements.set(key,{value});
(async () => {
  assert.equal(await ItemController.saveItem(''),true);
  assert.equal(saved,1);
  assert.equal(State.items[0].units[0].costPrice,1.23456);
  assert.equal(State.items[0].units[0].salePrice,12.3456);
  // A new 4-decimal item saves 4 decimals even for SYP.
  State.settings.itemQuantityDecimals=4;
  ItemController.tempUnits=[{name:'Pack',factor:1,costPrice:0,salePrice:0}];
  ItemController.selectedCurrency='SYP';
  ItemController.onUnitPriceInput(0,'costPrice','1.2345',input('1.2345'));
  ItemController.onUnitPriceInput(0,'salePrice','12.3456',input('12.3456'));
  assert.equal(await ItemController.saveItem(''),true);
  assert.equal(State.items[1].units[0].costPrice,1.2345);
  assert.equal(State.items[1].units[0].salePrice,12.3456);
  assert.equal(Accounting.round(12.3456,'SYP'),12,'accounting total rounding stays unchanged');
  assert.equal(I18n.translate('عدد الخانات العشرية المسموح بها عند إدخال أسعار المواد:'),'Decimal places allowed when entering item prices:');
  console.log('PASS: new item price input accepts configured 0–4 decimals, both currencies, unit conversions, save preserves old prices');
})().catch(e=>{console.error(e);process.exit(1)});
