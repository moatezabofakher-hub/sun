/* Windows manager / Android main local ledger synchronization; offline and encrypted. */
(function(){
'use strict';
const core=window.TiqanyPeerMerge;
if(!core||typeof State==='undefined'||typeof Views==='undefined')return;
const desktop=!!window.WindowsPeerSync;
const t=(ar,en)=>State.settings.language==='en'?en:ar;
const clone=x=>JSON.parse(JSON.stringify(x));
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const peer={busy:false,pending:null,server:null,locks:new Map(),last:'',approved:false,
  key(){return 'peer_mobile_base:'+ProfileManager.activeId;},
  snapshot(){return core.snapshot(State);},
  blocked(){return !!(AppNav.isDirty||AppNav.isModalDirty||AppNav.activeOperationGuard||(typeof SettingsDraftController!=='undefined'&&SettingsDraftController.changed?.()));},
  message(text,error=false){this.last=String(text);const el=document.getElementById('ta-peer-status');if(el)el.textContent=this.last;if(error)UI.toast(this.last,'error');},
  async base(){return (await ProfileManager.getRecord(this.key()))?.data||null;},
  async saveBase(serverId,serverProfileId,snapshot){await ProfileManager.putBatch([{id:this.key(),data:{serverId,serverProfileId,snapshot,profileId:ProfileManager.activeId,at:new Date().toISOString()}}]);},
  async config(){if(!desktop)return;this.server=await WindowsPeerSync.config();this.renderConnection();},
  renderConnection(){const root=document.getElementById('ta-peer-settings');if(!root)return;
    const region=document.getElementById('ta-peer-connection');if(!region)return;
    if(desktop){const c=this.server||{};
      region.innerHTML=`<p><b>${t('عنوان الكمبيوتر:','Computer address:')}</b> <span dir="ltr">${escape((c.ips||[])[0]||'غير متاح')}:${escape(c.port||'')}</span></p><p class="text-xs mt-2"><b>${t('رمز الربط السري:','Private pairing key:')}</b> <code dir="ltr" style="overflow-wrap:anywhere;user-select:all">${escape(c.key||'')}</code></p><p class="text-xs">${c.ready?t('جاهز للاتصال على الشبكة المحلية','Ready for local connection'):t('الاستقبال غير جاهز — افحص الشبكة والجدار الناري','Not ready — check network and firewall')}</p><p class="text-xs text-amber-800">${t('احتفظ برمز الربط سرياً؛ فهو يسمح بالمزامنة والتعديل.','Keep this key private. It grants permission to sync and modify data.')}</p>`;
    }else{const info=window.AndroidPeerSync?JSON.parse(AndroidPeerSync.status()||'{}'):{};
      region.innerHTML=`<button type="button" class="ta-peer-btn ta-peer-scan" onclick="TiqanyPeerSync.scanPairing()"><i class="fas fa-qrcode"></i> ${t('مسح رمز QR من الكمبيوتر','Scan Windows QR code')}</button><p class="text-xs">${t('افتح صفحة المزامنة المحلية على الكمبيوتر، ثم وجّه كاميرا الهاتف إلى الرمز.','Open local sync settings on Windows, then point your camera at the code.')}</p><details class="ta-peer-manual"><summary>${t('إدخال عنوان الكمبيوتر يدوياً (اختياري)','Enter computer address manually (optional)')}</summary><label class="block text-xs">${t('عنوان IP للكمبيوتر','Computer IP address')}<input id="ta-peer-ip" class="ta-peer-input" inputmode="decimal" placeholder="192.168.1.10" value="${escape(info.host||'')}"></label><label class="block text-xs">${t('المنفذ','Port')}<input id="ta-peer-port" class="ta-peer-input" type="number" value="${Number(info.port)||39271}"></label><label class="block text-xs">${t('رمز الربط من الكمبيوتر','Pairing key from computer')}<input id="ta-peer-key" class="ta-peer-input" type="password" autocomplete="off" placeholder="${t('ألصق الرمز السري كما يظهر على الكمبيوتر','Paste the key shown on the computer')}"></label><div class="flex gap-2 flex-wrap"><button class="ta-peer-btn" onclick="TiqanyPeerSync.saveLink()">${t('حفظ الربط','Save connection')}</button></div></details><button class="ta-peer-btn secondary" onclick="TiqanyPeerSync.unlink()">${t('إلغاء الربط','Disconnect')}</button><p class="text-xs">${info.approved?t('المزامنة التلقائية مفعلة بعد الاقتران','Automatic sync enabled after pairing'):t('اضبط الربط ثم اضغط مزامنة الآن للموافقة الأولى','Save connection, then select Sync now for initial approval')}</p>`;
    }
  },
  scanPairing(){
    if(desktop)return;
    if(!window.NativeBarcode||typeof NativeBarcode.scan!=='function')return this.message(t('يلزم فتح تطبيق أندرويد الرئيسي لاستخدام الكاميرا','Open the main Android app to use the camera'),true);
    NativeBarcode.scan('peer');
  },
  async acceptPairing(raw){
    if(desktop)return;
    let data;try{data=JSON.parse(String(raw||''));}catch(_){return this.message(t('هذا ليس رمز اقتران للتقني للمحاسبة','This is not a Tiqany Acc pairing code'),true);}
    if(!data||data.type!=='tiqany-windows-main'||data.v!==1||!/^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(data.host)||!Number.isInteger(data.port)||data.port<1024||data.port>65535||!/^[A-Za-z0-9_-]{43}$/.test(data.key)||!/^[a-f0-9]{32}$/.test(data.serverId))return this.message(t('رمز الاقتران غير صالح أو غير مكتمل','Invalid or incomplete pairing code'),true);
    const before=await this.base();
    if(before?.snapshot&&before.serverId!==data.serverId)return this.message(t('الهاتف مرتبط بكمبيوتر آخر؛ ألغ الربط القديم أولاً','This phone is paired with a different computer. Disconnect it first.'),true);
    const yes=window.confirm(t('هل توافق على ربط هذا الهاتف مع الكمبيوتر على العنوان ','Pair this phone with the computer at ')+data.host+':'+data.port+'?\n'+t('ستحتاج إلى تأكيد دمج البيانات في أول مزامنة.','You will confirm data merging during the first sync.'));
    if(!yes)return this.message(t('تم إلغاء الاقتران.','Pairing cancelled.'));
    if(!window.AndroidPeerSync||AndroidPeerSync.configure(data.host,data.port,data.key)!=='saved')return this.message(t('تعذر اعتماد الاتصال؛ تأكد من شبكة Wi-Fi','Could not save connection; check Wi-Fi'),true);
    await ProfileManager.putBatch([{id:this.key(),data:null}]);this.approved=false;this.renderConnection();
    this.message(t('تم الاقتران. اضغط «مزامنة الآن» لبدء تأكيد الدمج.','Paired. Tap Sync now to approve the first merge.'));
  },
  async saveLink(){if(desktop)return;
    const host=document.getElementById('ta-peer-ip')?.value.trim(),port=Number(document.getElementById('ta-peer-port')?.value),key=document.getElementById('ta-peer-key')?.value.trim();
    if(!window.AndroidPeerSync||AndroidPeerSync.configure(host,port,key)!=='saved')return this.message(t("تأكد من عنوان Wi-Fi المحلي والمنفذ ورمز الربط الصحيح","Check the local Wi-Fi IP address, port and pairing key"),true);
    await ProfileManager.putBatch([{id:this.key(),data:null}]);this.approved=false;this.renderConnection();this.message(t("حُفظ الربط. اضغط مزامنة الآن لتأكيد الشركة والبيانات.","Connection saved. Select Sync now to confirm the business and merge data."));
  },
  async unlink(){if(desktop)return;if(!confirm(t("هل تريد إلغاء ربط هذا الهاتف بالكمبيوتر؟ لن تُحذف البيانات المحاسبية.","Disconnect the phone from the computer? Accounting data will not be deleted.")))return;
    AndroidPeerSync.reset();await ProfileManager.putBatch([{id:this.key(),data:null}]);this.approved=false;this.renderConnection();this.message(t("تم إلغاء الربط المحلي.","Local connection removed."));
  },
  call(message){return new Promise((resolve,reject)=>{
      if(this.pending)return reject(Error(t("هناك اتصال قيد التنفيذ","A connection is already active")));
      const timer=setTimeout(()=>{this.pending=null;reject(Error(t("انتهت مهلة الاتصال بالكمبيوتر","Connection to the computer timed out")));},26000);
      this.pending={resolve,reject,timer};
      try{AndroidPeerSync.request(JSON.stringify({protocol:'TIQANY-PEER-1',...message}));}
      catch(e){clearTimeout(timer);this.pending=null;reject(e);}
  });},
  async sync(silent=false){
    if(desktop)return this.message(t("يستقبل الكمبيوتر البيانات تلقائياً عند المزامنة من الهاتف.","Windows receives updates automatically when sync starts on the phone."));
    if(this.busy||this.blocked())return silent?undefined:this.message(t("احفظ الفاتورة أو النافذة المفتوحة أولاً.","Save the open invoice or form before syncing."),true);
    if(!window.AndroidPeerSync)return this.message(t("يلزم تثبيت APK الرئيسي الجديد لتشغيل الربط المحلي.","Install the updated main Android APK to enable local sync."),true);
    const info=JSON.parse(AndroidPeerSync.status()||'{}');if(!info.host||!info.port)return silent?undefined:this.message(t("اضبط عنوان الكمبيوتر ومفتاح الربط أولاً.","Set the computer IP and pairing key first."),true);
    if(silent&&!info.approved)return;
    this.busy=true;
    try {
      const stateBefore=this.snapshot(),origin=core.canonical(stateBefore);
      this.message(t("جارٍ الاتصال بالكمبيوتر...","Connecting to computer..."));
      const fetched=await this.call({action:'fetch',profileName:State.settings.companyName});
      if(!fetched.ok)throw Error(fetched.error||t("فشل قراءة بيانات الكمبيوتر","Could not read data from the computer"));
      if(!fetched.snapshot||!fetched.ticket||!fetched.serverId)throw Error(t("رد غير مكتمل من الكمبيوتر","Incomplete response from computer"));
      const saved=await this.base();
      if(saved?.snapshot&&saved.serverId!==fetched.serverId)throw Error(t("الربط يخص كمبيوتراً مختلفاً. ألغ الربط القديم أولاً.","This pairing belongs to another computer. Disconnect first."));
      if(saved?.snapshot&&saved.profileId!==ProfileManager.activeId)throw Error(t("تغيرت الشركة الحالية، تحقق من الربط","The selected business changed. Check the pairing."));
      if(saved?.snapshot&&saved.serverProfileId!==fetched.profileId)throw Error(t("تم تبديل الشركة المفتوحة على الكمبيوتر. افتح الشركة المرتبطة أولاً.","A different business is open on Windows. Switch back to the paired business."));
      const remoteName=String(fetched.companyName||'').trim(),localName=String(State.settings.companyName||'').trim();
      if(remoteName!==localName && !saved?.snapshot)throw Error(t("اسم الشركة في الكمبيوتر مختلف. صحح اسم الشركة قبل ربط دفاتر مختلفة.","Business names do not match. Correct them before linking separate ledgers."));
      if(!saved?.snapshot){
        if(silent)return;
        const message=State.settings.language==='en'
          ?`Link business "${localName}" to Windows for the first time.\nPhone invoices: ${stateBefore.invoices.length}, Windows invoices: ${fetched.snapshot.invoices.length}.\nRecords will merge. Currency and exchange rate preferences will follow Windows. Local recovery copies are created. Continue?`
          :`ربط الشركة «${localName}» مع الكمبيوتر لأول مرة.\nفواتير الهاتف: ${stateBefore.invoices.length}، فواتير الكمبيوتر: ${fetched.snapshot.invoices.length}.\nستُدمج السجلات، وستُعتمد إعدادات العملة وسعر الصرف من الكمبيوتر، مع حفظ نقاط استرجاع محلية. هل تؤكد؟`;
        if(!window.confirm(message)){this.message(t("أُلغيت المزامنة الأولى.","Initial sync cancelled."));return;}
      }
      const merged=core.merge(saved?.snapshot||null,stateBefore,fetched.snapshot);
      if(!merged.ok)throw Error(t("تعارض في سجلات عدّلها الجهازان، لم يتم استبدال أي سجل: ","Conflicting edits on both devices; no records overwritten: ")+merged.conflicts.slice(0,4).join('؛ '));
      if(this.blocked()||core.canonical(this.snapshot())!==origin)throw Error(t("تغيرت بيانات الهاتف أثناء المزامنة. أعد المحاولة.","Phone data changed during sync. Try again."));
      const committed=await this.call({action:'commit',ticket:fetched.ticket,serverId:fetched.serverId,profileId:fetched.profileId,snapshot:merged.snapshot});
      if(!committed.ok)throw Error(committed.error||t("رفض الكمبيوتر حفظ الدمج","Windows rejected the merged data"));
      if(this.blocked()||core.canonical(this.snapshot())!==origin)throw Error(t("حفظ الكمبيوتر الدمج لكن بيانات الهاتف تغيرت. أعد المزامنة قبل أي تعديل آخر.","Windows saved the merge, but phone data changed. Sync again before editing."));
      if(core.canonical(merged.snapshot)!==origin){
        await ProfileManager.makeCheckpoint('before-windows-peer-sync');
        core.apply(State,merged.snapshot);
        try{await StorageEngine.saveState();}catch(err){core.apply(State,stateBefore);throw err;}
      }
      await this.saveBase(fetched.serverId,fetched.profileId,merged.snapshot);
      AndroidPeerSync.approve();this.approved=true;
      this.message(State.settings.language==='en'?`Sync complete: ${merged.stats.added} new records, ${merged.stats.renumbered} document numbers adjusted.`:`اكتملت المزامنة: ${merged.stats.added} سجلات جديدة و${merged.stats.renumbered} رقم مستند مُعدّل.`);
      if(AppNav.current()?.screen!=='settings')AppNav.renderCurrent();
    }catch(e){this.message(t("فشلت المزامنة دون حذف البيانات: ","Sync failed without deleting data: ")+String(e.message||e),!silent);}
    finally{this.busy=false;this.renderConnection();}
  },
  async handleRequest(request){if(!desktop)return;
    const {requestId,data}=request;
    const reply=x=>WindowsPeerSync.reply(requestId,x);
    try{
      if(this.busy||this.blocked())return reply({ok:false,error:t("يوجد تعديل مفتوح في الكمبيوتر؛ احفظه أولاً","A change is still open on Windows. Save it before syncing.")});
      if(data.action==='fetch'){
        const snapshot=this.snapshot(),ticket=String(Date.now())+'-'+Math.random().toString(36).slice(2);
        this.locks.set(ticket,{snapshot:core.canonical(snapshot),profileId:ProfileManager.activeId,created:Date.now()});
        for(const [k,v] of this.locks)if(Date.now()-v.created>60000)this.locks.delete(k);
        return reply({ok:true,ticket,snapshot,companyName:State.settings.companyName,profileId:ProfileManager.activeId,serverId:this.server?.serverId});
      }
      if(data.action==='commit'){
        const lock=this.locks.get(data.ticket);this.locks.delete(data.ticket);
        if(!lock||Date.now()-lock.created>60000||lock.profileId!==ProfileManager.activeId||data.profileId!==ProfileManager.activeId||data.serverId!==this.server?.serverId) return reply({ok:false,error:t("انتهت جلسة الدمج أو تغيرت الشركة","Sync session expired or business changed")});
        if(core.canonical(this.snapshot())!==lock.snapshot)return reply({ok:false,error:t("تغير دفتر الكمبيوتر أثناء المزامنة؛ أعد المحاولة","Windows data changed during sync. Retry.")});
        core.ensureSnapshot(data.snapshot);
        const original=this.snapshot();
        if(core.canonical(data.snapshot)!==lock.snapshot){
          this.busy=true;
          try{await ProfileManager.makeCheckpoint('before-main-phone-peer-sync');core.apply(State,data.snapshot);await StorageEngine.saveState();}
          catch(err){core.apply(State,original);throw err;}
          finally{this.busy=false;}
        }
        reply({ok:true});this.message(t("وصلت آخر بيانات الهاتف وتم دمجها في دفتر الكمبيوتر.","Latest phone data merged into the Windows ledger."));
        if(AppNav.current()?.screen!=='settings'){AppNav.renderCurrent();if(typeof I18n!=='undefined')I18n.apply(document);}
      }
    }catch(err){reply({ok:false,error:String(err.message||err)});}
  },
  renderSettings(main){
    if(!main||document.getElementById('ta-peer-settings'))return;
    const en=State.settings.language==='en';
    const title=en?'Local sync: main phone ↔ Windows':'المزامنة المحلية: الهاتف الرئيسي ↔ الكمبيوتر';
    main.insertAdjacentHTML('afterbegin',`<section id="ta-peer-settings" class="rounded-2xl border border-teal-300 bg-white p-4 mb-4 space-y-2 text-right" dir="${en?'ltr':'rtl'}"><h3 class="font-black text-base text-teal-900"><i class="fas fa-network-wired"></i> ${title}</h3><p class="text-xs text-slate-600">${desktop?t('أبقِ الكمبيوتر والهاتف على شبكة Wi-Fi واحدة. أدخل بيانات الربط المعروضة هنا في إعدادات الهاتف الرئيسي.','Keep computer and phone on the same Wi-Fi network. Enter the details shown here in the main phone app.'):t('الربط محلي دون إنترنت. احصل على العنوان ورمز الربط من الضبط في الكمبيوتر.','Local sync without internet. Get address and pairing key from Windows settings.')}</p><div id="ta-peer-connection" class="text-sm space-y-2"></div><button type="button" class="ta-peer-btn" onclick="TiqanyPeerSync.${desktop?'config':'sync'}()">${desktop?t('تحديث عنوان الاتصال','Refresh connection details'):t('مزامنة الآن','Sync now')}</button><p id="ta-peer-status" class="text-xs text-teal-800 font-bold">${escape(this.last)}</p></section>`);
    this.renderConnection();
  },
  async boot(){if(desktop){window.WindowsDesktop?.onPeerRequest(req=>this.handleRequest(req));await this.config();}
    else {setInterval(()=>{if(document.visibilityState==='visible')this.sync(true);},60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')this.sync(true);});}
  }
};
window.TiqanyPeerSync=peer;
window.__tiqanyPeerReply=raw=>{
 const task=peer.pending;if(!task)return;clearTimeout(task.timer);peer.pending=null;
 try{const answer=JSON.parse(raw);task.resolve(answer);}catch(e){task.reject(e);}
};
const previous=Views.renderSettings;
Views.renderSettings=function(main,...args){previous.call(this,main,...args);peer.renderSettings(main);};
const oldLoad=window.onload;
window.onload=async function(...args){if(oldLoad)await oldLoad.apply(this,args);try{await peer.boot();}catch(e){console.warn('Peer boot error',e);}};
const style=document.createElement('style');style.textContent='.ta-peer-qr-grid{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}.ta-peer-qr-card{background:#fff;border:2px solid #d1e5e8;padding:10px;border-radius:15px;text-align:center;min-width:215px;max-width:265px}.ta-peer-qr-image svg{width:100%;height:auto;max-width:225px;image-rendering:pixelated}.ta-peer-scan{margin:8px 0 12px!important}.ta-peer-manual{margin:12px 0;padding:8px;background:#f1f5f9;border-radius:12px}.ta-peer-manual>summary{font-weight:900;cursor:pointer;margin-bottom:8px}.ta-peer-manual>label{margin-top:8px}.ta-peer-input{display:block;width:100%;min-width:0;border:1px solid #94a3b8;border-radius:10px;padding:9px;margin-top:4px;direction:ltr;text-align:left;font-size:14px}.ta-peer-btn{display:inline-block;background:linear-gradient(160deg,#087d79,#065f69);color:white;border-radius:12px;padding:10px 16px;font-size:13px;font-weight:900;border:1px solid #0f766e;box-shadow:0 3px 0 #164e63}.ta-peer-btn.secondary{background:#475569;border-color:#334155;box-shadow:0 3px 0 #334155}';document.head.append(style);
})();
