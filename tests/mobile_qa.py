import http.server, threading, pathlib, shutil
from playwright.sync_api import sync_playwright

server=http.server.ThreadingHTTPServer(('127.0.0.1',0),http.server.SimpleHTTPRequestHandler)
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=shutil.which('google-chrome'),args=['--no-sandbox'])
    p=browser.new_page(viewport={'width':320,'height':432},is_mobile=True,device_scale_factor=2)
    p.goto(f'http://localhost:{server.server_port}/app/src/main/assets/www/index.html')
    p.wait_for_timeout(550)
    p.evaluate("""() => {State.settings.companyName='QA';State.settings.companySetupCompleted=true;
      document.getElementById('ta-company-setup-128')?.remove();
      AppNav.stack=[{screen:'settings',params:{}}];AppNav.renderCurrent();}""")
    section=p.locator('details[data-settings-section="invoices"]')
    section.locator('summary').evaluate('(el)=>el.click()')
    assert p.evaluate('TiqanySettingsPages152.current()')=='invoices'
    assert section.locator('summary').is_hidden()
    ids=section.locator('select').evaluate_all('(list)=>list.map(x=>x.id)')
    order=['setDefaultInvoiceCurrency','setDefaultPriceTier','taDefaultSaleUnitName','taDefaultPurchaseUnitName','setDefaultInvoiceListType','posAccountSetting']
    assert all(i in ids for i in order) and sorted(order,key=ids.index)==order, ids
    p.evaluate('TiqanySettingsPages152.back()')
    assert p.locator('#dlgDiscardBtn').inner_text()=='الخروج بدون تعديل'
    p.locator('#dlgDiscardBtn').evaluate('(el)=>el.click()')
    for width,height in [(320,432),(360,592),(432,272)]:
        p.set_viewport_size({'width':width,'height':height})
        for form,kind,selector in [('invoice_form','sale','.ta-footer-actions button'),('voucher_form','receipt','.ta-voucher-footer-actions button')]:
            p.evaluate("([form,type])=>{AppNav.stack=[{screen:form,params:{type}}];AppNav.renderCurrent()}",[form,kind])
            button=p.locator(selector).first
            button.scroll_into_view_if_needed()
            box=button.bounding_box()
            print(form,width,height,box,flush=True)
            assert box and box['y']>=0 and box['y']+box['height']<=height+1,box
    p.evaluate("""() => {State.invoices=Array.from({length:24},(_,i)=>({id:'qa'+i,number:'QA'+i,type:'sale',posSale:true,currency:'USD',rows:[],date:new Date(2026,10,1+i).toISOString()}));
    AppNav.stack=[{screen:'reports',params:{tab:'pnl',period:'all'}}];AppNav.renderCurrent();}""")
    for count in (10,20,24):
        assert p.locator('#mainContent').inner_text().count('نقطة بيع نقدية ·')==count
        if count <24:p.get_by_role('button',name='المزيد',exact=True).evaluate('(e)=>e.click()')
    browser.close()
