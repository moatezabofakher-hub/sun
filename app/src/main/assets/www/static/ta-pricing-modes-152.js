/* Pricing plans on top of Tiqany Acc 3.5.152.
 * IDs are immutable. Deletions are prohibited when a historical operation may depend on them.
 */
(function(){
'use strict';
if(typeof State==='undefined'||typeof Accounting==='undefined'||typeof InvoiceController==='undefined'||typeof Views==='undefined')return;
const P={
 defaults:[{id:'wholesale',name:'الجملة'},{id:'center',name:'المركز'},{id:'consumer',name:'المستهلك'},{id:'cost',name:'التكلفة'}],
 esc(v){return AppEscape.text(String(v==null?'':v));},
 modes(){const list=State.settings.taPricingModes;return Array.isArray(list)&&list.length?list:this.defaults;},
 active(){return this.modes().filter(m=>m&&m.disabled!==true);},
 validTier(v){return this.active().some(m=>m.id===v);},
 name(id){return this.modes().find(m=>m.id===id)?.name||id;},
 label(id){const name=String(this.name(id)||'').trim();return name.startsWith('سعر ')?name:'سعر '+name;},
 effectiveLabel(accountId,override){return this.label(this.resolve(accountId,override));},
 isBase(id){return this.defaults.some(m=>m.id===id);},
 resolve(accountId,override){
   if(this.validTier(override))return override;
   const a=State.accounts.find(x=>x.id===accountId);
   if(this.validTier(a?.priceTier))return a.priceTier;
   const def=State.settings.defaultPriceTier;return this.validTier(def)?def:'wholesale';
 },
 setModes(next){State.settings.taPricingModes=next;},
 async persist(){const staged=window.TiqanySettingsDraft;if(staged?.isActive?.()){await staged.save('invoices');if(staged.isActive())throw Error('لم يتم حفظ إعدادات الفواتير');}else await StorageEngine.saveState();},
 isLinked(id){
   return (State.invoices||[]).some(i=>{
      if(i.priceTierOverride===id||i.priceTier===id)return true;
      if(!['sale','sale_return'].includes(i.type))return false;
      const acc=State.accounts.find(a=>a.id===i.accountId);
      if(acc?.priceTier===id&&(i.priceTierOverride==='account'||!i.priceTierOverride))return true;
      // Legacy documents often have no effective-tier snapshot. The built-in
      // wholesale/default mode cannot safely be assumed unused.
      return this.isBase(id)&&(i.priceTierOverride==='account'||!i.priceTierOverride);
   });
 },
 open(){
   const rows=this.modes().filter(x=>!x.disabled).map(m=>'<div class="ta-enh-panel ta-enh-row" style="justify-content:space-between"><strong>'+this.esc(m.name)+'</strong>'+
      '<div class="ta-enh-row"><button class="ta-enh-btn ta-enh-teal" onclick="TiqanyPricing152.edit(\''+this.esc(m.id)+'\')">تعديل الاسم</button>'+
      (!this.isBase(m.id)?'<button class="ta-enh-btn ta-enh-indigo" onclick="TiqanyPricing152.openPrices(\''+this.esc(m.id)+'\')">أسعار المواد</button>':'')+
      '<button class="ta-enh-btn ta-enh-gold" onclick="TiqanyPricing152.remove(\''+this.esc(m.id)+'\')">حذف</button></div></div>').join('');
   UI.openModal('<div dir="rtl"><div class="ta-enh-row" style="justify-content:space-between"><h2 class="font-black text-lg">تعديل أنماط التسعير</h2>'+
     '<button class="ta-enh-btn ta-enh-indigo" onclick="TiqanyPricing152.add()">+ إضافة تسعيرة جديدة</button></div>'+
     '<p class="text-xs">كل نمط يحتفظ بمعرّفه التاريخي عند تغيير الاسم. لا يحذف أي نمط مرتبط بعملية سابقة.</p>'+
     '<div class="ta-enh-scroll">'+rows+'</div><button class="ta-enh-btn ta-enh-gold mt-3" onclick="UI.forceCloseModal()">إغلاق</button></div>');
 },
 add(){
   UI.openModal('<div dir="rtl"><h2 class="font-black text-lg">إضافة تسعيرة جديدة</h2><label for="taPricingName">اسم التسعيرة</label>'+
     '<input id="taPricingName" maxlength="40" class="w-full border rounded-xl p-3" placeholder="اسم النمط الجديد">'+
     '<div class="ta-enh-row mt-3"><button class="ta-enh-btn ta-enh-teal" onclick="TiqanyPricing152.saveNew()">حفظ النمط</button>'+
     '<button class="ta-enh-btn ta-enh-gold" onclick="TiqanyPricing152.open()">رجوع</button></div></div>');
 },
 async saveNew(){
   const name=String(document.getElementById('taPricingName')?.value||'').trim();
   if(name.length<2||name.length>40||/[<>]/.test(name))return UI.toast('اسم التسعيرة يجب أن يكون بين حرفين و40 حرفاً','error');
   if(this.active().some(x=>x.name===name))return UI.toast('اسم التسعيرة مستخدم بالفعل','error');
   const prior=State.settings.taPricingModes;
   const next=this.modes().map(x=>({...x}));
   const id='custom_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
   next.push({id,name});
   this.setModes(next);
   try{await this.persist();UI.toast('تمت إضافة نمط التسعير. يمكنك الآن إدخال أسعاره للمواد.','success');this.openPrices(id);}
   catch(e){State.settings.taPricingModes=prior;UI.toast('فشل الحفظ: '+e.message,'error');}
 },
 edit(id){
   const m=this.active().find(m=>m.id===id);if(!m)return;
   UI.openModal('<div dir="rtl"><h2 class="font-black text-lg">تعديل اسم نمط التسعير</h2><label>الاسم الجديد</label>'+
     '<input id="taPricingRename" class="w-full p-3 border rounded-xl" maxlength="40" value="'+this.esc(m.name)+'">'+
     '<div class="ta-enh-row mt-3"><button class="ta-enh-btn ta-enh-teal" onclick="TiqanyPricing152.saveRename(\''+this.esc(id)+'\')">حفظ الاسم</button>'+
     '<button class="ta-enh-btn ta-enh-gold" onclick="TiqanyPricing152.open()">رجوع</button></div></div>');
 },
 async saveRename(id){
   const name=String(document.getElementById('taPricingRename')?.value||'').trim();
   if(name.length<2||name.length>40||/[<>]/.test(name)||this.active().some(x=>x.name===name&&x.id!==id))return UI.toast('اسم غير صالح أو مكرر','error');
   const prior=State.settings.taPricingModes;
   this.setModes(this.modes().map(m=>m.id===id?{...m,name}:{...m}));
   try{await this.persist();UI.toast('تم تعديل الاسم دون المساس بأسعار أو فواتير سابقة','success');this.open();}
   catch(e){State.settings.taPricingModes=prior;UI.toast('تعذر حفظ الاسم: '+e.message,'error');}
 },
 remove(id){
   if(!this.validTier(id))return;
   if(this.isLinked(id))return UI.toast('لا يمكن حذف التسعيرة: توجد عمليات سابقة مرتبطة بها','warn');
   UI.showDeleteConfirm('حذف نمط التسعير','سيتم إخفاء هذا النمط من الفواتير المستقبلية دون المساس بالسجلات القديمة، هل تريد المتابعة؟',()=>this.commitRemove(id));
 },
 async commitRemove(id){
   if(this.isLinked(id))return UI.toast('تم منع الحذف لوجود حركة مرتبطة','error');
   const oldModes=State.settings.taPricingModes,oldDefault=State.settings.defaultPriceTier,oldPos=State.settings.posPriceTier;
   const priorAccounts=State.accounts.map(a=>({id:a.id,tier:a.priceTier}));
   const next=this.modes().map(m=>m.id===id?{...m,disabled:true}:{...m});
   if(!next.some(m=>m.id==='wholesale'&&!m.disabled)&&!next.some(m=>m.id==='center'&&!m.disabled)&&!next.some(m=>m.id==='consumer'&&!m.disabled))
     return UI.toast('يجب الاحتفاظ بنمط بيع واحد على الأقل','error');
   this.setModes(next);
   if(State.settings.defaultPriceTier===id)State.settings.defaultPriceTier=this.validTier('wholesale')?'wholesale':this.active()[0].id;
   if(State.settings.posPriceTier===id)State.settings.posPriceTier='account';
   for(const a of State.accounts)if(a.priceTier===id)a.priceTier='settings';
   try{await this.persist();UI.forceCloseModal();UI.toast('تم إخفاء التسعيرة غير المستخدمة','success');this.open();}
   catch(e){State.settings.taPricingModes=oldModes;State.settings.defaultPriceTier=oldDefault;State.settings.posPriceTier=oldPos;for(const x of priorAccounts){const a=State.accounts.find(a=>a.id===x.id);if(a)a.priceTier=x.tier;}UI.toast('تعذر الحفظ: '+e.message,'error');}
 },
 openPrices(id){
   const m=this.active().find(x=>x.id===id);if(!m||this.isBase(id))return;
   const rows=[];
   for(const item of State.items||[])for(const unit of item.units||[])
     rows.push('<tr><td>'+this.esc(item.name)+'</td><td>'+this.esc(unit.name)+'</td><td>'+this.esc(item.currency||'USD')+'</td>'+
      '<td><input type="number" min="0" step="any" data-ta-tier-price="'+this.esc(id)+'" data-item-id="'+this.esc(item.id)+'" data-unit-name="'+this.esc(unit.name)+'" value="'+this.esc(unit.customTierPrices?.[id]??unit.wholesalePrice??unit.salePrice??0)+'"></td></tr>');
   UI.openModal('<div dir="rtl"><h2 class="font-black text-lg">أسعار نمط '+this.esc(m.name)+'</h2>'+
     '<p class="text-xs">الأسعار بعملة المادة لكل وحدة، ولا تؤثر على الفواتير المحفوظة.</p>'+
     '<div class="ta-enh-scroll"><table class="ta-enh-table"><thead><tr><th>المادة</th><th>الوحدة</th><th>العملة</th><th>السعر</th></tr></thead><tbody>'+rows.join('')+'</tbody></table></div>'+
     '<div class="ta-enh-row mt-3"><button class="ta-enh-btn ta-enh-teal" onclick="TiqanyPricing152.savePrices(\''+this.esc(id)+'\')">حفظ أسعار النمط</button>'+
     '<button class="ta-enh-btn ta-enh-gold" onclick="TiqanyPricing152.open()">رجوع</button></div></div>');
 },
 async savePrices(id){
   if(!this.validTier(id)||this.isBase(id))return;
   const updates=[],elements=Array.from(document.querySelectorAll('[data-ta-tier-price]'));
   for(const el of elements){
     if(el.dataset.taTierPrice!==id)continue;
     const item=State.items.find(i=>i.id===el.dataset.itemId);
     const unit=item?.units?.find(u=>u.name===el.dataset.unitName);
     const value=Number(el.value);
     if(!unit||el.value===''||!Number.isFinite(value)||value<0||value>1e15)return UI.toast('أدخل أسعاراً صحيحة غير سالبة','error');
     updates.push({unit,old:unit.customTierPrices?{...unit.customTierPrices}:undefined,value});
   }
   for(const u of updates)u.unit.customTierPrices={...(u.unit.customTierPrices||{}),[id]:u.value};
   try{await this.persist();UI.toast('تم حفظ أسعار النمط الجديد','success');this.open();}
   catch(e){for(const u of updates){if(u.old)u.unit.customTierPrices=u.old;else delete u.unit.customTierPrices;}UI.toast('تعذر حفظ الأسعار: '+e.message,'error');}
 },
 fill(select,selected,includeAccount){
   if(!select)return;
   const options=(includeAccount?'<option value="account" '+(selected==='account'?'selected':'')+'>حسب إعدادات الحساب</option>':'')+
     this.active().map(m=>'<option value="'+this.esc(m.id)+'" '+(selected===m.id?'selected':'')+'>'+this.esc(m.name)+'</option>').join('');
   select.innerHTML=options;
 },
 decorateSettings(){
   const section=document.querySelector('details[data-settings-section="invoices"] .settings-section-body');
   if(section&&!section.querySelector('#taPriceModesButton')){
     const foot=section.querySelector('.ta-settings-section-footer');
     const html='<div class="ta-enh-panel"><button id="taPriceModesButton" type="button" class="ta-enh-btn ta-enh-indigo" onclick="TiqanyPricing152.open()"><i class="fas fa-tags"></i> تعديل أنماط التسعير</button>'+
       '<p class="text-xs">تحرير أسماء الجملة والمركز والمستهلك والتكلفة وإضافة تسعيرة خاصة لكل مادة ووحدة.</p></div>';
     if(foot)foot.insertAdjacentHTML('beforebegin',html);else section.insertAdjacentHTML('beforeend',html);
   }
   this.fill(document.getElementById('setDefaultPriceTier'),this.resolve('',State.settings.defaultPriceTier),false);
   this.fill(document.getElementById('posTierSetting'),this.validTier(State.settings.posPriceTier)?State.settings.posPriceTier:'account',true);
 },
 install(){
   const oldTier=Accounting.invoicePricingTier;
   Accounting.invoicePricingTier=function(accountId,override){
     const id=P.resolve(accountId,override);
     return P.validTier(id)?id:oldTier.call(this,accountId,override);
   };
   const oldItemPrice=Accounting.itemSalePrice;
   Accounting.itemSalePrice=function(item,unit,accountId,override){
     const tier=P.resolve(accountId,override);
     if(tier==='cost')return Accounting.itemCostPrice(item,unit);
     if(!P.isBase(tier)&&P.validTier(tier))return Number(unit?.customTierPrices?.[tier]??unit?.wholesalePrice??unit?.salePrice)||0;
     return oldItemPrice.call(this,item,unit,accountId,tier);
   };
   const oldSettings=Views.renderSettings;
   Views.renderSettings=function(main,...args){const out=oldSettings.call(this,main,...args);P.decorateSettings();return out;};
   const oldAccount=AccountController.openAccountModal;
   AccountController.openAccountModal=function(id,...args){
     const out=oldAccount.call(this,id,...args);
     const account=State.accounts.find(a=>a.id===id);
     const s=document.getElementById('accPriceTier');
     if(s)P.fill(s,P.validTier(account?.priceTier)?account.priceTier:'settings',true);
     if(s&&(!account||account.priceTier==='settings')){s.options[0].textContent='حسب الإعدادات (الافتراضي)';s.options[0].value='settings';s.value='settings';}
     return out;
   };
   const oldSaveAcc=AccountController.saveAccount;
   AccountController.saveAccount=function(...args){return oldSaveAcc.apply(this,args);};
   const oldChange=InvoiceController.changeInvoicePricingTier;
   InvoiceController.changeInvoicePricingTier=function(tier){
     if(['account','wholesale','center','consumer'].includes(tier))return oldChange.call(this,tier);
     if(!P.validTier(tier))return;
     const d=this.draft;if(!d)return;
     d.priceTierOverride=tier;
     if(['sale','sale_return'].includes(d.type)){
       for(const row of d.rows||[]){
         if(row.priceManuallySet)continue;
         const item=State.items.find(i=>i.id===row.itemId),unit=item?.units?.find(u=>u.name===row.unitName)||item?.units?.[0];
         if(!item||!unit)continue;
         row.basePrice=Accounting.itemSalePrice(item,unit,d.accountId,tier);
         row.baseCurrency=item.currency;
         row.price=Accounting.convert(row.basePrice,item.currency,d.currency,d.exchangeRate);
       }
     }
     this.markModified();this.recalculate();this.paintForm(document.getElementById('mainContent'));
   };
   const oldPaint=InvoiceController.paintForm;
   InvoiceController.paintForm=function(main,...args){
     const out=oldPaint.call(this,main,...args),s=document.getElementById('invoicePricingTier');
     if(s){
       const tier=P.validTier(this.draft?.priceTierOverride)?this.draft.priceTierOverride:'account';
       P.fill(s,tier,true);
       const face=s.closest('.ta-quick-picker')?.querySelector('.ta-quick-picker__face span');
       if(face)face.textContent=P.effectiveLabel(this.draft?.accountId,this.draft?.priceTierOverride);
     }
     return out;
   };
   const oldSetDefault=SettingsController.setDefaultPriceTier;
   SettingsController.setDefaultPriceTier=function(tier){
     if(['wholesale','center','consumer'].includes(tier))return oldSetDefault.call(this,tier);
     if(!P.validTier(tier))return;
     State.settings.defaultPriceTier=tier;this.markSettingsDirty?.();
   };
   // Authenticated employee catalog receives the read-only pricing modes and unit prices.
   if(typeof FieldSync!=='undefined'&&typeof FieldSync.catalog==='function'){
     const previousCatalog=FieldSync.catalog;
     FieldSync.catalog=function(...args){
       const catalog=previousCatalog.apply(this,args);
       catalog.taPricingModes=P.active().map(m=>({id:String(m.id),name:String(m.name)}));
       catalog.defaultPriceTier=P.validTier(State.settings.defaultPriceTier)?State.settings.defaultPriceTier:'wholesale';
       for(const item of catalog.items||[]){
         const source=(State.items||[]).find(x=>x.id===item.id);
         for(const unit of item.units||[]){
           const sourceUnit=source?.units?.find(u=>u.name===unit.name);
           if(!sourceUnit)continue;
           unit.customTierPrices=Object.fromEntries(Object.entries(sourceUnit.customTierPrices||{})
             .filter(([id,value])=>P.validTier(id)&&Number.isFinite(Number(value))&&Number(value)>=0)
             .map(([id,value])=>[id,Number(value)]));
           unit.costPrice=Number(sourceUnit.costPrice)||0;
         }
       }
       return catalog;
     };
   }
   if(typeof POSController!=='undefined'){
     POSController.tier=function(){const id=State.settings.posPriceTier;return P.validTier(id)?id:null;};
     POSController.tierLabel=function(){return P.effectiveLabel(State.settings.posAccountId,this.tier()||'account');};
     POSController.saveSettings=async function(){
       const prior={posAccountId:State.settings.posAccountId,posPriceTier:State.settings.posPriceTier,posScanFromHome:State.settings.posScanFromHome,posAutoNextOnFinish:State.settings.posAutoNextOnFinish};
       const acc=document.getElementById('posAccountSetting')?.value||'';
       const tier=document.getElementById('posTierSetting')?.value||'account';
       if(acc&&!State.accounts.some(a=>a.id===acc&&a.type==='customer'))return UI.toast('حساب العميل غير صالح','error');
       if(tier!=='account'&&!P.validTier(tier))return UI.toast('نمط التسعير غير صالح','error');
       State.settings.posAccountId=acc;State.settings.posPriceTier=tier;
       State.settings.posScanFromHome=document.getElementById('posScanFromHomeSetting')?.checked===true;
       State.settings.posAutoNextOnFinish=document.getElementById('posAutoNextSetting')?.checked===true;
       try{await StorageEngine.saveState();UI.toast('تم حفظ ضبط نقطة البيع','success');return true;}
       catch(e){Object.assign(State.settings,prior);UI.toast('تعذر حفظ الضبط: '+e.message,'error');return false;}
     };
   }
 }
};
window.TiqanyPricing152=P;P.install();
})();