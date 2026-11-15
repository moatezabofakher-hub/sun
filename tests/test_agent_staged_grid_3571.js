'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync('field_agent/src/main/assets/www/static/agent-invoice-parity.js','utf8');
const start=src.indexOf('A.checkPendingStock=function(proposed){');
const end=src.indexOf('A.openInvoiceItemGrid=function(){',start);
assert.ok(start>0&&end>start);
const items=[
 {id:'a',name:'مادة A',units:[{name:'عبوة',factor:1}]},
 {id:'b',name:'مادة B',units:[{name:'عبوة',factor:1}]},
 {id:'kit',name:'تجميعة',units:[{name:'طقم',factor:1}],isBundle:true,bundleComponents:[{itemId:'a',quantity:2},{itemId:'b',quantity:1}]}
];
const button={textContent:'',disabled:true,setAttribute(){}};
const document={getElementById:id=>id==='agentGridApplyButton'?button:null};
let warnings=[];let shown=0,closed=0,rendered=0;
const Agent={
 state:{items},draft:[],currency:'USD',draftKind:'sale',stock:{a:4,b:3},gridPending:Object.create(null),
 remainingStockForItem(id){return this.stock[id]||0},
 toast(msg){warnings.push(msg)},renderPickerItems(){rendered++;this.updateGridCounter()},
 captureInvoiceMeta(){},closeInvoiceItemGrid(){closed++;this.gridPending=Object.create(null)},
 show(name){assert.equal(name,'invoice');shown++},unitPrice(){return 10}
};
new Function('Agent','document',`const A=Agent,round=(n)=>Math.round(n*100)/100;
${src.slice(start,end)};`)(Agent,document);
Agent.addGridItem('kit');Agent.addGridItem('kit');
assert.equal(Agent.gridPending.kit,2);
assert.equal(button.disabled,false);
assert.match(button.textContent,/إضافة \(1 صنف\)/);
Agent.addGridItem('a');
assert.equal(Agent.gridPending.a,undefined,'a is fully consumed by staged kits');
assert.equal(warnings.length,1);
Agent.addGridItem('b');
assert.equal(Agent.gridPending.b,1);
assert.match(button.textContent,/2 أصناف/);
assert.equal(Agent.draft.length,0,'No invoice mutations before confirmation');
Agent.removeGridOne('kit');
assert.equal(Agent.gridPending.kit,1);
Agent.applyInvoiceItemGrid();
assert.equal(shown,1);assert.equal(closed,1);
assert.equal(Agent.draft.find(r=>r.itemId==='kit').qty,1);
assert.equal(Agent.draft.find(r=>r.itemId==='b').qty,1);
assert.ok(Agent.draft.find(r=>r.itemId==='kit').bomComponents);
assert.equal(Object.keys(Agent.gridPending).length,0);
assert.ok(rendered>=4);
console.log('PASS sales representative: staging, counter, shared component stock, confirm, close');
