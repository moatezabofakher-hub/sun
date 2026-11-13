'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const root=__dirname+'/../';
const main=fs.readFileSync(root+'app/src/main/assets/www/index.html','utf8');
const agent=fs.readFileSync(root+'field_agent/src/main/assets/www/static/agent-invoice-parity.js','utf8');
const native=fs.readFileSync(root+'app/src/main/java/com/sunshine/accounting/MainActivity.java','utf8');
assert(main.includes('id="headerNotificationsBtn"')&&main.includes('id="headerNotificationsCount"'));
assert(main.includes("case 'notifications': return ManagerNotifications.render(main)"));
assert(main.includes('ManagerNotifications.bootstrap();'));
assert(native.includes('postLedgerNotification')&&native.includes('onNewIntent(Intent intent)'));
assert(fs.readFileSync(root+'app/src/main/AndroidManifest.xml','utf8').includes('POST_NOTIFICATIONS'));
assert(agent.includes('نفدت كمية المادة')&&agent.includes('outOfStock?'));
(async()=>{
 let fail=false, persist=0;
 const moves=[],notified=[];
 const a={id:'agent_test',name:'مندوب أ'},itm={id:'item1',name:'جلي',units:[{name:'قطعة',factor:1}]};
 const State={fieldSync:{agents:[a],imported:[],operationHistory:[]},items:[itm],warehouses:[{id:'wh_main',name:'الرئيسي'}],invoices:[],vouchers:[],expenses:[],accounts:[],alertCenter:{entries:[],seenImportIds:null,stockLevels:null}};
 let qty=2;
 const ctx={State,console,window:{AndroidAlerts:{show:(...args)=>notified.push(args)}},AppEscape:{text:x=>String(x).replaceAll('&','&amp;')},
   StorageEngine:{saveState:async()=>{if(fail)throw Error('disk full');persist++;}},
   Accounting:{getItemBaseStock:()=>qty},
   document:{getElementById:()=>null},
   AppNav:{current:()=>({screen:'dashboard'}),navigate:(...args)=>moves.push(args)},
   UI:{setHeader:()=>{},toast:()=>{},openModal:()=>{}}};
 vm.runInNewContext(fs.readFileSync(root+'app/src/main/assets/www/static/manager-notifications.js','utf8')+'\nglobalThis.ManagerNotifications=ManagerNotifications;',ctx);
 const N=ctx.ManagerNotifications;
 N.bootstrap();assert.equal(State.alertCenter.entries.length,0);
 await ctx.StorageEngine.saveState();assert.equal(State.alertCenter.entries.length,0);
 // Reached zero => one notification; another save => no duplicate.
 qty=0;await ctx.StorageEngine.saveState();assert.equal(State.alertCenter.entries.length,1);
 assert.equal(State.alertCenter.entries[0].type,'stock');assert.equal(notified.length,1);
 await ctx.StorageEngine.saveState();assert.equal(State.alertCenter.entries.length,1);
 // Restocking and depleting again creates another notification.
 qty=5;await ctx.StorageEngine.saveState();qty=0;await ctx.StorageEngine.saveState();assert.equal(State.alertCenter.entries.length,2);
 // One new agent invoice + a document revision: one notification per committed ID.
 const op={id:'op_111',kind:'sale',localNumber:'F-1',agentId:a.id};
 const revision={id:'op_rev_2',kind:'document_edit',targetOperationId:'op_111',originalKind:'sale',revision:1};
 State.fieldSync.operationHistory=[op,revision];
 State.fieldSync.imported=[{id:op.id,agentId:a.id,kind:op.kind,receivedAt:'2026-11-13T00:00:00Z'},{id:revision.id,agentId:a.id,kind:revision.kind,receivedAt:'2026-11-13T00:01:00Z'}];
 State.invoices=[{id:'field_op_111'}];
 await ctx.StorageEngine.saveState();assert.equal(State.alertCenter.entries.filter(x=>x.type==='agent').length,2);
 assert.equal(State.alertCenter.entries[0].action,'تعديل');
 await ctx.StorageEngine.saveState();assert.equal(State.alertCenter.entries.filter(x=>x.type==='agent').length,2);
 const alert=State.alertCenter.entries.find(x=>x.operationId===op.id);await N.open(alert.id);
 assert.equal(moves[0][0],'invoice_print');assert.equal(moves[0][1].id,'field_op_111');
 // A failed save does not mark an import notified or show OS notifications.
 State.fieldSync.imported.push({id:'op_222',agentId:a.id,kind:'receipt'});
 const size=State.alertCenter.entries.length,os=notified.length;
 fail=true;await assert.rejects(ctx.StorageEngine.saveState(),/disk full/);
 assert.equal(State.alertCenter.entries.length,size);assert.equal(notified.length,os);
 fail=false;await ctx.StorageEngine.saveState();assert.equal(State.alertCenter.entries.length,size+1);
 console.log('PASS 3.5.47 stock transition, syncing, tap-through, no duplicates and rollback');
})();
