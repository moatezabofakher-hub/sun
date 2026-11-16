const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const web=path.resolve(__dirname,'../app/src/main/assets/www');
const html=fs.readFileSync(path.join(web,'index.html'),'utf8');
const js=(name)=>fs.readFileSync(path.join(web,'static',name),'utf8');

test('invoice date format DD/MM/YYYY is validated but saved as ISO',()=>{
 const ctx=vm.createContext({window:{},console});vm.runInContext(js('ta-date-view-35107.js'),ctx);
 const fmt=ctx.window.TiqanyDateView;
 assert.equal(fmt.visible('2026-11-16T20:30'),'16/11/2026 20:30');
 assert.equal(fmt.isoDate('16/11/2026'),'2026-11-16');
 assert.equal(fmt.isoDate('31/02/2026'),null);
 assert.match(html,/this\.draft\.date = \(part==='day'\?isoInput:old\.isoDay\)/);
 assert.match(html,/placeholder="DD\/MM\/YYYY"/);
});

test('statement PDF gets global lexical State and Accounting, not window.State',async()=>{
 let sent=null;
 const win={AndroidReports:{shareReport:(json,name)=>{sent={json:JSON.parse(json),name};}},TiqanyDateView:{visible:date=>date}};
 const ctx=vm.createContext({window:win,document:{getElementById:id=>({value:id==='statementFrom'?'2026-11-01':'2026-11-30'})},console,BigInt});
 vm.runInContext(`const State={settings:{companyName:'شركة اختبار',exchangeRate:15000},accounts:[{id:'acct42',name:'زبون تجريبي'}]};
    const Accounting={getAccountStatement:id=>({entries:[{date:'2026-11-16',currency:'SYP',debit:100,credit:0,ref:'INV-1',desc:'مبيعات'}]})};
    const UI={toast:()=>{}};`,ctx);
 vm.runInContext(js('account-statement-period-3589.js'),ctx);
 assert.equal(ctx.window.AccountStatementPeriod.sharePdf('acct42'),true);
 assert.equal(sent.json.accountName,'زبون تجريبي');
 assert.equal(sent.json.companyName,'شركة اختبار');
 assert.equal(sent.json.rows[0].debit,'100');
 assert.equal(sent.json.ending.SYP,'100');
 assert.match(sent.name,/\.pdf$/i);
});

test('business profile close-settings guard runs before loading new business settings',()=>{
 const start=html.indexOf('async activate(id) {');assert.ok(start>0);
 const source=html.slice(start,start+4400);
 const guard=source.indexOf('SettingsDraftController.revert(false)');
 const stateSwitch=source.indexOf('State[key]=');
 assert.ok(guard>0&&stateSwitch>guard,'reverting previous settings after loading new settings clones its company name');
 assert.match(source,/newState\.settings\.companyName=String\(selected\.name\)\.trim\(\)/);
});

test('invoice/POS have branded glossy green saves, currency abbreviations and fixed POS due',()=>{
 const css=js('tiqany-forms-35107.css');const pos=js('windows-pos.js');
 assert.match(css,/ta-invoice-save-footer \.ta-footer-actions button:last-child/);
 assert.match(css,/ta-pos-fixed-footer/);
 assert.match(css,/ta-voucher-cancel-action/);
 assert.match(css,/body:not\(\.ta-dashboard-screen\) #headerNotificationsBtn/);
 assert.match(pos,/id="taPosFooterDue"/);
 assert.match(pos,/POSController\.save\(true\)/);
 assert.match(html,/\? 'ل\.س' : '\$USD'/);
 assert.match(html,/ta-statement-share-pdf/);
});
