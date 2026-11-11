'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const base = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(base, 'app/src/main/assets/www/index.html'), 'utf8');
const java = fs.readFileSync(path.join(base, 'app/src/main/java/com/sunshine/accounting/ContinuousBarcodeActivity.java'), 'utf8');
const main = fs.readFileSync(path.join(base, 'app/src/main/java/com/sunshine/accounting/MainActivity.java'), 'utf8');
const manifest = fs.readFileSync(path.join(base, 'app/src/main/AndroidManifest.xml'), 'utf8');
const gradle = fs.readFileSync(path.join(base, 'app/build.gradle'), 'utf8');
function section(start, end) {
  const i = html.indexOf(start);
  assert(i !== -1, `Missing method ${start}`);
  const j = html.indexOf(end, i);
  assert(j !== -1, `Missing end boundary ${end}`);
  return html.slice(i, j).trim();
}
assert(java.includes('camera.decodeContinuous('), 'Scanner must stay open after a scan');
assert(java.includes('close.setOnClickListener(v -> closeAndReturn(null))'), 'Only X closes scanner');
assert(java.includes('getOnBackPressedDispatcher().addCallback'), 'Back should not close scanner');
assert(main.includes('invoiceBarcodeLauncher.launch'), 'MainActivity must launch continuous scanner');
assert(main.includes('replyBarcodeBatch(codes)'), 'Scanner must deliver all scanned codes');
assert(html.includes('__nativeBarcodeBatchResult'), 'Web invoice must accept scanner batch');
assert(html.includes('invoice-added-items'), 'Invoice rows should have sky-blue background');
assert(manifest.includes('android:name=".ContinuousBarcodeActivity"'), 'Scanner must be in Android manifest');
assert(manifest.includes('android:exported="false"'), 'Scanner must not be externally exported');
assert(manifest.includes('android.permission.CAMERA'), 'Camera permission required');
assert(gradle.includes("applicationId 'com.sunshine.technicalaccountant'"), 'KEEP existing package ID to retain app data');
assert(html.includes("const DB_NAME = 'AlRaedAccountingERP_v2'"), 'KEEP existing IndexedDB name');
assert(html.includes('const DB_VERSION = 1'), 'KEEP existing IndexedDB schema version');
assert(html.includes('https://'), 'WebView secure origin must remain');

const methods = section('addItemsByBarcodeBatch(codes) {','            async openBarcodeScanner() {') + '\n' +
                section('addItemToInvoice(itemId, repaint = true) {','            changeRowUnit(rowIdx, newUnitName) {');
// Exercise the actual production controller methods with mocked browser dependencies.
function makeController(type) {
  const state = { items: [
    {id:'a', name:'Material A',barcode:'A1',currency:'USD',units:[{name:'Piece',factor:1,salePrice:10,costPrice:6}]},
    {id:'b', name:'Material B',barcode:'B2',currency:'USD',units:[{name:'Piece',factor:1,salePrice:20,costPrice:12}]},
  ] };
  const events = {updates:0,repaints:0,messages:[]};
  const screen = {name:'invoice_form'};
  const accounting = {convert:(p)=>p};
  const controller = new Function('State','AppNav','UI','Accounting','document','events',
   'return ({' + methods + '\n markModified(){events.updates++}, recalculate(){}, paintForm(){events.repaints++} });'
  )(state,{current:()=>({screen:screen.name})},{toast:(m,level)=>events.messages.push([m,level])},accounting,
    {getElementById:()=>({})},events);
  controller.draft = {type, rows:[],currency:'USD',exchangeRate:15000};
  return {controller,events,screen};
}
for (const type of ['sale','purchase']) {
  const {controller,events,screen} = makeController(type);
  controller.addItemsByBarcodeBatch(['A1','B2','A1','MISSING']);
  assert.equal(controller.draft.rows.length,2,`Two unique invoice items for ${type}`);
  assert.equal(controller.draft.rows.find(r=>r.itemId==='a').qty,2,`Repeating same barcode increments qty in ${type}`);
  assert.equal(controller.draft.rows.find(r=>r.itemId==='b').qty,1);
  assert.equal(controller.draft.rows[0].price, type === 'sale' ? 10 : 6,`Correct ${type} price`);
  assert.equal(events.repaints,1,`Only one render for invoice batch`);
  assert.equal(events.updates,1,`Mark invoice modified just once`);
  assert(events.messages.some(([m])=>m.includes('1 باركود')),'Unknown barcodes should be reported');
  screen.name='dashboard';
  controller.addItemsByBarcodeBatch(['B2']);
  assert.equal(controller.draft.rows.find(r=>r.itemId==='b').qty,1,'Do not add to a closed invoice');
}
console.log('PASS continuous invoice multi-scan sale/purchase, duplicate quantities, UI styling, unchanged database identifiers');
