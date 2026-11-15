/* 3.5.89 — precision-safe statement reports for any date interval. No mutations to the ledger. */
(function(root){'use strict';
 const SCALE=100000000n;
 function parse(v){
   let s=String(v??0).trim().replaceAll(',','');
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
   const rate=Number(root.State?.settings?.exchangeRate||15000);
   result.evalSyp=result.sypBalance+result.usdBalance*rate;
   result.evalUsd=result.usdBalance+result.sypBalance/(rate||1);
   return result;
 }
 function update(id){const from=document.getElementById('statementFrom')?.value||'';
   const to=document.getElementById('statementTo')?.value||'';
   if(from&&to&&to<from){root.UI?.toast('تاريخ النهاية يجب ألا يسبق البداية','warn');return;}
   const active=document.querySelector('[data-statement-eval].bg-emerald-500')?.dataset.statementEval||'DUAL';
   root.AppNav.navigate('account_statement',{id,dateFrom:from,dateTo:to,evalMode:active},true);
 }
 function payload(account,entries,from='',to=''){
   const x=build(entries,from,to),s=root.State?.settings||{};
   return {reportType:'account_statement',title:'كشف حساب تفصيلي',companyName:String(s.companyName||''),companyPhone:String(s.companyPhone||''),companyAddress:String(s.companyAddress||''),companyLogo:String(s.companyLogo||''),companyEmail:String(s.companyEmail||''),footerNote:String(s.footerNote||''),accountName:account.name,accountPhone:account.phone||'',accountAddress:account.address||'',range:from||to?('من '+(from||'البداية')+' إلى '+(to||'اليوم')):'كامل الفترة',from,to,
    opening:x.opening,ending:x.ending,rows:x.rows.map(e=>({date:String(e.date||''),reference:String(e.ref||''),detail:String(e.desc||''),rate:String(e.rate??''),currency:e.currency==='SYP'?'SYP':'USD',debit:e.debitExact,credit:e.creditExact,balance:e.balanceExact})),createdAt:new Date().toISOString()};
 }
 function sharePdf(id){
   const acc=root.State?.accounts?.find(a=>a.id===id);if(!acc)return root.UI?.toast('الحساب غير موجود','warn');
   try{const from=document.getElementById('statementFrom')?.value||'',to=document.getElementById('statementTo')?.value||'';
      const p=payload(acc,root.Accounting.getAccountStatement(id).entries,from,to);
      if(root.AndroidReports?.shareReport){root.AndroidReports.shareReport(JSON.stringify(p),'Statement_'+String(id).replace(/[^\w-]/g,'_')+'.pdf');return true;}
      root.UI?.toast('تصدير PDF غير متاح في هذه النسخة','warn');return false;
   }catch(e){root.UI?.toast('تعذر إعداد الكشف: '+e.message,'error');return false;}
 }
 root.AccountStatementPeriod={parse,money,fmt,day,build,filter,update,payload,sharePdf};
})(typeof window!=='undefined'?window:globalThis);
