/* SAN SHINE 3.5.39 — Manager's representative hub.
 * Views derive exclusively from locally posted/synchronised records. No writes to
 * invoices, voucher ledger, or stock occur merely by opening these screens.
 */
const AgentHub = {
  esc(value){return AppEscape.text(String(value??''));},
  agents(){return Array.isArray(State.fieldSync?.agents)?State.fieldSync.agents:[];},
  agent(id){return this.agents().find(a=>a.id===id)||null;},
  choose(archived=false){
    const agents=this.agents().filter(a=>!!a.archived===!!archived);
    UI.openModal(`<div dir="rtl" class="text-right space-y-3">
      <h3 class="text-lg font-black">${archived?'الموظف المؤرشف':'اختيار موظف البيع'}</h3>
      <p class="text-xs text-slate-500">${archived?'اختر موظفاً مؤرشفاً لفتح صفحته وعرض سجلاته السابقة.':'اختر موظف البيع لعرض صندوقه ومستودعه وعملياته ومعلوماته.'}</p>
      ${agents.length?agents.map(a=>`<button type="button" class="w-full rounded-xl border p-3 flex items-center justify-between text-right ${a.archived?'bg-slate-100':'bg-white'}" onclick="AgentHub.select('${this.esc(a.id)}')"><span><strong class="text-sm">${this.esc(a.name)}</strong><small class="block text-xs text-slate-500">${this.esc(a.vehicleName||WarehouseController.name(a.warehouseId))}${a.archived?' · مؤرشف':''}</small></span><i class="fas fa-chevron-left"></i></button>`).join(''):`<p class="text-xs text-slate-500">${archived?'لا يوجد موظفون مؤرشفون':'لا يوجد موظفون نشطون'}</p>`}
      <button type="button" class="ta-report-deep-action w-full rounded-xl p-3 font-black" onclick="AgentHub.choose(${archived?'false':'true'})"><i class="fas ${archived?'fa-users':'fa-box-archive'} ml-2"></i>${archived?'العودة إلى الموظفين النشطين':'الموظف المؤرشف'}</button>
      <button type="button" class="w-full rounded-xl p-3 bg-slate-200 text-slate-900 font-bold" onclick="UI.forceCloseModal()">إغلاق</button></div>`);
  },
  select(id){if(!this.agent(id))return UI.toast('موظف البيع غير موجود','warn');UI.forceCloseModal();AppNav.navigate('agent_detail',{agentId:id});},
  openActivity(view,agentId){if(!this.agent(agentId))return UI.toast('موظف البيع غير موجود','warn');AppNav.navigate('agent_activity',{agentId,view,period:'all'});},
  transfer(agentId,direction){
    const a=this.agent(agentId);if(!a||a.archived||a.disabled)return UI.toast('موظف البيع غير متاح للمناقلة','warn');
    if(a.warehouseId==='wh_main'||!State.warehouses.some(w=>w.id===a.warehouseId))return UI.toast('يجب تخصيص مستودع مستقل لموظف البيع قبل المناقلة','warn');
    AppNav.navigate('warehouses',{action:'transfer',transferAgentId:a.id,transferDirection:direction});
  },
  activityRecords(a,view){
    const ops=[],add=(kind,ref,date,amount,detail,id)=>ops.push({kind,ref:String(ref||''),date:String(date||''),amount:String(amount||''),detail:String(detail||''),id:String(id||'')});
    if(['all','invoices'].includes(view))for(const x of (State.invoices||[]))if(x.fieldOrigin?.agentId===a.id)
      add('فاتورة',x.fieldOrigin.localNumber||x.number,x.date,Accounting.format(Number(x.netTotal||0),x.currency),x.type==='sale_return'?'مردود مبيعات':'مبيعات',x.id);
    if(['all','vouchers'].includes(view))for(const x of (State.vouchers||[]))if(x.fieldOrigin?.agentId===a.id)
      add(x.type==='receipt'?'سند قبض':'سند دفع',x.fieldOrigin.localNumber||x.number,x.date,Accounting.format(Number(x.amount||0),x.currency),x.note||'سند زبون',x.id);
    if(['all','expenses'].includes(view))for(const x of (State.expenses||[]))if(x.fieldOrigin?.agentId===a.id)
      add('مصروف',x.fieldOrigin.localNumber||x.id,x.date,Accounting.format(Number(x.amount||0),x.currency),(x.category||'أخرى')+' · '+(x.note||''),x.id);
    if(['all','transfers'].includes(view))for(const x of FieldCash.employeeWarehouseDocuments(a))
      add('مناقلة مواد',x.id,x.date,x.lines.length+' أصناف',x.fromName+' ← '+x.toName,x.id);
    if(view==='all')for(const x of (State.fieldSync?.cashTransfers||[]))if(x.agentId===a.id)
      add(x.direction==='toAgent'?'دفعة لموظف البيع':'دفعة من موظف البيع',x.id,x.date,Accounting.format(Number(x.amount||0),x.currency),x.note||'حركة نقدية',x.id);
    return ops.sort((x,y)=>y.date.localeCompare(x.date)||y.ref.localeCompare(x.ref));
  },
  render(main,params={}){
    const screen=AppNav.current().screen,a=this.agent(params.agentId);
    if(screen==='agent_hub')return this.renderLanding(main);
    if(!a){AppNav.navigate('agent_hub',{},true);return;}
    if(screen==='agent_detail')return this.renderDetail(main,a);
    return this.renderActivity(main,a,params);
  },
  renderLanding(main){
    UI.setHeader('<i class="fas fa-truck text-emerald-400"></i> <span>موظف البيع</span>','عرض المتصلين وإدارة المستودع والصندوق');
    main.innerHTML=`<div class="space-y-4" dir="rtl">
      <button type="button" class="ta-connected-employees-button w-full flex flex-col items-center justify-center gap-2" onclick="FieldSync.openConnectedEmployees()" aria-label="الموظفون المتصلون - عرض المتصلين الآن">
        <i class="fas fa-users text-3xl" aria-hidden="true"></i>
        <span>الموظفون المتصلون</span>
        <span class="text-sm font-bold" id="fieldConnectedCountInButton" aria-live="polite">(${FieldSync.connectedCount()})</span>
      </button>
      <button type="button" class="w-full rounded-2xl border border-emerald-200 bg-emerald-700 text-white p-6 flex flex-col items-center gap-3 font-black" onclick="AgentHub.choose()"><i class="fas fa-users text-3xl"></i><span>اختيار موظف البيع</span><span class="text-xs font-medium opacity-90">${this.agents().filter(a=>!a.archived).length} موظف بيع فعّال</span></button>
      <button type="button" class="ta-agent-hub-manage w-full rounded-2xl p-4 font-extrabold" onclick="AppNav.navigate('payroll')"><i class="fas fa-money-bill-wave ml-2" aria-hidden="true"></i>أجور الموظفين</button>
      <div class="pt-2"><button type="button" class="ta-agent-hub-manage w-full rounded-2xl p-4 font-extrabold" onclick="FieldSync.open()"><i class="fas fa-users ml-2 text-lg" aria-hidden="true"></i>إدارة موظفي البيع والمزامنة المحلية</button></div>
    </div>`;
    FieldSync.refreshConnectedBadge();
  },
  renderDetail(main,a){
    UI.setHeader('<i class="fas fa-truck text-emerald-400"></i> <span>'+this.esc(a.name)+'</span>','عمليات موظف البيع ومستودعه وصندوقه');
    const id=this.esc(a.id),stockName=WarehouseController.name(a.warehouseId);
    const icon=(name,label,code,tone='bg-white')=>`<button type="button" class="${tone} border rounded-2xl p-4 min-h-24 flex flex-col items-center justify-center gap-2 text-center shadow-sm" onclick="${code}"><i class="fas fa-${name} text-xl text-teal-700"></i><span class="font-extrabold text-xs">${label}</span></button>`;
    main.innerHTML=`<div dir="rtl" class="space-y-3">
      <div class="bg-white rounded-2xl border p-4"><div class="flex items-center justify-between"><div><h2 class="text-base font-black">${this.esc(a.name)}</h2><p class="text-xs text-slate-500 mt-1">${this.esc(a.vehicleName||'')} · ${this.esc(stockName)}</p></div><button type="button" onclick="AgentHub.choose()" class="rounded-xl bg-slate-100 px-3 py-2 text-xs font-extrabold"><i class="fas fa-users ml-1"></i>تغيير موظف البيع</button></div>${a.archived?'<div class="mt-3 text-xs text-rose-700 font-bold">موظف بيع مؤرشف — يمكن عرض السجلات فقط.</div>':''}</div>
      <div class="grid grid-cols-2 gap-2">
        ${icon('truck-ramp-box','مناقلة إلى مستودعه',`AgentHub.transfer('${id}','toAgent')`,'bg-sky-50')}
        ${icon('truck','مناقلة من مستودعه',`AgentHub.transfer('${id}','fromAgent')`,'bg-sky-50')}
        ${icon('hand-holding-dollar','استلام دفعة من موظف البيع',`FieldCash.openTransfer('fromAgent','${id}')`,'bg-emerald-50')}
        ${icon('money-bill-transfer','إعطاء دفعة لموظف البيع',`FieldCash.openTransfer('toAgent','${id}')`,'bg-emerald-50')}
        ${icon('money-bill-transfer','الصندوق والحركات',`AgentHub.openActivity('cash','${id}')`,'bg-teal-50')}
        ${icon('file-contract','جميع العمليات',`AgentHub.openActivity('all','${id}')`)}
        ${icon('file-invoice','فواتير موظف البيع',`AgentHub.openActivity('invoices','${id}')`)}
        ${icon('receipt','سندات موظف البيع',`AgentHub.openActivity('vouchers','${id}')`)}
        ${icon('money-bill-wave','مصاريف موظف البيع',`AgentHub.openActivity('expenses','${id}')`)}
        ${icon('boxes-stacked','فواتير المناقلة',`AgentHub.openActivity('transfers','${id}')`)}
        ${icon('box-open','جرد مستودع موظف البيع',`AgentHub.openActivity('stock','${id}')`)}
        ${icon('pen-to-square','تعديل موظف البيع',`FieldSync.showEditAgent('${id}')`)}
        ${icon('rotate-right','المزامنة والملفات',`FieldSync.showSyncTools()`)}
        ${!a.archived?icon('trash','حذف موظف البيع',`FieldSync.confirmRemoveAgent('${id}')`):''}
      </div>
      <p class="text-[11px] text-slate-500">الحركات المعروضة هي البيانات التي وصلت إلى التطبيق الرئيسي بالمزامنة. لا تظهر العمليات غير المرسلة بعد من هاتف موظف البيع.</p>
    </div>`;
  },
  // A manager action operates on the synchronized invoice record, never on a detached copy.
  editInvoice(id){
    const inv=(State.invoices||[]).find(row=>row.id===id);
    if(!inv || !inv.fieldOrigin?.agentId)return UI.toast('الفاتورة غير موجودة','warn');
    const member=this.agent(inv.fieldOrigin.agentId);
    if(member?.archived)return UI.toast('فواتير الموظف المؤرشف للعرض والطباعة فقط','warn');
    AppNav.navigate('invoice_form',{id:inv.id});
  },
  printInvoice(id){
    const inv=(State.invoices||[]).find(row=>row.id===id);
    if(!inv || !inv.fieldOrigin?.agentId)return UI.toast('الفاتورة غير موجودة','warn');
    return ThermalPrinter.printInvoiceDirect(inv);
  },
  previewInvoice(id){
    const inv=(State.invoices||[]).find(row=>row.id===id);
    if(!inv || !inv.fieldOrigin?.agentId)return UI.toast('الفاتورة غير موجودة','warn');
    return AppNav.navigate('invoice_print',{id:inv.id});
  },
  invoiceCards(a,mode,start,end){
    const docs=(State.invoices||[]).filter(inv=>inv.fieldOrigin?.agentId===a.id && TimeFilter.matches(inv.date||'',mode,start,end)).sort((x,y)=>String(y.date||'').localeCompare(String(x.date||'')));
    const actionId=(id)=>this.esc(JSON.stringify(String(id)));
    const cards=docs.slice(0,400).map(inv=>{
      const account=(State.accounts||[]).find(acc=>acc.id===inv.accountId);
      const customerName=account?.name||inv.partyName||inv.customerName||inv.accountName||'عميل نقدي مباشر';
      const phone=account?.phone||inv.customerPhone||'';
      const address=account?.address||inv.customerAddress||'';
      const count=(inv.rows||[]).length;
      const iid=actionId(inv.id);
      const edit=a.archived?`<span class="rounded-xl bg-slate-100 text-slate-500 px-3 py-2.5 font-bold" title="فواتير الموظف المؤرشف للعرض فقط">تعديل غير متاح</span>`:`<button type="button" onclick="AgentHub.editInvoice(${iid})" class="rounded-xl bg-blue-700 hover:bg-blue-800 text-white px-3 py-2.5 font-black" style="background:linear-gradient(135deg,#1d4ed8,#1e40af)!important;color:white!important;border:1px solid #1d4ed8"><i class="fas fa-pen ml-1"></i>تعديل</button>`;
      return `<article class="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm space-y-2.5 text-xs">
        <div class="flex justify-between gap-2 flex-wrap"><strong class="text-slate-900"><span>فاتورة</span> #${this.esc(inv.fieldOrigin?.localNumber||inv.number||inv.id)}</strong><span class="text-slate-500">${this.esc(String(inv.date||'').slice(0,16).replace('T',' '))}</span></div>
        <div class="rounded-xl bg-sky-50 border border-sky-100 p-3 space-y-1.5">
           <div class="font-extrabold text-sky-950"><i class="fas fa-user ml-1"></i><span>العميل:</span> <b>${this.esc(customerName)}</b></div>
           ${phone?`<div><i class="fas fa-phone ml-1"></i><span>الهاتف:</span> <b dir="ltr">${this.esc(phone)}</b></div>`:''}
           ${address?`<div><i class="fas fa-location-dot ml-1"></i><span>العنوان:</span> <b>${this.esc(address)}</b></div>`:''}
           <div class="text-slate-600"><span>الأصناف:</span> <b>${count}</b> · <span>${this.esc(inv.paymentMethod==='cash'?'نقدي':inv.paymentMethod==='credit'?'آجل':'دفع جزئي')}</span></div>
        </div>
        <div class="flex items-center justify-between gap-2 font-extrabold"><span><span>الصافي:</span> <b>${this.esc(Accounting.format(Number(inv.netTotal||0),inv.currency||'SYP'))}</b></span><span class="text-slate-500"><span>${this.esc(inv.type==='sale_return'?'مردود مبيعات':'مبيعات')}</span></span></div>
        <div class="flex gap-2 flex-wrap pt-1 border-t border-slate-100">
           <button type="button" onclick="AgentHub.previewInvoice(${iid})" class="rounded-xl bg-slate-100 text-slate-800 px-3 py-2.5 font-bold"><i class="fas fa-eye ml-1"></i>عرض</button>
           ${edit}
           <button type="button" onclick="AgentHub.printInvoice(${iid})" class="rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-2.5 font-black"><i class="fas fa-print ml-1"></i>طباعة</button>
        </div>
      </article>`;
    }).join('');
    const extra=docs.length>400?`<div class="rounded-xl bg-amber-50 text-amber-900 p-3 text-xs">تُعرض أول 400 فاتورة فقط. استخدم مرشح التاريخ لتضييق النتائج.</div>`:'';
    return `<div class="text-xs text-slate-600 font-bold px-1"><span>عدد الفواتير:</span> <b>${docs.length}</b></div>${cards||'<div class="p-5 bg-white border rounded-xl text-center text-slate-500 text-xs">لا توجد فواتير في الفترة المحددة.</div>'}${extra}`;
  },
  changePeriod(agentId,view,period,start,end){
    AppNav.navigate('agent_activity',{agentId,view,period,date:start,end},true);
  },
  renderActivity(main,a,params){
    const id=this.esc(a.id),mode=TimeFilter.mode(params.period||'all'),view=['cash','stock','all','invoices','vouchers','expenses','transfers'].includes(params.view)?params.view:'all';
    const start=params.date||TimeFilter.localDate(),end=params.end||start;
    const titles={cash:'الصندوق والحركات',stock:'جرد مستودع موظف البيع',all:'كل عمليات موظف البيع',invoices:'فواتير موظف البيع',vouchers:'سندات موظف البيع',expenses:'مصاريف موظف البيع',transfers:'فواتير المناقلة'};
    UI.setHeader('<i class="fas fa-list-check text-emerald-400"></i> <span>'+titles[view]+'</span>',this.esc(a.name));
    const control=`<div class="rounded-2xl bg-white border p-3 space-y-2"><label class="block text-xs font-extrabold">الفترة الزمنية — الافتراضي كل المدة</label><select class="w-full p-2.5 rounded-xl border text-xs" onchange="AgentHub.changePeriod('${id}','${view}',this.value,'${this.esc(start)}','${this.esc(end)}')">${TimeFilter.options(mode)}</select>
      ${['custom','range'].includes(mode)?`<div class="grid grid-cols-2 gap-2"><label class="text-xs font-bold">من<input type="date" value="${this.esc(start)}" class="border rounded-xl p-2 w-full" onchange="AgentHub.changePeriod('${id}','${view}','${mode}',this.value,'${this.esc(end)}')"></label>${mode==='range'?`<label class="text-xs font-bold">إلى<input type="date" value="${this.esc(end)}" class="border rounded-xl p-2 w-full" onchange="AgentHub.changePeriod('${id}','${view}','range','${this.esc(start)}',this.value)"></label>`:''}</div>`:''}</div>`;
    const recordMarkup=records=>records.length?records.slice(0,400).map(x=>`<div class="${x.flow==='in'?'ta-cash-inflow':x.flow==='out'?'ta-cash-outflow':'bg-white'} border rounded-xl p-3 text-xs space-y-1"><div class="flex justify-between gap-2"><strong class="${x.flow?'ta-cash-title':''}">${this.esc(x.kind)} #${this.esc(x.ref)}</strong><span class="text-slate-500">${this.esc(x.date.slice(0,16).replace('T',' '))}</span></div><div class="text-slate-600">${this.esc(x.detail)}</div><div class="font-black ${x.flow?'ta-cash-amount':'text-teal-700'}" dir="auto">${this.esc(x.amount)}</div></div>`).join('')+(records.length>400?`<div class="text-xs text-amber-700 p-2">تُعرض أول 400 حركة من ${records.length} حركة ضمن الفترة. ضيّق التاريخ لعرض حركات أخرى.</div>`:''):'<div class="p-6 text-center rounded-xl border bg-white text-slate-400 text-xs">لا توجد حركات في الفترة المختارة.</div>';
    let content='';
    if(view==='cash'){
      const cash=FieldCash.summary(a.id),moves=cash.movements.filter(x=>TimeFilter.matches(x.date,mode,start,end));
      content=`<div class="grid grid-cols-2 gap-2"><div class="bg-emerald-700 text-white rounded-2xl p-3"><div class="text-xs opacity-90">رصيد الليرة الحالي</div><strong dir="ltr">${Accounting.format(cash.sypCash,'SYP')}</strong></div><div class="bg-slate-900 text-white rounded-2xl p-3"><div class="text-xs opacity-90">رصيد الدولار الحالي</div><strong dir="ltr">${Accounting.format(cash.usdCash,'USD')}</strong></div></div><p class="text-[11px] text-slate-500">الرصيد الحالي يحتسب كامل التاريخ، بينما الفترة تختار الحركات المعروضة فقط. يشمل الإيصالات والمصاريف والتسويات النقدية المسجلة في الرئيسي.</p>${recordMarkup(moves.map(x=>({kind:x.ref,ref:'',date:x.date,detail:x.party+' · '+x.desc,amount:(x.inflow>0?'+ ':'- ')+Accounting.format(x.inflow>0?x.inflow:x.outflow,x.currency),flow:x.inflow>0?'in':'out'})))}`;
    } else if(view==='stock'){
      const items=(State.items||[]).map(item=>({name:item.name,units:item.units||[],base:Number(Accounting.getItemBaseStock(item.id,null,a.warehouseId))||0})).filter(x=>x.base!==0);
      content=`<p class="text-[11px] text-slate-500">أرصدة المخزون الحالية وليست حركة خلال فترة زمنية؛ تعتمد على آخر بيانات وصلت إلى الرئيسي.</p>${items.length?items.map(x=>`<div class="p-3 rounded-xl bg-white border flex justify-between gap-2 text-xs"><b>${this.esc(x.name)}</b><strong>${Accounting.formatItemQuantity(x.base)} ${this.esc(x.units[0]?.name||'وحدة')}</strong></div>`).join(''):'<div class="p-5 text-center text-xs text-slate-500 bg-white border rounded-xl">المستودع فارغ حالياً.</div>'}`;
    } else if(view==='invoices'){
      content=this.invoiceCards(a,mode,start,end);
    } else {const records=this.activityRecords(a,view).filter(x=>TimeFilter.matches(x.date,mode,start,end));content=`<div class="text-xs text-slate-500 px-1">${records.length} عملية ضمن ${TimeFilter.label(mode)}</div>${recordMarkup(records)}`;}
    main.innerHTML=`<div dir="rtl" class="space-y-3"><div class="flex justify-between items-center"><h2 class="font-black text-base">${titles[view]} · ${this.esc(a.name)}</h2><button type="button" onclick="AppNav.handleBackButton()" class="rounded-xl bg-slate-100 p-2 text-xs font-bold">رجوع</button></div>${view==='stock'?'':control}${content}</div>`;
  }
};
