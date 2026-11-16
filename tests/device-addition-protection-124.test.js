const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const web=fs.existsSync(path.join(root,'web'))?path.join(root,'web'):path.join(root,'app/src/main/assets/www');
const html=fs.readFileSync(path.join(web,'index.html'),'utf8');
const employeeSource=fs.readFileSync(path.join(web,'static/tiqany-manager-link.js'),'utf8');
const peerSource=fs.readFileSync(path.join(web,'static/tiqany-peer-controller.js'),'utf8');

test('device-addition protection toggle defaults off and persists through verified security settings',()=>{
  assert.match(html,/protectDeviceAddition: false/);
  assert.match(html,/id="protectDeviceAddition" type="checkbox"/);
  assert.match(html,/protectDeviceAddition: !!document\.getElementById\('protectDeviceAddition'\)\?\.checked/);
  assert.match(html,/next\.protectDeviceAddition !== !!old\.protectDeviceAddition/);
  assert.match(html,/\|\| next\.protectDeviceAddition\) && !next\.pinHash/);
});

test('employee-addition QR is unprotected by default and requires configured PIN when enabled',async()=>{
  let asked=0,shown=0,setup=0,approved=null,profile='company-one';
  const ctx={window:{}, State:{settings:{appProtection:{protectDeviceAddition:false,pinHash:'h',pinSalt:'s'}}},
    FieldSync:{startLanReceiver(){},data(){return {companyId:'company-xyz'}},escape:x=>x},
    ProfileManager:{get activeId(){return profile}},
    ProtectionController:{requestPin(_message,cb){asked++;approved=cb},promptPinSetup(){setup++}},
    UI:{toast(){}},setTimeout:cb=>cb(),document:{readyState:'loading',addEventListener(){}}};
  ctx.window=ctx;
  vm.runInNewContext(employeeSource,ctx);
  const api=ctx.TiqanyManagerLink;
  api.openAuthorized=()=>{shown++};
  api.open();assert.equal(shown,1);assert.equal(asked,0);
  ctx.State.settings.appProtection.protectDeviceAddition=true;
  api.open();assert.equal(shown,1);assert.equal(asked,1);
  approved();assert.equal(shown,2);
  api.open();profile='another-business';approved();assert.equal(shown,2,'profile switch invalidates old approval');
  profile='company-one';ctx.State.settings.appProtection.pinSalt='';
  api.open();assert.equal(setup,1);assert.equal(shown,2);
});

test('Android manager QR scan is directly accessible when protection is off, and biometric/PIN-gated when on',()=>{
 const code=peerSource.slice(peerSource.indexOf('  scanPairing(){'),peerSource.indexOf('  conflictsKey(){'));
 let scans=0,requested=0,callback=null;
 const ctx={desktop:false,State:{settings:{appProtection:{protectDeviceAddition:false}}},
   ProfileManager:{activeId:'company-one'},window:{NativeBarcode:{scan:()=>scans++}},
   NativeBarcode:{scan:()=>scans++},Date,t:x=>x};
 const peer=vm.runInNewContext('({'+code+'})',ctx);
 peer.authorizePairing=(_message,cb)=>{requested++;callback=cb};
 peer.scanPairing();assert.equal(scans,1);assert.equal(requested,0);
 ctx.State.settings.appProtection.protectDeviceAddition=true;
 peer.scanPairing();assert.equal(scans,1);assert.equal(requested,1);
 callback();assert.equal(scans,2);
});
