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
    sizes=page.evaluate("""async()=>Object.fromEntries(await Promise.all(
        ['modules.webp','gear.webp','report.webp','sale.png','pos.png'].map(async name=>{
            const image=new Image();
            image.src='static/'+name;
            await image.decode();
            return [name,image.naturalWidth];
        })))""")
    assert all(width>=128 for width in sizes.values())
    if employee:
        assert 'report.webp' in page.locator('#nav-reports > span').evaluate("e=>getComputedStyle(e).backgroundImage")
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
    assert page.locator('.ta-cash-register').count()==0
    if not employee:
        page.evaluate("""()=>{State.settings.exchangeRate=100;
            State.currencyExchanges=[
              {id:'fx_buy_test',fromCurrency:'SYP',toCurrency:'USD',fromAmount:1000,toAmount:10,date:'2026-01-01T10:00:00Z'},
              {id:'fx_sale_test',fromCurrency:'USD',toCurrency:'SYP',fromAmount:5,toAmount:700,date:'2026-01-03T10:00:00Z'}];
            State.invoices[0].date='2026-01-02T10:00:00Z';
            State.invoices[1].date='2026-01-04T10:00:00Z';
            State.invoices[2].date='2026-01-01T09:00:00Z';
            AppNav.renderCurrent();}""")
        rows=page.locator('[data-profit-operation]')
        assert rows.evaluate_all('els=>els.map(e=>e.dataset.profitOperation)')==['pos','fx_profit_fx_sale_test','cash','credit']
        assert 'فاتورة بيع نقدية' in rows.nth(2).inner_text()
        assert 'نقطة بيع نقدية' in rows.nth(0).inner_text()
        expected=page.evaluate("Accounting.format(200,'SYP')")
        assert expected in rows.nth(1).inner_text()
        assert expected in page.locator('.ta-usd-profit').inner_text()
        page.evaluate("""()=>{AppNav.stack=[{screen:'reports',params:{tab:'pnl',period:'range',date:'2026-01-04',end:'2026-01-04'}}];AppNav.renderCurrent();}""")
        assert rows.count()==1 and rows.first.get_attribute('data-profit-operation')=='pos'
        page.evaluate("""()=>{AppNav.stack=[{screen:'reports',params:{tab:'cashbox',period:'all'}}];AppNav.renderCurrent();}""")
        assert page.locator('.ta-cash-register').count()==0
    browser.close()
