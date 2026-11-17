/* v142 shared manager-side employee currency exchange posting.
   Validated employee operations are booked only on the server manager after signed import. */
(function(root){
'use strict';
if(typeof FieldSync==='undefined')return;
FieldSync.postFxTrades=function(agent,docs){
 const ledger=root.TiqanyFxLedger;
 if(!ledger)throw Error('محرك تصريف العملات غير محمّل');
 const entries=Array.isArray(docs?.fxTrades)?docs.fxTrades:[];
 const enabled=new Set(ledger.activeCurrencies(State));
 const ordered=[...entries].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id)));
 for(const op of ordered){
   if(!enabled.has(op.fromCurrency)||!enabled.has(op.toCurrency))throw Error('العملة غير مفعلة لدى المدير');
   if(!agent?.id||op.agentId!==agent.id)throw Error('عملية تصريف لموظف غير مطابق');
   if(ledger.ensure(State).some(t=>t.id===op.id))throw Error('عملية تصريف مكررة');
   if(typeof FieldCash==='undefined')throw Error('صندوق الموظف غير متاح');
   const before=FieldCash.summary(agent.id);
   const available=op.fromCurrency==='USD'?before.usdCash:before.sypCash;
   ledger.record(State,{
     operationId:op.id,fromCurrency:op.fromCurrency,toCurrency:op.toCurrency,
     fromAmount:op.fromAmount,toAmount:op.toAmount,
     at:op.date,note:op.note||'',
     fieldOrigin:{agentId:agent.id,agentName:String(agent.name||''),operationId:op.id}
   },available);
 }
 return ordered.length;
};
})(typeof globalThis==='object'?globalThis:this);
