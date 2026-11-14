const assert = require('assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/www/index.html'), 'utf8');
const match = html.match(/            openCurrencyPicker\(\) \{([\s\S]*?)\n            \},\n            /);
assert(match, 'Currency picker code must exist');
assert(html.includes("wrapper.style.cssText='position:fixed;inset:0;z-index:11000;'"), 'explicit z-index needed for all Android WebViews');
assert(!match[1].includes('z-[9999] bg-slate'), 'must not depend on uncompiled Tailwind class for stacking');
assert(html.includes("document.getElementById('itmCurrencyPopup')?.remove();"), 'opening/closing item modal should clean stale nested overlays');
assert(html.includes("if(currencyPopup){currencyPopup.remove();return;}"), 'Android back must first close currency picker');
const containers = new Map();
const currencyButton = { innerHTML: '' };
containers.set('itmCurrencySelect', currencyButton);
let lastPopup = null;
const document = {
  getElementById(id) { return containers.get(id) || null; },
  createElement() {
    const el = {
      style: {},
      attributes: {},
      setAttribute(key, value) { this.attributes[key] = value; },
      remove() { containers.delete(this.id); this.removed = true; },
      querySelectorAll(selector) {
        assert.strictEqual(selector, '[data-curr]');
        return ['USD','SYP'].map(curr => ({ dataset: { curr }, onclick: null }));
      },
      querySelector(selector) {
        if(selector === '[data-close]') return {onclick: null};
        return null;
      }
    };
    const buttons = ['USD','SYP'].map(curr => ({ dataset: { curr }, onclick: null }));
    el.querySelectorAll = () => buttons;
    el._buttons = buttons;
    return el;
  },
  body: {append(el) {containers.set(el.id, el);lastPopup=el;} }
};
const State = {settings: {primaryOnlyMode:false}};
const CurrencyCatalog = {primary() {return 'SYP';}};
const openCurrencyPicker = new Function('State', 'CurrencyCatalog', 'document', 'return ({openCurrencyPicker(){' + match[1] + '}}).openCurrencyPicker;')(State,CurrencyCatalog,document);
const subject = {setItemBaseCurrency(currency){this.selected = currency;},openCurrencyPicker};
subject.openCurrencyPicker();
assert.strictEqual(lastPopup.style.cssText, 'position:fixed;inset:0;z-index:11000;');
assert.strictEqual(lastPopup.attributes.role, 'dialog');
assert.strictEqual(lastPopup.attributes['aria-modal'], 'true');
assert(containers.get('itmCurrencyPopup'));
lastPopup._buttons[0].onclick();
assert.strictEqual(subject.selected, 'USD');
assert(currencyButton.innerHTML.includes('USD'));
assert(currencyButton.innerHTML.includes('fa-coins'));
assert(!containers.has('itmCurrencyPopup'), 'currency popup must close on selection');
subject.openCurrencyPicker();
assert(containers.has('itmCurrencyPopup'));
subject.openCurrencyPicker();
assert(!containers.has('itmCurrencyPopup'), 'tapping currency a second time closes its popup');
console.log('PASS: currency picker above editor, selection, icon, cleanup and back guard');
