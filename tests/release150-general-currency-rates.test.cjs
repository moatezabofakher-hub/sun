'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const win=fs.existsSync(path.join(root,'upgrade-125'));
const dir=win?path.join(root,'upgrade-125'):path.join(root,'app/src/main/assets/www/static');
const source=fs.readFileSync(path.join(dir,'ta-fx-buy-sell-147.js'),'utf8');
test('Green added-currency rate control has visible white text independent of trading buy/sell',()=>{
 assert.match(source,/data-ta150-currency-rate-button/);
 assert.match(source,/background:#047857!important;color:#fff!important/);
 assert.match(source,/تعديل سعر الصرف/);
 assert.match(source,/سعر صرف/);
 assert.match(source,/currencyRates\(\)/);
 assert.doesNotThrow(()=>new vm.Script(source));
});
test('General USD plus foreign rates use independent editable fields; trade prices remain separate',()=>{
 assert.match(source,/id="ta150General_/);
 assert.match(source,/ta150General_USD/);
 assert.match(source,/currencyRatesSyp/);
 assert.match(source,/exchangeRate=usd/);
 assert.match(source,/root\.TiqanyFx147=\{[^}]*generalInvoiceRateModal:currencyRates/);
 assert.match(source,/UI\.openRateModal=originalInvoiceRateModal/);
 assert.match(source,/U\.openGeneralRateModal=currencyRates/);
 assert.doesNotMatch(source,/UI\.openRateModal=currencyRates/);
 assert.match(source,/U\.ratesForm=unifiedRates/);
 assert.match(source,/ta147Buy_/);
 assert.match(source,/ta147Sell_/);
 assert.match(source,/currencyExchangeRatesSyp=next/);
});
test('Exchange rate update is atomic and does not alter existing FX trading gains',()=>{
 assert.match(source,/priorRate=State\.settings\.exchangeRate/);
 assert.match(source,/priorCurrencies=State\.settings\.currencyRatesSyp/);
 assert.match(source,/catch\(e\)\{State\.settings\.exchangeRate=priorRate;State\.settings\.currencyRatesSyp=priorCurrencies;trial\.undo\(trialBefore\);throw e;\}/);
 assert.match(source,/badge\.textContent=usd\.toLocaleString/);
 const section=source.slice(source.indexOf('async function saveCurrencyRates(){'),source.indexOf('function unifiedRates(){'));
 assert.doesNotMatch(section,/State\.currencyExchanges\s*=/,'General rate changes cannot create or rewrite FX trades');
});
test('Manager-to-computer keeps currency rates in settings reconciliation',()=>{
 const file=win?'tiqany-peer-merge-133.js':'tiqany-peer-merge.js';
 if(!fs.existsSync(path.join(dir,file)))return;
 const code=fs.readFileSync(path.join(dir,file),'utf8');
 assert.match(code,/'currencyRatesSyp'/);
 assert.match(code,/'currencyExchangeRatesSyp'/);
});
test('Staff catalog includes new general rates without replacing its own FX buy/sell rates',()=>{
 assert.match(source,/result\.currencyRatesSyp=JSON\.parse\(JSON\.stringify\(generalRates\(\)\)\)/);
 assert.match(source,/result\.currencyExchangeRatesSyp=JSON\.parse\(JSON\.stringify\(rates\(\)\)\)/);
 assert.match(source,/result\.generalUsdExchangeRate=/);
 if(!win&&fs.existsSync(path.join(root,'field_agent/src/main/assets/www/static/agent.js'))){
  const agent=fs.readFileSync(path.join(root,'field_agent/src/main/assets/www/static/agent.js'),'utf8');
  const pairing=fs.readFileSync(path.join(root,'field_agent/src/main/assets/www/static/agent-pairing.js'),'utf8');
  const views=fs.readFileSync(path.join(root,'field_agent/src/main/assets/www/static/ta-currency-exchange-agent-142.js'),'utf8');
  assert.match(agent,/currencyRatesSyp:catalog\.currencyRatesSyp/);
  assert.match(agent,/currencyRatesSyp:payload\.currencyRatesSyp/);
  assert.match(pairing,/currencyRatesSyp:c\.currencyRatesSyp/);
  assert.match(views,/سعر صرف/);
  assert.match(views,/أسعار التصريف/);
 }
});
test('Windows v150 build stage installs the new general-rate screen',()=>{
 if(!win)return;
 const installer=fs.readFileSync(path.join(dir,'apply-currency-general-rates-150.cjs'),'utf8');
 assert.match(installer,/pkg\.version='3\.5\.150'/);
 assert.match(installer,/ta-fx-buy-sell-147\.js/);
 assert.match(installer,/TiqanyFx147\.generalInvoiceRateModal\(\)/);
});
