#!/usr/bin/env python3
"""Offline source validation, intended to run before Gradle in GitHub Actions."""
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent.parent
assets = root / 'app/src/main/assets/www'
html = (assets / 'index.html').read_text('utf-8')
java = (root / 'app/src/main/java/com/sunshine/accounting/MainActivity.java').read_text('utf-8')
gradle = (root / 'app/build.gradle').read_text('utf-8')
manifest = root / 'app/src/main/AndroidManifest.xml'
ET.parse(manifest)

checks = {
    'HTML file complete': '<!DOCTYPE html>' in html and '</html>' in html,
    'Offline Tailwind CSS': (assets / 'static/tailwind.css').stat().st_size > 20000,
    'Offline SVG icon JS': (assets / 'static/icons.js').stat().st_size > 10000,
    'No remote CDN dependencies': not re.search(r'cdn\.tailwindcss\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com', html),
    'Native BiometricPrompt': 'new BiometricPrompt(' in java,
    'Native WebViewAssetLoader secure origin': 'WebViewAssetLoader' in java and 'appassets.androidplatform.net' in java,
    'No insecure file:// app loading': 'file:///android_asset/' not in java,
    'JS native biometric reply': 'window.__nativeBiometricReply' in html,
    'Android native bridge': 'window.NativeSecurity.authenticate' in html and '@JavascriptInterface' in java,
    'PIN fallback': 'unlockApp()' in html and 'verifyPin(pin)' in html,
    'Security recovery questions retained': 'resetForgottenPin()' in html,
    'Finance and inventory code retained': 'getAccountStatement(' in html and 'getItemBaseStock(' in html,
    'Saved invoices retained': 'StorageEngine' in html and 'IndexedDB' in html,
    'Native backup save': 'window.AndroidFiles.saveBackup(' in html and 'ACTION_CREATE_DOCUMENT' in java,
    'min SDK 26': 'minSdk 26' in gradle,
    'Android SDK 35': 'compileSdk 35' in gradle,
    'Legacy secret license generator absent': not re.search(r'SECRET_SALT|ADMIN_PIN|generateAdminKeyUI|generateCodeForDevice|openAdminKeygenModal', html),
    'Signed licensing public-key verifier': 'RSASSA-PKCS1-v1_5' in html and 'PUBLIC_KEY_SPKI_B64' in html,
    'No owner private keys in project': not list(root.rglob('*.pem')) and not list(root.rglob('*.key')) and not any(('-----BEGIN' + ' PRIVATE KEY-----') in f.read_text('utf-8',errors='ignore') for f in root.rglob('*') if f.is_file() and f.suffix in ('.html','.js','.py','.md')),
    'No usable published activation token': not re.search(r'SS1\.[A-Za-z0-9_-]{25,}\.[A-Za-z0-9_-]{64,}', ''.join(f.read_text('utf-8',errors='ignore') for f in root.rglob('*') if f.is_file() and f.suffix in ('.html','.js','.py','.json','.md'))),
    'No font files distributed': not list(root.rglob('*.woff*')) and not list(root.rglob('*.ttf')),
}
failed = [k for k, v in checks.items() if not v]
for name, passed in checks.items():
    print(('PASS' if passed else 'FAIL') + ' ' + name)
if failed:
    sys.exit(f'Source checks failed: {", ".join(failed)}')
print('All local source checks passed.')
