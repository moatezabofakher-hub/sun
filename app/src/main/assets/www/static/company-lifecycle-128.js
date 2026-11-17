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
    showIfRequired() {if(this.needsSetup())this.show();},
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
          <label for="ta-company-phone-128" style="font-weight:800;display:block;margin:12px 0 6px">رقم الهاتف</label>
          <input id="ta-company-phone-128" required autocomplete="tel" inputmode="tel" maxlength="32" placeholder="رقم هاتف الشركة" style="width:100%;box-sizing:border-box;border:1px solid #a6bfd1;border-radius:12px;padding:13px;background:#f8fcff;color:#123;font:inherit;direction:ltr;text-align:right"/>
          <label for="ta-company-address-128" style="font-weight:800;display:block;margin:12px 0 6px">العنوان</label>
          <textarea id="ta-company-address-128" required maxlength="220" minlength="3" placeholder="العنوان الكامل للشركة" rows="3" style="width:100%;box-sizing:border-box;border:1px solid #a6bfd1;border-radius:12px;padding:13px;background:#f8fcff;color:#123;font:inherit"></textarea>
          <p id="ta-company-error-128" role="alert" style="display:none;color:#b91c1c;font-size:12px;margin-top:10px"></p>
          <button id="ta-company-save-128" type="submit" style="width:100%;margin-top:16px;padding:15px;border-radius:14px;border:1px solid #047857;background:linear-gradient(#10b981,#047857);color:white;font-size:16px;font-weight:900;box-shadow:0 4px 0 #065f46">حفظ بيانات الشركة والبدء</button>
        </form>`;
      document.body.appendChild(overlay);
      $('ta-company-name-128')?.focus();
    },
    async saveFirstRun() {
      if(this.busy)return;
      const name=String($('ta-company-name-128')?.value||'').trim();
      const phone=String($('ta-company-phone-128')?.value||'').trim();
      const address=String($('ta-company-address-128')?.value||'').trim();
      const message=$('ta-company-error-128');
      const error=(text)=>{if(message){message.textContent=text;message.style.display='block';}};
      if(name.length<2||name.length>75||name===OLD_PLACEHOLDER)return error('أدخل اسم الشركة الحقيقي (من 2 إلى 75 حرفاً)');
      if(phone.replace(/\D/g,'').length<6||phone.length>32)return error('أدخل رقم هاتف صحيحاً للشركة');
      if(address.length<3||address.length>220)return error('أدخل العنوان الكامل للشركة');
      if(!StorageEngine.db)return error('قاعدة البيانات غير متاحة. لا يمكن حفظ البيانات حالياً');
      this.busy=true;
      const button=$('ta-company-save-128');
      if(button)button.disabled=true;
      const previous={companyName:State.settings.companyName,companyPhone:State.settings.companyPhone,companyAddress:State.settings.companyAddress,companySetupCompleted:State.settings.companySetupCompleted};
      try {
        State.settings.companyName=name;
        State.settings.companyPhone=phone;
        State.settings.companyAddress=address;
        State.settings.companySetupCompleted=true;
        await StorageEngine.saveState();
        $('ta-company-setup-128')?.remove();
        AppNav.renderCurrent();
        if(typeof ManagerNotifications!=='undefined')ManagerNotifications.bootstrap();
        if(typeof StockNotifications!=='undefined')StockNotifications.bootstrap();
        if(typeof FieldSync!=='undefined'&&!FieldSync.autoReceiverBooted)await FieldSync.bootAutoReceiver();
        await this.stageSnapshot();
        UI.toast('تم حفظ بيانات الشركة بنجاح','success');
      }catch(e){
        Object.assign(State.settings,previous);
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
