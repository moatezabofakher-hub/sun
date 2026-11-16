/* 3.5.104: Project the voucher on the employee's last reconciled balance.
   Never fabricate a balance if the manager has not sent an account snapshot. */
(function(){'use strict';
 const A=window.Agent||Agent;
 function round(v,c){return c==='SYP'?Math.round(v):Math.round((v+Number.EPSILON)*100)/100;}
 A.voucherBalancePreview=function(){
  const id=document.getElementById('vAcc')?.value||'';
  const currency=document.getElementById('vCurrency')?.value||'USD';
  const kind=document.getElementById('vKind')?.value||this.voucherKind||'receipt';
  const amt=Number(document.getElementById('vAmount')?.value||0);
  if(!id)return {available:false,currency,reason:'اختر الحساب'};
  const data=this.balanceFor?.(id);
  if(!data?.available)return {available:false,currency,reason:'الرصيد غير متاح قبل مزامنة الحساب'};
  let before=currency==='SYP'?Number(data.syp):Number(data.usd);
  // For edited vouchers the currently posted operation must be backed out first.
  const existing=this.editingId&&(this.state.ops||[]).find(op=>op.id===this.editingId&&['receipt','payment'].includes(op.kind));
  if(existing&&existing.accountId===id&&existing.currency===currency)
   before-=Number(existing.amount||0)*(existing.kind==='receipt'?-1:1);
  before=round(before,currency);
  const after=round(before+(kind==='receipt'?-1:1)*(Number.isFinite(amt)?amt:0),currency);
  return {available:true,currency,before,after};
 };
 A.paintVoucherBalances=function(){
  const area=document.querySelector('#screen .ta-agent-voucher-footer');if(!area)return;
  const preview=this.voucherBalancePreview();
  const before=area.querySelector('[data-agent-voucher-before]');
  const after=area.querySelector('[data-agent-voucher-after]');
  const currency=area.querySelector('[data-agent-voucher-currency]');
  const fmt=n=>this.balanceLabel?this.balanceLabel(n,preview.currency):String(n);
  if(before)before.textContent=preview.available?fmt(preview.before):'—';
  if(after)after.textContent=preview.available?fmt(preview.after):'—';
  if(currency)currency.textContent=preview.available?(preview.currency==='USD'?'$ USD':'ل.س'):(preview.reason||'الرصيد غير متاح');
 };
 const render=A.renderVoucher;
 A.renderVoucher=function(...args){
  const html=render.apply(this,args);
  return html.replace('<div class="ta-agent-voucher-actions ta-agent-voucher-footer"',
    `<div class="ta-agent-voucher-actions ta-agent-voucher-footer"`)
   .replace('role="group" aria-label="خيارات حفظ أو إلغاء السند">',
    `role="group" aria-label="الرصيد السابق والنهائي مع حفظ وإلغاء السند">
       <div class="ta-agent-voucher-balance-grid">
         <div class="ta-agent-voucher-balance-tile"><span>الرصيد السابق</span><strong data-agent-voucher-before>—</strong></div>
         <div class="ta-agent-voucher-balance-tile"><span>الرصيد النهائي المتوقع</span><strong data-agent-voucher-after>—</strong></div>
       </div><div class="ta-agent-voucher-currency-note" data-agent-voucher-currency>—</div>`);
 };
 const show=A.show;
 A.show=async function(...args){try{return await show.apply(this,args);}finally{if(this.screen==='voucher')this.paintVoucherBalances();}};
 document.addEventListener('input',e=>{
  if(['vAcc','vAmount','vCurrency','vKind'].includes(e.target?.id))A.paintVoucherBalances();
 });
 document.addEventListener('change',e=>{
  if(['vAcc','vAmount','vCurrency','vKind'].includes(e.target?.id))A.paintVoucherBalances();
 });
 document.addEventListener('click',e=>{
  if(e.target?.closest?.('#vCurrencyToggle'))A.paintVoucherBalances();
 });
})();
