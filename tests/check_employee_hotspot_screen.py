from pathlib import Path
import shutil
from playwright.sync_api import sync_playwright

entry = Path('field_agent/src/main/assets/www/index.html').resolve().as_uri()
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=shutil.which('google-chrome') or shutil.which('chromium'),
        args=['--no-sandbox', '--allow-file-access-from-files'])
    for width in (320, 360, 432):
        page = browser.new_page(viewport={'width': width, 'height': 740})
        page.add_init_script("""window.AndroidLocalSync = {
            employeeLanAddresses: () => '["192.168.10.1","192.168.1.33"]'
        }""")
        page.goto(entry)
        page.wait_for_function("() => !!window.AgentPairing && typeof Agent !== 'undefined' && !!Agent.state")
        page.evaluate("""async () => { Agent.ready=()=>false; await Agent.show('setup'); }""")
        panel = page.locator('[data-agent-network]').first
        assert panel.is_visible() and '192.168.10.1' in panel.inner_text(), width
        page.evaluate("""async () => {
            Agent.state.localQrTarget = {host:'192.168.10.76',port:48371};
            Agent.ready=()=>true; Agent.active=async()=>true;
            await Agent.show('sync');
        }""")
        assert panel.is_visible() and '192.168.10.76:48371' in panel.inner_text(), width
        assert panel.evaluate('p => p.scrollWidth <= p.clientWidth + 1'), width
        print('PASS rendered phone and manager addresses at width', width)
        page.close()
    browser.close()
