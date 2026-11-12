const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'app/src/main/assets/www/index.html'),'utf8');
const i18n=fs.readFileSync(path.join(root,'app/src/main/assets/www/static/i18n.js'),'utf8');
const cut=(a,b)=>{
  const i=html.indexOf(a),j=html.indexOf(b,i+a.length);
  assert.ok(i>=0&&j>i,`missing ${a} → ${b}`);
  return html.slice(i,j);
};
let saves=0, renders=0;
const els={
  itmName:{value:'Item A'},itmCat:{value:''},itmOpenStock:{value:'10'},itmMinStock:{value:'2'},itmBarcode:{value:''},
  unitName_0:{value:'Pack'},unitFactor_0:{value:'1'},
  // The inputs display 2 decimal places; saving must still preserve full model precision.
  unitCost_0:{value:'1.23'},unitSale_0:{value:'12.35'}
};
const ctx={console,Map,Set,Math,Number,Date,JSON,String,Array,Promise,Intl,
  StorageEngine:{saveState:async()=>{saves++;}},
  AppNav:{renderCurrent:()=>{renders++;}},
  UI:{forceCloseModal:()=>{},toast:()=>{}},
  LicenseManager:{canPerformOperation:()=>true,recordNewOperation:async()=>{}},
  document:{getElementById:id=>els[id]||null}
};ctx.globalThis=ctx;
const saveCode=cut('            async saveItem(existingId) {','\n            deleteItem(itemId) {');
vm.runInNewContext(cut('const State =','const StorageEngine =')+'\n'+cut('const Accounting =','const AppNav =')+'\n'+`const ItemController={tempUnits:[{name:'Pack',factor:1,costPrice:1.23456,salePrice:12.3456}],selectedCurrency:'USD',safePhotoData:()=>'',${saveCode}};`+ '\n'+i18n+'\nglobalThis.Test={State,Accounting,ItemController,I18n}',ctx,{timeout:7000});
const {State,Accounting,ItemController,I18n}=ctx.Test;
assert.equal(Accounting.formatItemQuantity(12.3456),'12.35');
assert.equal(Accounting.formatItemPriceNumber(12.3456),'12.35');
assert.equal(Accounting.formatItemPrice(12.3456,'USD'),'12.35 $');
assert.equal(Accounting.formatItemPrice(12.3456,'SYP'),'12.35 ل.س');
assert.equal(Accounting.formatEditableItemPrice(12.3456),'12.35');
assert.equal(Accounting.formatNumberOnly(12.3456,'USD'),'12.35');
assert.equal(Accounting.formatNumberOnly(12.3456,'SYP'),'12');
assert.equal(I18n.translate('عدد الخانات بعد الفاصلة العشرية للكميات والأسعار'),'Decimal places for quantities and prices');
for(const digits of [0,1,2,3,4]){
  State.settings.itemQuantityDecimals=digits;
  const target=['12','12.3','12.35','12.346','12.3456'][digits];
  assert.equal(Accounting.formatItemPriceNumber(12.3456),target);
  assert.equal(Accounting.formatEditableItemPrice(12.3456),target);
  assert.equal(Accounting.formatItemQuantity(12.3456),target);
}
State.settings.itemQuantityDecimals=2;
assert.ok(!html.slice(html.indexOf('renderItems(main, params = {})'),html.indexOf('renderWarehouses(main')).includes('Accounting.formatItemPrice(u.salePrice, item.currency)'), 'inventory cards now show stock only, while item editor retains full prices');
assert.ok(html.includes('Accounting.formatItemPrice(priceInInvCurr, d.currency)'), 'invoice grid should use formatter');
assert.equal((html.match(/Accounting\.formatItemPriceNumber\(r\.price\)/g)||[]).length,2,'both print views should use new price formatter');
assert.ok(html.includes('onfocus="this.value=InvoiceController.draft.rows[${idx}].price;this.select()"'));
assert.ok(html.includes('onblur="this.value=Accounting.formatEditableItemPrice(InvoiceController.draft.rows[${idx}].price)"'));
assert.ok(html.includes('costPrice: Accounting.parseNum(u.costPrice)'), 'item save must use raw model cost');
assert.ok(html.includes('salePrice: Accounting.parseNum(u.salePrice)'), 'item save must use raw model sale price');
(async()=>{
  await ItemController.saveItem('');
  assert.equal(saves,1);assert.equal(renders,1);
  assert.equal(State.items.length,1);
  assert.equal(State.items[0].units[0].salePrice,12.3456,'must not replace raw unit sale price with displayed 12.35');
  assert.equal(State.items[0].units[0].costPrice,1.23456,'must not replace raw cost with displayed 1.23');
  console.log('PASS: quantity + unit prices obey 0–4 decimals, original prices survive item save, PDF/thermal print and EN translation');
})().catch(e=>{console.error(e);process.exit(1)});
