#!/usr/bin/env python3
"""Read-only checks before publishing signed release builds.
Not an antivirus scan and does not certify that an APK is harmless.
"""
from pathlib import Path
from xml.etree import ElementTree as ET
import re
import sys

root=Path(__file__).resolve().parent.parent
variant=sys.argv[1] if len(sys.argv)>1 else 'main'
apps={'main':{'app':'com.sunshine.technicalaccountant',
              'field_agent':'com.sunshine.technicalaccountant.agent'},
      'solo':{'app':'com.tiqany.accounting.solo'}}
if variant not in apps:
    sys.exit('Usage: python3 scripts/release_audit.py main|solo')

banned_permissions={
    'android.permission.READ_SMS','android.permission.RECEIVE_SMS',
    'android.permission.SEND_SMS','android.permission.READ_CALL_LOG',
    'android.permission.REQUEST_INSTALL_PACKAGES','android.permission.QUERY_ALL_PACKAGES',
    'android.permission.SYSTEM_ALERT_WINDOW',
}
android='{http://schemas.android.com/apk/res/android}'
for module,pkg in apps[variant].items():
    manifest=root/module/'src/main/AndroidManifest.xml'
    gradle=root/module/'build.gradle'
    if not manifest.is_file() or not gradle.is_file():
        sys.exit(f'ERROR: missing project files for {module}')
    body=gradle.read_text(encoding='utf-8')
    match=re.search(r"\bapplicationId\s+['\"]([^'\"]+)['\"]",body)
    if not match or match.group(1)!=pkg:
        sys.exit(f'ERROR: unexpected applicationId in {module}; refusing to change/update package identity')
    target=re.search(r'\btargetSdk\s+(\d+)',body)
    if not target or int(target.group(1)) < 35:
        sys.exit(f'ERROR: unexpected targetSdk for {module}')
    xml=ET.parse(manifest).getroot()
    requested={p.get(android+'name') for p in xml.findall('uses-permission')}
    dangerous=requested & banned_permissions
    if dangerous:
        sys.exit(f'ERROR: review sensitive permissions in {module}: {sorted(dangerous)}')
    app=xml.find('application')
    if app is None or app.get(android+'usesCleartextTraffic')!='false':
        sys.exit(f'ERROR: application cleartext-traffic policy changed for {module}')
    if app.get(android+'debuggable')=='true':
        sys.exit(f'ERROR: app is marked debuggable in {module}')
    activities=app.findall('activity')
    for activity in activities:
        name=activity.get(android+'name','')
        if name.endswith('MainActivity'):
            if activity.get(android+'exported')!='true':
                sys.exit(f'ERROR: launcher activity export changed in {module}')
        elif activity.get(android+'exported')=='true':
            sys.exit(f'ERROR: unexpected exported activity in {module}: {name}')
    print(f'PASS {module}: {pkg}, permissions={len(requested)}, cleartext disabled')

# Secrets/signing keys must never be committed in source trees.
for path in root.rglob('*'):
    if not path.is_file() or any(x in {'build','.gradle','.git'} for x in path.parts):
        continue
    if path.suffix.lower() in {'.jks','.keystore','.p12','.pfx','.pkcs12'} or path.name in {'.env','.env.production'}:
        sys.exit(f'ERROR: private signing material present in source: {path.relative_to(root)}')
print('PASS: no private keystores in source project')
