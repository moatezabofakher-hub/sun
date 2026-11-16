'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..','field_agent/src/main/assets/www');
const load=p=>fs.readFileSync(path.join(root,p),'utf8');
function fixture(){
 const cells=new Map();let footer=null;
 const doc={getElementById:id=>cells.get(id)||null,querySelector:s=>s==='.ta-agent-invoice-save-footer'?footer:null,querySelectorAll:()=>[],addEventListener:()=>{}};
 const w={};const context={window:w,document:doc,Date,Number,String,Map,Set,Array,Object,JSON,Promise,console,Intl,setTimeout,clearTimeout};
 vm.createContext(context);context.FieldProtocol=require('../field_agent/src/main/assets/www/static/field-protocol.js');
 vm.runInContext(load('static/invoice-dual-balances.js'),context);context.InvoiceDualBalances=context.window.InvoiceDualBalances;
 vm.runInContext(load('static/draft-invoice-balance-preview.js'),context);
 for(const f of ['agent.js','agent-experience.js','agent-invoice-parity.js'])vm.runInContext(load('static/'+f),context,{filename:f});
 const a=vm.runInContext('Agent',context);
 a.state={companyId:'c',agentId:'e',warehouseId:'w',vehicleName:'مستودع السيارة',exchangeRate:15000,accounts:[{id:'c1',name:'عميل',sypBalance:9000,usdBalance:40}],items:[{id:'i1',name:'منظف',currency:'USD',units:[{name:'علبة',factor:1,salePrice:2,wholesalePrice:2}]}],stock:{i1:100},ops:[],snapshotIds:[],permissions:{balances:true,currency:true}};
 a.currency='USD';a.draftKind='sale';a.invoiceMeta={accountId:'c1',currency:'USD',paymentMode:'partial',paid:'1',date:'2026-11-16T13:00'};
 a.draft=[{itemId:'i1',itemName:'منظف',unitName:'علبة',unitFactor:1,qty:2,price:2,total:4}];
 const before={textContent:''},after={textContent:''};footer={querySelector:s=>s==='#agentDraftBalanceBefore'?before:s==='#agentDraftBalanceAfter'?after:null};
 return {a,doc,context,cells,before,after};
}
test('employee invoice badge shows selected SYP and USD labels, not long names',()=>{
 const {a}=fixture();
 const usd=a.renderInvoice();assert.match(usd,/ta-invoice-currency-code/);assert.match(usd,/>\$ USD<\/strong>/);assert.doesNotMatch(usd,/ta-invoice-currency-code[^<]*>الدولار/);
 a.currency='SYP';a.invoiceMeta.currency='SYP';const syp=a.renderInvoice();assert.match(syp,/>ل\.س<\/strong>/);
 assert.match(load('static/agent-ux-3588.js'),/badge\.textContent=code/);
 assert.doesNotMatch(load('static/agent-ux-3588.js'),/الدولار الأمريكي/);
});
test('live invoice footer projects every draft quantity change; fully cash-paid sale stays debt-neutral',()=>{
 const {a,before,after}=fixture();a.paintDraftBalance();
 assert.match(before.textContent,/40\.00/);assert.match(after.textContent,/43\.00/);
 a.changeRowValue(0,'qty','4');assert.match(after.textContent,/47\.00/);
 a.invoiceMeta.paymentMode='cash';a.refreshInvoiceTotals();assert.match(after.textContent,/40\.00/);
 assert.equal(a.invoiceCalc().netTotal,8);
});
test('voucher has only its dedicated save and cancel footer, both wired to protected actions',()=>{
 const {a}=fixture();a.voucherKind='receipt';const html=a.renderVoucher();
 assert.match(html,/class="ta-agent-voucher-actions ta-agent-voucher-footer"/);
 assert.match(html,/onclick="Agent\.saveVoucher\(\)"/);assert.match(html,/onclick="Agent\.goBack\(\)"/);
 const styles=load('static/agent-operation-footers-35103.css');assert.match(styles,/ta-agent-voucher-save/);assert.match(styles,/ta-agent-voucher-cancel/);assert.match(styles,/body:has\(#screen \.ta-agent-voucher-footer\) nav#bottom/);
});
test('operation-specific footer controller hides normal bottom nav for invoice and voucher, restores on home',async()=>{
 const classes=new Set();const dockClasses=new Set();let screen='home';let height='';
 const foot={isConnected:true,getBoundingClientRect:()=>({height:110})};
 const doc={readyState:'complete',addEventListener:()=>{},body:{classList:{toggle:(s,flag)=>{flag?classes.add(s):classes.delete(s);}}},documentElement:{style:{getPropertyValue:()=>height,setProperty:(p,v)=>{height=v;},removeProperty:()=>{height='';}}},getElementById:id=>id==='screen'?{querySelector:sel=>sel.includes(screen)?foot:null}:id==='bottom'?{classList:{add:s=>dockClasses.add(s),remove:s=>dockClasses.delete(s)}}:null};
 const agent={screen:'home',show:async function(route){this.screen=route;screen=route==='invoice'?'ta-agent-invoice-save-footer':route==='voucher'?'ta-agent-voucher-footer':'';return route;}};
 const ctx={window:{Agent:agent,addEventListener:()=>{}},Agent:agent,document:doc,ResizeObserver:undefined,MutationObserver:undefined,console};
 vm.createContext(ctx);vm.runInContext(load('static/agent-manager-invoice-35102.js'),ctx);
 await agent.show('invoice');assert(classes.has('ta-agent-invoice-workspace'));assert(dockClasses.has('hide'));assert.equal(height,'110px');
 await agent.show('voucher');assert(classes.has('ta-agent-voucher-workspace'));assert(!classes.has('ta-agent-invoice-workspace'));
 await agent.show('home');assert(!classes.has('ta-agent-voucher-workspace'));assert.equal(height,'');
});
