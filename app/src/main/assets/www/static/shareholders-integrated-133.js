/* Tiqany Acc 3.5.133 - Integrated shareholders, operating P&L and capital.
 * Shared browser/Android/Windows module.  Financial events are ID-based and
 * synchronized separately from invoices; no customer debt or expenses are forged.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.TiqanyShareholders=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const CURRENCIES=['SYP','USD'], P={SYP:1,USD:100};
 const clone=v=>JSON.parse(JSON.stringify(v));
 const fail=s=>{throw Error(s)};
 const datePart=d=>String(d||'').slice(0,10);
 const today=()=>new Date().toISOString().slice(0,10);
 const timestamp=()=>new Date().toISOString();
 const text=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&#39;'}[c]));
 const fixed=(amount,c)=>{if(!CURRENCIES.includes(c))fail('عملة غير صالحة');const n=Number(amount);
   if(!Number.isFinite(n)||n<0||n>1e12)fail('مبلغ غير صالح');
   return Math.round(n*P[c]);};
 const major=(n,c)=>Number(n||0)/P[c];
 const dateValid=d=>/^\d{4}-\d{2}-\d{2}$/.test(datePart(d))&&!Number.isNaN(Date.parse(datePart(d)))&&new Date(datePart(d)+'T00:00:00Z').toISOString().slice(0,10)===datePart(d);
 const uuid=()=>{const c=typeof globalThis!=='undefined'?globalThis.crypto:null;
   if(c?.randomUUID)return 'share_'+c.randomUUID();
   if(c?.getRandomValues){const b=new Uint8Array(16);c.getRandomValues(b);return 'share_'+Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');}
   if(typeof require==='function'){const crypto=require('node:crypto');return 'share_'+crypto.randomUUID();}
   fail('لا يتوفر مولد معرّفات آمن على هذا الجهاز');
 };
 function ensure(s){if(!s||typeof s!=='object')fail('حالة الشركة غير صالحة');
   if(!Array.isArray(s.shareholderOwners))s.shareholderOwners=[];
   if(!Array.isArray(s.shareholderMovements))s.shareholderMovements=[];
   if(!s.settings||typeof s.settings!=='object')s.settings={};
   if(!s.settings.shareholderDistribution||typeof s.settings.shareholderDistribution!=='object')s.settings.shareholderDistribution={values:{}};
   return s;
 }
 const owners=s=>ensure(s).shareholderOwners;
 const movements=s=>ensure(s).shareholderMovements;
 function owner(s,id){const o=owners(s).find(x=>x.id===id);if(!o)fail('المساهم غير موجود');return o}
 function validatePercentages(s,pct){
   if(!pct||typeof pct!=='object'||Array.isArray(pct))fail('توزيع الأرباح غير صالح');
   let sum=0;
   for(const o of owners(s)){const n=Number(pct[o.id]??0);
     if(!Number.isFinite(n)||n<0||n>100||Math.abs(n*10000-Math.round(n*10000))>1e-6)fail('نسبة غير صالحة: '+o.name);
     sum+=n;
   }
   if(sum>100.0000001)fail('مجموع نسب الأرباح أكبر من 100%');
   return sum;
 }
 function percentages(s){const values=ensure(s).settings.shareholderDistribution.values||{};
   const result={};for(const o of owners(s))result[o.id]=Number(values[o.id])||0;return result;
 }
 function addOwner(s,{name,phone='',period='all',startDate='',at=timestamp()}){
   const list=owners(s);name=String(name||'').trim();if(!name||name.length>120)fail('اسم المساهم مطلوب');
   if(list.some(o=>o.name===name))fail('اسم المساهم مكرر');
   if(!['all','added','date'].includes(period))fail('فترة احتساب الأرباح غير صالحة');
   if(period==='date'&&!dateValid(startDate))fail('تاريخ بدء الأرباح غير صالح');
   if(!dateValid(datePart(at)))fail('تاريخ الإضافة غير صالح');
   const o={id:uuid(),name,phone:String(phone||'').trim().slice(0,40),period,
     startDate:period==='all'?'0001-01-01':period==='added'?datePart(at):datePart(startDate),createdAt:at};
   list.push(o);return o;
 }
 function editOwner(s,id,{name,phone,period,startDate}={}){
   const list=owners(s),idx=list.findIndex(o=>o.id===id);
   if(idx<0)fail('المساهم غير موجود');
   const before=list[idx];
   const nextName=String(name??before.name).trim();
   const nextPhone=String(phone??before.phone??'').trim().slice(0,40);
   const nextPeriod=period??before.period;
   if(!nextName||nextName.length>120)fail('اسم المساهم مطلوب');
   if(list.some(o=>o.id!==id&&o.name===nextName))fail('اسم المساهم مكرر');
   if(!['all','added','date'].includes(nextPeriod))fail('فترة احتساب الأرباح غير صالحة');
   let nextDate=nextPeriod==='all'?'0001-01-01':nextPeriod==='added'?datePart(before.createdAt):datePart(startDate??before.startDate);
   if(!dateValid(nextDate))fail('تاريخ بدء احتساب الأرباح غير صالح');
   const next={...before,name:nextName,phone:nextPhone,period:nextPeriod,startDate:nextDate,updatedAt:timestamp()};
   list[idx]=next;
   try {validate(s)}catch(e){list[idx]=before;throw e}
   return next;
 }
 function rateFor(record,settings){const r=Number(record?.exchangeRate??record?.rate);
   return Number.isFinite(r)&&r>0?r:Math.max(Number(settings?.exchangeRate)||0,1)}
 function operatingEntries(s){
   ensure(s);const items=new Map((Array.isArray(s.items)?s.items:[]).filter(i=>i?.id).map(i=>[i.id,i]));
   const rows=[];
   for(const inv of (Array.isArray(s.invoices)?s.invoices:[])){
     if(!inv||!['sale','sale_return'].includes(inv.type)||!dateValid(datePart(inv.date)))continue;
     const sign=inv.type==='sale_return'?-1:1,rate=rateFor(inv,s.settings),invoiceCur=inv.currency||'SYP';
     let usd=0;
     for(const r of (Array.isArray(inv.rows)?inv.rows:[])){
       if(!r||typeof r!=='object')continue;
       const it=items.get(r.itemId);if(!it)continue;
       const unit=(Array.isArray(it.units)?it.units:[]).find(x=>x?.name===r.unitName) || (Array.isArray(it.units)?it.units[0]:null) || {};
       const qty=Number(r.qty)||0;
       const unitCost=Number(r.baseCostPrice??unit.costPrice??it.costPrice)||0;
       const unitCur=it.currency||invoiceCur;
       const costUsd=unitCur==='USD'?unitCost*qty:unitCost*qty/rate;
       const rowTotal=Number(r.total) || (qty*(Number(r.price)||0)-(Number(r.discount)||0));
       const revenueUsd=invoiceCur==='USD'?rowTotal:rowTotal/rate;
       usd+=sign*(revenueUsd-costUsd);
     }
     rows.push({id:'invoice:'+String(inv.id),date:datePart(inv.date),usdCents:Math.round(usd*100),type:'invoice'});
   }
   for(const exp of (Array.isArray(s.expenses)?s.expenses:[])){
     if(!exp||!dateValid(datePart(exp.date)))continue;
     const amt=Number(exp.amount)||0,rate=rateFor(exp,s.settings);
     const usd=exp.currency==='USD'?amt:amt/rate;
     rows.push({id:'expense:'+String(exp.id),date:datePart(exp.date),usdCents:-Math.round(usd*100),type:'expense'});
   }
   return rows;
 }
 function operatingProfit(s,start='0001-01-01'){
   return operatingEntries(s).filter(e=>e.date>=start).reduce((a,e)=>a+e.usdCents,0);
 }
 function contributed(s,ownerId,c){return movements(s).filter(e=>e.ownerId===ownerId&&e.currency===c&&['contribution','returnCapital'].includes(e.type))
   .reduce((a,e)=>a+(e.type==='contribution'?e.units:-e.units),0);}
 function retainedCapital(s,c){return owners(s).reduce((a,o)=>a+contributed(s,o.id,c),0)}
 function capitalTransferNet(s,c){return (Array.isArray(s.capitalMovements)?s.capitalMovements:[])
   .filter(e=>e?.currency===c&&['receive','pay'].includes(e.direction))
   .reduce((a,e)=>a+Math.round((Number(e.amount)||0)*P[c])*(e.direction==='receive'?1:-1),0);}
 function reserve(s,c){return retainedCapital(s,c)-capitalTransferNet(s,c)}
 function profitDrawn(s,ownerId){return movements(s).filter(e=>e.ownerId===ownerId&&e.type==='profitDraw')
   .reduce((a,e)=>a+e.usdCents,0);}
 function accrued(s,o){const pct=percentages(s)[o.id]||0;return Math.round(operatingProfit(s,o.startDate)*pct/100)}
 function availableProfit(s,o){return accrued(s,o)-profitDrawn(s,o.id)}
 function validate(s,{allowLegacyReserve=true}={}){
   ensure(s);const ids=new Set();
   for(const o of owners(s)){if(ids.has(o.id))fail('معرّف مساهم مكرر');ids.add(o.id);
     if(!o.name||!['all','added','date'].includes(o.period)||!dateValid(o.startDate))fail('بيانات مساهم غير صالحة');}
   const pct=percentages(s);validatePercentages(s,pct);
   const seen=new Set();
   for(const e of movements(s)){
     if(!e||!e.id||seen.has(e.id))fail('حركة مساهم مكررة');seen.add(e.id);
     if(!['contribution','returnCapital','profitDraw'].includes(e.type)||!ids.has(e.ownerId)||!CURRENCIES.includes(e.currency)||!Number.isSafeInteger(e.units)||e.units<=0||!dateValid(e.date))fail('سجل حركة مساهم غير صالح');
     if(e.type==='profitDraw'&&(!Number.isSafeInteger(e.usdCents)||e.usdCents<=0))fail('قيمة سحب الأرباح غير صالحة');
   }
   for(const o of owners(s)){
     for(const c of CURRENCIES)if(contributed(s,o.id,c)<0)fail('رصيد مساهمة سالب: '+o.name);
     if(availableProfit(s,o)<0)fail('سحب الأرباح يتجاوز الربح المستحق: '+o.name);
   }
   if(!allowLegacyReserve)for(const c of CURRENCIES)if(reserve(s,c)<0)fail('رصيد رأس المال المتاح غير كافٍ: '+c);
   return true;
 }
 function setDistribution(s,values,{deviceId='manager',at=timestamp(),changeId=uuid()}={}){
   ensure(s);const normalized={};for(const o of owners(s))normalized[o.id]=Number(values[o.id]??0);
   validatePercentages(s,normalized);
   const previous=clone(s.settings.shareholderDistribution);
   s.settings.shareholderDistribution={values:normalized,updatedAt:at,deviceId,changeId};
   try{validate(s)}catch(e){s.settings.shareholderDistribution=previous;throw e}
   return percentages(s);
 }
 function event(s,{type,ownerId,currency='USD',amount,rate,date=today(),note='',id=null},opts={}){
   ensure(s);if(!['contribution','returnCapital','profitDraw'].includes(type))fail('نوع حركة مساهم غير صالح');
   owner(s,ownerId);const units=fixed(amount,currency);if(!units)fail('المبلغ أصغر من أصغر وحدة عملة');
   if(!dateValid(date))fail('التاريخ غير صالح');const fx=Number(rate||s.settings.exchangeRate);
   if(!Number.isFinite(fx)||fx<=0)fail('سعر الصرف غير صالح');
   const usdCents=currency==='USD'?units:Math.round(units*100/fx);
   if(type==='profitDraw'&&usdCents<=0)fail('سحب الأرباح أقل من وحدة الدولار المحاسبية');
   const item={id:id||uuid(),ownerId,type,currency,units,rate:fx,usdCents,date:datePart(date),note:String(note||'').slice(0,200),createdAt:timestamp()};
   s.shareholderMovements.push(item);
   try{
     validate(s,{allowLegacyReserve:true});
     if(type==='returnCapital'&&reserve(s,currency)<0)fail('رأس المال المتاح للسحب غير كافٍ');
     if(type==='profitDraw'&&opts.availableCash!==undefined&&major(units,currency)>Number(opts.availableCash)+1e-5)fail('رصيد الصندوق غير كافٍ لسحب الأرباح');
   }catch(e){s.shareholderMovements.pop();throw e}
   return item;
 }
 function editEvent(s,id,patch,opts={}){
   const list=movements(s),idx=list.findIndex(e=>e.id===id);if(idx<0)fail('الحركة غير موجودة');
   const old=list[idx];list.splice(idx,1);
   try{const next=event(s,{...old,...patch,id:old.id,amount:patch.amount??major(old.units,old.currency),type:old.type,ownerId:old.ownerId},opts);
     next.createdAt=old.createdAt;next.updatedAt=timestamp();return next;
   }catch(e){list.splice(idx,0,old);throw e}
 }
 function deleteEvent(s,id){const list=movements(s),idx=list.findIndex(e=>e.id===id);if(idx<0)fail('الحركة غير موجودة');
   const old=list.splice(idx,1)[0];try{validate(s)}catch(e){list.splice(idx,0,old);throw e}return old;
 }
 function cashMovements(s){return movements(s).filter(e=>e.type==='profitDraw').map(e=>({
   id:e.id,docType:'shareholder',date:e.date,ref:'سحب أرباح مساهم',
   party:owners(s).find(o=>o.id===e.ownerId)?.name||'مساهم',desc:e.note||'توزيع أرباح للمساهم',
   currency:e.currency,inflow:0,outflow:major(e.units,e.currency)
 }))}
 function report(s){ensure(s);
   const prof=operatingProfit(s),draws=movements(s).filter(e=>e.type==='profitDraw').reduce((a,e)=>a+e.usdCents,0);
   return {operatingProfitUSD:prof/100,profitDrawnUSD:draws/100,remainingProfitUSD:(prof-draws)/100,
     capital:{USD:major(retainedCapital(s,'USD'),'USD'),SYP:major(retainedCapital(s,'SYP'),'SYP')},
     reserve:{USD:major(reserve(s,'USD'),'USD'),SYP:major(reserve(s,'SYP'),'SYP')},
     owners:owners(s).map(o=>({id:o.id,name:o.name,phone:o.phone,startDate:o.startDate,percentage:percentages(s)[o.id]||0,
       contributionUSD:major(contributed(s,o.id,'USD'),'USD'),contributionSYP:major(contributed(s,o.id,'SYP'),'SYP'),
       earnedUSD:accrued(s,o)/100,drawnUSD:profitDrawn(s,o.id)/100,
       availableUSD:availableProfit(s,o)/100}))};
 }
 function mergeShareholderSettings(a,b,syncAt=timestamp()){
   if(!a)return b?clone(b):null;if(!b)return clone(a);
   const t=Date.parse(syncAt);if(!Number.isFinite(t))fail('وقت المزامنة غير صالح');
   const score=x=>{const v=Date.parse(x.updatedAt||'');return Number.isFinite(v)&&v<=t+30000?-Math.abs(t-v):-Infinity};
   const aa=score(a),bb=score(b);if(aa!==bb)return clone(aa>bb?a:b);
   const ka=String(a.deviceId||'')+'|'+String(a.changeId||'')+'|'+JSON.stringify(a.values);
   const kb=String(b.deviceId||'')+'|'+String(b.changeId||'')+'|'+JSON.stringify(b.values);
   return clone(ka>=kb?a:b);
 }
 return {ensure,owners,movements,owner,percentages,addOwner,editOwner,setDistribution,event,editEvent,deleteEvent,
   operatingEntries,operatingProfit,accrued,availableProfit,profitDrawn,contributed,retainedCapital,reserve,
   cashMovements,report,validate,mergeShareholderSettings,fixed,major,text,uuid};
});
(function(root){
 'use strict';
 if(typeof document==='undefined'||typeof State==='undefined'||!root.TiqanyShareholders)return;
 const S=root.TiqanyShareholders;
 const $=id=>document.getElementById(id);
 const safe=S.text;
 const today=()=>new Date().toISOString().slice(0,10);
 const format=(n,c)=>typeof Accounting!=='undefined'?Accounting.format(n,c):String(n)+' '+c;
 let busy=false;
 let ownerEditApproval=null;
 const ok=message=>UI.toast(message,'success');
 const problem=e=>UI.toast(String(e?.message||e),'error');
 const btn=(act,label,extra='')=>'<button type="button" class="ta-share-btn" data-ta-action="'+safe(act)+'" '+extra+'>'+label+'</button>';
 const ownerButton=(act,id,label)=>btn(act,label,'data-ta-id="'+safe(id)+'"');
 const modal=(html)=>{
   UI.openModal('<div dir="rtl" class="ta-share-modal">'+html+'</div>');
   const m=$('modalBox')||document;
   m.querySelectorAll('[data-ta-action]').forEach(b=>b.addEventListener('click',()=>UIShareholders.action(b.dataset.taAction,b.dataset.taId)));
 };
 const formValue=id=>$(id)?.value;
 const moneyLabels={contribution:'إضافة مبلغ إلى رأس المال',returnCapital:'سحب مبلغ من رأس المال',profitDraw:'سحب الأرباح'};
 const UIShareholders={
  _levels:[],_level:null,_backNavigation:false,
  _enter(kind,id=null){
   const old=this._level;
   if(!this._backNavigation&&old&&(old.kind!==kind||old.id!==id))this._levels.push(old);
   this._level={kind,id};
  },
  back(){
   const previous=this._levels.pop();
   if(!previous){this._level=null;UI.requestCloseModal();return true;}
   this._backNavigation=true;
   try {
    if(previous.kind==='root')this.open(true);
    else if(previous.kind==='owner')this.ownerForm(previous.id);
    else if(previous.kind==='percentages')this.percentagesForm();
    else if(previous.kind==='addOwner')this.addOwnerForm();
    else this.open(true);
   }finally{this._backNavigation=false;}
   return true;
  },
  open(fromBack=false){
   if(!fromBack){this._levels=[];this._level=null;}
   this._enter('root');
   S.ensure(State);const r=S.report(State);
   const money=(v,c)=>'<strong dir="ltr">'+safe(format(v,c))+'</strong>';
   const ownerHtml=r.owners.map(o=>'<article class="ta-share-owner"><strong>'+safe(o.name)+'</strong><small>بدء احتساب الأرباح: '+safe(o.startDate)+' • النسبة '+safe(o.percentage)+'%</small>'+
      '<div>رأس المال USD '+money(o.contributionUSD,'USD')+'</div><div>رأس المال SYP '+money(o.contributionSYP,'SYP')+'</div>'+
      '<div>الأرباح المسحوبة '+money(o.drawnUSD,'USD')+'</div><div>الأرباح المتاحة '+money(o.availableUSD,'USD')+'</div>'+
      ownerButton('owner',o.id,'إدارة مساهم')+'</article>').join('');
   const metric=(name,value)=>'<div class="ta-share-metric"><span>'+name+'</span>'+value+'</div>';
   modal('<h2 class="ta-share-heading"><i class="fas fa-users"></i> رأس المال والمساهمون</h2>'+
    '<p class="ta-share-note">الأرباح تقديرية من فواتير البيع والمردودات والمصاريف المسجلة، وتحسب بسعر صرف العملية. المساهمات والمسحوبات لا تُسجّل مبيعات أو مصاريف أو ذمماً.</p>'+
    '<div class="ta-share-metrics">'+
       metric('رأس المال بالدولار',money(r.capital.USD,'USD'))+
       metric('رأس المال بالليرة',money(r.capital.SYP,'SYP'))+
       metric('الربح التشغيلي بعد المصاريف',money(r.operatingProfitUSD,'USD'))+
       metric('الأرباح المسحوبة',money(r.profitDrawnUSD,'USD'))+
       metric('المتبقي بعد توزيع الأرباح',money(r.remainingProfitUSD,'USD'))+
       metric('احتياطي رأس المال بالدولار',money(r.reserve.USD,'USD'))+
       metric('احتياطي رأس المال بالليرة',money(r.reserve.SYP,'SYP'))+
     '</div><div class="ta-share-actions">'+btn('addOwner','＋ إضافة مالك')+
       btn('percentages','٪ نسب توزيع الأرباح')+
       btn('capitalTransfer','↔ تحويل رأس المال والصندوق')+'</div>'+
     '<h3 class="ta-share-subheading">المساهمون</h3><div class="ta-share-owners">'+(ownerHtml||'<p>لا يوجد مساهمون بعد.</p>')+'</div>'+
     '<h3 class="ta-share-subheading">آخر حركات المساهمين</h3><div class="ta-share-history">'+
     (S.movements(State).slice().sort((a,b)=>String(b.createdAt||b.date).localeCompare(String(a.createdAt||a.date))).slice(0,40).map(e=>{
       const name=S.owner(State,e.ownerId).name;
       return '<div class="ta-share-entry"><span>'+safe(moneyLabels[e.type])+' - '+safe(name)+
         '<small>'+safe(e.date)+' • '+safe(e.note||'')+'</small></span><b>'+safe(format(S.major(e.units,e.currency),e.currency))+'</b>'+
         '<div class="ta-share-entry-actions">'+ownerButton('edit',e.id,'تعديل')+ownerButton('print',e.id,'طباعة')+ownerButton('delete',e.id,'حذف')+'</div></div>';
     }).join('')||'<p>لا توجد حركات بعد.</p>')+'</div>'+
     btn('close','إغلاق'));
  },
  action(type,id){
   if(type==='close')return UI.forceCloseModal();
   if(type==='addOwner')return this.addOwnerForm();
   if(type==='percentages')return this.percentagesForm();
   if(type==='owner')return this.ownerForm(id);
   if(type==='editOwner')return this.authorizeEditOwner(id);
   if(type==='capitalTransfer'){CapitalLedger._fromShareholders=true;return CapitalLedger.open();}
   if(type==='edit'){const e=S.movements(State).find(x=>x.id===id);return e&&this.operationForm(e.ownerId,e.type,e);}
   if(type==='print')return this.print(id);
   if(type==='delete')return this.remove(id);
   if(type==='back')return this.back();
   if(['contribution','returnCapital','profitDraw'].includes(type))return this.operationForm(id,type);
  },
  addOwnerForm(){
   this._enter('addOwner');
    modal('<h2 class="ta-share-heading">إضافة مساهم</h2>'+
      '<label>اسم المالك<input id="taShareName" maxlength="120" required></label>'+
      '<label>رقم الهاتف<input id="taSharePhone" type="tel" maxlength="40"></label>'+
      '<label>فترة احتساب الأرباح<select id="taSharePeriod"><option value="all">كل المدة</option><option value="added">من تاريخ الإضافة</option><option value="date">تاريخ محدد</option></select></label>'+
      '<label>تاريخ البداية عند اختيار تاريخ محدد<input id="taShareStart" type="date" value="'+today()+'"></label>'+
      '<div class="ta-share-actions">'+btn('saveOwner','حفظ المساهم')+btn('back','إلغاء')+'</div>');
    const b=document.querySelector('[data-ta-action="saveOwner"]');b.addEventListener('click',async()=>{
      if(busy)return;
      const before=S.owners(State).slice();
      try{S.addOwner(State,{name:formValue('taShareName'),phone:formValue('taSharePhone'),period:formValue('taSharePeriod'),startDate:formValue('taShareStart')});
       busy=true;await StorageEngine.saveState();busy=false;this.open();ok('تمت إضافة المساهم');}
      catch(e){State.shareholderOwners=before;busy=false;problem(e)}
    });
  },
  percentagesForm(){
   this._enter('percentages');
    const values=S.percentages(State);
    modal('<h2 class="ta-share-heading">النسبة المئوية لتوزيع الأرباح</h2>'+
      '<p class="ta-share-note">يجب ألا يتجاوز مجموع نسب جميع المساهمين 100%. حفظ النسب يتم كوحدة واحدة حتى لا تختلط نسب جهازين أثناء المزامنة.</p>'+
      S.owners(State).map(o=>'<label>'+safe(o.name)+' (%)<input type="number" min="0" max="100" step="0.0001" id="taSharePct_'+safe(o.id)+'" value="'+safe(values[o.id])+'"></label>').join('')+
      '<div class="ta-share-actions">'+btn('savePercentages','حفظ النسب')+btn('back','إلغاء')+'</div>');
    document.querySelector('[data-ta-action="savePercentages"]').addEventListener('click',async()=>{
      if(busy)return;let previous=JSON.parse(JSON.stringify(State.settings.shareholderDistribution));
      try{const changes=Object.fromEntries(S.owners(State).map(o=>[o.id,Number(formValue('taSharePct_'+o.id))]));
        S.setDistribution(State,changes,{deviceId:localDeviceId()});
        busy=true;await StorageEngine.saveState();busy=false;this.open();ok('حُفظ توزيع الأرباح');}
      catch(e){State.settings.shareholderDistribution=previous;busy=false;problem(e)}
    });
  },
  ownerForm(id){
   this._enter('owner',id);
    const o=S.owner(State,id);
    modal('<h2 class="ta-share-heading">'+safe(o.name)+'</h2>'+
      '<div class="ta-share-actions">'+ownerButton('contribution',id,'＋ إضافة مبلغ إلى رأس المال')+
      ownerButton('returnCapital',id,'− سحب مبلغ من رأس المال')+
      ownerButton('profitDraw',id,'↓ سحب من الأرباح')+
      ownerButton('editOwner',id,'<i class="fas fa-shield-halved" aria-hidden="true"></i> تعديل المساهم')+
      btn('back','رجوع')+'</div>');
  },
  authorizeEditOwner(id){
    S.owner(State,id);
    ownerEditApproval=null;
    const cfg=State.settings?.appProtection||{};
    if(!cfg.pinHash||!cfg.pinSalt){
      ProtectionController.promptPinSetup('تعديل بيانات المساهم');
      return;
    }
    ProtectionController.requestPin('تعديل بيانات المساهم محمي بالبصمة أو رمز المرور. يرجى التحقق قبل فتح بطاقة التعديل.',
      async proof=>{
        if(!proof)return;
        ownerEditApproval={id,createdAt:Date.now()};
        this.editOwnerForm(id);
      });
  },
  editOwnerForm(id){
    const allowed=ownerEditApproval&&ownerEditApproval.id===id&&Date.now()-ownerEditApproval.createdAt<90000;
    ownerEditApproval=null;
    if(!allowed)return problem(Error('يجب التحقق من البصمة أو رمز المرور أولاً'));
    this._enter('editOwner',id);
    const o=S.owner(State,id);
    modal('<h2 class="ta-share-heading"><i class="fas fa-user-shield"></i> تعديل المساهم</h2>'+
      '<p class="ta-share-note">هذه البطاقة محمية. تعديل تاريخ بداية الأرباح قد يغيّر الأرباح المستحقة، ولن يقبل النظام تغييراً يؤدي إلى سحب أكبر من المستحق.</p>'+
      '<label>اسم المالك<input id="taShareEditName" maxlength="120" value="'+safe(o.name)+'" required></label>'+
      '<label>رقم الهاتف<input id="taShareEditPhone" type="tel" maxlength="40" value="'+safe(o.phone||'')+'"></label>'+
      '<label>فترة احتساب الأرباح<select id="taShareEditPeriod">'+
      '<option value="all" '+(o.period==='all'?'selected':'')+'>كل المدة</option>'+
      '<option value="added" '+(o.period==='added'?'selected':'')+'>من تاريخ الإضافة</option>'+
      '<option value="date" '+(o.period==='date'?'selected':'')+'>تاريخ محدد</option></select></label>'+
      '<label>تاريخ البداية عند اختيار تاريخ محدد<input id="taShareEditStart" type="date" value="'+safe(o.period==='all'?'':o.startDate)+'"></label>'+
      '<div class="ta-share-actions">'+btn('saveOwnerEdit','حفظ تعديل المساهم')+
      ownerButton('owner',id,'رجوع إلى المساهم')+'</div>');
    document.querySelector('[data-ta-action="saveOwnerEdit"]').addEventListener('click',async()=>{
      if(busy)return;
      const old=JSON.parse(JSON.stringify(State.shareholderOwners));
      try {
        S.editOwner(State,id,{name:formValue('taShareEditName'),phone:formValue('taShareEditPhone'),
          period:formValue('taShareEditPeriod'),startDate:formValue('taShareEditStart')});
        busy=true;await StorageEngine.saveState();busy=false;
        this.ownerForm(id);ok('تم حفظ تعديل المساهم بعد التحقق من الحماية');
      }catch(e){State.shareholderOwners=old;busy=false;problem(e)}
    });
  },
  operationForm(ownerId,type,editing=null){
   this._enter('operation',ownerId);
    const o=S.owner(State,ownerId),c=editing?.currency||'USD',amt=editing?S.major(editing.units,editing.currency):'';
    modal('<h2 class="ta-share-heading">'+safe(moneyLabels[type])+' - '+safe(o.name)+'</h2>'+
      '<label>العملة<select id="taShareCur"><option value="USD" '+(c==='USD'?'selected':'')+'>دولار أمريكي</option><option value="SYP" '+(c==='SYP'?'selected':'')+'>ليرة سورية</option></select></label>'+
      '<label>المبلغ<input id="taShareAmount" type="number" step="any" min="0" value="'+safe(amt)+'"></label>'+
      '<label>سعر الصرف (ليرة لكل دولار)<input id="taShareRate" type="number" step="any" min="0.000001" value="'+safe(editing?.rate||State.settings.exchangeRate||15000)+'"></label>'+
      '<label>التاريخ<input id="taShareDate" type="date" value="'+safe(editing?.date||today())+'"></label>'+
      '<label>البيان<input id="taShareNote" maxlength="200" value="'+safe(editing?.note||'')+'"></label>'+
      '<div class="ta-share-actions">'+btn('saveOperation','حفظ السند')+btn('back','إلغاء')+'</div>');
    document.querySelector('[data-ta-action="saveOperation"]').addEventListener('click',async()=>{
      if(busy)return;const original=S.movements(State).map(e=>({...e}));
      const currency=formValue('taShareCur'),amount=Number(formValue('taShareAmount'));
      const opts={availableCash:type==='profitDraw'?officeCash(currency):undefined};
      try{
       const payload={currency,amount,rate:Number(formValue('taShareRate')),date:formValue('taShareDate'),note:formValue('taShareNote')};
       if(editing)S.editEvent(State,editing.id,payload,opts);
       else S.event(State,{...payload,ownerId,type},opts);
       busy=true;await StorageEngine.saveState();busy=false;this.open();AppNav.renderCurrent();ok('حُفظ السند وتحدّثت حسابات المساهمين');}
      catch(e){State.shareholderMovements=original;busy=false;problem(e)}
    });
  },
  async remove(id){
    if(busy||!confirm('تأكيد حذف حركة المساهم؟'))return;const old=S.movements(State).map(e=>({...e}));
    try{S.deleteEvent(State,id);busy=true;await StorageEngine.saveState();busy=false;this.open();AppNav.renderCurrent();ok('تم حذف السند');}
    catch(e){State.shareholderMovements=old;busy=false;problem(e)}
  },
  print(id){
    const e=S.movements(State).find(x=>x.id===id);if(!e)return;
    const o=S.owner(State,e.ownerId);
    const html='<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>سند مساهم</title>'+
      '<style>body{font:16px system-ui;margin:24px}main{max-width:540px;margin:auto}p{padding:9px;border-bottom:1px dashed #bbb}</style>'+
      '<main><h2>'+safe(State.settings.companyName||'المحاسب التقني')+'</h2><h3>'+safe(moneyLabels[e.type])+'</h3>'+
      '<p>رقم السند: '+safe(e.id)+'</p><p>التاريخ: '+safe(e.date)+'</p><p>المساهم: '+safe(o.name)+'</p>'+
      '<p>المبلغ: '+safe(format(S.major(e.units,e.currency),e.currency))+'</p>'+
      '<p>البيان: '+safe(e.note||'')+'</p></main></html>';
    const w=window.open('','_blank');
    if(!w){problem('يرجى السماح بفتح صفحة الطباعة');return}
    w.document.write(html);w.document.close();w.focus();w.print();
  }
 };
 function officeCash(c){try{const cash=typeof FieldCash!=='undefined'?FieldCash.summary('office'):
     Accounting.getCashboxSummary();return c==='USD'?cash.usdCash:cash.sypCash;}
   catch(_){return 0}}
 function localDeviceId(){try{const k='tiqany-shareholders-device';let id=localStorage.getItem(k);
    if(!id){id=S.uuid();localStorage.setItem(k,id)}return id;}catch(_){return S.uuid()}}
 // Escape follows the same hierarchy as the shareholder's visible Back button.
 document.addEventListener('keydown',e=>{
  if(e.key!=='Escape'&&e.key!=='BrowserBack')return;
  if(document.querySelector('#modalContainer:not(.hidden) .ta-share-modal')){
   e.preventDefault();e.stopImmediatePropagation();UIShareholders.back();
  }else if(document.querySelector('#modalContainer:not(.hidden) .ta-capital-modal')){
   e.preventDefault();e.stopImmediatePropagation();
   if(document.getElementById('capitalAmount'))CapitalLedger.open();
   else if(CapitalLedger._fromShareholders){
    CapitalLedger._fromShareholders=false;UIShareholders.open();
   }else UI.requestCloseModal();
  }
 },true);
 root.ShareholdersUI=UIShareholders;
 root.ShareholdersCashMovements=()=>S.cashMovements(State);
})(typeof globalThis==='object'?globalThis:this);
