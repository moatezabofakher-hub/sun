'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');const web=path.join(root,'app/src/main/assets/www');
const html=fs.readFileSync(path.join(web,'index.html'),'utf8');const peer=fs.readFileSync(path.join(web,'static/tiqany-peer-controller.js'),'utf8');
test('Android main header prefers biometric confirmation for phone-computer settings',()=>{
 assert.match(html,/<button id="ta-desktop-phone-connection"[^>]+onclick="TiqanyPeerSync.openSettingsFromHeader\(\)"/);
 assert.match(peer,/openSettingsFromHeader\(\)\{/);
 assert.match(peer,/this\.headerRequestedSettings=false;/);
 assert.match(peer,/requestSettingsAccess\(\{currentTarget:summary/);
 assert.match(peer,/ProtectionController\.requestPin\(/);
 assert.doesNotMatch(peer,/passwordOnly:true/);
});
test('Android main independent profile activation honors selected company name',()=>{
 assert.match(html,/newState\.settings\.companyName=String\(selected\.name\)\.trim\(\)/);
});
