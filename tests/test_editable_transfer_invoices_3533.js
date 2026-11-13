'use strict';
// Test a saved transfer as a real, editable invoice without corrupting warehouse balances.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const elements={}, messages=[];
let saveCount=0, renderCount=0, failSave=false;
function el(id){return elements[id]||(elements[id]={value:'',innerHTML:'',textContent:'',hidden:true,disabled:false,isConnected:true,
 classList:{toggle(){}},focus(){},scrollIntoView(){},setAttribute(){}});}
const document={getElementById:el,querySelectorAll:()=>[]};
const env={console,Date,Math,Number,String,JSON,Map,Set,Array,Object,Promise,document,
 UI:{toast:(text,type)=>messages.push([text,type]),setHeader(){},showDeleteConfirm(){},openModal(){}},
 StorageEngine:{async saveState(){saveCount++;if(failSave)throw Error('disk full');}},
 AppNav:{renderCurrent(){renderCount++;},markDirty(){},clearDirty(){},navigate(){},enableOperationGuard(){}},
 LicenseManager:{getRemainingTrialOps:()=>100,canPerformOperation:()=>true,getTotalOpsUsed:()=>env.TEST.State.license.opsUsedCount||0,updateBadgeUI(){}}
};env.globalThis=env;
vm.runInNewContext(slice('const State =','const StorageEngine =')+'\n'+slice('const Accounting =','const AppNav =')+'\n'+slice('const ReportAgentFilter =','const Views =')+'\n'+slice('const Views =','const ItemController =')+'\n'+slice('const AppEscape =','const InvoiceController =')+'\n'+slice('const InvoiceController =','const AccountController =')+'\nglobalThis.TEST={State,Accounting,WarehouseController,Views};',env,{timeout:10000});
const {State:S,Accounting:A,WarehouseController:W,Views}=env.TEST;
S.items=[
 {id:'a',name:'مواد تنظيف',openingStockBase:10,units:[{name:'كرتونة',factor:1},{name:'حبة',factor:10}]},
 {id:'b',name:'شامبو',openingStockBase:6,units:[{name:'كرتونة',factor:1}]}];
S.warehouses=[{id:'wh_main',name:'رئيسي'},{id:'car',name:'سيارة'},{id:'extra',name:'فرعي'}];
S.settings.selectedWarehouseId='wh_main';
S.license.opsUsedCount=0;
const set=(field,value)=>el(field).value=value;
const almost=(got,want)=>assert.ok(Math.abs(got-want)<1e-8,`${got} ≠ ${want}`);
(async()=>{
 const main={innerHTML:''};Views.renderWarehouses(main);
 assert.match(main.innerHTML,/فاتورة مناقلة جديدة/);
 assert.match(main.innerHTML,/إلغاء التعديل/);
 set('transferFrom','wh_main');set('transferTo','car');set('transferDate','2026-11-13');set('transferNote','قبل التعديل');
 W.transferDraft=[{itemId:'a',qty:'4',factor:'1'},{itemId:'b',qty:'2',factor:'1'}];
 await W.saveTransfer();
 assert.equal(S.transfers.length,2);
 const batch=W.transferDocuments()[0],oldId=batch.id,created=batch.createdAt,originalLineIds=batch.lines.map(t=>t.id);
 assert.match(W.renderTransferHistoryHtml(),/فتح الفاتورة/);
 assert.match(W.renderTransferHistoryHtml(),/تعديل الفاتورة/);
 assert.doesNotMatch(W.renderTransferHistoryHtml(),/حفظ ملف المناقلة/);
 almost(A.getItemBaseStock('a',null,'wh_main'),6);
 almost(A.getItemBaseStock('a',null,'car'),4);
 const licenseCount=S.license.opsUsedCount;
 W.editTransferBatch(oldId);
 assert.equal(W.editingTransferBatchId,oldId);
 assert.equal(W.transferDraft.length,2);
 assert.equal(el('transferFrom').value,'wh_main');
 assert.equal(el('transferNote').value,'قبل التعديل');
 assert.equal(el('transferFormTitle').textContent,'تعديل فاتورة مناقلة');
 assert.equal(el('transferEditBanner').hidden,false);
 // A source holding only 6 cartons can still save an existing 4-carton invoice.
 // A naïve check of 4 <= 6 succeeds now, but also test exactly 0 remaining.
 S.items[0].openingStockBase=4;
 almost(A.getItemBaseStock('a',null,'wh_main'),0);
 W.updateTransferDraftQty('a','4');set('transferNote','فاتورة معدلة');
 await W.saveTransfer();
 assert.equal(S.transfers.length,2,'editing replaces rows; never duplicates them');
 assert.equal(W.transferDocuments()[0].id,oldId,'stable batch invoice ID');
 assert.equal(W.transferDocuments()[0].createdAt,created,'retain original creation time');
 assert.equal(S.transfers[0].note,'فاتورة معدلة');
 assert.equal(S.license.opsUsedCount,licenseCount,'editing an existing item does not consume a new trial operation');
 assert.equal(S.transfers.filter(t=>originalLineIds.includes(t.id)).length,2,'stable row IDs');
 // Virtual delta must block reducing an existing transfer that has already been consumed.
 S.invoices=[{id:'sale1',warehouseId:'car',type:'sale',rows:[{itemId:'a',qty:3,unitFactor:1}]}];
 almost(A.getItemBaseStock('a',null,'car'),1);
 W.editTransferBatch(oldId);W.updateTransferDraftQty('a','2');
 const before=S.transfers;
 await W.saveTransfer();
 assert.equal(S.transfers,before,'reject post-edit negative destination stock');
 assert.ok(messages.some(([msg])=>msg.includes('الرصيد غير كافٍ')));
 W.updateTransferDraftQty('a','4');
 // Failure during the transaction must leave the original invoice completely intact.
 const previous=S.transfers;failSave=true;await W.saveTransfer();
 assert.equal(S.transfers,previous,'atomic rollback on failed write');
 assert.equal(W.editingTransferBatchId,oldId,'editing preserved after failure');
 failSave=false;
 // Change warehouse while preserving the existing invoice ID and overall stock.
 S.invoices=[];
 set('transferTo','extra');W.updateTransferDraftQty('a','3');
 await W.saveTransfer();
 assert.equal(W.transferDocuments().length,1);
 assert.equal(W.transferDocuments()[0].id,oldId);
 assert.equal(W.transferDocuments()[0].toWarehouseId,'extra');
 almost(A.getItemBaseStock('a',null,'wh_main'),1);
 almost(A.getItemBaseStock('a',null,'car'),0);
 almost(A.getItemBaseStock('a',null,'extra'),3);
 almost(A.getItemBaseStock('a',null,null),4);
 assert.equal(W.editingTransferBatchId,null);
 // Old rows missing unitFactor must still load and preserve base quantity.
 S.transfers[0].unitFactor=undefined;
 W.editTransferBatch(oldId);
 const row=W.transferDraft.find(r=>r.itemId==='a');
 assert.equal(row.factor,'1');assert.equal(Number(row.qty),3);
 // Removing a material from the saved invoice returns its stock to the origin.
 W.removeTransferItem('b');set('transferDate','2026-11-14');
 await W.saveTransfer();
 assert.equal(S.transfers.length,1,'the removed line is deleted from this invoice only');
 assert.equal(S.transfers[0].date,'2026-11-14');
 almost(A.getItemBaseStock('b',null,'wh_main'),6);
 almost(A.getItemBaseStock('b',null,'extra'),0);
 W.editTransferBatch(oldId);
 W.cancelTransferEdit();assert.equal(W.editingTransferBatchId,null);
 assert.ok(renderCount>=4);assert.ok(saveCount>=5);
 console.log('PASS: editable transfer invoices; original reference and row IDs; unit migration; delta-based cross-warehouse stock validation; save rollback; draft cancellation');
})().catch(err=>{console.error(err);process.exitCode=1});
