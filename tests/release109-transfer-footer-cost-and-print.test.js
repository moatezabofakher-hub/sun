const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const project=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(project,'app/src/main/assets/www/index.html'),'utf8');
const cost=require(path.join(project,'app/src/main/assets/www/static/transfer-cost-35109.js'));
const items=[
 {id:'soap',currency:'USD',units:[{factor:1,costPrice:8}]},
 {id:'bottle',currency:'SYP',units:[{factor:1,costPrice:30000}]},
 {id:'missing',currency:'USD',units:[{factor:1,costPrice:''}]}
];
const usd=(n,from,to,rate)=>from===to?n:from==='USD'?n*rate:n/rate;
test('transfer count is unique items and value follows live latest cost, units and mixed currencies',()=>{
 const rows=[{itemId:'soap',qty:'3',factor:'1'},{itemId:'bottle',qty:'4',factor:'2'},{itemId:'soap',qty:'1',factor:'1'}];
 const a=cost.summarize(rows,items,'USD',15000,usd);
 assert.equal(a.count,2);assert.equal(a.total,36);assert.equal(a.missing,0);
 const b=cost.summarize(rows.map(x=>x.itemId==='bottle'?{...x,qty:'6'}:x),items,'USD',15000,usd);
 assert.equal(b.total,38,'quantity edit must update totals');
 items[0].units[0].costPrice=10;
 assert.equal(cost.summarize(rows,items,'USD',15000,usd).total,44,'latest cost edit must update value');
 items[0].units[0].costPrice=8;
});
test('missing item price must be flagged rather than silently counting as a complete valued transfer',()=>{
 const s=cost.summarize([{itemId:'soap',qty:1,factor:1},{itemId:'missing',qty:2,factor:1}],items,'SYP',15000,usd);
 assert.equal(s.count,2);assert.equal(s.missing,1);assert.equal(s.total,120000);
});
test('transfer editor hides regular dock and shows fixed cost, count, Save right, Save+Print left, red Cancel',()=>{
 assert.match(html,/body\.ta-transfer-editor-open nav\.ta-bottom-nav/);
 assert.match(html,/id="transferSummaryCount"/);assert.match(html,/id="transferSummaryCost"/);
 assert.match(html,/class="ta-transfer-form-actions" data-fixed-transfer-footer="true"/);
 const start=html.indexOf('class="ta-transfer-footer-buttons"');const end=html.indexOf('</div>',start);
 const actions=html.slice(start,end);
 assert.match(actions,/id="transferSaveButton" onclick="WarehouseController\.saveTransfer\(false\)"/);
 assert.match(actions,/id="transferSaveAndPrintButton" onclick="WarehouseController\.saveTransfer\(true\)"/);
 assert.ok(actions.indexOf('transferSaveButton')<actions.indexOf('transferSaveAndPrintButton'));
 assert.match(html,/class="ta-transfer-cancel-button" onclick="WarehouseController\.closeTransferForm\(\)"/);
 assert.match(html,/printTransferBatch\(id\)/);assert.match(html,/printTransferBatch\(batchId\)/);
 assert.match(html,/--ta-transfer-footer-height/);
});
test('invoice form keeps only two save actions, Save right and Save+Print left',()=>{
 const start=html.indexOf('<div class="ta-invoice-save-footer" role="group"');
 const end=html.indexOf('${d.isEditing ? `',start);
 assert.ok(start>=0&&end>start);
 const section=html.slice(start,end);
 assert.equal((section.match(/onclick="InvoiceController\.saveInvoice\(/g)||[]).length,2);
 assert.ok(section.indexOf('saveInvoice(false)')<section.indexOf('saveInvoice(true)'));
});
