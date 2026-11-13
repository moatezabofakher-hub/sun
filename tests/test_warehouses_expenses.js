
/* Deterministic offline ledger regression tests. No user data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/index.html'),'utf8');
const read=(start,end)=> html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
const inputs = {};
let toasts=[];
const context = {
  console,
  Map, Date, Math, Number, String, JSON, Array, Object, Set, Promise,
  UI: {
    toast:(msg,kind)=>{ toasts.push({msg,kind}); },
    setHeader:()=>{}, openModal:()=>{},
    showDeleteConfirm:(_title,_body,cb)=>{void cb();}
  },
  document: {getElementById:(id)=>({value:inputs[id]??'',textContent:'',focus:()=>{}})},
  StorageEngine:{saveState:async()=>{}},
  LicenseManager:{canPerformOperation:()=>true,getRemainingTrialOps:()=>100,getTotalOpsUsed:()=>State.license.opsUsedCount||0,updateBadgeUI:()=>{},recordNewOperation:async()=>{}},
  AppNav:{renderCurrent:()=>{},navigate:()=>{},clearDirty:()=>{},enableOperationGuard:()=>{},markDirty:()=>{}},
};
context.globalThis=context;
const js= read('const State =','const StorageEngine =')
  + '\n' + read('const Accounting =','const AppNav =')
  + '\n' + read('const ReportAgentFilter =','const Views =')
  + '\n' + read('const Views =','const ItemController =')
  + '\n' + read('const AppEscape =','const InvoiceController =')
  + '\n' + read('const InvoiceController =','const AccountController =')
  + '\nglobalThis.TEST = {State, Accounting, Views, WarehouseController, ExpenseController, InvoiceController};';
vm.runInNewContext(js,context,{timeout:6000});
const {State,Accounting,Views,WarehouseController,ExpenseController,InvoiceController}=context.TEST;
const setInputs=x=>{for(const k of Object.keys(inputs)) delete inputs[k];Object.assign(inputs,x);};
const item={id:'item1',name:'Test Item',currency:'USD',openingStockBase:10,units:[{name:'box',factor:1,costPrice:3,salePrice:5}],minStockBase:0};
State.items=[item];
State.warehouses=[{id:'wh_main',name:'المستودع الرئيسي'},{id:'wh_other',name:'فرعي'}];
const almost=(a,b)=>assert.ok(Math.abs(a-b)<0.00001,`Expected ${a} ≈ ${b}`);
(async()=>{
almost(Accounting.getItemBaseStock('item1'),10);
almost(Accounting.getItemBaseStock('item1',null,'wh_main'),10);
almost(Accounting.getItemBaseStock('item1',null,'wh_other'),0);
setInputs({transferFrom:'wh_main',transferTo:'wh_other',transferDate:'2026-11-11',transferNote:'test'});
WarehouseController.toggleTransferItem('item1');
WarehouseController.updateTransferDraftQty('item1','4');
await WarehouseController.saveTransfer();
assert.equal(State.transfers.length,1);
almost(Accounting.getItemBaseStock('item1'),10);
almost(Accounting.getItemBaseStock('item1',null,'wh_main'),6);
almost(Accounting.getItemBaseStock('item1',null,'wh_other'),4);
// One carton contains twelve pieces; moving 12 pieces must shift exactly one carton.
item.units.push({name:'piece',factor:12,costPrice:0.25,salePrice:0.5});
setInputs({transferFrom:'wh_other',transferTo:'wh_main',transferDate:'2026-11-11'});
WarehouseController.toggleTransferItem('item1');
WarehouseController.updateTransferDraftUnit('item1','12');
WarehouseController.updateTransferDraftQty('item1','12');
await WarehouseController.saveTransfer();
assert.equal(State.transfers.length,2);
almost(Accounting.getItemBaseStock('item1',null,'wh_main'),7);
almost(Accounting.getItemBaseStock('item1',null,'wh_other'),3);
almost(Accounting.getItemBaseStock('item1'),10);
State.invoices=[{id:'old1',type:'sale',warehouseId:undefined,date:'2026-11-11',currency:'USD',paidAmount:10,netTotal:10,
 rows:[{itemId:'item1',qty:2,unitFactor:1,price:5,total:10}]}];
almost(Accounting.getItemBaseStock('item1',null,'wh_main'),5);
almost(Accounting.getItemBaseStock('item1',null,'wh_other'),3);
State.invoices.push({id:'new1',type:'purchase',warehouseId:'wh_other',date:'2026-11-11',currency:'USD',paidAmount:0,netTotal:15,rows:[{itemId:'item1',qty:5,unitFactor:1,price:3,total:15}]});
almost(Accounting.getItemBaseStock('item1',null,'wh_other'),8);
almost(Accounting.getItemBaseStock('item1'),13);
setInputs({transferFrom:'wh_main',transferTo:'wh_other',transferDate:'2026-11-11'});
WarehouseController.toggleTransferItem('item1');
WarehouseController.updateTransferDraftQty('item1','99');
await WarehouseController.saveTransfer();
assert.equal(State.transfers.length,2,'insufficient warehouse inventory must reject');
setInputs({expenseId:'',expenseAmount:'15000',expenseCurrency:'SYP',expenseCategory:'نقل ومحروقات',expenseDate:'2026-11-11',expenseRate:'15000',expenseNote:'Transport'});
await ExpenseController.saveExpense();
setInputs({expenseId:'',expenseAmount:'5',expenseCurrency:'USD',expenseCategory:'إيجار',expenseDate:'2026-11-11',expenseRate:'15000'});
await ExpenseController.saveExpense();
assert.equal(State.expenses.length,2);
const cash=Accounting.getCashboxSummary();
almost(cash.sypCash,-15000);
almost(cash.usdCash,10-5);
assert.equal(cash.movements.filter(x=>x.docType==='expense').length,2);
const main = {innerHTML:''};
State.settings.exchangeRate=15000;
Views.renderReports(main,{tab:'pnl',period:'all',view:'invoices',reveal:true});
assert.ok(main.innerHTML.includes('مصاريف الفترة (2)'));
assert.ok(main.innerHTML.includes('صافي الربح بعد المصاريف'));
assert.ok(main.innerHTML.includes('6.00 $'),'expenses should total six USD');
assert.ok(main.innerHTML.includes('-2.00 $'), 'sale gross profit 2x(5-3)=4 minus 6 expenses = -2 USD');
Views.renderReports(main,{tab:'inventory',warehouseId:'wh_other'});
assert.ok(main.innerHTML.includes('عرض جرد مستودع'));
assert.ok(main.innerHTML.includes('8 box'), 'secondary warehouse balance must show 8 boxes');
Views.renderWarehouses(main);
assert.ok(main.innerHTML.includes('مناقلة أصناف بين المستودعات'));
assert.ok(main.innerHTML.includes('transferSearchInput'));
assert.ok(main.innerHTML.includes('transferCategory'));
assert.ok(main.innerHTML.includes('transferGrid'));
Views.renderExpenses(main);
assert.ok(main.innerHTML.includes('سجل المصاريف'));
// Invoice warehouse chooser and stock consumption must be scoped to chosen warehouse.
InvoiceController.renderForm(main,{type:'sale'});
assert.ok(main.innerHTML.includes('المستودع الذي تتأثر به هذه الفاتورة'));
const draft=InvoiceController.draft;
draft.warehouseId='wh_other';
draft.rows=[{itemId:'item1',itemName:'Test Item',qty:99,unitFactor:1,price:5,total:495,unitName:'box'}];
let saved=await InvoiceController.saveInvoice(false);
assert.equal(saved,false,'selling more than warehouse balance must fail');
assert.ok(!State.invoices.find(i=>i.id===draft.id));
draft.rows[0].qty=2;
saved=await InvoiceController.saveInvoice(false);
assert.equal(saved,true,'valid sale in target warehouse should save');
almost(Accounting.getItemBaseStock('item1',null,'wh_other'),6);
almost(Accounting.getItemBaseStock('item1'),11);
console.log('PASS: legacy stock mapping, warehouse transfers, overspend rejection, cash expenses and net-profit report');
})().catch(e=>{console.error(e);process.exit(1)});
