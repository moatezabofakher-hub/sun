/* LAN enrollment: authenticated-by-comparison ECDH session, private encrypted
 * provisioning and manager-signed offline device grants. No internet needed. */
(function(root,factory){ const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.FieldPairCrypto=api; })(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const VERSION='TA-PAIR-1', enc=new TextEncoder(), dec=new TextDecoder();
 const subtle=()=>{if(!globalThis.crypto?.subtle)throw Error('هذا الجهاز لا يدعم التشفير الآمن');return globalThis.crypto.subtle;};
 const validId=x=>typeof x==='string'&&/^pr_[a-f0-9]{32}$/.test(x);
 const b64u=bytes=>{let s='';for(let i=0;i<bytes.length;i+=4096)s+=String.fromCharCode(...bytes.subarray(i,i+4096));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
 const un64=text=>{if(typeof text!=='string'||text.length>2000000||!/^[a-zA-Z0-9_-]+$/.test(text))throw Error('بيانات مشفرة غير صحيحة');const x=atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4));return Uint8Array.from(x,c=>c.charCodeAt(0));};
 function validPub(p){return !!p&&p.kty==='EC'&&p.crv==='P-256'&&typeof p.x==='string'&&typeof p.y==='string'&&p.x.length===43&&p.y.length===43&&/^[a-zA-Z0-9_-]+$/.test(p.x+p.y);}
 async function createEphemeral(){const pair=await subtle().generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);return {privateKey:pair.privateKey,publicKey:await subtle().exportKey('jwk',pair.publicKey)};}
 async function derive(priv,remote,requestId){if(!validId(requestId)||!validPub(remote))throw Error('معلومات جهاز غير صحيحة');
  const pub=await subtle().importKey('jwk',remote,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const bits=new Uint8Array(await subtle().deriveBits({name:'ECDH',public:pub},priv,256));
  const salt=enc.encode(VERSION+'|'+requestId);const input=new Uint8Array(bits.length+salt.length);input.set(bits);input.set(salt,bits.length);
  const hash=new Uint8Array(await subtle().digest('SHA-256',input));
  const key=await subtle().importKey('raw',hash,'AES-GCM',false,['encrypt','decrypt']);
  const code=(new DataView(hash.buffer).getUint32(0,false)%1000000).toString().padStart(6,'0');
  return {key,code};
 }
 async function seal(key,requestId,value){if(!validId(requestId))throw Error('معرّف طلب غير صالح');const iv=new Uint8Array(12);crypto.getRandomValues(iv);
  const plain=enc.encode(JSON.stringify(value));if(plain.length>4500000)throw Error('بيانات التجهيز كبيرة');
  const c=await subtle().encrypt({name:'AES-GCM',iv,additionalData:enc.encode(VERSION+'|'+requestId),tagLength:128},key,plain);
  return {iv:b64u(iv),body:b64u(new Uint8Array(c))};
 }
 async function open(key,requestId,packet){if(!validId(requestId)||!packet)throw Error('طلب غير صحيح');const iv=un64(packet.iv),body=un64(packet.body);
  if(iv.length!==12||body.length<16||body.length>7500000)throw Error('رد غير صحيح');
  const p=await subtle().decrypt({name:'AES-GCM',iv,additionalData:enc.encode(VERSION+'|'+requestId),tagLength:128},key,body);
  return JSON.parse(dec.decode(p));
 }
 async function createSigner(){const key=await subtle().generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);return {privateKey:await subtle().exportKey('jwk',key.privateKey),publicKey:await subtle().exportKey('jwk',key.publicKey)};}
 async function issueGrant(signer,license){if(!signer?.privateKey||!signer?.publicKey||!validPub(signer.publicKey))throw Error('مفتاح الإدارة غير صحيح');
  const priv=await subtle().importKey('jwk',signer.privateKey,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const signature=await subtle().sign({name:'ECDSA',hash:'SHA-256'},priv,enc.encode(JSON.stringify(license)));
  return {version:VERSION,license,signature:b64u(new Uint8Array(signature))};
 }
 async function verifyGrant(grant,pub,deviceId,companyId,agentId){try{
  const a=grant?.license;
  if(grant?.version!==VERSION||!validPub(pub)||!a||a.role!=='field-lan'||a.companyId!==companyId||a.agentId!==agentId||a.deviceId!==deviceId||!/^TD-[A-F0-9]{32}$/.test(deviceId))return false;
  if(!Number.isFinite(Date.parse(a.issuedAt))||!Number.isFinite(Date.parse(a.expiresAt))||Date.parse(a.issuedAt)>Date.now()+300000||Date.parse(a.expiresAt)<=Date.now())return false;
  const key=await subtle().importKey('jwk',pub,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  return await subtle().verify({name:'ECDSA',hash:'SHA-256'},key,un64(grant.signature),enc.encode(JSON.stringify(a)));
 }catch(_){return false;}}
 return {VERSION,validId,validPub,createEphemeral,derive,seal,open,createSigner,issueGrant,verifyGrant};
});
