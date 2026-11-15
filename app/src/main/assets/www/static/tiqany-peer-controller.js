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
const peer={busy:false,pending:null,server:null,locks:new Map(),last:'',approved:false,conflictLog:null,
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
    await ProfileManager.putBatch([{id:this.key(),data:null}]);await this.clearConflicts();this.approved=false;this.renderConnection();
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
    this.renderConflictButton();
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
    if(button){button.innerHTML='<i class="fas fa-exclamation-triangle" aria-hidden="true"></i> سجل التعارض ('+count+')';button.classList.toggle('has-conflicts',count>0);}
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
    if(!entries.length){panel.innerHTML='<p class="ta-conflict-empty">لا توجد تعارضات محفوظة حالياً.</p>';return;}
    const labels={categories:'المجموعات',items:'المواد',accounts:'الحسابات',invoices:'الفواتير',vouchers:'السندات',warehouses:'المستودعات',transfers:'المناقلات',expenses:'المصاريف',fieldAgents:'موظفو البيع',fieldImported:'سجلات استلام الموظفين',fieldEvents:'سجل المزامنة',fieldCashTransfers:'دفعات الموظفين',fieldOperationHistory:'سجل عمليات الموظفين',fieldCompany:'هوية ربط الموظفين',settings:'الإعدادات',inventory:'المخزون'};
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
      return `<article class="ta-conflict-row"><header><b>${i+1}. ${escape(labels[e.collection]||e.collection)} — ${escape(e.recordId)}</b><small>${inventory?'تعارض مخزون يحتاج تصحيح الكمية':'يُحتمل أن تكون النسختان مختلفتين؛ راجع البيانات قبل الاختيار'}</small></header>
        ${inventory?`<p class="ta-conflict-stock">${escape(e.label||e.recordId)}. افتح المواد والمستودعات وصحّح الرصيد أو الفواتير أولاً، ثم أعد المزامنة.</p>`:
        `<div class="ta-conflict-versions"><div><h5>نسخة الموبايل الرئيسي</h5>${visible(e,'phone')}</div><div><h5>نسخة الكمبيوتر</h5>${visible(e,'computer')}</div></div>
        <div class="ta-conflict-choose"><button type="button" class="${decision?.side==='phone'?'selected':''}" onclick="TiqanyPeerSync.chooseConflict(${i},'phone')">${decision?.side==='phone'?'✓ ':''}اعتماد الموبايل</button><button type="button" class="${decision?.side==='computer'?'selected':''}" onclick="TiqanyPeerSync.chooseConflict(${i},'computer')">${decision?.side==='computer'?'✓ ':''}اعتماد الكمبيوتر</button></div>`}</article>`;
    }).join('');
    const pending=entries.filter(e=>e.kind!=='inventory'&&!['phone','computer'].includes(this.conflictLog?.decisions?.[e.id]?.side)).length;
    const stock=entries.some(e=>e.kind==='inventory');
    panel.innerHTML=`<div class="ta-conflict-alert"><strong>سجل التعارض — ${entries.length} سجل</strong><p>لا تُطبَّق الاختيارات على قاعدة البيانات حتى تأكيد الحل ثم إتمام المزامنة. أي تعديل جديد على السجل سيطلب مراجعة جديدة.</p></div>${rows}<p class="ta-conflict-fields">${stock?'يوجد تعارض مخزون يحتاج إلى معالجة يدوية. ':''}${pending?`باقٍ ${pending} سجل دون اختيار.`:'تم اختيار جميع السجلات القابلة للحل.'}</p><button type="button" class="ta-peer-btn" ${stock||pending?'disabled':''} onclick="TiqanyPeerSync.confirmConflicts()">${desktop?'اعتماد الحلول على الكمبيوتر':'اعتماد الحلول وإعادة المزامنة'}</button>${this.conflictLog?.confirmed?'<span class="ta-conflict-approved">✓ تم تأكيد الاختيارات، بانتظار المزامنة.</span>':''}`;
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
    if(!window.AndroidPeerSync||AndroidPeerSync.configure(host,port,key)!=='saved')return this.message(t("تأكد من عنوان Wi-Fi المحلي والمنفذ ورمز الربط الصحيح","Check the local Wi-Fi IP address, port and pairing key"),true);
    await ProfileManager.putBatch([{id:this.key(),data:null}]);await this.clearConflicts();this.approved=false;this.renderConnection();this.message(t("حُفظ الربط. اضغط مزامنة الآن لتأكيد الشركة والبيانات.","Connection saved. Select Sync now to confirm the business and merge data."));
  },
  async unlink(){if(desktop)return;if(!confirm(t("هل تريد إلغاء ربط هذا الهاتف بالكمبيوتر؟ لن تُحذف البيانات المحاسبية.","Disconnect the phone from the computer? Accounting data will not be deleted.")))return;
    AndroidPeerSync.reset();await ProfileManager.putBatch([{id:this.key(),data:null}]);await this.clearConflicts();this.approved=false;this.renderConnection();this.message(t("تم إلغاء الربط المحلي.","Local connection removed."));
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
      const fetched=await this.call({action:'fetch',profileName:State.settings.companyName,phoneProfileId:ProfileManager.activeId});
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
        const message=`ربط الشركة «${localName}» مع الكمبيوتر لأول مرة.\nفواتير الهاتف: ${stateBefore.invoices.length}، فواتير الكمبيوتر: ${fetched.snapshot.invoices.length}.\nستُدمج السجلات، وستُعتمد إعدادات العملة وسعر الصرف من الكمبيوتر، مع حفظ نقاط استرجاع محلية. هل تؤكد؟`;
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
      const merged=core.merge(saved?.snapshot||null,stateBefore,fetched.snapshot,decisions);
      if(!merged.ok){
        await this.recordConflicts(merged.details,{serverId:fetched.serverId,serverProfileId:fetched.profileId});
        try{if(JSON.stringify(merged.details).length<4500000)await this.call({action:'report-conflicts',ticket:fetched.ticket,serverId:fetched.serverId,profileId:fetched.profileId,phoneProfileId:ProfileManager.activeId,details:merged.details});}
        catch(reportErr){console.warn('Windows conflict log could not be updated',reportErr);}
        this.message(disagreements.length?'توجد اختيارات متعارضة بين الهاتف والكمبيوتر؛ يجب توحيدها في سجل التعارض.':'تعذّرت المزامنة بسبب '+merged.conflicts.length+' تعارض. افتح «سجل التعارض» لمراجعتها.',!silent);
        return;
      }
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
      await this.clearConflicts();
      AndroidPeerSync.approve();this.approved=true;
      this.message(`اكتملت المزامنة: ${merged.stats.added} سجلات جديدة و${merged.stats.renumbered} رقم مستند مُعدّل.`);
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
        const conflictResolutions=this.conflictLog?.confirmed&&this.conflictLog.profileId===ProfileManager.activeId&&this.conflictLog.phoneProfileId===data.phoneProfileId?this.conflictLog.decisions:{};
        this.locks.set(ticket,{snapshot:core.canonical(snapshot),profileId:ProfileManager.activeId,phoneProfileId:data.phoneProfileId,resolutionSnapshot:core.canonical(conflictResolutions),created:Date.now()});
        for(const [k,v] of this.locks)if(Date.now()-v.created>60000)this.locks.delete(k);
        return reply({ok:true,ticket,snapshot,companyName:State.settings.companyName,profileId:ProfileManager.activeId,serverId:this.server?.serverId,conflictResolutions});
      }
      if(data.action==='report-conflicts'){
        const lock=this.locks.get(data.ticket);
        if(!lock||Date.now()-lock.created>60000||lock.profileId!==ProfileManager.activeId||data.profileId!==ProfileManager.activeId||data.serverId!==this.server?.serverId||core.canonical(this.snapshot())!==lock.snapshot)
          return reply({ok:false,error:'انتهت جلسة المزامنة؛ أعد المحاولة'});
        if(!Array.isArray(data.details)||data.details.length>300||JSON.stringify(data.details).length>4500000)
          return reply({ok:false,error:'سجل التعارض كبير جداً للعرض؛ راجع السجلات على الهاتف'});
        const valid=core.COLLECTIONS.concat(['settings','inventory']);
        const state=this.snapshot();
        for(const d of data.details){
          if(!d||typeof d.id!=='string'||d.id.length>500||!valid.includes(d.collection)||typeof d.signature!=='string'||!['record','settings','inventory'].includes(d.kind))
            return reply({ok:false,error:'بيانات تعارض غير صالحة'});
          const key=String(d.recordId||'');
          if((d.kind!=='inventory'&&d.id!==d.collection+'|'+key)||
            (d.kind==='inventory'&&d.collection!=='inventory')||
            (d.kind==='settings'&&d.collection!=='settings')||
            (d.kind==='record'&&!core.COLLECTIONS.includes(d.collection)))
            return reply({ok:false,error:'نوع التعارض غير صالح'});
          if(d.kind==='inventory')continue;
          const token=core.digest([d.hasBase?d.base:{missing:true},d.hasPhone?d.phone:{missing:true},d.hasComputer?d.computer:{missing:true}]);
          if(token!==d.signature)return reply({ok:false,error:'توقيع بيانات التعارض غير صحيح'});
          const computer=d.collection==='settings'?state.sharedSettings[key]:
             (state[d.collection]||[]).find(r=>d.collection==='categories'?'str:'+r===key:'id:'+r?.id===key);
          if(core.canonical(computer)!==core.canonical(d.computer))return reply({ok:false,error:'بيانات الكمبيوتر تغيرت، أعد المزامنة'});
        }
        await this.recordConflicts(data.details,{serverId:this.server?.serverId,serverProfileId:ProfileManager.activeId,phoneProfileId:data.phoneProfileId});
        reply({ok:true,count:data.details.length});
        this.message('توقف دمج الهاتف: '+data.details.length+' تعارض. افتح «سجل التعارض» من الضبط.',true);
        return;
      }
      if(data.action==='commit'){
        const lock=this.locks.get(data.ticket);this.locks.delete(data.ticket);
        if(!lock||Date.now()-lock.created>60000||lock.profileId!==ProfileManager.activeId||data.profileId!==ProfileManager.activeId||data.serverId!==this.server?.serverId) return reply({ok:false,error:t("انتهت جلسة الدمج أو تغيرت الشركة","Sync session expired or business changed")});
        if(core.canonical(this.snapshot())!==lock.snapshot)return reply({ok:false,error:t("تغير دفتر الكمبيوتر أثناء المزامنة؛ أعد المحاولة","Windows data changed during sync. Retry.")});
        const currentChoices=this.conflictLog?.confirmed&&this.conflictLog.profileId===ProfileManager.activeId&&this.conflictLog.phoneProfileId===lock.phoneProfileId?this.conflictLog.decisions:{};
        if(core.canonical(currentChoices)!==lock.resolutionSnapshot)return reply({ok:false,error:'تغيّر قرار حل التعارض أثناء المزامنة؛ أعد المحاولة'});
        core.ensureSnapshot(data.snapshot);
        const original=this.snapshot();
        if(core.canonical(data.snapshot)!==lock.snapshot){
          this.busy=true;
          try{await ProfileManager.makeCheckpoint('before-main-phone-peer-sync');core.apply(State,data.snapshot);await StorageEngine.saveState();}
          catch(err){core.apply(State,original);throw err;}
          finally{this.busy=false;}
        }
        try{await this.clearConflicts();}catch(err){console.warn('Could not clear old conflict log',err);}
        reply({ok:true});this.message(t("وصلت آخر بيانات الهاتف وتم دمجها في دفتر الكمبيوتر.","Latest phone data merged into the Windows ledger."));
        if(AppNav.current()?.screen!=='settings'){AppNav.renderCurrent();}
      }
    }catch(err){reply({ok:false,error:String(err.message||err)});}
  },
  renderSettings(main){
    if(!main||document.getElementById('ta-peer-settings'))return;
    
    const title='المزامنة المحلية: الهاتف الرئيسي ↔ الكمبيوتر';
    const opened=(typeof SettingsController!=='undefined' && SettingsController.expandedSections?.has('mobile-computer-sync')) ? ' open' : '';
    ((typeof main.querySelector==='function'&&main.querySelector('[data-app-build]')) || main).insertAdjacentHTML((typeof main.querySelector==='function'&&main.querySelector('[data-app-build]'))?'afterend':'afterbegin',`<details class="settings-section" data-settings-section="mobile-computer-sync" ontoggle="SettingsController.onSectionToggle(this)"${opened}><summary class="settings-section-heading" aria-label="مزامنة الموبايل و الكمبيوتر"><span class="settings-section-leading"><span class="ta-connected-devices-icon" aria-hidden="true">${connectedDevicesIcon}</span><span><span class="settings-section-name">مزامنة الموبايل و الكمبيوتر</span><span class="settings-section-note">الربط المحلي بين الرئيسي والكمبيوتر ومسح رمز QR</span></span></span><i class="fas fa-chevron-down settings-section-arrow" aria-hidden="true"></i></summary><div class="settings-section-body"><section id="ta-peer-settings" class="rounded-2xl border border-teal-300 bg-white p-4 mb-4 space-y-2 text-right" dir="rtl"><h3 class="font-black text-base text-teal-900"><span class="ta-connected-devices-inline" aria-hidden="true">${connectedDevicesIcon}</span> ${title}</h3><p class="text-xs text-slate-600">${desktop?t('أبقِ الكمبيوتر والهاتف على شبكة Wi-Fi واحدة. أدخل بيانات الربط المعروضة هنا في إعدادات الهاتف الرئيسي.','Keep computer and phone on the same Wi-Fi network. Enter the details shown here in the main phone app.'):t('الربط محلي دون إنترنت. احصل على العنوان ورمز الربط من الضبط في الكمبيوتر.','Local sync without internet. Get address and pairing key from Windows settings.')}</p><div id="ta-peer-connection" class="text-sm space-y-2"></div><button type="button" class="ta-peer-btn" onclick="TiqanyPeerSync.${desktop?'config':'sync'}()">${desktop?t('تحديث عنوان الاتصال','Refresh connection details'):t('مزامنة الآن','Sync now')}</button> <button type="button" id="ta-peer-conflict-button" class="ta-peer-btn ta-peer-conflict-button" onclick="TiqanyPeerSync.openConflictLog()"><i class="fas fa-exclamation-triangle"></i> سجل التعارض (0)</button><div id="ta-peer-conflict-panel" class="ta-peer-conflict-panel" hidden></div><p id="ta-peer-status" class="text-xs text-teal-800 font-bold">${escape(this.last)}</p></section></div></details>`);
    this.renderConnection();this.loadConflicts().catch(err=>console.warn('Could not read conflict log',err));
  },
  async boot(){await this.loadConflicts();if(desktop){window.WindowsDesktop?.onPeerRequest(req=>this.handleRequest(req));await this.config();}
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
const style=document.createElement('style');style.textContent='.ta-connected-devices-icon{display:inline-flex!important;align-items:center!important;gap:2px!important;color:#0f766e!important;background:linear-gradient(150deg,#e0fbfa,#a5dbe9)!important;box-shadow:inset 0 2px 0 #fff,0 3px 0 #7fb7c4,0 5px 7px #17496025!important;border:1px solid #8cbac6;min-width:53px!important;width:53px!important;height:42px!important;border-radius:13px!important;padding:5px!important;flex-shrink:0}.ta-connected-devices-icon svg{width:46px;height:33px;flex-shrink:0}.ta-connected-devices-inline{display:inline-flex;align-items:center;gap:3px;color:#0f766e}.ta-connected-devices-inline svg{width:50px;height:34px}.ta-peer-qr-grid{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}.ta-peer-qr-card{background:#fff;border:2px solid #d1e5e8;padding:10px;border-radius:15px;text-align:center;min-width:215px;max-width:265px}.ta-peer-qr-image svg{width:100%;height:auto;max-width:225px;image-rendering:pixelated}.ta-peer-scan{margin:8px 0 12px!important}.ta-peer-manual{margin:12px 0;padding:8px;background:#f1f5f9;border-radius:12px}.ta-peer-manual>summary{font-weight:900;cursor:pointer;margin-bottom:8px}.ta-peer-manual>label{margin-top:8px}.ta-peer-input{display:block;width:100%;min-width:0;border:1px solid #94a3b8;border-radius:10px;padding:9px;margin-top:4px;direction:ltr;text-align:left;font-size:14px}.ta-peer-btn{display:inline-block;background:linear-gradient(160deg,#087d79,#065f69);color:white;border-radius:12px;padding:10px 16px;font-size:13px;font-weight:900;border:1px solid #0f766e;box-shadow:0 3px 0 #164e63}.ta-peer-btn.secondary{background:#475569;border-color:#334155;box-shadow:0 3px 0 #334155}.ta-peer-conflict-button{background:linear-gradient(160deg,#fff0dc,#fed7aa);color:#78350f;border-color:#d97706;box-shadow:0 3px 0 #b45309}.ta-peer-conflict-button.has-conflicts{background:linear-gradient(160deg,#f97316,#c2410c);color:#fff}.ta-peer-conflict-panel[hidden]{display:none!important}.ta-peer-conflict-panel{margin-top:12px;padding:12px;border:2px solid #fdba74;border-radius:14px;background:#fffbeb;max-height:72vh;overflow:auto}.ta-conflict-row{border:1px solid #cbd5e1;background:#fff;padding:10px;border-radius:10px;margin:10px 0}.ta-conflict-row header{display:flex;flex-direction:column;gap:4px}.ta-conflict-row header small,.ta-conflict-fields{font-size:12px;color:#475569;overflow-wrap:anywhere}.ta-conflict-versions{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin:10px 0}.ta-conflict-versions>div{border:1px solid #cbd5e1;padding:8px;border-radius:9px;min-width:0;overflow-wrap:anywhere}.ta-conflict-versions h5{font-weight:900;color:#134e4a;margin-bottom:6px}.ta-conflict-versions pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;font-size:11px}.ta-conflict-versions summary{cursor:pointer;color:#0f766e;font-size:12px}.ta-conflict-choose{display:flex;gap:8px;flex-wrap:wrap}.ta-conflict-choose button{border:1px solid #94a3b8;border-radius:10px;padding:8px 10px;background:#f1f5f9;color:#0f172a;font-weight:800}.ta-conflict-choose button.selected{background:#0f766e;color:white;border-color:#115e59}.ta-conflict-stock,.ta-conflict-deleted{color:#9a3412;font-weight:800}.ta-conflict-alert{color:#713f12}.ta-conflict-approved{display:block;color:#065f46;font-weight:800;margin-top:8px}.ta-peer-conflict-panel button:disabled{opacity:.5;cursor:not-allowed}';document.head.append(style);
})();
