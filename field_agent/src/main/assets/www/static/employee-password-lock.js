/* 3.5.114 — Employee application lock (credentials issued only by managers).
   There is no employee-side password reset or change flow. */
(function(){
 'use strict';
 const A=Agent;
 let unlocked=false,credentialFingerprint='',failures=0,blockedUntil=0,biometricBusy=false;
 let biometricOnForeground=false;
 // Local biometric preference belongs to THIS staff member on THIS device.
 // It never becomes part of the sync payload/backup. Disabling the manager's lock
 // does not erase the employee's locally approved fingerprint preference.
 function biometricStorageKey(){return 'tiqany.employee.biometric.v1.'+[A.state?.companyId,A.state?.agentId,A.state?.deviceId].map(x=>encodeURIComponent(String(x||''))).join(':');}
 function biometricPreference(){
   try {return JSON.parse(localStorage.getItem(biometricStorageKey())||'null');}catch(_){return null;}
 }
 function biometricReady(){const p=biometricPreference(),c=cfg();return !!(p?.enabled && c?.hash && p.credentialHash===c.hash && window.NativeSecurity?.authenticateBiometricOnly);}
 function biometricNative(){
   return new Promise((resolve,reject)=>{
     if(!window.NativeSecurity?.authenticateBiometricOnly)return reject(Error('البصمة غير متاحة على هذا الجهاز'));
     const id='E'+Math.random().toString(36).slice(2,14);const old=window.__nativeBiometricReply;
     let done=false,timer;
     const finish=(ok,reason)=>{
       if(done)return;done=true;clearTimeout(timer);window.__nativeBiometricReply=old;
       if(ok)resolve(true);else reject(Error(reason||'تعذر التحقق بالبصمة'));
     };
     window.__nativeBiometricReply=(requestId,success,reason)=>{
       if(requestId!==id){if(typeof old==='function')old(requestId,success,reason);return;}
       finish(success,reason);
     };
     timer=setTimeout(()=>finish(false,'انتهت مهلة البصمة، أعد المحاولة'),60000);
     try{window.NativeSecurity.authenticateBiometricOnly(id,'ar');}catch(e){finish(false,e?.message||'تعذر تشغيل البصمة');}
   });
 }
 async function unlockWithBiometric(){
   if(biometricBusy||!required()||!biometricReady()||unlocked)return false;
   biometricBusy=true;const identity=key();
   try{
     await biometricNative();
     if(identity!==key()||!required()||!biometricReady())throw Error('تغيّرت صلاحيات الموظف أثناء التحقق');
     unlocked=true;credentialFingerprint=identity;remove();await A.show(A.screen||'home');return true;
   }catch(e){
     const error=document.getElementById('ta-employee-lock-error');
     if(error)error.textContent=(e?.message||'تعذر التحقق بالبصمة')+'؛ أعد المحاولة أو اختر كلمة سر الموظف';
     return false;
   }
   finally{biometricBusy=false;}
 }
 function requestAssignedPassword(){
   return new Promise(resolve=>{
     const overlay=document.createElement('div');
     overlay.id='ta-employee-biometric-enroll';
     overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#08283ec9;display:flex;align-items:center;justify-content:center;padding:18px;direction:rtl';
     overlay.innerHTML='<form style="width:min(100%,420px);background:white;padding:22px;border-radius:18px;box-shadow:0 12px 36px #0005"><h3 style="margin:0 0 12px;font-size:19px">تفعيل بصمة موظف البيع</h3><p style="font-size:13px">أدخل كلمة السر التي أعطاك إياها المدير، وليس كلمة سر جديدة.</p><input type="password" autocomplete="current-password" aria-label="كلمة سر الموظف" required maxlength="128" style="width:100%;border:2px solid #0d8178;border-radius:12px;padding:12px;direction:ltr"><div style="display:flex;gap:10px;margin-top:13px"><button type="submit" style="flex:1;padding:12px;border:0;border-radius:12px;background:#067e70;color:white;font-weight:900">متابعة</button><button type="button" id="ta-employee-cancel-enroll" style="flex:1;padding:12px;border:0;border-radius:12px;background:#e2e8f0">إلغاء</button></div></form>';
     const close=v=>{overlay.remove();resolve(v);};
     overlay.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const input=overlay.querySelector('input');const value=input.value;input.value='';close(value);});
     overlay.querySelector('#ta-employee-cancel-enroll').addEventListener('click',()=>close(null));
     document.body.appendChild(overlay);overlay.querySelector('input').focus();
   });
 }
 async function registerFingerprint(){
   if(!TiqanyEmployeeAuth.valid(cfg()))return A.toast('يجب استلام كلمة سر الموظف من المدير أولاً');
   if(!window.NativeSecurity?.authenticateBiometricOnly)return A.toast('البصمة الأصلية غير متاحة؛ تأكد من إعدادها في الهاتف');
   const pin=await requestAssignedPassword();
   if(pin===null)return;
   if(!(await TiqanyEmployeeAuth.verify(pin,cfg())))return A.toast('كلمة سر الموظف التي حددها المدير غير صحيحة');
   const before=key();
   try{
     await biometricNative();
     if(before!==key())throw Error('تغيّرت كلمة السر أثناء التحقق؛ أعد المحاولة');
     localStorage.setItem(biometricStorageKey(),JSON.stringify({enabled:true,credentialHash:cfg().hash}));
     A.toast('تم تفعيل البصمة لهذا الهاتف؛ ستبقى محفوظة حتى إن عطّل المدير قفل التطبيق');
     await A.show('settings');
   }catch(e){A.toast('لم تُفعّل البصمة: '+e.message);}
 }
 function removeFingerprint(){
   // Local, explicit revocation by the employee; never synchronized by managers.
   localStorage.removeItem(biometricStorageKey());
   A.toast('أُزيل تفعيل البصمة من هذا الهاتف');A.show('settings');
 }

 const escape=s=>A.escape(s);
 function cfg(){return A.state?.employeeAuth;}
 function key(){const c=cfg();return c?.hash?String(c.salt||'')+':'+c.hash+':'+String(c.updatedAt||''):'';}
 function required(){return !!(cfg()?.hash && cfg()?.lockApp!==false);}
 const style=document.createElement('style');
 style.textContent='#ta-employee-lock{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:linear-gradient(140deg,#0a2846,#0b656a);padding:15px;box-sizing:border-box;font-family:system-ui,sans-serif;color:#132d47}#ta-employee-lock-card{width:min(100%,420px);padding:25px;border-radius:24px;background:#fff;box-shadow:0 16px 55px #0007;text-align:right;direction:rtl}#ta-employee-lock-card h2{font-size:21px;margin:0 0 12px;font-weight:900;color:#104770}#ta-employee-lock-card p{font-size:14px;line-height:1.7}#ta-employee-lock-card input{width:100%;min-height:49px;background:#effafa;border:2px solid #93d8cc;border-radius:13px;box-sizing:border-box;padding:12px;font-size:18px;direction:ltr;text-align:center}#ta-employee-lock-card button{width:100%;margin-top:14px;min-height:47px;border:0;border-radius:13px;background:#0a777c;color:#fff;font-weight:900;font-size:16px}#ta-employee-lock-card button:disabled{opacity:.55}#ta-employee-login-form.hide{display:none!important}#ta-employee-lock-error{color:#b91c1c;font-size:13px;min-height:24px;font-weight:700}body.ta-employee-locked #agentHeader,body.ta-employee-locked #screen,body.ta-employee-locked #bottom{visibility:hidden!important;pointer-events:none!important}';
 document.head.appendChild(style);
 function remove(){document.getElementById('ta-employee-lock')?.remove();document.body.classList.remove('ta-employee-locked');for(const id of ['screen','bottom','agentHeader']){const el=document.getElementById(id);if(el)el.inert=false;}}
 function show(){
   if(!required()){remove();return;}
   document.body.classList.add('ta-employee-locked');
   for(const id of ['screen','bottom','agentHeader']){const el=document.getElementById(id);if(el)el.inert=true;}
   if(document.getElementById('ta-employee-lock')){
     // The overlay can survive Android background/foreground transitions.
     // Show the biometric prompt again on return, not the password form.
     if(biometricOnForeground && biometricReady() && !biometricBusy){
       biometricOnForeground=false;
       setTimeout(()=>{if(document.getElementById('ta-employee-lock')&&document.visibilityState!=='hidden')unlockWithBiometric();},300);
     }
     return;
   }
   biometricOnForeground=false;
   const el=document.createElement('section');el.id='ta-employee-lock';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','تسجيل دخول موظف البيع');
   const finger=biometricReady();
   el.innerHTML='<div id="ta-employee-lock-card"><h2>🔒 فتح تطبيق موظف البيع</h2>'+
     (finger?'<p>استخدم بصمة هاتفك لفتح التطبيق. كلمة السر التي عيّنها المدير متاحة كخيار بديل.</p><button type="button" id="ta-employee-biometric-btn">☝️ فتح بالبصمة</button><button type="button" id="ta-employee-password-alternative" style="background:#eef5f8;color:#16445e;border:1px solid #bdd7e4">استخدام كلمة السر بدلًا من البصمة</button>':'<p>البصمة غير مفعّلة أو غير متاحة على هذا الهاتف. افتح بكلمة السر التي خصصها المدير، ثم فعّل البصمة من الضبط.</p>')+
     '<form id="ta-employee-login-form" class="'+(finger?'hide':'')+'" autocomplete="off"><label for="ta-employee-login-pin">كلمة سر الموظف الصادرة من المدير</label><input id="ta-employee-login-pin" type="password" autocomplete="current-password" maxlength="128" required><button type="submit" id="ta-employee-login-button">فتح التطبيق</button></form><p id="ta-employee-lock-error" role="alert"></p><p style="font-size:12px;color:#64748b">لا يمكن للموظف تغيير كلمة السر؛ اطلبها من المدير عند الحاجة.</p></div>';
   document.body.appendChild(el);
   el.querySelector('form').addEventListener('submit',async e=>{
     e.preventDefault();const field=document.getElementById('ta-employee-login-pin');const button=document.getElementById('ta-employee-login-button');const error=document.getElementById('ta-employee-lock-error');
     if(!field||!button)return;
     if(Date.now()<blockedUntil){error.textContent='أُوقفت المحاولات مؤقتاً. أعد المحاولة بعد قليل.';return;}
     const snapshot=key(),pass=field.value;field.value='';button.disabled=true;
     try{
       const ok=await TiqanyEmployeeAuth.verify(pass,cfg());
       if(!ok||snapshot!==key()){
         failures++;if(failures>=5){blockedUntil=Date.now()+30000;failures=0;}
         error.textContent='كلمة سر الموظف غير صحيحة'+(blockedUntil>Date.now()?'؛ أُوقفت المحاولات لمدة 30 ثانية':'');
         return;
       }
       failures=0;blockedUntil=0;unlocked=true;credentialFingerprint=snapshot;remove();
       await A.show(A.screen||'home');
     }catch(_){error.textContent='تعذر التحقق من كلمة السر؛ حاول مجدداً';}
     finally{button.disabled=false;}
   });
   el.querySelector('#ta-employee-biometric-btn')?.addEventListener('click',unlockWithBiometric);
   el.querySelector('#ta-employee-password-alternative')?.addEventListener('click',()=>{
     const form=document.getElementById('ta-employee-login-form');
     if(form){form.classList.remove('hide');form.querySelector('input')?.focus();}
   });
   if(finger)setTimeout(()=>{if(document.getElementById('ta-employee-lock')&&document.visibilityState!=='hidden')unlockWithBiometric();},300);
   else el.querySelector('input')?.focus();
 }
 function enforce(){
   if(!required()){unlocked=false;credentialFingerprint='';remove();return;}
   if(unlocked&&credentialFingerprint===key()){remove();return;}
   unlocked=false;credentialFingerprint='';show();
 }
 const save=A.save.bind(A);
 A.save=async function(...args){const value=await save(...args);enforce();return value;};
 const navigate=A.show.bind(A);
 A.show=async function(...args){enforce();if(required()&&!unlocked){A.screen=args[0]||A.screen;return;}
   const result=await navigate(...args);enforce();return result;};
 document.addEventListener('visibilitychange',()=>{
   if(document.hidden){
     // A native biometric prompt can temporarily pause WebView: do not loop.
     if(!biometricBusy)biometricOnForeground=true;
     unlocked=false;credentialFingerprint='';
   }else enforce();
 });
 window.addEventListener('pagehide',()=>{unlocked=false;credentialFingerprint='';if(!biometricBusy)biometricOnForeground=true;});
 window.TiqanyEmployeeLock={registerFingerprint,removeFingerprint,biometricReady,enforce,isUnlocked:()=>!required()||(unlocked&&credentialFingerprint===key()),lock:()=>{unlocked=false;credentialFingerprint='';enforce();}};
})();
