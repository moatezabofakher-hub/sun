'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const field=path.join(root,'field_agent/src/main/assets/www/static');
const proto=require(path.join(field,'field-protocol.js'));
for(const code of ['USD','SYP']){
  assert.equal(proto.currency(code),code);
  assert.equal(proto.money(12.5,code),code==='SYP'?13:12.5);
}
for(const bad of ['ل.س','دولار','EUR',undefined,''])assert.throws(()=>proto.currency(bad),/غير مدعومة/);
const experience=fs.readFileSync(path.join(field,'agent-experience.js'),'utf8');
const base=fs.readFileSync(path.join(field,'agent.js'),'utf8');
const edits=fs.readFileSync(path.join(field,'agent-document-edits.js'),'utf8');
assert.match(experience,/id="vCurrency" type="hidden" value="\$\{currency\}"/);
assert.match(experience,/id="vCurrencyToggle"/);
assert.match(experience,/onclick="Agent\.toggleVoucherCurrency\(\)"/);
assert.match(experience,/editing\?\.currency==='SYP'/);
assert.doesNotMatch(experience,/<select id="vCurrency"/);
assert.match(base,/toggleVoucherCurrency\(\)/);
assert.match(base,/const next=field\.value==='USD'\?'SYP':'USD';/);
assert.match(base,/<option value="\$\{c\}"/);
assert.doesNotMatch(edits,/replace\('<option>'\+esc\(op\.currency\)/);
for(const f of ['app/src/main/assets/www/static/arabic-currency-display.js','field_agent/src/main/assets/www/static/arabic-currency-display.js']){
  const text=fs.readFileSync(path.join(root,f),'utf8');
  assert.match(text,/preserveOptionValue\(child\)/);
  assert.match(text,/option\.setAttribute\('value', option\.value\)/);
}
console.log('PASS 3.5.83: ISO currency codes survive Arabic display conversion, voucher toggle without dropdown, editing currency restored.');
