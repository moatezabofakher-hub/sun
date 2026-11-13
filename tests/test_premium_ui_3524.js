// 3.5.24: regression checks for unified offline 3D UI and retained accounting UX.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html=fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const icons=fs.readFileSync('app/src/main/assets/www/static/icons.js','utf8');
const gradle=fs.readFileSync('app/build.gradle','utf8');
assert.match(html,/class="ta-premium-ui ta-3d-v3524/);
assert.match(html,/Accounting Atelier UI: unified elegant 3D surfaces/);
for (const x of ['.ta-action-card','.ta-module-card','#modalContainer','#dialogContainer','#modalBox','#dialogBox','nav.ta-bottom-nav','.settings-section','.invoice-added-items','.ta-stock-card','.report-period-pill']) {
  assert(html.includes(x),`Missing 3D theme target: ${x}`);
}
for (const icon of ['fa-chart-bar','fa-whatsapp','fa-headset','fa-chevron-up','fa-folder-open','fa-images','fa-globe','fa-building']){
  assert(icons.includes('"'+icon+'"'),`Offline icon missing ${icon}`);
}
assert.match(html,/svg\[fill="none"\]/,'The fix for outlined icon SVGs must remain');
assert.match(html,/إصدار التطبيق: 3\.5\.34/);
assert.match(gradle,/versionCode 41/);
assert.match(gradle,/versionName '3\.5\.34-auto-agent-enrollment'/);
assert.match(gradle,/applicationId 'com\.sunshine\.technicalaccountant'/);
assert.match(html,/const DB_NAME = 'AlRaedAccountingERP_v2'/);
assert(html.includes('طباعة تقرير الديون') && html.includes('طباعة المبيعات'));
assert(html.includes('invoice-print-item-row'));
assert(!html.includes('مركز إدارة الأعمال'));
console.log('PASS 3.5.24: 3D dashboard, all panels/icons, dialogs, receipt, version, same app ID/DB, no extra data.');
