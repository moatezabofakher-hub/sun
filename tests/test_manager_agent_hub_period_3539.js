'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const hub=fs.readFileSync('app/src/main/assets/www/static/manager-agent-hub.js','utf8');
const agentId='agent_test',carId='car_test';
const state={settings:{defaultViewPeriod:'month',defaultViewStart:'2026-11-01',defaultViewEnd:'2026-11-30'},
 fieldSync:{agents:[{id:agentId,name:'مندوب الاختبار',vehicleName:'سيارة تجريبية',warehouseId:carId}],cashTransfers:[{agentId,direction:'fromAgent',amount:4,currency:'USD',date:'2026-11-13',id:'cash1'}]},
 warehouses:[{id:'wh_main',name:'المستودع الرئيسي'},{id:carId,name:'مستودع المندوب'}],
 invoices:[{id:'invoice1',number:1,date:'2026-11-13',netTotal:25,currency:'USD',fieldOrigin:{agentId,localNumber:'S-1'}}],vouchers:[],expenses:[],items:[{id:'i1',name:'منظف',units:[{name:'عبوة'}]}],transfers:[]};
const calls=[];let lastModal='';
const cx={State:state,console,Math,Date,Map,Set,Number,String,Array,Object,JSON,
 Accounting:{format:(x,c)=>String(x)+' '+c,formatItemQuantity:x=>String(x),getItemBaseStock:()=>9},
 AppEscape:{text:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')},
 AppNav:{current:()=>({screen:cx.screen}),navigate:(...args)=>calls.push(args),handleBackButton:()=>calls.push(['back'])},
 UI:{setHeader:()=>{},openModal:x=>{lastModal=x},forceCloseModal:()=>{},toast:x=>calls.push(['toast',x])},
 FieldCash:{summary:()=>({sypCash:123,usdCash:42,movements:[{date:'2026-11-13',inflow:20,outflow:0,currency:'USD',ref:'سند',party:'زبون',desc:'قبض'}, {date:'2025-01-01',inflow:15,outflow:0,currency:'USD',ref:'قديم',party:'زبون',desc:'قديم'}]}),warehouseDocuments:()=>[{id:'T-1',date:'2026-11-13',fromName:'الرئيسي',toName:'السيارة',lines:[{}]}],openTransfer:(...args)=>calls.push(['cashTransfer',...args])},
 FieldSync:{open:()=>{},showEditAgent:()=>{},showSyncTools:()=>{}},
 WarehouseController:{name:id=>id}};
vm.createContext(cx);
const tCode=html.slice(html.indexOf('const TimeFilter = {'),html.indexOf('/** Currency selection'));
vm.runInContext(tCode+'\nglobalThis.TimeFilter=TimeFilter;',cx);
vm.runInContext(hub+'\nglobalThis.AgentHub=AgentHub;',cx);
assert.equal(cx.TimeFilter.defaultMode(),'month');
assert.equal(cx.TimeFilter.matches('2026-11-12','range','2026-11-01','2026-11-30'),true);
assert.equal(cx.TimeFilter.matches('2026-12-02','range','2026-11-01','2026-11-30'),false);
assert.equal(cx.TimeFilter.matches('2026-11-13','all'),true);
assert.match(html,/data-nav="agent_hub"/);
assert.match(html,/<span class="text-\[10px\]">المواد<\/span>/);
assert.match(html,/const bottomDestinations = new Set\(\['dashboard','invoices_list','items','accounts','agent_hub','reports','settings'\]\)/);
assert.match(html,/case 'agent_hub': case 'agent_detail': case 'agent_activity'/);
assert.match(html,/data-settings-section="default_period"/);
assert.match(html,/setDefaultViewPeriod/);
assert.match(html,/State\.settings\.defaultViewPeriod=mode/);
let main={innerHTML:''};cx.screen='agent_hub';cx.AgentHub.render(main,{});
assert.match(main.innerHTML,/اختيار المندوب/);assert.doesNotMatch(main.innerHTML,/مناقلة إلى مستودعه/);
cx.AgentHub.choose();assert.match(lastModal,/مندوب الاختبار/);
cx.AgentHub.select(agentId);assert.equal(calls.at(-1)[0],'agent_detail');
cx.screen='agent_detail';cx.AgentHub.render(main,{agentId});
for(const text of ['مناقلة إلى مستودعه','مناقلة من مستودعه','الصندوق والحركات','تعديل المندوب','فواتير المندوب','جرد مستودع المندوب'])assert.ok(main.innerHTML.includes(text),text);
cx.AgentHub.transfer(agentId,'toAgent');assert.equal(calls.at(-1)[1].transferDirection,'toAgent');assert.equal(calls.at(-1)[1].transferAgentId,agentId);
cx.AgentHub.transfer(agentId,'fromAgent');assert.equal(calls.at(-1)[1].transferDirection,'fromAgent');
cx.screen='agent_activity';cx.AgentHub.render(main,{agentId,view:'cash'});
assert.match(main.innerHTML,/42 USD/);assert.match(main.innerHTML,/قديم/);assert.match(main.innerHTML,/كل المدة/);
cx.AgentHub.render(main,{agentId,view:'cash',period:'custom',date:'2026-11-13'});
assert.match(main.innerHTML,/سند/);assert.doesNotMatch(main.innerHTML,/قديم/);
cx.AgentHub.render(main,{agentId,view:'stock'});assert.match(main.innerHTML,/9 عبوة/);
cx.AgentHub.render(main,{agentId,view:'invoices',period:'all'});assert.match(main.innerHTML,/S-1/);
assert.equal(state.invoices.length,1,'views must not mutate financial operations');
assert.equal(state.fieldSync.cashTransfers.length,1,'views must not mutate cash transfers');
console.log('PASS 3.5.39: manager dock, agent picker, per-agent tools, transfer routing, cash all-time balance and period filtering, stock and invoice histories, global default period.');
