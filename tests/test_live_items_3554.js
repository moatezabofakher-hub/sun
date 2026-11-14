const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
function classList() {
  const s=new Set();
  return {toggle(cls,flag) {flag ? s.add(cls) : s.delete(cls);},contains(cls){return s.has(cls)}};
}
function extract(html,start,end){
  const i=html.indexOf(start);
  const j=html.indexOf(end,i+start.length);
  assert(i>=0 && j>i,'method present');
  return html.slice(i,j).trim().replace(/,\s*$/,'');
}
for (const variant of ['main']) {
  const html=fs.readFileSync(path.join(ROOT,'app/src/main/assets/www/index.html'),'utf8');
  const searchSrc=extract(html,'            filterItems() {','            markItemDirty() {');
  let route={screen:'items',params:{}};
  const searchInput={value:'ليـمون'};
  const catSelect={value:'all'};
  const counter={textContent:''};
  const empty={hidden:true,classList:classList()};
  const g1={hidden:false,classList:classList(),counter:{textContent:''}};
  const g2={hidden:false,classList:classList(),counter:{textContent:''}};
  const rows=[
    {name:'سائل الليمون',barcode:'A-20',cat:'منظفات',group:g1},
    {name:'شامبو كلين',barcode:'B-40',cat:'شامبو',group:g2},
    {name:'أدوات تنظيف',barcode:'C-10',cat:'منظفات',group:g1},
  ];
  const cards=rows.map((r)=>({dataset:{itemSearch:encodeURIComponent(r.name+' '+r.barcode),itemCategory:encodeURIComponent(r.cat)},hidden:false,classList:classList(),group:r.group}));
  const groups=[g1,g2];
  for (const g of groups) {
    g.querySelectorAll=(selector)=>{
      assert(selector==='[data-item-search]:not([hidden])');
      return cards.filter(c=>c.group===g && !c.hidden);
    };
    g.querySelector=(selector)=>selector==='[data-group-count]'?g.counter:null;
  }
  const list={querySelectorAll(selector){
    if(selector==='[data-item-search]') return cards;
    if(selector==='[data-item-group-section]') return groups;
    throw new Error('unknown selector '+selector);
  }};
  const document={
    getElementById(id){return {itemCardsList:list,itemSearchInput:searchInput,itemCatSelect:catSelect,itemsSearchEmpty:empty}[id]||null;},
    querySelector(selector){assert(selector==='.ta-items-screen .ta-items-counter');return counter;}
  };
  const AppNav={current(){return route}};
  const controller = new Function('document','AppNav',`return ({${searchSrc}});`)(document,AppNav);
  controller.filterItems();
  assert.deepEqual(cards.map(c=>c.hidden),[false,true,true]);
  assert(counter.textContent==='1 من 3 مادة');
  assert(g1.counter.textContent==='1 مادة');
  assert(g2.hidden===true && g2.classList.contains('hidden'));
  assert(empty.hidden===true);
  assert(route.params.q==='ليـمون');
  searchInput.value='ادوات';controller.filterItems();
  assert.deepEqual(cards.map(c=>c.hidden),[true,true,false]);
  searchInput.value='شامبو';controller.filterItems();
  assert.deepEqual(cards.map(c=>c.hidden),[true,false,true]);
  catSelect.value='منظفات';controller.filterItems();
  assert.deepEqual(cards.map(c=>c.hidden),[true,true,true]);
  assert(empty.hidden===false && !empty.classList.contains('hidden'));
  assert(counter.textContent==='0 من 3 مادة');
  searchInput.value='';catSelect.value='all';controller.filterItems();
  assert.deepEqual(cards.map(c=>c.hidden),[false,false,false]);
  assert(counter.textContent==='3 مادة' && empty.hidden===true);
  assert.equal(g1.hidden,false);
  assert.equal(g2.hidden,false);
  // New items appear in search even after navigating back with a former query.
  const renderSrc=extract(html,'            renderItems(main, params = {}) {','            renderWarehouses(main, params = {}) {').replace(/,\s*\/\/[^\n]*$/,'');
  let ranFilter=0;
  const Items={viewMode:'list',filterItems(){ranFilter++},photoThumb(){return '<span class="photo"></span>'}};
  const State={items:rows.map((r,i)=>({...r,id:'item'+i,category:r.cat})),categories:['منظفات','شامبو'],invoices:[],settings:{selectedWarehouseId:'wh_main'}};
  const Accounting={getItemBaseStock(){return 1},formatItemQuantity(n){return String(n)}};
  const AppEscape={text(v){return String(v)}};
  const WarehouseController={options(){return '<option value="wh_main">الرئيسي</option>'}};
  const UI={setHeader(){}};
  const render=new Function('State','Accounting','AppEscape','ItemController','WarehouseController','UI',`return ({${renderSrc}}).renderItems;`)(State,Accounting,AppEscape,Items,WarehouseController,UI);
  const main={innerHTML:''};
  render(main,{q:'ليـمون',cat:'منظفات'});
  assert.equal((main.innerHTML.match(/data-item-search=/g)||[]).length,3,'all items must remain in DOM to restore after filter cleared');
  assert(ranFilter===1,'live filter must run after screen renders');
  Items.viewMode='group_grid';ranFilter=0;
  render(main,{q:'ليـمون',cat:'منظفات'});
  assert.equal((main.innerHTML.match(/data-item-search=/g)||[]).length,3,'grid mode all cards present');
  assert.equal(ranFilter,1);
  assert(html.includes('#itemCardsList [data-item-search][hidden]'),'CSS respects hidden attribute with flex cards');
  assert(html.includes('display:none !important'),'CSS forces hidden cards to disappear');
  console.log('PASS',variant,'live material search, clearing, group filtering, list/grid render and Arabic normalization');
}
