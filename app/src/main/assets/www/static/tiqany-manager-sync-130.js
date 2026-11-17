/* v3.5.130: encrypted main Android-to-main Android synchronization. */
(function(){
'use strict';
const core=window.TiqanyPeerMerge,events=window.TiqanyPeerEvents;
if(!core||!window.AndroidManagerPeer||typeof State==='undefined')return;
const native=window.AndroidManagerPeer;
const copy=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const deviceOnly=k=>['companyUid','appProtection','peerBootstrapSourceUid','deviceId',
  'btMacAddress','lastSyncEndpoint','localPrinterName','printerDeviceId'].includes(k)
  ||/(?:privateKey|accessToken|refreshToken|pairingSecret|deviceToken)$/i.test(k);
const isUid=x=>typeof x==='string'&&/^business_[0-9a-f]{32}$/.test(x);
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const stamp=()=>new Date().toISOString();
const manager={
  pending:null,busy:false,serverBusy:false,locks:new Map(),server:null,
  lastClient:0,lastServer:0,lastResult:'',lastRemoteVersion:'',
  approvedFirst:null,conflicts:null,nextPoll:0,settingsOpened:false,qrTimer:null,
  currentUid(){return String(State.settings?.companyUid||'');},
  async ensureUid(){if(isUid(this.currentUid()))return this.currentUid();
    State.settings.companyUid=ProfileManager.generateId();await StorageEngine.saveState();return this.currentUid();},
  profile(){return ProfileManager.activeId;},
  nativeStatus(){try{return JSON.parse(native.clientStatus()||'{}');}catch(_){return {};}},
  serverStatus(){try{return JSON.parse(native.serverConfig()||'{}');}catch(_){return {};}},
  baseKey(id){return 'manager_link_base:'+this.profile()+':'+id;},
  clientKey(id){return 'manager_known_client:'+this.profile()+':'+id;},
  conflictKey(id){return 'manager_pair_conflicts:'+this.profile()+':'+id;},
  receiptKey(id){return 'manager_receipts:'+this.profile()+':'+id;},
  async read(id){return (await ProfileManager.getRecord(id))?.data||null;},
  async write(id,data){await ProfileManager.putBatch([{id,data}]);},
  info(text,bad=false){this.lastResult=String(text);const el=document.getElementById('ta-manager-status');
    if(el)el.textContent=this.lastResult;if(bad)UI.toast(this.lastResult,'error');},
  blocked(){const screen=AppNav.current?.()?.screen||'';
    return !!(AppNav.isDirty||AppNav.isModalDirty||AppNav.activeOperationGuard||
      (screen==='settings'&&typeof SettingsDraftController!=='undefined'&&SettingsDraftController.changed?.()));},
  portableSettings(){
    const output=Object.create(null);
    for(const [k,v] of Object.entries(State.settings||{})){
      if(['__proto__','constructor','prototype'].includes(k)||deviceOnly(k)||v===undefined)continue;
      output[k]=copy(v);
    }
    if(JSON.stringify(output).length>250000)throw Error('إعدادات الشركة أكبر من الحد المسموح');
    return output;
  },
  portablePin(){
    const cfg=State.settings?.appProtection||{};
    const verifier=core.bootstrapProtection(cfg);
    if(!verifier)return null;
    return {...verifier,lockApp:true,protectDeletion:cfg.protectDeletion===true,
      protectDeviceAddition:cfg.protectDeviceAddition===true,
      fingerprintEnabled:false,fingerprintCredentialId:''};
  },
  validateMeta(meta,uid){
    if(!obj(meta)||meta.companyUid!==uid||!obj(meta.settings))
      throw Error('هوية أو إعدادات الشركة غير صالحة');
    if(Object.keys(meta.settings).length>400||JSON.stringify(meta.settings).length>250000||
      Object.keys(meta.settings).some(k=>['__proto__','constructor','prototype'].includes(k)||deviceOnly(k)))
      throw Error('إعدادات شركة غير صالحة أو تخص جهازاً آخر');
    if(meta.protection!==null&&meta.protection!==undefined&&!core.bootstrapProtection(meta.protection))
      throw Error('بيانات الحماية المنقولة غير صالحة');
    if(meta.journal!=null&&window.CompanyLifecycle?.validateConflictJournal)
      CompanyLifecycle.validateConflictJournal({peerConflictJournal:meta.journal});
    return true;
  },
  async meta(){
    const uid=await this.ensureUid();
    return {companyUid:uid,settings:this.portableSettings(),protection:this.portablePin(),
      fieldCompanyId:String(State.fieldSync?.companyId||''),
      alertCenter:copy(State.alertCenter||{entries:[]}),
      journal:window.CompanyLifecycle?.conflictJournal?await CompanyLifecycle.conflictJournal():null};
  },
  cleanSettings(input){const output={};
    for(const [k,v] of Object.entries(input||{}))
      if(!['__proto__','constructor','prototype'].includes(k)&&!deviceOnly(k))output[k]=copy(v);
    return output;},
  protectedSettingsMerge(base,left,right,decisions={},prefix='setting:'){
    const result={},conflicts=[],keys=new Set([...Object.keys(base||{}),...Object.keys(left||{}),...Object.keys(right||{})]);
    for(const key of keys){
      const B=base?.[key],A=left?.[key],R=right?.[key],a=core.canonical(A),b=core.canonical(B),r=core.canonical(R);
      let value;
      if(a===r)value=A;
      else if(a===b)value=R;
      else if(r===b)value=A;
      else{
        const signature=core.digest([B,A,R]);
        const answer=decisions[prefix+key];
        if(answer?.signature===signature&&['phone','computer'].includes(answer.side)){
          value=answer.side==='phone'?A:R;
        }else{
          conflicts.push({id:prefix+key,key,local:A,remote:R,signature});continue;
        }
      }
      if(value!==undefined)result[key]=copy(value);
    }
    return {ok:!conflicts.length,settings:result,conflicts};
  },
  async notifyReceived(before,after,oldSettings,newSettings,origin){
    const found=events?.records(before,after,origin)||{entries:[],count:0};
    const extras=[];
    for(const key of new Set([...Object.keys(oldSettings||{}),...Object.keys(newSettings||{})])){
      if(core.canonical(oldSettings?.[key])===core.canonical(newSettings?.[key]))continue;
      if(core.SETTINGS.includes(key))continue; // already included by peer events
      const id=events?.eventKey?.(origin,'setting',key,'تعديل',newSettings?.[key])||'manager:setting:'+core.digest([origin,key,newSettings?.[key]]);
      extras.push({id,eventKey:id,type:'peer-operation',collection:'settings',action:'تعديل',source:origin,
        title:'تعديل الضبط — '+key,detail:'تم تعديل '+key+' من جهاز المدير المتصل',at:stamp(),read:false});
    }
    const incoming=[...(found.entries||[]),...extras].slice(0,140);
    if(!incoming.length)return [];
    const fresh=typeof ManagerNotifications!=='undefined'?ManagerNotifications.filterPeerEvents(incoming):incoming;
    State.alertCenter??={entries:[]};State.alertCenter.entries??=[];
    State.alertCenter.entries.unshift(...fresh);
    State.alertCenter.entries=State.alertCenter.entries.slice(0,3000);
    return fresh;
  },
  async applyIncoming(snapshot,settings,protection,opts={}){
    const oldLedger=core.snapshot(State),oldSettings=this.portableSettings();
    const oldFull=copy(State),oldLicense=copy(State.license);
    const changes=core.canonical(oldLedger)!==core.canonical(snapshot)||
      core.canonical(oldSettings)!==core.canonical(settings)||
      (opts.first&&protection);
    if(!changes)return false;
    await ProfileManager.makeCheckpoint('before-manager-phone-peer');
    const oldPin=copy(State.settings?.appProtection);
    try{
      core.apply(State,snapshot);
      for(const [k,v] of Object.entries(this.cleanSettings(settings)))State.settings[k]=v;
      if(opts.first){
        State.settings.companyUid=opts.companyUid;
        State.settings.companySetupCompleted=true;
        if(protection)State.settings.appProtection={...copy(protection),fingerprintEnabled:false,fingerprintCredentialId:''};
        State.fieldSync??={};if(opts.fieldCompanyId)State.fieldSync.companyId=opts.fieldCompanyId;
        if(opts.alertCenter)State.alertCenter=copy(opts.alertCenter);
      }else if(protection&&core.canonical(protection)!==core.canonical(this.portablePin())){
        State.settings.appProtection={...copy(protection),fingerprintEnabled:false,fingerprintCredentialId:''};
      }
      State.license=oldLicense; // neither installation may activate or deactivate the other
      const notes=opts.first?[]:await this.notifyReceived(oldLedger,core.snapshot(State),oldSettings,this.portableSettings(),'موبايل المدير');
      await StorageEngine.saveState();
      if(notes.length&&typeof ManagerNotifications!=='undefined')ManagerNotifications.saved(notes.slice(0,12));
      if(opts.first){
        const reg=ProfileManager.registry;
        if(reg?.profiles?.some(p=>p.id===this.profile())){
          const upd={...reg,profiles:reg.profiles.map(p=>p.id===this.profile()?{...p,name:State.settings.companyName}:p)};
          await this.write('profile_registry',upd);ProfileManager.registry=upd;
        }
        if(opts.journal&&window.CompanyLifecycle?.restoreConflictJournal)
          await CompanyLifecycle.restoreConflictJournal({peerConflictJournal:opts.journal});
        document.getElementById('ta-company-setup-128')?.remove();
      }
      return true;
    }catch(e){
      for(const key of Object.keys(State))delete State[key];
      Object.assign(State,oldFull);State.settings.appProtection=oldPin;throw e;
    }
  },
  async call(command){
    if(this.pending)throw Error('هناك مزامنة قيد التنفيذ');
    const request={protocol:'TIQANY-MANAGER-1',...command};
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending=null;reject(Error('انتهت مهلة اتصال أجهزة المدير'));},36000);
      this.pending={timer,resolve,reject};
      native.clientRequest(JSON.stringify(request));
    });
  },
  async onNativeRequest(raw){
    let request={};
    try{request=typeof raw==='string'?JSON.parse(raw):raw;
      if(!request?.requestId||!obj(request.data))return;
      const response=await this.handle(request.data);
      native.reply(String(request.requestId),JSON.stringify(response));
    }catch(err){if(request?.requestId)native.reply(String(request.requestId),JSON.stringify({ok:false,error:String(err?.message||err)}));}
  },
  async handle(data){
    if(data.protocol!=='TIQANY-MANAGER-1')return {ok:false,error:'بروتوكول غير معروف'};
    if(this.blocked())return {ok:false,code:'UNSAVED_EDIT',error:'احفظ العملية المفتوحة أولاً'};
    const localServer=this.serverStatus();
    if(!localServer.ready||!localServer.serverId)return {ok:false,error:'الاستقبال غير جاهز'};
    const currentUid=await this.ensureUid();
    if(data.action==='probe'){
      if(!isUid(data.companyUid)||!data.clientId)return {ok:false,error:'هوية الجهاز غير صحيحة'};
      const link=await this.read(this.clientKey(data.clientId));
      if(!link||link.companyUid!==currentUid||link.clientUid!==data.companyUid)
        return {ok:false,error:'أجهزة المدير ليست مرتبطة بهذه الشركة'};
      this.lastServer=Date.now();this.updateHeader();
      return {ok:true,serverId:localServer.serverId,profileId:this.profile(),
        version:core.digest([core.snapshot(State),this.portableSettings(),this.portablePin()])};
    }
    if(data.action==='fetch'){
      if(!isUid(data.companyUid)||!data.clientId||!data.phoneProfileId)
        return {ok:false,error:'هوية جهاز المدير غير صحيحة'};
      const localSnap=core.snapshot(State),empty=core.emptyLedger(localSnap);
      const paired=await this.read(this.clientKey(data.clientId));
      const known=!!(paired&&paired.clientUid===data.companyUid&&paired.companyUid===currentUid&&
        data.knownServerId===localServer.serverId&&data.knownServerProfileId===this.profile());
      if(!known && (empty===!!data.clientEmpty))
        return {ok:false,error:'الاقتران الأول يتطلب جهازاً فيه عمليات وجهازاً فارغاً فقط'};
      if(known&&data.companyUid!==currentUid)
        return {ok:false,error:'هوية الشركة تغيرت بعد الربط'};
      if(!known&&!empty&&!data.clientEmpty)
        return {ok:false,error:'لا يُسمح لأول مرة بربط جهازَي مدير يحتويان عمليات'};
      const ticket=String(Date.now())+Math.random().toString(36).slice(2);
      const settings=this.portableSettings(),protection=this.portablePin();
      const provision=!known&&!empty&&data.clientEmpty?await this.meta():null;
      this.locks.set(ticket,{at:Date.now(),serverId:localServer.serverId,companyUid:currentUid,
        clientId:data.clientId,clientUid:data.companyUid,clientProfile:data.phoneProfileId,
        snapshot:core.canonical(localSnap),settings:core.canonical(settings),pin:core.canonical(protection),
        empty,clientEmpty:data.clientEmpty===true,known});
      for(const [id,x] of this.locks)if(Date.now()-x.at>65000)this.locks.delete(id);
      return {ok:true,ticket,serverId:localServer.serverId,profileId:this.profile(),companyUid:currentUid,
        empty,known,snapshot:localSnap,settings,protection,provision};
    }
    if(data.action==='commit'){
      const lock=this.locks.get(data.ticket);this.locks.delete(data.ticket);
      if(!lock||Date.now()-lock.at>65000||lock.serverId!==localServer.serverId||
        lock.companyUid!==currentUid||lock.clientId!==data.clientId||lock.clientUid!==data.companyUid||
        lock.clientProfile!==data.phoneProfileId||this.blocked())return {ok:false,error:'انتهت جلسة المزامنة؛ أعد المحاولة'};
      const existing=core.snapshot(State);
      if(core.canonical(existing)!==lock.snapshot||core.canonical(this.portableSettings())!==lock.settings||
        core.canonical(this.portablePin())!==lock.pin)return {ok:false,error:'تغيرت بيانات جهاز المصدر أثناء النقل'};
      core.ensureSnapshot(data.snapshot);
      if(!obj(data.settings))return {ok:false,error:'إعدادات المزامنة غير صالحة'};
      if(lock.empty&&!lock.known){
        if(core.emptyLedger(data.snapshot))return {ok:false,error:'لا توجد عمليات لنقلها'};
        this.validateMeta(data.provision,data.companyUid);
        if(core.canonical(data.settings)!==core.canonical(data.provision.settings))
          return {ok:false,error:'الإعدادات لا تطابق الجهاز المصدر'};
        await this.applyIncoming(data.snapshot,data.settings,data.provision.protection,{
          first:true,companyUid:data.companyUid,fieldCompanyId:data.provision.fieldCompanyId,
          journal:data.provision.journal,alertCenter:data.provision.alertCenter});
      }else if(!lock.known&&lock.clientEmpty){
        if(core.canonical(data.snapshot)!==lock.snapshot||core.canonical(data.settings)!==lock.settings)
          return {ok:false,error:'رفض أي تعديل من جهاز المدير الفارغ على بيانات المصدر'};
      }else if(lock.known){
        if(data.companyUid!==currentUid)return {ok:false,error:'شركة مختلفة'};
        const pin=data.protection||null;
        if(pin!==null&&!core.bootstrapProtection(pin))return {ok:false,error:'حماية غير صالحة'};
        await this.applyIncoming(data.snapshot,data.settings,pin);
      }else return {ok:false,error:'اتجاه نقل غير مسموح'};
      const now=stamp();
      await this.write(this.clientKey(lock.clientId),{clientId:lock.clientId,clientUid:this.currentUid(),
        companyUid:this.currentUid(),at:now,profileId:this.profile()});
      this.lastServer=Date.now();this.updateHeader();
      return {ok:true,sourceOnly:!lock.empty&&!lock.known&&lock.clientEmpty};
    }
    return {ok:false,error:'طلب مزامنة غير معروف'};
  },
  async storeBase(serverId,profileId,ledger,settings,protection){
    await this.write(this.baseKey(serverId),{serverId,profileId,companyUid:this.currentUid(),
      at:stamp(),ledger:copy(ledger),settings:copy(settings),protection:copy(protection)});
  },
  async approval(kind,remote,local){
    const key=[kind,this.profile(),remote.serverId,core.digest(remote.snapshot),core.digest(local)];
    const signature=core.digest(key),selected=this.approvedFirst;
    if(selected?.signature===signature&&Date.now()<selected.expires){this.approvedFirst=null;return true;}
    if(!window.confirm(kind==='send'?
      'الموبايل المقترن فارغ. هل تريد إرسال كل بيانات شركتك وإعداداتها وحمايتها إليه دون استلام أي عمليات منه؟':
      'هذا الموبايل فارغ. هل تريد استيراد الشركة كاملة من موبايل المدير الموجود دون تعديل بياناته؟'))return false;
    this.approvedFirst=null;
    const cfg=State.settings?.appProtection;
    if(kind==='send'&&cfg?.pinHash&&typeof ProtectionController!=='undefined'){
      ProtectionController.requestPin('تأكيد نقل بيانات الشركة كاملة إلى موبايل مدير جديد',()=>{
        this.approvedFirst={signature,expires:Date.now()+90000};
        setTimeout(()=>this.sync(false),0);
      });
      return false;
    }
    return true;
  },
  async sync(silent=false){
    if(this.busy||this.pending||this.blocked())return false;
    const link=this.nativeStatus();
    if(!link.host||!link.port||!link.serverId)return false;
    if(silent&&!link.approved)return false;
    this.busy=true;
    try{
      const local=core.snapshot(State),original=core.canonical(local),
        ownId=this.serverStatus().serverId,uid=await this.ensureUid(),
        base=await this.read(this.baseKey(link.serverId));
      const fetched=await this.call({action:'fetch',clientId:ownId,companyUid:uid,
        phoneProfileId:this.profile(),clientEmpty:core.emptyLedger(local),
        knownServerId:base?.serverId||'',knownServerProfileId:base?.profileId||''});
      if(!fetched.ok)throw Error(fetched.error||'تعذر استلام بيانات موبايل المدير');
      if(fetched.serverId!==link.serverId||!isUid(fetched.companyUid))
        throw Error('هوية موبايل المدير المقترن غير صحيحة');
      if(base&&base.serverId!==fetched.serverId)throw Error('جهاز مدير مختلف');
      const first=!base?.ledger;
      if(first){
        if(core.emptyLedger(local)===!!fetched.empty)
          throw Error('أول ربط يتطلب موبايل مدير فيه عمليات وآخر فارغ');
        if(silent)return false;
        if(!(await this.approval(core.emptyLedger(local)?'receive':'send',fetched,local)))return false;
      }else if(fetched.companyUid!==uid||base.companyUid!==uid)
        throw Error('هوية الشركة ليست نفس الشركة المرتبطة سابقاً');
      const srcEmpty=core.emptyLedger(local),remoteEmpty=fetched.empty===true;
      const mySettings=this.portableSettings(),myPin=this.portablePin();
      if(first&&srcEmpty)this.validateMeta(fetched.provision,fetched.companyUid);
      const oldChoices=this.conflicts?.decisions||{};
      const incoming=first?(srcEmpty?fetched.snapshot:local):
        core.merge(base.ledger,local,fetched.snapshot,oldChoices,[]);
      if(!first&&!incoming.ok){
        const details=incoming.details||[];
        this.conflicts={serverId:link.serverId,at:stamp(),details,decisions:oldChoices};
        await this.write(this.conflictKey(link.serverId),this.conflicts);
        this.showConflicts();this.info('المزامنة بحاجة لحل '+details.length+' تعارضاً',true);
        return false;
      }
      const snapshot=first?incoming:incoming.snapshot;
      if(!first&&this.conflicts?.details?.length){
        // Prior decisions are single-use and bound to exact conflicting versions.
        const unresolved=this.conflicts.details.some(d=>!oldChoices[d.id]||
          oldChoices[d.id].signature!==d.signature);
        if(unresolved&&this.conflicts.details.some(d=>d.collection==='fullSettings'||d.collection==='protection'))
          return false;
      }
      let settings,protection;
      if(first){
        if(srcEmpty){settings=fetched.provision.settings;protection=fetched.provision.protection;}
        else {settings=mySettings;protection=myPin;}
      }else{
        const combined=this.protectedSettingsMerge(base.settings||{},mySettings,fetched.settings||{},oldChoices,'setting:');
        const protecting=this.protectedSettingsMerge({pin:base.protection||null},
          {pin:myPin},{pin:fetched.protection||null},oldChoices,'protection:');
        if(!combined.ok||!protecting.ok){
          this.conflicts={serverId:link.serverId,at:stamp(),details:[
            ...combined.conflicts.map(x=>({...x,collection:'fullSettings'})),
            ...protecting.conflicts.map(x=>({...x,collection:'protection'}))
          ],decisions:oldChoices};
          await this.write(this.conflictKey(link.serverId),this.conflicts);
          this.showConflicts();return false;
        }
        settings=combined.settings;protection=protecting.settings.pin||null;
      }
      const provision=first&&!srcEmpty?await this.meta():null;
      if(core.canonical(core.snapshot(State))!==original)throw Error('تغير دفتر الموبايل أثناء المزامنة');
      const committed=await this.call({action:'commit',ticket:fetched.ticket,clientId:ownId,
        companyUid:uid,phoneProfileId:this.profile(),snapshot,settings,protection,provision});
      if(!committed.ok)throw Error(committed.error||'رفض الجهاز المقترن حفظ البيانات');
      if(core.canonical(core.snapshot(State))!==original)throw Error('تغيرت بيانات الموبايل أثناء المزامنة؛ أعد الاتصال');
      if(first&&srcEmpty)
        await this.applyIncoming(snapshot,settings,protection,{first:true,companyUid:fetched.companyUid,
          fieldCompanyId:fetched.provision.fieldCompanyId,journal:fetched.provision.journal,
          alertCenter:fetched.provision.alertCenter});
      else if(!first)await this.applyIncoming(snapshot,settings,protection);
      await this.storeBase(fetched.serverId,fetched.profileId,snapshot,settings,protection);
      await this.write(this.conflictKey(link.serverId),null);this.conflicts=null;
      native.clientApprove();
      this.lastClient=Date.now();this.lastRemoteVersion=core.digest([snapshot,settings,protection]);
      this.updateHeader();
      this.info(first?'اكتمل النقل الأول لجميع البيانات والإعدادات والحماية':'اكتملت مزامنة أجهزة المدير');
      if(AppNav.current()?.screen!=='settings')AppNav.renderCurrent();
      return true;
    }catch(e){this.info('فشلت مزامنة أجهزة المدير دون حذف البيانات: '+String(e?.message||e),!silent);
      this.lastClient=0;this.updateHeader();return false;}
    finally{this.busy=false;this.renderPanel();}
  },
  async probe(){
    if(this.busy||this.pending||this.blocked()||document.visibilityState==='hidden'||Date.now()<this.nextPoll)return;
    const link=this.nativeStatus();if(!link.approved||!link.host)return;
    try{
      const response=await this.call({action:'probe',clientId:this.serverStatus().serverId,companyUid:this.currentUid()});
      if(!response.ok||response.serverId!==link.serverId)throw Error(response.error||'هوية الجهاز المقترن تغيرت');
      this.lastClient=Date.now();this.updateHeader();this.nextPoll=Date.now()+3000;
      const localVersion=core.digest([core.snapshot(State),this.portableSettings(),this.portablePin()]);
      if(response.version!==this.lastRemoteVersion||response.version!==localVersion){
        this.lastRemoteVersion=response.version;
        await this.sync(true);
      }
    }catch(e){this.lastClient=0;this.nextPoll=Date.now()+5000;this.updateHeader();}
  },
  async acceptPairing(raw){
    let code;try{code=JSON.parse(String(raw||''));}catch(_){return this.info('رمز QR غير صالح',true);}
    if(code?.type!=='tiqany-manager-main'||code.v!==1||!/^([0-9]{1,3}\\.){3}[0-9]{1,3}$/.test(code.host)||
      !Number.isInteger(code.port)||!/^[A-Za-z0-9_-]{43}$/.test(code.key)||!/^[a-f0-9]{32}$/.test(code.serverId))
      return this.info('رمز ربط أجهزة المدير غير صالح',true);
    if(code.serverId===this.serverStatus().serverId)return this.info('لا يمكن ربط الجهاز بنفسه',true);
    const base=await this.read(this.baseKey(this.nativeStatus().serverId));
    if(base&&base.serverId!==code.serverId)return this.info('ألغِ الربط القديم قبل تغيير جهاز المدير',true);
    if(!window.confirm('هل تريد ربط هذا الموبايل بموبايل المدير الآخر عبر شبكة Wi-Fi المحلية؟'))return;
    if(native.clientConfigure(code.host,code.port,code.key,code.serverId)!=='saved')
      return this.info('تعذر حفظ مفتاح اقتران المدير',true);
    this.info('تم حفظ الاقتران، اضغط «مزامنة الآن» لإكمال التحقق والنقل الأول');
    this.renderPanel();
  },
  scan(){
    if(!window.NativeBarcode?.scan)return this.info('يلزم تطبيق أندرويد لمسح الرمز',true);
    const take=()=>NativeBarcode.scan('manager-peer');
    if(State.settings?.appProtection?.protectDeviceAddition&&State.settings?.appProtection?.pinHash)
      ProtectionController.requestPin('التحقق قبل ربط موبايل مدير جديد',take);
    else take();
  },
  qr(){
    const show=()=>{
      const src=native.pairingQr();
      const panel=document.getElementById('ta-manager-qr');
      if(!panel)return;
      panel.innerHTML=src?'<img src="'+src+'" alt="رمز QR لاقتران موبايلَي المدير" style="max-width:238px;width:100%;margin:auto">':
        '<span>لا يوجد عنوان Wi-Fi صالح أو الاستقبال غير جاهز</span>';
      if(this.qrTimer)clearTimeout(this.qrTimer);
      this.qrTimer=setTimeout(()=>{if(panel)panel.textContent='انتهت مدة عرض رمز الاقتران، اضغط إظهار مجدداً';},60000);
    };
    if(State.settings?.appProtection?.protectDeviceAddition&&State.settings?.appProtection?.pinHash)
      ProtectionController.requestPin('تأكيد عرض رمز اقتران موبايل مدير',show);
    else show();
  },
  manual(){
    const val=id=>document.getElementById(id)?.value?.trim()||'';
    const host=val('ta-manager-host'),port=Number(val('ta-manager-port')),key=val('ta-manager-secret'),id=val('ta-manager-id');
    if(!window.confirm('تأكيد ربط موبايل المدير بهذا العنوان؟'))return;
    if(native.clientConfigure(host,port,key,id)!=='saved')return this.info('بيانات الاقتران غير صحيحة',true);
    this.renderPanel();
  },
  unlink(){
    if(!window.confirm('إلغاء اقتران موبايل المدير؟ لا تُحذف بيانات الشركة.'))return;
    native.clientUnlink();this.lastClient=0;this.conflicts=null;this.updateHeader();this.renderPanel();
  },
  resolveConflict(id,side){
    const log=this.conflicts;if(!log)return;
    const d=log.details.find(x=>x.id===id||(x.key===id&&!x.id));
    if(!d)return;
    log.decisions??={};
    log.decisions[id]={signature:d.signature,side:side==='local'?'phone':'computer'};
    this.write(this.conflictKey(log.serverId),log).then(()=>this.showConflicts());
  },
  showConflicts(){
    const area=document.getElementById('ta-manager-conflicts');if(!area)return;
    const log=this.conflicts;
    if(!log?.details?.length){area.textContent='لا توجد تعارضات حالياً';return;}
    area.innerHTML=log.details.slice(0,100).map((d,i)=>{
      const id=String(d.id||d.key);
      return '<div class="ta-manager-conflict"><strong>'+esc(d.collection||'الإعدادات')+' — '+esc(d.recordId||d.key||i)+'</strong><p>التعارض يتطلب اختيار السجل المعتمد</p>'+
        '<button data-cid="'+esc(id)+'" data-choice="local">اعتماد هذا الموبايل</button> '+
        '<button data-cid="'+esc(id)+'" data-choice="remote">اعتماد الموبايل الآخر</button></div>';
    }).join('')+'<button type="button" class="ta-manager-action" id="ta-manager-resume">إعادة المزامنة بعد حل التعارضات</button>';
    area.querySelectorAll('[data-choice]').forEach(btn=>btn.addEventListener('click',()=>{
      this.resolveConflict(btn.dataset.cid,btn.dataset.choice);
    }));
    document.getElementById('ta-manager-resume')?.addEventListener('click',()=>this.sync(false));
  },
  updateHeader(){
    const el=document.getElementById('ta-manager-phone-connection');if(!el)return;
    const now=Date.now();
    const active=(this.lastServer>0&&now-this.lastServer<20000)||(this.lastClient>0&&now-this.lastClient<20000);
    el.hidden=!active;
    el.classList.toggle('ta-manager-online',active);
    el.setAttribute('aria-label',active?'موبايل مدير آخر متصل':'موبايل مدير غير متصل');
    el.setAttribute('title',active?'مزامنة أجهزة مدير — متصل':'مزامنة أجهزة مدير');
  },
  openSettings(){
    if(AppNav.current()?.screen!=='settings')AppNav.navigate('settings');
    this.settingsOpened=true;
    setTimeout(()=>{const panel=document.getElementById('ta-manager-settings-section');
      if(panel){panel.open=true;panel.scrollIntoView?.({block:'start'});}},80);
  },
  renderPanel(){
    const host=document.getElementById('ta-manager-connection-status');
    if(!host)return;
    const server=this.serverStatus(),client=this.nativeStatus();
    const safeId=esc(client.serverId||'');
    host.innerHTML='<p><b>عنوان هذا الموبايل:</b> <span dir="ltr">'+esc(server.host||'غير متاح')+':'+esc(server.port||'')+'</span></p>'+
      '<p><b>الاستقبال:</b> '+(server.ready?'جاهز':'غير جاهز')+'</p>'+
      '<p><b>الموبايل المقترن:</b> '+(client.host?esc(client.host)+':'+esc(client.port):'لم يتم الربط')+'</p>'+
      '<p>'+esc(this.lastResult||'الربط المحلي مشفّر ولا يحتاج إنترنت')+'</p>';
  },
  renderSettings(root){
    if(!root||document.getElementById('ta-manager-settings-section'))return;
    root.insertAdjacentHTML('beforeend',`<details class="settings-section" id="ta-manager-settings-section" data-settings-section="manager-manager-sync">
      <summary class="settings-section-heading"><span class="settings-section-leading"><span class="ta-manager-panel-icon">📱📱</span>
      <span><span class="settings-section-name">مزامنة أجهزة مدير</span><span class="settings-section-note">موبايل مدير ↔ موبايل مدير — نقل أول كامل ثم مزامنة لحظية</span></span></span>
      <i class="fas fa-chevron-down settings-section-arrow"></i></summary>
      <div class="settings-section-body" dir="rtl"><section class="ta-manager-panel">
        <h3>مزامنة أجهزة مدير</h3>
        <p>على شبكة Wi-Fi واحدة: اعرض رمز QR على أحد الموبايلين وامسحه بالآخر. أول ربط يقبل جهازاً فيه بيانات مع جهاز فارغ فقط. تُنقل بيانات الشركة والضبط والحماية دون نقل البصمة أو الترخيص الخاص بالجهاز.</p>
        <div id="ta-manager-connection-status"></div>
        <div class="ta-manager-actions">
          <button class="ta-manager-action" onclick="TiqanyManagerSync.qr()">إظهار رمز QR لهذا الموبايل</button>
          <button class="ta-manager-action" onclick="TiqanyManagerSync.scan()">مسح رمز QR للموبايل الآخر</button>
          <button class="ta-manager-action" onclick="TiqanyManagerSync.sync(false)">مزامنة الآن</button>
          <button class="ta-manager-action ta-manager-unlink" onclick="TiqanyManagerSync.unlink()">إلغاء الاقتران</button>
        </div>
        <div id="ta-manager-qr" class="ta-manager-qr"></div>
        <details class="ta-manager-manual"><summary>إدخال بيانات ربط المدير يدوياً</summary>
          <input id="ta-manager-host" placeholder="عنوان IP للموبايل الآخر" dir="ltr">
          <input id="ta-manager-port" type="number" value="49379" placeholder="المنفذ">
          <input id="ta-manager-secret" placeholder="مفتاح الربط المشفّر" dir="ltr">
          <input id="ta-manager-id" placeholder="معرّف الجهاز (32 حرفاً)" dir="ltr">
          <button class="ta-manager-action" onclick="TiqanyManagerSync.manual()">حفظ الربط</button>
        </details>
        <div id="ta-manager-conflicts" class="ta-manager-conflicts"></div>
        <p id="ta-manager-status" role="status"></p>
      </section></div></details>`);
    this.renderPanel();this.showConflicts();
    if(this.settingsOpened){this.settingsOpened=false;this.openSettings();}
  },
  onSave(){
    if(this.busy||this.serverBusy)return;
    clearTimeout(this.saveTimer);
    this.saveTimer=setTimeout(()=>{if(!this.blocked()&&this.nativeStatus().approved)this.sync(true);},280);
  },
  async boot(){
    const ready=native.start();
    if(ready!=='ready')this.info('تعذّر تشغيل استقبال أجهزة المدير: '+ready);
    const status=this.nativeStatus();
    if(status.serverId)this.conflicts=await this.read(this.conflictKey(status.serverId));
    this.updateHeader();
    setInterval(()=>{this.updateHeader();this.probe();},3000);
    setInterval(()=>{if(this.nativeStatus().approved&&!this.busy)this.sync(true);},30000);
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible')setTimeout(()=>this.probe(),600);
    });
  }
};
window.TiqanyManagerSync=manager;
window.__tiqanyManagerReply=function(raw){
  const p=manager.pending;if(!p)return;
  clearTimeout(p.timer);manager.pending=null;
  try{p.resolve(JSON.parse(raw));}catch(e){p.reject(e);}
};
const prevBarcode=window.__nativeBarcodeResult;
window.__nativeBarcodeResult=function(target,code,message){
  if(target==='manager-peer'){
    if(message)manager.info(message,true);else if(code)manager.acceptPairing(code);return;
  }
  if(typeof prevBarcode==='function')return prevBarcode(target,code,message);
};
const oldSettings=Views.renderSettings;
Views.renderSettings=function(root,...args){oldSettings.call(this,root,...args);manager.renderSettings(root);};
const oldSave=StorageEngine.saveState;
StorageEngine.saveState=async function(...args){const x=await oldSave.apply(this,args);manager.onSave();return x;};
const oldLoad=window.onload;
window.onload=async function(...args){
  if(typeof oldLoad==='function')await oldLoad.apply(this,args);
  try{await manager.boot();}catch(e){console.warn('Manager peer start failed',e);}
};
const style=document.createElement('style');
style.id='ta-manager-phone-style-130';
style.textContent=`
.ta-manager-panel{padding:13px;border:1px solid #7dd3fc;background:#f8fdff;border-radius:16px;display:grid;gap:10px;font-size:13px}
.ta-manager-panel h3{font-size:16px;font-weight:900;color:#075985}
.ta-manager-panel p{line-height:1.8;color:#334155}
.ta-manager-actions{display:flex;flex-wrap:wrap;gap:8px}
.ta-manager-action{padding:10px 12px;background:linear-gradient(155deg,#38bdf8,#0369a1);border:1px solid #0284c7;border-radius:12px;color:white;font-weight:900;box-shadow:inset 0 2px 1px #ffffff77,0 3px 0 #075985}
.ta-manager-unlink{background:linear-gradient(#64748b,#334155)}
.ta-manager-qr{text-align:center}
.ta-manager-manual{border:1px solid #e2e8f0;border-radius:10px;padding:9px}
.ta-manager-manual input{display:block;width:100%;padding:9px;border:1px solid #94a3b8;border-radius:9px;margin-top:8px;background:white}
.ta-manager-conflict{padding:9px;border:1px solid #fb923c;border-radius:10px;background:#fff7ed;margin-top:8px}
.ta-manager-conflict button{padding:7px;border-radius:8px;background:#0e7490;color:white;font-size:12px}
.ta-manager-panel-icon{font-size:23px;letter-spacing:-9px;padding-inline:8px}
#ta-manager-phone-connection.ta-manager-online{background:linear-gradient(145deg,#10b981,#047857)!important;color:white!important;border-color:#22c55e!important;box-shadow:0 0 10px #34d39988!important}
#ta-manager-phone-connection[hidden],#ta-desktop-phone-connection[hidden],#salesStaffCounterButton[hidden]{display:none!important}
#topAppBar .ta-header-connections{display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;align-items:center!important;justify-content:center!important;gap:4px!important;width:max-content!important;max-width:100%!important}
#topAppBar .ta-header-connections>button{position:static!important;flex:0 0 auto!important}
#topAppBar .ta-header-connections .ta-staff-counter-label{display:none!important}
#topAppBar.dashboard-header #salesStaffCounterButton[hidden],#topAppBar.dashboard-header #ta-desktop-phone-connection[hidden],#topAppBar.dashboard-header #ta-manager-phone-connection[hidden]{display:none!important}
#topAppBar.dashboard-header .ta-header-connections{flex-direction:row!important;flex-wrap:nowrap!important}
#topAppBar.dashboard-header .ta-header-connections>button:not([hidden]){display:inline-flex!important}
`;
document.head.appendChild(style);
})();
