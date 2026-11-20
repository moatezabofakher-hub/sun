// Transport for the existing phone/Windows three-way ledger reconciliation.
(function(root) {
'use strict';
const PAGE = 64 * 1024;
const MAX_PAGES = 8192;
const invalid = message => { throw Error(message || 'بيانات دفعة المزامنة غير صالحة'); };
const digestPattern = /^[0-9a-f]{64}$/;
async function sha(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,'0')).join('');
}
function key(name, record) {
  const id = name === 'categories' ? record : record?.id;
  if (typeof id !== 'string' || !id) invalid('سجل مزامنة بلا معرّف');
  return id;
}
function records(name, rows) {
  const map = new Map();
  for (const row of rows || []) {
    const id = key(name,row);
    if (map.has(id)) invalid('معرّف مكرر في '+name);
    map.set(id,row);
  }
  return map;
}
async function fingerprint(core, snapshot) { return sha(core.canonical(snapshot)); }
async function pack(core, base, next, baseId) {
  const target = await fingerprint(core,next);
  if (!base) return {target, full:next};
  const patch = {};
  for (const name of core.COLLECTIONS) {
    const before = records(name,base[name]), after = records(name,next[name]);
    const removed = [], changed = [];
    for (const id of before.keys()) if (!after.has(id)) removed.push(id);
    for (const [id,row] of after) {
      if (!before.has(id) || core.canonical(before.get(id)) !== core.canonical(row)) changed.push(row);
    }
    const order = Array.from(after.keys());
    const predicted = Array.from(before.keys()).filter(id => after.has(id))
      .concat(order.filter(id => !before.has(id)));
    const reordered = order.some((id,i) => id !== predicted[i]);
    if (removed.length || changed.length || reordered) {
      patch[name] = {removed,changed};
      if (reordered) patch[name].order = order;
    }
  }
  const result = {base:baseId, target, patch};
  if (core.canonical(base.sharedSettings) !== core.canonical(next.sharedSettings)) result.settings = next.sharedSettings;
  return result;
}
async function unpack(core, base, knownHash, packet) {
  let next;
  if (packet?.full) next = packet.full;
  else {
    if (!base || !knownHash || packet?.base !== knownHash || !packet.patch) invalid('تغيّرت نقطة بداية المزامنة');
    next = {...base};
    for (const [name,change] of Object.entries(packet.patch)) {
      if (!core.COLLECTIONS.includes(name)) invalid();
      const map = records(name,base[name]);
      for (const id of change.removed) if (!map.delete(id)) invalid();
      for (const row of change.changed) map.set(key(name,row),row);
      if (change.order) {
        if (change.order.length !== map.size || new Set(change.order).size !== map.size) invalid();
        next[name] = change.order.map(id => map.get(id) ?? invalid());
      } else next[name] = Array.from(map.values());
    }
    if (Object.hasOwn(packet,'settings')) next.sharedSettings = packet.settings;
  }
  core.ensureSnapshot(next);
  if (await fingerprint(core,next) !== packet.target) invalid('لم تتطابق بصمة الدفتر بعد تجميع الدفعات');
  return next;
}
async function pages(value) {
  const raw = JSON.stringify(value), parts = [];
  for (let start=0; start<raw.length;) {
    let end = Math.min(start+PAGE, raw.length);
    if (end<raw.length && /[\uD800-\uDBFF]/.test(raw[end-1])) end--;
    parts.push(raw.slice(start,end)); start=end;
  }
  if (parts.length>MAX_PAGES) invalid('حجم النقل يتجاوز السعة المتاحة');
  return {parts, hashes:await Promise.all(parts.map(sha))};
}
function checkManifest(hashes) {
  if (!Array.isArray(hashes) || !hashes.length || hashes.length>MAX_PAGES ||
      hashes.some(h => typeof h !== 'string' || !digestPattern.test(h))) invalid();
}
function checkIndex(hashes,i) {
  if (!Number.isInteger(i) || i<0 || i>=hashes.length) invalid();
}
async function stage(store,scope,hashes,i,text) {
  checkIndex(hashes,i);
  if (typeof text!=='string' || text.length>PAGE || await sha(text)!==hashes[i]) invalid('دفعة ناقصة أو تالفة');
  await store.put(scope+':'+i,{hash:hashes[i],text});
}
async function readPages(store,scope,hashes,getMissing) {
  checkManifest(hashes);
  const parts=[];
  for (let i=0; i<hashes.length; i++) {
    const saved=await store.get(scope+':'+i);
    let text=saved?.text;
    if (saved?.hash!==hashes[i] || typeof text!=='string' || await sha(text)!==hashes[i]) {
      if (!getMissing) invalid('لم يكتمل نقل جميع الدفعات');
      text=await getMissing(i);
      await stage(store,scope,hashes,i,text);
    }
    parts.push(text);
  }
  return JSON.parse(parts.join(''));
}
function checked(result) {
  if (!result?.ok) throw Error(result?.error || 'انقطع اتصال المزامنة؛ ستُستأنف الدفعات المحفوظة');
  return result;
}
function makeStore() {
  return {
    async get(id) {return (await ProfileManager.getRecord(id))?.data;},
    async put(id,data) {await ProfileManager.putBatch([{id,data}]);},
    async clear(scope) {
      const tx=StorageEngine.db.transaction('app_state','readwrite'), prefix=scope+':';
      const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
      tx.objectStore('app_state').delete(IDBKeyRange.bound(prefix,prefix+'\uffff'));
      await done;
    }
  };
}
function channel(ids) {
  if (!ids.every(id=>typeof id==='string' && id.length && id.length<=200)) invalid('هوية جلسة المزامنة غير صالحة');
  return 'peer-stream-v2:'+JSON.stringify(ids);
}
function install(peer,env) {
  const {core,store,profile,send,reply,locked}=env;
  const recv=peer.handleRequest.bind(peer);
  const wire=async (step,data)=>checked(await send({action:'stream',step,...data}));
  let current, finishing=false, opening=false;
  async function legacy(request,data) {
    let answer;
    await recv({...request,data}, result=>{answer=result;});
    return checked(answer);
  }
  async function fetchRemote(request,baseRecord) {
    current=null;
    const manager=root.TiqanyManagerSync;
    const lastSeen=Math.max(manager?.lastClient||0,manager?.lastServer||0);
    const native=checked(await send({action:'probe',presenceCompany:request.phoneCompanyUid,
      managerPhoneLinked:lastSeen>0 && Date.now()-lastSeen<20000}));
    if(baseRecord?.snapshot && baseRecord.serverId!==native.serverId) invalid('الكمبيوتر الحالي يختلف عن الجهاز المقترن');
    if(native.streamVersion!==2) invalid('حدّث نسخة ويندوز لتفعيل المزامنة على دفعات');
    const localProfile=profile(), bound=baseRecord?.profileId===localProfile && baseRecord.serverId===native.serverId;
    const base=bound?baseRecord.snapshot:null;
    const baseHash=base ? await fingerprint(core,base) : '';
    const answer=await wire('open',{request,baseHash});
    if(profile()!==localProfile || answer.serverId!==native.serverId ||
       (bound && baseRecord.serverProfileId!==answer.profileId)) invalid('تغيّرت الشركة أو جهاز الكمبيوتر أثناء الربط');
    const auth={ticket:answer.ticket,serverId:answer.serverId,profileId:answer.profileId,
      phoneProfileId:localProfile,phoneCompanyUid:request.phoneCompanyUid};
    const scope=channel([auth.serverId,auth.profileId,auth.phoneProfileId,auth.phoneCompanyUid])+':download';
    const body=await readPages(store,scope,answer.hashes,async i=>(await wire('read',{...auth,i})).text);
    const snapshot=await unpack(core,base,baseHash,body.packet);
    if(profile()!==localProfile) invalid('تغيّرت الشركة أثناء المزامنة');
    current={auth,scope,snapshot,target:body.packet.target};
    return {...body.meta,ok:true,ticket:auth.ticket,serverId:auth.serverId,profileId:auth.profileId,snapshot};
  }
  async function commitRemote(message) {
    const session=current;
    if (!session || session.auth.ticket!==message.ticket || profile()!==session.auth.phoneProfileId) invalid('انتهت جلسة المزامنة');
    const {snapshot,provision,resolvedReceipts,explicitApprovals}=message;
    const packet=await pack(core,session.snapshot,snapshot,session.target);
    const upload=await pages({packet,provision,resolvedReceipts,explicitApprovals});
    const result=await wire('begin',{...session.auth,hashes:upload.hashes});
    for(const i of result.missing) {
      checkIndex(upload.hashes,i);
      await wire('write',{...session.auth,i,text:upload.parts[i]});
    }
    if (profile()!==session.auth.phoneProfileId) invalid('تغيّرت الشركة أثناء المزامنة');
    const ack=await wire('finish',session.auth);
    current=null;
    await store.clear(session.scope).catch(()=>{});
    return ack;
  }
  // Commit delegates to the original guarded accounting transaction only after all pages verify.
  async function handle(request) {
    const d=request.data;
    if(locked() || peer.busy || finishing || peer.blocked()) invalid('الكمبيوتر مشغول أو مقفل؛ أعد المحاولة بعد حفظ العملية');
    if(d.appVersion!=='3.5.156') invalid('حدّث تطبيقَي المدير قبل المزامنة');
    if(d.step==='open') {
      if(opening) invalid('جارٍ تجهيز جلسة مزامنة أخرى');
      opening=true;
      try {
        const q=d.request;
        if(q?.action!=='fetch') invalid();
        const opened=await legacy(request,{...q,action:'fetch',appVersion:d.appVersion});
        const {snapshot,ticket,serverId,profileId,...meta}=opened;
        const lock=peer.locks.get(ticket);
        if(!lock || profile()!==profileId) invalid();
        const scope=channel([serverId,profileId,q.phoneProfileId,q.phoneCompanyUid]);
        const baseKey=channel([serverId,profileId,q.phoneProfileId])+':base';
        const saved=d.baseHash && q.knownServerId===serverId && q.knownServerProfileId===profileId
          ? await store.get(baseKey):null;
        const base=saved?.company===lock.companyUid && saved?.hash===d.baseHash ? saved.snapshot:null;
        const packet=await pack(core,base,snapshot,base?d.baseHash:'');
        const batch=await pages({packet,meta});
        if(profile()!==profileId || peer.companyUid()!==lock.companyUid) invalid();
        // Keep only the newest transfer for the same pair; durable pages survive a fresh ticket.
        for(const [id,other] of peer.locks) if(id!==ticket && other.stream?.scope===scope) peer.locks.delete(id);
        lock.stream={scope,baseKey,parts:batch.parts,target:packet.target};
        lock.created=Date.now();
        return {ok:true,ticket,profileId,serverId,hashes:batch.hashes};
      } finally {opening=false;}
    }
    const link=channel([d.serverId,d.profileId,d.phoneProfileId]);
    if(d.step==='finish' && !peer.locks.has(d.ticket) && d.profileId===profile() && d.serverId===peer.server?.serverId) {
      const receipt=await store.get(link+':ack');
      if(receipt?.ticket===d.ticket && receipt.phoneCompany===d.phoneCompanyUid && receipt.company===peer.companyUid()) return receipt.result;
    }
    const lock=peer.locks.get(d.ticket), session=lock?.stream;
    if(!session || Date.now()-lock.created>600000 || profile()!==lock.profileId || d.profileId!==lock.profileId ||
       d.serverId!==peer.server?.serverId || d.phoneProfileId!==lock.phoneProfileId ||
       d.phoneCompanyUid!==lock.phoneCompanyUid || peer.companyUid()!==lock.companyUid) invalid('انتهت جلسة المزامنة؛ أعد الاتصال للاستئناف');
    lock.created=Date.now();
    peer.lastPhoneSeenAt=lock.created;
    const scope=session.scope+':upload';
    if(d.step==='read') {
      checkIndex(session.parts,d.i);return {ok:true,text:session.parts[d.i]};
    }
    if(d.step==='begin') {
      checkManifest(d.hashes);
      session.hashes=d.hashes;
      const missing=[];
      for(let i=0;i<d.hashes.length;i++) {
        const saved=await store.get(scope+':'+i);
        if(saved?.hash!==d.hashes[i] || typeof saved.text!=='string' || await sha(saved.text)!==d.hashes[i]) missing.push(i);
      }
      lock.created=Date.now();
      return {ok:true,missing};
    }
    if(!session.hashes) invalid();
    if(d.step==='write') {
      await stage(store,scope,session.hashes,d.i,d.text);return {ok:true};
    }
    if(d.step!=='finish') invalid();
    finishing=true;
    try {
      const body=await readPages(store,scope,session.hashes);
      const original=JSON.parse(lock.snapshot);
      const snapshot=await unpack(core,original,session.target,body.packet);
      if(profile()!==lock.profileId || peer.companyUid()!==lock.companyUid || locked() || peer.blocked()) invalid('تغيرت حالة دفتر الكمبيوتر أثناء النقل');
      lock.created=Date.now();
      const result=await legacy(request,{action:'commit',appVersion:d.appVersion,ticket:d.ticket,serverId:d.serverId,
        profileId:d.profileId,phoneCompanyUid:d.phoneCompanyUid,snapshot,provision:body.provision,
        resolvedReceipts:body.resolvedReceipts,explicitApprovals:body.explicitApprovals});
      // A missing baseline costs bandwidth on the next run. Ledger success is the durable application ACK.
      if(profile()===lock.profileId) {
        await store.put(link+':ack',{ticket:d.ticket,phoneCompany:d.phoneCompanyUid,company:peer.companyUid(),result});
        // The baseline is an optimization. Storage failure falls back to a full, paged comparison.
        await store.put(session.baseKey,{company:peer.companyUid(),hash:body.packet.target,snapshot}).catch(()=>{});
      }
      await store.clear(scope).catch(()=>{});
      return result;
    } finally {finishing=false;}
  }
  peer.call=(message,baseRecord)=>{
    if(message.action==='fetch') return fetchRemote(message,baseRecord);
    if(message.action==='commit') return commitRemote(message);
    return send(message);
  };
  peer.handleRequest=async request=>{
    if(request.data?.action!=='stream') {
      if(finishing && request.data?.action==='commit') return reply(request.requestId,{ok:false,code:'SYNC_BUSY',error:'المزامنة جارية'});
      return recv(request);
    }
    let result;
    try {result=await handle(request);} catch(error){result={ok:false,error:String(error.message||error)};}
    return reply(request.requestId,result);
  };
}
const api={install,pack,unpack,pages,fingerprint,readPages,stage,PAGE};
if(typeof module==='object' && module.exports) module.exports=api;
if(root.TiqanyPeerSync) install(root.TiqanyPeerSync,{
  core:root.TiqanyPeerMerge,store:makeStore(),profile:()=>ProfileManager.activeId,
  send:root.TiqanyPeerSync.call.bind(root.TiqanyPeerSync),
  reply:(id,value)=>root.WindowsPeerSync.reply(id,value),
  locked:()=>!!document.getElementById('appProtectionLock')
});
})(typeof window==='object'?window:globalThis);
