'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
  fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const windows=fs.existsSync(path.join(root,'upgrade-125'));
const assetDir=windows?path.join(root,'upgrade-125'):path.join(root,'app/src/main/assets/www/static');
const source=fs.readFileSync(path.join(assetDir,'ta-report-local-date-148.js'),'utf8');
const core=require(path.join(assetDir,'ta-currency-exchange-core-142.js'));
function createFilter(){
 // A deterministic UTC+03 local-calendar clock, matching the user's phone
 // when 2026-11-17 22:40 UTC is November 18 locally.
 const filter={
  localDate(d){return new Date(d.getTime()+3*3600000).toISOString().slice(0,10);},
  matches(input,mode,start,end){
   const date=String(input||'').slice(0,10);
   if(mode==='all')return true;
   if(mode==='today')return date==='2026-11-18';
   if(mode==='yesterday')return date==='2026-11-17';
   if(mode==='custom')return date===start;
   if(mode==='range')return date>=start&&date<=end;
   return false;
  }
 };
 const rootGlobal={TimeFilter:filter};
 rootGlobal.window=rootGlobal;
 vm.runInNewContext(source,rootGlobal,{filename:'ta-report-local-date-148.js'});
 return {filter,...rootGlobal.TiqanyReportDate148};
}
const trade=(id,date,from,to,fromAmount,toAmount)=>
 core.prepare({id,date,fromCurrency:from,toCurrency:to,
  fromAmount,toAmount,equivalentSyp:from==='SYP'?fromAmount:toAmount},['USD','SYP']);
test('UTC 22:40 on Nov 17 belongs to Nov 18 on a UTC+03 phone, not yesterday',()=>{
 const {filter,normalized}=createFilter();
 assert.equal(normalized('2026-11-17T22:40:00.000Z'),'2026-11-18');
 assert.equal(filter.matches('2026-11-17T22:40:00.000Z','today'),true);
 assert.equal(filter.matches('2026-11-17T22:40:00.000Z','yesterday'),false);
 assert.equal(filter.matches('2026-11-17T22:40:00.000Z','custom','2026-11-18'),true);
 assert.equal(filter.matches('2026-11-17T22:40:00.000Z','range','2026-11-18','2026-11-18'),true);
});
test('Screenshot FX sequence transfers exactly 20,000 SYP once into the correct period and gross/net profit',()=>{
 const {filter}=createFilter();
 const events=[
  trade('fx_sell_20261117','2026-11-17T22:39:00.000Z','USD','SYP',100,1500000),
  trade('fx_buy_20261117','2026-11-17T22:40:00.000Z','SYP','USD',2960000,200)
 ];
 const before=JSON.stringify(events),analysis=core.analyze(events);
 const booked=[...analysis.byId.values()].filter(e=>e.gainSyp!==null&&filter.matches(e.date,'today'));
 const fxProfit=booked.reduce((n,e)=>n+e.gainSyp,0);
 const usdRate=15000,baseProfitUsd=0,expenseUsd=0;
 const grossUsd=baseProfitUsd+fxProfit/usdRate;
 const netUsd=grossUsd-expenseUsd;
 assert.equal(analysis.profitSyp,20000);
 assert.equal(fxProfit,20000);
 assert.equal(booked.length,1);
 assert.equal(Math.round(grossUsd*usdRate),20000);
 assert.equal(Math.round(netUsd*usdRate),20000);
 assert.equal([...analysis.byId.values()].filter(e=>e.gainSyp!==null&&filter.matches(e.date,'yesterday')).length,0);
 assert.equal(JSON.stringify(events),before,'No historical FX record is mutated or duplicated');
});
test('Calendar date-only entries and local timestamps without zones are not shifted',()=>{
 const {filter,normalized}=createFilter();
 assert.equal(normalized('2026-11-17'),'2026-11-17');
 assert.equal(normalized('2026-11-17T22:40:00'),'2026-11-17T22:40:00');
 assert.equal(filter.matches('2026-11-17','today'),false);
 assert.equal(filter.matches('2026-11-18','today'),true);
 assert.equal(normalized('2026-11-17T22:40:00+00:00'),'2026-11-18');
 assert.equal(normalized('2026-11-18T01:40:00+03:00'),'2026-11-18');
});
test('Date filter is installed once and controls all report views',()=>{
 const {filter}=createFilter(),reference=filter.matches;
 const app={TimeFilter:filter};app.window=app;
 vm.runInNewContext(source,app);
 assert.strictEqual(filter.matches,reference);
 assert.ok(filter.__localTimestamp148);
 if(!windows){
  const html=fs.readFileSync(path.join(root,'app/src/main/assets/www/index.html'),'utf8');
  assert.match(html,/static\/ta-report-local-date-148\.js/);
  assert.match(html,/const fxPeriodEvents/);
  assert.match(html,/grossProfitUsd = estimatedProfitUsd \+ exchangeProfitSyp/);
  assert.match(html,/invoiceProfits\.push\(\{id:'fx_profit_'/);
 }else{
  const installer=fs.readFileSync(path.join(assetDir,'apply-fx-report-local-148.cjs'),'utf8');
  assert.match(installer,/ta-report-local-date-148\.js/);
  assert.match(installer,/3\.5\.148/);
 }
});
