'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');const web=path.join(root,'app/src/main/assets/www');
const html=fs.readFileSync(path.join(web,'index.html'),'utf8');const peer=fs.readFileSync(path.join(web,'static/tiqany-peer-controller.js'),'utf8');
test('Android main header opens sync settings without requiring PIN; QR scanner has biometric-first approval',()=>{
 assert.match(html,/<button id="ta-desktop-phone-connection"[^>]+onclick="TiqanyPeerSync.openSettingsFromHeader\(\)"/);
 assert.match(peer,/openSettingsFromHeader\(\)\{/);
 assert.match(peer,/this\.headerRequestedSettings=false;/);
 assert.match(peer,/requestSettingsAccess\(\{currentTarget:summary/);
 assert.match(peer,/ProtectionController\.requestPin\(/);
 assert.match(peer,/scanPairing\(\)\{[\s\S]*?authorizePairing\(/);
 assert.doesNotMatch(peer,/passwordOnly:true/);
});
test('Android main independent profile activation honors selected company name',()=>{
 assert.match(html,/newState\.settings\.companyName=String\(selected\.name\)\.trim\(\)/);
});
