/* First-run restore chooser. External SAF folders are not destroyed by uninstall;
   Android revokes access on uninstall, so the user must grant the folder again. */
(function(){
'use strict';
// Defer-loaded Agent.js is not available when this script is parsed.
const isAgent=!!document.getElementById('agentHeader');
const KEY='tiqany-recovery-start-v1';
const ar=()=>!(typeof State!=='undefined'&&State.settings?.language==='en');
const t=(a,e)=>ar()?a:e;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const style=document.createElement('style');style.textContent='#ta-recovery-overlay{position:fixed;inset:0;background:rgba(8,27,45,.85);z-index:2147483645;display:flex;justify-content:center;align-items:center;padding:12px;box-sizing:border-box}#ta-recovery-card{background:white;color:#123046;width:min(100%,520px);max-height:94dvh;overflow-y:auto;border-radius:20px;padding:19px;text-align:start;box-shadow:0 13px 42px rgba(0,0,0,.36);font:600 14px/1.65 system-ui,sans-serif}#ta-recovery-card h2{margin:0 0 13px;font-size:20px;font-weight:950;color:#07476b}#ta-recovery-card .ta-recovery-warning{background:#fff9e7;border:1px solid #f8dea2;padding:11px;border-radius:12px}#ta-recovery-card button{display:block;width:100%;min-height:43px;border:0;border-radius:12px;margin-top:10px;padding:9px 12px;font-size:14px;font-weight:900;cursor:pointer;background:#0b7183;color:#fff}#ta-recovery-card button.secondary{background:#dfeaf0;color:#173b51}#ta-recovery-card button.ta-recovery-file{background:#eef8ff;color:#124666;border:1px solid #b6d9eb;text-align:start;overflow-wrap:anywhere}#ta-recovery-card button[disabled]{opacity:.65}';document.head.appendChild(style);
let screen=null,selectedFolder=false,loading=false;
function show(html){let el=document.getElementById('ta-recovery-overlay');if(!el){el=document.createElement('div');el.id='ta-recovery-overlay';el.innerHTML='<section id="ta-recovery-card" role="dialog" aria-modal="true" aria-labelledby="ta-recovery-title"></section>';document.body.appendChild(el);}const card=el.querySelector('#ta-recovery-card');card.setAttribute('dir',ar()?'rtl':'ltr');card.innerHTML=html;screen=el;}
function hide(){screen?.remove();screen=null;}
function heading(){return `<h2 id="ta-recovery-title">${t('استعادة بيانات المحاسبة','Restore accounting data')}</h2>`;}
function footer(){return `<p class="ta-recovery-warning">${t('تُحذف بيانات التطبيق الداخلية عادةً عند إلغاء تثبيته. النسخ الخارجية وحدها يمكن استعادتها بعد الحذف.','Uninstall usually deletes the app’s internal data. Only external backups can be recovered after uninstall.')}</p>`;}
const Recovery={
  boot(){if(!window.AndroidRecovery?.chooseBackupFolder)return;
    if(localStorage.getItem(KEY))return;
    const old=isAgent?!!(Agent.state&&(Agent.ready()||(Agent.state.ops||[]).length)):
      !!(typeof State!=='undefined'&&(['invoices','vouchers','items','accounts','expenses','categories'].some(k=>(State[k]||[]).length>0)||(State.settings?.companyName&&State.settings.companyName!=='المحاسب التقني'&&State.settings.companyName!=='مؤسسة')));
    if(old){localStorage.setItem(KEY,'existing');return;}
    show(heading()+footer()+`<p>${t('يمكنك البحث عن النسخ التي احتفظت بها سابقاً، أو إنشاء قاعدة بيانات جديدة.','You may recover a previously saved backup or start with a new database.')}</p><button onclick="TiqanyRecovery.chooseFolder()">${t('اختيار مجلد النسخ القديمة','Choose previous backup folder')}</button><button class="secondary" onclick="TiqanyRecovery.newDatabase()">${t('إنشاء قاعدة بيانات جديدة','Create new database')}</button>`);
  },
  chooseFolder(){if(!window.AndroidRecovery)return;window.AndroidRecovery.chooseBackupFolder();},
  newDatabase(){localStorage.setItem(KEY,'new');hide();
    if(!window.AndroidAutoBackup?.getStatus)return;
    try{const s=JSON.parse(AndroidAutoBackup.getStatus());if(s.localFolderConfigured){AndroidAutoBackup.configure('local',true,6);(typeof BackupController!=='undefined'&&BackupController.stageLatest?.());}
    else if(window.confirm(t('للحفاظ على بياناتك بعد حذف التطبيق، اختر الآن مجلداً خارجياً لنسخها الاحتياطية. فتح اختيار المجلد؟','To keep data after uninstall, choose an external backup folder now. Open folder picker?'))){AndroidAutoBackup.chooseLocalFolder();}}
    catch(e){console.warn(e);}
  },
  list(items){selectedFolder=true;
    if(!Array.isArray(items)||!items.length){show(heading()+`<p>${t('لم تُعثر على نسخ محاسبية صالحة في المجلد المختار. يمكنك اختيار مجلد آخر.','No valid accounting backups found in this folder. You may choose another one.')}</p><button onclick="TiqanyRecovery.chooseFolder()">${t('مجلد آخر','Choose another folder')}</button><button class="secondary" onclick="TiqanyRecovery.newDatabase()">${t('إنشاء قاعدة جديدة','Start new database')}</button>`);return;}
    this.lastItems=items;show(heading()+`<p>${t('اختر النسخة المراد استعادتها. الأحدث تظهر أولاً؛ لا تتم استعادة أي نسخة قبل اختيارها.','Choose the backup to restore. Newest appears first; nothing is restored until selected.')}</p>`+
    items.map((item,i)=>`<button type="button" class="ta-recovery-file" onclick="TiqanyRecovery.restore('${escape(item.id)}')"><strong>${i===0?t('الأحدث · ','Newest · '):''}${escape(item.name)}</strong><br><small>${new Date(item.date).toLocaleString(ar()?'ar-SY':'en-US')} · ${Math.round((item.size||0)/1024)} KB</small></button>`).join('')+
    `<button class="secondary" onclick="TiqanyRecovery.chooseFolder()">${t('مجلد آخر','Choose another folder')}</button><button class="secondary" onclick="TiqanyRecovery.newDatabase()">${t('بدء قاعدة جديدة دون استعادة','Start new database without restoring')}</button>`);
  },
  restore(id){if(loading)return;loading=true;show(heading()+`<p>${t('جارٍ التحقق من ملف النسخة قبل الاستعادة...','Checking backup before restore...')}</p>`);window.AndroidRecovery?.restoreChoice(String(id));},
  async accept(json){loading=false;
    try{
      const parsed=JSON.parse(json),prior=parsed.data?.agentState;
      if(!prior||!Array.isArray(prior.ops)||!Array.isArray(prior.items)||!Array.isArray(prior.accounts))throw Error('نسخة موظف البيع غير مكتملة');
      if(typeof Agent==='undefined'||!Agent.db||!Agent.state)throw Error('مخزن بيانات الموظف غير جاهز');
      if(!await this.approveAgentBackup(prior))return;
      const current=Agent.state;
      if(current.ops?.length&&!window.confirm('استعادة النسخة ستستبدل العمليات الحالية على هذا الهاتف. هل توافق؟')){
        this.list(this.lastItems||[]);return;
      }
      const replacement=JSON.parse(JSON.stringify(prior));
      replacement.deviceId=current.deviceId;replacement.license='';
      replacement.employeeAuth=current.employeeAuth?.hash?current.employeeAuth:(prior.employeeAuth||null);
      replacement.backupRecovery=current.employeeAuth?.hash?current.employeeAuth:(prior.backupRecovery?.hash?prior.backupRecovery:(current.backupRecovery||null));
      Agent.state=replacement;
      try{await Agent.save();}catch(e){Agent.state=current;throw e;}
      await Agent.show('home');
      this.pendingFromChooser=true;this.restoreCommitted();
    }catch(e){this.error(String(e.message||e));}
  },
  pendingApproval:null,lastItems:[],
  async approveAgentBackup(prior){
    const cfg=prior.backupRecovery?.hash?prior.backupRecovery:Agent.state?.backupRecovery;
    const canBio=!!window.NativeSecurity?.authenticate;
    if(!cfg?.hash&&!canBio){
      this.error('هذه النسخة القديمة لا تحتوي رمز استعادة، وقفل الجهاز الآمن غير متاح. افتح النسخة القديمة واضبط رمز الاستعادة ثم أنشئ نسخة جديدة.');
      return false;
    }
    return new Promise(resolve=>{
      this.pendingApproval={resolve,cfg,busy:false};
      show(heading()+`<p class="ta-recovery-warning">يجب التحقق من هويتك قبل استعادة بيانات موظف البيع.</p>`+
        (canBio?'<button onclick="TiqanyRecovery.tryAgentBiometric()">التحقق بالبصمة أو قفل الجهاز</button>':'')+
        (cfg?.hash?'<input id="taAgentBackupPin" type="password" autocomplete="off" placeholder="كلمة سر النسخة الاحتياطية" style="width:100%;padding:12px;margin-top:12px;border:1px solid #cbd5e1;border-radius:10px"><button onclick="TiqanyRecovery.verifyAgentBackupPin()">التحقق بكلمة السر</button>':'')+
        '<button class="secondary" onclick="TiqanyRecovery.cancelAgentRestore()">إلغاء الاستعادة</button>');
      if(canBio)setTimeout(()=>{if(this.pendingApproval?.resolve===resolve)this.tryAgentBiometric();},80);
    });
  },
  finishAgentApproval(ok){const job=this.pendingApproval;if(!job)return;this.pendingApproval=null;job.resolve(!!ok);},
  cancelAgentRestore(){this.finishAgentApproval(false);this.list(this.lastItems||[]);},
  async verifyAgentBackupPin(){
    const job=this.pendingApproval;if(!job||job.busy||!job.cfg?.hash)return;
    const pin=document.getElementById('taAgentBackupPin')?.value||'';
    job.busy=true;
    try{
      const valid=await window.AgentBackupAuth?.verifyPin(pin,job.cfg);
      if(!valid)throw Error('كلمة سر النسخة الاحتياطية غير صحيحة');
      this.finishAgentApproval(true);hide();
    }catch(e){const el=document.getElementById('taAgentBackupPin');if(el){el.value='';el.placeholder=String(e.message||e);}job.busy=false;}
  },
  tryAgentBiometric(){
    const job=this.pendingApproval;if(!job||job.busy||!window.NativeSecurity?.authenticate)return;
    job.busy=true;
    const array=new Uint8Array(10);crypto.getRandomValues(array);
    const id=Array.from(array,b=>b.toString(16).padStart(2,'0')).join('');
    const old=window.__nativeBiometricReply;
    window.__nativeBiometricReply=(replyId,success,reason)=>{
      if(replyId!==id){if(typeof old==='function')old(replyId,success,reason);return;}
      window.__nativeBiometricReply=old;
      if(!this.pendingApproval)return;
      if(success){this.finishAgentApproval(true);hide();}
      else{job.busy=false;const box=document.getElementById('taAgentBackupPin');if(box)box.placeholder='تعذر التحقق؛ استخدم كلمة السر أو حاول مجدداً';}
    };
    try{NativeSecurity.authenticate(id,'ar');}catch(e){window.__nativeBiometricReply=old;job.busy=false;}
  },
  pendingFromChooser:false,
  restoreCommitted(){
    if(!this.pendingFromChooser)return;
    this.pendingFromChooser=false;
    localStorage.setItem(KEY,'restored');hide();
    try{if(selectedFolder&&window.AndroidAutoBackup?.configure){AndroidAutoBackup.configure('local',true,6);(typeof BackupController!=='undefined'&&BackupController.stageLatest?.());}}catch(_){}
  },
  error(message){loading=false;show(heading()+`<p class="ta-recovery-warning">${escape(message)}</p><button onclick="TiqanyRecovery.chooseFolder()">${t('اختيار مجلد آخر','Choose another folder')}</button><button class="secondary" onclick="TiqanyRecovery.newDatabase()">${t('قاعدة جديدة','New database')}</button>`);}
};
window.TiqanyRecovery=Recovery;
window.__tiqanyRecoveryList=items=>Recovery.list(items);
window.__tiqanyRecoveryError=msg=>Recovery.error(msg);
window.__tiqanyRecoveryData=json=>Recovery.accept(json);
window.addEventListener('load',()=>{let tries=0;const ready=()=>{tries++;if((isAgent?(typeof Agent!=='undefined'&&Agent.state):(typeof State!=='undefined'&&typeof ProfileManager!=='undefined'&&ProfileManager.registry))){Recovery.boot();return;}if(tries<45)setTimeout(ready,250);};setTimeout(ready,850);});
})();
