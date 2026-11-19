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

  // Quotations are in Syrian pounds for one unit of foreign currency.
  // buy: SYP paid to acquire it; sell: SYP received when selling it.
  function quote(from,to,fromAmount,rates){
    const fromCurrency=validCurrency(from),toCurrency=validCurrency(to);
    if(fromCurrency===toCurrency)throw Error('اختر عملتين مختلفتين');
    const paid=rounded(fromAmount,fromCurrency);
    if(!(paid>0))throw Error('المبلغ المدفوع غير صالح');
    const rate=(c,side)=>{
      const n=Number(rates?.[c]?.[side]);
      if(!Number.isFinite(n)||n<=0)throw Error('حدّد سعر '+(side==='buy'?'شراء ':'مبيع ')+c+' أولاً');
      return n;
    };
    const equivalentSyp=fromCurrency==='SYP'?paid:rounded(paid*rate(fromCurrency,'sell'),'SYP');
    const received=toCurrency==='SYP'?equivalentSyp:rounded(equivalentSyp/rate(toCurrency,'buy'),toCurrency);
    if(!(received>0))throw Error('المبلغ المستلم أقل من أصغر وحدة');
    return {fromAmount:paid,toAmount:received,equivalentSyp};
  }

  function analyze(entries,scope='all'){
    const lots=new Map(),pending=new Map(),movements=[],byId=new Map(),seen=new Set();
    let profitSyp=0;
    const inScope=e=>scope==='all'||(scope==='office'?!e.agentId:e.agentId===scope);
    const ordered=(entries||[]).filter(inScope).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id)));
    const roundSyp=n=>Math.round((n+Number.EPSILON)*100)/100;
    function lot(c){if(!lots.has(c))lots.set(c,{quantity:0,costSyp:0,lastAverageSyp:0});return lots.get(c);}
    function debts(c){if(!pending.has(c))pending.set(c,[]);return pending.get(c);}
    for(const original of ordered){
      const e=prepare(original);
      if(seen.has(e.id))throw Error('تكرار معرف عملية التصريف '+e.id);
      seen.add(e.id);
      const selling=lot(e.fromCurrency),buying=lot(e.toCurrency);
      let gain=e.fromCurrency==='SYP'?0:null,averageCost=null,costOfSoldSyp=null,coveredAmount=0;
      let uncoveredAmount=0,deferredGainSyp=0,deferredCoveredAmount=0;
      if(e.fromCurrency!=='SYP'){
        // Only a real prior purchase can establish a sale's acquisition cost.
        const avg=selling.quantity>1e-9?selling.costSyp/selling.quantity:null;
        const known=avg>0?Math.min(e.fromAmount,selling.quantity):0;
        if(known>1e-9){
          coveredAmount=rounded(known,e.fromCurrency);
          averageCost=avg;
          costOfSoldSyp=roundSyp(known*avg);
          gain=roundSyp(e.equivalentSyp*known/e.fromAmount-known*avg);
          selling.quantity=Math.max(0,selling.quantity-known);
          selling.costSyp=Math.max(0,selling.costSyp-known*avg);
          selling.lastAverageSyp=avg;
        }
        uncoveredAmount=rounded(Math.max(0,e.fromAmount-known),e.fromCurrency);
        if(uncoveredAmount>1e-9){
          // This is deferred sale REVENUE, not a loss. It will be matched FIFO
          // against the price paid to acquire these units on a later date.
          debts(e.fromCurrency).push({exchangeId:e.id,quantity:uncoveredAmount,
            proceedsSyp:e.equivalentSyp*uncoveredAmount/e.fromAmount});
        }
      }
      const view={...e,gainSyp:gain,averageCostSyp:averageCost,costOfSoldSyp,coveredAmount,
        uncoveredAmount,pendingAmount:uncoveredAmount,settledAmount:0,settlementGainSyp:0,
        deferredGainSyp:0,deferredCoveredAmount:0};
      byId.set(e.id,view);
      if(e.toCurrency!=='SYP'){
        // A purchase first settles older uncosted sales, at THIS purchase's
        // actual unit cost. Only remaining purchased units enter inventory.
        const unitCost=e.equivalentSyp/e.toAmount;
        let remaining=e.toAmount;
        const outstanding=debts(e.toCurrency);
        while(remaining>1e-9&&outstanding.length){
          const debt=outstanding[0];
          const settled=Math.min(remaining,debt.quantity);
          const proceeds=debt.proceedsSyp*settled/debt.quantity;
          const cost=settled*unitCost;
          const realized=proceeds-cost;
          deferredGainSyp+=realized;
          deferredCoveredAmount+=settled;
          const oldView=byId.get(debt.exchangeId);
          if(oldView){
            oldView.pendingAmount=rounded(Math.max(0,oldView.pendingAmount-settled),e.toCurrency);
            oldView.settledAmount=rounded(oldView.settledAmount+settled,e.toCurrency);
            oldView.settlementGainSyp=roundSyp(oldView.settlementGainSyp+realized);
          }
          debt.quantity-=settled;
          debt.proceedsSyp-=proceeds;
          remaining-=settled;
          if(debt.quantity<1e-9)outstanding.shift();
        }
        if(remaining>1e-9){
          buying.quantity+=remaining;
          buying.costSyp+=remaining*unitCost;
          buying.lastAverageSyp=buying.costSyp/buying.quantity;
        }
        if(deferredCoveredAmount>1e-9){
          const settledProfit=roundSyp(deferredGainSyp);
          view.deferredGainSyp=settledProfit;
          view.deferredCoveredAmount=rounded(deferredCoveredAmount,e.toCurrency);
          view.gainSyp=roundSyp((view.gainSyp||0)+settledProfit);
        }
      }
      if(view.gainSyp!==null)profitSyp+=view.gainSyp;
      movements.push({id:e.id+':out',exchangeId:e.id,date:e.date,ref:'تصريف عملة',party:e.agentId||'الصندوق الرئيسي',desc:e.note||'شراء '+e.toCurrency,currency:e.fromCurrency,inflow:0,outflow:e.fromAmount});
      movements.push({id:e.id+':in',exchangeId:e.id,date:e.date,ref:'تصريف عملة',party:e.agentId||'الصندوق الرئيسي',desc:e.note||'شراء '+e.toCurrency,currency:e.toCurrency,inflow:e.toAmount,outflow:0});
    }
    const holdings={},pendingSales={};
    let unknownCostCount=0;
    for(const [currency,value] of lots)holdings[currency]={quantity:rounded(value.quantity,currency),costSyp:roundSyp(value.costSyp),averageSyp:value.lastAverageSyp};
    for(const [currency,items] of pending){
      const open=items.filter(d=>d.quantity>1e-9);
      unknownCostCount+=open.length;
      if(open.length)pendingSales[currency]={quantity:rounded(open.reduce((s,d)=>s+d.quantity,0),currency),
        proceedsSyp:roundSyp(open.reduce((s,d)=>s+d.proceedsSyp,0))};
    }
    return {profitSyp:roundSyp(profitSyp),unknownCostCount,holdings,pendingSales,movements,byId};
  }
  function foreignTotals(entries, currencies = []) {
    const totals = new Map();
    function add(code, field, value) {
      if (!/^[A-Z]{3}$/.test(code) || code === 'SYP') return;
      if (!totals.has(code)) totals.set(code, {code, bought:0n, sold:0n});
      const units = Math.round(Number(value) * scale(code));
      if (Number.isSafeInteger(units)) totals.get(code)[field] += BigInt(units);
    }
    for (const c of currencies) add(c, 'bought', 0);
    for (const e of entries) {
      add(e.fromCurrency, 'sold', e.fromAmount);
      add(e.toCurrency, 'bought', e.toAmount);
    }
    return [...totals.values()].sort((a,b)=>a.code.localeCompare(b.code));
  }

  function formatForeignUnits(units, currency) {
    const factor = BigInt(scale(currency));
    const value = units < 0n ? -units : units;
    const fraction = (value % factor).toString().padStart(String(factor).length-1,'0').replace(/0+$/,'');
    return (units < 0n ? '−' : '') + (value / factor).toLocaleString('en-US') + (fraction ? '.'+fraction : '');
  }

  function balances(base,entries,scope='office'){
    const current={...base},history=analyze(entries,scope);
    for(const m of history.movements){
      const c=m.currency;
      current[c]=Math.round(((Number(current[c])||0)+m.inflow-m.outflow)*scale(c))/scale(c);
    }
    return current;
  }
  return Object.freeze({prepare,analyze,balances,foreignTotals,formatForeignUnits,rounded,scale,quote});
});