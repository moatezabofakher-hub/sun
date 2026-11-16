const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const dir=path.join(__dirname,'../field_agent/src/main/assets/www/static');
function setup(){
  const alert={hidden:true},count={hidden:true,textContent:''};
  const state={companyId:'comp-1',exchangeRate:15000,managerPublishedRate:15000,items:[],accounts:[],stock:{},categories:[],warehouseTransfers:[],cashTransfers:[],ops:[]};
  let saved=0;
  const agent={state,screen:'home',ready:()=>true,escape:t=>String(t).replaceAll('<','&lt;'),save:async function(){saved++;},
    onLocalSyncResult:async function(input){if(input==='failure'){this.lanSyncMessage='network error';return;}this.state={...this.state,...input};this.lanSyncMessage='✅ تمت المزامنة';},
    show:async function(s){this.screen=s;},goBack:async function(){},navigate:async function(s){this.screen=s;}};
  const ui={getElementById:id=>id==='agentManagerNotifications'?alert:id==='agentManagerNotificationCount'?count:null,addEventListener:()=>{}};
  const ctx=vm.createContext({Agent:agent,document:ui,console,Date});
  vm.runInContext(fs.readFileSync(path.join(dir,'agent-manager-notifications-35107.js'),'utf8'),ctx);
  return {agent,alert,count,saved:()=>saved};
}
test('authenticated manager rate/item changes do not double-alert on their stock consequences',async()=>{
 const {agent,alert,count,saved}=setup();
 await agent.onLocalSyncResult({managerPublishedRate:15400,items:[{id:'i1',name:'مادة'}],stock:{i1:3}});
 assert.equal(agent.state.managerNotifications.length,2);
 assert.equal(agent.state.managerNotifications.find(n=>n.kind==='exchangeRate').title,'تعديل سعر الصرف');
 assert.equal(count.textContent,'2');assert.equal(alert.hidden,false);
 assert.ok(saved()>0);
 // Same snapshot must not repeat notifications on every heartbeat.
 await agent.onLocalSyncResult({managerPublishedRate:15400,items:[{id:'i1',name:'مادة'}],stock:{i1:3}});
 assert.equal(agent.state.managerNotifications.length,2);
});
test('failed unauthenticated synchronization cannot create manager notifications',async()=>{
 const {agent,saved}=setup();await agent.onLocalSyncResult('failure');
 assert.equal(agent.state.managerNotifications,undefined);assert.equal(saved(),0);
});
test('employee point of sale footer and invoice currency match manager layout',()=>{
 const pos=fs.readFileSync(path.join(dir,'agent-pos.js'),'utf8');
 const inv=fs.readFileSync(path.join(dir,'agent-invoice-parity.js'),'utf8');
 const css=fs.readFileSync(path.join(dir,'agent-forms-35107.css'),'utf8');
 assert.match(pos,/agentPosFooterDue/);assert.match(pos,/Agent\.saveInvoice\(true\)/);
 assert.match(inv,/\$USD/);assert.match(css,/ta-agent-invoice-save-footer/);assert.match(css,/ta-agent-pos-footer/);
 assert.match(css,/ta-agent-voucher-footer/);
});
