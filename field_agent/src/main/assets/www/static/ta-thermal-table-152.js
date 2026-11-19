/* Tiqany Acc 3.5.152 — bounded Arabic thermal invoice grid.
 * The geometric column boundaries are the only source of truth for text positions
 * AND strokes, avoiding the misalignment visible on 58/80 mm receipts.
 */
(function(root){
'use strict';
function num(x,fallback){const n=Number(x);return Number.isFinite(n)?n:fallback;}
function enabled(fields,key){return fields?.[key]!==false;}
function columns(width,pad,fields={}){
  const base=[
    {key:'index',label:'#',weight:0.070,align:'center'},
    {key:'name',label:'اسم المادة',weight:0.302,align:'right'},
    {key:'unit',label:'الوحدة',weight:0.147,align:'center'},
    {key:'quantity',label:'الكمية',weight:0.115,align:'center'},
    {key:'price',label:'الإفرادي',weight:0.169,align:'center'},
    {key:'total',label:'الإجمالي',weight:0.197,align:'center'}
  ].filter(c=>enabled(fields,c.key));
  const available=Math.max(0,width-2*pad);
  const weights=base.reduce((t,c)=>t+c.weight,0);
  let right=width-pad;
  return base.map((col,index)=>{
    const left=index===base.length-1?pad:right-Math.round(available*col.weight/weights);
    const answer={...col,left,right,width:right-left};
    right=left;return answer;
  });
}
function fitFont(ctx,value,maxWidth,preferred,min){
  let size=preferred;
  while(size>min){
    ctx.font='800 '+size+'px Cairo, sans-serif';
    if(ctx.measureText(String(value)).width<=maxWidth)break;
    size--;
  }
  return size;
}
function fragments(ctx,text,maxWidth,preferred){
  const raw=String(text??'').replace(/\s+/g,' ').trim();
  if(!raw)return [''];
  ctx.font='800 '+preferred+'px Cairo, sans-serif';
  const result=[];let line='';
  // Support Arabic and long unspaced product codes without overflowing.
  for(const word of raw.split(' ')){
    const proposal=line?line+' '+word:word;
    if(ctx.measureText(proposal).width<=maxWidth){line=proposal;continue;}
    if(line){result.push(line);line='';}
    const parts=Array.from(word);
    for(const ch of parts){
      if(line&&ctx.measureText(line+ch).width>maxWidth){result.push(line);line=ch;}
      else line+=ch;
    }
  }
  if(line)result.push(line);
  return result.length?result:[''];
}
function rowPlan(ctx,cols,values,font,padText){
  const cells=cols.map((col,i)=>{
    const value=String(values[col.key]??'');
    const maxWidth=Math.max(8,col.width-padText*2);
    const size=col.key==='name'?font:fitFont(ctx,value,maxWidth,font,Math.max(10,font-6));
    const lines=fragments(ctx,value,maxWidth,size);
    return {...col,lines,size};
  });
  const height=Math.max(24,...cells.map(c=>c.lines.length*(c.size+4)+padText*2));
  return {cells,height};
}
function build(ctx,invoice,width,pad,scale,fields={},formatters={}){
  const is58=width<=384;
  const font=Math.max(is58?11:14,Math.round((is58?17:22)*num(scale,0.75)));
  const heading=Math.max(is58?11:14,Math.round((is58?16:21)*num(scale,0.75)));
  const cellPad=is58?3:5;
  const cols=columns(width,pad,fields);
  const headValues=Object.fromEntries(cols.map(c=>[c.key,c.label]));
  const header=rowPlan(ctx,cols,headValues,heading,cellPad+1);
  const rows=(Array.isArray(invoice?.rows)?invoice.rows:[]).map((r,i)=>{
    const f={
      index:i+1,
      name:r.itemName||'',
      unit:r.unitName||'',
      quantity:formatters.qty?formatters.qty(r.qty):String(r.qty??''),
      price:formatters.price?formatters.price(r.price):String(r.price??''),
      total:formatters.total?formatters.total(r.total,invoice.currency):String(r.total??'')
    };
    return rowPlan(ctx,cols,f,font,cellPad);
  });
  return {cols,header,rows,cellPad,height:header.height+rows.reduce((sum,r)=>sum+r.height,0),width,pad};
}
function draw(ctx,invoice,width,y,pad,scale,fields,formatters){
  const layout=build(ctx,invoice,width,pad,scale,fields,formatters);
  const startY=y;
  // Text is drawn inside the exact same boundaries used by the grid lines.
  function textCell(cell,top,h){
    const textLines=cell.lines||[];
    const lineH=cell.size+4;
    const textHeight=textLines.length*lineH;
    const first=top+Math.max(4,Math.floor((h-textHeight)/2));
    ctx.textBaseline='top';
    ctx.direction='rtl';
    ctx.fillStyle='#000000';
    ctx.font='800 '+cell.size+'px Cairo, sans-serif';
    ctx.textAlign=cell.align;
    const x=cell.align==='right'?cell.right-5:cell.align==='left'?cell.left+5:(cell.left+cell.right)/2;
    for(let i=0;i<textLines.length;i++){
      // maxWidth keeps even unusual glyph metrics within the cell.
      if(typeof ctx.fillText==='function')ctx.fillText(textLines[i],x,first+i*lineH,Math.max(8,cell.width-8));
    }
  }
  let cursor=y;
  for(const row of [layout.header,...layout.rows]){
    for(const cell of row.cells)textCell(cell,cursor,row.height);
    cursor+=row.height;
  }
  const stroke=ctx.strokeStyle,lineWidth=ctx.lineWidth;
  ctx.strokeStyle='#333333';ctx.lineWidth=1;
  if(typeof ctx.setLineDash==='function')ctx.setLineDash([]);
  const edges=[layout.cols[0]?.right,...layout.cols.map(c=>c.left)].filter(Number.isFinite);
  for(const x of edges){ctx.beginPath();ctx.moveTo(x,startY);ctx.lineTo(x,cursor);ctx.stroke();}
  let lineY=startY;
  for(const row of [layout.header,...layout.rows]){
    ctx.beginPath();ctx.moveTo(pad,lineY);ctx.lineTo(width-pad,lineY);ctx.stroke();
    lineY+=row.height;
  }
  ctx.beginPath();ctx.moveTo(pad,cursor);ctx.lineTo(width-pad,cursor);ctx.stroke();
  ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;
  return cursor;
}
function estimateHeight(ctx,invoice,width,pad,scale,fields,formatters){
  return build(ctx,invoice,width,pad,scale,fields,formatters).height;
}
const api=Object.freeze({columns,build,draw,estimateHeight});
root.TiqanyThermalTable152=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
