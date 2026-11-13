'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const text=p=>fs.readFileSync(p,'utf8');
const js=text('app/src/main/assets/www/index.html');
const java=text('app/src/main/java/com/sunshine/accounting/MainActivity.java');
const paths=text('app/src/main/res/xml/item_photo_paths.xml');
const report=java.split('private final class ReportPdfBridge')[1].split('/** Generates an invoice PDF')[0];
assert(report.includes('public void shareReport('));
assert(report.includes('ReportPdfRenderer.render(new JSONObject(json))'));
for(const t of ['FileProvider.getUriForFile','getCacheDir()','shared_reports','Intent.ACTION_SEND','Intent.EXTRA_STREAM','Intent.FLAG_GRANT_READ_URI_PERMISSION']) assert(report.includes(t),t);
assert(!report.includes('ACTION_CREATE_DOCUMENT')&&!report.includes('startActivityForResult'), 'report sharing must not ask to save');
assert(!java.includes('SAVE_REPORT_PDF')&&!java.includes('pendingReportPdf'),'old report saving state must be gone');
assert(paths.includes('name="shared_reports"'));
assert(js.includes('مشاركة PDF'));
assert(!js.includes('حفظ PDF'));
assert(js.includes('AndroidReports.shareReport')&&!js.includes('AndroidReports.saveAndShareReport'));
// Account balance logic must remain exactly as it was in 3.5.45:
// the customer's CREDIT balance (له) can fall after a sale, as the user confirmed.
const balanceOld=text('field_agent/src/main/assets/www/static/invoice-dual-balances.js');
assert.equal(text('app/src/main/assets/www/static/invoice-dual-balances.js'),balanceOld);
assert(balanceOld.includes('Same-date ties use invoice order'), 'keep existing balance computation');
console.log('PASS: native direct PDF report share uses private cache; old account balance calculation unchanged');
