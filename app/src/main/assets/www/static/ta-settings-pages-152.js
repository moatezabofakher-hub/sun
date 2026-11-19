/* Tiqany Acc 3.5.152 – dedicated settings category pages.
 * The route stays "settings" to preserve SettingsDraft transaction isolation.
 * Never bypass security checks guarding the destructive Data category.
 */
(function(){
'use strict';
if(typeof AppNav==='undefined'||typeof SettingsController==='undefined'||typeof Views==='undefined'||typeof TiqanySettingsDraft==='undefined')return;
const draft=window.TiqanySettingsDraft;
const clone=obj=>JSON.parse(JSON.stringify(obj??{}));
let active=null, baseline=null, formBefore=null, busy=false, viewRendering=false;
const selected=()=>document.querySelector('details.settings-section[data-settings-section="'+active+'"]');
const main=()=>document.getElementById('mainContent');
const groupKey=element=>element?.dataset?.settingsSection;
function controlsSnapshot(element){
 const root=element?.querySelector('.settings-section-body');
 if(!root)return '';
 return JSON.stringify(Array.from(root.querySelectorAll('input,select,textarea')).filter(el=>!['file','button','submit','reset'].includes(el.type))
  .map((el,i)=>({i,id:el.id||'',type:el.type,value:el.value,checked:el.type==='checkbox'||el.type==='radio'?el.checked:undefined})));
}
function hasChanges(){
 if(!active)return false;
 if(JSON.stringify(State.settings)!==JSON.stringify(baseline))return true;
 return controlsSnapshot(selected())!==formBefore;
}
function captureValues(){
 const section=selected();
 if(!section)return [];
 return Array.from(section.querySelectorAll('.settings-section-body input,.settings-section-body select,.settings-section-body textarea'))
  .filter(el=>el.id && !['file','button','submit','reset'].includes(el.type))
  .map(el=>({id:el.id,value:el.value,checked:el.checked,type:el.type}));
}
function restoreValues(list){
 if(!Array.isArray(list)||!active)return;
 const section=selected();
 for(const old of list){
   const el=section?.querySelector('#'+(window.CSS?.escape?.(old.id)||old.id.replace(/([^\w-])/g,'\\$1')));
   if(!el)continue;
   if(old.type==='checkbox'||old.type==='radio')el.checked=old.checked;
   else el.value=old.value;
 }
}
function applyView(){
 const root=main();
 if(!root||!active||AppNav.current()?.screen!=='settings')return;
 const section=selected();
 if(!section)return;
 root.classList.remove('ta-settings-menu');
 root.classList.add('ta-settings-standalone');
 for(const el of root.querySelectorAll('details.settings-section')){
   el.classList.toggle('ta-settings-active-section',el===section);
   if(el===section && !el.open)el.open=true;
 }
 let header=root.querySelector('#taSettingsPageHeader');
 if(!header){
   header=document.createElement('div');header.id='taSettingsPageHeader';header.className='ta-settings-page-header';
   header.innerHTML='<button type="button" class="ta-settings-page-back" aria-label="العودة إلى قائمة الضبط"><i class="fas fa-arrow-right"></i> رجوع</button><h2 id="taSettingsPageName"></h2>';
   root.prepend(header);
   header.querySelector('button').addEventListener('click',()=>back());
 }
 const title=section.querySelector('summary .settings-section-name')?.textContent?.trim()||section.querySelector('summary')?.textContent?.trim()||'الضبط';
 header.querySelector('#taSettingsPageName').textContent=title;
 UI.setHeader?.('<i class="fas fa-sliders"></i> '+title,'إعدادات مستقلة — احفظ التغييرات قبل الرجوع');
}
function open(section,approved=false){
 if(busy||!section||AppNav.current()?.screen!=='settings')return;
 const key=groupKey(section);
 if(!key)return;
 // Data deletion permissions are resolved in ta-settings-order-security-138.js.
 if(key==='data'&&!approved)return;
 if(active && active!==key)return;
 if(!section.open){section.open=true;SettingsController.onSectionToggle(section);}
 else if(!draft.isActive())SettingsController.onSectionToggle(section);
 active=key;
 baseline=clone(State.settings);
 formBefore=controlsSnapshot(section);
 applyView();
 const root=main();if(root)root.scrollTop=0;
 if(typeof window.scrollTo==='function')window.scrollTo({top:0,behavior:'instant'});
}
function discard(){
 const key=active;
 active=null;baseline=null;formBefore=null;
 // Discard is a real transaction rollback, not just a visual close.
 SettingsController.expandedSections?.clear?.();
 const root=main();root?.classList.remove('ta-settings-standalone');
 if(root)root.querySelector('#taSettingsPageHeader')?.remove();
 if(draft.isActive()){
   if(typeof draft.cancel==='function')draft.cancel(key);
   else {draft.discardSilently?.();AppNav.renderCurrent();}
 }else AppNav.renderCurrent();
 return key;
}
async function saveAndClose(after){
 if(!active||busy)return false;
 const key=active;busy=true;
 try{
   // Set inactive before Save rerenders settings, so the list is visible on success.
   active=null;
   await draft.save(key);
   if(draft.isActive()){
     active=key;
     applyView();
     return false; // validation/auth/save failed; remain inside editor
   }
   baseline=null;formBefore=null;
   SettingsController.expandedSections?.clear?.();
   const root=main();root?.classList.remove('ta-settings-standalone');
   if(root)root.querySelector('#taSettingsPageHeader')?.remove();
   if(after)after();
   else AppNav.renderCurrent();
   return true;
 }catch(error){active=key;applyView();UI.toast('تعذر حفظ الإعدادات: '+(error?.message||error),'error');return false;}
 finally{busy=false;}
}
function confirmExit(action){
 if(!hasChanges()){discard();action?.();return;}
 UI.showUnsavedDialog(()=>saveAndClose(action),()=>{discard();action?.();});
}
function back(){
 if(!active)return;
 const modal=document.getElementById('modalContainer');
 if(modal&&!modal.classList.contains('hidden'))return originalBack.call(AppNav);
 confirmExit(null);
}
const originalToggle=SettingsController.onSectionToggle;
SettingsController.onSectionToggle=function(section,...args){
 const result=originalToggle.call(this,section,...args);
 if(groupKey(section)==='data'&&section.open&&AppNav.current()?.screen==='settings'&&!active){
   open(section,true); // called only after existing fingerprint/PIN approval
 }
 return result;
};
document.addEventListener('click',event=>{
 if(AppNav.current()?.screen!=='settings')return;
 const summary=event.target?.closest?.('summary.settings-section-heading');
 if(summary){
   const section=summary.parentElement;
   if(!section?.matches?.('details.settings-section'))return;
   if(groupKey(section)==='data')return; // existing capture-phase PIN gate
   event.preventDefault();event.stopImmediatePropagation();
   open(section);
   return;
 }
 if(!active)return;
 const saveBtn=event.target?.closest?.('.ta-settings-section-footer .ta-settings-save');
 if(saveBtn){event.preventDefault();event.stopImmediatePropagation();saveAndClose();return;}
 const cancelBtn=event.target?.closest?.('.ta-settings-section-footer .ta-settings-cancel');
 if(cancelBtn){event.preventDefault();event.stopImmediatePropagation();confirmExit(null);}
},true);
// Keep the existing forms mounted for draft validation and protected categories.
// The category list itself consists of buttons, so a tap cannot expand a native accordion.
// The previous category is still in the DOM while Save or Back renders the menu.
// Reading its open flag here would re-open a discarded draft on the next render.
const captureSettingsView = SettingsController.captureVisibleSettingsView;
SettingsController.captureVisibleSettingsView = function(...args) {
 if(!active) return null;
 return captureSettingsView.apply(this,args);
};
const renderCategoryList = Views.renderSettings;
Views.renderSettings = function(root,...args) {
 const result = renderCategoryList.call(this,root,...args);
 for(const section of root.querySelectorAll('details.settings-section')) {
   const summary = section.querySelector(':scope > summary');
   if(!summary) continue;
   const button = document.createElement('button');
   button.type = 'button';
   button.className = 'ta-category-link';
   button.dataset.category = groupKey(section);
   button.textContent = summary.querySelector('.settings-section-name')?.textContent.trim() || summary.textContent.trim();
   button.addEventListener('click',()=> {
     if(groupKey(section)==='data') summary.click();
     else open(section);
   });
   section.before(button);
 }
 root.classList.toggle('ta-settings-menu',!active);
 return result;
};

const originalRender=AppNav.renderCurrent;
AppNav.renderCurrent=function(...args){
 const form=active&&AppNav.current()?.screen==='settings'?captureValues():null;
 const result=originalRender.apply(this,args);
 if(active&&AppNav.current()?.screen==='settings'){applyView();restoreValues(form);}
 return result;
};
const originalBack=AppNav.handleBackButton;
AppNav.handleBackButton=function(...args){
 if(active&&AppNav.current()?.screen==='settings'){
   const dialog=document.getElementById('dialogContainer');
   const modal=document.getElementById('modalContainer');
   if((dialog&&!dialog.classList.contains('hidden'))||(modal&&!modal.classList.contains('hidden')))return originalBack.apply(this,args);
   back();return;
 }
 return originalBack.apply(this,args);
};
const originalNavigate=AppNav.navigate;
AppNav.navigate=function(screen,...args){
 if(active&&AppNav.current()?.screen==='settings'){
   confirmExit(screen==='settings'?null:()=>originalNavigate.call(this,screen,...args));
   return;
 }
 return originalNavigate.call(this,screen,...args);
};
window.TiqanySettingsPages152={current:()=>active,isModified:hasChanges,openByKey:key=>{
 const section=Array.from(document.querySelectorAll('details.settings-section')).find(s=>s.dataset.settingsSection===key);
 if(section)open(section);
},back};
})();
