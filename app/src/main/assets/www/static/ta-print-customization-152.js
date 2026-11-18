/* Configurable invoice output (preview + native Bluetooth receipt), based on 3.5.152. */
(function(){
'use strict';
if(typeof State==='undefined'||typeof Views==='undefined')return;
const Print={
 labels:[
  ['logo','شعار الشركة'],['company','اسم الشركة'],['phone','هاتف الشركة'],
  ['address','عنوان الشركة'],['date','تاريخ الفاتورة'],['account','اسم الحساب'],
  ['unit','الوحدة'],['quantity','الكمية'],['price','السعر الإفرادي'],
  ['total','الإجمالي لكل مادة'],['balances','الرصيد قبل الفاتورة والرصيد النهائي'],
  ['footer','الملاحظة أسفل الفاتورة']
 ],
 enabled(key){return State.settings.taPrintFields?.[key]!==false;},
 change(key,checked){
   if(!this.labels.some(x=>x[0]===key))return;
   State.settings.taPrintFields={...(State.settings.taPrintFields||{}),[key]:checked===true};
   SettingsController.markSettingsDirty?.();
 },
 settings(){
   const section=document.querySelector('details[data-settings-section="printing"] .settings-section-body');
   if(!section||section.querySelector('#taPrintFieldsSetting'))return;
   const boxes=this.labels.map(([key,name])=>'<label style="display:flex;gap:8px;align-items:center;padding:5px 0">'+
       '<input type="checkbox" '+(this.enabled(key)?'checked':'')+
       ' onchange="TiqanyPrint152.change(\''+key+'\',this.checked)">'+name+'</label>').join('');
   const html='<div id="taPrintFieldsSetting" class="ta-enh-panel"><h3 class="font-black text-sm">تعديل المحتوى المعروض في الفاتورة المطبوعة</h3>'+
     '<p class="text-[11px] text-slate-700">اختر المعلومات التي تُطبع. تُحفظ الخيارات بالضغط على حفظ إعدادات الطباعة.</p>'+
     '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:8px">'+boxes+'</div></div>';
   const foot=section.querySelector('.ta-settings-section-footer');
   if(foot)foot.insertAdjacentHTML('beforebegin',html);else section.insertAdjacentHTML('beforeend',html);
 },
 applyPreview(main){
   const paper=main?.querySelector('#printableReceiptArea');if(!paper)return;
   const table=paper.querySelector('table');
   if(table){
     table.classList.add('ta-enh-print-grid');
     const positions={unit:3,quantity:4,price:5,total:6};
     for(const [field,n]of Object.entries(positions))
       table.querySelectorAll('tr>*:nth-child('+n+')').forEach(c=>{if(!this.enabled(field))c.style.display='none';});
   }
   const header=paper.firstElementChild;
   if(header){
      if(!this.enabled('logo'))header.querySelector('img')?.setAttribute('hidden','');
      if(!this.enabled('company'))header.querySelector('h2')?.setAttribute('hidden','');
      const phone=header.querySelector('p[dir="ltr"]');
      const address=header.querySelector('p:not([dir="ltr"])');
      if(!this.enabled('phone')&&phone)phone.hidden=true;
      if(!this.enabled('address')&&address)address.hidden=true;
   }
   for(const row of paper.querySelectorAll('.grid.grid-cols-12')){
      const name=row.querySelector('span')?.textContent?.trim();
      if(name==='التاريخ'&&!this.enabled('date'))row.hidden=true;
      if(name==='الحساب'&&!this.enabled('account'))row.hidden=true;
   }
   if(!this.enabled('balances')){
      for(const div of paper.querySelectorAll('div'))if(div.children.length===2&&/الرصيد قبل الفاتورة|الرصيد النهائي/.test(div.children[0]?.textContent||'')&&div.children[0]?.children?.length===0)div.hidden=true;
   }
   if(!this.enabled('footer')){const el=paper.lastElementChild;if(el)el.hidden=true;}
 },
 install(){
   const oldSettings=Views.renderSettings;
   Views.renderSettings=function(main,...args){const out=oldSettings.call(this,main,...args);Print.settings();return out;};
   const oldPrint=Views.renderInvoicePrint;
   Views.renderInvoicePrint=function(main,...args){const out=oldPrint.call(this,main,...args);Print.applyPreview(main);return out;};
 }
};
window.TiqanyPrint152=Print;Print.install();
})();