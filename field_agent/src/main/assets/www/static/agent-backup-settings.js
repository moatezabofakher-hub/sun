/* 3.5.43: verified backup storage and explicit WhatsApp sharing.
 * WhatsApp's regular application does not permit unattended document delivery.
 */
(function () {
'use strict';
const esc = v => Agent.escape(String(v ?? ''));
const number = v => String(v||'').replace(/[\s\-()]/g,'');
Agent.readBackupSettings = function () {
    try { return { ...JSON.parse(window.AndroidAgentBackup?.getStatus?.() || '{}') }; }
    catch (_) { return { supported:false }; }
};
Agent.renderBackupSettings = function () {
    const cfg = this.readBackupSettings();
    const enabled = !!cfg.localEnabled;
    const folder = !!cfg.localFolderConfigured;
    const showTime = ms => ms ? new Date(ms).toLocaleString('ar-SY') : 'لم تُنشأ نسخة بعد';
    return `<div class="hero"><h2>النسخ الاحتياطي التلقائي</h2><p>حفظ نسخة من جميع بيانات المندوب بعد كل تغيير، وتجهيز نسخة في المجلد المحدد تلقائياً.</p></div>
    <section class="panel"><h3>النسخ التلقائي إلى مجلد</h3>
       <p class="tiny">${folder?'✓ تم اختيار مجلد النسخ':'⚠ لم يتم اختيار مجلد'}</p>
       <button type="button" class="secondary" onclick="Agent.chooseBackupFolder()">📁 اختيار أو تغيير المجلد</button>
       <label class="label" for="agentBackupEnabled">تشغيل النسخ التلقائي</label>
       <select id="agentBackupEnabled" class="field"><option value="false" ${enabled?'':'selected'}>إيقاف</option><option value="true" ${enabled?'selected':''}>تشغيل</option></select>
       <label class="label" for="agentBackupHours">تكرار إنشاء نسخة</label>
       <select class="field" id="agentBackupHours">${[6,12,24].map(h=>`<option value="${h}" ${Number(cfg.localHours||24)===h?'selected':''}>كل ${h} ساعة</option>`).join('')}</select>
       <button type="button" class="primary" onclick="Agent.saveBackupFrequency()">حفظ إعدادات المجلد</button>
       <button type="button" class="secondary" onclick="Agent.backupNow()">نسخ الآن إلى المجلد</button>
       <p class="tiny">آخر نسخة للمجلد: ${esc(showTime(cfg.localLast))}</p>
       ${cfg.localError?`<p class="tiny" style="color:#b91c1c">${esc(cfg.localError)}</p>`:''}
       ${cfg.snapshotError?`<p class="tiny" style="color:#b91c1c">${esc(cfg.snapshotError)}</p>`:''}
    </section>
    <section class="panel"><h3>مشاركة نسخة احتياطية عبر واتساب</h3>
       <label class="label" for="agentWhatsappFrom">رقم واتساب المرسل (مع رمز الدولة)</label>
       <input class="field ltr" id="agentWhatsappFrom" type="tel" inputmode="tel" value="${esc(cfg.whatsAppSender||'')}" placeholder="+9639..." autocomplete="off"/>
       <label class="label" for="agentWhatsappTo">رقم واتساب المستقبل (مع رمز الدولة)</label>
       <input class="field ltr" id="agentWhatsappTo" type="tel" inputmode="tel" value="${esc(cfg.whatsAppRecipient||'')}" placeholder="+9639..." autocomplete="off"/>
       <button class="primary" type="button" onclick="Agent.saveWhatsAppBackupNumbers()">حفظ الرقمين</button>
       <button class="secondary" type="button" onclick="Agent.shareBackupWhatsApp()">🟢 مشاركة أحدث نسخة عبر واتساب</button>
       <p class="tiny" style="background:#fff7e5;border-radius:12px;padding:11px;color:#724b13">رقم المرسل حقل تعريف فقط؛ الإرسال يتم من حساب واتساب المفتوح على هذا الجهاز. سيفتح واتساب لمراجعة المستلم والضغط على «إرسال». لا يمكن لتطبيق واتساب العادي إرسال ملف تلقائياً من دون موافقتك؛ ذلك يتطلب إعداد منصة واتساب للأعمال (Cloud API). النسخة تحتوي على بيانات محاسبية حساسة: أرسلها إلى رقم موثوق فقط.</p>
    </section>`;
};
Agent.chooseBackupFolder = function () { if(window.AndroidAutoBackup?.chooseLocalFolder) window.AndroidAutoBackup.chooseLocalFolder();else this.toast('اختيار المجلد متاح داخل APK فقط'); };
Agent.saveBackupFrequency = async function () {
    const enabled=document.getElementById('agentBackupEnabled')?.value==='true';
    const hours=Number(document.getElementById('agentBackupHours')?.value||24);
    if(!window.AndroidAutoBackup?.configure) return this.toast('النسخ التلقائي يحتاج نسخة Android المحدثة');
    const error=window.AndroidAutoBackup.configure('local',enabled,hours);
    if(error) return this.toast(error);
    this.toast('تم حفظ إعدادات المجلد');await this.show('backup');
};
Agent.backupNow = async function () {
    if(!window.AndroidAutoBackup?.runNow) return this.toast('النسخ التلقائي يحتاج نسخة Android');
    const cfg=this.readBackupSettings();
    if(!cfg.localFolderConfigured) return this.toast('اختر مجلد النسخ أولاً');
    if(!cfg.localEnabled) return this.toast('فعّل النسخ المحلي أولاً');
    window.AndroidAutoBackup.runNow('local');this.toast('تم طلب النسخ. تحقّق من تاريخ نجاح النسخ بعد اكتماله.');
};
Agent.saveWhatsAppBackupNumbers = async function () {
    if(!window.AndroidAgentBackup?.saveNumbers)return this.toast('هذه الميزة متاحة داخل APK المحدث');
    const from=number(document.getElementById('agentWhatsappFrom')?.value);
    const to=number(document.getElementById('agentWhatsappTo')?.value);
    const error=window.AndroidAgentBackup.saveNumbers(from,to);
    if(error)return this.toast(error);
    this.toast('تم حفظ رقم المرسل والمستقبل');
};
Agent.shareBackupWhatsApp = function () {
    if(!window.AndroidAgentBackup?.shareLatestBackup)return this.toast('مشاركة النسخة تحتاج APK المحدث');
    window.AndroidAgentBackup.shareLatestBackup();
};
})();
