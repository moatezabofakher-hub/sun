/* 3.5.47 — Per-company, offline notification history for authenticated agent imports
 * and stock depletion. All changes are saved WITH the ledger's IndexedDB transaction.
 * Existing synced operations are checkpointed at upgrade; replays cannot alert twice.
 */
const ManagerNotifications = {
  maxEntries: 3000,
  escape(value){return AppEscape.text(String(value??''));},
  ensure(){
    if(!State.alertCenter || typeof State.alertCenter!=='object')State.alertCenter={entries:[],seenImportIds:null,stockLevels:null};
    const n=State.alertCenter;
    if(!Array.isArray(n.entries))n.entries=[];
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
  bootstrap(){
    const n=this.ensure(),already=State.fieldSync?.imported||[];
    // No historic alerts at the moment the new version is first installed.
    if(!Array.isArray(n.seenImportIds))n.seenImportIds=already.map(r=>r.id);
    if(!n.stockLevels||typeof n.stockLevels!=='object')n.stockLevels=this.stockSnapshot();
    this.updateBadge();
    this.openNativePending();
  },
  alertForOperation(imported,operation){
    const kind=String(imported.kind||operation?.kind||'');
    const agentId=String(imported.agentId||operation?.agentId||'');
    const agent=State.fieldSync?.agents?.find(a=>a.id===agentId);
    const agentName=String(agent?.name||'المندوب');
    const ref=String(operation?.localNumber||operation?.replacement?.localNumber||imported.id);
    const edit=kind==='document_edit',deleted=kind==='document_delete'||kind==='delete';
    const docKind=edit||deleted?String(operation?.originalKind||operation?.replacement?.kind||''):kind;
    const isInvoice=['sale','sale_return'].includes(docKind);
    const isVoucher=['receipt','payment'].includes(docKind);
    const docLabel=docKind==='sale'?'فاتورة مبيعات':docKind==='sale_return'?'فاتورة مردود':docKind==='receipt'?'سند قبض':docKind==='payment'?'سند دفع':docKind==='expense'?'إيصال مصروف':docKind==='customer_create'?'حساب زبون':'عملية';
    const verb=deleted?'حذف':edit?'تعديل':'إنشاء';
    const originalId=edit||deleted?operation?.targetOperationId:imported.id;
    const target=isInvoice?'invoice':isVoucher?'voucher':docKind==='expense'?'expense':docKind==='customer_create'?'customer':'operation';
    const targetId=target==='invoice'||target==='voucher'?'field_'+String(originalId||'')
      :target==='expense'?'field_'+String(originalId||'')
      :target==='customer'?String(operation?.account?.id||''):String(originalId||'');
    const title=`${verb} ${docLabel} بواسطة ${agentName}`;
    const detail=`${agentName} · ${docLabel} ${ref} · ${edit?'مراجعة رقم '+String(operation?.revision||''):deleted?'تم إلغاؤها أو حذفها':'وصلت من تطبيق المندوب'}`;
    return {id:'agent:'+String(imported.id),type:'agent',action:verb,agentId,agentName,
      operationId:String(imported.id),target,targetId,docKind,title,detail,
      at:String(imported.receivedAt||new Date().toISOString()),read:false};
  },
  prepareForSave(){
    const n=this.ensure(),created=[];
    if(!Array.isArray(n.seenImportIds)||!n.stockLevels){this.bootstrap();return created;}
    const seen=new Set(n.seenImportIds);
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
  unread(){return this.ensure().entries.reduce((sum,x)=>sum+(x.read?0:1),0);},
  updateBadge(){
    const badge=document.getElementById('headerNotificationsCount');if(!badge)return;
    const count=this.unread();badge.hidden=!count;
    badge.textContent=count>99?'99+':String(count);
    const btn=document.getElementById('headerNotificationsBtn');
    if(btn)btn.setAttribute('aria-label',count?'الإشعارات: '+count+' غير مقروء':'الإشعارات');
  },
  render(main){
    UI.setHeader('<i class="fas fa-bell text-emerald-400"></i> <span>الإشعارات</span>','عمليات المندوب ونفاد المواد من المستودعات');
    const n=this.ensure(),list=n.entries;
    main.innerHTML=`<div class="space-y-3" dir="rtl">
      <div class="rounded-2xl bg-white border p-4 flex items-center justify-between gap-2">
        <div><h2 class="font-black">مركز الإشعارات</h2><p class="text-xs text-slate-500">${list.length} إشعار · ${this.unread()} غير مقروء</p></div>
        <button type="button" class="bg-slate-100 border rounded-xl px-3 py-2 text-xs font-bold" onclick="ManagerNotifications.readAll()">تحديد الكل كمقروء</button>
      </div>
      ${list.length?list.map(entry=>`<button type="button" class="ta-alert-item ${entry.read?'':'unread'} ${entry.type==='stock'?'stock-alert':''}" onclick="ManagerNotifications.open(${JSON.stringify(entry.id).replace(/"/g,'&quot;')})">
        <div class="flex items-center gap-2 justify-between"><strong class="text-sm text-slate-800">${entry.type==='stock'?'⚠️':'🔔'} ${this.escape(entry.title)}</strong>${entry.read?'':'<span class="rounded-full bg-rose-500 text-white text-[10px] px-2 py-0.5">جديد</span>'}</div>
        <p class="text-xs text-slate-600 mt-1">${this.escape(entry.detail)}</p>
        <p class="text-[10px] text-slate-400 mt-2">${this.escape(String(entry.at||'').slice(0,19).replace('T',' '))} · اضغط لعرض المعاملة</p>
      </button>`).join(''):'<div class="rounded-2xl bg-white border p-8 text-center text-sm text-slate-500">لا توجد إشعارات بعد. ستظهر هنا العمليات الجديدة بعد المزامنة وتنبيهات نفاد المخزون.</div>'}
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
    if(entry.type==='stock'){
      AppNav.navigate('reports',{tab:'inventory',warehouseId:entry.warehouseId});
      UI.toast('المادة: '+(State.items.find(x=>x.id===entry.itemId)?.name||entry.itemId),'warn');
      return;
    }
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
    UI.openModal(`<div dir="rtl" class="text-right space-y-3"><h3 class="font-black text-base">${this.escape(entry.title)}</h3><p class="text-sm">${this.escape(entry.detail)}</p>${expenseInfo}<p class="text-xs text-slate-500">${this.escape(entry.at)}</p>
      ${entry.agentId?`<button type="button" class="w-full rounded-xl p-3 bg-teal-700 text-white font-bold" onclick="UI.forceCloseModal();AppNav.navigate('agent_activity',{agentId:${JSON.stringify(entry.agentId).replace(/"/g,'&quot;')},view:'${entry.target==='expense'?'expenses':'all'}',period:'all'})">عرض سجل معاملات المندوب</button>`:''}
      <button type="button" class="w-full rounded-xl p-3 bg-slate-100 font-bold" onclick="UI.forceCloseModal()">إغلاق</button></div>`);
  },
  openNativePending(){
    try{
      const id=window.AndroidAlerts?.consumePending?.();
      if(id){setTimeout(()=>this.open(id),0);}
    }catch(e){console.warn('Native notification click not available',e);}
  },
  saved(created){
    this.updateBadge();
    if(AppNav.current().screen==='notifications')AppNav.renderCurrent();
    for(const entry of created){
      try{window.AndroidAlerts?.show?.(entry.id,entry.title,entry.detail);}catch(e){console.warn('Android alert unavailable',e);}
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
