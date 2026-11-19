(function () {
  const STANDARD_LINKS = `
    <a href="services.html">Услуги и заявки</a>
    <span aria-hidden="true"> · </span>
    <a href="traffic-analysis.html">Карта</a>
    <span aria-hidden="true"> · </span>
    <a href="admin.html">Администрирование</a>`;

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async function loadFooterContacts() {
    const list = document.getElementById('fx-footer-contacts-list');
    if (!list) return;
    try {
      const res = await fetch('/api/contacts');
      const json = res.ok ? await res.json() : null;
      const items = (Array.isArray(json) ? json : json?.data || json?.contacts || []).filter(
        (c) => c.is_active !== false && c.isActive !== false
      );
      if (!items.length) {
        list.innerHTML = `
          <li class="fx-contact-card"><span class="fx-contact-name">FluxLane · приёмная</span><span class="fx-contact-line"><a href="tel:+74812123456">+7 (4812) 12-34-56</a></span><span class="fx-contact-line"><a href="mailto:info@fluxlane-smolensk.ru">info@fluxlane-smolensk.ru</a></span><span class="fx-contact-meta">пн–пт 9:00–18:00</span></li>
          <li class="fx-contact-card"><span class="fx-contact-name">Техподдержка</span><span class="fx-contact-line"><a href="tel:+74812123459">+7 (4812) 12-34-59</a></span><span class="fx-contact-line"><a href="mailto:support@fluxlane-smolensk.ru">support@fluxlane-smolensk.ru</a></span><span class="fx-contact-meta">пн–пт 8:00–20:00</span></li>
          <li class="fx-contact-card"><span class="fx-contact-name">Экстренная линия</span><span class="fx-contact-line"><a href="tel:+74812123457">+7 (4812) 12-34-57</a></span><span class="fx-contact-meta">круглосуточно</span></li>`;
        return;
      }
      list.innerHTML = items
        .map((c) => {
          const name = escapeHtml(c.name || c.title || 'Контакт');
          const phone = c.phone ? `<a href="tel:${escapeHtml(String(c.phone).replace(/\s/g, ''))}">${escapeHtml(c.phone)}</a>` : '';
          const email = c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : '';
          const addr = c.address ? escapeHtml(c.address) : '';
          const hours = c.working_hours || c.workingHours ? escapeHtml(c.working_hours || c.workingHours) : '';
          const line2 = [phone, email].filter(Boolean).join(' · ');
          const line3 = [addr, hours].filter(Boolean).join(' · ');
          return `<li class="fx-contact-card">
            <span class="fx-contact-name">${name}</span>
            ${phone ? `<span class="fx-contact-line">${phone}</span>` : ''}
            ${email ? `<span class="fx-contact-line">${email}</span>` : ''}
            ${line3 ? `<span class="fx-contact-meta">${line3}</span>` : ''}
          </li>`;
        })
        .join('');
    } catch (_) {
      list.innerHTML = '<li class="fx-footer-contact-muted">Не удалось загрузить контакты.</li>';
    }
  }

  function initFooterLinks() {
    document.querySelectorAll('[data-fx-footer-links]').forEach((el) => {
      el.innerHTML = STANDARD_LINKS;
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initFooterLinks();
    loadFooterContacts();
  });
})();
