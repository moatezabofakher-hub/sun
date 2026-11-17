'use strict';
/* Tiqany Acc v138: order settings without renaming or altering section bodies.
   Require a fresh local identity check before expanding data deletion. */
(function(){
  const ORDER = [
    'mobile-computer-sync', // computer connection on a manager phone
    'manager-manager-sync',  // manager phone connection
    'company', 'currency', 'invoices', 'items', 'default_period',
    'printing', 'backup', 'activation', 'security',
    'business-profiles',    // preserve extra company profiles without interrupting requested order
    'data'
  ];
  let dataOpenApproved = false;
  const selectData = () => document.querySelector('details.settings-section[data-settings-section="data"]');

  function reorderSections(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const sections = Array.from(root.querySelectorAll(':scope > details.settings-section[data-settings-section]'));
    if (!sections.length) return;
    const byId = new Map(sections.map(el => [el.dataset.settingsSection, el]));
    const wanted = ORDER.map(id => byId.get(id)).filter(Boolean);
    const others = sections.filter(el => !ORDER.includes(el.dataset.settingsSection));
    // Keep unknown categories, too; data deletion remains the last section.
    const data = byId.get('data');
    const sorted = [...wanted.filter(el => el !== data), ...others, ...(data ? [data] : [])];
    const tail = sections[sections.length - 1].nextSibling;
    const fragment = document.createDocumentFragment();
    for (const el of sorted) fragment.appendChild(el);
    root.insertBefore(fragment, tail);
  }

  // The manager's peer/sync scripts add their sections after the base renderer.
  // Wrap last so the final order includes all sections, on every Settings visit.
  if (typeof Views !== 'undefined' && typeof Views.renderSettings === 'function') {
    const renderOriginal = Views.renderSettings;
    Views.renderSettings = function(root, ...args) {
      dataOpenApproved = false; // re-entry to Settings always requires approval
      if (typeof SettingsController !== 'undefined') {
        SettingsController.expandedSections?.delete('data');
      }
      const result = renderOriginal.call(this, root, ...args);
      reorderSections(root);
      const data = selectData();
      if (data && data.open) data.open = false;
      return result;
    };
  }

  // Catch all ordinary summary activations (tap, mouse and keyboard-generated click)
  // *before* native <details> reveals its protected contents.
  document.addEventListener('click', function(event){
    const summary = event.target?.closest?.('summary');
    const section = summary?.parentElement;
    if (!section || section.dataset?.settingsSection !== 'data' ||
        !section.matches('details.settings-section')) return;
    if (section.open) {
      dataOpenApproved = false; // closing invalidates the approval
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (typeof ProtectionController === 'undefined' ||
        typeof ProtectionController.requirePinForDestructiveAction !== 'function') return;
    ProtectionController.requirePinForDestructiveAction(
      'تحقق بالبصمة أو كلمة السر قبل فتح قسم حذف البيانات',
      function(){
        if (typeof AppNav !== 'undefined' && AppNav.current()?.screen !== 'settings') return;
        const current = selectData();
        if (!current) return;
        dataOpenApproved = true;
        current.open = true;
        SettingsController.onSectionToggle(current);
      },
      'فتح قسم حذف البيانات'
    );
  }, true);

  if (typeof SettingsController !== 'undefined') {
    const toggleOriginal = SettingsController.onSectionToggle;
    SettingsController.onSectionToggle = function(section) {
      if (section?.dataset?.settingsSection === 'data') {
        if (section.open && !dataOpenApproved) {
          section.open = false;
          this.expandedSections?.delete('data');
          return; // programmatic opening is never an authorization bypass
        }
        if (!section.open) dataOpenApproved = false;
      }
      return toggleOriginal.call(this, section);
    };
    const closeOriginal = SettingsController.closeAllSections;
    SettingsController.closeAllSections = function(...args) {
      dataOpenApproved = false;
      return closeOriginal.apply(this, args);
    };
    const restoreOriginal = SettingsController.restoreVisibleSettingsView;
    if (typeof restoreOriginal === 'function') {
      SettingsController.restoreVisibleSettingsView = function(view) {
        // A re-render or return from another page cannot retain authorization.
        if (view?.section === 'data') {
          dataOpenApproved = false;
          view = {...view, section: null};
        }
        return restoreOriginal.call(this, view);
      };
    }
  }
})();
