const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/index.html'), 'utf8');
const start = html.indexOf('const SettingsController = {');
const end = html.indexOf('const ProtectionController = {',start);
assert.ok(start >= 0 && end > start);
const section = name => ({
  open:false, isConnected:true, dataset:{settingsSection:name}
});
const panels = [];
const root={querySelectorAll:()=>panels};
const sandbox={
  document:{getElementById:()=>root,querySelectorAll:()=>panels},
  window:{scrollX:0,scrollY:360,scrollTo:()=>{}},
  UI:{toast:()=>{}},
  AppNav:{},State:{settings:{}},StorageEngine:{},console
};
vm.createContext(sandbox);
vm.runInContext(html.slice(start,end)+'\n globalThis.TestController=SettingsController;',sandbox);
const settings=sandbox.TestController;
assert.equal(settings.captureVisibleSettingsView(),null,'initial settings navigation is not a refresh');
panels.push(section('printing'),section('currency'),section('company'));
// Simulate a live open accordion, then the framework rebuilding its DOM.
panels[0].open = true;
settings.onSectionToggle(panels[0]);
const snapshot=settings.captureVisibleSettingsView();
assert.equal(snapshot.section,'printing');
assert.equal(snapshot.y,360);
panels[0].isConnected=false;
const old=panels[0];
const newPanels=[section('printing'),section('currency'),section('company')];
panels.splice(0,3,...newPanels);
settings.restoreVisibleSettingsView(snapshot);
assert.equal(newPanels[0].open,true);
assert.equal(newPanels[1].open,false);
settings.onSectionToggle(old); // queued closing event from deleted DOM must be ignored
assert.ok(settings.expandedSections.has('printing'));
newPanels[1].open=true;
settings.onSectionToggle(newPanels[1]);
assert.ok(settings.expandedSections.has('currency'));
assert.equal(newPanels[0].open,false,'opening next section must close previous');
// A dismissible toast must never call render or navigate.
assert.ok(html.includes('if (!settingsView) window.scrollTo({ top: 0, behavior: \'instant\' });'));
assert.ok(html.includes('SettingsController.restoreVisibleSettingsView(settingsView)'));
console.log('PASS 3.5.20: alert-triggered redraw preserves settings accordion & scroll; detached toggles cannot close it.');
