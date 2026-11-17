'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/index.html'),'utf8');
test('Bottom navigation is visible only on the dashboard route',()=>{
 assert.match(app,/id="ta-home-only-dock-137"/);
 assert.match(app,/html body\.ta-3d-v3524:not\(\.ta-dashboard-screen\) nav\.ta-bottom-nav\{display:none!important\}/);
 assert.match(app,/classList\.toggle\('ta-dashboard-screen',screen==='dashboard'\)/);
 assert.match(app,/nav class="ta-bottom-nav/);
 assert.match(app,/AppNav\.navigate\('dashboard'\)/);
 assert.match(app,/AppNav\.navigate\('invoices_list'\)/);
 assert.match(app,/AppNav\.navigate\('items'\)/);
 assert.match(app,/AppNav\.navigate\('accounts'\)/);
 assert.match(app,/AppNav\.navigate\('reports'\)/);
 assert.match(app,/backBtn\.onclick = \(\) => AppNav\.handleBackButton\(\)/);
});
