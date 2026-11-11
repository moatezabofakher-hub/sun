from pathlib import Path
import re
root = Path(__file__).resolve().parents[1]
html = (root/'app/src/main/assets/www/index.html').read_text(encoding='utf-8')
gradle = (root/'app/build.gradle').read_text(encoding='utf-8')
assert 'id="licenseTopBadge"' not in html
assert 'licenseBadgeText' not in html
assert html.count('onclick="LicenseManager.openActivationModal()"') == 1
assert '<span class="text-[11px] font-bold text-slate-700">الضبط</span>' in html
assert '<span class="text-[11px] font-bold text-slate-700">الطابعة والنسخ</span>' not in html
assert 'data-settings-section="activation"' in html and 'data-settings-section="printing"' in html
assert 'id="settingsLicenseStatus"' in html
assert 'State.license.isActivated' in html and 'LicenseManager.activateNow()' in html
assert "versionCode 15" in gradle and "versionName '3.5.7-categorized-settings'" in gradle
assert 'AlRaedAccountingERP_v2' in html
assert 'onchange="SettingsController.importBackup(event)"' in html
assert 'ThermalPrinter.openQuickModal()' in html
print('PASS: settings tile, single activation access, unchanged storage and printing')
