#!/usr/bin/env python3
"""Ensure requested invoice-print and WhatsApp support behavior remains intact."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
h=(root/'app/src/main/assets/www/index.html').read_text(encoding='utf8')
j=(root/'app/src/main/java/com/sunshine/accounting/MainActivity.java').read_text(encoding='utf8')
start=h.index('            async saveInvoice(andBluetoothPrint = false) {')
end=h.index('            openInvoiceActions(invId) {', start)
section=h[start:end]
assert "if (andBluetoothPrint) {" in section
assert 'await ThermalPrinter.printInvoiceDirect(cleanDoc)' in section
assert "AppNav.navigate('dashboard');" in section
assert "AppNav.navigate('invoice_print', { id: cleanDoc.id }, true);" in section
assert section.index('await ThermalPrinter.printInvoiceDirect(cleanDoc)') < section.index("AppNav.navigate('dashboard');")
assert "setTimeout(() => ThermalPrinter.printInvoiceDirect(cleanDoc)" not in section
assert 'مجموعة التقني للمحاسبة و المستودعات' in h
for number, url in [('00963932325577','https://wa.me/963932325577'),('00963968643771','https://wa.me/963968643771')]:
    assert number in h and url in h
assert 'whatsapp.setPackage(appPackage)' in j
assert 'com.whatsapp.w4b' in j
assert 'PUBLIC_KEY_SPKI_B64' in h and 'SECRET_SALT' not in h
print('PASS Save & print direct, dashboard navigation, activation support and WhatsApp links')
