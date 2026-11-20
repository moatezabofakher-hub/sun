import sys,shutil,os
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(sys.argv[1]).resolve()
kind=sys.argv[2]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium') or str(Path(os.environ.get('PROGRAMFILES(X86)',''))/'Microsoft/Edge/Application/msedge.exe'),args=['--no-sandbox','--allow-file-access-from-files'])
 page=b.new_page(viewport={'width':1100 if kind=='win' else 470,'height':760})
 page.set_default_timeout(5000)
 page.on('pageerror',lambda e:print('PAGEERR',e,flush=True))
 page.goto((root/'index.html').as_uri())
 page.wait_for_function("typeof StorageEngine!=='undefined' && StorageEngine.db!==null && typeof Payroll!=='undefined'")
 page.evaluate("""()=>{State.settings.companySetupCompleted=true;State.settings.companyName='تجربة';State.license.isActivated=true;document.querySelector('#ta-company-setup-128')?.remove();
 if(typeof AgentHub!=='undefined'){State.fieldSync=State.fieldSync||{};State.fieldSync.agents=[{id:'p1',name:'الموظف الأول'}];AppNav.navigate('agent_hub');}
 else AppNav.navigate('dashboard');}""")
 if kind=='solo':page.locator('[data-nav=payroll]').click()
 else:page.get_by_role('button',name='أجور الموظفين',exact=True).click()
 page.locator('[data-section=terms]').click()
 if kind=='solo':
  page.locator('#pay-name').fill('الموظف الأول');page.get_by_role('button',name='إضافة موظف',exact=True).click()
 emp=page.locator('[data-staff]').first.get_attribute('data-staff')
 page.locator('[data-staff]').first.click()
 page.locator('#pay-gross').fill('250000')
 visual="e=>Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').get.call(e)"
 assert page.locator('#pay-gross').evaluate(visual)=='250,000'
 assert page.locator('#pay-gross').evaluate('e=>e.value')=='250000'
 page.locator('#pay-days').fill('25');page.get_by_role('button',name='حفظ',exact=True).click()
 page.locator('[data-staff]').first.wait_for()
 page.wait_for_function('!AppNav.isDirty && State.payrollStaff.some(x=>x.gross===250000)')
 def nav(section,record=None):
  page.evaluate("p=>AppNav.navigate('payroll',p)",{'section':section,'employeeId':emp,'recordId':record or ''})
 def pay(section,day,amount):
  nav(section);page.locator('#pay-date').fill(day);page.locator('#pay-amount').fill(str(amount));page.get_by_role('button',name='حفظ',exact=True).click()
  page.locator('[data-edit]').first.wait_for()
 pay('advance','2026-10-01',50000)
 page.wait_for_function("!AppNav.isDirty && State.expenses.some(x=>x.payroll?.kind==='advance')")
 nav('salary');page.locator('#pay-date').fill('2026-10-30');assert page.locator('#pay-amount').evaluate('e=>e.value')=='200000'
 page.locator('#pay-amount').fill('100000');page.get_by_role('button',name='حفظ',exact=True).click()
 page.wait_for_function("!AppNav.isDirty && State.expenses.some(x=>x.payroll?.kind==='salary')")
 nav('salary');page.locator('#pay-date').fill('2026-11-25');assert page.locator('#pay-amount').evaluate('e=>e.value')=='350000'
 page.get_by_role('button',name='إلغاء',exact=True).click()
 adv=page.evaluate("State.expenses.find(x=>x.payroll?.kind==='advance').id")
 nav('advance',adv);page.locator('#pay-amount').fill('60000');page.get_by_role('button',name='حفظ',exact=True).click()
 page.wait_for_function("!AppNav.isDirty && State.expenses.find(x=>x.payroll?.kind==='advance').amount===60000")
 nav('salary');page.locator('#pay-date').fill('2026-11-25');assert page.locator('#pay-amount').evaluate('e=>e.value')=='340000'
 page.get_by_role('button',name='إلغاء',exact=True).click()
 pay('bonus','2026-11-01',1000);page.wait_for_function("!AppNav.isDirty && State.expenses.some(x=>x.category==='مكافأة ممنوحة')")
 assert page.evaluate("State.expenses.length") == 3
 page.reload()
 page.wait_for_function("typeof State!=='undefined' && State.payrollStaff?.some(x=>x.gross===250000)")
 assert page.evaluate("State.expenses.length") == 3
 if kind=='win':
  page.evaluate("""()=>{document.querySelector('#ta-company-setup-128')?.remove();document.getElementById('mainContent').style.minHeight='3000px';window.scrollTo(0,0)}""")
  y="()=>['header.ta-app-header','nav.ta-bottom-nav'].map(s=>document.querySelector(s).getBoundingClientRect().top)"
  before=page.evaluate(y);page.evaluate('window.scrollTo(0,800)');page.wait_for_timeout(200)
  after=page.evaluate(y);assert page.evaluate('window.scrollY')>100 and all(abs(a-b)<2 for a,b in zip(before,after)),(before,after,page.evaluate('window.scrollY'))
 print('PASS',kind)
