(function () {
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async function load() {
    const root = document.getElementById('fx-contacts-list');
    const empty = document.getElementById('fx-contacts-empty');
    if (!root) return;
    try {
      const res = await fetch('/api/contacts');
      const json = res.ok ? await res.json() : null;
      const items = json?.data || json?.contacts || [];
      const active = items.filter((c) => c.is_active !== false && c.isActive !== false);
      if (!active.length) {
        root.innerHTML = '';
        if (empty) empty.hidden = false;
        return;
      }
      if (empty) empty.hidden = true;
      root.innerHTML = active
        .map(
          (c) => `
        <article class="fx-panel" style="padding:16px">
          <h2 class="fx-panel-title" style="font-size:17px">${escapeHtml(c.name || c.title)}</h2>
          <p class="fx-page-desc">${escapeHtml(c.description || '')}</p>
          ${c.phone ? `<p><strong>Тел.</strong> <a href="tel:${escapeHtml(c.phone)}">${escapeHtml(c.phone)}</a></p>` : ''}
          ${c.email ? `<p><strong>Email</strong> <a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></p>` : ''}
          ${c.address ? `<p><strong>Адрес</strong> ${escapeHtml(c.address)}</p>` : ''}
        </article>`
        )
        .join('');
    } catch (_) {
      if (empty) empty.hidden = false;
    }
  }

  document.addEventListener('DOMContentLoaded', load);
})();
