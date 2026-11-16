/* 3.5.114 — Employee credential is owned exclusively by management.
   Only a salted PBKDF2 verifier travels over authenticated encrypted sync. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.TiqanyEmployeeAuth=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const ALGO='pbkdf2-sha256-v1',ITERATIONS=180000;
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function decode(input){
    if(typeof input!=='string'||!input||!/^[A-Za-z0-9+/]+={0,2}$/.test(input))throw Error('بيانات كلمة سر الموظف غير صالحة');
    return Uint8Array.from(atob(input),c=>c.charCodeAt(0));
  }
  function encode(bytes){return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));}
  function valid(config){
    if(!config||config.algo!==ALGO)return false;
    try{return decode(config.salt).length===16 && decode(config.hash).length===32;}catch(_){return false;}
  }
  async function hash(password,salt){
    if(!globalThis.crypto?.subtle)throw Error('التشفير الآمن غير متوفر على هذا الجهاز');
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
    return encode(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:ITERATIONS,salt:decode(salt)},key,256)));
  }
  async function create(password){
    if(typeof password!=='string'||password.length<6||password.length>128||!password.trim())throw Error('كلمة سر الموظف يجب أن تكون بين 6 و128 خانة');
    const saltBytes=new Uint8Array(16);crypto.getRandomValues(saltBytes);
    const salt=encode(saltBytes);
    return {algo:ALGO,salt,hash:await hash(password,salt),updatedAt:new Date().toISOString()};
  }
  async function verify(password,config){
    if(!valid(config)||typeof password!=='string'||!password)return false;
    const received=decode(await hash(password,config.salt)),stored=decode(config.hash);
    let difference=0;for(let i=0;i<32;i++)difference|=received[i]^stored[i];
    return difference===0;
  }
  function resolve(previous,received){
    // A manager still offline may publish its older catalog. Do not roll back
    // the employee password, even if a late response arrives after a reset.
    if(received && !valid(received))throw Error('بيانات كلمة سر الموظف الواردة غير صحيحة');
    if(!valid(previous))return valid(received)?received:null;
    if(!valid(received))return previous;
    const a=Number(previous.version)||0,b=Number(received.version)||0;
    if(b>a)return received;
    if(b<a)return previous;
    if(previous.hash===received.hash&&previous.salt===received.salt)return previous;
    const at=Date.parse(previous.updatedAt||''),bt=Date.parse(received.updatedAt||'');
    if(Number.isFinite(at)&&Number.isFinite(bt)&&bt>at)return received;
    return previous;
  }
  return {create,verify,valid,resolve};
});
