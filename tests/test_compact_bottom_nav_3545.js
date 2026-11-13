// 3.5.45 — compact navigation must preserve every tab and a >=44px touch target.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(root,'app/src/main/assets/www/index.html'),'utf8');
const field=fs.readFileSync(path.join(root,'field_agent/src/main/assets/www/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'field_agent/src/main/assets/www/static/agent-premium.css'),'utf8');
const mainNav=main.slice(main.indexOf('<nav class="ta-bottom-nav'),main.indexOf('<!-- Global Modals Container -->'));
assert(mainNav.includes('grid-cols-6 h-14'),'main uses 56px dock instead of 64px');
assert.equal((mainNav.match(/data-nav=/g)||[]).length,6,'main keeps all six tabs');
assert(main.includes('min-height:44px;line-height:1.15;'),'main tappable area remains 44px');
assert(main.includes('nav.ta-bottom-nav .nav-btn{background:transparent;border:1px solid transparent;border-radius:12px;padding:2px 1px;}'),'premium theme no longer forces excess padding');
const fieldNav=field.slice(field.indexOf('<nav id="bottom"'),field.indexOf('</nav>'));
assert.equal((fieldNav.match(/id="nav-/g)||[]).length,5,'field keeps five tabs');
assert(css.includes('.bottom button{min-height:44px;gap:0;'),'field tap targets are 44px');
assert(css.includes('.bottom{padding-top:4px;padding-bottom:max(4px,env(safe-area-inset-bottom,0px))'),'safe area stays supported');
assert(css.includes('.wrap{padding:16px 12px 84px}'),'content stays above dock');
console.log('PASS 3.5.45 compact bottom tabs for main and field agent');
