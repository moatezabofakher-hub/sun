/* Tiqany peer ledger merge (shared, testable, deliberately independent of UI). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.TiqanyPeerMerge=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const COLLECTIONS=['categories','items','accounts','invoices','vouchers','warehouses','transfers','expenses'];
const SETTINGS=['companyName','companyPhone','companyAddress','exchangeRate','defaultCurrency','defaultItemCurrency','primaryCurrency','secondaryCurrency','primaryOnlyMode','defaultPriceTier','itemQuantityDecimals','inventoryValuationCurrency','allowNegativeStockSales'];
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
function sortDeep(x){if(Array.isArray(x))return x.map(sortDeep);if(x&&typeof x==='object'){const out={};for(const k of Object.keys(x).sort())out[k]=sortDeep(x[k]);return out;}return x;}
function canonical(x){return JSON.stringify(sortDeep(x));}
function snapshot(state){
 const result={};for(const name of COLLECTIONS)result[name]=clone(Array.isArray(state[name])?state[name]:[]);
 result.sharedSettings={};for(const k of SETTINGS)if(state.settings&&Object.prototype.hasOwnProperty.call(state.settings,k))result.sharedSettings[k]=clone(state.settings[k]);
 return result;
}
function ensureSnapshot(s){if(!s||typeof s!=='object'||Array.isArray(s))throw Error('نسخة مزامنة غير صالحة');for(const k of COLLECTIONS)if(!Array.isArray(s[k]))throw Error('سجل '+k+' غير صالح');if(!s.sharedSettings||typeof s.sharedSettings!=='object'||Array.isArray(s.sharedSettings))throw Error('إعدادات المزامنة غير صالحة');}
function recordKey(name,r){
 if(name==='categories'){if(typeof r!=='string')throw Error('اسم مجموعة غير صالح');return 'str:'+r;}
 if(!r||typeof r!=='object'||typeof r.id!=='string'||!r.id||r.id.length>200)throw Error('معرف سجل غير صالح في '+name);
 return 'id:'+r.id;
}
function keyed(name,records){const m=new Map();for(const r of records){const id=recordKey(name,r);if(m.has(id))throw Error('سجل مكرر داخلياً: '+name+' '+id);m.set(id,r);}return m;}
const same=(a,b)=>canonical(a)===canonical(b);
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
function merge(base,local,remote){
 ensureSnapshot(local);ensureSnapshot(remote);if(base)ensureSnapshot(base);
 const out={},conflicts=[],stats={added:0,updated:0,deleted:0,renumbered:0,settingsFromDesktop:0};
 for(const type of COLLECTIONS){
  const b=keyed(type,base?.[type]||[]),a=keyed(type,local[type]),r=keyed(type,remote[type]);
  const order=[...r.keys(),...a.keys().filter(k=>!r.has(k)),...b.keys().filter(k=>!r.has(k)&&!a.has(k))];
  const merged=[];
  for(const id of order){
   const B=b.get(id),A=a.get(id),R=r.get(id);
   let choice;
   if(same(A,R))choice=A;
   else if(same(A,B))choice=R;
   else if(same(R,B))choice=A;
   else {conflicts.push(`${type}: ${id.slice(0,75)}`);continue;}
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
  else conflicts.push('settings: '+key);
 }
 out.sharedSettings=settings;
 if(conflicts.length)return {ok:false,conflicts,stats};
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
 if(stockIssues.length)return {ok:false,conflicts:stockIssues,stats};
 return {ok:true,snapshot:out,stats,conflicts:[]};
}
function apply(state,data){ensureSnapshot(data);for(const k of COLLECTIONS)state[k]=clone(data[k]);for(const k of SETTINGS)if(Object.hasOwn(data.sharedSettings,k))state.settings[k]=clone(data.sharedSettings[k]);}
return {COLLECTIONS,SETTINGS,snapshot,canonical,merge,apply,ensureSnapshot,itemStock};
});
