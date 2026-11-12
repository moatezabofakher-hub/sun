'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/../app/src/main/assets/www/index.html','utf8');
const extract=(a,b)=>{let i=html.indexOf(a),j=html.indexOf(b,i+a.length);assert(i>=0&&j>i,`${a}...${b}`);return html.slice(i,j)};
let renders=0, saves=0, toasts=[];
const dom={};
const fakeDocument={
 querySelectorAll:()=>Object.values(dom),
 getElementById:(id)=>({value:id==='catalogPopularCurrency'?'EUR':'',classList:{toggle:()=>{}},focus:()=>{}})
};
const ctx={console,Map,Set,Math,Number,Date,JSON,String,Array,Promise,Intl,
 document:fakeDocument,StorageEngine:{saveState:async()=>{saves++}},
 AppNav:{renderCurrent:()=>{renders++}},UI:{toast:(s)=>toasts.push(s)},
 window:{},globalThis:null};ctx.globalThis=ctx;
const code=extract('const State =','const StorageEngine =')+'\n'+extract('const SettingsController =','const ProtectionController =')+'\n'+
 'globalThis.Test = {State,CurrencyCatalog,SettingsController};';
vm.runInNewContext(code,ctx);
const {State,CurrencyCatalog,SettingsController}=ctx.Test;
assert.deepEqual(Array.from(CurrencyCatalog.active()),['USD','SYP']);
assert.equal(CurrencyCatalog.popular.find(c=>c[0]==='EUR')[1],'اليورو');
assert.match(html,/إضافة مصروف/);
assert.ok(!html.includes('<span class="text-[11px] font-bold text-slate-700">المصاريف</span>'));
assert.ok(html.includes('id="passwordSecurityFields"'));
assert.ok(html.includes('id="setDefaultItemCurrency"'));
assert.ok(html.includes('id="setPrimaryCurrency"'));
assert.ok(html.includes('id="setSecondaryCurrency"'));
assert.ok(html.includes('id="setPrimaryOnlyMode"'));
assert.ok(!html.includes("BackupController.card('drive'"));
const a={dataset:{settingsSection:'language'},open:true};dom.a=a;
SettingsController.onSectionToggle(a);
assert.deepEqual([...SettingsController.expandedSections],['language']);
const b={dataset:{settingsSection:'items'},open:true};dom.b=b;
SettingsController.onSectionToggle(b);
assert.equal(a.open,false);
assert.deepEqual([...SettingsController.expandedSections],['items']);
SettingsController.passwordPanelOpen=true;
SettingsController.closeAllSections();
assert.equal(b.open,false);
assert.equal(SettingsController.passwordPanelOpen,false);
assert.equal(SettingsController.expandedSections.size,0);
(async()=>{
 await SettingsController.addCatalogCurrency('EUR','اليورو');
 assert.equal(State.settings.addedCurrencies.length,1);
 await SettingsController.addCatalogCurrency('EUR','اليورو');
 assert.equal(State.settings.addedCurrencies.length,1,'prevent duplicates');
 await SettingsController.addCatalogCurrency('SEK','الكرونا السويدية');
 assert.match(CurrencyCatalog.renderAdditional(),/SEK/);
 await SettingsController.removeCatalogCurrency('EUR');
 assert.equal(State.settings.addedCurrencies.length,1);
 await SettingsController.setDefaultItemCurrency('SYP');
 assert.equal(State.settings.defaultItemCurrency,'SYP');
 await SettingsController.setPrimaryCurrency('SYP');
 assert.equal(State.settings.primaryCurrency,'SYP');
 assert.equal(State.settings.secondaryCurrency,'USD');
 await SettingsController.setPrimaryOnlyMode(true);
 assert.deepEqual(Array.from(CurrencyCatalog.active()),['SYP']);
 assert.equal(State.settings.defaultCurrency,'SYP');
 assert.equal(State.settings.defaultItemCurrency,'SYP');
 await SettingsController.setDefaultInvoiceCurrency('USD');
 assert.equal(State.settings.defaultCurrency,'SYP','cannot override currency in one-currency mode');
 await SettingsController.setPrimaryOnlyMode(false);
 assert.deepEqual(Array.from(CurrencyCatalog.active()),['SYP','USD']);
 assert.ok(saves >= 8 && renders>=5);
 const java=fs.readFileSync(__dirname+'/../app/src/main/java/com/sunshine/accounting/AutoBackupManager.java','utf8');
 assert.match(java,/cancelUniqueWork\("periodic_drive_backup"\)/);
 assert.match(java,/if \(!"local"\.equals\(kind\)\)/);
 console.log('PASS 3.5.11: exclusive settings panes, currencies, primary-only, password settings, expenses tile, Drive removal');
})().catch(e=>{console.error(e);process.exit(1)});
