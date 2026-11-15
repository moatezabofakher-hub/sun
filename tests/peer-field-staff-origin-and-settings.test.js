'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs');
const merge=require('../app/src/main/assets/www/static/tiqany-peer-merge.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'../app/src/main/assets/www/index.html'),'utf8');
const controller=fs.readFileSync(require('node:path').join(__dirname,'../app/src/main/assets/www/static/tiqany-peer-controller.js'),'utf8');
const state=(fieldSync={})=>({settings:{companyName:'مؤسسة'},categories:[],items:[],accounts:[],invoices:[],vouchers:[],warehouses:[],transfers:[],expenses:[],fieldSync});
const agent=(id,name='أحمد')=>({id,name,warehouseId:'wh_agent',key:'secret-agent-key',createdAt:'2026-01-01'});
test('offline staff created on the phone synchronizes to the computer with its stable ID and auth key',()=>{
 const phone=merge.snapshot(state({companyId:'business-x',agents:[agent('agent-1')]})), computer=merge.snapshot(state());
 const res=merge.merge(null,phone,computer);assert.equal(res.ok,true);assert.equal(res.snapshot.fieldAgents.length,1);
 const dest=state({companyId:'',agents:[],imported:[],events:[],cashTransfers:[]});merge.apply(dest,res.snapshot);
 assert.equal(dest.fieldSync.agents[0].key,'secret-agent-key');assert.equal(dest.fieldSync.companyId,'business-x');
});
test('staff creations on both devices combine without losing staff or duplicating original agent IDs',()=>{
 const b=merge.snapshot(state({companyId:'business-x',agents:[]}));
 const p=merge.snapshot(state({companyId:'business-x',agents:[agent('phone')]}));
 const c=merge.snapshot(state({companyId:'business-x',agents:[agent('main_phone')]}));
 const res=merge.merge(b,p,c);assert.equal(res.ok,true);assert.deepEqual(res.snapshot.fieldAgents.map(a=>a.id).sort(),['main_phone','phone']);
});
test('different concurrent edits to the same employee require explicit resolution',()=>{
 const b=merge.snapshot(state({companyId:'business-x',agents:[agent('employee')]}));
 const p=merge.snapshot(state({companyId:'business-x',agents:[agent('employee','موبايل')]}));
 const c=merge.snapshot(state({companyId:'business-x',agents:[agent('employee','كمبيوتر')]}));
 const res=merge.merge(b,p,c);assert.equal(res.ok,false);const conflict=res.details.find(x=>x.collection==='fieldAgents');assert.ok(conflict);
 const fixed=merge.merge(b,p,c,{[conflict.id]:{signature:conflict.signature,side:'phone'}});
 assert.equal(fixed.ok,true);assert.equal(fixed.snapshot.fieldAgents[0].name,'موبايل');
});
test('company identities of separately commissioned field teams conflict rather than silently replacing a paired employee',()=>{
 const p=merge.snapshot(state({companyId:'first',agents:[agent('a')]}));
 const c=merge.snapshot(state({companyId:'second',agents:[agent('b')]}));
 const res=merge.merge(null,p,c);assert.equal(res.ok,false);assert.ok(res.details.some(x=>x.collection==='fieldCompany'));
});
test('staff import IDs, cash transfers and field events propagate with deduplication',()=>{
 const data={companyId:'field',agents:[agent('a')],imported:[{id:'remote-op',agentId:'a'}],events:[{id:'event1',count:1}],cashTransfers:[{id:'cash1',amount:12}],operationHistory:[{id:'remote-op',kind:'sale'}]};
 const p=merge.snapshot(state(data));const c=merge.snapshot(state());const m=merge.merge(null,p,c);assert.equal(m.ok,true);
 const target=state();merge.apply(target,m.snapshot);
 assert.equal(target.fieldSync.imported.length,1);assert.equal(target.fieldSync.cashTransfers.length,1);
 const twice=merge.merge(m.snapshot,m.snapshot,m.snapshot);assert.equal(twice.ok,true);assert.equal(twice.snapshot.fieldImported.length,1);
});
test('source labels are included on new document saves and in operation lists',()=>{
 for(const coll of ['invoices','vouchers','expenses'])assert.match(html,new RegExp((coll==='invoices'?'cleanDoc':coll==='vouchers'?'clean':'expense')+"\\.createdOnDevice='main_phone'"));
 assert.match(html,/OriginBadge\.html\(inv\)/);assert.match(html,/OriginBadge\.html\(v\)/);assert.match(html,/OriginBadge\.html\(e\)/);
});
test('settings line stays before pairing, with the new connected-device pictogram',()=>{
 const start=html.indexOf('data-app-build=');const end=html.indexOf('settings-section',start);
 assert.ok(start>=0&&end>start);assert.match(controller,/ta-connected-devices-icon/);
 assert.match(controller,/querySelector\('\[data-app-build\]'\)/);assert.match(controller,/afterend/);
});
