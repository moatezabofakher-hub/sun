/* 3.5.105 — employee home layout and quick rate. Accounting and sync are unchanged. */
(function(){'use strict';
if(typeof Agent==='undefined')return;
const A=Agent;
const prevHome=A.renderHome.bind(A);
const prevSettings=A.renderSettings.bind(A);
const prevShow=A.show.bind(A);
const prevBack=A.goBack.bind(A);
// Do not remove Bluetooth printer support: only the home print shortcut is hidden.
A.renderHome=function(...args){
 let html=prevHome(...args);
 html=html.replace(/<section class="panel"><h3>الطباعة السريعة<\/h3>[\s\S]*?<\/section>/,'');
 const newItemPanel=/<section class="panel"><button class="primary" type="button" onclick="Agent.openNewItemForm\(\)">\+ إضافة مادة جديدة<\/button>[\s\S]*?<\/section>/;
 const hasItemButton=newItemPanel.test(html);
 html=html.replace(newItemPanel,'');
 if(hasItemButton){
  const tile='<button type="button" class="tile" onclick="Agent.openNewItemForm()"><span class="glyph">＋</span><strong>إضافة مادة جديدة</strong><small>إضافة مادة وفق صلاحية المسؤول</small></button>';
  // The account-balances tile is created by the manager-parity UI; place both together.
  const balanceTile=/<button class="tile" onclick="Agent.navigate\('accounts'\)">[\s\S]*?<\/button>/;
  if(balanceTile.test(html))html=html.replace(balanceTile,match=>match+tile);
  else html=html.replace(/(<section class="panel"><h3>العمليات السريعة<\/h3><div class="grid">)/,'$1'+tile);
 }
 return html;
};
A.renderSettings=function(...args){
 let html=prevSettings(...args);
 // Employee invoice/POS rules come from the manager: hide the editor, keep persisted settings.
 html=html.replace(/<section class="panel" id="agentPosSettings">[\s\S]*?<\/section>/,'');
 return html;
};
A.refreshQuickExchangeRate=function(){
 const value=document.getElementById('agentHeaderExchangeRate');
 if(value){const rate=Number(this.state?.exchangeRate);value.textContent=Number.isFinite(rate)&&rate>0?rate.toLocaleString('en-US',{maximumFractionDigits:4}):'—';}
};
A.openQuickExchangeRate=function(){
 if(!this.requireRight?.('exchangeRate'))return;
 let modal=document.getElementById('agentQuickFxMask');
 if(!modal){
  modal=document.createElement('div');modal.id='agentQuickFxMask';modal.className='dialog-mask hide';
  modal.setAttribute('role','presentation');
  modal.innerHTML=`<div class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="agentQuickFxTitle">
    <h3 id="agentQuickFxTitle"><span aria-hidden="true">🪙</span> تحديث سعر الصرف اللحظي</h3>
    <p class="tiny">يُعتمد السعر الجديد للعمليات الجديدة فقط. ولا يُعاد احتساب العمليات المحفوظة سابقاً. تعديل السعر متاح وفق صلاحية المسؤول.</p>
    <label class="label" for="agentQuickFxInput">سعر صرف الدولار: 1$ مقابل ل.س</label>
    <input id="agentQuickFxInput" class="field ta-fx-input" type="number" inputmode="decimal" min="0.000001" max="10000000000" step="any" />
    <div class="dialog-actions"><button type="button" class="primary ta-fx-save" onclick="Agent.saveQuickExchangeRate()">حفظ واعتماد</button><button type="button" class="secondary" onclick="Agent.closeQuickExchangeRate()">إلغاء</button></div>
   </div>`;
  modal.addEventListener('click',event=>{if(event.target===modal)A.closeQuickExchangeRate();});
  document.body.appendChild(modal);
 }
 const input=modal.querySelector('#agentQuickFxInput');
 if(input)input.value=String(Number(this.state?.exchangeRate)||'');
 modal.classList.remove('hide');
 input?.focus();input?.select();
};
A.closeQuickExchangeRate=function(){document.getElementById('agentQuickFxMask')?.classList.add('hide');};
A.saveQuickExchangeRate=async function(){
 if(!this.requireRight?.('exchangeRate'))return false;
 const rate=Number(document.getElementById('agentQuickFxInput')?.value);
 if(!Number.isFinite(rate)||rate<=0||rate>1e10){this.toast('سعر الصرف يجب أن يكون رقماً موجباً صحيحاً');return false;}
 const oldRate=this.state.exchangeRate,oldOverride=this.state.exchangeRateOverride;
 try{
  this.state.exchangeRate=rate;
  this.state.exchangeRateOverride=rate;
  await this.save();
  this.refreshQuickExchangeRate();
  this.closeQuickExchangeRate();
  this.toast('تم اعتماد سعر الصرف للعمليات الجديدة؛ لن تتغير العمليات السابقة');
  return true;
 }catch(error){
  this.state.exchangeRate=oldRate;
  this.state.exchangeRateOverride=oldOverride;
  this.refreshQuickExchangeRate();
  this.toast('تعذر حفظ سعر الصرف: '+(error?.message||'خطأ غير معروف'));
  return false;
 }
};
A.goBack=async function(...args){
 const modal=document.getElementById('agentQuickFxMask');
 if(modal&&!modal.classList.contains('hide')){this.closeQuickExchangeRate();return;}
 return prevBack(...args);
};
A.show=async function(...args){const result=await prevShow(...args);this.refreshQuickExchangeRate();return result;};
document.addEventListener('DOMContentLoaded',()=>A.refreshQuickExchangeRate());
})();
