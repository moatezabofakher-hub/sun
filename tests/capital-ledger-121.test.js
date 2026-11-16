const test=require('node:test');
const assert=require('node:assert/strict');
const Capital=require('../app/src/main/assets/www/static/capital-ledger.js');
const Sync=require('../app/src/main/assets/www/static/tiqany-peer-merge.js');
function fixtures(){
 global.State={capitalMovements:[],invoices:[],vouchers:[],expenses:[],accounts:[],settings:{companyName:'اختبار'},fieldSync:{agents:[],cashTransfers:[]}};
 global.Accounting={format:(v,c)=>String(v)+' '+c};
 global.UI={openModal:()=>{},forceCloseModal:()=>{},toast:()=>{}};
 global.AppNav={navigate:()=>{}};
 global.document={getElementById:(id)=>({capitalCurrency:{value:'SYP'},capitalAmount:{value:'2500'},capitalNote:{value:'الرصيد الافتتاحي'}}[id])};
 global.StorageEngine={saveState:async()=>{}};
 global.FieldCash={summary:()=>({sypCash:5000,usdCash:0})};
}
test('cash-in capital is separate from debt, revenue, expense and invoice documents',async()=>{
 fixtures();await Capital.save('receive');
 assert.equal(global.State.capitalMovements.length,1);
 assert.equal(Capital.total().SYP,2500);
 assert.equal(Capital.cashMovements()[0].inflow,2500);
 assert.equal(global.State.invoices.length,0);assert.equal(global.State.vouchers.length,0);assert.equal(global.State.expenses.length,0);
 assert.equal(global.State.accounts.length,0);
});
test('cash-out from capital reduces office till only, insufficient till rejects transfer',async()=>{
 fixtures();await Capital.save('receive');
 global.document.getElementById=(id)=>({capitalCurrency:{value:'SYP'},capitalAmount:{value:'800'},capitalNote:{value:'إرجاع'}}[id]);
 await Capital.save('pay');assert.equal(Capital.total().SYP,1700);
 assert.equal(Capital.cashMovements()[1].outflow,800);
 global.FieldCash.summary=()=>({sypCash:100,usdCash:0});
 await Capital.save('pay');assert.equal(global.State.capitalMovements.length,2);
});
test('legacy sync snapshots accept optional capital ledger and new snapshots merge transfers exactly once',()=>{
 fixtures();const empty=Sync.snapshot(global.State);
 assert.deepEqual(empty.capitalMovements,[]);
 const fromOld=structuredClone(empty);delete fromOld.capitalMovements;
 assert.doesNotThrow(()=>Sync.ensureSnapshot(fromOld));
 const initial={...empty,capitalMovements:[{id:'capital_a1',kind:'capital-transfer',direction:'receive',amount:350,currency:'SYP',date:'2026-11-16T08:00:00Z'}]};
 const result=Sync.merge(empty,initial,empty);
 assert.equal(result.ok,true);assert.equal(result.snapshot.capitalMovements.length,1);
 const target={settings:{},fieldSync:{},capitalMovements:[]};
 Sync.apply(target,result.snapshot);assert.equal(target.capitalMovements[0].amount,350);
 assert.equal(Sync.emptyLedger(initial),false);
});
test('same capital record on phone and desktop does not double cash on repeated sync',()=>{
 fixtures();const empty=Sync.snapshot(global.State);
 const item={id:'capital_one',direction:'receive',amount:980,currency:'SYP',date:'2026-11-16T10:00:00Z'};
 const left={...empty,capitalMovements:[item]},right=structuredClone(left);
 const out=Sync.merge(empty,left,right);
 assert.equal(out.ok,true);assert.equal(out.snapshot.capitalMovements.length,1);
});
