'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const manager=fs.readFileSync('app/src/main/java/com/sunshine/accounting/NativeLocalSync.java','utf8');
const employee=fs.readFileSync('field_agent/src/main/java/com/sunshine/accounting/NativeLocalSync.java','utf8');
const agentScript=fs.readFileSync('field_agent/src/main/assets/www/static/agent.js','utf8');
test('employee discovers previously paired manager after DHCP change without requesting another QR',()=>{
  assert.match(manager,/PREFERRED_LAN_PORT = 48371/);
  assert.match(employee,/PREFERRED_LAN_PORT = 48371/);
  assert.match(manager,/new ServerSocket\(PREFERRED_LAN_PORT\)/);
  assert.match(employee,/rememberedVerifiedEndpoint\(companyId\)/);
  assert.match(employee,/probeManager\(stable, companyId\)/);
  assert.match(employee,/return findOnLocalSubnet\(companyId, excluded\)/);
  assert.match(employee,/getNetworkCapabilities\(network\)/);
  assert.match(employee,/hasTransport\(NetworkCapabilities.TRANSPORT_WIFI\)/);
  assert.match(employee,/n \+= 20/);
  assert.match(employee,/found\.await\(8, TimeUnit.SECONDS\)/);
  assert.match(employee,/companyTag\(companyId\)\.equals\(answer\.optString\("companyTag"\)\)/);
});
test('discovery is read-only and must not enter financial operation importer',()=>{
  for(const source of [manager,employee]){
    assert.match(source,/if \(raw\.length\(\) < 256 && raw\.contains/);
    assert.match(source,/DISCOVERY_PROTOCOL\.equals\(probe\.optString\("discoveryProtocol"\)\)/);
    assert.match(source,/return;\s*}\s*String id = String\.valueOf\(requestIds\.incrementAndGet/);
  }
  assert.match(employee,/rememberVerifiedEndpoint\(companyId, pendingVerifiedEndpoint\)/);
  assert.match(employee,/rediscoverAfterInvalidReply = true/);
  assert.match(agentScript,/rejectUnverifiedSync/);
});
test('invalid encrypted response forces rediscovery without deleting employee ledger',async()=>{
  let rejected=0;
  const scope={window:{AndroidLocalSync:{rejectUnverifiedSync:()=>rejected++}},console,
    FieldLanCrypto:{open:async()=>{throw Error('Bad MAC');}},document:{getElementById:()=>null}};
  vm.createContext(scope);
  vm.runInContext(agentScript+'\nglobalThis.__agent=Agent;',scope);
  const agent=scope.__agent;
  const original={companyId:'company_alpha123456',agentId:'agent_123456789',key:'fake',ops:[{id:'invoice_kept'}]};
  agent.state=original;
  agent.lanSyncBusy=true;
  agent.lanRequestNonce='goodnonce';
  agent.toast=()=>{};
  agent.finishAutoSync=()=>{};
  agent.syncPaint=()=>{};
  await agent.onLocalSyncResult(JSON.stringify({data:'{"body":"garbled"}'}));
  assert.equal(rejected,1);
  assert.equal(agent.state,original);
  assert.equal(agent.state.ops.length,1);
  agent.lanSyncBusy=true;agent.lanRequestNonce='goodnonce';
  await agent.onLocalSyncResult(JSON.stringify({data:'{"body":"garbled"}',transport:'cloud'}));
  assert.equal(rejected,1,'cloud failure must not change LAN endpoint trust');
});

test('a reassigned IP triggers rediscovery, but a disabled employee is not rerouted around authorization',async()=>{
  let rejected=0;
  const scope={window:{AndroidLocalSync:{rejectUnverifiedSync:()=>rejected++}},console,
    document:{getElementById:()=>null}};
  vm.createContext(scope);vm.runInContext(agentScript+'\nglobalThis.__agent=Agent;',scope);
  const agent=scope.__agent;
  agent.toast=()=>{};agent.syncPaint=()=>{};agent.finishAutoSync=()=>{};
  agent.state={companyId:'company_alpha123456',ops:[{id:'invoice_1'}]};
  agent.lanSyncBusy=true;agent.lanRequestNonce='x';
  await agent.onLocalSyncResult(JSON.stringify({error:'الشركة غير مطابقة'}));
  assert.equal(rejected,1);
  agent.lanSyncBusy=true;agent.lanRequestNonce='x';
  await agent.onLocalSyncResult(JSON.stringify({error:'موظف البيع غير مسجل أو موقوف'}));
  assert.equal(rejected,1,'do not bypass suspension via another manager');
  assert.equal(agent.state.ops.length,1);
});
