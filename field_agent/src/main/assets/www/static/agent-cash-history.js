/* 3.5.37 — Complete restorable agent journal, independent cashbox and read-only transfer documents.
 * All manager snapshots arrive inside an authenticated encrypted sync response. */
(function(){
'use strict';
const A=Agent,esc=v=>A.escape(v);
A.mergeHistoryPage=function(page,old=this.state){
 const ops=Array.isArray(old?.ops)?old.ops.slice():[];
 let cursor=Math.max(0,Number(old?.historyCursor)||0);
 const restoredIds=[];
 if(!page||!Array.isArray(page.ops))return {ops,cursor,restoredIds};
 const current=new Set(ops.map(o=>o.id));
 for(const op of page.ops){
  if(!op||typeof op.id!=='string'||!op.id.startsWith('op_')||op.agentId!==old.agentId||op.companyId!==old.companyId||!['sale','sale_return','receipt','payment','expense','customer_create'].includes(op.kind))continue;
  if(!current.has(op.id)){ops.push(op);current.add(op.id);restoredIds.push(op.id);}
 }
 cursor=Math.max(cursor,Math.min(1e8,Math.max(0,Number(page.nextCursor)||0)));
 // Received history is immutable. Keep local, unacknowledged invoices even during device recovery.
 ops.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||a.id.localeCompare(b.id));
 return {ops,cursor,restoredIds};
};
A.mergeTransferPage=function(page,old=this.state){
 let docs=Array.isArray(old?.warehouseTransfers)?old.warehouseTransfers.slice():[];
 let cursor=Math.max(0,Number(old?.warehouseHistoryCursor)||0);
 if(!page||!Array.isArray(page.docs))return {docs,cursor,revision:old?.warehouseTransferRevision||''};
 const revision=String(page.revision||'');
 if(revision!==String(old?.warehouseTransferRevision||'')){
  // A manager edit may have changed a previously received transfer document.
  // Restart from page zero rather than keeping stale cached invoice lines.
  if(Number(page.offset||0)!==0)return {docs:[],cursor:0,revision};
  docs=[];cursor=0;
 }
 const index=new Map(docs.map(d=>[String(d.id),d]));
 for(const doc of page.docs){
  if(!doc||typeof doc.id!=='string'||!Array.isArray(doc.lines))continue;
  if(doc.fromWarehouseId!==old.warehouseId&&doc.toWarehouseId!==old.warehouseId)continue;
  index.set(doc.id,doc); // reflect manager edits to existing transfer invoices
 }
 cursor=Math.max(cursor,Math.min(1e8,Math.max(0,Number(page.nextCursor)||0)));
 return {docs:[...index.values()].sort((a,b)=>String(b.date).localeCompare(String(a.date))),cursor,revision};
};
A.cashSummary=function(){
 const base=this.state.agentCash||{};
 let syp=Number(base.sypCash||0),usd=Number(base.usdCash||0);
 const accepted=new Set(this.state.snapshotIds||[]);
 const pending=[];
 for(const op of (this.state.ops||[])){
  if(accepted.has(op.id)||op.kind==='customer_create')continue;
  const amount=['sale','sale_return'].includes(op.kind)?Number(op.paidAmount||0):Number(op.amount||0);
  if(!Number.isFinite(amount)||amount<=0)continue;
  const positive=['sale','receipt'].includes(op.kind);
  if(op.currency==='SYP')syp+=positive?amount:-amount;else if(op.currency==='USD')usd+=positive?amount:-amount;
  pending.push({id:op.id,date:op.date,currency:op.currency,amount:positive?amount:-amount,desc:this.kindName(op.kind)+' · '+(op.kind==='expense'?op.category+' · ':'')+String(op.localNumber||''),pending:true});
 }
 const transfers=(this.state.cashTransfers||[]).map(t=>({id:t.id,date:t.date,currency:t.currency,amount:t.direction==='toAgent'?Number(t.amount):-Number(t.amount),desc:t.direction==='toAgent'?'استلام دفعة من الرئيسي':'تسليم دفعة للرئيسي',pending:false}));
 const local=(this.state.ops||[]).filter(op=>op.kind!=='customer_create').map(op=>{
   const amount=['sale','sale_return'].includes(op.kind)?Number(op.paidAmount||0):Number(op.amount||0);
   return {id:op.id,date:op.date,currency:op.currency,amount:['sale','receipt'].includes(op.kind)?amount:-amount,
     desc:this.kindName(op.kind)+' · '+(op.kind==='expense'?op.category+' · ':'')+String(op.localNumber||''),pending:!accepted.has(op.id)};
 }).filter(x=>Number.isFinite(x.amount)&&x.amount!==0);
 return {syp:Math.round(syp),usd:Math.round(usd*100)/100,
   movements:[...local,...transfers].sort((a,b)=>String(b.date).localeCompare(String(a.date)))};
};
A.cashShown=60;
A.invoicesShown=60;
A.showMoreCash=function(){this.cashShown+=60;this.show('cashbox');};
A.showMoreInvoices=function(){this.invoicesShown+=60;this.show('invoices');};
A.renderCashbox=function(){
 const box=this.cashSummary(),updated=this.state.lastSyncAt||this.state.issuedAt;
 return `<div class="hero"><h2>صندوق المندوب</h2><p>رصيد النقد الخاص بك بالدولار والليرة؛ يتأثر بالفواتير المقبوضة والسندات، وبالدفعات التي يسجلها الرئيسي مع صندوقك.</p></div>
 <section class="panel"><h3>الرصيد الحالي</h3><div class="grid grid-cols-2 gap-2"><div class="stat"><b>${this.money(box.syp,'SYP')}</b><small>ليرة سورية SYP</small></div><div class="stat"><b>${this.money(box.usd,'USD')}</b><small>دولار USD</small></div></div>
 <p class="tiny">${updated?'آخر كشف من الرئيسي: '+esc(new Date(updated).toLocaleString('ar')):'لم يتم استلام كشف من الرئيسي بعد'}. تُضاف الحركات المحلية غير المرحّلة دون ازدواج.</p></section>
 <section class="panel"><h3>حركة الصندوق</h3>${box.movements.length?box.movements.slice(0,this.cashShown).map(x=>`<div class="itemrow ${x.amount>0?'agent-cash-inflow':'agent-cash-outflow'}"><div class="itemhead"><b>${esc(x.desc)}</b><b class="agent-cash-amount">${x.amount>=0?'+':'−'}${this.money(Math.abs(x.amount),x.currency)} ${esc(x.currency)}</b></div><p class="tiny">${esc(String(x.date||'').replace('T',' ').slice(0,16))} ${x.pending?'· بانتظار المزامنة':''}</p></div>`).join(''):'<p class="muted">لا توجد حركات نقدية.</p>'}</section>`;
};
A.renderInvoices=function(){
 const invoices=(this.state.ops||[]).filter(o=>o.kind==='sale'||o.kind==='sale_return').slice().reverse();
 return `<div class="hero"><h2>الفواتير</h2><p>جميع الفواتير التي أُنشئت في تطبيق المندوب، بما فيها الفواتير التي استعدت من الحساب الرئيسي بعد استبدال الهاتف.</p></div>
 <div class="grid" style="margin-bottom:16px"><button class="tile" onclick="Agent.startInvoice('sale')"><span class="glyph">🛒</span><strong>فاتورة جديدة</strong></button><button class="tile" onclick="Agent.startInvoice('sale_return')"><span class="glyph">↩</span><strong>مردود مبيعات</strong></button></div>
 <section class="panel"><h3>سجل الفواتير (${invoices.length})</h3>${invoices.length?invoices.slice(0,this.invoicesShown).map(o=>`<div class="itemrow"><div class="itemhead"><b>${esc(o.localNumber||o.id)} · ${esc(this.kindName(o.kind))}</b><span class="pill ${this.state.knownIds.includes(o.id)?'':'wait'}">${this.state.knownIds.includes(o.id)?'مرحّلة':'غير مرحّلة'}</span></div>
 <p class="tiny">${esc(String(o.date||'').replace('T',' ').slice(0,16))} · ${esc((this.state.accounts||[]).find(x=>x.id===o.accountId)?.name||'نقدي')}</p>
 <div class="itemhead"><b>${this.money(Number(o.netTotal??(o.rows||[]).reduce((sum,r)=>sum+Number(r.total||0),0)),o.currency)} ${esc(o.currency)}</b><button class="secondary" style="width:auto;margin:0;padding:7px 12px" onclick="Agent.printOp('${esc(o.id)}')">🖨 طباعة</button></div></div>`).join(''):'<p class="muted">لم تُنشأ أي فواتير بعد.</p>'}
 ${invoices.length>this.invoicesShown?`<button class="secondary" onclick="Agent.showMoreInvoices()">عرض فواتير أقدم (${invoices.length-this.invoicesShown})</button>`:''}</section>`;
};
const oldStock=A.renderStock.bind(A);
A.renderStock=function(){
 const docs=this.state.warehouseTransfers||[];
 return oldStock()+`<section class="panel"><h3>فواتير المناقلة مع الحساب الرئيسي (${docs.length})</h3>
 <p class="tiny">سجل للعرض فقط — تعديل وإلغاء المناقلة متاحان من الحساب الرئيسي وحده.</p>
 ${docs.length?docs.map(d=>{
  const incoming=d.toWarehouseId===this.state.warehouseId;
  return `<details class="itemrow"><summary style="cursor:pointer"><b>${incoming?'⬇ وارد إلى السيارة':'⬆ صادر من السيارة'} · ${esc(String(d.date||'').slice(0,10))}</b><p class="tiny">من ${esc(d.fromName)} إلى ${esc(d.toName)} · ${d.lines.length} صنف</p></summary>
  <div style="background:#f5fafc;border-radius:12px;padding:10px">${d.lines.map(r=>`<div class="itemhead tiny" style="padding:6px"><span>${esc(r.itemName)}</span><b>${esc(r.quantity??r.quantityBase)} ${esc(r.unitName||'وحدة أساسية')}</b></div>`).join('')}
  ${d.note?`<p class="tiny">البيان: ${esc(d.note)}</p>`:''}</div></details>`;
 }).join(''):'<p class="muted">لم تُستلم فواتير مناقلة بعد.</p>'}</section>`;
};
const oldHome=A.renderHome.bind(A);
A.renderHome=function(){const box=this.cashSummary();return `<section class="panel agent-cash-compact" id="agentCashTop"><h3>صندوق المندوب</h3><div class="stats"><div class="stat"><b>${this.money(box.usd,'USD')}</b><small>USD</small></div><div class="stat"><b>${this.money(box.syp,'SYP')}</b><small>SYP</small></div><div class="stat"><button class="secondary" onclick="Agent.navigate('cashbox')">عرض الحركة</button><small>كشف الصندوق</small></div></div></section>`+oldHome();};
// Preserve old back-button behavior; field screens are read-only except invoice creation.
const oldShow=A.show.bind(A);
A.show=async function(route){
 if(route!=='cashbox'&&route!=='invoices')return oldShow(route);
 if(!this.ready()||!await this.active())return oldShow('home');
 this.screen=route;
 const el=document.getElementById('screen');if(el)el.innerHTML=route==='cashbox'?this.renderCashbox():this.renderInvoices();
 document.getElementById('bottom')?.classList.remove('hide');
 document.querySelectorAll('.bottom button').forEach(b=>b.classList.toggle('active',b.id==='nav-'+route));
 document.getElementById('agentBack')?.classList.toggle('hide',!(this.stack||[]).length||this.stack.length<2);
 const head=document.getElementById('agentScreenTitle');if(head)head.textContent=route==='cashbox'?'صندوق المندوب':'الفواتير';
 const sub=document.getElementById('agentScreenSubtitle');if(sub)sub.textContent='نسخة المندوب · '+(this.state.companyName||'');
};
})();
