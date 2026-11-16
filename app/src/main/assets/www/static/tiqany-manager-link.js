/* Local QR pairing: uses existing ECDH, user-approved 6-digit code and encrypted provisioning. */
(function(root){'use strict';
const API={
  open(){
    if(typeof FieldSync==='undefined')return;
    const activeProfile = typeof ProfileManager !== 'undefined' ? ProfileManager.activeId : null;
    // Backwards compatible: absent setting means protection OFF.
    if(State.settings?.appProtection?.protectDeviceAddition === true){
      const protection = typeof ProtectionController !== 'undefined' ? ProtectionController : null;
      if(!protection?.requestPin){UI.toast('تعذر بدء التحقق الأمني','error');return;}
      if(!State.settings.appProtection.pinHash || !State.settings.appProtection.pinSalt){
        protection.promptPinSetup?.('حماية إضافة الأجهزة');return;
      }
      protection.requestPin('تحقق بالبصمة أو كلمة سر المدير لعرض باركود إضافة موظف البيع',()=>{
        if(typeof ProfileManager !== 'undefined' && ProfileManager.activeId !== activeProfile){
          UI.toast('تغيّرت الشركة، أعد التحقق','warn');return;
        }
        if(State.settings?.appProtection?.protectDeviceAddition !== true)return;
        return this.openAuthorized();
      });
      return;
    }
    return this.openAuthorized();
  },
  async openAuthorized(){
    if(typeof FieldSync==='undefined')return;
    FieldSync.startLanReceiver(true);
    let info={};
    for(let i=0;i<8;i++){
      try{info=JSON.parse(root.AndroidLocalSync?.receiverEndpoint?.()||'{}');}catch(_){info={};}
      if(info.port && Array.isArray(info.ips) && info.ips.length)break;
      await new Promise(ok=>setTimeout(ok,250));
    }
    if(!info.port||!info.ips?.length){UI.toast('لم يبدأ استقبال Wi-Fi أو لم يُكتشف عنوان الشبكة؛ افتح الاستقبال وجرب مجدداً','warn');return;}
    const company=FieldSync.data()?.companyId||'';
    if(company!==info.companyId){UI.toast('هوية الشركة غير متطابقة مع الاستقبال','error');return;}
    const option=info.ips.map(ip=>'<option value="'+FieldSync.escape(ip)+'">'+FieldSync.escape(ip)+'</option>').join('');
    UI.openModal('<div dir="rtl" class="p-4 space-y-3 text-right"><h3 class="font-black">▦ ربط موظف بيع برمز QR محلي</h3><p class="text-xs">افتح تطبيق موظف البيع واختر «مسح رمز QR». يجب أن يتصل الجهازان بالشبكة نفسها. قارن رمز الأمان ثم وافق من إدارة موظفي البيع.</p><select class="w-full border rounded-xl p-2" id="taQrIp" onchange="TiqanyManagerLink.refresh()">'+option+'</select><div id="taQrCode" style="margin:auto;max-width:280px;background:#fff;padding:12px;border-radius:16px"></div><p id="taQrAddress" class="text-xs text-center" dir="ltr"></p><button onclick="FieldSync.open()" class="ta-primary-3d w-full p-3 rounded-xl">العودة إلى إدارة موظفي البيع</button></div>');
    this.port=info.port;this.company=company;this.refresh();
  },
  refresh(){
    const ip=document.getElementById('taQrIp')?.value;
    if(!ip||!this.port)return;
    const url='tiqany-pair://local?v=1&company='+encodeURIComponent(this.company)+'&host='+encodeURIComponent(ip)+'&port='+this.port;
    const qr=document.getElementById('taQrCode');if(qr)qr.innerHTML=root.TiqanyQr.svg(url);
    const label=document.getElementById('taQrAddress');if(label)label.textContent=ip+':'+this.port;
  }
};
root.TiqanyManagerLink=API;
const install=()=>{
 if(typeof FieldSync==='undefined'||FieldSync.__qrWrapped)return;
 const old=FieldSync.open.bind(FieldSync);
 FieldSync.open=function(...args){const out=old(...args);
  const el=document.querySelector('[data-lan-manager]');
  if(el&&!document.getElementById('taQrOpen'))el.insertAdjacentHTML('beforeend','<button id="taQrOpen" class="ta-primary-3d w-full p-3 rounded-xl font-bold mt-2" onclick="TiqanyManagerLink.open()">▦ ربط موظف بيع عبر رمز QR</button>');
  return out;};FieldSync.__qrWrapped=true;
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})(window);
