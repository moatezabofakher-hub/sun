/* 119: transaction-level notices for authenticated main-phone/Windows sync. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.TiqanyPeerEvents=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const labels={categories:'المجموعات',items:'المواد',accounts:'الحسابات',invoices:'الفواتير',vouchers:'السندات',warehouses:'المستودعات',transfers:'المناقلات',expenses:'المصاريف',capitalMovements:'رأس المال',fieldAgents:'موظفو البيع'};
const settingsLabels={
 companyName:'اسم الشركة',companyPhone:'هاتف الشركة',companyAddress:'عنوان الشركة',companyLogo:'شعار الشركة',
 companySetupCompleted:'إعداد الشركة',footerNote:'ملاحظة أسفل الفاتورة',managerSecurity:'الحماية وكلمة السر',
 exchangeRate:'سعر الصرف',currencyRatesSyp:'أسعار صرف المعاملات',currencyExchangeRatesSyp:'أسعار تصريف العملات',
 defaultCurrency:'العملة الافتراضية',defaultItemCurrency:'عملة المواد الجديدة',primaryCurrency:'العملة الرئيسية',
 secondaryCurrency:'العملة الثانوية',primaryOnlyMode:'التعامل بالعملة الرئيسية فقط',addedCurrencies:'العملات المضافة',
 defaultPriceTier:'طريقة التسعير الافتراضية',taPricingModes:'طرق التسعير',taDefaultSaleUnitName:'وحدة البيع الافتراضية',
 itemQuantityDecimals:'المنازل العشرية للكميات',inventoryValuationCurrency:'عملة تقييم المخزون',
 allowNegativeStockSales:'السماح ببيع المواد النافدة',selectedWarehouseId:'المستودع المختار',
 defaultInvoiceListType:'نوع الفواتير المعروض',defaultViewPeriod:'فترة العرض الافتراضية',
 defaultViewStart:'بداية فترة العرض',defaultViewEnd:'نهاية فترة العرض',posAccountId:'حساب نقطة البيع',
 posPriceTier:'تسعير نقطة البيع',posAutoNextOnFinish:'فتح فاتورة نقطة بيع جديدة بعد الحفظ',posScanFromHome:'ماسح نقطة البيع',
 printerWidth:'عرض ورق الطابعة',printFontScale:'حجم خط الطباعة',btPrintMode:'طريقة الطباعة بالبلوتوث',
 printingMode:'نمط الطباعة',printMode:'طريقة الطباعة',invoicePrintTitle:'عنوان الفاتورة المطبوعة',
 taPrintFields:'حقول الطباعة',shareholderDistribution:'توزيع حصص المساهمين'
};
function settingLabel(key){
 return Object.hasOwn(settingsLabels,key)?settingsLabels[key]:'أحد إعدادات الشركة';
}
function settingNotice(key){
 if(key==='_syncSettingTimes')return {
   title:'مزامنة إعدادات الشركة',detail:'حدّث الجهازان سجل أوقات آخر تعديل للإعدادات أثناء المزامنة التلقائية.'
 };
 const label=settingLabel(key);
 return {title:'تعديل إعدادات الشركة - '+label,detail:'تم تحديث '+label+' من الجهاز المقترن'};
}
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
// A date-only or datetime-local invoice records the business day and wall clock.
// Only a timestamp with an explicit zone represents an instant to convert.
function operationTime(value){
 const raw=String(value??'').trim();
 const match=/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/i.exec(raw);
 if(!match)return 'غير متوفر';
 let [,year,month,day,hour,minute,zone]=match;
 if(zone){
   const d=new Date(raw.replace(' ','T'));
   if(!Number.isFinite(d.getTime()))return 'غير متوفر';
   const pad=n=>String(n).padStart(2,'0');
   year=d.getFullYear();month=pad(d.getMonth()+1);day=pad(d.getDate());
   hour=pad(d.getHours());minute=pad(d.getMinutes());
 }
 // Isolate the timestamp in Arabic native alerts and keep its parts on one line.
 return '\u2066'+day+'/'+month+'/'+year+(hour?'\u00a0'+hour+':'+minute:'')+'\u2069';
}
function forDisplay(entry){
 if(entry.type!=='peer-operation')return entry;
 if(entry.collection==='settings')return {...entry,...settingNotice(entry.recordId)};
 const detail=String(entry.detail||'');
 const marker=' · تاريخ العملية: ',start=detail.indexOf(marker);
 const note=detail.indexOf(' · البيان: ');
 if(start<0 || (note>=0 && note<start))return entry;
 const end=detail.indexOf(' · ',start+marker.length);
 const after=end<0?'':detail.slice(end);
 const raw=entry.operationDate||detail.slice(start+marker.length,end<0?undefined:end);
 return {...entry,detail:detail.slice(0,start)+marker+operationTime(raw)+after};
}
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
     const parts=[value.date?'تاريخ العملية: '+operationTime(value.date):null,
        account?'الحساب: '+account:null,vName?'الاسم: '+vName:null,
        total!==undefined?'المبلغ: '+money(total,currency):null,
        itemQty!==undefined?'عدد البنود: '+itemQty:null,
        value.note?'البيان: '+clean(value.note):null].filter(Boolean);
     const details=(label+' · '+(parts.length?parts.join(' · '):'معرّف السجل: '+clean(id))).slice(0,450);
     changes.push({id:eventKey(source,key,id,verb,value),eventKey:eventKey(source,key,id,verb,value),
       collection:key,recordId:id,type:'peer-operation',action:verb,
       title,detail:details,...(value.date?{operationDate:clean(value.date)}:{}),source,target,targetId:target?String(id):null,
       at:new Date().toISOString(),read:false});
   }
 }
 const oldSettings=before?.sharedSettings||{},newSettings=after?.sharedSettings||{};
 for(const key of new Set([...Object.keys(oldSettings),...Object.keys(newSettings)])){
  if(key==='_syncSettingTimes')continue;
  if(stable(oldSettings[key])===stable(newSettings[key]))continue;
   count++;if(changes.length<120)changes.push({id:eventKey(source,'settings',key,'تعديل',newSettings[key]),eventKey:eventKey(source,'settings',key,'تعديل',newSettings[key]),
     collection:'settings',recordId:key,type:'peer-operation',action:'تعديل',source,
     ...settingNotice(key),target:null,targetId:null,at:new Date().toISOString(),read:false});
 }
 return {count,entries:changes,truncated:count>changes.length};
}
function summarize(before,after){
 const result=records(before,after);const byKind=new Map();
 for(const entry of result.entries)byKind.set(entry.collection,(byKind.get(entry.collection)||0)+1);
 const parts=[...byKind].map(([k,n])=>k==='settings'
   ? [...new Set(result.entries.filter(e=>e.collection==='settings').map(e=>settingLabel(e.recordId)))].join('، ')
   : (labels[k]||'الإعدادات')+' ('+n+')');
 const only=result.count===1?result.entries[0]:null;
 return {count:result.count,changes:[...byKind].map(([type,count])=>({type,count})),
   target:only?.target||null,targetId:only?.targetId||null,action:only?.action||null,
   title:'تحديثات من الهاتف الرئيسي',body:parts.slice(0,5).join('، ').slice(0,220)};
}
return {records,summarize,eventKey,fingerprint,forDisplay};
});
