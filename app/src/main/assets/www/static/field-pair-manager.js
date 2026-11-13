/* Manager-approved zero-file LAN enrollment. Does not touch the sales ledger. */
(function(){
 'use strict';
 const P=FieldPairCrypto;
 const f=FieldSync;
 const lifetime=5*60*1000;
 f.pairingRequests=new Map();
 f.pairingBusy=false;
 f.pairingCards=function(){
   const now=Date.now();
   for(const [id,x] of this.pairingRequests)if(now-x.createdAt>lifetime)this.pairingRequests.delete(id);
   const rows=[...this.pairingRequests.values()];
   const agents=this.data().agents.filter(a=>!a.archived&&!a.disabled);
   if(!rows.length)return '<p class="text-xs text-slate-500">لا توجد طلبات ربط حالياً. افتح تطبيق المندوب الجديد على شبكة Wi-Fi نفسها وسيظهر طلبه هنا تلقائياً.</p>';
   return rows.map(r=>`<div class="rounded-xl border border-teal-200 bg-white p-3 my-2 space-y-2">
     <div class="font-bold text-sm">📱 جهاز مندوب جديد <span class="text-[10px] text-slate-500">${this.escape(r.deviceId.slice(-8))}</span></div>
     <p class="text-xs text-slate-600">قارن رقم الأمان الظاهر هنا بالرقم على هاتف المندوب، ولا توافق إذا كان مختلفاً.</p>
     <div class="text-center text-2xl font-black tracking-[.3em] bg-slate-50 rounded-xl p-2" dir="ltr">${r.code}</div>
     <p class="text-[11px] text-amber-800">عند تفعيل جهاز بديل للمندوب نفسه يتوقف اتصال الجهاز السابق؛ زامن فواتيره غير المرحّلة قبل الاستبدال.</p>
     ${r.status==='approved'?'<p class="text-sm font-bold text-teal-700">✅ تمت الموافقة. جارٍ تسليم بيانات التفعيل إلى الهاتف…</p>':
     `<select id="pairAgent_${r.id}" class="w-full border rounded-xl p-3 text-sm"><option value="">اختر المندوب المسجّل</option>${agents.map(a=>`<option value="${a.id}">${this.escape(a.name)} · ${this.escape(a.vehicleName||'')}${a.pairedDeviceId?' (استبدال جهاز قديم)':''}</option>`).join('')}</select>
      <button type="button" class="ta-primary-3d w-full p-3 rounded-xl font-black" onclick="FieldSync.approvePairing('${r.id}')">✓ مطابقة الرقم والموافقة على الربط</button>
      <button type="button" class="w-full bg-rose-50 text-rose-800 p-2 rounded-xl" onclick="FieldSync.rejectPairing('${r.id}')">رفض الطلب</button>`}
   </div>`).join('');
 };
 f.paintPairingRequests=function(){const el=document.getElementById('fieldPairingRequests');if(el)el.innerHTML=this.pairingCards();};
 f.rejectPairing=function(id){this.pairingRequests.delete(id);this.paintPairingRequests();UI.toast('تم رفض طلب الربط','info');};
 f.receivePairingPacket=async function(requestId,raw){
   let answer={pairingProtocol:P.VERSION,kind:'error',message:'طلب الربط غير متاح'};
   try{
     if(!window.AndroidLocalSync||typeof raw!=='string'||raw.length>12000)throw Error('الطلب كبير أو غير صحيح');
     const msg=JSON.parse(raw);
     if(msg.pairingProtocol!==P.VERSION||!P.validId(msg.requestId)||!/^TD-[A-F0-9]{32}$/.test(msg.deviceId||''))throw Error('هوية الجهاز غير صحيحة');
     let session=this.pairingRequests.get(msg.requestId);
     if(session && (Date.now()-session.createdAt>lifetime||session.deviceId!==msg.deviceId)){
       this.pairingRequests.delete(msg.requestId);session=null;
     }
     if(msg.kind==='hello'){
       if(!session){
         if(this.pairingRequests.size>=8)throw Error('يوجد عدد كبير من طلبات الربط المعلّقة');
         if(!P.validPub(msg.publicKey))throw Error('المفتاح العام غير صالح');
         const ep=await P.createEphemeral();
         const derived=await P.derive(ep.privateKey,msg.publicKey,msg.requestId);
         session={id:msg.requestId,deviceId:msg.deviceId,createdAt:Date.now(),code:derived.code,key:derived.key,managerPublic:ep.publicKey,status:'pending'};
         this.pairingRequests.set(msg.requestId,session);
         this.paintPairingRequests();
         UI.toast('📱 جهاز مندوب جديد يطلب الربط. افتح إدارة المندوبين للموافقة','info');
       }
     }else if(!session)throw Error('انتهت مهلة الطلب؛ أعد المحاولة من هاتف المندوب');
     if(msg.kind==='confirm'){
       if(session.status!=='approved')throw Error('الربط لم يُوافق عليه بعد');
       const ack=await P.open(session.key,msg.requestId,msg.encrypted);
       if(ack.kind!=='confirm'||ack.requestId!==msg.requestId||ack.agentId!==session.agentId||ack.deviceId!==msg.deviceId)throw Error('تأكيد الربط غير مطابق');
       this.pairingRequests.delete(msg.requestId);this.paintPairingRequests();
       answer={pairingProtocol:P.VERSION,kind:'done',requestId:msg.requestId};
       UI.toast('✅ ارتبط جهاز المندوب الجديد بنجاح','success');
     }else if(msg.kind==='hello'||msg.kind==='poll'){
       answer={pairingProtocol:P.VERSION,kind:session.status==='approved'?'approved':'pending',requestId:msg.requestId,companyId:this.data().companyId,companyName:State.settings.companyName||'المركز الرئيسي',managerPublic:session.managerPublic};
       if(session.status==='approved')answer.encrypted=session.encrypted;
     }else throw Error('نوع طلب غير مدعوم');
   }catch(e){answer={pairingProtocol:P.VERSION,kind:'error',message:String(e.message||e).slice(0,170)};}
   finally{window.AndroidLocalSync?.reply(String(requestId),JSON.stringify(answer));}
 };
 f.approvePairing=async function(id){
   if(this.pairingBusy||this.lanBusy||this.busy)return UI.toast('المزامنة أو حفظ البيانات قيد العمل؛ أعد الموافقة بعد اكتمالها','warn');
   const session=this.pairingRequests.get(id),agentId=document.getElementById('pairAgent_'+id)?.value;
   const cfg=this.data(),a=cfg.agents.find(x=>x.id===agentId&&!x.archived&&!x.disabled);
   if(!session||!a)return UI.toast('اختر مندوباً مسجلاً أولاً','warn');
   if(Date.now()-session.createdAt>lifetime)return UI.toast('انتهت صلاحية الطلب، أعد الربط من جهاز المندوب','warn');
   if(session.status!=='pending')return;
   this.pairingBusy=true;
   const prev={key:a.key,device:a.pairedDeviceId,pairedAt:a.pairedAt,signer:cfg.enrollmentSigner};
   try{
     // Only one authorized device per agent. Re-enrollment invalidates the old LAN key.
     const secret=new Uint8Array(32);crypto.getRandomValues(secret);
     a.key=FieldProtocol.b64u(secret);
     a.pairedDeviceId=session.deviceId;
     a.pairedAt=new Date().toISOString();
     if(!cfg.enrollmentSigner)cfg.enrollmentSigner=await P.createSigner();
     const expires=new Date();expires.setFullYear(expires.getFullYear()+1);
     const license={role:'field-lan',companyId:cfg.companyId,agentId:a.id,deviceId:session.deviceId,issuedAt:new Date().toISOString(),expiresAt:expires.toISOString(),nonce:FieldProtocol.uuid()};
     const grant=await P.issueGrant(cfg.enrollmentSigner,license);
     const payload={kind:'enrollment',requestId:id,deviceId:session.deviceId,catalog:this.catalog(a),grant,authorityKey:cfg.enrollmentSigner.publicKey};
     const encrypted=await P.seal(session.key,id,payload);
     await StorageEngine.saveState();
     session.encrypted=encrypted;session.agentId=a.id;session.status='approved';
     this.paintPairingRequests();UI.toast('تمت الموافقة. سيصل التفعيل إلى المندوب تلقائياً','success');
   }catch(e){a.key=prev.key;a.pairedDeviceId=prev.device;a.pairedAt=prev.pairedAt;cfg.enrollmentSigner=prev.signer;UI.toast('تعذّر تفعيل الجهاز: '+e.message,'error');}
   finally{this.pairingBusy=false;}
 };
})();
