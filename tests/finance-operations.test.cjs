const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const dir=['../app/src/main/assets/www/static','../web/static'].map(d=>path.join(__dirname,d)).find(d=>fs.existsSync(path.join(d,'finance-operations.js')));
const F=require(path.join(dir,'finance-operations.js'));
const item={id:'soap',currency:'SYP',openingStockBase:0,units:[{name:'قطعة',factor:1,costPrice:10000}]};
function inv(id,type,date,qty,price,currency='SYP'){return {id,type,date,accountId:'client',currency,exchangeRate:10000,rows:[{rowId:id+'r',itemId:'soap',qty,price,total:qty*price,unitFactor:1}],netTotal:qty*price,paidAmount:0,remainingAmount:qty*price};}
test('weighted purchases, outgoing inventory and frozen historical sales',()=>{
 const state={items:[item],settings:{},invoices:[inv('p1','purchase','2026-01-01',10,10000),inv('p2','purchase','2026-01-02',10,14000)]};
 const sale=inv('s','sale','2026-01-03',5,16000);F.freeze(state,sale);
 assert.equal(sale.rows[0].baseCostPrice,12000);assert.equal(sale.netTotal-5*sale.rows[0].baseCostPrice,20000);
 state.invoices.push(sale,inv('p3','purchase','2026-01-04',5,20000));
 assert.equal(F.costs(state).get('soap').cost,14000);
 const edit=structuredClone(sale);F.freeze(state,edit,sale);assert.equal(edit.rows[0].baseCostPrice,12000);
});
test('net cost handles factors, invoice charges, discounts and historical exchange rate',()=>{
 const p=inv('p','purchase','2026-01-01',20,1,'USD');p.rows[0].unitFactor=2;p.taxAmount=2;p.discountAmount=1;
 const state={items:[item],settings:{},invoices:[p]};
 assert.equal(F.costs(state).get('soap').cost,21000);const s=inv('s','sale','2026-01-02',1,3);s.rows[0].unitFactor=2;F.freeze(state,s);assert.equal(s.rows[0].baseCostPrice,10500);
});
test('payment on account, allocation across invoices, optional realized differences and offline convergence',()=>{
 const a=inv('a','sale','2026-01-01',1,8,'USD'), b=inv('b','sale','2026-01-01',1,10,'USD');
 const state={invoices:[a,b],vouchers:[],settings:{},items:[]};
 const v={id:'v',type:'receipt',date:'2026-01-02',accountId:'client',currency:'SYP',amount:180000,accountCurrency:'USD',accountAmount:12,exchangeRate:15000};
 const requests=[{invoiceId:'a',amount:7},{invoiceId:'b',amount:3}];
 v.allocations=F.allocate(state,v,requests);assert.equal(v.allocations[0].fx,false);
 state.settings.settleFxOnPayment=true;v.allocations=F.allocate(state,v,requests);state.vouchers=[v];
 let book=F.settlements(state);assert.equal(book.used.get('v'),10);assert.equal(book.balances.get('a'),1);assert.equal(book.events.reduce((n,e)=>n+e.gainSyp,0),50000);
 state.settings.settleFxOnPayment=false;assert.equal(F.allocate(state,v,requests)[0].fx,true);
 assert.throws(()=>F.allocate(state,v,[{invoiceId:'a',amount:9}]));
 const extra={...v,id:'w',allocations:[{...v.allocations[0],amount:8}]};state.vouchers=[extra,v];
 assert.equal(F.settlements(state).used.get('w'),1);
 state.vouchers.reverse();assert.equal(F.settlements(state).used.get('w'),1);
 state.vouchers=[];assert.equal(F.settlements(state).balances.get('a'),8);
});
test('supplier loss, legacy linked voucher and no gain on domestic invoice',()=>{
 const p=inv('p','purchase','2026-01-01',1,10,'USD');
 const v={id:'w',type:'payment',accountId:'client',accountCurrency:'USD',currency:'USD',amount:4,accountAmount:4,exchangeRate:12000,linkedInvoiceId:'p'};
 const state={invoices:[p],vouchers:[v],settings:{settleFxOnPayment:true}};
 assert.equal(F.settlements(state).balances.get('p'),6);
 v.allocations=F.allocate(state,v,[{invoiceId:'p',amount:4}]);assert.equal(F.settlements(state).events[0].gainSyp,-8000);
 p.currency=v.accountCurrency='SYP';v.allocations=F.allocate(state,v,[{invoiceId:'p',amount:4}]);assert.equal(F.settlements(state).events.length,0);
});
test('cash counts keep currencies independent and due ages follow calendar days',()=>{
 assert.deepEqual(F.tillExpected({SYP:5000,USD:10},{SYP:3000,USD:5},{SYP:15000,USD:3}),{SYP:17000,USD:8});
 assert.equal(F.age({dueDate:'2026-03-31'},'2026-04-01'),1);
});
test('field receipt uses manager rates and remains idempotent after a phone-to-PC round trip',()=>{
 const invoice=inv('office-sale','sale','2026-01-01',1,10,'USD');
 const v={id:'v',type:'receipt',date:'2026-01-02',currency:'USD',accountCurrency:'USD',accountAmount:3,amount:3,exchangeRate:14000,accountId:'client',fieldOrigin:{operationId:'agent-op',agentId:'agent'}};
 const state={invoices:[invoice],vouchers:[v],items:[],settings:{settleFxOnPayment:true},cashShifts:[{id:'till_office_1',scope:'office',sequence:1,opening:{SYP:0,USD:0}}]};
 F.fieldPayments(state,[v],[{id:'agent-op',settlementInvoiceId:'office-sale'}],[]);
 const peerPath=path.join(dir,'tiqany-peer-merge.js');
 if(fs.existsSync(peerPath)){
   const merge=require(peerPath), replica={settings:{}};
   const snapshot=merge.snapshot(state);merge.apply(replica,snapshot);merge.apply(replica,snapshot);
   assert.deepEqual(replica.cashShifts,state.cashShifts);assert.equal(replica.settings.settleFxOnPayment,true);
   const book=F.settlements(replica);
   assert.equal(book.balances.get(invoice.id),7);assert.equal(book.events[0].gainSyp,12000);
 }
 assert.throws(()=>F.fieldPayments(state,[{...v,accountId:'other'}],[{id:'agent-op',settlementInvoiceId:invoice.id}],[]));
});
