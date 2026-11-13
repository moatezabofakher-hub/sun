// Verify prominently accessible features in the built release's actual HTML.
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const gradle=fs.readFileSync('app/build.gradle','utf8');
for(const marker of [
  'data-feature="print-reports-3523"',
  'data-feature="report-shortcuts-3523"',
  'data-app-build="3.5.27"',
  'طباعة مبيعات الأصناف حسب التاريخ',
  'طباعة إجمالي الديون لنا / علينا',
  'أدخل كلمة السر الحالية لتأكيد حفظ إعدادات الحماية',
  'showInitialPinSaveDialog()',
  'ProfileManager.renderSettings()',
  'ThermalPrinter.printSummaryReport',
  'setLineDash([4, 6])',
]) assert(html.includes(marker),`missing ${marker}`);
assert(gradle.includes('versionCode 34'));
assert(gradle.includes("applicationId 'com.sunshine.technicalaccountant'"));
assert(gradle.includes('TA_SIGNING_KEYSTORE_PATH'));
console.log('PASS current build: all promoted 3.5.23 report, security, multi-company and print features retained.');
