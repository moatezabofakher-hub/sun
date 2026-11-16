"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','app/src/main/assets/www/index.html'),'utf8');
test('invoice currency uses live short code in header, preserving ISO currency storage',()=>{
 assert.match(src,/cur === 'SYP' \? 'ل\.س' : '\$USD'/);
 assert.match(src,/onclick="InvoiceController\.toggleInvoiceCurrency\(\)"/);
});
test('voucher ledger bar has balances and guarded save + cancel',()=>{
 assert.match(src,/voucherPreviewBalances\(\) \{/);
 assert.match(src,/getAccountStatement\(d\.accountId,null,d\.isEditing\?d\.id:null\)/);
 assert.match(src,/d\.type==='receipt'\?-1:1/);
 assert.match(src,/class="ta-voucher-save-footer"/);
 assert.match(src,/data-voucher-before/);
 assert.match(src,/data-voucher-after/);
 assert.match(src,/class="ta-voucher-save-action"/);
 assert.match(src,/class="ta-voucher-cancel-action"/);
 assert.match(src,/VoucherController\.updateBalanceFooter\(\)/);
});
test('voucher amount and clearing fields refresh ledger projection',()=>{
 assert.match(src,/VoucherController\.recalcClearing\(\)/);
 assert.match(src,/VoucherController\.draft\.accountAmount = Accounting\.parseNum\(this\.value\); VoucherController\.markModified\(\); VoucherController\.updateBalanceFooter\(\)/);
});
test('Sales staff shortcut hidden from manager settings but dedicated agent page remains',()=>{
 assert.doesNotMatch(src,/موظفو البيع والمزامنة المحلية<\/button>/);
 assert.match(src,/AppNav\.navigate\('agent_hub'\)/);
});

test('voucher projection uses posting currency, receipt/payment signs, and excludes original on edit',()=>{
 const m=src.match(/voucherPreviewBalances\(\) \{([\s\S]*?)\n            \},\n\n            updateBalanceFooter/);
 assert.ok(m,'ledger preview method located');
 const acct={id:'a'},calls=[];
 const State={accounts:[acct]};
 const Accounting={getAccountStatement(...args){calls.push(args);return {sypBalance:1200,usdBalance:100};},round(n,c){return c==='SYP'?Math.round(n):Math.round(n*100)/100;}};
 const f=new Function('State','Accounting',`return ({voucherPreviewBalances(){${m[1]}}}).voucherPreviewBalances;`)(State,Accounting);
 const receipt=f.call({draft:{accountId:'a',type:'receipt',currency:'SYP',accountCurrency:'USD',accountAmount:35,isEditing:false}});
 assert.equal(receipt.currency,'USD');assert.equal(receipt.before,100);assert.equal(receipt.after,65);
 const payment=f.call({draft:{id:'v-1',accountId:'a',type:'payment',currency:'SYP',accountCurrency:'SYP',accountAmount:250,isEditing:true}});
 assert.equal(payment.before,1200);assert.equal(payment.after,1450);
 assert.equal(calls[1][2],'v-1');
});
