/* v3.5.130 — Android managers: QR pairing and live mobile/employee/PC badges. */
(function(){
'use strict';
const peer=()=>window.TiqanyManagerPeerClient;
const server=()=>window.TiqanyManagerPeerServer;
let qrTimeout=null;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function getServer(){try{return JSON.parse(window.AndroidManagerPeerServer?.config?.()||'{}')}catch(_){return {}}}
const ui={
  showManagerQr(){
    const p=peer();if(!p)return;
    const show=()=>{
      const box=document.getElementById('ta-manager-source-qr');if(!box)return;
      const config=getServer();
      if(!config.ready||!config.port||!config.ips?.length||!config.key)return UI.toast('انتظر بدء استقبال Wi-Fi، ثم اضغط إظهار رمز الاقتران','warn');
      const data={type:'tiqany-mobile-manager',v:1,host:config.ips[0],port:config.port,key:config.key,serverId:config.serverId};
      if(!window.TiqanyQr?.svg)return UI.toast('مكوّن رمز QR غير متاح','error');
      box.innerHTML='<p class="font-black text-emerald-900 mb-2">امسح هذا الرمز من موبايل المدير الآخر</p>'+
        window.TiqanyQr.svg(JSON.stringify(data))+
        '<p class="text-xs mt-2">الرمز سري. يظهر لمدة 60 ثانية فقط. تتم المزامنة ضمن نفس شبكة Wi-Fi.</p>';
      if(qrTimeout)clearTimeout(qrTimeout);
      qrTimeout=setTimeout(()=>{box.textContent='انتهت مهلة عرض رمز الاقتران';qrTimeout=null},60000);
    };
    if(State.settings?.appProtection?.protectDeviceAddition===true)
      p.authorizePairing('تأكيد عرض رمز ربط جهاز مدير جديد',show);
    else show();
  },
  openFromHeader(){peer()?.openSettingsFromHeader()},
  update(){
    const now=Date.now(),pc=document.getElementById('ta-desktop-phone-connection');
    const staff=document.getElementById('salesStaffCounterButton');
    const mm=document.getElementById('ta-mobile-mobile-connection');
    if(pc)pc.hidden=!pc.classList.contains('ta-link-online');
    const count=(typeof FieldSync!=='undefined'&&FieldSync.connectedCount)?FieldSync.connectedCount():0;
    if(staff){staff.hidden=count<=0;staff.classList.toggle('ta-connected-green',count>0);}
    const liveClient=Number(peer()?.lastSuccessfulAt||0)>0&&now-peer().lastSuccessfulAt<20000;
    const liveServer=Number(server()?.lastPhoneSeenAt||0)>0&&now-server().lastPhoneSeenAt<20000;
    const connected=liveClient||liveServer;
    if(mm){
      mm.hidden=!connected;
      mm.classList.toggle('ta-link-online',connected);
      mm.classList.toggle('ta-link-offline',!connected);
      mm.title=connected?'جهاز مدير آخر متصل':'لا يوجد جهاز مدير آخر متصل';
    }
  },
  extendPanel(){
    const p=peer();if(!p)return;
    const section=document.getElementById('ta-manager-client-settings');
    if(!section||document.getElementById('ta-manager-source-panel'))return;
    section.insertAdjacentHTML('afterbegin',`<div id="ta-manager-source-panel" dir="rtl" class="p-3 border-2 border-sky-300 rounded-xl bg-sky-50 mb-3">
      <h4 class="font-black text-sky-900">مشاركة الشركة من هذا الموبايل</h4>
      <p class="text-xs text-slate-700 my-2">يمكن لموبايل مدير آخر مسح رمز الاتصال. أول نقل مع جهاز غير مرتبط لا يُقبل إلا إذا كانت إحدى النسختين فارغة؛ النسخة الممتلئة هي المصدر.</p>
      <button type="button" class="ta-peer-btn" onclick="TiqanyManagerPeerUI.showManagerQr()"><i class="fas fa-qrcode"></i> إظهار رمز QR للموبايل المدير</button>
      <div id="ta-manager-source-qr" aria-live="polite" class="my-3 text-center text-sm font-bold"></div>
    </div>`);
  }
};
window.TiqanyManagerPeerUI=ui;
const originalRender=()=>{if(!peer()||peer()._managerUIPatched)return;const p=peer();const render=p.renderSettings.bind(p);
  p.renderSettings=function(main){render(main);ui.extendPanel();};
  const connection=p.renderConnection.bind(p);
  p.renderConnection=function(){connection();ui.extendPanel();};
  p._managerUIPatched=true;
};
originalRender();
if(!peer())document.addEventListener('DOMContentLoaded',originalRender);
setInterval(()=>ui.update(),1200);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')ui.update()});
const previousBarcode=window.__nativeBarcodeResult;
window.__nativeBarcodeResult=function(target,code,message){
 if(target==='manager-peer'){
   if(message)return UI.toast(message,'error');
   if(code)peer()?.acceptPairing(String(code));
   return;
 }
 if(typeof previousBarcode==='function')return previousBarcode(target,code,message);
};
})();
