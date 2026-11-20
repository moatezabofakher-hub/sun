
const TiqanyAgentPermissions=(function(){'use strict';
 const names={priceTier:'تعديل طريقة التسعير',currency:'تعديل العملة المعتمدة في العمليات',balances:'معرفة أرصدة الحسابات',editPrices:'تعديل الأسعار ضمن الفاتورة',exchangeRate:'تعديل سعر الصرف العام للفواتير',fxSharedRate:'السماح بتعديل سعر الصرف المزامن للتصريف',stock:'مراقبة الجرد',createAccounts:'إضافة حسابات جديدة',createItems:'إضافة مواد جديدة',editOperations:'تعديل العمليات',deleteOperations:'حذف العمليات'};
 const defaults=Object.freeze({priceTier:true,currency:true,balances:true,editPrices:false,exchangeRate:false,fxSharedRate:false,stock:true,createAccounts:true,createItems:false,editOperations:true,deleteOperations:false});
 function normalize(p){const src=p&&typeof p==='object'&&!Array.isArray(p)?p:defaults;return Object.fromEntries(Object.keys(names).map(k=>[k,src[k]===true]));}
 function grid(prefix,permissions){const p=normalize(permissions);return `<div class="rounded-xl border-2 border-sky-200 bg-sky-50 p-3" dir="rtl"><h4 class="font-black text-blue-900 mb-2">صلاحيات الموظف — حدد المسموح</h4><div class="grid grid-cols-2 gap-2">${Object.keys(names).map((k,i)=>`<label class="flex gap-2 items-center rounded-lg border border-blue-200 bg-white p-2 text-xs font-bold min-h-[48px]" style="color:#0f2442"><input type="checkbox" data-staff-perm="${prefix}" value="${k}" ${p[k]?'checked':''} style="width:18px;height:18px;accent-color:#0f766e"/><span>${names[k]}</span></label>`).join('')}</div><p class="text-[11px] mt-2 text-slate-600">التغييرات تدخل حيز التنفيذ على هاتف الموظف عند المزامنة التالية، ويُفحص السماح عند استقبال العمليات أيضاً.</p></div>`;}
 function read(prefix){if(typeof document.querySelector!=='function')return normalize(defaults);const obj={};for(const k of Object.keys(names))obj[k]=!!document.querySelector(`input[data-staff-perm="${prefix}"][value="${k}"]:checked`);return obj;}
 function assertOperations(ops,agent,rate){const p=normalize(agent?.permissions);
   for(const o of ops||[]){
     if(o.kind==='customer_create'&&!p.createAccounts)throw Error('ليس لدى الموظف صلاحية إضافة حسابات');
     if(o.kind==='document_edit'&&!p.editOperations)throw Error('ليس لدى الموظف صلاحية تعديل العمليات');
     if(o.kind==='document_delete'&&!p.deleteOperations)throw Error('ليس لدى الموظف صلاحية حذف العمليات');
     if(o.kind==='item_create'&&!p.createItems)throw Error('ليس لدى الموظف صلاحية إضافة مواد');
     if((o.kind==='fx_rate_change'||(o.kind==='currency_exchange'&&o.fxRateChanged===true))&&!p.fxSharedRate)throw Error('لا يملك الموظف صلاحية تعديل سعر صرف التصريف المزامن');
   }
   return true;
 }
 return {names,defaults,normalize,grid,read,assertOperations};
})();
/* Manager-side field dispatch. Import is previewed, validated, deduplicated and
 * committed only after explicit approval. Never merges a whole remote database. */
const FieldSync = {
  busy:false, staged:null, creatingAgent:false, connectedAt:{}, lanListening:false, lanBusy:false, autoReceiverBooted:false, autoReceiverWatchdog:null, autoReceiverCompany:null, lanNetworkTimer:null,
  data(){
    if(!State.fieldSync || typeof State.fieldSync!=='object') State.fieldSync={companyId:'',agents:[],imported:[],events:[]};
    const x=State.fieldSync;
    if(!x.companyId)x.companyId='company_'+FieldProtocol.uuid();
    if(!Array.isArray(x.agents))x.agents=[];
    if(!Array.isArray(x.imported))x.imported=[];
    if(!Array.isArray(x.events))x.events=[];
    if(!Array.isArray(x.cashTransfers))x.cashTransfers=[];
    if(!Array.isArray(x.operationHistory))x.operationHistory=[];
    return x;
  },
  presenceTTL: 40000, // Field phones sync every 12s; count as connected only after an authenticated exchange.
  markConnectedAgent(id){
    if(!id)return;
    this.connectedAt[id]=Date.now();
    this.refreshConnectedBadge();
  },
  connectedEmployees(){
    // Runtime-only: saved/paired staff are NOT treated as online.
    this.connectedCount();
    return this.data().agents.filter(a=>!a.archived&&!a.disabled&&
      Number.isFinite(this.connectedAt[a.id])&&Date.now()-this.connectedAt[a.id]<this.presenceTTL);
  },
  connectedCount(){
    const now=Date.now();
    const active=new Set(this.data().agents.filter(a=>!a.archived&&!a.disabled).map(a=>String(a.id)));
    for(const [id,when] of Object.entries(this.connectedAt)){
      if(!active.has(id)||!Number.isFinite(when)||now-when>this.presenceTTL)delete this.connectedAt[id];
    }
    return Object.keys(this.connectedAt).length;
  },
  refreshConnectedBadge(){
    const el=document.getElementById('salesStaffConnectedCount');
    const badges=typeof document.querySelectorAll==='function' ? document.querySelectorAll('[data-agent-online-id]') : [];
    const connectedPanel=document.getElementById('fieldConnectedEmployeeList');
    const connectedButtonCount=document.getElementById('fieldConnectedCountInButton');
    if(!el&&!badges.length&&!connectedPanel&&!connectedButtonCount)return; // Do not initialize company identity from a status timer.
    const count=this.connectedCount();
    // Presence is based on a recent authenticated employee exchange, not a saved pairing.
    badges.forEach(badge=>{
      const id=badge.getAttribute('data-agent-online-id');
      const live=!!this.connectedAt[id]&&Date.now()-this.connectedAt[id]<this.presenceTTL;
      badge.className='ta-peer-presence '+(live?'connected':'offline');
      badge.textContent=live?'● متصل الآن':'● غير متصل';
    });
    if(connectedPanel)this.paintConnectedEmployees();
    if(connectedButtonCount)connectedButtonCount.textContent='('+count+')';
    if(!el)return;
    el.textContent=String(count);
    el.parentElement?.setAttribute('title',count+' موظفي بيع متصلين خلال آخر 40 ثانية بمزامنة موثّقة');
    el.parentElement?.classList.toggle('has-staff',count>0);
    if(el.parentElement){
      el.parentElement.hidden=false;
      el.parentElement.setAttribute('aria-label',count ? 'موظفو البيع المتصلون: '+count : 'موظفو البيع غير متصلين');
    }
  },
  paintConnectedEmployees(){
    const el=document.getElementById('fieldConnectedEmployeeList');if(!el)return;
    const connected=this.connectedEmployees();
    el.innerHTML=connected.length?connected.map(a=>`<div class="ta-connected-employee-row" data-connected-employee="${this.escape(a.id)}"><span class="ta-connected-employee-dot" aria-label="متصل" role="img"></span><span class="font-black">${this.escape(a.name)}</span></div>`).join('')
      :'<p class="p-4 text-center font-bold text-slate-500">لا يوجد موظفون متصلون حالياً</p>';
    const total=document.getElementById('fieldConnectedEmployeeTotal');if(total)total.textContent=String(connected.length);
  },
  openConnectedEmployees(){
    UI.openModal(`<div class="ta-field-panel space-y-3 text-right" dir="rtl"><h3 class="font-black text-lg text-emerald-900">الموظفون المتصلون <span id="fieldConnectedEmployeeTotal" class="text-sm">0</span></h3><p class="text-xs text-slate-600">تظهر الأجهزة التي تبادلت مزامنة موثّقة خلال آخر 40 ثانية. عند انقطاع الاتصال تختفي بعد انتهاء مهلة التحقق.</p><div id="fieldConnectedEmployeeList" class="ta-connected-employee-list" aria-live="polite"></div><button type="button" onclick="FieldSync.open()" class="w-full rounded-xl bg-slate-200 p-3 font-black">العودة إلى صفحة الموظفين</button></div>`);
    this.paintConnectedEmployees();
  },
  escape(value){return AppEscape.text(value)},
  async saveFile(name, data){
    const raw=JSON.stringify(data,null,2);
    if(window.AndroidFiles?.saveBackup){window.AndroidFiles.saveBackup(raw,name);return;}
    const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  },
  permissionGrid(prefix,stored){return TiqanyAgentPermissions.grid(prefix,stored);},
  readPermissions(prefix){return TiqanyAgentPermissions.read(prefix);},
  assertAuthorizedOps(operations,agent){return TiqanyAgentPermissions.assertOperations(operations,agent,State.settings.exchangeRate);},
  accountPicker(prefix,selected=null){
    const restricted=Array.isArray(selected),allowed=new Set(selected||[]);
    return `<section class="p-3 bg-sky-50 rounded-xl border border-sky-200 text-xs" data-account-picker="${prefix}">
      <div class="font-extrabold mb-2">الحسابات المتاحة لهذا موظف البيع</div>
      <label class="flex gap-2 items-center mb-1"><input type="radio" name="${prefix}Mode" value="all" ${!restricted?'checked':''} onchange="FieldSync.setAccountPickerMode('${prefix}')"/>كل الحسابات</label>
      <label class="flex gap-2 items-center mb-2"><input type="radio" name="${prefix}Mode" value="selected" ${restricted?'checked':''} onchange="FieldSync.setAccountPickerMode('${prefix}')"/>حسابات محددة</label>
      <div id="${prefix}Selected" class="${restricted?'':'hidden'} space-y-2">
        <input type="search" id="${prefix}Search" oninput="FieldSync.filterAccountPicker('${prefix}')" placeholder="بحث باسم العميل أو الهاتف" class="w-full border rounded-lg px-2 py-2 bg-white"/>
        <label class="flex gap-2 items-center"><input type="checkbox" onchange="FieldSync.selectAllAccounts('${prefix}',this.checked)"/>تحديد الكل</label>
        <div class="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2 bg-white">
          ${State.accounts.filter(a=>a.type==='customer').map(a=>`<label class="flex items-center gap-2 py-1" data-account-label="${prefix}" data-search="${this.escape((a.name+' '+(a.phone||'')).toLowerCase())}"><input type="checkbox" data-agent-acc="${prefix}" value="${this.escape(a.id)}" ${allowed.has(a.id)?'checked':''} /><span>${this.escape(a.name)}</span></label>`).join('')}
        </div>
      </div>
      <div class="text-slate-500 mt-1">عند اختيار حسابات محددة لا تُرسل بقية حسابات الرئيسي إلى موظف البيع.</div>
    </section>`;
  },
  setAccountPickerMode(prefix){const selected=document.querySelector(`input[name="${prefix}Mode"]:checked`)?.value==='selected';document.getElementById(prefix+'Selected')?.classList.toggle('hidden',!selected);},
  filterAccountPicker(prefix){const q=String(document.getElementById(prefix+'Search')?.value||'').trim().toLowerCase();document.querySelectorAll(`[data-account-label="${prefix}"]`).forEach(x=>x.classList.toggle('hidden',!!q&&!x.dataset.search.includes(q)));},
  selectAllAccounts(prefix,checked){document.querySelectorAll(`[data-agent-acc="${prefix}"]`).forEach(x=>x.checked=checked);},
  readAccountPicker(prefix){if(typeof document.querySelector!=='function')return null;if(document.querySelector(`input[name="${prefix}Mode"]:checked`)?.value!=='selected')return null;const ids=[...document.querySelectorAll(`[data-agent-acc="${prefix}"]:checked`)].map(x=>x.value);if(!ids.length)throw Error('اختر حساباً واحداً على الأقل أو حدّد كل الحسابات');return ids;},
  open(){
    const config=this.data(), opts=State.warehouses.map(w=>`<option value="${this.escape(w.id)}">${this.escape(w.name)}</option>`).join('');
    UI.openModal(`<div class="ta-field-panel space-y-3 text-right" dir="rtl">
      <h3 class="text-lg font-black text-slate-900"><i class="fas fa-truck ml-1 text-teal-700"></i> إدارة الموظفين</h3>
      <p class="text-xs text-slate-500">يبدأ استقبال موظف البيع تلقائيًا بمجرد تشغيل التطبيق الرئيسي. يستمر الإرسال والاستقبال دوريًا طوال تشغيل التطبيقين واتصالهما عبر شبكة Wi-Fi محلية واحدة. وتبقى الملفات طريقة احتياطية.</p>
      <div class="rounded-xl border bg-slate-50 p-3 text-xs"><b>الشركة:</b> ${this.escape(State.settings.companyName)}<br/><b>المعرّف:</b> <span class="text-[10px]" dir="ltr">${config.companyId}</span></div>
      <div class="rounded-2xl border p-3 space-y-2 bg-teal-50" data-lan-manager="1">
        <b class="text-sm">📡 مزامنة تلقائية مستمرة بين الهاتفين</b>
        <p class="text-xs">يكفي أن يكون التطبيقان قيد التشغيل على شبكة Wi-Fi تسمح بالاتصال بينهما؛ يستقبل الرئيسي العمليات الجديدة المشفرة ويرسل تحديثات المواد والأسعار والعملاء ورصيد السيارة باستمرار دون ضغط زر.</p>
        <div id="fieldLanStatus" class="text-xs font-bold text-teal-900">جارٍ تشغيل الاستقبال…</div>
        <button type="button" class="ta-primary-3d w-full p-3 rounded-xl font-bold" onclick="FieldSync.startLanReceiver()">إعادة تشغيل الاستقبال إذا لزم</button>
      </div>
      <div class="rounded-2xl border border-teal-300 p-3 space-y-2 bg-teal-50">
        <b class="text-sm">🔗 ربط جهاز موظف بيع جديد تلقائياً</b>
        <p class="text-xs">افتح تطبيق موظف البيع الجديد على شبكة Wi-Fi نفسها. سيظهر الطلب هنا تلقائياً. طابق رمز الأمان على الهاتفين، اختر موظف البيع واضغط موافقة واحدة؛ لا حاجة إلى ملفات أو نسخ معرّفات أو مفاتيح.</p>
        <div id="fieldPairingRequests">${this.pairingCards?.()||'بانتظار طلب جهاز موظف البيع…'}</div>
      </div>
      <button type="button" onclick="FieldSync.openConnectedEmployees()" class="ta-connected-employees-button w-full" aria-label="عرض الموظفين المتصلين"><i class="fas fa-users ml-2" aria-hidden="true"></i> الموظفون المتصلون <span id="fieldConnectedCountInButton">(${this.connectedCount()})</span></button>
      <div class="rounded-2xl border p-3 space-y-2 bg-white">
        <b class="text-sm">تسجيل سيارة / موظف بيع</b>
        <input id="fieldNewAgent" class="w-full border rounded-xl p-3" placeholder="اسم موظف البيع" maxlength="70"/>
        <input id="fieldNewVehicle" class="w-full border rounded-xl p-3" placeholder="اسم السيارة / خط التوزيع" maxlength="70"/>
        <select id="fieldNewWarehouse" class="w-full border rounded-xl p-3">${opts}</select>
        ${this.accountPicker('fieldNewAccounts')}
        ${this.permissionGrid('newFieldPermissions')}
        ${State.settings.appProtection?.protectDeviceAddition===true?`<div class="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 space-y-2"><p class="text-sm font-black text-emerald-900">🔒 تعيين كلمة سر الموظف الجديد (إجباري عند تفعيل الحماية)</p><input type="password" autocomplete="new-password" id="fieldNewEmployeePassword" minlength="6" maxlength="128" class="w-full border rounded-xl p-3 bg-white" placeholder="كلمة سر الموظف (6 خانات على الأقل)"/><input type="password" autocomplete="new-password" id="fieldNewEmployeeConfirm" minlength="6" maxlength="128" class="w-full border rounded-xl p-3 bg-white" placeholder="تأكيد كلمة سر الموظف"/><p class="text-xs text-emerald-900">سيُطلب ${window.WindowsPeerSync?'إدخال كلمة سر المدير':'التحقق ببصمة المدير أو كلمة سره'} قبل اعتماد الموظف.</p></div>`:'<p class="text-xs text-emerald-800 font-bold">حماية إضافة الأجهزة معطلة: إضافة الموظف لا تتطلب كلمة سر.</p>'}
        <p class="text-[11px] text-amber-800">أنشئ مستودع سيارة مستقلًا، وحمّله بالمخزون من شاشة المناقلات قبل بدء البيع.</p>
        <button type="button" onclick="FieldSync.addAgent()" class="ta-primary-3d w-full p-3 rounded-xl font-black">إضافة موظف بيع معتمد</button>
      </div>
      <div class="rounded-2xl border p-3 space-y-2 bg-white"><b class="text-sm">موظفو البيع المسجلون</b>
         ${config.agents.filter(a=>!a.archived).length? config.agents.filter(a=>!a.archived).map(a=>`<div class="rounded-xl bg-slate-50 border p-3 space-y-2">
             <div class="flex justify-between gap-2"><span class="font-bold">${this.escape(a.name)} · ${this.escape(a.vehicleName||'')}</span><span class="text-[10px]">${a.disabled?'موقوف':'معتمد'}</span></div><div class="mt-1"><span data-agent-online-id="${this.escape(a.id)}" class="ta-peer-presence offline">● غير متصل</span></div>${a.createdOnDevice?`<div class="text-[10px] text-sky-800 font-bold">${a.createdOnDevice==='computer'?'🖥️ أُنشئ على الكمبيوتر':'📱 أُنشئ على الموبايل الرئيسي'}</div>`:''}
             <p class="text-[10px] text-slate-500">${this.escape(WarehouseController.name(a.warehouseId))}</p><p class="text-[11px] font-extrabold ${a.employeeAuth?.hash?'text-teal-700':'text-slate-600'}">${a.employeeAuth?.hash?'🔒 كلمة سر الموظف جاهزة':State.settings.appProtection?.protectDeviceAddition===true?'⚠ عيّن كلمة سر الموظف من تعديل الموظف':'إضافة الأجهزة دون كلمة سر'}</p>
             <p class="text-[10px] ${a.pairedDeviceId?'text-teal-700':'text-amber-700'}">${a.pairedDeviceId?'🔒 مرتبط بجهاز ينتهي معرفه بـ '+this.escape(a.pairedDeviceId.slice(-8)):'بانتظار طلب ربط جهاز جديد'}</p>
             <div class="grid grid-cols-2 gap-2">
               <button type="button" class="rounded-lg bg-teal-700 text-white p-2 font-bold" onclick="FieldSync.exportProvision('${a.id}')">تجهيز بيانات موظف البيع</button>
               <button type="button" class="rounded-lg bg-blue-700 text-white p-2 font-bold" onclick="FieldSync.exportAck('${a.id}')">تأكيد الاستلام</button>
               <button type="button" class="rounded-lg bg-amber-100 p-2 font-bold col-span-2" onclick="FieldSync.showActivation('${a.id}')">إصدار كود تفعيل لجهاز موظف البيع</button>
               <button type="button" class="rounded-lg bg-slate-200 text-slate-800 p-2 font-bold col-span-2" onclick="FieldSync.toggleAgent('${a.id}')">${a.disabled?'إعادة السماح بالمزامنة':'إيقاف استقبال عمليات هذا موظف البيع'}</button>
               <button type="button" class="rounded-lg bg-blue-100 text-blue-900 p-2 font-black" onclick="FieldSync.showEditAgent('${a.id}')">✎ تعديل موظف البيع</button>
               <button type="button" class="rounded-lg bg-rose-100 text-rose-800 p-2 font-black" onclick="FieldSync.confirmRemoveAgent('${a.id}')">× حذف موظف البيع</button>
             </div></div>`).join(''):'<p class="text-xs text-slate-500">لا يوجد موظفو بيع حتى الآن.</p>'}
      </div>
      ${config.agents.some(a=>a.archived)?`<div class="rounded-xl border bg-rose-50 p-3 text-xs"><strong>موظفو بيع محذوفون (أرشيف)</strong><p class="mt-1">تبقى سجلاتهم التاريخية محفوظة لمنع ضياع الفواتير والسندات.</p>${config.agents.filter(a=>a.archived).map(a=>`<div class="flex justify-between items-center py-2 border-b"><span>${this.escape(a.name)}</span><button type="button" class="bg-white border px-2 py-1 rounded" onclick="FieldSync.restoreAgent('${a.id}')">استعادة موظف البيع</button></div>`).join('')}</div>`:''}
      <div class="rounded-2xl border p-3 bg-emerald-50 space-y-2">
        <b class="text-sm">استلام عمليات موظف البيع</b>
        <p class="text-xs">اختر ملف العمليات الوارد من هاتف موظف البيع. ستظهر معاينة قبل أي ترحيل.</p>
        <input id="fieldImportFile" type="file" accept="application/json,.json" onchange="FieldSync.previewFile(this)" class="w-full text-xs"/>
        <b class="text-[11px]">العمليات المستلمة حتى الآن: ${config.imported.length}</b>
        ${config.events.slice(-4).reverse().map(x=>`<div class="text-[11px] border-b border-emerald-100 py-1">${this.escape(config.agents.find(a=>a.id===x.agentId)?.name||'موظف بيع')}: ${x.count} عملية · ${x.at.slice(0,16).replace('T',' ')}</div>`).join('')}
      </div>
      <button type="button" onclick="UI.forceCloseModal()" class="w-full rounded-xl bg-slate-100 p-3 font-bold">إغلاق</button>
    </div>`);
    this.refreshConnectedBadge();
    if(window.AndroidLocalSync) this.startLanReceiver(true);
  },
  async addAgent(){
    if(this.creatingAgent)return UI.toast('جارٍ حفظ الموظف الجديد','warn');
    const name=document.getElementById('fieldNewAgent')?.value.trim(), vehicleName=document.getElementById('fieldNewVehicle')?.value.trim();
    const warehouseId=document.getElementById('fieldNewWarehouse')?.value;
    if(!name||name.length<2||!warehouseId)return UI.toast('اكتب اسم موظف البيع واختر المستودع','warn');
    let allowedAccountIds;try{allowedAccountIds=this.readAccountPicker('fieldNewAccounts');}catch(e){return UI.toast(e.message,'warn');}
    if(this.data().agents.some(a=>(a.warehouseId===warehouseId||a.pendingWarehouseId===warehouseId)&&!a.disabled&&!a.archived))return UI.toast('المستودع مربوط بموظف بيع آخر؛ خصص مستودع سيارة مستقلًا','warn');
    const permissions=this.readPermissions('newFieldPermissions');
    const protectionOn=State.settings.appProtection?.protectDeviceAddition===true;
    const employeePassword=String(document.getElementById('fieldNewEmployeePassword')?.value||'');
    const confirmation=String(document.getElementById('fieldNewEmployeeConfirm')?.value||'');
    if(protectionOn && (employeePassword.length<6||employeePassword.length>128||employeePassword!==confirmation))
      return UI.toast('يجب تعيين كلمة سر الموظف وتأكيدها (6 خانات على الأقل)','warn');
    const profile=typeof ProfileManager!=='undefined'?ProfileManager.activeId:null;
    const companyId=this.data().companyId;
    const saveNewAgent=async()=>{
      if(this.creatingAgent)return;
      if(profile!==null&&ProfileManager.activeId!==profile||this.data().companyId!==companyId ||
         (State.settings.appProtection?.protectDeviceAddition===true)!==protectionOn)
        return UI.toast('تغيّرت الشركة أو إعدادات الحماية؛ أعد إضافة الموظف','warn');
      if(this.data().agents.some(a=>(a.warehouseId===warehouseId||a.pendingWarehouseId===warehouseId)&&!a.disabled&&!a.archived))
        return UI.toast('المستودع أصبح محجوزًا لموظف بيع آخر','warn');
      this.creatingAgent=true;
      try{
        if(protectionOn && await ProtectionController.verifyPin(employeePassword))throw Error('يجب أن تختلف كلمة سر الموظف عن كلمة سر المدير');
        const key=new Uint8Array(32);crypto.getRandomValues(key);
        const a={id:'agent_'+FieldProtocol.uuid(),name,vehicleName:vehicleName||name,warehouseId,
          key:FieldProtocol.b64u(key),allowedAccountIds,permissions,createdAt:new Date().toISOString(),
          createdOnDevice:window.WindowsPeerSync?'computer':'main-android',disabled:false};
        if(protectionOn)a.employeeAuth={...await TiqanyEmployeeAuth.create(employeePassword),version:1,lockApp:true};
        this.data().agents.push(a);
        try {await StorageEngine.saveState();this.open();UI.toast('تم إنشاء موظف البيع. افتح تطبيقه وسيظهر طلب الربط تلقائياً','success');}
        catch(error){this.data().agents=this.data().agents.filter(x=>x.id!==a.id);throw error;}
      }catch(error){UI.toast('فشل حفظ موظف البيع: '+(error.message||error),'error');}
      finally{this.creatingAgent=false;}
    };
    if(!protectionOn)return saveNewAgent();
    if(typeof ProtectionController==='undefined'||typeof ProtectionController.requestPin!=='function')return UI.toast('التحقق الأمني غير متاح','error');
    if(!State.settings.appProtection?.pinHash||!State.settings.appProtection?.pinSalt)
      return ProtectionController.promptPinSetup?.('إضافة الموظف');
    ProtectionController.requestPin('تأكيد هوية المدير قبل إضافة الموظف',saveNewAgent,
      {passwordOnly:!!window.WindowsPeerSync});
  },
  catalog(a, historyCursor=0){
    const collectionBook=typeof TiqanyFinance!=='undefined' && TiqanyAgentPermissions.normalize(a.permissions).balances ? TiqanyFinance.settlements(State) : null;
    const config=this.data();
    const known=config.imported.filter(i=>i.agentId===a.id).map(i=>i.id);
    // Limit optional image payloads to keep periodic encrypted sync reliable on LAN.
    let imageBudget=650000,ledgerBudget=4600;
    return {kind:'provision',appVersion:'3.5.158',format:FieldProtocol.FORMAT,companyId:config.companyId,companyName:State.settings.companyName,agentId:a.id,agentName:a.name,vehicleName:a.vehicleName,warehouseId:a.warehouseId,warehouseName:WarehouseController.name(a.warehouseId),key:a.key,
      issuedAt:new Date().toISOString(),permissions:TiqanyAgentPermissions.normalize(a.permissions),employeeAuth:a.employeeAuth||null,exchangeRate:Number(State.settings.exchangeRate),
      currencyExchangeRatesSyp:JSON.parse(JSON.stringify(State.settings.currencyExchangeRatesSyp||{})),
      allowedCurrencies:[...new Set([...(typeof CurrencyCatalog!=='undefined'?CurrencyCatalog.active():['USD','SYP']),...(State.settings.addedCurrencies||[]).map(c=>c.code).filter(c=>/^[A-Z]{3}$/.test(c))])],
      defaultPriceTier:['wholesale','center','consumer'].includes(State.settings.defaultPriceTier)?State.settings.defaultPriceTier:'wholesale',
      // Company branding is an authenticated part of each refreshed catalog; never copied from agent edits.
      companyPhone:String(State.settings.companyPhone||'').slice(0,100),
      companyAddress:String(State.settings.companyAddress||'').slice(0,180),
      footerNote:String(State.settings.footerNote||'').slice(0,500),
      companyLogo:/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(String(State.settings.companyLogo||''))
        && String(State.settings.companyLogo||'').length < 1200000 ? State.settings.companyLogo : '',
      printerWidth:Number(State.settings.printerWidth)===58?58:80,
      printFontScale:Number(State.settings.printFontScale)||0.75,
      itemQuantityDecimals:Math.min(4,Math.max(0,Math.floor(Number(State.settings.itemQuantityDecimals??2)))),
      categories:(State.categories||[]).slice(),
      items:State.items.map(it=>{
        const image=String(it.photoData||'');
        const photoData=/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image) && image.length<120000 && image.length<imageBudget ? image : '';
        imageBudget-=photoData.length;
        return {id:it.id,name:it.name,category:it.category||'',barcode:it.barcode||'',currency:it.currency,
          photoData,isBundle:!!it.isBundle,bundleComponents:it.isBundle?(it.bundleComponents||[]).map(b=>({itemId:b.itemId,quantity:b.quantity})):[],units:(it.units||[]).map(u=>({name:u.name,factor:u.factor,salePrice:(Accounting.itemSalePrice?.(it,u,null,'wholesale') ?? Number(u.wholesalePrice??u.salePrice)),wholesalePrice:(Accounting.itemSalePrice?.(it,u,null,'wholesale') ?? Number(u.wholesalePrice??u.salePrice)),centerPrice:(Accounting.itemSalePrice?.(it,u,null,'center') ?? Number(u.centerPrice??u.salePrice)),consumerPrice:(Accounting.itemSalePrice?.(it,u,null,'consumer') ?? Number(u.consumerPrice??u.centerPrice??u.salePrice))}))};
      }),
      accounts:State.accounts.filter(acc=>acc.type==='customer' && (!Array.isArray(a.allowedAccountIds) || a.allowedAccountIds.includes(acc.id) || acc.fieldOrigin?.agentId===a.id)).map(acc=>{
        // Export balances derived from the same posted double-entry ledger as the main app.
        // The agent adjusts only operations not represented in this synchronized snapshot.
        const st=Accounting.getAccountStatement(acc.id);
        return {id:acc.id,name:acc.name,type:acc.type,phone:acc.phone||'',address:acc.address||'',paymentTerms:acc.paymentTerms||'',priceTier:['wholesale','center','consumer'].includes(acc.priceTier)?acc.priceTier:'settings',
          collectionInvoices:collectionBook ? State.invoices.filter(i=>i.accountId===acc.id && i.type==='sale' && collectionBook.balances.get(i.id)>0).map(i=>({id:i.id,number:i.number,currency:i.currency,remaining:collectionBook.balances.get(i.id),dueDate:String(i.dueDate||i.date||'').slice(0,10)})) : [],
          sypBalance:TiqanyAgentPermissions.normalize(a.permissions).balances?st.sypBalance:null,usdBalance:TiqanyAgentPermissions.normalize(a.permissions).balances?st.usdBalance:null};
      }),
      stock:Object.fromEntries(State.items.map(it=>[it.id,Accounting.getItemBaseStock(it.id,null,a.warehouseId)])),
      accountLedgers:TiqanyAgentPermissions.normalize(a.permissions).balances
       ?State.accounts.filter(acc=>acc.type==='customer' && (!Array.isArray(a.allowedAccountIds)||a.allowedAccountIds.includes(acc.id)||acc.fieldOrigin?.agentId===a.id)).map(acc=>{
          const entries=Accounting.getAccountStatement(acc.id)?.entries;
          const complete=Array.isArray(entries)&&entries.length<=1500&&entries.length<=ledgerBudget;
          if(complete)ledgerBudget-=entries.length;
          return {accountId:acc.id,complete,entries:complete?entries.map(e=>({date:e.date,ref:e.ref,desc:e.desc,rate:e.rate,currency:e.currency,debit:e.debit,credit:e.credit})):[]};
        }):[],
      knownIds:known,
      // A cashbox is a separate physical till, not a customer's receivable.
      agentCash:(typeof FieldCash!=='undefined'?((x)=>({sypCash:x.sypCash,usdCash:x.usdCash,otherCurrencies:x.otherCurrencies||{}}))(FieldCash.summary(a.id)):{sypCash:0,usdCash:0,otherCurrencies:{}}),
      cashTransfers:config.cashTransfers.filter(x=>x.agentId===a.id),
      warehouseTransfers:[],
      historyPage:typeof this.historyPage==='function'?this.historyPage(a,historyCursor):{ops:[],nextCursor:0,total:0}};
  },
  showEditAgent(id){
    const a=this.data().agents.find(x=>x.id===id&&!x.archived);if(!a)return;
    UI.openModal(`<div class="ta-field-panel space-y-3 text-right" dir="rtl">
      <h3 class="text-base font-black">تعديل بيانات موظف البيع</h3>
      <p class="text-xs text-slate-600">تعديل الاسم والسيارة لا يغيّر فواتير موظف البيع المرحّلة سابقًا. أرسل كشف تجهيز جديدًا بعد الحفظ.</p>
      <label class="text-xs font-black">اسم موظف البيع</label><input id="editFieldAgentName" class="w-full border rounded-xl p-3" maxlength="70" value="${this.escape(a.name)}"/>
      <label class="text-xs font-black">السيارة / خط التوزيع</label><input id="editFieldAgentVehicle" class="w-full border rounded-xl p-3" maxlength="70" value="${this.escape(a.vehicleName||'')}"/>
      ${this.accountPicker('fieldEditAccounts',a.allowedAccountIds)}
      ${this.permissionGrid('editFieldPermissions',a.permissions)}
      <section class="rounded-2xl border-2 border-teal-300 bg-teal-50 p-3 space-y-3" aria-label="كلمة سر الموظف">
        <h4 class="font-black text-teal-950 text-base">🔐 كلمة سر موظف البيع</h4>
        <p class="text-xs font-bold ${a.employeeAuth?.hash?'text-teal-800':'text-rose-800'}">${a.employeeAuth?.hash?'✓ تم تعيين كلمة سر خاصة بهذا الموظف':State.settings.appProtection?.protectDeviceAddition===true?'⚠ لم يتم تعيين كلمة سر لهذا الموظف بعد':'لا يلزم تعيين كلمة سر مع إيقاف حماية إضافة الأجهزة'}</p>
        <label class="flex items-center gap-3 rounded-xl border-2 border-emerald-300 p-3 bg-white font-black text-slate-900" for="editFieldEmployeeLock"><input id="editFieldEmployeeLock" type="checkbox" class="w-5 h-5 accent-emerald-700" ${a.employeeAuth?.lockApp!==false?'checked':''}/> قفل تطبيق الموظف بكلمة السر أو البصمة</label>
        <p class="text-xs text-emerald-900">عند إلغاء القفل يستطيع الموظف فتح التطبيق دون طلب كلمة السر، وتظل بصمته المسجلة على هاتفه محفوظة لحين إعادة تفعيل القفل.</p>
        <p class="text-xs text-slate-700">للمدير فقط. يستلمها تطبيق الموظف عند المزامنة، ولا يمكن للموظف تغييرها. اترك الخانتين فارغتين للاحتفاظ بالرمز الحالي.</p>
        <label class="block text-sm font-black text-slate-900" for="editFieldEmployeePassword">${a.employeeAuth?.hash?'تغيير كلمة سر الموظف':'تعيين كلمة سر الموظف'} (6 خانات على الأقل)</label>
        <input id="editFieldEmployeePassword" type="password" autocomplete="new-password" minlength="6" maxlength="128" class="w-full border-2 border-teal-300 rounded-xl p-3 bg-white" placeholder="كلمة سر خاصة بهذا الموظف"/>
        <label class="block text-sm font-black text-slate-900" for="editFieldEmployeeConfirm">تأكيد كلمة سر الموظف</label>
        <input id="editFieldEmployeeConfirm" type="password" autocomplete="new-password" minlength="6" maxlength="128" class="w-full border-2 border-teal-300 rounded-xl p-3 bg-white"/>
        ${State.settings.appProtection?.protectDeviceAddition===true&&State.settings.appProtection?.pinHash?'<label class="block text-sm font-black text-slate-900" for="editFieldManagerApprovalPin">كلمة سر المدير للسماح بتغيير كلمة الموظف</label><input id="editFieldManagerApprovalPin" type="password" autocomplete="current-password" class="w-full border-2 border-slate-300 rounded-xl p-3 bg-white" placeholder="تُطلب عند تغيير كلمة الموظف فقط"/>':''}
        <p class="text-xs text-teal-900 font-bold">لا تُخزن كلمة السر كما أُدخلت ولا تُرسل نصًا؛ يُنقل رمز تحقق مشفّر مشتق منها. وتُستخدم كلمة الموظف لاستعادة نسخه الاحتياطية الجديدة.</p>
      </section>
      <section class="rounded-2xl border-2 border-sky-200 bg-sky-50 p-3 space-y-2" dir="rtl">
        <label class="block font-black text-sm text-slate-900" for="editFieldAgentWarehouse"><i class="fas fa-warehouse text-teal-700 ml-1"></i> تبديل مستودع موظف البيع</label>
        ${a.pendingWarehouseId?`<p class="text-xs font-extrabold text-amber-800">طلب انتقال قيد المزامنة: ${this.escape(WarehouseController.name(a.warehouseId))} ← ${this.escape(WarehouseController.name(a.pendingWarehouseId))}. لا يتغير جرد الهاتف قبل إتمام الترحيل.</p>`:
          `<select id="editFieldAgentWarehouse" class="w-full border-2 border-teal-500 rounded-xl p-3 text-sm font-black" style="color:#103e27;background:linear-gradient(155deg,#e5fff0,#b7e9ce);box-shadow:inset 0 2px 0 #fff,0 3px 0 #3f9970,0 6px 12px #103d2c29" ${this.connectedAt[id]&&Date.now()-this.connectedAt[id]<this.presenceTTL?'':'disabled'}>
             ${(State.warehouses||[]).filter(w=>w.id!=='wh_main'&&(w.id===a.warehouseId||!this.data().agents.some(x=>x.id!==a.id&&!x.archived&&!x.disabled&&(x.warehouseId===w.id||x.pendingWarehouseId===w.id)))).map(w=>`<option value="${this.escape(w.id)}" ${w.id===a.warehouseId?'selected':''}>${this.escape(w.name)}</option>`).join('')}
           </select><p class="text-[11px] font-bold text-slate-700">${this.connectedAt[id]&&Date.now()-this.connectedAt[id]<this.presenceTTL?'اختر المستودع الجديد أثناء الاتصال الموثّق. تُنقل الحركات غير المُرحّلة أولًا؛ ويبقى رصيد الصندوق مستقلًا عن المستودع.':'اتصل بهاتف الموظف أولًا كي يتاح تبديل المستودع بأمان.'}</p>`}
      </section>
      <button type="button" class="ta-primary-3d ta-modal-action-primary w-full p-3 rounded-xl font-black" onclick="FieldSync.saveAgentEdit('${a.id}')">حفظ التعديل</button>
      <button type="button" class="ta-modal-action-secondary rounded-xl p-3 w-full bg-slate-100 font-black" onclick="FieldSync.open()">رجوع</button>
    </div>`);
  },
  async saveAgentEdit(id){
    const a=this.data().agents.find(x=>x.id===id&&!x.archived);if(!a)return;
    const name=String(document.getElementById('editFieldAgentName')?.value||'').trim();
    const vehicleName=String(document.getElementById('editFieldAgentVehicle')?.value||'').trim();
    if(name.length<2||name.length>70||vehicleName.length>70)return UI.toast('اسم موظف البيع يجب أن يكون بين حرفين و70 حرفًا','warn');
    let allowedAccountIds;try{allowedAccountIds=this.readAccountPicker('fieldEditAccounts');}catch(e){return UI.toast(e.message,'warn');}
    const warehouseControl=document.getElementById('editFieldAgentWarehouse');
    const requestedWarehouseId=warehouseControl&&!warehouseControl.disabled&&warehouseControl.value?warehouseControl.value:a.warehouseId;
    const warehouseChanged=requestedWarehouseId!==a.warehouseId;
    if(warehouseChanged){
      if(a.pendingWarehouseId)return UI.toast('هناك تبديل مستودع قيد التنفيذ؛ أكمله قبل طلب تغيير آخر','warn');
      if(!this.connectedAt[id]||Date.now()-this.connectedAt[id]>=this.presenceTTL)return UI.toast('يجب أن يكون الموظف متصلًا بمزامنة موثوقة أثناء تغيير مستودعه','warn');
      if(requestedWarehouseId==='wh_main'||!(State.warehouses||[]).some(w=>w.id===requestedWarehouseId))return UI.toast('المستودع الجديد غير صالح','warn');
      if(this.data().agents.some(x=>x.id!==id&&!x.disabled&&!x.archived&&(x.warehouseId===requestedWarehouseId||x.pendingWarehouseId===requestedWarehouseId)))return UI.toast('المستودع الجديد مخصص لموظف آخر','warn');
    }
    const employeePassword=document.getElementById('editFieldEmployeePassword')?.value||'';
    const employeeConfirm=document.getElementById('editFieldEmployeeConfirm')?.value||'';
    const managerPin=document.getElementById('editFieldManagerApprovalPin')?.value||'';
    const employeeLockControl=document.getElementById('editFieldEmployeeLock');
    const employeeLockEnabled=employeeLockControl && typeof employeeLockControl.checked === 'boolean' ? employeeLockControl.checked : (a.employeeAuth?.lockApp!==false);
    if((employeePassword||employeeConfirm)&&employeePassword!==employeeConfirm)return UI.toast('تأكيد كلمة سر الموظف غير مطابق','error');
    if(State.settings.appProtection?.protectDeviceAddition===true&&!a.employeeAuth?.hash&&!employeePassword)return UI.toast('عيّن كلمة سر خاصة بالموظف قبل حفظ بياناته','warn');
    const permissions=this.readPermissions('editFieldPermissions');
    const samePermissions=(x,y)=>JSON.stringify(TiqanyAgentPermissions.normalize(x))===JSON.stringify(TiqanyAgentPermissions.normalize(y));
    const permissionsChanged=!samePermissions(a.permissions,permissions);
    const lockChanged=(a.employeeAuth?.lockApp!==false)!==employeeLockEnabled;
    const originalPermissions=JSON.stringify(TiqanyAgentPermissions.normalize(a.permissions));
    const companyProfile=typeof ProfileManager!=='undefined'?ProfileManager.activeId:null;
    const saveVerified=async()=>{
      if(companyProfile!==null&&ProfileManager.activeId!==companyProfile)return UI.toast('تغيّرت الشركة أثناء التحقق، أعد تعديل الموظف','warn');
      const current=this.data().agents.find(x=>x.id===id&&!x.archived);
      if(current!==a||JSON.stringify(TiqanyAgentPermissions.normalize(a.permissions))!==originalPermissions)return UI.toast('تغيّرت صلاحيات الموظف أثناء التحقق؛ أعد فتح التعديل','warn');
      let employeeAuth=a.employeeAuth||null;
      if(employeePassword){
        try{
          if(State.settings.appProtection?.protectDeviceAddition===true&&State.settings.appProtection?.pinHash){
            if(!managerPin||!await ProtectionController.verifyPin(managerPin))throw Error('أدخل كلمة سر المدير الصحيحة للموافقة على تعيين كلمة الموظف');
            if(await ProtectionController.verifyPin(employeePassword))throw Error('يجب أن تختلف كلمة سر الموظف عن كلمة سر المدير');
          }
          employeeAuth={...await TiqanyEmployeeAuth.create(employeePassword),version:(Number(a.employeeAuth?.version)||0)+1};
        }catch(e){return UI.toast(e.message||'تعذر إعداد كلمة سر الموظف','error');}
      }
      if(employeeAuth?.hash && (lockChanged||employeePassword)) employeeAuth={...employeeAuth,lockApp:employeeLockEnabled,version:(Number(employeeAuth.version)||0)+(employeePassword?0:1),updatedAt:new Date().toISOString()};
      if(warehouseChanged&&(!this.connectedAt[id]||Date.now()-this.connectedAt[id]>=this.presenceTTL))return UI.toast('انقطع الاتصال بالموظف؛ أعد طلب التبديل عند عودة الاتصال','warn');
      if(warehouseChanged&&this.data().agents.some(x=>x.id!==id&&!x.disabled&&!x.archived&&(x.warehouseId===requestedWarehouseId||x.pendingWarehouseId===requestedWarehouseId)))return UI.toast('المستودع أصبح مخصصًا لموظف آخر','warn');
      const original={name:a.name,vehicleName:a.vehicleName,allowedAccountIds:a.allowedAccountIds,permissions:a.permissions,employeeAuth:a.employeeAuth,pendingWarehouseId:a.pendingWarehouseId,warehouseSwitchId:a.warehouseSwitchId,warehouseSwitchRequestedAt:a.warehouseSwitchRequestedAt};
      a.name=name;a.vehicleName=vehicleName||name;a.allowedAccountIds=allowedAccountIds;
      a.permissions=permissions;a.employeeAuth=employeeAuth;
      if(warehouseChanged){a.pendingWarehouseId=requestedWarehouseId;a.warehouseSwitchId='whs_'+FieldProtocol.uuid();a.warehouseSwitchRequestedAt=new Date().toISOString();}
      try{await StorageEngine.saveState();this.open();UI.toast(warehouseChanged?'تم حفظ طلب تبديل المستودع؛ سيبدأ بعد تأكيد كل عمليات الهاتف القديمة':'حُفظ موظف البيع؛ ستنتقل التعديلات عند أول مزامنة موثوقة','success');}
      catch(e){Object.assign(a,original);UI.toast('لم يُحفظ تعديل موظف البيع: '+e.message,'error');}
    };
    if(permissionsChanged||lockChanged||warehouseChanged){
      if(typeof ProtectionController==='undefined'||typeof ProtectionController.requestPin!=='function')return UI.toast('التحقق الأمني غير متاح','error');
      if(!State.settings.appProtection?.pinHash||!State.settings.appProtection?.pinSalt)return ProtectionController.promptPinSetup?.('تعديل صلاحيات الموظف');
      // The edit modal is replaced by the PIN/Biometric modal; all values above
      // were captured BEFORE opening it, so no user changes are discarded.
      ProtectionController.requestPin('تحقق بهوية المدير قبل تغيير صلاحيات موظف البيع',saveVerified );
      return;
    }
    return saveVerified();
  },
  confirmRemoveAgent(id){
    const a=this.data().agents.find(x=>x.id===id&&!x.archived);if(!a)return;
    const imported=this.data().imported.filter(x=>x.agentId===id).length;
    UI.openModal(`<div class="ta-field-panel space-y-3 text-right" dir="rtl">
      <h3 class="text-lg font-black text-rose-800">حذف موظف البيع: ${this.escape(a.name)}</h3>
      <p class="text-xs text-rose-800">سيُمنع استقبال عمليات جديدة من موظف البيع هذا، ويُخفى من القائمة النشطة. ستبقى سجلاته وسنداته المرحّلة (${imported}) محفوظة في الأرشيف لأغراض التدقيق.</p>
      <p class="text-xs text-amber-800">لا يمكن سحب الترخيص فورًا من هاتف يعمل دون اتصال؛ المنع يُطبق عند محاولة المزامنة.</p>
      <button type="button" class="ta-modal-action-danger w-full bg-rose-700 text-white p-3 rounded-xl font-black" onclick="FieldSync.removeAgent('${a.id}')">متابعة إلى الموافقة بالبصمة أو كلمة السر</button>
      <button type="button" class="ta-modal-action-secondary w-full bg-slate-100 p-3 rounded-xl" onclick="FieldSync.open()">إلغاء</button>
    </div>`);
  },
  removeAgent(id){
    const a=this.data().agents.find(x=>x.id===id&&!x.archived);if(!a)return;
    // No configured password: open the protection settings directly; never proceed with deletion.
    if(!State.settings.appProtection?.pinHash || !State.settings.appProtection?.pinSalt){
      ProtectionController.goToPinSetup();
      UI.toast('عيّن كلمة سر التطبيق من إعدادات الحماية أولاً، ثم أعد حذف موظف البيع','warn');
      return;
    }
    // The phone need not be online. Revocation is written locally and enforced on its next sync.
    ProtectionController.requirePinForDestructiveAction(
      'أدخل كلمة سر التطبيق لتأكيد إلغاء موظف البيع «'+this.escape(a.name)+'»، سواء كان متصلاً أو غير متصل. ستُرفض محاولات مزامنته التالية. انسخ بياناته غير المرسلة قبل الحذف.',
      async(pin)=>this.removeAgentAuthorized(id,pin), 'حذف موظف البيع');
  },
  async removeAgentAuthorized(id,pin){
    if(pin!==ProtectionController.biometricApprovalProof && (!pin || !await ProtectionController.verifyPin(pin)))return UI.toast('الموافقة غير صحيحة، لم يتم حذف موظف البيع','error');
    const a=this.data().agents.find(x=>x.id===id&&!x.archived);if(!a)return;
    const old={archived:a.archived,disabled:a.disabled,deletedAt:a.deletedAt};
    const previousPresence=this.connectedAt[id];
    a.archived=true;a.disabled=true;a.deletedAt=new Date().toISOString();
    delete this.connectedAt[id];
    try{await StorageEngine.saveState();this.refreshConnectedBadge();this.open();UI.toast('تم إلغاء صلاحية موظف البيع وأرشفته؛ سيُرفض اتصاله عند العودة للشبكة','success');}
    catch(e){Object.assign(a,old);if(previousPresence!==undefined)this.connectedAt[id]=previousPresence;this.refreshConnectedBadge();UI.toast('تعذر حذف موظف البيع: '+e.message,'error');}
  },
  async restoreAgent(id){
    const a=this.data().agents.find(x=>x.id===id&&x.archived);if(!a)return;
    if(this.data().agents.some(x=>x.id!==a.id&&!x.archived&&!x.disabled&&(x.warehouseId===a.warehouseId||x.pendingWarehouseId===a.warehouseId)))return UI.toast('مستودع السيارة مرتبط بموظف بيع آخر','warn');
    const old={archived:a.archived,disabled:a.disabled,deletedAt:a.deletedAt};a.archived=false;a.disabled=false;a.deletedAt=null;
    try{await StorageEngine.saveState();this.open();UI.toast('تمت استعادة موظف البيع','success');}
    catch(e){Object.assign(a,old);UI.toast('فشلت استعادة موظف البيع','error');}
  },
  async toggleAgent(id){
    const a=this.data().agents.find(x=>x.id===id&&!x.archived);if(!a)return;
    const old=a.disabled;a.disabled=!a.disabled;
    try{await StorageEngine.saveState();this.refreshConnectedBadge();this.open();UI.toast(a.disabled?'توقف استقبال العمليات من موظف البيع هذا حتى إعادة السماح':'تم إعادة السماح بالمزامنة','info');}
    catch(e){a.disabled=old;UI.toast('فشل حفظ صلاحية موظف البيع','error');}
  },
  async exportProvision(id){
    const a=this.data().agents.find(x=>x.id===id&&!x.disabled);if(!a)return UI.toast('موظف البيع غير موجود','error');
    if(State.settings.appProtection?.protectDeviceAddition===true&&!TiqanyEmployeeAuth.valid(a.employeeAuth))return UI.toast('عيّن كلمة سر الموظف من صفحة تعديل الموظف قبل إصدار كشف التجهيز','warn');
    try {
      await StorageEngine.saveState();
      const envelope=await FieldProtocol.seal(this.catalog(a),a.key);
      // Provision contains an authentication key: share privately and not through public sites.
      await this.saveFile('TA_Provision_'+a.id+'.json',envelope);
      UI.toast('ملف تجهيز موظف البيع جاهز للحفظ والإرسال الخاص','success');
    }catch(e){UI.toast(e.message,'error');}
  },
  async exportAck(id){
    const c=this.data(),a=c.agents.find(x=>x.id===id);if(!a)return;
    const payload={kind:'ack',appVersion:'3.5.158',companyId:c.companyId,agentId:a.id,knownIds:c.imported.filter(x=>x.agentId===id).map(x=>x.id),issuedAt:new Date().toISOString()};
    await this.saveFile('TA_ACK_'+a.id+'.json',await FieldProtocol.seal(payload,a.key));
  },
  showActivation(id){
    const a=this.data().agents.find(x=>x.id===id);if(!a)return;
    UI.openModal(`<div class="ta-field-panel space-y-3 text-right" dir="rtl">
       <h3 class="text-base font-black">إصدار تفعيل موظف البيع: ${this.escape(a.name)}</h3>
       <p class="text-xs text-slate-600">انسخ رمز جهاز موظف البيع من تطبيقه. اختر ملف مفتاح التفعيل الخاص بك (PEM)، ولن يُحفظ داخل التطبيق أو يرفع إلى أي خادم.</p>
       <input id="fieldDeviceId" placeholder="معرّف جهاز موظف البيع" dir="ltr" class="w-full p-3 border rounded-xl text-xs"/>
       <label class="text-xs font-bold">ينتهي التفعيل في</label>
       <input id="fieldExpiry" type="date" class="w-full p-3 border rounded-xl"/>
       <label class="text-xs font-bold">المفتاح الخاص — للاستعمال المحلي فقط</label>
       <input id="fieldOwnerPrivateKey" type="file" accept=".pem,.txt" class="w-full text-xs"/>
       <button type="button" onclick="FieldSync.issueActivation('${a.id}')" class="ta-primary-3d w-full p-3 rounded-xl font-black">إنشاء رمز التفعيل</button>
       <button type="button" onclick="FieldSync.open()" class="w-full rounded-xl p-2 bg-slate-100">رجوع</button></div>`);
    const future=new Date();future.setFullYear(future.getFullYear()+1);document.getElementById('fieldExpiry').value=future.toISOString().slice(0,10);
  },
  async issueActivation(id){
    const a=this.data().agents.find(x=>x.id===id),deviceId=document.getElementById('fieldDeviceId')?.value.trim(),date=document.getElementById('fieldExpiry')?.value,
      file=document.getElementById('fieldOwnerPrivateKey')?.files?.[0];
    if(!a||!/^TD-[A-F0-9]{32}$/.test(deviceId||'')||!date||!file)return UI.toast('أدخل معرّف الجهاز وتاريخ الانتهاء وحدد مفتاح التوقيع','warn');
    try {
      const license={role:'field',companyId:this.data().companyId,agentId:a.id,deviceId,expiresAt:new Date(date+'T23:59:59Z').toISOString(),issuedAt:new Date().toISOString(),nonce:FieldProtocol.uuid()};
      const token=await FieldProtocol.issueLicense(license,await file.text());
      UI.openModal(`<div class="ta-field-panel space-y-3 text-right" dir="rtl"><h3 class="font-black">رمز التفعيل الخاص بموظف البيع</h3>
        <p class="text-xs text-amber-800">أرسله إلى موظف البيع فقط. احتفظ بمفتاح التوقيع الخاص بعيدًا عن GitHub.</p>
        <textarea id="issuedFieldLicense" rows="8" dir="ltr" readonly class="w-full p-2 border rounded-xl text-[10px]">${token}</textarea>
        <button type="button" onclick="navigator.clipboard?.writeText(document.getElementById('issuedFieldLicense').value).then(()=>UI.toast('تم نسخ الرمز','success')).catch(()=>{})" class="ta-primary-3d w-full p-3 rounded-xl">نسخ الرمز</button>
        <button type="button" onclick="FieldSync.open()" class="bg-slate-100 p-3 w-full rounded-xl">رجوع</button></div>`);
    }catch(e){UI.toast('تعذر إصدار الترخيص: '+e.message,'error');}
  },
  // Start automatically once the saved company profile is loaded. No modal is required.
  async bootAutoReceiver(){
    if(this.autoReceiverBooted)return;
    this.autoReceiverBooted=true;
    try {
      const previousId=State.fieldSync?.companyId;
      this.data();
      // Persist the pairing identifier BEFORE publishing it on the local network.
      if(!previousId && StorageEngine.db)await StorageEngine.saveState();
      if(!previousId && !StorageEngine.db)throw Error('قاعدة البيانات غير جاهزة لحفظ هوية الشركة');
      this.autoReceiverCompany=this.data().companyId;
      this.startLanReceiver(true);
      this.autoReceiverWatchdog=setInterval(()=>{
        if(document.hidden||this.lanBusy)return;
        const changed=this.autoReceiverCompany!==this.data().companyId;
        if(changed){this.autoReceiverCompany=this.data().companyId;this.startLanReceiver(true,true);}
        else if(!this.lanListening)this.startLanReceiver(true,true);
      },30000);
      document.addEventListener('visibilitychange',()=>{
        if(!document.hidden)this.startLanReceiver(true,true);
      });
    }catch(e){
      this.autoReceiverBooted=false;
      console.warn('LAN auto receiver unavailable:',e);
    }
  },
  startLanReceiver(silent=false, force=false){
    const status=document.getElementById('fieldLanStatus');
    if(!window.AndroidLocalSync?.startReceiver){if(status)status.textContent='الاتصال المباشر يحتاج نسخة APK محدثة؛ استعمل ملفات التبادل مؤقتًا.';return;}
    try {
      const bridge=window.AndroidLocalSync;
      const result=force && typeof bridge.restartReceiver==='function'
        ?bridge.restartReceiver(this.data().companyId):bridge.startReceiver(this.data().companyId);
      if(result==='invalid')throw Error('لم يكتمل تجهيز اتصال أندرويد');
      if(result!=='already')this.lanListening=false;
      if(status)status.textContent=result==='already'?'✅ الاستقبال التلقائي جاهز':'جارٍ تشغيل الاستقبال التلقائي عبر Wi-Fi…';
    }catch(e){this.lanListening=false;if(status)status.textContent='تعذر فتح الاستقبال: '+e.message;if(!silent)UI.toast('تعذر تشغيل Wi-Fi المحلي','warn');}
  },
  onLanStatus(status){
    if(status==='ready'||status==='ready-no-mdns')this.lanListening=true;
    if(status==='stopped'||status==='network-down'||status.startsWith('فشل')||status.startsWith('تعذر'))this.lanListening=false;
    if(status==='network-changed' && this.autoReceiverBooted){
      clearTimeout(this.lanNetworkTimer);
      this.lanNetworkTimer=setTimeout(()=>{
        if(this.lanBusy){this.onLanStatus('network-changed');return;}
        this.startLanReceiver(true,true);
      },1800);
    }
    const label=document.getElementById('fieldLanStatus');
    if(label)label.textContent=status==='ready'?'✅ الاستقبال التلقائي يعمل — سيتم تبادل التحديثات طوال الاتصال':
      status==='ready-no-mdns'?'✅ الاستقبال المباشر يعمل، والاكتشاف عبر الراوتر محدود؛ سيستخدم الموظف البحث الاحتياطي تلقائيًا':
      status==='network-changed'?'تم رصد اتصال Wi-Fi، جارٍ إعادة الاستقبال…':status==='network-down'?'بانتظار عودة Wi-Fi…':status==='stopped'?'الاستقبال متوقف':String(status);
  },
  // Called only by Android's own local network bridge. No unverified document touches the ledger.
  async receiveLanPacket(requestId, raw){
    let answer={error:'لم يتم ترحيل العمليات؛ أعد المحاولة'},agent=null;
    try {
      if(this.busy||this.lanBusy||this.pairingBusy)throw Error('التطبيق الرئيسي مشغول؛ أعد المزامنة بعد قليل');
      this.lanBusy=true;
      const packet=JSON.parse(raw), config=this.data();
      if(packet.companyId!==config.companyId)throw Error('الشركة غير مطابقة');
      agent=config.agents.find(a=>a.id===packet.agentId&&!a.disabled&&!a.archived);
      if(!agent)throw Error('موظف البيع غير مسجل أو موقوف');
      const payload=await FieldLanCrypto.open(packet,agent.key,config.companyId,agent.id);
      if(payload.appVersion!=='3.5.158'){
        const warning='اختلاف إصدار التطبيقات: يجب تحديث جميع الأجهزة إلى الإصدار 3.5.158 قبل الاتصال أو المزامنة. لم تُنقل أي بيانات.';
        if(Date.now()-(this.lastVersionMismatchNotice||0)>60000){this.lastVersionMismatchNotice=Date.now();
          UI.toast(warning,'warn');
          try{await ManagerNotifications.addSyncNotice(warning);}catch(_){}
        }
        throw Error(warning);
      }
      if(agent.pendingWarehouseId&&config.agents.some(x=>x.id!==agent.id&&!x.archived&&!x.disabled&&(x.warehouseId===agent.pendingWarehouseId||x.pendingWarehouseId===agent.pendingWarehouseId)))
        throw Error('المستودع الجديد محجوز لموظف آخر؛ ألغِ التعارض أولًا');
      const confirmingSwitch=!!agent.pendingWarehouseId&&payload.warehouseId===agent.pendingWarehouseId;
      if(payload.kind!=='operations'||payload.companyId!==config.companyId||payload.agentId!==agent.id||
         (payload.warehouseId!==agent.warehouseId&&!confirmingSwitch)||typeof payload.nonce!=='string'||!/^[a-zA-Z0-9_-]{8,90}$/.test(payload.nonce))throw Error('بيانات موظف البيع غير مطابقة');
      // Keep the previous warehouse active until the PHONE confirms it saved the new inventory.
      const effectiveAgent=confirmingSwitch?{...agent,warehouseId:agent.pendingWarehouseId}:agent;
      const pending=this.unpostedOperations(agent,payload.operations);
      const fresh=FieldProtocol.validateOps(pending,agent.id,config.companyId,payload.warehouseId,State.items,State.accounts,(this.historyFor?.(agent)||this.data().operationHistory||[]));
      this.assertAuthorizedOps(fresh,agent);
      const count=await this.commitLanOperations(effectiveAgent,fresh);
      if(confirmingSwitch){
        const previousWarehouseId=agent.warehouseId;
        const previous={warehouseId:agent.warehouseId,pendingWarehouseId:agent.pendingWarehouseId,warehouseSwitchId:agent.warehouseSwitchId,warehouseSwitchRequestedAt:agent.warehouseSwitchRequestedAt,warehouseSwitchHistory:agent.warehouseSwitchHistory};
        agent.warehouseId=agent.pendingWarehouseId;delete agent.pendingWarehouseId;delete agent.warehouseSwitchId;delete agent.warehouseSwitchRequestedAt;
        agent.warehouseSwitchHistory=[...(agent.warehouseSwitchHistory||[]),{from:previousWarehouseId,to:agent.warehouseId,startedAt:previous.warehouseSwitchRequestedAt,at:new Date().toISOString()}];
        try{await StorageEngine.saveState();}catch(error){Object.assign(agent,previous);throw error;}
      }
      // Handover occurs only after the FINAL outbox chunk is durably committed.
      const pendingSwitch=!!agent.pendingWarehouseId&&!confirmingSwitch&&Number(payload.pendingTotal)===payload.operations.length;
      const snapshot=pendingSwitch?this.catalog({...agent,warehouseId:agent.pendingWarehouseId},0,0):
        this.catalog(agent,Math.max(0,Number(payload.historyCursor)||0),Math.max(0,Number(payload.warehouseHistoryCursor)||0));
      if(pendingSwitch){
        snapshot.warehouseSwitch={from:agent.warehouseId,to:agent.pendingWarehouseId,id:agent.warehouseSwitchId,requestedAt:agent.warehouseSwitchRequestedAt,historyCursor:0};
        snapshot.historyPage={ops:[],nextCursor:0,total:0};
      }
      const ack={kind:'sync_result',appVersion:'3.5.158',companyId:config.companyId,agentId:agent.id,accepted:count,
        knownIds:config.imported.filter(x=>x.agentId===agent.id).map(x=>x.id),catalog:snapshot,requestNonce:payload.nonce,serverAt:new Date().toISOString()};
      answer=await FieldLanCrypto.pack(ack,agent.key,config.companyId,agent.id);
      this.markConnectedAgent(agent.id);
      if(count)UI.toast('تم ترحيل '+count+' عملية من '+agent.name,'success');
      if(count && typeof AppNav!=='undefined') AppNav.refreshAfterSync?.();
      const st=document.getElementById('fieldLanStatus');if(st)st.textContent='✅ تمت المزامنة مع '+agent.name+': استلام '+count+' عملية وإرسال تحديثات السيارة والمواد والعملاء';
    }catch(e){answer={error:'تعذر ترحيل البيانات: '+e.message};
      const st=document.getElementById('fieldLanStatus');if(st)st.textContent=answer.error;
    }finally{
      this.lanBusy=false;
      if(String(requestId).startsWith('cloud:') && window.TiqanyCloudManager)
        await window.TiqanyCloudManager.reply(String(requestId).slice(6),JSON.stringify(answer));
      else window.AndroidLocalSync?.reply(String(requestId),JSON.stringify(answer));
    }
  },
  checkNewCustomers(customers,existing){
    const norm=v=>String(v||'').trim().replace(/\s+/g,' ').toLocaleLowerCase();
    const phone=v=>String(v||'').replace(/[\s()+-]/g,'');
    const seen=[...(existing||[])];
    for(const account of customers||[]){
      if(seen.some(a=>a.id===account.id))throw Error('معرّف الزبون مسجل مسبقًا؛ راجع حركة المزامنة');
      if(seen.some(a=>a.type==='customer'&&norm(a.name)===norm(account.name)&&(!a.phone||!account.phone||phone(a.phone)===phone(account.phone))))
        throw Error('الزبون «'+account.name+'» مسجل مسبقًا؛ يجب معالجة التعارض قبل المزامنة');
      seen.push(account);
    }
  },
  unpostedOperations(agent,ops){
    if(!Array.isArray(ops)||ops.length>2000)throw Error('عدد العمليات غير صالح');
    const posted=new Map(this.data().imported.map(entry=>[entry.id,entry.agentId]));
    const batch=new Set();
    return ops.filter(op=>{
      if(!op||typeof op.id!=='string'||batch.has(op.id))throw Error('معرّف مفقود أو مكرر داخل الملف');
      batch.add(op.id);
      if(!posted.has(op.id))return true;
      if(posted.get(op.id)!==agent.id)throw Error('تعارض في معرّف العملية بين موظفين');
      return false;
    });
  },
  enforceAccountScope(agent,ops){
    if(!Array.isArray(agent.allowedAccountIds))return;
    const allowed=new Set(agent.allowedAccountIds);
    const justCreated=new Set((ops||[]).filter(op=>op.kind==='customer_create').map(op=>op.account?.id).filter(Boolean));
    for(const op of ops||[]){
      const id=op.kind==='document_edit'?op.replacement?.accountId:op.accountId;
      if(id&&!allowed.has(id)&&!justCreated.has(id)&&!State.accounts.some(acc=>acc.id===id&&acc.fieldOrigin?.agentId===agent.id))
        throw Error('لا يملك موظف البيع صلاحية التعامل مع الحساب المحدد. حدّث صلاحياته من الرئيسي.');
    }
  },
  async commitLanOperations(agent,ops,mode='wifi'){
    if(!ops.length)return 0;
    this.assertAuthorizedOps(ops,agent);
    if(ops.some(op=>op.kind==='document_edit'))return this.commitOperationsWithRevisions(agent,ops,mode);
    const config=this.data(),old={items:State.items,accounts:State.accounts,invoices:State.invoices,vouchers:State.vouchers,expenses:Array.isArray(State.expenses)?State.expenses:[],imported:config.imported,events:config.events,history:config.operationHistory,exchanges:State.currencyExchanges,fxRates:State.settings.currencyExchangeRatesSyp,used:State.license.opsUsedCount};
    const existing=new Set(config.imported.map(x=>x.id));
    const fresh=ops.filter(x=>!existing.has(x.id));
    if(!fresh.length)return 0;
    this.enforceAccountScope(agent,fresh);
    if(!State.license.isActivated&&Number(State.license.opsUsedCount||0)+fresh.length>LicenseManager.MAX_TRIAL_OPS)throw Error('تجاوز الحد التجريبي للتطبيق الرئيسي');
    // Every row is validated before modifying the ledger, and a save failure rolls back every in-memory change.
    const deltas={};
    for(const op of fresh){if(!['sale','sale_return'].includes(op.kind))continue;
      for(const row of op.rows){const item=State.items.find(x=>x.id===row.itemId);const parts=item?.isBundle?item.bundleComponents:[{itemId:row.itemId,quantity:1}];for(const b of parts||[]){deltas[b.itemId]=(deltas[b.itemId]||0)+(op.kind==='sale_return'?1:-1)*row.qty/row.unitFactor*Number(b.quantity);}}
    }
    if(!State.settings.allowNegativeStockSales)for(const [id,delta] of Object.entries(deltas)){
      if(Accounting.getItemBaseStock(id,null,agent.warehouseId)+delta< -0.0001)throw Error('مخزون السيارة لا يكفي: '+(State.items.find(x=>x.id===id)?.name||id));
    }
    try {
      const ni=Math.max(0,...State.invoices.map(x=>Number(x.number)||0));
      const nv=Math.max(0,...State.vouchers.map(x=>Number(x.number)||0));
      const docs=FieldProtocol.toLedgerDocuments(fresh,agent,ni,nv);
      docs.invoices.forEach(inv=>(inv.rows||[]).forEach(row=>{const it=State.items.find(x=>x.id===row.itemId);if(it?.isBundle){const u=it.units?.find(x=>x.name===row.unitName)||it.units?.[0];row.baseCostPrice=Accounting.itemCostPrice(it,u);}}));
      if(typeof TiqanyFinance!=='undefined') for(const inv of docs.invoices) TiqanyFinance.freeze(State,inv);
      if(typeof TiqanyFinance!=='undefined') TiqanyFinance.fieldPayments(State,docs.vouchers,fresh,docs.invoices);
      this.checkNewCustomers(docs.customers,old.accounts);
      for(const item of docs.items||[]){
        if(old.items.some(x=>String(x.name).trim().toLowerCase()===String(item.name).trim().toLowerCase()||x.id===item.id))
          throw Error('المادة موجودة مسبقًا على الرئيسي؛ لم تُقبل الإضافة المكررة');
      }
      window.TiqanyFxUI?.stageAgentExchanges(fresh,agent);
      State.items=[...old.items,...(docs.items||[])];
      State.accounts=[...old.accounts,...docs.customers];
      State.invoices=[...old.invoices,...docs.invoices];State.vouchers=[...old.vouchers,...docs.vouchers];State.expenses=[...old.expenses,...docs.expenses];
      config.imported=[...old.imported,...fresh.map(x=>({id:x.id,agentId:agent.id,receivedAt:new Date().toISOString(),kind:x.kind}))];
      config.events=[...old.events,{id:FieldProtocol.uuid(),agentId:agent.id,at:new Date().toISOString(),count:fresh.length,mode}].slice(-3000);
      config.operationHistory=[...old.history,...fresh.map(op=>JSON.parse(JSON.stringify(op)))];
      if(!State.license.isActivated)State.license.opsUsedCount+=fresh.length;
      await StorageEngine.saveState();
      return fresh.length;
    }catch(e){State.items=old.items;State.accounts=old.accounts;State.invoices=old.invoices;State.vouchers=old.vouchers;State.expenses=old.expenses;config.imported=old.imported;config.events=old.events;config.operationHistory=old.history;State.currencyExchanges=old.exchanges;State.settings.currencyExchangeRatesSyp=old.fxRates;State.license.opsUsedCount=old.used;throw e;}
  },
  async previewFile(input){
    const file=input.files?.[0];if(!file)return;
    try {
      if(file.size>8_000_000)throw Error('حجم ملف عمليات موظف البيع أكبر من المسموح');
      const envelope=JSON.parse(await file.text());
      const candidate=JSON.parse(envelope.data||'null'),c=this.data();
      if(candidate?.kind!=='operations'||candidate.companyId!==c.companyId)throw Error('ملف لا يخص الشركة الحالية');
      const a=c.agents.find(x=>x.id===candidate.agentId&&!x.disabled);if(!a)throw Error('موظف البيع غير معروف أو موقوف');
      const payload=await FieldProtocol.unseal(envelope,a.key);
      if(payload.appVersion!=='3.5.158')throw Error('اختلاف إصدار التطبيقات: يجب تحديث جميع الأجهزة إلى الإصدار 3.5.158 قبل الاتصال أو المزامنة. لم تُنقل أي بيانات.');
      if(payload.warehouseId!==a.warehouseId)throw Error('مستودع ملف موظف البيع لا يطابق سجل السيارة');
      const pending=this.unpostedOperations(a,payload.operations);
      const fresh=FieldProtocol.validateOps(pending,a.id,c.companyId,a.warehouseId,State.items,State.accounts,(this.historyFor?.(a)||this.data().operationHistory||[]));
      this.assertAuthorizedOps(fresh,a);
      const invoiceCount=fresh.filter(x=>x.kind==='sale'||x.kind==='sale_return').length;
      const customers=fresh.filter(x=>x.kind==='customer_create').length;
      const revisions=fresh.filter(x=>x.kind==='document_edit').length;
      const vouchers=fresh.length-invoiceCount-customers-revisions;
      this.staged={agent:{id:a.id,key:a.key},ops:fresh,duplicates:payload.operations.length-fresh.length};
      UI.openModal(`<div class="ta-field-panel space-y-3 text-right" dir="rtl">
        <h3 class="font-black text-lg">معاينة استلام عمليات ${this.escape(a.name)}</h3>
        <p class="text-xs">السيارة: ${this.escape(a.vehicleName)} · المستودع: ${this.escape(WarehouseController.name(a.warehouseId))}</p>
        <div class="bg-slate-50 rounded-xl p-3 grid grid-cols-3 text-center gap-2">
          <div><b class="text-lg">${invoiceCount}</b><p class="text-[10px]">فواتير</p></div><div><b class="text-lg">${vouchers}</b><p class="text-[10px]">سندات ومصاريف · ${customers} زبائن جدد · ${revisions} مراجعات</p></div><div><b class="text-lg">${this.staged.duplicates}</b><p class="text-[10px]">مكررة مستبعدة</p></div>
        </div>
        <div class="max-h-48 overflow-y-auto rounded-lg border bg-white p-2 text-[11px] space-y-1">
          ${fresh.slice(0,40).map(op=>`<div class="border-b border-dashed py-1"><b>${op.kind==='sale'?'بيع':op.kind==='sale_return'?'مردود':op.kind==='receipt'?'قبض':op.kind==='expense'?'مصروف':op.kind==='customer_create'?'زبون جديد':op.kind==='document_edit'?'تعديل مستند':'دفع'} · ${this.escape(op.localNumber||op.id)}</b><span class="block">${op.kind==='customer_create'?this.escape(op.account.name):this.escape(State.accounts.find(x=>x.id===(op.kind==='document_edit'?op.replacement.accountId:op.accountId))?.name||'نقدي')}${op.kind==='customer_create'?'':' · '+(op.kind==='document_edit'?(op.replacement.netTotal??op.replacement.amount):op.kind==='sale'||op.kind==='sale_return'?op.netTotal:op.amount)+' '+op.currency}</span></div>`).join('')}
          ${fresh.length>40?'<p>تُعرض أول 40 عملية فقط؛ راجع كامل ملف البيانات قبل الاعتماد.</p>':''}
        </div>
        <p class="text-xs text-amber-800">سيتم الترحيل إلى قاعدة الشركة الحالية فقط بعد التأكيد. لا تُستبدل قاعدة بيانات الشركة.</p>
        <button type="button" ${fresh.length?'':'disabled'} onclick="FieldSync.confirmImport()" class="w-full ta-primary-3d rounded-xl p-3 font-black">اعتماد وترحيل العمليات الجديدة</button>
        <button type="button" onclick="FieldSync.open()" class="bg-slate-100 rounded-xl p-3 w-full font-bold">إلغاء</button>
      </div>`);
    }catch(e){this.staged=null;UI.toast('تعذرت المزامنة: '+e.message,'error');}
    finally{input.value='';}
  },
  async confirmImport(){
    if(this.busy||this.lanBusy||!this.staged?.ops?.length)return;
    this.busy=true;
    try {
      const {agent:preview,ops}=this.staged;
      const config=this.data();
      const agent=config.agents.find(a=>a.id===preview.id&&!a.disabled&&!a.archived);
      if(!agent||agent.key!==preview.key)throw Error('تغيّر ربط الموظف. أعد فتح ملف العمليات.');
      const fresh=this.unpostedOperations(agent,ops);
      if(!fresh.length)throw Error('سبق استلام جميع العمليات');
      const validated=FieldProtocol.validateOps(fresh,agent.id,config.companyId,agent.warehouseId,
        State.items,State.accounts,this.historyFor?.(agent)||config.operationHistory);
      const count=await this.commitLanOperations(agent,validated,'file');
      this.staged=null;
      UI.forceCloseModal();
      UI.toast('تم ترحيل '+count+' عملية من '+agent.name,'success');
      if(typeof AppNav!=='undefined')AppNav.refreshAfterSync?.();
      try {await this.exportAck(agent.id);}
      catch(error){UI.toast('حُفظت العمليات. تعذّر إرسال تأكيد الاستلام: '+error.message,'warn');}
    }catch(error){UI.toast('تعذّر اعتماد ملف العمليات: '+error.message,'error');}
    finally{this.busy=false;}
  }
};

// Presence is runtime-only and is never persisted as an online claim.
(function(){
  if(typeof document==='undefined')return;
  const init=()=>{try{FieldSync.refreshConnectedBadge();}catch(_e){};
    if(typeof setInterval==='function')setInterval(()=>{try{FieldSync.refreshConnectedBadge();}catch(_e){};},12000);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
