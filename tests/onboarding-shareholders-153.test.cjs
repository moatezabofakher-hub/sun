'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const windows=fs.existsSync(path.join(__dirname,'shareholders-integrated-133.js'));
const root=path.resolve(__dirname,'..');
const shareholders=windows?path.join(__dirname,'shareholders-integrated-133.js'):path.join(root,'app/src/main/assets/www/static/shareholders-integrated-133.js');
const lifecycle=windows?path.join(__dirname,'fix-company-lifecycle-128.cjs'):path.join(root,'app/src/main/assets/www/static/company-lifecycle-128.js');
const S=require(shareholders);
const fresh=()=>({settings:{companyName:'',companyPhone:'',companyAddress:'',companySetupCompleted:false,exchangeRate:15000,shareholderDistribution:{values:{}}},shareholderOwners:[],shareholderMovements:[],alertCenter:{entries:[]},invoices:[],expenses:[],items:[]});
const shares=(s)=>Object.fromEntries(S.owners(s).map(o=>[o.name,S.percentages(s)[o.id]]));

test('First company manager is an owner with 100 percent and no money is fabricated',()=>{
 const state=fresh();
 const first=S.addOwnerWithDistribution(state,{name:'المدير',role:'manager',percentage:100});
 assert.equal(first.role,'manager');
 assert.deepEqual(shares(state),{'المدير':100});
 assert.deepEqual(state.shareholderMovements,[]);
});

test('A new profit percentage is mandatory and old absolute differences are preserved',()=>{
 const s=fresh();
 S.addOwnerWithDistribution(s,{name:'المدير',percentage:100});
 S.addOwnerWithDistribution(s,{name:'شريك',percentage:25});
 assert.deepEqual(shares(s),{'المدير':75,'شريك':25});
 S.addOwnerWithDistribution(s,{name:'شريك ثالث',percentage:20});
 assert.deepEqual(shares(s),{'المدير':65,'شريك':15,'شريك ثالث':20});
 assert.equal(Object.values(shares(s)).reduce((n,x)=>n+x,0),100);
});

test('Redistribution from 60/40 to a 20 percent new shareholder retains the old 20 point gap',()=>{
 const s=fresh(),a=S.addOwner(s,{name:'أ'}),b=S.addOwner(s,{name:'ب'});
 S.setDistribution(s,{[a.id]:60,[b.id]:40});
 S.addOwnerWithDistribution(s,{name:'ج',percentage:20});
 assert.deepEqual(shares(s),{'أ':50,'ب':30,'ج':20});
});

test('Owners at zero stay nonnegative; invalid or duplicate inserts roll back',()=>{
 const s=fresh(),a=S.addOwner(s,{name:'أ'}),b=S.addOwner(s,{name:'ب'});
 S.setDistribution(s,{[a.id]:100,[b.id]:0});
 S.addOwnerWithDistribution(s,{name:'ج',percentage:30});
 assert.deepEqual(shares(s),{'أ':70,'ب':0,'ج':30});
 const before=JSON.stringify(s);
 for(const percentage of ['',null,'101','12.12345']){
   assert.throws(()=>S.addOwnerWithDistribution(s,{name:'غير صالح',percentage}),/نسبة/);
   assert.equal(JSON.stringify(s),before);
 }
 assert.throws(()=>S.addOwnerWithDistribution(s,{name:'ج',percentage:15}),/مكرر/);
 assert.equal(JSON.stringify(s),before);
});

test('Onboarding requires company and owner only, preserving later settings fields',async()=>{
 const source=fs.readFileSync(lifecycle,'utf8');
 assert.match(source,/ta-owner-name-153/);
 assert.match(source,/capitalSetupReminderOwnerId/);
 assert.match(source,/openCapitalFromReminder/);
 assert.match(source,/addOwnerWithDistribution/);
 if(windows)return; // Desktop lifecycle is embedded and validated by the Windows build step.
 const fields={
  'ta-company-name-128':{value:'شركة تجريبية'},
  'ta-owner-name-153':{value:'مالك الشركة'},
  'ta-company-save-128':{disabled:false},
  'ta-company-error-128':{textContent:'',style:{}},
  'ta-company-setup-128':{remove(){}}
 };
 const state=fresh(),prompts=[];
 const env={State:state,DEFAULT_PROFILE:fresh(),StorageEngine:{db:true,async saveState(){}},
   TiqanyShareholders:S,window:{},document:{getElementById:id=>fields[id]||null},
   AppNav:{renderCurrent(){}},UI:{toast(){},openModal:html=>prompts.push(html),forceCloseModal(){}},
   console,JSON,Date,Promise,setTimeout,localStorage:{clear(){}},sessionStorage:{clear(){}}};
 vm.runInNewContext(source,env);
 const lifecycleObject=env.window.CompanyLifecycle;
 lifecycleObject.stageSnapshot=async()=>{};
 await lifecycleObject.saveFirstRun();
 assert.equal(state.settings.companyName,'شركة تجريبية');
 assert.equal(state.settings.companyPhone,'');
 assert.equal(state.settings.companyAddress,'');
 assert.equal(state.settings.companySetupCompleted,true);
 assert.deepEqual(shares(state),{'مالك الشركة':100});
 assert.equal(state.shareholderOwners[0].role,'manager');
 assert.equal(state.alertCenter.entries.length,1);
 assert.equal(state.alertCenter.entries[0].type,'capital-setup');
 assert.equal(state.alertCenter.entries[0].ownerId,state.shareholderOwners[0].id);
 assert.ok(prompts[0].includes('CompanyLifecycle.openCapitalFromReminder()'));
});
