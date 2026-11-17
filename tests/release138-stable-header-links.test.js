'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/index.html'),'utf8');
test('Header order stays notification, PC, employee, paired manager, then label',()=>{
 const section=html.slice(html.indexOf('<div id="topAppBar"'),html.indexOf('<div id="headerActionGroup"'));
 const ids=['headerNotificationsBtn','data-connection-slot="computer"','data-connection-slot="employee"',
  'data-connection-slot="manager"','headerTitleWrap'];
 let at=-1;
 for(const token of ids){const index=section.indexOf(token);assert.ok(index>at,token);at=index;}
 for(const id of ['ta-desktop-phone-connection','salesStaffCounterButton','ta-manager-phone-connection']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
});
test('Slots reserve space when disconnected and title is in normal flow at every screen width',()=>{
 assert.match(html,/id="ta-stable-header-links-138"/);
 assert.match(html,/grid-template-columns:repeat\(3,30px\)!important/);
 assert.match(html,/grid-template-columns:repeat\(3,27px\)!important/);
 assert.match(html,/#topAppBar #ta-stable-connection-slots \.ta-connection-slot > button\[hidden\] \{display:none!important;\}/);
 assert.match(html,/position:static!important;left:auto!important;top:auto!important;transform:none!important;/);
 assert.match(html,/min-width:0!important;/);
 assert.match(html,/text-overflow:ellipsis!important/);
 assert.match(html,/#topAppBar\.ta-operation-header #headerNotificationsBtn/);
});
