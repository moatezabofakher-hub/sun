'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/index.html'),'utf8');
test('New pages start at top, but re-rendering a page keeps the scroll position',()=>{
 assert.match(html,/enteringDifferentView=before\.screen!==screen/);
 assert.match(html,/String\(before\.params\?\.id\|\|''\)!==String\(params\?\.id\|\|''\)/);
 assert.match(html,/if\(enteringDifferentView\)this\._resetScrollOnNextRender=true/);
 assert.match(html,/const settingsView = screen === 'settings' && !this\._resetScrollOnNextRender/);
 assert.match(html,/if\(shouldReset\)/);
 assert.match(html,/main\.scrollTop=0/);
 assert.match(html,/requestAnimationFrame\(resetPageScroll\)/);
 assert.doesNotMatch(html,/if \(!settingsView\) window\.scrollTo/);
});
test('Android Back closes nested menus then popups, then moves one screen toward dashboard',()=>{
 const back=html.slice(html.indexOf('            handleBackButton() {'),html.indexOf('            popScreen() {'));
 assert.match(back,/itmCurrencyPopup/);
 assert.match(back,/soloDefaultCurrencyPopup/);
 assert.match(back,/const openDetails=Array\.from\(document\.querySelectorAll\('#mainContent details\[open\]'\)\)/);
 assert.match(back,/openDetails\[openDetails\.length-1\]\.open=false/);
 assert.match(back,/if \(this\.stack\.length > 1\) \{\s*this\.popScreen\(\)/);
 assert.match(back,/dlg\.getAttribute\('data-dialog-type'\) !== 'unsaved'/);
 assert.match(back,/UI\.showUnsavedDialog/);
 assert.match(html,/if \(this\.current\(\)\.screen === 'settings'\) SettingsController\.closeAllSections\(\)/);
});
test('Profit report always shows totals and invoice, group and item profit; no hide button',()=>{
 assert.match(html,/const revealProfits = true;/);
 assert.doesNotMatch(html,/reveal:\$\{!revealProfits\}/);
 assert.match(html,/أرباح الفواتير/);
 assert.match(html,/أرباح المجموعات/);
 assert.match(html,/أرباح المواد/);
 assert.match(html,/صافي الربح/);
});

test('Employee Back handles POS and item pickers before leaving an operation',()=>{
 const base=path.join(__dirname,'../field_agent/src/main/assets/www/static');
 const agent=fs.readFileSync(path.join(base,'agent-experience.js'),'utf8');
 const ux=fs.readFileSync(path.join(base,'agent-ux-3588.js'),'utf8');
 assert.match(agent,/const previousRoute=this\.screen/);
 assert.match(agent,/if\(previousRoute!==this\.screen\)/);
 assert.match(agent,/requestAnimationFrame\(reset\)/);
 assert.match(agent,/if\(this\.stack\.length>1\)\{this\.stack\.pop\(\)/);
 assert.match(ux,/if\(one\('#agentPosNameList'\)\)/);
 assert.match(ux,/if\(one\('#agentItemPicker'\)\)/);
 assert.match(ux,/const details=Array\.from\(document\.querySelectorAll\('#screen details\[open\]'\)\)/);
});
