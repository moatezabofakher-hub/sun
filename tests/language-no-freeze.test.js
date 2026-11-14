'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'..');
const sources=[['Android main',path.join(base,'app/src/main/assets/www/static/i18n.js')],['Android sales staff',path.join(base,'field_agent/src/main/assets/www/static/i18n.js')]];
for(const [name,filename] of sources){
 test(`${name}: English and Arabic switches preserve screen, save preference and do not self-trigger observer`,async()=>{
  let observer=null, active=false, observingCount=0, disconnectCount=0, translationWhileObserved=0, saves=0, redraws=0;
  let value='المواد';
  const parent={closest:()=>null};
  const node={nodeType:3,parentElement:parent,isConnected:true};
  Object.defineProperty(node,'nodeValue',{get(){return value},set(v){if(active && v!==value)translationWhileObserved++;value=v;}});
  const body={nodeType:1, isConnected:true,querySelectorAll:()=>[],hasAttribute:()=>false,closest:()=>null};
  const document={nodeType:9,documentElement:{lang:'ar',dir:'rtl'},body,title:'المحاسب التقني',createTreeWalker:()=>{let yielded=false;return {nextNode:()=>yielded?null:(yielded=true,node)}},querySelectorAll:()=>[]};
  class Observer{
    constructor(callback){this.callback=callback;observer=this;}
    observe(){active=true;observingCount++;}
    disconnect(){active=false;disconnectCount++;}
  }
  const context=vm.createContext({
    document,Node:{TEXT_NODE:3,ELEMENT_NODE:1},NodeFilter:{SHOW_TEXT:4},MutationObserver:Observer,
    State:{settings:{language:'ar'}},StorageEngine:{async saveState(){saves++;}},AppNav:{renderCurrent(){redraws++;}},
    console:{warn(){},error(){}},
  });
  vm.runInContext(fs.readFileSync(filename,'utf8'),context,{filename});
  const i18n=vm.runInContext('I18n',context);
  i18n.install();
  assert.equal(observingCount,1, 'subscribe only after initial apply');
  assert.equal(value,'المواد');
  assert.equal(await i18n.setLanguage('en'),true);
  assert.equal(value,'Items');
  assert.equal(document.documentElement.dir,'ltr');
  assert.equal(document.documentElement.lang,'en');
  assert.equal(saves,1);
  assert.equal(redraws,0,'changing language must not reconstruct current screen');
  assert.equal(translationWhileObserved,0,'translations must not trigger own mutation observer');
  // External rendering reuses an existing text node for another label.
  value='الفواتير';
  observer.callback([{type:'characterData',target:node}]);
  assert.equal(value,'Invoices','new text must not be replaced with old cached text');
  assert.equal(translationWhileObserved,0);
  assert.equal(await i18n.setLanguage('ar'),true);
  assert.equal(value,'الفواتير');
  assert.equal(document.documentElement.dir,'rtl');
  assert.equal(document.documentElement.lang,'ar');
  assert.equal(saves,2);
  assert.ok(disconnectCount>=2);
  assert.equal(translationWhileObserved,0);
  assert.equal(active,true);
  assert.equal(await i18n.setLanguage('invalid'),false);
  assert.equal(saves,2);
 });
}
