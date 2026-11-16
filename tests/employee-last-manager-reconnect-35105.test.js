'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const native=fs.readFileSync('field_agent/src/main/java/com/sunshine/accounting/NativeLocalSync.java','utf8');
const auto=fs.readFileSync('field_agent/src/main/assets/www/static/agent-auto-sync.js','utf8');
const employee=fs.readFileSync('field_agent/src/main/assets/www/static/agent.js','utf8');
test('verified manager address is saved for the paired company and restored after process restart',()=>{
 assert.match(native,/private final SharedPreferences verifiedEndpoints/);
 assert.match(native,/rememberVerifiedEndpoint\(companyId, pendingVerifiedEndpoint\)/);
 assert.match(native,/private InetSocketAddress rememberedVerifiedEndpoint\(String companyId\)/);
 assert.match(native,/String stored = verifiedEndpoints\.getString\(companyId, ""\)/);
 assert.match(native,/if \(!safeLocalAddress\(host\) \|\| port < 1024 \|\| port > 65535\) return null/);
 assert.match(native,/verifiedEndpoints\.edit\(\)\.putString\(companyId, host \+ ":" \+ port\)\.apply\(\)/);
});
test('after a disconnect try authenticated session, then remembered LAN address, then local discovery',()=>{
 const chunk=native.split('public void send(String companyId, String encryptedRequest)')[1].split('private void bindToWifiIfAvailable')[0];
 assert.match(chunk,/InetSocketAddress remembered = rememberedVerifiedEndpoint\(companyId\)/);
 assert.match(chunk,/destination = pinned != null \? pinned : remembered != null \? remembered/);
 assert.match(chunk,/findServer\(companyId, failedDestination\)/);
 assert.match(chunk,/catch \(IOException ioError\)[\s\S]+?failedDestination = destination/);
 assert.match(native,/if \(!sending\.compareAndSet\(false, true\)\)/);
 assert.match(native,/pendingVerifiedEndpoint = destination/);
});
test('network change and foreground resume wake automatic sync, no infinite rapid retry',()=>{
 assert.match(native,/networkChanged=true/);
 assert.match(native,/Agent\.scheduleAutoSync\&\&Agent\.scheduleAutoSync\(300\)/);
 assert.match(auto,/ONLINE_PERIOD=12000/);
 assert.match(auto,/OFFLINE_RETRY=15000/);
 assert.match(auto,/visibilitychange/);
 assert.match(auto,/addEventListener\?\.\('online'/);
 assert.match(auto,/addEventListener\?\.\('pageshow'/);
 assert.match(auto,/if\(this\.lanSyncBusy\|\|this\.busy\)/);
});
test('cloud ACK cannot mark stale LAN IP as trusted; native requires authenticated catalog',()=>{
 assert.match(employee,/transport:'cloud'/);
 assert.match(employee,/if\(result\.transport!=='cloud'\)window\.AndroidLocalSync\?\.confirmVerifiedSync\?\.\(this\.state\.companyId\)/);
 assert.match(employee,/ack=await FieldLanCrypto\.open\(/);
 assert.match(employee,/rejectUnverifiedSync/);
 assert.match(employee,/if\(ack\.kind!=='sync_result'/);
});
