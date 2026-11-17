const test = require('node:test');
const assert = require('node:assert/strict');
const install = require('../app/src/main/assets/www/static/ta-scroll-144.js');
function environment() {
  let root = true, hidden = false, key = 'company-a', route = 'settings';
  const frames = [], listeners = {};
  const box = {scrollTop: 0, querySelector: () => root ? {} : null};
  const container = {classList: {contains: () => hidden}};
  const spacer = {style: {}, setAttribute() {}};
  const view = {scrollTop: 200, clientHeight: 600, contains: () => true,
    getBoundingClientRect: () => ({top: 80}), querySelector: () => spacer};
  const header = {getBoundingClientRect: () => ({bottom: 100})};
  const elements = {modalBox: box, modalContainer: container, mainContent: view, topAppBar: header};
  const d = {getElementById: id => elements[id], addEventListener: (name, fn) => listeners[name] = fn,
    scrollingElement: {scrollTop: 0}};
  const w = {requestAnimationFrame: fn => frames.push(fn), getComputedStyle: () => ({overflowY: 'auto'}), innerHeight: 800};
  const UI = {openModal(kind) {root = kind === 'root'; hidden = false; box.scrollTop = 0;}, forceCloseModal() {hidden = true; root = false;}};
  const AppNav = {current: () => ({screen: route}), renderCurrent() {}};
  const SettingsController = {onSectionToggle(section) {if (section.protected) section.open = false;}};
  const api = install({window: w, document: d, UI, AppNav, SettingsController, profileId: () => key});
  return {box, view, spacer, d, w, UI, AppNav, SettingsController, api,
    flush: () => {while (frames.length) frames.shift()();}, setKey: value => key = value, setRoute: value => route = value,
    section: () => ({open: true, isConnected: true, getBoundingClientRect: () => ({top: 350, height: 150})})};
}
test('shareholder root keeps its position through owner forms, back, close and reopen', () => {
  const e = environment(); e.UI.openModal('root'); e.flush(); e.box.scrollTop = 480;
  e.UI.openModal('owner'); e.flush(); assert.equal(e.box.scrollTop, 0);
  e.UI.openModal('root'); e.flush(); assert.equal(e.box.scrollTop, 480);
  e.UI.forceCloseModal(); e.UI.openModal('root'); e.flush(); assert.equal(e.box.scrollTop, 480);
});
test('Reports preserves shareholder position; returning Home resets it', () => {
  const e = environment(); e.setRoute('reports'); e.AppNav.renderCurrent();
  e.UI.openModal('root'); e.flush(); e.box.scrollTop = 370;
  e.setRoute('invoices_list'); e.AppNav.renderCurrent();
  e.setRoute('reports'); e.AppNav.renderCurrent();
  e.UI.openModal('root'); e.flush(); assert.equal(e.box.scrollTop, 370);
  e.setRoute('dashboard'); e.AppNav.renderCurrent();
  e.UI.openModal('root'); e.flush(); assert.equal(e.box.scrollTop, 0);
  e.box.scrollTop = 200;
  e.setRoute('reports'); e.AppNav.renderCurrent();
  e.UI.openModal('root'); e.flush(); assert.equal(e.box.scrollTop, 200);
  e.setRoute('dashboard'); e.AppNav.renderCurrent();
  e.UI.openModal('root'); e.flush(); assert.equal(e.box.scrollTop, 0);
});
test('deferred modal restoration cannot apply an old position after Home reset', () => {
  const e = environment(); e.box.scrollTop = 700; e.UI.openModal('root');
  e.api.resetShareholders(); e.flush(); assert.equal(e.box.scrollTop, 0);
});
test('shareholder positions stay isolated when switching company accounts', () => {
  const e = environment(); e.UI.openModal('root'); e.flush(); e.box.scrollTop = 320;
  e.UI.openModal('owner'); e.flush(); e.setKey('company-b');
  e.UI.openModal('root'); e.flush(); assert.equal(e.box.scrollTop, 0);
  e.box.scrollTop = 180; e.UI.forceCloseModal(); e.setKey('company-a');
  e.UI.openModal('root'); e.flush(); assert.equal(e.box.scrollTop, 320);
});
test('settings heading aligns below overlapping header and provides end-of-page space', () => {
  const e = environment(); e.SettingsController.onSectionToggle(e.section()); e.flush();
  assert.equal(e.view.scrollTop, 442); assert.equal(e.spacer.style.height, '458px');
});
test('protected, closed, detached or abandoned settings panels never scroll', () => {
  for (const state of ['protected', 'closed', 'detached', 'abandoned']) {
    const e = environment(), s = e.section();
    if (state === 'protected') s.protected = true;
    e.SettingsController.onSectionToggle(s);
    if (state === 'closed') s.open = false;
    if (state === 'detached') s.isConnected = false;
    if (state === 'abandoned') e.setRoute('dashboard');
    e.flush(); assert.equal(e.view.scrollTop, 200, state);
  }
});
test('employee plain settings headings use the document scrollport', () => {
  const e = environment(); const events = {};
  e.d.getElementById = id => id === 'screen' ? e.view : id === 'agentHeader' ? {getBoundingClientRect: () => ({bottom: 90})} : null;
  e.d.addEventListener = (name, fn) => events[name] = fn;
  e.w.getComputedStyle = () => ({overflowY: 'visible'});
  install({window: e.w, document: e.d, Agent: {screen: 'settings'}});
  events.click({target: {closest: () => ({parentElement: e.section()})}}); e.flush();
  assert.equal(e.d.scrollingElement.scrollTop, 252);
});
