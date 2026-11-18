/* Tiqany Acc manager/solo extension based on production 3.5.152.
 * No employee app changes. Opening records are projections, not purchase invoices.
 */
(function(){
'use strict';
if(typeof State==='undefined'||typeof Views==='undefined'||typeof Accounting==='undefined'||typeof InvoiceController==='undefined')return;
const E={
 esc(v){return AppEscape.text(String(v==null?'':v));},
 money(v,c){return Accounting.format(Number(v)||0,c);},
 unitChoices(){return Array.from(new Set((State.items||[]).flatMap(item=>(item.units||[]).map(u=>String(u.name||'').trim())).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ar'));},
 chosen(item,type){
   const isBuy=['purchase','purchase_return'].includes(type);
   const key=isBuy?'taDefaultPurchaseUnitName':'taDefaultSaleUnitName';
   const selected=String(State.settings[key]||'__first__');
   const units=item?.units||[];
   return (selected==='__first__'?null:units.find(u=>u.name===selected))||units[0]||null;
 },
 css(){
   const e=document.createElement('style');
   e.textContent='.ta-enh-btn{display:inline-flex;gap:8px;align-items:center;justify-content:center;min-height:42px;padding:10px 14px;border-radius:13px;color:#fff!important;font-size:13px;font-weight:900;text-shadow:0 1px 2px #132b44;box-shadow:inset 0 2px 2px #ffffff55,0 5px 0 #172c46,0 9px 15px #102d4d36;border:1px solid #ffffff60;background:linear-gradient(155deg,#2374ce,#144d9f 60%,#073371)}.ta-enh-indigo{background:linear-gradient(150deg,#7567db,#473296 70%,#312466);box-shadow:inset 0 2px 2px #ffffff55,0 5px 0 #28195e,0 9px 15px #17104735}.ta-enh-teal{background:linear-gradient(150deg,#198f96,#0a596e 75%,#084255);box-shadow:inset 0 2px 2px #ffffff55,0 5px 0 #053a47,0 9px 15px #102d4d36}.ta-enh-gold{background:linear-gradient(150deg,#b77b26,#795013 75%,#563208);box-shadow:inset 0 2px 2px #ffffff55,0 5px 0 #563208,0 9px 15px #102d4d36}.ta-enh-panel{background:#f8fbff;border:1px solid #c8d8eb;border-radius:14px;padding:12px;margin:10px 0}.ta-enh-panel label{font-weight:800;font-size:12px;color:#172d4b;display:block;margin:4px 0}.ta-enh-panel select,.ta-enh-panel input{background:#fff;border:1px solid #b3c9df;border-radius:9px;padding:8px;max-width:100%;min-height:36px}.ta-enh-table{width:100%;border-collapse:collapse;text-align:right;font-size:12px}.ta-enh-table th,.ta-enh-table td{padding:7px 5px;border:1px solid #bfd3e5;vertical-align:middle}.ta-enh-table thead{background:#143d71;color:#fff}.ta-enh-table input{width:90px;max-width:100%;border:1px solid #bcd1e4;border-radius:7px;padding:5px;font-size:13px}.ta-enh-scroll{max-height:53vh;overflow:auto}.ta-enh-balance{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:10px 0}.ta-enh-balance>div{background:#eef5ff;border:1px solid #b6d6f1;border-radius:12px;padding:9px;font-size:12px;font-weight:800}.ta-enh-balance b{display:block;color:#093c7d;margin-top:4px}.pos-line-label .ta-pos-unit-change{margin-inline:8px;padding:4px 6px;border-radius:8px;background:#fff;border:1px solid #1381ae;color:#0c3654;font-weight:800;min-width:72px}.ta-enh-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.receipt-paper .ta-enh-print-grid th,.receipt-paper .ta-enh-print-grid td{border:1px solid #333!important;padding:4px!important;overflow-wrap:anywhere}';
   document.head.appendChild(e);
 },
 settings(){
   const section=document.querySelector('details[data-settings-section="invoices"] .settings-section-body');
   if(section&&!section.querySelector('#taDefaultSaleUnitName')){
     const names=this.unitChoices();
     const html='<div class="ta-enh-panel"><h3 class="font-black text-sm">الوحدة الافتراضية للفواتير</h3>'+
       ['sale','purchase'].map(type=>{
         const key=type==='sale'?'taDefaultSaleUnitName':'taDefaultPurchaseUnitName';
         const title=type==='sale'?'الوحدة الافتراضية لفواتير المبيعات':'الوحدة الافتراضية لفواتير المشتريات';
         const selected=String(State.settings[key]||'__first__');
         const options=[{name:'__first__',label:'وحدة المادة الأساسية'}].concat(names.map(x=>({name:x,label:x})));
         return '<label for="'+key+'">'+title+'</label><select id="'+key+'" onchange="TiqanyManager152.setUnitDefault(\''+key+'\',this.value)">'+
            options.map(u=>'<option value="'+this.esc(u.name)+'" '+(u.name===selected?'selected':'')+'>'+this.esc(u.label)+'</option>').join('')+
           '</select>';
       }).join('')+
       '<p class="text-[11px] text-slate-600">تُطبق الوحدة المختارة بالاسم على المادة التي تحتويها. عند عدم توفرها تُستخدم الوحدة الأساسية للمادة. لا تتغير الفواتير السابقة.</p></div>';
     const foot=section.querySelector('.ta-settings-section-footer');
     if(foot)foot.insertAdjacentHTML('beforebegin',html);else section.insertAdjacentHTML('beforeend',html);
   }
 },
 setUnitDefault(key,value){
   if(!['taDefaultSaleUnitName','taDefaultPurchaseUnitName'].includes(key))return;
   const selected=String(value||'__first__');
   if(selected!=='__first__'&&!this.unitChoices().includes(selected))return;
   State.settings[key]=selected;
   SettingsController.markSettingsDirty?.();
 },
 openingStats(){
   const total={debit:{SYP:0,USD:0},credit:{SYP:0,USD:0}};
   for(const a of State.accounts||[]){
     for(const [field,c] of [['openingSyp','SYP'],['openingUsd','USD']]){
       const v=Number(a[field])||0, signed=a.type==='supplier'?-v:v;
       if(signed>0)total.debit[c]+=signed;
       else total.credit[c]+=-signed;
     }
   }
   return total;
 },
 accountCards(){
   const s=this.openingStats();
   return '<div class="ta-enh-balance" aria-label="أرصدة أول المدة">'+
     '<div>إجمالي مدين أول المدة<b>'+this.money(s.debit.SYP,'SYP')+'</b><b>'+this.money(s.debit.USD,'USD')+'</b></div>'+
     '<div>إجمالي دائن أول المدة<b>'+this.money(s.credit.SYP,'SYP')+'</b><b>'+this.money(s.credit.USD,'USD')+'</b></div></div>';
 },
 addAccountControls(main){
   if(!main||main.querySelector('#taOpeningBalancesActions'))return;
   const button=Array.from(main.querySelectorAll('button')).find(x=>x.textContent.includes('إضافة عميل/مورد'));
   if(!button)return;
   button.insertAdjacentHTML('afterend','<button id="taOpeningBalancesActions" type="button" class="ta-enh-btn ta-enh-indigo" onclick="TiqanyManager152.openOpening()"><i class="fas fa-scale-balanced"></i> رصيد أول المدة</button>');
   const top=button.parentElement;
   top?.insertAdjacentHTML('beforebegin',this.accountCards());
 },
 openOpening(){
   UI.openModal('<div dir="rtl" class="space-y-3"><h2 class="text-lg font-black">رصيد أول المدة</h2>'+
     '<div class="ta-enh-row"><button type="button" class="ta-enh-btn ta-enh-teal" onclick="TiqanyManager152.openStock()"><i class="fas fa-boxes-stacked"></i> جرد أول المدة</button>'+
     '<button type="button" class="ta-enh-btn ta-enh-indigo" onclick="TiqanyManager152.openAccountsOpening(\'all\')"><i class="fas fa-users"></i> أرصدة حسابات أول المدة</button></div>'+
     '<p class="text-xs text-slate-600">الأرصدة الافتتاحية ليست فواتير شراء أو إيرادات، ولا تُسجّل مرتين.</p>'+
     '<button class="ta-enh-btn ta-enh-gold" onclick="UI.forceCloseModal()">إغلاق</button></div>');
 },
 openAccountsOpening(kind){
   const filter=['all','customer','supplier'].includes(kind)?kind:'all';
   const accounts=(State.accounts||[]).filter(a=>(filter==='all'||a.type===filter)&&((Number(a.openingSyp)||0)!==0||(Number(a.openingUsd)||0)!==0));
   const tabs=['all','customer','supplier'].map((x,i)=>'<button class="ta-enh-btn '+(x===filter?'ta-enh-indigo':'ta-enh-teal')+'" onclick="TiqanyManager152.openAccountsOpening(\''+x+'\')">'+['الكل','الزبائن','الموردون'][i]+'</button>').join('');
   const rows=accounts.map(a=>{const syp=(a.type==='supplier'?-1:1)*(Number(a.openingSyp)||0);
       const usd=(a.type==='supplier'?-1:1)*(Number(a.openingUsd)||0);
       return '<tr><td>'+this.esc(a.name)+'</td><td>'+this.esc(a.type==='supplier'?'مورد':'عميل')+'</td>'+
         '<td dir="ltr">'+this.esc(syp)+'</td><td dir="ltr">'+this.esc(usd)+'</td></tr>';}).join('');
   UI.openModal('<div dir="rtl"><h2 class="font-black text-lg">أرصدة حسابات أول المدة</h2><div class="ta-enh-row my-3">'+tabs+'</div>'+
     '<div class="ta-enh-scroll"><table class="ta-enh-table"><thead><tr><th>الحساب</th><th>النوع</th><th>رصيد ل.س (موجب: مدين)</th><th>رصيد USD (موجب: مدين)</th></tr></thead><tbody>'+
     (rows||'<tr><td colspan="4">لا توجد حسابات لها أرصدة افتتاحية</td></tr>')+'</tbody></table></div>'+
     this.accountCards()+'<p class="text-xs">تُعدّل الأرصدة من بطاقة العميل أو المورد؛ الدائن سالب والمدين موجب، مع مراعاة نوع الحساب.</p>'+
     '<button class="ta-enh-btn ta-enh-gold mt-3" onclick="TiqanyManager152.openOpening()">رجوع</button></div>');
 },
 stockTotals(){
   const totals={};
   for(const item of State.items||[]){
     const qty=Number(item.openingStockBase)||0;
     if(qty===0)continue;
     const c=item.currency||'USD';
     totals[c]=(totals[c]||0)+qty*(Number(item.units?.[0]?.costPrice)||0);
   }
   return totals;
 },
 openStock(){
   const items=(State.items||[]).filter(i=>!i.isBundle&&(Number(i.openingStockBase)||0)!==0);
   const rows=items.map(i=>{
     const unit=i.units?.[0]||{}, linked=(State.invoices||[]).some(doc=>(doc.rows||[]).some(r=>r.itemId===i.id||(r.bomComponents||[]).some(p=>p.itemId===i.id)));
     return '<tr data-opening-row="'+this.esc(i.id)+'"><td>'+this.esc(i.name)+'</td><td>'+this.esc(unit.name||'وحدة')+'</td>'+
       '<td><input aria-label="كمية '+this.esc(i.name)+'" data-stock-id="'+this.esc(i.id)+'" type="number" min="0" step="any" value="'+this.esc(i.openingStockBase)+'" oninput="TiqanyManager152.refreshStockPreview()"></td>'+
       '<td><input aria-label="تكلفة '+this.esc(i.name)+'" data-cost-id="'+this.esc(i.id)+'" type="number" min="0" step="any" value="'+this.esc(unit.costPrice||0)+'" '+(linked?'disabled title="محمي لوجود عمليات سابقة"':'')+' oninput="TiqanyManager152.refreshStockPreview()"></td><td>'+this.esc(i.currency||'USD')+'</td></tr>';
   }).join('');
   UI.openModal('<div dir="rtl"><h2 class="font-black text-lg">فاتورة جرد أول المدة</h2>'+
     '<p class="text-xs text-slate-600">تُقرأ الكميات من الرصيد الافتتاحي للمواد؛ تعديلها لا يُنشئ حركة شراء جديدة. تكلفة المواد المستخدمة في عمليات سابقة محمية من تغييرها بأثر رجعي.</p>'+
     '<div class="ta-enh-scroll"><table class="ta-enh-table"><thead><tr><th>المادة</th><th>الوحدة</th><th>الكمية</th><th>التكلفة</th><th>العملة</th></tr></thead><tbody>'+
     (rows||'<tr><td colspan="5">لا توجد مواد برصيد افتتاحي بعد</td></tr>')+'</tbody></table></div>'+
     '<div id="taStockPreview" class="ta-enh-panel"></div>'+
     '<div class="ta-enh-row"><button class="ta-enh-btn ta-enh-teal" onclick="TiqanyManager152.saveStock()">حفظ جرد أول المدة</button>'+
     '<button class="ta-enh-btn ta-enh-gold" onclick="TiqanyManager152.openOpening()">رجوع</button></div></div>');
   this.refreshStockPreview();
 },
 refreshStockPreview(){
   const el=document.getElementById('taStockPreview');if(!el)return;
   const count=el.parentNode.querySelectorAll('[data-stock-id]').length;
   const total={};
   el.parentNode.querySelectorAll('[data-stock-id]').forEach(q=>{
     const id=q.dataset.stockId, item=State.items.find(i=>i.id===id);if(!item)return;
     const curr=item.currency||'USD';
     const cost=el.parentNode.querySelector('[data-cost-id="'+CSS.escape(id)+'"]');
     total[curr]=(total[curr]||0)+(Number(q.value)||0)*(Number(cost?.value)||0);
   });
   el.innerHTML='<b>إجمالي المواد: '+count+'</b><div class="ta-enh-row">'+Object.entries(total).map(([c,v])=>'<span>إجمالي التكلفة '+this.esc(c)+': <strong>'+this.money(v,c)+'</strong></span>').join(' | ')+'</div>';
 },
 async saveStock(){
   const nodes=Array.from(document.querySelectorAll('[data-stock-id]')),changes=[];
   for(const node of nodes){
     const item=State.items.find(i=>i.id===node.dataset.stockId);if(!item)continue;
     const rawQty=node.value, costNode=document.querySelector('[data-cost-id="'+CSS.escape(item.id)+'"]');
     const qty=Number(rawQty),cost=Number(costNode?.value);
     if(rawQty===''||!Number.isFinite(qty)||qty<0||!Number.isFinite(cost)||cost<0)return UI.toast('أدخل كميات وتكاليف غير سالبة وصحيحة','error');
     const linked=State.invoices.some(inv=>(inv.rows||[]).some(row=>row.itemId===item.id||(row.bomComponents||[]).some(p=>p.itemId===item.id)));
     if(linked&&Math.abs(cost-(Number(item.units?.[0]?.costPrice)||0))>0.000001)return UI.toast('لا يمكن تعديل التكلفة التاريخية للمادة '+item.name,'error');
     const now=Accounting.getItemBaseStock(item.id,null,'wh_main');
     if(State.settings.allowNegativeStockSales!==true&&now+(qty-(Number(item.openingStockBase)||0))<-0.000001)return UI.toast('تعديل رصيد '+item.name+' يؤدي إلى مخزون سالب','error');
     changes.push({item,qty,cost,oldQty:item.openingStockBase,oldCost:item.units?.[0]?.costPrice});
   }
   for(const x of changes){x.item.openingStockBase=x.qty;if(x.item.units?.[0])x.item.units[0].costPrice=x.cost;}
   try{await StorageEngine.saveState();UI.forceCloseModal();AppNav.renderCurrent();UI.toast('تم حفظ الأرصدة الافتتاحية دون تكرار قيد شراء','success');}
   catch(err){for(const x of changes){x.item.openingStockBase=x.oldQty;if(x.item.units?.[0])x.item.units[0].costPrice=x.oldCost;}UI.toast('تعذر حفظ الجرد: '+err.message,'error');}
 },
 movement(itemId,warehouse){
   const item=State.items.find(i=>i.id===itemId);if(!item)return null;
   const wh=warehouse||'all',all=wh==='all', isMain=wh==='wh_main',entries=[];
   const open=Number(item.openingStockBase)||0;
   if(open&&(all||isMain))entries.push({date:'0000-01-01',desc:'رصيد أول المدة',inQty:open,outQty:0,id:'opening'});
   for(const doc of State.invoices||[]){
     if(!all&&(doc.warehouseId||'wh_main')!==wh)continue;
     const sign=['purchase','sale_return'].includes(doc.type)?1:['sale','purchase_return'].includes(doc.type)?-1:0;
     if(!sign)continue;
     let qty=0;
     for(const r of doc.rows||[]){
       if(r.itemId===item.id)qty+=(Number(r.qty)||0)/(Number(r.unitFactor)||1);
       else{
         const kit=State.items.find(i=>i.id===r.itemId);
         const parts=Array.isArray(r.bomComponents)?r.bomComponents:(kit?.isBundle?kit.bundleComponents:[]);
         if(['sale','sale_return'].includes(doc.type))for(const p of parts||[])if(p.itemId===item.id)qty+=(Number(r.qty)||0)/(Number(r.unitFactor)||1)*(Number(p.quantity)||0);
       }
     }
     if(qty)entries.push({date:doc.date||'',desc:'فاتورة '+Accounting.getInvoiceTypeAr(doc.type)+' #'+doc.number,inQty:sign>0?qty:0,outQty:sign<0?qty:0,id:doc.id,invoice:true});
   }
   if(!all)for(const tr of State.transfers||[]){
     if(tr.itemId!==item.id)continue;
     const qty=Number(tr.quantityBase)||0;
     if(tr.toWarehouseId===wh)entries.push({date:tr.date||'',desc:'مناقلة واردة '+WarehouseController.name(tr.fromWarehouseId),inQty:qty,outQty:0,id:tr.id});
     if(tr.fromWarehouseId===wh)entries.push({date:tr.date||'',desc:'مناقلة صادرة '+WarehouseController.name(tr.toWarehouseId),inQty:0,outQty:qty,id:tr.id});
   }
   entries.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id)));
   let running=0,totalIn=0,totalOut=0;for(const x of entries){running+=x.inQty-x.outQty;totalIn+=x.inQty;totalOut+=x.outQty;x.balance=running;}
   return {item,entries,totalIn,totalOut,actual:Accounting.getItemBaseStock(item.id,null,all?null:wh)};
 },
 openMovement(itemId,warehouse){
   const current=itemId||State.items[0]?.id||'',wh=warehouse||State.settings.selectedWarehouseId||'wh_main';
   const data=this.movement(current,wh);
   const itemSelect=(State.items||[]).map(i=>'<option value="'+this.esc(i.id)+'" '+(current===i.id?'selected':'')+'>'+this.esc(i.name)+'</option>').join('');
   const warehouseSelect='<option value="all" '+(wh==='all'?'selected':'')+'>جميع المستودعات</option>'+
      (State.warehouses||[]).map(w=>'<option value="'+this.esc(w.id)+'" '+(wh===w.id?'selected':'')+'>'+this.esc(w.name)+'</option>').join('');
   const rows=(data?.entries||[]).map((e,i)=>'<tr><td>'+this.esc(e.date.replace('T',' '))+'</td><td>'+this.esc(e.desc)+'</td>'+
     '<td>'+Accounting.formatItemQuantity(e.inQty)+'</td><td>'+Accounting.formatItemQuantity(e.outQty)+'</td><td>'+Accounting.formatItemQuantity(e.balance)+'</td></tr>').join('');
   UI.openModal('<div dir="rtl"><h2 class="text-lg font-black">حركة مادة</h2>'+
     '<div class="ta-enh-panel"><label>المادة</label><select id="taMovementItem" onchange="TiqanyManager152.reloadMovement()">'+itemSelect+'</select>'+
     '<label>المستودع</label><select id="taMovementWarehouse" onchange="TiqanyManager152.reloadMovement()">'+warehouseSelect+'</select></div>'+
     '<div class="ta-enh-balance"><div>إجمالي الوارد<b>'+Accounting.formatItemQuantity(data?.totalIn||0)+'</b></div><div>إجمالي الصادر<b>'+Accounting.formatItemQuantity(data?.totalOut||0)+'</b></div>'+
     '<div>الرصيد الحالي<b>'+Accounting.formatItemQuantity(data?.actual||0)+'</b></div><div>عدد الحركات<b>'+(data?.entries.length||0)+'</b></div></div>'+
     '<div class="ta-enh-scroll"><table class="ta-enh-table"><thead><tr><th>التاريخ</th><th>العملية</th><th>وارد</th><th>صادر</th><th>الرصيد</th></tr></thead><tbody>'+
     (rows||'<tr><td colspan="5">لا توجد حركة لهذه المادة</td></tr>')+'</tbody></table></div>'+
     '<button class="ta-enh-btn ta-enh-gold mt-3" onclick="UI.forceCloseModal()">إغلاق</button></div>');
 },
 reloadMovement(){this.openMovement(document.getElementById('taMovementItem')?.value,document.getElementById('taMovementWarehouse')?.value);},
 changePosUnit(index,unitName){
   const d=InvoiceController.draft,row=d?.rows?.[index],item=State.items.find(i=>i.id===row?.itemId),unit=item?.units?.find(u=>u.name===unitName);
   if(!row||!unit||!POSController.canChange())return;
   row.unitName=unit.name;row.unitFactor=Number(unit.factor)||1;
   row.baseCostPrice=Accounting.itemCostPrice(item,unit);
   row.baseCurrency=item.currency;
   row.basePrice=Accounting.itemSalePrice(item,unit,d.accountId,POSController.tier());
   row.price=Accounting.convert(row.basePrice,item.currency,d.currency,d.exchangeRate);
   row.priceManuallySet=false;
   POSController.mark();InvoiceController.recalculate();POSController.paint(document.getElementById('mainContent'));
 },
 enhancePOS(main){
   if(!main)return;
   const rows=main.querySelectorAll('.pos-cart-rows .pos-line');
   rows.forEach((node,index)=>{
     const row=InvoiceController.draft?.rows?.[index],item=State.items.find(i=>i.id===row?.itemId);
     if(!row||!item||!item.units?.length)return;
     const label=node.querySelector('.pos-line-label');
     if(!label||label.querySelector('.ta-pos-unit-change'))return;
     const select='<select class="ta-pos-unit-change" aria-label="تبديل وحدة '+this.esc(row.itemName)+'" '+(POSController.readOnly?'disabled':'')+
       ' onchange="TiqanyManager152.changePosUnit('+index+',this.value)">'+item.units.map(u=>'<option value="'+this.esc(u.name)+'" '+(u.name===row.unitName?'selected':'')+'>'+this.esc(u.name)+'</option>').join('')+'</select>';
     label.insertAdjacentHTML('beforeend',select);
   });
 },
 install(){
   this.css();
   const oldAccounts=Views.renderAccounts;Views.renderAccounts=function(main,...args){const out=oldAccounts.call(this,main,...args);E.addAccountControls(main);return out;};
   const oldItems=Views.renderItems;Views.renderItems=function(main,...args){const out=oldItems.call(this,main,...args);const t=main.querySelector('.ta-items-toolbar');if(t&&!t.querySelector('#taMovementAction'))t.insertAdjacentHTML('beforeend','<button id="taMovementAction" class="ta-enh-btn ta-enh-teal" onclick="TiqanyManager152.openMovement()"><i class="fas fa-arrows-spin"></i> حركة مادة</button>');return out;};
   const oldSettings=Views.renderSettings;Views.renderSettings=function(main,...args){const out=oldSettings.call(this,main,...args);E.settings();return out;};
   const oldAdd=InvoiceController.addItemToInvoice;InvoiceController.addItemToInvoice=function(itemId,repaint=true){
      const item=State.items.find(i=>i.id===itemId),d=this.draft,unit=E.chosen(item,d?.type);
      if(!d||!unit||unit.name===(item.units?.[0]?.name))return oldAdd.call(this,itemId,repaint);
      const matching=d.rows.find(r=>r.itemId===itemId&&r.unitName===unit.name);
      if(matching){matching.qty=(Number(matching.qty)||0)+1;if(repaint){this.markModified();this.recalculate();this.paintForm(document.getElementById('mainContent'));}return;}
      const start=d.rows.length,baseRow=d.rows.find(r=>r.itemId===itemId&&r.unitName===item.units[0].name);
      if(baseRow){
         const clone={...baseRow,rowId:'r_'+Date.now()+'_'+Math.random().toString(36).slice(2),qty:1,discount:0,priceManuallySet:false};
         d.rows.push(clone);
      }else oldAdd.call(this,itemId,false);
      const row=d.rows[d.rows.length-1];if(!row)return;
      row.unitName=unit.name;row.unitFactor=Number(unit.factor)||1;
      row.baseCostPrice=Accounting.itemCostPrice(item,unit);
      const buy=['purchase','purchase_return'].includes(d.type);
      row.basePrice=buy?Number(unit.costPrice)||0:Accounting.itemSalePrice(item,unit,d.accountId,d.priceTierOverride);
      row.baseCurrency=item.currency;row.price=Accounting.convert(row.basePrice,item.currency,d.currency,d.exchangeRate);
      if(repaint){this.markModified();this.recalculate();this.paintForm(document.getElementById('mainContent'));}
   };
   if(typeof POSController!=='undefined'){
     const oldAddPos=POSController.add;POSController.add=function(itemId){
       if(!E.chosen(State.items.find(i=>i.id===itemId),'sale'))return oldAddPos.call(this,itemId);
       if(!this.canChange())return false;
       const d=InvoiceController.draft,item=State.items.find(i=>i.id===itemId),u=E.chosen(item,'sale');
       const existing=d.rows.find(r=>r.itemId===itemId&&r.unitName===u.name);
       if(existing)existing.qty=(Number(existing.qty)||0)+1;
       else InvoiceController.addItemToInvoice(itemId,false);
       const row=d.rows.find(r=>r.itemId===itemId&&r.unitName===u.name);
       if(!row)return false;
       if(!row.priceManuallySet){row.basePrice=Accounting.itemSalePrice(item,u,d.accountId,this.tier());row.baseCurrency=item.currency;row.price=Accounting.convert(row.basePrice,item.currency,d.currency,d.exchangeRate);}
       this.mark();InvoiceController.recalculate();this.paint(document.getElementById('mainContent'));return true;
     };
     const oldPaint=POSController.paint;POSController.paint=function(main,...args){const out=oldPaint.call(this,main,...args);E.enhancePOS(main);return out;};
   }
   if(typeof ManagerNotifications!=='undefined'&&typeof ManagerNotifications.addSyncNotice==='function'){
     const oldNotice=ManagerNotifications.addSyncNotice;
     const seen=new Map();
     ManagerNotifications.addSyncNotice=function(message,...args){
        const txt=String(message||'');
        const important=/تعارض|إصدار|نسخة غير متوافقة|اختلاف|رفض|صلاحية|مشكلة بيانات|بيانات غير متطابقة|APP_VERSION_MISMATCH|CONFLICT|SECURITY|MISMATCH|corrupt|incompatible/i.test(txt);
        if(!important)return Promise.resolve(null);
        const key=txt.slice(0,180),now=Date.now();
        if(now-(seen.get(key)||0)<3600000)return Promise.resolve(null);
        seen.set(key,now);return oldNotice.call(this,message,...args);
     };
   }
 }
};
window.TiqanyManager152=E;E.install();
})();