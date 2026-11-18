/* v3.5.128: first-run identity, complete data reset and conflict-preserving backup */
(function installLifecycle128() {
  'use strict';
  const OLD_PLACEHOLDER='مؤسسة الرائد التجارية';
  const $ = (id) => document.getElementById(id);
  const clone=(value)=>JSON.parse(JSON.stringify(value));
  const lifecycle={
    busy:false,
    needsSetup() {
      const s=State.settings||{};
      if(s.companySetupCompleted===true)return false;
      const name=String(s.companyName||'').trim();
      if(name && name!==OLD_PLACEHOLDER)return false; // existing real company: never interrupt upgrades
      if(s.appProtection?.pinHash)return false; // legacy password-protected businesses retain their existing identity
      return true;
    },
    showIfRequired() {this.installCapitalNotificationHandler();if(this.needsSetup())this.show();},
    installCapitalNotificationHandler(){
      if(typeof ManagerNotifications==='undefined'||typeof ManagerNotifications.open!=='function'||
        ManagerNotifications._capitalSetupHandler153)return;
      const oldOpen=ManagerNotifications.open;
      ManagerNotifications.open=async function(id){
        const entry=this.ensure().entries.find(x=>x.id===id);
        if(entry?.type==='capital-setup'){
          if(!entry.read){
            entry.read=true;this.updateBadge();
            try{await StorageEngine.saveState();}catch(err){entry.read=false;this.updateBadge();}
          }
          if(window.ShareholdersUI?.operationForm){
            window.ShareholdersUI.operationForm(entry.ownerId,'contribution');return;
          }
        }
        return oldOpen.call(this,id);
      };
      ManagerNotifications._capitalSetupHandler153=true;
    },
    show() {
      if($('ta-company-setup-128'))return;
      const overlay=document.createElement('div');
      overlay.id='ta-company-setup-128';
      overlay.setAttribute('dir','rtl');
      overlay.setAttribute('role','dialog');
      overlay.setAttribute('aria-modal','true');
      overlay.setAttribute('aria-label','بيانات الشركة عند التشغيل الأول');
      overlay.style.cssText='position:fixed;inset:0;z-index:2147483646;background:#eaf4fb;overflow-y:auto;display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit;color:#102b43';
      overlay.innerHTML=`
        <form id="ta-company-setup-form-128" style="width:min(100%,490px);padding:24px;border:1px solid #8ac8e5;border-radius:24px;background:white;box-shadow:0 18px 50px #15395c45" onsubmit="event.preventDefault();window.CompanyLifecycle.saveFirstRun()">
          <div style="text-align:center;font-size:34px;margin:4px 0 8px" aria-hidden="true">🏢</div>
          <h2 style="font-size:21px;font-weight:900;margin:0 0 9px;text-align:center">بيانات الشركة</h2>
          <p style="color:#436175;font-size:13px;margin-bottom:21px;text-align:center">أدخل بيانات شركتك عند بدء استخدام المحاسب التقني. لن يتم إنشاء عمليات قبل حفظ البيانات.</p>
          <label for="ta-company-name-128" style="font-weight:800;display:block;margin:12px 0 6px">اسم الشركة</label>
          <input id="ta-company-name-128" required autocomplete="organization" maxlength="75" minlength="2" placeholder="أدخل اسم شركتك" style="width:100%;box-sizing:border-box;border:1px solid #a6bfd1;border-radius:12px;padding:13px;background:#f8fcff;color:#123;font:inherit"/>
          <label for="ta-owner-name-153" style="font-weight:800;display:block;margin:12px 0 6px">اسم المالك (المدير)</label>
          <input id="ta-owner-name-153" required maxlength="120" minlength="2" autocomplete="name" placeholder="أدخل اسم المالك" style="width:100%;box-sizing:border-box;border:1px solid #a6bfd1;border-radius:12px;padding:13px;background:#f8fcff;color:#123;font:inherit"/>
          <p style="font-size:12px;color:#597287;margin-top:10px">يمكنك إضافة رقم هاتف الشركة وعنوانها لاحقاً من الضبط.</p>
          <p id="ta-company-error-128" role="alert" style="display:none;color:#b91c1c;font-size:12px;margin-top:10px"></p>
          <button id="ta-company-save-128" type="submit" style="width:100%;margin-top:16px;padding:15px;border-radius:14px;border:1px solid #047857;background:linear-gradient(#10b981,#047857);color:white;font-size:16px;font-weight:900;box-shadow:0 4px 0 #065f46">حفظ بيانات الشركة والبدء</button>
          <button type="button" onclick="window.CompanyLifecycle.openManagerPhonePair()"
            style="width:100%;margin-top:12px;padding:13px;border-radius:13px;border:1px solid #0284c7;background:linear-gradient(#e0f2fe,#7dd3fc);color:#075985;font-size:14px;font-weight:900">
            لدي موبايل مدير فيه بيانات — مزامنة أجهزة مدير
          </button>
          <button type="button" onclick="window.CompanyLifecycle.openPairingFirst()"
            style="width:100%;margin-top:14px;padding:13px;border-radius:13px;border:1px solid #0284c7;background:linear-gradient(#e0f2fe,#7dd3fc);color:#075985;font-size:14px;font-weight:900">
            لدي جهاز مدير فيه بيانات — الربط واستيراد الشركة بدلاً من إدخالها
          </button>
        </form>`;
      document.body.appendChild(overlay);
      // Keep the keyboard closed until the user selects an input.
    },
    openManagerPhonePair() {
      // User explicitly chose import from a populated Android manager.
      document.getElementById('ta-company-setup-128')?.remove();
      try{
        window.TiqanyManagerSync?.openSettings();
        UI.toast('اعرض رمز QR في موبايل المدير الذي يحتوي البيانات ثم امسحه هنا واضغط مزامنة الآن','success');
      }catch(e){
        this.show();UI.toast('تعذر فتح مزامنة أجهزة المدير: '+String(e?.message||e),'error');
      }
    },
    openPairingFirst() {
      // Do not create a dummy business just to access the existing encrypted QR pairing screen.
      $('ta-company-setup-128')?.remove();
      try {
        AppNav.navigate('settings',{},true);
        UI.toast('افتح «مزامنة الموبايل والكمبيوتر» واقرن الجهاز الموجود ثم اختر مزامنة الآن','success');
        if(window.TiqanyPeerSync?.requestHeaderAccess)
          setTimeout(()=>window.TiqanyPeerSync.requestHeaderAccess(),180);
      } catch(error) {
        this.show();
        UI.toast('تعذّر فتح الربط: '+String(error?.message||error),'error');
      }
    },
    openCapitalFromReminder(){
      const id=String(State.settings?.capitalSetupReminderOwnerId||'');
      const found=(State.shareholderOwners||[]).find(o=>o.id===id);
      if(!found)return UI.toast('لم يُعثر على المساهم الأول','warn');
      UI.forceCloseModal();
      ShareholdersUI.operationForm(found.id,'contribution');
    },
    showCapitalReminder(){
      const id=String(State.settings?.capitalSetupReminderOwnerId||'');
      if(!(State.shareholderOwners||[]).some(o=>o.id===id))return;
      UI.openModal('<div dir="rtl" class="text-right space-y-3">'+
       '<h3 class="text-lg font-black text-slate-900">إضافة رأس المال الافتتاحي</h3>'+
       '<p class="text-sm">تمت إضافة المالك مديراً بنسبة أرباح 100%. يرجى إدخال مبالغ رأس المال لتسجيل الأرصدة الافتتاحية.</p>'+
       '<button type="button" class="w-full rounded-xl bg-emerald-700 text-white font-black p-3" onclick="CompanyLifecycle.openCapitalFromReminder()">إضافة مبلغ إلى رأس المال</button>'+
       '<button type="button" class="w-full rounded-xl bg-slate-100 font-bold p-3" onclick="UI.forceCloseModal()">لاحقاً</button></div>');
    },
    async saveFirstRun() {
      if(this.busy)return;
      const name=String($('ta-company-name-128')?.value||'').trim();
      const ownerName=String($('ta-owner-name-153')?.value||'').trim();
      const message=$('ta-company-error-128');
      const error=(text)=>{if(message){message.textContent=text;message.style.display='block';}};
      if(name.length<2||name.length>75||name===OLD_PLACEHOLDER)return error('أدخل اسم الشركة الحقيقي (من 2 إلى 75 حرفاً)');
      if(ownerName.length<2||ownerName.length>120)return error('اسم المالك مطلوب (من 2 إلى 120 حرفاً)');
      if(!StorageEngine.db)return error('قاعدة البيانات غير متاحة. لا يمكن حفظ البيانات حالياً');
      if(typeof TiqanyShareholders==='undefined'||typeof TiqanyShareholders.addOwnerWithDistribution!=='function')
        return error('محرك المساهمين غير متاح. لا يمكن إكمال إنشاء الشركة');
      this.busy=true;
      const button=$('ta-company-save-128');
      if(button)button.disabled=true;
      const previousSettings=clone(State.settings),previousOwners=clone(State.shareholderOwners||[]);
      const previousAlerts=clone(State.alertCenter||{entries:[]});
      let notice=null;
      try {
        // A new company must start with a single, properly allocated owner.
        if((State.shareholderOwners||[]).length)throw Error('توجد بيانات مساهمين بالفعل؛ استخدم استعادة البيانات بدلاً من إنشاء شركة جديدة');
        State.settings.companyName=name;
        State.settings.companyPhone=String(State.settings.companyPhone||'');
        State.settings.companyAddress=String(State.settings.companyAddress||'');
        State.settings.companySetupCompleted=true;
        const created=TiqanyShareholders.addOwnerWithDistribution(State,
          {name:ownerName,role:'manager',percentage:100,period:'all'},
          {deviceId:'initial-company-setup'});
        State.settings.capitalSetupReminderOwnerId=created.id;
        if(!State.alertCenter||typeof State.alertCenter!=='object')State.alertCenter={entries:[]};
        if(!Array.isArray(State.alertCenter.entries))State.alertCenter.entries=[];
        notice={id:'capital-setup-'+created.id,type:'capital-setup',ownerId:created.id,
          title:'أدخل رأس المال الافتتاحي',detail:'اضغط لإضافة مبلغ إلى رأس مال الشركة',
          at:new Date().toISOString(),read:false};
        State.alertCenter.entries.unshift(notice);
        await StorageEngine.saveState();
        $('ta-company-setup-128')?.remove();
        AppNav.renderCurrent();
        if(typeof ManagerNotifications!=='undefined'){
          this.installCapitalNotificationHandler();
          ManagerNotifications.bootstrap();
          ManagerNotifications.saved([notice]);
        }
        if(typeof StockNotifications!=='undefined')StockNotifications.bootstrap();
        if(typeof FieldSync!=='undefined'&&!FieldSync.autoReceiverBooted)await FieldSync.bootAutoReceiver();
        await this.stageSnapshot();
        UI.toast('تم إنشاء الشركة وإضافة المالك بنسبة أرباح 100%','success');
        this.showCapitalReminder();
      }catch(e){
        State.settings=previousSettings;State.shareholderOwners=previousOwners;State.alertCenter=previousAlerts;
        error('تعذر حفظ بيانات الشركة: '+String(e?.message||e));
      }finally{this.busy=false;if(button)button.disabled=false;}
    },
    async conflictJournal() {
      if(!StorageEngine.db||!ProfileManager.registry)return {version:1,active:null,resolved:null};
      const id=ProfileManager.activeId;
      const [active,resolved]=await Promise.all([
        ProfileManager.getRecord('peer_conflicts:'+id),
        ProfileManager.getRecord('peer_conflict_audit:'+id)
      ]);
      return {version:1,active:clone(active?.data??null),resolved:clone(resolved?.data??null)};
    },
    validateConflictJournal(backup) {
      const journal=backup?.peerConflictJournal;
      if(journal==null)return null; // backwards-compatible backups
      if(typeof journal!=='object'||Array.isArray(journal)||journal.version!==1)throw Error('سجل التعارض في النسخة غير مدعوم');
      const serialized=JSON.stringify(journal);
      if(serialized.length>18000000)throw Error('سجل التعارض في النسخة أكبر من الحد الآمن');
      const active=journal.active;
      const resolved=journal.resolved;
      if(active!=null && (typeof active!=='object'||Array.isArray(active)||!Array.isArray(active.details)||active.details.length>10000||typeof active.decisions!=='object'||active.decisions===null||Array.isArray(active.decisions)))
        throw Error('سجل التعارضات غير المحسومة تالف');
      if(resolved!=null && (typeof resolved!=='object'||Array.isArray(resolved)||!Array.isArray(resolved.entries)||resolved.entries.length>10000))
        throw Error('سجل التعارضات المحسومة تالف');
      return clone(journal);
    },
    async restoreConflictJournal(backup) {
      const journal=this.validateConflictJournal(backup);
      const id=ProfileManager.activeId;
      const active=journal?.active?{...journal.active,profileId:id}:null;
      let resolved=journal?.resolved??null;
      // Historic backup format only contains receipts, not the active conflict log.
      if(!journal && backup?.peerConflictResolutions?.version===2 && Array.isArray(backup.peerConflictResolutions.entries))
        resolved={version:2,entries:backup.peerConflictResolutions.entries};
      const rows=[{id:'peer_conflicts:'+id,data:active}];
      // Do not keep unrelated/stale conflict history after replacing a company's ledger.
      rows.push({id:'peer_conflict_audit:'+id,data:resolved});
      await ProfileManager.putBatch(rows);
      if(window.TiqanyPeerSync){
        window.TiqanyPeerSync.conflictLog=active;
        window.TiqanyPeerSync.resolvedHistory=Array.isArray(resolved?.entries)?clone(resolved.entries):[];
        window.TiqanyPeerSync.renderConflictButton?.();
      }
    },
    async stageSnapshot() {
      if(!window.AndroidAutoBackup?.stageSnapshot||!StorageEngine.db)return;
      const payload=ProfileManager.backupPayload();
      payload.peerConflictJournal=await this.conflictJournal();
      window.AndroidAutoBackup.stageSnapshot(JSON.stringify(payload));
    },
    async fullReset() {
      if(!StorageEngine.db)throw Error('قاعدة البيانات غير متاحة');
      if(window.WindowsAccountReset?.clearPrivateState)await window.WindowsAccountReset.clearPrivateState();
      const fresh=clone(DEFAULT_PROFILE);
      // Keep device-wide activation/trial data independent from customer ledgers.
      fresh.license=clone(State.license);
      fresh.settings.companyName='';
      fresh.settings.companyPhone='';
      fresh.settings.companyAddress='';
      fresh.settings.companySetupCompleted=false;
      const id=ProfileManager.generateId();
      const now=new Date().toISOString();
      const reg={version:1,activeId:id,profiles:[{id,name:'',createdAt:now}],deletedProfiles:[]};
      await new Promise((resolve,reject)=>{
        const tx=StorageEngine.db.transaction('app_state','readwrite');
        const store=tx.objectStore('app_state');
        store.clear(); // wipes main, all company profiles, archived profiles, backups and conflict records
        store.put({id:'main',data:fresh,updatedAt:now});
        store.put({id:'profile:'+id,data:fresh,updatedAt:now});
        store.put({id:'profile_registry',data:reg});
        tx.oncomplete=resolve;
        tx.onabort=()=>reject(tx.error||Error('تعذر التصفير الشامل'));
        tx.onerror=()=>{};
      });
      for(const key of Object.keys(State))delete State[key];
      Object.assign(State,fresh);
      ProfileManager.registry=reg;
      ProfileManager.activeId=id;
      ProfileManager.pendingImport=null;
      ProfileManager.authorizedImport=null;
      ProfileManager.restoreAuthorization=null;
      if(typeof FieldSync!=='undefined'){FieldSync.connectedAt={};FieldSync.autoReceiverCompany=null;}
      if(window.TiqanyPeerSync){
        window.TiqanyPeerSync.conflictLog=null;
        window.TiqanyPeerSync.resolvedHistory=[];
        window.TiqanyPeerSync.approved=false;
        window.TiqanyPeerSync.renderConflictButton?.();
      }
      try{window.AndroidPeerSync?.reset?.();}catch(_){}
      try{window.AndroidManagerPeer?.resetAll?.();}catch(_){}
      try{localStorage.clear();}catch(_){}
      try{sessionStorage.clear();}catch(_){}
      LicenseManager.persistFallbackStorage();
      // Replace encrypted/native staged backup immediately with the new empty ledger.
      await this.stageSnapshot();
      this.show();
      if(typeof location!=='undefined'&&typeof location.reload==='function')location.reload();
    }
  };
  window.CompanyLifecycle=lifecycle;
  // Original reset entry already enforces PIN/biometric approval and a second confirmation.
  StorageEngine.clearAll=function(){return lifecycle.fullReset();};
  // Scheduled native backups now include active AND resolved conflict journals.
  if(typeof BackupController!=='undefined'){
    BackupController.stageLatest=function(){void lifecycle.stageSnapshot().catch(err=>console.error('Conflict-aware backup failed:',err));};
  }
})();
