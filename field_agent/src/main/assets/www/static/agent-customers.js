/* 3.5.42 — Create customers offline, then sync as append-only authenticated operations. */
(function(){
'use strict';
const A=Agent;
const norm=v=>String(v||'').trim().replace(/\s+/g,' ').toLocaleLowerCase();
const phone=v=>String(v||'').replace(/[\s()+-]/g,'');
A.customerDuplicate=function(newAccount,existing=this.state.accounts||[]){
 return existing.some(a=>a.type==='customer'&&norm(a.name)===norm(newAccount.name)&&(!a.phone||!newAccount.phone||phone(a.phone)===phone(newAccount.phone)));
};
A.mergeCustomerCatalog=function(catalog,old=this.state){
 const incoming=Array.isArray(catalog)?catalog.slice():[];
 const knownIds=new Set(old.knownIds||[]);
 const present=new Set(incoming.map(a=>a.id));
 for(const op of old.ops||[]){
  if(op.kind!=='customer_create'||knownIds.has(op.id)||!op.account||present.has(op.account.id))continue;
  incoming.push({...op.account,sypBalance:0,usdBalance:0,pendingSync:true});present.add(op.account.id);
 }
 return incoming;
};
A.openCustomerForm=function(context='home'){
 if(!this.state||!this.ready()){this.toast('اربط جهاز المندوب أولًا');return;}
 this.customerReturnContext=context;
 if(context==='invoice')this.captureInvoiceMeta?.();
 const modal=document.getElementById('agentNewCustomerModal');if(!modal)return;
 for(const id of ['agentCustomerName','agentCustomerPhone','agentCustomerAddress','agentCustomerTerms']){
  const field=document.getElementById(id);if(field)field.value='';
 }
 modal.classList.remove('hide');document.getElementById('agentCustomerName')?.focus();
};
A.closeCustomerForm=function(){document.getElementById('agentNewCustomerModal')?.classList.add('hide');this.customerReturnContext='';};
A.saveNewCustomer=async function(){if(this.busy)return;this.busy=true;
 try{
  if(!await this.active())throw Error('يجب تفعيل المندوب قبل إضافة زبون');
  const name=String(document.getElementById('agentCustomerName')?.value||'').trim().replace(/\s+/g,' '),
    phoneValue=String(document.getElementById('agentCustomerPhone')?.value||'').trim(),
    address=String(document.getElementById('agentCustomerAddress')?.value||'').trim(),
    paymentTerms=String(document.getElementById('agentCustomerTerms')?.value||'').trim();
  if(name.length<2||name.length>120)throw Error('أدخل اسم الزبون من حرفين إلى 120 حرفًا');
  if(phoneValue.length>50||address.length>500||paymentTerms.length>200)throw Error('بيانات الزبون أطول من المسموح');
  if(this.customerDuplicate({name,phone:phoneValue}))throw Error('يوجد حساب زبون مطابق؛ اختره بدلاً من إنشاء حساب مكرر');
  const date=new Date().toISOString();
  const account={id:'acc_field_'+FieldProtocol.uuid(),name,phone:phoneValue,address,paymentTerms,
    type:'customer',creditLimitUsd:0,openingSyp:0,openingUsd:0,priceTier:'settings',createdAt:date.slice(0,10),sypBalance:0,usdBalance:0,pendingSync:true};
  const op={id:'op_'+FieldProtocol.uuid(),kind:'customer_create',date,companyId:this.state.companyId,agentId:this.state.agentId,
    warehouseId:this.state.warehouseId,currency:'USD',exchangeRate:Number(this.state.exchangeRate),localNumber:'C-'+(this.state.ops.length+1),account};
  FieldProtocol.validateOps([op],this.state.agentId,this.state.companyId,this.state.warehouseId,this.state.items,this.state.accounts);
  const oldAccounts=this.state.accounts,oldOps=this.state.ops;
  this.state={...this.state,accounts:[...oldAccounts,account],ops:[...oldOps,op]};
  try{await this.save();}catch(e){this.state={...this.state,accounts:oldAccounts,ops:oldOps};throw e;}
  const from=this.customerReturnContext;
  this.closeCustomerForm();
  if(from==='invoice'){
    this.invoiceMeta={...this.invoiceMeta,accountId:account.id};
    await this.show('invoice');this.paintInvoiceAccountBalance?.();
  }else if(from==='voucher'){
    // Rebuild list in place; keep the entered voucher amounts/date/currency.
    const select=document.getElementById('vAcc');if(select){
      const opt=document.createElement('option');opt.value=account.id;opt.textContent=account.name;select.append(opt);select.value=account.id;
    }
  }else if(this.screen==='accounts')await this.show('accounts');
  else if(this.screen==='ops')await this.show('ops');
  this.toast('تمت إضافة الزبون وحفظه محليًا. سيصل إلى الرئيسي عند المزامنة.');
 }catch(e){this.toast('تعذر إضافة الزبون: '+e.message);}finally{this.busy=false;}
};
const previousBack=A.goBack.bind(A);
A.goBack=async function(){
 if(!document.getElementById('agentNewCustomerModal')?.classList.contains('hide')){this.closeCustomerForm();return;}
 return previousBack();
};
// Main customer list can also start a creation without leaving account balances.
const previousAccounts=A.renderAccounts?.bind(A);
if(previousAccounts)A.renderAccounts=function(){return '<button class="primary" onclick="Agent.openCustomerForm(\'accounts\')">+ إضافة حساب زبون جديد</button>'+previousAccounts();};
})();
