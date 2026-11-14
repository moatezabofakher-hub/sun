/* Tiqany Acc 3.5.55: Live invoice balance preview (not persisted).
 * Signed balances: positive = عليه / receivable, negative = له / payable.
 * Do not convert USD to SYP, offset accounts, or count a fully paid sale as debt.
 */
(function(root,factory){'use strict';
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.DraftInvoiceBalancePreview=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
 const validCurrency=c=>c==='SYP'||c==='USD';
 const round=(n,c)=>c==='SYP'?Math.round(n):Math.round((n+Number.EPSILON)*100)/100;
 const sign=t=>(t==='sale'||t==='purchase_return')?1:-1;
 function project(before,invoice){
   const c=invoice&&invoice.currency;
   if(!validCurrency(c)||before==null||before===''||!Number.isFinite(Number(before)))return {available:false,before:null,after:null,delta:null,currency:c};
   const net=Number(invoice.netTotal),paid=Number(invoice.paidAmount);
   if(!Number.isFinite(net)||!Number.isFinite(paid)||net<0||paid<0||paid>net+1e-8)return {available:false,before:null,after:null,delta:null,currency:c};
   const b=round(Number(before),c),delta=round(sign(invoice.type||invoice.kind)*(net-paid),c);
   return {available:true,before:b,after:round(b+delta,c),delta,currency:c};
 }
 return Object.freeze({project,round,sign});
});
