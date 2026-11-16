const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const web=fs.existsSync(path.join(root,'web'))?path.join(root,'web'):path.join(root,'app/src/main/assets/www');
const src=fs.readFileSync(path.join(web,'static/tiqany-peer-controller.js'),'utf8');
const html=fs.readFileSync(path.join(web,'index.html'),'utf8');
const start=src.indexOf('  authorizedSettingsSection:null,');
const end=src.indexOf('  updateHeaderConnection(active){',start);
const methods=src.slice(start,end);
function harness(){
  let requested=null, toast='';
  const context={ProtectionController:{requestPin:(msg,cb,options)=>{requested={msg,cb,options};}},UI:{toast:m=>{toast=m;}}};
  const peer=vm.runInNewContext('({'+methods+'})',context);
  const section={open:false,isConnected:true,dataset:{settingsSection:'mobile-computer-sync'}};
  const event={currentTarget:{closest:()=>section},preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
  return {peer,section,event,requested:()=>requested,toast:()=>toast};
}
test('sync settings are open while pairing scanner requires biometric-first app verification',()=>{
 const h=harness();h.peer.hidePairingQr=()=>{};
 h.peer.requestSettingsAccess(h.event);assert.equal(h.section.open,true);assert.equal(h.requested(),null);
 assert.match(src,/scanPairing\(\)\{[\s\S]*?this\.authorizePairing\(/);
 assert.match(src,/acceptPairing\(raw\)\{[\s\S]*?const proof=this\.scanApproval/);
 assert.match(methods,/ProtectionController\.requestPin/);
 assert.doesNotMatch(methods,/passwordOnly:true/);
});
test('Android PIN dialog supports biometrics and a password fallback',()=>{
 assert.match(html,/requestPin\(message, onSuccess, options = \{\}\)/);
 assert.match(html,/!options\.passwordOnly && State\.settings\.appProtection\.fingerprintEnabled/);
 assert.match(html,/showApprovalPassword\(\)/);
});
