/* New receipt parity, synced branding, reports PDF menu and compact transfer workflow. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const manager=fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const agent=fs.readFileSync('field_agent/src/main/assets/www/static/agent.js','utf8');
const field=fs.readFileSync('app/src/main/assets/www/static/field-main.js','utf8');
const parity=fs.readFileSync('field_agent/src/main/assets/www/static/agent-print-parity.js','utf8');
const fieldPage=fs.readFileSync('field_agent/src/main/assets/www/index.html','utf8');
const java=fs.readFileSync('app/src/main/java/com/sunshine/accounting/MainActivity.java','utf8');
const renderer=fs.readFileSync('app/src/main/java/com/sunshine/accounting/ReportPdfRenderer.java','utf8');
assert.ok(field.includes('companyLogo:')&&field.includes('companyPhone:')&&field.includes('companyAddress:'));
assert.ok(agent.includes('old.companyLogo')&&agent.includes('companyLogo:catalog.companyLogo'));
assert.ok(agent.includes('companyPhone:payload.companyPhone'));
assert.ok(fieldPage.includes('agent-print-parity.js'));
for(const token of ['فاتورة مناقلة جديدة','openWarehouseList()','openTransferForm()','id="warehouseTransferPanel" hidden','id="warehouseCreatePanel" hidden','سجل المناقلات','مناقلة جديدة','لا أسعار أو دفعات']) assert.ok(manager.includes(token),token);
for(const token of ['تقرير الديون','تقرير المواد','حفظ PDF',"confirmHomePrint('${tab}','print')","confirmHomePrint('${tab}','pdf')",'AndroidReports.saveAndShareReport']) assert.ok(manager.includes(token),token);
for(const token of ['ACTION_CREATE_DOCUMENT','SAVE_REPORT_PDF','Intent.ACTION_SEND','application/pdf','ReportPdfRenderer.render','FLAG_GRANT_READ_URI_PERMISSION'])assert.ok(java.includes(token),token);
for(const token of ['StaticLayout','TextDirectionHeuristics.RTL','PdfDocument','startPage()'])assert.ok(renderer.includes(token),token);
const printed=[];
const text=[];
class FakeCanvas {
 constructor(){this.width=0;this.height=0;this.context={
   font:'',textBaseline:'',direction:'',fillStyle:'',strokeStyle:'',lineWidth:1,textAlign:'',
   fillRect(){},fillText(msg){text.push(String(msg));},
   drawImage(){},measureText(msg){return {width:String(msg).length*7};},
   beginPath(){},setLineDash(){},moveTo(){},lineTo(){},stroke(){},
   getImageData:()=>({data:new Uint8ClampedArray(this.width*this.height*4).fill(255)})
  }; }
 getContext(){return this.context;}
}
const invoice={id:'doc001',localNumber:'م-15',kind:'sale',accountId:'a1',currency:'USD',
 date:'2026-11-13T13:29:00',rows:[{itemId:'i1',itemName:'سائل جلي ليمون',unitName:'علبة',qty:3,price:5,total:15}],
 paidAmount:5,netTotal:15,subTotal:15};
const Agent={state:{companyName:'تجربة أولى',companyPhone:'09300001',companyAddress:'العنوان الأول',footerNote:'شكراً',companyLogo:'',printerWidth:58,printFontScale:0.75,
  accounts:[{id:'a1',name:'الزبون'}],ops:[invoice],snapshotIds:[]},
 printOp:async()=>{},toast:()=>{},balanceFor:()=>({available:true,syp:0,usd:10})};
const scope={Agent,document:{fonts:{ready:Promise.resolve()},createElement:()=>new FakeCanvas()},
 window:{AndroidPrinter:{printBase64:s=>printed.push(Buffer.from(s,'base64'))}},Image:class{},
 Uint8Array,Uint8ClampedArray,Buffer,Number,String,Set,Array,Math,Date,console,btoa: s=>Buffer.from(s,'binary').toString('base64')};
vm.runInNewContext(parity,scope,{timeout:6000});
(async()=>{
 await Agent.printOp('doc001');
 assert.equal(printed.length,1);
 assert.deepEqual(Array.from(printed[0].subarray(0,2)),[27,64]);
 assert.ok(text.includes('تجربة أولى')&&text.includes('09300001'));
 assert.ok(text.some(x=>x.includes('فاتورة مبيعات')));
 assert.ok(text.some(x=>x.includes('سائل جلي ليمون')));
 Agent.state.companyName='بعد التحديث';Agent.state.companyPhone='09399999';Agent.state.footerNote='ملاحظة جديدة';
 await Agent.printOp('doc001');
 assert.ok(text.includes('بعد التحديث')&&text.includes('09399999')&&text.includes('ملاحظة جديدة'));
 assert.equal(printed.length,2);
 console.log('PASS: manager print template re-used in agent, current synced branding, two report actions, PDF save/share and compact warehouse actions');
})().catch(e=>{console.error(e);process.exitCode=1});
