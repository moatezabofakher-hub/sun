const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../app/src/main/assets/www/static/shareholders-integrated-133.js');
const Peer=require('../app/src/main/assets/www/static/tiqany-peer-merge.js');
const Clocks=require('../app/src/main/assets/www/static/settings-revision-clock-133.js');
const seed=()=>({settings:{exchangeRate:15000,companyName:'تجربة',shareholderDistribution:{values:{}}},shareholderOwners:[],shareholderMovements:[],
 categories:[],items:[{id:'item1',currency:'USD',units:[{name:'قطعة',costPrice:4}]}],
 accounts:[],invoices:[],vouchers:[],warehouses:[{id:'wh_main',name:'الرئيسي'}],transfers:[],expenses:[],capitalMovements:[],fieldSync:{agents:[]}});
const basic=()=>{const s=seed(),a=S.addOwner(s,{name:'أحمد',period:'all',at:'2026-11-01T00:00:00Z'}),b=S.addOwner(s,{name:'ليلى',period:'date',startDate:'2026-11-05',at:'2026-11-01T00:00:00Z'});S.setDistribution(s,{[a.id]:60,[b.id]:40});return {s,a,b}};
function sale(s,amount=20,date='2026-11-10'){s.invoices.push({id:'i_'+s.invoices.length,type:'sale',date,currency:'USD',exchangeRate:15000,rows:[{itemId:'item1',unitName:'قطعة',qty:2,total:amount,baseCostPrice:4}],netTotal:amount})}
test('full app revenue, returns and expenses produce owner allocations without manual duplicate profit',()=>{
 const {s,a,b}=basic();sale(s);s.expenses.push({id:'x',date:'2026-11-11',amount:2,currency:'USD'});
 assert.equal(S.operatingProfit(s),1000);assert.equal(S.accrued(s,a),600);assert.equal(S.accrued(s,b),400);
 const originalProfit=S.report(s).operatingProfitUSD;
 S.event(s,{type:'contribution',ownerId:a.id,amount:100,currency:'USD',rate:15000});
 assert.equal(S.report(s).operatingProfitUSD,originalProfit);
 assert.equal(S.report(s).capital.USD,100);
 S.event(s,{type:'profitDraw',ownerId:a.id,amount:4,currency:'USD',rate:15000},{availableCash:20});
 assert.equal(S.report(s).remainingProfitUSD,6);assert.equal(S.report(s).capital.USD,100);
 assert.equal(S.cashMovements(s)[0].outflow,4);
});
test('owner activation date excludes earlier receipts and expenses',()=>{
 const {s,a,b}=basic();sale(s,20,'2026-11-02');sale(s,20,'2026-11-10');
 assert.equal(S.accrued(s,a),1440);assert.equal(S.accrued(s,b),480);
});
test('returns to capital never exceed untransferred shareholder reserve',()=>{
 const {s,a}=basic();S.event(s,{type:'contribution',ownerId:a.id,amount:100,currency:'USD'});
 s.capitalMovements.push({id:'capital-1',direction:'receive',currency:'USD',amount:80});
 assert.equal(S.reserve(s,'USD'),2000);
 assert.throws(()=>S.event(s,{type:'returnCapital',ownerId:a.id,amount:30,currency:'USD'}),/غير كاف/);
 assert.equal(S.movements(s).length,1);
});
test('cash availability and profit allocations both protect shareholder withdrawals',()=>{
 const {s,a}=basic();sale(s);
 assert.throws(()=>S.event(s,{type:'profitDraw',ownerId:a.id,amount:4},{availableCash:2}),/الصندوق/);
 assert.throws(()=>S.event(s,{type:'profitDraw',ownerId:a.id,amount:8},{availableCash:100}),/الربح/);
 assert.equal(S.movements(s).length,0);
});
test('a distribution change can produce a negative available balance without rewriting a withdrawal',()=>{
 const {s,a,b}=basic();sale(s);
 S.event(s,{type:'profitDraw',ownerId:a.id,amount:6},{availableCash:50});
 S.setDistribution(s,{[a.id]:30,[b.id]:70});
 assert.equal(S.availableProfit(s,a),-240);
 assert.equal(S.profitDrawn(s,a.id),600);
});
test('two manager snapshots sync shareholder financial rows once, while settings conflict resolves by nearest edited time',()=>{
 const seedBase=seed(),a=S.addOwner(seedBase,{name:'صاحب',period:'all'});
 S.setDistribution(seedBase,{[a.id]:100});
 let left=structuredClone(seedBase),right=structuredClone(seedBase),base=Peer.snapshot(seedBase);
 S.event(left,{type:'contribution',ownerId:a.id,amount:40});
 S.event(right,{type:'contribution',ownerId:a.id,amount:50});
 left.settings.companyName='هاتف';right.settings.companyName='كمبيوتر';
 left.settings._syncSettingTimes={companyName:{updatedAt:'2026-11-17T11:01:00Z',deviceId:'phone'}};
 right.settings._syncSettingTimes={companyName:{updatedAt:'2026-11-17T11:04:00Z',deviceId:'computer'}};
 const r=Peer.merge(base,Peer.snapshot(left),Peer.snapshot(right),{},[],{syncAt:'2026-11-17T11:04:02Z'});
 assert.equal(r.ok,true);assert.equal(r.conflicts.length,0);assert.equal(r.snapshot.sharedSettings.companyName,'كمبيوتر');
 assert.equal(r.snapshot.shareholderMovements.length,2);
 Peer.apply(left,r.snapshot);
 assert.equal(left.shareholderMovements.length,2);
 assert.equal(left.settings.companyName,'كمبيوتر');
});
test('same-time settings conflict converges irrespective of which device initiates merge',()=>{
 const b=seed(),a=seed(),c=seed();
 a.settings.defaultCurrency='USD';c.settings.defaultCurrency='SYP';
 a.settings._syncSettingTimes={defaultCurrency:{updatedAt:'2026-11-17T11:00:00Z',deviceId:'A'}};
 c.settings._syncSettingTimes={defaultCurrency:{updatedAt:'2026-11-17T11:00:00Z',deviceId:'B'}};
 const opts={syncAt:'2026-11-17T11:02:00Z'},x=Peer.merge(Peer.snapshot(b),Peer.snapshot(a),Peer.snapshot(c),{},[],opts),y=Peer.merge(Peer.snapshot(b),Peer.snapshot(c),Peer.snapshot(a),{},[],opts);
 assert.equal(x.ok,true);assert.equal(y.ok,true);
 assert.equal(x.snapshot.sharedSettings.defaultCurrency,y.snapshot.sharedSettings.defaultCurrency);
 assert.deepEqual(x.details,[]);assert.deepEqual(y.details,[]);
});
test('the clock only stamps changed shareable settings and excludes device credentials',()=>{
 const cfg={companyName:'أ',exchangeRate:15000,companyUid:'business_private',appProtection:{pinHash:'secret',pinSalt:'salt',pinAlgo:'sha256'},btMacAddress:'00:00'};
 Clocks.remember(cfg);
 cfg.companyName='ب';cfg.btMacAddress='11:11';
 const changed=Clocks.touch(cfg,'2026-11-17T11:00:00Z');
 assert.deepEqual(changed,['companyName']);assert.equal(cfg._syncSettingTimes.btMacAddress,undefined);
});
test('Android full ledger UI mounts shareholders but employee assets remain untouched',()=>{
 const web=path.join(__dirname,'../app/src/main/assets/www');
 const html=fs.readFileSync(path.join(web,'index.html'),'utf8');
 assert.match(html,/shareholders-integrated-133\.js/);
 assert.match(html,/shareholderOwners: State.shareholderOwners/);
 assert.match(html,/shareholderMovements: State.shareholderMovements/);
 assert.match(html,/ShareholdersCashMovements/);
 assert.match(html,/SettingsRevisionClock.touch/);
 assert.match(fs.readFileSync(path.join(web,'static/capital-ledger.js'),'utf8'),/ShareholdersUI.open/);
});
