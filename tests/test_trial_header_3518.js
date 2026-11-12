// v3.5.18: license ribbon and dashboard visual regression tests, with no demo data.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const html=fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const from=html.indexOf('const LicenseManager = {');
const to=html.indexOf('const Accounting = {',from);
assert(from>0 && to>from);
const markup=html.slice(0,from);
for(const id of ['trialStatusBar','trialStatusTitle','trialOperationsCounter','trialRemainingCounter','trialProgressFill']) {
    assert(markup.includes(`id="${id}"`),`missing ribbon element ${id}`);
}
assert(markup.includes('id="trialStatusBar" class="ta-trial-bar hidden" hidden'));
assert(markup.includes('class="ta-app-header'));
assert(markup.includes('class="ta-bottom-nav'));
assert(html.includes('ta-action-grid') && html.includes('ta-module-grid'));
assert(html.includes('Views.openDebtsChoiceModal()'));
assert(html.includes('invoice-grid-decrement'));

function el(){return {hidden:true,attributes:{},style:{},textContent:'',
    classList:{list:new Set(['hidden']),toggle(cls,yes){if(yes)this.list.add(cls);else this.list.delete(cls)},contains(cls){return this.list.has(cls)}},
    setAttribute(k,v){this.attributes[k]=v},querySelector(q){return q==='.ta-trial-progress'?elements.progressbar:null}}}
const elements={};
for(const id of ['trialStatusBar','trialStatusTitle','trialOperationsCounter','trialRemainingCounter','trialProgressFill','settingsLicenseStatus'])elements[id]=el();
elements.progressbar=el();
const State={license:{deviceId:'RD-TEST',isActivated:false,activationCode:'',opsUsedCount:0},
 invoices:[],vouchers:[],items:[],accounts:[]};
const document={documentElement:{lang:'ar'},getElementById:id=>elements[id]||null};
const storage=new Map();
const localStorage={getItem:key=>storage.get(key)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:key=>storage.delete(key)};
const sandbox={State,document,localStorage,console,Uint8Array,TextDecoder,TextEncoder,
  crypto:require('node:crypto').webcrypto,atob,btoa,
  UI:{toast:()=>{}},StorageEngine:{saveState:async()=>{sandbox.LicenseManager.persistFallbackStorage()}}};
vm.createContext(sandbox);
vm.runInContext(html.slice(from,to)+'\n globalThis.LicenseManager=LicenseManager;', sandbox);
const license=sandbox.LicenseManager;
license.updateBadgeUI();
assert.equal(elements.trialStatusBar.hidden,false);
assert.equal(elements.trialOperationsCounter.textContent,'0 / 100 عملية');
assert.equal(elements.trialRemainingCounter.textContent,'100 متبقية · تفعيل');
assert.equal(elements.trialProgressFill.style.width,'0%');
(async()=>{
    await license.recordNewOperation();
    assert.equal(elements.trialOperationsCounter.textContent,'1 / 100 عملية');
    assert.equal(elements.trialRemainingCounter.textContent,'99 متبقية · تفعيل');
    assert.equal(elements.trialProgressFill.style.width,'1%');
    assert.equal(license.getRemainingTrialOps(),99);
    State.license.opsUsedCount=100;
    license.updateBadgeUI();
    assert.equal(elements.trialRemainingCounter.textContent,'0 متبقية · تفعيل');
    assert.equal(elements.trialProgressFill.style.width,'100%');
    State.license.isActivated=true;
    license.updateBadgeUI();
    assert.equal(elements.trialStatusBar.hidden,true);
    assert.equal(elements.trialStatusBar.classList.contains('hidden'),true);
    assert.equal(elements.trialStatusBar.attributes['aria-hidden'],'true');
    assert.equal(elements.settingsLicenseStatus.textContent,'النسخة مفعّلة بالكامل مدى الحياة');
    State.license.isActivated=false;
    State.license.opsUsedCount=2;
    license.updateBadgeUI();
    assert.equal(elements.trialStatusBar.hidden,false);
    assert.equal(elements.trialOperationsCounter.textContent,'2 / 100 عملية');
    document.documentElement.lang='en';
    license.updateBadgeUI();
    assert.equal(elements.trialStatusTitle.textContent,'Trial version');
    assert.equal(elements.trialOperationsCounter.textContent,'2 / 100 operations');
    console.log('PASS: trial ribbon, operation counts, progress, activation hide/restore, English and legacy features.');
})().catch(err=>{console.error(err);process.exitCode=1});
