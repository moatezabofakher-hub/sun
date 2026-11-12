from pathlib import Path
import re
root = Path(__file__).resolve().parents[1]
html = (root/'app/src/main/assets/www/index.html').read_text()
icons = (root/'app/src/main/assets/www/static/icons.js').read_text()
checks={
  'uniform secondary dashboard warehouse card': 'class="ta-module-card"' in html and 'fa-box-open' in html and 'ta-tone-cyan' in html,
  'dashboard expense tile removed': '<span class="text-[11px] font-bold text-slate-700">المصاريف</span>' not in html,
  'all icon names available offline': '"fa-box-open"' in icons and '"fa-receipt"' in icons and 'fa-warehouse' not in html,
  'dashboard quick add warehouse': 'AppNav.navigate(\'warehouses\', { action: \'add\' })' in html,
  'dashboard quick add expense': 'AppNav.navigate(\'expenses\', { action: \'add\' })' in html,
  'warehouse add form and action': 'id="warehouseCreatePanel"' in html and 'onclick="WarehouseController.addWarehouse()"' in html,
  'warehouse transfer action': 'id="warehouseTransferPanel"' in html and 'onclick="WarehouseController.saveTransfer()"' in html,
  'expense new action and form': 'ExpenseController.startNewExpense()' in html and 'id="expenseFormPanel"' in html,
  'expense save action': 'onclick="ExpenseController.saveExpense()"' in html,
  'local database name unchanged': 'AlRaedAccountingERP_v2' in html,
}
for key,value in checks.items():print(('PASS' if value else 'FAIL')+': '+key)
if not all(checks.values()): raise SystemExit(1)
