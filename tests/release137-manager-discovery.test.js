'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../app/src/main');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const native=read('java/com/sunshine/accounting/MainManagerPeerSync.java');
const discovery=read('java/com/sunshine/accounting/ManagerPeerDiscovery.java');
const ui=read('assets/www/static/tiqany-manager-sync-130.js');
test('Manager advertises its own 32-character identity on LAN and retries discovery',()=>{
 assert.match(discovery,/TYPE="_tiqanymgr\._tcp\."/);
 assert.match(discovery,/name\(expectedId\)\.equals\(info\.getServiceName\(\)\)/);
 assert.match(discovery,/nsd\.discoverServices/);
 assert.match(discovery,/nsd\.registerService/);
 assert.match(discovery,/MulticastLock/);
 assert.match(native,/discovery\.advertise\(getServerId\(\),PORT,localIP\(\)\)/);
 assert.match(native,/discovery\.find\(serverId\)/);
 assert.match(native,/searchSubnet\(serverId,key\)/);
});
test('Reconnected IP is accepted only after encrypted verification of paired identity',()=>{
 assert.match(native,/"identify"\.equals\(command\.optString\("action"\)\)/);
 assert.match(native,/request=new JSONObject\(\)\.put\("protocol","TIQANY-MANAGER-1"\)/);
 assert.match(native,/response\.optBoolean\("ok"\)\&\&expectedId\.equals\(response\.optString\("serverId"\)\)/);
 assert.match(native,/InetSocketAddress found=findPairedManager\(prefs\.getString\(k\("client_id"\),""\),cipherKey\)/);
 assert.match(native,/if\(relocated\)prefs\.edit\(\)\.putString\(k\("host"\),host\)/);
 assert.doesNotMatch(discovery,/client_key|server_key/);
});
test('Unapproved paired phone seeks automatically but never bypasses first-link confirmation',()=>{
 assert.match(ui,/async reconnectTick\(\)/);
 assert.match(ui,/!peer\.serverId\|\|peer\.approved/);
 assert.match(ui,/await this\.sync\(false,true\)/);
 assert.match(ui,/setInterval\(\(\)=>this\.reconnectTick\(\),18000\)/);
 assert.match(ui,/this\.autoPaused=true/);
 assert.match(ui,/window\.confirm\(kind==='send'/);
});
