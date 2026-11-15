/* 3.5.89 — authenticated staff rights and employee-owned account PDF statements. */
(function(){'use strict';
const A=Agent,all=['priceTier','currency','balances','editPrices','exchangeRate','stock','createAccounts','createItems','editOperations','deleteOperations'];
const fallback={priceTier:true,currency:true,balances:true,editPrices:false,exchangeRate:false,stock:true,createAccounts:true,createItems:false,editOperations:true,deleteOperations:false};
A.can=function(k){const p=this.state?.permissions;return all.includes(k)&&((p&&typeof p==='object')?p[k]===true:fallback[k]===true);};
A.requireRight=function(k){if(this.can(k))return true;this.toast('هذه الصلاحية غير ممنوحة من التطبيق الرئيسي. اطلب تحديث الصلاحيات ثم قم بالمزامنة.');return false;};
function guard(key,method){if(typeof A[method]!=='function')return;const original=A[method].bind(A);A[method]=function(...args){if(!this.requireRight(key))return;return original(...args);};}
guard('currency','changeInvoiceCurrency');guard('currency','toggleVoucherCurrency');guard('currency','reprice');
guard('editOperations','editDocument');guard('createAccounts','openCustomerForm');guard('createAccounts','saveNewCustomer');
guard('stock','showMoreStock');
const change=A.changeRowValue.bind(A);
A.changeRowValue=function(i,key,v){if(key==='price'&&!this.requireRight('editPrices'))return;return change(i,key,v);};
const oldSavePos=A.savePosSettings?.bind(A);
if(oldSavePos)A.savePosSettings=function(){
  const tier=document.getElementById('agentPosTier')?.value;
  if(!this.can('priceTier')&&tier!==undefined&&tier!==(this.state.posPriceTier||'account'))return this.requireRight('priceTier');
  return oldSavePos();
};
const oldPrice=A.unitPrice?.bind(A);
if(oldPrice)A.unitPrice=function(item,unit,currency){
  if(this.can('priceTier')||!this.posMode)return oldPrice(item,unit,currency);
  const previous=this.posMode;this.posMode=false;
  try{return oldPrice(item,unit,currency);}finally{this.posMode=previous;}
};
const renderSettings=A.renderSettings?.bind(A);
if(renderSettings)A.renderSettings=function(){let html=renderSettings();if(!this.can('priceTier'))html=html.replace(/(<select[^>]*id="agentPosTier"[^>]*)(>)/,'$1 disabled title="صلاحية مقفلة من الرئيسي"$2');return html;};
const renderInvoice=A.renderInvoice.bind(A);
A.renderInvoice=function(){let html=renderInvoice();
 if(!this.can('currency'))html=html.replace(/onclick="Agent.changeInvoiceCurrency\(\)"/g,'disabled title="صلاحية تغيير العملة غير متاحة"').replace(/onclick="Agent.toggleVoucherCurrency\(\)"/g,'disabled title="صلاحية تغيير العملة غير متاحة"');
 if(!this.can('editPrices'))html=html.replace(/(<input[^>]+oninput="Agent.changeRowValue\(\d+,'price',this.value\)"[^>]*)(>)/g,'$1 disabled title="تعديل السعر يحتاج صلاحية من الرئيسي"$2').replace(/(<input[^>]+onchange="Agent.changeRowValue\(\d+,'price',this.value\);Agent.show\('invoice'\)"[^>]*)(>)/g,'$1 disabled title="تعديل السعر يحتاج صلاحية من الرئيسي"$2');
 if(!this.can('createAccounts'))html=html.replace(/<button[^>]+onclick="Agent.openCustomerForm\('invoice'\)"[^>]*>[^<]*<\/button>/g,'');
 return html;
};
const renderVoucher=A.renderVoucher.bind(A);
A.renderVoucher=function(){let html=renderVoucher();if(!this.can('currency'))html=html.replace(/onclick="Agent.toggleVoucherCurrency\(\)"/g,'disabled title="صلاحية تغيير العملة غير متاحة"');return html;};
const renderStock=A.renderStock.bind(A);
A.renderStock=function(){return this.can('stock')?renderStock():'<div class="panel">ليس لديك صلاحية مراقبة الجرد.</div>';};
const renderHome=A.renderHome.bind(A);
A.renderHome=function(){let html=renderHome();if(!this.can('stock'))html=html.replace(/<button[^>]*onclick="Agent.show\('stock'\)"[\s\S]*?<\/button>/g,'');return html;};
const balance=A.balanceFor?.bind(A);
if(balance)A.balanceFor=function(id){return this.can('balances')?balance(id):{available:false,syp:null,usd:null};};
const renderAccounts=A.renderAccounts?.bind(A);
if(renderAccounts)A.renderAccounts=function(){
 if(!this.can('balances'))return '<div class="panel"><h3>أرصدة الحسابات</h3><p>لم تمنحك الإدارة صلاحية عرض أرصدة الحسابات.</p></div>';
 let html=renderAccounts();if(!this.can('createAccounts'))html=html.replace(/<button[^>]*onclick="Agent.openCustomerForm\('accounts'\)"[\s\S]*?<\/button>/g,'');return html;
};
const accountRows=A.accountRowsHTML?.bind(A);
if(accountRows)A.accountRowsHTML=function(rows){let html=accountRows(rows);if(!this.can('balances'))return '<div class="panel">الأرصدة غير متاحة وفق صلاحيات الإدارة.</div>';
 return html+((rows||[]).length?'<section class="panel"><h4>كشف حساب تفصيلي PDF</h4>'+(rows||[]).map(x=>'<button type="button" class="secondary" onclick="Agent.openAccountStatement(\''+this.escape(x.id)+'\')">📄 كشف '+this.escape(x.name)+'</button>').join('')+'</section>':'');
};
A.statementAccountId='';A.statementFrom='';A.statementTo='';
A.openAccountStatement=function(id){if(!this.requireRight('balances'))return;this.statementAccountId=id;this.statementFrom='';this.statementTo='';this.navigate('account_statement');};
A.statementDatesChanged=function(){this.statementFrom=document.getElementById('employeeStatementFrom')?.value||'';this.statementTo=document.getElementById('employeeStatementTo')?.value||'';if(this.statementFrom&&this.statementTo&&this.statementTo<this.statementFrom){this.toast('تاريخ النهاية قبل البداية');return;}this.show('account_statement');};
A.statementModel=function(){
 const id=this.statementAccountId,acc=(this.state.accounts||[]).find(x=>x.id===id);
 if(!acc)throw Error('الحساب غير موجود');
 if(!this.can('balances'))throw Error('ليس لديك صلاحية معرفة رصيد الحساب');
 const ledger=(this.state.accountLedgers||[]).find(x=>x.accountId===id);
 if(!ledger?.complete || !Array.isArray(ledger.entries))throw Error('كشف الحركات التاريخية غير مكتمل؛ حدّث البيانات من الرئيسي أو أصدر الكشف منه. لن يُحسب رصيد مدوّر غير مؤكد.');
 const data=AccountStatementPeriod.build(ledger.entries,this.statementFrom,this.statementTo);
 return {account:acc,data};
};
A.renderAccountStatement=function(){let pair;
 try{pair=this.statementModel();}catch(err){return '<section class="panel"><h3>كشف الحساب التفصيلي</h3><p class="tiny" style="color:#9f1239">'+this.escape(err.message)+'</p><button class="secondary" onclick="Agent.navigate(\'accounts\')">رجوع</button></section>';}
 const x=pair.data,acc=pair.account;
 return '<div class="hero"><h2>كشف حساب: '+this.escape(acc.name)+'</h2><p>كشف محفوظ من الرئيسي؛ لا تُغيّر معاملات العملات التاريخية</p></div>'+
 '<section class="panel"><h3>فترة التقرير</h3><div class="grid"><label>من<input class="field" id="employeeStatementFrom" type="date" value="'+this.escape(this.statementFrom)+'" onchange="Agent.statementDatesChanged()"></label><label>إلى<input class="field" id="employeeStatementTo" type="date" value="'+this.escape(this.statementTo)+'" onchange="Agent.statementDatesChanged()"></label></div>'+
 '<p class="tiny">الرصيد المدور — USD: '+this.escape(AccountStatementPeriod.fmt(x.opening.USD,'USD'))+' / ل.س: '+this.escape(AccountStatementPeriod.fmt(x.opening.SYP,'SYP'))+'</p>'+
 '<p class="tiny" style="font-weight:bold">الرصيد النهائي — USD: '+this.escape(AccountStatementPeriod.fmt(x.ending.USD,'USD'))+' / ل.س: '+this.escape(AccountStatementPeriod.fmt(x.ending.SYP,'SYP'))+'</p>'+
 '<button class="primary" onclick="Agent.shareAccountStatementPdf()">📄 مشاركة كشف حساب PDF</button></section>'+
 '<section class="panel"><h3>الحركات ('+x.rows.length+')</h3>'+x.rows.map(e=>'<div class="itemrow" style="border-right:4px solid '+(e.debitExact==='0'?'#ba1d30':'#14743d')+'"><b>'+this.escape(e.ref)+'</b><p class="tiny">'+this.escape(e.date)+' — '+this.escape(e.desc)+'</p><p class="tiny">سعر الصرف: '+this.escape(e.rate||'غير مسجل')+'</p><div>'+this.escape(e.debitExact==='0'?'- '+AccountStatementPeriod.fmt(e.creditExact,e.currency):'+ '+AccountStatementPeriod.fmt(e.debitExact,e.currency))+'</div><b>الرصيد: '+this.escape(AccountStatementPeriod.fmt(e.balanceExact,e.currency))+'</b></div>').join('')+'</section>';
};
A.shareAccountStatementPdf=function(){
 let pair;try{pair=this.statementModel();}catch(err){this.toast(err.message);return false;}
 if(!window.AndroidReports?.shareReport){this.toast('مشاركة PDF غير مدعومة في هذه النسخة');return false;}
 const d=pair.data,s=this.state;
 const p={reportType:'account_statement',title:'كشف حساب تفصيلي',companyName:s.companyName||'',companyPhone:s.companyPhone||'',companyAddress:s.companyAddress||'',companyLogo:s.companyLogo||'',footerNote:s.footerNote||'',accountName:pair.account.name,accountPhone:pair.account.phone||'',accountAddress:pair.account.address||'',range:'من '+(this.statementFrom||'البداية')+' إلى '+(this.statementTo||'اليوم'),opening:d.opening,ending:d.ending,
   rows:d.rows.map(e=>({date:e.date,reference:e.ref,detail:e.desc,rate:String(e.rate??''),currency:e.currency,debit:e.debitExact,credit:e.creditExact,balance:e.balanceExact})),createdAt:new Date().toISOString()};
 window.AndroidReports.shareReport(JSON.stringify(p),'Agent_Statement_'+this.escape(pair.account.id).replace(/[^\w-]/g,'_')+'.pdf');return true;
};
// The FX rate applied to any invoice is stored with that operation, even after future updates.
const originalSettings=A.renderSettings?.bind(A);
if(originalSettings)A.renderSettings=function(){const html=originalSettings(),rate=Number(this.state.exchangeRate)||0;
 return html+'<section class="panel"><h3>سعر الصرف المستخدم في العمليات</h3><p class="tiny">السعر الحالي: '+this.escape(String(rate))+' ل.س لكل دولار. يحتفظ كل مستند بسعر الصرف عند إنشائه.</p>'+
 (this.can('exchangeRate')?'<label>سعر صرف جديد (ل.س لكل دولار)<input type="number" step="any" min="0.000001" class="field ltr" id="employeeFxRate" value="'+this.escape(String(rate))+'" /></label><button type="button" class="primary" onclick="Agent.changeLocalExchangeRate()">تطبيق سعر الصرف على العمليات الجديدة</button>':'<p class="tiny">تعديل سعر الصرف مقفل من الرئيسي.</p>')+'</section>';
};
A.changeLocalExchangeRate=async function(){if(!this.requireRight('exchangeRate'))return;
 const n=Number(document.getElementById('employeeFxRate')?.value);
 if(!Number.isFinite(n)||n<=0||n>1e10)return this.toast('سعر الصرف يجب أن يكون رقماً موجباً صحيحاً');
 const oldRate=this.state.exchangeRate,oldOverride=this.state.exchangeRateOverride;
 try{this.state.exchangeRate=n;this.state.exchangeRateOverride=n;await this.save();this.toast('سُجّل سعر الصرف للعمليات الجديدة، ولن تتغير العمليات السابقة');await this.show('settings');}
 catch(e){this.state.exchangeRate=oldRate;this.state.exchangeRateOverride=oldOverride;this.toast('تعذر حفظ السعر: '+e.message);}
};
const oldHomeAdd=A.renderHome.bind(A);
A.renderHome=function(){let html=oldHomeAdd();if(this.can('createItems'))html+='\n<section class="panel"><button class="primary" type="button" onclick="Agent.openNewItemForm()">+ إضافة مادة جديدة</button><p class="tiny">المادة الجديدة تنشأ برصيد صفري ويجب تزويد مستودع السيارة من الرئيسي قبل بيعها.</p></section>';return html;};
A.openNewItemForm=function(){if(!this.requireRight('createItems'))return;
 let modal=document.getElementById('agentItemCreateModal');if(!modal){modal=document.createElement('div');modal.id='agentItemCreateModal';modal.className='agent-picker-mask';document.body.appendChild(modal);}
 modal.innerHTML='<div class="agent-picker-content panel" style="max-width:480px" dir="rtl"><h3>إضافة مادة جديدة</h3><label>اسم المادة<input id="employeeItemName" class="field" maxlength="120" /></label><label>اسم الوحدة الأساسية<input id="employeeItemUnit" class="field" value="قطعة" maxlength="60" /></label><label>العملة<select id="employeeItemCurrency" class="field"><option value="USD">دولار USD</option><option value="SYP">ليرة سورية SYP</option></select></label><label>سعر البيع<input id="employeeItemPrice" class="field ltr" type="number" min="0" step="any" /></label><label>التكلفة<input id="employeeItemCost" class="field ltr" type="number" min="0" step="any" value="0" /></label><p class="tiny">الرصيد الافتتاحي صفر، ويمكن للإدارة تحديد مخزون المادة لاحقاً.</p><button class="primary" onclick="Agent.saveNewItem()">حفظ المادة وإرسالها بالمزامنة</button><button class="secondary" onclick="Agent.closeNewItemForm()">إلغاء</button></div>';
 modal.classList.remove('hide');document.getElementById('employeeItemName')?.focus();
};
A.closeNewItemForm=function(){document.getElementById('agentItemCreateModal')?.classList.add('hide');};
A.saveNewItem=async function(){if(!this.requireRight('createItems')||this.busy)return;this.busy=true;
 try{if(!await this.active())throw Error('يجب تفعيل الجهاز');
  const name=(document.getElementById('employeeItemName')?.value||'').trim().replace(/\s+/g,' ');
  const unitName=(document.getElementById('employeeItemUnit')?.value||'').trim();
  const currency=document.getElementById('employeeItemCurrency')?.value;
  const price=Number(document.getElementById('employeeItemPrice')?.value),cost=Number(document.getElementById('employeeItemCost')?.value||0);
  if(name.length<2||name.length>120||!unitName||unitName.length>60||!['USD','SYP'].includes(currency)||!Number.isFinite(price)||price<=0||!Number.isFinite(cost)||cost<0)throw Error('أدخل بيانات المادة والسعر بشكل صحيح');
  const op={id:'op_'+FieldProtocol.uuid(),kind:'item_create',date:new Date().toISOString(),companyId:this.state.companyId,agentId:this.state.agentId,warehouseId:this.state.warehouseId,
    localNumber:'I-'+(this.state.ops.length+1),currency,exchangeRate:Number(this.state.exchangeRate),item:{id:'itm_field_'+FieldProtocol.uuid(),name,category:'',currency,unitName,salePrice:price,costPrice:cost}};
  const verified=FieldProtocol.validateOps([op],this.state.agentId,this.state.companyId,this.state.warehouseId,this.state.items,this.state.accounts)[0];
  const before=this.state;this.state={...before,ops:[...before.ops,verified],items:[...before.items,verified.item]};
  try{await this.save();}catch(e){this.state=before;throw e;}
  this.closeNewItemForm();this.scheduleAutoSync?.(250);this.toast('تمت إضافة المادة برصيد صفري، وستصل إلى الرئيسي عند المزامنة');await this.show('home');
 }catch(e){this.toast('فشل إضافة المادة: '+e.message);}finally{this.busy=false;}
};
// Delete only unsynchronized locally generated operations. Posted ledger records are immutable
// from the phone and must be reversed or corrected by the manager to preserve double entry.
A.deleteLocalOperation=async function(id){if(!this.requireRight('deleteOperations'))return;
 if(this.lanSyncBusy)return this.toast('انتظر انتهاء المزامنة قبل حذف العمليات');
 const target=(this.state.ops||[]).find(x=>x.id===id);if(!target)return;
 if(this.state.knownIds.includes(id)||this.state.snapshotIds?.includes(id))return this.toast('العملية مرحّلة إلى الرئيسي؛ احذفها أو صححها من الإدارة للحفاظ على القيود المحاسبية');
 if(this.state.ops.some(o=>o.id!==id&&(o.targetOperationId===id||o.linkedInvoiceOpId===id||o.accountId===target.account?.id||o.rows?.some(r=>r.itemId===target.item?.id))))return this.toast('لا يمكن حذف هذه العملية لأنها مرتبطة بعملية أخرى');
 if(!confirm('حذف هذه العملية المحلية غير المرحّلة؟'))return;
 const old=this.state,ops=old.ops.filter(x=>x.id!==id),accounts=target.kind==='customer_create'?old.accounts.filter(x=>x.id!==target.account?.id):old.accounts;
 const items=target.kind==='item_create'?old.items.filter(x=>x.id!==target.item?.id):old.items;
 try{this.state={...old,ops,accounts,items};await this.save();this.toast('حُذفت العملية غير المرحّلة');this.show('ops');}
 catch(e){this.state=old;this.toast('فشل حذف العملية: '+e.message);}
};
const oldOpsView=A.renderOps.bind(A);
A.renderOps=function(){let html=oldOpsView();if(!this.can('deleteOperations'))return html;
 return html.replace(/(<button[^>]*onclick="Agent.printOp\('([^']+)'\)"[^>]*>[^<]*<\/button>)/g,
 (button,markup,id)=>{
   const op=this.state.ops.find(x=>x.id===id);
   return button+(op&&!this.state.knownIds.includes(id)?'<button type="button" class="secondary" style="margin:0;color:#a21d32" onclick="Agent.deleteLocalOperation(\''+id+'\')">حذف محلي</button>':'');
 });
};
const oldShow=A.show.bind(A);
A.show=async function(route){if(route==='account_statement'){
  if(!this.ready()||!await this.active())return oldShow('home');
  this.screen=route;document.getElementById('screen').innerHTML=this.renderAccountStatement();document.getElementById('agentScreenTitle').textContent='كشف حساب تفصيلي';return;
 }if(route==='stock'&&!this.can('stock')){this.toast('غير مسموح بمراقبة الجرد');return oldShow('home');}
 return oldShow(route);
};
})();
