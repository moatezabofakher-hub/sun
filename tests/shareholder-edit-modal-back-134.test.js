'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const web=path.join(root,'app/src/main/assets/www');
const agent=path.join(root,'field_agent/src/main/assets/www');
const S=require(path.join(web,'static/shareholders-integrated-133.js'));
const seed=()=>({settings:{exchangeRate:15000,shareholderDistribution:{values:{}}},shareholderOwners:[],shareholderMovements:[],
  invoices:[],expenses:[],items:[{id:'a',currency:'USD',units:[{name:'piece',costPrice:5}]}],capitalMovements:[]});
function sale(s,date='2026-11-10'){s.invoices.push({id:'inv-'+s.invoices.length,type:'sale',date,currency:'USD',exchangeRate:15000,rows:[{itemId:'a',unitName:'piece',qty:1,total:25}]})}
test('secure owner editor keeps ID and every financial movement while updating name, phone, and start date',()=>{
 const s=seed(),o=S.addOwner(s,{name:'مساهم',phone:'000',period:'all',at:'2026-11-01T12:00:00Z'});
 S.setDistribution(s,{[o.id]:50});sale(s);
 S.event(s,{type:'contribution',ownerId:o.id,currency:'USD',amount:50});
 const before=JSON.stringify(s.shareholderMovements),id=o.id;
 const updated=S.editOwner(s,id,{name:'مساهم معدل',phone:'111',period:'added'});
 assert.equal(updated.id,id);assert.equal(updated.name,'مساهم معدل');assert.equal(updated.startDate,'2026-11-01');
 assert.equal(updated.phone,'111');assert.equal(s.shareholderOwners.length,1);
 assert.equal(JSON.stringify(s.shareholderMovements),before);
 assert.equal(S.report(s).owners[0].contributionUSD,50);
});
test('editing a start date that invalidates previously withdrawn profits is rejected and rolled back',()=>{
 const s=seed(),o=S.addOwner(s,{name:'صاحب',period:'all',at:'2026-11-01T12:00:00Z'});
 S.setDistribution(s,{[o.id]:100});sale(s,'2026-11-03');sale(s,'2026-11-10');
 S.event(s,{type:'profitDraw',ownerId:o.id,amount:35},{availableCash:100});
 const before=JSON.stringify(s.shareholderOwners);
 assert.throws(()=>S.editOwner(s,o.id,{period:'date',startDate:'2026-11-09'}),/سحب الأرباح يتجاوز/);
 assert.equal(JSON.stringify(s.shareholderOwners),before);
});
test('duplicate names and invalid period cannot be committed',()=>{
 const s=seed(),a=S.addOwner(s,{name:'أحمد'}),b=S.addOwner(s,{name:'سامي'});
 assert.throws(()=>S.editOwner(s,b.id,{name:'أحمد'}),/مكرر/);
 assert.throws(()=>S.editOwner(s,a.id,{period:'date',startDate:'مجهول'}),/تاريخ/);
 assert.equal(S.owner(s,b.id).name,'سامي');
});
test('editing shareholder is gated by the same native biometric/PIN approval as other sensitive manager actions',()=>{
 const js=fs.readFileSync(path.join(web,'static/shareholders-integrated-133.js'),'utf8');
 assert.match(js,/ownerButton\('editOwner',id,/);
 assert.match(js,/ProtectionController\.requestPin\(/);
 assert.match(js,/if\(!cfg\.pinHash\|\|!cfg\.pinSalt\)/);
 assert.match(js,/ownerEditApproval=null;/);
 assert.match(js,/if\(!allowed\)return problem/);
 assert.match(js,/S\.editOwner\(State,id,/);
 assert.doesNotMatch(fs.readFileSync(path.join(agent,'index.html'),'utf8'),/shareholders-integrated-133/);
});
test('all Android variants ignore outside click, and preserve hardware back and explicit dialog buttons',()=>{
 const main=fs.readFileSync(path.join(web,'index.html'),'utf8');
 const staff=fs.readFileSync(path.join(agent,'index.html'),'utf8');
 assert.match(main,/src="static\/popup-backdrop-134\.js"/);
 assert.match(staff,/src="static\/popup-backdrop-134\.js"/);
 assert.doesNotMatch(main,/id="modalContainer"[^>]*onclick=/);
 assert.match(main,/UI\.requestCloseModal\(\)/);
 assert.match(main,/handleBackButton\(\)/);
 assert.match(staff,/Agent\.goBack|static\/agent-ux-3588\.js/);
 const a=fs.readFileSync(path.join(web,'static/popup-backdrop-134.js'),'utf8');
 const b=fs.readFileSync(path.join(agent,'static/popup-backdrop-134.js'),'utf8');
 assert.equal(a,b);assert.match(a,/e\.stopImmediatePropagation\(\)/);
 assert.match(a,/capture:true/);
});
test('backdrop catcher prevents outside clicks only and allows actions inside modal',()=>{
 const handlers={};
 const doc={addEventListener:(kind,cb)=>handlers[kind]=cb};
 const x={PopupBackdrop134:null};
 vm.runInNewContext(fs.readFileSync(path.join(web,'static/popup-backdrop-134.js'),'utf8'),{document:doc,globalThis:x}, {timeout:1500});
 const overlay={contains:c=>c===inner};
 const inner={};
 const outside={closest:q=>q.includes('#modalContainer')?overlay:null};
 const inside={closest:q=>q.includes('#modalContainer')?overlay:(q.includes('#modalBox')?inner:null)};
 assert.equal(x.PopupBackdrop134.outside({target:outside}),true);
 assert.equal(x.PopupBackdrop134.outside({target:inside}),false);
 let hit=0;
 handlers.click({target:outside,cancelable:true,preventDefault(){hit++},stopImmediatePropagation(){hit++}});
 assert.equal(hit,2);
 handlers.click({target:inside,cancelable:true,preventDefault(){hit++},stopImmediatePropagation(){hit++}});
 assert.equal(hit,2);
});
