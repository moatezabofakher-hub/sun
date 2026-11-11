const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=process.cwd();
const html=fs.readFileSync(path.join(root,'app/src/main/assets/www/index.html'),'utf8');
const i18nJS=fs.readFileSync(path.join(root,'app/src/main/assets/www/static/i18n.js'),'utf8');
const read=(a,b)=>{const start=html.indexOf(a);const end=html.indexOf(b,start+a.length);assert.ok(start>=0&&end>start, `${a} -> ${b}`);return html.slice(start,end)};
let saves=0; let nav=[]; let messages=[];
const ctx={console,Map,Date,Math,Number,String,JSON,Array,Object,Set,Promise,
  document:{getElementById:()=>null},
  UI:{toast:(msg,kind)=>messages.push([msg,kind]),setHeader:()=>{}},
  StorageEngine:{saveState:async()=>{saves++}},
  LicenseManager:{canPerformOperation:()=>true,recordNewOperation:async()=>{}},
  AppNav:{clearDirty:()=>{},navigate:(...args)=>nav.push(args),renderCurrent:()=>{}},
};
ctx.globalThis=ctx;
let code=read('const State =','const StorageEngine =')+'\n'+read('const Accounting =','const AppNav =')+'\n'+read('const AppEscape =','const InvoiceController =')+'\n'+read('const InvoiceController =','const AccountController =')+'\n'+read('const SettingsController =','const ProtectionController =')+'\n'+i18nJS+'\nglobalThis.Test={State,Accounting,InvoiceController,SettingsController,I18n};';
vm.runInNewContext(code,ctx,{timeout:6000});
const {State,Accounting,InvoiceController,SettingsController,I18n}=ctx.Test;
const goodText=['الرئيسية','الضبط','فاتورة مبيعات','المستودعات والمناقلات','إعدادات المخزون','السماح ببيع المواد التي نفذ رصيدها','النسخ الاحتياطي واستعادة البيانات (Offline Backup)'];
for(const t of goodText) assert.ok(I18n.translate(t)&&I18n.translate(t)!==t,`missing translation ${t}`);
assert.equal(I18n.translate('المواد (3)'),'Items (3)');
assert.equal(I18n.translate('سجل السندات (0)'),'Voucher history (0)');
assert.equal(State.settings.language,'ar');
assert.equal(State.settings.allowNegativeStockSales,false);
assert.equal(I18n.language,'ar');
I18n.apply=()=>{};
(async()=>{
 await I18n.setLanguage('en');
 assert.equal(I18n.language,'en');
 await I18n.setLanguage('ar');
 assert.equal(I18n.language,'ar');
 State.items=[{id:'soap1',name:'Soap',currency:'USD',openingStockBase:0,minStockBase:0,units:[{name:'Carton',factor:1,costPrice:1,salePrice:5}]}];
 State.warehouses=[{id:'wh_main',name:'المستودع الرئيسي'}];
 const draft={id:'sales1',number:1,type:'sale',warehouseId:'wh_main',date:'2026-11-12',currency:'USD',exchangeRate:15000,paymentMethod:'cash',discountType:'percent',discountValue:0,taxType:'percent',taxValue:0,accountId:'',rows:[{rowId:'r1',itemId:'soap1',itemName:'Soap',unitName:'Carton',unitFactor:1,qty:2,price:5,discount:0,total:10}]};
 InvoiceController.draft=draft;
 assert.equal(await InvoiceController.saveInvoice(false),false,'stock 0 must block sale when disabled');
 assert.equal(State.invoices.length,0);
 await SettingsController.setAllowOutOfStockSales(true);
 assert.equal(State.settings.allowNegativeStockSales,true);
 assert.equal(await InvoiceController.saveInvoice(false),true,'enabled sale may create negative stock');
 assert.equal(State.invoices.length,1);
 assert.equal(Accounting.getItemBaseStock('soap1',null,'wh_main'),-2);
 await SettingsController.setAllowOutOfStockSales(false);
 assert.equal(State.settings.allowNegativeStockSales,false);
 InvoiceController.draft={...draft,id:'sales2',number:2,rows:[{...draft.rows[0],qty:1}]};
 assert.equal(await InvoiceController.saveInvoice(false),false,'disabled sale must reject again');
 assert.equal(State.invoices.length,1);
 await SettingsController.setAllowOutOfStockSales(true);
 InvoiceController.draft={...draft,id:'return1',number:3,type:'purchase_return',rows:[{...draft.rows[0],qty:1}]};
 assert.equal(await InvoiceController.saveInvoice(false),false,'purchase returns remain stock-restricted');
 assert.equal(State.invoices.length,1);
 assert.ok(saves>=5,'settings changes and invoice persisted');
 console.log('PASS: Arabic/English UI dictionary, switch persistence, zero stock sale toggle, negative stock and purchase-return protection');
})().catch(e=>{console.error(e);process.exit(1)});
