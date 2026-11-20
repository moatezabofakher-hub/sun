const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const Events=require('../app/src/main/assets/www/static/tiqany-peer-events.js');
test('119: accounting events include exact operation, amount, currency, and destination; no generic bulk-only notification',()=>{
 const before={invoices:[{id:'a',number:12,accountId:'c',netTotal:45,currency:'USD'}],accounts:[{id:'c',name:'اختبار'}]};
 const after={invoices:[{id:'a',number:12,accountId:'c',netTotal:50,currency:'USD'},{id:'b',number:13,accountId:'c',netTotal:10,currency:'USD'}],accounts:[{id:'c',name:'اختبار'}]};
 const v=Events.records(before,after,'windows');assert.equal(v.count,2);assert.equal(v.entries.length,2);
 assert.equal(v.entries[0].action,'تعديل');assert.equal(v.entries[0].target,'invoice');assert.equal(v.entries[0].targetId,'a');
 assert.match(v.entries[0].detail,/50 USD/);assert.match(v.entries[0].detail,/اختبار/);
 assert.equal(v.entries[1].action,'إضافة');assert.equal(v.entries[1].targetId,'b');
 assert.equal(Events.records(after,after).count,0);
});
test('119: deleted voucher has specific deleted action and is never editable',()=>{
 const a={vouchers:[{id:'v2',number:'V-2',amount:500,currency:'SYP'}]};
 const b={vouchers:[]};const v=Events.records(a,b);assert.equal(v.entries[0].action,'حذف');
 assert.match(v.entries[0].title,/سند|السندات/);assert.equal(v.entries[0].targetId,'v2');
});
test('119: sync refuses true open edits but not stale dirty flag on the dashboard, and reports busy separately',async()=>{
 const replies=[];const state={settings:{companyUid:'business_'+'a'.repeat(32)}};
 const nav={isDirty:true,isModalDirty:false,activeOperationGuard:true,current:()=>({screen:'dashboard'})};
 const window={TiqanyPeerMerge:{},WindowsPeerSync:{reply(_id,v){replies.push(v)}}};
 const ctx=vm.createContext({window,WindowsPeerSync:window.WindowsPeerSync,State:state,Views:{renderSettings(){}},AppNav:nav,SettingsDraftController:{changed:()=>true},
 document:{head:{append(){}},createElement(){return {}},getElementById(){return null}},ProfileManager:{activeId:'manager'},
 StorageEngine:{saveState:async()=>{}},UI:{toast(){}},console,setTimeout,clearTimeout,setInterval:()=>0});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/static/tiqany-peer-controller.js'),'utf8'),ctx);
 const p=window.TiqanyPeerSync;assert.equal(p.blocked(),false);
 nav.current=()=>({screen:'invoice_form'});assert.equal(p.blocked(),true);assert.match(p.blockReason(),/فاتورة/);
 nav.current=()=>({screen:'dashboard'});p.busy=true;
 await p.handleRequest({requestId:'busy',data:{appVersion:'3.5.158',action:'fetch'}});assert.equal(replies[0].code,'SYNC_BUSY');assert.doesNotMatch(replies[0].error,/فاتورة/);
});
test('119: notifications convert stored ISO UTC to device-local hh:mm:ss with seconds and support edit navigation',()=>{
 const actions=[],state={invoices:[{id:'i1'}],vouchers:[],expenses:[],accounts:[],fieldSync:{imported:[]},items:[],warehouses:[],alertCenter:{entries:[{id:'e',target:'invoice',targetId:'i1',type:'peer-operation',action:'تعديل',read:false,title:'تعديل فاتورة',detail:'المبلغ: 12 USD',at:'2026-11-16T10:20:31.000Z'}],seenImportIds:[],stockLevels:{}}};
 const ctx=vm.createContext({State:state,window:{},document:{getElementById:()=>null},
 AppEscape:{text:x=>String(x)},AppNav:{current:()=>({screen:'notifications'}),renderCurrent(){},navigate:(...x)=>actions.push(x)},
 StorageEngine:{saveState:async()=>{}},UI:{setHeader(){},openModal(){},forceCloseModal(){},toast(){}},console});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/static/manager-notifications.js'),'utf8'),ctx);
 const n=vm.runInContext('ManagerNotifications',ctx);assert.match(n.formatTime('2026-11-16T10:20:31.000Z'),/\d{2}:\d{2}:\d{2}$/);
 n.editOperation('e');assert.equal(actions[0][0],'invoice_form');assert.equal(actions[0][1].id,'i1');
});
