'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/www/index.html'),'utf8');
const between=(start,end)=>{
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert.ok(a>0&&b>a,`method not found ${start}`);
 return html.slice(a,b).trim();
};
const impl=between('renderItemGridCards() {','            changeInvoiceAccount(accountId){');
const State={categories:['العناية'],items:[
 {id:'a',name:'شامبو',category:'العناية',currency:'USD',barcode:'123',units:[{name:'عبوة',factor:1,salePrice:10,costPrice:7}]},
 {id:'b',name:'صابون',category:'العناية',currency:'USD',barcode:'124',units:[{name:'عبوة',factor:1,salePrice:20,costPrice:12}]}
]};
const Accounting={formatItemPrice:n=>String(n),formatItemQuantity:n=>String(n),getItemBaseStock:()=>100,convert:n=>n};
const ItemController={photoThumb:()=>'<div></div>'};
const els={gridCatPills:{innerHTML:''},itemGridCardsContainer:{innerHTML:''},mainContent:{},itemGridApplyButton:{textContent:'',disabled:true,setAttribute(k,v){this[k]=v;}}};
const document={querySelector:()=>null,getElementById:id=>els[id]||null};
const events={closed:0,dirty:0,painted:0,recalc:0};
const UI={forceCloseModal(){events.closed++},toast(){}};
const controller=new Function('State','Accounting','ItemController','document','UI','events','AppEscape','InvoiceGridEntry',`return ({
  draft:{type:'sale',rows:[],currency:'USD',exchangeRate:15000},gridCatFilter:'all',gridPending:Object.create(null),
  ${impl}
  addItemToInvoice(itemId,repaint,quantity){let row=this.draft.rows.find(r=>r.itemId===itemId);if(!row)this.draft.rows.push({itemId,qty:quantity});else row.qty+=quantity;},
  markModified(){events.dirty++},recalculate(){events.recalc++},paintForm(){events.painted++}
});`)(State,Accounting,ItemController,document,UI,events,{text:String},{revealRows(){events.revealed=true;}});
controller.renderItemGridCards();
assert.equal(els.itemGridApplyButton.disabled,true);
controller.selectItemFromGrid('a');controller.selectItemFromGrid('a');controller.selectItemFromGrid('a');controller.selectItemFromGrid('b');
assert.equal(controller.gridSelectionCount(),2,'Count distinct selected items live');
assert.match(els.itemGridApplyButton.textContent,/2 أصناف/);
assert.equal(els.itemGridApplyButton.disabled,false);
assert.equal(controller.draft.rows.length,0,'No invoice row changes until Add is pressed');
assert.match(els.itemGridCardsContainer.innerHTML,/InvoiceController\.removeOneFromGrid\(this\.closest/);
assert.match(els.itemGridCardsContainer.innerHTML,/>\s*3\s*<\/span>/);
controller.removeOneFromGrid('a');
assert.equal(controller.gridPending.a,2,'X removes from staged selection, not invoice');
assert.equal(controller.draft.rows.length,0);
controller.removeOneFromGrid('a');controller.removeOneFromGrid('a');
assert.equal(controller.gridPending.a,undefined);
assert.equal(controller.gridSelectionCount(),1);
controller.gridPending.b=24.75;
controller.applyGridSelection();
assert.equal(events.revealed,true);
assert.deepEqual(controller.draft.rows,[{itemId:'b',qty:24.75}]);
assert.equal(events.closed,1);assert.equal(events.dirty,1);assert.equal(events.painted,1);assert.equal(events.recalc,1);
assert.equal(controller.gridSelectionCount(),0,'Staging cleared after commit');
assert.match(html,/#itemGridCardsContainer \.invoice-grid-decrement \{/);
assert.match(html,/id="itemGridApplyButton"/);
assert.match(html,/onclick="InvoiceController\.applyGridSelection\(\)"/);
console.log('PASS staged grid: live count, add once, discard by close, decrement and no pre-commit invoice mutation');
