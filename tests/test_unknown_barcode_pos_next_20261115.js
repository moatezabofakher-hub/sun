'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
for(const p of ['app','field_agent']){
 const root=`${p}/src/main`;
 const java=read(`${root}/java/com/sunshine/accounting/ContinuousBarcodeActivity.java`);
 const main=read(`${root}/java/com/sunshine/accounting/MainActivity.java`);
 assert.match(java,/EXTRA_KNOWN_CODES/);
 assert.match(java,/الباركود غير معرّف/);
 assert.match(java,/knownBarcodes\.contains/);
 assert.match(main,/setKnownBarcodes\(String json\)/);
}
for(const p of ['app','field_agent']){
 const hid=read(`${p}/src/main/assets/www/static/mobile-barcode-hid.js`);
 assert.match(hid,/الباركود غير معرّف/);
 assert.match(hid,/BarcodeFeedback\?\.read\(\)/);
}
const main=read('app/src/main/assets/www/index.html');
const pos=read('app/src/main/assets/www/static/windows-pos.js');
const fieldPos=read('field_agent/src/main/assets/www/static/agent-pos.js');
const parity=read('field_agent/src/main/assets/www/static/agent-invoice-parity.js');
assert.match(main,/posAutoNextSetting/);
assert.match(main,/ta-dark-report-icons-20261115/);
assert.match(pos,/posAutoNextOnFinish/);
assert.match(fieldPos,/agentPosAutoNext/);
assert.match(fieldPos,/posAutoNextOnFinish/);
assert.match(parity,/setKnownBarcodes/);
console.log('PASS: unknown barcode alert, scanner catalog and configurable auto-next');
