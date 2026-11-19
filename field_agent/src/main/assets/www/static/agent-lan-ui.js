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
   <h3>⇄ مزامنة تلقائية مستمرة</h3>
   <div data-agent-network role="group" aria-label="عناوين الاتصال"></div>
   <p class="tiny">عند تشغيل التطبيقين على شبكة Wi-Fi نفسها يبدأ الربط تلقائيًا. تُرسل الفواتير والسندات الجديدة وتُستقبل <b>المواد والأسعار والعملاء ورصيد السيارة</b> كل 12 ثانية أثناء الاتصال. يمكنك أيضًا طلب المزامنة فورًا بالزر.</p>
   <p class="tiny" id="agentAutoSyncStatus" role="status">جارٍ تهيئة المزامنة التلقائية…</p>
   <button type="button" id="agentLanSyncButton" class="primary" onclick="Agent.syncOneTap()" ${this.lanSyncBusy?'disabled':''}>${this.lanSyncBusy?'جارٍ تبادل البيانات…':'⇄ مزامنة فورية'}</button>
   <p class="tiny" role="status" id="agentLanStatus">${this.escape(this.lanSyncMessage||'جاهز للمزامنة التلقائية في الاتجاهين')}</p>
   <p class="tiny">${window.TiqanyCloudAgent?.ready()?'☁️ اتصال سحابي مشفر مهيأ — يتم تأكيد كل فاتورة من الرئيسي':'🌐 الربط المحلي يعمل دون إنترنت؛ المزامنة السحابية تحتاج إلى إعدادها على الرئيسي أولاً'}</p>
   <button type="button" class="ta-agent-primary-scanner" onclick="AgentPairing.scanQr()"><span class="ta-agent-scanner-icon" aria-hidden="true"><i class="fas fa-qrcode"></i></span><span>مسح الباركود الرئيسي</span></button></section>`;
  return main+report+`<details class="panel" style="padding:12px 16px"><summary style="cursor:pointer;font-weight:800">الطريقة الاحتياطية: مزامنة عبر الملفات</summary>${original()}</details>`;
 };
})();
