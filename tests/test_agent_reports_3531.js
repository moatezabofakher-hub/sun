/* Regression: representative attribution survives archive and both report views. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const cut=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const calls=[];
const State={settings:{companyName:'SAN SHINE',exchangeRate:1000},fieldSync:{agents:[{id:'agent_a',name:'المندوب أحمد',archived:false},{id:'agent_b',name:'المندوب خالد',archived:true}]},
 items:[{id:'i',name:'صابون',currency:'USD',category:'تنظيف',units:[{name:'حبة',factor:1,costPrice:3}]}],accounts:[],expenses:[{date:'2026-11-13',amount:2,currency:'USD'}],
 invoices:[
  {id:'a1',number:1,type:'sale',date:'2026-11-13',currency:'USD',netTotal:20,rows:[{itemId:'i',qty:2,price:10,total:20,unitName:'حبة'}],fieldOrigin:{agentId:'agent_a',agentName:'المندوب أحمد'}},
  {id:'a2',number:2,type:'sale_return',date:'2026-11-13',currency:'USD',netTotal:10,rows:[{itemId:'i',qty:1,price:10,total:10,unitName:'حبة'}],fieldOrigin:{agentId:'agent_a',agentName:'المندوب أحمد'}},
  {id:'b1',number:3,type:'sale',date:'2026-11-13',currency:'USD',netTotal:40,rows:[{itemId:'i',qty:4,price:10,total:40,unitName:'حبة'}],fieldOrigin:{agentId:'agent_b',agentName:'المندوب خالد'}},
  {id:'main1',number:4,type:'sale',date:'2026-11-13',currency:'USD',netTotal:50,rows:[{itemId:'i',qty:5,price:10,total:50,unitName:'حبة'}]}
 ]};
const sandbox={State,console,Date,Math,Map,Set,Array,Object,Number,String,JSON,Intl,
 Accounting:{round:(n,c)=>Math.round(n*(c==='USD'?100:1))/(c==='USD'?100:1),format:(v,c)=>Number(v).toFixed(2)+' '+c,formatItemQuantity:v=>String(v),getAccountStatement:()=>({usdBalance:0,sypBalance:0})},
 AppEscape:{text:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;')},
 UI:{setHeader(){}},AppNav:{navigate:(...args)=>calls.push(args)},ThermalPrinter:{printSummaryReport:(v)=>{calls.push(v);return v}}
};sandbox.globalThis=sandbox;
vm.runInNewContext(cut('const TimeFilter =','/** Currency selection')+'\n'+cut('const ReportAgentFilter =','const Views =')+'\nglobalThis.R={ReportAgentFilter,LedgerReports}',sandbox);
const {ReportAgentFilter:F,LedgerReports:R}=sandbox.R;
assert.equal(F.entries().length,2);
assert.match(F.label('agent_b'),/مؤرشف/);
assert.equal(F.matches(State.invoices[0],'agent_a'),true);
assert.equal(F.matches(State.invoices[0],'agent_b'),false);
assert.equal(F.matches(State.invoices[3],'office'),true);
assert.equal(R.sales('all','','','agent_a').totals.USD,10);
assert.equal(R.sales('all','','','agent_b').totals.USD,40);
assert.equal(R.sales('all','','','office').totals.USD,50);
assert.equal(R.sales('all','','','all').totals.USD,100);
const main={innerHTML:''};R.render(main,{tab:'sales_summary',period:'all',agentId:'agent_b'});
assert.match(main.innerHTML,/اختيار المندوب لتقرير المبيعات/);
assert.match(main.innerHTML,/المندوب خالد/);
R.goPeriod('today');assert.equal(calls[0][1].agentId,'agent_b');
R.print();assert.match(calls[1].title,/المندوب خالد/);
// The complete P&L screen uses the exact same attribution helper and does not
// subtract head-office expenses from an agent who has no assigned expense.
const profitSnippet=cut('renderReports(main, params = {})','// ==================== 6.9 SETTINGS');
assert.match(profitSnippet,/ReportAgentFilter\.matches\(inv,agentId\)/);
assert.match(profitSnippet,/ReportAgentFilter\.matches\(exp,agentId\)/);
assert.match(profitSnippet,/sale_return/);
assert.match(profitSnippet,/ReportAgentFilter\.options\(agentId\)/);
assert.match(profitSnippet,/مصاريف الشركة العامة غير موزعة/);
console.log('PASS: separate sales by agent including archived, office and aggregate; returns, period and print filters; profit expense boundaries.');
