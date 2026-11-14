/* Remote transport for previously enrolled agents. Never changes the ledger directly.
 * Operation IDs are idempotent on manager. Client must get an authenticated ACK.
 * Agent's token is issued by manager in its already encrypted catalog. */
(function(root){'use strict';
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const ready=()=>{let c=Agent.state?.cloud;try{return c?.enabled===true && new URL(c.url).protocol==='https:' && /^[A-Za-z0-9_-]{40,}$/.test(c.token||'');}catch(_){return false;}};
 const cloud={ready,
   async call(method,route,payload){
     const c=Agent.state.cloud,ctrl=new AbortController(),t=setTimeout(()=>ctrl.abort(),18000);
     try{const r=await fetch(c.url.replace(/\/$/,'')+route,{method,headers:{'Content-Type':'application/json','Authorization':'Bearer '+c.token},body:payload?JSON.stringify(payload):undefined,cache:'no-store',signal:ctrl.signal});const x=await r.json();if(!r.ok)throw Error(x.error||'انقطع اتصال السحابة');return x;}
     finally{clearTimeout(t);}
   },
   async send(raw){
     if(!ready())throw Error('المزامنة السحابية غير مفعلة');
     const a=Agent.state;
     const posted=await this.call('POST','/v1/agent/send',{companyId:a.companyId,agentId:a.agentId,raw});
     if(!/^[a-f0-9]{32}$/.test(posted.requestId||''))throw Error('معرّف مزامنة غير صالح');
     // Cloud storage is not an accounting ACK. Only a signed result from manager confirms a sale.
     for(let i=0;i<24;i++){
       await sleep(1700);
       const result=await this.call('POST','/v1/agent/reply',{companyId:a.companyId,agentId:a.agentId,requestId:posted.requestId});
       if(result.ready && typeof result.raw==='string')return result.raw;
     }
     throw Error('خادم المزامنة حفظ الطلب لكن الإدارة لم تؤكده بعد. ستُعاد المحاولة لاحقاً دون حذف العمليات.');
   }
 };
 root.TiqanyCloudAgent=cloud;
})(window);
