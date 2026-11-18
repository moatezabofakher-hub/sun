'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const location=path.join(__dirname,process.env.TIQANY_WINDOWS_TEST==='1'
  ?'ta-thermal-table-152.js':'../app/src/main/assets/www/static/ta-thermal-table-152.js');
const Table=require(location);
function ctx(){
 const records=[];
 const fake={
  records,font:'800 16px Cairo, sans-serif',textAlign:'center',textBaseline:'top',direction:'rtl',
  fillStyle:'#000',strokeStyle:'#333',lineWidth:1,
  measureText(value){
   const px=Number(String(this.font).match(/(\d+)px/)?.[1]||16);
   return {width:Array.from(String(value)).reduce((sum,ch)=>sum+px*(ch===' '?0.32:/[0-9.,]/.test(ch)?0.56:/[\u0600-\u06FF]/.test(ch)?0.62:0.57),0)};
  },
  fillText(text,x,y,maxWidth){
   const width=Math.min(this.measureText(text).width,maxWidth??Infinity);
   records.push({text:String(text),x,y,width,align:this.textAlign,font:this.font});
  },
  beginPath(){},moveTo(){},lineTo(){},stroke(){},setLineDash(){}
 };
 return fake;
}
const fmt={qty:v=>String(v),price:v=>Number(v).toLocaleString('en-US'),
 total:v=>Number(v).toLocaleString('en-US')};
const sample={currency:'SYP',rows:[
 {itemName:'شامبو كلين',unitName:'قطعة',qty:1,price:25050,total:25050},
 {itemName:'مادة تنظيف طويلة الاسم بخط عربي واضح مع مواصفات إضافية',unitName:'كرتونة',qty:25.5,price:1250500.75,total:31263144.125},
 {itemName:'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',unitName:'قطعة',qty:2,price:10,total:20}
]};
for(const width of [384,576]){
 test('Grid cells and text stay inside 58/80 mm paper bounds: '+width,()=>{
   const c=ctx(),pad=width===384?8:14,scale=0.75;
   const layout=Table.build(c,sample,width,pad,scale,{},fmt);
   assert.equal(layout.cols[0].right,width-pad);
   assert.equal(layout.cols.at(-1).left,pad);
   for(let i=1;i<layout.cols.length;i++)assert.equal(layout.cols[i].right,layout.cols[i-1].left);
   assert(layout.cols.every(col=>col.width>=20));
   const final=Table.draw(c,sample,width,10,pad,scale,{},fmt);
   assert.equal(final,layout.height+10);
   assert(c.records.length>=sample.rows.length*6);
   let offset=10;
   const plans=[layout.header,...layout.rows];
   for(const plan of plans){
     const top=offset,end=top+plan.height;
     const painted=c.records.filter(record=>record.y>=top&&record.y<end);
     assert(painted.length>0,'Each table row has visible labels or values');
     for(const rec of painted){
       const col=plan.cells.find(x=>rec.x>=x.left&&rec.x<=x.right);
       assert(col,'Rendered text anchor must belong to a column');
       const left=rec.align==='right'?rec.x-rec.width:rec.align==='center'?rec.x-rec.width/2:rec.x;
       assert(left>=col.left-0.01,'Left text edge not allowed to cross gridline: '+rec.text);
       assert(left+rec.width<=col.right+0.01,'Right text edge not allowed to cross gridline: '+rec.text);
       const px=Number(rec.font.match(/(\d+)px/)?.[1]||16);
       assert(rec.y+px<=end,'Text must not overlap the next row');
     }
     offset=end;
   }
 });
}
test('Visibility settings remove hidden columns without leaving dead space',()=>{
 const c=ctx();
 const cols=Table.columns(576,14,{unit:false,price:false});
 assert.deepEqual(cols.map(x=>x.key),['index','name','quantity','total']);
 assert.equal(cols.at(-1).left,14);
 for(let i=1;i<cols.length;i++)assert.equal(cols[i].right,cols[i-1].left);
});
test('Grid allows very long Arabic item names to wrap, keeping numeric cells aligned',()=>{
 const c=ctx(),l=Table.build(c,sample,384,8,0.75,{},fmt);
 assert(l.rows[1].cells.find(x=>x.key==='name').lines.length>1);
 assert(l.rows[2].cells.find(x=>x.key==='name').lines.length>1);
 assert(l.rows[1].height>=l.rows[0].height);
});
test('Exactly one index cell is retained for each product',()=>{
 const c=ctx(),l=Table.build(c,sample,576,14,0.75,{},fmt);
 assert.deepEqual(l.rows.map(r=>r.cells.find(x=>x.key==='index').lines[0]),['1','2','3']);
});
