/* Tiqany Acc employee v3.5.152 settings: standalone category views and 3-way Back guard.
 * Does not add manager-only equity, opening stock or enterprise pricing permissions.
 */
(function(){
'use strict';
if(typeof Agent==='undefined'||typeof document==='undefined')return;
let activeIndex=null,baseline='',busy=false,openedFromSettings=false;
let printerBaseline=null,backupBaseline=null;
const esc=v=>Agent.escape(String(v??''));
function values(root){
 return JSON.stringify(Array.from(root?.querySelectorAll?.('input,textarea,select')||[])
    .filter(e=>!['button','file','submit','reset'].includes(e.type))
    .map((e,i)=>[i,e.id||'',e.type==='checkbox'||e.type==='radio'?e.checked:e.value]));
}
function posState(){const s=Agent.state||{};return JSON.stringify([s.posAccountId||'',s.posPriceTier||'account',s.posScanFromHome===true,s.posAutoNextOnFinish===true]);}
function changed(){
 if(activeIndex!==null && Agent.screen==='settings')
  return values(document.getElementById('taAgentSettingsBody'))!==baseline;
 if(Agent.screen==='printer'){
  const node=document.getElementById('agentPrintWidth');
  return node&&printerBaseline!==null&&String(node.value)!==String(printerBaseline);
 }
 if(Agent.screen==='backup'){
  const panel=document.getElementById('screen');
  return backupBaseline!==null&&values(panel)!==backupBaseline;
 }
 return false;
}
function menus(){
 const full=document.createElement('div');
 full.innerHTML=savedRender.call(Agent);
 const sections=Array.from(full.children).filter(e=>e.matches?.('section.panel')&&!e.matches('[data-app-build]'));
 return {full,sections};
}
const savedRender=Agent.renderSettings;
Agent.renderSettings=function(){
 const {full,sections}=menus();
 const title='<div class="hero"><h2>الضبط</h2><p>اختر القسم لفتحه في صفحة مستقلة.</p></div>';
 if(activeIndex===null){
  const version=Array.from(full.children).find(e=>e.matches?.('[data-app-build]'))?.outerHTML||'';
  const extras=Array.from(full.children).filter(e=>!e.matches?.('.hero,section.panel')).map(e=>e.outerHTML).join('');
  return title+version+extras+'<div class="ta-agent-settings-menu" dir="rtl">'+sections.map((s,i)=>{
    const label=s.querySelector('h3')?.textContent?.trim()||'قسم الضبط';
    return '<button type="button" class="ta-agent-settings-link" onclick="AgentSettingsPages152.open('+i+')">'+
       '<span class="ta-agent-settings-glyph"><i class="fas fa-gear" aria-hidden="true"></i></span>'+
       '<strong>'+esc(label)+'</strong></button>';
  }).join('')+'</div>';
 }
 const section=sections[activeIndex];
 if(!section){activeIndex=null;baseline='';return title;}
 const label=section.querySelector('h3')?.textContent?.trim()||'الضبط';
 return '<div class="ta-agent-settings-heading" dir="rtl">'+
   '<button type="button" onclick="AgentSettingsPages152.back()" aria-label="الرجوع إلى أقسام الضبط"><i class="fas fa-arrow-right"></i> رجوع</button>'+
   '<strong>'+esc(label)+'</strong></div>'+
   '<div id="taAgentSettingsBody">'+section.outerHTML+'</div>'+
   '<div class="ta-agent-settings-footer" dir="rtl"><button type="button" class="primary" onclick="AgentSettingsPages152.save()">حفظ</button>'+
   '<button type="button" class="secondary" onclick="AgentSettingsPages152.back()">رجوع</button></div>';
};
async function open(index){
 if(Agent.screen!=='settings'||activeIndex!==null||busy)return;
 const {sections}=menus();
 if(!Number.isInteger(index)||index<0||index>=sections.length)return;
 activeIndex=index;openedFromSettings=true;
 await Agent.show('settings');
 baseline=values(document.getElementById('taAgentSettingsBody'));
}
function decision(saveAction,discardAction){
 if(document.getElementById('taAgentSettingsDecision'))return;
 const overlay=document.createElement('div');overlay.id='taAgentSettingsDecision';
 overlay.className='ta-agent-settings-mask';
 overlay.setAttribute('role','presentation');
 overlay.innerHTML='<div class="ta-agent-settings-dialog" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="taAgentSettingsPrompt">'+
   '<h3 id="taAgentSettingsPrompt">هل تريد حفظ التغييرات قبل الخروج؟</h3>'+
   '<div class="ta-agent-settings-choices"><button type="button" class="primary" data-answer="save">نعم</button>'+
   '<button type="button" class="secondary" data-answer="discard">لا</button></div></div>';
 overlay.addEventListener('click',event=>{
  const button=event.target.closest('[data-answer]');if(!button)return;
  const answer=button.dataset.answer;
  
  if(answer==='save'){overlay.remove();Promise.resolve(saveAction()).catch(e=>Agent.toast('تعذر الحفظ: '+e.message));}
  if(answer==='discard'){overlay.remove();discardAction();}
 });
 document.body.appendChild(overlay);
}
async function save(){
 if(busy)return false;
 busy=true;
 try{
  if(Agent.screen==='printer'){
   const width=document.getElementById('agentPrintWidth')?.value;
   if(width){await Agent.updatePrinterWidth(width);if(Number(Agent.state.printerWidth)!==Number(width))return false;}
   printerBaseline=Number(Agent.state.printerWidth)||80;return true;
  }
  if(Agent.screen==='settings'&&activeIndex!==null){
   const node=document.getElementById('taAgentSettingsBody');
   if(node?.querySelector('#agentPosSettings')){
    const a=Agent.state||{},old=posState();
    const next=[
      document.getElementById('agentPosAccount')?.value||'',
      document.getElementById('agentPosTier')?.value||'account',
      document.getElementById('agentPosHomeScan')?.checked===true,
      document.getElementById('agentPosAutoNext')?.checked===true
    ];
    await Agent.savePosSettings();
    if(posState()!==JSON.stringify(next)){
      Agent.toast('لم يكتمل حفظ إعدادات نقطة البيع');return false;
    }
   } else if(changed()) {
    Agent.toast('هذا القسم يحتوي خيارات لم تُحفظ؛ استخدم زر الحفظ الخاص بالخيار أولاً');return false;
   }
   baseline=values(node);return true;
  }
  if(Agent.screen==='backup'){
   // Native backup operations have their own explicit Save controls.
   Agent.toast('احفظ إعدادات النسخ الاحتياطي من أزرار الحفظ الموجودة في الصفحة');return false;
  }
  return true;
 }catch(e){Agent.toast('تعذر الحفظ: '+(e?.message||e));return false;}
 finally{busy=false;}
}
async function close(next){
 const route=Agent.screen;
 if(route==='settings'&&activeIndex!==null){
   const node=document.getElementById('taAgentSettingsBody');
   if(node?.querySelector('#agentPosSettings'))Agent.discardSettingsDraftSilently?.('pos');
   activeIndex=null;baseline='';openedFromSettings=false;
   if(next)await next();else await Agent.show('settings');
 }else if(route==='printer'){
   Agent.discardSettingsDraftSilently?.('printer');
   printerBaseline=null;
   if(next)await next();else await oldBack.call(Agent);
 }else if(route==='backup'){
   backupBaseline=null;
   if(next)await next();else await oldBack.call(Agent);
 }
}
function requestExit(next){
 if(busy)return;
 if(!changed())return close(next);
 decision(async()=>{const saved=await save();if(saved)await close(next);return saved;},()=>close(next));
}
const oldBack=Agent.goBack;
Agent.goBack=function(...args){
 if(document.getElementById('agentDialog')?.classList.contains('hide')===false)return oldBack.apply(this,args);
 if((this.screen==='settings'&&activeIndex!==null)||(this.screen==='printer'&&printerBaseline!==null)||(this.screen==='backup'&&backupBaseline!==null)){
    requestExit(null);return;
 }
 return oldBack.apply(this,args);
};
const oldNavigate=Agent.navigate;
Agent.navigate=function(route,...args){
 if((this.screen==='settings'&&activeIndex!==null)||(this.screen==='printer'&&printerBaseline!==null)||(this.screen==='backup'&&backupBaseline!==null)){
    requestExit(route===this.screen?null:()=>oldNavigate.call(this,route,...args));
    return;
 }
 return oldNavigate.call(this,route,...args);
};
const oldShow=Agent.show;
Agent.show=async function(route,...args){
 const result=await oldShow.call(this,route,...args);
 if(route==='printer'&&printerBaseline===null)printerBaseline=Number(this.state?.printerWidth)||80;
 if(route==='backup'&&backupBaseline===null)backupBaseline=values(document.getElementById('screen'));
 if(route!=='printer'&&this.screen!=='printer')printerBaseline=null;
 if(route!=='backup'&&this.screen!=='backup')backupBaseline=null;
 return result;
};
window.AgentSettingsPages152={open,save:async()=>{if(await save())await close(null);},back:()=>requestExit(null),changed};
const operationSaves = {invoice:'saveInvoice', voucher:'saveVoucher', expense:'saveExpense', payment:'saveInvoicePayment', currency_exchange:'saveCurrencyExchange'};
let operationBaseline = null;
function operationValues() {
 const page = document.getElementById('screen');
 const fields = Array.from(page?.querySelectorAll('input[id],textarea[id],select[id]') || [])
   .filter(el => !/search|filter|barcode|query/i.test(el.id))
   .map(el => [el.id, el.type==='checkbox' || el.type==='radio' ? el.checked : el.value]);
 return JSON.stringify([fields, Agent.screen==='invoice' ? Agent.draft : null]);
}
const showOperation = Agent.show;
Agent.show = async function(route,...args) {
 const previous=this.screen;
 const result=await showOperation.call(this,route,...args);
 if(!operationSaves[this.screen]) operationBaseline=null;
 else if(previous!==this.screen || operationBaseline===null) operationBaseline=operationValues();
 return result;
};
// Customer and item editors are overlays over the current operation.
const editorDefinitions=[
 ['agentNewCustomerModal','openCustomerForm','closeCustomerForm','saveNewCustomer'],
 ['agentItemCreateModal','openNewItemForm','closeNewItemForm','saveNewItem']
];
for(const [id,openName,closeName,saveName] of editorDefinitions){
 const open=Agent[openName],close=Agent[closeName];
 let original=null;
 Agent[openName]=function(...args){
   const result=open.apply(this,args);
   original=values(document.getElementById(id));return result;
 };
 Agent[closeName]=function(...args){
   const element=document.getElementById(id);
   if(this.busy || original===null || values(element)===original)return close.apply(this,args);
   decision(async()=>{await this[saveName]();return element.classList.contains('hide');},()=>close.apply(this,args));
 };
}
const backFromOperation=Agent.goBack;
Agent.goBack=function(...args) {
 const prompt=document.getElementById('taAgentSettingsDecision');
 if(prompt){prompt.remove();return;}
 for(const [id,,closeName] of editorDefinitions){
   const editor=document.getElementById(id);
   if(editor && !editor.classList.contains('hide'))return this[closeName]();
 }
 const saveMethod=operationSaves[this.screen];
 const openOverlay=Array.from(document.querySelectorAll('.dialog-mask,.agent-picker-mask,#agentPosNameList,.modal-overlay'))
   .some(el=>el.getClientRects().length && getComputedStyle(el).visibility!=='hidden');
 if(!saveMethod || openOverlay) return backFromOperation.apply(this,args);
 const parentStack=this.stack.slice(0,-1);
 if(!parentStack.length)parentStack.push('home');
 const leave=async()=>{
   this.editingId=null;this.posMode=false;this.draft=[];operationBaseline=null;
   this.stack=parentStack;
   await this.show(parentStack[parentStack.length-1]);
 };
 if(operationValues()===operationBaseline)return leave();
 decision(async()=>{
   if(this.busy)return false;
   const count=this.state.ops.length, editing=this.editingId;
   const revision=editing && this.state.ops.find(op=>op.id===editing);
   await this[saveMethod]();
   const committed=this.state.ops.length>count || (revision && this.state.ops.find(op=>op.id===editing)!==revision);
   if(committed)await leave();
   return Boolean(committed);
 },leave);
};

})();
