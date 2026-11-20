"""3.5.155 visual QA: unique illustrations, retained Classic and Royal theme, and Back safety."""
from pathlib import Path
import base64
import re
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
def check_nav_contrast(page, theme, screen):
    nav = page.locator('#bottom.bottom' if employee else 'nav.ta-bottom-nav')
    states = nav.locator('button:visible').evaluate_all("""buttons =>
        buttons.map(b => b.matches('.active,.is-active,[aria-current="page"]'))""")
    assert any(states) and not all(states), (theme, screen, states)
    captions = nav.locator('button:visible' if employee else 'button.nav-btn:visible > span')
    check_text_contrast(page, nav, captions, ('Nav contrast', theme, screen))

def check_text_contrast(page, surface, captions, context):
    """Measure the text against the rendered surface directly behind it."""
    surface.scroll_into_view_if_needed()
    labels = captions.evaluate_all(r"""(nodes, origin) => nodes.map(label => {
        const node = [...label.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
        const range = document.createRange();
        range.selectNodeContents(node);
        const points = [...range.getClientRects()].filter(r => r.width && r.height).flatMap(r =>
            [0.15, 0.5, 0.85].map(x => [r.left-origin.x+x*r.width, r.top-origin.y+r.height/2]));
        const style = getComputedStyle(label);
        const button = label.closest('button');
        const opacity = Number(style.opacity) * (button && label !== button ? Number(getComputedStyle(button).opacity) : 1);
        const ink = style.webkitTextFillColor.match(/[\d.]+/g).map(Number);
        return {caption:node.textContent.trim(), ink, opacity, points};
    })""", surface.bounding_box())
    assert labels and all(label['points'] for label in labels), (context, labels)
    # Mask only the characters so gradients and badge backgrounds remain measurable.
    old_styles = captions.evaluate_all("""nodes => nodes.map(e => {
        const old = e.getAttribute('style');
        e.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
        return old;
    })""")
    try:
        png = base64.b64encode(surface.screenshot(animations='disabled', scale='css')).decode('ascii')
    finally:
        captions.evaluate_all("""(nodes, old) => nodes.forEach((e,i) => {
            if (old[i] === null) e.removeAttribute('style');
            else e.setAttribute('style', old[i]);
        })""", old_styles)
    ratios = page.evaluate("""async ({png, labels}) => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + png;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d', {willReadFrequently:true});
        ctx.drawImage(image, 0, 0);
        const luminance = rgb => {
            const channels = rgb.slice(0,3).map(v => v/255).map(v => v <= 0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4);
            return 0.2126*channels[0] + 0.7152*channels[1] + 0.0722*channels[2];
        };
        return labels.map(({ink, opacity, points}) => Math.min(...points.map(([x,y]) => {
            const bg = Array.from(ctx.getImageData(Math.floor(x),Math.floor(y),1,1).data);
            const alpha = opacity * (ink[3] ?? 1);
            const a = luminance(ink.slice(0,3).map((v,i) => alpha*v + (1-alpha)*bg[i]));
            const b = luminance(bg);
            return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
        })));
    }""", {'png': png, 'labels': labels})
    for label, ratio in zip(labels, ratios):
        assert ratio >= 4.5, (context, label['caption'], ratio)
    print(*context, page.viewport_size['width'], round(min(ratios), 2), flush=True)


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
    assert page.locator('[data-theme-choice]').count()==3
    assert page.locator('#taTheme154Page:modal').count()==1
    page.get_by_role('button',name='البترولي والنحاسي',exact=False).click()
    assert page.evaluate('TiqanyTheme154.current()')=='petrol'
    page.locator('.ta-theme154-save').click()
    assert page.evaluate("localStorage.getItem('tiqany.ui.theme.154')")=='petrol'
    page.evaluate("localStorage.removeItem('tiqany.ui.theme.154')")
    page.reload()
    page.wait_for_function("TiqanyTheme154.current()==='classic'")
    if employee:
        page.evaluate("()=>{Agent.state=Agent.blank;Agent.screen='settings';document.querySelector('#screen').innerHTML=Agent.renderSettings()}")
    else:
        page.evaluate("()=>{State.settings.companyName='QA';State.settings.companySetupCompleted=true;document.querySelector('#ta-company-setup-128')?.remove();AppNav.stack=[{screen:'settings',params:{}}];AppNav.renderCurrent()}")
    before=page.evaluate("JSON.stringify(typeof State==='undefined'?Agent.state:State.settings)")
    entry.click()
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
        page.evaluate("""async()=>{
            Agent.ready=()=>true;Agent.active=async()=>true;
            Agent.state.companyId='qa';
            Agent.state.managerNotifications=[
              {id:'received',title:'تعديل سعر الصرف',detail:'حدّث المدير سعر الصرف',at:'2026-11-18T09:10:00Z',read:false},
              {id:'seen',title:'تحديث مستودع السيارة',detail:'وصلت مناقلة المواد إلى مستودع الموظف',at:'2026-11-18T08:00:00Z',read:true}
            ];
            await Agent.navigate('home');
        }""")
        bell=page.locator('#agentManagerNotifications')
        for width in (320,390,432):
            page.set_viewport_size({'width':width,'height':840})
            first=None
            for route in ('home','invoice','reports','settings'):
                page.evaluate('route=>Agent.show(route)',route)
                rects=page.evaluate("""()=>['.mark','#agentManagerNotifications','#agentSyncConnection','.brandcopy','#agentRateQuick'].map(selector=>{
                    const el=document.querySelector('#agentHeader .brand '+selector), r=el.getBoundingClientRect();
                    return {x:r.x,y:r.y,r:r.right,b:r.bottom,w:r.width,h:r.height};
                })""")
                truck,alarm,link=rects[:3]
                assert all(el['w']>0 and el['h']>0 and el['x']>=0 and el['r']<=width+1 for el in rects), (route,rects)
                assert truck['x']>=alarm['r'] and alarm['x']>=link['r'], (route,rects)
                assert all(a['x']>=b['r'] or b['x']>=a['r'] or a['y']>=b['b'] or b['y']>=a['b'] for i,a in enumerate(rects) for b in rects[i+1:]), (route,rects)
                positions=[el['x'] for el in rects[:3]]
                assert first is None or first==positions,(route,first,positions)
                first=positions
        page.set_viewport_size({'width':390,'height':840})
        notification_panel = page.locator('.ta-manager-notification-panel')
        bell.click()
        notification_panel.wait_for()
        for theme in ('classic','royal'):
            page.evaluate("t=>document.documentElement.dataset.taTheme=t",theme)
            for card in page.locator('.ta-manager-notification').all():
                check_text_contrast(page,card,card.locator('strong, small, time'),('Employee notifications',theme))
            capture(theme+'-employee-notifications')
            page.locator('.ta-manager-notification').first.click()
            detail=page.locator('.ta-notification-detail')
            detail.wait_for()
            check_text_contrast(page,detail,detail.locator('h3, p, bdi, button'),('Employee notice detail',theme))
            assert bell.is_visible() and page.locator('#agentSyncConnection').is_visible()
            page.evaluate('Agent.goBack()')
            assert page.locator('.ta-manager-notification').count()==2
        badge=page.locator('#agentManagerNotificationCount')
        assert badge.is_visible() and badge.inner_text()=='0'
        page.evaluate('Agent.goBack()')

    if not employee:
        page.evaluate("""() => {
            const at = '2026-11-18T20:56:24Z';
            ManagerNotifications.ensure().entries = [
                {id:'qa-read', type:'sync', read:true, at, title:'توقفت مزامنة المدير والكمبيوتر', detail:'تعذّر الاتصال بالكمبيوتر على الشبكة المحلية.'},
                {id:'qa-new', type:'sync', read:false, at, title:'انقطع اتصال موظف البيع', detail:'سيحاول التطبيق المزامنة بعد عودة الاتصال بالشبكة.'},
                {id:'qa-stock', type:'stock', read:false, at, title:'نفدت كمية مادة', detail:'المستودع الرئيسي · الرصيد الحالي صفر'}
            ];
            AppNav.navigate('dashboard');
        }""")
        page.locator('#headerNotificationsBtn').click()
        cards = page.locator('#mainContent .ta-alert-item')
        cards.first.wait_for(state='visible')
        assert cards.count() == 3, page.locator('#mainContent').inner_text()
        variants = ('.ta-alert-item:not(.unread)', '.ta-alert-item.unread:not(.stock-alert)', '.ta-alert-item.stock-alert')
        for theme in ('classic', 'royal'):
            page.evaluate("theme => document.documentElement.dataset.taTheme = theme", theme)
            for width in (320, 390):
                page.set_viewport_size({'width': width, 'height': 840})
                for variant in variants:
                    card = page.locator('#mainContent').locator(variant)
                    captions = card.locator('.ta-alert-title, .ta-alert-detail, .ta-alert-meta, .ta-alert-meta bdi, .ta-alert-badge')
                    assert card.locator('.ta-alert-badge').count() == int('unread' in card.get_attribute('class').split())
                    check_text_contrast(page, card, captions, ('Notification contrast', theme, variant))
            cards.first.scroll_into_view_if_needed()
            capture(theme+'-notifications')
        page.get_by_role('button', name='تحديد الكل كمقروء').click()
        page.wait_for_function("document.querySelectorAll('#mainContent .ta-alert-item.unread').length === 0")
        assert cards.count() == 3 and page.locator('.ta-alert-badge').count() == 0
    for theme in ('classic','royal','petrol'):
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
            # Manager variants reserve some secondary screens for the workspace and hide the dock.
            nav = page.locator('#bottom.bottom' if employee else 'nav.ta-bottom-nav')
            if screen == 'home' or (screen == 'reports' and nav.is_visible()):
                initial_size = page.viewport_size
                for width in (320, 390, 432):
                    page.set_viewport_size(dict(initial_size, width=width))
                    check_nav_contrast(page, theme, screen)
                page.set_viewport_size(initial_size)
            if theme=='royal' and screen=='invoice':
                field=surface.locator('.ta-invoice-field').first
                assert field.is_visible()
                assert field.evaluate("e=>getComputedStyle(e.querySelector('label')).color")=='rgb(239, 250, 255)'
                balance=surface.locator('.ta-balance-tile').first
                assert balance.is_visible()
                assert 'rgb(25, 62, 96)' in balance.evaluate('e=>getComputedStyle(e).backgroundImage')
            if screen=='reports' and not employee:
                badge=surface.locator('.ta-capital-card .ta-capital-icon').first
                assert badge.is_visible(), 'Missing shareholder badge'
                art=badge.evaluate("e=>getComputedStyle(e).backgroundImage")
                assert 'partners.webp' in art, (theme,art)
                assert page.evaluate("""async()=>{const img=new Image();img.src='static/partners.webp';
                    await img.decode();return img.naturalWidth>0;}""")
            if employee and screen=='home':
                def tile(action):
                    return surface.locator('button[onclick="'+action+'"]').bounding_box()
                pos=tile('Agent.startPOS()')
                sale=tile("Agent.startInvoice('sale')")
                ret=tile("Agent.startInvoice('sale_return')")
                receipt=tile("Agent.startVoucher('receipt')")
                payment=tile("Agent.startVoucher('payment')")
                assert pos['x']+pos['width']<=sale['x']+1 and abs(pos['y']-sale['y'])<=1,(pos,sale)
                assert abs(pos['y']+pos['height']-ret['y']-ret['height'])<=1,(pos,ret)
                assert abs(receipt['y']-payment['y'])<=1,(receipt,payment)
            capture(theme+'-'+screen)
            if screen=='invoice':
                footer=surface.locator('.ta-agent-invoice-save-footer' if employee else '.ta-invoice-save-footer')
                if root.name!='web':
                    for glyph in ('.fa-warehouse', '.fa-tags'):
                        surface.locator('.ta-quick-picker__face '+glyph+' svg').first.wait_for(state='visible')
                old_size=page.viewport_size
                for width in ((800,1280) if root.name=='web' else (320,390)):
                    page.set_viewport_size({'width':width,'height':640})
                    for at_end in (False,True):
                        surface.evaluate('''(e,end)=>{
                            const y=end?e.scrollHeight:0;
                            e.scrollTop=y;
                            window.scrollTo(0,end?document.documentElement.scrollHeight:0);
                        }''',at_end)
                        metrics=footer.evaluate('''e=>{
                            const r=e.getBoundingClientRect(), style=getComputedStyle(e);
                            const buttons=e.querySelector('.ta-footer-actions').getBoundingClientRect();
                            return {edge:Math.abs(innerHeight-r.bottom), gap:r.bottom-buttons.bottom,
                                    base:style.backgroundColor, width:r.width, viewport:innerWidth};
                        }''')
                        assert metrics['edge']<=2 and 0<=metrics['gap']<=14,(theme,width,metrics)
                        assert metrics['width']<=metrics['viewport']+1 and metrics['base'] not in ('transparent','rgba(0, 0, 0, 0)'),metrics
                if not employee:
                    channel=surface.locator('select[onchange*="cashChannel"]')
                    channel.wait_for(state='attached')
                    surface.evaluate('e=>e.scrollTop=e.scrollHeight')
                    assert channel.bounding_box()['y']+channel.bounding_box()['height']<=footer.bounding_box()['y']+1, (theme, "Payment channel covered by footer")
                    channel.select_option('transfer')
                    assert page.evaluate('InvoiceController.draft.cashChannel')=='transfer'
                    channel.select_option('cash')
                page.set_viewport_size(old_size)
        for kind in ('receipt','payment'):
            if employee:
                page.evaluate("async kind=>{Agent.startVoucher(kind);await Agent.show('voucher')}",kind)
            else:
                page.evaluate("kind=>AppNav.navigate('voucher_form',{type:kind})",kind)
                if kind=='receipt':
                    discard=page.locator('#dialogContainer[data-dialog-type="unsaved"] #dlgDiscardBtn')
                    discard.click(timeout=5000)
                assert page.evaluate('AppNav.current().screen')=='voucher_form'
            cancel=page.locator('.ta-agent-voucher-cancel' if employee else '.ta-voucher-cancel-action').first
            cancel.wait_for(state='visible')
            assert cancel.get_attribute('data-action-tone')=='negative',(theme,kind)
            paint=cancel.evaluate('''e=>{
                const style=getComputedStyle(e);
                return {fill:style.backgroundImage+' '+style.backgroundColor, ink:style.webkitTextFillColor};
            }''')
            stops=[tuple(map(int,m)) for m in re.findall(r'rgb\((\d+), (\d+), (\d+)\)',paint['fill'])]
            assert stops and all(r>1.4*g and r>1.2*b for r,g,b in stops),(theme,kind,paint)
            assert paint['ink']=='rgb(255, 255, 255)',(theme,kind,paint)
            capture(theme+'-voucher-'+kind)

    # Exercise active POS row controls on real drafts at phone and desktop sizes.
    page.set_viewport_size({'width':1100 if root.name=='web' else 360,'height':760})
    page.evaluate("""async employee=>{
      const units=[{name:'قطعة',factor:1,wholesalePrice:5},{name:'كرتونة',factor:6,wholesalePrice:30}];
      const item={id:'ui-pos-product',name:'مادة الاختبار',currency:'USD',units,openingStockBase:100,stockBase:100};
      const row={itemId:item.id,itemName:item.name,unitName:'قطعة',unitFactor:1,qty:2,price:5,total:10,basePrice:5,baseCurrency:'USD'};
      if(employee){
        await Agent.show('home');Agent.state.items=[item];Agent.draft=[];
        await Agent.startPOS();Agent.draft=[{...row}];await Agent.show('invoice');
      }else{
        State.items=[item];AppNav.clearDirty();AppNav.navigate('pos');
        InvoiceController.draft.rows=[{...row}];InvoiceController.recalculate();
        POSController.paint(document.getElementById('mainContent'));
      }
    }""",employee)
    line=page.locator('.agent-pos-line' if employee else '.pos-line').first
    unit=line.locator('select')
    remove=line.get_by_role('button',name='حذف المادة' if employee else 'حذف الصنف')
    assert remove.locator('svg').is_visible()
    if employee:
        assert line.locator('.agent-pos-line-top select').count()==1
        assert line.locator('.agent-pos-line-fields > .ta-pos-delete').count()==1
    else:
        assert remove.bounding_box()['x']+remove.bounding_box()['width']<=unit.bounding_box()['x']+1
    unit.select_option('كرتونة')
    page.wait_for_function("employee=>(employee?Agent.draft:InvoiceController.draft.rows)[0].unitName==='كرتونة'",arg=employee)
    line.evaluate("e=>e.scrollIntoView({block:'center',behavior:'instant'})")
    capture('petrol-pos-row')
    remove.click()
    page.wait_for_function("employee=>(employee?Agent.draft:InvoiceController.draft.rows).length===0",arg=employee)

    print('PASS themes/icons',root,flush=True)
    browser.close()
