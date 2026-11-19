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

/* 3.5.47 — Per-company, offline notification history for authenticated agent imports
 * and stock depletion. All changes are saved WITH the ledger's IndexedDB transaction.
 * Existing synced operations are checkpointed at upgrade; replays cannot alert twice.
 */
const ManagerNotifications = {
  maxEntries: 3000,
  escape(value){return AppEscape.text(String(value??''));},
  formatTime(value){
    const date=new Date(value);
    if(!Number.isFinite(date.getTime()))return String(value||'');
    const two=n=>String(n).padStart(2,'0');
    return [two(date.getDate()),two(date.getMonth()+1),date.getFullYear()].join('/')+' '+[two(date.getHours()),two(date.getMinutes()),two(date.getSeconds())].join('.');
  },
  ensure(){
    if(!State.alertCenter || typeof State.alertCenter!=='object')State.alertCenter={entries:[],seenImportIds:null,stockLevels:null};
    const n=State.alertCenter;
    if(!Array.isArray(n.entries))n.entries=[];
    if(!Array.isArray(n.seenPeerEventKeys))n.seenPeerEventKeys=[];
    return n;
  },
  stockSnapshot(){
    const values={};
    if(typeof Accounting==='undefined'||!Accounting.getItemBaseStock)return values;
    for(const wh of State.warehouses||[]){
      if(!wh?.id)continue;
      for(const item of State.items||[]){
        if(!item?.id)continue;
        const qty=Number(Accounting.getItemBaseStock(item.id,null,wh.id));
        if(Number.isFinite(qty))values[wh.id+'::'+item.id]=qty;
      }
    }
    return values;
  },
  filterPeerEvents(entries){
    const n=this.ensure();const seen=new Set(n.seenPeerEventKeys);
    for(const entry of n.entries){if(entry?.eventKey)seen.add(entry.eventKey);}
    const fresh=[];
    for(const entry of entries||[]){
      const key=String(entry?.eventKey||entry?.id||'');
      if(!key||seen.has(key))continue;
      seen.add(key);fresh.push(entry);
    }
    n.seenPeerEventKeys=[...seen].slice(-20000);
    return fresh;
  },
  bootstrap(){
    const n=this.ensure(),already=State.fieldSync?.imported||[];
    // No historic alerts at the moment the new version is first installed.
    if(!Array.isArray(n.seenImportIds))n.seenImportIds=already.map(r=>r.id);
    if(!n.stockLevels||typeof n.stockLevels!=='object')n.stockLevels=this.stockSnapshot();
    this.updateBadge();
    this.openNativePending();
  },
  // The old authoritative document is stored with each accepted revision.
  // Never infer a change from the new document alone or from balances.
  changesForEdit(operation){
    if(operation?.kind!=='document_edit'||!operation.replacement)return [];
    const audit=(State.fieldSync?.revisionAudit||[]).find(x=>x.id===operation.id);
    const old=audit?.previousDocument;
    if(!old)return ['تم تعديل المستند؛ تفاصيل المقارنة التاريخية غير متوفرة'];
    const next=operation.replacement, changes=[];
    const n=v=>Number(v||0),different=(a,b)=>Math.abs(n(a)-n(b))>0.000001;
    const money=(v,c)=>n(v).toLocaleString('en-US',{maximumFractionDigits:4})+' '+String(c||next.currency||old.currency||'');
    const oldC=old.currency||next.currency,newC=next.currency||old.currency;
    const addAmount=(label,a,b)=>{if(different(a,b))changes.push('تم تغيير '+label+' من '+money(a,oldC)+' إلى '+money(b,newC));};
    const paymentMode=(total,paid)=>{
      if(n(paid)<=0.000001)return 'آجل';
      if(n(paid)+0.000001>=n(total))return 'نقدي';
      return 'دفعة جزئية';
    };
    if(['sale','sale_return'].includes(operation.originalKind)){
      addAmount('إجمالي الفاتورة',old.netTotal,next.netTotal);
      addAmount('المبلغ المسدد',old.paidAmount,next.paidAmount);
      const a=paymentMode(old.netTotal,old.paidAmount),b=paymentMode(next.netTotal,next.paidAmount);
      if(a!==b)changes.push('تم تحويل الدفع في الفاتورة من '+a+' إلى '+b);
      const rows=x=>(x||[]).map(row=>[String(row.itemId||''),n(row.qty),n(row.unitFactor||1),n(row.price??row.unitPrice)]);
      if(JSON.stringify(rows(old.rows))!==JSON.stringify(rows(next.rows)))changes.push('تم تعديل الأصناف أو الكميات أو أسعارها');
    }else if(['receipt','payment'].includes(operation.originalKind)){
      addAmount('مبلغ السند',old.accountAmount??old.amount,next.amount);
    }
    if(String(old.currency||'')!==String(next.currency||''))changes.push('تم تغيير العملة من '+old.currency+' إلى '+next.currency);
    if(String(old.accountId||'')!==String(next.accountId||''))changes.push('تم تغيير حساب الزبون');
    if(String(old.note||'')!==String(next.note||''))changes.push('تم تعديل البيان');
    if(String(old.date||'')!==String(next.date||''))changes.push('تم تغيير التاريخ');
    return changes.length?changes:['تم تعديل بيانات المستند دون تغيير مالي مسجل'];
  },
  alertForOperation(imported,operation){
    const kind=String(imported.kind||operation?.kind||'');
    const agentId=String(imported.agentId||operation?.agentId||'');
    const agent=State.fieldSync?.agents?.find(a=>a.id===agentId);
    const agentName=String(agent?.name||'موظف البيع');
    const ref=String(operation?.localNumber||operation?.replacement?.localNumber||imported.id);
    const edit=kind==='document_edit',deleted=kind==='document_delete'||kind==='delete';
    const docKind=edit||deleted?String(operation?.originalKind||operation?.replacement?.kind||''):kind;
    const isInvoice=['sale','sale_return'].includes(docKind);
    const isVoucher=['receipt','payment'].includes(docKind);
    const docLabel=docKind==='sale'?'فاتورة مبيعات':docKind==='sale_return'?'فاتورة مردود':docKind==='receipt'?'سند قبض':docKind==='payment'?'سند دفع':docKind==='expense'?'إيصال مصروف':docKind==='customer_create'?'حساب زبون':docKind==='currency_exchange'?'عملية تصريف عملة':'عملية';
    const verb=deleted?'حذف':edit?'تعديل':'إنشاء';
    const originalId=edit||deleted?operation?.targetOperationId:imported.id;
    const target=isInvoice?'invoice':isVoucher?'voucher':docKind==='expense'?'expense':docKind==='customer_create'?'customer':'operation';
    const targetId=target==='invoice'||target==='voucher'?'field_'+String(originalId||'')
      :target==='expense'?'field_'+String(originalId||'')
      :target==='customer'?String(operation?.account?.id||''):String(originalId||'');
    const title=`${verb} ${docLabel} بواسطة ${agentName}`;
    const changes=edit?this.changesForEdit(operation):[];
    const exchangeNote=docKind==='currency_exchange'&&operation
      ?' · − '+Number(operation.fromAmount||0)+' '+String(operation.fromCurrency||'')+' / + '+Number(operation.toAmount||0)+' '+String(operation.toCurrency||''):'';
    const detail=`${agentName} · ${docLabel} ${ref}${exchangeNote} · ${edit?changes.slice(0,4).join('؛ '):deleted?'تم إلغاؤها أو حذفها':'وصلت من تطبيق موظف البيع'}`;
    return {id:'agent:'+String(imported.id),type:'agent',action:verb,agentId,agentName,
      operationId:String(imported.id),target,targetId,docKind,title,detail,
      changes,revision:edit?Number(operation?.revision||0):null,
      at:String(imported.receivedAt||new Date().toISOString()),read:false};
  },
  prepareForSave(){
    const n=this.ensure(),created=[];
    if(!Array.isArray(n.seenImportIds)||!n.stockLevels){this.bootstrap();return created;}
    const seen=new Set(n.seenImportIds);
    for(const entry of n.entries)if(entry.type==='agent'&&entry.operationId)seen.add(entry.operationId);
    const history=State.fieldSync?.operationHistory||[];
    const opById=new Map(history.map(x=>[x.id,x]));
    // Save notifications only for new authenticated and posted imports, not every LAN ping.
    for(const row of State.fieldSync?.imported||[]){
      if(!row?.id||seen.has(row.id))continue;
      seen.add(row.id);
      const entry=this.alertForOperation(row,opById.get(row.id));
      // A malicious payload must not be able to create an external URL or navigation code.
      n.entries.unshift(entry);created.push(entry);
    }
    n.seenImportIds=[...seen];
    const current=this.stockSnapshot(),previous=n.stockLevels;
    for(const [key,qty] of Object.entries(current)){
      if(!(key in previous))continue;
      const was=Number(previous[key]);
      if(!(Number.isFinite(was)&&was>0.000001&&qty<=0.000001))continue;
      const sep=key.indexOf('::');if(sep<0)continue;
      const warehouseId=key.slice(0,sep),itemId=key.slice(sep+2);
      const warehouse=State.warehouses.find(w=>w.id===warehouseId),item=State.items.find(i=>i.id===itemId);
      if(!item||!warehouse)continue;
      const entry={id:'stock:'+Date.now()+':'+created.length+':'+encodeURIComponent(key),type:'stock',
        title:'نفدت كمية «'+item.name+'»',detail:'المستودع: '+warehouse.name+' · الرصيد الحالي: '+qty,
        itemId,warehouseId,at:new Date().toISOString(),read:false};
      n.entries.unshift(entry);created.push(entry);
    }
    n.stockLevels=current;
    if(n.entries.length>this.maxEntries)n.entries.length=this.maxEntries;
    return created;
  },
  async addSyncNotice(reason){
    const entry={id:'sync-stopped:'+Date.now()+':'+Math.random().toString(36).slice(2,8),type:'sync',
      title:'توقفت مزامنة المدير والكمبيوتر',detail:String(reason||'انقطع الاتصال').slice(0,240),
      at:new Date().toISOString(),read:false};
    const center=this.ensure();center.entries.unshift(entry);center.entries.length=Math.min(center.entries.length,this.maxEntries);
    try{await StorageEngine.saveState();this.saved([entry]);}
    catch(error){center.entries=center.entries.filter(e=>e.id!==entry.id);this.updateBadge();throw error;}
    return entry;
  },
  unread(){return this.ensure().entries.reduce((sum,x)=>sum+(x.read?0:1),0);},
  updateBadge(){
    const badge=document.getElementById('headerNotificationsCount');if(!badge)return;
    const count=this.unread();badge.hidden=!count;
    badge.textContent=count>99?'99+':String(count);
    const btn=document.getElementById('headerNotificationsBtn');
    if(btn)btn.setAttribute('aria-label',count?'الإشعارات: '+count+' غير مقروء':'الإشعارات');
  },
  render(main){
    UI.setHeader('<i class="fas fa-bell text-emerald-400"></i> <span>الإشعارات</span>','عمليات موظف البيع والمزامنة وتنبيهات المواد');
    const n=this.ensure(),list=n.entries;
    main.innerHTML=`<div class="space-y-3" dir="rtl">
      <div class="rounded-2xl bg-white border p-4 flex items-center justify-between gap-2">
        <div><h2 class="font-black">مركز الإشعارات</h2><p class="text-xs text-slate-500">${list.length} إشعار · ${this.unread()} غير مقروء</p></div>
        <button type="button" class="bg-slate-100 border rounded-xl px-3 py-2 text-xs font-bold" onclick="ManagerNotifications.readAll()">تحديد الكل كمقروء</button>
      </div>
      ${list.length?noticePages.render(list,entry=>`<button type="button" class="ta-alert-item ${entry.read?'':'unread'} ${entry.type==='stock'?'stock-alert':''}" onclick="ManagerNotifications.open(${JSON.stringify(entry.id).replace(/"/g,'&quot;')})">
        <div class="flex items-center gap-2 justify-between"><strong class="ta-alert-title text-sm"><span aria-hidden="true">${entry.type==='stock'?'⚠️':'🔔'}</span> ${this.escape(entry.title)}</strong>${entry.read?'':'<span class="ta-alert-badge rounded-full px-2 py-0.5">جديد</span>'}</div>
        <p class="ta-alert-detail text-xs mt-1">${this.escape(entry.detail)}</p>
        <p class="ta-alert-meta mt-2"><bdi dir="ltr">${this.escape(this.formatTime(entry.at))}</bdi> · اضغط لعرض المعاملة</p>
      </button>`):'<div class="rounded-2xl bg-white border p-8 text-center text-sm text-slate-500">لا توجد إشعارات بعد. ستظهر هنا العمليات الجديدة بعد المزامنة وتنبيهات نفاد المخزون.</div>'}
    </div>`;
  },
  async readAll(){
    const n=this.ensure(),before=n.entries.map(x=>x.read);
    n.entries.forEach(x=>x.read=true);this.updateBadge();
    try{await StorageEngine.saveState();if(AppNav.current().screen==='notifications')AppNav.renderCurrent();}
    catch(e){n.entries.forEach((x,i)=>x.read=before[i]);this.updateBadge();UI.toast('تعذر حفظ حالة الإشعارات','error');}
  },
  async open(id){
    const entry=this.ensure().entries.find(x=>x.id===id);if(!entry)return UI.toast('هذا الإشعار غير متوفر','warn');
    if(!entry.read){entry.read=true;this.updateBadge();try{await StorageEngine.saveState();}catch(e){entry.read=false;this.updateBadge();}}
    if(AppNav.current?.()?.screen==='notifications')AppNav.renderCurrent();
    if(window.WindowsPeerSync){return this.showDesktopDetails(entry);}
    if(entry.type==='sync'){
      UI.openModal(`<div dir="rtl" class="text-right space-y-3"><h3 class="font-black">${this.escape(entry.title)}</h3><p>${this.escape(entry.detail)}</p><button class="w-full p-3 rounded-xl bg-teal-700 text-white font-bold" onclick="UI.forceCloseModal();TiqanyPeerSync.openSettingsFromHeader()">فتح إعدادات المزامنة</button></div>`);return;
    }
    if(entry.type==='stock'){
      AppNav.navigate('reports',{tab:'inventory',warehouseId:entry.warehouseId});
      UI.toast('المادة: '+(State.items.find(x=>x.id===entry.itemId)?.name||entry.itemId),'warn');
      return;
    }
    if(entry.type==='peer-operation')return this.showOperationDetails(entry);
    if(entry.action!=='حذف' && entry.target==='invoice'&&State.invoices.some(x=>x.id===entry.targetId))
      return AppNav.navigate('invoice_print',{id:entry.targetId});
    if(entry.action!=='حذف' && entry.target==='voucher'&&State.vouchers.some(x=>x.id===entry.targetId))
      return AppNav.navigate('voucher_form',{id:entry.targetId});
    if(entry.action!=='حذف' && entry.target==='customer'&&State.accounts.some(x=>x.id===entry.targetId))
      return AppNav.navigate('account_statement',{id:entry.targetId,accountId:entry.targetId});
    // Expenses, deleted documents and other agent events open their exact audit
    // detail here even when no standalone editable form exists for that kind.
    const expense=entry.target==='expense'?(State.expenses||[]).find(x=>x.id===entry.targetId):null;
    const expenseInfo=expense?`<div class="rounded-xl bg-slate-50 p-3 text-sm"><b>نوع المصروف:</b> ${this.escape(expense.category||'أخرى')}<p><b>المبلغ:</b> ${this.escape(expense.amount)} ${this.escape(expense.currency)}</p><p><b>التاريخ:</b> ${this.escape(expense.date)}</p><p><b>البيان:</b> ${this.escape(expense.note||'—')}</p></div>`:'';
    UI.openModal(`<div dir="rtl" class="text-right space-y-3"><h3 class="font-black text-base">${this.escape(entry.title)}</h3><p class="text-sm">${this.escape(entry.detail)}</p>${expenseInfo}<p class="text-xs text-slate-500">${this.escape(this.formatTime(entry.at))}</p>
      ${entry.agentId?`<button type="button" class="w-full rounded-xl p-3 bg-teal-700 text-white font-bold" onclick="UI.forceCloseModal();AppNav.navigate('agent_activity',{agentId:${JSON.stringify(entry.agentId).replace(/"/g,'&quot;')},view:'${entry.target==='expense'?'expenses':'all'}',period:'all'})">عرض سجل معاملات موظف البيع</button>`:''}
      <button type="button" class="w-full rounded-xl p-3 bg-slate-100 font-bold" onclick="UI.forceCloseModal()">إغلاق</button></div>`);
  },
  showOperationDetails(entry){
    const lists={invoice:State.invoices,voucher:State.vouchers,expense:State.expenses,transfer:State.transfers,item:State.items,customer:State.accounts};
    const found=Array.isArray(lists[entry.target])&&lists[entry.target].some(x=>x.id===entry.targetId);
    const canOpen=entry.action!=='حذف'&&found;
    const ref=JSON.stringify(entry.id).replace(/"/g,'&quot;');
    UI.openModal(`<div dir="rtl" class="text-right space-y-3"><h3 class="font-black">${this.escape(entry.title)}</h3><p class="text-sm">${this.escape(entry.detail)}</p><p class="text-xs text-slate-500">وقت وصول الإشعار: ${this.escape(this.formatTime(entry.at))}</p>
      ${canOpen?`<button class="w-full p-3 rounded-xl bg-teal-700 text-white font-bold" onclick="ManagerNotifications.goToOperation(${ref})">عرض العملية</button>${['invoice','voucher','expense','transfer'].includes(entry.target)?`<button class="w-full p-3 rounded-xl bg-sky-700 text-white font-bold" onclick="ManagerNotifications.editOperation(${ref})">تعديل العملية</button>`:''}`:'<p class="text-xs text-amber-700">العملية محذوفة أو غير متوفرة للتعديل حاليًا</p>'}
      <button class="w-full p-3 rounded-xl bg-slate-100 font-bold" onclick="UI.forceCloseModal()">إغلاق</button></div>`);
  },
  editOperation(id){
    const entry=this.ensure().entries.find(e=>e.id===id);if(!entry||entry.action==='حذف')return;
    UI.forceCloseModal();
    if(entry.target==='invoice'&&State.invoices.some(x=>x.id===entry.targetId))return AppNav.navigate('invoice_form',{id:entry.targetId});
    if(entry.target==='voucher'&&State.vouchers.some(x=>x.id===entry.targetId))return AppNav.navigate('voucher_form',{id:entry.targetId});
    if(entry.target==='expense'&&State.expenses.some(x=>x.id===entry.targetId)){
      AppNav.navigate('expenses');return ExpenseController.editExpense(entry.targetId);
    }
    if(entry.target==='transfer'){
      AppNav.navigate('warehouses');
      if(typeof WarehouseController!=='undefined'&&WarehouseController.transferDocuments?.().some(d=>d.id===entry.targetId))return WarehouseController.editTransferBatch(entry.targetId);
      return UI.toast('افتح المناقلة المقصودة من قائمة المناقلات لتعديلها','info');
    }
    UI.toast('هذه العملية غير متوفرة للتعديل','warn');
  },
  showDesktopDetails(entry){
    const links={invoice:State.invoices,voucher:State.vouchers,customer:State.accounts,expense:State.expenses,item:State.items,transfer:State.transfers};
    const found=Array.isArray(links[entry.target])&&links[entry.target].some(x=>x.id===entry.targetId);
    const canOpen=entry.action!=='حذف'&&!!found;
    const operationLabel=entry.target==='invoice'?'فتح الفاتورة':entry.target==='voucher'?'فتح السند':entry.target==='customer'?'فتح حساب الزبون':'عرض التفاصيل';
    UI.openModal(`<div class="text-right space-y-3" dir="rtl"><h3 class="font-black">${this.escape(entry.title)}</h3><p class="text-sm">${this.escape(entry.detail)}</p><p class="text-xs text-slate-500">${this.escape(this.formatTime(entry.at))}</p>
      ${canOpen?`<button class="w-full p-3 rounded-xl bg-teal-700 text-white font-bold" onclick="ManagerNotifications.goToOperation(${JSON.stringify(entry.id).replace(/"/g,'&quot;')})">الانتقال إلى العملية — ${operationLabel}</button>${['invoice','voucher','expense'].includes(entry.target)?`<button class="w-full p-3 rounded-xl bg-sky-700 text-white font-bold" onclick="ManagerNotifications.editOperation(${JSON.stringify(entry.id).replace(/"/g,'&quot;')})">تعديل العملية</button>`:''}`:''}
      ${entry.type==='peer'&&!canOpen?'<button class="w-full p-3 rounded-xl bg-teal-700 text-white font-bold" onclick="UI.forceCloseModal();AppNav.navigate(\'invoices_list\')">عرض قائمة العمليات والفواتير</button>':''}
      ${entry.type==='sync'?'<button class="w-full p-3 rounded-xl bg-teal-700 text-white font-bold" onclick="UI.forceCloseModal();TiqanyPeerSync.openSettingsFromHeader()">فتح المزامنة لمعرفة الحالة</button>':''}
      ${!canOpen&&entry.agentId?`<button class="w-full p-3 rounded-xl bg-teal-700 text-white font-bold" onclick="UI.forceCloseModal();AppNav.navigate('agent_activity',{agentId:${JSON.stringify(entry.agentId).replace(/"/g,'&quot;')},view:'all',period:'all'})">عرض سجل عمليات الموظف</button>`:''}
      <button class="w-full p-3 rounded-xl bg-slate-100 font-bold" onclick="UI.forceCloseModal()">إغلاق</button></div>`);
  },
  goToOperation(id){
    const entry=this.ensure().entries.find(x=>x.id===id);if(!entry)return;
    UI.forceCloseModal();
    if(entry.target==='invoice'&&State.invoices.some(x=>x.id===entry.targetId))return AppNav.navigate('invoice_print',{id:entry.targetId});
    if(entry.target==='voucher'&&State.vouchers.some(x=>x.id===entry.targetId))return AppNav.navigate('voucher_form',{id:entry.targetId});
    if(entry.target==='customer'&&State.accounts.some(x=>x.id===entry.targetId))return AppNav.navigate('account_statement',{id:entry.targetId,accountId:entry.targetId});
    if(entry.target==='expense'&&State.expenses.some(x=>x.id===entry.targetId))return AppNav.navigate('expenses');
    if(entry.target==='transfer')return AppNav.navigate('warehouses');
    if(entry.target==='item')return AppNav.navigate('items');
    if(entry.type==='stock')return AppNav.navigate('reports',{tab:'inventory',warehouseId:entry.warehouseId});
    if(entry.agentId)return AppNav.navigate('agent_activity',{agentId:entry.agentId,view:entry.target==='expense'?'expenses':'all',period:'all'});
    UI.toast('العملية لم تعد موجودة. راجع سجل الموظف أو التفاصيل المسجلة.','warn');
  },
  openNativePending(){
    try{
      const id=window.AndroidAlerts?.consumePending?.();
      if(id){setTimeout(()=>this.open(id),0);}
    }catch(e){console.warn('Native notification click not available',e);}
  },
  saved(created){
    this.updateBadge();
    if(created.length && AppNav.current().screen==='notifications')AppNav.refreshAfterSync?.();
    for(const entry of created){
      try{window.AndroidAlerts?.show?.(entry.id,entry.title,(entry.detail.slice(0,180)+' · وقت الوصول '+this.formatTime(entry.at).split(' ').pop()).slice(0,240));}catch(e){console.warn('Android alert unavailable',e);}
    }
  }
};

// Native tap may arrive after WebView initialization or while it is already open.
window.__nativeAlertTap = function(id){try{window.AndroidAlerts?.consumePending?.();}catch(_){} ManagerNotifications.open(String(id));};

(function(){
  const saved=StorageEngine.saveState;
  StorageEngine.saveState=async function(...args){
    const prior=JSON.parse(JSON.stringify(ManagerNotifications.ensure()));
    const created=ManagerNotifications.prepareForSave();
    try{
      const result=await saved.apply(this,args);
      ManagerNotifications.saved(created);
      return result;
    }catch(e){
      State.alertCenter=prior;
      ManagerNotifications.updateBadge();
      throw e;
    }
  };
})();
