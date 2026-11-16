"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const folder=path.join(root,'field_agent/src/main/assets/www');
const html=fs.readFileSync(path.join(folder,'index.html'),'utf8');
const js=fs.readFileSync(path.join(folder,'static/agent-experience.js'),'utf8');
test('employee pages have no custom red exit/back and keep native Back handling',()=>{
 assert.doesNotMatch(html,/id="agentBack"/);
 assert.match(html,/#screen > \.ta-page-exit-line/);
 assert.match(js,/function agentHardwareBack\(\)/);
 assert.match(js,/window\.onAndroidBackPressed=agentHardwareBack/);
});
test('employee voucher hides dock and offers a guarded Cancel with Save',()=>{
 assert.match(js,/this\.screen==='voucher'\);/);
 assert.match(js,/getElementById\('bottom'\)\?\.classList\.toggle\('hide',!active \|\| this\.screen==='voucher'\)/);
 assert.match(js,/class="ta-agent-voucher-actions ta-agent-voucher-footer"/);
 assert.match(js,/onclick="Agent\.goBack\(\)"/);
 assert.match(js,/onclick="Agent\.saveVoucher\(\)"/);
});
