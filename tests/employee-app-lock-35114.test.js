'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const auth=require('../field_agent/src/main/assets/www/static/employee-password-auth.js');
const code=fs.readFileSync(path.join(__dirname,'../field_agent/src/main/assets/www/static/employee-password-lock.js'),'utf8');
function fakeDom(){
 const nodes=new Map(),handlers=new Map();let inner='',pin='',hidden=false;
 const classes=new Set();
 const body={classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},appendChild(el){nodes.set(el.id,el)}};
 const chrome=['screen','bottom','agentHeader'];
 for(const id of chrome)nodes.set(id,{id,inert:false});
 const input={value:'',focus(){},setAttribute(){}};
 const button={disabled:false},error={textContent:''};
 const form={addEventListener(type,fn){handlers.set(type,fn)}};
 const document={body,head:{appendChild(){}},hidden:false,createElement(tag){
   if(tag==='style')return {textContent:''};
   const el={id:'',role:'',setAttribute(){},remove(){nodes.delete(this.id)},querySelector(s){return s==='form'?form:s==='input'?input:null}};
   Object.defineProperty(el,'innerHTML',{get(){return inner},set(v){inner=v}});
   return el;
  },getElementById(id){return ({'ta-employee-login-pin':input,'ta-employee-login-button':button,'ta-employee-lock-error':error})[id]||nodes.get(id)||null},addEventListener(name,fn){handlers.set(name,fn)}};
 return {document,input,button,error,nodes,handlers,classes};
}
function fixture(credential){
 const dom=fakeDom();let rendered=0,saved=0;
 const Agent={state:{employeeAuth:credential},screen:'home',escape:s=>String(s),async show(){rendered++},async save(){saved++}};
 const context={Agent,document:dom.document,window:{addEventListener(){}},TiqanyEmployeeAuth:auth,Date};
 vm.runInNewContext(code,context);
 return {...dom,Agent,get rendered(){return rendered},get saved(){return saved}};
}
test('Employee screens remain covered until manager-issued password verifies, and reset relocks',async()=>{
 const old={...await auth.create('employee-first-pass'),version:1};
 const fresh={...await auth.create('employee-second-pass'),version:2};
 const x=fixture(old);
 await x.Agent.show('home');
 assert.equal(x.rendered,0);
 assert.ok(x.nodes.has('ta-employee-lock'));
 assert.equal(x.classes.has('ta-employee-locked'),true);
 x.input.value='incorrect';await x.handlers.get('submit')({preventDefault(){}});
 assert.equal(x.rendered,0);assert.match(x.error.textContent,/غير صحيحة/);
 x.input.value='employee-first-pass';await x.handlers.get('submit')({preventDefault(){}});
 assert.equal(x.rendered,1);assert.equal(x.nodes.has('ta-employee-lock'),false);
 x.Agent.state.employeeAuth=fresh;
 await x.Agent.save();
 assert.equal(x.nodes.has('ta-employee-lock'),true);
 assert.equal(x.Agent.screen,'home');
 x.input.value='employee-second-pass';await x.handlers.get('submit')({preventDefault(){}});
 assert.equal(x.rendered,2);assert.equal(x.nodes.has('ta-employee-lock'),false);
 x.document.hidden=true;
 x.handlers.get('visibilitychange')();
 x.document.hidden=false;
 x.handlers.get('visibilitychange')();
 assert.equal(x.nodes.has('ta-employee-lock'),true,'returning from background requires password');
});
