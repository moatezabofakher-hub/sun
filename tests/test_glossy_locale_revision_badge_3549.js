'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const manager=read('app/src/main/assets/www/static/manager-notifications.js');
const main=read('app/src/main/assets/www/index.html');
const agent=read('field_agent/src/main/assets/www/index.html');
const mainCss=read('app/src/main/assets/www/static/glossy-ui-3549.css');
const agentCss=read('field_agent/src/main/assets/www/static/glossy-ui-3549.css');
for(const moduleName of ['app','field_agent']){
 const prefix=moduleName+'/src/main/';
 assert(read(prefix+'AndroidManifest.xml').includes('android:label="@string/app_name"'),'system locale controls Android label');
 assert(read(prefix+'res/values/strings.xml').includes('Tiqany Acc'));
 assert(read(prefix+'res/values-ar/strings.xml').includes('المحاسب التقني'));
}
assert(read('app/src/main/java/com/sunshine/accounting/MainActivity.java').includes('.setSmallIcon(R.drawable.ic_stat_tiqany)'));
assert(read('app/src/main/java/com/sunshine/accounting/MainActivity.java').includes('.setLargeIcon('));
assert(main.includes('data-dialog-type\',\'unsaved\''));
assert(main.includes('ta-decision-title')&&mainCss.includes('.ta-decision-icon'));
assert(mainCss.includes('nav.ta-bottom-nav .nav-btn > i {width:31px;height:31px'));
assert(agentCss.includes('.bottom button span{display:grid;place-items:center;width:31px;height:31px'));
assert(main.includes('static/glossy-ui-3549.css')&&agent.includes('static/glossy-ui-3549.css'));
assert(main.includes('id="headerNotificationsCount" class="ta-alert-count" role="status" aria-live="polite"'));
(async()=>{
 let saves=0,shown=[];
 const badge={hidden:true,textContent:'',setAttribute(){}},btn={setAttribute(k,v){this[k]=v;}};
 const State={fieldSync:{agents:[{id:'a',name:'مندوب أحمد'}],imported:[],operationHistory:[],revisionAudit:[]},alertCenter:{entries:[],seenImportIds:[],stockLevels:{}},warehouses:[],items:[],invoices:[],vouchers:[],accounts:[],expenses:[]};
 const ctx={State,console,window:{AndroidAlerts:{show:(...a)=>shown.push(a)}},
  AppEscape:{text:x=>String(x)},StorageEngine:{saveState:async()=>{saves++;}},
  document:{getElementById:(id)=>id==='headerNotificationsCount'?badge:id==='headerNotificationsBtn'?btn:null},
  AppNav:{current:()=>({screen:'dashboard'}),navigate:()=>{}},UI:{setHeader:()=>{},toast:()=>{},openModal:()=>{}}};
 vm.runInNewContext(manager+'\nglobalThis.N=ManagerNotifications;',ctx);
 const N=ctx.N;
 State.fieldSync.revisionAudit=[{id:'rev-1',previousDocument:{id:'field-sale-1',type:'sale',netTotal:100,paidAmount:100,currency:'USD',paymentMethod:'cash',accountId:'cust1',date:'2026-11-13',rows:[],note:''}}];
 State.fieldSync.operationHistory=[{id:'rev-1',kind:'document_edit',agentId:'a',targetOperationId:'sale-1',originalKind:'sale',revision:1,date:'2026-11-13',replacement:{kind:'sale',localNumber:'F-1',netTotal:100,paidAmount:0,currency:'USD',accountId:'cust1',date:'2026-11-13',rows:[],note:''}}];
 State.fieldSync.imported=[{id:'rev-1',kind:'document_edit',agentId:'a',receivedAt:'2026-11-13T12:00:00Z'}];
 await ctx.StorageEngine.saveState();
 const entry=State.alertCenter.entries[0];
 assert.equal(N.unread(),1);assert.equal(badge.hidden,false);assert.equal(badge.textContent,'1');
 assert(entry.detail.includes('تم تغيير المبلغ المسدد من 100 USD إلى 0 USD'));
 assert(entry.detail.includes('تم تحويل الدفع في الفاتورة من نقدي إلى آجل'));
 assert.equal(shown.length,1);assert(shown[0][2].includes('نقدي إلى آجل'));
 await N.readAll();assert.equal(N.unread(),0);assert.equal(badge.hidden,true);
 // An amount-only change in a receipt must be precise about both amounts.
 State.fieldSync.revisionAudit.push({id:'rev-2',previousDocument:{type:'receipt',accountAmount:30,currency:'SYP',accountId:'cust1',date:'2026-11-13'}});
 State.fieldSync.operationHistory.push({id:'rev-2',kind:'document_edit',agentId:'a',targetOperationId:'voucher-2',originalKind:'receipt',revision:1,date:'2026-11-13',replacement:{kind:'receipt',amount:25,currency:'SYP',accountId:'cust1',date:'2026-11-13'}});
 State.fieldSync.imported.push({id:'rev-2',kind:'document_edit',agentId:'a',receivedAt:'2026-11-13T12:10:00Z'});
 await ctx.StorageEngine.saveState();
 assert.equal(N.unread(),1);assert.equal(badge.textContent,'1');
 assert(State.alertCenter.entries[0].detail.includes('تم تغيير مبلغ السند من 30 SYP إلى 25 SYP'));
 assert.equal(shown.length,2);
 console.log('PASS 3.5.49 localizations, Android branded notification icon, 3D UI, granular edit messages, persistent unread badge');
})();
