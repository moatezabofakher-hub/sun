// Regression: live previous/final balance while invoice is still a draft. No writes to ledger.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const main=path.resolve('app/src/main/assets/www/index.html');
const html=fs.readFileSync(main,'utf8');
const script=fs.readFileSync('app/src/main/assets/www/static/draft-invoice-balance-preview.js','utf8');
const h=require(path.resolve('app/src/main/assets/www/static/draft-invoice-balance-preview.js'));
const equal=(got,exp)=>assert.equal(got,exp);
// Signed balance: positive=customer owes us, negative=we owe customer/supplier.
equal(h.project(40,{currency:'USD',type:'sale',netTotal:100,paidAmount:0}).after,140); // credit sale
equal(h.project(40,{currency:'USD',type:'sale',netTotal:100,paidAmount:100}).after,40); // cash sale
equal(h.project(40,{currency:'USD',type:'sale',netTotal:100,paidAmount:35}).after,105); // partial
equal(h.project(-100,{currency:'USD',type:'sale',netTotal:20,paidAmount:0}).after,-80); // customer has credit
equal(h.project(-40,{currency:'USD',type:'purchase',netTotal:100,paidAmount:10}).after,-130); // credit supplier purchase
equal(h.project(30,{currency:'USD',type:'purchase_return',netTotal:20,paidAmount:5}).after,45); // purchase return
equal(h.project(30,{currency:'USD',type:'sale_return',netTotal:20,paidAmount:5}).after,15); // sale return
equal(h.project(10000,{currency:'SYP',type:'sale',netTotal:600,paidAmount:150}).after,10450);
equal(h.project(10,{currency:'USD',type:'sale',netTotal:10,paidAmount:3.45}).after,16.55);
assert.equal(h.project(null,{currency:'USD',kind:'sale',netTotal:10,paidAmount:0}).available,false);
assert.equal(h.project(10,{currency:'USD',kind:'sale',netTotal:10,paidAmount:12}).available,false);
assert.equal(h.project(10,{currency:'EUR',kind:'sale',netTotal:10,paidAmount:0}).available,false);
assert.equal(h.project(40,{currency:'USD',type:'sale',netTotal:100,paidAmount:100}).delta,0);
// DOM wiring, checked on shipped sources in addition to the calculation tests.
assert(html.includes('draftBalanceHTML()')&&html.includes('refreshDraftBalanceDOM()'));
assert(html.includes('this.refreshDraftBalanceDOM()'));
assert(html.includes('${this.draftBalanceHTML()}'));
assert(html.includes('static/draft-invoice-balance-preview.js'));
if(fs.existsSync('field_agent/src/main/assets/www/index.html')){
 const agentHTML=fs.readFileSync('field_agent/src/main/assets/www/index.html','utf8');
 const agent=fs.readFileSync('field_agent/src/main/assets/www/static/agent-invoice-parity.js','utf8');
 assert(agentHTML.includes('static/draft-invoice-balance-preview.js'));
 assert(agent.includes('A.draftAccountBalance=function')&&agent.includes('this.paintDraftBalance()'));
 assert(agent.includes('${this.draftBalanceHTML()}'));
}
console.log('PASS: live draft balances by currency, payment method, supplier/customer sign and UI event wiring');
