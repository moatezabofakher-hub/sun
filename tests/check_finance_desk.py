"""Exercise collections, physical till counts and the protected employee action."""
from pathlib import Path
import os, shutil, sys
from playwright.sync_api import sync_playwright
root=Path(sys.argv[1]).resolve()
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium') or str(Path(os.environ.get('PROGRAMFILES(X86)',''))/'Microsoft/Edge/Application/msedge.exe'),args=['--no-sandbox','--allow-file-access-from-files'])
    page=browser.new_page(viewport={'width':470,'height':850})
    page.goto((root/'index.html').as_uri())
    page.wait_for_function("typeof FinanceDesk!=='undefined' && typeof Views!=='undefined'")
    page.evaluate("""()=>{
      State.settings.companySetupCompleted=true;State.settings.companyName='اختبار';
      document.querySelector('#ta-company-setup-128')?.remove();
      State.settings.exchangeRate=15000;State.license.isActivated=true;
      State.invoices=[{id:'due',type:'sale',number:1,date:'2026-01-01',dueDate:'2026-01-05',currency:'USD',exchangeRate:10000,netTotal:10,paidAmount:0,remainingAmount:10,paymentMethod:'credit',accountId:'a',rows:[]}];
      State.accounts=[{id:'a',type:'customer',name:'زبون الاختبار'}];
      State.vouchers=[];State.cashShifts=[];State.expenses=[];State.currencyExchanges=[];
      window.testMain=document.getElementById('mainContent');Views.renderSettings(testMain);
    }""")
    assert not page.locator('#settleFxOnPayment').is_checked()
    page.evaluate("""()=>{const cb=document.getElementById('settleFxOnPayment');cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));if(!State.settings.settleFxOnPayment)throw Error('setting not applied');
      Views.renderReports(testMain,{tab:'cash_shifts'});}""")
    page.locator('#finance-person').fill('أمين الصندوق')
    for c in ['SYP','USD']:page.locator('[data-count="'+c+'"]').fill('0')
    page.locator('#finance-save-shift').click()
    page.wait_for_function("State.cashShifts.length===1")
    page.evaluate("()=>FinanceDesk.invoicePayment('due')")
    page.evaluate("""async()=>{
      const d=VoucherController.draft;
      Object.assign(d,{currency:'SYP',accountCurrency:'USD',amount:75000,exchangeRate:15000});
      VoucherController.recalcClearing();await VoucherController.saveVoucher();
    }""")
    assert page.evaluate("()=>FinanceDesk.remaining(State.invoices[0])")==5
    assert page.evaluate("()=>TiqanyFinance.settlements(State).events[0].gainSyp")==25000
    page.evaluate("()=>Views.renderReports(testMain,{tab:'cash_shifts'})")
    page.locator('#finance-person').fill('مدير الصندوق');page.locator('[data-count="SYP"]').fill('74000');page.locator('[data-count="USD"]').fill('0')
    page.locator('#finance-note').fill('نقص ألف ليرة');page.locator('#finance-save-shift').click()
    page.wait_for_function("State.cashShifts[0].closedAt")
    assert page.evaluate("()=>State.cashShifts[0].difference.SYP")==-1000
    page.evaluate("()=>Views.renderReports(testMain,{tab:'collection',range:'all'})")
    assert 'زبون الاختبار' in page.locator('#mainContent').inner_text()
    if page.evaluate("typeof AgentHub!=='undefined'"):
        page.evaluate("""()=>{AgentHub.renderDetail(testMain,{id:'emp',name:'اختبار',warehouseId:'wh_main'});
         window.testDelete='';FieldSync.confirmRemoveAgent=id=>{window.testDelete=id;};}""")
        button=page.get_by_role('button',name='حذف موظف البيع',exact=True)
        button.click()
        assert page.evaluate('window.testDelete')=='emp'
        assert button.locator('i').get_attribute('class').find('fa-trash')>=0
    browser.close()
print('Finance UI, allocations and physical closing verified')
