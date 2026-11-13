/* v3.5.8 dashboard layout and inventory valuation - deterministic data only. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/www/index.html'),'utf8');
const i18n = fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/static/i18n.js'),'utf8');
const cut=(a,b)=>{const i=html.indexOf(a);const j=html.indexOf(b,i+a.length);assert.ok(i!==-1&&j>i,`${a} -> ${b}`);return html.slice(i,j)};
const dashboard = cut('            renderDashboard(main) {','            renderItems(main, params = {}) {');
assert.ok(!dashboard.includes('رصيد الصندوق (SYP / USD)'));
assert.ok(!dashboard.includes('ديون لنا (مدينون)'));
assert.ok(!dashboard.includes('getCashboxSummary()'), 'dashboard no cashbox aggregation');
assert.ok(!dashboard.includes('getAccountStatement(acc.id)'), 'dashboard no debt aggregation');
assert.ok(!dashboard.includes('AppNav.navigate(\'settings\')'), 'duplicated Settings tile removed');
assert.ok(html.includes('data-nav="settings"'), "Settings moved next to Reports in bottom dock");
assert.ok(html.includes("backBtn.onclick = () => AppNav.handleBackButton()"));
assert.ok(html.includes('id="inventoryTotalValueCard"'));
assert.ok(html.includes('onchange="InventoryValuation.setCurrency(this.value)"'));
let saved=0, rerenders=0;
const ctx={console,Math,Number,String,Array,Object,Date,Map,Set,JSON,Promise,Intl,
    StorageEngine:{saveState:async()=>{saved++;}},
    AppNav:{renderCurrent:()=>{rerenders++;},navigate:()=>{}},
    UI:{setHeader:()=>{}},
    WarehouseController:{options:()=>'<option value="wh_main">Main</option><option value="branch">Branch</option>'},
    LicenseManager:{MAX_TRIAL_OPS:10,getTotalOpsUsed:()=>0},
    ThermalPrinter:{isConnected:false},
    document:{getElementById:()=>null},
};ctx.globalThis=ctx;
const js=cut('const State =','const StorageEngine =')+'\n'+cut('const Accounting =','const AppNav =')+'\n'+cut('const ReportAgentFilter =','const Views =')+'\n'+cut('const Views =','const ItemController =')+'\n'+cut('const AppEscape =','const InvoiceController =')+'\n'+i18n+'\nglobalThis.TEST={State,Accounting,InventoryValuation,Views,I18n};';
vm.runInNewContext(js,ctx,{timeout:7000});
const {State,InventoryValuation,Views,I18n}=ctx.TEST;
const nearly=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} !== ${b}`);
State.settings.exchangeRate=15000;
State.items=[
    {id:'1',name:'Cleaner A',currency:'USD',openingStockBase:10,units:[{name:'box',factor:1,costPrice:5}],minStockBase:0},
    {id:'2',name:'Cleaner B',currency:'SYP',openingStockBase:4,units:[{name:'box',factor:1,costPrice:15000}],minStockBase:0}
];
State.warehouses=[{id:'wh_main',name:'Main'},{id:'branch',name:'Branch'}];
State.transfers=[{itemId:'1',quantityBase:2,fromWarehouseId:'wh_main',toWarehouseId:'branch'}];
let val=InventoryValuation.calculate('all','USD');
nearly(val.total,54);
val=InventoryValuation.calculate('wh_main','USD');
nearly(val.total,44);
val=InventoryValuation.calculate('branch','USD');
nearly(val.total,10);
val=InventoryValuation.calculate('all','SYP');
nearly(val.total,810000);
assert.equal(val.rows.length,2);
assert.equal(InventoryValuation.calculate('branch','SYP').total,150000);
let main={innerHTML:''};
Views.renderDashboard(main);
assert.ok(main.innerHTML.includes('فاتورة مبيعات'));
assert.ok(!main.innerHTML.includes('رصيد الصندوق'));
Views.renderReports(main,{tab:'inventory',warehouseId:'branch'});
assert.ok(main.innerHTML.includes('inventoryTotalValueCard'));
assert.ok(main.innerHTML.includes('150,000 ل.س'));
assert.ok(main.innerHTML.includes('selected'));
assert.ok(main.innerHTML.includes('2 box'));
State.settings.exchangeRate=0;
assert.equal(InventoryValuation.calculate('all','USD').total,null,'invalid FX must not produce bogus mixed-currency total');
State.settings.exchangeRate=15000;
State.items=[];
assert.equal(InventoryValuation.calculate('all','SYP').total,0,'empty stock');
State.items=[{id:'3',name:'Decimals',currency:'USD',openingStockBase:3,units:[{name:'box',costPrice:0.333333}],minStockBase:0}];
nearly(InventoryValuation.calculate('all','USD').total,0.999999);
assert.equal(I18n.translate('القيمة الإجمالية للمواد بسعر التكلفة'),'Total inventory value at cost');
(async()=>{
  await InventoryValuation.setCurrency('USD');
  assert.equal(State.settings.inventoryValuationCurrency,'USD');
  assert.equal(saved,1);assert.equal(rerenders,1);
  main={innerHTML:''};
  Views.renderReports(main,{tab:'inventory',warehouseId:'all'});
  assert.ok(main.innerHTML.includes('1.00 $'));
  await InventoryValuation.setCurrency('nonsense');
  assert.equal(saved,1);
  console.log('PASS: dashboard hides balance/debt, header settings, cost total in either currency, all/individual warehouses, safe FX and persistence');
})().catch(e=>{console.error(e);process.exit(1)});
