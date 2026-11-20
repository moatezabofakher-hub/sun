'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const web=fs.existsSync(path.join(root,'web/index.html'))?path.join(root,'web'):path.join(root,'app/src/main/assets/www');
const core=require(path.join(web,'static/tiqany-peer-merge.js'));
const stream=require(path.join(web,'static/tiqany-peer-stream.js'));
const controller=fs.readFileSync(path.join(web,'static/tiqany-peer-controller.js'),'utf8');
const html=fs.readFileSync(path.join(web,'index.html'),'utf8');
const uid='business_'+'1'.repeat(32), serverId='a'.repeat(32);
const copy=structuredClone;
function memory() {
  const map=new Map();
  return {get:async k=>map.get(k),put:async(k,v)=>map.set(k,copy(v)),clear:async prefix=>{
    for(const k of map.keys())if(k.startsWith(prefix+':')) map.delete(k);
  }};
}
function fixture(count) {
  const state={settings:{companyUid:uid,companyName:'اختبار الجملة',companySetupCompleted:true,exchangeRate:10000},
    items:[],invoices:[],vouchers:[],accounts:[],transfers:[],expenses:[],warehouses:[{id:'wh_main'}],fieldSync:{},alertCenter:{entries:[]}};
  const balances=[],stock=[],cash={USD:0,SYP:0}; let profitCents=0;
  for(let i=0;i<40;i++) {
    state.accounts.push({id:'customer-'+i,type:'customer',name:'حساب '+i,openingSyp:0,openingUsd:0});
    balances.push({USD:0,SYP:0});
  }
  for(let i=0;i<10;i++) {
    state.items.push({id:'item-'+i,name:'صنف '+i,currency:'USD',openingStockBase:1000000,units:[{name:'قطعة',costPrice:.5}]});stock.push(1000000);
  }
  for(let i=0;i<count;i++) {
    const a=i%40, currency=(i+Math.floor(i/40))%2?'USD':'SYP', scale=currency==='USD'?100:1;
    const factor=currency==='USD'?1:100, sign=i%11===0?-1:1;
    const date=new Date(Date.UTC(2025,0,1,0,i)).toISOString();
    let total=0;
    const rows=state.items.map((item,j)=>{
      const qty=1+(i+j)%3, cents=131+j, minor=cents*factor;
      total+=minor*qty;stock[j]-=sign*qty;profitCents+=sign*(cents-50)*qty;
      return {itemId:item.id,unitName:'قطعة',unitFactor:1,qty,price:minor/scale,total:minor*qty/scale,baseCostPrice:.5};
    });
    const paid=i%3===0?Math.floor(total/4):0;
    state.invoices.push({id:'invoice-'+i,number:i+1,date,currency,exchangeRate:10000,type:sign===1?'sale':'sale_return',
      accountId:state.accounts[a].id,paymentMethod:paid?'partial':'credit',warehouseId:'wh_main',netTotal:total/scale,paidAmount:paid/scale,rows});
    balances[a][currency]+=sign*(total-paid);cash[currency]+=sign*paid;
    if(i%5===0) {
      const received=241*factor;
      state.vouchers.push({id:'voucher-'+i,number:i+1,date,type:'receipt',accountId:state.accounts[a].id,currency,amount:received/scale});
      balances[a][currency]-=received;cash[currency]+=received;
    }
  }
  return {state,balances,stock,cash,profitCents};
}
function verifyAccounts(state,ref) {
  const start=html.indexOf('const Accounting = {'),end=html.indexOf('\n        };',start);
  assert.ok(start>0&&end>start);
  const ctx=vm.createContext({State:state,CapitalLedger:{cashMovements:()=>[]},ShareholdersCashMovements:()=>[],POSController:{isPOS:()=>false}});
  const engine=vm.runInContext(html.slice(start,end+11)+'; Accounting;',ctx);
  for(const [i,customer] of state.accounts.entries()) {
    const balance=engine.getAccountStatement(customer.id);
    assert.equal(balance.sypBalance,ref.balances[i].SYP);assert.equal(Math.round(balance.usdBalance*100),ref.balances[i].USD);
  }
  for(const [i,item] of state.items.entries()) assert.equal(engine.getItemBaseStock(item.id),ref.stock[i]);
  const box=engine.getCashboxSummary();assert.equal(box.sypCash,ref.cash.SYP);assert.equal(Math.round(box.usdCash*100),ref.cash.USD);
  const begin=html.indexOf('let salesSyp = 0'),finish=html.indexOf('const reportExpenses =',begin);
  assert.ok(begin>0&&finish>begin);
  const profit=vm.runInContext('const reportInvoices=State.invoices;'+html.slice(begin,finish)+';estimatedProfitUsd',ctx);
  assert.equal(Math.round(profit*100),ref.profitCents);
}
function desktop(state,store,reply) {
  const win={TiqanyPeerMerge:core,WindowsPeerSync:{reply}};
  const profile={activeId:'desktop',getRecord:async id=>({data:await store.get(id)}),putBatch:async rows=>{
    for(const row of rows)await store.put(row.id,row.data);
  },makeCheckpoint:async()=>{}};
  const context={State:state,window:win,document:{getElementById:()=>null,createElement:()=>({}),head:{append(){}}},ProfileManager:profile,WindowsPeerSync:win.WindowsPeerSync,
    StorageEngine:{saveState:async()=>{}},Views:{renderSettings(){}},AppNav:{current:()=>({screen:'dashboard'}),renderCurrent(){}},UI:{toast(){}},
    Date,console,setTimeout,clearTimeout,setInterval,clearInterval};
  vm.runInNewContext(controller,context);
  const peer=win.TiqanyPeerSync;
  peer.server={serverId};peer.message=()=>{};peer.updatePresence=()=>{};peer.renderConflictButton=()=>{};peer.recovered=()=>{};
  stream.install(peer,{core,store,profile:()=>profile.activeId,send:()=>{},reply,locked:()=>false});
  return peer;
}
const request={action:'fetch',phoneProfileId:'phone',phoneCompanyUid:uid,phoneEmpty:false,knownServerId:serverId,knownServerProfileId:'desktop'};
function client(store,call) {
  const peer={handleRequest(){}};
  stream.install(peer,{core,store,profile:()=>'phone',send:call,reply:()=>{},locked:()=>false});return peer;
}
function commit(f,snapshot) {return {action:'commit',ticket:f.ticket,profileId:'desktop',serverId,phoneCompanyUid:uid,snapshot,resolvedReceipts:[],explicitApprovals:[]};}
function pair(state) {
  const disk=memory(),phoneDisk=memory();
  let reply,pc;
  const result={stats:{},fault:null,restart(){
    pc=desktop(state,disk,(_id,value)=>{reply=value;});result.client=client(phoneDisk,result.send);
  },send:async m=>{
    if(m.action==='probe')return {ok:true,streamVersion:2,serverId};
    const data={...m,appVersion:'3.5.157'};
    const k=data.step;result.stats[k]=(result.stats[k]||0)+1;
    await pc.handleRequest({requestId:'req',data});
    if(result.fault) await result.fault(data,reply);
    return reply;
  }};
  result.restart();return result;
}
test('20,000 invoices, 200,000 rows and 4,000 vouchers: interrupted download, reopened apps and incremental changes',async()=>{
  const f=fixture(20000),local=f.state,conn=pair(local);
  const snapshot=core.snapshot(local);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot))>12000000);
  conn.fault=(m)=>{if(m.step==='read' && m.i===5)throw Error('network offline');};
  await assert.rejects(conn.client.call(request),/offline/);
  conn.fault=null;conn.stats={};conn.restart();
  const received=await conn.client.call(request);
  assert.deepEqual(received.snapshot,snapshot);
  assert.ok(conn.stats.read>100);
  const pagesOnResume=conn.stats.read;
  const checkedState={settings:{}};core.apply(checkedState,received.snapshot);
  verifyAccounts(checkedState,f);
  assert.equal((await conn.client.call(commit(received,received.snapshot))).ok,true);
  const saved={profileId:'phone',serverId,serverProfileId:'desktop',snapshot:received.snapshot};
  const original=local.invoices[71];
  local.invoices[71]={...original,paidAmount:1.5};
  local.vouchers.splice(10,1);
  local.invoices.push({...original,id:'late-sale',number:20001});
  conn.stats={};conn.restart();
  const changed=await conn.client.call(request,saved);
  assert.equal(conn.stats.read,1);assert.ok(pagesOnResume>conn.stats.read);
  assert.equal(changed.snapshot.invoices.length,20001);assert.equal(changed.snapshot.invoices[71].paidAmount,1.5);
  assert.equal(changed.snapshot.vouchers.some(v=>v.id==='voucher-50'),false);
  assert.deepEqual(changed.snapshot,core.snapshot(local));
});
test('interrupted first upload resumes after restarting both ends; lost final ACK and replay post once',async()=>{
  const small=fixture(1).state,full=core.snapshot(fixture(20000).state), conn=pair(small);
  let f=await conn.client.call(request);const initial=core.snapshot(small);
  conn.fault=(m)=>{if(m.step==='write' && m.i===7)throw Error('offline');};
  await assert.rejects(conn.client.call(commit(f,full)),/offline/);assert.deepEqual(core.snapshot(small),initial);
  conn.restart();conn.stats={};const indices=[];let finish;
  conn.fault=(m)=>{if(m.step==='write')indices.push(m.i);if(m.step==='finish'){finish=m;throw Error('lost ACK');}};
  f=await conn.client.call(request);await assert.rejects(conn.client.call(commit(f,full)),/lost ACK/);
  assert.equal(indices[0],8);assert.equal(small.invoices.length,20000);assert.equal(small.vouchers.length,4000);
  conn.fault=null;conn.restart();assert.equal((await conn.send(finish)).ok,true);
  assert.deepEqual(core.snapshot(small),full);
});
test('concurrent device edits, deletion, corrupt pages, wrong company and a disk write failure',async()=>{
  const f=fixture(35),conn=pair(f.state),base=core.snapshot(f.state);
  const received=await conn.client.call(request);
  const phone=copy(base);phone.invoices[0].paidAmount=7;
  f.state.invoices[0].paidAmount=8;
  await assert.rejects(conn.client.call(commit(received,phone)),/تغير|تغيّر/);
  assert.equal(f.state.invoices[0].paidAmount,8);
  const latest=await conn.client.call(request);
  const conflict=core.merge(base,phone,latest.snapshot);
  assert.equal(conflict.ok,false);assert.ok(conflict.details.some(d=>d.collection==='invoices'));
  const added=copy(base);added.invoices.push({...added.invoices[0],id:'phone-offline',number:100});
  const resolved=core.merge(base,added,latest.snapshot);
  assert.equal(resolved.ok,true);assert.equal(resolved.snapshot.invoices.filter(i=>i.id==='phone-offline').length,1);
  const wrong=await conn.send({action:'stream',step:'read',ticket:latest.ticket,profileId:'desktop',phoneProfileId:'other',phoneCompanyUid:uid,serverId,i:0});
  assert.equal(wrong.ok,false);
  const storage=memory();const batch=await stream.pages({sample:'شركة'});
  await assert.rejects(stream.stage(storage,'x',batch.hashes,0,'bad data'));
  await assert.rejects(stream.readPages(storage,'x',batch.hashes));
  storage.put=async()=>{throw Error('disk full');};
  await assert.rejects(stream.stage(storage,'x',batch.hashes,0,batch.parts[0]),/disk full/);
});
test('reordering and long Arabic/Unicode records round-trip on bounded pages',async()=>{
  const data=fixture(5).state,base=core.snapshot(data),next=copy(base);
  next.invoices.reverse();next.invoices[1].note='مواد🧴'.repeat(50000);
  const hash=await stream.fingerprint(core,base),delta=await stream.pack(core,base,next,hash);
  assert.equal(delta.patch.invoices.changed.length,1);
  const doc=await stream.pages(delta),store=memory();
  assert.ok(doc.parts.length>1);
  for(const part of doc.parts)assert.ok(Buffer.byteLength(JSON.stringify({text:part}))<600000);
  const decoded=await stream.readPages(store,'cache',doc.hashes,i=>doc.parts[i]);
  assert.deepEqual(await stream.unpack(core,base,hash,decoded),next);
});
test('normal phone sync keeps an invoice created during transfer and posts it on the following sync',async()=>{
  const state=fixture(50).state,pcState=copy(state),conn=pair(pcState),storage=memory();
  const android={status:()=>JSON.stringify({host:'localhost',port:39271,approved:true,serverId}),approve(){},bindServerId:()=>true};
  const win={TiqanyPeerMerge:core,AndroidPeerSync:android,confirm:()=>true};
  const profile={activeId:'phone',getRecord:async id=>({data:await storage.get(id)}),putBatch:async rows=>{
    for(const r of rows)await storage.put(r.id,r.data);
  },makeCheckpoint:async()=>{}};
  const ctx={State:state,window:win,AndroidPeerSync:android,ProfileManager:profile,StorageEngine:{saveState:async()=>{}},
    Views:{renderSettings(){}},AppNav:{current:()=>({screen:'dashboard'}),renderCurrent(){}},UI:{toast(){}},
    document:{getElementById:()=>null,createElement:()=>({}),head:{append(){}}},console,Date,setTimeout,clearTimeout,setInterval,clearInterval};
  vm.runInNewContext(controller,ctx);
  const phone=win.TiqanyPeerSync;let lastError='';
  phone.message=(s,err)=>{if(err)lastError=s;};phone.renderConflictButton=()=>{};phone.renderConnection=()=>{};
  phone.recovered=()=>{};phone.updatePresence=()=>{};phone.outage=async()=>{};
  stream.install(phone,{core,store:storage,profile:()=>profile.activeId,send:conn.send,reply:()=>{},locked:()=>false});
  await phone.saveBase(serverId,'desktop',core.snapshot(state));
  conn.fault=(m)=>{if(m.step==='read'){
    state.invoices.push({...copy(state.invoices[0]),id:'while-syncing',number:51});conn.fault=null;
  }};
  assert.equal(await phone.sync(false),false);
  assert.equal(pcState.invoices.length,50);assert.equal(state.invoices.length,51);
  assert.equal(await phone.sync(false),true,lastError);
  assert.equal(await phone.sync(false),true,lastError);
  assert.equal(pcState.invoices.filter(i=>i.id==='while-syncing').length,1);
  assert.equal(state.invoices.length,51);
});
test('combined offline sales preserve the negative-stock conflict for a bundle component',()=>{
  const base=core.snapshot(fixture(0).state);
  base.items=[{id:'component',openingStockBase:3},{id:'box',isBundle:true,bundleComponents:[{itemId:'component',quantity:2}]}];
  const local=copy(base),remote=copy(base);
  for(const [i,side] of [local,remote].entries())side.invoices=[{id:'s'+i,number:i+1,type:'sale',rows:[{itemId:'box',qty:1}]}];
  const result=core.merge(base,local,remote);
  assert.equal(result.ok,false);assert.ok(result.details.some(d=>d.kind==='inventory'));
});
if(fs.existsSync(path.join(root,'src/peer-lan-server.js'))) {
  test('real Windows TCP listener carries the large initial ledger, then one changed record',async()=>{
    const net=require('node:net'),os=require('node:os'),{PeerLanServer,encode,decode}=require(path.join(root,'src/peer-lan-server.js'));
    const state=fixture(20000).state,disk=memory(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tiqany-stream-'));
    const server=new PeerLanServer({userData:tmp,vault:{protectSecret:()=> 'test-vault'}});
    const pc=desktop(state,disk,(id,v)=>server.reply(id,v));pc.server={serverId:server.id};
    server.onRequest=req=>pc.handleRequest(req);
    const listener=net.createServer(s=>server.handle(s));
    await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
    try {
      const port=listener.address().port;let transfers=0;
      const send=m=>new Promise((resolve,reject)=>{
        const sock=net.connect(port,'127.0.0.1'),chunks=[];
        const input=encode(server.key,{protocol:'TIQANY-PEER-1',appVersion:'3.5.157',...m});
        assert.ok(input.length<600000);
        sock.once('connect',()=>sock.write(input));sock.on('error',reject);
        sock.on('data',x=>chunks.push(x));sock.on('end',()=>{
          try {const frame=Buffer.concat(chunks);assert.ok(frame.length<600000);assert.equal(frame.readUInt32BE(),frame.length-4);
            if(m.step==='read')transfers++;resolve(decode(server.key,frame.subarray(4)));}catch(e){reject(e);}
        });
      });
      const phone=client(memory(),send),req={...request,knownServerId:server.id};
      const first=await phone.call(req);
      assert.equal(first.snapshot.invoices.length,20000);assert.equal(first.snapshot.vouchers.length,4000);assert.ok(transfers>100);
      const update={...commit(first,first.snapshot),serverId:server.id};assert.equal((await phone.call(update)).ok,true);
      state.vouchers[0].amount=35;transfers=0;
      const delta=await phone.call(req,{profileId:'phone',serverId:server.id,serverProfileId:'desktop',snapshot:first.snapshot});
      assert.equal(delta.snapshot.vouchers[0].amount,35);assert.equal(transfers,1);
    } finally {
      for(const socket of server.sockets)socket.destroy();
      await new Promise(resolve=>listener.close(resolve));fs.rmSync(tmp,{recursive:true,force:true});
    }
  });
}

test('two manager profiles at the same millisecond keep independent documents through Windows commit and replay',async()=>{
  const field=require(path.join(web,'static/field-protocol.js'));
  class SameTime extends Date {
    constructor(...args){super(...(args.length?args:[SameTime.now()]));}
    static now(){return 1790000000000;}
  }
  const windowsState=fixture(2).state, shared=core.snapshot(windowsState);
  // Old records, remote event targets and their account references must survive intact.
  const legacy=shared.invoices[0].id;
  const replies=new Map(),issued=new Set();
  const pc=desktop(windowsState,memory(),(id,v)=>replies.get(id)(v));
  let seq=0;
  function send(m){
    if(m.action==='probe')return Promise.resolve({ok:true,streamVersion:2,serverId});
    const id=++seq;
    return new Promise((resolve,reject)=>{
      replies.set(id,v=>{replies.delete(id);resolve(v);});
      pc.handleRequest({requestId:id,data:{...m,appVersion:'3.5.157'}}).catch(reject);
    });
  }
  function editor(ctx,name){
    const first=html.indexOf('const '+name+' = {'),last=html.indexOf('\n        };',first);
    assert.ok(first>=0 && last>first);
    return vm.runInContext(html.slice(first,last+11)+';'+name,ctx);
  }
  function manager(id){
    const state=copy(windowsState),peer={handleRequest(){}};
    stream.install(peer,{core,store:memory(),profile:()=>id,send,reply(){},locked:()=>false});
    const ctx=vm.createContext({Date:SameTime,State:state,FieldProtocol:field,
      CurrencyCatalog:{primary:()=>'USD'},Accounting:{getInvoiceTypeAr:()=>''},
      UI:{openModal(){},setHeader(){}},AppNav:{current:()=>({screen:'home'}),enableOperationGuard(){}},
      document:{getElementById:()=>null}});
    const inv=editor(ctx,'InvoiceController'),vch=editor(ctx,'VoucherController');
    inv.paintForm=()=>{};vch.paintVoucherForm=()=>{};
    inv.renderForm(null,{id:legacy});assert.equal(inv.draft.id,legacy);
    inv.renderForm(null,{type:'sale'});
    const invoice={...copy(state.invoices[1]),id:inv.draft.id,number:inv.draft.number};
    vch.renderForm(null,{type:'receipt'});
    const voucher={...copy(state.vouchers[0]),id:vch.draft.id,number:vch.draft.number};
    vch.openAccountVoucherModal('receipt',voucher.accountId);
    assert.notEqual(vch.draft.id,voucher.id);
    for(let i=0;i<5000;i++){
      inv.renderForm(null,{type:'sale'}); vch.renderForm(null,{type:'receipt'});
      for(const generated of [inv.draft.id,vch.draft.id]){
        assert.ok(!issued.has(generated),'a frozen-clock ID was reused');issued.add(generated);
      }
    }
    state.invoices.push(invoice);state.vouchers.push(voucher);
    let base=copy(shared);
    return {invoice,voucher,async prepare(){
      const f=await peer.call({...request,phoneProfileId:id},{profileId:id,serverId,serverProfileId:'desktop',snapshot:base});
      const merged=core.merge(base,core.snapshot(state),f.snapshot);assert.equal(merged.ok,true);
      return async()=>{await peer.call(commit(f,merged.snapshot));core.apply(state,merged.snapshot);base=merged.snapshot;};
    }};
  }
  const a=manager('phone-a'),b=manager('phone-b');
  for(const name of ['invoice','voucher']){
    assert.equal(a[name].number,b[name].number);
    assert.match(a[name].id,name==='invoice'?/^inv_[0-9a-f]{32}$/:/^vch_[0-9a-f]{32}$/);
    assert.notEqual(a[name].id,b[name].id);
  }
  const commitA=await a.prepare(),staleB=await b.prepare();
  await commitA();await assert.rejects(staleB,/تغير|تغيّر/);
  await (await b.prepare())();await (await a.prepare())();await (await b.prepare())();
  for(const [key,name] of [['invoices','invoice'],['vouchers','voucher']]){
    const docs=windowsState[key];assert.equal(docs.length,shared[key].length+2);
    for(const phone of [a,b])assert.equal(docs.filter(x=>x.id===phone[name].id).length,1);
    assert.equal(new Set(docs.map(x=>x.number)).size,docs.length);
  }
  assert.deepEqual(windowsState.invoices.find(d=>d.id===legacy),shared.invoices[0]);
});
