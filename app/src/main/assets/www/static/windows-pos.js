/* Tiqany Acc Windows 3.5.53 — Quick point of sale.
 * Shares the existing invoice controller, stock validation, license validation,
 * accounting state, IndexedDB persistence and printer adapters. No parallel ledger.
 */
const POSController = {
  query: '', category: 'all', saving: false, readOnly: false,
  esc(value) { return AppEscape.text(String(value ?? '')); },
  // A POS document is still a normal SALE in the ledger. Its source controls only the editor.
  isPOS(inv) { return Boolean(inv && inv.type === 'sale' && (inv.source === 'windows-pos' || inv.source === 'agent-pos' || inv.posSale === true)); },
  canChange() { return !this.readOnly && AppNav.current()?.screen === 'pos'; },
  accountId() {
    const id=String(State.settings.posAccountId || '');
    return id && State.accounts.some(a => a.id === id && a.type === 'customer') ? id : '';
  },
  tier() {
    const t=String(State.settings.posPriceTier || 'account');
    return ['wholesale','center','consumer'].includes(t) ? t : null;
  },
  tierLabel() {
    const t=this.tier();
    return t==='wholesale'?'سعر الجملة':t==='center'?'سعر المركز':t==='consumer'?'سعر المستهلك':'حسب إعدادات الحساب';
  },
  async saveSettings() {
    const previous={posAccountId:State.settings.posAccountId,posPriceTier:State.settings.posPriceTier,posScanFromHome:State.settings.posScanFromHome};
    const proposedAcc=document.getElementById('posAccountSetting')?.value || '';
    const proposedTier=document.getElementById('posTierSetting')?.value || 'account';
    const proposedAutoPOS=document.getElementById('posScanFromHomeSetting')?.checked === true;
    if(proposedAcc && !State.accounts.some(a=>a.id===proposedAcc && a.type==='customer')) {
      UI.toast('الحساب المحدد غير موجود أو ليس حساب زبون','warn'); return false;
    }
    if(!['account','wholesale','center','consumer'].includes(proposedTier))return false;
    State.settings.posAccountId=proposedAcc;
    State.settings.posPriceTier=proposedTier;
    State.settings.posScanFromHome=proposedAutoPOS;
    try {await StorageEngine.saveState();UI.toast('تم حفظ ضبط نقطة البيع','success');return true;}
    catch(e){Object.assign(State.settings,previous);UI.toast('تعذر حفظ إعدادات نقطة البيع','error');return false;}
  },
  // Called only by a completed, recognized scanner sequence while dashboard is visible.
  openFromBarcode(raw) {
    const code=String(raw||'').trim().toLowerCase();
    const found=State.items.find(item=>String(item.barcode||'').trim().toLowerCase()===code);
    if(!found){UI.toast('الباركود غير مسجل؛ لم تُفتح نقطة بيع','warn');return false;}
    if(State.settings.posScanFromHome!==true || AppNav.current()?.screen!=='dashboard')return false;
    // Do not create an invoice while a dialog, modal or operation guard is active.
    if(AppNav.isDirty||AppNav.isModalDirty||AppNav.activeOperationGuard)return false;
    const modal=document.getElementById('modalContainer'), dialog=document.getElementById('dialogContainer');
    if((modal&&!modal.classList.contains('hidden'))||(dialog&&!dialog.classList.contains('hidden')))return false;
    AppNav.navigate('pos',{startBarcode:code});
    return AppNav.current()?.screen==='pos' && InvoiceController.draft?.rows?.some(row=>row.itemId===found.id)===true;
  },
  render(main, params={}) {
    // Initialize a normal sale invoice using its original controller, including
    // its operation guard, before switching to a desktop-optimized POS view.
    const existing=params.id ? State.invoices.find(i=>i.id===params.id) : null;
    if(params.id && !this.isPOS(existing)) return AppNav.navigate('invoices_list');
    InvoiceController.renderForm(main,existing ? {id:existing.id} : {type:'sale'});
    const d=InvoiceController.draft;
    d.type='sale';
    this.readOnly=Boolean(existing && params.view===true);
    if(!existing){ d.paymentMethod='cash';d.accountId=this.accountId();d.source='windows-pos'; }
    // Preserve ID, customer, currency, date and stored prices during edits/previews.
    this.query='';this.category='all';this.saving=false;
    UI.setHeader('<i class="fas fa-cart-plus text-emerald-400"></i> <span>'+(this.readOnly?'عرض نقطة بيع':existing?'تعديل نقطة بيع':'نقطة البيع')+'</span>', 'بيع نقدي سريع • شبكة مواد • بحث • قارئ باركود');
    if(this.readOnly)AppNav.clearDirty();
    else AppNav.enableOperationGuard(async()=>await this.save(false));
    this.paint(main);
    // A home-screen scan starts a fresh draft and adds exactly one unit; it is not saved.
    if(params.startBarcode) this.addBarcode(params.startBarcode);
  },
  openBarcodeScanner(){
    if(window.DesktopDevices?.openScanner){window.DesktopDevices.openScanner();return;}
    if(window.NativeBarcode?.scan){window.NativeBarcode.scan('invoice');return;}
    UI.toast('يمكن استخدام قارئ باركود خارجي أو كاميرا الهاتف إذا كانت مدعومة','info');
  },
  openSettings(){
    if(!InvoiceController.draft?.rows.length) AppNav.clearDirty();
    AppNav.navigate('settings');
    setTimeout(()=>{
      const section=document.querySelector('[data-settings-section="invoices"]');
      if(section){section.open=true;section.scrollIntoView({behavior:'smooth',block:'start'});}
      document.getElementById('posInvoiceSettings')?.scrollIntoView({behavior:'smooth',block:'center'});
    },120);
  },
  mark(){AppNav.markDirty(async()=>await this.save(false));},
  addByIndex(index, fromList=false){
    const item=State.items[index]; if(!item)return;
    if(this.add(item.id)){
      if(fromList){this.renderNameList();document.getElementById('posNameSearch')?.focus();}
    }
  },
  add(itemId){
    if(!this.canChange())return false;
    const item=State.items.find(x=>x.id===itemId);
    const d=InvoiceController.draft;
    if(!item || !d || AppNav.current()?.screen!=='pos')return false;
    const first=item.units?.[0];
    if(!first){UI.toast('يجب تعريف وحدة بيع للمادة أولاً','warn');return false;}
    const idx=d.rows.findIndex(r=>r.itemId===itemId && r.unitName===first.name);
    if(idx<0){
      InvoiceController.addItemToInvoice(itemId,false);
      const row=d.rows.find(r=>r.itemId===itemId && r.unitName===first.name);
      if(!row)return false;
      // POS-only pricing override: never change customer priceTier or the global default.
      const raw=Accounting.itemSalePrice(item,first,d.accountId,this.tier());
      row.basePrice=raw;row.baseCurrency=item.currency;
      row.price=Accounting.convert(raw,item.currency,d.currency,d.exchangeRate);
    }else{
      d.rows[idx].qty=Number(d.rows[idx].qty)+1;
    }
    this.mark();InvoiceController.recalculate();this.paint(document.getElementById('mainContent'));
    return true;
  },
  addBarcode(raw){
    if(!this.canChange())return false;
    const code=String(raw||'').trim().toLowerCase();if(!code)return false;
    const item=State.items.find(x=>String(x.barcode||'').trim().toLowerCase()===code);
    if(!item){UI.toast('هذا الباركود غير مسجل في المواد','warn');return false;}
    return this.add(item.id);
  },
  setQuery(v){this.query=String(v||'');this.renderGrid();},
  setCategory(v){this.category=v;this.renderGrid();},
  shownItems(){
    const q=this.query.trim().toLocaleLowerCase();
    return State.items.filter(item=>(this.category==='all'||item.category===this.category)&&
      (!q||String(item.name||'').toLocaleLowerCase().includes(q)||String(item.barcode||'').toLowerCase().includes(q)));
  },
  renderGrid(){
    const host=document.getElementById('posGrid');if(!host)return;
    const filtered=this.shownItems();
    if(!filtered.length){host.innerHTML=`<div class="pos-empty"><i class="fas fa-box-open"></i><strong>${State.items.length?'لا توجد مواد مطابقة للبحث':'لا توجد مواد معرفة بعد'}</strong><small>${State.items.length?'جرّب تغيير كلمة البحث أو المجموعة':'أضف المواد من قسم المواد، ثم عُد إلى نقطة البيع'}</small></div>`;return;}
    const d=InvoiceController.draft;
    host.innerHTML=filtered.map(item=>{
      const i=State.items.indexOf(item),unit=item.units?.[0]||{};
      const price=Accounting.convert(Accounting.itemSalePrice(item,unit,d.accountId,this.tier()),item.currency,d.currency,d.exchangeRate);
      const added=d.rows.filter(r=>r.itemId===item.id).reduce((n,r)=>n+Number(r.qty||0),0);
      const stock=Accounting.getItemBaseStock(item.id,null,d.warehouseId);
      return `<button type="button" class="pos-product" onclick="POSController.addByIndex(${i})" aria-label="إضافة ${this.esc(item.name)}">
          <span class="pos-product-icon"><i class="fas fa-box-open"></i></span>${added?`<span class="pos-product-count">${added} ×</span>`:''}
          <strong>${this.esc(item.name)}</strong><small>${this.esc(unit.name||'قطعة')} · المتاح ${Accounting.formatItemQuantity(stock)}</small>
          <b>${Accounting.format(price,d.currency)}</b><span class="pos-product-add"><i class="fas fa-plus"></i></span>
        </button>`;
    }).join('');
  },
  renderNameList(){
    const host=document.getElementById('posNames');if(!host)return;
    const q=String(document.getElementById('posNameSearch')?.value||'').trim().toLocaleLowerCase();
    const matches=State.items.filter(it=>String(it.name||'').toLocaleLowerCase().includes(q));
    host.innerHTML=matches.length?matches.map(it=>`<button type="button" class="pos-name-row" onclick="POSController.addByIndex(${State.items.indexOf(it)},true)">${this.esc(it.name)}</button>`).join(''):
      `<div class="pos-name-blank">${State.items.length?'لا توجد مادة بهذا الاسم':'لا توجد مواد معرفة بعد'}</div>`;
  },
  openNameList(){
    if(!this.canChange())return;
    UI.openModal(`<div class="pos-picker" dir="rtl"><header><strong><i class="fas fa-table-list"></i> اختيار مادة من قائمة الأسماء</strong><button type="button" onclick="UI.forceCloseModal()" aria-label="إغلاق">×</button></header>
      <label for="posNameSearch">البحث حسب اسم المادة</label><input id="posNameSearch" type="search" placeholder="اكتب اسم المادة..." oninput="POSController.renderNameList()" autocomplete="off"/>
      <div class="pos-picker-note">تعرض القائمة اسم المادة فقط، والضغط عليه يضيف قطعة إلى الفاتورة دون إغلاق النافذة.</div>
      <div id="posNames" class="pos-names"></div><button class="pos-picker-done" type="button" onclick="UI.forceCloseModal()">تم — إغلاق القائمة</button></div>`);
    this.renderNameList();setTimeout(()=>document.getElementById('posNameSearch')?.focus(),60);
  },
  updateQty(idx,value){
    if(!this.canChange())return;
    const row=InvoiceController.draft.rows[idx];if(!row)return;
    const amount=Accounting.parseNum(value);
    if(!Number.isFinite(amount)||amount<=0){UI.toast('الكمية يجب أن تكون أكبر من صفر','warn');this.paint(document.getElementById('mainContent'));return;}
    row.qty=amount;this.mark();InvoiceController.recalculate();this.paint(document.getElementById('mainContent'));
  },
  updatePrice(idx,value){
    if(!this.canChange())return;
    const row=InvoiceController.draft.rows[idx];if(!row)return;
    const price=Accounting.parseNum(value);
    if(!Number.isFinite(price)||price<0){UI.toast('أدخل سعراً صحيحاً','warn');this.paint(document.getElementById('mainContent'));return;}
    row.price=price;row.priceManuallySet=true;
    row.basePrice=Accounting.convert(price,InvoiceController.draft.currency,row.baseCurrency||InvoiceController.draft.currency,InvoiceController.draft.exchangeRate);
    this.mark();InvoiceController.recalculate();this.paint(document.getElementById('mainContent'));
  },
  remove(idx){
    if(!this.canChange())return;InvoiceController.draft.rows.splice(idx,1);if(InvoiceController.draft.rows.length)this.mark();else AppNav.clearDirty();InvoiceController.recalculate();this.paint(document.getElementById('mainContent'));},
  changeWarehouse(id){
    if(!this.canChange())return;
    if(!State.warehouses.some(w=>w.id===id))return;
    InvoiceController.draft.warehouseId=id;this.mark();this.paint(document.getElementById('mainContent'));
  },
  switchCurrency(){
    if(!this.canChange())return;
    if(State.settings.primaryOnlyMode)return UI.toast('العملة الرئيسية فقط مفعّلة','warn');
    const d=InvoiceController.draft,old=d.currency,next=old==='USD'?'SYP':'USD';
    d.currency=next;
    for(const r of d.rows){r.price=Accounting.convert(r.basePrice??r.price,r.baseCurrency||old,next,d.exchangeRate);}
    this.mark();this.paint(document.getElementById('mainContent'));
  },
  paint(main){
    const d=InvoiceController.draft;if(!d||!main)return;
    InvoiceController.recalculate();
    const acc=State.accounts.find(a=>a.id===d.accountId);
    const money=v=>Accounting.format(v,d.currency);
    main.innerHTML=`<div class="pos-page" dir="rtl" data-pos-mode="${this.readOnly?'view':d.isEditing?'edit':'new'}">
      <section class="pos-meta"><div><span>الحساب</span><strong><i class="fas fa-user"></i> ${this.esc(acc?.name||'الزبون النقدي')}</strong></div><div><span>التسعير</span><strong><i class="fas fa-sliders"></i> ${this.tierLabel()}</strong></div><div><span>رقم الفاتورة</span><strong>#${d.number}</strong></div><div><span>العملة</span><button type="button" class="pos-switch" ${this.readOnly?'disabled':''} onclick="POSController.switchCurrency()">${d.currency==='SYP'?'ل.س':d.currency} <i class="fas fa-rotate-right"></i></button></div></section>
      <div class="pos-layout"><section class="pos-catalog" ${this.readOnly?'hidden':''}><div class="pos-section-head"><div><h3><i class="fas fa-boxes-stacked"></i> اختيار المواد</h3><small>انقر على المادة لإضافتها إلى السلة</small></div><span>${State.items.length} مادة</span></div>
        <div class="pos-mode-switch"><button class="active" type="button" onclick="document.getElementById('posSearch').focus()"><i class="fas fa-table-cells-large"></i> عرض المواد شبكة</button><button type="button" onclick="document.getElementById('posSearch').focus()"><i class="fas fa-search"></i> البحث عن مادة</button><button type="button" onclick="POSController.openNameList()"><i class="fas fa-table-list"></i> قائمة الأسماء</button><button type="button" onclick="POSController.openBarcodeScanner()"><i class="fas fa-barcode"></i> مسح باركود</button></div>
        <div class="pos-filters"><div class="pos-search"><i class="fas fa-search"></i><input id="posSearch" type="search" placeholder="ابحث باسم المادة أو الباركود..." value="${this.esc(this.query)}" oninput="POSController.setQuery(this.value)"/></div><select aria-label="تصفية حسب المجموعة" onchange="POSController.setCategory(this.value)"><option value="all">كل المجموعات</option>${State.categories.map(c=>`<option value="${this.esc(c)}" ${c===this.category?'selected':''}>${this.esc(c)}</option>`).join('')}</select></div>
        <div id="posGrid" class="pos-grid"></div>
      </section>
      <aside class="pos-cart"><div class="pos-cart-head"><div><h3><i class="fas fa-receipt"></i> فاتورة البيع الحالية</h3><p>${this.esc(d.date.replace('T',' '))} · ${d.rows.length} أصناف</p></div><span class="pos-cash-label"><i class="fas fa-coins"></i> نقدي</span></div>
        <div class="pos-cart-columns"><span>المادة / الكمية / السعر</span><span>الإجمالي</span></div>
        <div class="pos-cart-rows">${d.rows.length?d.rows.map((r,i)=>`<div class="pos-line"><div class="pos-line-label"><strong>${this.esc(r.itemName)}</strong><button ${this.readOnly?'hidden':''} onclick="POSController.remove(${i})" aria-label="حذف الصنف"><i class="fas fa-times"></i></button></div><div class="pos-line-fields"><label>الكمية <input type="number" min="0.001" step="any" value="${r.qty}" ${this.readOnly?'disabled':''} onchange="POSController.updateQty(${i},this.value)" /></label><label>السعر <input type="number" min="0" step="any" value="${r.price}" ${this.readOnly?'disabled':''} onchange="POSController.updatePrice(${i},this.value)" /></label><b>${money(r.total)}</b></div></div>`).join(''):`<div class="pos-cart-empty"><i class="fas fa-cart-plus"></i><strong>السلة فارغة</strong><p>اختر الأصناف من الشبكة، أو ابحث عنها بالاسم، أو استخدم قارئ الباركود.</p></div>`}</div>
        <div class="pos-cart-bottom"><div class="pos-subtotal"><span>إجمالي الأصناف</span><strong>${money(d.subTotal)}</strong></div><div class="pos-grand-total"><span>الإجمالي المستحق</span><strong>${money(d.netTotal)}</strong></div><div class="pos-pay-note"><i class="fas fa-shield-halved"></i> بيع نقدي مسدّد بالكامل · تحفظ الفاتورة في سجل المبيعات</div><div class="pos-cart-actions" ${this.readOnly?'hidden':''}><button type="button" onclick="POSController.save(false)" ${!d.rows.length||this.saving?'disabled':''}><i class="fas fa-check"></i> حفظ البيع</button><button type="button" onclick="POSController.save(true)" ${!d.rows.length||this.saving?'disabled':''}><i class="fas fa-print"></i> حفظ وطباعة</button></div>${this.readOnly?`<div class="pos-cart-actions"><button type="button" onclick="AppNav.navigate('pos',{id:'${this.esc(d.id)}'},true)"><i class="fas fa-pen"></i> تعديل نقطة البيع</button></div>`:''}<small>الحفظ يحدّث أرصدة الصندوق والمستودع والتقارير، باستخدام محرك الفواتير الأصلي.</small></div>
      </aside></div></div>`;
    this.renderGrid();
  },
  async save(andPrint=false){
    if(this.saving)return false;
    const d=InvoiceController.draft;
    if(!d||!this.canChange())return false;
    d.type='sale';d.paymentMethod='cash';
    // Never replace a saved invoice's original customer on edit.
    if(!d.isEditing)d.accountId=this.accountId();
    d.source=d.source==='agent-pos'?'agent-pos':'windows-pos';
    this.saving=true;
    try {
      // InvoiceController performs stock/account validation and writes the sole ledger.
      const ok=await InvoiceController.saveInvoice(false);
      if(!ok)return false;
      const saved=State.invoices.find(x=>x.id===d.id);
      if(andPrint && saved){
        try {
          const settings=await window.WindowsDevices?.settings?.();
          if(settings?.printMode==='system' && window.WindowsDevices?.printInvoice){
            await window.WindowsDevices.printInvoice(InvoicePdfShare.buildPayload(saved.id));
          }else{
            await ThermalPrinter.printInvoiceDirect(saved);
          }
        }catch(e){UI.toast('تم حفظ البيع، ولكن تعذرت الطباعة: '+e.message,'warn');}
      }
      // New sale: start next POS; existing invoice: return to sales history.
      AppNav.clearDirty();
      if(d.isEditing) AppNav.navigate('invoices_list',{type:'sale'},true);
      else AppNav.navigate('pos',{},true);
      return true;
    } finally {this.saving=false;}
  }
};
