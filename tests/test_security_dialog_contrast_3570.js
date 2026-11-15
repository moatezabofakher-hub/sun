const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const web=path.join(__dirname,'..','app','src','main','assets','www');
const idx=fs.readFileSync(path.join(web,'index.html'),'utf8');
const field=fs.readFileSync(path.join(web,'static','field-main.js'),'utf8');
const css=fs.readFileSync(path.join(web,'static','ta-security-dialog-contrast.css'),'utf8');
test('removal continue button is prominent and cancellation is distinguishable',()=>{
 assert.match(field,/ta-modal-action-danger[^\n]*?onclick=\"FieldSync\.removeAgent/);
 assert.match(field,/ta-modal-action-secondary[^\n]*?onclick=\"FieldSync\.open\(\)\"/);
 assert.match(css,/button\[class~=\"bg-rose-700\"\]/);
 assert.match(css,/-webkit-text-fill-color:#fff!important/);
});
test('security verification, PIN setup and restore confirmations have durable contrast styles',()=>{
 assert.match(idx,/static\/ta-security-dialog-contrast\.css/);
 assert.match(idx,/ta-modal-action-primary[^\n]*?>تحقق<\/button>/);
 assert.match(idx,/ta-modal-action-primary[^\n]*?>تحقق وتبديل<\/button>/);
 assert.match(idx,/ta-modal-action-danger[^\n]*?>تأكيد استعادة النسخة<\/button>/);
 assert.match(css,/ta-modal-action-secondary/);
});
