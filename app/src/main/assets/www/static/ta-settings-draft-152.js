/* Tiqany Acc v3.5.152 — staged, guarded settings section changes.
 * The UI keeps the old accounting database; all draft changes remain memory-only.
 * External irreversible commands (backup execution, database reset, activation)
 * retain their independent confirmation and are not represented as reversible.
 */
(function(){
'use strict';
if(typeof Views==='undefined'||typeof SettingsController==='undefined'||typeof StorageEngine==='undefined'||typeof State==='undefined')return;
const clone=v=>JSON.parse(JSON.stringify(v||{}));
let active=null,baseline=null,committing=false;
const originalSave=StorageEngine.saveState;
const realSave=(...args)=>originalSave.apply(StorageEngine,args);
function begin(key){
 if(active&&active!==key)return false;
 if(!active){active=key;baseline=clone(State.settings);}
 return true;
}
function syncFields(){
 // Four company header fields have deferred input handlers. Other settings
 // controls use their existing onChange validators and mutate State.settings.
 const input=id=>document.getElementById(id);
 for(const [id,name] of [
   ['setCompanyName','companyName'],['setCompanyPhone','companyPhone'],
   ['setCompanyAddress','companyAddress'],['setFooterNote','footerNote']
 ]){const element=input(id);if(element)State.settings[name]=String(element.value||'').trim();}
 const width=input('setPrinterWidth');
 if(width&&Number.isFinite(Number(width.value))&&Number(width.value)>0)State.settings.printerWidth=Number(width.value);
}
StorageEngine.saveState=function(...args){
 if(!active||committing)return originalSave.apply(this,args);
 // Existing auto-save handlers are converted into draft-safe operations. The
 // transaction persists accounting events with *approved* settings, so a later
 // invoice/sync save cannot silently commit a half-edited settings panel.
 const live=State.settings;
 try{State.settings=baseline;return originalSave.apply(this,args);}
 finally{State.settings=live;}
};
const oldToggle=SettingsController.onSectionToggle;
SettingsController.onSectionToggle=function(section,...args){
 const old=oldToggle.call(this,section,...args);
 if(section?.open&&section.dataset?.settingsSection&&section.isConnected!==false)
   begin(section.dataset.settingsSection);
 return old;
};
const oldMark=SettingsController.markSettingsDirty;
SettingsController.markSettingsDirty=function(...args){
 if(active)return; // page draft prompts, not the general invoice dirty guard
 return oldMark.apply(this,args);
};
const oldRender=Views.renderSettings;
Views.renderSettings=function(main,...args){
 const result=oldRender.call(this,main,...args);
 for(const section of main.querySelectorAll('details.settings-section[data-settings-section]')){
  const body=section.querySelector('.settings-section-body');
  if(!body||body.querySelector('.ta-settings-section-footer'))continue;
  const foot=document.createElement('div');foot.className='ta-settings-section-footer';
  foot.innerHTML='<button type="button" class="ta-settings-save">حفظ</button>'+
    '<button type="button" class="ta-settings-cancel">إلغاء</button>';
  body.appendChild(foot);
 }
 return result;
};
const controller={
 isActive(){return Boolean(active);},
 current(){return active;},
 begin,
 discardSilently(){
   if(baseline)State.settings=clone(baseline);
   active=null;baseline=null;
   AppNav?.clearDirty?.();
 },
 async cancel(key){
   if(key&&active&&key!==active)return false;
   this.discardSilently();
   AppNav.renderCurrent?.();
   return true;
 },
 async save(section){
   if(!active||section!==active)throw Error('صفحة الإعداد غير متوافقة');
   syncFields();
   committing=true;
   try{
     await realSave();
     active=null;baseline=null;
     AppNav?.clearDirty?.();
     UI.toast?.('تم حفظ إعدادات القسم','success');
     return true;
   }catch(e){
     UI.toast?.('تعذر حفظ الإعدادات، يمكنك مراجعتها وإعادة المحاولة','error');
     return false;
   }finally{committing=false;}
 }
};
window.TiqanySettingsDraft=controller;
})();