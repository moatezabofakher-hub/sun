'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('employee receives exact settings, rights and item changes on committed sync',async()=>{
 const posted=[];
 const A={state:{companyId:'co',permissions:{editPrices:true},items:[{id:'x',name:'سكر',units:[{name:'كغ',salePrice:4}]}],currencyExchangeRatesSyp:{USD:{buy:15,sell:16}}},
   show:async()=>{},save:async()=>{},toast(){},onLocalSyncResult:async function(s){Object.assign(this.state,s);this.lanSyncMessage='✅ تمت المزامنة';}};
 const win={AndroidManagerNotifications:{postUpdates:x=>posted.push(...JSON.parse(x))}};
 vm.runInNewContext(fs.readFileSync('field_agent/src/main/assets/www/static/agent-manager-notifications-35107.js','utf8'),{Agent:A,window:win,document:{addEventListener(){},getElementById(){return null;}}});
 const update={permissions:{editPrices:false,stock:true},items:[{id:'x',name:'سكر',units:[{name:'كغ',salePrice:7}]}],currencyExchangeRatesSyp:{USD:{buy:18,sell:16}}};
 await A.onLocalSyncResult(update);
 const details=posted.map(x=>x.detail).join('\n');
 for(const re of [/تعديل الأسعار ضمن الفاتورة من مسموح إلى غير مسموح/,/مراقبة الجرد من غير مسموح إلى مسموح/,/سعر البيع من 4 إلى 7/,/سعر الشراء من 15 إلى 18/])assert.match(details,re);
 const n=posted.length;await A.onLocalSyncResult(update);assert.equal(posted.length,n);
 await A.onLocalSyncResult({permissions:{editPrices:true,stock:true}});await A.onLocalSyncResult(update);
 assert.equal(posted.filter(x=>x.detail.includes('تعديل الأسعار ضمن الفاتورة من مسموح إلى غير مسموح')).length,2);
 const shelf=A.state.managerNotifications;A.save=async()=>{throw Error('storage')};await A.readAllManagerNotifications();
 assert(shelf.every(x=>!x.read));A.save=async()=>{};await A.readAllManagerNotifications();assert(shelf.every(x=>x.read));
});
