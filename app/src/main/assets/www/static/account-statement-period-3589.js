/* 3.5.89 — precision-safe statement reports for any date interval. No mutations to the ledger. */
(function(root){'use strict';
 const SCALE=100000000n;
 // State, Accounting, AppNav and UI are top-level const declarations in index.html.
 // Global lexical bindings are intentionally not window properties, so window.State
 // and window.Accounting are undefined in a production WebView / Electron renderer.
 const getState=()=>typeof State!=='undefined'?State:root.State;
 const getAccounting=()=>typeof Accounting!=='undefined'?Accounting:root.Accounting;
 const getNavigation=()=>typeof AppNav!=='undefined'?AppNav:root.AppNav;
 const getUI=()=>typeof UI!=='undefined'?UI:root.UI;

 function parse(v){
   // Binary floating-point residue (0.1+0.2) is not a ninth decimal place.
   // But any meaningful fractional amount beyond eight digits is rejected, not silently rounded.
   let s=String(v??0).trim().replaceAll(',','');
   if(typeof v==='number'){
     if(!Number.isFinite(v)||Math.abs(v)>Number.MAX_SAFE_INTEGER)throw Error('مبلغ غير آمن حسابياً');
     const fixed=v.toFixed(8);
     if(Math.abs(v-Number(fixed))>1e-12)throw Error('عدد المنازل العشرية أكبر من دقة التقرير المدعومة (8)');
     s=fixed;
   }
   if(!/^[+-]?\d+(?:\.\d+)?$/.test(s)){
     const n=Number(s); if(!Number.isFinite(n))throw Error('مبلغ غير صالح');
     s=n.toFixed(8);if(Math.abs(n-Number(s))>1e-12)throw Error('عدد المنازل العشرية أكبر من دقة التقرير المدعومة (8)');
   }
   const neg=s[0]==='-';s=s.replace(/^[+-]/,'');const a=s.split('.');
   if((a[1]||'').length>8 && /[1-9]/.test((a[1]||'').slice(8)))throw Error('الحركة تتطلب أكثر من 8 منازل عشرية؛ لا يمكن تصديرها دون فقد الدقة');
   const n=BigInt(a[0]||0)*SCALE+BigInt(((a[1]||'').slice(0,8)).padEnd(8,'0'));
   return neg?-n:n;
 }
 function money(v,min=0){const x=typeof v==='bigint'?v:parse(v);let n=x<0n?-x:x;
   const whole=(n/SCALE).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');
   let frac=(n%SCALE).toString().padStart(8,'0').replace(/0+$/,'');
   frac=frac.padEnd(min,'0');return(x<0n?'-':'')+whole+(frac?'.'+frac:'');
 }
 function fmt(v,cur){return money(v,cur==='USD'?2:0)+' '+(cur==='SYP'?'ل.س':cur||'USD');}
 function day(v){return String(v||'').slice(0,10);}
 function build(entries,from='',to=''){
   if(from && !/^\d{4}-\d\d-\d\d$/.test(from))throw Error('تاريخ البداية غير صالح');
   if(to && !/^\d{4}-\d\d-\d\d$/.test(to))throw Error('تاريخ النهاية غير صالح');
   if(from&&to&&from>to)throw Error('تاريخ البداية بعد تاريخ النهاية');
   const opening={SYP:0n,USD:0n},end={SYP:0n,USD:0n},rows=[];
   (Array.isArray(entries)?entries.map((e,i)=>({...e,_originalIndex:i})).sort((a,b)=>day(a.date).localeCompare(day(b.date))||a._originalIndex-b._originalIndex):[]).forEach((e,index)=>{
     const c=e.currency==='SYP'?'SYP':'USD';const debit=parse(e.debit),credit=parse(e.credit),delta=debit-credit;
     const date=day(e.date);
     if(from && date<from){opening[c]+=delta;end[c]+=delta;return;}
     if(to && date>to)return;
     end[c]+=delta;
     rows.push({...e,sortIndex:index,deltaExact:money(delta),debitExact:money(debit),creditExact:money(credit),balanceExact:money(end[c]),balancePair:{SYP:money(end.SYP),USD:money(end.USD)}});
   });
   return {from,to,opening:{SYP:money(opening.SYP),USD:money(opening.USD)},ending:{SYP:money(end.SYP),USD:money(end.USD)},rows,entries:rows,
     sypBalance:Number(end.SYP)/1e8,usdBalance:Number(end.USD)/1e8,
     sypExact:money(end.SYP),usdExact:money(end.USD)};
 }
 function filter(ledger,from='',to=''){
   const result=build(ledger?.entries||[],from,to);
   const rate=Number(getState()?.settings?.exchangeRate||15000);
   result.evalSyp=result.sypBalance+result.usdBalance*rate;
   result.evalUsd=result.usdBalance+result.sypBalance/(rate||1);
   return result;
 }
 let dateUpdateTimer=null;
 function queueUpdate(id){
   // Date pickers may dispatch input before change. Update as soon as a full date is selected.
   if(dateUpdateTimer!==null)clearTimeout(dateUpdateTimer);
   const a=document.getElementById('statementFrom')?.value||'';
   const b=document.getElementById('statementTo')?.value||'';
   if((a&&!/^\d{4}-\d{2}-\d{2}$/.test(a))||(b&&!/^\d{4}-\d{2}-\d{2}$/.test(b)))return;
   dateUpdateTimer=setTimeout(()=>{dateUpdateTimer=null;update(id);},140);
 }
 function update(id){
   if(dateUpdateTimer!==null){clearTimeout(dateUpdateTimer);dateUpdateTimer=null;}
   const from=document.getElementById('statementFrom')?.value||'';
   const to=document.getElementById('statementTo')?.value||'';
   if(from&&to&&to<from){getUI()?.toast('تاريخ النهاية يجب ألا يسبق البداية','warn');return false;}
   const active=document.querySelector('[data-statement-eval].bg-emerald-500')?.dataset.statementEval||'DUAL';
   const scrollY=typeof root.scrollY==='number'?root.scrollY:0;
   const content=document.getElementById('mainContent');const innerScroll=content?.scrollTop||0;
   getNavigation()?.navigate('account_statement',{id,dateFrom:from,dateTo:to,evalMode:active},true);
   if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(()=>{
     if(content)content.scrollTop=innerScroll;
     if(typeof root.scrollTo==='function')root.scrollTo(0,scrollY);
   });
   return true;
 }
 function payload(account,entries,from='',to=''){
   const x=build(entries,from,to),s=getState()?.settings||{};
   return {reportType:'account_statement',title:'كشف حساب تفصيلي',companyName:String(s.companyName||''),companyPhone:String(s.companyPhone||''),companyAddress:String(s.companyAddress||''),companyLogo:String(s.companyLogo||''),companyEmail:String(s.companyEmail||''),footerNote:String(s.footerNote||''),accountName:account.name,accountPhone:account.phone||'',accountAddress:account.address||'',range:from||to?('من '+(root.TiqanyDateView?.visible(from)||'البداية')+' إلى '+(root.TiqanyDateView?.visible(to)||'اليوم')):'كامل الفترة',from,to,
    opening:x.opening,ending:x.ending,rows:x.rows.map(e=>({date:root.TiqanyDateView?.visible(e.date)||String(e.date||''),reference:String(e.ref||''),detail:String(e.desc||''),rate:String(e.rate??''),currency:e.currency==='SYP'?'SYP':'USD',debit:e.debitExact,credit:e.creditExact,balance:e.balanceExact})),createdAt:new Date().toISOString()};
 }
 function sharePdf(id){
   const acc=getState()?.accounts?.find(a=>a.id===id);if(!acc)return getUI()?.toast('الحساب غير موجود','warn');
   try{const from=document.getElementById('statementFrom')?.value||'',to=document.getElementById('statementTo')?.value||'';
      const ledger=getAccounting()?.getAccountStatement?.(id);
      if(!Array.isArray(ledger?.entries))throw Error('تعذرت قراءة حركات الحساب لإنشاء الكشف');
      const p=payload(acc,ledger.entries,from,to);
      const filename='Statement_'+String(id).replace(/[^\w-]/g,'_')+'.pdf';
      if(root.WindowsPDF?.createAccountStatement){
        getUI()?.toast('جارٍ تجهيز كشف الحساب PDF...','info');
        return root.WindowsPDF.createAccountStatement(JSON.stringify(p),filename).then(result=>{
          if(result?.ok){getUI()?.toast('تم تجهيز PDF وفتح مجلده للإرسال','success');return true;}
          getUI()?.toast(result?.message||'لم يتم إنشاء PDF','warn');return false;
        }).catch(err=>{getUI()?.toast('فشل إنشاء PDF: '+(err?.message||'خطأ غير معروف'),'error');return false;});
      }
      if(root.AndroidReports?.shareReport){
        getUI()?.toast('جارٍ تجهيز PDF لفتح شاشة المشاركة...','info');
        root.AndroidReports.shareReport(JSON.stringify(p),filename);return true;
      }
      getUI()?.toast('مشاركة PDF تتطلب تطبيق أندرويد أو ويندوز','warn');return false;
   }catch(e){getUI()?.toast('تعذر إعداد الكشف: '+e.message,'error');return false;}
 }
 root.AccountStatementPeriod={parse,money,fmt,day,build,filter,update,queueUpdate,payload,sharePdf};
})(typeof window!=='undefined'?window:globalThis);
