/* 3.5.89 — manager-owned field-employee authorization policy. */
(function(root){'use strict';
 const names={priceTier:'تعديل طريقة التسعير',currency:'تعديل العملة المعتمدة في العمليات',balances:'معرفة أرصدة الحسابات',editPrices:'تعديل الأسعار ضمن الفاتورة',exchangeRate:'تعديل سعر الصرف',stock:'مراقبة الجرد',createAccounts:'إضافة حسابات جديدة',createItems:'إضافة مواد جديدة',editOperations:'تعديل العمليات',deleteOperations:'حذف العمليات'};
 const defaults=Object.freeze({priceTier:true,currency:true,balances:true,editPrices:false,exchangeRate:false,stock:true,createAccounts:true,createItems:false,editOperations:true,deleteOperations:false});
 function normalize(p){const src=p&&typeof p==='object'&&!Array.isArray(p)?p:defaults;return Object.fromEntries(Object.keys(names).map(k=>[k,src[k]===true]));}
 function grid(prefix,permissions){const p=normalize(permissions);return `<div class="rounded-xl border-2 border-sky-200 bg-sky-50 p-3" dir="rtl"><h4 class="font-black text-blue-900 mb-2">صلاحيات الموظف — حدد المسموح</h4><div class="grid grid-cols-2 gap-2">${Object.keys(names).map((k,i)=>`<label class="flex gap-2 items-center rounded-lg border border-blue-200 bg-white p-2 text-xs font-bold min-h-[48px]" style="color:#0f2442"><input type="checkbox" data-staff-perm="${prefix}" value="${k}" ${p[k]?'checked':''} style="width:18px;height:18px;accent-color:#0f766e"/><span>${names[k]}</span></label>`).join('')}</div><p class="text-[11px] mt-2 text-slate-600">التغييرات تدخل حيز التنفيذ على هاتف الموظف عند المزامنة التالية، ويُفحص السماح عند استقبال العمليات أيضاً.</p></div>`;}
 function read(prefix){const obj={};for(const k of Object.keys(names))obj[k]=!!document.querySelector(`input[data-staff-perm="${prefix}"][value="${k}"]:checked`);return obj;}
 function assertOperations(ops,agent,rate){const p=normalize(agent?.permissions);
   for(const o of ops||[]){
     if(o.kind==='customer_create'&&!p.createAccounts)throw Error('ليس لدى الموظف صلاحية إضافة حسابات');
     if(o.kind==='document_edit'&&!p.editOperations)throw Error('ليس لدى الموظف صلاحية تعديل العمليات');
     if(o.kind==='document_delete'&&!p.deleteOperations)throw Error('ليس لدى الموظف صلاحية حذف العمليات');
     if(o.kind==='item_create'&&!p.createItems)throw Error('ليس لدى الموظف صلاحية إضافة مواد');
   }
   return true;
 }
 root.TiqanyAgentPermissions={names,defaults,normalize,grid,read,assertOperations};
})(typeof window!=='undefined'?window:globalThis);
