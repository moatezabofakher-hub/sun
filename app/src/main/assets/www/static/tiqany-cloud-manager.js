/* Optional HTTPS relay, V1. Manager remains the only bookkeeper.
 * Packet content is AES-GCM from FieldLanCrypto and is never decoded by relay.
 * Manager and agent use different credentials. Never use HTTP with customer data. */
(function(root){'use strict';
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const secret=()=>{let b=new Uint8Array(32);crypto.getRandomValues(b);return FieldProtocol.b64u(b);};
 const validUrl=u=>{try{const x=new URL(String(u||''));return x.protocol==='https:'&&!x.username&&!x.password&&!x.search&&!x.hash&&x.pathname.replace(/\/+/g,'/')==='/'&&x.origin.length<240;}catch(_){return false;}};
 const deviceId=()=>{let d=localStorage.getItem('ta_cloud_main_device');if(!d||!/^[a-f0-9]{32}$/.test(d)){d=FieldProtocol.uuid();localStorage.setItem('ta_cloud_main_device',d);}return d;};
 const api={busy:false, timer:null, inFlight:false, status:'المزامنة السحابية غير مفعلة',
  cfg(){return FieldSync.data().cloud||{};},
  async call(method,route,payload,token){
    const cfg=this.cfg();if(!validUrl(cfg.url))throw Error('اختر رابط خادم HTTPS صالحاً');
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);
    try{const r=await fetch(cfg.url.replace(/\/$/,'')+route,{method,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:payload?JSON.stringify(payload):undefined,cache:'no-store',signal:abort.signal});
      const data=await r.json();if(!r.ok)throw Error(data.error||'تعذر الاتصال بالخادم: '+r.status);return data;}
    finally{clearTimeout(timer);}
  },
  async enable(){
    const url=String(document.getElementById('taCloudUrl')?.value||'').trim().replace(/\/$/,'');
    if(!validUrl(url))return UI.toast('لا بد من رابط HTTPS مع شهادة موثوقة','warn');
    const cfg=FieldSync.data();const old=cfg.cloud||{};
    cfg.cloud={...old,url,enabled:true,managerToken:old.managerToken||secret()};
    try{await StorageEngine.saveState();await this.register();this.status='✅ تم توصيل الخادم السحابي';this.start();UI.toast('تم إعداد الاتصال السحابي المشفر','success');}
    catch(e){this.status='فشل الاتصال السحابي: '+e.message;UI.toast(this.status,'warn');}
    this.paint();
  },
  async disable(){FieldSync.data().cloud={...this.cfg(),enabled:false};await StorageEngine.saveState();this.status='المزامنة السحابية معطّلة؛ المزامنة المحلية مستمرة';this.paint();},
  async register(){
    const c=FieldSync.data(),cfg=this.cfg();if(!cfg.enabled)return;
    await this.call('POST','/v1/register',{companyId:c.companyId,deviceId:deviceId()},cfg.managerToken);
    let changed=false;
    const agents=c.agents;
    for(const a of agents)if(!a.cloudToken){a.cloudToken=secret();changed=true;}
    if(changed)await StorageEngine.saveState();
    await this.call('POST','/v1/manager/agents',{companyId:c.companyId,deviceId:deviceId(),agents:agents.map(a=>({id:a.id,token:a.cloudToken,disabled:!!a.disabled||!!a.archived}))},cfg.managerToken);
  },
  async poll(){
    const cfg=this.cfg();if(this.inFlight||!cfg.enabled||document.hidden)return;
    if(FieldSync.lanBusy||FieldSync.pairingBusy||FieldSync.busy)return;
    this.inFlight=true;
    try{
      if(!this.lastRegistered || Date.now()-this.lastRegistered>60000){await this.register();this.lastRegistered=Date.now();}
      const c=FieldSync.data();const r=await this.call('POST','/v1/manager/pull',{companyId:c.companyId,deviceId:deviceId(),limit:3},cfg.managerToken);
      for(const msg of r.messages||[]){if(FieldSync.busy||FieldSync.lanBusy)break;
        await FieldSync.receiveLanPacket('cloud:'+msg.requestId,msg.raw);}
      this.status='✅ الخادم السحابي متصل'+(r.messages?.length?' — تمت معالجة الطلبات':'');
    }catch(e){this.status='السحابة: '+e.message;this.lastRegistered=0;}
    finally{this.inFlight=false;this.paint();}
  },
  async reply(requestId,data){
    const c=FieldSync.data(),cfg=this.cfg();
    try{await this.call('POST','/v1/manager/reply',{companyId:c.companyId,deviceId:deviceId(),requestId,raw:data},cfg.managerToken);}
    catch(e){this.status='لم يصل تأكيد ترحيل العملية إلى السحابة: '+e.message;this.paint();}
  },
  catalog(agent){const cfg=this.cfg();return cfg.enabled && agent.cloudToken && validUrl(cfg.url)?{url:cfg.url,token:agent.cloudToken,enabled:true}:null;},
  paint(){const el=document.getElementById('taCloudStatus');if(el)el.textContent=this.status;},
  controls(){const cfg=this.cfg();return '<div class="rounded-xl border p-3 space-y-2 bg-sky-50" dir="rtl"><b>☁️ مزامنة سحابية مشفّرة (اختيارية)</b><p class="text-xs">تتطلب خادماً خاصاً بعنوان HTTPS. لا تُرسل البيانات المالية قبل تفعيل الخادم. يجب أن يكون هناك تطبيق رئيسي واحد مسؤول عن ترحيل عمليات المندوبين.</p><input id="taCloudUrl" class="w-full border rounded-lg p-2 text-sm" type="url" placeholder="https://relay.example.com" value="'+FieldSync.escape(cfg.url||'')+'"/><div id="taCloudStatus" class="text-xs">'+FieldSync.escape(this.status)+'</div><button type="button" onclick="TiqanyCloudManager.enable()" class="ta-primary-3d w-full rounded-xl p-2">تفعيل / اختبار الربط السحابي</button><button type="button" onclick="TiqanyCloudManager.disable()" class="bg-slate-200 w-full rounded-xl p-2">إيقاف المزامنة السحابية</button></div>';},
  start(){if(this.timer)return;this.timer=setInterval(()=>this.poll(),5000);this.poll();}
 };
 root.TiqanyCloudManager=api;
 const install=()=>{
  if(typeof FieldSync==='undefined'||FieldSync.__cloudWrapped)return;
  const open=FieldSync.open.bind(FieldSync);
  FieldSync.open=function(...args){const r=open(...args);const el=document.querySelector('[data-lan-manager]');if(el&&!document.getElementById('taCloudUrl'))el.insertAdjacentHTML('afterend',api.controls());return r;};
  const catalog=FieldSync.catalog.bind(FieldSync);
  FieldSync.catalog=function(agent,...args){const result=catalog(agent,...args);result.cloud=api.catalog(agent);return result;};
  const boot=FieldSync.bootAutoReceiver.bind(FieldSync);
  FieldSync.bootAutoReceiver=async function(...args){const v=await boot(...args);api.start();return v;};
  const add=FieldSync.addAgent.bind(FieldSync);
  FieldSync.addAgent=async function(...args){const r=await add(...args);api.lastRegistered=0;if(api.cfg().enabled)api.register().catch(e=>{api.status='تعذر تحديث المندوبين في السحابة: '+e.message;});return r;};
  FieldSync.__cloudWrapped=true;
  api.start();
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})(window);
