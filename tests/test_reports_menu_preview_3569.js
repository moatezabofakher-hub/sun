const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync('app/src/main/assets/www/index.html','utf8');const agent=fs.readFileSync('field_agent/src/main/assets/www/index.html','utf8');
const fieldCode=fs.readFileSync('field_agent/src/main/assets/www/static/agent-reports.js','utf8');
const fieldJava=fs.readFileSync('field_agent/src/main/java/com/sunshine/accounting/MainActivity.java','utf8');
for(const label of ['sales_summary','debts_summary'])assert(app.includes("openPreview('"+label+"')"));
assert(app.includes('LedgerReports.openPrintChooser()'));assert(app.includes('data-report-preview-actions'));
assert(app.includes('LedgerReports.sharePdf()'));assert(!app.includes('data-feature="print-reports-3523"'));
assert(agent.includes('id="nav-reports"'));assert(agent.includes('agent-reports.js'));assert(fieldJava.includes('new ReportPdfBridge()'));
assert(fieldJava.includes('AndroidReports'));assert(fs.existsSync('field_agent/src/main/java/com/sunshine/accounting/ReportPdfRenderer.java'));
const a={reportKind:'sales_summary',reportPeriod:'all',reportSide:'debit',state:{ops:[
 {id:'1',kind:'sale',date:'2026-11-15',currency:'SYP',netTotal:300,rows:[{itemId:'a',itemName:'منظف',unitName:'عبوة',qty:3,total:300}]},
 {id:'2',kind:'sale_return',date:'2026-11-15',currency:'SYP',netTotal:100,rows:[{itemId:'a',itemName:'منظف',unitName:'عبوة',qty:1,total:100}]}],accounts:[{id:'a',name:'عميل'}],companyName:'test'},
 balanceFor:()=>({available:true,syp:500,usd:-7}),escape:s=>String(s),toast:()=>{}};
vm.runInNewContext(fieldCode,{Agent:a,window:{},Date,console,document:{}});
const sale=a.reportPayload();assert.equal(sale.totals.SYP,200);assert.equal(sale.rows.length,1);assert(sale.rows[0].detail.includes('2'));
a.reportKind='debts_summary';assert.equal(a.reportPayload().totals.SYP,500);a.reportSide='credit';assert.equal(a.reportPayload().totals.USD,7);
console.log('PASS: reports menu, preview, report PDF bridge, and local staff summaries');
