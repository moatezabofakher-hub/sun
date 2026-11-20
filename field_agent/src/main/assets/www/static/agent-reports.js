/* Report preview for the field sales employee: only the employee's synchronized
   customer balances and visible sale operations are used. No manager profit data. */
(function(){
'use strict';
const A=Agent;
const curr=(v,c)=>Number(v||0).toLocaleString('en-US',{maximumFractionDigits:c==='SYP'?0:2,minimumFractionDigits:c==='SYP'?0:2})+(c==='USD'?' $':' ل.س');
const today=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);};
A.reportSide='debit';A.reportPeriod='all';A.reportKind='sales_summary';A.reportChooseOpen=false;
A.openReportChooser=function(){this.reportChooseOpen=true;return this.show('reports');};
A.openReportPreview=function(kind){if(!['sales_summary','debts_summary'].includes(kind))return;this.reportKind=kind;return this.navigate('report_preview');};
A.reportChangeSide=function(value){if(!['debit','credit'].includes(value))return;this.reportSide=value;return this.show('report_preview');};
A.reportChangePeriod=function(value){if(!['all','today'].includes(value))return;this.reportPeriod=value;return this.show('report_preview');};
A.renderReports=function(){return `<section class="panel" data-agent-reports="true"><h3>التقارير</h3><p class="muted">المواد والديون ضمن بيانات موظف البيع المتاحة بعد المزامنة.</p>
  <button type="button" class="primary" onclick="Agent.openReportChooser()" aria-label="طباعة تقرير">🖨 طباعة تقرير</button>
  ${this.reportChooseOpen?`<section class="panel" data-agent-report-choice="true" style="margin:14px 0 0;background:#f0f9ff"><h3>اختر التقرير</h3><div class="grid">
   <button type="button" class="tile" onclick="Agent.openReportPreview('sales_summary')" aria-label="تقرير المواد"><span class="glyph">📦</span><strong>تقرير المواد</strong></button>
   <button type="button" class="tile" onclick="Agent.openReportPreview('debts_summary')" aria-label="تقرير الديون"><span class="glyph">🧾</span><strong>تقرير الديون</strong></button>
  </div></section>`:''}</section>`;};
A.reportPayload=function(){
 const sales=this.reportKind==='sales_summary';
 const totals={SYP:0,USD:0},rows=[];
 if(sales){
   const grouped=new Map();
   // Operations are the employee's local journal, including synchronized history.
   const seen=new Set();
   for(const op of this.state.ops||[]){
     if(!op || !['sale','sale_return'].includes(op.kind)||!Array.isArray(op.rows)||seen.has(op.id))continue;
     seen.add(op.id);
     if(this.reportPeriod==='today' && String(op.date||'').slice(0,10)!==today())continue;
     const c=op.currency==='USD'?'USD':'SYP';const sign=op.kind==='sale_return'?-1:1;
     const valid=op.rows.filter(r=>Number(r.qty)>0);
     const gross=valid.reduce((v,r)=>v+Math.max(0,Number(r.total)||0),0);
     const net=Number.isFinite(Number(op.netTotal))?Number(op.netTotal):gross;
     totals[c]+=sign*net;
     let allocated=0;
     valid.forEach((r,i)=>{
       const share=gross>0?Math.max(0,Number(r.total)||0)/gross:(1/valid.length);
       const amount=i===valid.length-1?net-allocated:net*share;
       allocated+=amount;
       const id=JSON.stringify([r.itemId||r.itemName||'غير معروف',r.unitName||'قطعة',c]);
       const current=grouped.get(id)||{name:r.itemName||'صنف',unit:r.unitName||'قطعة',currency:c,qty:0,value:0};
       current.qty+=sign*Number(r.qty);current.value+=sign*amount;grouped.set(id,current);
     });
   }
   for(const r of grouped.values())rows.push({name:r.name+' ('+r.unit+')',detail:r.qty.toLocaleString('en-US',{maximumFractionDigits:3})+' × '+curr(r.value,r.currency)});
   rows.sort((a,b)=>a.name.localeCompare(b.name,'ar'));
 }else{
   let unavailable=0;
   for(const acc of this.state.accounts||[]){
     // Preserve the main accounting system's balance logic and permissions.
     const current=this.balanceFor?.(acc.id);
     if(!current?.available){unavailable++;continue;}
     const value={SYP:0,USD:0};
     for(const c of ['SYP','USD']){
       const raw=c==='SYP'?current.syp:current.usd;
       value[c]=this.reportSide==='debit'?Math.max(0,raw):Math.max(0,-raw);
     }
     if(value.SYP<=0&&value.USD<=0)continue;
     totals.SYP+=value.SYP;totals.USD+=value.USD;
     rows.push({name:acc.name||'حساب',detail:curr(value.USD,'USD')+' | '+curr(value.SYP,'SYP')});
   }
   rows.sort((a,b)=>a.name.localeCompare(b.name,'ar'));
   if(unavailable)this.reportBalanceWarning=unavailable;else this.reportBalanceWarning=0;
 }
 return {companyName:this.state.companyName||'',companyPhone:this.state.companyPhone||'',companyAddress:this.state.companyAddress||'',
   title:sales?'تقرير المواد - موظف البيع':'تقرير الديون '+(this.reportSide==='credit'?'علينا':'لنا')+' - موظف البيع',
   range:sales?(this.reportPeriod==='today'?'اليوم '+today():'كامل عمليات موظف البيع'):'الأرصدة المتاحة حتى '+today(),
   rows,totals,createdAt:new Date().toISOString()};
};
A.renderReportPreview=function(){const report=this.reportPayload(),sales=this.reportKind==='sales_summary';
 return `<div data-agent-report-preview="true" dir="rtl">
  <section class="panel" style="position:relative"><div class="row" style="gap:8px">
   <button type="button" class="primary" style="margin:0" onclick="Agent.printReport()" aria-label="طباعة التقرير">🖨 طباعة</button>
   <button type="button" class="primary" style="margin:0;background:linear-gradient(145deg,#b31c46,#81102f);border-color:#9e1239;box-shadow:0 4px 0 #5c0c23" onclick="Agent.shareReportPdf()" aria-label="تصدير التقرير PDF">📄 PDF</button>
   </div><button type="button" class="secondary" onclick="Agent.navigate('reports')">العودة إلى التقارير</button>
   <h3 style="margin-top:18px">${this.escape(report.title)}</h3><p class="muted">${this.escape(report.range)}</p>
   ${sales?`<label class="label">الفترة</label><select class="field" onchange="Agent.reportChangePeriod(this.value)"><option value="all" ${this.reportPeriod==='all'?'selected':''}>كل الفترات</option><option value="today" ${this.reportPeriod==='today'?'selected':''}>اليوم</option></select>`:
   `<label class="label">نوع الديون</label><select class="field" onchange="Agent.reportChangeSide(this.value)"><option value="debit" ${this.reportSide==='debit'?'selected':''}>لنا</option><option value="credit" ${this.reportSide==='credit'?'selected':''}>علينا</option></select>
   ${this.reportBalanceWarning?`<p class="tiny" style="color:#aa5511">هناك ${this.reportBalanceWarning} حساباً لم تصل أرصدتها بعد من الرئيسي، ولم تُحتسب أصفاراً في التقرير.</p>`:''}`}
  </section>
  <section class="panel"><h3>الإجمالي</h3><div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="stat"><b>${this.escape(curr(report.totals.SYP,'SYP'))}</b><small>ليرة سورية</small></div><div class="stat"><b>${this.escape(curr(report.totals.USD,'USD'))}</b><small>دولار أمريكي</small></div></div></section>
  <section class="panel"><h3>${sales?'المواد':'الحسابات'} (${report.rows.length})</h3>${report.rows.length?report.rows.map((r,i)=>`<div class="itemrow"><div class="itemhead"><b>${i+1}. ${this.escape(r.name)}</b></div><p class="tiny ltr">${this.escape(r.detail)}</p></div>`).join(''):'<p class="muted">لا توجد بيانات مطابقة</p>'}</section>
 </div>`;};
A.shareReportPdf=function(){if(!window.AndroidReports?.shareReport){this.toast('يلزم تحديث تطبيق موظف البيع لتصدير PDF');return false;}
 const data=this.reportPayload();window.AndroidReports.shareReport(JSON.stringify(data),(this.reportKind==='sales_summary'?'تقرير_المواد_':'تقرير_الديون_')+today()+'.pdf');return true;};
A.printReport=async function(){
 if(!window.AndroidPrinter?.printBase64){this.toast('وصل طابعة البلوتوث أولاً');return false;}
 try{
  const data=this.reportPayload();
  if(data.rows.length>230){this.toast('التقرير طويل جداً للطابعة الحرارية؛ استخدم PDF');return false;}
  const width=this.state.printerWidth===58?384:576;const lines=[data.companyName,data.title,data.range,'----------------------------------',...data.rows.flatMap(r=>[r.name,r.detail]),'----------------------------------','الإجمالي: '+curr(data.totals.USD,'USD'),'الإجمالي: '+curr(data.totals.SYP,'SYP')];
  const lineHeight=39,height=lines.length*lineHeight+55,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('تعذر تجهيز مساحة الطباعة');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#111';ctx.textAlign='center';ctx.direction='rtl';ctx.font='bold 21px system-ui';
  lines.forEach((line,i)=>ctx.fillText(line,width/2,33+i*lineHeight,width-22));
  const pixels=ctx.getImageData(0,0,width,height).data,bytes=[27,64];
  for(let y=0;y<height;y+=240){const h=Math.min(240,height-y);bytes.push(29,118,48,0,width/8,0,h&255,h>>8);
    for(let row=y;row<y+h;row++)for(let x=0;x<width;x+=8){let b=0;for(let bit=0;bit<8;bit++){const z=(row*width+x+bit)*4;const gray=(pixels[z]+pixels[z+1]+pixels[z+2])/3;if(gray<165)b|=1<<(7-bit);}bytes.push(b);}}
  bytes.push(10,10,10);
  let binary='';for(let i=0;i<bytes.length;i+=5000)binary+=String.fromCharCode(...bytes.slice(i,i+5000));
  window.AndroidPrinter.printBase64(btoa(binary));this.toast('تم إرسال التقرير إلى الطابعة');return true;
 }catch(err){this.toast('تعذر طباعة التقرير: '+err.message);return false;}
};
})();
