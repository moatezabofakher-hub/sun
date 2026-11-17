/* Windows manager / Android main local ledger synchronization; offline and encrypted. */
(function(){
'use strict';
const core=window.TiqanyPeerMerge;
if(!core||typeof State==='undefined'||typeof Views==='undefined')return;
const desktop=!!window.WindowsPeerSync;
const t=(ar)=>ar;
const clone=x=>JSON.parse(JSON.stringify(x));
const connectedDevicesIcon='<svg width="48" height="32" viewBox="0 0 74 46" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="3" y="6" width="38" height="27" rx="4" fill="#065e81"/><rect x="7" y="10" width="30" height="19" rx="2" fill="#bbf3f1"/><path d="M13 38h19m-10-5v5" fill="none" stroke="#065e81" stroke-width="4" stroke-linecap="round"/><path d="M43 16h8m-4-4 4 4-4 4m4 9h-8m4-4-4 4 4 4" fill="none" stroke="#0f766e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><rect x="55" y="4" width="16" height="35" rx="4" fill="#076475"/><rect x="58" y="9" width="10" height="23" rx="1.8" fill="#bcf6f0"/><circle cx="63" cy="35" r="1.7" fill="#bcf6f0"/></svg>';
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const peer={busy:false,pending:null,server:null,locks:new Map(),last:'',approved:false,conflictLog:null,resolvedHistory:[],lastSuccessfulAt:0,lastPhoneSeenAt:0,lastPublishedDigest:null,lastRemoteVersion:null,polling:false,probeFailures:0,nextProbeAt:0,
  authorizedSettingsSection:null,
  headerRequestedSettings:false,
  qrRevealExpiresAt:0,qrRevealProfile:null,qrRevealTimer:null,scanApproval:null,bootstrapApproval:null,
  openSettingsFromHeader(){
    if(AppNav.current()?.screen==='settings'){this.requestHeaderAccess();return;}
    this.headerRequestedSettings=true;
    AppNav.navigate('settings');
  },
  requestHeaderAccess(){
    if(AppNav.current()?.screen!=='settings')return;
    const section=document.querySelector('details[data-settings-section="mobile-computer-sync"]');
    if(!section)return;
    if(!section.open&&typeof SettingsDraftController!=='undefined'&&SettingsDraftController.changed?.()){
      UI.toast('احفظ أو ألغِ تغييرات الضبط الحالية قبل فتح المزامنة','warn');return;
    }
    if(!section.open){
      const summary=section.querySelector('summary');
      if(summary)this.requestSettingsAccess({currentTarget:summary,preventDefault(){},stopPropagation(){}});
    }
    section.scrollIntoView?.({block:'start',behavior:'smooth'});
  },
  requestSettingsAccess(event){
    const section=event?.currentTarget?.closest('details');if(!section)return;
    // In 3.5.117 the sync SETTINGS panel is public to the signed-in manager.
    // Only viewing the computer's pairing QR or starting a new scan is protected.
    event.preventDefault?.();event.stopPropagation?.();
    section.open=!section.open;
    if(!section.open)this.hidePairingQr();
  },
  guardSettingsToggle(section){
    if(section?.dataset?.settingsSection==='mobile-computer-sync'&&!section.open)this.hidePairingQr();
  },
  hidePairingQr(){
    this.qrRevealExpiresAt=0;this.qrRevealProfile=null;
    if(this.qrRevealTimer){clearTimeout(this.qrRevealTimer);this.qrRevealTimer=null;}
  },
  // Do not grant access if a manager has not configured the application's PIN.
  authorizePairing(message,action){
    if(typeof ProtectionController==='undefined'||typeof ProtectionController.requestPin!=='function'){
      UI.toast('تعذر تشغيل التحقق الأمني','error');return false;
    }
    const cfg=State.settings?.appProtection;
    if(!cfg?.pinHash||!cfg?.pinSalt){
      ProtectionController.promptPinSetup?.('ربط الأجهزة');return false;
    }
    const profile=ProfileManager.activeId;
    ProtectionController.requestPin(message,()=>{
      if(ProfileManager.activeId!==profile){UI.toast('تغيّرت الشركة، أعد التحقق','warn');return;}
      return action();
    } );
    return true;
  },
  revealPairingQr(){
    if(!desktop)return;
    this.authorizePairing('أدخل كلمة سر المدير لعرض رمز الكمبيوتر ومفتاح ربط الموبايل',()=>{
      this.qrRevealProfile=ProfileManager.activeId;
      this.qrRevealExpiresAt=Date.now()+60000;
      this.renderConnection();
      if(this.qrRevealTimer)clearTimeout(this.qrRevealTimer);
      this.qrRevealTimer=setTimeout(()=>{this.qrRevealExpiresAt=0;this.qrRevealTimer=null;this.renderConnection();},60000);
    });
  },
  updateHeaderConnection(active){
    const el=document.getElementById('ta-desktop-phone-connection');if(!el)return;
    el.classList.toggle('ta-link-online',!!active);
    el.classList.toggle('ta-link-offline',!active);
    el.setAttribute('aria-label',active?'متصل: اضغط لفتح مزامنة الموبايل والكمبيوتر':'غير متصل: اضغط لفتح مزامنة الموبايل والكمبيوتر');
    el.setAttribute('title',active?'الاتصال نشط — اضغط لفتح إعدادات المزامنة':'غير متصل — اضغط لفتح إعدادات المزامنة');
    el.querySelector('.ta-link-dot')?.setAttribute('aria-label',active?'متصل':'غير متصل');
  },
  updatePresence(){
    const region=document.getElementById('ta-peer-connection');if(!region)return;
    let badge=document.getElementById('ta-peer-presence');
    if(!badge){badge=document.createElement('div');badge.id='ta-peer-presence';region.insertAdjacentElement('beforebegin',badge);}
    const now=Date.now();
    const active=desktop?(this.lastPhoneSeenAt>0&&now-this.lastPhoneSeenAt<20000):(this.lastSuccessfulAt>0&&now-this.lastSuccessfulAt<20000);
    this.updateHeaderConnection(active);
    const pending=this.busy&&!active;
    badge.className='ta-peer-presence '+(active?'connected':pending?'connecting':'offline');
    badge.textContent=active?'● متصل '+(desktop?'بالموبايل الرئيسي':'بالكمبيوتر'):
       pending?'◌ جارٍ التحقق من الاتصال':'● غير متصل '+(desktop?'بالموبايل الرئيسي':'بالكمبيوتر');
  },
  key(){return 'peer_mobile_base:'+ProfileManager.activeId;},
  companyUid(){return String(State.settings?.companyUid||'');},
  async ensureCompanyUid(){
    if(/^business_[a-f0-9]{32}$/.test(this.companyUid()))return this.companyUid();
    State.settings.companyUid=ProfileManager.generateId();
    await StorageEngine.saveState();
    return this.companyUid();
  },
  // Only an old authenticated pairing may migrate an existing nonempty ledger.
  priorLinkMatches(saved,serverId,serverProfileId){return !!saved?.snapshot&&
    saved.serverId===serverId&&saved.serverProfileId===serverProfileId&&saved.profileId===ProfileManager.activeId;},
  // The first phone-to-empty-desktop transfer is approved on the owning
  // phone, never based on matching the displayed company name or QR alone.
  requestBootstrapApproval(server,desktopSnapshot,phoneSnapshot){
    const protection=core.bootstrapProtection(State.settings?.appProtection);
    if(!protection){
      this.message('يجب إعداد كلمة سر المدير على الموبايل قبل نقل الشركة إلى كمبيوتر فارغ.',true);
      return;
    }
    const approvedProfile=ProfileManager.activeId;
    const phoneDigest=core.digest(phoneSnapshot),desktopDigest=core.digest(desktopSnapshot);
    const message='الموافقة على نسخ كامل بيانات الشركة وهوية الشركة وكلمة سر المدير المشفّرة إلى الكمبيوتر الجديد. بعد النقل سيطلب الكمبيوتر كلمة سر المدير الموجودة على الهاتف.';
    if(!window.confirm('الكمبيوتر الحالي فارغ؛ هل تريد نقل شركة الموبايل وجميع عملياتها إليه؟\nستُحفظ نقطة استرجاع على الكمبيوتر، ولن تُنقل بصمة الجهاز.'))return;
    this.authorizePairing(message,()=>{
      if(ProfileManager.activeId!==approvedProfile||core.digest(this.snapshot())!==phoneDigest)return this.message('تغيرت بيانات الهاتف؛ أعد الموافقة من البداية.',true);
      this.bootstrapApproval={profileId:approvedProfile,serverId:server.serverId,serverProfileId:server.profileId,
        phoneUid:this.companyUid(),phoneDigest,desktopDigest,expiresAt:Date.now()+90000};
      this.sync(false);
    });
  },
  linkOutageNotified:false,lastOutageReason:'',outageKind:'',
  async outage(reason,kind='transport'){
    const message=String(reason||'تعذّر الوصول إلى الجهاز المقترن').slice(0,240);
    this.lastOutageReason=message;
    if(this.linkOutageNotified)return;
    this.outageKind=kind;
    this.linkOutageNotified=true;
    if(typeof ManagerNotifications!=='undefined' && ManagerNotifications.addSyncNotice)
      await ManagerNotifications.addSyncNotice(message).catch(e=>console.warn('Cannot persist sync outage',e));
  },
  recovered(kind='all'){if(kind==='transport'&&this.outageKind==='conflict')return;this.linkOutageNotified=false;this.lastOutageReason='';this.outageKind='';},
  onServerStatus(status){
    if(!desktop)return;
    if(status&&typeof status==='object'&&status.type==='peer-heartbeat'){
      this.lastPhoneSeenAt=Date.now();this.updatePresence();return;
    }
    if(typeof status==='string'&&status.startsWith('تعذر فتح منفذ المزامنة')&&this.lastPhoneSeenAt){
      this.outage(status);
    }
  },
  watchHeartbeat(){
    if(!desktop||!this.lastPhoneSeenAt||this.linkOutageNotified)return;
    if(Date.now()-this.lastPhoneSeenAt>23000){
      this.outage('انقطع الاتصال بالهاتف الرئيسي: لم تصل إشارة اتصال منذ أكثر من 23 ثانية. قد يكون الهاتف خارج شبكة Wi-Fi، أو التطبيق مغلقاً، أو الشبكة متوقفة.');
      this.updatePresence();
    }
  },
  snapshot(){return core.snapshot(State);},
  blockReason(){
    const screen=AppNav.current?.()?.screen||'';
    const editor=['invoice_form','voucher_form','pos','pos_form','transfer_form','transfer_editor'].includes(screen);
    const modal=document.getElementById?.('dialogContainer');
    const modalVisible=!!(modal&&!modal.classList?.contains('hidden')&&modal.getAttribute?.('aria-hidden')!=='true');
    if(AppNav.isModalDirty&&modalVisible)return 'توجد نافذة تعديل غير محفوظة على '+(desktop?'الكمبيوتر':'الموبايل')+'؛ احفظها أو ألغها';
    if(editor&&(AppNav.isDirty||AppNav.activeOperationGuard))return 'توجد فاتورة أو عملية غير محفوظة على '+(desktop?'الكمبيوتر':'الموبايل')+'؛ احفظها أو ألغها';
    if(screen==='settings'&&typeof SettingsDraftController!=='undefined'&&SettingsDraftController.changed?.())
      return 'توجد تعديلات غير محفوظة في إعدادات '+(desktop?'الكمبيوتر':'الموبايل');
    // Guards left after leaving an editor must not prevent future sync from Home.
    return '';
  },
  blocked(){return !!this.blockReason();},
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
    this.updatePresence();
  },
  scanPairing(){
    if(desktop)return;
    if(!window.NativeBarcode||typeof NativeBarcode.scan!=='function')return this.message(t('يلزم فتح تطبيق أندرويد الرئيسي لاستخدام الكاميرا','Open the main Android app to use the camera'),true);
    this.scanApproval=null;
    const beginScan=()=>{
      this.scanApproval={profileId:ProfileManager.activeId,expiresAt:Date.now()+120000};
      NativeBarcode.scan('peer');
    };
    if(State.settings?.appProtection?.protectDeviceAddition === true){
      this.authorizePairing('تحقق بالبصمة أو كلمة سر المدير قبل مسح رمز الكمبيوتر',beginScan);
    }else beginScan();
  },
  async acceptPairing(raw){
    if(desktop)return;
    const proof=this.scanApproval;this.scanApproval=null;
    if(!proof||proof.profileId!==ProfileManager.activeId||Date.now()>proof.expiresAt)
      return this.message('يجب التحقق بالبصمة أو كلمة السر قبل اعتماد رمز الكمبيوتر',true);
    let data;try{data=JSON.parse(String(raw||''));}catch(_){return this.message(t('هذا ليس رمز اقتران للتقني للمحاسبة','This is not a Tiqany Acc pairing code'),true);}
    if(!data||data.type!=='tiqany-windows-main'||data.v!==1||!/^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(data.host)||!Number.isInteger(data.port)||data.port<1024||data.port>65535||!/^[A-Za-z0-9_-]{43}$/.test(data.key)||!/^[a-f0-9]{32}$/.test(data.serverId))return this.message(t('رمز الاقتران غير صالح أو غير مكتمل','Invalid or incomplete pairing code'),true);
    const before=await this.base();
    if(before?.snapshot&&before.serverId!==data.serverId)return this.message(t('الهاتف مرتبط بكمبيوتر آخر؛ ألغ الربط القديم أولاً','This phone is paired with a different computer. Disconnect it first.'),true);
    const yes=window.confirm(t('هل توافق على ربط هذا الهاتف مع الكمبيوتر على العنوان ','Pair this phone with the computer at ')+data.host+':'+data.port+'?\n'+t('ستحتاج إلى تأكيد دمج البيانات في أول مزامنة.','You will confirm data merging during the first sync.'));
    if(!yes)return this.message(t('تم إلغاء الاقتران.','Pairing cancelled.'));
    if(!window.AndroidPeerSync||AndroidPeerSync.configure(data.host,data.port,data.key)!=='saved')return this.message(t('تعذر اعتماد الاتصال؛ تأكد من شبكة Wi-Fi','Could not save connection; check Wi-Fi'),true);
    if(!AndroidPeerSync.bindServerId(data.serverId))return this.message('تعذر تأكيد هوية الكمبيوتر المقترن',true);
    // Keep the last common ancestor and prior approvals when scanning the same PC.
    this.approved=false;this.renderConnection();
    this.message(t('تم الاقتران. اضغط «مزامنة الآن» لبدء تأكيد الدمج.','Paired. Tap Sync now to approve the first merge.'));
  },
  conflictsKey(){return 'peer_conflicts:'+ProfileManager.activeId;},
  async loadConflicts(){
    const saved=(await ProfileManager.getRecord(this.conflictsKey()))?.data;
    this.conflictLog=saved?.profileId===ProfileManager.activeId?saved:null;
    this.renderConflictButton();
  },
  async saveConflicts(){
    await ProfileManager.putBatch([{id:this.conflictsKey(),data:this.conflictLog}]);
    BackupController.stageLatest();
    this.renderConflictButton();
  },
  // The old 3.5.114 audit was write-only. In 3.5.115 the same durable store is
  // also consulted BEFORE accepting changes or removals from a stale peer.
  auditKey(){return 'peer_conflict_audit:'+ProfileManager.activeId;},
  linkId(serverId,serverProfileId,phoneProfileId){return [serverId,serverProfileId,phoneProfileId].map(String).join('|');},
  async loadResolved(){
    const stored=(await ProfileManager.getRecord(this.auditKey()))?.data;
    this.resolvedHistory=core.combineReceipts(stored?.entries||[]);
    this.renderConflictButton();
    return this.resolvedHistory;
  },
  async saveResolved(incoming=[],linkId=null,explicitApprovals=[]){
    const old=await this.loadResolved();
    const scoped=Array.isArray(incoming)?incoming.filter(core.validReceipt).filter(r=>!r.linkId||!linkId||r.linkId===linkId)
      .map(r=>({...r,linkId:r.linkId||linkId||undefined})):[];
    const approvals=Array.isArray(explicitApprovals)?explicitApprovals.filter(core.validReceipt):[];
    const preserved=core.retireOppositeReceipts(old,approvals);
    const entries=core.combineReceipts(preserved,scoped);
    if(core.canonical(entries)!==core.canonical(old)){
      await ProfileManager.putBatch([{id:this.auditKey(),data:{version:2,entries}}]);
      BackupController.stageLatest();
    }
    this.resolvedHistory=entries;this.renderConflictButton();
    return entries;
  },
  async receiptsFor(linkId){
    const entries=await this.loadResolved();
    // Exact device pair is required for new receipts; old 3.5.114 audit
    // entries are retained as legacy until that particular conflict recurs.
    return entries.filter(r=>!r.linkId||r.linkId===linkId);
  },
  async archiveResolvedConflicts(){
    const log=this.conflictLog;
    if(!log?.confirmed||!log.details?.length)return;
    const scope=log.serverId&&log.serverProfileId?this.linkId(log.serverId,log.serverProfileId,log.phoneProfileId||ProfileManager.activeId):null;
    const receipts=log.details.map(d=>{
      const choice=log.decisions?.[d.id];
      return choice?.signature===d.signature?core.resolutionReceipt(d,choice.side):null;
    }).filter(Boolean);
    if(receipts.length)await this.saveResolved(receipts,scope);
  },
  async clearConflicts(){this.conflictLog=null;await this.saveConflicts();},
  async recordConflicts(details,meta={}){
    if(!Array.isArray(details)||!details.length)return;
    const old=this.conflictLog?.profileId===ProfileManager.activeId?this.conflictLog:null;
    const decisions={};
    for(const entry of details){
      const prev=old?.decisions?.[entry.id];
      if(prev?.signature===entry.signature&&['phone','computer'].includes(prev.side))decisions[entry.id]=prev;
    }
    const unchanged=old&&old.details?.length===details.length&&old.details.every((d,i)=>d.id===details[i].id&&d.signature===details[i].signature);
    this.conflictLog={profileId:ProfileManager.activeId,serverId:meta.serverId??old?.serverId??null,
      serverProfileId:meta.serverProfileId??old?.serverProfileId??null,
      phoneProfileId:meta.phoneProfileId??old?.phoneProfileId??null,
      details:clone(details),decisions,confirmed:!!(old?.confirmed&&unchanged),at:new Date().toISOString()};
    await this.saveConflicts();
  },
  renderConflictButton(){
    const button=document.getElementById('ta-peer-conflict-button');
    const count=Number(this.conflictLog?.details?.length||0);
    if(button){button.innerHTML='<i class="fas fa-exclamation-triangle" aria-hidden="true"></i> سجل التعارض ('+count+')'+(this.resolvedHistory.length?' — المحسومة ('+this.resolvedHistory.length+')':'');button.classList.toggle('has-conflicts',count>0);}
    const panel=document.getElementById('ta-peer-conflict-panel');
    if(panel&&!panel.hidden)this.renderConflictLog();
  },
  openConflictLog(){
    const panel=document.getElementById('ta-peer-conflict-panel');if(!panel)return;
    panel.hidden=!panel.hidden;
    if(!panel.hidden){this.renderConflictLog();panel.scrollIntoView?.({block:'nearest',behavior:'smooth'});}
  },
  renderConflictLog(){
    const panel=document.getElementById('ta-peer-conflict-panel');if(!panel||panel.hidden)return;
    const entries=this.conflictLog?.details||[];
    const history=(this.resolvedHistory||[]).slice(-60).reverse();
    const archived=history.length?`<details class="ta-resolved-history"><summary>التعارضات المحسومة والمحفوظة (${this.resolvedHistory.length})</summary><p class="ta-conflict-fields">هذه قرارات محفوظة تُستخدم تلقائياً عند إعادة إرسال النسخة المرفوضة دون تعديلها. لا تتضمن كلمات سر ولا نسخاً كاملة من العمليات.</p>${history.map(e=>`<p class="ta-conflict-fields">✓ ${escape(e.collection)} — ${escape(e.recordId)} — ${escape(e.chosen==='phone'?'اعتماد الموبايل':'اعتماد الكمبيوتر')} — ${escape(e.at||'')}</p>`).join('')}</details>`:'';
    if(!entries.length){panel.innerHTML='<p class="ta-conflict-empty">لا توجد تعارضات جديدة حالياً.</p>'+archived;return;}
    const labels={categories:'المجموعات',items:'المواد',accounts:'الحسابات',invoices:'الفواتير',vouchers:'السندات',warehouses:'المستودعات',transfers:'المناقلات',expenses:'المصاريف',capitalMovements:'رأس المال',fieldAgents:'موظفو البيع',fieldImported:'سجلات استلام الموظفين',fieldEvents:'سجل المزامنة',fieldCashTransfers:'دفعات الموظفين',fieldOperationHistory:'سجل عمليات الموظفين',fieldCompany:'هوية ربط الموظفين',settings:'الإعدادات',inventory:'المخزون'};
    const visible=(e,side)=>{
      if(!e['has'+(side==='phone'?'Phone':'Computer')])return '<strong class="ta-conflict-deleted">محذوف أو غير موجود</strong>';
      const item=e[side],name=(item===null||typeof item!=='object')?String(item):(item?.name||item?.accountName||item?.description||item?.number||item?.id||e.recordId);
      const props=typeof item==='object'&&item?['type','number','date','amount','netTotal','currency','accountId','warehouseId','qty','rows'].filter(k=>Object.hasOwn(item,k)).map(k=>`${k}: ${typeof item[k]==='object'?JSON.stringify(item[k]):item[k]}`).join(' | '):'';
      const safeItem=(item&&typeof item==='object')?JSON.parse(JSON.stringify(item)):item;
      if(e.collection==='fieldAgents'&&safeItem){for(const key of ['key','token','pairingKey','pairedSecret'])if(Object.hasOwn(safeItem,key))safeItem[key]='[محجوب للأمان]';}
      const dump=JSON.stringify(safeItem,null,2);
      return `<strong>${escape(name)}</strong><p class="ta-conflict-fields">${escape(props)}</p><details><summary>عرض جميع بيانات النسخة</summary><pre dir="auto">${escape(dump)}</pre></details>`;
    };
    const rows=entries.map((e,i)=>{
      const inventory=e.kind==='inventory';const decision=this.conflictLog?.decisions?.[e.id];
      return `<article class="ta-conflict-row"><header><b>${i+1}. ${escape(labels[e.collection]||e.collection)} — ${escape(e.recordId)}</b><small>${inventory?'تعارض مخزون يحتاج تصحيح الكمية':e.kind==='duplicate'?'نفس معرّف عملية الموظف ولكن التفاصيل مختلفة؛ اختر النسخة الصحيحة':'يُحتمل أن تكون النسختان مختلفتين؛ راجع البيانات قبل الاختيار'}</small></header>
        ${inventory?`<p class="ta-conflict-stock">${escape(e.label||e.recordId)}. افتح المواد والمستودعات وصحّح الرصيد أو الفواتير أولاً، ثم أعد المزامنة.</p>`:
        `<div class="ta-conflict-versions"><div><h5>نسخة الموبايل الرئيسي</h5>${visible(e,'phone')}</div><div><h5>نسخة الكمبيوتر</h5>${visible(e,'computer')}</div></div>
        <div class="ta-conflict-choose"><button type="button" class="${decision?.side==='phone'?'selected':''}" onclick="TiqanyPeerSync.chooseConflict(${i},'phone')">${decision?.side==='phone'?'✓ ':''}اعتماد الموبايل</button><button type="button" class="${decision?.side==='computer'?'selected':''}" onclick="TiqanyPeerSync.chooseConflict(${i},'computer')">${decision?.side==='computer'?'✓ ':''}اعتماد الكمبيوتر</button></div>`}</article>`;
    }).join('');
    const pending=entries.filter(e=>e.kind!=='inventory'&&!['phone','computer'].includes(this.conflictLog?.decisions?.[e.id]?.side)).length;
    const stock=entries.some(e=>e.kind==='inventory');
    panel.innerHTML=`${archived}<div class="ta-conflict-alert"><strong>سجل التعارض — ${entries.length} سجل</strong><p>عند تأكيد المزامنة تُعتمد النسخة التي اخترتها ويُستبعد تعديل النسخة الأخرى من الدفتر الموحّد، مع حفظ أثر للقرار. لن تُحذف فاتورة مستقلة بهوية مختلفة. أي تعديل جديد على السجل سيطلب مراجعة جديدة.</p></div>${rows}<p class="ta-conflict-fields">${stock?'يوجد تعارض مخزون يحتاج إلى معالجة يدوية. ':''}${pending?`باقٍ ${pending} سجل دون اختيار.`:'تم اختيار جميع السجلات القابلة للحل.'}</p><button type="button" class="ta-peer-btn" ${stock||pending?'disabled':''} onclick="TiqanyPeerSync.confirmConflicts()">${desktop?'اعتماد الحلول على الكمبيوتر':'اعتماد الحلول وإعادة المزامنة'}</button>${this.conflictLog?.confirmed?'<span class="ta-conflict-approved">✓ تم تأكيد الاختيارات، بانتظار المزامنة.</span>':''}`;
  },
  async chooseConflict(index,side){
    if(this.busy||!['phone','computer'].includes(side))return;
    const entry=this.conflictLog?.details?.[index];if(!entry||entry.kind==='inventory')return;
    this.conflictLog.decisions[entry.id]={signature:entry.signature,side};this.conflictLog.confirmed=false;
    await this.saveConflicts();this.renderConflictLog();
  },
  async confirmConflicts(){
    if(this.busy||this.blocked())return this.message('أغلق التعديلات المفتوحة أولاً.',true);
    const log=this.conflictLog;if(!log?.details?.length)return;
    if(log.details.some(e=>e.kind==='inventory'||!['phone','computer'].includes(log.decisions?.[e.id]?.side)))return this.message('يجب معالجة المخزون واختيار حل لكل سجل قبل الاعتماد.',true);
    if(!window.confirm('هل تريد اعتماد الاختيارات التي حددتها؟ ستُطبَّق على الجهازين عند نجاح المزامنة، بعد إنشاء نقاط استرجاع.'))return;
    log.confirmed=true;await this.saveConflicts();this.renderConflictLog();
    if(desktop)this.message('تم اعتماد الاختيارات. شغّل المزامنة من الهاتف الرئيسي أو انتظر المحاولة التلقائية.');
    else await this.sync(false);
  },
  async saveLink(){if(desktop)return;
    const host=document.getElementById('ta-peer-ip')?.value.trim(),port=Number(document.getElementById('ta-peer-port')?.value),key=document.getElementById('ta-peer-key')?.value.trim();
    const saveLinkAuthorized=()=>{
      if(!window.AndroidPeerSync||AndroidPeerSync.configure(host,port,key)!=='saved')return this.message(t("تأكد من عنوان Wi-Fi المحلي والمنفذ ورمز الربط الصحيح","Check the local Wi-Fi IP address, port and pairing key"),true);
      /* Reconfiguring an IP address must not discard the last common ancestor. */
      this.approved=false;this.renderConnection();this.message(t("حُفظ الربط. اضغط مزامنة الآن لتأكيد الشركة والبيانات.","Connection saved. Select Sync now to confirm the business and merge data."));
    };
    if(State.settings?.appProtection?.protectDeviceAddition === true){
      this.authorizePairing('تحقق بالبصمة أو كلمة سر المدير قبل حفظ ربط الكمبيوتر يدويًا',saveLinkAuthorized);
    }else saveLinkAuthorized();
  },
  async unlink(){if(desktop)return;if(!confirm(t("هل تريد إلغاء ربط هذا الهاتف بالكمبيوتر؟ لن تُحذف البيانات المحاسبية.","Disconnect the phone from the computer? Accounting data will not be deleted.")))return;
    AndroidPeerSync.reset();await ProfileManager.putBatch([{id:this.key(),data:null}]);await this.clearConflicts();this.approved=false;this.renderConnection();this.message(t("تم إلغاء الربط المحلي.","Local connection removed."));
  },
  call(message){return new Promise((resolve,reject)=>{
      if(this.pending)return reject(Error(t("هناك اتصال قيد التنفيذ","A connection is already active")));
      const timer=setTimeout(()=>{this.pending=null;reject(Error(t("انتهت مهلة الاتصال بالكمبيوتر","Connection to the computer timed out")));},43000);
      this.pending={resolve,reject,timer};
      try{AndroidPeerSync.request(JSON.stringify({protocol:'TIQANY-PEER-1',...message}));}
      catch(e){clearTimeout(timer);this.pending=null;reject(e);}
  });},
  async sync(silent=false){
    if(desktop)return this.message(t("يستقبل الكمبيوتر البيانات تلقائياً عند المزامنة من الهاتف.","Windows receives updates automatically when sync starts on the phone."));
    if(this.busy)return silent?undefined:this.message('المزامنة جارية بالفعل؛ انتظر اكتمال المحاولة الحالية.',false);
    if(this.blocked())return silent?undefined:this.message(this.blockReason(),true);
    if(!window.AndroidPeerSync)return this.message(t("يلزم تثبيت APK الرئيسي الجديد لتشغيل الربط المحلي.","Install the updated main Android APK to enable local sync."),true);
    const info=JSON.parse(AndroidPeerSync.status()||'{}');if(!info.host||!info.port)return silent?undefined:this.message(t("اضبط عنوان الكمبيوتر ومفتاح الربط أولاً.","Set the computer IP and pairing key first."),true);
    if(silent&&!info.approved)return;
    this.busy=true;
    try {
      const stateBefore=this.snapshot(),origin=core.canonical(stateBefore);
      this.message(t("جارٍ الاتصال بالكمبيوتر...","Connecting to computer..."));
      const existingBase=await this.base();
      const outgoingUid=await this.ensureCompanyUid();
      const phoneEmpty=core.emptyLedger(stateBefore);
      const fetched=await this.call({action:'fetch',profileName:State.settings.companyName,phoneProfileId:ProfileManager.activeId,
        phoneCompanyUid:outgoingUid,phoneEmpty,knownServerId:existingBase?.serverId||'',
        knownServerProfileId:existingBase?.serverProfileId||''});
      if(!fetched.ok){if(fetched.code==='SYNC_BUSY'){this.message('الكمبيوتر مشغول بمزامنة أخرى، ستجري إعادة المحاولة.',false);return false;}throw Error(fetched.error||t('فشل قراءة بيانات الكمبيوتر','Could not read data from the computer'));}
      if(!fetched.snapshot||!fetched.ticket||!fetched.serverId)throw Error(t("رد غير مكتمل من الكمبيوتر","Incomplete response from computer"));
      const saved=existingBase;
      if(!desktop&&window.AndroidPeerSync?.bindServerId&&!(AndroidPeerSync.bindServerId(fetched.serverId)))
        throw Error('هوية الكمبيوتر لا تطابق الكمبيوتر المقترن. افحص رمز الربط.');
      if(saved?.snapshot&&saved.serverId!==fetched.serverId)throw Error(t("الربط يخص كمبيوتراً مختلفاً. ألغ الربط القديم أولاً.","This pairing belongs to another computer. Disconnect first."));
      if(saved?.snapshot&&saved.profileId!==ProfileManager.activeId)throw Error(t("تغيرت الشركة الحالية، تحقق من الربط","The selected business changed. Check the pairing."));
      if(saved?.snapshot&&saved.serverProfileId!==fetched.profileId)throw Error(t("تم تبديل الشركة المفتوحة على الكمبيوتر. افتح الشركة المرتبطة أولاً.","A different business is open on Windows. Switch back to the paired business."));
      const companyMatch=core.companyJoin(outgoingUid,fetched.companyUid,{empty:phoneEmpty,remoteEmpty:fetched.desktopEmpty===true,existingVerifiedLink:this.priorLinkMatches(saved,fetched.serverId,fetched.profileId)});
      if(!companyMatch.allowed)throw Error(companyMatch.reason);
      const localName=String(State.settings.companyName||'').trim();
      const bootstrap=fetched.desktopEmpty===true&&!phoneEmpty&&!saved?.snapshot;
      if(bootstrap){
        if(silent)return; // Never provision a new manager via background sync.
        const approval=this.bootstrapApproval;
        const valid=approval&&approval.profileId===ProfileManager.activeId&&approval.serverId===fetched.serverId&&
          approval.serverProfileId===fetched.profileId&&approval.phoneUid===outgoingUid&&
          approval.phoneDigest===core.digest(stateBefore)&&approval.desktopDigest===core.digest(fetched.snapshot)&&
          Date.now()<approval.expiresAt;
        if(!valid){this.bootstrapApproval=null;this.requestBootstrapApproval(fetched,fetched.snapshot,stateBefore);return false;}
        // Single-use proof. An interrupted transfer requires a fresh manager approval.
        this.bootstrapApproval=null;
      }

      if(companyMatch.adopt && silent && !companyMatch.legacy)return; // A truly new empty phone requires explicit approval; an authenticated old link migrates safely.

      if(!saved?.snapshot&&!bootstrap){
        if(silent)return;
        const message=`ربط الشركة «${localName}» مع الكمبيوتر لأول مرة.
هوية الشركة لدى الكمبيوتر ستُعتمد فقط إذا كان الهاتف فارغاً أو سبق ربطه بالكمبيوتر نفسه.\nفواتير الهاتف: ${stateBefore.invoices.length}، فواتير الكمبيوتر: ${fetched.snapshot.invoices.length}.\nستُدمج السجلات، وستُعتمد إعدادات العملة وسعر الصرف من الكمبيوتر، مع حفظ نقاط استرجاع محلية. هل تؤكد؟`;
        if(!window.confirm(message)){this.message(t("أُلغيت المزامنة الأولى.","Initial sync cancelled."));return;}
      }
      // Apply only explicit, confirmed approvals tied to the exact versions reviewed.
      const localLog=this.conflictLog;
      const localChoices=localLog?.confirmed&&localLog.serverId===fetched.serverId&&localLog.serverProfileId===fetched.profileId?localLog.decisions:{};
      const desktopChoices=fetched.conflictResolutions||{};
      const decisions={},disagreements=[];
      for(const [id,choice] of Object.entries({...desktopChoices,...localChoices})){
        const local=localChoices?.[id],fromDesktop=desktopChoices?.[id];
        if(local&&fromDesktop&&(local.signature!==fromDesktop.signature||local.side!==fromDesktop.side)){disagreements.push(id);continue;}
        decisions[id]=choice;
      }
      if(disagreements.length){
        await this.outage('توقفت المزامنة بسبب اختلاف قرارات التعارض المعتمدة بين الكمبيوتر والرئيسي','conflict');
        this.message('توجد اختيارات متعارضة معتمدة على الجهازين. راجع سجل التعارض لتوحيد القرار قبل المزامنة.',!silent);
        return false;
      }
      const linkId=this.linkId(fetched.serverId,fetched.profileId,ProfileManager.activeId);
      const localReceipts=await this.receiptsFor(linkId);
      const remoteReceipts=Array.isArray(fetched.resolvedReceipts)?fetched.resolvedReceipts:[];
      const validRemote=remoteReceipts.filter(r=>core.validReceipt(r)&&(!r.linkId||r.linkId===linkId));
      const history=core.combineReceipts(localReceipts,validRemote);
      const merged=bootstrap
        ?{ok:true,snapshot:stateBefore,stats:{added:0,deduplicated:0,renumbered:0},conflicts:[],resolvedReceipts:[]}
        :core.merge(saved?.snapshot||null,stateBefore,fetched.snapshot,decisions,history);
      if(!merged.ok){
        await this.recordConflicts(merged.details,{serverId:fetched.serverId,serverProfileId:fetched.profileId});
        try{if(JSON.stringify(merged.details).length<4500000)await this.call({action:'report-conflicts',ticket:fetched.ticket,serverId:fetched.serverId,profileId:fetched.profileId,phoneProfileId:ProfileManager.activeId,phoneCompanyUid:outgoingUid,details:merged.details});}
        catch(reportErr){console.warn('Windows conflict log could not be updated',reportErr);}
        await this.outage('توقفت المزامنة بسبب '+merged.conflicts.length+' تعارض في العمليات يتطلب اعتماد حل من المدير','conflict');
        this.message(disagreements.length?'توجد اختيارات متعارضة بين الهاتف والكمبيوتر؛ يجب توحيدها في سجل التعارض.':'تعذّرت المزامنة بسبب '+merged.conflicts.length+' تعارض. افتح «سجل التعارض» لمراجعتها.',!silent);
        return false;
      }
      if(this.blocked()||core.canonical(this.snapshot())!==origin)throw Error(t("تغيرت بيانات الهاتف أثناء المزامنة. أعد المحاولة.","Phone data changed during sync. Try again."));
      // Send approved receipts with the atomic ledger commit. A receipt remains
      // usable after a phone reinstall/re-pair and on the computer's next fetch.
      const explicitApprovals=merged.resolvedReceipts.filter(r=>
        decisions[r.id]?.signature===r.signature&&decisions[r.id]?.side===r.chosen).map(r=>({...r,linkId}));
      const appliedReceipts=core.combineReceipts(core.retireOppositeReceipts(history,explicitApprovals),
        merged.resolvedReceipts.map(r=>({...r,linkId})));
      const fieldCompanyId=String(State.fieldSync?.companyId||'company_'+outgoingUid.slice('business_'.length));
      const provision=bootstrap?{companyUid:outgoingUid,fieldCompanyId,protection:core.bootstrapProtection(State.settings?.appProtection)}:undefined;
      if(bootstrap&&!provision.protection)throw Error('رمز الحماية غير صالح لنقله إلى الكمبيوتر');
      const committed=await this.call({action:'commit',ticket:fetched.ticket,serverId:fetched.serverId,profileId:fetched.profileId,phoneCompanyUid:outgoingUid,
        snapshot:merged.snapshot,resolvedReceipts:appliedReceipts,explicitApprovals,provision});
      if(!committed.ok){if(committed.code==='SYNC_BUSY'){this.message('الكمبيوتر مشغول بمزامنة أخرى، ستتم إعادة المحاولة دون فقدان البيانات.',false);return false;}throw Error(committed.error||t("رفض الكمبيوتر حفظ الدمج","Windows rejected the merged data"));}
      if(this.blocked()||core.canonical(this.snapshot())!==origin)throw Error(t("حفظ الكمبيوتر الدمج لكن بيانات الهاتف تغيرت. أعد المزامنة قبل أي تعديل آخر.","Windows saved the merge, but phone data changed. Sync again before editing."));
      if(core.canonical(merged.snapshot)!==origin||companyMatch.adopt||(bootstrap&&State.fieldSync?.companyId!==fieldCompanyId)){
        await ProfileManager.makeCheckpoint('before-windows-peer-sync');
        const notificationBefore=clone(State.alertCenter||{entries:[]});
        const incoming=window.TiqanyPeerEvents?.records(stateBefore,merged.snapshot,'windows');
        core.apply(State,merged.snapshot);
        if(companyMatch.adopt)State.settings.companyUid=fetched.companyUid;
        if(bootstrap){State.fieldSync??={};State.fieldSync.companyId=fieldCompanyId;}
        const eventEntries=typeof ManagerNotifications!=='undefined'?
          ManagerNotifications.filterPeerEvents(incoming?.entries||[]):(incoming?.entries||[]);
        if(incoming?.truncated&&eventEntries.length)eventEntries.push({id:'peer:more:'+core.digest(merged.snapshot).slice(0,24),type:'peer-operation',title:'وصول عمليات إضافية',detail:'وصلت '+(incoming.count-incoming.entries.length)+' تغييرات أخرى؛ راجع سجلات العمليات.',at:new Date().toISOString(),read:false});
        if(eventEntries.length){State.alertCenter??={entries:[]};State.alertCenter.entries??=[];
          State.alertCenter.entries.unshift(...eventEntries);State.alertCenter.entries=State.alertCenter.entries.slice(0,3000);}
        try{await StorageEngine.saveState();
          if(eventEntries.length&&typeof ManagerNotifications!=='undefined')ManagerNotifications.saved(eventEntries.slice(0,12));
        }catch(err){
          core.apply(State,stateBefore);State.settings.companyUid=outgoingUid;State.alertCenter=notificationBefore;throw err;
        }
      }
      // Persist receipts BEFORE clearing pending conflict choices. Do not silently
      // forget the resolution when disk storage fails.
      await this.saveResolved(appliedReceipts,linkId,explicitApprovals);
      await this.saveBase(fetched.serverId,fetched.profileId,merged.snapshot);
      await this.clearConflicts();
      AndroidPeerSync.approve();this.approved=true;this.lastSuccessfulAt=Date.now();this.recovered();this.updatePresence();
      if(bootstrap)this.message('نُقلت بيانات الشركة إلى الكمبيوتر. أدخل كلمة سر المدير على الكمبيوتر لفتح الحساب.');
      else this.message(`اكتملت المزامنة: ${merged.stats.added} سجلات جديدة و${merged.stats.deduplicated||0} نسخ متكررة لعمليات موظفين دُمجت دون احتسابها مجدداً، و${merged.stats.renumbered} رقم مستند مُعدّل.`);
      if(AppNav.current()?.screen!=='settings')AppNav.renderCurrent();
      return true;
    }catch(e){
      const reason=String(e.message||e);this.lastSuccessfulAt=0;this.updatePresence();
      if(info.approved || !silent)await this.outage(reason);
      this.message(t('فشلت المزامنة دون حذف البيانات: ')+reason,!silent);return false;
    }
    finally{this.busy=false;this.renderConnection();}
  },
  async handleRequest(request){if(!desktop)return;
    const {requestId,data}=request;
    const reply=x=>WindowsPeerSync.reply(requestId,x);
    try{
      if(this.busy)return reply({ok:false,code:'SYNC_BUSY',error:'الكمبيوتر ينفذ مزامنة أخرى الآن، ستتم إعادة المحاولة تلقائيًا'});
      if(this.blocked())return reply({ok:false,code:'UNSAVED_EDIT',error:this.blockReason()});
      if(data.action==='fetch'){
        const desktopUid=await this.ensureCompanyUid();
        const knownLink=data.knownServerId===this.server?.serverId &&
          data.knownServerProfileId===ProfileManager.activeId &&
          typeof data.knownServerId==='string'&&data.knownServerId.length>0;
        const snapshot=this.snapshot();
        const desktopEmpty=core.emptyLedger(snapshot)&&!State.settings?.peerBootstrapSourceUid;
        const identity=core.companyJoin(data.phoneCompanyUid,desktopUid,{empty:data.phoneEmpty===true,remoteEmpty:desktopEmpty,existingVerifiedLink:knownLink});
        if(!identity.allowed)return reply({ok:false,error:identity.reason});
        if(identity.adoptRemote&&data.phoneEmpty!==false)return reply({ok:false,error:'حدّث تطبيق الموبايل قبل نقل شركة إلى كمبيوتر جديد'});
        this.lastPhoneSeenAt=Date.now();this.recovered('transport');this.updatePresence();
        const ticket=String(Date.now())+'-'+Math.random().toString(36).slice(2);
        const conflictResolutions=this.conflictLog?.confirmed&&this.conflictLog.profileId===ProfileManager.activeId&&this.conflictLog.phoneProfileId===data.phoneProfileId?this.conflictLog.decisions:{};
        const linkId=this.linkId(this.server?.serverId,ProfileManager.activeId,data.phoneProfileId);
        const resolvedReceipts=await this.receiptsFor(linkId);
        this.locks.set(ticket,{snapshot:core.canonical(snapshot),desktopEmpty,adoptDesktop:desktopEmpty&&data.phoneEmpty===false&&!knownLink,phoneEmptyClaim:data.phoneEmpty===true,
          profileId:ProfileManager.activeId,phoneProfileId:data.phoneProfileId,phoneCompanyUid:data.phoneCompanyUid,companyUid:desktopUid,resolutionSnapshot:core.canonical(conflictResolutions),resolvedSnapshot:core.canonical(resolvedReceipts),linkId,created:Date.now()});
        for(const [k,v] of this.locks)if(Date.now()-v.created>60000)this.locks.delete(k);
        return reply({ok:true,ticket,snapshot,desktopEmpty,companyName:State.settings.companyName,companyUid:desktopUid,profileId:ProfileManager.activeId,serverId:this.server?.serverId,conflictResolutions,resolvedReceipts});
      }
      if(data.action==='report-conflicts'){
        const lock=this.locks.get(data.ticket);
        if(!lock||Date.now()-lock.created>60000||lock.profileId!==ProfileManager.activeId||data.profileId!==ProfileManager.activeId||data.serverId!==this.server?.serverId||data.phoneCompanyUid!==lock.phoneCompanyUid||lock.companyUid!==this.companyUid()||core.canonical(this.snapshot())!==lock.snapshot)
          return reply({ok:false,error:'انتهت جلسة المزامنة؛ أعد المحاولة'});
        if(!Array.isArray(data.details)||data.details.length>300||JSON.stringify(data.details).length>4500000)
          return reply({ok:false,error:'سجل التعارض كبير جداً للعرض؛ راجع السجلات على الهاتف'});
        const valid=core.COLLECTIONS.concat(['settings','inventory']);
        const state=this.snapshot();
        for(const d of data.details){
          if(!d||typeof d.id!=='string'||d.id.length>500||!valid.includes(d.collection)||typeof d.signature!=='string'||!['record','settings','inventory','duplicate'].includes(d.kind))
            return reply({ok:false,error:'بيانات تعارض غير صالحة'});
          const key=String(d.recordId||'');
          if((d.kind!=='inventory'&&d.id!==d.collection+'|'+key)||
            (d.kind==='inventory'&&d.collection!=='inventory')||
            (d.kind==='settings'&&d.collection!=='settings')||
            (d.kind==='record'&&!core.COLLECTIONS.includes(d.collection))||
            (d.kind==='duplicate'&&(!['accounts','invoices','vouchers','expenses'].includes(d.collection)||!key.startsWith('field-origin:'))))
            return reply({ok:false,error:'نوع التعارض غير صالح'});
          if(d.kind==='inventory')continue;
          const token=core.digest([d.hasBase?d.base:{missing:true},d.hasPhone?d.phone:{missing:true},d.hasComputer?d.computer:{missing:true}]);
          if(token!==d.signature)return reply({ok:false,error:'توقيع بيانات التعارض غير صحيح'});
          const computer=d.collection==='settings'?state.sharedSettings[key]:
             d.kind==='duplicate'?(state[d.collection]||[]).find(r=>'field-origin:'+core.fieldIdentity(d.collection,r)===key):
             (state[d.collection]||[]).find(r=>d.collection==='categories'?'str:'+r===key:'id:'+r?.id===key);
          if(core.canonical(computer)!==core.canonical(d.computer))return reply({ok:false,error:'بيانات الكمبيوتر تغيرت، أعد المزامنة'});
        }
        await this.recordConflicts(data.details,{serverId:this.server?.serverId,serverProfileId:ProfileManager.activeId,phoneProfileId:data.phoneProfileId});
        reply({ok:true,count:data.details.length});
        await this.outage('توقفت مزامنة الهاتف مع الكمبيوتر بسبب '+data.details.length+' تعارض يحتاج حل المدير','conflict');
        this.message('توقف دمج الهاتف: '+data.details.length+' تعارض. افتح «سجل التعارض» من الضبط.',true);
        return;
      }
      if(data.action==='commit'){
        const lock=this.locks.get(data.ticket);this.locks.delete(data.ticket);
        if(!lock||Date.now()-lock.created>60000||lock.profileId!==ProfileManager.activeId||data.profileId!==ProfileManager.activeId||data.serverId!==this.server?.serverId||lock.companyUid!==this.companyUid()||lock.phoneCompanyUid!==data.phoneCompanyUid) return reply({ok:false,error:t("انتهت جلسة الدمج أو تغيرت الشركة","Sync session expired or business changed")});
        if(core.canonical(this.snapshot())!==lock.snapshot)return reply({ok:false,error:t("تغير دفتر الكمبيوتر أثناء المزامنة؛ أعد المحاولة","Windows data changed during sync. Retry.")});
        const currentChoices=this.conflictLog?.confirmed&&this.conflictLog.profileId===ProfileManager.activeId&&this.conflictLog.phoneProfileId===lock.phoneProfileId?this.conflictLog.decisions:{};
        if(core.canonical(currentChoices)!==lock.resolutionSnapshot)return reply({ok:false,error:'تغيّر قرار حل التعارض أثناء المزامنة؛ أعد المحاولة'});
        if(core.canonical(await this.receiptsFor(lock.linkId))!==lock.resolvedSnapshot)return reply({ok:false,error:'تغيّر سجل التعارضات المحسومة أثناء المزامنة؛ أعد المحاولة'});
        if(data.resolvedReceipts!==undefined&&(!Array.isArray(data.resolvedReceipts)||data.resolvedReceipts.length>2000||JSON.stringify(data.resolvedReceipts).length>900000||data.resolvedReceipts.some(r=>!core.validReceipt(r)||(r.linkId&&r.linkId!==lock.linkId))))
          return reply({ok:false,error:'بيانات قرارات التعارض المحسومة غير صالحة'});
        if(data.explicitApprovals!==undefined&&(!Array.isArray(data.explicitApprovals)||data.explicitApprovals.length>300||
          data.explicitApprovals.some(r=>!core.validReceipt(r)||(r.linkId&&r.linkId!==lock.linkId)||
          !(data.resolvedReceipts||[]).some(x=>core.canonical(x)===core.canonical(r)))))
          return reply({ok:false,error:'تأكيد قرارات التعارض غير صالح'});
        core.ensureSnapshot(data.snapshot);
        const original=this.snapshot();
        if(core.canonical(data.snapshot)!==lock.snapshot){
          this.busy=true;
          try{await ProfileManager.makeCheckpoint('before-main-phone-peer-sync');core.apply(State,data.snapshot);await StorageEngine.saveState();}
          catch(err){core.apply(State,original);throw err;}
          finally{this.busy=false;}
        }
        // Acknowledge only after persisting the conflict decisions to durable
        // storage. Keep the pending log intact when writing the archive fails.
        await this.saveResolved(data.resolvedReceipts||[],lock.linkId,data.explicitApprovals||[]);
        await this.archiveResolvedConflicts();
        await this.clearConflicts();
        reply({ok:true});this.message(t("وصلت آخر بيانات الهاتف وتم دمجها في دفتر الكمبيوتر.","Latest phone data merged into the Windows ledger."));
        if(AppNav.current()?.screen!=='settings'){AppNav.renderCurrent();}
      }
    }catch(err){reply({ok:false,error:String(err.message||err)});}
  },
  renderSettings(main){
    if(!main||document.getElementById('ta-peer-settings'))return;
    
    const title='المزامنة المحلية: الهاتف الرئيسي ↔ الكمبيوتر';
    const opened='';
    ((typeof main.querySelector==='function'&&main.querySelector('[data-app-build]')) || main).insertAdjacentHTML((typeof main.querySelector==='function'&&main.querySelector('[data-app-build]'))?'afterend':'afterbegin',`<details class="settings-section" data-settings-section="mobile-computer-sync" ontoggle="TiqanyPeerSync.guardSettingsToggle(this);SettingsController.onSectionToggle(this)"${opened}><summary class="settings-section-heading" onclick="TiqanyPeerSync.requestSettingsAccess(event)" aria-label="مزامنة الموبايل و الكمبيوتر"><span class="settings-section-leading"><span class="ta-connected-devices-icon" aria-hidden="true">${connectedDevicesIcon}</span><span><span class="settings-section-name">مزامنة الموبايل و الكمبيوتر</span><span class="settings-section-note">الربط المحلي بين الرئيسي والكمبيوتر ومسح رمز QR</span></span></span><i class="fas fa-chevron-down settings-section-arrow" aria-hidden="true"></i></summary><div class="settings-section-body"><section id="ta-peer-settings" class="rounded-2xl border border-teal-300 bg-white p-4 mb-4 space-y-2 text-right" dir="rtl"><h3 class="font-black text-base text-teal-900"><span class="ta-connected-devices-inline" aria-hidden="true">${connectedDevicesIcon}</span> ${title}</h3><p class="text-xs text-slate-600">${desktop?t('أبقِ الكمبيوتر والهاتف على شبكة Wi-Fi واحدة. أدخل بيانات الربط المعروضة هنا في إعدادات الهاتف الرئيسي.','Keep computer and phone on the same Wi-Fi network. Enter the details shown here in the main phone app.'):t('الربط محلي دون إنترنت. احصل على العنوان ورمز الربط من الضبط في الكمبيوتر.','Local sync without internet. Get address and pairing key from Windows settings.')}</p><div id="ta-peer-connection" class="text-sm space-y-2"></div><button type="button" class="ta-peer-btn" onclick="TiqanyPeerSync.${desktop?'config':'sync'}()">${desktop?t('تحديث عنوان الاتصال','Refresh connection details'):t('مزامنة الآن','Sync now')}</button> <button type="button" id="ta-peer-conflict-button" class="ta-peer-btn ta-peer-conflict-button" onclick="TiqanyPeerSync.openConflictLog()"><i class="fas fa-exclamation-triangle"></i> سجل التعارض (0)</button><div id="ta-peer-conflict-panel" class="ta-peer-conflict-panel" hidden></div><p id="ta-peer-status" class="text-xs text-teal-800 font-bold">${escape(this.last)}</p></section></div></details>`);
    this.renderConnection();Promise.all([this.loadConflicts(),this.loadResolved()]).catch(err=>console.warn('Could not read conflict history',err));
    if(this.headerRequestedSettings){
      this.headerRequestedSettings=false;
      // The inserted settings details must be connected before PIN approval.
      setTimeout(()=>this.requestHeaderAccess(),0);
    }
  },
  onNetworkChanged(){
    if(desktop)return;
    const status=window.AndroidPeerSync?JSON.parse(AndroidPeerSync.status()||'{}'):{};
    if(status.approved&&document.visibilityState==='visible')this.sync(true);
  },
  async probe(){
    if(desktop||this.polling||this.busy||this.pending||this.blocked()||document.visibilityState!=='visible'||Date.now()<this.nextProbeAt)return;
    if(!window.AndroidPeerSync)return;
    let link={};try{link=JSON.parse(AndroidPeerSync.status()||'{}');}catch(_){}
    if(!link.approved||!link.host)return;
    this.polling=true;
    try{
      const reply=await this.call({action:'probe'});
      if(!reply.ok||typeof reply.version!=='string'||reply.serverId!==link.serverId)throw Error('تعذر التحقق من هوية الكمبيوتر');
      this.probeFailures=0;this.nextProbeAt=0;this.lastSuccessfulAt=Date.now();this.recovered('transport');
      if(reply.version!==this.lastRemoteVersion){this.lastRemoteVersion=reply.version;
        if(await this.sync(true)!==true)this.lastRemoteVersion=null;
      }
    }catch(error){
      this.lastRemoteVersion=null;
      this.nextProbeAt=Date.now()+Math.min(30000,1500*2**Math.min(++this.probeFailures,5));
      if(!this.linkOutageNotified){this.lastSuccessfulAt=0;this.outage('توقفت المزامنة مع الكمبيوتر: '+String(error?.message||'انقطع Wi-Fi أو تعذّر الوصول إلى الجهاز'));}
    }
    finally{this.polling=false;}
  },
  async boot(){await this.loadConflicts();await this.loadResolved();setInterval(()=>this.updatePresence(),3000);
    await this.ensureCompanyUid();
    if(desktop){window.WindowsDesktop?.onPeerRequest(req=>this.handleRequest(req));
      window.WindowsDesktop?.onPeerStatus?.(status=>this.onServerStatus(status));
      setInterval(()=>this.watchHeartbeat(),3000);await this.config();
      this.lastPublishedDigest=core.digest(this.snapshot());window.WindowsPeerSync?.changed?.(ProfileManager.activeId,false);
    }else{
      setInterval(()=>this.probe(),1200);
      // Periodic full reconciliation catches legacy builds and lost wake-ups.
      setInterval(()=>{if(document.visibilityState==='visible'&&!this.polling)this.sync(true);},30000);
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')this.probe();});
      setTimeout(()=>this.probe(),200);
    }
  }
};
window.TiqanyPeerSync=peer;
// Save-triggered LAN sync: only after successful persistent storage commit.
// Never start a sync while an unsaved form is open or a remote merge is committing.
let taSaveSyncTimer=null;
let taSaveSyncRetry=0;
const taWakeSync=()=>{
  if(peer.busy||!window.AndroidPeerSync)return;
  let state={};try{state=JSON.parse(AndroidPeerSync.status()||'{}');}catch(_){}
  if(!state.approved||!state.host)return;
  clearTimeout(taSaveSyncTimer);taSaveSyncRetry=0;
  const attempt=()=>{
    if(peer.busy||peer.pending||peer.blocked()){
      if(++taSaveSyncRetry<80)taSaveSyncTimer=setTimeout(attempt,250);
      return;
    }
    taSaveSyncTimer=null;peer.sync(true);
  };
  taSaveSyncTimer=setTimeout(attempt,120);
};
const taOldSaveState=StorageEngine.saveState;
StorageEngine.saveState=async function(...args){
  const result=await taOldSaveState.apply(this,args);
  if(!peer.busy)taWakeSync();
  return result;
};

window.__tiqanyPeerReply=raw=>{
 const task=peer.pending;if(!task)return;clearTimeout(task.timer);peer.pending=null;
 try{const answer=JSON.parse(raw);task.resolve(answer);}catch(e){task.reject(e);}
};
const previous=Views.renderSettings;
Views.renderSettings=function(main,...args){previous.call(this,main,...args);peer.renderSettings(main);};
const oldLoad=window.onload;
window.onload=async function(...args){if(oldLoad)await oldLoad.apply(this,args);try{await peer.boot();}catch(e){console.warn('Peer boot error',e);}};
const style=document.createElement('style');style.textContent='.ta-connected-devices-icon{display:inline-flex!important;align-items:center!important;gap:2px!important;color:#0f766e!important;background:linear-gradient(150deg,#e0fbfa,#a5dbe9)!important;box-shadow:inset 0 2px 0 #fff,0 3px 0 #7fb7c4,0 5px 7px #17496025!important;border:1px solid #8cbac6;min-width:53px!important;width:53px!important;height:42px!important;border-radius:13px!important;padding:5px!important;flex-shrink:0}.ta-connected-devices-icon svg{width:46px;height:33px;flex-shrink:0}.ta-connected-devices-inline{display:inline-flex;align-items:center;gap:3px;color:#0f766e}.ta-connected-devices-inline svg{width:50px;height:34px}.ta-peer-qr-grid{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}.ta-peer-qr-card{background:#fff;border:2px solid #d1e5e8;padding:10px;border-radius:15px;text-align:center;min-width:215px;max-width:265px}.ta-peer-qr-image svg{width:100%;height:auto;max-width:225px;image-rendering:pixelated}.ta-peer-scan{margin:8px 0 12px!important}.ta-peer-manual{margin:12px 0;padding:8px;background:#f1f5f9;border-radius:12px}.ta-peer-manual>summary{font-weight:900;cursor:pointer;margin-bottom:8px}.ta-peer-manual>label{margin-top:8px}.ta-peer-input{display:block;width:100%;min-width:0;border:1px solid #94a3b8;border-radius:10px;padding:9px;margin-top:4px;direction:ltr;text-align:left;font-size:14px}.ta-peer-btn{display:inline-block;background:linear-gradient(160deg,#087d79,#065f69);color:white;border-radius:12px;padding:10px 16px;font-size:13px;font-weight:900;border:1px solid #0f766e;box-shadow:0 3px 0 #164e63}.ta-peer-btn.secondary{background:#475569;border-color:#334155;box-shadow:0 3px 0 #334155}.ta-peer-conflict-button{background:linear-gradient(160deg,#fff0dc,#fed7aa);color:#78350f;border-color:#d97706;box-shadow:0 3px 0 #b45309}.ta-peer-conflict-button.has-conflicts{background:linear-gradient(160deg,#f97316,#c2410c);color:#fff}.ta-peer-conflict-panel[hidden]{display:none!important}.ta-peer-conflict-panel{margin-top:12px;padding:12px;border:2px solid #fdba74;border-radius:14px;background:#fffbeb;max-height:72vh;overflow:auto}.ta-conflict-row{border:1px solid #cbd5e1;background:#fff;padding:10px;border-radius:10px;margin:10px 0}.ta-conflict-row header{display:flex;flex-direction:column;gap:4px}.ta-conflict-row header small,.ta-conflict-fields{font-size:12px;color:#475569;overflow-wrap:anywhere}.ta-conflict-versions{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin:10px 0}.ta-conflict-versions>div{border:1px solid #cbd5e1;padding:8px;border-radius:9px;min-width:0;overflow-wrap:anywhere}.ta-conflict-versions h5{font-weight:900;color:#134e4a;margin-bottom:6px}.ta-conflict-versions pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;font-size:11px}.ta-conflict-versions summary{cursor:pointer;color:#0f766e;font-size:12px}.ta-conflict-choose{display:flex;gap:8px;flex-wrap:wrap}.ta-conflict-choose button{border:1px solid #94a3b8;border-radius:10px;padding:8px 10px;background:#f1f5f9;color:#0f172a;font-weight:800}.ta-conflict-choose button.selected{background:#0f766e;color:white;border-color:#115e59}.ta-conflict-stock,.ta-conflict-deleted{color:#9a3412;font-weight:800}.ta-conflict-alert{color:#713f12}.ta-conflict-approved{display:block;color:#065f46;font-weight:800;margin-top:8px}.ta-peer-conflict-panel button:disabled{opacity:.5;cursor:not-allowed}';document.head.append(style);
})();
