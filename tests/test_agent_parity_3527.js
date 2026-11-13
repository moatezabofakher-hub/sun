'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const base='field_agent/src/main/';
const js=fs.readFileSync(base+'assets/www/static/agent-experience.js','utf8');
const old=fs.readFileSync(base+'assets/www/static/agent.js','utf8');
const html=fs.readFileSync(base+'assets/www/index.html','utf8');
const css=fs.readFileSync(base+'assets/www/static/agent-premium.css','utf8');
const native=fs.readFileSync(base+'java/com/sunshine/accounting/NativeBluetoothPrinter.java','utf8');
const manifest=fs.readFileSync(base+'AndroidManifest.xml','utf8');
for(const token of ['renderInvoice','renderVoucher','renderPayment','saveInvoicePayment','renderPrinter','pairPrinter','goBack','window.onAndroidBackPressed','invoice-selected','itemGridCategory','itemGridQuery','printOp']){
 assert(js.includes(token),`Missing field parity: ${token}`);
}
assert(!html.includes('تقرير الأرباح'));
assert(html.includes('agent-premium.css')&&html.includes('agent-experience.js'));
assert(css.includes('.dialog-card')&&css.includes('.item-pick')&&css.includes('.header-tool'));
assert(native.includes('public void pairPrinter()')&&native.includes('BluetoothDevice.ACTION_BOND_STATE_CHANGED')&&native.includes('startDiscovery()'));
assert(manifest.includes('android.permission.BLUETOOTH_SCAN')&&manifest.includes('android.permission.BLUETOOTH_CONNECT'));
assert(old.includes('TA_FIELD_SYNC_1')===false);
assert(old.includes('async importFile(input)')&&old.includes('renderStock')); 
assert(fs.readFileSync('field_agent/build.gradle','utf8').includes('versionCode 2'));
assert(fs.readFileSync('app/build.gradle','utf8').includes('versionCode 34'));
console.log('PASS field parity modules, same visual system, OS back, native pairing and file synchronization.');
