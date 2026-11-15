/* First-run restore chooser. External SAF folders are not destroyed by uninstall;
   Android revokes access on uninstall, so the user must grant the folder again. */
(function(){
'use strict';
const isAgent=typeof window.Agent!=='undefined';
const KEY='tiqany-recovery-start-v1';
const ar=()=>!(window.State?.settings?.language==='en');
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
      !!(window.State&&(['invoices','vouchers','items','accounts','expenses','categories'].some(k=>(State[k]||[]).length>0)||(State.settings?.companyName&&State.settings.companyName!=='المحاسب التقني'&&State.settings.companyName!=='مؤسسة')));
    if(old){localStorage.setItem(KEY,'existing');return;}
    show(heading()+footer()+`<p>${t('يمكنك البحث عن النسخ التي احتفظت بها سابقاً، أو إنشاء قاعدة بيانات جديدة.','You may recover a previously saved backup or start with a new database.')}</p><button onclick="TiqanyRecovery.chooseFolder()">${t('اختيار مجلد النسخ القديمة','Choose previous backup folder')}</button><button class="secondary" onclick="TiqanyRecovery.newDatabase()">${t('إنشاء قاعدة بيانات جديدة','Create new database')}</button>`);
  },
  chooseFolder(){if(!window.AndroidRecovery)return;window.AndroidRecovery.chooseBackupFolder();},
  newDatabase(){localStorage.setItem(KEY,'new');hide();
    if(!window.AndroidAutoBackup?.getStatus)return;
    try{const s=JSON.parse(AndroidAutoBackup.getStatus());if(s.localFolderConfigured){AndroidAutoBackup.configure('local',true,6);window.BackupController?.stageLatest?.();}
    else if(window.confirm(t('للحفاظ على بياناتك بعد حذف التطبيق، اختر الآن مجلداً خارجياً لنسخها الاحتياطية. فتح اختيار المجلد؟','To keep data after uninstall, choose an external backup folder now. Open folder picker?'))){AndroidAutoBackup.chooseLocalFolder();}}
    catch(e){console.warn(e);}
  },
  list(items){selectedFolder=true;
    if(!Array.isArray(items)||!items.length){show(heading()+`<p>${t('لم تُعثر على نسخ محاسبية صالحة في المجلد المختار. يمكنك اختيار مجلد آخر.','No valid accounting backups found in this folder. You may choose another one.')}</p><button onclick="TiqanyRecovery.chooseFolder()">${t('مجلد آخر','Choose another folder')}</button><button class="secondary" onclick="TiqanyRecovery.newDatabase()">${t('إنشاء قاعدة جديدة','Start new database')}</button>`);return;}
    show(heading()+`<p>${t('اختر النسخة المراد استعادتها. الأحدث تظهر أولاً؛ لا تتم استعادة أي نسخة قبل اختيارها.','Choose the backup to restore. Newest appears first; nothing is restored until selected.')}</p>`+
    items.map((item,i)=>`<button type="button" class="ta-recovery-file" onclick="TiqanyRecovery.restore('${escape(item.id)}')"><strong>${i===0?t('الأحدث · ','Newest · '):''}${escape(item.name)}</strong><br><small>${new Date(item.date).toLocaleString(ar()?'ar-SY':'en-US')} · ${Math.round((item.size||0)/1024)} KB</small></button>`).join('')+
    `<button class="secondary" onclick="TiqanyRecovery.chooseFolder()">${t('مجلد آخر','Choose another folder')}</button><button class="secondary" onclick="TiqanyRecovery.newDatabase()">${t('بدء قاعدة جديدة دون استعادة','Start new database without restoring')}</button>`);
  },
  restore(id){if(loading)return;loading=true;show(heading()+`<p>${t('جارٍ التحقق من ملف النسخة قبل الاستعادة...','Checking backup before restore...')}</p>`);window.AndroidRecovery?.restoreChoice(String(id));},
  async accept(json){loading=false;try{const parsed=JSON.parse(json);
      if(isAgent){const prior=parsed.data?.agentState;
        if(!prior||!Array.isArray(prior.ops)||!Array.isArray(prior.items)||!Array.isArray(prior.accounts))throw Error(t('نسخة موظف البيع غير مكتملة','Incomplete sales staff backup'));
        if(!window.Agent?.db||!window.Agent?.state)throw Error(t('مخزن بيانات الموظف غير جاهز','Sales staff database is not ready'));
        const current=Agent.state;
        if(current.ops?.length&&!window.confirm(t('استعادة النسخة ستستبدل العمليات الحالية على هذا الهاتف. هل توافق؟','Restore will replace current phone operations. Continue?')))return this.boot();
        // Licenses are bound to each installed device. Never transplant an old license.
        const replacement=JSON.parse(JSON.stringify(prior));replacement.deviceId=current.deviceId;replacement.license='';
        Agent.state=replacement;try{await Agent.save();}catch(e){Agent.state=current;throw e;}
        await Agent.show('home');
      }else{
        if(!window.ProfileManager?.restoreParsed)throw Error(t('الاستعادة غير جاهزة','Restore not ready'));
        await ProfileManager.restoreParsed(parsed);
      }
      localStorage.setItem(KEY,'restored');hide();
      // After consent, automatically enable fresh backups in the chosen external folder.
      try{if(selectedFolder&&window.AndroidAutoBackup?.configure){AndroidAutoBackup.configure('local',true,6);window.BackupController?.stageLatest?.();}}catch(_){}
    }catch(e){this.error(String(e.message||e));}
  },
  error(message){loading=false;show(heading()+`<p class="ta-recovery-warning">${escape(message)}</p><button onclick="TiqanyRecovery.chooseFolder()">${t('اختيار مجلد آخر','Choose another folder')}</button><button class="secondary" onclick="TiqanyRecovery.newDatabase()">${t('قاعدة جديدة','New database')}</button>`);}
};
window.TiqanyRecovery=Recovery;
window.__tiqanyRecoveryList=items=>Recovery.list(items);
window.__tiqanyRecoveryError=msg=>Recovery.error(msg);
window.__tiqanyRecoveryData=json=>Recovery.accept(json);
window.addEventListener('load',()=>{let tries=0;const ready=()=>{tries++;if((isAgent?window.Agent?.state:(window.State&&window.ProfileManager?.registry))){Recovery.boot();return;}if(tries<45)setTimeout(ready,250);};setTimeout(ready,850);});
})();
