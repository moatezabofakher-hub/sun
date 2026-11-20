import os,sys,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
root,kind=Path(sys.argv[1]).resolve(),sys.argv[2]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium') or str(Path(os.environ.get('PROGRAMFILES(X86)',''))/'Microsoft/Edge/Application/msedge.exe'),args=['--allow-file-access-from-files','--no-sandbox'])
 page=browser.new_page(viewport={'width':1120 if kind=='win' else 390,'height':800},has_touch=True)
 page.set_default_timeout(6000)
 page.on('pageerror',lambda e:print('JS',e,flush=True))
 page.goto((root/'index.html').as_uri())
 agent=kind=='agent'
 items=[{'id':'grid'+str(i),'name':'مادة '+str(i),'category':'مواد','currency':'SYP','openingStockBase':2000,'units':[{'name':'علبة','factor':1,'salePrice':10,'costPrice':7},{'name':'قطعة','factor':5,'salePrice':2,'costPrice':1.4}]} for i in range(12)]
 if agent:
  page.wait_for_function("typeof Agent!=='undefined' && !!Agent.state && typeof Agent.openInvoiceItemGrid==='function'")
  page.evaluate("""async items=>{Agent.state=Agent.blank;Object.assign(Agent.state,{companyId:'qa',key:'qa',items,defaultSaleUnitName:'قطعة',stock:Object.fromEntries(items.map(i=>[i.id,2000]))});Agent.ready=()=>true;Agent.active=async()=>true;await Agent.show('home');Agent.startInvoice('sale')}""",items)
 else:
  page.wait_for_function("typeof StorageEngine!=='undefined' && !!StorageEngine.db && typeof TiqanyManager152!=='undefined'")
  page.evaluate("""items=>{Object.assign(State.settings,{companySetupCompleted:true,companyName:'اختبار',taDefaultSaleUnitName:'قطعة',taDefaultPurchaseUnitName:'علبة',defaultPriceTier:'center'});State.license.isActivated=true;State.items=items;State.accounts.push({id:'grid-ac',name:'حساب تجريبي',type:'customer',priceTier:'consumer'});document.querySelector('#ta-company-setup-128')?.remove();AppNav.navigate('invoice_form',{type:'sale'})}""",items)
 for typ in (['sale'] if agent else ['sale','purchase']):
  if typ=='purchase':
   page.evaluate("()=>{AppNav.isDirty=false;InvoiceController.draft=null;AppNav.navigate('invoice_form',{type:'purchase'})}")
  if kind=='win' and typ=='sale':
   page.wait_for_selector('#invoicePricingTier')
   page.evaluate("InvoiceController.changeInvoiceAccount('grid-ac')")
   assert page.locator('#invoicePricingTier option:checked').inner_text()=='سعر المستهلك'
   page.locator('#invoicePricingTier').select_option('wholesale')
   assert page.locator('#invoicePricingTier option:checked').inner_text()=='سعر الجملة'
   page.evaluate("State.accounts.find(x=>x.id==='grid-ac').priceTier='settings'")
   page.locator('#invoicePricingTier').select_option('account')
   assert page.locator('#invoicePricingTier option:checked').inner_text()=='سعر المركز'
  opener=page.locator('button[onclick*="openInvoiceItemGrid"]' if agent else 'button[onclick*="InvoiceController.openItemGridModal"]')
  opener.click()
  card=page.locator('[data-grid-card]').first; card.click()
  qty=card.locator('input'); qty.tap()
  assert qty.evaluate('e=>e.selectionStart===0 && e.selectionEnd===e.value.length'),kind
  qty.fill('٢٤٫٧٥')
  assert qty.evaluate('e=>e.checkValidity()') and card.locator('[data-grid-count]').inner_text()=='24.75'
  # A second short tap leaves a single caret in the focused field.
  qty.tap(position={'x':12,'y':10})
  assert qty.evaluate('e=>e.selectionStart===e.selectionEnd'),kind
  assert page.evaluate('Agent.draft.length' if agent else 'InvoiceController.draft.rows.length')==0
  apply=page.locator('#agentGridApplyButton' if agent else '#itemGridApplyButton');apply.click()
  rows=page.locator('.invoice-added-items');page.wait_for_function("parseFloat(document.querySelector('.invoice-added-items')?.style.minHeight)>0")
  geom=rows.evaluate("""el=>{const host=document.querySelector('#mainContent,main#screen'),header=document.querySelector('header.ta-app-header,#agentHeader'),footer=document.querySelector('.ta-invoice-save-footer,.ta-agent-invoice-save-footer');return [el.getBoundingClientRect().top,Math.max(0,header.getBoundingClientRect().bottom,host.getBoundingClientRect().top),el.getBoundingClientRect().bottom,footer.getBoundingClientRect().top]}""")
  assert abs(geom[0]-geom[1])<5 and geom[2]>=geom[3]-2,(kind,geom)
  value=page.evaluate('Agent.draft[0]' if agent else 'InvoiceController.draft.rows[0]')
  assert value['qty']==24.75 and value['unitName']==('علبة' if typ=='purchase' else 'قطعة'),value
  opener.click();card.click();qty.fill('2.125')
  if agent:
   qty.fill('999999');apply.click();assert apply.is_visible() and page.evaluate('Agent.draft[0].qty')==24.75
   qty.fill('2.125')
  for item in page.locator('[data-grid-card]').all()[1:]:item.click()
  apply.click();page.wait_for_function("document.querySelectorAll('.invoice-added-row').length===12")
  assert page.evaluate('Agent.draft[0].qty' if agent else 'InvoiceController.draft.rows[0].qty')==26.875
  page.locator('.invoice-added-row').last.scroll_into_view_if_needed()
  footer=page.locator('.ta-invoice-save-footer,.ta-agent-invoice-save-footer')
  target=page.locator('#invPaidInput,#invoiceDiscount').last
  if target.count():target.evaluate('e=>e.scrollIntoView({block:"center"})')
  assert footer.is_visible()
  print('PASS',kind,typ,geom,flush=True)
 browser.close()
