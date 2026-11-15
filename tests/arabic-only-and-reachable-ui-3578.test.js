const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const ui=fs.readFileSync(path.resolve(__dirname,'../app/src/main/assets/www/index.html'),'utf8');
test('Arabic-only interface has no language toggle or translator runtime',()=>{
 assert.doesNotMatch(ui,/id="appLanguage"|data-settings-section="language"|I18n\.|static\/i18n\.js/);
 assert.match(ui,/<html lang="ar" dir="rtl">/);
});
test('main content is an independent scrolling viewport above the dock',()=>{
 assert.match(ui,/id="ta-scroll-reach-3578"/);
 assert.match(ui,/overflow-y:auto!important/);
 assert.match(ui,/padding-bottom:calc\(var\(--ta-dock-height, 110px\) \+ 56px\)!important/);
});
