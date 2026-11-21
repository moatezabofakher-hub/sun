const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dir = ['../app/src/main/assets/www/static', '../web/static']
  .map(dir => path.resolve(__dirname,dir)).find(dir => fs.existsSync(path.join(dir,'shareholders-integrated-133.js')));
const S = require(path.join(dir, 'shareholders-integrated-133.js'));
const F = require(path.join(dir, 'finance-operations.js'));

function ledger() {
  const rows = [
    {itemId:'a', qty:1, total:80, baseCostPrice:20, costCurrency:'USD'},
    {itemId:'b', qty:1, total:20, baseCostPrice:5, costCurrency:'USD'}
  ];
  return {settings:{exchangeRate:10000}, items:[{id:'a',category:'أ'},{id:'b',category:'ب'}],
    invoices:[
      {id:'1',type:'sale',date:'2026-02-10',posSale:true,currency:'USD',netTotal:90,rows},
      {id:'2',type:'sale_return',date:'2026-02-11',warehouseId:'wh_main',currency:'USD',rows:[{...rows[0],total:30}]},
      {id:'3',type:'sale',date:'2026-02-15',warehouseId:'wh_north',currency:'USD',rows:[{...rows[0],total:45}]}
    ],expenses:[{id:'x',date:'2026-02-15',currency:'USD',amount:10}]};
}
test('scoped shares include POS, invoice discount, returns, legacy warehouse and effective date',()=>{
  const s=ledger(),a=S.addOwner(s,{name:'أ'});S.setDistribution(s,{[a.id]:100});
  assert.equal(S.availableProfit(s,a),7000);
  for(const [profitScope,cents] of [
    [{kind:'warehouses',ids:['wh_main']},5500],
    [{kind:'warehouses',ids:['wh_main','wh_north']},8000],
    [{kind:'category',category:'أ'},6700],
    [{kind:'category',category:'ب'},1300]
  ]) {
    const updated=S.editOwner(s,a.id,{profitScope});
    assert.equal(S.availableProfit(s,updated),cents);
  }
  const update=S.editOwner(s,a.id,{profitScope:{kind:'category',category:'أ'},period:'date',startDate:'2026-02-12'});
  assert.equal(S.availableProfit(s,update),2500);
  assert.throws(()=>S.editOwner(s,a.id,{profitScope:{kind:'warehouses',ids:[]}}));
  assert.equal(S.operatingProfit(s),7000);
});
test('a new scoped owner can rebalance a withdrawn share; other owners and cash remain usable',()=>{
  const s=ledger(),first=S.addOwnerWithDistribution(s,{name:'الأول',percentage:100});
  S.event(s,{type:'profitDraw',ownerId:first.id,currency:'USD',amount:60},{availableCash:100});
  const old=structuredClone(s.shareholderMovements);
  const second=S.addOwnerWithDistribution(s,{name:'الثاني',percentage:50,profitScope:{kind:'warehouses',ids:['wh_north']}});
  assert.equal(S.availableProfit(s,first),-2500);
  assert.equal(S.availableProfit(s,second),1250);
  assert.deepEqual(s.shareholderMovements,old);
  assert.throws(()=>S.event(s,{type:'profitDraw',ownerId:first.id,amount:1}),/يتجاوز/);
  S.event(s,{type:'profitDraw',ownerId:second.id,amount:2},{availableCash:2});
  assert.equal(S.availableProfit(s,second),1050);
  S.editEvent(s,old[0].id,{note:'مراجعة'});
  assert.equal(S.availableProfit(s,first),-2500);
  const reversal={...old[0],id:'old-signed-entry',units:-100,usdCents:-100};
  s.shareholderMovements.push(reversal);
  S.setDistribution(s,{[first.id]:25,[second.id]:75});
  assert.equal(S.cashMovements(s).at(-1).inflow,1);
  assert.equal(S.profitDrawn(s,first.id),5900);
});
test('saved rows retain their item group across item reclassification and invoice edits',()=>{
  const s=ledger();
  const inv=s.invoices[0];
  inv.rows[0].rowId='A';
  F.freeze(s,inv);
  assert.equal(inv.rows[0].profitCategory,'أ');
  s.items[0].category='ج';
  const edit=structuredClone(inv);
  F.freeze(s,edit,inv);
  assert.equal(edit.rows[0].profitCategory,'أ');
});
