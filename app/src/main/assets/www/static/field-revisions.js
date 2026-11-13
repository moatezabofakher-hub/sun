/* 3.5.44 — Authenticated, idempotent document revisions applied without duplicate bookkeeping. */
(function(){'use strict';
const F=FieldSync;
F.commitOperationsWithRevisions=async function(agent,ops){
 const cfg=this.data();const known=new Set(cfg.imported.map(x=>x.id));
 const fresh=ops.filter(x=>!known.has(x.id));if(!fresh.length)return 0;
 const original={accounts:State.accounts,invoices:State.invoices,vouchers:State.vouchers,expenses:State.expenses||[],
    imported:cfg.imported,events:cfg.events,history:cfg.operationHistory,used:State.license.opsUsedCount};
 if(!State.license.isActivated&&Number(original.used||0)+fresh.length>LicenseManager.MAX_TRIAL_OPS)
   throw Error('تجاوز الحد التجريبي للتطبيق الرئيسي');
 // Validate again before any write, using canonical history and the current ledger.
 const validated=FieldProtocol.validateOps(fresh,agent.id,cfg.companyId,agent.warehouseId,State.items,State.accounts,this.historyFor(agent));
 const novel=validated.filter(o=>o.kind!=='document_edit');
 const edits=validated.filter(o=>o.kind==='document_edit');
 const docs=FieldProtocol.toLedgerDocuments(novel,agent,
   Math.max(0,...State.invoices.map(x=>Number(x.number)||0)),Math.max(0,...State.vouchers.map(x=>Number(x.number)||0)));
 this.checkNewCustomers(docs.customers,original.accounts);
 let invoices=[...original.invoices,...docs.invoices],vouchers=[...original.vouchers,...docs.vouchers];
 const changes=[];const deltas={};
 const stockDelta=(op,mul)=>{if(!['sale','sale_return'].includes(op.kind||op.type))return;
   for(const row of op.rows||[]){const d=(op.kind||op.type)==='sale_return'?1:-1;
     deltas[row.itemId]=(deltas[row.itemId]||0)+d*Number(row.qty)/Number(row.unitFactor)*mul;}};
 for(const op of novel)stockDelta(op,1);
 const archived=[...(original.history||[])];
 for(const edit of edits){
   const docId='field_'+edit.targetOperationId,isInvoice=['sale','sale_return'].includes(edit.originalKind);
   const coll=isInvoice?invoices:vouchers;
   const index=coll.findIndex(x=>x.id===docId&&x.fieldOrigin?.agentId===agent.id);
   if(index<0)throw Error('المستند المطلوب تعديله غير موجود أو ليس لهذا المندوب');
   const old=coll[index],next=edit.replacement;
   if(Number(old.fieldRevision||0)!==edit.baseRevision)throw Error('تعارض مراجعة: المستند تغير منذ آخر مزامنة');
   if(!isInvoice&&old.type!==next.kind||isInvoice&&old.type!==next.kind)throw Error('نوع المستند مختلف');
   if(isInvoice){
     // Existing linked receipts would become inconsistent if a paid invoice changes customer/currency.
     const linked=vouchers.some(v=>v.linkedInvoiceId===old.id);
     if(linked&&(old.accountId!==next.accountId||old.currency!==next.currency))
       throw Error('لا يمكن تغيير عملة أو زبون فاتورة لديها دفعات مرتبطة؛ راجع الحساب الرئيسي');
     const linkedPaid=vouchers.filter(v=>v.linkedInvoiceId===old.id&&v.type==='receipt')
       .reduce((sum,v)=>sum+Number(v.accountAmount??v.amount??0),0);
     if(next.kind==='sale'&&Number(next.netTotal)-Number(next.paidAmount)+0.000001<linkedPaid)
       throw Error('المبلغ المعدّل أقل من الدفعات المقبوضة على الفاتورة؛ راجع الحساب الرئيسي');
     stockDelta({...old,kind:old.type},-1);stockDelta(next,1);
     coll[index]={...old,date:next.date,currency:next.currency,exchangeRate:next.exchangeRate,accountId:next.accountId,
       rows:next.rows.map((r,i)=>({...r,rowId:'fieldrow_'+edit.targetOperationId+'_'+i,discount:0})),
       subTotal:next.subTotal,discountValue:next.discountValue,discountType:next.discountType,discountAmount:next.discountAmount,
       taxValue:next.taxValue,taxType:next.taxType,taxAmount:next.taxAmount,netTotal:next.netTotal,
       paidAmount:next.paidAmount,remainingAmount:FieldProtocol.money(next.netTotal-next.paidAmount,next.currency),note:next.note||'',
       fieldRevision:edit.revision,fieldOrigin:{...old.fieldOrigin,editedByAgent:true,lastAgentEditAt:edit.date,revision:edit.revision}};
   } else {
     coll[index]={...old,date:next.date,accountId:next.accountId,currency:next.currency,accountCurrency:next.currency,
       accountAmount:next.amount,amount:next.amount,exchangeRate:next.exchangeRate,note:next.note||'',
       fieldRevision:edit.revision,fieldOrigin:{...old.fieldOrigin,editedByAgent:true,lastAgentEditAt:edit.date,revision:edit.revision}};
   }
   // Persist previous official document for accountant inspection; append original revision envelope separately.
   changes.push({id:edit.id,targetOperationId:edit.targetOperationId,agentId:agent.id,
     at:edit.date,revision:edit.revision,previousDocument:JSON.parse(JSON.stringify(old))});
   const originalIndex=archived.findIndex(x=>x.id===edit.targetOperationId);
   if(originalIndex>=0)archived[originalIndex]={...next};
   else archived.push({...next});
   archived.push({...edit,replacement:{...next}});
 }
 if(!State.settings.allowNegativeStockSales)for(const [id,delta] of Object.entries(deltas)){
   if(Accounting.getItemBaseStock(id,null,agent.warehouseId)+delta< -0.0001)
    throw Error('رصيد سيارة المندوب غير كافٍ بعد التعديل: '+(State.items.find(x=>x.id===id)?.name||id));
 }
 try{
   State.accounts=[...original.accounts,...docs.customers];State.invoices=invoices;State.vouchers=vouchers;
   State.expenses=[...original.expenses,...docs.expenses];
   cfg.imported=[...original.imported,...fresh.map(x=>({id:x.id,agentId:agent.id,receivedAt:new Date().toISOString(),kind:x.kind}))];
   cfg.events=[...original.events,{id:FieldProtocol.uuid(),agentId:agent.id,at:new Date().toISOString(),count:fresh.length,edits:edits.length,mode:'wifi'}].slice(-3000);
   cfg.operationHistory=[...archived,...novel.map(op=>JSON.parse(JSON.stringify(op)))];
   cfg.revisionAudit=[...(cfg.revisionAudit||[]),...changes].slice(-5000);
   if(!State.license.isActivated)State.license.opsUsedCount+=fresh.length;
   await StorageEngine.saveState();return fresh.length;
 }catch(err){
   State.accounts=original.accounts;State.invoices=original.invoices;State.vouchers=original.vouchers;State.expenses=original.expenses;
   cfg.imported=original.imported;cfg.events=original.events;cfg.operationHistory=original.history;
   cfg.revisionAudit=(cfg.revisionAudit||[]).filter(x=>!changes.some(y=>y.id===x.id));
   State.license.opsUsedCount=original.used;throw err;
 }
};
})();
