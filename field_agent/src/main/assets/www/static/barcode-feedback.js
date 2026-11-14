/* Distinct on-read barcode feedback: known = one short high beep; unknown = two low warning tones.
   Plays on decode, irrespective of whether invoice rows can be added. */
(function(root){
  'use strict';
  let context=null,nextTone=0;
  function unlock(){
    if(root.NativeBarcode && typeof root.NativeBarcode.successBeep==='function')return;
    const AudioCtor=root.AudioContext||root.webkitAudioContext;
    if(!AudioCtor)return;
    try{if(!context)context=new AudioCtor();if(context.state==='suspended')context.resume().catch(()=>{});}catch(_){context=null;}
  }
  try{document.addEventListener('pointerdown',unlock,{passive:true});document.addEventListener('keydown',unlock,{passive:true});}catch(_){/* no DOM */}
  function isKnown(raw){
    const code=String(raw||'').trim().toLowerCase();if(!code)return false;
    const agent=typeof Agent!=='undefined'?Agent:null;
    const state=typeof State!=='undefined'?State:null;
    const items=(agent?.state?.items)||(state?.items)||[];
    return Array.isArray(items)&&items.some(it=>String(it?.barcode||'').trim().toLowerCase()===code);
  }
  function tone(ctx,freq,t,duration,volume){
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type='sine';osc.frequency.setValueAtTime(freq,t);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(volume,t+.008);
    gain.gain.exponentialRampToValueAtTime(.001,t+duration);
    osc.connect(gain);gain.connect(ctx.destination);
    osc.start(t);osc.stop(t+duration+.006);
  }
  function read(known=true){
    const accepted=known!==false;
    try{
      if(root.NativeBarcode){
        if(!accepted&&typeof root.NativeBarcode.warningBeep==='function'){root.NativeBarcode.warningBeep();return true;}
        if(accepted&&typeof root.NativeBarcode.successBeep==='function'){root.NativeBarcode.successBeep();return true;}
      }
      unlock();if(!context)return false;
      const t=Math.max(context.currentTime+.005,nextTone);
      if(t>context.currentTime+1.25)return false;
      if(accepted){tone(context,1100,t,.085,.17);nextTone=t+.1;}
      else {tone(context,360,t,.12,.24);tone(context,245,t+.165,.19,.24);nextTone=t+.41;}
      return true;
    }catch(_){return false;}
  }
  root.BarcodeFeedback=Object.freeze({read,isKnown,unknown:()=>read(false)});
})(window);
