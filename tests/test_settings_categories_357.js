const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'app/src/main/assets/www/index.html'),'utf8');
const i18n=fs.readFileSync(path.join(root,'app/src/main/assets/www/static/i18n.js'),'utf8');
const cut=(a,b)=>{
 const i=html.indexOf(a),j=html.indexOf(b,i+a.length);
 assert.ok(i>=0&&j>i,`${a} -> ${b}`);
 return html.slice(i,j);
};
let saveCount=0, rerenders=0;
const ctx={console,Map,Set,Math,Number,Date,JSON,String,Array,Promise,Intl,
 StorageEngine:{saveState:async()=>{saveCount++;}},
 AppNav:{clearDirty:()=>{},renderCurrent:()=>{rerenders++;},markDirty:()=>{},navigate:()=>{}},
 UI:{setHeader:()=>{},toast:()=>{},openModal:()=>{},forceCloseModal:()=>{}},
 LicenseManager:{getTotalOpsUsed:()=>0,MAX_TRIAL_OPS:10},
 ThermalPrinter:{isConnected:false},
 ProtectionController:{securityQuestionOptions:()=>'<option>Question</option>'},
 BackupController:{card:()=>'<span>Backup controls</span>',status:()=>({supported:true,localEnabled:false,driveEnabled:false})},
 document:{getElementById:()=>null},
};
ctx.globalThis=ctx;
// Render settings as a stand-alone method while preserving the exact shipped source.
const render=cut('            renderSettings(main) {','\n            }\n        };\n\n        /********************************************************************\n         * 7. ITEM')+'\n            }';
const code=cut('const State =','const StorageEngine =')+'\n'+cut('const Accounting =','const AppNav =')+'\n'+cut('const SettingsController =','const ProtectionController =')+'\n'+`const Renderer={${render}};`+'\n'+i18n+'\nglobalThis.Test={State,Accounting,SettingsController,Renderer,I18n};';
vm.runInNewContext(code,ctx,{timeout:7000});
const {State,Accounting,SettingsController,Renderer,I18n}=ctx.Test;
let main={innerHTML:''};
Renderer.renderSettings(main);
const tags=[...main.innerHTML.matchAll(/<details class="settings-section" data-settings-section="([^"]+)"/g)].map(x=>x[1]);
assert.deepEqual(tags,['business-profiles','language','invoices','default_period','items','printing','company','security','backup','currency','activation','data']);
for(const id of ['setCompanyName','setCompanyPhone','setCompanyAddress','setFooterNote','appProtectionSettings','appLanguage','setPrinterWidth','setPrinterFontScale','allowOutOfStockSales','setItemQuantityDecimals','setDefaultInvoiceCurrency','setDefaultInvoiceListType','settingsLicenseStatus'])
 assert.ok(main.innerHTML.includes(`id="${id}"`),`missing setting id ${id}`);
assert.equal((main.innerHTML.match(/<\/details>/g)||[]).length,12);
assert.ok(!main.innerHTML.includes('open>'),'all sections should start closed');
assert.ok(main.innerHTML.includes('Backup controls'));
assert.ok(main.innerHTML.includes('تصفير شامل لقاعدة البيانات'));
assert.ok(html.includes("SettingsController.expandedSections.add('security')"),'security PIN setup expands the section');
assert.ok(html.includes("? params.type : (['sale','purchase','all'].includes(State.settings.defaultInvoiceListType)"),'invoice list default derives from settings');
assert.equal(Accounting.formatItemQuantity(8), '8');
assert.equal(Accounting.formatItemQuantity(12.3456),'12.35');
assert.equal(Accounting.formatItemQuantity(-0.005),'-0.01');
assert.equal(I18n.translate('إعدادات الشركة'),'Company settings');
assert.equal(I18n.translate('عدد الخانات بعد الفاصلة العشرية للكميات والأسعار'),'Decimal places for quantities and prices');
(async()=>{
 await SettingsController.setItemQuantityDecimals('4');
 assert.equal(State.settings.itemQuantityDecimals,4);
 assert.equal(Accounting.formatItemQuantity(12.3456),'12.3456');
 await SettingsController.setItemQuantityDecimals('0');
 assert.equal(Accounting.formatItemQuantity(12.3456),'12');
 await SettingsController.setItemQuantityDecimals('500');
 assert.equal(State.settings.itemQuantityDecimals,0,'invalid decimal setting rejected');
 await SettingsController.setDefaultInvoiceCurrency('SYP');
 assert.equal(State.settings.defaultCurrency,'SYP');
 await SettingsController.setDefaultInvoiceListType('purchase');
 assert.equal(State.settings.defaultInvoiceListType,'purchase');
 const dummy={dataset:{settingsSection:'items'},open:true};
 SettingsController.onSectionToggle(dummy);
 assert.ok(SettingsController.expandedSections.has('items'));
 Renderer.renderSettings(main);
 assert.ok(main.innerHTML.includes('data-settings-section="items" ontoggle="SettingsController.onSectionToggle(this)" open'));
 dummy.open=false;SettingsController.onSectionToggle(dummy);
 assert.ok(!SettingsController.expandedSections.has('items'));
 assert.ok(saveCount>=4);
 assert.ok(rerenders>=2);
 console.log('PASS: 12 collapsible grouped settings, precision and invoice defaults persist, license/security/backup remain, translations');
})().catch(err=>{console.error(err);process.exit(1)});
