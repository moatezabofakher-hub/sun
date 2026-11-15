const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Settings contains a dedicated mobile-computer sync category leading to existing pairing controls',()=>{
  const p=path.join(__dirname,'..','app/src/main/assets/www','static','tiqany-peer-controller.js');
  const s=fs.readFileSync(p,'utf8');
  assert.match(s,/data-settings-section=\"mobile-computer-sync\"/);
  assert.match(s,/settings-section-name\"\>مزامنة الموبايل و الكمبيوتر/);
  assert.match(s,/ontoggle=\"SettingsController\.onSectionToggle\(this\)\"/);
  assert.match(s,/id=\"ta-peer-settings\"/);
  assert.match(s,/id=\"ta-peer-connection\"/);
  assert.match(s,/\$\{desktop\?'config':'sync'\}/);
  assert.match(s,/\<\/section\>\<\/div\>\<\/details\>/);
});
