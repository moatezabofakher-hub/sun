/* Employee-only fingerprint setup. Management alone owns and changes the password. */
(function(){'use strict';
const render=Agent.renderSettings.bind(Agent);
Agent.renderSettings=function(){
  let html=render();
  const available=!!this.state?.employeeAuth?.hash;
  const enabled=!!window.TiqanyEmployeeLock?.biometricReady();
  const panel=`<section class="panel" aria-label="البصمة لحماية الموظف">
    <h3>🔐 بصمة الإصبع لتطبيق الموظف</h3>
    <p class="tiny">${enabled?'✓ البصمة مفعّلة على هذا الهاتف':'البصمة غير مفعّلة على هذا الهاتف'}</p>
    <p class="tiny">كلمة السر يحددها المدير فقط. لتفعيل البصمة أدخل كلمة السر التي أعطاك إياها المدير، ثم أكد بصمة الهاتف. تظل البصمة مفعّلة عند تعطيل قفل التطبيق من المدير، وتكون الخيار الأول عند إعادة تفعيله.</p>
    <button class="primary" type="button" onclick="TiqanyEmployeeLock.registerFingerprint()" ${available?'':'disabled'}>☝️ إضافة بصمة الإصبع</button>
    ${enabled?'<button class="secondary" type="button" onclick="TiqanyEmployeeLock.removeFingerprint()">إلغاء البصمة من هذا الهاتف</button>':''}
  </section>`;
  return html+panel;
};
})();
