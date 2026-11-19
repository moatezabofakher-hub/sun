from pathlib import Path
import os
import shutil
import sys
from playwright.sync_api import sync_playwright

web=Path(sys.argv[1]).resolve()
employee='field_agent' in web.parts
browser_path=shutil.which('google-chrome') or shutil.which('chromium') or str(Path(os.environ.get('PROGRAMFILES(X86)',''))/'Microsoft/Edge/Application/msedge.exe')
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=browser_path,args=['--no-sandbox','--allow-file-access-from-files'])
    page=browser.new_page(viewport={'width':390,'height':800})
    page.goto((web/'index.html').as_uri())
    page.wait_for_timeout(450)
    if employee:
        page.evaluate("""()=>{Agent.state=Agent.blank;Agent.state.ops=[
            {id:'cash',kind:'sale',localNumber:'CHECK-CASH',netTotal:42,paidAmount:42,currency:'USD'},
            {id:'pos',kind:'sale',localNumber:'CHECK-POS',source:'agent-pos',netTotal:7,paidAmount:7,currency:'USD'},
            {id:'credit',kind:'sale',localNumber:'CHECK-CREDIT',netTotal:20,paidAmount:0,currency:'USD'}];
            document.querySelector('#screen').innerHTML=Agent.renderReports();}""")
    else:
        page.evaluate("""()=>{State.settings.companyName='QA';State.settings.companySetupCompleted=true;
            document.querySelector('#ta-company-setup-128')?.remove();
            AppNav.stack=[{screen:'settings',params:{}}];AppNav.renderCurrent();}""")
        category=page.locator('.ta-category-link[data-category="invoices"]')
        category.click()
        assert page.locator('#taSettingsPageHeader').is_visible()
        assert page.locator('.ta-category-link:visible').count()==0
        assert page.locator('details.settings-section:visible').count()==1
        page.locator('.ta-settings-page-back').click()
        assert category.is_visible()
        assert page.locator('details.settings-section:visible').count()==0
        page.evaluate("""()=>{const common={type:'sale',date:new Date().toISOString(),currency:'USD',netTotal:12,rows:[]};
            State.invoices=[{...common,id:'cash',number:'CHECK-CASH',paymentMethod:'cash',paidAmount:12},
            {...common,id:'pos',number:'CHECK-POS',source:'windows-pos',paymentMethod:'cash',paidAmount:12},
            {...common,id:'credit',number:'CHECK-CREDIT',paymentMethod:'credit',paidAmount:0}];
            AppNav.stack=[{screen:'reports',params:{tab:'pnl',period:'all'}}];AppNav.renderCurrent();}""")
    register=page.locator('.ta-cash-register')
    assert register.is_visible()
    assert register.locator('li').count()==2
    for label in ['فاتورة بيع نقدية · CHECK-CASH','نقطة بيع نقدية · CHECK-POS']:
        assert label in register.inner_text()
    assert 'CHECK-CREDIT' not in register.inner_text()
    browser.close()
