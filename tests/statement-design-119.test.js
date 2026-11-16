const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const source=fs.readFileSync('app/src/main/assets/www/static/account-statement-period-3589.js','utf8');
const renderer=fs.readFileSync('app/src/main/java/com/sunshine/accounting/StatementPdfLayout.java','utf8');
const bridge=fs.readFileSync('app/src/main/java/com/sunshine/accounting/ReportPdfRenderer.java','utf8');
test('statement payload reads company settings and real account name',()=>{
 for(const t of ['s.companyName','s.companyPhone','s.companyAddress','s.companyLogo','account.name','account.type','createdAtLocal'])assert.ok(source.includes(t),t);
});
test('native PDF statement uses navy gold header, per-currency table, opening and final balance',()=>{
 for(const t of ['"accountName"','"companyName"','"companyPhone"','"companyAddress"','"companyLogo"','"from"','"to"','"opening"','"ending"','"debit"','"credit"','"balance"','"reference"','"date"','"rate"','SYP','USD','tableHeader','currencySection','total(all,c,"debit")','total(all,c,"credit")'])assert.ok(renderer.includes(t),t);
 assert.match(bridge,/return StatementPdfLayout\.render\(input\);/);
});
