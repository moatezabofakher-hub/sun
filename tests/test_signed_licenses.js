// Check actual shipped verifier against newly generated disposable keys only.
// NO signing key or usable signed activation is published with this repository.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto, generateKeyPairSync, sign} = require('node:crypto');
const html = fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const start = html.indexOf('const LicenseManager = {');
const end = html.indexOf('const Accounting = {', start);
assert(start >= 0 && end > start);
const State = {license:{deviceId:'RD-TESTDEVICE001',isActivated:false,activationCode:'',opsUsedCount:0},
                   invoices:[],vouchers:[],items:[],accounts:[]};
const store = new Map();
const localStorage = {getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const sandbox = {crypto:webcrypto,TextDecoder,TextEncoder,Uint8Array,State,console,localStorage,
  atob: globalThis.atob, btoa: globalThis.btoa, Date,
  document:{getElementById:()=>null},UI:{toast:()=>{}}, StorageEngine:{saveState:async()=>{}}};
vm.createContext(sandbox);
vm.runInContext(html.slice(start,end)+'\n globalThis.LicenseManager=LicenseManager;',sandbox);
const {publicKey,privateKey} = generateKeyPairSync('rsa',{modulusLength:2048});
const pub = publicKey.export({type:'spki',format:'der'}).toString('base64');
const payload = Buffer.from(JSON.stringify({d:'RD-TESTDEVICE001',iat:'2026-01-01',p:'SAN_SHINE_ACCOUNTING',v:1}));
const toB64u = b=>Buffer.from(b).toString('base64url');
const sig = sign('sha256',payload,privateKey);
const token = 'SS1.' + toB64u(payload) + '.' + toB64u(sig);
const tampered = 'SS1.' + toB64u(Buffer.from(JSON.stringify({d:'RD-TESTDEVICE001',iat:'2026-01-02',p:'SAN_SHINE_ACCOUNTING',v:1}))) + '.' + toB64u(sig);
(async()=>{
  const mgr = sandbox.LicenseManager;
  // Confirm built-in public key is syntactically valid but cannot verify a different key's signature.
  assert.equal(await mgr.verifyCode('RD-TESTDEVICE001',token),false,'untrusted signature rejected');
  mgr.PUBLIC_KEY_SPKI_B64=pub;
  mgr.publicCryptoKey=null;
  assert.equal(await mgr.verifyCode('RD-TESTDEVICE001',token),true,'valid disposable signature');
  assert.equal(await mgr.verifyCode('RD-OTHERDEVICE001',token),false,'device-bound');
  assert.equal(await mgr.verifyCode('RD-TESTDEVICE001',tampered),false,'tampered payload');
  assert.equal(await mgr.verifyCode('RD-TESTDEVICE001','ACT-AAAA-BBBB-CCCC'),false,'legacy token rejected');
  store.set('alraed_act_code','ACT-AAAA-BBBB-CCCC');
  await mgr.syncFallbackStorage();
  assert.equal(State.license.isActivated,false,'legacy code cannot activate');
  assert.equal(store.has('alraed_act_code'),false,'legacy storage cleared');
  store.set('sunshine_signed_license_v1',token);
  await mgr.syncFallbackStorage();
  assert.equal(State.license.isActivated,true,'valid signed code persists');
  console.log('PASS: disposable RSA keys, trusted signature, device binding, tamper and legacy rejection, persistence.');
})().catch(e=>{console.error(e);process.exitCode=1});
