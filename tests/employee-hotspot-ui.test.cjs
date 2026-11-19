'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const dir='field_agent/src/main/assets/www/static/';
function setup(addresses) {
  const panel={replaceChildren(...items){this.items=items;}};
  const document={hidden:false,querySelector:()=>panel,getElementById:()=>null,addEventListener(){},
    createElement(){return {children:[],append(...items){this.children.push(...items);}};}};
  let last;
  const Agent={state:{},active:async()=>false,ready:()=>false,init(){},show(){},renderSetup(){return '';},
    renderActivation(){return '';},renderSync(){return '';},escape:String,save:async()=>{}};
  const window={AndroidLocalSync:{employeeLanAddresses:()=>JSON.stringify(addresses),
    setDirectEndpoint:()=> 'saved',requestPairing:(company,body)=>{ last={company,packet:JSON.parse(body)}; }}};
  const ctx=vm.createContext({Agent,window,document,FieldProtocol:{uuid:()=>'test_request'},FieldPairCrypto:{VERSION:'TA-PAIR-1',createEphemeral:async()=>({publicKey:{}})},
    setTimeout:()=>1,clearTimeout(){},URL});
  for(const path of ['agent-lan-ui.js','agent-pairing.js'])vm.runInContext(fs.readFileSync(dir+path,'utf8'),ctx);
  return {Agent,pair:window.AgentPairing,panel,get last(){return last;}};
}
test('setup, activation and sync show phone addresses separately from the QR destination',async()=>{
  const h=setup(['192.168.10.1','192.168.1.5']);
  for(const html of [h.Agent.renderSetup(),h.Agent.renderActivation(),h.Agent.renderSync()])assert.match(html,/data-agent-network/);
  await h.pair.onQrScanned('tiqany-pair://local?v=1&company=company_123456789&host=192.168.10.76&port=48371');
  await new Promise(resolve=>setImmediate(resolve));h.pair.paintNetwork();
  assert.match(h.panel.items[0].children[0],/هاتف الموظف/);
  assert.equal(h.panel.items[0].children[1].textContent,'192.168.10.1 / 192.168.1.5');
  assert.equal(h.panel.items[1].children[1].textContent,'192.168.10.76:48371');
  assert.equal(h.last.company,'company_123456789');assert.equal(h.last.packet.kind,'hello');
  await h.pair.onNetworkReply(JSON.stringify({requestId:'prior_request',error:'old failure'}));
  assert.equal(h.pair.inFlight,true);assert.doesNotMatch(h.pair.status,/old failure/);
  await h.pair.onNetworkReply(JSON.stringify({requestId:h.pair.requestId,data:JSON.stringify({kind:'pending',companyId:'company_other12345',pairingProtocol:'TA-PAIR-1',requestId:h.pair.requestId})}));
  assert.match(h.pair.status,/تغيّر التطبيق الرئيسي/);assert.equal(h.pair.sessionKey,null);
});
test('when Android hides the address, setup explains where Windows displays the phone gateway',()=>{
  const h=setup([]);h.pair.paintNetwork();
  assert.match(h.panel.items[0].textContent,/البوابة الافتراضية/);
  assert.doesNotMatch(h.panel.items[0].textContent,/192\.168/);
});
