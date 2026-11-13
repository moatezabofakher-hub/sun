/* 1.2.8 — Agent expense receipts: offline append-only, manager-only accounting posting.
 * A receipt is NOT a customer voucher and must never alter customer receivables. */
(function(){
'use strict';
const A=Agent;
const expenseCategories=['نقل ومحروقات','رواتب وأجور','إيجار','كهرباء ومياه','صيانة','تسويق','مصاريف إدارية','أخرى'];
A.renderExpense=function(){
 const cash=this.cashSummary(),available=!!this.state.agentCash;
 return `<div class="hero"><h2>إيصال دفع مصاريف</h2><p>يسجل المصروف على صندوق المندوب، ويُضاف إلى مصاريف الشركة باسم المندوب بعد المزامنة. لا يؤثر على ذمم الزبائن.</p></div>
 <section class="panel"><h3>تفاصيل المصروف</h3>
 <label class="label" for="eCategory">نوع المصروف</label><select id="eCategory" class="field">${expenseCategories.map(x=>`<option value="${this.escape(x)}">${this.escape(x)}</option>`).join('')}</select>
 <label class="label" for="eAmount">المبلغ المدفوع</label><input id="eAmount" class="field ltr" type="number" inputmode="decimal" min="0.01" step="any" placeholder="0"/>
 <label class="label" for="eCurrency">العملة</label><select id="eCurrency" class="field"><option value="SYP">ليرة سورية SYP</option><option value="USD">دولار USD</option></select>
 <label class="label" for="eDate">تاريخ الإيصال</label><input id="eDate" class="field" type="date" value="${this.defaultDate().slice(0,10)}"/>
 <label class="label" for="eNote">البيان (اختياري)</label><textarea id="eNote" class="field" maxlength="200" rows="2" placeholder="تفاصيل سبب الصرف"></textarea>
 <p class="tiny">${available?'رصيد الصندوق الحالي: '+this.money(cash.syp,'SYP')+' ل.س · '+this.money(cash.usd,'USD')+' $':'لم يصل كشف صندوق من الرئيسي بعد؛ سيتم التحقق من الرصيد بعد أول مزامنة.'}</p>
 <button type="button" class="primary" onclick="Agent.saveExpense()">✓ حفظ إيصال المصروف</button></section>`;
};
A.saveExpense=async function(){
 if(this.busy)return;this.busy=true;
 try{
  if(!await this.active())throw Error('يجب تفعيل جهاز المندوب');
  const el=id=>document.getElementById(id)?.value;
  const category=String(el('eCategory')||'').trim(),currency=el('eCurrency'),note=String(el('eNote')||'').trim(),date=el('eDate');
  if(!expenseCategories.includes(category))throw Error('اختر نوع المصروف من القائمة');
  if(!/^\d{4}-\d\d-\d\d$/.test(String(date))||!Number.isFinite(Date.parse(date)))throw Error('تاريخ المصروف غير صحيح');
  const amount=FieldProtocol.money(el('eAmount'),currency);
  if(amount<=0)throw Error('مبلغ المصروف يجب أن يكون موجبًا');
  if(this.state.agentCash){const box=this.cashSummary(),balance=currency==='USD'?box.usd:box.syp;
   if(amount>balance+0.001)throw Error('رصيد صندوق المندوب لا يكفي لهذا المصروف');
  }
  const op={id:'op_'+FieldProtocol.uuid(),kind:'expense',companyId:this.state.companyId,agentId:this.state.agentId,warehouseId:this.state.warehouseId,
   localNumber:'E-'+(this.state.ops.length+1),date:new Date(date+'T12:00:00').toISOString(),currency,exchangeRate:Number(this.state.exchangeRate),
   category,amount,note};
  const validated=FieldProtocol.validateOps([op],this.state.agentId,this.state.companyId,this.state.warehouseId,this.state.items,this.state.accounts);
  await this.appendOperation(validated[0]);
  this.stack=['home','ops'];await this.show('ops');this.toast('حُفظ إيصال المصروف وسيُرحّل إلى الرئيسي تلقائيًا');
  this.scheduleAutoSync?.(250);
 }catch(e){this.toast('لم يُحفظ المصروف: '+e.message);}finally{this.busy=false;}
};
// Expense form is a nested workflow with the same back behavior as invoice/voucher.
const previousShow=A.show.bind(A);
A.show=async function(route){
 if(route!=='expense')return previousShow(route);
 if(!this.ready()||!await this.active())return previousShow('home');
 this.screen=route;
 document.getElementById('screen').innerHTML=this.renderExpense();
 document.getElementById('agentBack')?.classList.remove('hide');
 document.getElementById('agentScreenTitle').textContent='إيصال مصروف';
 document.getElementById('agentScreenSubtitle').textContent='نسخة المندوب · '+(this.state.companyName||'');
 document.getElementById('bottom')?.classList.remove('hide');
 document.querySelectorAll('.bottom button').forEach(b=>b.classList.toggle('active',false));
};
const previousNavigate=A.navigate.bind(A);
A.navigate=async function(route){
 if(this.screen==='expense'&&route!=='expense'&&(document.getElementById('eAmount')?.value||document.getElementById('eNote')?.value)){
  this.confirmAction('إيصال مصروف غير محفوظ','هل تريد تجاهل بيانات المصروف؟',()=>{
   this.stack=this.bottomRoutes.includes(route)?(route==='home'?['home']:['home',route]):[...this.stack,route];
   this.show(route);
  });return;
 }
 return previousNavigate(route);
};
})();
