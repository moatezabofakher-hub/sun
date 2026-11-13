/* Technical Accountant — Field Agent v1. Offline operations are append-only. */
const AGENT_LICENSE_PUBLIC_KEY='MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAxWiG4kVoBws0cXWj9ttFg9+CdxhUqhG5RB/EnJ5c9kgL2ZM9tAFU3pji3sobZJotaJHwE5akrOHZ5QBqoPjiuYPph3eSKrOnh/LHI4jFNZgcwarUMcbK9n2VNr4uO41E3JHPFl/zTOnaHbvGbYrg9huX8ee5Tl2I5vOSk4KNiSwh+dtvMVP+bgUxaEPmhK5FcHOiUeiQjD22U/qSAsI0ZtyyPMBe8K0QPv2Mc8W6Bl1elLy1izeUwNTcvsRElLw1YluCifKNsm5TrX6Xw8FmpMBoLy2gSWUGhxE8TGhXEKn9CT3Q8bxIq9wPyzHrTCJXYT/2ErgEc25ObVTE4Gh94tR+Ne4+UpON83KV4PH29W9HnlVZYM3CJ/Hw+RulZfmvUOR5eU5ShOv2toguNzGXGNLnb07YP/BgUYk0735KxYLN7QUP7nkPfOOPMPbQjI3n8DI0ppl0wrVs3u8Kopw2nbcg+Q0xtq6P9J8I7YQ2Au/2d/CiJXdOMoB3otXSQDTxAgMBAAE=';
const Agent={
  state:null,db:null,screen:'home',draft:[],draftKind:'sale',busy:false,
  get blank(){return {deviceId:'TD-'+FieldProtocol.uuid().toUpperCase(),companyId:'',companyName:'',agentId:'',agentName:'',vehicleName:'',warehouseId:'',key:'',items:[],accounts:[],stock:{},knownIds:[],snapshotIds:[],ops:[],license:'',issuedAt:'',exchangeRate:15000};},
  async init(){
    if(!globalThis.crypto?.subtle){document.getElementById('screen').textContent='هذا الجهاز لا يدعم البيئة الآمنة اللازمة لتشغيل المزامنة.';return;}
    try{
      this.db=await new Promise((resolve,reject)=>{const req=indexedDB.open('ta_field_agent_v1',1);req.onupgradeneeded=()=>{req.result.createObjectStore('state',{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
      this.state=await new Promise((resolve,reject)=>{const tx=this.db.transaction('state','readonly'),req=tx.objectStore('state').get('main');req.onsuccess=()=>resolve(req.result?.data||null);req.onerror=()=>reject(req.error);});
      if(!this.state){this.state=this.blank;await this.save();}
      await this.show('home');
    }catch(e){document.getElementById('screen').textContent='خطأ في التخزين المحلي: '+e.message;}
  },
  async save(){return new Promise((resolve,reject)=>{const tx=this.db.transaction('state','readwrite');tx.objectStore('state').put({id:'main',data:this.state});tx.oncomplete=()=>resolve(true);tx.onabort=()=>reject(tx.error||Error('فشل حفظ البيانات'));tx.onerror=()=>{};});},
  toast(msg){const x=document.getElementById('toast');x.textContent=msg;x.classList.remove('hide');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>x.classList.add('hide'),4300);},
  escape(t){return String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));},
  ready(){return !!(this.state?.companyId&&this.state.key)},
  async active(){return this.ready() && await FieldProtocol.verifyLicense(this.state.license,AGENT_LICENSE_PUBLIC_KEY,this.state.deviceId,this.state.companyId,this.state.agentId);},
  get pending(){return this.state.ops.filter(o=>!this.state.knownIds.includes(o.id));},
  get stock(){return FieldProtocol.applyStock(this.state.stock,this.state.ops,this.state.snapshotIds||[]);},
  async show(where){
    this.screen=where;
    const active=await this.active();
    const tag=document.getElementById('connectionTag');tag.textContent=active?'مفعّل':this.ready()?'بانتظار التفعيل':'غير مرتبط';
    const nav=document.getElementById('bottom');nav.classList.toggle('hide',!active);
    document.querySelectorAll('.bottom button').forEach(b=>b.classList.toggle('active',b.id==='nav-'+where));
    const e=document.getElementById('screen');
    if(!this.ready()){e.innerHTML=this.renderSetup();return;}
    if(!active){e.innerHTML=this.renderActivation();return;}
    if(where==='invoice')e.innerHTML=this.renderInvoice();
    else if(where==='ops')e.innerHTML=this.renderOps();
    else if(where==='sync')e.innerHTML=this.renderSync();
    else if(where==='stock')e.innerHTML=this.renderStock();
    else if(where==='voucher')e.innerHTML=this.renderVoucher();
    else e.innerHTML=this.renderHome();
  },
  renderSetup(){return `<div class="hero"><h2>مرحبًا بك في نسخة المندوب</h2><p>هذه النسخة مستقلة عن التطبيق الرئيسي. تبدأ بالارتباط بالشركة عبر ملف تجهيز خاص يرسله مسؤول الحسابات.</p></div>
   <div class="panel"><h3>معرّف هذا الجهاز</h3><div class="field ltr" style="font-size:11px;user-select:text">${this.state.deviceId}</div>
   <button class="secondary" onclick="Agent.copy('${this.state.deviceId}')">نسخ معرّف الجهاز</button>
   <p class="tiny">أرسل المعرّف إلى صاحب الشركة كي يصدر لك رمز التفعيل بعد تجهيز حسابك.</p>
   <label class="label">استيراد ملف تجهيز المندوب</label><input class="field" type="file" accept="application/json,.json" onchange="Agent.importFile(this)">
   <p class="tiny">استلم الملف من هاتف الإدارة عبر Quick Share أو البلوتوث أو وسيط موثوق. لا تقبل ملفات إعداد من جهات مجهولة.</p></div>`;},
  renderActivation(){return `<div class="hero"><h2>تم ربط الجهاز بالشركة</h2><p>${this.escape(this.state.companyName)} · ${this.escape(this.state.agentName)} · ${this.escape(this.state.vehicleName)}</p></div>
    <div class="panel"><h3>تفعيل الجهاز بكود من مالك التطبيق</h3>
    <p class="tiny">معرّف الجهاز المطلوب لصاحب الشركة:</p><div class="field ltr" style="font-size:11px;user-select:text">${this.state.deviceId}</div>
    <button class="secondary" onclick="Agent.copy('${this.state.deviceId}')">نسخ معرّف الجهاز</button>
    <label class="label">رمز التفعيل الصادر من الشركة</label><textarea class="field ltr" rows="5" id="agentLicenseInput" placeholder="TAF1.…"></textarea>
    <button class="primary" onclick="Agent.activate()">تحقق وتفعيل</button>
    ${this.state.ops.length?`<button class="secondary" onclick="Agent.exportOutbox()">تصدير العمليات القديمة للمحاسب حتى لو انتهت صلاحية التفعيل</button>`:''}
    <label class="label">استلام تأكيد مزامنة أو تحديث الشركة</label><input class="field" type="file" accept="application/json,.json" onchange="Agent.importFile(this)"></div>`;},
  renderHome(){return `<div class="hero"><h2>أهلاً ${this.escape(this.state.agentName)} 👋</h2><p>${this.escape(this.state.companyName)} · ${this.escape(this.state.vehicleName)}</p><div class="stats"><div class="stat"><b>${this.state.ops.length}</b><small>جميع العمليات</small></div><div class="stat"><b>${this.pending.length}</b><small>بانتظار الإرسال</small></div><div class="stat"><b>${this.state.items.length}</b><small>مادة متاحة</small></div></div></div>
    <div class="grid"><button class="tile" onclick="Agent.startInvoice('sale')"><span class="glyph">🛒</span><strong>فاتورة مبيعات</strong><small>بيع مباشر للعملاء</small></button>
    <button class="tile" onclick="Agent.startInvoice('sale_return')"><span class="glyph">↩</span><strong>مردود المبيعات</strong><small>إرجاع مواد</small></button>
    <button class="tile" onclick="Agent.show('voucher')"><span class="glyph">💵</span><strong>سند قبض / دفع</strong><small>حركة مالية للعميل</small></button>
    <button class="tile" onclick="Agent.show('stock')"><span class="glyph">📦</span><strong>رصيد السيارة</strong><small>مخزون المستودع المتنقل</small></button>
    <button class="tile" onclick="Agent.show('sync')"><span class="glyph">⇄</span><strong>المزامنة</strong><small>تبادل الملفات مع الإدارة</small></button>
    <button class="tile" onclick="Agent.choosePrinter()"><span class="glyph">🖨</span><strong>اختيار الطابعة</strong><small>طابعة بلوتوث حرارية</small></button></div>`;},
  startInvoice(kind){this.draft=[];this.draftKind=kind;this.show('invoice');},
  renderInvoice(){
    const total=this.draft.reduce((a,r)=>a+Number(r.total),0),kind=this.draftKind;
    const currencies=['USD','SYP'];
    return `<div class="hero"><h2>${kind==='sale'?'فاتورة مبيعات':'مردود مبيعات'}</h2><p>عملية ميدانية محفوظة محليًا حتى يرحلها المحاسب الرئيسي</p></div>
      <div class="panel"><label class="label">نوع العملية</label><select class="field" id="fKind" onchange="Agent.draftKind=this.value;Agent.draft=[];Agent.show('invoice')"><option value="sale" ${kind==='sale'?'selected':''}>مبيعات</option><option value="sale_return" ${kind==='sale_return'?'selected':''}>مردود مبيعات</option></select>
      <label class="label">العميل</label><select class="field" id="fAccount"><option value="">بيع نقدي دون حساب</option>${this.state.accounts.map(a=>`<option value="${this.escape(a.id)}">${this.escape(a.name)}</option>`).join('')}</select>
      <label class="label">عملة الفاتورة</label><select class="field" id="fCurrency" onchange="Agent.reprice(this.value)">${currencies.map(c=>`<option ${c===(this.currency||'USD')?'selected':''}>${c}</option>`).join('')}</select>
      <label class="label">المادة</label><select class="field" id="fItem" onchange="Agent.paintUnits()">${this.state.items.map(i=>`<option value="${this.escape(i.id)}">${this.escape(i.name)}</option>`).join('')}</select>
      <div class="row"><div><label class="label">الوحدة</label><select class="field" id="fUnit"></select></div><div><label class="label">الكمية</label><input class="field ltr" id="fQty" type="number" min="0.001" step="0.001" value="1"></div></div>
      <button class="secondary" onclick="Agent.addRow()">+ إضافة المادة إلى الفاتورة</button></div>
      <div class="panel"><h3>الأصناف المحددة (${this.draft.length})</h3>
      ${this.draft.length?this.draft.map((r,i)=>`<div class="itemrow"><div class="itemhead"><span>${i+1}. ${this.escape(r.itemName)}</span><button style="background:#fff1f2;border:0;color:#ad3648;border-radius:9px;padding:4px 8px" onclick="Agent.removeRow(${i})">×</button></div><p class="tiny">${r.qty} ${this.escape(r.unitName)} × ${r.price} ${this.currency||'USD'}</p><b>${r.total.toFixed(this.currency==='SYP'?0:2)}</b></div>`).join(''):'<p class="muted">لا توجد مواد مضافة بعد</p>'}
      <div class="itemhead" style="padding-top:12px"><span>الإجمالي</span><b>${FieldProtocol.money(total,this.currency||'USD')} ${this.currency||'USD'}</b></div>
      <label class="label">المبلغ المقبوض / المعاد نقدًا</label><input type="number" id="fPaid" class="field ltr" min="0" step="any" value="${total}">
      <label class="label">ملاحظة</label><input id="fNote" class="field" maxlength="200" placeholder="اختياري">
      <button class="primary" onclick="Agent.saveInvoice()">حفظ الفاتورة على الجهاز</button></div>`;
  },
  paintUnits(){const it=this.state.items.find(i=>i.id===document.getElementById('fItem')?.value)||this.state.items[0],unit=document.getElementById('fUnit');if(unit)unit.innerHTML=(it?.units||[]).map(u=>`<option value="${this.escape(u.name)}">${this.escape(u.name)}</option>`).join('');},
  reprice(cur){if(this.draft.length){this.toast('تم مسح المواد عند تغيير العملة لضمان دقة الأسعار');this.draft=[];}this.currency=cur;this.show('invoice');},
  addRow(){try {
    const it=this.state.items.find(i=>i.id===document.getElementById('fItem')?.value),u=it?.units.find(x=>x.name===document.getElementById('fUnit')?.value);
    const qty=Number(document.getElementById('fQty').value),currency=document.getElementById('fCurrency').value;
    if(!u||!Number.isFinite(qty)||qty<=0||qty>999999)throw Error('الكمية غير صحيحة');
    const raw=Number(u.salePrice)||0;let price=raw;
    if(it.currency!==currency){price=it.currency==='USD'?raw*Number(this.state.exchangeRate):raw/Number(this.state.exchangeRate);}
    price=FieldProtocol.money(price,currency);
    const total=FieldProtocol.money(qty*price,currency);
    const current=Number(this.stock[it.id])||0;
    const reserved=this.draft.filter(r=>r.itemId===it.id).reduce((a,r)=>a+r.qty/r.unitFactor,0);
    if(this.draftKind==='sale' && qty/Number(u.factor) + reserved > current+0.00001)throw Error('رصيد السيارة لا يكفي للكمية المطلوبة');
    this.currency=currency;
    this.draft.push({itemId:it.id,itemName:it.name,unitName:u.name,unitFactor:Number(u.factor)||1,qty,price,total});
    this.show('invoice');this.toast('أضيفت المادة إلى الفاتورة');
  }catch(e){this.toast(e.message);}},
  removeRow(i){this.draft.splice(i,1);this.show('invoice');},
  async saveInvoice(){if(this.busy)return;this.busy=true;
    try{
      if(!await this.active())throw Error('يجب تفعيل التطبيق أولًا');
      if(!this.draft.length)throw Error('أضف مادة واحدة على الأقل');
      const currency=this.currency||'USD', net=FieldProtocol.money(this.draft.reduce((a,r)=>a+r.total,0),currency);
      const paid=FieldProtocol.money(document.getElementById('fPaid')?.value||0,currency);
      const accountId=document.getElementById('fAccount')?.value||'';
      if(paid>net)throw Error('المبلغ المقبوض أكبر من قيمة الفاتورة');
      if(paid<net && !accountId)throw Error('اختر العميل للفاتورة التي تتضمن رصيدًا آجلًا');
      const op={id:'op_'+FieldProtocol.uuid(),kind:this.draftKind,companyId:this.state.companyId,agentId:this.state.agentId,warehouseId:this.state.warehouseId,localNumber:'F-'+(this.state.ops.length+1),date:new Date().toISOString(),currency,exchangeRate:Number(this.state.exchangeRate),accountId,paidAmount:paid,rows:JSON.parse(JSON.stringify(this.draft)),note:document.getElementById('fNote')?.value.trim().slice(0,200)||''};
      FieldProtocol.validateOps([op],this.state.agentId,this.state.companyId,this.state.warehouseId,this.state.items,this.state.accounts);
      this.state.ops.push(op);
      await this.save();this.draft=[];this.toast('حُفظت الفاتورة. لن تُرحّل إلا عند المزامنة');await this.show('ops');
    }catch(e){this.toast('لم تحفظ الفاتورة: '+e.message);}finally{this.busy=false;}
  },
  renderVoucher(){return `<div class="hero"><h2>سند المندوب</h2><p>سند قبض أو دفع مرتبط بحساب أحد العملاء المعتمدين</p></div><div class="panel">
    <label class="label">نوع السند</label><select id="vKind" class="field"><option value="receipt">سند قبض</option><option value="payment">سند دفع</option></select>
    <label class="label">حساب العميل</label><select id="vAcc" class="field">${this.state.accounts.map(a=>`<option value="${this.escape(a.id)}">${this.escape(a.name)}</option>`).join('')}</select>
    <label class="label">العملة</label><select id="vCurrency" class="field"><option>USD</option><option>SYP</option></select>
    <label class="label">القيمة</label><input id="vAmount" class="field ltr" type="number" step="any" min="0.01">
    <label class="label">ملاحظة</label><input id="vNote" class="field" maxlength="200">
    <button class="primary" onclick="Agent.saveVoucher()">حفظ السند</button></div>`;},
  async saveVoucher(){if(this.busy)return;this.busy=true;
    try{if(!await this.active())throw Error('تفعيل المندوب مطلوب');
      const currency=document.getElementById('vCurrency').value,accountId=document.getElementById('vAcc').value,
        amount=FieldProtocol.money(document.getElementById('vAmount').value,currency);
      if(amount<=0||!accountId)throw Error('أدخل المبلغ واختر العميل');
      const op={id:'op_'+FieldProtocol.uuid(),kind:document.getElementById('vKind').value,companyId:this.state.companyId,agentId:this.state.agentId,warehouseId:this.state.warehouseId,localNumber:'V-'+(this.state.ops.length+1),date:new Date().toISOString(),currency,exchangeRate:Number(this.state.exchangeRate),accountId,amount,note:document.getElementById('vNote').value.trim().slice(0,200)};
      FieldProtocol.validateOps([op],this.state.agentId,this.state.companyId,this.state.warehouseId,this.state.items,this.state.accounts);
      this.state.ops.push(op);await this.save();this.toast('حُفظ السند محليًا');await this.show('ops');
    }catch(e){this.toast('لم يُحفظ السند: '+e.message);}finally{this.busy=false;}
  },
  renderStock(){const stock=this.stock;return `<div class="hero"><h2>جرد سيارة المندوب</h2><p>الرصيد محسوب من آخر كشف من الشركة بعد خصم/إضافة الحركات المحلية غير المشمولة فيه</p></div><div class="panel">
    ${this.state.items.map(it=>`<div class="itemrow"><div class="itemhead"><span>${this.escape(it.name)}</span><b>${Number(stock[it.id]||0).toFixed(3)}</b></div><small class="muted">رصيد بالوحدة الأساسية</small></div>`).join('')}</div>
    <button class="secondary" onclick="Agent.show('home')">رجوع</button>`;},
  renderOps(){return `<div class="hero"><h2>سجل العمليات الميدانية</h2><p>لا يتم حذف العملية أو تعديلها بعد حفظها؛ تصحيح العمليات المرحّلة يكون في الإدارة المركزية.</p></div><div class="panel">
   <div class="stats"><div class="stat"><b>${this.state.ops.length}</b><small>المحفوظة</small></div><div class="stat"><b>${this.pending.length}</b><small>غير مستلمة</small></div><div class="stat"><b>${this.state.ops.length-this.pending.length}</b><small>مؤكدة</small></div></div>
   ${this.state.ops.length?this.state.ops.slice().reverse().map((o,i)=>`<div class="itemrow"><div class="itemhead"><span>${this.escape(o.localNumber)} · ${o.kind==='sale'?'مبيعات':o.kind==='sale_return'?'مردود':o.kind==='receipt'?'قبض':'دفع'}</span><span class="pill ${this.state.knownIds.includes(o.id)?'':'wait'}">${this.state.knownIds.includes(o.id)?'مزامنة مؤكدة':'بانتظار المزامنة'}</span></div>
   <p class="tiny">${this.escape(o.date.slice(0,16))} · ${this.escape(this.state.accounts.find(x=>x.id===o.accountId)?.name||'نقدي')}</p>
   <div class="row"><b>${o.kind==='sale'||o.kind==='sale_return'?o.rows.reduce((sum,r)=>sum+r.total,0):o.amount} ${o.currency}</b><button class="secondary" style="margin:0" onclick="Agent.printOp('${o.id}')">طباعة</button></div></div>`).join(''):'<p class="muted">لم تُسجّل عمليات بعد.</p>'}</div>`;},
  renderSync(){return `<div class="hero"><h2>المزامنة المحلية الآمنة</h2><p>لا يلزم الإنترنت. يمكنك نقل الملفات عبر Quick Share أو Bluetooth أو وسيط USB. أكد استلامها باستيراد ملف ACK من المحاسب الرئيسي.</p></div>
   <div class="panel"><h3>العمليات الجديدة</h3><div class="stats"><div class="stat"><b>${this.pending.length}</b><small>بانتظار الاستلام</small></div><div class="stat"><b>${this.state.ops.length-this.pending.length}</b><small>تم تأكيدها</small></div><div class="stat"><b>${this.state.items.length}</b><small>مواد معتمدة</small></div></div>
   <button class="primary" onclick="Agent.exportOutbox()" ${this.pending.length?'':'disabled'}>تصدير العمليات لإرسالها إلى الإدارة</button>
   <p class="tiny">التصدير وحده لا يعتبر مزامنة ناجحة. لن تتغير الحالة حتى يعود ملف تأكيد الاستلام من التطبيق الرئيسي.</p></div>
   <div class="panel"><h3>استلام تحديث الشركة أو تأكيد المزامنة</h3><input type="file" accept="application/json,.json" onchange="Agent.importFile(this)" class="field">
   <p class="tiny">يمكن استيراد بيانات جديدة للأسعار والمواد والعملاء بعد استلامها من الإدارة. تحفظ السجلات المحلية غير المزامنة كما هي.</p></div>
   <div class="panel"><h3>التجهيز والطباعة</h3><button class="secondary" onclick="Agent.choosePrinter()">اختيار طابعة البلوتوث</button><p class="tiny">تُطبع الفواتير من شاشة العمليات بعد حفظها.</p></div>`;},
  async activate(){const token=document.getElementById('agentLicenseInput')?.value.trim();
    if(!await FieldProtocol.verifyLicense(token,AGENT_LICENSE_PUBLIC_KEY,this.state.deviceId,this.state.companyId,this.state.agentId))return this.toast('الترخيص غير صحيح أو منتهي أو لجهاز آخر');
    this.state.license=token;try{await this.save();this.toast('تم تفعيل جهاز المندوب');await this.show('home');}catch(e){this.toast(e.message);}},
  async importFile(input){const f=input.files?.[0];if(!f)return;
    try{
      if(f.size>8_000_000)throw Error('الملف كبير جدًا');
      const e=JSON.parse(await f.text());if(e.format!==FieldProtocol.FORMAT)throw Error('صيغة غير مدعومة');
      const raw=JSON.parse(e.data||'null');
      if(raw?.kind==='provision'){
        const payload=await FieldProtocol.unseal(e,this.ready()?this.state.key:raw.key);
        if(this.ready() && (payload.companyId!==this.state.companyId||payload.agentId!==this.state.agentId||payload.key!==this.state.key))throw Error('لا يمكن تغيير الشركة أو المندوب أو مفتاح الاقتران على جهاز مرتبط مسبقًا');
        if(!Array.isArray(payload.items)||!Array.isArray(payload.accounts)||!payload.companyId||!payload.agentId)throw Error('ملف تجهيز ناقص');
        this.state={...this.state,companyId:payload.companyId,companyName:payload.companyName,agentId:payload.agentId,agentName:payload.agentName,vehicleName:payload.vehicleName,warehouseId:payload.warehouseId,key:payload.key,items:payload.items,accounts:payload.accounts,stock:payload.stock,snapshotIds:payload.knownIds||[],knownIds:Array.from(new Set([...(this.state.knownIds||[]),...(payload.knownIds||[])])),exchangeRate:payload.exchangeRate,issuedAt:payload.issuedAt};
        this.draft=[];this.currency='USD';await this.save();this.toast('استُلم كشف المواد والعملاء دون حذف العمليات القديمة');await this.show('home');
      }else if(raw?.kind==='ack'){
        if(!this.ready())throw Error('يجب ربط الجهاز أولًا');
        const ack=await FieldProtocol.unseal(e,this.state.key);
        if(ack.companyId!==this.state.companyId||ack.agentId!==this.state.agentId||!Array.isArray(ack.knownIds))throw Error('تأكيد استلام لشركة أخرى');
        const own=new Set(this.state.ops.map(o=>o.id));
        this.state.knownIds=Array.from(new Set([...this.state.knownIds,...ack.knownIds.filter(id=>own.has(id))]));
        await this.save();this.toast('تم تأكيد استلام العمليات لدى الإدارة');await this.show('sync');
      }else throw Error('نوع الملف غير معروف');
    }catch(err){this.toast('تعذر استيراد الملف: '+err.message);}finally{input.value='';}
  },
  async exportOutbox(){try{
    if(!this.ready())throw Error('المندوب غير مرتبط بالشركة');
    const operations=this.pending;if(!operations.length)throw Error('لا توجد عمليات جديدة');
    const data={kind:'operations',companyId:this.state.companyId,agentId:this.state.agentId,warehouseId:this.state.warehouseId,issuedAt:new Date().toISOString(),operations};
    await this.saveFile('TA_Ops_'+this.state.agentId+'_'+Date.now()+'.json',await FieldProtocol.seal(data,this.state.key));
    this.toast('تم تجهيز ملف العمليات. أرسله إلى المسؤول ثم استورد ملف التأكيد.');
  }catch(err){this.toast(err.message);}},
  async saveFile(name, data){const raw=JSON.stringify(data,null,2);if(window.AndroidFiles?.saveBackup){window.AndroidFiles.saveBackup(raw,name);return;}
    const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);},
  copy(s){if(navigator.clipboard?.writeText)navigator.clipboard.writeText(s).then(()=>this.toast('تم نسخ المعرف')).catch(()=>this.toast('يمكنك تحديد ونسخ المعرف يدويًا'));else this.toast('انسخ المعرف من الحقل بالأعلى');},
  choosePrinter(){if(window.AndroidPrinter?.choosePrinter)window.AndroidPrinter.choosePrinter();else this.toast('الطابعة الحرارية متاحة في نسخة Android بعد البناء');},
  async printOp(id){const o=this.state.ops.find(x=>x.id===id);if(!o)return;
    if(!window.AndroidPrinter?.printBase64){this.toast('الطباعة الحرارية تحتاج نسخة Android');return;}
    try{
      const width=576,lines=[this.state.companyName,'فاتورة المندوب: '+this.state.agentName,'السيارة: '+this.state.vehicleName,o.localNumber+'  '+o.date.slice(0,16),'----------------------------------'];
      if(o.rows){o.rows.forEach((r,i)=>lines.push((i+1)+' - '+r.itemName+'  '+r.qty+' '+r.unitName+'  '+r.total+' '+o.currency));lines.push('----------------------------------');lines.push('الإجمالي: '+o.rows.reduce((a,r)=>a+r.total,0)+' '+o.currency);lines.push('نقداً: '+o.paidAmount+' '+o.currency);}else lines.push('سند '+(o.kind==='receipt'?'قبض':'دفع')+' : '+o.amount+' '+o.currency);
      const lh=43,height=lines.length*lh+65,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#000';ctx.textAlign='center';ctx.direction='rtl';ctx.font='bold 23px system-ui';
      lines.forEach((line,i)=>ctx.fillText(line,width/2,40+i*lh,550));
      const pixels=ctx.getImageData(0,0,width,height).data,bytes=[27,64];
      for(let y=0;y<height;y+=240){const h=Math.min(240,height-y);bytes.push(29,118,48,0,72,0,h&255,h>>8);
        for(let row=y;row<y+h;row++)for(let x=0;x<width;x+=8){let b=0;for(let bit=0;bit<8;bit++){const z=(row*width+x+bit)*4;const g=(pixels[z]+pixels[z+1]+pixels[z+2])/3;if(g<175)b|=(1<<(7-bit));}bytes.push(b);}}
      bytes.push(10,10,10);let binary='';for(let i=0;i<bytes.length;i+=5000)binary+=String.fromCharCode(...bytes.slice(i,i+5000));window.AndroidPrinter.printBase64(btoa(binary));this.toast('تم إرسال الفاتورة للطباعة');
    }catch(e){this.toast('تعذر تجهيز الفاتورة: '+e.message);}
  }
};
window.__nativePrinterEvent=function(kind,msg){Agent.toast(msg||kind);};
window.onload=async()=>{await Agent.init();if(Agent.state&&Agent.ready()&&await Agent.active()&&Agent.screen==='invoice')Agent.paintUnits();};
// Ensure unit choices after rendering a new invoice view.
const originalShow=Agent.show.bind(Agent);Agent.show=async function(where){await originalShow(where);if(where==='invoice'&&this.ready()){this.paintUnits();}};
