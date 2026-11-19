'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),windows=fs.existsSync(path.join(root,'upgrade-125'));
const dir=windows?path.join(root,'upgrade-125'):path.join(root,'app/src/main/assets/www/static');
const engine=require(path.join(dir,'ta-currency-exchange-core-142.js'));
const script=fs.readFileSync(path.join(dir,'ta-fx-buy-sell-147.js'),'utf8');
function sandbox(){
 const ids={},logs=[],state={currencyExchanges:[],settings:{
  exchangeRate:15000,
  currencyExchangeRatesSyp:{USD:{buy:15000,sell:17000},EUR:{buy:18000,sell:19200}},
  addedCurrencies:[{code:'EUR',name:'اليورو'}]}};
 let seq=0;
 const app={
  State:state,document:{getElementById:id=>ids[id]||null},
  UI:{openModal:html=>{logs.push(html);},forceCloseModal(){},toast(m){logs.push(m);},openRateModal(){logs.push('TRANSACTION_RATE_MODAL');}},
  Views:{renderReports(){return true;}},StorageEngine:{async saveState(){}},
  AppNav:{renderCurrent(){},current:()=>({screen:'dashboard'})},
  FieldCash:{summary:()=>({sypCash:9000000,usdCash:100,otherCurrencies:{EUR:100}})},
  CurrencyCatalog:{active:()=>['USD','SYP'],label:c=>c==='EUR'?'اليورو (EUR)':c,
   renderAdditional(){return '';}},
  FieldSync:{catalog(){return {allowedCurrencies:['USD','SYP']};}},
  TiqanyCurrencyExchangeCore:engine,
  TiqanyFxUI:{newForm(){return 'legacy';},ratesForm(){}},
  crypto:{randomUUID:()=>String.fromCharCode(97+(seq++%20)).repeat(32)},
  console
 };
 app.window=app;
 vm.runInNewContext(script,app);
 const fields=(values)=>{
  for(const [id,value] of Object.entries(values))ids[id]={value:String(value)};
 };
 return {app,state,ids,logs,fields};
}
test('The exchange screen offers distinct USD buy/sell and new-currency buy/sell buttons',()=>{
 const {app,logs}=sandbox();
 app.TiqanyFx147.chooser();
 const markup=logs.join('\n');
 for(const part of ['شراء USD','مبيع USD','شراء EUR','مبيع EUR'])
  assert.ok(markup.includes(part),part);
 assert.match(markup,/TiqanyFx147\.trade/);
 assert.match(markup,/سعر الشراء/);
 assert.match(markup,/سعر المبيع/);
});
test('Editable exchange window calculates SYP from foreign amount, retaining v145 accounting',async()=>{
 const s=sandbox();
 s.fields({ta147Currency:'USD',ta147Side:'buy',ta147Amount:100,ta147Rate:15000,ta147Note:'شراء اختبار'});
 await s.app.TiqanyFx147.saveTrade();
 assert.equal(s.state.currencyExchanges.length,1);
 assert.equal(s.state.currencyExchanges[0].fromCurrency,'SYP');
 assert.equal(s.state.currencyExchanges[0].fromAmount,1500000);
 assert.equal(s.state.currencyExchanges[0].toAmount,100);
 s.fields({ta147Currency:'USD',ta147Side:'sell',ta147Amount:50,ta147Rate:17000,ta147Note:'مبيع اختبار'});
 await s.app.TiqanyFx147.saveTrade();
 assert.equal(s.state.currencyExchanges[1].fromCurrency,'USD');
 assert.equal(s.state.currencyExchanges[1].toAmount,850000);
 assert.equal(engine.analyze(s.state.currencyExchanges).profitSyp,100000);
 assert.equal(s.state.settings.currencyExchangeRatesSyp.USD.sell,17000);
});
test('A foreign currency is synchronized with its name, code and quotation table',()=>{
 const {app}=sandbox(),payload=app.FieldSync.catalog({id:'agent_test'});
 assert.ok(payload.allowedCurrencies.includes('EUR'));
 assert.equal(payload.addedCurrencies[0].name,'اليورو');
 assert.equal(payload.currencyExchangeRatesSyp.EUR.buy,18000);
 assert.match(app.CurrencyCatalog.renderAdditional(),/سعر صرف/);
});
test('Top bar retains the old transaction exchange-rate modal, while currency setup stays separately available',async()=>{
 const {app,state,fields,logs}=sandbox();
 app.UI.openRateModal();
 assert.equal(logs[logs.length-1],'TRANSACTION_RATE_MODAL');
 app.TiqanyFx147.generalInvoiceRateModal();
 const markup=logs[logs.length-1];
 assert.match(markup,/أسعار صرف العملات/);
 assert.match(markup,/ta150General_USD/);
 assert.match(markup,/ta150General_EUR/);
 assert.doesNotMatch(markup,/ta147Buy_|ta147Sell_/);
 fields({ta150General_USD:15000,ta150General_EUR:18500});
 await app.TiqanyFx147.saveCurrencyRates();
 assert.equal(state.settings.exchangeRate,15000);
 assert.equal(state.settings.currencyRatesSyp.EUR,18500);
 assert.equal(state.settings.currencyExchangeRatesSyp.EUR.buy,18000);
 assert.equal(state.settings.currencyExchangeRatesSyp.EUR.sell,19200);
 assert.match(app.CurrencyCatalog.renderAdditional(),/ta-currency-rate-150/);
 assert.match(app.CurrencyCatalog.renderAdditional(),/background:#047857!important;color:#fff!important/);
 assert.match(app.CurrencyCatalog.renderAdditional(),/18,500/);
 assert.match(script,/ta-fx-rates-btn-149/);
});
test('Editing the general USD rate changes its header price while FX trading quotes remain unchanged',async()=>{
 const {app,state,fields,logs}=sandbox();
 fields({ta150General_USD:16000,ta150General_EUR:18750});
 await app.TiqanyFx147.saveCurrencyRates();
 assert.equal(state.settings.exchangeRate,16000);
 assert.equal(state.settings.currencyRatesSyp.EUR,18750);
 assert.equal(state.settings.currencyExchangeRatesSyp.USD.buy,15000);
 assert.equal(state.settings.currencyExchangeRatesSyp.USD.sell,17000);
 const payload=app.FieldSync.catalog({id:'employee'});
 assert.equal(payload.generalUsdExchangeRate,16000);
 assert.equal(payload.currencyRatesSyp.EUR,18750);
 // Dedicated trading quotation panel keeps its own buy/sell controls.
 app.TiqanyFx147.editRates();
 const tradeMarkup=logs[logs.length-1];
 assert.match(tradeMarkup,/أسعار شراء ومبيع العملات/);
 assert.match(tradeMarkup,/ta147Buy_USD/);
 assert.match(tradeMarkup,/ta147Sell_EUR/);
});

test('FX profit remains separate from principal, with a dedicated report shortcut',()=>{
 const {app,logs}=sandbox();
 app.TiqanyFx147.profitDetails();
 assert.match(logs.join(''),/أرباح التصريف/);
 assert.match(script,/أرباح التصريف المحققة/);
 assert.match(script,/TiqanyFx147\.profitDetails/);
});
test('Both source scripts parse and Windows/Android invoice profit integration is present',()=>{
 assert.doesNotThrow(()=>new vm.Script(script));
 if(!windows){
  const html=fs.readFileSync(path.join(root,'app/src/main/assets/www/index.html'),'utf8');
  assert.match(html,/static\/ta-fx-buy-sell-147\.js/);
  assert.match(html,/invoiceProfits\.push\(\{id:'fx_profit_'/);
 }else{
  const post=fs.readFileSync(path.join(dir,'apply-fx-trading-147.cjs'),'utf8');
  assert.match(post,/fxProfitInvoiceRows/);
  assert.match(post,/ta-fx-buy-sell-147/);
 }
});

test('Gross and net profits both include realized FX gains exactly once',()=>{
 const html=fs.readFileSync(path.join(root,'app/src/main/assets/www/index.html'),'utf8');
 const start=html.indexOf('renderReports(main, params = {})');
 const end=html.indexOf('SETTINGS',start);
 const source=html.slice(start,end);
 assert.match(source,/grossProfitUsd = estimatedProfitUsd \+ exchangeProfitSyp/);
 assert.match(source,/netProfitUsd = grossProfitUsd - expenseTotalUsd/);
 assert.match(source,/Accounting\.format\(grossProfitUsd,'USD'\)/);
 assert.match(source,/invoiceProfits\.push\(\{id:'fx_profit_'/);
});

test('Editing FX through modern buy/sell page replaces historical operation exactly once',async()=>{
 const x=sandbox();
 x.fields({ta147Currency:'USD',ta147Side:'buy',ta147Amount:100,ta147Rate:15000,ta147Note:'شراء أصلي'});
 await x.app.TiqanyFx147.saveTrade();
 x.fields({ta147Currency:'USD',ta147Side:'sell',ta147Amount:50,ta147Rate:17000,ta147Note:'بيع أصلي'});
 await x.app.TiqanyFx147.saveTrade();
 assert.equal(engine.analyze(x.state.currencyExchanges).profitSyp,100000);
 const original=x.state.currencyExchanges[1],id=original.id,date=original.date;
 x.fields({ta147Currency:'USD',ta147Side:'sell',ta147Amount:50,ta147Rate:18000,
   ta147EditId:id,ta147Note:'بيع معدل'});
 for(const id of ['ta147Amount','ta147Rate','ta147Balance','ta147Preview','ta147Total']){
   if(!x.ids[id])x.ids[id]={value:'',textContent:''};
   x.ids[id].addEventListener=()=>{};
 }
 x.app.TiqanyFxUI.newForm(id);
 assert.match(x.logs.at(-1),/تعديل مبيع USD/);
 await x.app.TiqanyFx147.saveTrade();
 assert.equal(x.state.currencyExchanges.length,2,'editing must not append a second FX operation');
 assert.equal(x.state.currencyExchanges[1].id,id);
 assert.equal(x.state.currencyExchanges[1].date,date);
 assert.equal(x.state.currencyExchanges[1].note,'بيع معدل');
 assert.equal(engine.analyze(x.state.currencyExchanges).profitSyp,150000);
 assert.equal(x.state.settings.currencyExchangeRatesSyp.USD.sell,18000);
});
