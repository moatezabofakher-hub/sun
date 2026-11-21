/* Inventory and settlement calculations shared by the mobile and desktop ledgers. */
(function(root){
'use strict';
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const precision = value => Math.round(value * 1e8) / 1e8;
const factor = row => number(row.unitFactor) > 0 ? Number(row.unitFactor) : 1;
const amount = (value, currency) => currency === 'SYP' ? Math.round(value) : Math.round(value * 100) / 100;
const quote = (doc, currency) => currency === 'SYP' ? 1 : number(currency === 'USD' ? doc.exchangeRate : doc.financeRates?.[currency]);
function when(doc) {
  // A civil date without an offset belongs to the business clock. Keep legacy
  // local timestamps comparable to field timestamps that have an explicit offset.
  return Date.parse(doc.date || '') || 0;
}
const compare = (a,b) => when(a)-when(b) || String(a.id).localeCompare(String(b.id),'en');
const direction = inv => ['sale','purchase_return'].includes(inv.type) ? 'receipt' : 'payment';
const unpaid = inv => Math.max(0, number(inv.remainingAmount ?? (number(inv.netTotal)-number(inv.paidAmount))));
function costs(state, cutoff) {
  const items = new Map((state.items || []).filter(Boolean).map(item=>[item.id,item]));
  const pools = new Map();
  for (const item of items.values()) {
    pools.set(item.id,{units:number(item.openingStockBase),cost:number(item.costBeforePurchases ?? item.units?.[0]?.manualCostBeforePurchase ?? item.units?.[0]?.costPrice)});
  }
  function move(id, units, incomingCost) {
    const pool=pools.get(id);
    if (!pool || !units) return;
    if (units>0 && Number.isFinite(incomingCost)) {
      const stocked=Math.max(0,pool.units);
      pool.cost=(stocked*pool.cost + units*incomingCost)/(stocked+units);
    }
    pool.units=precision(pool.units+units);
  }
  for (const inv of (state.invoices||[]).filter(i=>i && (!cutoff || (i.id!==cutoff.id && when(i)<=when(cutoff)))).sort((a,b)=>when(a)-when(b) || Number(b.type==='purchase')-Number(a.type==='purchase') || compare(a,b))) {
    const rows=(inv.rows||[]).filter(r=>r && number(r.qty)>0);
    const line = r => Math.max(0,number(r.total ?? (number(r.price)*number(r.qty)-number(r.discount))));
    const sub=rows.reduce((s,r)=>s+line(r),0);
    for (const r of rows) {
      const item=items.get(r.itemId);
      if (!item) continue;
      const units=number(r.qty)/factor(r);
      if (inv.type==='purchase') {
        const from=quote(inv, inv.currency), to=quote(inv,item.currency || inv.currency);
        const ratio=item.currency===inv.currency || !item.currency ? 1 : (from>0 && to>0 ? from/to : null);
        const landed=sub ? line(r)*(1+(number(inv.taxAmount)-Math.min(sub,number(inv.discountAmount)))/sub) : 0;
        move(item.id,units,ratio===null ? undefined : landed*ratio/units);
      } else if (inv.type==='purchase_return') move(item.id,-units);
      else if (['sale','sale_return'].includes(inv.type)) {
        const sign=inv.type==='sale' ? -1 : 1;
        if (item.isBundle) {
          for(const part of r.bomComponents || item.bundleComponents || []) move(part.itemId,sign*units*number(part.quantity));
        } else {
          const returned=r.costCurrency && r.costCurrency!==item.currency ? undefined : r.baseCostPrice;
          move(item.id,sign*units,sign>0 && returned!=null ? number(returned)*factor(r) : undefined);
        }
      }
    }
  }
  return pools;
}
function freeze(state,doc,previous) {
  doc.financeRates={...(doc.financeRates || state.settings?.currencyRatesSyp || {})};
  if (!['sale','sale_return'].includes(doc.type)) return;
  const pools=costs(state,doc), items=new Map(state.items.map(x=>[x.id,x]));
  for (const row of doc.rows || []) {
    const item=items.get(row.itemId);
    if (!item) continue;
    const old=(previous?.rows||[]).find(r=>r.rowId && r.rowId===row.rowId && r.itemId===row.itemId && factor(r)===factor(row));
    row.profitCategory=old?.profitCategory ?? item.category ?? '';
    if (old && old.baseCostPrice!=null) {
      row.baseCostPrice=old.baseCostPrice;
      row.costCurrency=old.costCurrency || item.currency;
      if(old.weightedCostUsd!=null)row.weightedCostUsd=old.weightedCostUsd;
      continue;
    }
    let cost=pools.get(item.id)?.cost ?? 0;
    if (item.isBundle) cost=(row.bomComponents || item.bundleComponents || []).reduce((sum,part)=>{
      const c=items.get(part.itemId)?.currency || item.currency;
      const ratio=c===item.currency ? 1 : quote(doc,c)/quote(doc,item.currency);
      return sum+number(pools.get(part.itemId)?.cost)*number(part.quantity)*number(ratio);
    },0);
    row.baseCostPrice=precision(cost/factor(row));
    row.costCurrency=item.currency || doc.currency;
    const localRate=quote(doc,row.costCurrency), dollarRate=quote(doc,'USD');
    if(row.costCurrency==='USD')row.weightedCostUsd=row.baseCostPrice;
    else if(localRate>0 && dollarRate>0)row.weightedCostUsd=precision(row.baseCostPrice*localRate/dollarRate);
  }
}
// A voucher posts cash and account balances once. Allocations only describe
// which open documents it settles. Offline overpayments remain on account.
function settlements(state, excludeVoucherId) {
  const docs=new Map((state.invoices||[]).filter(Boolean).map(i=>[i.id,i]));
  const balances=new Map([...docs].map(([id,inv])=>[id,unpaid(inv)]));
  const events=[], used=new Map();
  for(const v of (state.vouchers||[]).filter(v=>v && v.id!==excludeVoucherId).sort(compare)) {
    const c=v.accountCurrency||v.currency;
    let available=number(v.accountAmount ?? v.amount);
    const lines=v.allocations || (v.linkedInvoiceId ? [{invoiceId:v.linkedInvoiceId,amount:available}] : []);
    for (const line of lines) {
      const inv=docs.get(line.invoiceId);
      if (!inv || inv.accountId!==v.accountId || direction(inv)!==v.type || inv.currency!==c) continue;
      const applied=amount(Math.min(available, balances.get(inv.id), Math.max(0,number(line.amount))),c);
      if (!(applied>0)) continue;
      available=amount(available-applied,c);
      balances.set(inv.id,amount(balances.get(inv.id)-applied,c));
      used.set(v.id,amount((used.get(v.id)||0)+applied,c));
      if (c!=='SYP' && line.fx && number(line.invoiceRate)>0 && number(line.paymentRate)>0) {
        const gain=applied*(line.paymentRate-line.invoiceRate)*(v.type==='receipt'?1:-1);
        if(gain) events.push({invoice:inv,voucher:v,applied,gainSyp:amount(gain,'SYP'),invoiceRate:line.invoiceRate,paymentRate:line.paymentRate});
      }
    }
  }
  return {balances,events,used};
}
function allocate(state, voucher, input) {
  const balances=settlements(state,voucher.id).balances;
  const c=voucher.accountCurrency||voucher.currency;
  let total=0;
  const rows=[], seen=new Set();
  for (const line of input||[]) {
    const n=amount(number(line.amount),c);
    if (!n) continue;
    const inv=(state.invoices||[]).find(i=>i.id===line.invoiceId);
    if (!inv || inv.accountId!==voucher.accountId || inv.currency!==c || direction(inv)!==voucher.type || seen.has(inv.id) || n<=0 || n>balances.get(inv.id)) throw Error('راجع الفاتورة والمبلغ المخصّص لها. قد يكون رصيدها تغيّر بعد المزامنة.');
    seen.add(inv.id);
    total=amount(total+n,c);
    const prior=(state.vouchers||[]).find(v=>v.id===voucher.id);
    const previous=prior?.allocations?.find(a=>a.invoiceId===inv.id);
    const fx=previous ? previous.fx : state.settings?.settleFxOnPayment===true;
    const invoiceRate=previous?.invoiceRate || quote(inv,c);
    const cashRate=quote(voucher,voucher.currency);
    const paymentRate=voucher.currency!==c && number(voucher.accountAmount)>0 ? number(voucher.amount)*cashRate/number(voucher.accountAmount) : quote(voucher,c);
    if(fx && c!=='SYP' && !(invoiceRate>0 && paymentRate>0)) throw Error('حدّد سعر صرف الفاتورة وسعر السداد مقابل الليرة لإتمام التسوية.');
    rows.push({invoiceId:inv.id,amount:n,fx:!!fx,invoiceRate,paymentRate});
  }
  if (total>amount(number(voucher.accountAmount ?? voucher.amount),c)) throw Error('مجموع التوزيع أكبر من المبلغ المرحّل على الحساب.');
  return rows;
}
function nextTillOpening(previous,current) {
  if (!previous?.counted) return {...current};
  // Older closings stored the expected count, the physical opening and the opening ledger snapshot.
  const ledgerAtClose=previous.closingBaseline ??
    tillExpected(previous.baseline,previous.opening,previous.expected);
  return tillExpected(previous.counted,ledgerAtClose,current);
}
function tillExpected(opening,baseline,current) {
  const result={};
  for (const code of new Set([...Object.keys(opening),...Object.keys(baseline),...Object.keys(current)]))
    result[code]=amount(number(opening[code])+number(current[code])-number(baseline[code]),code);
  return result;
}
function age(inv,today) {
  const due=String(inv.dueDate || inv.date || '').slice(0,10);
  return Math.floor((Date.parse(today+'T00:00:00Z')-Date.parse(due+'T00:00:00Z'))/86400000);
}
function fieldPayments(state,vouchers,ops,invoices){
  const index=new Map([...(state.invoices||[]),...(invoices||[])].map(i=>[i.id,i]));
  const operations=new Map(ops.map(o=>[o.id,o]));
  for(const v of vouchers){
    const op=operations.get(v.fieldOrigin?.operationId);
    if(!op)continue;
    const id=op.settlementInvoiceId || (op.linkedInvoiceOpId?'field_'+op.linkedInvoiceOpId:'');
    if(!id){if(op.settlementInvoiceId==='')v.allocations=[];continue;}
    const inv=index.get(id);
    if(!inv || inv.accountId!==v.accountId || inv.currency!==v.accountCurrency || direction(inv)!==v.type)throw Error('الفاتورة المحددة لا تطابق حساب السند أو عملته');
    const previous=(state.vouchers||[]).find(x=>x.id===v.id)?.allocations?.find(x=>x.invoiceId===id);
    v.allocations=[{invoiceId:id,amount:v.accountAmount,fx:previous?.fx??(state.settings?.settleFxOnPayment===true),invoiceRate:previous?.invoiceRate||quote(inv,inv.currency),paymentRate:quote(v,v.accountCurrency)}];
  }
}
const api={fieldPayments,number,amount,quote,compare,direction,unpaid,costs,freeze,settlements,allocate,tillExpected,nextTillOpening,age};
if(typeof module==='object' && module.exports)module.exports=api;
root.TiqanyFinance=api;
})(typeof globalThis==='object'?globalThis:window);
