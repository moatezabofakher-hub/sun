'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..','field_agent/src/main/assets/www');
const load=x=>fs.readFileSync(path.join(root,x),'utf8');
function makeAgent(){
  const els=new Map();
  const document={
    getElementById:id=>els.get(id)||null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:()=>{},
    documentElement:{style:{getPropertyValue:()=>'',setProperty:()=>{},removeProperty:()=>{}}},body:{classList:{toggle:()=>{}}}
  };
  const window={addEventListener:()=>{},AndroidLocalSync:{connectedManagerAddress:()=> '192.168.1.10:39271'}};
  const ctx={document,window,console,Date,Map,Set,Number,String,Array,Object,JSON,Promise,Intl,setTimeout,clearTimeout};
  vm.createContext(ctx);
  ctx.FieldProtocol=require('../field_agent/src/main/assets/www/static/field-protocol.js');
  vm.runInContext(load('static/invoice-dual-balances.js'),ctx);
  ctx.InvoiceDualBalances=ctx.window.InvoiceDualBalances;
  vm.runInContext(load('static/draft-invoice-balance-preview.js'),ctx);

  for(const file of ['static/agent.js','static/agent-experience.js','static/agent-invoice-parity.js','static/agent-auto-sync.js','static/agent-permissions-3589.js']){
    // Agent's methods are declared against ambient globals; harmless to defer crypto-specific calls in tests.
    vm.runInContext(load(file),ctx,{filename:file});
  }
  const agent=vm.runInContext('Agent',ctx);
  agent.state={companyId:'company_x',agentId:'agent_x',warehouseId:'car_x',key:'secret',vehicleName:'مستودع السيارة',exchangeRate:15000,
    accounts:[{id:'c1',name:'زبون',type:'customer',priceTier:'wholesale',sypBalance:200,usdBalance:40}],
    items:[{id:'i1',name:'منظف',currency:'USD',units:[{name:'عبوة',factor:1,wholesalePrice:2,centerPrice:3,consumerPrice:5,salePrice:2}]}],
    ops:[],snapshotIds:[],knownIds:[],categories:[],permissions:{priceTier:true,balances:true,currency:true,editPrices:true,createAccounts:true}};
  agent.state.stock={i1:10};agent.currency='USD';agent.draftKind='sale';agent.invoiceMeta={accountId:'c1',date:'2026-11-16T12:30',paymentMode:'partial',paid:'1',priceTierOverride:'account'};
  agent.draft=[{itemId:'i1',itemName:'منظف',unitName:'عبوة',unitFactor:1,qty:2,price:2,total:4}];
  return {agent,window,ctx,els};
}
test('employee connection pill does not reveal the manager IP',()=>{
 const {agent,els}=makeAgent();let badge={textContent:'',style:{}};let status={textContent:''};els.set('agentSyncConnection',badge);els.set('agentAutoSyncStatus',status);
 agent.markSyncState('connected');assert.equal(badge.textContent,'● متصل بالمسؤول');assert(!badge.textContent.includes('192.168'));
 assert(status.textContent.includes('مزامنة كل 12 ثانية'));
});
test('employee invoice follows manager layout, payment colors and fixed save/balances',()=>{
 const {agent}=makeAgent();let html=agent.renderInvoice();
 for(const id of ['ta-invoice-control-grid','ta-invoice-date-field','ta-invoice-warehouse-field','ta-invoice-pricing-choice','agentInvoiceDate','agentInvoiceTime','ta-agent-invoice-save-footer','agentDraftBalanceBefore','agentDraftBalanceAfter'])assert(html.includes(id),id);
 assert(html.includes('مستودع السيارة'));assert(html.includes('ta-pay-partial'));
 assert(html.includes('حفظ وطباعة بلوتوث'));assert(html.includes('حفظ الفاتورة'));
 assert(!html.includes('id="invoiceAccountBalance"'));assert(!html.includes('data-agent-draft-balance'));
 assert(html.includes('رصيد سابق')||html.includes('الرصيد السابق'));
 assert(html.includes('id="invoicePricingTier"'));
});
test('per-invoice pricing override is enforced by main rights and reprices only automatic rows',()=>{
 const {agent}=makeAgent();agent.show=()=>{};
 assert.equal(agent.unitPrice(agent.state.items[0],agent.state.items[0].units[0],'USD'),2);
 agent.changeInvoicePricingTier('consumer');
 assert.equal(agent.unitPrice(agent.state.items[0],agent.state.items[0].units[0],'USD'),5);
 assert.equal(agent.draft[0].price,5);
 agent.state.permissions.priceTier=false;
 assert.equal(agent.unitPrice(agent.state.items[0],agent.state.items[0].units[0],'USD'),2);
 const html=agent.renderInvoice();assert(html.includes('disabled title="الصلاحية تحددها الإدارة"'));
});
test('manager-like CSS hides normal nav only on an invoice and preserves scroll clearance',()=>{
 const css=load('static/agent-manager-invoice-35102.css');
 assert.match(css,/body\.ta-agent-invoice-workspace nav#bottom\{display:none!important\}/);
 assert.match(css,/--ta-agent-invoice-footer-height/);
 assert.match(css,/position:fixed/);
});
