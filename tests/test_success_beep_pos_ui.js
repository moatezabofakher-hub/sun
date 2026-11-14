'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const main=path.resolve(__dirname,'../app/src/main/assets/www'),field=path.resolve(__dirname,'../field_agent/src/main/assets/www');
for(const dir of [main,field]){
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 assert.match(html,/static\/barcode-feedback\.js/);
 const beep=fs.readFileSync(path.join(dir,'static/barcode-feedback.js'),'utf8');
 assert.match(beep,/successBeep/);assert.match(beep,/createOscillator/);
}
for(const moduleName of ['app','field_agent']){
 const java=fs.readFileSync(path.resolve(__dirname,'../'+moduleName+'/src/main/java/com/sunshine/accounting/MainActivity.java'),'utf8');
 assert.match(java,/@JavascriptInterface\s+public void successBeep\(\)/);
 assert.match(java,/ToneGenerator\.TONE_PROP_BEEP/);
}
const pos=fs.readFileSync(path.join(field,'static/agent-pos.js'),'utf8');
assert.match(pos,/agent-pos-screen/);
assert.match(pos,/agent-pos-cart/);
assert.match(pos,/Sلة نقطة البيع|سلة نقطة البيع/);
assert.match(pos,/typeof this\.invoiceCalc==='function'/);
const fieldScan=fs.readFileSync(path.join(field,'static/agent-experience.js'),'utf8');
assert.doesNotMatch(fieldScan,/BarcodeFeedback\?\.success\(\)/);
const mainInvoice=fs.readFileSync(path.join(main,'index.html'),'utf8');
assert.match(mainInvoice,/if\(quantityAfter > quantityBefore\)/);
console.log('POS is a distinct screen; barcode sound belongs to the scanner read callback.');
