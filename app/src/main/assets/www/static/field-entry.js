/* Select on entry only. The browser retains control of caret placement, drags and long presses. */
(() => {
    let press;
    const editable = field => (field instanceof HTMLTextAreaElement ||
        (field instanceof HTMLInputElement && /^(text|number|search|email|url|tel|password)$/.test(field.type))) &&
        !field.readOnly && !field.disabled;

    document.addEventListener('pointerdown', event => {
        const field = event.target;
        press = event.isPrimary && event.button === 0 && editable(field) ? {
            field, id: event.pointerId, first: document.activeElement !== field,
            x: event.clientX, y: event.clientY
        } : null;
    }, true);
    document.addEventListener('pointermove', event => {
        if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8)
            press.first = false;
    }, true);
    document.addEventListener('contextmenu', () => { press = null; }, true);
    document.addEventListener('pointercancel', () => { press = null; }, true);
    document.addEventListener('keydown', () => { press = null; }, true);
    document.addEventListener('click', event => {
        const tap = press;
        press = null;
        if (tap?.first && tap.field === event.target && document.activeElement === tap.field && tap.field.value)
            tap.field.select();
    }, true);
    document.addEventListener('focusin', event => {
        const field = event.target;
        if (!press && editable(field) && field.value) field.select();
    });
})();
