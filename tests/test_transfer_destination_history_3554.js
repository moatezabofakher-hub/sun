'use strict';
const assert = require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const elements={};
function el(id){return elements[id]||(elements[id]={value:'',innerHTML:'',textContent:'',hidden:true,disabled:false,isConnected:true,classList:{toggle(){}},focus(){},scrollIntoView(){},setAttribute(){}});}
const env={console,Date,Math,Number,String,JSON,Map,Set,Array,Object,Promise,
 document:{getElementById:el,querySelectorAll:()=>[]},
 UI:{toast(){},setHeader(){},showDeleteConfirm(){},openModal(){}},
 StorageEngine:{async saveState(){}},
 AppNav:{renderCurrent(){},markDirty(){},clearDirty(){},navigate(){},enableOperationGuard(){}},
 LicenseManager:{getRemainingTrialOps:()=>100,canPerformOperation:()=>true,getTotalOpsUsed:()=>0,updateBadgeUI(){}}
};env.globalThis=env;
vm.runInNewContext(slice('const State =','const StorageEngine =')+'\n'+slice('const Accounting =','const AppNav =')+'\n'+slice('const ReportAgentFilter =','const Views =')+'\n'+slice('const Views =','const ItemController =')+'\n'+slice('const AppEscape =','const InvoiceController =')+'\n'+slice('const InvoiceController =','const AccountController =')+'\nglobalThis.TEST={State,WarehouseController,Views};',env,{timeout:10000});
const {State:S,WarehouseController:W,Views}=env.TEST;
S.items=[{id:'x',name:'مادة 1',openingStockBase:100,units:[{name:'كرتونة',factor:1}]}];
S.warehouses=[{id:'wh_main',name:'رئيسي'},{id:'a',name:'فرع أ'},{id:'b',name:'فرع ب'}];
S.settings.selectedWarehouseId='wh_main';
S.transfers=[
 {id:'x1',batchId:'in-a',itemId:'x',date:'2026-11-13',quantityBase:2,quantity:2,unitName:'كرتونة',fromWarehouseId:'wh_main',toWarehouseId:'a',createdAt:'2026-11-13T11:00:00Z'},
 {id:'x2',batchId:'in-a',itemId:'x',date:'2026-11-13',quantityBase:3,quantity:3,unitName:'كرتونة',fromWarehouseId:'wh_main',toWarehouseId:'a',createdAt:'2026-11-13T11:00:00Z'},
 {id:'x3',batchId:'in-b',itemId:'x',date:'2026-11-14',quantityBase:1,quantity:1,unitName:'كرتونة',fromWarehouseId:'wh_main',toWarehouseId:'b',createdAt:'2026-11-14T12:00:00Z'},
 {id:'x4',batchId:'a-out',itemId:'x',date:'2026-11-14',quantityBase:1,quantity:1,unitName:'كرتونة',fromWarehouseId:'a',toWarehouseId:'wh_main',createdAt:'2026-11-14T13:00:00Z'},
];
const renderView={innerHTML:''};Views.renderWarehouses(renderView);
assert.match(renderView.innerHTML,/onchange="WarehouseController\.refreshTransferHistory\(\)"/);
assert.match(renderView.innerHTML,/id="transferHistoryList"/);
assert.equal(W.transferDocuments().length,3,'full register remains complete');
assert.equal(W.transferDocumentsForDestination('a').length,1,'grouped batch is one document');
assert.equal(W.transferDocumentsForDestination('b').length,1);
assert.equal(W.transferDocumentsForDestination('wh_main').length,1,'outbound from branch counts only as inbound to main');
const aHtml=W.renderTransferHistoryHtml('a');
assert.match(aHtml,/in-a/);assert.doesNotMatch(aHtml,/in-b/);assert.doesNotMatch(aHtml,/a-out/);
assert.match(aHtml,/2 صنف/);
const bHtml=W.renderTransferHistoryHtml('b');assert.match(bHtml,/in-b/);assert.doesNotMatch(bHtml,/in-a/);
const fullHtml=W.renderTransferHistoryHtml();assert.match(fullHtml,/in-a/);assert.match(fullHtml,/in-b/);assert.match(fullHtml,/a-out/);
el('transferTo').value='a';W.refreshTransferHistory();
assert.match(el('transferHistoryTitle').textContent,/فرع أ \(1 عملية\)/);
assert.match(el('transferHistoryList').innerHTML,/in-a/);
el('transferTo').value='b';W.refreshTransferHistory();
assert.match(el('transferHistoryTitle').textContent,/فرع ب \(1 عملية\)/);
assert.match(el('transferHistoryList').innerHTML,/in-b/);
assert.doesNotMatch(el('transferHistoryList').innerHTML,/in-a/);
el('transferTo').value='empty';W.refreshTransferHistory();
assert.match(el('transferHistoryList').innerHTML,/لا توجد مناقلات واردة/);
assert.equal(S.transfers.length,4,'read-only filtering does not alter movement history');
console.log('PASS incoming warehouse transfer history: dynamic destination, grouped count, empty state, register unchanged');
