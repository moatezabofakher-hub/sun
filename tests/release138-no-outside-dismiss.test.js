'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../app/src/main/assets/www');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=fs.readFileSync(path.join(root,'static/ta-no-outside-dismiss-138.js'),'utf8');
test('Global and currency modal backdrops cannot be dismissed by touching outside',()=>{
 assert.match(html,/static\/ta-no-outside-dismiss-138\.js/);
 assert.doesNotMatch(html,/onclick="if\(event\.target === this\) UI\.requestCloseModal\(\)"/);
 assert.doesNotMatch(html,/wrapper\.onclick=e=>\{if\(e\.target===wrapper\)wrapper\.remove\(\);\}/);
 assert.doesNotMatch(html,/overlay\.onclick = e => \{ if \(e\.target === overlay\) overlay\.remove\(\); \}/);
 const listeners={};
 vm.runInNewContext(script,{document:{addEventListener(type,fn,options){
   assert.equal(options.capture,true);
   listeners[type]=fn;
 }}});
 for(const type of ['pointerdown','mousedown','touchstart','click']){
   for(const element of ['#modalContainer','#dialogContainer','#itmCurrencyPopup',
     '#soloDefaultCurrencyPopup','.dialog-mask','.agent-picker-mask']){
     let stopped=false,prevented=false;
     listeners[type]({target:{matches:selector=>selector.split(',').includes(element)},
       preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
     assert.equal(stopped,true,element+' '+type);
     assert.equal(prevented,true,element+' '+type);
   }
 }
 let stopped=false;
 listeners.click({target:{matches:()=>false},
   preventDefault(){stopped=true;},stopImmediatePropagation(){stopped=true;}});
 assert.equal(stopped,false,'Buttons inside popup stay clickable');
 assert.match(html,/UI\.requestCloseModal\(\)/);
});

test('Employee modal and item-picker backdrops use the same policy',()=>{
 const employeeRoot=path.resolve(__dirname,'../field_agent/src/main/assets/www');
 const view=fs.readFileSync(path.join(employeeRoot,'index.html'),'utf8');
 const guard=fs.readFileSync(path.join(employeeRoot,'static/ta-no-outside-dismiss-138.js'),'utf8');
 assert.match(view,/static\/ta-no-outside-dismiss-138\.js/);
 assert.match(view,/id="agentDialog"/);
 assert.match(view,/id="agentNewCustomerModal"/);
 assert.match(guard,/agentItemPicker/);
 assert.match(guard,/agentPosNameList/);
 assert.match(view,/Agent\.dismissDialog\(\)/);
});
