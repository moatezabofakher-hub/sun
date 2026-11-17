'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const htmlPath=fs.existsSync(path.join(__dirname,'../web/index.html'))?path.join(__dirname,'../web/index.html'):path.join(__dirname,'../app/src/main/assets/www/index.html');
const html=fs.readFileSync(htmlPath,'utf8');
const begin=html.indexOf('const ProfileManager = {');
const end=html.indexOf('\n        };',begin);
assert.ok(begin>=0&&end>begin,'ProfileManager missing');
const expr=html.slice(begin+'const ProfileManager = '.length,end+10);
let modal='',closed=0,created=0,warnings=0;
const ctx={
 State:{settings:{companyName:'اختبار'}},
 AppEscape:{text:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')},
 AppNav:{isDirty:false,isModalDirty:false,activeOperationGuard:false},
 UI:{openModal:s=>modal=s,forceCloseModal:()=>{closed++},toast:()=>{warnings++}},
 console,Date
};
const p=vm.runInNewContext('('+expr+')',ctx);
p.registry={profiles:[{id:'a',name:'اختبار'}],activeId:'a',deletedProfiles:[]};
p.activeId='a';p.createProfile=()=>{created++};
test('archive/delete action is glossy sky blue with white text',()=>{
 assert.match(html,/id="ta-profile-delete-sky-127"/);
 assert.match(html,/\.ta-profile-delete-button\{[^}]*#38bdf8[^}]*color:#fff!important/);
 assert.match(html,/onclick="ProfileManager\.requestDeleteActive\(\)" class="ta-profile-delete-button/);
});
test('settings do not display recoverable archived companies',()=>{
 const settings=p.renderSettings();
 assert.ok(settings.includes('ProfileManager.openCreateProfileOptions()'));
 assert.ok(!settings.includes('requestRestoreArchived('));
 assert.ok(!settings.includes('deletedProfiles'));
});
test('new independent account is created directly when archive is empty',()=>{
 p.openCreateProfileOptions();assert.equal(created,1);assert.equal(modal,'');
});
test('clicking add new account shows archived accounts only on demand',()=>{
 p.registry.deletedProfiles=[{id:'business_abc123',name:'شركة مؤرشفة'}];
 p.openCreateProfileOptions();
 assert.equal(created,1);
 assert.match(modal,/شركة مؤرشفة/);
 assert.match(modal,/requestRestoreArchived/);
 assert.match(modal,/continueCreateProfile/);
 assert.match(modal,/إلغاء/);
 p.continueCreateProfile();assert.equal(closed,1);assert.equal(created,2);
});
test('creation and archival suggestion are blocked by unsaved operations',()=>{
 ctx.AppNav.isDirty=true;modal='';
 p.openCreateProfileOptions();
 assert.equal(created,2);assert.equal(modal,'');assert.equal(warnings,1);
});
