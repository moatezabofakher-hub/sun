/* Tiqany peer ledger merge (shared, testable, deliberately independent of UI). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.TiqanyPeerMerge=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const BASE_COLLECTIONS=['categories','items','accounts','invoices','vouchers','warehouses','transfers','expenses','capitalMovements','fxTrades','shareholderOwners','shareholderMovements'];
// The field staff directory, pending imported IDs and cash hand-offs must travel with the ledger.
const STAFF_COLLECTIONS=['fieldAgents','fieldImported','fieldEvents','fieldCashTransfers','fieldOperationHistory','fieldRevisionAudit','fieldCompany'];
const COLLECTIONS=BASE_COLLECTIONS.concat(STAFF_COLLECTIONS);
const SETTINGS=['companyName','companyPhone','companyAddress','exchangeRate','defaultCurrency','defaultItemCurrency','primaryCurrency','secondaryCurrency','primaryOnlyMode','defaultPriceTier','itemQuantityDecimals','inventoryValuationCurrency','allowNegativeStockSales','companyLogo','footerNote','addedCurrencies','defaultInvoiceListType','defaultViewPeriod','defaultViewStart','defaultViewEnd','posAccountId','posPriceTier','posAutoNextOnFinish'];
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
// Business options are synced, but local device identity, pairing keys,
// activation and biometric bindings must never cross devices.
const deviceSettingKey=k=>['companyUid','appProtection','peerBootstrapSourceUid',
  'deviceId','btMacAddress','lastSyncEndpoint','localPrinterName','printerDeviceId'].includes(k)||
  /(?:privateKey|accessToken|refreshToken|pairingSecret|deviceToken)$/i.test(k);
const portableSecurity=cfg=>{
 const base=bootstrapProtection(cfg);
 return base?{...base,protectDeviceAddition:cfg?.protectDeviceAddition===true}:null;
};
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
 result.sharedSettings={};
 const cfg=state.settings||{};
 for(const [key,value] of Object.entries(cfg))
   if(!deviceSettingKey(key)&&key!=='__proto__'&&key!=='prototype'&&key!=='constructor'&&value!==undefined)
     result.sharedSettings[key]=clone(value);
 if(portableSecurity(cfg.appProtection))result.sharedSettings.managerSecurity=portableSecurity(cfg.appProtection);
 if(JSON.stringify(result.sharedSettings).length>350000)throw Error('إعدادات الشركة كبيرة جداً للمزامنة');

 return result;
}
function emptyLedger(s){
 if(!s||typeof s!=='object')return false;
 const arrays=['categories','items','accounts','invoices','vouchers','transfers','expenses','capitalMovements','fxTrades','shareholderOwners','shareholderMovements',
   'fieldAgents','fieldImported','fieldEvents','fieldCashTransfers','fieldOperationHistory','fieldRevisionAudit'];
 if(arrays.some(k=>Array.isArray(s[k])&&s[k].length>0))return false;
 // The template contains wh_main; additional warehouses imply an established company.
 if((s.warehouses||[]).some(w=>w?.id!=='wh_main'))return false;
 return !Array.isArray(s.fieldCompany)||s.fieldCompany.length===0;
}
// A company UID is not a password. The independently protected QR key authenticates the link.
// A populated ledger is NEVER joined by matching its visible company name.
function companyJoin(localUid,remoteUid,opts={}){
 const valid=v=>typeof v==='string'&&/^business_[a-f0-9]{32}$/.test(v);
 if(!valid(remoteUid)||!valid(localUid))return {allowed:false,reason:'هوية الشركة غير صالحة؛ يجب تحديث التطبيقين'};
 if(localUid===remoteUid)return {allowed:true,adopt:false};
 if(opts.existingVerifiedLink===true)return {allowed:true,adopt:true,legacy:true};
 // A never-provisioned Windows ledger can receive its identity FROM a populated
 // manager phone. This is not a general cross-company merge permission.
 if(opts.empty===true)return {allowed:true,adopt:true};
 if(opts.remoteEmpty===true)return {allowed:true,adopt:false,adoptRemote:true};
 return {allowed:false,reason:'رفض الربط: الهاتف والكمبيوتر يتبعان لشركتين مختلفتين، حتى لو تشابه الاسم. لن تُنقل أي بيانات.'};
}

// A first-use desktop receives only a portable password verifier, never a
// plaintext password, Android biometric token, activation code or device key.
function bootstrapProtection(cfg){
 if(!cfg||typeof cfg!=='object')return null;
 const algo=cfg.pinAlgo||'sha256-v1';
 if(!['sha256-v1','pbkdf2-sha256-v1'].includes(algo))return null;
 const validSalt=v=>typeof v==='string'&&/^[A-Za-z0-9+/]{22}==$/.test(v);
 const validHash=v=>typeof v==='string'&&/^[A-Za-z0-9+/]{43}=$/.test(v);
 if(!validSalt(cfg.pinSalt)||!validHash(cfg.pinHash))return null;
 const questions=Array.isArray(cfg.securityQuestions)?cfg.securityQuestions:[];
 const validQuestions=questions.length===2&&questions.every(q=>q&&typeof q.id==='string'&&/^[a-zA-Z0-9_-]{1,50}$/.test(q.id)&&validSalt(q.salt)&&validHash(q.hash));
 return {pinSalt:cfg.pinSalt,pinHash:cfg.pinHash,pinAlgo:algo,
   securityQuestions:validQuestions?questions.map(q=>({id:q.id,salt:q.salt,hash:q.hash})):[],
   recoveryFailures:0,recoveryLockedUntil:0,lockApp:true,protectDeletion:!!cfg.protectDeletion,
   fingerprintEnabled:false,fingerprintCredentialId:''};
}
function ensureSnapshot(s){if(!s||typeof s!=='object'||Array.isArray(s))throw Error('نسخة مزامنة غير صالحة');for(const k of BASE_COLLECTIONS)if(!Array.isArray(s[k])&&(!['capitalMovements','fxTrades','shareholderOwners','shareholderMovements'].includes(k)||s[k]!==undefined))throw Error('سجل '+k+' غير صالح');for(const k of STAFF_COLLECTIONS)if(s[k]!==undefined&&!Array.isArray(s[k]))throw Error('سجل موظفي البيع '+k+' غير صالح');if(!s.sharedSettings||typeof s.sharedSettings!=='object'||Array.isArray(s.sharedSettings))throw Error('إعدادات المزامنة غير صالحة');
 if(Object.keys(s.sharedSettings).length>500||JSON.stringify(s.sharedSettings).length>350000||
   Object.keys(s.sharedSettings).some(k=>deviceSettingKey(k)||['__proto__','prototype','constructor'].includes(k)))
   throw Error('إعدادات المزامنة تتضمن بيانات جهاز أو تتجاوز الحد المسموح');
 if(Object.hasOwn(s.sharedSettings,'managerSecurity')&&s.sharedSettings.managerSecurity&&!portableSecurity(s.sharedSettings.managerSecurity))
   throw Error('بيانات الحماية غير صالحة');}
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
function reconcileFieldDuplicates(out,local,remote,resolutions,history,conflicts,details,stats,resolved){
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
     const prior=historicalStatus(detail,history),approval=validPair?approvedChoice(detail,resolutions,prior.conflict?[]:history):null;
     if(approval){chosen=approval==='phone'?phone:computer;resolved.push(resolutionReceipt(detail,approval));}
     else if(prior.conflict){details.push(detail);conflicts.push(collection+': قرارات متناقضة لعملية الموظف '+origin);continue;}
     else if(equal)chosen=computer; // Prefer the already printed Windows document number.
     else{
       details.push(detail);
       conflicts.push(collection+': تطابق هوية عملية موظف مع اختلاف بياناتها '+origin);continue;
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
const MISSING={missing:true};
function sideDigest(d,side){return digest(d['has'+(side==='phone'?'Phone':'Computer')]?d[side]:MISSING);}
function resolutionReceipt(d,side,at=new Date().toISOString()){
 if(!d||!['phone','computer'].includes(side)||d.kind==='inventory')return null;
 return {id:d.id,kind:d.kind,collection:d.collection,recordId:d.recordId,signature:d.signature,chosen:side,
   acceptedDigest:sideDigest(d,side),rejectedDigest:sideDigest(d,side==='phone'?'computer':'phone'),at};
}
function validReceipt(r){return !!r&&typeof r==='object'&&!Array.isArray(r)&&
  typeof r.id==='string'&&r.id.length<=600&&typeof r.collection==='string'&&typeof r.recordId==='string'&&
  r.id===r.collection+'|'+r.recordId&&['record','settings','duplicate'].includes(r.kind)&&
  ['phone','computer'].includes(r.chosen)&&typeof r.acceptedDigest==='string'&&r.acceptedDigest.length<120&&
  typeof r.rejectedDigest==='string'&&r.rejectedDigest.length<120&&r.acceptedDigest!==r.rejectedDigest&&
  (r.linkId===undefined||(typeof r.linkId==='string'&&r.linkId.length<=280));}
function combineReceipts(...sets){
 const latest=new Map();
 for(const set of sets)if(Array.isArray(set))for(const r of set){
   if(!validReceipt(r))continue;
   // Deduplicate the same approved winner, keeping its full provenance and link scope.
   const key=JSON.stringify([r.linkId||'',r.id,r.kind,r.acceptedDigest,r.rejectedDigest]);
   const previous=latest.get(key);
   if(!previous||String(previous.at||'')<=String(r.at||''))latest.set(key,clone(r));
 }
 return [...latest.values()].sort((a,b)=>String(a.at||'').localeCompare(String(b.at||''))).slice(-2000);
}
function retireOppositeReceipts(history,explicitApprovals){
 const approvals=Array.isArray(explicitApprovals)?explicitApprovals.filter(validReceipt):[];
 if(!approvals.length)return combineReceipts(history);
 return combineReceipts((Array.isArray(history)?history:[]).filter(old=>!approvals.some(next=>
   old.id===next.id&&old.kind===next.kind&&
   (!old.linkId||!next.linkId||old.linkId===next.linkId)&&
   old.acceptedDigest===next.rejectedDigest&&old.rejectedDigest===next.acceptedDigest)));
}
function historicalStatus(detail,history){
 if(!Array.isArray(history)||!history.length)return {side:null,conflict:false};
 const phone=sideDigest(detail,'phone'),computer=sideDigest(detail,'computer');
 if(phone===computer)return {side:null,conflict:false};
 let side=null;
 for(const receipt of history){
  if(!validReceipt(receipt)||receipt.id!==detail.id||receipt.kind!==detail.kind)continue;
  let candidate=null;
  if(receipt.acceptedDigest===phone&&receipt.rejectedDigest===computer)candidate='phone';
  else if(receipt.acceptedDigest===computer&&receipt.rejectedDigest===phone)candidate='computer';
  if(candidate){if(side&&side!==candidate)return {side:null,conflict:true};side=candidate;}
 }
 return {side,conflict:false};
}
function historicalChoice(detail,history){return historicalStatus(detail,history).side;}
function isTombstoneReplay(detail,history){
 if(detail.kind!=='record'||!Array.isArray(history))return false;
 const oneMissing=detail.hasPhone!==detail.hasComputer;
 if(!oneMissing)return false;
 const other=sideDigest(detail,detail.hasPhone?'phone':'computer');
 return history.some(r=>validReceipt(r)&&r.kind==='record'&&r.id===detail.id&&
   r.acceptedDigest===digest(MISSING)&&r.rejectedDigest!==other);
}
function approvedChoice(details,resolutions,history){
 const d=resolutions&&resolutions[details.id];
 if(d&&d.signature===details.signature&&(d.side==='phone'||d.side==='computer'))return d.side;
 return historicalChoice(details,history);
}
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
function merge(base,local,remote,resolutions={},history=[]){
 ensureSnapshot(local);ensureSnapshot(remote);if(base)ensureSnapshot(base);
 const out={},conflicts=[],details=[],resolved=[],stats={added:0,updated:0,deleted:0,renumbered:0,deduplicated:0,settingsFromDesktop:0};
 for(const type of COLLECTIONS){
  const b=keyed(type,base?.[type]||[]),a=keyed(type,local[type]||[]),r=keyed(type,remote[type]||[]);
  const order=[...r.keys(),...a.keys().filter(k=>!r.has(k)),...b.keys().filter(k=>!r.has(k)&&!a.has(k))];
  const merged=[];
  for(const id of order){
   const B=b.get(id),A=a.get(id),R=r.get(id);
   let choice;
   if(same(A,R))choice=A;
   else{
    // Previously accepted versions win over stale merge bases and replayed old copies.
    // A genuinely edited version cannot match both receipt digests, so it still conflicts.
    const detail=makeConflict('record',type,id,B,A,R);
    const prior=historicalStatus(detail,history),historical=prior.side;
    if(historical){choice=historical==='phone'?A:R;resolved.push(resolutionReceipt(detail,historical));}
    else if(prior.conflict||isTombstoneReplay(detail,history)){
      details.push(detail);const side=approvedChoice(detail,resolutions,[]);
      if(side){choice=side==='phone'?A:R;resolved.push(resolutionReceipt(detail,side));}
      else{conflicts.push(type+': '+(prior.conflict?'قرارات سابقة متناقضة ':'نسخة جديدة بعد حذف محسوم ')+id.slice(0,75));continue;}
    }
    else if(equivalentImported(type,A,R))choice=R;
    else if(same(A,B))choice=R;
    else if(same(R,B))choice=A;
    else{
      details.push(detail);
      const side=approvedChoice(detail,resolutions,history);
      if(side){choice=side==='phone'?A:R;resolved.push(resolutionReceipt(detail,side));}
      else {conflicts.push(`${type}: ${id.slice(0,75)}`);continue;}
    }
   }
   if(choice!==undefined)merged.push(clone(choice));
   if(B===undefined&&choice!==undefined)stats.added++;
   else if(B!==undefined&&choice===undefined)stats.deleted++;
   else if(B!==undefined&&!same(B,choice))stats.updated++;
  }
  out[type]=merged;
 }
 const settings={};
 const stampMap={};
 const aStamps=local.sharedSettings._syncSettingTimes||{};
 const rStamps=remote.sharedSettings._syncSettingTimes||{};
 const bStamps=base?.sharedSettings?._syncSettingTimes||{};
 // Resolve settings as requested: the valid edit nearest to this synchronization
 // wins without a conflict record. Only non-settings financial operations can conflict.
 const syncTime=Date.parse(arguments.length>5&&arguments[5]?.syncAt||new Date().toISOString());
 const score=st=>{
   const t=Date.parse(st?.updatedAt||'');
   return Number.isFinite(t)&&t<=syncTime+30000?-Math.abs(syncTime-t):-Infinity;
 };
 const choose=(key,B,A,R)=>{
   if(A===undefined)return 'remote';
   if(R===undefined)return 'phone';
   // First authenticated link adopts the source device's company preferences.
   if(!base)return 'remote';
   if(same(A,R)){
     const as=score(aStamps[key]),rs=score(rStamps[key]);
     return as>=rs?'phone':'remote';
   }
   if(base&&same(A,B))return 'remote';
   if(base&&same(R,B))return 'phone';
   const as=score(aStamps[key]||A),rs=score(rStamps[key]||R);
   if(as!==rs)return as>rs?'phone':'remote';
   // Different owners with identical timestamps still converge across devices.
   const ak=String(aStamps[key]?.deviceId||A?.deviceId||'')+'|'+String(aStamps[key]?.updatedAt||'')+'|'+canonical(A);
   const rk=String(rStamps[key]?.deviceId||R?.deviceId||'')+'|'+String(rStamps[key]?.updatedAt||'')+'|'+canonical(R);
   return ak>=rk?'phone':'remote';
 };
 for(const key of new Set([...SETTINGS,...Object.keys(base?.sharedSettings||{}),
   ...Object.keys(local.sharedSettings||{}),...Object.keys(remote.sharedSettings||{})])){
   if(key==='_syncSettingTimes'||deviceSettingKey(key)||['__proto__','constructor','prototype'].includes(key))continue;
   const B=base?.sharedSettings?.[key],A=local.sharedSettings[key],R=remote.sharedSettings[key];
   const side=choose(key,B,A,R);
   const value=side==='phone'?A:R;
   if(value!==undefined)settings[key]=clone(value);
   if(side==='remote'&&!same(A,R))stats.settingsFromDesktop++;
   const sourceStamp=side==='phone'?aStamps[key]:rStamps[key];
   const fallbackStamp=side==='phone'?rStamps[key]:aStamps[key];
   if(sourceStamp||fallbackStamp||bStamps[key])stampMap[key]=clone(sourceStamp||fallbackStamp||bStamps[key]);
 }
 settings._syncSettingTimes=stampMap;
 out.sharedSettings=settings;
 const dist=settings.shareholderDistribution?.values;
 if(dist!==undefined){
   if(!dist||typeof dist!=='object'||Array.isArray(dist))throw Error('إعدادات نسب المساهمين غير صالحة');
   let total=0;
   for(const o of out.shareholderOwners||[]){
     const v=Number(dist[o.id]??0);if(!Number.isFinite(v)||v<0||v>100)throw Error('نسبة أرباح مساهم غير صالحة');
     total+=v;
   }
   if(total>100.0000001)throw Error('مجموع نسب أرباح المساهمين تجاوز 100% بعد المزامنة');
 }
 // Reconcile only authenticated field-origin identities, never coincidental
 // matches of time, customer and amount (two real transactions can be identical).
 reconcileFieldDuplicates(out,local,remote,resolutions,history,conflicts,details,stats,resolved);
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
 return {ok:true,snapshot:out,stats,conflicts:[],details:[],resolvedReceipts:combineReceipts(resolved)};
}
function apply(state,data){
 ensureSnapshot(data);
 for(const k of BASE_COLLECTIONS)state[k]=clone(Array.isArray(data[k])?data[k]:[]);
 for(const [k,v] of Object.entries(data.sharedSettings)){
   if(deviceSettingKey(k)||['__proto__','constructor','prototype'].includes(k)||k==='managerSecurity')continue;
   state.settings[k]=clone(v);
 }
 if(Object.hasOwn(data.sharedSettings,'managerSecurity')&&data.sharedSettings.managerSecurity){
   const cfg=portableSecurity(data.sharedSettings.managerSecurity);
   if(!cfg)throw Error('تم رفض إعدادات الحماية غير الصالحة');
   // Fingerprint enrollment is device-bound. Keep it when the portable PIN
   // verifier is unchanged; invalidate only when the remote PIN has changed.
   if(canonical(portableSecurity(state.settings?.appProtection))!==canonical(cfg))
     state.settings.appProtection={...cfg,fingerprintEnabled:false,fingerprintCredentialId:''};
 }
 const field=state.fieldSync&&typeof state.fieldSync==='object'?state.fieldSync:{};
 for(const [name,dest] of [['fieldAgents','agents'],['fieldImported','imported'],['fieldEvents','events'],['fieldCashTransfers','cashTransfers'],['fieldOperationHistory','operationHistory'],['fieldRevisionAudit','revisionAudit']])
   if(Array.isArray(data[name]))field[dest]=clone(data[name]);
 const company=Array.isArray(data.fieldCompany)?data.fieldCompany[0]:null;
 if(company&&typeof company.companyId==='string'&&company.companyId)field.companyId=company.companyId;
 state.fieldSync=field;
 if(typeof globalThis!=='undefined'&&globalThis.SettingsRevisionClock?.remember)globalThis.SettingsRevisionClock.remember(state.settings);
}
return {COLLECTIONS,SETTINGS,snapshot,canonical,merge,apply,emptyLedger,companyJoin,bootstrapProtection,ensureSnapshot,itemStock,digest,fieldIdentity,fieldBusinessVersion,equivalentImported,resolutionReceipt,validReceipt,combineReceipts,retireOppositeReceipts,historicalChoice};
});
