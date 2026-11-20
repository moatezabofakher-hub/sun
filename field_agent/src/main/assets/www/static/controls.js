/* Existing forms render their buttons from several different templates. */
(() => {
  const actions = [
    [/^(?:حفظ(?:\s|$)|نعم$|تأكيد الحفظ$)/, 'positive'],
    [/^(?:حذف(?:\s|$)|خروج$|إغلاق التطبيق$|الخروج بدون تعديل$|تجاهل التغييرات$)/, 'negative'],
    [/^(?:إلغاء|لا|البقاء)$/, 'neutral']
  ];
  function paint(button) {
    const label = (button.getAttribute('aria-label') || button.textContent).trim();
    const voucherCancel = button.matches('.ta-voucher-cancel-action, .ta-voucher-cancel-button, .ta-agent-voucher-cancel');
    const tone = voucherCancel ? 'negative' : actions.find(([pattern]) => pattern.test(label))?.[1];
    if (tone) button.dataset.actionTone = tone;
    else delete button.dataset.actionTone;
  }
  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.matches('button')) paint(node);
    node.querySelectorAll('button').forEach(paint);
  }
  scan(document.body);
  new MutationObserver(records => {
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      const button = target?.closest('button');
      if (button) paint(button);
      record.addedNodes.forEach(scan);
    }
  }).observe(document.body, {subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label']});
})();
