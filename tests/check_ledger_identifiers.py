"""Exercise drafts, posting, editing and invoice payments in isolated manager installations."""
import os
import re
import shutil
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

url = (Path(sys.argv[1]).resolve() / 'index.html').as_uri()
chrome = shutil.which('google-chrome') or shutil.which('chromium') or str(
    Path(os.environ.get('PROGRAMFILES(X86)', '')) / 'Microsoft/Edge/Application/msedge.exe')

with sync_playwright() as play:
    browser = play.chromium.launch(executable_path=chrome,
        args=['--no-sandbox', '--allow-file-access-from-files'])
    results = []
    for device in range(2):
        context = browser.new_context()
        page = context.new_page()
        page.goto(url)
        page.wait_for_function('typeof FieldProtocol !== "undefined" && StorageEngine.db && ProfileManager.activeId')
        results.append(page.evaluate("""async () => {
            Date.now = () => 1790000000000;
            State.settings.companyName='اختبار المعرّفات';
            State.settings.companySetupCompleted=true;
            State.settings.primaryCurrency='USD'; State.settings.defaultCurrency='USD';
            document.querySelector('#ta-company-setup-128')?.remove();
            AppNav.stack=[{screen:'dashboard',params:{}}];
            const account='acc_1700000000000', item='itm_1700000000000', old='inv_1700000000000';
            State.accounts=[{id:account,name:'زبون',type:'customer',openingUsd:0,openingSyp:0}];
            State.items=[{id:item,name:'عبوة',currency:'USD',openingStockBase:50,units:[
              {name:'قطعة',factor:1,salePrice:10,wholesalePrice:10,costPrice:3}]}];
            State.invoices=[{id:old,type:'sale',number:100,date:'2025-01-01',currency:'USD',accountId:account,
              exchangeRate:10000,netTotal:20,paidAmount:0,remainingAmount:20,paymentMethod:'credit',rows:[],
              paymentHistory:[]}];
            State.vouchers=[];State.warehouses=[{id:'wh_main',name:'المستودع الرئيسي'}];
            const main=document.getElementById('mainContent');
            InvoiceController.renderForm(main,{type:'sale'});
            const inv=InvoiceController.draft.id;
            InvoiceController.draft.accountId=account;
            InvoiceController.addItemToInvoice(item,false);
            const row=InvoiceController.draft.rows[0].rowId;
            await InvoiceController.saveInvoice(false);
            if(!State.invoices.some(i=>i.id===inv))throw Error('Sale not posted');
            InvoiceController.renderForm(main,{id:inv});
            if(InvoiceController.draft.id!==inv || InvoiceController.draft.rows[0].rowId!==row)throw Error('Edit regenerated IDs');
            VoucherController.renderForm(main,{type:'receipt'});
            const voucher=VoucherController.draft.id;
            Object.assign(VoucherController.draft,{accountId:account,currency:'USD',accountCurrency:'USD',amount:4,accountAmount:4});
            await VoucherController.saveVoucher();
            if(!State.vouchers.some(v=>v.id===voucher&&v.accountId===account))throw Error('Voucher not posted');
            VoucherController.openAccountVoucherModal('payment',account);
            const modal=VoucherController.draft.id;
            UI.forceCloseModal();
            InvoiceController.renderForm(main,{id:old});
            if(InvoiceController.draft.id!==old)throw Error('Legacy invoice changed identity');
            InvoiceController.openInvoicePayment(old);
            document.getElementById('invoicePaymentAmount').value='5';
            await InvoiceController.saveInvoicePayment(old);
            const prior=State.invoices.find(i=>i.id===old);
            if(prior.paidAmount!==5 || prior.remainingAmount!==15 || prior.paymentHistory.length!==1)throw Error('Legacy payment lost its target');
            return {inv,row,voucher,modal,number:State.invoices.find(i=>i.id===inv).number};
        }"""))
        context.close()
    browser.close()

assert results[0]['number'] == results[1]['number'] == 101
for field,prefix in [('inv','inv_'),('row','r_'),('voucher','vch_'),('modal','vch_')]:
    assert all(re.fullmatch(prefix+r'[a-f0-9]{32}', r[field]) for r in results)
    assert results[0][field] != results[1][field]
assert all(r['voucher'] != r['modal'] for r in results)
print('PASS two independent installations with the same clock post distinct documents; old invoice payments retain their target')
