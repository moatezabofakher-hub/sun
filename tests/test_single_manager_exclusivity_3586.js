'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=process.cwd();
const native=fs.readFileSync('field_agent/src/main/java/com/sunshine/accounting/NativeLocalSync.java','utf8');
assert.match(native,/InetSocketAddress activeManagerEndpoint/);
assert.match(native,/destination = pinned != null \? pinned : remembered != null \? remembered/);
assert.match(native,/catch \(IOException ioError\)[\s\S]*?failedDestination = destination;[\s\S]*?networkChanged = true/);
assert.match(native,/findServer\(companyId, failedDestination\)/);
assert.match(native,/if \(excluded != null && excluded\.equals\(candidate\)\)/);
assert.match(native,/pendingVerifiedEndpoint = destination/);
assert.match(native,/confirmVerifiedSync\(String companyId\)/);
const networkChange=native.split('private void notifyWifiChange()')[1].split('// JavascriptInterface')[0];
assert(!/activeManagerEndpoint\s*=\s*null/.test(networkChange),'Wi-Fi changes must not silently unpin an active manager');
const protocol=require('../app/src/main/assets/www/static/field-protocol.js');
const encryption=require('../app/src/main/assets/www/static/field-lan-crypto.js');
const companyId='company_1234567890',agentId='agent_1234567890';
const key=protocol.b64u(crypto.randomBytes(32));
const confirmed=[];
const sandbox={console,crypto:crypto.webcrypto,TextEncoder,TextDecoder,atob,btoa,setTimeout,clearTimeout,
 FieldProtocol:protocol,FieldLanCrypto:encryption,TiqanyEmployeeAuth:require('../app/src/main/assets/www/static/employee-password-auth.js'),
 window:{AndroidLocalSync:{send:(id,packet)=>{sandbox.lastFrame=packet;},confirmVerifiedSync:(id)=>confirmed.push(id)}},
 document:{getElementById:()=>null}};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('field_agent/src/main/assets/www/static/agent.js','utf8')+'\nglobalThis.TestAgent=Agent;',sandbox);
const agent=sandbox.TestAgent;
agent.state={companyId,agentId,key,warehouseId:'wh_1',companyName:'X',agentName:'A',vehicleName:'Van',items:[],accounts:[],categories:[],ops:[],knownIds:[],stock:{},exchangeRate:15000};
agent.show=async()=>{};agent.toast=()=>{};agent.syncPaint=()=>{};agent.active=async()=>true;agent.save=async()=>{};
const catalog={kind:'provision',companyId,agentId,key,companyName:'X',agentName:'A',vehicleName:'Van',warehouseId:'wh_1',items:[],accounts:[],stock:{},knownIds:[],exchangeRate:15000};
async function reply(build,transport){
 const request=await encryption.open(JSON.parse(sandbox.lastFrame),key,companyId,agentId);
 const ack={...build(request),appVersion:'3.5.156'};
 const cipher=await encryption.pack(ack,key,companyId,agentId);
 await agent.onLocalSyncResult(JSON.stringify({data:JSON.stringify(cipher),...(transport?{transport}:{})}));
}
async function connect(){
 await agent.syncOneTap();
 await reply(req=>({kind:'sync_result',companyId,agentId,requestNonce:req.nonce}));
 assert.equal(agent.lanSyncStage,'operations');
}
(async()=>{
 await connect();
 await reply(req=>({kind:'sync_result',companyId,agentId,requestNonce:req.nonce,knownIds:[],catalog}));
 assert.deepEqual(confirmed,[companyId],'only committed/verified reply pins a manager');
 await connect();
 await reply(req=>({kind:'sync_result',companyId,agentId,requestNonce:'old_nonce',knownIds:[],catalog}));
 assert.deepEqual(confirmed,[companyId],'replayed ACK cannot pin a new manager');
 await connect();
 await reply(req=>({kind:'sync_result',companyId,agentId,requestNonce:req.nonce,knownIds:[],catalog}),'cloud');
 assert.deepEqual(confirmed,[companyId],'cloud ACK cannot verify or persist a stale LAN endpoint');
 agent.save=async()=>{throw Error('disk full');};
 agent.state.companyName='Different';
 await connect();
 await reply(req=>({kind:'sync_result',companyId,agentId,requestNonce:req.nonce,knownIds:[],catalog}));
 assert.deepEqual(confirmed,[companyId],'failed catalog commit cannot pin manager');
 console.log('PASS: sticky manager transport, excluded failed endpoint, no parallel discovery while active, verified ACK and durable-save gate.');
})().catch(e=>{console.error(e);process.exitCode=1});
