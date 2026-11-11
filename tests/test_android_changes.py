#!/usr/bin/env python3
"""Static integration smoke checks for the technical-accountant Android shell."""
from pathlib import Path
from xml.etree import ElementTree as ET

root = Path(__file__).resolve().parents[1]
java = (root/'app/src/main/java/com/sunshine/accounting/MainActivity.java').read_text()
printer = (root/'app/src/main/java/com/sunshine/accounting/NativeBluetoothPrinter.java').read_text()
html = (root/'app/src/main/assets/www/index.html').read_text()
manifest = (root/'app/src/main/AndroidManifest.xml').read_text()
build = (root/'app/build.gradle').read_text()

checks = {
    'App name': 'android:label="المحاسب التقني"' in manifest,
    'Native margin-based safe insets': 'WindowInsetsCompat.Type.displayCutout()' in java and 'params.setMargins(bars.left, bars.top, bars.right, bars.bottom)' in java,
    'Android back confirmation': 'UI.showExitAppDialog();' in html,
    'Native exit confirmation fallback': 'showNativeExitConfirmation' in java,
    'Native printer interface': 'addJavascriptInterface(bluetoothPrinter, "AndroidPrinter")' in java,
    'Bluetooth permissions': 'android.permission.BLUETOOTH_CONNECT' in manifest and 'android.permission.BLUETOOTH" android:maxSdkVersion="30"' in manifest,
    'Bluetooth RFCOMM profile': 'createRfcommSocketToServiceRecord(SPP_UUID)' in printer,
    'Printer printing off UI thread': 'Executors.newSingleThreadExecutor()' in printer,
    'Paired device selection': 'getBondedDevices()' in printer,
    'Asynchronous printer confirmation': '__nativePrinterEvent' in html,
    'Android bitmap and adaptive launcher': (root/'app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml').is_file() and (root/'app/src/main/res/mipmap-xxxhdpi/ic_launcher.png').is_file(),
    'Valid stable Android package identifier': any(x in build for x in ["applicationId 'com.sunshine.accounting'", "applicationId 'com.sunshine.technicalaccountant'"]),
    'Kotlin duplicate class resolution': "details.useVersion '1.8.20'" in build,
    'Native biometric login retained': 'BiometricPrompt' in java,
    'Backup bridge retained': 'saveBackup(String json, String filename)' in java,
}
ET.fromstring(manifest)
for f in (root/'app/src/main/res/mipmap-anydpi-v26').glob('*.xml'):
    ET.fromstring(f.read_text())
for f in (root/'app/src/main/res/values').glob('*.xml'):
    ET.fromstring(f.read_text())
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL') + ': ' + name)
if not all(checks.values()):
    raise SystemExit(1)
print('Android changes checked.')
