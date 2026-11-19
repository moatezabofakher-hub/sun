"""Exercise the packaged screens, their scroll containers and the final theme cascade."""
from pathlib import Path
import os,shutil,sys
from playwright.sync_api import sync_playwright
root=Path(sys.argv[1])
edition=sys.argv[2]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=(shutil.which('google-chrome') or shutil.which('chromium') or str(Path(os.environ.get('PROGRAMFILES(X86)',''))/'Microsoft/Edge/Application/msedge.exe')),args=['--no-sandbox','--allow-file-access-from-files'])
    page=browser.new_page(viewport={'width':1200 if edition=='win' else 390,'height':640})
    page.goto((root/'index.html').resolve().as_uri())
    agent=edition=='agent'
    page.wait_for_function("()=>typeof Agent!=='undefined' && !!Agent.state" if agent else "()=>typeof State!=='undefined' && typeof AppNav!=='undefined' && typeof TiqanyFxUI!=='undefined'")
    page.evaluate("""async employee=>{
      const notes=Array.from({length:26},(_,i)=>({id:'n'+i,type:'stock',kind:'stock',title:'إشعار '+i,detail:'تفاصيل '+i,at:new Date(1700000000000+i*60000).toISOString(),read:false}));
      if(employee){
        Agent.ready=()=>true;Agent.active=async()=>true;Agent.save=async()=>{};
        Agent.state.companyId='qa';Agent.state.managerNotifications=notes;await Agent.show('manager_notifications');
      }else{
        State.settings.companyName='QA';State.settings.companySetupCompleted=true;document.querySelector('#ta-company-setup-128')?.remove();
        AppNav.stack=[{screen:'dashboard',params:{}}];AppNav.renderCurrent();
        const center=typeof ManagerNotifications!=='undefined'?ManagerNotifications:StockNotifications;
        center.ensure().entries=notes;AppNav.navigate('notifications');
      }
    }""",agent)
    cards=page.locator('[data-notice-list] > button')
    assert cards.count()==10 and 'إشعار 25' in cards.first.inner_text(), (edition,cards.count())
    def scroll_to_end():
        page.evaluate("""()=>{const list=document.querySelector('[data-notice-list]');let s=list.parentElement;
          while(s && s!==document.body && !(/^(auto|scroll|overlay)$/.test(getComputedStyle(s).overflowY)&&s.scrollHeight>s.clientHeight+1))s=s.parentElement;
          if(!s||s===document.body)s=document.scrollingElement;s.scrollTop=s.scrollHeight;
          (s===document.scrollingElement?document:s).dispatchEvent(new Event('scroll'))}""")
    for n in (20,26):
        scroll_to_end()
        page.wait_for_function('n=>document.querySelectorAll("[data-notice-list]>button").length===n',arg=n,timeout=4000)
    for theme in ('classic','royal'):
        page.evaluate('v=>document.documentElement.dataset.taTheme=v',theme)
        colors=cards.first.evaluate("""b=>{
          const nums=s=>(s.match(/[\\d.]+/g)||[]).slice(0,3).map(Number);
          const lum=a=>a.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
          const style=getComputedStyle(b);const bg=nums(style.backgroundColor);
          const values=[...b.querySelectorAll('strong,.ta-alert-detail,.ta-alert-meta,small,time')].map(e=>{const fg=nums(getComputedStyle(e).webkitTextFillColor);const a=lum(bg),c=lum(fg);return (Math.max(a,c)+.05)/(Math.min(a,c)+.05)});
          return {bg:style.backgroundColor,gradient:style.backgroundImage,values};
        }""")
        assert colors['gradient']=='none' and min(colors['values'])>=4.5,(edition,theme,colors)
    if agent:
        page.get_by_role('button',name='تحديد الكل كمقروء').click()
        page.wait_for_function("()=>Agent.state.managerNotifications.every(n=>n.read) && document.querySelector('#agentManagerNotificationCount').textContent==='0'")
        page.evaluate("async()=>{await Agent.show('home');await Agent.show('manager_notifications')}")
    else:
        page.evaluate("()=>{AppNav.navigate('dashboard');AppNav.navigate('notifications')}")
    assert cards.count()==10,(edition,'reentry',cards.count())
    data=[dict(id='fx_test_001',date='2026-06-01',fromCurrency='SYP',toCurrency='USD',fromAmount=300,toAmount=3,equivalentSyp=300),dict(id='fx_test_002',date='2026-06-02',fromCurrency='USD',toCurrency='EUR',fromAmount=2,toAmount=1,equivalentSyp=200)]
    page.evaluate("""async ({agent,rows})=>{
      if(agent){Agent.state.allowedCurrencies=['USD','EUR','SYP'];Agent.state.ops=rows.map(x=>({...x,kind:'currency_exchange'}));await Agent.show('currency_exchange_list');}
      else{State.currencyExchanges=rows;TiqanyFxUI.list();}
    }""",{'agent':agent,'rows':data})
    for code,expected in [('USD',['3 USD','2 USD','−1 USD']),('EUR',['1 EUR','0 EUR','−1 EUR'])]:
        assert page.locator('[data-fx-summary='+code+'] bdi').all_text_contents()==expected,edition
    assert page.locator('[data-fx-summary=SYP]').count()==0
    if edition in ('manager','win'):
        page.evaluate('()=>{UI.forceCloseModal();FieldSync.open()}')
        create=page.locator('#modalBox button[onclick="FieldSync.showCreateAgent()"]')
        assert create.count()==1 and create.evaluate('b=>b.getBoundingClientRect().width>=b.parentElement.clientWidth-3')
        assert page.locator('#modalBox button[onclick="FieldSync.showAgents()"]').count()==0
        page.evaluate("()=>UI.forceCloseModal()")
    if edition=='win':
        for route in ('dashboard','reports','invoice_form','voucher_form'):
            page.evaluate("""s=>{AppNav.navigate(s,s.endsWith('_form')?{type:s==='voucher_form'?'receipt':'sale'}:{});}""",route)
            assert page.locator('#headerNotificationsBtn').is_visible(),route
        page.evaluate("""()=>{UI.forceCloseModal();TiqanyFxUI.list()}""")
        assert page.locator('#headerNotificationsBtn').evaluate("""b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}"""),'covered header bell'
        names=sorted(set(__import__('re').findall(r'\bfa-[a-z][\w-]*',' '.join(p.read_text(encoding='utf8') for p in [root/'index.html',*(root/'static').glob('*.js')] if p.name!='icons.js'))))
        page.evaluate("""names=>{const box=document.createElement('div');box.id='icon-audit';for(const n of names){const i=document.createElement('i');i.className='fas '+n;box.append(i)}document.body.append(box)}""",names)
        page.wait_for_function("()=>[...document.querySelectorAll('#icon-audit i')].every(i=>i.querySelector('svg'))")
    if edition in ('manager','win'):
        page.evaluate('()=>{UI.forceCloseModal();FieldSync.showCreateAgent()}')
        select=page.locator('#fieldNewWarehouse')
        assert 'إنشاء مستودع' in select.locator('option').first.inner_text()
        current=select.input_value()
        page.locator('#fieldNewAgent').fill('موظف اختبار')
        page.locator('#fieldNewVehicle').fill('سيارة اختبار')
        select.select_option('__create_warehouse__')
        page.locator('#fieldWarehouseName').fill('مسودة')
        page.get_by_role('button',name='إلغاء',exact=True).last.click()
        assert not page.locator('#fieldWarehouseEditor').is_visible() and select.input_value()==current
        select.select_option('__create_warehouse__')
        page.locator('#fieldWarehouseName').fill('مستودع اختبار')
        page.get_by_role('button',name='إنشاء المستودع واختياره').click()
        page.wait_for_function("()=>document.getElementById('fieldWarehouseEditor').hidden")
        new_id=select.input_value()
        assert new_id!=current and page.evaluate("id=>State.warehouses.find(w=>w.id===id)?.name",new_id)=='مستودع اختبار'
        select.select_option('__create_warehouse__')
        page.locator('#fieldWarehouseName').fill('مستودع اختبار')
        page.get_by_role('button',name='إنشاء المستودع واختياره').click()
        assert 'بالاسم نفسه' in page.locator('#fieldWarehouseError').inner_text()
        assert page.locator('#fieldNewVehicle').input_value()=='سيارة اختبار' and page.locator('#fieldNewAgent').input_value()=='موظف اختبار'
        page.evaluate('()=>UI.forceCloseModal()')
    # Exercise cancellation and acceptance through the actual UI on a separate first-run page.
    start=browser.new_page(viewport={'width':390,'height':700})
    start.add_init_script("""window.folderRequests=0;
      window.AndroidAutoBackup={getStatus:()=>'{}',chooseDatabaseFolder(){window.folderRequests++;}};
      window.AndroidRecovery={chooseBackupFolder(){}};""")
    start.goto((root/'index.html').resolve().as_uri())
    if agent:
        button=start.locator('#ta-recovery-card button[onclick="TiqanyRecovery.newDatabase()"]').first
        button.wait_for()
        button.click()
        start.evaluate("()=>window.__tiqanyDatabaseFolder('cancelled','')")
        assert button.is_visible() and 'أُغلق' in start.locator('#ta-recovery-folder-status').inner_text()
        button.click()
        start.evaluate("()=>window.__tiqanyDatabaseFolder('selected','تنزيلات / النسخة الاحتياطية لتطبيق المحاسبة')")
        assert not button.is_visible()
    else:
        button=start.locator('#ta-company-folder')
        button.wait_for()
        assert button.bounding_box()['height']>=56
        start.locator('#ta-company-name-128').fill('شركة اختبار')
        start.locator('#ta-owner-name-153').fill('مالك اختبار')
        start.locator('#ta-company-save-128').click()
        start.wait_for_function('()=>window.folderRequests===1')
        start.evaluate("()=>window.__tiqanyDatabaseFolder('cancelled','')")
        assert 'أُغلق' in start.locator('#ta-company-folder-status').inner_text()
        assert start.locator('#ta-company-name-128').input_value()=='شركة اختبار'
        button.click()
        start.evaluate("()=>window.__tiqanyDatabaseFolder('selected','تنزيلات / النسخة الاحتياطية لتطبيق المحاسبة')")
        assert 'النسخة الاحتياطية لتطبيق المحاسبة' in start.locator('#ta-company-folder-status').inner_text()
        start.locator('#ta-company-save-128').click()
        start.wait_for_function("()=>!document.getElementById('ta-company-setup-128')")
    assert start.evaluate('()=>window.folderRequests')==2
    start.close()
    print('PASS',edition,'currency values, 10/20/26, re-entry, both themes, applicable header and employee controls')
    browser.close()
