/* Tiqany Acc: shared currency-exchange accounting rules (v142).
 * Independent of DOM/storage. Each exchange is one immutable two-leg transaction.
 * Profit is realized in SYP only when acquisition cost is known.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.TiqanyCurrencyExchangeCore=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const code=v=>String(v||'').trim().toUpperCase();
  const scale=c=>code(c)==='SYP'||code(c)==='JPY'?1:100;
  function rounded(value,currency){
    const n=Number(value),precision=scale(currency);
    if(!Number.isFinite(n)||n<0||n>1e12)throw Error('المبلغ غير صالح');
    return Math.round((n+Number.EPSILON)*precision)/precision;
  }
  function validCurrency(value,allowed){
    const c=code(value);
    if(!/^[A-Z]{3}$/.test(c)||(Array.isArray(allowed)&&!allowed.includes(c)))throw Error('عملة غير مفعلة');
    return c;
  }
  function prepare(raw,allowed){
    if(!raw||typeof raw!=='object')throw Error('عملية غير صالحة');
    const fromCurrency=validCurrency(raw.fromCurrency,allowed);
    const toCurrency=validCurrency(raw.toCurrency,allowed);
    if(fromCurrency===toCurrency)throw Error('اختر عملتين مختلفتين');
    const fromAmount=rounded(raw.fromAmount,fromCurrency);
    const toAmount=rounded(raw.toAmount,toCurrency);
    if(!(fromAmount>0&&toAmount>0))throw Error('مبلغ التصريف يجب أن يكون موجباً');
    const date=String(raw.date||new Date().toISOString());
    if(!Number.isFinite(Date.parse(date)))throw Error('تاريخ العملية غير صالح');
    const id=String(raw.id||'');
    if(!/^([a-zA-Z0-9_-]{8,110})$/.test(id))throw Error('معرف عملية التصريف غير صالح');
    const equivalentSyp=fromCurrency==='SYP'?fromAmount:toCurrency==='SYP'?toAmount:rounded(raw.equivalentSyp,'SYP');
    if(!(equivalentSyp>0))throw Error('يجب تحديد قيمة العملية المكافئة بالليرة');
    return {id,date,fromCurrency,toCurrency,fromAmount,toAmount,equivalentSyp,
      agentId:String(raw.agentId||''),source:String(raw.source||'manager'),
      note:String(raw.note||'').slice(0,200)};
  }
  function analyze(entries,scope='all'){
    const lots=new Map(),movements=[],byId=new Map(),seen=new Set();
    let profitSyp=0,unknownCostCount=0;
    const inScope=e=>scope==='all'||(scope==='office'?!e.agentId:e.agentId===scope);
    const ordered=(entries||[]).filter(inScope).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id)));
    function lot(c){if(!lots.has(c))lots.set(c,{quantity:0,costSyp:0,lastAverageSyp:0});return lots.get(c);}
    for(const original of ordered){
      const e=prepare(original);
      if(seen.has(e.id))throw Error('تكرار معرف عملية التصريف '+e.id);
      seen.add(e.id);
      const selling=lot(e.fromCurrency),buying=lot(e.toCurrency);
      let gain=null,averageCost=null;
      if(e.fromCurrency==='SYP')gain=0;
      else {
        const avg=selling.quantity>1e-9?selling.costSyp/selling.quantity:selling.lastAverageSyp;
        if(avg>0&&Number.isFinite(avg)){
          averageCost=avg;gain=Math.round((e.equivalentSyp-e.fromAmount*avg)*100)/100;
          const sold=Math.min(e.fromAmount,selling.quantity);
          selling.quantity=Math.max(0,selling.quantity-sold);
          selling.costSyp=Math.max(0,selling.costSyp-sold*avg);
          selling.lastAverageSyp=avg;
        }else unknownCostCount++;
      }
      // An exchange creates new acquired inventory at its actual SYP equivalent.
      if(e.toCurrency!=='SYP'){
        buying.quantity+=e.toAmount;
        buying.costSyp+=e.equivalentSyp;
        buying.lastAverageSyp=buying.costSyp/buying.quantity;
      }
      if(gain!==null)profitSyp+=gain;
      const view={...e,gainSyp:gain,averageCostSyp:averageCost};
      byId.set(e.id,view);
      movements.push({id:e.id+':out',exchangeId:e.id,date:e.date,ref:'تصريف عملة',party:e.agentId||'الصندوق الرئيسي',desc:e.note||'شراء '+e.toCurrency,currency:e.fromCurrency,inflow:0,outflow:e.fromAmount});
      movements.push({id:e.id+':in',exchangeId:e.id,date:e.date,ref:'تصريف عملة',party:e.agentId||'الصندوق الرئيسي',desc:e.note||'شراء '+e.toCurrency,currency:e.toCurrency,inflow:e.toAmount,outflow:0});
    }
    const holdings={};
    for(const [currency,value] of lots)holdings[currency]={quantity:value.quantity,costSyp:value.costSyp,averageSyp:value.lastAverageSyp};
    return {profitSyp:Math.round(profitSyp*100)/100,unknownCostCount,holdings,movements,byId};
  }
  function balances(base,entries,scope='office'){
    const current={...base},history=analyze(entries,scope);
    for(const m of history.movements){
      const c=m.currency;
      current[c]=Math.round(((Number(current[c])||0)+m.inflow-m.outflow)*scale(c))/scale(c);
    }
    return current;
  }
  return Object.freeze({prepare,analyze,balances,rounded,scale});
});