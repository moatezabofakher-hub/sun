/* 3.5.107 — local, type-aware notifications for authenticated manager catalog changes.
 * This does not trust LAN discovery results: only a completed, encrypted ACK can add messages.
 * Notifications are device-local and do not become accounting operations or sync outbox entries.
 */
(function(){'use strict';
if(typeof Agent==='undefined')return;
const A=Agent;
// Render only the current page of notices. Keep the native page scrollbar and deep links.
const noticePages = (() => {
  const pageSize = 10;
  let rows = [], card, shown = 0, lastTop = 0, touchY = null;
  function panel() { return document.querySelector?.('[data-notice-list]'); }
  function render(history, draw) {
    const continuing = panel();
    rows = history.slice().sort((a,b) => (Date.parse(b.at)||0) - (Date.parse(a.at)||0));
    card = draw;
    shown = Math.min(rows.length, continuing ? Math.max(shown,pageSize) : pageSize);
    if (!continuing) lastTop = 0;
    return '<div data-notice-list>' + rows.slice(0,shown).map(card).join('') + '</div>';
  }
  function scrollParent(list) {
    for (let p=list.parentElement; p && p!==document.body; p=p.parentElement) {
      if (/^(auto|scroll|overlay)$/.test(getComputedStyle(p).overflowY) && p.scrollHeight>p.clientHeight+1) return p;
    }
    return document.scrollingElement;
  }
  function next(event, scrolling) {
    if (shown >= rows.length) return;
    const list=panel();
    if (!list) return;
    const scroller=scrollParent(list);
    if (!scroller) return;
    const root=scroller===document.scrollingElement;
    if (scrolling && event.target!==scroller && !(root && event.target===document)) return;
    if (!scrolling && event.target?.nodeType===1 && event.target!==document.body &&
        event.target!==document.documentElement && !list.closest('main')?.contains(event.target)) return;
    const top=scroller.scrollTop;
    if (scrolling) { const down=top>lastTop; lastTop=top; if(!down)return; }
    const bottom=root?window.innerHeight:scroller.getBoundingClientRect().top+scroller.clientHeight;
    if (list.getBoundingClientRect().bottom > bottom+2) return;
    const end=Math.min(shown+pageSize, rows.length);
    list.insertAdjacentHTML('beforeend',rows.slice(shown,end).map(card).join(''));
    shown=end;
  }
  if (typeof document!=='undefined') {
    document.addEventListener?.('scroll',e=>next(e,true),{capture:true,passive:true});
    document.addEventListener?.('wheel',e=>{if(e.deltaY>0)next(e,false);},{passive:true});
    document.addEventListener?.('touchstart',e=>{touchY=e.touches[0]?.clientY;},{passive:true});
    document.addEventListener?.('touchmove',e=>{
      const y=e.touches[0]?.clientY;
      if(touchY!=null && y<touchY)next(e,false);
      touchY=y;
    },{passive:true});
    document.addEventListener?.('keydown',e=>{if(['End','PageDown','ArrowDown'].includes(e.key)) next(e,false);});
  }
  return {render};
})();

const permissionLabels={priceTier:'تعديل طريقة التسعير',currency:'تعديل العملة المعتمدة',balances:'معرفة أرصدة الحسابات',editPrices:'تعديل الأسعار ضمن الفاتورة',exchangeRate:'تعديل سعر الصرف العام للفواتير',fxSharedRate:'تعديل أسعار التصريف',stock:'مراقبة الجرد',createAccounts:'إضافة حسابات جديدة',createItems:'إضافة مواد جديدة',editOperations:'تعديل العمليات',deleteOperations:'حذف العمليات'};
const permissionDefaults={priceTier:true,currency:true,balances:true,editPrices:false,exchangeRate:false,fxSharedRate:false,stock:true,createAccounts:true,createItems:false,editOperations:true,deleteOperations:false};
const fieldLabels={sypBalance:'رصيد الليرة السورية',usdBalance:'رصيد الدولار',balances:'الأرصدة',paymentTerms:'شروط الدفع',type:'النوع',code:'الرمز',rate:'سعر الصرف',desc:'البيان',ref:'مرجع العملية',entries:'الحركات',complete:'اكتمال كشف الحساب',lines:'بنود المناقلة',direction:'الاتجاه',localNumber:'رقم المستند',unitPrice:'سعر الوحدة',unitFactor:'معامل الوحدة',fromWarehouseId:'المستودع المصدر',toWarehouseId:'المستودع المستلم',tradeSide:'نوع التصريف',priceTiers:'طرق التسعير',currencyBalances:'الأرصدة حسب العملة',name:'الاسم',title:'العنوان',phone:'الهاتف',address:'العنوان',email:'البريد',category:'المجموعة',barcode:'الباركود',number:'الرقم',date:'التاريخ',amount:'المبلغ',currency:'العملة',quantity:'الكمية',qty:'الكمية',stock:'رصيد المخزون',note:'البيان',units:'الوحدات',unit:'الوحدة',unitName:'الوحدة',factor:'معامل التحويل',price:'السعر',salePrice:'سعر البيع',wholesalePrice:'سعر الجملة',centerPrice:'سعر المركز',retailPrice:'سعر المستهلك',consumerPrice:'سعر المستهلك',purchasePrice:'سعر الشراء',priceTier:'طريقة التسعير',defaultPriceTier:'طريقة التسعير الافتراضية',currencyRatesSyp:'سعر صرف المعاملات',currencyExchangeRatesSyp:'سعر التصريف',allowedCurrencies:'العملات المفعلة',addedCurrencies:'العملات المضافة',buy:'سعر الشراء',sell:'سعر المبيع',companyName:'اسم الشركة',companyPhone:'هاتف الشركة',companyAddress:'عنوان الشركة',companyLogo:'شعار الشركة',footerNote:'تذييل الفاتورة',agentName:'اسم الموظف',vehicleName:'اسم السيارة',warehouseName:'المستودع',printerWidth:'عرض ورق الطابعة',printFontScale:'حجم خط الطباعة',itemQuantityDecimals:'المنازل العشرية للكمية',defaultSaleUnitName:'وحدة البيع الافتراضية',taPricingModes:'طرق التسعير',kind:'النوع',rows:'البنود',bundleComponents:'مكونات المادة',isBundle:'مادة تجميعية',discount:'الحسم',paidAmount:'المبلغ المسدد',netTotal:'الصافي',total:'الإجمالي',balance:'الرصيد',debit:'مدين',credit:'دائن',accountId:'الحساب',itemId:'المادة',warehouseId:'المستودع',fromAmount:'المبلغ المدفوع',toAmount:'المبلغ المستلم',fromCurrency:'العملة المدفوعة',toCurrency:'العملة المستلمة',photoData:'صورة المادة',syp:'ل.س',usd:'USD',otherCurrencies:'عملات أخرى',securityUpdate:'حماية حساب الموظف'};
const displayValue=v=>v==null||v===''?'غير محدد':typeof v==='boolean'?(v?'مفعّل':'غير مفعّل'):({wholesale:'سعر الجملة',center:'سعر المركز',consumer:'سعر المستهلك',retail:'سعر المستهلك',__first__:'أول وحدة'}[v]||String(v));
function fieldChanges(before,after,path='',names={}){
 if(before===after)return [];
 if(Array.isArray(before)||Array.isArray(after)){
   const old=Array.isArray(before)?before:[],next=Array.isArray(after)?after:[];
   if([...old,...next].every(v=>v==null||typeof v!=='object')){
     const a=old.map(displayValue).join('، '),b=next.map(displayValue).join('، ');
     return a===b?[]:[path+' من '+displayValue(a)+' إلى '+displayValue(b)];
   }
   const index=list=>Object.fromEntries(list.map((v,i)=>[v?.id||v?.itemId||v?.code||v?.name||String(i+1),v]));
   return fieldChanges(index(old),index(next),path,names);
 }
 if((before&&typeof before==='object')||(after&&typeof after==='object')){
   const a=before||{},b=after||{},lines=[];
   for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
     if(key==='id'||/^(updatedAt|syncedAt|revision|issuedAt)$/.test(key)||/password|secret|token|hash|salt|privateKey|publicKey|license|grant|^key$/i.test(key))continue;
     const caption=fieldLabels[key]||names[key]||b[key]?.name||a[key]?.name||key;
     const label=path?path+' · '+caption:String(caption);
     if(/photo|logo|image|securityUpdate/i.test(key)){
       if(a[key]!==b[key])lines.push(label+' · '+(!b[key]?'تمت الإزالة':!a[key]?'تمت الإضافة':'تم التغيير'));
     }else if((key==='itemId'||key==='accountId'||key==='defaultPriceTier')&&a[key]!==b[key]){
       lines.push(label+' من '+displayValue(names[a[key]]||a[key])+' إلى '+displayValue(names[b[key]]||b[key]));
     }else lines.push(...fieldChanges(a[key],b[key],label,names));
   }
   return lines;
 }
 return [path+' من '+displayValue(before)+' إلى '+displayValue(after)];
}
function settingsSnapshot(s){
 const config={};
 for(const key of ['companyName','companyPhone','companyAddress','footerNote','agentName','vehicleName','warehouseName','printerWidth','printFontScale','itemQuantityDecimals','defaultSaleUnitName','taPricingModes','allowedCurrencies','addedCurrencies','currencyRatesSyp','currencyExchangeRatesSyp'])config[key]=s?.[key];
 config.companyLogo=s?.companyLogo?versionHash(s.companyLogo):'';
 config.securityUpdate=s?.employeeAuth?versionHash(s.employeeAuth):'';
 return JSON.stringify(config);
}

const snapshot=s=>({companyId:String(s?.companyId||''),exchangeRate:Number((s?.managerPublishedRate??s?.exchangeRate??0)),
  items:JSON.stringify(s?.items||[]),accounts:JSON.stringify(s?.accounts||[]),ops:JSON.stringify(s?.ops||[]),
  stock:JSON.stringify(s?.stock||{}),categories:JSON.stringify(s?.categories||[]),
  warehouseTransfers:JSON.stringify(s?.warehouseTransfers||[]),cashTransfers:JSON.stringify(s?.cashTransfers||[]),
  agentCash:JSON.stringify(s?.agentCash||null),accountLedgers:JSON.stringify(s?.accountLedgers||[]),
  config:settingsSnapshot(s),permissions:JSON.stringify(s?.permissions||permissionDefaults),pricing:String(s?.defaultPriceTier||''),
  company:JSON.stringify([s?.companyName,s?.companyPhone,s?.companyAddress,s?.footerNote])});
const route={rate:'settings',items:'stock',accounts:'accounts',stock:'stock',transfers:'stock',cash:'cashbox',ledgers:'accounts',permissions:'settings',pricing:'settings',company:'home',categories:'stock'};
const displayTime=stamp=>{
  const d=new Date(stamp);if(!Number.isFinite(d.getTime()))return String(stamp||'');
  const pad=n=>String(n).padStart(2,'0');
  return [pad(d.getDate()),pad(d.getMonth()+1),d.getFullYear()].join('/')+' '+[pad(d.getHours()),pad(d.getMinutes()),pad(d.getSeconds())].join('.');
};
function messages(before,after){
  const out=[];
  const add=(kind,title,detail,routeName,targetId,revisionValue)=>out.push({kind,title,detail,route:routeName||route[kind]||'home',targetId:targetId||null,
    revisionKey:versionHash(revisionValue??detail)});
  const parse=value=>{try{const data=JSON.parse(value||'[]');return Array.isArray(data)?data:[];}catch(_){return [];}};
  const desc=x=>{
    const detail=[x.name||x.title||x.category||'',x.number!=null?'رقم '+x.number:'',
       x.amount!=null?'المبلغ: '+x.amount+' '+(x.currency||''):'',
       x.quantity!=null?'الكمية: '+x.quantity:'',x.date?'التاريخ: '+x.date:'',x.note||''].filter(Boolean).join(' · ');
    return detail||'معرّف العملية: '+String(x.id||'').slice(0,90);
  };
  const names=Object.fromEntries([...parse(before.items),...parse(after.items),...parse(before.accounts),...parse(after.accounts),...(JSON.parse(after.config||'{}').taPricingModes||[])].filter(x=>x?.id&&x.name).map(x=>[x.id,x.name]));
  const rights=JSON.parse(after.permissions);
  const visibleAccount=record=>{
    if(!record||rights.balances===true)return record;
    return Object.fromEntries(Object.entries(record).filter(([k])=>!/balance|debit|credit/i.test(k)));
  };
  const compare=(field,title,where)=>{
    if(field==='accountLedgers'&&rights.balances!==true)return;
    if(before[field]===after[field])return;
    const index=values=>new Map(values.map((v,i)=>[String(v?.id??v?.name??v?.accountId??(typeof v==='string'?v:i)),v]));
    const old=index(parse(before[field])),current=index(parse(after[field]));
    for(const id of new Set([...old.keys(),...current.keys()])){
      const a=old.get(id),b=current.get(id);
      if(JSON.stringify(a)===JSON.stringify(b))continue;
      const reference=b??a;
      const caption=reference?.name||reference?.localNumber||reference?.number||names[id]||id;
      if(b===undefined&&['accounts','accountLedgers'].includes(field)){
        add(field,'إزالة '+title+' من بيانات الموظف',String(caption)+' · لم يعد ضمن الحسابات المتاحة للموظف',where,id,caption);
        continue;
      }
      const delta=field==='accounts'?fieldChanges(visibleAccount(a),visibleAccount(b),'',names):fieldChanges(a,b,'',names);
      if(!delta.length&&a!==undefined&&b!==undefined)continue;
      const action=a===undefined?'إضافة':b===undefined?'حذف':'تعديل';
      add(field,action+' '+title+' · '+caption,delta.join('\n')||desc(reference),where,id,[a,b]);
    }
  };
  if(before.exchangeRate!==after.exchangeRate)add('exchangeRate','تعديل سعر الصرف','سعر الصرف من '+before.exchangeRate+' إلى '+after.exchangeRate+' ل.س','settings');
  compare('items','المواد','stock');
  compare('accounts','حساب العميل','accounts');
  compare('warehouseTransfers','مناقلة المواد','stock');
  compare('cashTransfers','حركة الصندوق','cashbox');
  compare('accountLedgers','الحركة المحاسبية','accounts');
  compare('ops','عملية موظف البيع','ops');
  compare('categories','مجموعات المواد','stock');
  // Stock and cash summaries are consequences of the same operation; do not
  // send duplicate banners when the detailed transfer/invoice notice exists.
  if(rights.stock===true && before.stock!==after.stock){
    const old=JSON.parse(before.stock),next=JSON.parse(after.stock);
    for(const id of new Set([...Object.keys(old),...Object.keys(next)])){
      const lines=fieldChanges(old[id],next[id],'رصيد '+(names[id]||id),names);
      if(!lines.length)continue;
      const item=out.find(n=>n.kind==='items'&&n.targetId===id);
      if(item)item.detail+='\n'+lines.join('\n');
      else add('stock','تغيير رصيد '+(names[id]||id),lines.join('\n'),'stock',id,[old[id],next[id]]);
    }
  }
  if(before.agentCash!==after.agentCash){
    const lines=fieldChanges(JSON.parse(before.agentCash),JSON.parse(after.agentCash),'رصيد الصندوق',names);
    if(lines.length)add('agentCash','تغيير رصيد صندوق الموظف',lines.join('\n'),'cashbox',null,[before.agentCash,after.agentCash]);
  }
  const prev=JSON.parse(before.permissions),next=JSON.parse(after.permissions);
  for(const [key,label] of Object.entries(permissionLabels)){
    if((prev[key]===true)===(next[key]===true))continue;
    const detail=label+' من '+(prev[key]?'مسموح':'غير مسموح')+' إلى '+(next[key]?'مسموح':'غير مسموح');
    add('permissions','تعديل صلاحية · '+label,detail,'settings',key,detail);
  }
  if(before.pricing!==after.pricing)add('pricing','تعديل طريقة التسعير','طريقة التسعير من '+displayValue(names[before.pricing]||before.pricing)+' إلى '+displayValue(names[after.pricing]||after.pricing),'settings');
  const oldSettings=JSON.parse(before.config||'{}'),newSettings=JSON.parse(after.config||'{}');
  for(const key of new Set([...Object.keys(oldSettings),...Object.keys(newSettings)])){
    const delta=fieldChanges({[key]:oldSettings[key]},{[key]:newSettings[key]},'',names);
    if(delta.length)add('company','تعديل '+(fieldLabels[key]||key),delta.join('\n'),'settings',key,delta);
  }
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
  el.hidden=false;
  el.disabled=!A.state?.companyId;
  const count=document.getElementById('agentManagerNotificationCount');if(count){const total=noticeList().filter(n=>!n.read).length;count.hidden=!A.state?.companyId;count.textContent=String(Math.min(99,total))+(total>99?'+':'');}
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
  // For large catalog changes keep the individual field differences together so every tap has a saved target.
  let notices=incoming;
  if(incoming.length>32){
    const groups=new Map();
    for(const n of incoming){
      if(!groups.has(n.kind))groups.set(n.kind,[]);
      groups.get(n.kind).push(n);
    }
    notices=[...groups.values()].map(group=>group.length===1?group[0]:{...group[0],
      targetId:null,title:group[0].title+' وتغييرات أخرى ('+group.length+')',
      detail:group.map(n=>n.title+'\n'+n.detail).join('\n\n')});
  }
  const fresh=notices.map((n,i)=>({...n,id:noticeKey(n)+':'+stamp+':'+i,at:stamp,read:false}));
  const all=[...fresh,...previous].slice(0,200);
  this.state.managerNotifications=all;
  let persisted=false;
  try{await this.save();persisted=true;}catch(error){this.state.managerNotifications=previous;this.toast('تعذر حفظ إشعارات المسؤول: '+(error?.message||''));}
  // Deliver device notifications only for newly committed, authenticated sync updates.
  // Never claim an update arrived when synchronization or local persistence failed.
  if(persisted && typeof window!=='undefined' && window.AndroidManagerNotifications?.postUpdates){
    try{
      for(let offset=0;offset<fresh.length;offset+=16){
        const batch=fresh.slice(offset,offset+16).map(n=>({id:n.id,title:n.title.slice(0,100),
          detail:n.detail.length<=240?n.detail:n.detail.slice(0,235)+' …'}));
        window.AndroidManagerNotifications.postUpdates(JSON.stringify(batch));
      }
    }catch(_){/* The saved in-app notice still contains every change. */}
  }
  badge();if(persisted && this.screen==='manager_notifications')await this.show(this.screen);
};
A.readAllManagerNotifications=async function(){
  if(this.readingAllNotices)return;
  const unread=noticeList().filter(n=>!n.read);
  if(!unread.length)return;
  this.readingAllNotices=true;
  unread.forEach(n=>n.read=true);badge();
  try{await this.save();}catch(error){unread.forEach(n=>n.read=false);this.toast('تعذر حفظ قراءة الإشعارات');}
  finally{this.readingAllNotices=false;badge();if(this.screen==='manager_notifications')await this.show(this.screen);}
};
A.renderManagerNotifications=function(){const history=noticeList();return `<section class="ta-manager-notification-panel" dir="rtl"><h2>🔔 إشعارات المسؤول</h2>
 <p class="tiny">${history.length} إشعار · ${history.filter(n=>!n.read).length} غير مقروء</p>
 <button type="button" class="secondary" onclick="Agent.readAllManagerNotifications()" ${history.some(n=>!n.read)?'':'disabled'}>تحديد الكل كمقروء</button>
 ${history.length?noticePages.render(history,n=>`<button type="button" class="ta-manager-notification ${n.read?'':'unread'}" onclick="Agent.openManagerNotification('${A.escape(n.id)}')"><strong>${A.escape(n.title)}</strong><small>${A.escape(n.detail)}</small><time dir="ltr">${A.escape(displayTime(n.at))}</time></button>`):'<p class="muted">لا توجد تحديثات واردة حتى الآن</p>'}
 <button class="secondary" onclick="Agent.goBack()">رجوع</button></section>`;};
A.openManagerNotifications=async function(){
  if(!this.ready())return;
  if(this.screen==='manager_notification_detail' && this.stack.at(-2)==='manager_notifications')return this.goBack();
  return this.navigate('manager_notifications');
};
A.openManagerNotification=async function(id){
  const hit=noticeList().find(n=>n.id===id);if(!hit)return;
  this.managerNotificationId=id;
  return this.navigate('manager_notification_detail');
};
A.renderManagerNotificationDetail=async function(){
  const hit=noticeList().find(n=>n.id===this.managerNotificationId);
  if(!hit)return this.renderManagerNotifications();
  if(!hit.read){hit.read=true;try{await this.save();}catch(error){hit.read=false;this.toast('تعذر حفظ قراءة الإشعار');}}
  badge();
  return `<section class="panel ta-manager-notification-panel ta-notification-detail" dir="rtl"><h3>${A.escape(hit.title)}</h3>
    <p style="white-space:pre-line">${A.escape(hit.detail)}</p><p class="tiny">وقت الاستلام: <bdi dir="ltr">${A.escape(displayTime(hit.at))}</bdi></p>
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
document.addEventListener('DOMContentLoaded',badge);
})();
