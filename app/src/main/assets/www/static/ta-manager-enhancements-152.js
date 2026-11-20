/* Opening inventory is stored on the stock card alongside its opening quantity.
   Cash, purchases and supplier balances therefore never receive a second posting. */
const OpeningInventory = (() => {
    const account = 'حساب أول المدة';
    const esc = value => AppEscape.text(String(value ?? ''));
    const uid = () => 'opening_' + FieldProtocol.uuid();
    const round = value => Math.round(value * 1e8) / 1e8;
    const baseCost = item => Number(item.costBeforePurchases ?? item.units?.[0]?.costPrice) || 0;
    function entries(item) {
        const stored = item.openingEntries || [];
        const remainder = round((Number(item.openingStockBase) || 0) - stored.reduce((n, r) => n + r.qty, 0));
        if (!remainder) return stored;
        // Old stock cards have a quantity but no document number or business timestamp.
        return [...stored, {id:'legacy', date:'', qty:remainder, cost:baseCost(item),
            currency:item.currency, unit:item.units?.[0]?.name || 'وحدة'}];
    }
    function cardChange(old, next) {
        const qty = round(Number(next.openingStockBase) - Number(old?.openingStockBase || 0));
        if (qty) next.openingEntries = [...(old ? entries(old) : []), {id:uid(),date:new Date().toISOString(),
            qty,cost:baseCost(next),currency:next.currency,unit:next.units[0].name}];
        return next;
    }
    function documents() {
        const docs = new Map();
        for (const item of State.items) for (const row of entries(item)) {
            if (!docs.has(row.id)) docs.set(row.id, {id:row.id,date:row.date,rows:[]});
            docs.get(row.id).rows.push({...row,itemId:item.id,name:item.name});
        }
        return [...docs.values()].sort((a,b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    }
    const totals = rows => {
        const amounts = new Map();
        for (const r of rows) amounts.set(r.currency,(amounts.get(r.currency) || 0) + r.qty*r.cost);
        return [...amounts].map(([c,v])=>Accounting.format(v,c)).join(' · ');
    };
    const action = (cmd,icon,title) => '<button type="button" class="ta-enh-btn" data-cmd="'+cmd+'"><i class="fas fa-'+icon+'"></i> '+title+'</button>';
    const dateLabel = date => date ? TiqanyDateView.visible(date) : 'جرد سابق';
    function list(main) {
        UI.setHeader('جرد أول المدة','');
        const docs = documents();
        main.innerHTML = '<section dir="rtl" class="opening-inventory space-y-3">'+action('new','boxes-stacked','إضافة مواد أول المدة')+
            docs.map((doc,i)=>'<button type="button" data-doc="'+i+'" class="w-full text-right bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs">'+
            '<img class="ta-operation-art inline-block" width="36" height="36" src="static/purchase.png" alt=""> <strong>فاتورة جرد أول المدة · '+account+'</strong>'+
            '<div>'+esc(dateLabel(doc.date))+' · '+doc.rows.length+' مواد</div><b>'+esc(totals(doc.rows))+'</b></button>').join('')+
            (docs.length?'':'<p>لا توجد إدخالات جرد أول المدة.</p>')+'</section>';
        main.querySelector('[data-cmd=new]').onclick = () => AppNav.navigate('opening_invoice',{});
        main.querySelectorAll('[data-doc]').forEach(b=>b.onclick=()=>AppNav.navigate('opening_invoice',{id:docs[Number(b.dataset.doc)].id}));
    }
    function editor(main, params) {
        const doc = params.id ? documents().find(x=>x.id===params.id) : null;
        if (params.id && !doc) return list(main);
        const id = doc?.id || uid();
        const original = JSON.stringify(doc?.rows || []);
        const rows = (doc?.rows || []).map(r=>({...r}));
        const items = State.items.filter(i=>!i.isBundle && i.units?.length);
        let busy = false;
        UI.setHeader(doc?'فاتورة جرد أول المدة':'إضافة مواد أول المدة','');
        function changed(){ AppNav.markDirty(()=>commit(false,false)); }
        function paint(){
            main.innerHTML='<section dir="rtl" class="opening-inventory space-y-3"><div class="invoice-entry-top bg-white rounded-2xl border p-3">'+
                '<img class="ta-operation-art inline-block" width="36" height="36" src="static/purchase.png" alt=""> <b>فاتورة جرد أول المدة</b><div>الحساب · '+account+'</div><small>'+
                esc(dateLabel(doc?doc.date:new Date().toISOString()))+'</small></div><div class="ta-invoice-control-grid flex gap-2">'+action('add','table-cells-large','إضافة مادة')+'</div>'+
                '<div class="invoice-added-items">'+rows.map((r,i)=>'<div class="invoice-added-row p-3" data-row="'+i+'"><b class="invoice-row-index">'+(i+1)+'</b> <b>'+
                esc(r.name)+'</b> · '+esc(r.unit)+'<div class="grid grid-cols-2 gap-2"><label>الكمية<input class="w-full" type="number" step="any" data-key="qty" value="'+esc(r.qty)+'"></label>'+
                '<label>تكلفة الوحدة ('+esc(r.currency)+')<input class="w-full" type="number" step="any" min="0" data-key="cost" value="'+esc(r.cost)+'"></label></div>'+
                '<button type="button" style="color:#b91c1c" data-remove="'+i+'" aria-label="حذف المادة"><i class="fas fa-trash"></i> حذف المادة</button></div>').join('')+'</div>'+
                '<div class="ta-enh-panel"><b>إجمالي التكلفة </b><strong data-total>'+esc(totals(rows))+'</strong></div><div class="ta-enh-row">'+
                action('save','floppy-disk','حفظ')+action('cancel','times','إلغاء')+(doc?action('delete','trash','حذف الفاتورة'):'')+'</div></section>';
            main.querySelector('[data-cmd=add]').onclick=()=>InvoiceController.openItemGridModal({
                items, cost:baseCost,
                add(chosen){
                    for(const [itemId,qty] of chosen){
                        const item=items.find(it=>it.id===itemId);
                        const existing=rows.find(r=>r.itemId===itemId);
                        if(existing) existing.qty=Number(existing.qty)+qty;
                        else rows.push({itemId,name:item.name,unit:item.units[0].name,qty,cost:baseCost(item),currency:item.currency});
                    }
                    changed();paint();
                }
            });
            main.querySelectorAll('[data-key]').forEach(input=>input.oninput=()=>{
                rows[Number(input.closest('[data-row]').dataset.row)][input.dataset.key]=input.value===''?'':input.valueAsNumber;
                main.querySelector('[data-total]').textContent=totals(rows);changed();
            });
            main.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{rows.splice(Number(b.dataset.remove),1);changed();paint();});
            main.querySelector('[data-cmd=save]').onclick=()=>commit(false,true);
            main.querySelector('[data-cmd=cancel]').onclick=()=>{AppNav.clearDirty();AppNav.handleBackButton();};
            if(doc)main.querySelector('[data-cmd=delete]').onclick=()=>UI.showDeleteConfirm('حذف فاتورة الجرد','سيُعكس أثر هذه الفاتورة على كميات أول المدة.',()=>commit(true,true));
        }
        async function commit(remove, navigate){
            if(busy)return false;
            const current=documents().find(x=>x.id===id);
            if(JSON.stringify(current?.rows||[])!==original){UI.toast('تغيّر الجرد. افتح الفاتورة من جديد','warn');return false;}
            const selected=remove?[]:rows;
            const invalid=selected.some(r=>!Number.isFinite(r.qty)||r.qty===0||!Number.isFinite(r.cost)||r.cost<0||
                (r.qty<0&&!doc?.rows.some(old=>old.itemId===r.itemId&&old.qty<0)));
            if(!remove&&(!rows.length||invalid)){UI.toast('أدخل مادة وكمية وتكلفة صحيحة','warn');return false;}
            const affected=new Set([...(doc?.rows||[]),...selected].map(r=>r.itemId));
            const updates=new Map(), date=doc?doc.date:new Date().toISOString();
            for(const itemId of affected){
                const item=State.items.find(i=>i.id===itemId), row=selected.find(r=>r.itemId===itemId);
                if(!item||item.isBundle||(row&&(row.currency!==item.currency || row.unit!==item.units?.[0]?.name))){UI.toast('تغيّرت بطاقة المادة. أعد فتح الفاتورة','warn');return false;}
                const lines=entries(item).filter(r=>r.id!==id);
                if(row)lines.push({id,date,qty:row.qty,cost:row.cost,unit:row.unit,currency:row.currency});
                const qty=round(lines.reduce((n,r)=>n+r.qty,0));
                if(qty<0||(State.settings.allowNegativeStockSales!==true&&Accounting.getItemBaseStock(itemId,null,'wh_main')+qty-(Number(item.openingStockBase)||0)<-1e-7)){
                    UI.toast('العملية تجعل مخزون '+item.name+' سالباً','warn');return false;
                }
                const next={...item,openingEntries:lines,openingStockBase:qty};
                const linked=State.invoices.some(inv=>inv.rows?.some(r=>r.itemId===itemId||r.bomComponents?.some(p=>p.itemId===itemId)));
                if(!linked&&qty>0){
                    const cost=round(lines.reduce((n,r)=>n+r.qty*r.cost,0)/qty);
                    next.units=item.units.map(u=>({...u,costPrice:round(cost/(Number(u.factor)||1))}));
                }
                updates.set(itemId,next);
            }
            if(!doc&&!LicenseManager.canPerformOperation())return false;
            const before=State.items, count=State.license.opsUsedCount;
            busy=true; const updated=before.map(it=>updates.get(it.id)||it); State.items=updated;
            try{
                if(doc)await StorageEngine.saveState();else await LicenseManager.recordNewOperation();
                AppNav.clearDirty();if(navigate)AppNav.handleBackButton();UI.toast(remove?'تم حذف فاتورة الجرد':'تم حفظ فاتورة الجرد','success');return true;
            } catch(e){
                if(State.items===updated)State.items=before;
                if(!doc)State.license.opsUsedCount=count;
                UI.toast('تعذر حفظ الجرد','error');return false;
            }finally{busy=false;}
        }
        paint();
    }
    return {entries,cardChange,list,editor};
})();
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
   // All newly introduced action icons use one glossy blue theme, with white labels.
   e.textContent += '.ta-enh-btn,.ta-enh-btn.ta-enh-indigo,.ta-enh-btn.ta-enh-teal,.ta-enh-btn.ta-enh-gold{background-color:#0a4c9a!important;background-image:linear-gradient(155deg,#43a3fa 0%,#2073d1 32%,#0a4c9a 70%,#07356e 100%)!important;color:#fff!important;border:1px solid #7abbfd!important;text-shadow:0 1px 2px #042144!important;box-shadow:inset 0 2px 2px #ffffff69,0 5px 0 #072f65,0 10px 16px #082b6438!important}.ta-enh-btn i{color:#fff!important}.ta-enh-btn:focus-visible{outline:3px solid #86bbff;outline-offset:3px}.pos-line-label .ta-pos-unit-change{background:#1059a6!important;color:#fff!important;border:1px solid #65a4f0!important;box-shadow:inset 0 2px 2px #ffffff45,0 3px 0 #093768!important}.pos-line-label .ta-pos-unit-change option{background:#fff;color:#0b3569}';
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
     const listType=section.querySelector('#setDefaultInvoiceListType')?.parentElement;
     const pos=section.querySelector('#posInvoiceSettings');
     if(listType){
       listType.insertAdjacentHTML('beforebegin',html);
       if(pos)listType.after(pos);
     }else section.insertAdjacentHTML('afterbegin',html);
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
   button.insertAdjacentHTML('afterend','<button id="taOpeningBalancesActions" type="button" class="ta-enh-btn ta-enh-indigo" onclick="TiqanyManager152.openAccountsOpening(\'all\')"><i class="fas fa-users"></i> أرصدة حسابات أول المدة</button>');
   const top=button.parentElement;
   top?.insertAdjacentHTML('beforebegin',this.accountCards());
 },
 openAccountsOpening(kind){
   const filter=['all','customer','supplier'].includes(kind)?kind:'all';
   const accounts=(State.accounts||[]).filter(a=>(filter==='all'||a.type===filter)&&((Number(a.openingSyp)||0)!==0||(Number(a.openingUsd)||0)!==0));
   const tabs=['all','customer','supplier'].map((x,i)=>'<button class="ta-enh-btn '+(x===filter?'ta-enh-indigo':'ta-enh-teal')+'" onclick="TiqanyManager152.openAccountsOpening(\''+x+'\')">'+['الكل','الزبائن','الموردون'][i]+'</button>').join('');
   const rows=accounts.map((a,i)=>{const syp=(a.type==='supplier'?-1:1)*(Number(a.openingSyp)||0);
       const usd=(a.type==='supplier'?-1:1)*(Number(a.openingUsd)||0);
       return '<tr><td>'+this.esc(a.name)+'</td><td>'+this.esc(a.type==='supplier'?'مورد':'عميل')+'</td>'+
         '<td dir="ltr">'+this.esc(syp)+'</td><td dir="ltr">'+this.esc(usd)+'</td><td><button type="button" data-opening-account="'+i+'">تعديل</button> <button type="button" data-clear-account="'+i+'">حذف الرصيد</button></td></tr>';}).join('');
   UI.openModal('<div dir="rtl"><h2 class="font-black text-lg">أرصدة حسابات أول المدة</h2><div class="ta-enh-row my-3">'+tabs+'</div>'+
     '<div class="ta-enh-scroll"><table class="ta-enh-table"><thead><tr><th>الحساب</th><th>النوع</th><th>رصيد ل.س (موجب: مدين)</th><th>رصيد USD (موجب: مدين)</th><th>الخيارات</th></tr></thead><tbody>'+
     (rows||'<tr><td colspan="4">لا توجد حسابات لها أرصدة افتتاحية</td></tr>')+'</tbody></table></div>'+
     this.accountCards()+'<p class="text-xs">تُعدّل الأرصدة من بطاقة العميل أو المورد؛ الدائن سالب والمدين موجب، مع مراعاة نوع الحساب.</p>'+
     '<button class="ta-enh-btn ta-enh-gold mt-3" onclick="UI.forceCloseModal()">رجوع</button></div>');
   document.querySelectorAll('[data-opening-account]').forEach(b=>b.onclick=()=>{UI.forceCloseModal();AccountController.openAccountModal(accounts[Number(b.dataset.openingAccount)].id);});
   document.querySelectorAll('[data-clear-account]').forEach(b=>b.onclick=()=>{
     const a=accounts[Number(b.dataset.clearAccount)];
     UI.showDeleteConfirm('حذف رصيد أول المدة','سيُصفّر الرصيد الافتتاحي لهذا الحساب بالعملتين.',async()=>{
       const current=State.accounts.find(x=>x.id===a.id);
       if(!current||current.openingSyp!==a.openingSyp||current.openingUsd!==a.openingUsd)return UI.toast('تغيّر الحساب. افتح القائمة من جديد','warn');
       const before=State.accounts, updated=before.map(x=>x.id===a.id?{...x,openingSyp:0,openingUsd:0}:x);
       State.accounts=updated;
       try{await StorageEngine.saveState();AppNav.renderCurrent();this.openAccountsOpening(filter);}
       catch(e){if(State.accounts===updated)State.accounts=before;UI.toast('تعذر حفظ الرصيد','error');}
     });
   });
 },
 movement(itemId,warehouse){
   const item=State.items.find(i=>i.id===itemId);if(!item)return null;
   const wh=warehouse||'all',all=wh==='all', isMain=wh==='wh_main',entries=[];
   if(all||isMain)for(const r of OpeningInventory.entries(item))entries.push({date:r.date||'0000-01-01',kind:'opening',desc:'جرد أول المدة',inQty:Math.max(0,r.qty),outQty:Math.max(0,-r.qty),id:r.id});
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
     if(qty)entries.push({date:doc.date||'',desc:'فاتورة '+Accounting.getInvoiceTypeAr(doc.type)+' #'+doc.number,inQty:sign>0?qty:0,outQty:sign<0?qty:0,id:doc.id,kind:doc.type,invoice:true});
   }
   if(!all)for(const tr of State.transfers||[]){
     if(tr.itemId!==item.id)continue;
     const qty=Number(tr.quantityBase)||0;
     if(tr.toWarehouseId===wh)entries.push({date:tr.date||'',desc:'مناقلة واردة '+WarehouseController.name(tr.fromWarehouseId),inQty:qty,outQty:0,id:tr.id,kind:'transfer_in'});
     if(tr.fromWarehouseId===wh)entries.push({date:tr.date||'',desc:'مناقلة صادرة '+WarehouseController.name(tr.toWarehouseId),inQty:0,outQty:qty,id:tr.id,kind:'transfer_out'});
   }
   entries.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id)));
   let running=0,totalIn=0,totalOut=0;for(const x of entries){running+=x.inQty-x.outQty;totalIn+=x.inQty;totalOut+=x.outQty;x.balance=running;}
   return {item,entries,totalIn,totalOut,actual:Accounting.getItemBaseStock(item.id,null,all?null:wh)};
 },
 movementFiltered(data,start='',end='',kind='all'){
   const selected=(data?.entries||[]).filter(entry=>{
     const date=String(entry.date||'').slice(0,10);
     return (!start||date>=start)&&(!end||date<=end)&&(kind==='all'||entry.kind===kind);
   });
   return {entries:selected,totalIn:selected.reduce((n,x)=>n+x.inQty,0),totalOut:selected.reduce((n,x)=>n+x.outQty,0)};
 },
 openMovement(itemId,warehouse,start='',end='',kind='all'){
   const current=itemId||State.items[0]?.id||'',wh=warehouse||State.settings.selectedWarehouseId||'wh_main';
   const data=this.movement(current,wh),filtered=this.movementFiltered(data,start,end,kind);
   const itemSelect=(State.items||[]).map(i=>'<option value="'+this.esc(i.id)+'" '+(current===i.id?'selected':'')+'>'+this.esc(i.name)+'</option>').join('');
   const warehouseSelect='<option value="all" '+(wh==='all'?'selected':'')+'>جميع المستودعات</option>'+
      (State.warehouses||[]).map(w=>'<option value="'+this.esc(w.id)+'" '+(wh===w.id?'selected':'')+'>'+this.esc(w.name)+'</option>').join('');
   const types=[['all','كل العمليات'],['opening','أول المدة'],['purchase','شراء'],['purchase_return','مردود شراء'],['sale','مبيع'],['sale_return','مردود مبيع'],['transfer_in','مناقلة واردة'],['transfer_out','مناقلة صادرة']];
   const options=types.map(([val,title])=>'<option value="'+val+'" '+(kind===val?'selected':'')+'>'+title+'</option>').join('');
   const rows=(filtered.entries||[]).map(e=>'<tr><td>'+this.esc(String(e.date||'').replace('T',' '))+'</td><td>'+
     (e.invoice?'<button type="button" style="color:#005eaa;text-decoration:underline;font-weight:800" onclick="TiqanyManager152.openInvoiceMovement(\''+this.esc(e.id)+'\')">'+this.esc(e.desc)+'</button>':e.kind==='opening'?'<button type="button" data-opening-movement="'+this.esc(e.id)+'">'+this.esc(e.desc)+'</button>':this.esc(e.desc))+'</td>'+
     '<td>'+Accounting.formatItemQuantity(e.inQty)+'</td><td>'+Accounting.formatItemQuantity(e.outQty)+'</td><td>'+Accounting.formatItemQuantity(e.balance)+'</td></tr>').join('');
   UI.openModal('<div dir="rtl"><h2 class="text-lg font-black">حركة مادة</h2>'+
     '<div class="ta-enh-panel"><div class="ta-enh-row"><label>المادة<select id="taMovementItem" onchange="TiqanyManager152.reloadMovement()">'+itemSelect+'</select></label>'+
     '<label>المستودع<select id="taMovementWarehouse" onchange="TiqanyManager152.reloadMovement()">'+warehouseSelect+'</select></label>'+
     '<label>العملية<select id="taMovementKind" onchange="TiqanyManager152.reloadMovement()">'+options+'</select></label></div>'+
     '<div class="ta-enh-row mt-2"><label>من تاريخ<input type="date" id="taMovementFrom" value="'+this.esc(start)+'" onchange="TiqanyManager152.reloadMovement()"></label>'+
     '<label>إلى تاريخ<input type="date" id="taMovementTo" value="'+this.esc(end)+'" onchange="TiqanyManager152.reloadMovement()"></label></div></div>'+
     '<div class="ta-enh-balance"><div>الوارد ضمن التصفية<b>'+Accounting.formatItemQuantity(filtered.totalIn)+'</b></div><div>الصادر ضمن التصفية<b>'+Accounting.formatItemQuantity(filtered.totalOut)+'</b></div>'+
     '<div>الرصيد الحالي للمادة<b>'+Accounting.formatItemQuantity(data?.actual||0)+'</b></div><div>عدد الحركات المعروضة<b>'+filtered.entries.length+'</b></div></div>'+
     '<p class="text-[11px] text-slate-500">الرصيد بعد كل حركة محسوب من بداية المدة، حتى عند إخفاء بعض العمليات بالتصفية. اضغط على فاتورة لعرضها.</p>'+
     '<div class="ta-enh-scroll"><table class="ta-enh-table"><thead><tr><th>التاريخ</th><th>العملية</th><th>وارد</th><th>صادر</th><th>الرصيد</th></tr></thead><tbody>'+
     (rows||'<tr><td colspan="5">لا توجد حركة لهذه المادة ضمن التصفية</td></tr>')+'</tbody></table></div>'+
     '<button class="ta-enh-btn ta-enh-gold mt-3" onclick="UI.forceCloseModal()">إغلاق</button></div>');
   document.querySelectorAll('[data-opening-movement]').forEach(b=>b.onclick=()=>{
     UI.forceCloseModal();AppNav.navigate('opening_invoice',{id:b.dataset.openingMovement});
   });
 },
 reloadMovement(){
   this.openMovement(document.getElementById('taMovementItem')?.value,document.getElementById('taMovementWarehouse')?.value,
     document.getElementById('taMovementFrom')?.value,document.getElementById('taMovementTo')?.value,
     document.getElementById('taMovementKind')?.value);
 },
 openInvoiceMovement(id){InvoiceController.openSavedInvoice(id,'view');},
 changePosUnit(index,unitName){
   const d=InvoiceController.draft,row=d?.rows?.[index],item=State.items.find(i=>i.id===row?.itemId),unit=item?.units?.find(u=>u.name===unitName);
   if(!row||!unit||!POSController.canChange())return;
   // Keep the numeric quantity entered by the cashier unchanged.
   // Stock consumption is recalculated using the NEW unitFactor on saving.
   const originalQty=Number(row.qty),factor=Number(unit.factor);
   if(!Number.isFinite(originalQty)||originalQty<=0||!Number.isFinite(factor)||factor<=0)
     return UI.toast('تعذر تبديل الوحدة: تحقق من الكمية ومعامل الوحدة','error');
   row.qty=originalQty;
   row.unitName=unit.name;row.unitFactor=factor;
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
     const remove=label.querySelector('button');
     if(remove)remove.insertAdjacentHTML('beforebegin',select);
     else label.insertAdjacentHTML('beforeend',select);
   });
 },
 install(){
   // A manager's chosen default sale unit is a trusted catalog preference.
   // Employees can consume it without gaining permission to change manager settings.
   if(typeof FieldSync!=='undefined'&&typeof FieldSync.catalog==='function'){
     const previous=FieldSync.catalog;
     FieldSync.catalog=function(...args){
       const catalog=previous.apply(this,args);
       catalog.defaultSaleUnitName=String(State.settings.taDefaultSaleUnitName||'__first__').slice(0,80);
       return catalog;
     };
   }
   this.css();
   const oldAccounts=Views.renderAccounts;Views.renderAccounts=function(main,...args){const out=oldAccounts.call(this,main,...args);E.addAccountControls(main);return out;};
   const oldItems=Views.renderItems;Views.renderItems=function(main,...args){const out=oldItems.call(this,main,...args);const t=main.querySelector('.ta-items-toolbar');if(t&&!t.querySelector('#taMovementAction'))t.insertAdjacentHTML('beforeend','<button id="taMovementAction" class="ta-enh-btn ta-enh-teal" onclick="TiqanyManager152.openMovement()"><i class="fas fa-arrows-spin"></i> حركة مادة</button><button id="taOpeningStockAction" class="ta-enh-btn ta-enh-teal" onclick="AppNav.navigate(\'opening_inventory\')"><i class="fas fa-boxes-stacked"></i> جرد أول المدة</button>');return out;};
   const oldSettings=Views.renderSettings;Views.renderSettings=function(main,...args){const out=oldSettings.call(this,main,...args);E.settings();return out;};
   const oldAdd=InvoiceController.addItemToInvoice;InvoiceController.addItemToInvoice=function(itemId,repaint=true,quantity=1){
      const item=State.items.find(i=>i.id===itemId),d=this.draft,unit=E.chosen(item,d?.type);
      if(!d||!unit||unit.name===(item.units?.[0]?.name))return oldAdd.call(this,itemId,repaint,quantity);
      const matching=d.rows.find(r=>r.itemId===itemId&&r.unitName===unit.name);
      if(matching){matching.qty=(Number(matching.qty)||0)+quantity;if(repaint){this.markModified();this.recalculate();this.paintForm(document.getElementById('mainContent'));}return;}
      const start=d.rows.length,baseRow=d.rows.find(r=>r.itemId===itemId&&r.unitName===item.units[0].name);
      if(baseRow){
         const clone={...baseRow,rowId:'r_' + FieldProtocol.uuid(),qty:quantity,discount:0,priceManuallySet:false};
         d.rows.push(clone);
      }else oldAdd.call(this,itemId,false,quantity);
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