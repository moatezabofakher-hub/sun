/* Technical Accountant LAN v1 — authenticated encrypted peer-to-peer payloads.
 * The transport sees only device/company identifiers and AES-GCM ciphertext.
 * Key is the already-paired 256-bit secret from the provisioning file.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.FieldLanCrypto=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const enc=new TextEncoder(),dec=new TextDecoder();
  const VERSION='TA-LAN-1';
  function subtle(){const s=globalThis.crypto?.subtle;if(!s)throw Error('التشفير الآمن غير متاح');return s;}
  function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  function unbase64(value){if(!/^[A-Za-z0-9_-]+$/.test(String(value))||value.length>12000000)throw Error('محتوى تشفير غير صالح');const s=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));return Uint8Array.from(s,ch=>ch.charCodeAt(0));}
  async function aesKey(pairKey){
    const p=unbase64(pairKey);
    if(p.length!==32)throw Error('مفتاح الاقتران غير صالح');
    const ctx=enc.encode('TA-LAN-PROTOCOL-v1:');
    const raw=new Uint8Array(ctx.length+p.length);raw.set(ctx);raw.set(p,ctx.length);
    const hash=await subtle().digest('SHA-256',raw);
    return subtle().importKey('raw',hash,'AES-GCM',false,['encrypt','decrypt']);
  }
  function ids(companyId,agentId){
    if(typeof companyId!=='string'||!/^company_[A-Za-z0-9_-]{8,128}$/.test(companyId))throw Error('هوية الشركة غير صالحة');
    if(typeof agentId!=='string'||!/^agent_[A-Za-z0-9_-]{8,128}$/.test(agentId))throw Error('هوية المندوب غير صالحة');
    return {companyId,agentId};
  }
  async function pack(payload,key,companyId,agentId){
    ids(companyId,agentId);
    const iv=new Uint8Array(12);globalThis.crypto.getRandomValues(iv);
    const aad=enc.encode(VERSION+'|'+companyId+'|'+agentId);
    const text=JSON.stringify(payload);
    if(text.length>4700000)throw Error('الحزمة كبيرة؛ يجب مزامنة دفعات أصغر');
    const sealed=await subtle().encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},await aesKey(key),enc.encode(text));
    return {version:VERSION,companyId,agentId,iv:base64(iv),body:base64(new Uint8Array(sealed))};
  }
  async function open(packet,key,companyId,agentId){
    if(!packet||packet.version!==VERSION||packet.companyId!==companyId||packet.agentId!==agentId)throw Error('الملف لا يخص الشركة أو المندوب');
    ids(companyId,agentId);
    const iv=unbase64(packet.iv),body=unbase64(packet.body);
    if(iv.length!==12||body.length<17||body.length>7500000)throw Error('حزمة غير صحيحة');
    const aad=enc.encode(VERSION+'|'+companyId+'|'+agentId);
    try { const plain=await subtle().decrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},await aesKey(key),body);
      return JSON.parse(dec.decode(plain));
    }catch(_){throw Error('فشل التحقق المشفر من المندوب أو البيانات');}
  }
  return {VERSION,pack,open};
});
