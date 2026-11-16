const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/index.html'),'utf8');
const save=html.match(/            async saveInvoice\(andBluetoothPrint = false\) \{[\s\S]*?\n            \},\n\n            openInvoiceActions/);
assert.ok(save,'real invoice save implementation');
const method=save[0].replace(/,\n\n            openInvoiceActions$/,'');
function simulate(printed){
 const invoked=[],accounting={},state={invoices:[],warehouses:[{id:'wh_main'}],items:[]},nav={clearDirty:()=>invoked.push('clearDirty'),navigate:name=>invoked.push(name)};
 const sandbox={State:state,AppNav:nav,Accounting:accounting,UI:{toast:msg=>invoked.push(msg)},StorageEngine:{saveState:async()=>invoked.push('stored')},LicenseManager:{canPerformOperation:()=>true,recordNewOperation:async()=>{}},ThermalPrinter:{printInvoiceDirect:async()=>invoked.push('printed')}};
 const controller=vm.runInNewContext('({'+method+'})',sandbox);
 controller.recalculate=()=>{};
 controller.draft={id:'order-1',type:'purchase',rows:[{itemId:'x',qty:1,unitFactor:1}],accountId:null,remainingAmount:0,warehouseId:'wh_main',netTotal:10};
 return controller.saveInvoice(printed).then(ok=>({ok,invoked,state}));
}
test('Save writes the invoice and returns to dashboard without opening preview or printing',async()=>{const v=await simulate(false);assert.equal(v.ok,true);assert.equal(v.state.invoices.length,1);assert.ok(v.invoked.includes('stored'));assert.ok(v.invoked.includes('dashboard'));assert.ok(!v.invoked.includes('printed'));assert.ok(!v.invoked.includes('invoice_print'));});
test('Save and Print only prints after storage and does not open invoice preview',async()=>{const v=await simulate(true);assert.equal(v.ok,true);assert.ok(v.invoked.indexOf('stored')<v.invoked.indexOf('printed'));assert.ok(v.invoked.includes('dashboard'));assert.ok(!v.invoked.includes('invoice_print'));});
