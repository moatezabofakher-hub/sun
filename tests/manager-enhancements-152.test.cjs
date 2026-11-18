'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.resolve(__dirname,'../app/src/main/assets/www/static');
function fixture(){
 const item={id:'i1',name:'صنف تجريبي',currency:'SYP',openingStockBase:10,units:[
   {name:'كرتونة',factor:1,costPrice:100,wholesalePrice:140},
   {name:'قطعة',factor:10,costPrice:10,wholesalePrice:14}
 ]};
 const state={settings:{taDefaultSaleUnit:1,taDefaultPurchaseUnit:0,defaultPriceTier:'wholesale',exchangeRate:15000},
  items:[item],accounts:[{id:'c',name:'عميل',type:'customer',openingSyp:100,openingUsd:-5},
   {id:'s',name:'مورد',type:'supplier',openingSyp:200,openingUsd:-10}],
  invoices:[{id:'p',date:'2026-11-15',number:'1',type:'purchase',warehouseId:'wh_main',
      rows:[{itemId:'i1',qty:10,unitFactor:10}]},
    {id:'a',date:'2026-11-16',number:'2',type:'sale',warehouseId:'wh_main',
      rows:[{itemId:'i1',qty:20,unitFactor:10}]}],
  transfers:[{id:'t1',itemId:'i1',date:'2026-11-17',quantityBase:3,fromWarehouseId:'wh_main',toWarehouseId:'w2'}],
  warehouses:[{id:'wh_main',name:'الرئيسي'},{id:'w2',name:'الثاني'}]};
 const accounting={
  format:(v,c)=>String(v)+' '+c,formatItemQuantity:v=>String(v),
  round:v=>v,convert:(x)=>x,itemCostPrice:(i,u)=>u.costPrice,
  invoicePricingTier:()=>'wholesale',
  itemSalePrice:(i,u)=>u.wholesalePrice,
  getItemBaseStock:(id,ex,wh)=>{
    const stock=state.items[0].openingStockBase+
       state.invoices.reduce((x,d)=>(!wh||d.warehouseId===wh)?x+(d.type==='purchase'?1:-1)*d.rows[0].qty/d.rows[0].unitFactor:x,0);
    return wh==='wh_main'?stock-3:wh==='w2'?3:stock;
  },
  getInvoiceTypeAr:type=>type
 };
 const invoice={draft:{type:'sale',currency:'SYP',exchangeRate:15000,accountId:'c',rows:[],warehouseId:'wh_main'},
  addItemToInvoice(id,repaint){
   const u=state.items[0].units[0];
   const existing=this.draft.rows.find(r=>r.itemId===id&&r.unitName===u.name);
   if(existing)existing.qty++;else this.draft.rows.push({itemId:id,itemName:'صنف تجريبي',
    unitName:u.name,unitFactor:1,qty:1,basePrice:u.wholesalePrice,price:u.wholesalePrice,baseCurrency:'SYP'});
  },
  paintForm(){},recalculate(){},markModified(){},changeInvoicePricingTier(){},
 };
 const notices=[];
 const context={State:state,Accounting:accounting,InvoiceController:invoice,
  Views:{renderAccounts(){},renderItems(){},renderSettings(){},renderInvoicePrint(){}},
  AccountController:{openAccountModal(){},saveAccount(){}},
  SettingsController:{setDefaultPriceTier(){},markSettingsDirty(){}},
  StorageEngine:{async saveState(){}},
  UI:{toast(){},openModal(){},forceCloseModal(){},showDeleteConfirm(){}},
  ManagerNotifications:{async addSyncNotice(m){notices.push(m);}},
  WarehouseController:{name:id=>id},
  AppEscape:{text:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')},
  POSController:{canChange:()=>true,add(){},paint(){},mark(){},tier(){return null;}},
  document:{head:{appendChild(){}},createElement:()=>({textContent:''}),
    querySelector(){return null;},querySelectorAll(){return [];},getElementById(){return null;}},
  window:{},console,Date,Promise,Math,Number,Set,Map,JSON};
 for(const file of ['ta-manager-enhancements-152.js','ta-pricing-modes-152.js','ta-print-customization-152.js']){
   vm.runInNewContext(fs.readFileSync(path.join(base,file),'utf8'),context,{filename:file});
 }
 return {state,item,accounting,invoice,notices,ManagerNotifications:context.ManagerNotifications,...context.window};
}
test('Opening debit and credit totals keep SYP and USD separate and honor party orientation',()=>{
 const f=fixture(),t=f.TiqanyManager152.openingStats();
 assert.equal(t.debit.SYP,100);assert.equal(t.credit.SYP,200);
 assert.equal(t.debit.USD,10);assert.equal(t.credit.USD,5);
});
test('Material movement reports opening, invoice conversions and inter-warehouse stock correctly',()=>{
 const f=fixture(),t=f.TiqanyManager152.movement('i1','wh_main');
 assert.equal(t.totalIn,11);assert.equal(t.totalOut,5);
 assert.equal(t.actual,6);assert.equal(t.entries.at(-1).balance,6);
 const all=f.TiqanyManager152.movement('i1','all');
 assert.equal(all.totalIn,11);assert.equal(all.totalOut,2);
 assert.equal(all.actual,9);
});
test('New invoice uses configured sales unit and preserves existing first unit row',()=>{
 const f=fixture(),u=f.invoice;
 u.addItemToInvoice('i1',false);
 assert.equal(u.draft.rows[0].unitName,'قطعة');
 assert.equal(u.draft.rows[0].unitFactor,10);
 assert.equal(u.draft.rows[0].price,14);
 u.draft.rows.push({itemId:'i1',itemName:'صنف تجريبي',unitName:'كرتونة',unitFactor:1,qty:5,basePrice:140,price:140,baseCurrency:'SYP'});
 u.addItemToInvoice('i1',false);
 assert.equal(u.draft.rows[0].qty,2);
 assert.equal(u.draft.rows[1].qty,5);
});
test('Cost and custom sales price plans preserve immutable IDs and reference existing item units',()=>{
 const f=fixture(),p=f.TiqanyPricing152;
 assert.equal(f.accounting.itemSalePrice(f.item,f.item.units[1],'c','cost'),10);
 f.state.settings.taPricingModes=[...p.defaults,{id:'custom_test',name:'خاص'}];
 f.item.units[1].customTierPrices={custom_test:55};
 assert.equal(f.accounting.itemSalePrice(f.item,f.item.units[1],'c','custom_test'),55);
 assert.equal(p.validTier('custom_test'),true);
});
test('Previously used wholesale tier is blocked from deletion when invoice tier snapshot is absent',()=>{
 const f=fixture(),p=f.TiqanyPricing152;
 assert.equal(p.isLinked('wholesale'),true);
});
test('Sync silence filters ordinary offline and repeated conflict notices',async()=>{
 const f=fixture(),notice=f.ManagerNotifications.addSyncNotice.bind(f.ManagerNotifications);
 await notice('انقطع الاتصال بشبكة Wi-Fi');
 await notice('تعارض في البيانات يحتاج تدخلاً');
 await notice('تعارض في البيانات يحتاج تدخلاً');
 assert.deepEqual(f.notices,['تعارض في البيانات يحتاج تدخلاً']);
});
