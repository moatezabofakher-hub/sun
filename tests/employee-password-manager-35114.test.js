'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {webcrypto}=require('node:crypto');
const auth=require('../app/src/main/assets/www/static/employee-password-auth.js');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/static/field-main.js'),'utf8');
function fixture(){
 const employee={id:'agent_abc',name:'موظف البيع',vehicleName:'سيارة 1',warehouseId:'w1',key:'some-key',permissions:{}};
 const elements={editFieldAgentName:'موظف البيع',editFieldAgentVehicle:'سيارة 1',editFieldEmployeePassword:'',editFieldEmployeeConfirm:'',editFieldManagerApprovalPin:''};
 const events=[];let saves=0;
 const ctx={
  TiqanyEmployeeAuth:auth,crypto:webcrypto,TextEncoder,btoa,atob,
  State:{fieldSync:{companyId:'company_abc',agents:[employee],imported:[],events:[]},settings:{companyName:'شركة',exchangeRate:14500,appProtection:{pinHash:'hash'}},accounts:[],warehouses:[],categories:[],items:[]},
  UI:{toast:(message,type)=>events.push({message,type}),openModal:html=>events.push({html})},
  document:{readyState:'loading',addEventListener(){},getElementById:id=>({value:elements[id]??''}),querySelector:()=>({value:'all'}),querySelectorAll:()=>[]},
  StorageEngine:{async saveState(){saves++}},ProtectionController:{async verifyPin(pin){return pin==='manager-secret'}},
  Accounting:{getAccountStatement(){return {sypBalance:0,usdBalance:0}},getItemBaseStock(){return 0}},
  WarehouseController:{name(){return 'سيارة 1'}},FieldProtocol:{uuid(){return 'abcdefgh'},FORMAT:'TA_FIELD_SYNC_1'},
  AppEscape:{text:x=>x},FieldCash:{summary(){return {sypCash:0,usdCash:0}}},window:{},
  setInterval,clearInterval,setTimeout,clearTimeout,Date,Number,Math,Array,Object,Map,Set,Promise,JSON,
 };
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {f:vm.runInContext('FieldSync',ctx),employee,elements,events,get saves(){return saves}};
}
test('Only manager can set and rotate staff password; never reuse the manager PIN',async()=>{
 const x=fixture();
 await x.f.saveAgentEdit('agent_abc');
 assert.equal(x.saves,0);
 x.elements.editFieldEmployeePassword='employee-secret';x.elements.editFieldEmployeeConfirm='wrong';
 await x.f.saveAgentEdit('agent_abc');assert.equal(x.saves,0);
 x.elements.editFieldEmployeeConfirm='employee-secret';
 await x.f.saveAgentEdit('agent_abc');assert.equal(x.saves,0,'manager approval required');
 x.elements.editFieldManagerApprovalPin='manager-secret';
 x.elements.editFieldEmployeePassword=x.elements.editFieldEmployeeConfirm='manager-secret';
 await x.f.saveAgentEdit('agent_abc');assert.equal(x.saves,0,'same master secret rejected');
 x.elements.editFieldEmployeePassword=x.elements.editFieldEmployeeConfirm='employee-secret';
 await x.f.saveAgentEdit('agent_abc');
 assert.equal(x.saves,1);
 assert.equal(x.employee.employeeAuth.version,1);
 assert.equal(await auth.verify('employee-secret',x.employee.employeeAuth),true);
 assert.equal(JSON.stringify(x.employee).includes('employee-secret'),false);
 const catalog=x.f.catalog(x.employee);
 assert.equal(catalog.employeeAuth.hash,x.employee.employeeAuth.hash);
 assert.equal(catalog.companyName,'شركة');
 x.elements.editFieldEmployeePassword=x.elements.editFieldEmployeeConfirm='new-employee-secret';
 await x.f.saveAgentEdit('agent_abc');
 assert.equal(x.employee.employeeAuth.version,2);
 assert.equal(await auth.verify('new-employee-secret',x.employee.employeeAuth),true);
 assert.equal(await auth.verify('employee-secret',x.employee.employeeAuth),false);
});
test('Employee credential never downgrades when an offline manager sends a stale sync',async()=>{
 const first={...await auth.create('old-employee-secret'),version:1};
 const second={...await auth.create('new-employee-secret'),version:2};
 assert.equal(auth.resolve(second,first).hash,second.hash);
 assert.equal(auth.resolve(second,null).hash,second.hash);
 assert.equal(auth.resolve(first,second).hash,second.hash);
 assert.equal(auth.resolve(null,first).hash,first.hash);
 assert.equal(auth.valid({hash:'plaintext',salt:'wrong',algo:'pbkdf2-sha256-v1'}),false);
});
