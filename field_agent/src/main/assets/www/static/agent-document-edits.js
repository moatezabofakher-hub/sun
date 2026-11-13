/* 3.5.44 — Edited field documents stay under their original ID; a separate authenticated revision
 * updates a previously-posted document transactionally at the manager. Never double-post edits. */
(function(){'use strict';
const A=Agent,clone=o=>JSON.parse(JSON.stringify(o)),esc=x=>A.escape(x),amount=(x,c)=>InvoiceDualBalances.round(x,c);
const eligible=o=>o&&['sale','sale_return','receipt','payment'].includes(o.kind);
const unackedRevision=(target)=>A.state.ops.find(o=>o.kind==='document_edit'&&o.targetOperationId===target&&!A.state.knownIds.includes(o.id));
A.editDocument=function(id){
 const op=this.state.ops.find(o=>o.id===id);
 if(!eligible(op))return this.toast('يمكن تعديل فواتير المبيعات والمردود وسندات العملاء فقط');
 if(this.pending?.some(x=>x.kind==='document_edit'&&x.targetOperationId===op.id&&Number(x.baseRevision)!==Number(op.revision||0)-1))
   return this.toast('يجب مزامنة التعديل السابق أولاً');
 this.editingId=id;
 if(['sale','sale_return'].includes(op.kind)){
   this.draft=clone(op.rows||[]);this.draftKind=op.kind;this.currency=op.currency;this.gridSearch='';this.gridCategory='all';
   const net=Number(op.netTotal??(op.rows||[]).reduce((s,r)=>s+Number(r.total||0),0));
   const paid=Number(op.paidAmount||0);
   const mode=paid>=net?'cash':paid===0?'credit':'partial';
   const d=new Date(op.date);const date=Number.isFinite(d.getTime())?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16):this.defaultDate();
   this.invoiceMeta={accountId:op.accountId||'',currency:op.currency,paymentMode:mode,paid:String(paid),date,
      note:op.note||'',discountValue:op.discountValue||0,discountType:op.discountType||'amount',
      taxValue:op.taxValue||0,taxType:op.taxType||'percent'};
   this.navigate('invoice');
 }else{
   this.voucherKind=op.kind;this.navigate('voucher');
 }
};
const startInvoice=A.startInvoice.bind(A);
A.startInvoice=function(kind){this.editingId=null;return startInvoice(kind);};
const startVoucher=A.startVoucher.bind(A);
A.startVoucher=function(kind){this.editingId=null;return startVoucher(kind);};
const renderInvoice=A.renderInvoice.bind(A);
A.renderInvoice=function(){
 const s=renderInvoice();if(!this.editingId)return s;
 const id=this.editingId,op=this.state.ops.find(o=>o.id===id);if(!op)return s;
 return s.replace('<div class="agent-main-invoice">', '<div class="agent-main-invoice"><div class="pill wait" style="margin-bottom:8px">✎ تعديل '+esc(op.localNumber||'')+' · مراجعة '+(Number(op.revision||0)+1)+'</div>')
  .replace(/#F-\d+/, '#'+esc(op.localNumber||''))
  .replace('حفظ وطباعة بلوتوث','حفظ التعديل وطباعة').replace('حفظ الفاتورة</button>','حفظ التعديل</button>');
};
const renderVoucher=A.renderVoucher.bind(A);
A.renderVoucher=function(){let s=renderVoucher(),op=this.state.ops.find(o=>o.id===this.editingId);
 if(!op||!['receipt','payment'].includes(op.kind))return s;
 const d=new Date(op.date);const date=Number.isFinite(d.getTime())?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16):this.defaultDate();
 s=s.replace('<div class="hero"><h2>', '<div class="hero"><div class="pill wait">✎ تعديل '+esc(op.localNumber||'')+'</div><h2>');
 s=s.replace('value="'+esc(op.accountId)+'">','value="'+esc(op.accountId)+'" selected>');
 s=s.replace('value="'+this.defaultDate()+'"','value="'+date+'"');
 s=s.replace('<option>'+esc(op.currency)+'</option>','<option selected>'+esc(op.currency)+'</option>');
 s=s.replace('id="vAmount" class="field ltr"','id="vAmount" value="'+Number(op.amount||0)+'" class="field ltr"');
 s=s.replace('id="vNote" class="field" rows="2" placeholder="بيان السند (اختياري)"></textarea>',
     'id="vNote" class="field" rows="2" placeholder="بيان السند (اختياري)">'+esc(op.note||'')+'</textarea>');
 s=s.replace('✓ حفظ '+(op.kind==='receipt'?'سند القبض':'سند الدفع'),'✓ حفظ تعديل السند');
 return s;
};
// Existing invoice/voucher save functions call appendOperation; intercept that single point.
const append=A.appendOperation.bind(A);
A.appendOperation=async function(next){
 const existing=this.editingId&&this.state.ops.find(o=>o.id===this.editingId);
 if(!existing)return append(next);
 if(!eligible(existing)||existing.kind!==next.kind)throw Error('لا يمكن تغيير نوع السند أو الفاتورة أثناء التعديل');
 const beforeState=this.state.ops.slice(),target=clone(existing);
 const pending=unackedRevision(existing.id),isSynced=this.state.knownIds.includes(existing.id);
 const revision=pending?pending.baseRevision+1:Number(existing.revision||0)+1;
 Object.assign(next,{id:existing.id,kind:existing.kind,localNumber:existing.localNumber,
   revision,editedAt:new Date().toISOString(),editCount:Number(existing.editCount||0)+1});
 if(['sale','sale_return'].includes(next.kind)){
   // Historical balances are only known for the same customer. Never copy a different customer's totals.
   const originalBefore=existing.accountId===next.accountId ? (existing.accountBalanceBeforeByCurrency||
     {[existing.currency]:existing.accountBalanceBefore}) : {SYP:null,USD:null};
   const dual=InvoiceDualBalances.pair(originalBefore,next);
   next.accountBalanceBeforeByCurrency=dual.before;next.accountBalanceAfterByCurrency=dual.after;
   next.accountBalanceBefore=dual.before[next.currency];next.accountBalanceAfter=dual.after[next.currency];
 }
 const index=this.state.ops.findIndex(o=>o.id===existing.id);
 try{
   if(isSynced){
     const previous=pending?clone(pending.before):target;
     const edit={id:pending?.id||'op_'+FieldProtocol.uuid(),kind:'document_edit',
       companyId:next.companyId,agentId:next.agentId,warehouseId:next.warehouseId,
       date:new Date().toISOString(),currency:next.currency,exchangeRate:next.exchangeRate,
       originalKind:existing.kind,targetOperationId:existing.id,localNumber:existing.localNumber,
       baseRevision:pending?pending.baseRevision:Number(existing.revision||0),revision,
       before:previous,replacement:clone(next)};
     FieldProtocol.validateOps([edit],this.state.agentId,this.state.companyId,this.state.warehouseId,
       this.state.items,this.state.accounts,[previous]);
     const ix=pending?this.state.ops.findIndex(x=>x.id===pending.id):-1;
     if(ix>=0)this.state.ops[ix]=edit;else this.state.ops.push(edit);
   }else{
     // Not yet posted: update in place, retain its original id so it is posted exactly once.
     FieldProtocol.validateOps([next],this.state.agentId,this.state.companyId,this.state.warehouseId,this.state.items,this.state.accounts);
   }
   this.state.ops[index]=next;
   await this.save();this.editingId=null;this.scheduleAutoSync?.(250);
 }catch(e){this.state.ops=beforeState;throw e;}
};
// Editing an invoice should not require stock for quantities already reserved by its previous version.
A.availableForEdit=function(itemId){
 let value=Number(this.stock[itemId]||0);
 const previous=this.editingId&&this.state.ops.find(o=>o.id===this.editingId);
 if(previous&&previous.kind==='sale')for(const row of previous.rows||[])if(row.itemId===itemId)value+=Number(row.qty)/Number(row.unitFactor);
 return value;
};
// Add clear edit actions and the latest revision indicator in both browsing views.
const renderOps=A.renderOps.bind(A);
A.renderOps=function(){return renderOps().replace(/(<button class="secondary" style="margin:0;width:auto;padding:6px 12px" onclick="Agent.printOp\('([^']+)'\)">🖨 طباعة<\/button>)/g,
   (all,button,id)=>eligible(this.state.ops.find(o=>o.id===id))?button+'<button type="button" class="secondary" style="margin:0;width:auto;padding:6px 12px" onclick="Agent.editDocument(\''+id+'\')">✎ تعديل</button>':button)
  .replace(/(<b>(?:F-|V-)[^<]+<\/b>)/g,'$1');};
const renderInvoices=A.renderInvoices?.bind(A);
if(renderInvoices)A.renderInvoices=function(){return renderInvoices().replace(/(<button class="secondary" style="width:auto;margin:0;padding:7px 12px" onclick="Agent.printOp\('([^']+)'\)">🖨 طباعة<\/button>)/g,
   (all,button,id)=>eligible(this.state.ops.find(o=>o.id===id))?button+'<button class="secondary" style="width:auto;margin:0;padding:7px 12px" onclick="Agent.editDocument(\''+id+'\')">✎ تعديل</button>':button);};
// Accrual correction pending sync: subtract the manager-posted original then add the edited version.
const balanceFor=A.balanceFor.bind(A);
A.balanceFor=function(accountId){const out=balanceFor(accountId);if(!out?.available)return out;
 const delta=op=>{
   if(!op||!['sale','sale_return','receipt','payment'].includes(op.kind))return 0;
   return ['sale','sale_return'].includes(op.kind)?(op.kind==='sale'?1:-1)*(Number(op.netTotal||0)-Number(op.paidAmount||0)):
       (op.kind==='receipt'?-1:1)*Number(op.amount||0);
 };
 for(const ed of this.state.ops.filter(o=>o.kind==='document_edit'&&!this.state.snapshotIds?.includes(o.id))){
   if(ed.before?.accountId===accountId){const c=ed.before.currency;if(c==='SYP')out.syp=amount(out.syp-delta(ed.before),c);if(c==='USD')out.usd=amount(out.usd-delta(ed.before),c);}
   if(ed.replacement?.accountId===accountId){const c=ed.replacement.currency;if(c==='SYP')out.syp=amount(out.syp+delta(ed.replacement),c);if(c==='USD')out.usd=amount(out.usd+delta(ed.replacement),c);}
 }
 return out;
};
const cashSummary=A.cashSummary.bind(A);
A.cashSummary=function(){const s=cashSummary();
 const cashEffect=op=>{if(!op)return 0;const v=['sale','sale_return'].includes(op.kind)?Number(op.paidAmount||0):Number(op.amount||0);
   return ['sale','receipt'].includes(op.kind)?v:-v;};
 for(const ed of (this.state.ops||[])){
   if(ed.kind!=='document_edit'||this.state.snapshotIds?.includes(ed.id))continue;
   const old=ed.before,n=ed.replacement;if(!old||!n)continue;
   for(const [item,mult] of [[old,-1],[n,1]]){
     const change=cashEffect(item)*mult;
     if(item.currency==='SYP')s.syp=amount(s.syp+change,'SYP');else if(item.currency==='USD')s.usd=amount(s.usd+change,'USD');
   }
 }
 return s;
};
})();
