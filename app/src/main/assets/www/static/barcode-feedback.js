/* Tiqany: beep at a completed barcode read, independently of invoice addition.
   Android native ToneGenerator handles scanner callbacks even when WebAudio requires a gesture.
   Windows/other browsers use a short, original electronic confirmation tone. */
(function(root){
  'use strict';
  let context=null, nextTone=0;
  function unlock(){
    if(root.NativeBarcode && typeof root.NativeBarcode.successBeep==='function')return;
    const AudioCtor=root.AudioContext||root.webkitAudioContext;
    if(!AudioCtor)return;
    try { if(!context)context=new AudioCtor(); if(context.state==='suspended')context.resume().catch(()=>{}); }
    catch(_){context=null;}
  }
  try { document.addEventListener('pointerdown',unlock,{passive:true});document.addEventListener('keydown',unlock,{passive:true}); }catch(_){}
  root.BarcodeFeedback=Object.freeze({
    read(){
      try{
        if(root.NativeBarcode && typeof root.NativeBarcode.successBeep==='function'){
          root.NativeBarcode.successBeep();return true;
        }
        unlock();
        if(!context)return false;
        const t=Math.max(context.currentTime+.005,nextTone);
        // Limit the queue when a batch is received all at once.
        if(t>context.currentTime+0.7)return false;
        nextTone=t+.105;
        const oscillator=context.createOscillator(),gain=context.createGain();
        oscillator.type='sine';oscillator.frequency.setValueAtTime(1047,t);
        gain.gain.setValueAtTime(0,t);
        gain.gain.linearRampToValueAtTime(.18,t+.009);
        gain.gain.exponentialRampToValueAtTime(.001,t+.08);
        oscillator.connect(gain);gain.connect(context.destination);
        oscillator.start(t);oscillator.stop(t+.085);
        return true;
      }catch(_){return false;}
    }
  });
})(window);
