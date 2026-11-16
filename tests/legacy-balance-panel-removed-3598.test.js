const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const web = path.join(__dirname, '..', 'app/src/main/assets/www');
const js = fs.readFileSync(path.join(web, 'static/tiqany-ux-3588.js'), 'utf8');
const css = fs.readFileSync(path.join(web, 'static/tiqany-ux-3588.css'), 'utf8');
const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
test('legacy customer balance card is not created or populated', () => {
  assert.doesNotMatch(js, /node\.id\s*=\s*['"]taDraftBalance3588['"]/);
  assert.doesNotMatch(js, /اختر العميل لعرض الرصيد السابق/);
  assert.match(js, /legacy\.remove\(\)/);
  assert.match(css, /#taDraftBalance3588\s*\{display:none!important;\}/);
});
test('new fixed footer still provides live prior and projected balances and save', () => {
  assert.match(html, /draftBalanceBefore/);
  assert.match(html, /draftBalanceAfter/);
  assert.match(html, /InvoiceController\.saveInvoice\(true\)/);
});
