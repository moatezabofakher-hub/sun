const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const s = fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/index.html'),'utf8');
test('invoice warehouse native selector covers full icon, never shows arrow', () => {
  assert.match(s, /ta-invoice-warehouse-field[\s\S]{0,480}ta-quick-picker__face[\s\S]{0,520}InvoiceController\.changeWarehouse\(this\.value\)/);
  assert.match(s,/select\.ta-quick-picker__native[\s\S]{0,550}opacity:0!important/);
  assert.match(s,/AppEscape\.text\(WarehouseController\.name\(d\.warehouseId \|\| 'wh_main'\)\)/);
});
test('invoice tier icon shows current selected name and opens same native select on touch',()=>{
 assert.match(s,/ta-invoice-pricing-choice[\s\S]{0,680}ta-quick-picker__face[\s\S]{0,500}id="invoicePricingTier"/);
 for(const name of ['حسب إعدادات الحساب','سعر الجملة','سعر المركز','سعر المستهلك']) assert.ok(s.includes(name));
 assert.match(s,/onchange="InvoiceController\.changeInvoicePricingTier\(this\.value\)"/);
 assert.match(s,/this\.draft\.priceTierOverride = tier;/);
});
test('purchase selection changes label but never substitutes selling prices for cost prices',()=>{
 assert.match(s,/if \(\['purchase','purchase_return'\]\.includes\(this\.draft\.type\)\) \{[\s\S]*?this\.paintForm\(document\.getElementById\('mainContent'\)\);[\s\S]*?return;/);
 assert.match(s,/const rawPrice = isPurchase \? Number\(unitObj\?\.costPrice \|\| 0\)/);
});
test('payment methods use green blue pink icon badges and keep cycle',()=>{
 assert.match(s,/\.ta-pay-cash \.ta-payment-method-value > i \{background:linear-gradient\([^\n]*#059669/);
 assert.match(s,/\.ta-pay-partial \.ta-payment-method-value > i \{background:linear-gradient\([^\n]*#2563eb/);
 assert.match(s,/\.ta-pay-credit \.ta-payment-method-value > i \{background:linear-gradient\([^\n]*#f472b6/);
 assert.match(s,/const methods = \['cash','partial','credit'\]/);
});
