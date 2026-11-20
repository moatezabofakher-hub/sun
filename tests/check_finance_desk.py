"""Exercise collections, physical till counts and the protected employee action."""
from pathlib import Path
import os, re, shutil, sys
from playwright.sync_api import sync_playwright
root=Path(sys.argv[1]).resolve()
def shift_colors(page):
    colors=[]
    for theme in ('classic','royal','petrol'):
        page.evaluate("theme=>document.documentElement.dataset.taTheme=theme", theme)
        bg,ink,image=page.locator('#finance-save-shift').evaluate("""b=>{
          const s=getComputedStyle(b);
          return [s.backgroundColor,s.webkitTextFillColor,s.backgroundImage];
        }""")
        def luminance(rgb):
            channels=[float(n)/255 for n in re.findall(r'[\d.]+',rgb)[:3]]
            return sum(weight*(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4)
                       for weight,v in zip((.2126,.7152,.0722),channels))
        light,dark=sorted((luminance(bg),luminance(ink)),reverse=True)
        assert image=='none' and (light+.05)/(dark+.05)>=4.5,(theme,bg,ink,image)
        colors.append(bg)
    assert len(set(colors))==3,colors
    page.evaluate("document.documentElement.dataset.taTheme='classic'")
    return colors

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
    page.evaluate("""()=>{
      AppNav.stack=[{screen:'dashboard',params:{}}]; AppNav.navigate('reports',{tab:'cashbox'});
    }""")
    page.get_by_role('button',name='التحصيل والاستحقاقات',exact=True).click()
    page.locator('#finance-age').select_option('all')
    page.evaluate("AppNav.handleBackButton()")
    assert page.evaluate("AppNav.current().params.tab")=='cashbox'
    page.get_by_role('button',name='فتح وإقفال الصندوق',exact=True).click()
    page.get_by_role('button',name='مطابقة الحوالات مع كشف البنك',exact=True).click()
    page.evaluate("AppNav.handleBackButton()")
    assert page.locator('#finance-save-shift').is_visible()
    page.evaluate("AppNav.handleBackButton()")
    assert page.evaluate("AppNav.current().params.tab")=='cashbox'
    page.evaluate("AppNav.handleBackButton()")
    assert page.evaluate("AppNav.current().screen")=='dashboard'
    page.evaluate("Views.renderSettings(testMain)")
    assert not page.locator('#settleFxOnPayment').is_checked()
    page.evaluate("""()=>{const cb=document.getElementById('settleFxOnPayment');cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));if(!State.settings.settleFxOnPayment)throw Error('setting not applied');
      Views.renderReports(testMain,{tab:'cash_shifts'});}""")
    opening_colors=shift_colors(page)
    page.locator('#finance-person').fill('أمين الصندوق')
    for c in ['SYP','USD']:page.locator('[data-count="'+c+'"]').fill('0')
    page.locator('#finance-save-shift').click()
    page.wait_for_function("State.cashShifts.length===1")
    page.locator('#finance-save-shift.ta-shift-close').wait_for()
    closing_colors=shift_colors(page)
    assert all(a!=b for a,b in zip(opening_colors,closing_colors))
    # Use the invoice's options menu. Check the actual scrolling element and bottom actions.
    page.evaluate("()=>InvoiceController.openInvoiceActions('due')")
    page.get_by_role('button',name='إضافة دفعة').click()
    note=page.locator('#voucherModalContent input[placeholder*="شرح السند"]')
    note.fill('دفعة قيد التعديل')
    page.evaluate("AppNav.handleBackButton()")
    page.locator('#dialogContainer[data-dialog-type="unsaved"]').wait_for()
    page.evaluate("AppNav.handleBackButton()")
    assert page.locator('#dialogContainer').is_hidden() and note.input_value()=='دفعة قيد التعديل'
    assert page.evaluate("AppNav.isModalDirty && State.vouchers.length===0")
    note.fill('دفعة بعد الرجوع')
    page.evaluate("AppNav.handleBackButton()")
    page.locator('#dialogContainer[data-dialog-type="unsaved"]').wait_for()
    page.evaluate("AppNav.handleBackButton()")
    for size in ((360,640),(360,390),(850,600)):
        page.set_viewport_size(dict(zip(('width','height'),size)))
        geometry=page.locator('#voucherModalContent').evaluate("""host=>{
          const fields=host.querySelector('.ta-voucher-fields'),footer=host.querySelector('.ta-voucher-save-footer');
          fields.scrollTop=0;
          const before=footer.getBoundingClientRect().top;
          fields.scrollTop=fields.scrollHeight;
          const last=fields.lastElementChild.getBoundingClientRect(),after=footer.getBoundingClientRect();
          return [fields.scrollTop,before,after.top,last.bottom,after.bottom,innerHeight];
        }""")
        scrolled,before,after,last,bottom,height=geometry
        assert scrolled>0 and abs(before-after)<1 and last<=after+1 and bottom<=height+1, (size,geometry)
    page.set_viewport_size({'width':470,'height':850})
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
    page.locator('#finance-save-shift:not(.ta-shift-close)').wait_for()
    assert page.locator('[data-count="SYP"]').input_value()=='74000'
    page.locator('#finance-person').fill('الأمين الثاني')
    page.locator('#finance-save-shift').click()
    page.wait_for_function("State.cashShifts.length===2")
    page.locator('#finance-save-shift.ta-shift-close').wait_for()
    assert page.evaluate("State.cashShifts[1].opening.SYP")==74000
    page.locator('#finance-person').fill('الأمين الثالث')
    page.locator('[data-count="SYP"]').fill('74000')
    page.locator('[data-count="USD"]').fill('0')
    page.locator('#finance-save-shift').click()
    page.wait_for_function("State.cashShifts[1].closedAt")
    assert page.evaluate("State.cashShifts.map(s=>s.difference.SYP)")==[-1000,0]

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
