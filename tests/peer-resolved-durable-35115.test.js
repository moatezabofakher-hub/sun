'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const merge=require('../app/src/main/assets/www/static/tiqany-peer-merge');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/static/tiqany-peer-controller.js'),'utf8');
const invoice=q=>({id:'inv-1',type:'sale',number:1,currency:'SYP',accountId:'client',netTotal:100*q,rows:[{itemId:'unit',qty:q}]});
function state(q){return {settings:{companyUid:'business_'+'a'.repeat(32),companyName:'Firm',exchangeRate:14000},invoices:q===null?[]:[invoice(q)],items:[],categories:[],accounts:[],vouchers:[],warehouses:[],transfers:[],expenses:[]};}
function snap(q){return merge.snapshot(state(q));}
function resolved(base,phone,win,which){const initial=merge.merge(base,phone,win);assert.equal(initial.ok,false);const d=initial.details.find(x=>x.collection==='invoices');assert.ok(d);const approved=merge.merge(base,phone,win,{[d.id]:{side:which,signature:d.signature}});assert.equal(approved.ok,true);assert.ok(approved.resolvedReceipts.length);return approved.resolvedReceipts;}
test('archived manager approval survives reboot, stale ancestor and re-pair; no duplicate financial posting',()=>{
 const base=snap(1),phone=snap(2),win=snap(3),receipts=resolved(base,phone,win,'phone');
 for(const ancestor of [null,base,phone]){
   const again=merge.merge(ancestor,phone,win,{},receipts);
   assert.equal(again.ok,true);assert.equal(again.snapshot.invoices.length,1);
   assert.equal(again.snapshot.invoices[0].netTotal,200);
 }
 assert.equal(merge.combineReceipts(receipts,receipts).length,1);
 const edited=merge.merge(phone,snap(4),win,{},receipts);
 assert.equal(edited.ok,false,'new business change must not be hidden by an old decision');
});
test('an accepted deletion is a durable tombstone; new edits to deleted IDs require human approval',()=>{
 const b=snap(1),phone=snap(null),win=snap(3),receipts=resolved(b,phone,win,'phone');
 assert.equal(merge.merge(null,phone,win,{},receipts).snapshot.invoices.length,0);
 assert.equal(merge.merge(phone,phone,win,{},receipts).snapshot.invoices.length,0);
 const newEdit=merge.merge(phone,phone,snap(7),{},receipts);
 assert.equal(newEdit.ok,false);assert.match(newEdit.conflicts.join(' '),/نسخة جديدة بعد حذف محسوم/);
});
test('opposite durable decisions fail closed, even if previous base would auto-select one side',()=>{
 const b=snap(1),phone=snap(2),win=snap(3),rr=resolved(b,phone,win,'phone');
 const conflict=merge.merge(b,phone,win).details[0];
 const other=merge.resolutionReceipt(conflict,'computer');
 const m=merge.merge(phone,phone,win,{},merge.combineReceipts(rr,[other]));
 assert.equal(m.ok,false);assert.match(m.conflicts.join(' '),/قرارات سابقة متناقضة/);
});
test('old 3.5.114 receipt shape is accepted but malformed receipts are ignored',()=>{
 const old=resolved(snap(1),snap(2),snap(3),'computer')[0];
 assert.equal(merge.validReceipt(old),true);
 assert.equal(merge.combineReceipts([old,{...old,id:'unrelated'},null,{}]).length,1);
 assert.equal(merge.merge(null,snap(2),snap(3),{},[old]).snapshot.invoices[0].netTotal,300);
});
function view(desktop,q,db){
 const State=state(q);let counter=0;
 const profile={activeId:'business-A',getRecord:async id=>db.get(id)||null,putBatch:async rows=>{for(const r of rows)db.set(r.id,r);},makeCheckpoint:async()=>{counter++;}};
 const doc={head:{append(){}},createElement(){return {textContent:''}},getElementById(){return null},addEventListener(){}};
 const w={TiqanyPeerMerge:merge,confirm:()=>true};
 const ctx={State,window:w,document:doc,ProfileManager:profile,console,confirm:()=>true,UI:{toast(){}},StorageEngine:{saveState:async()=>{}},Views:{renderSettings(){}},AppNav:{isDirty:false,isModalDirty:false,activeOperationGuard:false,current(){return {screen:'settings'};},renderCurrent(){}},SettingsDraftController:{changed(){return false}},setTimeout,clearTimeout,setInterval(){return 1;}};
 if(desktop){w.WindowsPeerSync={config:async()=>({serverId:'ab'.repeat(16),key:'key',ips:['192.168.1.2'],port:39271,ready:true}),reply(){},changed(){}};ctx.WindowsPeerSync=w.WindowsPeerSync;w.WindowsDesktop={onPeerRequest(){}};}
 else{ctx.AndroidPeerSync={status:()=>JSON.stringify({host:'192.168.1.2',port:39271,approved:true}),request(){},approve(){},bindServerId(){return true;},configure(){return 'saved';}};w.AndroidPeerSync=ctx.AndroidPeerSync;}
 vm.runInNewContext(source,ctx);
 return {peer:w.TiqanyPeerSync,w,ctx,db,State,profile,checkpoints:()=>counter};
}
test('two-manager sync persists and exchanges receipts; stale Windows copy cannot come back',async()=>{
 const serverStore=new Map(),phoneStore=new Map();
 const win=view(true,3,serverStore),phone=view(false,2,phoneStore);
 const base=snap(1),serverId='ab'.repeat(16);
 phoneStore.set('peer_mobile_base:business-A',{id:'peer_mobile_base:business-A',data:{serverId,serverProfileId:'business-A',profileId:'business-A',snapshot:base}});
 let requestID=0;
 win.w.WindowsPeerSync.reply=(id,answer)=>queueMicrotask(()=>phone.w.__tiqanyPeerReply(JSON.stringify(answer)));
 phone.ctx.AndroidPeerSync.request=raw=>queueMicrotask(()=>win.peer.handleRequest({requestId:String(++requestID),data:JSON.parse(raw)}));
 await win.w.onload();await phone.w.onload();
 await phone.peer.sync(false);
 assert.equal(phone.peer.conflictLog.details.length,1);
 await win.peer.chooseConflict(0,'phone');await win.peer.confirmConflicts();
 assert.equal(await phone.peer.sync(false),true);
 assert.equal(win.State.invoices[0].netTotal,200);
 const archive=serverStore.get('peer_conflict_audit:business-A')?.data;
 assert.equal(archive.entries.length,1);
 assert.equal(phoneStore.get('peer_conflict_audit:business-A').data.entries.length,1);
 // Simulate Windows restoring a stale version; and the Android re-pairing after
 // losing its base. Both cases previously reopened the same conflict.
 win.State.invoices=[invoice(3)];
 phoneStore.delete('peer_mobile_base:business-A');
 assert.equal(await phone.peer.sync(false),true);
 assert.equal(win.State.invoices[0].netTotal,200);
 assert.equal(phone.State.invoices[0].netTotal,200);
 assert.equal(phone.peer.conflictLog,null);assert.equal(win.peer.conflictLog,null);
 assert.equal(serverStore.get('peer_conflict_audit:business-A').data.entries.length,1);
});
test('explicit later manager choice replaces opposite archived verdict, preserving new final verdict',async()=>{
 const base=snap(1),p=snap(2),w=snap(3),approved=resolved(base,p,w,'phone')[0];
 const issue=merge.merge(base,p,w).details[0],contrary=merge.resolutionReceipt(issue,'computer');
 const two=merge.combineReceipts([approved,contrary]);
 assert.equal(merge.merge(p,p,w,{},two).ok,false);
 const selected=merge.merge(p,p,w,{[issue.id]:{side:'computer',signature:merge.merge(p,p,w,{},two).details[0].signature}},two);
 assert.equal(selected.ok,true);
 const winner=selected.resolvedReceipts.find(x=>x.chosen==='computer');assert.ok(winner);
 const archive=merge.combineReceipts(merge.retireOppositeReceipts(two,[winner]),[winner]);
 assert.equal(archive.length,1);
 assert.equal(merge.merge(p,p,w,{},archive).snapshot.invoices[0].netTotal,300);
});
test('staff-origin duplicate conflict is accepted by desktop and resolved once, not reintroduced',async()=>{
 const winStore=new Map(),phoneStore=new Map();
 const win=view(true,null,winStore),phone=view(false,null,phoneStore);
 const fieldOrigin={agentId:'agent-1',operationId:'stable-123'};
 win.State.invoices=[{...invoice(3),id:'win-id',fieldOrigin}];
 phone.State.invoices=[{...invoice(2),id:'phone-id',fieldOrigin}];
 const base=snap(null),serverId='ab'.repeat(16);
 phoneStore.set('peer_mobile_base:business-A',{id:'peer_mobile_base:business-A',data:{serverId,serverProfileId:'business-A',profileId:'business-A',snapshot:base}});
 let next=0;
 win.w.WindowsPeerSync.reply=(id,answer)=>queueMicrotask(()=>phone.w.__tiqanyPeerReply(JSON.stringify(answer)));
 phone.ctx.AndroidPeerSync.request=raw=>queueMicrotask(()=>win.peer.handleRequest({requestId:String(++next),data:JSON.parse(raw)}));
 await win.w.onload();await phone.w.onload();
 assert.equal(await phone.peer.sync(false),false);
 assert.equal(win.peer.conflictLog?.details?.[0]?.kind,'duplicate');
 await win.peer.chooseConflict(0,'phone');await win.peer.confirmConflicts();
 assert.equal(await phone.peer.sync(false),true);
 assert.equal(win.State.invoices.length,1);assert.equal(win.State.invoices[0].id,'phone-id');
 assert.equal(phone.State.invoices.length,1);
 assert.equal(await phone.peer.sync(false),true);
 assert.equal(win.peer.conflictLog,null);
});
test('portable JSON backup exports and restore code retains only own-company decisions',()=>{
 for(const html of ['../app/src/main/assets/www/index.html','../../windows/web/index.html']){
  const text=fs.readFileSync(path.join(__dirname,html),'utf8');
  assert.match(text,/payload\.peerConflictResolutions/);
  assert.match(text,/sourceBackup\?\.profileId===this\.activeId/);
  assert.match(text,/async applyRestore\(d, sourceBackup=null\)/);
 }
});
