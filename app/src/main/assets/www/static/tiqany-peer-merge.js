/* Tiqany peer ledger merge (shared, testable, deliberately independent of UI). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.TiqanyPeerMerge=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const BASE_COLLECTIONS=['categories','items','accounts','invoices','vouchers','warehouses','transfers','expenses'];
// The field staff directory, pending imported IDs and cash hand-offs must travel with the ledger.
const STAFF_COLLECTIONS=['fieldAgents','fieldImported','fieldEvents','fieldCashTransfers','fieldOperationHistory','fieldRevisionAudit','fieldCompany'];
const COLLECTIONS=BASE_COLLECTIONS.concat(STAFF_COLLECTIONS);
const SETTINGS=['companyName','companyPhone','companyAddress','exchangeRate','defaultCurrency','defaultItemCurrency','primaryCurrency','secondaryCurrency','primaryOnlyMode','defaultPriceTier','itemQuantityDecimals','inventoryValuationCurrency','allowNegativeStockSales','companyLogo','footerNote','addedCurrencies','defaultInvoiceListType','defaultViewPeriod','defaultViewStart','defaultViewEnd','posAccountId','posPriceTier','posAutoNextOnFinish'];
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
function sortDeep(x){if(Array.isArray(x))return x.map(sortDeep);if(x&&typeof x==='object'){const out={};for(const k of Object.keys(x).sort())out[k]=sortDeep(x[k]);return out;}return x;}
function canonical(x){return JSON.stringify(sortDeep(x));}
function snapshot(state){
 const result={};for(const name of BASE_COLLECTIONS)result[name]=clone(Array.isArray(state[name])?state[name]:[]);
 const field=(state.fieldSync&&typeof state.fieldSync==='object')?state.fieldSync:{};
 for(const [name,source] of [['fieldAgents','agents'],['fieldImported','imported'],['fieldEvents','events'],['fieldCashTransfers','cashTransfers'],['fieldOperationHistory','operationHistory'],['fieldRevisionAudit','revisionAudit']])
   result[name]=clone(Array.isArray(field[source])?field[source]:[]);
 // An unused installation has no bound field-company identity to overwrite on the other device.
 const hasFieldData=STAFF_COLLECTIONS.some(name=>name!=='fieldCompany'&&result[name].length>0);
 result.fieldCompany=field.companyId&&hasFieldData?[{id:'field-company',companyId:String(field.companyId)}]:[];
 result.sharedSettings={};for(const k of SETTINGS)if(state.settings&&Object.prototype.hasOwnProperty.call(state.settings,k))result.sharedSettings[k]=clone(state.settings[k]);
 return result;
}
function ensureSnapshot(s){if(!s||typeof s!=='object'||Array.isArray(s))throw Error('نسخة مزامنة غير صالحة');for(const k of BASE_COLLECTIONS)if(!Array.isArray(s[k]))throw Error('سجل '+k+' غير صالح');for(const k of STAFF_COLLECTIONS)if(s[k]!==undefined&&!Array.isArray(s[k]))throw Error('سجل موظفي البيع '+k+' غير صالح');if(!s.sharedSettings||typeof s.sharedSettings!=='object'||Array.isArray(s.sharedSettings))throw Error('إعدادات المزامنة غير صالحة');}
function recordKey(name,r){
 if(name==='categories'){if(typeof r!=='string')throw Error('اسم مجموعة غير صالح');return 'str:'+r;}
 if(!r||typeof r!=='object'||typeof r.id!=='string'||!r.id||r.id.length>200)throw Error('معرف سجل غير صالح في '+name);
 return 'id:'+r.id;
}
function keyed(name,records){const m=new Map();for(const r of records){const id=recordKey(name,r);if(m.has(id))throw Error('سجل مكرر داخلياً: '+name+' '+id);m.set(id,r);}return m;}
const same=(a,b)=>canonical(a)===canonical(b);
// The field employee creates immutable operation IDs offline. Importing the same
// operation into two masters changes only the LOCAL bookkeeping number and
// reception timestamp. These fields must not cause a double posting.
const DOCUMENT_COLLECTIONS=new Set(['accounts','invoices','vouchers','expenses']);
function fieldIdentity(collection,record){
 if(!DOCUMENT_COLLECTIONS.has(collection)||!record||typeof record!=='object')return null;
 const o=record.fieldOrigin;
 if(!o||typeof o.agentId!=='string'||!o.agentId||typeof o.operationId!=='string'||!o.operationId)return null;
 return JSON.stringify([collection,o.agentId,o.operationId]);
}
function fieldBusinessVersion(collection,record){
 const out=clone(record);
 // Never omit financial fields, even if they are new or unfamiliar.
 for(const key of ['id','number','originalNumber','numberAdjustedAt'])delete out[key];
 if(collection==='expenses')delete out.updatedAt; // reception time, not expense date
 if(out.fieldOrigin){
   delete out.fieldOrigin.receivedAt;
   delete out.fieldOrigin.agentName; // display-only name may be updated independently
   delete out.fieldOrigin.vehicleName;
 }
 if(Array.isArray(out.rows))for(const row of out.rows)delete row.rowId;
 return out;
}
function equivalentImported(collection,a,b){
 if(!a||!b)return false;
 if(collection==='fieldImported'){
   // Only the local time of reception differs. Do not conflate two employees.
   const x=clone(a),y=clone(b);delete x.receivedAt;delete y.receivedAt;
   return same(x,y);
 }
 const key=fieldIdentity(collection,a);
 return !!key&&key===fieldIdentity(collection,b)&&
   same(fieldBusinessVersion(collection,a),fieldBusinessVersion(collection,b));
}
function reconcileFieldDuplicates(out,local,remote,resolutions,conflicts,details,stats){
 const alias=new Map();
 for(const collection of DOCUMENT_COLLECTIONS){
   const groups=new Map();
   for(const doc of out[collection]){
     const source=fieldIdentity(collection,doc);if(!source)continue;
     if(!groups.has(source))groups.set(source,[]);
     groups.get(source).push(doc);
   }
   const removed=new Set();
   for(const [origin,group] of groups){
     if(group.length<2)continue;
     // In particular, do not auto-delete two postings from the SAME device:
     // they may indicate corrupt historical data that require a manual audit.
     const onPhone=(local[collection]||[]).filter(v=>fieldIdentity(collection,v)===origin);
     const onComputer=(remote[collection]||[]).filter(v=>fieldIdentity(collection,v)===origin);
     const phone=onPhone[0],computer=onComputer[0];
     const validPair=group.length===2&&onPhone.length===1&&onComputer.length===1;
     const equal=validPair&&equivalentImported(collection,phone,computer);
     const detail=makeConflict('duplicate',collection,'field-origin:'+origin,null,phone||group[0],computer||group[group.length-1]);
     let chosen;
     if(equal)chosen=computer; // Prefer the already printed Windows document number
     else{
       details.push(detail);
       const approval=validPair?approvedChoice(detail,resolutions):null;
       if(approval)chosen=approval==='phone'?phone:computer;
       else{conflicts.push(collection+': تطابق هوية عملية موظف مع اختلاف بياناتها '+origin);continue;}
     }
     for(const doc of group){
       if(doc===chosen||doc.id===chosen.id)continue;
       removed.add(doc.id);alias.set(doc.id,chosen.id);stats.deduplicated++;
       if(stats.added)stats.added--;
     }
   }
   if(removed.size)out[collection]=out[collection].filter(x=>!removed.has(x.id));
 }
 // Preserve explicit receipt-to-invoice references after choosing one copy.
 if(alias.size)for(const voucher of out.vouchers){
   if(alias.has(voucher.linkedInvoiceId))voucher.linkedInvoiceId=alias.get(voucher.linkedInvoiceId);
 }
}

// A digest ties a human approval to the exact three versions reviewed. A changed
// record must be reviewed again; this is a staleness token, not an auth token.
function digest(value){const raw=canonical(value);let a=2166136261,b=0x811c9dc7;for(let i=0;i<raw.length;i++){const ch=raw.charCodeAt(i);a=Math.imul(a^ch,16777619);b=Math.imul(b^(ch+i),2246822519);}return raw.length.toString(36)+'-'+(a>>>0).toString(16)+'-'+(b>>>0).toString(16);}
function makeConflict(kind,collection,key,base,phone,computer){
 const id=collection+'|'+key;
 return {id,kind,collection,recordId:key,signature:digest([base===undefined?{missing:true}:base,phone===undefined?{missing:true}:phone,computer===undefined?{missing:true}:computer]),hasBase:base!==undefined,hasPhone:phone!==undefined,hasComputer:computer!==undefined,base:clone(base),phone:clone(phone),computer:clone(computer)};
}
function approvedChoice(details,resolutions){const d=resolutions&&resolutions[details.id];return d&&d.signature===details.signature&&(d.side==='phone'||d.side==='computer')?d.side:null;}
// Reconstruct stock from the ledger, not editable displayed inventory fields.
function itemStock(s,id,warehouse){
 const items=new Map(s.items.map(i=>[i.id,i]));const item=items.get(id);if(!item)return 0;
 let total=(warehouse==='wh_main'?Number(item.openingStockBase)||0:0);
 for(const inv of s.invoices){if((inv.warehouseId||'wh_main')!==warehouse)continue;
   for(const r of inv.rows||[]){
     const fac=Number(r.unitFactor)>0?Number(r.unitFactor):1,baseQty=(Number(r.qty)||0)/fac;
     if(r.itemId===id){if(['purchase','sale_return'].includes(inv.type))total+=baseQty;
       if(['sale','purchase_return'].includes(inv.type))total-=baseQty;
     }else if(['sale','sale_return'].includes(inv.type)){
       const kit=items.get(r.itemId),parts=Array.isArray(r.bomComponents)?r.bomComponents:(kit?.isBundle?kit.bundleComponents:[]);
       const part=Array.isArray(parts)?parts.find(x=>x.itemId===id):null;
       if(part){const qty=baseQty*(Number(part.quantity)||0);total+=inv.type==='sale_return'?qty:-qty;}
     }
   }
 }
 for(const transfer of s.transfers){if(transfer.itemId!==id)continue;
   const qty=Number(transfer.quantityBase)||0;
   if(transfer.fromWarehouseId===warehouse)total-=qty;
   if(transfer.toWarehouseId===warehouse)total+=qty;
 }
 return total;
}
function negativeNewStock(local,remote,merged){
 if(merged.sharedSettings.allowNegativeStockSales===true)return [];
 const issues=[];
 for(const item of merged.items){if(item.isBundle)continue;
  for(const wh of merged.warehouses){
   const combined=itemStock(merged,item.id,wh.id);
   if(combined>=-1e-5)continue;
   // Only flag a new overdraw introduced by the merge, not an old negative stock.
   if(itemStock(local,item.id,wh.id)>=-1e-5&&itemStock(remote,item.id,wh.id)>=-1e-5)
     issues.push('inventory: '+String(item.name||item.id).slice(0,55)+' @ '+wh.id);
  }
 }
 return issues;
}
function merge(base,local,remote,resolutions={}){
 ensureSnapshot(local);ensureSnapshot(remote);if(base)ensureSnapshot(base);
 const out={},conflicts=[],details=[],stats={added:0,updated:0,deleted:0,renumbered:0,deduplicated:0,settingsFromDesktop:0};
 for(const type of COLLECTIONS){
  const b=keyed(type,base?.[type]||[]),a=keyed(type,local[type]||[]),r=keyed(type,remote[type]||[]);
  const order=[...r.keys(),...a.keys().filter(k=>!r.has(k)),...b.keys().filter(k=>!r.has(k)&&!a.has(k))];
  const merged=[];
  for(const id of order){
   const B=b.get(id),A=a.get(id),R=r.get(id);
   let choice;
   if(same(A,R))choice=A;
   else if(equivalentImported(type,A,R))choice=R;
   else if(same(A,B))choice=R;
   else if(same(R,B))choice=A;
   else {
    const detail=makeConflict('record',type,id,B,A,R);
    details.push(detail);
    const side=approvedChoice(detail,resolutions);
    if(side==='phone')choice=A;
    else if(side==='computer')choice=R;
    else {conflicts.push(`${type}: ${id.slice(0,75)}`);continue;}
   }
   if(choice!==undefined)merged.push(clone(choice));
   if(B===undefined&&choice!==undefined)stats.added++;
   else if(B!==undefined&&choice===undefined)stats.deleted++;
   else if(B!==undefined&&!same(B,choice))stats.updated++;
  }
  out[type]=merged;
 }
 const settings={};
 for(const key of SETTINGS){
  const B=base?.sharedSettings?.[key],A=local.sharedSettings[key],R=remote.sharedSettings[key];
  if(!base){settings[key]=clone(R===undefined?A:R);if(!same(A,R)&&R!==undefined)stats.settingsFromDesktop++;}
  else if(same(A,R))settings[key]=clone(A);
  else if(same(A,B))settings[key]=clone(R);
  else if(same(R,B))settings[key]=clone(A);
  else {const detail=makeConflict('settings','settings',key,B,A,R);details.push(detail);const side=approvedChoice(detail,resolutions);if(side)settings[key]=clone(side==='phone'?A:R);else{conflicts.push('settings: '+key);}}
 }
 out.sharedSettings=settings;
 // Reconcile only authenticated field-origin identities, never coincidental
 // matches of time, customer and amount (two real transactions can be identical).
 reconcileFieldDuplicates(out,local,remote,resolutions,conflicts,details,stats);
 if(conflicts.length)return {ok:false,conflicts,details,stats};
 // Preserve the desktop's pre-existing visible document number on a first sync.
 // Adjust only number labels, not immutable IDs or accounting amounts.
 for(const type of ['invoices','vouchers']){
  const used=new Map(),all=out[type],remoteKeys=new Set(remote[type].map(v=>recordKey(type,v)));
  const numberOf=v=>{const n=Number(v.number);return Number.isSafeInteger(n)&&n>0?n:null;};
  let next=Math.max(0,...all.map(v=>numberOf(v)||0));
  // prioritize remote (Windows) to avoid renumbering already printed desktop receipts
  const prioritized=all.slice().sort((x,y)=>Number(remoteKeys.has(recordKey(type,y)))-Number(remoteKeys.has(recordKey(type,x))));
  for(const item of prioritized){
   const number=numberOf(item);if(number===null)continue;
   const unique=String(number);
   if(!used.has(unique)){used.set(unique,item.id);continue;}
   if(used.get(unique)===item.id)continue;
   do{next++;}while(used.has(String(next)));
   item.originalNumber??=item.number;
   item.number=typeof item.number==='string'?String(next):next;
   item.numberAdjustedAt??='local-sync';
   used.set(String(next),item.id);
   stats.renumbered++;
  }
 }
 const stockIssues=negativeNewStock(local,remote,out);
 if(stockIssues.length)return {ok:false,conflicts:stockIssues,details:stockIssues.map((issue,i)=>({id:'inventory|'+i+'|'+issue,kind:'inventory',collection:'inventory',recordId:issue,signature:digest(issue),label:issue})),stats};
 return {ok:true,snapshot:out,stats,conflicts:[],details:[]};
}
function apply(state,data){
 ensureSnapshot(data);
 for(const k of BASE_COLLECTIONS)state[k]=clone(data[k]);
 for(const k of SETTINGS)if(Object.hasOwn(data.sharedSettings,k))state.settings[k]=clone(data.sharedSettings[k]);
 const field=state.fieldSync&&typeof state.fieldSync==='object'?state.fieldSync:{};
 for(const [name,dest] of [['fieldAgents','agents'],['fieldImported','imported'],['fieldEvents','events'],['fieldCashTransfers','cashTransfers'],['fieldOperationHistory','operationHistory'],['fieldRevisionAudit','revisionAudit']])
   if(Array.isArray(data[name]))field[dest]=clone(data[name]);
 const company=Array.isArray(data.fieldCompany)?data.fieldCompany[0]:null;
 if(company&&typeof company.companyId==='string'&&company.companyId)field.companyId=company.companyId;
 state.fieldSync=field;
}
return {COLLECTIONS,SETTINGS,snapshot,canonical,merge,apply,ensureSnapshot,itemStock,digest,fieldIdentity,fieldBusinessVersion,equivalentImported};
});
