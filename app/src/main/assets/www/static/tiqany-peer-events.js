/* 119: transaction-level notices for authenticated main-phone/Windows sync. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.TiqanyPeerEvents=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const labels={categories:'المجموعات',items:'المواد',accounts:'الحسابات',invoices:'الفواتير',vouchers:'السندات',warehouses:'المستودعات',transfers:'المناقلات',expenses:'المصاريف',capitalMovements:'رأس المال',fieldAgents:'موظفو البيع'};
const settingsLabels={companyName:'اسم الشركة',companyPhone:'هاتف الشركة',companyAddress:'عنوان الشركة',exchangeRate:'سعر الصرف',defaultCurrency:'العملة',defaultPriceTier:'التسعير'};
const stable=v=>JSON.stringify(v===undefined?null:v);
// Stable event fingerprint: same authenticated operation/revision keeps the SAME
// key after a reconnect. Does not depend on arrival time or a random ID.
function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value===undefined?null:value);
}
function fingerprint(value){
 const str=canonical(value);let a=2166136261,b=0x9e3779b9;
 for(let i=0;i<str.length;i++){const c=str.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b^c,2246822519);}
 return (a>>>0).toString(36)+'-'+(b>>>0).toString(36)+'-'+str.length.toString(36);
}
const eventKey=(source,collection,id,verb,value)=>'peer:v2:'+fingerprint([source,collection,id,verb,value]);
const clean=v=>String(v??'').slice(0,130);
const amount=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{maximumFractionDigits:4}):'';
const money=(v,c)=>amount(v)+(c?' '+clean(c):'');
const kindLabel=(kind)=>({sale:'مبيعات',sale_return:'مردود مبيعات',purchase:'مشتريات',purchase_return:'مردود مشتريات',pos:'نقطة بيع',receipt:'قبض',payment:'دفع'}[kind]||'');
function records(before,after,source='computer'){
 const changes=[];let count=0;
 const importedEmployeeIds=new Set((after?.fieldImported||[]).map(row=>String(row?.id)));
 const accountNames=new Map([...(after?.accounts||[]),...(before?.accounts||[])].map(a=>[String(a.id),clean(a.name||a.title||a.id)]));
 for(const [key,label] of Object.entries(labels)){
   const idOf=(v,i)=>key==='categories'?String(v):String(v?.id??'index:'+i);
   const old=new Map((before?.[key]||[]).map((v,i)=>[idOf(v,i),v]));
   const next=new Map((after?.[key]||[]).map((v,i)=>[idOf(v,i),v]));
   const ids=new Set([...old.keys(),...next.keys()]);
   for(const id of ids){
     const previous=old.get(id),now=next.get(id);
     if(stable(previous)===stable(now))continue;
     // Employee imported operations are already delivered by ManagerNotifications
     // using their immutable operation ID. Don't also create a peer invoice alert.
     if(['invoices','vouchers','expenses'].includes(key) && id.startsWith('field_') &&
         importedEmployeeIds.has(id.slice(6)))continue;
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
     changes.push({id:eventKey(source,key,id,verb,value),eventKey:eventKey(source,key,id,verb,value),
       collection:key,recordId:id,type:'peer-operation',action:verb,
       title,detail:details,source,target,targetId:target?String(id):null,
       at:new Date().toISOString(),read:false});
   }
 }
 const oldSettings=before?.sharedSettings||{},newSettings=after?.sharedSettings||{};
 for(const [key,label] of Object.entries(settingsLabels))if(stable(oldSettings[key])!==stable(newSettings[key])){
   count++;if(changes.length<120)changes.push({id:eventKey(source,'settings',key,'تعديل',newSettings[key]),eventKey:eventKey(source,'settings',key,'تعديل',newSettings[key]),
     collection:'settings',recordId:key,type:'peer-operation',action:'تعديل',source,
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
return {records,summarize,eventKey,fingerprint};
});
