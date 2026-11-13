/* One-tap, two-way LAN sync is available only inside the dedicated bottom tab.
 * The legacy JSON-file workflow remains a fallback below the primary action. */
(function(){
 const original=Agent.renderSync.bind(Agent);
 Agent.renderSync=function(){
  const s=this.state.lastSyncSummary;
  const updated=this.state.lastSyncAt?new Date(this.state.lastSyncAt).toLocaleString('ar',{dateStyle:'medium',timeStyle:'short'}):'لم تحدث مزامنة بعد';
  const report=s?`<section class="panel" aria-label="تفاصيل آخر تحديث">
    <h3>آخر مزامنة ناجحة</h3><p class="tiny">${this.escape(updated)}</p>
    <div class="stats"><div class="stat"><b>${s.confirmed}</b><small>عملية مؤكدة</small></div><div class="stat"><b>${s.itemsChanged}</b><small>مواد محدّثة</small></div><div class="stat"><b>${s.accountsChanged}</b><small>عملاء محدّثون</small></div></div>
    <p class="tiny">تحديث أرصدة ${s.stockChanged} مادة · إجمالي الأصناف ${s.materials} · العملاء ${s.customers}</p></section>`:'';
  const main=`<section class="panel" style="background:#e7fbf6;border:1px solid #a6e0d4" aria-label="المزامنة المباشرة">
   <h3>⇄ إرسال واستقبال بضغطة واحدة</h3>
   <p class="tiny">اتصل بالشبكة المحلية نفسها وافتح «مندوبو التوزيع» في التطبيق الرئيسي، ثم اضغط الزر. سيتم إرسال الفواتير والسندات <b>واستلام آخر المواد والأسعار والعملاء ورصيد السيارة</b> تلقائيًا، حتى لو لم تكن لديك عمليات جديدة.</p>
   <button type="button" id="agentLanSyncButton" class="primary" onclick="Agent.syncOneTap()" ${this.lanSyncBusy?'disabled':''}>${this.lanSyncBusy?'جارٍ تبادل البيانات…':'⇄ مزامنة الآن — إرسال واستقبال'}</button>
   <p class="tiny" role="status" id="agentLanStatus">${this.escape(this.lanSyncMessage||'جاهز للمزامنة التلقائية في الاتجاهين')}</p></section>`;
  return main+report+`<details class="panel" style="padding:12px 16px"><summary style="cursor:pointer;font-weight:800">الطريقة الاحتياطية: مزامنة عبر الملفات</summary>${original()}</details>`;
 };
})();
