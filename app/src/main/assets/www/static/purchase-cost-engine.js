/* Tiqany Acc — last posted purchase net cost, v3.5.57/3.5.55.
   Cost per base unit = (purchase row net after line discount + proportional
   invoice additions - proportional invoice discount) / purchased base units.
   Invoice currency is converted using the rate stored ON that invoice.
   Purchase returns do not become the latest purchasing price. */
(function(root){
  'use strict';
  const finite=(n)=>Number.isFinite(Number(n))?Number(n):0;
  const round=(v)=>Math.round((v+Number.EPSILON)*1e6)/1e6;
  const validCurrency=(code)=>code==='USD'||code==='SYP';
  function exchange(amount,from,to,rate){
    if(from===to)return amount;
    if(!validCurrency(from)||!validCurrency(to)||!(rate>0))return null;
    return from==='USD' ? amount*rate : amount/rate;
  }
  function rowValue(row){
    if(!row || !row.itemId || !(finite(row.qty)>0))return 0;
    if(Number.isFinite(Number(row.total)) && row.total!==null && row.total!==undefined)return Math.max(0,Number(row.total));
    return Math.max(0,finite(row.qty)*finite(row.price)-Math.max(0,finite(row.discount)));
  }
  function purchaseRows(invoice){
    if(invoice?.type!=='purchase'||!Array.isArray(invoice.rows))return [];
    const rows=invoice.rows.map(r=>({row:r,amount:rowValue(r)})).filter(r=>r.amount>0 && finite(r.row.qty)>0 && (r.row.unitFactor===undefined||finite(r.row.unitFactor)>0));
    const subtotal=rows.reduce((s,r)=>s+r.amount,0);
    if(!(subtotal>0))return [];
    const discount=Math.min(subtotal,Math.max(0,finite(invoice.discountAmount)));
    const addition=Math.max(0,finite(invoice.taxAmount));
    return rows.map(({row,amount})=>({
      itemId:row.itemId,
      baseQty:finite(row.qty)/(finite(row.unitFactor)>0?finite(row.unitFactor):1),
      netAmount:amount*(1+(addition-discount)/subtotal)
    }));
  }
  function latestCosts(items,invoices){
    const map=new Map();
    const byId=new Map((items||[]).filter(x=>x && x.id && !x.isBundle).map(x=>[x.id,x]));
    (invoices||[]).forEach((inv,idx)=>{
      const entries=purchaseRows(inv); if(!entries.length)return;
      const byItem=new Map();
      for(const row of entries){if(!byId.has(row.itemId)||!(row.baseQty>0))continue;
        const existing=byItem.get(row.itemId)||{amount:0,qty:0};
        existing.amount+=row.netAmount;existing.qty+=row.baseQty;byItem.set(row.itemId,existing);
      }
      const time=Date.parse(inv.date)||0;
      for(const [itemId,totals] of byItem){
        if(!(totals.qty>0))continue;
        const item=byId.get(itemId),from=inv.currency||'SYP',to=item.currency||from;
        const rate=finite(inv.exchangeRate);
        const converted=exchange(totals.amount,from,to,rate);
        if(converted===null||!(converted>=0)||!Number.isFinite(converted))continue;
        const last=map.get(itemId);
        if(!last||time>last.time||(time===last.time&&idx>last.idx)){
          map.set(itemId,{time,idx,invoiceId:inv.id,currency:to,unitCost:round(converted/totals.qty)});
        }
      }
    });
    return map;
  }
  function refresh(items,invoices){
    const latest=latestCosts(items,invoices);
    let changed=0;
    for(const item of items||[]){
      if(!item||item.isBundle||!Array.isArray(item.units)||!item.units.length)continue;
      const last=latest.get(item.id);
      const wasDerived=!!item.lastPurchaseCostSource;
      if(!last && !wasDerived)continue;
      if(last && !wasDerived){
        // Baseline for undoing the first automatic update if all purchases are deleted.
        item.costBeforePurchases=finite(item.units[0].costPrice);
      }
      const base=last ? last.unitCost : finite(item.costBeforePurchases);
      for(const unit of item.units){const factor=finite(unit.factor)>0?finite(unit.factor):1;
        const next=round(base/factor);
        if(finite(unit.costPrice)!==next){unit.costPrice=next;changed++;}
      }
      if(last){item.lastPurchaseCostSource={invoiceId:last.invoiceId,date:new Date(last.time).toISOString(),currency:last.currency,baseUnitCost:last.unitCost};}
      else {delete item.lastPurchaseCostSource;delete item.costBeforePurchases;}
    }
    return changed;
  }
  root.PurchaseCostEngine={rowValue,purchaseRows,latestCosts,refresh};
})(typeof window==='undefined'?globalThis:window);

if (typeof module!=="undefined" && module.exports) module.exports={PurchaseCostEngine:globalThis.PurchaseCostEngine};
