'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');

const folder=path.resolve(__dirname,'..');
const htmlPath=fs.existsSync(path.join(folder,'web/index.html'))
    ?path.join(folder,'web/index.html')
    :path.join(folder,'app/src/main/assets/www/index.html');
const html=fs.readFileSync(htmlPath,'utf8');
const part=(a,b)=>{
    const from=html.indexOf(a);const to=html.indexOf(b,from+a.length);
    assert.ok(from>=0&&to>from,`Unable to locate source markers ${a} and ${b}`);
    return html.slice(from,to);
};

function makeFixture(){
    const dom=new Map(),toasts=[];
    function node(id,options={}){
        return {id,value:'',hidden:false,disabled:false,scrollTop:0,isConnected:true,
            classList:{toggle(){}},scrollIntoView(){},focus(){},setAttribute(){},querySelector(){return null},
            ...options};
    }
    const fields=['warehouseTransferPanel','transferFrom','transferTo','transferDate','transferNote',
      'transferSearchInput','transferCategory','transferGridCount','transferGridEmpty','transferGrid',
      'transferFormTitle','transferEditBanner','transferEditingRef','transferCancelEditButton',
      'transferSaveCount','transferSaveButton','transferSelectedCount','transferDraftList',
      'transferHistoryList','transferHistoryTitle','warehouseCreatePanel'];
    const main={
        _html:'',get innerHTML(){return this._html},
        set innerHTML(value){
          for(const x of dom.values())x.isConnected=false;
          dom.clear();this._html=value;
          for(const id of fields)dom.set(id,node(id));
          dom.get('warehouseTransferPanel').hidden=true;
          dom.get('warehouseCreatePanel').hidden=true;
          dom.get('transferEditBanner').hidden=true;
          dom.get('transferCancelEditButton').hidden=true;
          dom.get('transferFrom').value='wh_main';
          dom.get('transferTo').value='wh_car';
          dom.get('transferDate').value='2026-11-16';
          dom.get('transferCategory').value='all';
        }
    };
    const document={getElementById:id=>dom.get(id)||null,querySelectorAll:()=>[]};
    const ctx={console,Date,Math,Number,String,JSON,Map,Set,Array,Object,Promise,document,
        UI:{toast:(message)=>toasts.push(message),setHeader(){},openModal(){}},
        AppNav:{renderCurrent(){},markDirty(){},clearDirty(){}},
        StorageEngine:{async saveState(){}},
        LicenseManager:{getRemainingTrialOps:()=>99,canPerformOperation:()=>true,getTotalOpsUsed:()=>0,updateBadgeUI(){}}
    };
    ctx.globalThis=ctx;
    const js=part('const State =','const StorageEngine =')+'\n'+
        part('const Accounting =','const AppNav =')+'\n'+
        (html.includes('const ReportAgentFilter =')?part('const ReportAgentFilter =','const Views ='):'')+'\n'+
        part('const Views =','const ItemController =')+'\n'+
        part('const AppEscape =','const InvoiceController =')+'\n'+
        'globalThis.fixture={State,Views,WarehouseController};';
    vm.runInNewContext(js,ctx,{timeout:10000});
    const {State,Views,WarehouseController:W}=ctx.fixture;
    State.items=[{id:'soap',name:'منظف',category:'جلي',openingStockBase:10,units:[{name:'وحدة',factor:1}]}];
    State.categories=['جلي'];
    State.warehouses=[{id:'wh_main',name:'المستودع الرئيسي'},{id:'wh_car',name:'سيارة'}];
    State.transfers=[];
    State.settings.selectedWarehouseId='wh_main';
    return {dom,toasts,main,State,Views,W};
}

test('active transfer remains open with its selected items and form data after a route redraw',()=>{
    const f=makeFixture();const p={action:'transfer'};
    f.Views.renderWarehouses(f.main,p);
    assert.equal(f.dom.get('warehouseTransferPanel').hidden,false);
    assert.equal(p.action,undefined,'one-shot deep link must not reopen the form on a later refresh');
    f.W.toggleTransferItem('soap');
    f.W.updateTransferDraftQty('soap','3');
    f.dom.get('transferFrom').value='wh_main';
    f.dom.get('transferTo').value='wh_car';
    f.dom.get('transferDate').value='2026-11-14';
    f.dom.get('transferNote').value='المناقلة الحالية';
    f.dom.get('transferSearchInput').value='منظف';
    f.dom.get('transferGrid').scrollTop=45;
    f.Views.renderWarehouses(f.main,p); // Simulate an accidental AppNav.renderCurrent refresh.
    assert.equal(f.dom.get('warehouseTransferPanel').hidden,false);
    assert.equal(f.W.transferDraft.length,1);
    assert.equal(f.W.transferDraft[0].qty,'3');
    for(const [id,expected] of Object.entries({transferDate:'2026-11-14',transferNote:'المناقلة الحالية',transferFrom:'wh_main',transferTo:'wh_car',transferSearchInput:'منظف'})){
        assert.equal(f.dom.get(id).value,expected,id+' must survive a route refresh');
    }
    assert.equal(f.dom.get('transferGrid').scrollTop,45);
    f.W.openTransferForm(); // An accidental extra click on new transfer must not clear the draft.
    assert.equal(f.W.transferDraft[0].qty,'3');
    assert.equal(f.dom.get('transferNote').value,'المناقلة الحالية');
    f.W.discardTransferForm();
    assert.equal(f.dom.get('warehouseTransferPanel').hidden,true);
    assert.equal(f.W.transferDraft.length,0);
});

test('editing a saved transfer survives redraw and retains edit mode',()=>{
    const f=makeFixture();f.Views.renderWarehouses(f.main,{});
    f.W.openTransferForm(true);
    f.W.editingTransferBatchId='batch_old';
    f.W.transferDraft=[{itemId:'soap',qty:'2',factor:'1'}];
    f.dom.get('transferNote').value='تعديل فاتورة محفوظة';
    f.Views.renderWarehouses(f.main,{});
    assert.equal(f.W.editingTransferBatchId,'batch_old');
    assert.equal(f.dom.get('transferFormTitle').textContent,'تعديل فاتورة مناقلة');
    assert.equal(f.dom.get('transferEditBanner').hidden,false);
    assert.equal(f.dom.get('transferCancelEditButton').hidden,false);
    assert.equal(f.W.transferDraft[0].qty,'2');
});

test('first selected quantity may not exceed source stock',()=>{
    const f=makeFixture();f.State.items[0].openingStockBase=0.25;
    f.Views.renderWarehouses(f.main,{});
    f.W.toggleTransferItem('soap');
    assert.equal(f.W.transferDraft.length,0);
    assert.ok(f.toasts.some(t=>t.includes('رصيد المصدر')));
});


test('successful save closes editor and refresh cannot reopen a blank transfer',async()=>{
    const f=makeFixture();const p={action:'transfer'};
    f.Views.renderWarehouses(f.main,p);
    f.W.toggleTransferItem('soap');
    f.dom.get('transferDate').value='2026-11-16';
    await f.W.saveTransfer();
    assert.equal(f.State.transfers.length,1,'one line is stored, not duplicated');
    assert.equal(f.W.transferDraft.length,0);
    assert.equal(f.dom.get('warehouseTransferPanel').hidden,true);
    f.Views.renderWarehouses(f.main,p);
    assert.equal(f.dom.get('warehouseTransferPanel').hidden,true,'refresh after save should show history, not an empty editor');
});
