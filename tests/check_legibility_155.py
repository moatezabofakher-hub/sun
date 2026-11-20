"""Visual regression: readable six-slot Arabic navigation, single-image business tiles, and historic rate shortcut."""
from pathlib import Path
import os, shutil, sys
from playwright.sync_api import sync_playwright
root=Path(sys.argv[1]).resolve()
employee='field_agent' in root.parts
exe=shutil.which('google-chrome') or shutil.which('chromium') or str(Path(os.environ.get('PROGRAMFILES(X86)',''))/'Microsoft/Edge/Application/msedge.exe')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=exe,args=['--no-sandbox','--allow-file-access-from-files'])
 widths=(320,360,432) if root.parts[-5:]!=('a','b','c','d','e') else (360,)
 if not employee and root.parent.name=='web': widths=(800,1200)
 for width in widths:
  p=browser.new_page(viewport={'width':width,'height':820})
  p.goto((root/'index.html').as_uri())
  p.wait_for_timeout(300)
  if employee:
   p.evaluate("""()=>{Agent.state=Agent.blank;Agent.screen='home';document.getElementById('screen').innerHTML=Agent.renderHome();document.getElementById('bottom').classList.remove('hide');}""")
  else:
   p.evaluate("""()=>{State.settings.companyName='QA';State.settings.companySetupCompleted=true;
      document.querySelector('#ta-company-setup-128')?.remove();AppNav.stack=[{screen:'dashboard',params:{}}];AppNav.renderCurrent();}""")
  for theme in ('classic','royal'):
   p.evaluate("(mode)=>document.documentElement.setAttribute('data-ta-theme',mode)",theme)
   if employee:
    results=p.evaluate("""()=>[...document.querySelectorAll('#bottom button')].map(b=>{
      let s=getComputedStyle(b),r=b.getBoundingClientRect(),n=document.querySelector('#bottom').getBoundingClientRect();
      return {text:b.textContent,shadow:s.textShadow,stroke:s.webkitTextStrokeWidth,filter:s.filter,font:parseFloat(s.fontSize),bottom:r.bottom,navBottom:n.bottom,color:s.color}
    })""")
    assert len(results)==6,results
    for row in results:
     assert row['shadow']=='none' and row['filter']=='none' and row['font']>=10.9,row
     assert row['bottom']<=row['navBottom']+2,row
   else:
    info=p.evaluate("""()=>{
     const tiles=[...document.querySelectorAll('#mainContent .ta-module-grid .ta-module-card')];
     const nav=[...document.querySelectorAll('nav.ta-bottom-nav .nav-btn')];
     const geom=e=>{const r=e.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height};};
     return {
      tiles:tiles.map(b=>{let box=b.querySelector('.ta-icon-box'),i=box.querySelector('i'),label=b.querySelector('strong'),s=getComputedStyle(label);return {
       text:label.textContent,hidden:getComputedStyle(i).display,picture:getComputedStyle(box,'::after').backgroundImage,
       icon:geom(box),label:geom(label),card:geom(b),font:parseFloat(s.fontSize),shadow:s.textShadow,color:s.color
      }}),
      nav:nav.map(b=>{let s=b.querySelector('span'),i=b.querySelector('i'),css=getComputedStyle(s),btn=geom(b),label=geom(s);
        return {text:s.textContent,btn,label,shadow:css.textShadow,filter:css.filter,
        font:parseFloat(css.fontSize),stroke:css.webkitTextStrokeWidth,color:css.color,
        oldGlyph:getComputedStyle(i,'::before').content};
      }),
      heading: getComputedStyle(document.querySelector('.ta-section-head h3')).textShadow
     };
    }""")
    assert len(info['tiles'])>=6 and len(info['nav']) in (5,6),info
    for row in info['tiles']:
     assert row['hidden']=='none',row
     assert row['picture']!='none',row
     assert row['icon']['w']>=48,row
     assert row['font']>=11.4 and row['shadow']=='none',row
     assert row['label']['l']>=row['card']['l']-2 and row['label']['r']<=row['card']['r']+2,row
    for row in info['nav']:
     assert row['shadow']=='none' and row['filter']=='none',row
     assert row['font']>=10.9,row
     assert row['label']['b']<=row['btn']['b']+2,row
     assert row['label']['l']>=row['btn']['l']-2 and row['label']['r']<=row['btn']['r']+2,row
     assert row['oldGlyph']=='none',row
    assert info['heading']=='none',info['heading']
    p.locator('#topBarRateButton').click()
    assert p.locator('#modalRateInput').is_visible(),'Top bar must open original transaction rate editor'
    assert p.locator('#ta150General_USD').count()==0,'Top bar incorrectly opens multi-currency rate settings'
    p.evaluate("UI.forceCloseModal()")
    p.evaluate("""mm=>{
      State.settings.printerWidth=mm;
      State.invoices=State.invoices.filter(x=>x.id!=='qa-receipt');
      State.invoices.push({id:'qa-receipt',type:'sale',number:12,date:'2026-11-20T02:44',currency:'USD',
        rows:[{itemName:'سائل جلي',unitName:'كرتونة',qty:1,price:2,total:2}],subTotal:2,netTotal:2,paidAmount:2,remainingAmount:0});
      State.settings.companyPhone='123456';
      AppNav.navigate('invoice_print',{id:'qa-receipt'});
    }""",58 if width==widths[0] else 80)
    paper=p.locator('#printableReceiptArea')
    assert 'سائل جلي' in paper.inner_text() and 'إجمالي الفاتورة' in paper.inner_text()
    for media in ('screen','print'):
     p.emulate_media(media=media)
     surfaces=paper.evaluate("""paper=>{
       const text=[...paper.querySelectorAll('*')].filter(e=>e.childElementCount===0 && e.textContent.trim() && e.getClientRects().length);
       return {paper:getComputedStyle(paper).backgroundColor,ink:[...new Set(text.map(e=>getComputedStyle(e).webkitTextFillColor))],
         head:getComputedStyle(paper.querySelector('thead')).backgroundColor,
         row:getComputedStyle(paper.querySelector('tbody tr')).backgroundColor};
     }""")
     assert surfaces['paper']=='rgb(255, 255, 255)' and surfaces['ink']==['rgb(17, 17, 17)'],(theme,media,surfaces)
     assert surfaces['head']==('rgb(233, 237, 239)' if media=='screen' else 'rgba(0, 0, 0, 0)') and surfaces['row']=='rgba(0, 0, 0, 0)',surfaces
    p.emulate_media(media='screen')
    p.evaluate("()=>AppNav.navigate('dashboard')")
   print('PASS readability',('employee' if employee else 'manager'),width,theme,flush=True)
  p.close()
 browser.close()
