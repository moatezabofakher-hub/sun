'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../app/src/main/assets/www/static/tiqany-peer-merge.js');
const state=({invoices=[],vouchers=[],expenses=[],imported=[]}={})=>M.snapshot({settings:{companyName:'مؤسسة',allowNegativeStockSales:true},categories:[],items:[],accounts:[],invoices,vouchers,expenses,warehouses:[],transfers:[],fieldSync:{imported}});
const origin=(operationId,receivedAt)=>({agentId:'agentA',operationId,agentName:'أحمد',receivedAt,localNumber:'INV-A1'});
const inv=(id,number,receivedAt,operationId='op_123')=>({id,number,type:'sale',date:'2026-11-15T10:02:19',accountId:'customer_9',currency:'SYP',exchangeRate:12000,rows:[{rowId:id+'-row',itemId:'soap',qty:2,unitFactor:1,unitName:'قطعة',price:50,total:100}],netTotal:100,paidAmount:20,note:'نقدي',fieldOrigin:origin(operationId,receivedAt)});
test('the same staff invoice received independently on phone and desktop posts only once despite different reception time and assigned number',()=>{
 const a=state({invoices:[inv('field_op_123',71,'2026-11-15T10:05:00')]});
 const b=state({invoices:[inv('field_op_123',86,'2026-11-15T10:07:00')]});
 const r=M.merge(null,a,b);
 assert.equal(r.ok,true);assert.equal(r.snapshot.invoices.length,1);assert.equal(r.snapshot.invoices[0].number,86);
 assert.equal(r.snapshot.invoices[0].netTotal,100);
 const again=M.merge(r.snapshot,r.snapshot,r.snapshot);assert.equal(again.ok,true);assert.equal(again.snapshot.invoices.length,1);
});
test('staff invoice imported under different ledger IDs merges by authentic agent and operation ID and fixes receipt reference',()=>{
 const phone=state({invoices:[inv('phone-copy',12,'2026-11-15T10:05:00')],vouchers:[{id:'linked-phone',date:'2026-11-15',type:'receipt',currency:'SYP',amount:20,accountId:'customer_9',linkedInvoiceId:'phone-copy'}]});
 const computer=state({invoices:[inv('desktop-copy',77,'2026-11-15T10:07:00')]});
 const result=M.merge(null,phone,computer);
 assert.equal(result.ok,true);assert.equal(result.stats.deduplicated,1);
 assert.equal(result.snapshot.invoices.length,1);assert.equal(result.snapshot.invoices[0].id,'desktop-copy');
 assert.equal(result.snapshot.vouchers[0].linkedInvoiceId,'desktop-copy');
});
test('identical amount, date, customer and items from DISTINCT staff operations remain two documents',()=>{
 const a=state({invoices:[inv('field_op_123',71,'2026-11-15T10:05:00','op_123')]});
 const b=state({invoices:[inv('field_op_456',72,'2026-11-15T10:07:00','op_456')]});
 const result=M.merge(null,a,b);assert.equal(result.ok,true);assert.equal(result.snapshot.invoices.length,2);
});
test('different financial details with identical source identity remain a conflict until reviewed',()=>{
 const a=state({invoices:[inv('phone-copy',11,'2026-11-15T10:05:00')]});
 const changed=inv('desktop-copy',12,'2026-11-15T10:07:00');changed.netTotal=125;
 const b=state({invoices:[changed]});
 const r=M.merge(null,a,b);assert.equal(r.ok,false);
 const d=r.details.find(x=>x.kind==='duplicate');assert.ok(d);assert.equal(d.collection,'invoices');
 const approve=M.merge(null,a,b,{[d.id]:{signature:d.signature,side:'computer'}});
 assert.equal(approve.ok,true);assert.equal(approve.snapshot.invoices.length,1);assert.equal(approve.snapshot.invoices[0].netTotal,125);
});
test('change of the invoice time with same source operation is not considered equivalent',()=>{
 const a=state({invoices:[inv('field_op_123',71,'2026-11-15T10:05:00')]});
 const second=inv('field_op_123',71,'2026-11-15T10:07:00');second.date='2026-11-15T10:04:00';
 const b=state({invoices:[second]});
 const r=M.merge(null,a,b);assert.equal(r.ok,false);assert.equal(r.details[0].collection,'invoices');
});
test('field imported receipt log for same agent operation is coalesced even if receivedAt differs',()=>{
 const a=state({imported:[{id:'op_123',agentId:'agentA',kind:'sale',receivedAt:'2026-11-15T10:05:00'}]});
 const b=state({imported:[{id:'op_123',agentId:'agentA',kind:'sale',receivedAt:'2026-11-15T10:07:00'}]});
 const r=M.merge(null,a,b);assert.equal(r.ok,true);assert.equal(r.snapshot.fieldImported.length,1);
});
test('same imported operation ID belonging to different employees requires explicit conflict resolution',()=>{
 const a=state({imported:[{id:'op_123',agentId:'agentA',kind:'sale'}]});
 const b=state({imported:[{id:'op_123',agentId:'agentB',kind:'sale'}]});
 const r=M.merge(null,a,b);assert.equal(r.ok,false);
});
test('equal-looking non-staff documents do not get coalesced by coincidence',()=>{
 const a=state({invoices:[{id:'p',number:1,date:'2026-11-15T10:00',accountId:'c',currency:'SYP',netTotal:90}]});
 const b=state({invoices:[{id:'w',number:2,date:'2026-11-15T10:00',accountId:'c',currency:'SYP',netTotal:90}]});
 const r=M.merge(null,a,b);assert.equal(r.ok,true);assert.equal(r.snapshot.invoices.length,2);
});

test('an offline sale imported by both main devices affects shared inventory exactly once',()=>{
 const item={id:'soap',name:'صابونة',openingStockBase:10};
 const warehouse={id:'wh_main',name:'رئيسي'};
 const p=state({invoices:[{...inv('same-op',15,'2026-11-15T10:05:00'),warehouseId:'wh_main'}]});
 const w=state({invoices:[{...inv('same-op',20,'2026-11-15T10:07:00'),warehouseId:'wh_main'}]});
 for(const snap of [p,w]){snap.items=[item];snap.warehouses=[warehouse];}
 const result=M.merge(null,p,w);
 assert.equal(result.ok,true);assert.equal(result.snapshot.invoices.length,1);
 assert.equal(M.itemStock(result.snapshot,'soap','wh_main'),8);
});
test('employee receipt copied into both masters does not double-count collected payments',()=>{
 const v=(id,number,time)=>({id,number,type:'receipt',date:'2026-11-15T11:15:03',amount:650,currency:'SYP',exchangeRate:13500,accountId:'customer_9',note:'قبض',fieldOrigin:origin('op_cash',time)});
 const p=state({vouchers:[v('local-v',30,'2026-11-15T11:20:00')]});
 const w=state({vouchers:[v('desk-v',31,'2026-11-15T11:22:00')]});
 const result=M.merge(null,p,w);
 assert.equal(result.ok,true);assert.equal(result.snapshot.vouchers.length,1);
 assert.equal(result.snapshot.vouchers.reduce((sum,x)=>sum+x.amount,0),650);
});
test('expense copied to both managers ignores import receipt timestamp but preserves expense currency/date',()=>{
 const ex=(id,receivedAt,updatedAt)=>({id,date:'2026-11-15',amount:135,currency:'USD',category:'نقل',exchangeRate:13500,note:'وقود',updatedAt,fieldOrigin:origin('op_expense',receivedAt)});
 const p=state({expenses:[ex('expense-phone','2026-11-15T11:20:00','2026-11-15T11:20:00')]});
 const w=state({expenses:[ex('expense-win','2026-11-15T11:22:00','2026-11-15T11:22:00')]});
 const result=M.merge(null,p,w);
 assert.equal(result.ok,true);assert.equal(result.snapshot.expenses.length,1);
 assert.equal(result.snapshot.expenses[0].amount,135);
});
