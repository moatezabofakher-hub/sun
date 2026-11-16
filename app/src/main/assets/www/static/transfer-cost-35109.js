/* v3.5.109: Non-posting inventory transfer valuation (current stored latest unit cost). */
(function(root){
  'use strict';
  function summarize(rows, items, currency, exchangeRate, convert) {
    const byId=new Map((items||[]).map(it=>[String(it.id),it]));
    const seen=new Set();let amount=0, missing=0,invalid=0;
    for(const row of (rows||[])){
      const id=String(row.itemId),it=byId.get(id);
      if(!it){invalid++;continue;}
      seen.add(id);
      const qty=Number(row.qty),factor=Number(row.factor);
      if(!(qty>0)||!(factor>0)||!Number.isFinite(qty/factor)){invalid++;continue;}
      const stored=it.units?.[0]?.costPrice;
      if(stored==null || String(stored).trim()==='' || !Number.isFinite(Number(stored)) || Number(stored)<0){missing++;continue;}
      const raw=Number(stored)*qty/factor;
      const converted=typeof convert==='function'?Number(convert(raw,it.currency||currency,currency,exchangeRate)):
        (it.currency===currency?raw:it.currency==='USD'?raw*Number(exchangeRate):raw/Number(exchangeRate));
      if(!Number.isFinite(converted)){invalid++;continue;}
      amount+=converted;
    }
    return {count:seen.size,total:amount,currency,missing,invalid};
  }
  const api=Object.freeze({summarize});
  root.TiqanyTransferCost=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
