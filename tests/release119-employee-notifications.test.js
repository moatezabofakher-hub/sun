'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const file=path.join(__dirname,'../field_agent/src/main/assets/www/static/agent-manager-notifications-35107.js');
function harness(){
 const state={companyId:'co1',agentId:'emp1',ops:[],items:[],accounts:[],managerNotifications:[],lastSyncAt:''};
 const Agent={state,screen:'home',onLocalSyncResult:async()=>{},show:async()=>{},ready:()=>true,
 save:async()=>{},toast:()=>{},escape:x=>String(x),can:()=>true,editDocument:(id)=>id};
 const document={addEventListener:()=>{},getElementById:()=>null};
 const ctx=vm.createContext({Agent,document,window:{},console});vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
 return {Agent,ctx};
}
test('119 employee notice diff names exact catalog items and records amount/date for transfers',()=>{
 const {Agent}=harness();
 const before={items:'[]',warehouseTransfers:'[]',company:'[]',companyId:'co1',accounts:'[]'};
 const after={items:JSON.stringify([{id:'i1',name:'مسحوق',price:45}]),
   warehouseTransfers:JSON.stringify([{id:'t1',number:8,amount:100, date:'2026-11-16'}]),accounts:'[]'};
 const notices=Agent.managerNotificationDifferences(before,after);
 assert.ok(notices.some(n=>n.kind==='items'&&/مسحوق/.test(n.detail)));
 assert.ok(notices.some(n=>n.kind==='warehouseTransfers'&&n.targetId==='t1'&&/100/.test(n.detail)));
});
test('119 employee can open only their own document when edit permission is allowed',async()=>{
 const {Agent}=harness();Agent.state.ops=[{id:'own',agentId:'emp1',kind:'sale'},{id:'other',agentId:'emp2',kind:'sale'}];
 Agent.state.managerNotifications=[{id:'x',kind:'ops',targetId:'own'},{id:'y',kind:'ops',targetId:'other'}];
 assert.equal(await Agent.editManagerNotificationOperation('x'),'own');
 assert.equal(await Agent.editManagerNotificationOperation('y'),undefined);
 Agent.can=()=>false;assert.equal(await Agent.editManagerNotificationOperation('x'),undefined);
});
