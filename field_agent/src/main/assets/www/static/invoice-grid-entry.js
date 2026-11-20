const InvoiceGridEntry = {
    update(field, pending, updateCounter) {
        const value = field.value.trim()
            .replace(/[٠-٩]/g, n => String(n.charCodeAt(0) - 1632))
            .replace(/[۰-۹]/g, n => String(n.charCodeAt(0) - 1776))
            .replace(/[،,٫]/g, '.');
        const quantity = Number(value);
        const valid = value === '' || (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) &&
            Number.isFinite(quantity) && quantity <= Number.MAX_SAFE_INTEGER);
        field.setCustomValidity(valid ? '' : 'أدخل كمية صالحة');
        const id = field.dataset.gridItem;
        if (valid && quantity > 0) pending[id] = quantity;
        else delete pending[id];
        const badge = field.closest('[data-grid-card]').querySelector('[data-grid-count]');
        if (badge) badge.textContent = String(pending[id] || 0);
        updateCounter();
    },

    revealRows() {
        requestAnimationFrame(() => {
            const rows = document.querySelector('#mainContent .invoice-added-items, #screen .invoice-added-items');
            const footer = document.querySelector('.ta-invoice-save-footer, .ta-agent-invoice-save-footer');
            if (!rows || !footer) return;
            let host = rows.parentElement;
            while (host && (!/^(auto|scroll)$/.test(getComputedStyle(host).overflowY) || host.scrollHeight <= host.clientHeight))
                host = host.parentElement;
            host ||= document.scrollingElement;
            const header = document.querySelector('header.ta-app-header, #agentHeader');
            const dockedHeader = header && /fixed|sticky/.test(getComputedStyle(header).position);
            const top = () => Math.max(0, host === document.scrollingElement ? 0 : host.getBoundingClientRect().top,
                dockedHeader ? Math.max(0, header.getBoundingClientRect().bottom) : 0);
            const size = () => { rows.style.minHeight = Math.max(0, footer.getBoundingClientRect().top - top()) + 'px'; };
            size();
            host.scrollTop += rows.getBoundingClientRect().top - top();
            // The soft keyboard and font size can change either edge of the available space.
            const observer = new ResizeObserver(() => {
                if (!rows.isConnected) { observer.disconnect(); return; }
                const aligned = Math.abs(rows.getBoundingClientRect().top - top()) < 4;
                size();
                if (aligned) host.scrollTop += rows.getBoundingClientRect().top - top();
            });
            observer.observe(footer);
            observer.observe(host);
        });
    }
};
