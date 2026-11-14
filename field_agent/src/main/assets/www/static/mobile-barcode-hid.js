/* Keyboard-wedge barcodes: scoped to the visible invoice/POS or opted-in home screen.
   Only known barcodes with rapid keystroke timing trigger a transaction. */
(function(){
'use strict';
let buffer='',started=0,last=0,editor=null,originalValue='';
const clear=()=>{buffer='';started=0;last=0;editor=null;originalValue='';};
const known=code=>{
  const items=(typeof Agent!=='undefined'&&Agent.state?.items)||((typeof State!=='undefined'&&State.items)||[]);
  return items.some(i=>String(i.barcode||'').trim()===code);
};
function handle(code){
  if(typeof Agent!=='undefined'){
    if(Agent.screen==='home')return Agent.openPosFromBarcode?.(code);
    if(Agent.screen==='invoice')return Agent.addScannedBarcode?.(code);
    return false;
  }
  const route=AppNav.current()?.screen;
  if(route==='pos')return POSController.addBarcode(code);
  if(route==='invoice_form')return InvoiceController.addItemByBarcode(code);
  if(route==='dashboard')return POSController.openFromBarcode(code);
  return false;
}
document.addEventListener('keydown',e=>{
  const route=typeof Agent!=='undefined'?Agent.screen:AppNav.current()?.screen;
  const enabled=typeof Agent!=='undefined'?
    (route==='invoice'||(route==='home'&&Agent.state?.posScanFromHome===true)):
    (route==='invoice_form'||route==='pos'||(route==='dashboard'&&State.settings?.posScanFromHome===true));
  if(!enabled||e.ctrlKey||e.metaKey||e.altKey||e.isComposing){clear();return;}
  const now=performance.now();
  if(e.key==='Enter'||e.key==='Tab'){
    const code=buffer,rapid=code.length>=5&&code.length<=128&&(now-started)/Math.max(1,code.length-1)<=70&&now-last<=300;
    const previousEditor=editor,previousValue=originalValue;clear();
    if(rapid&&known(code)){
      e.preventDefault();e.stopPropagation();
      // Restore any characters injected into a focused search or price editor.
      if(previousEditor?.isConnected && previousEditor.value!==undefined && previousEditor.value!==previousValue){
        previousEditor.value=previousValue;
        previousEditor.dispatchEvent(new Event('input',{bubbles:true}));
      }
      window.BarcodeFeedback?.read(); // HID scan finished, independent of item addition
      handle(code);
    }
    return;
  }
  if(e.key.length!==1||!/[a-z0-9_.-]/i.test(e.key)){clear();return;}
  if(!buffer||now-last>140){clear();started=now;
    const t=e.target;
    if(t?.matches?.('input, textarea')){editor=t;originalValue=t.value;}
  }
  buffer+=e.key;last=now;
  if(buffer.length>128)clear();
},true);
})();
