/* 3.5.107 — local, type-aware notifications for authenticated manager catalog changes.
 * This does not trust LAN discovery results: only a completed, encrypted ACK can add messages.
 * Notifications are device-local and do not become accounting operations or sync outbox entries.
 */
(function(){'use strict';
if(typeof Agent==='undefined')return;
const A=Agent;
const snapshot=s=>({companyId:String(s?.companyId||''),exchangeRate:Number((s?.managerPublishedRate??s?.exchangeRate??0)),
  items:JSON.stringify(s?.items||[]),accounts:JSON.stringify(s?.accounts||[]),
  stock:JSON.stringify(s?.stock||{}),categories:JSON.stringify(s?.categories||[]),
  warehouseTransfers:JSON.stringify(s?.warehouseTransfers||[]),cashTransfers:JSON.stringify(s?.cashTransfers||[]),
  agentCash:JSON.stringify(s?.agentCash||null),accountLedgers:JSON.stringify(s?.accountLedgers||[]),
  permissions:JSON.stringify(s?.permissions||{}),pricing:String(s?.defaultPriceTier||''),
  company:JSON.stringify([s?.companyName,s?.companyPhone,s?.companyAddress,s?.footerNote])});
const route={rate:'settings',items:'stock',accounts:'accounts',stock:'stock',transfers:'stock',cash:'cashbox',ledgers:'accounts',permissions:'settings',pricing:'settings',company:'home',categories:'stock'};
function messages(before,after){
  const out=[];
  function add(field,title,detail){if(before[field]!==after[field])out.push({kind:field,title,detail,route:route[field]||'home'});}
  add('exchangeRate','تعديل سعر الصرف',`أصبح سعر الصرف المعتمد لدى المسؤول ${after.exchangeRate}`);
  add('items','تحديث المواد','أرسل المسؤول إضافة أو تعديلاً أو حذفاً في قائمة المواد');
  add('stock','تغيير أرصدة المستودع','وصل تحديث لكميات المواد في مستودع الموظف');
  add('accounts','تحديث حسابات العملاء','وصلت تغييرات على بيانات العملاء');
  add('warehouseTransfers','مناقلة مواد','وصلت حركة مناقلة جديدة أو تحديث على مناقلة');
  add('cashTransfers','حركة صندوق','وصلت دفعة نقدية أو تحديث على تحويلات الصندوق');
  add('agentCash','تحديث صندوق الموظف','وصلت بيانات جديدة عن رصيد الصندوق');
  add('accountLedgers','تحديث أرصدة الحسابات','وصلت حركات أو أرصدة محاسبية جديدة');
  add('permissions','تحديث الصلاحيات','غيّر المسؤول صلاحية واحدة أو أكثر');
  add('pricing','تحديث طريقة التسعير','غيّر المسؤول طريقة التسعير الافتراضية');
  add('categories','تحديث مجموعات المواد','وصل تحديث لمجموعات المواد');
  add('company','تحديث بيانات الشركة','وصل تعديل على بيانات الشركة من المسؤول');
  return out;
}
function noticeList(){return Array.isArray(A.state?.managerNotifications)?A.state.managerNotifications:[];}
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
  const before=snapshot(this.state),previousTime=String(this.state?.lastSyncAt||'');
  await original.call(this,raw);
  if(!String(this.lanSyncMessage||'').startsWith('✅')||!this.state||String(this.state.companyId)!==before.companyId)return;
  const after=snapshot(this.state);
  const incoming=messages(before,after);
  if(!incoming.length)return badge();
  const stamp=new Date().toISOString();
  const fresh=incoming.map((n,i)=>({...n,id:'manager-'+stamp+'-'+i,at:stamp,read:false}));
  const previous=noticeList();const all=[...fresh,...previous].slice(0,200);
  this.state.managerNotifications=all;
  try{await this.save();}catch(error){this.state.managerNotifications=previous;this.toast('تعذر حفظ إشعارات المسؤول: '+(error?.message||''));}
  badge();
};
function render(){const history=noticeList();return `<section class="ta-manager-notification-panel" dir="rtl"><h2>🔔 إشعارات المسؤول</h2>
 <p class="tiny">تظهر التحديثات التي استُلمت عبر مزامنة موثَّقة، ولا تؤثر على أرصدة أو عمليات الموظف.</p>
 ${history.length?history.map(n=>`<button type="button" class="ta-manager-notification ${n.read?'':'unread'}" onclick="Agent.openManagerNotification('${A.escape(n.id)}')"><strong>${A.escape(n.title)}</strong><small>${A.escape(n.detail)} · ${A.escape(n.at?.slice(0,16)||'')}</small></button>`).join(''):'<p class="muted">لا توجد تحديثات واردة حتى الآن</p>'}
 <button class="secondary" onclick="Agent.show('home')">العودة إلى الرئيسية</button></section>`;}
A.openManagerNotifications=async function(){
  if(!this.ready())return;
  this.screen='manager_notifications';
  const list=noticeList();if(list.some(n=>!n.read)){this.state.managerNotifications=list.map(n=>({...n,read:true}));try{await this.save();}catch(_){} }
  document.getElementById('screen').innerHTML=render();
  document.getElementById('bottom')?.classList.remove('hide');
  badge();
};
A.openManagerNotification=async function(id){
  const hit=noticeList().find(n=>n.id===id);if(!hit)return;
  const target=hit.route||'home';
  if(typeof this.navigate==='function'&&target!=='home')await this.navigate(target);
  else await this.show(target);
};
const savedShow=A.show.bind(A);
A.show=async function(...args){const result=await savedShow(...args);badge();return result;};
const oldBack=A.goBack?.bind(A);
if(oldBack)A.goBack=async function(...args){if(this.screen==='manager_notifications'){await this.show('home');return;}return oldBack(...args);};
document.addEventListener('DOMContentLoaded',badge);
})();
