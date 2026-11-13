'use strict';
// Automatic LAN loop and manager boot: simulated timer and local-network bridge.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = 'field_agent/src/main/assets/www/static/';
const nativeCalls = [];
let hidden=false, clock=0, scheduled=[], nextId=0;
const handlers={};
const doc={
 get hidden(){return hidden;},
 addEventListener:(name,callback)=>{handlers[name]=callback;},
 getElementById:()=>null,
 querySelectorAll:()=>[]
};
const timeout=(fn,delay)=>{const id=++nextId;scheduled.push({id,fn,at:clock+delay});return id;};
const cancel=id=>{scheduled=scheduled.filter(x=>x.id!==id);};
const tick=async(ms)=>{
 const target=clock+ms;
 let count=0;
 while(true){
  scheduled.sort((a,b)=>a.at-b.at);
  const job=scheduled[0];if(!job||job.at>target)break;
  assert(++count<100,'possible runaway timer');
  scheduled.shift();clock=job.at;
  await job.fn();await Promise.resolve();
 }
 clock=target;
};
const scope={crypto:crypto.webcrypto,FieldProtocol:require('../app/src/main/assets/www/static/field-protocol.js'),
 FieldLanCrypto:require('../app/src/main/assets/www/static/field-lan-crypto.js'),document:doc,
 window:{AndroidLocalSync:{send:()=>{nativeCalls.push('send');}}},
 setTimeout:timeout,clearTimeout:cancel,console,TextEncoder,TextDecoder,atob,btoa};
vm.createContext(scope);
for(const f of ['agent.js','agent-auto-sync.js'])vm.runInContext(fs.readFileSync(root+f,'utf8'),scope);
vm.runInContext('globalThis.agentTest=Agent',scope);
const a=scope.agentTest;
a.state={companyId:'company_example1234',key:'key',agentId:'agent_test',ops:[],knownIds:[]};
a.active=async()=>true;
let tries=0;
a.syncOneTap=async function(opts){assert.equal(opts.quiet,true);tries++;this.lanSyncBusy=true;
 this.lanSyncBusy=false;this.finishAutoSync(tries<3?false:true);};
(async()=>{
 a.startAutoSync();await tick(0);assert.equal(tries,1,'first automatic attempt starts without any user press');
 assert.equal(a.autoSyncState,'offline');
 await tick(19999);assert.equal(tries,1);
 await tick(1);assert.equal(tries,2,'automatic retry after main disappears');
 await tick(20000);assert.equal(tries,3);assert.equal(a.autoSyncState,'connected');
 await tick(11999);assert.equal(tries,3);
 await tick(1);assert.equal(tries,4,'periodic pull continues while connected');
 a.busy=true;await tick(12000);assert.equal(tries,4,'never sends while a local invoice is being saved');
 a.busy=false;await tick(1250);assert.equal(tries,5,'resumes after local save');
 hidden=true;await tick(12000);assert.equal(tries,5,'not actively syncing after app is backgrounded');
 hidden=false;handlers.visibilitychange();await tick(0);assert.equal(tries,6,'sync restarts on foreground resume');
 const mainSrc=fs.readFileSync('app/src/main/assets/www/static/field-main.js','utf8');
 let saves=0,registered=0,restarts=0;
 const managerScope={FieldProtocol:{uuid:()=> 'abcdefghijklmno'},State:{fieldSync:{companyId:'',agents:[],events:[],imported:[]}},
 StorageEngine:{db:true,saveState:async()=>saves++},window:{AndroidLocalSync:{startReceiver:()=>{registered++;return 'starting';},restartReceiver:()=>{restarts++;return 'starting';}}},
 document:{hidden:false,getElementById:()=>null,addEventListener:()=>{}},
 setInterval:()=>1,clearTimeout:cancel,setTimeout:timeout,console};
 vm.createContext(managerScope);vm.runInContext(mainSrc+'\nglobalThis.mainTest=FieldSync;',managerScope);
 const m=managerScope.mainTest;
 await m.bootAutoReceiver();
 assert.equal(saves,1,'persist initial company identity before announcing the receiver');
 assert.equal(registered,1,'manager opens receiver on app startup without opening modal');
 await m.bootAutoReceiver();assert.equal(registered,1,'boot is idempotent');
 m.onLanStatus('ready');assert.equal(m.lanListening,true);
 m.onLanStatus('network-changed');await tick(1800);assert.equal(restarts,1,'reannounces after Wi-Fi reconnect');
 assert.equal(m.lanListening,false,'state switches until Android reports ready');
 assert(fs.readFileSync('app/src/main/assets/www/index.html','utf8').includes('await FieldSync.bootAutoReceiver()'));
 console.log('PASS automatic start, offline retry, periodic updates, no concurrent writes, foreground resume, manager boot and network reconnect.');
})().catch(err=>{console.error(err);process.exitCode=1;});
