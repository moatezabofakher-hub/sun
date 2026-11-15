const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const test=require('node:test');
const s=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/index.html'),'utf8');
test('approved 2-row POS / vouchers layout and spaced bottom labels',()=>{assert.match(s,/ta-quick-3573/);assert.match(s,/ta-quick-pos\{grid-column:2;grid-row:1\/span 2/);assert.match(s,/ta-quick-receipt/);assert.match(s,/ta-quick-payment/);assert.match(s,/nav\.ta-bottom-nav \.nav-btn > span/);});
test('voucher currency changes in place without opening a popup',()=>{assert.match(s,/toggleCurrency\(\)/);assert.match(s,/onclick="VoucherController\.toggleCurrency\(\)"/);assert.match(s,/this\.recalcClearing\(\)/);});
test('empty new vouchers go back immediately but editing remains protected',()=>{assert.match(s,/isEmptyNewVoucher\(\)/);assert.match(s,/!d\.isEditing/);});
