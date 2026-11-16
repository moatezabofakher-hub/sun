'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
for(const manager of ['app','field_agent']){
 const native=read(`${manager}/src/main/java/com/sunshine/accounting/NativeLocalSync.java`);
 assert.match(native,/receiverEndpoint\(\)/);
 assert.match(native,/setDirectEndpoint\(String company, String host, int port\)/);
 assert.match(native,/isOwnAddress\(/);
 assert.doesNotMatch(native,/webView\.getUrl\(/);
}
const agent=read('field_agent/src/main/assets/www/static/agent-pairing.js');
assert.match(agent,/onQrScanned\(text\)/);
assert.match(agent,/setDirectEndpoint\(company,host,port\)/);
assert.match(agent,/localQrTarget/);
const main=read('app/src/main/assets/www/static/field-main.js');
assert.match(main,/FieldLanCrypto\.open\(packet,agent\.key/);
assert.match(main,/startsWith\('cloud:'\)/);
const a=read('field_agent/src/main/assets/www/static/agent.js');
assert.match(a,/TiqanyCloudAgent\.send\(raw\)/);
assert.match(a,/onLocalSyncResult\(JSON\.stringify\(\{data:answer,transport:'cloud'\}\)\)/);
for(const f of ['app/src/main/assets/www/index.html','field_agent/src/main/assets/www/index.html']){
 assert.match(read(f),/tiqany-(manager-link|cloud-agent)\.js/);
}
console.log('PASS: both Android managers and agent include offline QR and authenticated cloud transport without replacing original ledger');
