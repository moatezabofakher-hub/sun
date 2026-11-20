from playwright.sync_api import sync_playwright
from pathlib import Path
import sys,shutil,os
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=(shutil.which('google-chrome') or shutil.which('chromium') or str(Path(os.environ.get('PROGRAMFILES(X86)',''))/'Microsoft/Edge/Application/msedge.exe')),args=['--no-sandbox','--allow-file-access-from-files'])
 for ed in sys.argv[2:]:
  p=browser.new_page()
  if ed=='employee':
   p.add_init_script("""window.addEventListener('load',()=>{const init=Agent.init;Agent.init=async function(...args){try{return await init.apply(this,args)}finally{window.controlFixtureReady=true}}},{capture:true,once:true});""")
  if ed=='manager':
   p.add_init_script("""window.AndroidManagerPeer={
        selectProfile:()=> 'selected', start:()=> 'ready', serverConfig:()=> '{}', clientStatus:()=> '{}'
   }""")
  p.on('pageerror',lambda e: print('ERROR',str(e)[:100],flush=True))
  root=Path(sys.argv[1])/('web' if ed=='win' else ('field_agent' if ed=='employee' else 'app')+'/src/main/assets/www')
  for w in ((800,1366) if ed=='win' else (320,360,432)):
   p.set_viewport_size({'width':w,'height':700})
   p.goto((root/'index.html').resolve().as_uri());p.wait_for_timeout(130)
   if ed=='employee':
    p.wait_for_function('window.controlFixtureReady===true')
    # Let onload/IndexedDB finish, then render the real activated home screen.
    # Rendering a fragment before init has settled can be overwritten by setup.
    # Read both states atomically: automatic background sync can legitimately
    # change the badge between separate browser automation commands.
    status=p.evaluate("""async()=>{Agent.state=Agent.blank;Agent.state.companyId='qa';Agent.state.key='qa';Agent.ready=()=>true;Agent.active=async()=>true;await Agent.show('home');Agent.markSyncState('connected');const badge=document.getElementById('agentSyncConnection');const connected=badge?.dataset.connected;Agent.markSyncState('offline');const offline=badge?.dataset.connected;return {connected,offline}}""")
    assert status=={'connected':'true','offline':'false'},status
   else:
    p.evaluate("()=>{State.settings.companyName='QA';State.settings.companySetupCompleted=true;document.querySelector('#ta-company-setup-128')?.remove();AppNav.stack=[{screen:'dashboard',params:{}}];AppNav.renderCurrent();}")
   p.wait_for_timeout(100)
   p.wait_for_function("()=>{const images=[...document.querySelectorAll('img.ta-voucher-art')];return images.length===2&&images.every(i=>i.complete&&i.naturalWidth>0)}",timeout=5000)
   if ed in ('manager','win','solo'):
    vals=p.evaluate("""()=>{let ids=['headerExitBtn','headerSettingsBtn','headerNotificationsBtn','headerNotificationsCount','ta-desktop-phone-connection','salesStaffCounterButton','ta-manager-phone-connection','topBarRateButton'];let badge=document.querySelector('#headerNotificationsCount');badge.hidden=false;badge.textContent='99+';return Object.fromEntries(ids.map(k=>[k,document.getElementById(k)]).filter(([,e])=>e).map(([k,e])=>{let r=e.getBoundingClientRect();return [k,[Math.round(r.left),Math.round(r.right),Math.round(r.height)]]}));}""")
    print(ed,w,vals,flush=True)
    badge=vals['headerNotificationsCount'];bell=vals['headerNotificationsBtn']
    assert badge[2]>0 and bell[0]<=badge[0] and badge[1]<=bell[1]+1
    if ed=='manager':
     slots=[vals[k] for k in ('ta-desktop-phone-connection','salesStaffCounterButton','ta-manager-phone-connection')]
     assert all(v[2]>0 for v in slots) and slots[0][0]>=slots[1][1] and slots[1][0]>=slots[2][1]
     # The three fixed slots retain a visible pale-red offline lamp and bright-green online lamp.
     lamps=p.evaluate("""()=>{const entries=[['ta-desktop-phone-connection','ta-link-online'],['salesStaffCounterButton','has-staff'],['ta-manager-phone-connection','ta-manager-online']];return entries.map(([id,flag])=>{const btn=document.getElementById(id);btn.classList.remove(flag);const offline=getComputedStyle(btn).getPropertyValue('--lamp').trim();btn.classList.add(flag);const online=getComputedStyle(btn).getPropertyValue('--lamp').trim();btn.classList.remove(flag);return {id,offline,online};});}""")
     assert all(v['offline']=='#ff9b9f' and v['online']=='#52e798' for v in lamps),lamps
   if ed=='win':
    assert vals['headerExitBtn'][0]>=vals['headerSettingsBtn'][1]-1
    assert vals['headerSettingsBtn'][0]>=bell[1]-1
    assert vals['topBarRateButton'][0] <= 25
    assert p.locator('.ta-rate-label').inner_text()=='سعر الصرف'
   if ed=='employee':
    # Large unread counts must stay entirely within the employee bell.
    badge_geometry=p.evaluate("""()=>{const bell=document.getElementById('agentManagerNotifications'),count=document.getElementById('agentManagerNotificationCount');bell.hidden=false;count.hidden=false;count.textContent='99+';const a=bell.getBoundingClientRect(),b=count.getBoundingClientRect();return {bell:[a.left,a.right,a.top,a.bottom],badge:[b.left,b.right,b.top,b.bottom],overflow:getComputedStyle(bell).overflow};}""")
    b=badge_geometry['bell'];n=badge_geometry['badge']
    assert n[1]>n[0] and n[3]>n[2] and b[0]-1<=n[0] and n[1]<=b[1]+1 and b[2]-1<=n[2] and n[3]<=b[3]+1,badge_geometry
    assert badge_geometry['overflow']=='visible',badge_geometry
   if ed!='employee':
    result=p.evaluate("""()=>{let saved=0,discarded=0;for(const id of ['dlgSaveBtn','dlgDiscardBtn']){UI.showUnsavedDialog(()=>saved++,()=>discarded++);let box=document.querySelector('#dialogBox');if(box.querySelector('.ta-decision-title').textContent!=='هل تريد حفظ التغييرات قبل الخروج؟')throw Error('Missing prompt');if(box.querySelector('#dlgSaveBtn').textContent!=='نعم'||box.querySelector('#dlgDiscardBtn').textContent!=='لا')throw Error('Wrong decisions');document.getElementById(id).click()}return [saved,discarded]}""")
    assert result==[1,1]
   if ed!='employee':
    p.evaluate("""()=>{AppNav.stack=[{screen:'dashboard',params:{}},{screen:'expenses',params:{}}];AppNav.renderCurrent();const input=document.getElementById('expenseAmount');input.value='23';input.dispatchEvent(new Event('input',{bubbles:true}));AppNav.handleBackButton();}""")
    assert p.locator('#dlgDiscardBtn').is_visible()
    p.evaluate("AppNav.handleBackButton()")
    assert p.locator('#dialogContainer').is_hidden() and p.locator('#expenseAmount').input_value()=='23'
    assert p.evaluate("AppNav.current().screen")=='expenses'
    p.evaluate("AppNav.handleBackButton()")
    assert p.locator('#dlgDiscardBtn').is_visible()
    yes,no=p.evaluate("""()=>['#dlgSaveBtn','#dlgDiscardBtn'].map(selector=>document.querySelector(selector).getBoundingClientRect().toJSON())""")
    assert abs(yes['y']-no['y'])<=1 and yes['x']>=no['x']+no['width']-1,(yes,no)
    p.locator('#dlgDiscardBtn').evaluate('(e)=>e.click()')
    assert p.evaluate('AppNav.current().screen')=='dashboard'
    p.evaluate("""()=>{AppNav.stack=[{screen:'dashboard',params:{}},{screen:'expenses',params:{}}];AppNav.renderCurrent();AppNav.handleBackButton();}""")
    assert p.evaluate('AppNav.current().screen')=='dashboard'
   if ed=='employee':
    p.evaluate("""async()=>{Agent.ready=()=>true;Agent.active=async()=>true;Agent.stack=['home','voucher'];Agent.voucherKind='receipt';await Agent.show('voucher');let amount=document.getElementById('vAmount');amount.value='17';amount.dispatchEvent(new Event('input',{bubbles:true}));await Agent.goBack()}""")
    decision=p.locator('#taAgentSettingsDecision')
    assert decision.locator('[data-answer=save]').inner_text()=='نعم'
    p.evaluate("Agent.goBack()")
    assert decision.count()==0 and p.locator('#vAmount').input_value()=='17'
    assert p.evaluate("Agent.screen")=='voucher'
    p.evaluate("Agent.goBack()")
    assert decision.locator('[data-answer=save]').is_visible()
    yes,no=p.evaluate("""()=>['[data-answer=save]','[data-answer=discard]'].map(selector=>document.querySelector(selector).getBoundingClientRect().toJSON())""")
    assert abs(yes['y']-no['y'])<=1 and yes['x']>=no['x']+no['width']-1,(yes,no)
    decision.locator('[data-answer=discard]').evaluate('(e)=>e.click()')
    p.wait_for_function("Agent.screen==='home'")
   if ed=='manager':
    for button,category in [('ta-desktop-phone-connection','mobile-computer-sync'),('ta-manager-phone-connection','manager-manager-sync'),('ta-desktop-phone-connection','mobile-computer-sync')]:
     p.locator('#'+button).click()
     panel=p.locator('details.ta-settings-active-section[data-settings-section="'+category+'"] .settings-section-body')
     assert panel.is_visible(),(ed,w,category,p.locator('#mainContent').inner_text()[:220])
     assert p.locator('details.ta-settings-active-section:visible').count()==1
    p.locator('.ta-settings-page-back').click()
    assert p.locator('.ta-category-link[data-category="mobile-computer-sync"]').is_visible()
   print('PASS',ed,w,flush=True)
