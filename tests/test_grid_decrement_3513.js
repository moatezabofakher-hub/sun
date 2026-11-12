'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app/src/main/assets/www/index.html'), 'utf8');
const section = (a,b) => {
  const i=html.indexOf(a),j=html.indexOf(b,i+a.length);
  assert(i>=0&&j>i,`missing segment ${a} -> ${b}`);
  return html.slice(i,j).trim();
};
const gridMethod = section('renderItemGridCards() {','            toggleInvoiceCurrency() {');
assert.match(gridMethod,/class="invoice-grid-decrement"/);
assert.match(gridMethod,/onclick="event\.stopPropagation\(\); InvoiceController\.removeOneFromGrid/,'X must stop card-click propagation');
assert.match(gridMethod,/aria-label="إنقاص وحدة واحدة/);
assert.match(html,/#itemGridCardsContainer \.invoice-grid-decrement \{/);
const addMethod=section('addItemToInvoice(itemId, repaint = true) {','            changeRowUnit(rowIdx, newUnitName) {');
const recalcMethod=section('recalculate() {','            updateTotalsDOM() {');
const baseMethods = gridMethod+'\n'+addMethod+'\n'+recalcMethod;
const appId = fs.readFileSync(path.join(root, 'app/build.gradle'),'utf8');
assert.match(appId,/applicationId 'com\.sunshine\.technicalaccountant'/);
assert.ok(Number(appId.match(/versionCode\s+(\d+)/)?.[1]) >= 20, 'grid decrement retained after version upgrade');
assert.match(html,/const DB_NAME = 'AlRaedAccountingERP_v2'/);
assert.match(html,/const DB_VERSION = 1/);

function init(type) {
  const state = {categories:['معطرات'],items:[
    {id:'a',name:'صابون',category:'معطرات',currency:'USD',barcode:'11',units:[{name:'عبوة',factor:1,salePrice:10,costPrice:7},{name:'كرتون',factor:12,salePrice:100,costPrice:60}]},
    {id:'b',name:'شامبو',category:'معطرات',currency:'USD',barcode:'22',units:[{name:'عبوة',factor:1,salePrice:20,costPrice:12}]}
  ]};
  const elements={
    gridCatPills:{innerHTML:''},itemGridCardsContainer:{innerHTML:''},mainContent:{},
    modalContainer:{classList:{contains:()=>false}}
  };
  const document={getElementById:id=>elements[id]||null};
  const accounting={
    convert:(value)=>value,
    formatItemPrice:(value,currency)=>`${value} ${currency}`,
    formatItemQuantity:value=>String(value),
    getItemBaseStock:()=>15,
    round:value=>Math.round(value*100)/100
  };
  const events={dirty:0,painted:0};
  const controller=new Function('State','Accounting','document','ItemController','events',
    `return ({
      draft:null,gridCatFilter:'all',gridSearchQuery:'',
      ${baseMethods}
      markModified(){events.dirty++;},
      paintForm(){events.painted++;}
    });`
  )(state,accounting,document,{photoThumb:()=>'<div class="photo"></div>'},events);
  controller.draft={type,rows:[],currency:'USD',exchangeRate:15000,warehouseId:'wh_main',
     discountType:'percent',discountValue:0,taxType:'percent',taxValue:0,paymentMethod:'cash'};
  return {controller,state,elements,events};
}
for (const type of ['sale','purchase','sale_return','purchase_return']) {
  const {controller:c,elements,events}=init(type);
  c.renderItemGridCards();
  assert.doesNotMatch(elements.itemGridCardsContainer.innerHTML,/invoice-grid-decrement/,'No X on unselected items');
  c.selectItemFromGrid('a'); c.selectItemFromGrid('a'); c.selectItemFromGrid('a');
  c.selectItemFromGrid('b');
  assert.equal(c.draft.rows.find(r=>r.itemId==='a').qty,3);
  assert.equal(c.draft.rows.find(r=>r.itemId==='b').qty,1);
  const price = type.startsWith('purchase') ? 7 : 10;
  assert.equal(c.draft.netTotal, 3*price + (type.startsWith('purchase') ? 12 : 20));
  assert.match(elements.itemGridCardsContainer.innerHTML, /InvoiceController\.removeOneFromGrid\('a'\)/);
  assert.match(elements.itemGridCardsContainer.innerHTML, /\>\s*3\s*\<\/span\>/,'Badge shows 3');
  const before=events.dirty;
  c.removeOneFromGrid('a');
  assert.equal(c.draft.rows.find(r=>r.itemId==='a').qty,2);
  assert.equal(c.draft.netTotal, 2*price + (type.startsWith('purchase') ? 12 : 20));
  assert.equal(events.dirty,before+1);
  c.removeOneFromGrid('a'); c.removeOneFromGrid('a');
  assert.equal(c.draft.rows.find(r=>r.itemId==='a'),undefined,'Remove row at zero');
  assert.equal(c.draft.rows.length,1,'Other product preserved');
  assert.doesNotMatch(elements.itemGridCardsContainer.innerHTML, /InvoiceController\.removeOneFromGrid\('a'\)/,'X disappears when qty reaches 0');
  assert.equal(c.draft.netTotal,type.startsWith('purchase')?12:20);
  c.removeOneFromGrid('a');
  assert.equal(c.draft.rows.length,1,'Repeated X on missing row is a no-op');
}
{
  const {controller:c,elements}=init('sale');
  c.addItemToInvoice('a');
  c.draft.rows[0].unitName='كرتون';
  c.draft.rows[0].price=100;
  c.draft.rows[0].qty=2;
  c.addItemToInvoice('a'); // adds default-unit row independently
  c.renderItemGridCards();
  assert.match(elements.itemGridCardsContainer.innerHTML, /\>\s*3\s*\<\/span\>/,'Badge sums item quantity across units');
  c.removeOneFromGrid('a');
  assert.equal(c.draft.rows.length,1,'Prefer the default unit row for deletion');
  assert.equal(c.draft.rows[0].qty,2,'Leave other unit unaffected');
  c.removeOneFromGrid('a');
  assert.equal(c.draft.rows[0].qty,1,'Fallback to other unit if no default exists');
}
console.log('PASS 3.5.13: X button, stop propagation, sale/purchase/returns, one-quantity decrement, totals, badges, zero removal, multiple units and unchanged DB');
