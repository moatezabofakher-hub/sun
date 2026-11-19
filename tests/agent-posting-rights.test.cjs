'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const stub = () => '';
const Agent = {state:{ops:[],knownIds:[],snapshotIds:[],permissions:{deleteOperations:true}},show:stub,toast:stub,save:async()=>{}};
for(const name of ['startInvoice','startVoucher','appendOperation','renderInvoice','renderVoucher','renderOps','balanceFor','cashSummary','changeRowValue','renderStock','renderHome','cashBoxSummary']) Agent[name]=stub;
const ctx = vm.createContext({Agent,confirm:()=>true,console});
for(const src of ['agent-document-edits.js','agent-permissions-3589.js']) {
 const s=fs.readFileSync('field_agent/src/main/assets/www/static/'+src,'utf8');
 vm.runInContext(s,ctx,{filename:src});
}
(async()=>{
 const a={id:'expense1',kind:'expense'}, b={id:'expense2',kind:'expense'};
 Agent.state.ops=[a,b];Agent.busy=true;await Agent.deleteLocalOperation(a.id);
 assert.deepEqual(Agent.state.ops,[a,b]);Agent.busy=false;await Agent.deleteLocalOperation(a.id);assert.deepEqual(Agent.state.ops,[b]);
 Agent.state.knownIds=[b.id];await Agent.deleteLocalOperation(b.id);assert.deepEqual(Agent.state.ops,[b]);
 Agent.state.knownIds=[];const customer={id:'create1',kind:'customer_create',account:{id:'client1'}};
 const sale={id:'sale1',kind:'sale',accountId:'client1'};Agent.state.ops=[customer,sale];
 await Agent.deleteLocalOperation(customer.id);assert.deepEqual(Agent.state.ops,[customer,sale]);
 Agent.editingId='sale1';await assert.rejects(Agent.appendOperation({...sale}),/صلاحية/);
 Agent.state.ops=[];await assert.rejects(Agent.appendOperation({...sale}),/موجودة/);
 console.log('PASS local deletion, linked/posted protection, revoked and stale edits');
})().catch(e=>{console.error(e);process.exitCode=1});
