/* Tiqany Acc — customer/supplier aggregate balances; native currency amounts only. */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.AccountBalanceSummary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    function signedBalance(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }
    function calculate(accounts, accountType, statementFor) {
        if (accountType !== 'customer' && accountType !== 'supplier') {
            return null;
        }
        const result = {
            accountType: accountType,
            count: 0,
            debit: { SYP: 0, USD: 0 },
            credit: { SYP: 0, USD: 0 }
        };
        for (const account of (Array.isArray(accounts) ? accounts : [])) {
            if (!account || account.type !== accountType) continue;
            result.count += 1;
            const statement = (typeof statementFor === 'function' ? statementFor(account.id) : null) || {};
            // Positive ledger balance = debit (لنا); negative = credit (علينا).
            // Never offset customers against suppliers, debit against credit, or SYP against USD.
            for (const [currency, key] of [['SYP', 'sypBalance'], ['USD', 'usdBalance']]) {
                const balance = signedBalance(statement[key]);
                if (balance > 0) result.debit[currency] += balance;
                else if (balance < 0) result.credit[currency] += -balance;
            }
        }
        return result;
    }
    return Object.freeze({ calculate });
});
