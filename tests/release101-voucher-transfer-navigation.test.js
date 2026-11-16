"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const htmlFile=fs.existsSync(path.join(root,'web/index.html'))?path.join(root,'web/index.html'):path.join(root,'app/src/main/assets/www/index.html');
const src=fs.readFileSync(htmlFile,'utf8');

test('voucher workspaces hide regular bottom navigation and retain guarded Save/Cancel',()=>{
  assert.match(src,/screen==='voucher_form'/);
  assert.match(src,/body\.ta-workspace-screen nav\.ta-bottom-nav/);
  assert.match(src,/class="ta-voucher-cancel-action"/);
  assert.match(src,/onclick="AppNav\.handleBackButton\(\)"/);
  assert.match(src,/onclick="VoucherController\.saveVoucher\(\)"/);
});
test('transfer editor hides dock, offers Save and Cancel, never auto-opens search keyboard',()=>{
  assert.match(src,/body\.ta-transfer-editor-open nav\.ta-bottom-nav/);
  assert.match(src,/class="ta-transfer-form-actions"/);
  assert.match(src,/id="transferSaveButton" onclick="WarehouseController\.saveTransfer\(false\)"/);
  assert.match(src,/class="ta-transfer-cancel-button" onclick="WarehouseController\.closeTransferForm\(\)"/);
  assert.doesNotMatch(src,/Views\.jumpToEntry\('warehouseTransferPanel','transferSearchInput'\)/);
  assert.match(src,/scrollToTransferPanel\(\)\s*\{[\s\S]*?scrollIntoView/);
});

test('Android uses hardware Back, not duplicated header Back button',()=>{
  assert.match(src,/html body #headerBackBtn/);
  assert.match(src,/html body #topAppBar\.ta-operation-header #headerBackBtn\{display:none!important\}/);
});
