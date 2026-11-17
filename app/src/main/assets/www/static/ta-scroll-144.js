/* Tiqany 3.5.144: shareholder position and settings section alignment. */
(function () {
  'use strict';
  function install(env) {
    const {window: w, document: d, UI, AppNav, SettingsController, Agent} = env;
    const positions = new Map();
    let generation = 0;
    let modalProfile = null;
    const profile = () => String(env.profileId?.() || 'default');
    const modal = () => d.getElementById('modalBox');
    const isRoot = box => !!box?.querySelector('.ta-share-owners');
    const visible = () => !d.getElementById('modalContainer')?.classList.contains('hidden');
    function capture() {
      const box = modal();
      if (modalProfile === profile() && visible() && isRoot(box)) positions.set(profile(), box.scrollTop || 0);
    }
    function resetShareholders() {
      positions.delete(profile());
      generation++;
      if (isRoot(modal())) modal().scrollTop = 0;
    }
    if (UI?.openModal) {
      const open = UI.openModal;
      UI.openModal = function (...args) {
        capture();
        const result = open.apply(this, args);
        const box = modal();
        const token = ++generation;
        const key = profile();
        modalProfile = key;
        const top = isRoot(box) ? (positions.get(key) || 0) : 0;
        const restore = () => {
          if (token === generation && key === profile() && box === modal() && visible()) box.scrollTop = top;
        };
        restore();
        w.requestAnimationFrame(restore);
        return result;
      };
      const close = UI.forceCloseModal;
      if (close) UI.forceCloseModal = function (...args) {
        capture(); generation++;
        return close.apply(this, args);
      };
      d.addEventListener('scroll', e => { if (e.target === modal()) capture(); }, true);
    }
    if (AppNav?.renderCurrent) {
      let lastScreen = AppNav.current()?.screen;
      const render = AppNav.renderCurrent;
      AppNav.renderCurrent = function (...args) {
        const next = this.current()?.screen;
        if (next === 'dashboard' && lastScreen !== 'dashboard') resetShareholders();
        lastScreen = next;
        return render.apply(this, args);
      };
    }
    const isSettings = () => AppNav ? AppNav.current()?.screen === 'settings' : Agent?.screen === 'settings';
    function alignSection(section) {
      const apply = () => {
        if (!isSettings() || section.isConnected === false || ('open' in section && !section.open)) return;
        const view = d.getElementById('mainContent') || d.getElementById('screen');
        if (!view || !view.contains(section)) return;
        const header = d.getElementById('topAppBar') || d.getElementById('agentHeader');
        const rect = view.getBoundingClientRect();
        const style = w.getComputedStyle(view);
        const ownScroll = /auto|scroll/.test(style.overflowY);
        const scroller = ownScroll ? view : d.scrollingElement;
        if (!scroller) return;
        const visibleTop = Math.max(ownScroll ? rect.top : 0, header?.getBoundingClientRect().bottom || 0);
        const height = ownScroll ? view.clientHeight : w.innerHeight - visibleTop;
        let spacer = view.querySelector('[data-ta-settings-scroll-spacer]');
        if (!spacer) {
          spacer = d.createElement('div');
          spacer.setAttribute('data-ta-settings-scroll-spacer', '');
          spacer.setAttribute('aria-hidden', 'true');
          view.appendChild(spacer);
        }
        spacer.style.height = Math.max(0, height - section.getBoundingClientRect().height + 8) + 'px';
        scroller.scrollTop += section.getBoundingClientRect().top - visibleTop - 8;
      };
      // Wait for other accordion sections to close before measuring layout.
      w.requestAnimationFrame(apply);
    }
    if (SettingsController?.onSectionToggle) {
      const toggle = SettingsController.onSectionToggle;
      SettingsController.onSectionToggle = function (section) {
        const result = toggle.call(this, section);
        // Check after the protection wrapper: a refused open must never scroll.
        if (section?.open) alignSection(section);
        return result;
      };
    }
    // Employee settings use plain titled panels rather than manager accordions.
    if (Agent) d.addEventListener('click', e => {
      const heading = e.target?.closest?.('#screen .panel > h3');
      if (heading && isSettings()) alignSection(heading.parentElement);
    });
    return {resetShareholders, alignSection};
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = install;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.TiqanyScroll144 = install({window, document,
      UI: typeof UI === 'undefined' ? null : UI,
      AppNav: typeof AppNav === 'undefined' ? null : AppNav,
      SettingsController: typeof SettingsController === 'undefined' ? null : SettingsController,
      Agent: typeof Agent === 'undefined' ? null : Agent,
      profileId: () => typeof ProfileManager === 'undefined' ? null : ProfileManager.activeId});
  }
})();
