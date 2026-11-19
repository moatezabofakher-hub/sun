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
    before=page.evaluate("JSON.stringify(typeof State==='undefined'?Agent.state:State.settings)")
    entry.click()
    assert page.locator('#taTheme154Page').is_visible()
    assert page.locator('[data-theme-choice]').count()==2
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
    print('PASS themes/icons',root,flush=True)
    browser.close()
