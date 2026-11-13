/* Manager-side field dispatch. Import is previewed, validated, deduplicated and
 * committed only after explicit approval. Never merges a whole remote database. */
const FieldSync = {
  busy:false, staged:null, lanListening:false, lanBusy:false,
  data(){
    if(!State.fieldSync || typeof State.fieldSync!=='object') State.fieldSync={companyId:'',agents:[],imported:[],events:[]};
    const x=State.fieldSync;
    if(!x.companyId)x.companyId='company_'+FieldProtocol.uuid();
    if(!Array.isArray(x.agents))x.agents=[];
    if(!Array.isArray(x.imported))x.imported=[];
    if(!Array.isArray(x.events))x.events=[];
    return x;
  },
  escape(value){return AppEscape.text(value)},
  async saveFile(name, data){
    const raw=JSON.stringify(data,null,2);
    if(window.AndroidFiles?.saveBackup){window.AndroidFiles.saveBackup(raw,name);return;}
    const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  },
  open(){
    const config=this.data(), opts=State.warehouses.map(w=>`<option value="${this.escape(w.id)}">${this.escape(w.name)}</option>`).join('');
    UI.openModal(`<div class="ta-field-panel space-y-3 text-right" dir="rtl">
      <h3 class="text-lg font-black text-slate-900"><i class="fas fa-truck ml-1 text-teal-700"></i> إدارة المندوبين والمزامنة المحلية</h3>
      <p class="text-xs text-slate-500">المزامنة المباشرة تعمل عبر Wi-Fi محلي دون إنترنت. افتح هذه الشاشة عندما يضغط المندوب على «مزامنة الآن». وتبقى الملفات طريقة احتياطية.</p>
      <div class="rounded-xl border bg-slate-50 p-3 text-xs"><b>الشركة:</b> ${this.escape(State.settings.companyName)}<br/><b>المعرّف:</b> <span class="text-[10px]" dir="ltr">${config.companyId}</span></div>
      <div class="rounded-2xl border p-3 space-y-2 bg-teal-50" data-lan-manager="1">
        <b class="text-sm">📡 استقبال المزامنة بضغطة واحدة</b>
        <p class="text-xs">وصّل الهاتفين بالشبكة المحلية نفسها، واترك التطبيق الرئيسي مفتوحًا. يستقبل هذا الهاتف عمليات المندوب المشفرة، ويتحقق منها ويرحّلها دون اختيار أي ملف.</p>
        <div id="fieldLanStatus" class="text-xs font-bold text-teal-900">جارٍ تشغيل الاستقبال…</div>
        <button type="button" class="ta-primary-3d w-full p-3 rounded-xl font-bold" onclick="FieldSync.startLanReceiver()">تشغيل / إعادة محاولة الاستقبال</button>
      </div>
      <div class="rounded-2xl border p-3 space-y-2 bg-white">
        <b class="text-sm">تسجيل سيارة / مندوب</b>
        <input id="fieldNewAgent" class="w-full border rounded-xl p-3" placeholder="اسم المندوب" maxlength="70"/>
        <input id="fieldNewVehicle" class="w-full border rounded-xl p-3" placeholder="اسم السيارة / خط التوزيع" maxlength="70"/>
        <select id="fieldNewWarehouse" class="w-full border rounded-xl p-3">${opts}</select>
        <p class="text-[11px] text-amber-800">أنشئ مستودع سيارة مستقلًا، وحمّله بالمخزون من شاشة المناقلات قبل بدء البيع.</p>
        <button type="button" onclick="FieldSync.addAgent()" class="ta-primary-3d w-full p-3 rounded-xl font-black">إضافة مندوب معتمد</button>
      </div>
      <div class="rounded-2xl border p-3 space-y-2 bg-white"><b class="text-sm">المندوبون المسجلون</b>
         ${config.agents.filter(a=>!a.archived).length? config.agents.filter(a=>!a.archived).map(a=>`<div class="rounded-xl bg-slate-50 border p-3 space-y-2">
             <div class="flex justify-between gap-2"><span class="font-bold">${this.escape(a.name)} · ${this.escape(a.vehicleName||'')}</span><span class="text-[10px]">${a.disabled?'موقوف':'معتمد'}</span></div>
             <p class="text-[10px] text-slate-500">${this.escape(WarehouseController.name(a.warehouseId))}</p>
             <div class="grid grid-cols-2 gap-2">
               <button type="button" class="rounded-lg bg-teal-700 text-white p-2 font-bold" onclick="FieldSync.exportProvision('${a.id}')">تجهيز بيانات المندوب</button>
               <button type="button" class="rounded-lg bg-blue-700 text-white p-2 font-bold" onclick="FieldSync.exportAck('${a.id}')">تأكيد الاستلام</button>
               <button type="button" class="rounded-lg bg-amber-100 p-2 font-bold col-span-2" onclick="FieldSync.showActivation('${a.id}')">إصدار كود تفعيل لجهاز المندوب</button>
               <button type="button" class="rounded-lg bg-slate-200 text-slate-800 p-2 font-bold col-span-2" onclick="FieldSync.toggleAgent('${a.id}')">${a.disabled?'إعادة السماح بالمزامنة':'إيقاف استقبال عمليات هذا المندوب'}</button>
               <button type="button" class="rounded-lg bg-blue-100 text-blue-900 p-2 font-black" onclick="FieldSync.showEditAgent('${a.id}')">✎ تعديل المندوب</button>
               <button type="button" class="rounded-lg bg-rose-100 text-rose-800 p-2 font-black" onclick="FieldSync.confirmRemoveAgent('${a.id}')">× حذف المندوب</button>
             </div></div>`).join(''):'<p class="text-xs text-slate-500">لا يوجد مندوبون حتى الآن.</p>'}
      </div>
      ${config.agents.some(a=>a.archived)?`<div class="rounded-xl border bg-rose-50 p-3 text-xs"><strong>مندوبون محذوفون (أرشيف)</strong><p class="mt-1">تبقى سجلاتهم التاريخية محفوظة لمنع ضياع الفواتير والسندات.</p>${config.agents.filter(a=>a.archived).map(a=>`<div class="flex justify-between items-center py-2 border-b"><span>${this.escape(a.name)}</span><button type="button" class="bg-white border px-2 py-1 rounded" onclick="FieldSync.restoreAgent('${a.id}')">استعادة المندوب</button></div>`).join('')}</div>`:''}
      <div class="rounded-2xl border p-3 bg-emerald-50 space-y-2">
        <b class="text-sm">استلام عمليات المندوب</b>
        <p class="text-xs">اختر ملف العمليات الوارد من هاتف المندوب. ستظهر معاينة قبل أي ترحيل.</p>
        <input id="fieldImportFile" type="file" accept="application/json,.json" onchange="FieldSync.previewFile(this)" class="w-full text-xs"/>
        <b class="text-[11px]">العمليات المستلمة حتى الآن: ${config.imported.length}</b>
        ${config.events.slice(-4).reverse().map(x=>`<div class="text-[11px] border-b border-emerald-100 py-1">${this.escape(config.agents.find(a=>a.id===x.agentId)?.name||'مندوب')}: ${x.count} عملية · ${x.at.slice(0,16).replace('T',' ')}</div>`).join('')}
      </div>
      <button type="button" onclick="UI.forceCloseModal()" class="w-full rounded-xl bg-slate-100 p-3 font-bold">إغلاق</button>
    </div>`);
    if(window.AndroidLocalSync) this.startLanReceiver(true);
  },
  async addAgent(){
    const name=document.getElementById('fieldNewAgent')?.value.trim(), vehicleName=document.getElementById('fieldNewVehicle')?.value.trim();
    const warehouseId=document.getElementById('fieldNewWarehouse')?.value;
    if(!name||name.length<2||!warehouseId)return UI.toast('اكتب اسم المندوب واختر المستودع','warn');
    if(this.data().agents.some(a=>a.warehouseId===warehouseId && !a.disabled))return UI.toast('المستودع مربوط بمندوب آخر؛ خصص مستودع سيارة مستقلًا','warn');
    const key=new Uint8Array(32);crypto.getRandomValues(key);
    const a={id:'agent_'+FieldProtocol.uuid(),name,vehicleName:vehicleName||name,warehouseId,key:FieldProtocol.b64u(key),createdAt:new Date().toISOString(),disabled:false};
    this.data().agents.push(a);
    try { await StorageEngine.saveState();this.open();UI.toast('تم إنشاء هوية المندوب. صدّر ملف التجهيز','success'); }
    catch(e){this.data().agents=this.data().agents.filter(x=>x.id!==a.id);UI.toast('فشل حفظ المندوب: '+e.message,'error');}
  },
  catalog(a){
    const config=this.data();
    const known=config.imported.filter(i=>i.agentId===a.id).map(i=>i.id);
    return {kind:'provision',format:FieldProtocol.FORMAT,companyId:config.companyId,companyName:State.settings.companyName,agentId:a.id,agentName:a.name,vehicleName:a.vehicleName,warehouseId:a.warehouseId,key:a.key,
      issuedAt:new Date().toISOString(),exchangeRate:Number(State.settings.exchangeRate),
      categories:(State.categories||[]).slice(),
      items:State.items.map(it=>({id:it.id,name:it.name,category:it.category||'',barcode:it.barcode||'',currency:it.currency,units:(it.units||[]).map(u=>({name:u.name,factor:u.factor,salePrice:u.salePrice}))})),
      accounts:State.accounts.filter(acc=>acc.type==='customer').map(acc=>({id:acc.id,name:acc.name,type:acc.type})),
      stock:Object.fromEntries(State.items.map(it=>[it.id,Accounting.getItemBaseStock(it.id,null,a.warehouseId)])),
      knownIds:known};
  },
  showEditAgent(id){
    const a=this.data().agents.find(x=>x.id===id&&!x.archived);if(!a)return;
    UI.openModal(`<div class="ta-field-panel space-y-3 text-right" dir="rtl">
      <h3 class="text-base font-black">تعديل بيانات المندوب</h3>
      <p class="text-xs text-slate-600">تعديل الاسم والسيارة لا يغيّر فواتير المندوب المرحّلة سابقًا. أرسل كشف تجهيز جديدًا بعد الحفظ.</p>
      <label class="text-xs font-black">اسم المندوب</label><input id="editFieldAgentName" class="w-full border rounded-xl p-3" maxlength="70" value="${this.escape(a.name)}"/>
      <label class="text-xs font-black">السيارة / خط التوزيع</label><input id="editFieldAgentVehicle" class="w-full border rounded-xl p-3" maxlength="70" value="${this.escape(a.vehicleName||'')}"/>
      <div class="bg-slate-100 rounded-xl p-2 text-xs">مستودع السيارة: ${this.escape(WarehouseController.name(a.warehouseId))} — ثابت لحماية جرد العمليات</div>
      <button type="button" class="ta-primary-3d w-full p-3 rounded-xl" onclick="FieldSync.saveAgentEdit('${a.id}')">حفظ التعديل</button>
      <button type="button" class="rounded-xl p-2 w-full bg-slate-100" onclick="FieldSync.open()">رجوع</button>
    </div>`);
  },
  async saveAgentEdit(id){
    const a=this.data().agents.find(x=>x.id===id&&!x.archived);if(!a)return;
    const name=String(document.getElementById('editFieldAgentName')?.value||'').trim();
    const vehicleName=String(document.getElementById('editFieldAgentVehicle')?.value||'').trim();
    if(name.length<2||name.length>70||vehicleName.length>70)return UI.toast('اسم المندوب يجب أن يكون بين حرفين و70 حرفًا','warn');
    const original={name:a.name,vehicleName:a.vehicleName};a.name=name;a.vehicleName=vehicleName||name;
    try{await StorageEngine.saveState();this.open();UI.toast('حُفظ التعديل. أرسل كشف تجهيز جديدًا إلى هاتف المندوب','success');}
    catch(e){Object.assign(a,original);UI.toast('لم يُحفظ تعديل المندوب: '+e.message,'error');}
  },
  confirmRemoveAgent(id){
    const a=this.data().agents.find(x=>x.id===id&&!x.archived);if(!a)return;
    const imported=this.data().imported.filter(x=>x.agentId===id).length;
    UI.openModal(`<div class="ta-field-panel space-y-3 text-right" dir="rtl">
      <h3 class="text-lg font-black text-rose-800">حذف المندوب: ${this.escape(a.name)}</h3>
      <p class="text-xs text-rose-800">سيُمنع استقبال عمليات جديدة من هذا المندوب، ويُخفى من القائمة النشطة. ستبقى سجلاته وسنداته المرحّلة (${imported}) محفوظة في الأرشيف لأغراض التدقيق.</p>
      <p class="text-xs text-amber-800">لا يمكن سحب الترخيص فورًا من هاتف يعمل دون اتصال؛ المنع يُطبق عند محاولة المزامنة.</p>
      <button type="button" class="w-full bg-rose-700 text-white p-3 rounded-xl font-black" onclick="FieldSync.removeAgent('${a.id}')">تأكيد الحذف الآمن</button>
      <button type="button" class="w-full bg-slate-100 p-3 rounded-xl" onclick="FieldSync.open()">إلغاء</button>
    </div>`);
  },
  async removeAgent(id){
    const a=this.data().agents.find(x=>x.id===id&&!x.archived);if(!a)return;
    const old={archived:a.archived,disabled:a.disabled,deletedAt:a.deletedAt};
    a.archived=true;a.disabled=true;a.deletedAt=new Date().toISOString();
    try{await StorageEngine.saveState();this.open();UI.toast('حُذف المندوب من القائمة النشطة مع حفظ الأرشيف','success');}
    catch(e){Object.assign(a,old);UI.toast('تعذر حذف المندوب: '+e.message,'error');}
  },
  async restoreAgent(id){
    const a=this.data().agents.find(x=>x.id===id&&x.archived);if(!a)return;
    if(this.data().agents.some(x=>!x.archived&&!x.disabled&&x.warehouseId===a.warehouseId))return UI.toast('مستودع السيارة مرتبط بمندوب آخر','warn');
    const old={archived:a.archived,disabled:a.disabled,deletedAt:a.deletedAt};a.archived=false;a.disabled=false;a.deletedAt=null;
    try{await StorageEngine.saveState();this.open();UI.toast('تمت استعادة المندوب','success');}
    catch(e){Object.assign(a,old);UI.toast('فشلت استعادة المندوب','error');}
  },
  async toggleAgent(id){
    const a=this.data().agents.find(x=>x.id===id&&!x.archived);if(!a)return;
    const old=a.disabled;a.disabled=!a.disabled;
    try{await StorageEngine.saveState();this.open();UI.toast(a.disabled?'توقف استقبال العمليات من هذا المندوب حتى إعادة السماح':'تم إعادة السماح بالمزامنة','info');}
    catch(e){a.disabled=old;UI.toast('فشل حفظ صلاحية المندوب','error');}
  },
  async exportProvision(id){
    const a=this.data().agents.find(x=>x.id===id&&!x.disabled);if(!a)return UI.toast('المندوب غير موجود','error');
    try {
      await StorageEngine.saveState();
      const envelope=await FieldProtocol.seal(this.catalog(a),a.key);
      // Provision contains an authentication key: share privately and not through public sites.
      await this.saveFile('TA_Provision_'+a.id+'.json',envelope);
      UI.toast('ملف تجهيز المندوب جاهز للحفظ والإرسال الخاص','success');
    }catch(e){UI.toast(e.message,'error');}
  },
  async exportAck(id){
    const c=this.data(),a=c.agents.find(x=>x.id===id);if(!a)return;
    const payload={kind:'ack',companyId:c.companyId,agentId:a.id,knownIds:c.imported.filter(x=>x.agentId===id).map(x=>x.id),issuedAt:new Date().toISOString()};
    await this.saveFile('TA_ACK_'+a.id+'.json',await FieldProtocol.seal(payload,a.key));
  },
  showActivation(id){
    const a=this.data().agents.find(x=>x.id===id);if(!a)return;
    UI.openModal(`<div class="ta-field-panel space-y-3 text-right" dir="rtl">
       <h3 class="text-base font-black">إصدار تفعيل المندوب: ${this.escape(a.name)}</h3>
       <p class="text-xs text-slate-600">انسخ رمز جهاز المندوب من تطبيقه. اختر ملف مفتاح التفعيل الخاص بك (PEM)، ولن يُحفظ داخل التطبيق أو يرفع إلى أي خادم.</p>
       <input id="fieldDeviceId" placeholder="معرّف جهاز المندوب" dir="ltr" class="w-full p-3 border rounded-xl text-xs"/>
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
      UI.openModal(`<div class="ta-field-panel space-y-3 text-right" dir="rtl"><h3 class="font-black">رمز التفعيل الخاص بالمندوب</h3>
        <p class="text-xs text-amber-800">أرسله إلى المندوب فقط. احتفظ بمفتاح التوقيع الخاص بعيدًا عن GitHub.</p>
        <textarea id="issuedFieldLicense" rows="8" dir="ltr" readonly class="w-full p-2 border rounded-xl text-[10px]">${token}</textarea>
        <button type="button" onclick="navigator.clipboard?.writeText(document.getElementById('issuedFieldLicense').value).then(()=>UI.toast('تم نسخ الرمز','success')).catch(()=>{})" class="ta-primary-3d w-full p-3 rounded-xl">نسخ الرمز</button>
        <button type="button" onclick="FieldSync.open()" class="bg-slate-100 p-3 w-full rounded-xl">رجوع</button></div>`);
    }catch(e){UI.toast('تعذر إصدار الترخيص: '+e.message,'error');}
  },
  startLanReceiver(silent=false){
    const status=document.getElementById('fieldLanStatus');
    if(!window.AndroidLocalSync?.startReceiver){if(status)status.textContent='الاتصال المباشر يحتاج نسخة APK محدثة؛ استعمل ملفات التبادل مؤقتًا.';return;}
    try {
      const result=window.AndroidLocalSync.startReceiver(this.data().companyId);
      if(status)status.textContent=result==='already'?'✅ جاهز لاستقبال المندوب على Wi-Fi':'جارٍ تشغيل الاستقبال على Wi-Fi…';
    }catch(e){if(status)status.textContent='تعذر فتح الاستقبال: '+e.message;if(!silent)UI.toast('تعذر تشغيل Wi-Fi المحلي','warn');}
  },
  onLanStatus(status){
    const label=document.getElementById('fieldLanStatus');
    if(label)label.textContent=status==='ready'?'✅ الاستقبال جاهز — يمكن للمندوب الضغط على «مزامنة الآن»':status==='stopped'?'الاستقبال متوقف':String(status);
  },
  // Called only by Android's own local network bridge. No unverified document touches the ledger.
  async receiveLanPacket(requestId, raw){
    let answer={error:'لم يتم ترحيل العمليات؛ أعد المحاولة'},agent=null;
    try {
      if(this.busy||this.lanBusy)throw Error('التطبيق الرئيسي مشغول بعملية أخرى');
      this.lanBusy=true;
      const packet=JSON.parse(raw), config=this.data();
      if(packet.companyId!==config.companyId)throw Error('الشركة غير مطابقة');
      agent=config.agents.find(a=>a.id===packet.agentId&&!a.disabled&&!a.archived);
      if(!agent)throw Error('المندوب غير مسجل أو موقوف');
      const payload=await FieldLanCrypto.open(packet,agent.key,config.companyId,agent.id);
      if(payload.kind!=='operations'||payload.companyId!==config.companyId||payload.agentId!==agent.id||payload.warehouseId!==agent.warehouseId||typeof payload.nonce!=='string'||!/^[a-zA-Z0-9_-]{8,90}$/.test(payload.nonce))throw Error('بيانات المندوب غير مطابقة');
      const all=FieldProtocol.validateOps(payload.operations,agent.id,config.companyId,agent.warehouseId,State.items,State.accounts);
      const known=new Set(config.imported.map(x=>x.id));
      const fresh=all.filter(x=>!known.has(x.id));
      const count=await this.commitLanOperations(agent,fresh);
      // Response generated only after the app database reports successful commit.
      const snapshot=this.catalog(agent);
      const ack={kind:'sync_result',companyId:config.companyId,agentId:agent.id,accepted:count,
        knownIds:config.imported.filter(x=>x.agentId===agent.id).map(x=>x.id),catalog:snapshot,requestNonce:payload.nonce,serverAt:new Date().toISOString()};
      answer=await FieldLanCrypto.pack(ack,agent.key,config.companyId,agent.id);
      if(count)UI.toast('تم ترحيل '+count+' عملية من '+agent.name,'success');
      const st=document.getElementById('fieldLanStatus');if(st)st.textContent='✅ آخر استقبال: '+count+' عملية من '+agent.name;
    }catch(e){answer={error:'تعذر ترحيل البيانات: '+e.message};
      const st=document.getElementById('fieldLanStatus');if(st)st.textContent=answer.error;
    }finally{
      this.lanBusy=false;
      window.AndroidLocalSync?.reply(String(requestId),JSON.stringify(answer));
    }
  },
  async commitLanOperations(agent,ops){
    if(!ops.length)return 0;
    const config=this.data(),old={invoices:State.invoices,vouchers:State.vouchers,imported:config.imported,events:config.events,used:State.license.opsUsedCount};
    const existing=new Set(config.imported.map(x=>x.id));
    const fresh=ops.filter(x=>!existing.has(x.id));
    if(!fresh.length)return 0;
    if(!State.license.isActivated&&Number(State.license.opsUsedCount||0)+fresh.length>LicenseManager.MAX_TRIAL_OPS)throw Error('تجاوز الحد التجريبي للتطبيق الرئيسي');
    // Every row is validated before modifying the ledger, and a save failure rolls back every in-memory change.
    const deltas={};
    for(const op of fresh){if(!['sale','sale_return'].includes(op.kind))continue;
      for(const row of op.rows)deltas[row.itemId]=(deltas[row.itemId]||0)+(op.kind==='sale_return'?1:-1)*row.qty/row.unitFactor;
    }
    if(!State.settings.allowNegativeStockSales)for(const [id,delta] of Object.entries(deltas)){
      if(Accounting.getItemBaseStock(id,null,agent.warehouseId)+delta< -0.0001)throw Error('مخزون السيارة لا يكفي: '+(State.items.find(x=>x.id===id)?.name||id));
    }
    try {
      const ni=Math.max(0,...State.invoices.map(x=>Number(x.number)||0));
      const nv=Math.max(0,...State.vouchers.map(x=>Number(x.number)||0));
      const docs=FieldProtocol.toLedgerDocuments(fresh,agent,ni,nv);
      State.invoices=[...old.invoices,...docs.invoices];State.vouchers=[...old.vouchers,...docs.vouchers];
      config.imported=[...old.imported,...fresh.map(x=>({id:x.id,agentId:agent.id,receivedAt:new Date().toISOString(),kind:x.kind}))];
      config.events=[...old.events,{id:FieldProtocol.uuid(),agentId:agent.id,at:new Date().toISOString(),count:fresh.length,mode:'wifi'}].slice(-3000);
      if(!State.license.isActivated)State.license.opsUsedCount+=fresh.length;
      await StorageEngine.saveState();
      return fresh.length;
    }catch(e){State.invoices=old.invoices;State.vouchers=old.vouchers;config.imported=old.imported;config.events=old.events;State.license.opsUsedCount=old.used;throw e;}
  },
  async previewFile(input){
    const file=input.files?.[0];if(!file)return;
    try {
      if(file.size>8_000_000)throw Error('حجم ملف عمليات المندوب أكبر من المسموح');
      const envelope=JSON.parse(await file.text());
      const candidate=JSON.parse(envelope.data||'null'),c=this.data();
      if(candidate?.kind!=='operations'||candidate.companyId!==c.companyId)throw Error('ملف لا يخص الشركة الحالية');
      const a=c.agents.find(x=>x.id===candidate.agentId&&!x.disabled);if(!a)throw Error('المندوب غير معروف أو موقوف');
      const payload=await FieldProtocol.unseal(envelope,a.key);
      if(payload.warehouseId!==a.warehouseId)throw Error('مستودع ملف المندوب لا يطابق سجل السيارة');
      const all=FieldProtocol.validateOps(payload.operations,a.id,c.companyId,a.warehouseId,State.items,State.accounts);
      const known=new Set(c.imported.map(x=>x.id));
      const fresh=all.filter(x=>!known.has(x.id));
      const invoiceCount=fresh.filter(x=>x.kind==='sale'||x.kind==='sale_return').length;
      const vouchers=fresh.length-invoiceCount;
      this.staged={agent:a,ops:fresh,duplicates:all.length-fresh.length};
      UI.openModal(`<div class="ta-field-panel space-y-3 text-right" dir="rtl">
        <h3 class="font-black text-lg">معاينة استلام عمليات ${this.escape(a.name)}</h3>
        <p class="text-xs">السيارة: ${this.escape(a.vehicleName)} · المستودع: ${this.escape(WarehouseController.name(a.warehouseId))}</p>
        <div class="bg-slate-50 rounded-xl p-3 grid grid-cols-3 text-center gap-2">
          <div><b class="text-lg">${invoiceCount}</b><p class="text-[10px]">فواتير</p></div><div><b class="text-lg">${vouchers}</b><p class="text-[10px]">سندات</p></div><div><b class="text-lg">${this.staged.duplicates}</b><p class="text-[10px]">مكررة مستبعدة</p></div>
        </div>
        <div class="max-h-48 overflow-y-auto rounded-lg border bg-white p-2 text-[11px] space-y-1">
          ${fresh.slice(0,40).map(op=>`<div class="border-b border-dashed py-1"><b>${op.kind==='sale'?'بيع':op.kind==='sale_return'?'مردود':op.kind==='receipt'?'قبض':'دفع'} · ${this.escape(op.localNumber||op.id)}</b><span class="block">${this.escape(State.accounts.find(x=>x.id===op.accountId)?.name||'نقدي')} · ${op.kind==='sale'||op.kind==='sale_return'?op.netTotal:op.amount} ${op.currency}</span></div>`).join('')}
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
    const {agent,ops}=this.staged,c=this.data();
    const old={invoices:State.invoices,vouchers:State.vouchers,imported:c.imported,events:c.events,opsUsedCount:State.license.opsUsedCount};
    try {
      const known=new Set(c.imported.map(x=>x.id));
      const fresh=ops.filter(x=>!known.has(x.id));
      if(!fresh.length)throw Error('سبق استلام جميع العمليات');
      if(!State.license.isActivated && Number(State.license.opsUsedCount||0)+fresh.length>LicenseManager.MAX_TRIAL_OPS)throw Error('وصلت إلى حد النسخة التجريبية؛ يلزم تفعيل التطبيق الرئيسي');
      // Validate stock as a batch, before changing State. Vehicle stock is not deducted twice.
      const deltas={};
      for(const op of fresh){if(!['sale','sale_return'].includes(op.kind))continue;
        for(const row of op.rows){deltas[row.itemId]=(deltas[row.itemId]||0)+(op.kind==='sale_return'?1:-1)*row.qty/row.unitFactor;}}
      if(!State.settings.allowNegativeStockSales){for(const [id,delta] of Object.entries(deltas)){
        const stock=Accounting.getItemBaseStock(id,null,agent.warehouseId);
        if(stock+delta < -0.0001)throw Error('رصيد سيارة المندوب غير كافٍ للمادة: '+(State.items.find(x=>x.id===id)?.name||id));}}
      const latestInvoice=Math.max(0,...State.invoices.map(x=>Number(x.number)||0));
      const latestVoucher=Math.max(0,...State.vouchers.map(x=>Number(x.number)||0));
      const docs=FieldProtocol.toLedgerDocuments(fresh,agent,latestInvoice,latestVoucher);
      State.invoices=[...old.invoices,...docs.invoices];State.vouchers=[...old.vouchers,...docs.vouchers];
      c.imported=[...old.imported,...fresh.map(x=>({id:x.id,agentId:agent.id,receivedAt:new Date().toISOString(),kind:x.kind}))];
      c.events=[...old.events,{id:FieldProtocol.uuid(),agentId:agent.id,at:new Date().toISOString(),count:fresh.length}].slice(-3000);
      if(!State.license.isActivated)State.license.opsUsedCount+=fresh.length;
      await StorageEngine.saveState();
      this.staged=null;UI.forceCloseModal();UI.toast('تم استلام وترحيل '+fresh.length+' عملية باسم '+agent.name,'success');
      // Let owner transfer ACK back to agent through Quick Share / Bluetooth.
      await this.exportAck(agent.id);
    }catch(e){State.invoices=old.invoices;State.vouchers=old.vouchers;c.imported=old.imported;c.events=old.events;State.license.opsUsedCount=old.opsUsedCount;UI.toast('لم يتم ترحيل البيانات: '+e.message,'error');}
    finally{this.busy=false;}
  }
};
