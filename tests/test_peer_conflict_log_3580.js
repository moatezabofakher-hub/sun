'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'../app/src/main/assets/www/static');
const M=require(path.join(base,'tiqany-peer-merge.js'));
const controller=fs.readFileSync(path.join(base,'tiqany-peer-controller.js'),'utf8');
const state=q=>M.snapshot({settings:{companyName:'مؤسسة',exchangeRate:15000},invoices:[{id:'i1',number:125,type:'sale',currency:'SYP',netTotal:q,rows:[]}],warehouses:[]});
test('Android conflict entry includes both independent invoice versions',()=>{
 const b=state(10),p=state(20),w=state(30),r=M.merge(b,p,w);
 assert.equal(r.ok,false);assert.equal(r.details.length,1);
 const d=r.details[0];assert.equal(d.collection,'invoices');assert.equal(d.phone.netTotal,20);assert.equal(d.computer.netTotal,30);
 assert.ok(d.id.includes('i1'));
});
test('Android approval affects exact reviewed version, not newer edits',()=>{
 const b=state(10),p=state(20),w=state(30),d=M.merge(b,p,w).details[0];
 const choices={[d.id]:{side:'computer',signature:d.signature}};
 assert.equal(M.merge(b,p,w,choices).snapshot.invoices[0].netTotal,30);
 assert.equal(M.merge(b,state(25),w,choices).ok,false);
});
test('Android conflict log is available and reports to Windows, but does not auto-select a side',()=>{
 assert.match(controller,/سجل التعارض/);assert.match(controller,/ta-peer-conflict-button/);
 assert.match(controller,/ta-peer-conflict-panel/);assert.match(controller,/action:'report-conflicts'/);
 assert.match(controller,/recordConflicts\(merged\.details/);
 assert.match(controller,/if\(!window\.confirm\('هل تريد اعتماد الاختيارات/);
 assert.match(controller,/loadConflicts\(\)/);
});
