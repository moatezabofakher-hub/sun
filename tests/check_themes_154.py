"""3.5.154 visual QA: unique illustrations, retained Classic and Royal theme, and Back safety."""
from pathlib import Path
import os
import shutil
import sys
from playwright.sync_api import sync_playwright

root=Path(sys.argv[1]).resolve()
employee='field_agent' in root.parts
exe=shutil.which('google-chrome') or shutil.which('chromium') or str(Path(os.environ.get('PROGRAMFILES(X86)',''))/'Microsoft/Edge/Application/msedge.exe')
assert (root/'static/ta-themes-154.js').is_file()
assert (root/'static/ta-themes-154.css').is_file()
assets=['desktop-link','managers-link','profiles','company','backup','themes','activation','data-reset']
for asset in assets:
    assert (root/'static'/('ta-art-'+asset+'-154.svg')).is_file(),asset
with sync_playwright() as playwright:
    browser=playwright.chromium.launch(executable_path=exe,args=['--no-sandbox','--allow-file-access-from-files'])
    page=browser.new_page(viewport={'width':390 if employee else 420,'height':840})
    page.goto((root/'index.html').as_uri())
    page.wait_for_timeout(500)
    assert page.evaluate("typeof TiqanyTheme154")=='object', 'theme module did not load'
    # The previous selection is persistent per app/device, never mirrored into company settings.
    page.evaluate("localStorage.removeItem('tiqany.ui.theme.154');document.documentElement.setAttribute('data-ta-theme','classic')")
    if employee:
        page.evaluate("""()=>{Agent.state=Agent.blank;Agent.screen='settings';document.querySelector('#screen').innerHTML=Agent.renderSettings();}""")
    else:
        page.evaluate("""()=>{State.settings.companyName='QA';State.settings.companySetupCompleted=true;
          document.getElementById('ta-company-setup-128')?.remove();
          AppNav.stack=[{screen:'settings',params:{}}];AppNav.renderCurrent();}""")
    entry=page.locator('#taTheme154Entry')
    assert entry.is_visible(), 'Themes menu option missing'
    if employee:
        assert page.locator('.ta-agent-settings-link[data-ta-art]').count()>=4,'Employee settings icons not differentiated'
    else:
        cats=page.locator('.ta-category-link[data-ta-art]')
        assert cats.count()>=9, 'Settings category art not assigned'
        for key,art in [('business-profiles','profiles'),('company','company'),('backup','backup')]:
            button=page.locator(f'.ta-category-link[data-category="{key}"]')
            assert button.get_attribute('data-ta-art')==art,(key,art)
            bg=button.evaluate('e=>getComputedStyle(e,"::before").backgroundImage')
            assert 'ta-art-'+art+'-154.svg' in bg,bg
        if page.locator('.ta-category-link[data-category="mobile-computer-sync"]').count():
            assert page.locator('.ta-category-link[data-category="mobile-computer-sync"]').get_attribute('data-ta-art')=='desktop-link'
        if page.locator('.ta-category-link[data-category="manager-manager-sync"]').count():
            assert page.locator('.ta-category-link[data-category="manager-manager-sync"]').get_attribute('data-ta-art')=='managers-link'
    icons=page.evaluate("""async()=>await Promise.all(['desktop-link','managers-link','profiles','company','backup','themes','activation'].map(async k=>{
       const a=new Image();a.src='static/ta-art-'+k+'-154.svg';await a.decode();return [k,a.naturalWidth,a.naturalHeight]
    }))""")
    assert all(w>=100 and h>=100 for _,w,h in icons),icons
    def capture(name):
        if os.environ.get('CI'):
            folder=Path(os.environ['RUNNER_TEMP'])/'theme-review'
            folder.mkdir(exist_ok=True)
            page.screenshot(path=str(folder/(name+'.png')), animations='disabled')
    capture('classic-settings')
    before=page.evaluate("JSON.stringify(typeof State==='undefined'?Agent.state:State.settings)")
    entry.click()
    assert page.locator('#taTheme154Page').is_visible()
    assert page.locator('[data-theme-choice]').count()==2
    assert page.locator('#taTheme154Page:modal').count()==1
    entry.evaluate("e=>e.focus()")
    assert page.evaluate("document.querySelector('#taTheme154Page').contains(document.activeElement)")
    page.keyboard.press('Tab')
    assert page.evaluate("!document.activeElement.closest('#mainContent,#screen')")
    page.locator('[data-theme-choice="royal"]').click()
    assert page.evaluate("TiqanyTheme154.current()")=='royal'
    assert 'gradient' in page.evaluate("getComputedStyle(document.body).backgroundImage")
    page.locator('.ta-theme154-cancel').click()
    assert page.evaluate("TiqanyTheme154.current()")=='classic', 'Cancel must revert preview'
    assert page.evaluate("localStorage.getItem('tiqany.ui.theme.154')") is None
    entry.click()
    page.locator('[data-theme-choice="royal"]').click()
    page.locator('.ta-theme154-save').click()
    assert page.evaluate("localStorage.getItem('tiqany.ui.theme.154')")=='royal'
    assert page.evaluate("JSON.stringify(typeof State==='undefined'?Agent.state:State.settings)")==before, 'Changing theme must not mutate accounting settings'
    # Refresh demonstrates the selected theme survives restart.
    page.reload()
    page.wait_for_timeout(500)
    assert page.evaluate("TiqanyTheme154.current()")=='royal', 'Selected theme was not reloaded'
    if employee:
        page.evaluate("""()=>{Agent.state=Agent.blank;Agent.screen='settings';document.querySelector('#screen').innerHTML=Agent.renderSettings();}""")
    else:
        page.evaluate("""()=>{State.settings.companyName='QA';State.settings.companySetupCompleted=true;
          document.querySelector('#ta-company-setup-128')?.remove();
          AppNav.stack=[{screen:'settings',params:{}}];AppNav.renderCurrent();}""")
    page.wait_for_selector('#taTheme154Entry')
    support=page.locator('button.ta-support-launch').first
    assert 'rgb(25, 62, 96)' in support.evaluate('e=>getComputedStyle(e).backgroundImage')
    capture('royal-settings')
    if employee:
        hero=page.locator('#screen .hero').first
        assert 'rgb(25, 62, 96)' in hero.evaluate('e=>getComputedStyle(e).backgroundImage')
    else:
        invoices=page.locator('.ta-category-link[data-category="invoices"]')
        invoices.click()
        footer=page.locator('.ta-settings-active-section .ta-settings-section-footer').first
        assert 'rgb(25, 62, 96)' in footer.evaluate('e=>getComputedStyle(e).backgroundImage')
        capture('royal-invoice-settings')
        page.locator('.ta-settings-page-back').click()
        page.evaluate("document.getElementById('topBarRateButton').click()")
        assert page.locator('#modalRateInput').is_visible()
        assert 'rgb(25, 62, 96)' in page.locator('#modalBox').evaluate('e=>getComputedStyle(e).backgroundImage')
        title=page.locator('#modalBox h3').first
        assert title.evaluate('e=>getComputedStyle(e).color')=='rgb(239, 250, 255)'
        page.wait_for_function("getComputedStyle(document.querySelector('#modalBox')).opacity==='1'")
        capture('royal-transaction-rate')
        # Failure must leave both the active rate and the form available for retry.
        page.evaluate("""async()=>{const save=StorageEngine.saveState,previous=State.settings.exchangeRate;
          try{
            StorageEngine.saveState=async()=>{throw Error('write failed')};
            document.querySelector('#modalRateInput').value=Number(previous)+1;
            await UI.saveQuickRate();
            if(State.settings.exchangeRate!==previous||!document.querySelector('#modalRateInput')?.isConnected)
              throw Error('Rate changed after failed persistence');
          }finally{StorageEngine.saveState=save;}
        }""")
        page.evaluate("UI.forceCloseModal()")
    page.locator('#taTheme154Entry').click()
    page.locator('[data-theme-choice="classic"]').click()
    # Native Back must cancel the unsaved preview without navigating out of Settings.
    if employee:
        page.evaluate("Agent.goBack()")
    else:
        page.evaluate("AppNav.handleBackButton()")
    assert page.evaluate("TiqanyTheme154.current()")=='royal'
    assert page.locator('#taTheme154Page').count()==0
    page.locator('#taTheme154Entry').click()
    page.locator('[data-theme-choice="classic"]').click()
    page.locator('.ta-theme154-save').click()
    assert page.evaluate("localStorage.getItem('tiqany.ui.theme.154')")=='classic'
    page.evaluate("document.querySelector('#toastContainer')?.replaceChildren()")
    if employee:
        page.evaluate("Agent.ready=()=>true;Agent.active=async()=>true")
    for theme in ('classic','royal'):
        page.evaluate("theme=>document.documentElement.dataset.taTheme=theme",theme)
        for screen in ('home','reports','invoice'):
            if employee:
                if screen=='invoice':
                    page.evaluate("async()=>{Agent.startInvoice('sale');await Agent.show('invoice')}")
                else:
                    page.evaluate("route=>Agent.show(route)",screen)
            else:
                page.evaluate("""screen=>{
                  const route={home:'dashboard',invoice:'invoice_form',reports:'reports'}[screen];
                  AppNav.stack=[{screen:route,params:screen==='reports'?{tab:'pnl',period:'all'}:{type:'sale'}}];
                  AppNav.renderCurrent();
                }""",screen)
            surface=page.locator('#screen' if employee else '#mainContent')
            assert surface.is_visible() and surface.inner_text().strip(),screen
            if theme=='royal' and screen=='invoice':
                field=surface.locator('.ta-invoice-field').first
                assert field.is_visible()
                assert field.evaluate("e=>getComputedStyle(e.querySelector('label')).color")=='rgb(239, 250, 255)'
                balance=surface.locator('.ta-balance-tile').first
                assert balance.is_visible()
                assert 'rgb(25, 62, 96)' in balance.evaluate('e=>getComputedStyle(e).backgroundImage')
            capture(theme+'-'+screen)
    print('PASS themes/icons',root,flush=True)
    browser.close()
