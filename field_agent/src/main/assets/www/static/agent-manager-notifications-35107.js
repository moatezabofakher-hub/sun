/* 3.5.107 — local, type-aware notifications for authenticated manager catalog changes.
 * This does not trust LAN discovery results: only a completed, encrypted ACK can add messages.
 * Notifications are device-local and do not become accounting operations or sync outbox entries.
 */
(function(){'use strict';
if(typeof Agent==='undefined')return;
const A=Agent;
const snapshot=s=>({companyId:String(s?.companyId||''),exchangeRate:Number((s?.managerPublishedRate??s?.exchangeRate??0)),
  items:JSON.stringify(s?.items||[]),accounts:JSON.stringify(s?.accounts||[]),ops:JSON.stringify(s?.ops||[]),
  stock:JSON.stringify(s?.stock||{}),categories:JSON.stringify(s?.categories||[]),
  warehouseTransfers:JSON.stringify(s?.warehouseTransfers||[]),cashTransfers:JSON.stringify(s?.cashTransfers||[]),
  agentCash:JSON.stringify(s?.agentCash||null),accountLedgers:JSON.stringify(s?.accountLedgers||[]),
  permissions:JSON.stringify(s?.permissions||{}),pricing:String(s?.defaultPriceTier||''),
  company:JSON.stringify([s?.companyName,s?.companyPhone,s?.companyAddress,s?.footerNote])});
const route={rate:'settings',items:'stock',accounts:'accounts',stock:'stock',transfers:'stock',cash:'cashbox',ledgers:'accounts',permissions:'settings',pricing:'settings',company:'home',categories:'stock'};
const displayTime=stamp=>{
  const d=new Date(stamp);if(!Number.isFinite(d.getTime()))return String(stamp||'');
  const pad=n=>String(n).padStart(2,'0');
  return [pad(d.getDate()),pad(d.getMonth()+1),d.getFullYear()].join('/')+' '+[pad(d.getHours()),pad(d.getMinutes()),pad(d.getSeconds())].join('.');
};
function messages(before,after){
  const out=[];
  const add=(kind,title,detail,routeName,targetId,revisionValue)=>out.push({kind,title,detail:detail.slice(0,450),route:routeName||route[kind]||'home',targetId:targetId||null,
    revisionKey:versionHash(revisionValue??detail)});
  const parse=value=>{try{const data=JSON.parse(value||'[]');return Array.isArray(data)?data:[];}catch(_){return [];}};
  const desc=x=>{
    const detail=[x.name||x.title||x.category||'',x.number!=null?'رقم '+x.number:'',
       x.amount!=null?'المبلغ: '+x.amount+' '+(x.currency||''):'',
       x.quantity!=null?'الكمية: '+x.quantity:'',x.date?'التاريخ: '+x.date:'',x.note||''].filter(Boolean).join(' · ');
    return detail||'معرّف العملية: '+String(x.id||'').slice(0,90);
  };
  const compare=(field,title,where)=>{
    if(before[field]===after[field])return;
    const prev=parse(before[field]),next=parse(after[field]);
    const old=new Map(prev.map((v,i)=>[String(v?.id??v?.name??i),v]));
    const current=new Map(next.map((v,i)=>[String(v?.id??v?.name??i),v]));
    let changed=0;
    for(const id of new Set([...old.keys(),...current.keys()])){
      const a=old.get(id),b=current.get(id);if(JSON.stringify(a)===JSON.stringify(b))continue;
      changed++;
      if(changed<=25){const action=a===undefined?'إضافة':b===undefined?'حذف':'تعديل';
        add(field,action+' '+title,desc(b??a??{}),where,id,b??a);}
    }
    if(changed>25)add(field,'تحديث '+title,'وصلت '+(changed-25)+' تغييرات إضافية. افتح '+title+' لعرضها.',where,null,after[field]);
    if(changed===0)add(field,'تحديث '+title,'تغيّر محتوى '+title+'، راجع القائمة للاطلاع على التفاصيل.',where,null,after[field]);
  };
  if(before.exchangeRate!==after.exchangeRate)add('exchangeRate','تعديل سعر الصرف','سعر الصرف الجديد: '+after.exchangeRate,'settings');
  compare('items','المواد','stock');
  compare('accounts','حساب العميل','accounts');
  compare('warehouseTransfers','مناقلة المواد','stock');
  compare('cashTransfers','حركة الصندوق','cashbox');
  compare('accountLedgers','الحركة المحاسبية','accounts');
  compare('ops','عملية موظف البيع','ops');
  compare('categories','مجموعات المواد','stock');
  // Stock and cash summaries are consequences of the same operation; do not
  // send duplicate banners when the detailed transfer/invoice notice exists.
  const detailAlreadyAdded=out.some(n=>['ops','warehouseTransfers','cashTransfers','accountLedgers','items','accounts'].includes(n.kind));
  if(!detailAlreadyAdded&&before.stock!==after.stock)add('stock','تغيير أرصدة المستودع','وصل تعديل جديد على كميات المواد في مستودع الموظف','stock',null,after.stock);
  if(!detailAlreadyAdded&&before.agentCash!==after.agentCash)add('agentCash','تغيير رصيد صندوق الموظف','وصل تحديث في صندوق الموظف','cashbox',null,after.agentCash);
  if(before.permissions!==after.permissions)add('permissions','تعديل صلاحيات الموظف','غيّر المدير صلاحيات الوصول؛ راجع صفحة الضبط','settings',null,after.permissions);
  if(before.pricing!==after.pricing)add('pricing','تعديل التسعير','طريقة التسعير الجديدة: '+after.pricing,'settings');
  if(before.company!==after.company)add('company','تحديث بيانات الشركة','وصلت بيانات شركة معدّلة من المدير','home',null,after.company);
  return out;
}
function noticeList(){return Array.isArray(A.state?.managerNotifications)?A.state.managerNotifications:[];}
function versionHash(value){
 const raw=typeof value==='string'?value:JSON.stringify(value??null);
 let a=2166136261,b=0x9e3779b9;
 for(let i=0;i<raw.length;i++){a=Math.imul(a^raw.charCodeAt(i),16777619);b=Math.imul(b^raw.charCodeAt(i),2246822519);}
 return (a>>>0).toString(36)+'-'+(b>>>0).toString(36);
}
function noticeKey(item){
 // ID comes from kind + target record + content; re-delivery of an old version
 // after reconnect does not produce another alert, even across process restarts.
 const raw=JSON.stringify([item.kind,item.targetId,item.title,item.detail,item.revisionKey||'']);
 let h=2166136261,k=0x9e3779b9;
 for(let i=0;i<raw.length;i++){h=Math.imul(h^raw.charCodeAt(i),16777619);k=Math.imul(k^raw.charCodeAt(i),2246822519);}
 return 'manager:v2:'+(h>>>0).toString(36)+'-'+(k>>>0).toString(36);
}
function badge(){const el=document.getElementById('agentManagerNotifications');if(!el)return;
  const home=A.screen==='home'&&!!A.state?.companyId;
  el.hidden=!home;
  const count=document.getElementById('agentManagerNotificationCount');if(count){const total=noticeList().filter(n=>!n.read).length;count.hidden=!total;count.textContent=String(Math.min(99,total))+(total>99?'+':'');}
}
A.managerNotificationItems=noticeList;
A.managerNotificationDifferences=messages;
A.refreshManagerNotificationBadge=badge;
const original=A.onLocalSyncResult;
A.onLocalSyncResult=async function(raw){
  const before=snapshot(this.state);
  await original.call(this,raw);
  if(!String(this.lanSyncMessage||'').startsWith('✅')||!this.state||String(this.state.companyId)!==before.companyId)return;
  const after=snapshot(this.state);
  const incoming=messages(before,after);
  if(!incoming.length)return badge();
  const stamp=new Date().toISOString();
  const previous=noticeList();
  const seen=new Set(Array.isArray(this.state.managerNotificationSeenKeys)?this.state.managerNotificationSeenKeys:[]);
  // Upgrade existing histories without replaying notices from past connections.
  for(const entry of previous)seen.add(entry.eventKey||noticeKey(entry));
  const fresh=[];
  for(const n of incoming){const id=noticeKey(n);if(seen.has(id))continue;
    seen.add(id);fresh.push({...n,id,eventKey:id,at:stamp,read:false});}
  if(!fresh.length){this.state.managerNotificationSeenKeys=[...seen].slice(-10000);return badge();}
  const beforeSeen=this.state.managerNotificationSeenKeys;
  this.state.managerNotificationSeenKeys=[...seen].slice(-10000);
  const all=[...fresh,...previous].slice(0,200);
  this.state.managerNotifications=all;
  let persisted=false;
  try{await this.save();persisted=true;}catch(error){this.state.managerNotifications=previous;this.state.managerNotificationSeenKeys=beforeSeen;this.toast('تعذر حفظ إشعارات المسؤول: '+(error?.message||''));}
  // Deliver device notifications only for newly committed, authenticated sync updates.
  // Never claim an update arrived when synchronization or local persistence failed.
  if(persisted && typeof window!=='undefined' && window.AndroidManagerNotifications?.postUpdates){
    try{window.AndroidManagerNotifications.postUpdates(JSON.stringify(fresh.map(n=>({id:n.id,title:n.title,detail:(n.detail.slice(0,176)+' · وقت الوصول '+displayTime(n.at).split(' ').pop()).slice(0,240)}))));}catch(_){/* In-app notices remain available when system notifications are disabled. */}
  }
  badge();
};
function render(){const history=noticeList();return `<section class="ta-manager-notification-panel" dir="rtl"><h2>🔔 إشعارات المسؤول</h2>
 <p class="tiny">تظهر التحديثات التي استُلمت عبر مزامنة موثَّقة، ولا تؤثر على أرصدة أو عمليات الموظف.</p>
 ${history.length?history.map(n=>`<button type="button" class="ta-manager-notification ${n.read?'':'unread'}" onclick="Agent.openManagerNotification('${A.escape(n.id)}')"><strong>${A.escape(n.title)}</strong><small>${A.escape(n.detail)} · ${A.escape(displayTime(n.at))}</small></button>`).join(''):'<p class="muted">لا توجد تحديثات واردة حتى الآن</p>'}
 <button class="secondary" onclick="Agent.show('home')">العودة إلى الرئيسية</button></section>`;}
A.openManagerNotifications=async function(){
  if(!this.ready())return;
  this.screen='manager_notifications';
  document.getElementById('screen').innerHTML=render();
  document.getElementById('bottom')?.classList.remove('hide');
  badge();
};
A.openManagerNotification=async function(id){
  const hit=noticeList().find(n=>n.id===id);if(!hit)return;
  if(!hit.read){hit.read=true;try{await this.save();}catch(error){hit.read=false;this.toast('تعذر حفظ قراءة الإشعار');}}
  badge();
  this.screen='manager_notifications';
  document.getElementById('screen').innerHTML=`<section class="panel" dir="rtl"><h3>${A.escape(hit.title)}</h3>
    <p>${A.escape(hit.detail)}</p><p class="tiny">وقت الاستلام: ${A.escape(displayTime(hit.at))}</p>
    <button class="primary" onclick="Agent.openManagerNotificationRoute('${A.escape(hit.id)}')">الانتقال لعرض التفاصيل</button>
    ${hit.kind==='ops'&&hit.targetId&&this.can?.('editOperations')&&this.state.ops?.some(o=>o.id===hit.targetId&&['sale','sale_return','receipt','payment'].includes(o.kind))?`<button class="secondary" onclick="Agent.editManagerNotificationOperation('${A.escape(hit.id)}')">تعديل العملية (حسب الصلاحية)</button>`:''}
    <button class="secondary" onclick="Agent.openManagerNotifications()">الرجوع إلى الإشعارات</button></section>`;
};
A.editManagerNotificationOperation=async function(id){
  const hit=noticeList().find(x=>x.id===id);if(!hit||hit.kind!=='ops'||!hit.targetId)return;
  if(!this.can?.('editOperations'))return this.toast('ليس لديك صلاحية تعديل العمليات');
  const documentOp=(this.state.ops||[]).find(x=>x.id===hit.targetId&&x.agentId===this.state.agentId);
  if(!documentOp||!['sale','sale_return','receipt','payment'].includes(documentOp.kind))return this.toast('لا يمكن تعديل هذه العملية من هاتف الموظف');
  return this.editDocument(hit.targetId);
};
A.openManagerNotificationRoute=async function(id){
  const entry=noticeList().find(x=>x.id===id);if(!entry)return;
  // Manager-originated catalog and warehouse events are read-only on the
  // employee device. Never expose an edit action for another user's operation.
  const target=entry.route||'home';
  if(typeof this.navigate==='function'&&target!=='home')await this.navigate(target);
  else await this.show(target);
};
const savedShow=A.show.bind(A);
A.show=async function(...args){const result=await savedShow(...args);badge();return result;};
const oldBack=A.goBack?.bind(A);
if(oldBack)A.goBack=async function(...args){if(this.screen==='manager_notifications'){await this.show('home');return;}return oldBack(...args);};
document.addEventListener('DOMContentLoaded',badge);
})();
