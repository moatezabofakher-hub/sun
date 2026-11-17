'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const isWindows=fs.existsSync(path.join(root,'upgrade-125'));
const dir=isWindows?path.join(root,'upgrade-125'):path.join(root,'app/src/main/assets/www/static');
const read=file=>fs.readFileSync(path.join(dir,file),'utf8');
test('Red exchange delete control remains white-on-red despite global glossy button CSS',()=>{
 const s=read('ta-currency-exchange-ui-142.js');
 assert.match(s,/ta-fx-delete-149/);
 assert.match(s,/background:#b91c1c!important;color:#fff!important/);
 assert.match(s,/TiqanyFxUI\.remove/);
 assert.doesNotThrow(()=>new vm.Script(s));
});
test('Green FX rate setup button with white text and all foreign quotes (including USD)',()=>{
 const s=read('ta-fx-buy-sell-147.js');
 assert.match(s,/ta-fx-rates-btn-149/);
 assert.match(s,/background:#047857!important;color:#fff!important/);
 assert.match(s,/أسعار شراء ومبيع العملات/);
 assert.match(s,/ta147Buy_/);
 assert.match(s,/ta147Sell_/);
 assert.doesNotMatch(s,/document\.getElementById\('ta147GeneralUsd'\)/);
 assert.doesNotMatch(s,/State\.settings\.exchangeRate=general/);
 assert.match(s,/generalInvoiceRateModal/);
 assert.doesNotThrow(()=>new vm.Script(s));
});
test('Adding currency uses navy background and white text; top-bar general USD remains distinct',()=>{
 if(isWindows){
  const installer=read('apply-fx-palette-security-149.cjs');
  assert.match(installer,/addPopularCurrency/);
  assert.match(installer,/addCustomCurrency/);
  assert.match(installer,/background:#17263e!important;color:#fff!important/);
  assert.match(installer,/generalInvoiceRateModal/);
 }else{
  const html=fs.readFileSync(path.join(root,'app/src/main/assets/www/index.html'),'utf8');
  assert.match(html,/ta-currency-add-149/);
  assert.match(html,/background:#17263e!important;color:#fff!important/);
  assert.match(html,/TiqanyFx147\.generalInvoiceRateModal\(\)/);
  assert.match(html,/id="topBarRate"/);
 }
});
test('Fingerprint enrollment never implicitly enables application lock',()=>{
 if(isWindows){
  const installer=read('apply-fx-palette-security-149.cjs');
  assert.match(installer,/bio\.replace\('current\.lockApp = true;'/);
  assert.match(installer,/لم تتغير حالة قفل التطبيق/);
 }else{
  const html=fs.readFileSync(path.join(root,'app/src/main/assets/www/index.html'),'utf8');
  const start=html.indexOf('async registerFingerprint() {');
  const end=html.indexOf('async verifyFingerprint()',start);
  assert.ok(start>=0&&end>start);
  const block=html.slice(start,end);
  assert.match(block,/current\.fingerprintEnabled = true;/);
  assert.doesNotMatch(block,/current\.lockApp\s*=\s*true/);
  assert.match(block,/لم تتغير حالة قفل التطبيق/);
  assert.match(html,/id="protectLockApp"/);
 }
});
test('Authenticated PC synchronization does not ask for an extra PIN after pairing',()=>{
 if(isWindows){
  const installer=read('apply-fx-palette-security-149.cjs');
  assert.match(installer,/requestBootstrapApproval/);
  assert.match(installer,/QR pairing and explicit/);
  assert.match(installer,/this\.bootstrapApproval=/);
 }else{
  if(!fs.existsSync(path.join(dir,'tiqany-peer-controller.js')))return;
  const peer=read('tiqany-peer-controller.js');
  const begin=peer.indexOf('  requestBootstrapApproval(server,desktopSnapshot,phoneSnapshot){');
  const end=peer.indexOf('  // First link may ONLY copy',begin);
  assert.ok(begin>=0&&end>begin);
  const block=peer.slice(begin,end);
  assert.match(block,/window\.confirm/,'One-time human consent is retained');
  assert.match(block,/this\.bootstrapApproval=/,'Approval remains tied to snapshots');
  assert.doesNotMatch(block,/requestPin\(/);
  assert.doesNotMatch(block,/authorizePairing\(/);
  assert.match(peer,/authorizePairing\('تحقق بالبصمة أو كلمة سر المدير قبل مسح رمز الكمبيوتر'/,
   'Initial QR scan still requires verification if device-addition protection is enabled');
  assert.match(read('tiqany-manager-sync-130.js'),/lockApp:cfg\.lockApp===true/);
 }
});
