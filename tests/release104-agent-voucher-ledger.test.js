"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..','field_agent/src/main/assets/www');
const script=fs.readFileSync(path.join(root,'static/agent-voucher-ledger-footer-35104.js'),'utf8');
const html=fs.readFileSync(path.join(root,'static/agent-experience.js'),'utf8');
function setup({amount='25',kind='receipt',account='a',currency='USD',existing=null,snapshot=true}={}){
 const controls={vAcc:{value:account},vAmount:{value:amount},vCurrency:{value:currency},vKind:{value:kind}};
 const A={
  state:{ops:existing?[existing]:[]},editingId:existing?.id||null,screen:'voucher',
  balanceFor(id){return snapshot?{available:true,syp:2000,usd:100}: {available:false};},
  renderVoucher(){return `<div class="ta-agent-voucher-actions ta-agent-voucher-footer" role="group" aria-label="خيارات حفظ أو إلغاء السند">X</div>`},
  async show(){return true},
  balanceLabel(n,c){return n+' '+c},
 };
 const doc={getElementById(id){return controls[id]||null;},querySelector(){return null;},addEventListener(){}};
 vm.runInNewContext(script,{window:{Agent:A},Agent:A,document:doc,Number});
 return A;
}
test('employee voucher footer contains separate previous and projected balance above actions',()=>{
 const A=setup();const h=A.renderVoucher();
 assert.match(h,/data-agent-voucher-before/);assert.match(h,/data-agent-voucher-after/);
 assert.match(h,/ta-agent-voucher-footer/);assert.match(html,/Agent\.saveVoucher\(\)/);
});
test('employee receipt reduces balance; payment increases it',()=>{
 assert.equal(setup({kind:'receipt'}).voucherBalancePreview().after,75);
 assert.equal(setup({kind:'payment'}).voucherBalancePreview().after,125);
 assert.equal(setup({kind:'receipt',currency:'SYP'}).voucherBalancePreview().after,1975);
});
test('editing a posted voucher backs out previous effect before projecting new value',()=>{
 const A=setup({kind:'receipt',amount:'30',existing:{id:'z',accountId:'a',kind:'receipt',currency:'USD',amount:20}});
 const p=A.voucherBalancePreview();assert.equal(p.before,120);assert.equal(p.after,90);
});
test('missing manager balance snapshot displays unavailable instead of an invented zero',()=>{
 const p=setup({snapshot:false}).voucherBalancePreview();assert.equal(p.available,false);
});
