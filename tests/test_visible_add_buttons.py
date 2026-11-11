from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
html = (root/'app/src/main/assets/www/index.html').read_text()
build = (root/'app/build.gradle').read_text()
assert 'versionCode 11' in build
assert "versionName '3.5.3-settings-activation'" in build
assert 'AlRaedAccountingERP_v2' in html
for selector, color in [('ta-action-warehouse','#0284c7'),('ta-action-expense','#c2410c'),('ta-action-transfer','#1e293b')]:
    assert f'button.ta-solid-action.{selector}' in html
    assert f'background-color: {color} !important;' in html
for label in ['إضافة مستودع','إضافة مصروف','مناقلة مواد','إضافة مصروف جديد','إضافة المستودع']:
    assert label in html
for onclick in ["AppNav.navigate('warehouses', { action: 'add' })", "AppNav.navigate('expenses', { action: 'add' })", "Views.jumpToEntry('warehouseCreatePanel','newWarehouseName')", "Views.jumpToEntry('warehouseTransferPanel','transferItem')", "WarehouseController.addWarehouse()", "ExpenseController.startNewExpense()", "ExpenseController.saveExpense()"]:
    m = re.search(r'<button\b[^>]*\bonclick="'+re.escape(onclick)+r'"[^>]*>',html)
    assert m and 'ta-solid-action' in m.group(0), onclick
print('PASS: v3.5.2 high-contrast action buttons and unchanged data key')
