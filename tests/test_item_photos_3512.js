'use strict';
const assert = require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
const root=path.resolve(__dirname, '..');
const html=fs.readFileSync(path.join(root,'app/src/main/assets/www/index.html'),'utf8');
const range=(a,b)=>{const start=html.indexOf(a),end=html.indexOf(b,start+a.length);assert(start>=0 && end>start,a);return html.slice(start,end);};
// Images intentionally appear in exactly three user-facing contexts.
assert.equal((html.match(/ItemController\.photoThumb\(/g)||[]).length,2);
assert.match(range('renderItems(main, params = {})','renderWarehouses(main'),/ItemController\.photoThumb\(item, 'list'\)/);
assert.match(range('renderItemGridCards() {','selectItemFromGrid(itemId)'),/ItemController\.photoThumb\(itm, 'grid'\)/);
assert.match(range('openItemModal(itemId = null)','renderUnitRows()'),/this\.photoEditorPreview\(\)/);
assert.ok(!range('renderItemGridCards() {','selectItemFromGrid(itemId)').includes('<input type="file"'));
assert.equal((html.match(/capture="environment"/g)||[]).length,1);
assert.match(html,/onchange="ItemController\.onItemPhotoSelected\(event\)"/);
assert.ok(html.includes('photoData: this.safePhotoData(this.tempPhotoData)'));
assert.ok(html.includes('data: State'),'local backup includes all State.items records');
assert.match(html,/State\.items = d\.items/);
const java=fs.readFileSync(path.join(root,'app/src/main/java/com/sunshine/accounting/MainActivity.java'),'utf8');
const manifest=fs.readFileSync(path.join(root,'app/src/main/AndroidManifest.xml'),'utf8');
const provider=fs.readFileSync(path.join(root,'app/src/main/res/xml/item_photo_paths.xml'),'utf8');
assert.match(java,/params\.isCaptureEnabled\(\) && acceptsImage\(params\)/);
assert.match(java,/MediaStore\.ACTION_IMAGE_CAPTURE/);
assert.match(java,/FileProvider\.getUriForFile/);
assert.match(java,/pendingFileChooser\.onReceiveValue\(selected\)/);
assert.match(manifest,/android:name="androidx\.core\.content\.FileProvider"/);
assert.match(provider,/<cache-path name="item_images"/);
const inputs={};
let opened='',saves=0,renders=0,marks=0;const toast=[];
const document={
 activeElement:null,
 getElementById:id=>inputs[id]||null,
 createElement:kind=>{
   assert.equal(kind,'canvas');
   return {width:0,height:0,getContext:()=>({fillStyle:'',fillRect:()=>{},drawImage:()=>{}}),toDataURL:()=> 'data:image/jpeg;base64,' + 'a'.repeat(100)};
 }
};
class MockImage{constructor(){this.naturalWidth=1920;this.naturalHeight=1280;}
 set src(_) {this.onload?.();}}
class MockFileReader{readAsDataURL(file){this.result='data:'+file.type+';base64,YWFh';this.onload?.();}}
const ctx={console,Map,Set,Math,Number,Date,JSON,String,Array,Promise,Intl,FileReader:MockFileReader,Image:MockImage,
 document,
 UI:{toast:(...a)=>toast.push(a),openModal:x=>opened=x,forceCloseModal:()=>{}},
 StorageEngine:{saveState:async()=>{saves++;}},
 LicenseManager:{canPerformOperation:()=>true,recordNewOperation:async()=>{}},
 AppNav:{markModalDirty:()=>{marks++;},renderCurrent:()=>{renders++;}}
};ctx.globalThis=ctx;
vm.runInNewContext(range('const State =','const StorageEngine =')+'\n'+range('const Accounting =','const AppNav =')+'\n'+range('const ItemController =','        /********************************************************************\n         * MULTI-WAREHOUSE')+'\nglobalThis.Test={State,ItemController}',ctx);
const {State,ItemController}=ctx.Test;
State.settings.itemQuantityDecimals=4;
const nameBox={value:'منظف ليمون'};
Object.assign(inputs,{
 itmName:nameBox,itmCat:{value:'منظفات'},itmOpenStock:{value:'10'},itmMinStock:{value:'1'},itmBarcode:{value:'120'},
 unitName_0:{value:'عبوة'},unitFactor_0:{value:'1'},unitCost_0:{value:'5'},unitSale_0:{value:'6'},
 itmPhotoPreview:{innerHTML:''},itmPhotoRemove:{classList:{toggle:()=>{}}},itmUnitsContainer:{innerHTML:''}
});
(async()=>{
 ItemController.openItemModal();
 assert.match(opened,/صورة المادة \(اختياري\)/);
 assert.match(opened,/من المعرض/);
 assert.match(opened,/التقاط صورة/);
 const file={type:'image/png',size:100000};
 const input={files:[file],value:'file.png'};
 await ItemController.onItemPhotoSelected({target:input});
 assert.equal(input.value,'');
 assert.match(ItemController.tempPhotoData,/^data:image\/jpeg;base64,/);
 assert.match(inputs.itmPhotoPreview.innerHTML,/<img src="data:image\/jpeg;base64,/);
 ItemController.tempUnits=[{name:'عبوة',factor:1,salePrice:6,costPrice:5}];
 assert.equal(await ItemController.saveItem(''),true);
 assert.equal(saves,1);
 assert.equal(State.items[0].photoData,ItemController.tempPhotoData);
 assert.equal(State.items[0].units[0].salePrice,6);
 assert.ok(ItemController.photoThumb(State.items[0],'grid').includes('<img'));
 assert.ok(ItemController.photoThumb(State.items[0],'list').includes('<img'));
 assert.ok(ItemController.photoThumb({},'grid').includes('fa-box-open'));
 // Preserve the image on subsequent edit and save (no accidental clearing).
 ItemController.openItemModal(State.items[0].id);
 assert.equal(ItemController.tempPhotoData,State.items[0].photoData);
 assert.match(opened,/data:image\/jpeg;base64,/);
 assert.equal(await ItemController.saveItem(State.items[0].id),true);
 assert.equal(State.items[0].photoData,ItemController.tempPhotoData);
 const backed=JSON.parse(JSON.stringify({data:State}));
 assert.equal(backed.data.items[0].photoData,State.items[0].photoData);
 ItemController.clearItemPhoto();
 assert.equal(ItemController.tempPhotoData,'');
 assert.equal(await ItemController.saveItem(State.items[0].id),true);
 assert.equal(State.items[0].photoData,'');
 await ItemController.onItemPhotoSelected({target:{files:[{type:'application/pdf',size:20}],value:'x'}});
 assert.equal(ItemController.tempPhotoData,'');
 assert.ok(toast.some(x=>x[1]==='error'),'bad file must be rejected');
 assert.ok(marks>=2);
 console.log('PASS 3.5.12: image import, resize, photo display only in item list/grid/edit, remove, backup and native camera integration');
})().catch(e=>{console.error(e);process.exit(1)});
