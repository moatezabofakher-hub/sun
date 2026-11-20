import sys,os,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(sys.argv[1]).resolve()
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium') or str(Path(os.environ.get('PROGRAMFILES(X86)',''))/'Microsoft/Edge/Application/msedge.exe'),args=['--no-sandbox','--allow-file-access-from-files'])
 p=b.new_page(viewport={'width':700,'height':820},timezone_id='Asia/Damascus')
 p.set_default_timeout(7000);p.on('pageerror',lambda e: print('JS',e,flush=True))
 p.add_init_script("window.nativePlans=[];window.AndroidAlerts={setPayrollSchedules:s=>nativePlans.push(JSON.parse(s))}")
 p.goto((root/'index.html').as_uri())
 p.wait_for_function("typeof ProfileManager!=='undefined' && ProfileManager.registry")
 def nav(section):p.evaluate("s=>{AppNav.clearDirty();AppNav.navigate('payroll',{section:s,employeeId:'e1'})}",section)
 p.evaluate("""async()=>{State.settings.companyName='شركة اختبار';State.settings.companySetupCompleted=true;State.license.isActivated=true;document.querySelector('#ta-company-setup-128')?.remove();
 State.payrollStaff=[{id:'e1',name:'سليم'}];await StorageEngine.saveState();}""")
 nav('terms');assert p.get_by_text('فترة الاستحقاق',exact=False).count()>0
 p.locator('#pay-cycle').select_option('weekly');assert p.locator('[data-pay-day]').count()==7
 p.locator('[data-pay-day="4"]').click()
 p.locator('#pay-cycle').select_option('yearly');p.locator('[aria-label="شهر الترحيل"]').select_option('2')
 p.locator('[data-pay-day="29"],[data-leap]').click()
 p.locator('#pay-cycle').select_option('monthly');p.locator('[data-last]').click()
 p.locator('#pay-cycle').select_option('weekly');assert p.locator('[data-pay-day="4"]').get_attribute('aria-pressed')=='true'
 p.locator('#pay-gross').fill('300000');p.locator('#pay-days').fill('6')
 p.locator('form [type=submit]').click();p.wait_for_function("State.payrollStaff[0].postingSchedule?.day===4")
 p.wait_for_function("nativePlans.some(ls=>ls.some(r=>r.id==='e1' && r.cycle==='weekly' && r.day===4))")
 nav('terms');p.locator('#pay-cycle').select_option('monthly');p.locator('[data-last]').click()
 p.locator('#pay-days').fill('25');p.locator('form [type=submit]').click();p.wait_for_function("State.payrollStaff[0].postingSchedule?.day===31")
 nav('leaves');p.locator('[data-leave-new]').click()
 p.locator('[name=start]').fill('2026-10-30');p.locator('[name=days]').fill('3');p.locator('[name=reason]').fill('إجازة عائلية')
 p.locator('#modalBox [type=submit]').click();p.locator('[data-leave-record]').wait_for()
 assert 'إجازة عائلية' in p.locator('[data-leave-record]').inner_text()
 def salary(day,amount,days):
  nav('salary');p.locator('#pay-date').fill(day)
  assert p.locator('#pay-amount').evaluate('e=>e.value')==str(amount),(day,p.locator('#pay-calculation').inner_text())
  assert str(days) in p.locator('#pay-calculation p').filter(has_text='عدد أيام الإجازة').inner_text()
  p.locator('form [type=submit]').click()
  p.wait_for_function("d=>!AppNav.isDirty && !!document.querySelector('[data-edit]') && State.expenses.some(e=>e.date===d && e.payroll?.kind==='salary')",arg=day)
 salary('2026-10-31',276000,2)
 nav('leaves');text=p.locator('[data-leave-record]').inner_text();assert '2026-10-31' in text and 'بانتظار الحسم · 1' in text
 salary('2026-11-30',288000,1)
 nav('leaves');text=p.locator('[data-leave-record]').inner_text();assert '2026-11-30' in text and 'بانتظار الحسم' not in text
 salary('2026-12-31',300000,0)
 days=p.evaluate("""()=>{let r={day:31,cycle:'monthly',from:'2026-01-01',paid:[]};return [
 PayCalendar.due(r,new Date(2026,1,28,9)),PayCalendar.due(r,new Date(2028,1,29,9)),
 PayCalendar.due({...r,cycle:'yearly',day:29,month:2},new Date(2027,1,28,9)),!PayCalendar.due({...r,paid:[['2026-02-01','2026-02-28']]},new Date(2026,1,28,9))]}""");assert all(days)
 p.evaluate("""()=>{const now=new Date(2028,1,29,12);PayReminders.recordDue(now);PayReminders.recordDue(now)}""")
 assert p.evaluate("State.alertCenter.entries.filter(e=>e.id?.endsWith(':2028-02-29')).length")==1
 p.evaluate('StorageEngine.saveState()');p.reload()
 p.wait_for_function("State.payrollStaff?.[0]?.leaves?.length===1")
 assert p.evaluate("State.alertCenter.entries.filter(e=>e.id?.endsWith(':2028-02-29')).length")==1
 nav('terms');p.locator('[data-pay-clear]').click();p.locator('form [type=submit]').click();p.wait_for_function("State.payrollStaff[0].postingSchedule===null")
 p.wait_for_function("nativePlans.length>0 && nativePlans.at(-1).length===0")
 print('PASS reminder picker, native schedules, due dates, history, mixed-period leave deductions and reload')
