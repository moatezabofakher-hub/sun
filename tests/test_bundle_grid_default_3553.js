'use strict';
const fs=require('fs'),assert=require('node:assert/strict');
const main=fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const mainCss=fs.readFileSync('app/src/main/assets/www/static/glossy-ui-3549.css','utf8');
const fieldCss=fs.readFileSync('field_agent/src/main/assets/www/static/glossy-ui-3549.css','utf8');
const sync=fs.readFileSync('app/src/main/assets/www/static/field-main.js','utf8');
const agent=fs.readFileSync('field_agent/src/main/assets/www/static/agent-invoice-parity.js','utf8');
const agentState=fs.readFileSync('field_agent/src/main/assets/www/static/agent.js','utf8');
assert.match(main,/id="itmBundlePicker"/);
assert.match(main,/id="itmBundlePickerGrid" class="grid grid-cols-2 sm:grid-cols-3/);
assert.match(main,/id="itmBundlePickerSearch"/);
assert.match(main,/id="itmBundlePickerCategory"/);
assert.match(mainCss,/\.ta-bundle-grid-card\.is-picked/);
assert.match(mainCss,/\.ta-bundle-picker-toggle/);
assert.match(fieldCss,/\.ta-field-icon-button/);
assert.match(main,/id="setDefaultPriceTier"/);
assert.match(main,/حسب الإعدادات \(الافتراضي\)/);
assert.match(sync,/defaultPriceTier:/);
assert.match(agent,/this\.state\.defaultPriceTier/);
assert.match(agentState,/defaultPriceTier/);
const first=main.indexOf('            addBundleLine(){');
const last=main.indexOf('            updateBundlePricing(',first);
assert(first>=0&&last>first);
const elements={};
function E(id,props={}){elements[id]={id,innerHTML:'',value:'',classList:{hidden:true,contains(x){return this.hidden;},toggle(_,hide){this.hidden=hide}},setAttribute(k,v){this[k]=v},focus(){},...props};return elements[id]}
E('itmBundlePicker');E('itmBundlePickerToggle');E('itmBundlePickerSearch');E('itmBundlePickerCategory');E('itmBundlePickerGrid');E('itmBundleLines');E('itmBundleSelectedCount');
const document={getElementById(id){return elements[id]||null},querySelector(){return {focus(){},select(){}}}};
const State={items:[
 {id:'a',name:'صابون',category:'منظفات',barcode:'001',photoData:'',units:[{name:'حبة'}]},
 {id:'b',name:'ليمون',category:'عطور',barcode:'002',photoData:'',units:[{name:'حبة'}]},
 {id:'c',name:'مجموعة',category:'أخرى',isBundle:true},
 {id:'kit',name:'الطقم',category:'أخرى',isBundle:true}
]};
const AppEscape={text:x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')};
const UI={toast(){throw new Error('Unexpected toast')}};
const Accounting={parseNum:Number};
const bundleFns=main.slice(first,last);
const C=new Function('State','document','AppEscape','UI','Accounting',`return ({activeEditId:'kit',tempBundle:[],dirty:0,safePhotoData(){return ''},markItemDirty(){this.dirty++},updateBundlePricing(){},${bundleFns}});`)(State,document,AppEscape,UI,Accounting);
C.addBundleLine();
assert.equal(elements.itmBundlePicker.classList.hidden,false);
assert.match(elements.itmBundlePickerGrid.innerHTML,/صابون/);
assert.match(elements.itmBundlePickerGrid.innerHTML,/ليمون/);
assert(!elements.itmBundlePickerGrid.innerHTML.includes('مجموعة'),'Nested bundle cannot be selected');
C.pickBundleComponent('a');
assert.equal(C.tempBundle.length,1);assert.equal(C.tempBundle[0].quantity,1);
assert.match(elements.itmBundleLines.innerHTML,/صابون/);
assert.match(elements.itmBundlePickerGrid.innerHTML,/مضافة/);
C.pickBundleComponent('a');assert.equal(C.tempBundle.length,1,'Duplicate click must not repeat ingredient');
C.bundleLineUpdate(0,'quantity','2.5');assert.equal(C.tempBundle[0].quantity,2.5);
C.pickBundleComponent('b');assert.equal(C.tempBundle.length,2);
C.bundleLineRemove(0);assert.deepEqual(C.tempBundle.map(x=>x.itemId),['b']);
elements.itmBundlePickerSearch.value='001';C.renderBundlePickerGrid();assert(elements.itmBundlePickerGrid.innerHTML.includes('صابون'));assert(!elements.itmBundlePickerGrid.innerHTML.includes('ليمون'));
elements.itmBundlePickerSearch.value='';elements.itmBundlePickerCategory.value='1';C.renderBundlePickerGrid();assert.equal(elements.itmBundlePickerCategory.value,'1');
C.addBundleLine();assert.equal(elements.itmBundlePicker.classList.hidden,true);
// pricing: default applies only to accounts that do not have a fixed price tier
const start=main.indexOf('itemCostPrice(item,unit) {'), end=main.indexOf('// Double-Entry Account Statement',start);
const pricingState={items:[],accounts:[{id:'s',priceTier:'settings'},{id:'w',priceTier:'wholesale'},{id:'c',priceTier:'consumer'},{id:'old'}],settings:{exchangeRate:1,defaultPriceTier:'center'}};
const calc=new Function('State',`return ({convert(v){return Number(v)},roundDerivedItemPrice(v){return Number(v)},${main.slice(start,end).trim()}});`)(pricingState);
const item={id:'it',currency:'USD',units:[{costPrice:2,salePrice:4,centerPrice:5,consumerPrice:7}]};
assert.equal(calc.itemSalePrice(item,item.units[0],'s'),5);
assert.equal(calc.itemSalePrice(item,item.units[0],'old'),5);
assert.equal(calc.itemSalePrice(item,item.units[0],'w'),4);
assert.equal(calc.itemSalePrice(item,item.units[0],'c'),7);
pricingState.settings.defaultPriceTier='consumer';
assert.equal(calc.itemSalePrice(item,item.units[0],'s'),7);
assert.equal(calc.itemSalePrice(item,item.units[0],'w'),4,'Explicit wholesale is unchanged');
console.log('PASS bundle ingredient grid selection, search, quantity editing, avoiding duplicates, and default versus fixed pricing');
