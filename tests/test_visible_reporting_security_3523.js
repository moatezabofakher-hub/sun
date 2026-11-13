// Verify prominently accessible features in the built release's actual HTML.
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const gradle=fs.readFileSync('app/build.gradle','utf8');
for(const marker of [
  'data-feature="print-reports-3523"',
  'data-app-build="3.5.37"',
  'أدخل كلمة السر الحالية لتأكيد حفظ إعدادات الحماية',
  'showInitialPinSaveDialog()',
  'ProfileManager.renderSettings()',
  'ThermalPrinter.printSummaryReport',
  'setLineDash([4, 6])',
]) assert(html.includes(marker),`missing ${marker}`);
assert(gradle.includes('versionCode 44'));
assert(!html.includes('data-feature="report-shortcuts-3523"'),'Settings must not duplicate report printing shortcuts');
assert(html.includes("LedgerReports.openHomePrint('sales_summary')"),'Main dashboard must retain print button');
assert(html.includes("LedgerReports.openHomePrint('debts_summary')"),'Main dashboard must retain debt print button');
assert(!html.includes('onclick="LedgerReports.print()"'),'No print button inside reports');
assert(gradle.includes("applicationId 'com.sunshine.technicalaccountant'"));
assert(gradle.includes('TA_SIGNING_KEYSTORE_PATH'));
console.log('PASS current build: all promoted 3.5.23 report, security, multi-company and print features retained.');
