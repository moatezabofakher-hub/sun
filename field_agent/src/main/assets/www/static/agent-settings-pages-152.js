/* Employee v3.5.152: settings categories are real single-panel pages.
 * Password/permissions and active synchronization logic are not modified.
 */
(function(){
'use strict';
if(typeof Agent==='undefined'||typeof document==='undefined')return;
const A=Agent;
let category=null,beforeState=null,beforeForm='',allowed=false,busy=false,printerBaseline=null;
const id="taAgentSettingsPage";
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const configKeys=['printerWidth','printFontScale','posAccountId','posPriceTier','posScanFromHome','posAutoNextOnFinish'];
const currentConfig=()=>Object.fromEntries(configKeys.map(k=>[k,A.state?.[k]]));
const snap=()=>JSON.stringify(currentConfig());
const root=()=>document.getElementById('screen');
function sectionList(html){
 const node=document.createElement('div');node.innerHTML=html;
 const sections=[...node.children].filter(el=>el.matches?.('section.panel')&&el.querySelector('h3'));
 return{node,sections};
}
function snapshotInputs(){
 const page=root();if(!page)return '';
 return JSON.stringify([...page.querySelectorAll('input,select,textarea')].filter(x=>!['file','button'].includes(x.type)).map(x=>[x.id,x.type==='checkbox'?x.checked:x.value]));
}
function dirty(){
 return (category!==null&&A.screen==='settings'&&(snap()!==beforeState||snapshotInputs()!==beforeForm))||
     (A.screen==='printer'&&A.hasPendingSettingsDraft?.('printer')===true)||
     (A.screen==='backup'&&printerBaseline!==null&&snapshotInputs()!==printerBaseline);
}
function dialog(next){
 if(busy)return;
 const old=document.getElementById(id);old?.remove();
 const mask=document.createElement('div');mask.id=id;mask.className='dialog-mask';
 mask.setAttribute('role','presentation');
 mask.innerHTML='<div class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="taAgentSettingsDecisionTitle" dir="rtl">'+
   '<h3 id="taAgentSettingsDecisionTitle">تغييرات الإعدادات غير محفوظة</h3>'+
   '<p>اختر حفظ التعديلات، متابعة الإعداد، أو تجاهلها دون حفظ.</p>'+
   '<div class="dialog-actions" style="display:flex;gap:7px;flex-wrap:wrap">'+
     '<button class="primary" id="taAgentSettingsSave">حفظ</button>'+
     '<button class="secondary" id="taAgentSettingsContinue">متابعة الإعداد</button>'+
     '<button class="secondary" id="taAgentSettingsDiscard">تجاهل</button>'+
   '</div></div>';
 document.body.appendChild(mask);
 const close=()=>mask.remove();
 mask.querySelector('#taAgentSettingsContinue').onclick=close;
 mask.querySelector('#taAgentSettingsDiscard').onclick=async()=>{close();discard();await next();};
 mask.querySelector('#taAgentSettingsSave').onclick=async()=>{
   if(busy)return;
   busy=true;
   try{
     const result=await save();
     if(result){close();await next();}
   }finally{busy=false;}
 };
}
function setCategory(index){
 if(A.screen!=='settings'||busy)return;
 const markup=baseRenderSettings.call(A);
 const list=sectionList(markup).sections;
 if(!Number.isInteger(Number(index))||Number(index)<0||Number(index)>=list.length)return;
 category=Number(index);beforeState=snap();beforeForm='';
 A.show('settings');
}
function renderCategory(html){
 const parsed=sectionList(html),items=parsed.sections;
 if(category===null){
   const extra=[...parsed.node.children].filter(el=>!el.matches?.('section.panel'));
   const links=items.map((s,index)=>{
     const name=s.querySelector('h3')?.textContent?.trim()||'إعدادات';
     return '<button class="ta-agent-settings-category" type="button" onclick="AgentSettingsPages152.open('+index+')"><span class="ta-agent-settings-category-symbol">⚙</span><strong>'+esc(name)+'</strong><span aria-hidden="true">‹</span></button>';
   }).join('');
   return '<div class="hero"><h2>الضبط</h2><p>اختر القسم لفتحه في صفحة مستقلة</p></div>'+
     extra.map(e=>e.outerHTML).join('')+'<div class="ta-agent-settings-index">'+links+'</div>';
 }
 const selected=items[category];
 if(!selected){category=null;return renderCategory(html);}
 const title=selected.querySelector('h3')?.textContent?.trim()||'الضبط';
 return '<div class="ta-agent-settings-subpage"><div class="ta-agent-settings-top">'+
  '<button type="button" class="secondary" onclick="AgentSettingsPages152.back()">← رجوع</button>'+
  '<h2>'+esc(title)+'</h2></div>'+
  selected.outerHTML+'<div class="ta-agent-settings-footer">'+
  '<button type="button" class="primary" onclick="AgentSettingsPages152.savePage()">حفظ</button>'+
  '<button type="button" class="secondary" onclick="AgentSettingsPages152.back()">رجوع</button>'+
  '</div></div>';
}
function exitCategory(){
 category=null;beforeForm='';beforeState=null;
 return A.show('settings');
}
function discard(){
 if(category!==null&&A.screen==='settings'&&beforeState){
   const data=JSON.parse(beforeState);
   for(const k of configKeys)A.state[k]=data[k];
 }
 A.discardSettingsDraftSilently?.('printer');
}
async function save(){
 try{
   if(A.screen==='printer'&&A.hasPendingSettingsDraft?.('printer')){
     const ok=await A.saveDraftSettings('printer');if(!ok)return false;
   }else if(A.screen==='backup'){
     const hasNative=!!window.AndroidAutoBackup?.configure;
     if(!hasNative){A.toast('حفظ النسخ الاحتياطي غير متاح خارج تطبيق أندرويد');return false;}
     // Native backup preference actions remain the authority for their data.
     await A.saveBackupFrequency();
     if(window.AndroidAgentBackup?.saveNumbers)await A.saveWhatsAppBackupNumbers();
   }else if(A.screen==='settings'){
     // No manager-level company options can be edited here. The employee owns
     // only device printing preferences and its locally authorised POS prefs.
     if(A.hasPendingSettingsDraft?.('pos')){
       const ok=await A.saveDraftSettings('pos');if(!ok)return false;
     }
   }
   beforeState=snap();beforeForm=snapshotInputs();printerBaseline=beforeForm;
   A.toast('تم حفظ إعدادات هذا القسم');
   return true;
 }catch(e){A.toast('تعذر حفظ التغييرات: '+(e?.message||e));return false;}
}
function back(){
 if(A.screen==='settings'&&category!==null){
   if(dirty())return dialog(exitCategory);
   return exitCategory();
 }
 return A.goBack();
}
const baseRenderSettings=A.renderSettings;
A.renderSettings=function(...args){
 const html=baseRenderSettings.apply(this,args);
 return renderCategory(html);
};
const baseShow=A.show;
A.show=async function(where,...args){
 if(category!==null&&this.screen==='settings'&&where!=='settings'&&!allowed){
   if(dirty())return dialog(async()=>{
     category=null;beforeState=null;beforeForm='';
     allowed=true;try{return await baseShow.call(this,where,...args)}finally{allowed=false}
   });
   category=null;beforeState=null;beforeForm='';
 }
 const result=await baseShow.call(this,where,...args);
 if(where==='settings'&&category!==null&&beforeForm==='')beforeForm=snapshotInputs();
 if(where==='backup'||where==='printer')printerBaseline=snapshotInputs();
 return result;
};
const baseNav=A.navigate;
if(typeof baseNav==='function')A.navigate=async function(route,...args){
 if(category!==null&&this.screen==='settings'&&route!=='settings'&&!allowed){
   const next=async()=>{category=null;beforeState=null;beforeForm='';allowed=true;try{return await baseNav.call(this,route,...args)}finally{allowed=false}};
   if(dirty())return dialog(next);
   return next();
 }
 return baseNav.call(this,route,...args);
};
const oldBack=A.goBack;
if(typeof oldBack==='function')A.goBack=async function(...args){
 if(category!==null&&this.screen==='settings'){
   const existing=document.getElementById(id);
   if(existing)return;
   const nativeDlg=document.getElementById('agentDialog');
   if(nativeDlg&&!nativeDlg.classList.contains('hide'))return oldBack.apply(this,args);
   return back();
 }
 if(['printer','backup'].includes(this.screen)&&dirty()&&!allowed){
   return dialog(async()=>{allowed=true;try{return await oldBack.apply(this,args)}finally{allowed=false}});
 }
 return oldBack.apply(this,args);
};
window.AgentSettingsPages152={open:setCategory,back,savePage:save,isModified:dirty};
})();