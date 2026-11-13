'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const main=fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const hubCode=fs.readFileSync('app/src/main/assets/www/static/manager-agent-hub.js','utf8');
const fieldCode=fs.readFileSync('field_agent/src/main/assets/www/static/agent-cash-history.js','utf8');
const fieldCss=fs.readFileSync('field_agent/src/main/assets/www/static/agent-premium.css','utf8');
const icons=fs.readFileSync('app/src/main/assets/www/static/icons.js','utf8');
const header=main.slice(main.indexOf('<header class="ta-app-header'),main.indexOf('<!-- Main Dynamic Viewport -->'));
const nav=main.slice(main.indexOf('<nav class="ta-bottom-nav'),main.indexOf('<!-- Global Modals Container -->'));
assert(header.indexOf('id="headerSettingsBtn"')>=0 && header.indexOf('id="headerSettingsBtn"')<header.indexOf('id="headerBackBtn"'), 'settings rightmost in RTL header');
assert(header.includes('onclick="AppNav.navigate(\'settings\')"'));
assert(icons.includes('"fa-sliders":'), 'offline settings icon is available');
assert(!nav.includes('data-nav="settings"'), 'settings absent from bottom navigation');
assert.equal((nav.match(/class="nav-btn/g)||[]).length,6, 'six tabs remain');
const dashboard=main.slice(main.indexOf('            renderDashboard(main) {'),main.indexOf('            renderItems(main, params = {}) {'));
assert(!dashboard.includes('مندوبو التوزيع'), 'duplicated home shortcut removed');
assert(main.includes("m.inflow > 0 ? 'ta-cash-inflow' : 'ta-cash-outflow'"),'main cash list uses directional row color');
assert(main.includes('.ta-cash-inflow {background:#ecfdf5') && main.includes('.ta-cash-outflow {background:#fff1f2'));
assert(hubCode.includes('ta-agent-hub-manage') && main.includes('.ta-agent-hub-manage'));
const agentId='agent1';
const state={fieldSync:{agents:[{id:agentId,name:'مندوب',warehouseId:'wh_car'}]},warehouses:[{id:'wh_car',name:'السيارة'}]};
const ctx={console,Math,Number,String,Array,Object,JSON,Date,Map,Set,State:state,
 UI:{setHeader:()=>{},openModal:()=>{}},AppEscape:{text:x=>String(x??'')},
 WarehouseController:{name:x=>x}, AppNav:{current:()=>({screen:ctx.screen})},
 Accounting:{format:(x,c)=>`${x} ${c}`},TimeFilter:{mode:x=>x,localDate:()=> '2026-11-13',options:()=>'',matches:()=>true,label:()=>''},
 FieldCash:{summary:()=>({sypCash:60,usdCash:10,movements:[
 {inflow:30,outflow:0,ref:'قبض',party:'زبون',date:'2026-11-13',currency:'SYP',desc:'داخل'},
 {inflow:0,outflow:15,ref:'دفع',party:'مصاريف',date:'2026-11-13',currency:'SYP',desc:'خارج'}]})}};
vm.createContext(ctx);vm.runInContext(hubCode+';globalThis._hub=AgentHub;',ctx);
let view={innerHTML:''};ctx.screen='agent_hub';ctx._hub.renderLanding(view);
assert(view.innerHTML.includes('اختيار المندوب')&&view.innerHTML.includes('ta-agent-hub-manage'));
ctx.screen='agent_detail';ctx._hub.renderDetail(view,state.fieldSync.agents[0]);
const p1=view.innerHTML.indexOf('مناقلة إلى مستودعه'),p2=view.innerHTML.indexOf('مناقلة من مستودعه');
const p3=view.innerHTML.indexOf('استلام دفعة من المندوب'),p4=view.innerHTML.indexOf('إعطاء دفعة للمندوب'),p5=view.innerHTML.indexOf('الصندوق والحركات');
assert(p1<p2 && p2<p3 && p3<p4 && p4<p5,'cash receipt/payment on second row immediately after the two warehouse transfers');
ctx.screen='agent_activity';ctx._hub.renderActivity(view,state.fieldSync.agents[0],{view:'cash'});
assert(view.innerHTML.includes('ta-cash-inflow')&&view.innerHTML.includes('ta-cash-outflow'),'manager agent cash rows both color-coded');
const agent={state:{ops:[],warehouseTransfers:[]},renderHome:()=>'',renderStock:()=>'',show:async()=>{},escape:x=>String(x??''),kindName:()=>'',money:(n,c)=>String(n),ready:()=>true,active:async()=>true};
const agentCtx={Agent:agent,FieldProtocol:{},console,Math,Date,Number,String,Array,Object,Map,Set};
vm.createContext(agentCtx);vm.runInContext(fieldCode,agentCtx);
agent.cashSummary=()=>({syp:0,usd:0,movements:[{amount:12,currency:'USD',desc:'قبض',date:'2026-11-13'},{amount:-3,currency:'USD',desc:'دفع',date:'2026-11-13'}]});
const agentHtml=agent.renderCashbox();
assert(agentHtml.includes('agent-cash-inflow')&&agentHtml.includes('agent-cash-outflow'));
assert(fieldCss.includes('.agent-cash-inflow {background:#ecfdf5')&&fieldCss.includes('.agent-cash-outflow {background:#fff1f2'));
console.log('PASS 3.5.40: right header settings, home shortcut removed, manager agent hub layout, green-in/red-out cash movements in both apps.');
