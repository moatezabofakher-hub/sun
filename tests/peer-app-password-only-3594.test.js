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
test('requests app password before exposing the sync section',()=>{
 const h=harness();h.peer.requestSettingsAccess(h.event);
 assert.equal(h.section.open,false);assert.equal(h.event.prevented,true);
 assert.match(h.requested().msg,/كلمة سر التطبيق/);
 assert.equal(h.requested().options.passwordOnly,true);
 h.requested().cb();h.peer.guardSettingsToggle(h.section);
 assert.equal(h.section.open,true);
});
test('unauthorized direct opening is reverted and clicking to close does not re-prompt',()=>{
 const h=harness();h.section.open=true;h.peer.guardSettingsToggle(h.section);
 assert.equal(h.section.open,false);
 h.peer.requestSettingsAccess(h.event);h.requested().cb();
 h.peer.requestSettingsAccess(h.event);
 assert.equal(h.section.open,false);
 assert.equal(h.peer.authorizedSettingsSection,null);
});
test('authentication uses lexical ProtectionController, never window property',()=>{
 assert.doesNotMatch(methods,/window\.ProtectionController/);
 assert.match(methods,/typeof ProtectionController/);
 assert.match(src,/guardSettingsToggle\(this\)/);
});

test('Android PIN dialog can explicitly disable biometric path',()=>{assert.match(html,/requestPin\(message, onSuccess, options = \{\}\)/);assert.match(html,/!options\.passwordOnly && State\.settings\.appProtection\.fingerprintEnabled/);});
