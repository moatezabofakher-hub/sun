/* Tiqany settings transactions (2026-11-15): one Save/Cancel footer per expanded group.
 * Preserve live non-settings ledger writes while excluding draft settings from snapshots.
 */
(function(){
'use strict';
if(typeof State==='undefined'||typeof StorageEngine==='undefined'||typeof SettingsController==='undefined'||typeof Views==='undefined')return;
const clone = value=>JSON.parse(JSON.stringify(value));
const stagedKeys = new Set(['invoices','default_period','items','printing','company','currency']);
let draft=null, committing=false, reloading=false;
const realSave=StorageEngine.saveState.bind(StorageEngine);
const oldToast=UI.toast.bind(UI);
const oldRender=Views.renderSettings;
const oldToggle=SettingsController.onSectionToggle;
const oldNavigate=AppNav.navigate;
const oldMarkSettingsDirty=SettingsController.markSettingsDirty;
SettingsController.markSettingsDirty=function(...args){if(draft && sameScreen())return;return oldMarkSettingsDirty.apply(this,args);};
const shownSaved=new Set();
function snapshot(key){return {key,settings:clone(State.settings)};}
function rollback(){
 if(!draft)return;
 State.settings=clone(draft.settings);
 if(typeof UiFontScale!=='undefined')UiFontScale.sync();
 draft=null;
 AppNav.clearDirty();
}
function sameScreen(){return AppNav.current()?.screen==='settings';}
StorageEngine.saveState=function(...args){
 // A background import or agent-sync operation must STILL be saved to the database.
 // Temporarily write old settings alongside current financial tables, without modifying live UI.
 if(draft && stagedKeys.has(draft.key) && !committing && sameScreen()){
  const latest=State.settings;
  State.settings=clone(draft.settings);
  try{return realSave(...args);}finally{State.settings=latest;}
 }
 return realSave(...args);
};
UI.toast=function(message,kind,...args){
 if(draft && draft.key==='security' && /تم حفظ إعدادات حماية التطبيق/.test(String(message))){draft=null;shownSaved.clear();}
 if(draft && stagedKeys.has(draft.key) && !committing && kind==='success' && /تم (حفظ|تحديث|ضبط)|التفعيل للعمليات الجديدة/.test(String(message))){
  if(!shownSaved.has(draft.key)){shownSaved.add(draft.key);return oldToast('التعديلات مؤقتة؛ اضغط حفظ في نهاية المجموعة لتثبيتها','info',...args);}
  return;
 }
 return oldToast(message,kind,...args);
};
function install(main){
 const group=main?.querySelectorAll?.('details.settings-section')||[];
 group.forEach(detail=>{
  const body=detail.querySelector(':scope > .settings-section-body');
  if(!body || body.querySelector('.ta-settings-section-footer'))return;
  // Retire prior separate Save buttons to keep ONE Save and ONE Cancel per group.
  for(const el of body.querySelectorAll('button[onclick="SettingsController.saveSettings()"], button[onclick="SettingsController.saveDefaultViewPeriod()"], button[onclick="ProtectionController.saveSettings()"]'))el.remove();
  const footer=document.createElement('div');footer.className='ta-settings-section-footer';
  const btnSave=document.createElement('button');btnSave.type='button';btnSave.className='ta-settings-save';btnSave.textContent='حفظ';
  btnSave.addEventListener('click',()=>saveSection(detail.dataset.settingsSection));
  const btnCancel=document.createElement('button');btnCancel.type='button';btnCancel.className='ta-settings-cancel';btnCancel.textContent='إلغاء';
  btnCancel.addEventListener('click',()=>cancelSection(detail.dataset.settingsSection));
  footer.append(btnSave,btnCancel);body.append(footer);
 });
}
Views.renderSettings=function(main,...args){const result=oldRender.call(this,main,...args);install(main);return result;};
SettingsController.onSectionToggle=function(details){
 const key=details?.dataset?.settingsSection;
 if(!key||details.isConnected===false||reloading)return oldToggle.call(this,details);
 if(details.open){
  if(draft && draft.key!==key){rollback();shownSaved.clear();}
  if(!draft) draft=snapshot(key);
 }else if(draft && draft.key===key){
  rollback();shownSaved.clear();
  // Closing without Save equals Cancel; no settings change is made persistent.
  oldToggle.call(this,details);
  reloading=true;try{AppNav.renderCurrent();}finally{reloading=false;}
  return;
 }
 return oldToggle.call(this,details);
};
AppNav.navigate=function(screen,...args){
 if(draft && screen!=='settings'){rollback();shownSaved.clear();}
 return oldNavigate.call(this,screen,...args);
};
async function saveSection(key){
 if(committing)return;
 const section=document.querySelector(`details.settings-section[data-settings-section="${key}"]`);
 if(!section)return;
 if(!draft)draft=snapshot(key);
 if(draft.key!==key)return;
 try{
  // The company fields and default report period are read only when Save is pressed.
  if(key==='company'){
   const company=document.getElementById('setCompanyName')?.value.trim();
   if(!company){oldToast('أدخل اسم الشركة قبل الحفظ','warn');return;}
   State.settings.companyName=company;
   State.settings.companyPhone=document.getElementById('setCompanyPhone')?.value.trim()||'';
   State.settings.companyAddress=document.getElementById('setCompanyAddress')?.value.trim()||'';
   State.settings.footerNote=document.getElementById('setFooterNote')?.value.trim()||'';
  }
  if(key==='default_period'){
   const mode=TimeFilter.mode(document.getElementById('setDefaultViewPeriod')?.value);
   const start=document.getElementById('setDefaultViewStart')?.value||TimeFilter.localDate();
   const end=document.getElementById('setDefaultViewEnd')?.value||start;
   if(mode==='range' && start>end){oldToast('تاريخ البداية يجب ألا يكون بعد تاريخ النهاية','warn');return;}
   State.settings.defaultViewPeriod=mode;State.settings.defaultViewStart=start;State.settings.defaultViewEnd=end;
  }
  if(key==='security'){
   // PIN checks are handled by the existing guarded protection controller;
   // it writes only after this Save click and successful verification.
   await ProtectionController.saveSettings();
   return;
  }
  committing=true;
  await realSave();
  draft=null;shownSaved.clear();AppNav.clearDirty();
  SettingsController.expandedSections.clear();
  AppNav.renderCurrent();
  oldToast('تم حفظ إعدادات هذه المجموعة','success');
 }catch(e){oldToast('تعذر حفظ إعدادات المجموعة: '+(e?.message||e),'error');}
 finally{committing=false;}
}
function cancelSection(key){
 if(draft && draft.key!==key)return;
 rollback();shownSaved.clear();
 SettingsController.expandedSections.delete(key);
 AppNav.renderCurrent();
 oldToast('تم إلغاء التغييرات غير المحفوظة','info');
}
window.TiqanySettingsDraft={save:saveSection,cancel:cancelSection,isActive:()=>!!draft};
})();
