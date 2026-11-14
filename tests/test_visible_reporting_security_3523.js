// Verify prominently accessible features in the built release's actual HTML.
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const gradle=fs.readFileSync('app/build.gradle','utf8');
for(const marker of [
  'data-report-print-chooser',
  'data-app-build="${InstalledAppVersion.number()}"',
  'أدخل كلمة السر الحالية لتأكيد حفظ إعدادات الحماية',
  'showInitialPinSaveDialog()',
  'ProfileManager.renderSettings()',
  'ThermalPrinter.printSummaryReport',
  'setLineDash([4, 6])',
]) assert(html.includes(marker),`missing ${marker}`);
assert(Number(gradle.match(/versionCode\s+(\d+)/)?.[1]) >= 47);
assert(!html.includes('data-feature="report-shortcuts-3523"'),'Settings must not duplicate report printing shortcuts');
assert(html.includes("LedgerReports.openPreview('sales_summary')"),'Report material choice must be available');
assert(html.includes("LedgerReports.openPreview('debts_summary')"),'Report debt choice must be available');
assert(html.includes('onclick="LedgerReports.print()"'),'Report preview now includes print action');
assert(html.includes('onclick="LedgerReports.sharePdf()"'),'Report preview includes PDF action');
assert(gradle.includes("applicationId 'com.sunshine.technicalaccountant'"));
assert(gradle.includes('TA_SIGNING_KEYSTORE_PATH'));
console.log('PASS current build: all promoted 3.5.23 report, security, multi-company and print features retained.');
