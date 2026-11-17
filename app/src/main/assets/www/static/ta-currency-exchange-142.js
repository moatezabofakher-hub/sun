/* Tiqany Acc - currency exchange financial engine. No DOM/side effects.
   Current cash ledger is USD/SYP. Do not silently post unsupported currencies. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.TiqanyFxLedger=api;
})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const CURRENCIES=['SYP','USD'];
const PRECISION={SYP:0,USD:2};
const round=(v,c)=>Number(Number(v).toFixed(PRECISION[c]));
const finite=x=>Number.isFinite(Number(x));
function fail(s){throw Error(s);}
function validCurrency(c){if(!CURRENCIES.includes(c))fail('عملة غير مدعومة في الصناديق الحالية: '+c);}
function positive(n,label){n=Number(n);if(!Number.isFinite(n)||n<=0||n>1e12)fail(label+' غير صالح');return n;}
function ensure(state){if(!Array.isArray(state.fxTrades))state.fxTrades=[];return state.fxTrades;}
function id(){
 const c=typeof crypto!=='undefined'?crypto:null;
 return c&&typeof c.randomUUID==='function'?'fx_'+c.randomUUID():'fx_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
}
function sortTrades(s){return [...ensure(s)].sort((a,b)=>String(a.createdAt||a.date).localeCompare(String(b.createdAt||b.date))||String(a.id).localeCompare(String(b.id)));}
function averageCost(s,currency,at){
 validCurrency(currency);
 const costs=sortTrades(s).filter(t=>t.toCurrency===currency&&t.fromCurrency!==currency&&
    String(t.createdAt||t.date)<String(at||'9999'));
 if(!costs.length)return null;
 // Arithmetic mean of recorded individual purchase prices (not weighted by amount).
 const rates=costs.map(t=>Number(t.fromAmount)/Number(t.toAmount)).filter(x=>Number.isFinite(x)&&x>0);
 return rates.length?rates.reduce((a,b)=>a+b,0)/rates.length:null;
}
function quote(s,{fromCurrency,toCurrency,fromAmount,toAmount,at}){
 validCurrency(fromCurrency);validCurrency(toCurrency);
 if(fromCurrency===toCurrency)fail('اختر عملتين مختلفتين');
 const out=positive(fromAmount,'المبلغ المدفوع');
 const received=positive(toAmount,'المبلغ المشترى');
 if(round(out,fromCurrency)!==out||round(received,toCurrency)!==received)fail('عدد المنازل العشرية غير صالح للعملة');
 const time=at||new Date().toISOString();
 if(!Number.isFinite(Date.parse(time)))fail('وقت العملية غير صالح');
 const rate=out/received;
 const avg=averageCost(s,fromCurrency,time);
 let profitUSD=0,profitSyp=0;
 if(avg!==null){
   const raw=received-out*avg;
   if(toCurrency==='USD'){profitUSD=round(raw,'USD');profitSyp=round(raw*(out/received),'SYP');}
   else {profitSyp=round(raw,'SYP');profitUSD=round(raw/(received/out),'USD');}
 }
 // If there is no prior purchase price, the cost basis is unknown; never fabricate a profit.
 return {fromCurrency,toCurrency,fromAmount:out,toAmount:received,rate,
   averageCost:avg,costBasisKnown:avg!==null,
   profitUSD,profitSyp,at:time};
}
function record(s,details,available){
 const info=quote(s,details);
 if(!finite(available)||Number(available)+0.0000001<info.fromAmount)fail('الرصيد المتاح في الصندوق غير كافٍ');
 const tx={...info,id:id(),date:info.at,createdAt:info.at,note:String(details.note||'').trim().slice(0,200)};
 if(ensure(s).some(x=>x.id===tx.id))fail('معرف العملية مكرر');
 s.fxTrades.push(tx);
 return tx;
}
function postings(tx){
 return [
  {id:tx.id+':out',sourceId:tx.id,docType:'currency_exchange',date:tx.date,
    ref:'تصريف عملة',party:'تصريف عملة',desc:'شراء '+tx.toCurrency+' مقابل '+tx.fromCurrency,
    currency:tx.fromCurrency,inflow:0,outflow:Number(tx.fromAmount)},
  {id:tx.id+':in',sourceId:tx.id,docType:'currency_exchange',date:tx.date,
    ref:'تصريف عملة',party:'تصريف عملة',desc:'شراء '+tx.toCurrency+' مقابل '+tx.fromCurrency,
    currency:tx.toCurrency,inflow:Number(tx.toAmount),outflow:0}
 ];
}
function cashMovements(s){return sortTrades(s).flatMap(postings);}
function profit(s,filter=()=>true){return ensure(s).filter(filter).reduce((n,t)=>n+(Number(t.profitUSD)||0),0);}
function deleteTrade(s,tradeId){const list=ensure(s),i=list.findIndex(t=>t.id===tradeId);if(i<0)fail('عملية التصريف غير موجودة');return list.splice(i,1)[0];}
function activeCurrencies(s){
 const cfg=s?.settings||{};
 const enabled=[cfg.primaryCurrency||'USD'];
 if(!cfg.primaryOnlyMode)enabled.push(cfg.secondaryCurrency||'SYP');
 return [...new Set(enabled)].filter(c=>CURRENCIES.includes(c));
}
return {CURRENCIES,ensure,quote,record,averageCost,postings,cashMovements,profit,deleteTrade,activeCurrencies};
});
