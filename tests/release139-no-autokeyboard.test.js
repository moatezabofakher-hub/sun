'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function check(projectRoot){
 const html=fs.readFileSync(path.join(projectRoot,'assets/www/index.html'),'utf8');
 const manifest=fs.readFileSync(path.join(projectRoot,'AndroidManifest.xml'),'utf8');
 const script=fs.readFileSync(path.join(projectRoot,'assets/www/static/ta-no-auto-keyboard-139.js'),'utf8');
 assert.match(html,/<script src="static\/ta-no-auto-keyboard-139\.js"><\/script>/);
 assert.match(manifest,/android:windowSoftInputMode="stateAlwaysHidden\|adjustResize"/);
 const listeners={};
 let now=1000;
 class FakeHTMLElement{
  constructor(tag,type='text'){this.tagName=tag;this.type=type;this.times=0;this.nodeType=1;}
  focus(){this.times++;return 'focused';}
  closest(){return this;}
 }
 const document={
  documentElement:{nodeType:1,hasAttribute:()=>false,querySelectorAll:()=>[]},
  addEventListener(type,cb){listeners[type]=cb;}
 };
 class FakeDate extends Date{static now(){return now;}}
 class FakeMutationObserver{observe(){}}
 vm.runInNewContext(script,{document,HTMLElement:FakeHTMLElement,
   MutationObserver:FakeMutationObserver,Date:FakeDate});
 const field=new FakeHTMLElement('INPUT');
 const search=new FakeHTMLElement('INPUT','search');
 const number=new FakeHTMLElement('INPUT','number');
 const button=new FakeHTMLElement('BUTTON');
 field.focus();search.focus();number.focus();button.focus();
 assert.equal(field.times,0,'No keyboard for auto-focused text input');
 assert.equal(search.times,0);
 assert.equal(number.times,0);
 assert.equal(button.times,1,'Normal non-editor focus still works');
 listeners.pointerdown({target:field});
 field.focus();
 assert.equal(field.times,1,'Explicit tap on input opens keyboard');
 now+=1500;
 field.focus();
 assert.equal(field.times,1,'Later programmatic focus stays blocked');
 listeners.keydown({key:'Tab'});
 search.focus();
 assert.equal(search.times,1,'Keyboard Tab navigation remains functional');
 assert.match(script,/MutationObserver/);
 assert.match(script,/removeAttribute\('autofocus'\)/);
}
test('Opening an input view does not automatically display IME; tapping or Tab works',()=>{
 check(path.join(__dirname,'../app/src/main'));
});

test('Employee mobile also keeps the keyboard closed on automatic open',()=>{
 check(path.join(__dirname,'../field_agent/src/main'));
});
