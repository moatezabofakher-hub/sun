/* Tiqany Acc v3.5.155 – reversible, local-only visual themes.
 * Keeps company data, prices, transactions and peer-sync preferences untouched.
 * Separate per-device theme; no synchronization of purely visual preferences.
 */
(function(){
'use strict';
const KEY='tiqany.ui.theme.154';
const allowed=new Set(['classic','royal','petrol']);
function normalized(value){return allowed.has(value)?value:'classic';}
function stored(){try{return normalized(localStorage.getItem(KEY));}catch(_){return 'classic';}}
let saved=stored(),pending=saved,open=false,dialog=null;
function apply(which){
 document.documentElement.setAttribute('data-ta-theme',normalized(which));
}
apply(saved);
function classify(el){
 const k=el?.dataset?.category||'';
 const label=(el?.textContent||'').replace(/\s+/g,' ').trim();
 if(k==='themes'||label==='الثيمات')return 'themes';
 if(k==='mobile-computer-sync'||/مزامنة.*(الموبايل والكمبيوتر|الهاتف.*الكمبيوتر|الكمبيوتر.*الموبايل)/.test(label))return 'desktop-link';
 if(k==='manager-manager-sync'||/مزامنة أجهزة مدير|مزامنة موبايلين مدير/.test(label))return 'managers-link';
 if(k==='business-profiles'||/الحسابات المستقلة للشركات/.test(label))return 'profiles';
 if(k==='company'||/إعدادات الشركة|بيانات الشركة/.test(label))return 'company';
 if(k==='backup'||/النسخ الاحتياطي|استعادة النسخة/.test(label))return 'backup';
 if(k==='activation'||/التفعيل|ترخيص/.test(label))return 'activation';
 if(k==='currency'||/العملة وسعر الصرف|أسعار الصرف|سعر الصرف|العملة/.test(label))return 'currency';
 if(k==='printing'||/الطباعة|الطابعة/.test(label))return 'printing';
 if(k==='invoices'||/الفواتير|نقطة البيع/.test(label))return 'invoices';
 if(k==='items'||/المواد|المستودع/.test(label))return 'items';
 if(k==='security'||/الحماية|الحساب وكلمة السر|كلمة المرور|بصمة/.test(label))return 'security';
 if(k==='default_period'||/الفترة الافتراضية/.test(label))return 'default_period';
 if(k==='data'||/إعادة ضبط|حذف البيانات|تصفير/.test(label))return 'data';
 if(/مزامنة|الاتصال/.test(label))return 'desktop-link';
 return null;
}
function decorate(){
 if(!document.body)return;
 for(const el of document.querySelectorAll('.ta-category-link,.ta-agent-settings-link')){
   const key=classify(el);
   if(key&&el.dataset.taArt!==key)el.dataset.taArt=key;
 }
 const root=document.getElementById('mainContent');
 if(root?.classList.contains('ta-settings-menu')&&!root.querySelector('#taTheme154Entry')){
   const first=root.querySelector('.ta-category-link');
   if(first){
     const btn=document.createElement('button');
     btn.type='button';btn.id='taTheme154Entry';btn.className='ta-category-link ta-theme154-trigger';
     btn.dataset.category='themes';btn.dataset.taArt='themes';
     btn.innerHTML='<strong>الثيمات</strong>';
     btn.setAttribute('aria-label','الثيمات — اختيار مظهر التطبيق');
     btn.addEventListener('click',show);
     first.before(btn);
   }
 }
 const menu=document.querySelector('.ta-agent-settings-menu');
 if(menu&&!menu.querySelector('#taTheme154Entry')){
   const btn=document.createElement('button');
   btn.type='button';btn.id='taTheme154Entry';btn.className='ta-agent-settings-link';
   btn.dataset.category='themes';btn.dataset.taArt='themes';
   btn.innerHTML='<span class="ta-agent-settings-glyph" aria-hidden="true"><i class="fas fa-palette"></i></span><strong>الثيمات</strong>';
   btn.addEventListener('click',show);
   menu.appendChild(btn);
 }
}
function mark(){
 if(!dialog)return;
 for(const btn of dialog.querySelectorAll('[data-theme-choice]')){
   const active=btn.dataset.themeChoice===pending;
   btn.setAttribute('aria-pressed',active?'true':'false');
   const tag=btn.querySelector('.ta-theme154-selected');
   if(tag)tag.textContent=active?'✓ المحدد حالياً':'اختر هذا التصميم';
 }
}
function mini(type){
 return '<span class="ta-theme154-mini" data-swatch="'+type+'" aria-hidden="true">'+
  '<span class="ta-theme154-mini-bar"></span><span class="ta-theme154-mini-tiles">'+
  '<i>نقطة البيع</i><i>فواتير</i><i>سند قبض</i><i>التقارير</i></span></span>';
}
function show(){
 if(open)return;
 if(!document.body)return;
 const onManager=typeof AppNav!=='undefined'&&typeof AppNav.current==='function'&&AppNav.current()?.screen==='settings';
 const onAgent=typeof Agent!=='undefined'&&Agent.screen==='settings';
 if(!onManager&&!onAgent)return;
 open=true;pending=saved;
 const node=document.createElement('dialog');
 node.id='taTheme154Page';node.className='ta-theme154-page';
 node.setAttribute('aria-labelledby','taTheme154Title');
 node.addEventListener('cancel',event=>{event.preventDefault();cancel();});
 node.innerHTML='<div class="ta-theme154-wrap">'+
  '<div class="ta-theme154-header"><button type="button" class="ta-theme154-back" aria-label="الرجوع إلى الضبط">رجوع</button>'+
  '<h2 id="taTheme154Title">الثيمات</h2></div>'+
  '<p class="ta-theme154-note">اختر التصميم الذي تفضله. تظهر المعاينة مباشرة، ثم اضغط حفظ لاعتماده على هذا الجهاز فقط.</p>'+
  '<div class="ta-theme154-grid">'+
  '<button type="button" class="ta-theme154-option" data-theme-choice="classic" aria-pressed="false">'+mini('classic')+
  '<strong>التصميم الحالي</strong><small>لؤلؤي فاتح، بطاقات ثلاثية الأبعاد وصور مخصصة لكل قسم.</small><small class="ta-theme154-selected"></small></button>'+
  '<button type="button" class="ta-theme154-option" data-theme-choice="royal" aria-pressed="false">'+mini('royal')+
  '<strong>التصميم الأول — الكحلي الملكي</strong><small>أزرق نيون مضيء، تركوازي، لمسات ذهبية، وبطاقات داكنة لامعة.</small><small class="ta-theme154-selected"></small></button>'+
  '<button type="button" class="ta-theme154-option" data-theme-choice="petrol" aria-pressed="false">'+mini('petrol')+
  '<strong>البترولي والنحاسي</strong><small>بترولي لامع بحواف نحاسية وفواتير عاجية عالية التباين.</small><small class="ta-theme154-selected"></small></button>'+
  '</div><div class="ta-theme154-actions">'+
  '<button type="button" class="ta-theme154-save">حفظ الثيم</button>'+
  '<button type="button" class="ta-theme154-cancel">إلغاء</button></div></div>';
 node.addEventListener('click',ev=>{
   const choice=ev.target.closest('[data-theme-choice]');
   if(choice){pending=normalized(choice.dataset.themeChoice);apply(pending);mark();return;}
   if(ev.target.closest('.ta-theme154-save')){save();return;}
   if(ev.target.closest('.ta-theme154-cancel,.ta-theme154-back'))cancel();
 });
 dialog=node;document.body.appendChild(node);node.showModal();mark();
 node.querySelector('.ta-theme154-back')?.focus({preventScroll:true});
}
function close(){
 open=false;
 if(dialog){dialog.close();dialog.remove();dialog=null;}
}
function save(){
 if(!open)return;
 try{localStorage.setItem(KEY,normalized(pending));}catch(error){
   const title=dialog?.querySelector('.ta-theme154-note');
   if(title)title.textContent='تعذر حفظ الثيم على هذا الجهاز. تحقق من صلاحية التخزين ثم أعد المحاولة.';
   return;
 }
 saved=normalized(pending);apply(saved);close();
}
function cancel(){if(!open)return;pending=saved;apply(saved);close();}
function install(){
 decorate();
 const target=document.body;
 if(target)new MutationObserver(decorate).observe(target,{childList:true,subtree:true});
 document.addEventListener('keydown',event=>{
   if(open&&(event.key==='Escape'||event.key==='Backspace')&&!event.target?.matches?.('input,textarea,[contenteditable]')){
     event.preventDefault();event.stopImmediatePropagation();cancel();
   }
 },true);
 if(typeof AppNav!=='undefined'){
   if(typeof AppNav.handleBackButton==='function'){
     const previous=AppNav.handleBackButton;
     AppNav.handleBackButton=function(...args){if(open){cancel();return;}return previous.apply(this,args);};
   }
   if(typeof AppNav.navigate==='function'){
     const previous=AppNav.navigate;
     AppNav.navigate=function(...args){if(open)cancel();return previous.apply(this,args);};
   }
 }
 if(typeof Agent!=='undefined'){
   if(typeof Agent.goBack==='function'){
     const previous=Agent.goBack;
     Agent.goBack=function(...args){if(open){cancel();return;}return previous.apply(this,args);};
   }
   if(typeof Agent.navigate==='function'){
     const previous=Agent.navigate;
     Agent.navigate=function(...args){if(open)cancel();return previous.apply(this,args);};
   }
   if(typeof Agent.show==='function'){
     const previous=Agent.show;
     Agent.show=function(route,...args){if(open&&route!=='settings')cancel();return previous.call(this,route,...args);};
   }
 }
}
window.TiqanyTheme154={current:()=>document.documentElement.getAttribute('data-ta-theme'),saved:()=>saved,isOpen:()=>open,open:show,select:which=>{
 if(!open)return;pending=normalized(which);apply(pending);mark();
},save,cancel};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();
