/* Stage sales-representative settings until an explicit Save; no duplicate persistence. */
(function(){'use strict';
if(typeof Agent==='undefined')return;
let posTouched=false, printerWidth=null;
const originalRenderSettings=Agent.renderSettings;
const originalRenderPrinter=Agent.renderPrinter;
Agent.stagePosSettings=function(){posTouched=true;};
Agent.stagePrinterWidth=function(value){printerWidth=Number(value)===58?58:80;};
function buttons(area){
 return `<div class="ta-agent-save-cancel" style="display:flex;gap:10px;margin-top:20px;border-top:1px solid #cadbe5;padding-top:16px">
 <button type="button" class="primary" style="flex:1;background:linear-gradient(145deg,#139277,#087262);color:#fff;min-height:46px" onclick="Agent.saveDraftSettings('${area}')">حفظ</button>
 <button type="button" class="secondary" style="flex:1;min-height:46px" onclick="Agent.cancelDraftSettings('${area}')">إلغاء</button></div>`;
}
Agent.renderSettings=function(){
 const html=originalRenderSettings.call(this).replaceAll('onchange="Agent.savePosSettings()"','onchange="Agent.stagePosSettings()"');
 return html.replace('</section>', '</section>') // Keep activation and navigation cards untouched.
  .replace(/(<section class="panel" id="agentPosSettings">[\s\S]*?)(<\/section>)/,
     (match,contents,end)=>contents+buttons('pos')+end);
};
Agent.renderPrinter=function(){
 const html=originalRenderPrinter.call(this).replace('onchange="Agent.updatePrinterWidth(this.value)"','onchange="Agent.stagePrinterWidth(this.value)"');
 return html.replace(/(<div class="panel">[\s\S]*?)(<\/div>)(?=\s*$)/, (all,content,end)=>content+buttons('printer')+end);
};
Agent.saveDraftSettings=async function(area){
 try{
  if(area==='pos'){
   if(posTouched)await this.savePosSettings();
   posTouched=false;
   this.toast('تم اعتماد إعدادات نقطة البيع');
  }else if(area==='printer'){
   if(printerWidth!==null)await this.updatePrinterWidth(printerWidth);
   printerWidth=null;
   this.toast('تم اعتماد إعدادات الطباعة');
  }
 }catch(e){this.toast('تعذر حفظ الإعدادات: '+e.message);}
};
Agent.cancelDraftSettings=async function(area){
 if(area==='pos'){posTouched=false;await this.show('settings');}
 else if(area==='printer'){printerWidth=null;await this.show('printer');}
 this.toast('أُلغيت التغييرات غير المحفوظة');
};
})();
