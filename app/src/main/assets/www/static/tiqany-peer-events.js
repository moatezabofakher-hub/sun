/* 119: transaction-level notices for authenticated main-phone/Windows sync. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.TiqanyPeerEvents=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const labels={categories:'المجموعات',items:'المواد',accounts:'الحسابات',invoices:'الفواتير',vouchers:'السندات',warehouses:'المستودعات',transfers:'المناقلات',expenses:'المصاريف',capitalMovements:'رأس المال',fieldAgents:'موظفو البيع',fieldImported:'العمليات المستوردة',fieldEvents:'الأحداث',fieldCashTransfers:'حركات الصندوق',fieldOperationHistory:'سجل العمليات',fieldRevisionAudit:'سجل التدقيق',fieldCompany:'بيانات الموظفين'};
const settingsLabels={companyName:'اسم الشركة',companyPhone:'هاتف الشركة',companyAddress:'عنوان الشركة',exchangeRate:'سعر الصرف',defaultCurrency:'العملة',defaultPriceTier:'التسعير'};
const stable=v=>JSON.stringify(v===undefined?null:v);
const clean=v=>String(v??'').slice(0,130);
const amount=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{maximumFractionDigits:4}):'';
const money=(v,c)=>amount(v)+(c?' '+clean(c):'');
const kindLabel=(kind)=>({sale:'مبيعات',sale_return:'مردود مبيعات',purchase:'مشتريات',purchase_return:'مردود مشتريات',pos:'نقطة بيع',receipt:'قبض',payment:'دفع'}[kind]||'');
function records(before,after,source='computer'){
 const changes=[];let count=0;
 const accountNames=new Map([...(after?.accounts||[]),...(before?.accounts||[])].map(a=>[String(a.id),clean(a.name||a.title||a.id)]));
 for(const [key,label] of Object.entries(labels)){
   const idOf=(v,i)=>key==='categories'?String(v):String(v?.id??'index:'+i);
   const old=new Map((before?.[key]||[]).map((v,i)=>[idOf(v,i),v]));
   const next=new Map((after?.[key]||[]).map((v,i)=>[idOf(v,i),v]));
   const ids=new Set([...old.keys(),...next.keys()]);
   for(const id of ids){
     const previous=old.get(id),now=next.get(id);
     if(stable(previous)===stable(now))continue;
     count++;
     if(changes.length>=120)continue;
     const value=now??previous??{},verb=previous===undefined?'إضافة':now===undefined?'حذف':'تعديل';
     const target={invoices:'invoice',vouchers:'voucher',accounts:'customer',expenses:'expense',transfers:'transfer',items:'item'}[key]||null;
     const doc=kindLabel(value.type||value.kind||value.invoiceType||value.voucherType);
     const number=clean(value.number??value.invoiceNumber??value.localNumber??value.refNo??'');
     const account=accountNames.get(String(value.accountId||value.customerId||value.supplierId||''));
     const vName=clean(value.name||value.title||value.category||'');
     const currency=clean(value.currency||'');
     const total=value.netTotal??value.total??value.amount??value.accountAmount;
     const itemQty=Array.isArray(value.rows)?value.rows.length:undefined;
     const title=`${verb} ${label}${doc?' - '+doc:''}${number?' رقم '+number:''}`;
     const parts=[account?'الحساب: '+account:null,vName?'الاسم: '+vName:null,
        total!==undefined?'المبلغ: '+money(total,currency):null,
        itemQty!==undefined?'عدد البنود: '+itemQty:null,
        value.date?'تاريخ العملية: '+clean(value.date):null,
        value.note?'البيان: '+clean(value.note):null].filter(Boolean);
     const details=(label+' · '+(parts.length?parts.join(' · '):'معرّف السجل: '+clean(id))).slice(0,450);
     changes.push({collection:key,recordId:id,type:'peer-operation',action:verb,
       title,detail:details,source,target,targetId:target?String(id):null,
       at:new Date().toISOString(),read:false});
   }
 }
 const oldSettings=before?.sharedSettings||{},newSettings=after?.sharedSettings||{};
 for(const [key,label] of Object.entries(settingsLabels))if(stable(oldSettings[key])!==stable(newSettings[key])){
   count++;if(changes.length<120)changes.push({collection:'settings',recordId:key,type:'peer-operation',action:'تعديل',source,
     title:'تعديل إعدادات الشركة - '+label,detail:'تم تحديث '+label+' من الجهاز المقترن',target:null,targetId:null,at:new Date().toISOString(),read:false});
 }
 return {count,entries:changes,truncated:count>changes.length};
}
function summarize(before,after){
 const result=records(before,after);const byKind=new Map();
 for(const entry of result.entries)byKind.set(entry.collection,(byKind.get(entry.collection)||0)+1);
 const parts=[...byKind].map(([k,n])=>k==='settings'?Object.keys(settingsLabels).filter(key=>stable(before?.sharedSettings?.[key])!==stable(after?.sharedSettings?.[key])).map(key=>settingsLabels[key]).join('، ') : (labels[k]||'الإعدادات')+' ('+n+')');
 const only=result.count===1?result.entries[0]:null;
 return {count:result.count,changes:[...byKind].map(([type,count])=>({type,count})),
   target:only?.target||null,targetId:only?.targetId||null,action:only?.action||null,
   title:'تحديثات من الهاتف الرئيسي',body:parts.slice(0,5).join('، ').slice(0,220)};
}
return {records,summarize};
});
