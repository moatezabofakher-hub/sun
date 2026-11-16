'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../field_agent/src/main/assets/www/static/agent-backup-settings.js'),'utf8');
const auth=require('../field_agent/src/main/assets/www/static/employee-password-auth.js');
function fixture(){
 const Agent={state:{backupRecovery:null,employeeAuth:null},saved:false,async save(){this.saved=true},async show(){},toast(msg){this.lastMessage=msg},escape:x=>x};
 const window={};
 const context={window,Agent,crypto:webcrypto,Uint8Array,TextEncoder,btoa,atob,document:{getElementById:()=>null}};
 vm.runInNewContext(source,context);
 return {Agent,window};
}
test('Manager-issued employee password also verifies future backups without plaintext storage',async()=>{
 const pin='manager-assigned-employee-password';
 const credential=await auth.create(pin);
 const f=fixture();f.Agent.state.employeeAuth=credential;f.Agent.state.backupRecovery=credential;
 assert.equal(await f.window.AgentBackupAuth.verifyPin(pin,credential),true);
 assert.equal(await f.window.AgentBackupAuth.verifyPin('incorrect',credential),false);
 assert.equal(JSON.stringify(credential).includes(pin),false);
});
test('Employee can neither set nor change their own password in backup settings',async()=>{
 const f=fixture();
 const existing=await auth.create('from-manager-123456');
 f.Agent.state.employeeAuth=existing;f.Agent.state.backupRecovery=existing;
 await f.Agent.saveBackupRecoveryPin();
 assert.equal(f.Agent.saved,false);
 assert.equal(f.Agent.state.backupRecovery,existing);
 assert.match(f.Agent.lastMessage,/المدير/);
 const html=f.Agent.renderBackupSettings();
 assert.match(html,/المدير/);
 assert.doesNotMatch(html,/agentBackupNewPin|agentBackupOldPin|agentBackupConfirmPin/);
});
