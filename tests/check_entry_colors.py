import sys,shutil,os
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(sys.argv[1]).resolve(); kind=sys.argv[2]; agent=kind=='agent'
probe="""sels=>{const lum=s=>{const rgb=s.match(/[.\\d]+/g).map(Number).slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]};
let results=[];for(const sel of sels){const els=[...document.querySelectorAll(sel)].filter(e=>e.getClientRects().length);
if(!els.length)throw Error(sel);for(const el of els){const css=getComputedStyle(el);let bg;
for(let n=el;n;n=n.parentElement){const col=getComputedStyle(n).backgroundColor;if(col!=='rgba(0, 0, 0, 0)' && col!=='transparent'){bg=col;break;}}
const fg=css.webkitTextFillColor==='currentcolor'?css.color:css.webkitTextFillColor;const a=lum(fg),b=lum(bg||'rgb(255,255,255)'),c=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
if(c<4.5)results.push([sel,el.textContent.trim().slice(0,32),fg,bg,c]);}}return results}"""
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium') or str(Path(os.environ.get('PROGRAMFILES(X86)',''))/'Microsoft/Edge/Application/msedge.exe'),args=['--allow-file-access-from-files','--no-sandbox'])
 p=b.new_page(viewport={'width':1100 if kind=='win' else 360,'height':800});p.goto((root/'index.html').as_uri())
 item={'id':'qa','name':'مادة تجربة','category':'مواد','currency':'SYP','units':[{'name':'علبة','factor':1,'salePrice':10,'costPrice':7}],'openingStockBase':100}
 if agent:
  p.wait_for_function("typeof Agent!=='undefined' && Agent.state && typeof Agent.openInvoiceItemGrid==='function'")
  p.evaluate("""async i=>{Agent.state=Agent.blank;Object.assign(Agent.state,{companyId:'qa',key:'qa',items:[i],stock:{qa:100}});Agent.ready=()=>true;Agent.active=async()=>true;await Agent.show('home');Agent.startInvoice('sale')}""",item)
 else:
  p.wait_for_function("typeof ProfileManager!=='undefined' && ProfileManager.registry")
  p.evaluate("""i=>{State.settings.companyName='اختبار';State.settings.companySetupCompleted=true;State.license.isActivated=true;document.querySelector('#ta-company-setup-128')?.remove();State.items=[i];State.payrollStaff=[{id:'w',name:'موظف',gross:20000,days:5,cycle:'weekly',currency:'SYP',leaves:[{id:'l',start:'2026-01-01',days:1,reason:'إجازة'}]}]}""",item)
 def nav(s):p.evaluate("s=>{AppNav.clearDirty();AppNav.navigate('payroll',{section:s,employeeId:'w'})}",s)
 for theme in ['classic','royal','petrol']:
  p.evaluate("s=>document.documentElement.setAttribute('data-ta-theme',s)",theme)
  def check(*sels):
   failures=p.evaluate(probe,list(sels));assert not failures,(kind,theme,failures[:7])
  if not agent:
   nav('terms');p.locator('[data-pay-day="2"]').click()
   check('.pay-calendar button','.pay-field input','.pay-field select','.pay-schedule legend','.pay-chosen span','.pay-actions button')
   p.locator('#pay-cycle').select_option('monthly');p.locator('[data-last]').click()
   check('.pay-calendar button','.pay-calendar small','.pay-month-navigation button','.pay-month-navigation b','[data-last]','[data-pay-clear]')
   p.locator('#pay-cycle').select_option('yearly');check('.pay-schedule select','.pay-chosen span','.pay-calendar button')
   nav('leaves');check('[data-leave-new]','[data-leave-record] b','[data-leave-record] p','[data-leave-record] small')
   p.locator('[data-leave-new]').click();check('#modalBox h3','#modalBox label','#modalBox input','#modalBox textarea','#modalBox .pay-actions button')
   p.locator('#modalBox [data-cancel]').click();nav('salary');check('#pay-calculation p','#pay-calculation b')
   p.evaluate("()=>{AppNav.clearDirty();AppNav.navigate('opening_invoice',{})}");p.locator('[data-cmd=add]').click()
  else:p.evaluate("Agent.openInvoiceItemGrid()")
  p.locator('[data-grid-card] h4').first.click()
  check('[data-grid-card] h4','[data-grid-card] label','[data-grid-item]','[data-grid-count]','.invoice-grid-decrement','#itemGridApplyButton,#agentGridApplyButton','#gridCatPills button,#agentPickerCats button')
  if not agent:
   check('#gridPickerSearch','button[aria-label="بحث عن مادة"]')
   p.locator('#itemGridApplyButton').click();check('[data-cmd=add]','[data-cmd=save]','[data-cmd=cancel]','[data-remove]','[data-key=qty]','[data-key=cost]','[data-total]')
  if agent:p.evaluate('Agent.closeInvoiceItemGrid()')
  else:p.evaluate('UI.forceCloseModal()')
  if kind in ['main','sun','win']:
   p.evaluate("FieldSync.open()")
   boxes=p.locator('.ta-employee-menu button').evaluate_all('bs=>bs.map(b=>{let r=b.getBoundingClientRect();return [r.width,r.height,r.y]})')
   assert len(boxes)==2 and boxes[0][:2]==boxes[1][:2] and boxes[0][2]<boxes[1][2],boxes
   check('.ta-employee-menu button');p.evaluate('UI.forceCloseModal()')
  print('PASS contrast',kind,theme,flush=True)
