/* Safe and bounded summary of changes arriving via authenticated peer synchronization. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.TiqanyPeerEvents=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const labels={categories:'المجموعات',items:'المواد',accounts:'الحسابات',invoices:'الفواتير',vouchers:'السندات',warehouses:'المستودعات',transfers:'المناقلات',expenses:'المصاريف',fieldAgents:'موظفو البيع',fieldImported:'العمليات المستوردة',fieldEvents:'الأحداث',fieldCashTransfers:'حركات الصندوق',fieldOperationHistory:'سجل العمليات',fieldRevisionAudit:'سجل تدقيق التعديلات',fieldCompany:'شركة الموظفين'};
const settingsLabels={companyName:'اسم الشركة',companyPhone:'هاتف الشركة',companyAddress:'عنوان الشركة',companyLogo:'الشعار',exchangeRate:'سعر الصرف',defaultCurrency:'العملة',defaultPriceTier:'التسعير',allowNegativeStockSales:'سياسة المخزون'};
const stable=v=>JSON.stringify(v===undefined?null:v);
function summarize(before,after){
 const parts=[],changes=[],openables=[];
 for(const [key,label] of Object.entries(labels)){
   const old=new Map((before?.[key]||[]).map((r,i)=>[key==='categories'?String(r):String(r?.id??i),r]));
   const next=new Map((after?.[key]||[]).map((r,i)=>[key==='categories'?String(r):String(r?.id??i),r]));
   let count=0;
   for(const [id,value] of next)if(stable(old.get(id))!==stable(value)){count++;if(['invoices','vouchers','accounts','expenses'].includes(key))openables.push({collection:key,id});}
   for(const id of old.keys())if(!next.has(id))count++;
   if(count){parts.push(label+' ('+count+')');changes.push({type:key,count});}
 }
 const beforeSettings=before?.sharedSettings||{}, afterSettings=after?.sharedSettings||{};
 let settingsCount=0;
 for(const key of Object.keys(afterSettings))if(stable(beforeSettings[key])!==stable(afterSettings[key])){settingsCount++;if(settingsLabels[key])parts.push(settingsLabels[key]);}
 if(settingsCount){changes.push({type:'settings',count:settingsCount});if(!parts.some(p=>Object.values(settingsLabels).includes(p)))parts.push('إعدادات الشركة');}
 const total=changes.reduce((n,c)=>n+c.count,0);
 const only=total===1&&openables.length===1?openables[0]:null;
 const targetMap={invoices:'invoice',vouchers:'voucher',accounts:'customer',expenses:'expense'};
 return {count:total,changes,target:only?targetMap[only.collection]:null,targetId:only?.id||null,
   title:'تحديثات من الهاتف الرئيسي',body:parts.slice(0,5).join('، ').slice(0,220)};
}
return {summarize};
});
