'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
for(const employee of [true,false]){
 test('first-run chooser detects '+(employee?'employee':'manager')+' even before deferred scripts run',()=>{
  const file=employee?'field_agent/src/main/assets/www/static/tiqany-recovery.js':'app/src/main/assets/www/static/tiqany-recovery.js';
  const source=fs.readFileSync(path.join(root,file),'utf8').replace('window.TiqanyRecovery=Recovery;','window.__agentDetected=isAgent;window.TiqanyRecovery=Recovery;');
  const document={getElementById:(id)=>id==='agentHeader'&&employee?{}:null,createElement:()=>({style:{},textContent:''}),head:{appendChild(){}},body:{appendChild(){}}};
  const window={addEventListener(){}};
  const ctx={document,window,localStorage:{getItem(){return null}},setTimeout(){},console};
  vm.runInNewContext(source,ctx);
  assert.equal(window.__agentDetected,employee);
  assert.equal(typeof window.TiqanyRecovery.restoreCommitted,'function');
 });
}
