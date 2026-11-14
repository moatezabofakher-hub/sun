const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const variant of ['main']) {
  const html = fs.readFileSync(path.join(root,'app/src/main/assets/www/index.html'),'utf8');
  const helper = require(path.join(root,'app/src/main/assets/www/static/account-balance-summary.js'));
  const accounts = [
    {id:'c1',type:'customer',name:'عميل أول'},
    {id:'c2',type:'customer',name:'عميل ثاني'},
    {id:'c3',type:'customer',name:'عميل ثالث'},
    {id:'s1',type:'supplier',name:'مورد أول'},
    {id:'s2',type:'supplier',name:'مورد ثاني'}
  ];
  const statements = {
    c1:{sypBalance:100,usdBalance:-20,evalUsd:0,evalSyp:0},
    c2:{sypBalance:-30,usdBalance:60,evalUsd:0,evalSyp:0},
    c3:{sypBalance:0,usdBalance:0,evalUsd:0,evalSyp:0},
    s1:{sypBalance:-500,usdBalance:25,evalUsd:0,evalSyp:0},
    s2:{sypBalance:75,usdBalance:-15,evalUsd:0,evalSyp:0}
  };
  const summaryCustomer = helper.calculate(accounts,'customer',id=>statements[id]);
  assert.equal(summaryCustomer.count,3);
  assert.deepEqual(summaryCustomer.debit,{SYP:100,USD:60});
  assert.deepEqual(summaryCustomer.credit,{SYP:30,USD:20});
  const summarySupplier = helper.calculate(accounts,'supplier',id=>statements[id]);
  assert.deepEqual(summarySupplier.debit,{SYP:75,USD:25});
  assert.deepEqual(summarySupplier.credit,{SYP:500,USD:15});
  assert.equal(helper.calculate(accounts,'all',id=>statements[id]),null);
  const start=html.indexOf('            renderAccounts(main, params = {}) {');
  const end=html.indexOf('            renderAccountStatement(main, params = {}) {',start);
  assert(start>0 && end>start);
  const fnSrc=html.substring(start,end).trim().replace(/,\s*\/\/.*$/s,',');
  const factory=new Function('AccountBalanceSummary','State','Accounting','UI','AppEscape', `return ({${fnSrc}}).renderAccounts;`);
  let calculations=0;
  const view=factory(helper,{accounts}, {
    getAccountStatement(id){calculations++;return statements[id]},
    format(amount,currency){return `${currency}:${amount}`}
  }, {setHeader(){}}, {text(v){return String(v)}});
  const main={innerHTML:''};
  view(main,{tab:'customer'});
  assert(main.innerHTML.includes('data-account-balance-summary="customer"'));
  for (const snippet of ['data-summary="debit-syp">SYP:100','data-summary="debit-usd">USD:60','data-summary="credit-syp">SYP:30','data-summary="credit-usd">USD:20']) assert(main.innerHTML.includes(snippet),snippet);
  assert(!main.innerHTML.includes('SYP:500'),'customer totals accidentally include supplier balances');
  assert.equal(calculations,5, 'cached statements used at most once per account');
  calculations=0;
  view(main,{tab:'supplier'});
  assert(main.innerHTML.includes('data-account-balance-summary="supplier"'));
  for (const snippet of ['data-summary="debit-syp">SYP:75','data-summary="debit-usd">USD:25','data-summary="credit-syp">SYP:500','data-summary="credit-usd">USD:15']) assert(main.innerHTML.includes(snippet),snippet);
  assert.equal(calculations,5);
  view(main,{tab:'all'});
  assert(!main.innerHTML.includes('data-account-balance-summary='),'no summary on all tab');
  view(main,{debts:true,balanceSide:'debit'});
  assert(!main.innerHTML.includes('data-account-balance-summary='),'old debts report remains separate');
  assert(html.includes('src="static/account-balance-summary.js"'));
  console.log('PASS',variant,'aggregate balances and render integration');
}
