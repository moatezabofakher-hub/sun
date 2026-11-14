'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../field_agent/src/main/assets/www/static/tiqany-cloud-agent.js'),'utf8');
(async()=>{
 const calls=[];
 const context={URL,AbortController,setTimeout:(f)=>{queueMicrotask(f);return 1;},clearTimeout:()=>{},
  Agent:{state:{companyId:'company_0123456789abcdef',agentId:'agent_0123456789abcdef',cloud:{enabled:true,url:'https://relay.example.test',token:'a'.repeat(43)}}},
  fetch:async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>url.endsWith('/agent/send')?{requestId:'f'.repeat(32)}:{ready:true,raw:'{"encrypted":"yes"}'}}}};
 context.window=context;
 vm.runInNewContext(source,context);
 assert.equal(context.TiqanyCloudAgent.ready(),true);
 const reply=await context.TiqanyCloudAgent.send('{"encrypted":"request"}');
 assert.equal(reply,'{"encrypted":"yes"}');
 assert.equal(calls.length,2);
 assert.equal(calls[0].opts.headers.Authorization,'Bearer '+'a'.repeat(43));
 assert.ok(calls[0].url.startsWith('https://'));
 context.Agent.state.cloud.url='http://unsafe.local';
 assert.equal(context.TiqanyCloudAgent.ready(),false);
 await assert.rejects(context.TiqanyCloudAgent.send('{}'));
 console.log('PASS: cloud agent securely sends encrypted frame and waits for manager ACK, HTTP disabled');
})().catch(e=>{console.error(e);process.exitCode=1;});
