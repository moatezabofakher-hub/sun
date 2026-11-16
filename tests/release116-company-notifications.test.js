'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const core=require('../app/src/main/assets/www/static/tiqany-peer-merge.js');
const events=require('../app/src/main/assets/www/static/tiqany-peer-events.js');
const UID1='business_'+'1'.repeat(32),UID2='business_'+'2'.repeat(32);
const empty=()=>({categories:[],items:[],accounts:[],invoices:[],vouchers:[],transfers:[],expenses:[],warehouses:[{id:'wh_main'}],fieldAgents:[],fieldImported:[],fieldEvents:[],fieldCashTransfers:[],fieldOperationHistory:[],fieldRevisionAudit:[],fieldCompany:[]});

test('different hidden business identifiers always reject joining two populated companies even with identical visible names',()=>{
 const first={...empty(),invoices:[{id:'a',number:1}]};
 assert.equal(core.emptyLedger(first),false);
 assert.equal(core.companyJoin(UID1,UID2,{empty:core.emptyLedger(first)}).allowed,false);
 assert.match(core.companyJoin(UID1,UID2,{}).reason,/مختلفتين/);
 assert.equal(core.companyJoin(UID1,UID1,{}).allowed,true);
});
test('empty mobile adopts a computer company after explicit first-link confirmation; existing verified migration supported',()=>{
 assert.equal(core.emptyLedger(empty()),true);
 const fresh=core.companyJoin(UID1,UID2,{empty:true});assert.equal(fresh.allowed,true);assert.equal(fresh.adopt,true);
 const legacy=core.companyJoin(UID1,UID2,{existingVerifiedLink:true});assert.equal(legacy.allowed,true);assert.equal(legacy.legacy,true);
 assert.equal(core.companyJoin('not-uuid',UID2,{empty:true}).allowed,false);
 assert.equal(core.companyJoin(UID1,'',{}).allowed,false);
});
test('single incoming document change includes a safe exact in-app deep link, bulk changes do not guess a record',()=>{
 const before=core.snapshot({...empty(),settings:{companyName:'مؤسسة'}});
 const after=JSON.parse(JSON.stringify(before));after.invoices.push({id:'i1',number:1});
 const single=events.summarize(before,after);assert.equal(single.target,'invoice');assert.equal(single.targetId,'i1');
 after.vouchers.push({id:'v1',number:2});assert.equal(events.summarize(before,after).target,null);
});
function noticesHarness(){
 const invoices=[{id:'inv1',number:1}];
 const entries=[{id:'note1',title:'فاتورة',detail:'تم تعديل فاتورة',target:'invoice',targetId:'inv1',type:'agent',action:'تعديل',read:false,at:'2026-11-16'}];
 const state={invoices,vouchers:[],accounts:[],expenses:[],items:[],warehouses:[],fieldSync:{imported:[]},alertCenter:{entries,seenImportIds:[],stockLevels:{}}};
 const actions=[],modals=[],toasts=[];
 const w={AndroidAlerts:{show:(id,title,body)=>actions.push(['notify',{id,title,body}])}};
 const nav={current:()=>({screen:'notifications'}),renderCurrent:()=>actions.push(['render']),navigate:(screen,opts)=>actions.push(['navigate',screen,opts])};
 const ctx=vm.createContext({State:state,window:w,AppEscape:{text:v=>String(v)},AppNav:nav,StorageEngine:{saveState:async()=>actions.push(['persist'])},UI:{openModal:html=>modals.push(html),forceCloseModal:()=>{},toast:(...x)=>toasts.push(x),setHeader:()=>{}},document:{getElementById:()=>null},console});
 const file=path.join(__dirname,'../app/src/main/assets/www/static/manager-notifications.js');vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
 const notifications=vm.runInContext('ManagerNotifications',ctx);
 return {notifications,state,entries,actions,modals,toasts};
}
test('opening Android notification persists read status, removes New badge, and opens the actual invoice',async()=>{
 const h=noticesHarness();await h.notifications.open('note1');
 assert.equal(h.entries[0].read,true);
 assert.equal(h.notifications.unread(),0);
 assert.ok(h.actions.some(x=>x[0]==='persist'));
 assert.ok(h.actions.some(x=>x[0]==='render'));
 assert.ok(h.actions.some(x=>x[0]==='navigate'&&x[1]==='invoice_print'&&x[2].id==='inv1'));
});
test('sync stop notification persists and publishes the root cause to Android notification center once per incident',async()=>{
 const h=noticesHarness();await h.notifications.addSyncNotice('تعذّر الوصول إلى الكمبيوتر: Wi-Fi غير متصل');
 assert.equal(h.notifications.unread(),2);
 assert.match(h.entries[0].detail,/Wi-Fi/);
 assert.ok(h.actions.some(x=>x[0]==='notify'&&x[1].body.includes('Wi-Fi')));
});
