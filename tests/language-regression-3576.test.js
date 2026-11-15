'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const sources=[['Main Android',path.resolve(__dirname,'../app/src/main/assets/www/static/i18n.js')]];
for(const [label,filename] of sources){
 test(`${label}: repeated language toggling, live rendering, settings draft and all core labels`,async()=>{
  let value='موظف البيع', watching=false, recursiveWrites=0, observer, saves=0, staged=0;
  const parent={closest(){return null}};
  const textNode={nodeType:3,parentElement:parent,isConnected:true};
  Object.defineProperty(textNode,'nodeValue',{get(){return value},set(v){if(watching)recursiveWrites++;value=v;}});
  const attrs={'title':'موظف البيع','placeholder':'ابحث عن مادة...','aria-label':'سند القبض'};
  const element={nodeType:1,isConnected:true,closest(){return null},hasAttribute(a){return a in attrs},getAttribute(a){return attrs[a]},setAttribute(a,v){attrs[a]=v}};
  const option={textContent:'العربية'};
  const body={nodeType:1,isConnected:true,querySelectorAll(){return[element]},closest(){return null}};
  const document={nodeType:9,body,documentElement:{lang:'ar',dir:'rtl'},title:'',querySelectorAll(){return[element]},querySelector(s){return s.includes('value="ar"')?option:null},createTreeWalker(){let returned=false;return{nextNode(){if(returned)return null;returned=true;return textNode}}}};
  class Observer{constructor(cb){this.cb=cb;observer=this}observe(){watching=true}disconnect(){watching=false}}
  const state={settings:{language:'ar'}};
  const context=vm.createContext({document,Node:{TEXT_NODE:3,ELEMENT_NODE:1},NodeFilter:{SHOW_TEXT:4},MutationObserver:Observer,State:state,StorageEngine:{async saveState(){saves++}},window:{TiqanySettingsDraft:{isActive(){return true}}},console});
  vm.runInContext(fs.readFileSync(filename,'utf8'),context,{filename});
  const i=vm.runInContext('I18n',context);i.install();
  for(let n=0;n<30;n++){
   value='موظف البيع';
   assert.equal(await i.setLanguage('en'),true);
   assert.equal(textNode.nodeValue,'Sales representative');
   assert.equal(attrs.title,'Sales representative');
   assert.equal(attrs['aria-label'],'Receipt voucher');
   assert.equal(option.textContent,'Arabic');
   assert.equal(document.documentElement.dir,'ltr');
   const newLabel=n%2?'الفواتير':'المواد';
   value=newLabel;observer.cb([{type:'characterData',target:textNode}]);
   assert.equal(textNode.nodeValue,n%2?'Invoices':'Items');
   assert.equal(await i.setLanguage('ar'),true);
   assert.equal(textNode.nodeValue,newLabel);
   assert.equal(attrs.title,'موظف البيع');
   assert.equal(option.textContent,'العربية');
  }
  assert.equal(recursiveWrites,0,'translation should pause observer');
  assert.equal(saves,0,'Draft language changes should not persist before Save');
  for(const label of ['موظف البيع','نقطة البيع','سند القبض','سند الدفع','فاتورة المبيعات','فاتورة المشتريات','تقرير المواد','تقرير الديون','إلغاء','حفظ','المستودعات']){
   const translated=i.translate(label);
   assert.ok(translated&&!/[\u0600-\u06ff]/.test(translated),label);
  }
  assert.equal(i.translate('100 متبقية'),'100 remaining');
 });
}
