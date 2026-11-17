/* Tiqany Acc 3.5.148
 * Normalize timestamped UTC/offset operation dates to the phone's LOCAL
 * calendar day before report period matching.  A date-only business field
 * (YYYY-MM-DD), or a local timestamp without an offset, MUST remain intact.
 *
 * This is a read-side presentation/filter repair: historical operations,
 * weighted-average FX costs, profit postings and account balances are never
 * mutated or duplicated.
 */
(function(root){
'use strict';
const filter=typeof TimeFilter!=='undefined'?TimeFilter:root.TimeFilter;
if(!filter||typeof filter.matches!=='function'||filter.__localTimestamp148)return;
const originalMatches=filter.matches;
const absolute=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
const pad=n=>String(n).padStart(2,'0');
function normalized(value){
 if(value instanceof Date&&!Number.isNaN(value.getTime()))return filter.localDate(value);
 const valueText=String(value??'').trim();
 if(!absolute.test(valueText))return valueText;
 const instant=new Date(valueText);
 return Number.isFinite(instant.getTime())?filter.localDate(instant):valueText;
}
function localClock(value){
 const source=String(value??'').trim();
 if(!absolute.test(source))return source.slice(0,16).replace('T',' ');
 const instant=new Date(source);
 if(!Number.isFinite(instant.getTime()))return source.slice(0,16).replace('T',' ');
 return instant.getFullYear()+'-'+pad(instant.getMonth()+1)+'-'+pad(instant.getDate())+
    ' '+pad(instant.getHours())+':'+pad(instant.getMinutes());
}
filter.matches=function(value,mode,start='',end=''){
 return originalMatches.call(this,normalized(value),mode,start,end);
};
Object.defineProperty(filter,'__localTimestamp148',{value:true,configurable:false});
root.TiqanyReportDate148=Object.freeze({
 normalized,localClock,calendarDate:normalized
});
})(typeof window==='object'?window:globalThis);
