'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
for (const part of ['app','field_agent']) {
 const root=path.join(__dirname,'..',part);
 const staticDir=path.join(root,'src/main/assets/www/static');
 const js=fs.readFileSync(path.join(staticDir,'mobile-barcode-hid.js'),'utf8');
 assert.match(js,/BarcodeFeedback\?\.read\(known\(code\)\)/);
 assert.doesNotMatch(fs.readFileSync(path.join(staticDir,'barcode-feedback.js'),'utf8'),/success\(\)\s*\{/);
 const java=fs.readFileSync(path.join(root,'src/main/java/com/sunshine/accounting/ContinuousBarcodeActivity.java'),'utf8');
 assert.match(java,/scanned\.add\(code\);[\s\S]{0,350}startTone\(android\.media\.ToneGenerator\.TONE_PROP_BEEP/);
 assert.match(java,/readTone\.release\(\)/);
}
for(const name of ['agent-experience.js','agent-pos.js'])assert.doesNotMatch(
 fs.readFileSync(path.join(__dirname,'../field_agent/src/main/assets/www/static',name),'utf8'),/BarcodeFeedback\?\.success/);
console.log('Android native camera and HID scanners beep before applying rows');
