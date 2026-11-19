"""Resume using the actual manager WebView assets and persistent Chromium IndexedDB."""
import hashlib
import json
import shutil
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

def compact(value, sort=False):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), sort_keys=sort)

def sha(value):
    return hashlib.sha256(value.encode('utf8')).hexdigest()

url = (Path(sys.argv[1]).resolve() / 'index.html').as_uri()
names = ('categories items accounts invoices vouchers warehouses transfers expenses capitalMovements '
         'shareholderOwners shareholderMovements currencyExchanges fieldAgents fieldImported fieldEvents '
         'fieldCashTransfers fieldOperationHistory fieldRevisionAudit fieldCompany').split()
snapshot = {name: [] for name in names}
snapshot['sharedSettings'] = {'companyName': 'مركز الجملة'}
snapshot['invoices'] = [{'id': str(i), 'note': 'اختبار' * 25} for i in range(3000)]
doc = compact({'packet': {'target': sha(compact(snapshot, True)), 'full': snapshot}, 'meta': {}})
pages = [doc[i:i+65536] for i in range(0, len(doc), 65536)]
hashes = [sha(part) for part in pages]
assert len(pages) > 3
with tempfile.TemporaryDirectory() as profile, sync_playwright() as pw:
    for attempt in (1, 2):
        browser = pw.chromium.launch_persistent_context(
            profile, executable_path=shutil.which('google-chrome') or shutil.which('chromium'),
            args=['--no-sandbox', '--allow-file-access-from-files'])
        page = browser.new_page()
        page.goto(url)
        page.wait_for_function('typeof ProfileManager!=="undefined" && ProfileManager.activeId && StorageEngine.db && window.TiqanyPeerSync')
        requested = []
        def answer(message):
            if message['action'] == 'probe':
                return {'ok': True, 'streamVersion': 2, 'serverId': 'server'}
            if message['step'] == 'open':
                return {'ok': True, 'ticket': 'ticket'+str(attempt), 'serverId': 'server', 'profileId': 'pc', 'hashes': hashes}
            assert message['step'] == 'read'
            i = message['i']
            requested.append(i)
            if attempt == 1 and i == 2:
                return {'ok': False, 'error': 'offline'}
            return {'ok': True, 'text': pages[i]}
        page.expose_function('testPeerReply', answer)
        outcome = page.evaluate("""async () => {
            window.AndroidPeerSync={request: raw=>testPeerReply(JSON.parse(raw))
                .then(data=>window.__tiqanyPeerReply(JSON.stringify(data)))};
            try {
              const result=await TiqanyPeerSync.call({action:'fetch',phoneProfileId:ProfileManager.activeId,phoneCompanyUid:'test-company'});
              return result.snapshot.invoices.length;
            } catch(e) {return e.message;}
        }""")
        if attempt == 1:
            assert outcome == 'offline' and requested == [0, 1, 2], (outcome, requested)
        else:
            assert outcome == 3000 and requested == list(range(2, len(pages))), (outcome, requested)
        browser.close()
print('PASS resumed from persisted IndexedDB pages after closing and reopening the browser process')
