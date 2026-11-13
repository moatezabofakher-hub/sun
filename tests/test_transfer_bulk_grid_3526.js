'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/index.html'),'utf8');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
let inputs={transferFrom:'wh_main',transferTo:'wh_car',transferDate:'2026-11-13',transferNote:'تحميل سيارة 1',transferCategory:'all',transferSearchInput:''};
let failSave=false,saveCalls=0,renderCalls=0,activationCalls=0;
const msgs=[],elements={},cards=[];
function el(id){return elements[id]||(elements[id]={value:inputs[id]??'',innerHTML:'',textContent:'',disabled:false,isConnected:true,classList:{toggle(){}},focus(){},setAttribute(){}})}
const dom={getElementById:el,querySelectorAll(sel){if(sel==='[data-transfer-card]')return cards;if(sel==='[data-transfer-row]')return [];return []}};
const fakeCard=(item)=>({dataset:{itemId:item.id,category:item.category},hidden:false,attrs:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;},querySelector(){return {className:'',textContent:''}}});
const ctx={console,Date,Math,Number,String,JSON,Map,Set,Array,Object,Promise,document:dom,
 UI:{toast:(m,k)=>msgs.push({m,k}),setHeader:()=>{},openModal:()=>{},showDeleteConfirm:()=>{}},
 StorageEngine:{saveState:async()=>{saveCalls++;if(failSave)throw Error('db offline');}},
 AppNav:{renderCurrent:()=>{renderCalls++},navigate:()=>{},clearDirty:()=>{},enableOperationGuard:()=>{},markDirty:()=>{}},
 LicenseManager:{getRemainingTrialOps:()=>Math.max(0,100-ctx.STATE.license.opsUsedCount),getTotalOpsUsed:()=>ctx.STATE.license.opsUsedCount||0,canPerformOperation:()=>true,openActivationModal:()=>{activationCalls++},updateBadgeUI:()=>{}}};
ctx.globalThis=ctx;
const js=slice('const State =','const StorageEngine =')+'\n'+slice('const Accounting =','const AppNav =')+'\n'+slice('const ReportAgentFilter =','const Views =')
+'\n'+slice('const Views =','const ItemController =')+'\n'+slice('const AppEscape =','const InvoiceController =')+'\n'+slice('const InvoiceController =','const AccountController =')+'\nglobalThis.TEST={State,Accounting,WarehouseController,Views};';
vm.runInNewContext(js,ctx,{timeout:6000});const {State,Accounting,WarehouseController:W,Views}=ctx.TEST;ctx.STATE=State;
State.license.opsUsedCount=0;State.items=[
 {id:'soap',name:'سائل جلي ليمون',category:'المنظفات',openingStockBase:20,units:[{name:'كرتونة',factor:1},{name:'عبوة',factor:12}]},
 {id:'shampoo',name:'شامبو كلين',category:'العناية',openingStockBase:10,units:[{name:'كرتونة',factor:1},{name:'عبوة',factor:6}]},
 {id:'bleach',name:'كلور',category:'المنظفات',openingStockBase:3,units:[{name:'كرتونة',factor:1}]}
];State.warehouses=[{id:'wh_main',name:'مستودع رئيسي'},{id:'wh_car',name:'سيارة 1'}];
cards.push(...State.items.map(fakeCard));
const input=(id,value)=>{inputs[id]=value;el(id).value=value};
const almost=(x,y)=>assert.ok(Math.abs(x-y)<1e-8,`${x} != ${y}`);
(async()=>{
 const main={innerHTML:''};Views.renderWarehouses(main);
 assert.match(main.innerHTML,/data-transfer-card/);
 assert.match(main.innerHTML,/transferCategory/);
 assert.match(main.innerHTML,/transferSaveButton/);
 assert.equal(el('transferSaveButton').disabled,true);
 input('transferSearchInput','شامبو');W.filterTransferGrid();
 assert.equal(cards.filter(c=>!c.hidden).length,1);
 assert.equal(cards.filter(c=>!c.hidden)[0].dataset.itemId,'shampoo');
 input('transferSearchInput','');input('transferCategory','المنظفات');W.filterTransferGrid();
 assert.equal(cards.filter(c=>!c.hidden).length,2);
 input('transferCategory','all');W.filterTransferGrid();
 W.toggleTransferItem('soap');W.toggleTransferItem('shampoo');
 assert.equal(W.transferDraft.length,2);assert.equal(el('transferSaveButton').disabled,false);
 W.updateTransferDraftQty('soap','24');W.updateTransferDraftUnit('soap','12'); // 2 cartons
 W.updateTransferDraftQty('shampoo','3');
 W.toggleTransferItem('soap');assert.equal(W.transferDraft.length,2);assert.equal(Number(W.selectedTransferItem('soap').qty),25);W.removeTransferItem('soap');assert.equal(W.transferDraft.length,1);W.toggleTransferItem('soap');
 W.updateTransferDraftQty('soap','24');W.updateTransferDraftUnit('soap','12');
 await W.saveTransfer();
 assert.equal(State.transfers.length,2);assert.equal(saveCalls,1,'batch saved in single IndexedDB transaction');
 assert.equal(State.transfers[0].batchId,State.transfers[1].batchId);
 assert.equal(W.transferDocuments().length,1,'one review document holds the entire batch');
 assert.match(W.renderTransferHistoryHtml(),/2 صنف/);
 assert.match(W.renderTransferHistoryHtml(),/حفظ ملف المناقلة/);
 assert.equal(State.transfers[0].unitName,'كرتونة');
 assert.equal(State.transfers[1].unitName,'عبوة');
 almost(Accounting.getItemBaseStock('soap',null,'wh_main'),18);
 almost(Accounting.getItemBaseStock('soap',null,'wh_car'),2);
 almost(Accounting.getItemBaseStock('shampoo',null,'wh_main'),7);
 almost(Accounting.getItemBaseStock('shampoo',null,'wh_car'),3);
 assert.equal(State.license.opsUsedCount,2,'each material move counts as one trial operation');
 assert.equal(renderCalls,1);
 assert.equal(W.transferDraft.length,0);
 // Entire batch rejected if any single item exceeds stock.
 W.toggleTransferItem('soap');W.updateTransferDraftQty('soap','1');
 W.toggleTransferItem('shampoo');W.updateTransferDraftQty('shampoo','99');
 const before=State.transfers.length;
 await W.saveTransfer();assert.equal(State.transfers.length,before);assert.equal(saveCalls,1);
 assert.ok(msgs.some(x=>/شامبو/.test(x.m)&&/تتجاوز/.test(x.m)));
 // No data changed when storage fails during one-batch commit.
 W.updateTransferDraftQty('shampoo','1');
 failSave=true;const old=State.license.opsUsedCount;await W.saveTransfer();
 assert.equal(State.transfers.length,before);assert.equal(State.license.opsUsedCount,old);assert.equal(saveCalls,2);
 // Trial 1 operation remaining rejects 2-item batch.
 failSave=false;State.license.opsUsedCount=99;await W.saveTransfer();
 assert.equal(activationCalls,1);assert.equal(State.transfers.length,before);
 console.log('PASS: transfer grid search/category, multi-select, units, atomic batch save, stock integrity, trial quota, rollback');
})().catch(e=>{console.error(e);process.exit(1)});
