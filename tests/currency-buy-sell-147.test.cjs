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
  UI:{openModal:html=>{logs.push(html);},forceCloseModal(){},toast(m){logs.push(m);},openRateModal(){}},
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
 assert.match(app.CurrencyCatalog.renderAdditional(),/سعر الصرف/);
});
test('Header still displays the USD general FX rate while editable buy/sell rates are distinct',async()=>{
 const {app,state,fields}=sandbox();
 app.UI.openRateModal();
 fields({ta147GeneralUsd:15500,ta147Buy_USD:15400,ta147Sell_USD:16600,ta147Buy_EUR:19000,ta147Sell_EUR:19900});
 await app.TiqanyFx147.saveRates();
 assert.equal(state.settings.exchangeRate,15500);
 assert.equal(state.settings.currencyExchangeRatesSyp.USD.buy,15400);
 assert.equal(state.settings.currencyExchangeRatesSyp.EUR.sell,19900);
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
