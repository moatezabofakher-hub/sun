/* 3.5.44: Dual-currency invoice balances, no conversion between independent debts. */
(function(root){'use strict';
 const round=(n,c)=>c==='SYP'?Math.round(Number(n)||0):Math.round(((Number(n)||0)+Number.EPSILON)*100)/100;
 const value=(n,c)=>Number.isFinite(Number(n))&&n!==null?round(n,c):null;
 const sign=inv=>['sale','purchase_return'].includes(inv.type||inv.kind)?1:-1;
 function pair(before,invoice){
   const b={SYP:value(before?.SYP,'SYP'),USD:value(before?.USD,'USD')};
   const a={...b},cur=invoice.currency;
   if(['USD','SYP'].includes(cur)&&b[cur]!==null){
     const net=Number(invoice.netTotal||0)-Number(invoice.paidAmount||0);
     a[cur]=round(b[cur]+sign(invoice)*net,cur);
   }
   return {before:b,after:a};
 }
 function managerBalance(inv,accounts,invoices,vouchers){
   if(!inv?.accountId)return {before:{USD:null,SYP:null},after:{USD:null,SYP:null}};
   const acc=(accounts||[]).find(a=>a.id===inv.accountId);
   if(!acc)return {before:{USD:null,SYP:null},after:{USD:null,SYP:null}};
   const f=acc.type==='supplier'?-1:1;
   const before={USD:round(f*Number(acc.openingUsd||0),'USD'),SYP:round(f*Number(acc.openingSyp||0),'SYP')};
   const pivot=Date.parse(inv.date)||0;
   // Same-date ties use invoice order; vouchers at the exact time precede the invoice.
   const invoiceIndex=(invoices||[]).findIndex(x=>x.id===inv.id);
   for(const [i,doc] of (invoices||[]).entries()){
     if(doc.id===inv.id||doc.accountId!==inv.accountId||!['USD','SYP'].includes(doc.currency))continue;
     const t=Date.parse(doc.date)||0;
     if(t>pivot||(t===pivot&&i>invoiceIndex&&invoiceIndex>=0))continue;
     const due=Number(doc.netTotal||0)-Number(doc.paidAmount||0);
     before[doc.currency]=round(before[doc.currency]+sign(doc)*due,doc.currency);
   }
   for(const v of vouchers||[]){
     if(v.accountId!==inv.accountId)continue;
     const t=Date.parse(v.date)||0;if(t>pivot)continue;
     const c=v.accountCurrency||v.currency;if(!['USD','SYP'].includes(c))continue;
     before[c]=round(before[c]+(v.type==='receipt'?-1:1)*Number(v.accountAmount??v.amount??0),c);
   }
   return pair(before,inv);
 }
 function text(v,c,formatter){if(v===null||!Number.isFinite(v))return 'غير متاح';return formatter(v,c);}
 root.InvoiceDualBalances={round,pair,managerBalance,text};
})(typeof window!=='undefined'?window:globalThis);
