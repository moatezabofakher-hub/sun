/* New-device discovery and manager-approved, encrypted LAN setup.
 * All existing manual provisioning and signed legacy licenses remain supported. */
(function(){
 'use strict';
 const P=FieldPairCrypto,A=Agent;
 const existingActive=A.active.bind(A);
 A.active=async function(){
   if(await existingActive())return true;
   return this.ready() && await P.verifyGrant(this.state.enrollmentGrant,this.state.pairedAuthorityKey,this.state.deviceId,this.state.companyId,this.state.agentId);
 };
 const oldSetup=A.renderSetup.bind(A),oldActivation=A.renderActivation.bind(A);
 const controls=()=>`<div class="panel"><h3>🔗 الربط التلقائي مع التطبيق الرئيسي</h3>
   <p class="tiny">شغّل التطبيق الرئيسي على شبكة Wi-Fi نفسها؛ سيظهر طلب جهازك للإدارة تلقائياً. بعد مطابقة رمز الأمان وموافقة المسؤول تُستلم بيانات المندوب وتُفعّل تلقائياً، دون ملفات أو رموز طويلة.</p>
   <div id="agentPairStatus" class="field" aria-live="polite">جارٍ البحث عن الإدارة على الشبكة المحلية…</div>
   <div id="agentPairCode" class="hide" style="text-align:center;border:1px solid #99d6cd;border-radius:14px;padding:12px;margin-top:10px;background:#eefefa"><p class="tiny" style="margin:0">طابق هذا الرقم مع الرقم لدى الإدارة قبل الموافقة</p><strong id="agentPairCodeDigits" style="display:block;direction:ltr;letter-spacing:.2em;font-size:28px;color:#056e68"></strong></div>
   <button class="primary" onclick="AgentPairing.restart()">🔍 البحث عن التطبيق الرئيسي والربط</button>
 </div>`;
 A.renderSetup=function(){return controls()+`<details class="panel"><summary style="font-weight:800;cursor:pointer">طريقة التجهيز بالملف (احتياطية)</summary>${oldSetup()}</details>`;};
 A.renderActivation=function(){return controls()+`<details class="panel"><summary style="font-weight:800;cursor:pointer">التفعيل اليدوي برمز قديم (احتياطي)</summary>${oldActivation()}</details>`;};
 const Pair={
   requestId:null,ephemeral:null,sessionKey:null,companyId:'',companyName:'',code:'',waiting:false,inFlight:false,done:false,
   timer:null,watchdog:null,startedAt:0,status:'سيبدأ البحث عن التطبيق الرئيسي تلقائياً…',
   paint(){const status=document.getElementById('agentPairStatus');if(status)status.textContent=this.status;
     const box=document.getElementById('agentPairCode');if(box)box.classList.toggle('hide',!this.code);
     const code=document.getElementById('agentPairCodeDigits');if(code)code.textContent=this.code;
   },
   schedule(delay){clearTimeout(this.timer);this.timer=setTimeout(()=>this.next(),delay);},
   async start(){
     if(this.inFlight||this.done||document.hidden||!A.state)return;
     if(A.ready() && await A.active())return;
     if(A.ready() && A.pending?.length){this.status='توجد عمليات غير مرحّلة؛ لا يمكن تغيير الربط قبل مزامنتها أو تصديرها.';this.paint();return;}
     if(!window.AndroidLocalSync?.requestPairing){this.status='الربط التلقائي متاح في نسخة APK المحدثة؛ يمكنك استخدام ملف التجهيز كخيار احتياطي.';this.paint();return;}
     this.requestId='pr_'+FieldProtocol.uuid();this.ephemeral=await P.createEphemeral();this.sessionKey=null;this.code='';this.companyId='';this.startedAt=Date.now();this.done=false;
     this.status='🔍 جارٍ اكتشاف التطبيق الرئيسي على Wi-Fi…';this.paint();
     this.send('hello',this.ephemeral.publicKey);
   },
   restart(){clearTimeout(this.timer);clearTimeout(this.watchdog);this.inFlight=false;this.done=false;this.requestId=null;this.code='';this.companyId='';this.paint();this.start().catch(e=>{this.status=e.message;this.paint();});},
   send(kind,publicKey){
     if(this.inFlight||!this.requestId||this.done)return;
     this.inFlight=true;clearTimeout(this.watchdog);
     const msg={pairingProtocol:P.VERSION,kind,requestId:this.requestId,deviceId:A.state.deviceId};
     if(publicKey)msg.publicKey=publicKey;
     if(kind==='confirm')return; // confirm is sent separately with encrypted acknowledgement
     try {window.AndroidLocalSync.requestPairing(this.companyId,JSON.stringify(msg));}
     catch(e){this.inFlight=false;this.status='تعذر إرسال الطلب: '+e.message;this.paint();this.schedule(12000);return;}
     this.watchdog=setTimeout(()=>{if(this.inFlight){this.inFlight=false;this.status='انتهت مهلة البحث؛ ستُعاد المحاولة تلقائياً';this.paint();this.schedule(12000);}},49000);
   },
   async next(){
     if(this.done||document.hidden)return;
     if(this.inFlight){this.schedule(2500);return;}
     if(!this.requestId||Date.now()-this.startedAt>290000){this.requestId=null;return this.start();}
     this.send(this.companyId?'poll':'hello',this.companyId?null:this.ephemeral?.publicKey);
   },
   async onNetworkReply(raw){
     clearTimeout(this.watchdog);this.inFlight=false;
     try{
       const result=JSON.parse(raw);
       if(result.error)throw Error(result.error);
       const data=JSON.parse(result.data);
       if(data.pairingProtocol!==P.VERSION||data.requestId!==this.requestId)throw Error('رد الربط لا يطابق الطلب');
       if(data.kind==='error')throw Error(data.message||'رفض التطبيق الرئيسي الربط');
       if(data.kind==='done'){this.done=true;return;}
       if(!['pending','approved'].includes(data.kind))throw Error('رد غير متوقع');
       if(!/^company_[a-zA-Z0-9_-]{8,128}$/.test(data.companyId||''))throw Error('تعريف الشركة غير صحيح');
       if(this.companyId && this.companyId!==data.companyId)throw Error('تغيّر التطبيق الرئيسي أثناء الربط');
       this.companyId=data.companyId;this.companyName=String(data.companyName||'المركز الرئيسي').slice(0,100);
       if(!this.sessionKey){
         if(!P.validPub(data.managerPublic))throw Error('مفتاح الإدارة غير صحيح');
         const derived=await P.derive(this.ephemeral.privateKey,data.managerPublic,this.requestId);
         this.sessionKey=derived.key;this.code=derived.code;
       }
       if(data.kind==='approved')return await this.finish(data);
       this.status='⏳ تم العثور على «'+this.companyName+'». قارن رقم الأمان على الهاتفين، ثم اطلب من الإدارة اختيار المندوب والموافقة.';
       this.paint();this.schedule(3000);
     }catch(e){
       this.status='الربط: '+String(e.message||e);this.paint();
       if(/انتهت مهلة الطلب|تغيّر التطبيق/.test(this.status)){this.companyId='';this.requestId=null;}
       this.schedule(12000);
     }
   },
   async finish(data){
     const message=await P.open(this.sessionKey,this.requestId,data.encrypted);
     const c=message.catalog;
     if(message.kind!=='enrollment'||message.requestId!==this.requestId||message.deviceId!==A.state.deviceId||!c||c.companyId!==data.companyId||!/^agent_[a-zA-Z0-9_-]{8,128}$/.test(c.agentId||'')||!Array.isArray(c.items)||!Array.isArray(c.accounts)||!Array.isArray(c.knownIds)||typeof c.key!=='string')throw Error('بيانات الربط غير مكتملة');
     if(!await P.verifyGrant(message.grant,message.authorityKey,A.state.deviceId,c.companyId,c.agentId))throw Error('فشل التحقق من موافقة الإدارة');
     const old=A.state;
     if(old.companyId&&old.companyId!==c.companyId)throw Error('لا يمكن تبديل الشركة على جهاز مرتبط سابقاً');
     if(old.agentId&&old.agentId!==c.agentId)throw Error('لا يمكن تغيير المندوب دون إعادة تجهيز الجهاز');
     if(A.pending?.length)throw Error('هناك عمليات غير مرحّلة، يجب مزامنتها أولاً');
     const updated={...old,companyId:c.companyId,companyName:c.companyName,agentId:c.agentId,agentName:c.agentName,vehicleName:c.vehicleName,
       warehouseId:c.warehouseId,key:c.key,items:c.items,categories:c.categories||[],accounts:c.accounts,
       stock:c.stock||{},knownIds:Array.from(new Set([...(old.knownIds||[]),...c.knownIds])),snapshotIds:c.knownIds,exchangeRate:c.exchangeRate,
       issuedAt:c.issuedAt,pairedAuthorityKey:message.authorityKey,enrollmentGrant:message.grant};
     A.state=updated;
     try{await A.save();}catch(e){A.state=old;throw e;}
     this.done=true;clearTimeout(this.timer);
     this.status='✅ تم ربط الجهاز وتفعيله وتحديث المواد والعملاء بنجاح';this.paint();
     A.toast('✅ تم الربط والتفعيل تلقائياً مع '+c.companyName);
     await A.show('home');A.scheduleAutoSync?.(0);
     // Manager only marks the request complete after a locally committed setup.
     const ack=await P.seal(this.sessionKey,this.requestId,{kind:'confirm',requestId:this.requestId,agentId:c.agentId,deviceId:A.state.deviceId});
     const msg={pairingProtocol:P.VERSION,kind:'confirm',requestId:this.requestId,deviceId:A.state.deviceId,encrypted:ack};
     setTimeout(()=>{try{window.AndroidLocalSync.requestPairing(this.companyId,JSON.stringify(msg));}catch(_){/* binding is already persisted */}},900);
   }
 };
 window.AgentPairing=Pair;
 document.addEventListener('visibilitychange',()=>{if(!document.hidden && !Pair.done && A.state)A.active().then(active=>{if(!active)Pair.schedule(1000);}).catch(()=>{});});
 const init=A.init.bind(A);
 A.init=async function(){await init();if(this.state && !await this.active())Pair.schedule(800);};
 const show=A.show.bind(A);
 A.show=async function(...args){await show(...args);Pair.paint();};
})();
