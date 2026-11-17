/* 3.5.107 — visual DD/MM/YYYY, ISO values are kept for saving/filtering/sync. */
(function(root){'use strict';
// A timestamp with an explicit UTC/offset is an instant; show it using the
// current DEVICE timezone. Business date-only and datetime-local fields stay local.
const absolute=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
const pad=n=>String(n).padStart(2,'0');
function visible(raw){
 const source=String(raw||'');
 let text=source;
 if(absolute.test(source)){
   const d=new Date(source);
   if(Number.isFinite(d.getTime()))
     text=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
 }
 const m=text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}))?/);
 if(!m)return source;
 return m[3]+'/'+m[2]+'/'+m[1]+(m[4]?' '+m[4]:'');
}
function isoDate(text){const m=String(text||'').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)return null;const yyyy=Number(m[3]),month=Number(m[2]),day=Number(m[1]);const d=new Date(Date.UTC(yyyy,month-1,day));return d.getUTCFullYear()===yyyy&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?m[3]+'-'+m[2]+'-'+m[1]:null;}
function decorate(input){if(!input||input.dataset.taDateDecorated==='1'||input.classList.contains('ta-ux-invoice-picker-native')||input.type!=='date'&&input.type!=='datetime-local'||input.closest('.ta-date-native-wrapper'))return;
  const wrap=document.createElement('span');wrap.className='ta-date-native-wrapper';const display=document.createElement('span');display.className='ta-date-readable';display.setAttribute('aria-hidden','true');
  input.parentNode.insertBefore(wrap,input);wrap.append(input,display);input.dataset.taDateDecorated='1';
  const update=()=>{display.textContent=visible(input.value)||'DD/MM/YYYY';};input.addEventListener('input',update);input.addEventListener('change',update);update();
}
let scheduled=false;function scan(){scheduled=false;document.querySelectorAll('input[type="date"],input[type="datetime-local"]').forEach(decorate);const footer=document.querySelector('.ta-pos-fixed-footer');if(footer&&root.ResizeObserver&&!footer.dataset.taMeasured){footer.dataset.taMeasured='1';const obs=new ResizeObserver(()=>document.documentElement.style.setProperty('--ta-pos-footer-height',Math.ceil(footer.getBoundingClientRect().height)+'px'));obs.observe(footer);}}
function queue(){if(scheduled)return;scheduled=true;Promise.resolve().then(scan);}
root.TiqanyDateView={visible,isoDate,scan};
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{scan();new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});});else{scan();new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});}}
})(typeof window!=='undefined'?window:globalThis);
