'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('field_agent/src/main/assets/www/static/agent-employee-ui-35105.js','utf8');
const html=fs.readFileSync('field_agent/src/main/assets/www/index.html','utf8');
const css=fs.readFileSync('field_agent/src/main/assets/www/static/agent-employee-ui-35105.css','utf8');
function start(){
 const input={value:'',focus(){},select(){}};
 const badge={textContent:''};
 const modal={id:'',className:'',innerHTML:'',classList:{hidden:true,remove(c){if(c==='hide')this.hidden=false;},add(c){if(c==='hide')this.hidden=true;},contains(c){return c==='hide'?this.hidden:false;}},setAttribute(){},addEventListener(){},querySelector(q){return q==='#agentQuickFxInput'?input:null;}};
 const elements={agentHeaderExchangeRate:badge,agentQuickFxInput:input};
 const doc={getElementById(id){return elements[id]||null;},createElement(){return modal;},body:{appendChild(el){elements[el.id]=el;}},addEventListener(){}};
 let saveFail=false;
 const agent={state:{exchangeRate:15000,permissions:{exchangeRate:true}},can(k){return this.state.permissions[k]===true;},requireRight(k){if(!this.can(k)){this.toast('صلاحية غير ممنوحة');return false;}return true;},renderHome(){return `<section class="panel"><h3>العمليات السريعة</h3><div class="grid"><button class="tile">مبيعات</button><button class="tile" onclick="Agent.navigate('accounts')"><span class="glyph">⚖</span><strong>أرصدة الحسابات</strong></button></div></section><section class="panel"><h3>الطباعة السريعة</h3><button>طباعة</button></section><div class="hero agent-home-welcome">أهلا</div><section class="panel"><button class="primary" type="button" onclick="Agent.openNewItemForm()">+ إضافة مادة جديدة</button><p class="tiny">المادة الجديدة تنشأ برصيد صفري</p></section>`;},renderSettings(){return `<div>معلومات</div><section class="panel" id="agentPosSettings"><h3>ضبط الفواتير — نقطة البيع</h3><input id="agentPosTier"><div><button>حفظ</button></div></section><section class="panel"><h3>إعدادات الطباعة</h3></section>`;},async show(){return true;},async goBack(){this.backCount=(this.backCount||0)+1;},async save(){if(saveFail)throw Error('تعذر الحفظ');},toast(msg){this.lastToast=msg;}};
 const context={Agent:agent,document:doc,Number,String,Error};vm.runInNewContext(source,context);
 return {agent,doc,modal,badge,input,fail:()=>{saveFail=true;}};
}
test('header replaces printer shortcut with compact manager-like FX badge',()=>{
 assert(!html.includes('id="agentPrinterQuick"'));
 assert(html.includes('id="agentRateQuick"'));
 assert(html.includes('onclick="Agent.openQuickExchangeRate()"'));
 assert(css.includes('background:linear-gradient(145deg,#283c50,#111e30)'));
 assert(html.includes('static/agent-employee-ui-35105.js'));
});
test('home moves authorized new-item tile next to account balances, hides print shortcut',()=>{
 const {agent}=start();let view=agent.renderHome();
 assert(!view.includes('الطباعة السريعة'));
 const first=view.indexOf('أرصدة الحسابات'),second=view.indexOf('إضافة مادة جديدة');
 assert(first>=0&&second>first&&second-first<260,'new item must follow account tile');
 assert.equal((view.match(/إضافة مادة جديدة/g)||[]).length,1);
 agent.renderHome=agent.renderHome.bind(agent);
});
test('employee settings omit invoice/POS settings without removing printer settings',()=>{
 const {agent}=start();const view=agent.renderSettings();
 assert(!view.includes('agentPosSettings'));
 assert(!view.includes('ضبط الفواتير — نقطة البيع'));
 assert(view.includes('إعدادات الطباعة'));
});
test('rate requires manager permission and updates label only after successful save',async()=>{
 const {agent,modal,input,badge}=start();agent.refreshQuickExchangeRate();assert.equal(badge.textContent,'15,000');
 agent.state.permissions.exchangeRate=false;agent.openQuickExchangeRate();assert(modal.classList.hidden);
 agent.state.permissions.exchangeRate=true;agent.openQuickExchangeRate();assert(!modal.classList.hidden);assert.equal(input.value,'15000');
 input.value='17500';assert.equal(await agent.saveQuickExchangeRate(),true);
 assert.equal(agent.state.exchangeRate,17500);assert.equal(agent.state.exchangeRateOverride,17500);assert.equal(badge.textContent,'17,500');assert(modal.classList.hidden);
});
test('invalid rate rejected; database failure restores previous exchange rate and keeps dialog open',async()=>{
 const {agent,modal,input,fail}=start();agent.openQuickExchangeRate();
 input.value='0';assert.equal(await agent.saveQuickExchangeRate(),false);assert.equal(agent.state.exchangeRate,15000);
 input.value='20000';fail();assert.equal(await agent.saveQuickExchangeRate(),false);assert.equal(agent.state.exchangeRate,15000);
 assert(modal.classList.hidden===false);
 await agent.goBack();assert(modal.classList.hidden);assert.equal(agent.backCount,undefined);
 await agent.goBack();assert.equal(agent.backCount,1);
});
