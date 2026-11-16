/* 3.5.114 — Employee application lock (credentials issued only by managers).
   There is no employee-side password reset or change flow. */
(function(){
 'use strict';
 const A=Agent;
 let unlocked=false,credentialFingerprint='',failures=0,blockedUntil=0;
 const escape=s=>A.escape(s);
 function cfg(){return A.state?.employeeAuth;}
 function key(){const c=cfg();return c?.hash?String(c.salt||'')+':'+c.hash+':'+String(c.updatedAt||''):'';}
 function required(){return !!cfg()?.hash;}
 const style=document.createElement('style');
 style.textContent='#ta-employee-lock{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:linear-gradient(140deg,#0a2846,#0b656a);padding:15px;box-sizing:border-box;font-family:system-ui,sans-serif;color:#132d47}#ta-employee-lock-card{width:min(100%,420px);padding:25px;border-radius:24px;background:#fff;box-shadow:0 16px 55px #0007;text-align:right;direction:rtl}#ta-employee-lock-card h2{font-size:21px;margin:0 0 12px;font-weight:900;color:#104770}#ta-employee-lock-card p{font-size:14px;line-height:1.7}#ta-employee-lock-card input{width:100%;min-height:49px;background:#effafa;border:2px solid #93d8cc;border-radius:13px;box-sizing:border-box;padding:12px;font-size:18px;direction:ltr;text-align:center}#ta-employee-lock-card button{width:100%;margin-top:14px;min-height:47px;border:0;border-radius:13px;background:#0a777c;color:#fff;font-weight:900;font-size:16px}#ta-employee-lock-card button:disabled{opacity:.55}#ta-employee-lock-error{color:#b91c1c;font-size:13px;min-height:24px;font-weight:700}body.ta-employee-locked #agentHeader,body.ta-employee-locked #screen,body.ta-employee-locked #bottom{visibility:hidden!important;pointer-events:none!important}';
 document.head.appendChild(style);
 function remove(){document.getElementById('ta-employee-lock')?.remove();document.body.classList.remove('ta-employee-locked');for(const id of ['screen','bottom','agentHeader']){const el=document.getElementById(id);if(el)el.inert=false;}}
 function show(){
   if(!required()){remove();return;}
   document.body.classList.add('ta-employee-locked');
   for(const id of ['screen','bottom','agentHeader']){const el=document.getElementById(id);if(el)el.inert=true;}
   if(document.getElementById('ta-employee-lock'))return;
   const el=document.createElement('section');el.id='ta-employee-lock';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','تسجيل دخول موظف البيع');
   el.innerHTML='<div id="ta-employee-lock-card"><h2>🔒 كلمة سر موظف البيع</h2><p>ادخل كلمة السر التي خصصها لك المدير لفتح تطبيق المحاسب التقني. عند تغييرها من المدير ستصل بعد المزامنة.</p><form id="ta-employee-login-form" autocomplete="off"><label for="ta-employee-login-pin">كلمة سر الموظف</label><input id="ta-employee-login-pin" type="password" autocomplete="current-password" maxlength="128" required><button type="submit" id="ta-employee-login-button">فتح التطبيق</button></form><p id="ta-employee-lock-error" role="alert"></p><p style="font-size:12px;color:#64748b">نسيت كلمة السر؟ اطلبها من المدير، ولا يمكن إعادة تعيينها من هاتف الموظف.</p></div>';
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
   el.querySelector('input')?.focus();
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
   if(document.hidden){unlocked=false;credentialFingerprint='';}else enforce();
 });
 window.addEventListener('pagehide',()=>{unlocked=false;credentialFingerprint='';});
 window.TiqanyEmployeeLock={enforce,isUnlocked:()=>!required()||(unlocked&&credentialFingerprint===key()),lock:()=>{unlocked=false;credentialFingerprint='';enforce();}};
})();
