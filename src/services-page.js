(function () {
  async function loadServices() {
    const grid = document.getElementById('fx-services-list');
    if (!grid) return;
    try {
      const res = await fetch('/api/services?active=true');
      const json = res.ok ? await res.json() : null;
      const items = json?.data || json?.services || [];
      if (!items.length) {
        grid.innerHTML = '<p class="fx-page-desc">Каталог услуг настраивается в админке («Услуги и заявки»).</p>';
        return;
      }
      grid.innerHTML = items
        .map(
          (s) => `
        <article class="fx-news-card" style="pointer-events:none">
          <div class="fx-news-card-body">
            <span class="fx-news-chip">${s.category || 'услуга'}</span>
            <h3 class="fx-news-card-title">${s.title || ''}</h3>
            <p class="fx-news-card-excerpt">${s.description || ''}</p>
            ${s.price ? `<p class="fx-news-card-excerpt">${s.price}</p>` : ''}
          </div>
        </article>`
        )
        .join('');
    } catch (_) {
      grid.innerHTML = '<p class="fx-page-desc">Не удалось загрузить каталог.</p>';
    }
  }

  async function submitOrder(e) {
    e.preventDefault();
    const msg = document.getElementById('fx-order-msg');
    const type = document.getElementById('fx-order-type').value;
    const body = {
      company: document.getElementById('fx-order-company').value.trim(),
      contact: document.getElementById('fx-order-contact').value.trim(),
      phone: document.getElementById('fx-order-phone').value.trim(),
      email: document.getElementById('fx-order-email').value.trim(),
      address: (document.getElementById('fx-order-address') || {}).value?.trim() || '',
      purpose: document.getElementById('fx-order-desc').value.trim(),
      description: document.getElementById('fx-order-desc').value.trim(),
      comments: document.getElementById('fx-order-desc').value.trim()
    };
    const url =
      type === 'tower_rental'
        ? '/api/orders/tower-rental'
        : type === 'evacuation'
          ? '/api/orders/tow-truck'
          : '/api/orders/documentation';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (msg) {
        msg.textContent = 'Заявка отправлена. Статус можно отслеживать после связи с оператором.';
        msg.style.color = 'var(--fx-cyan)';
      }
      e.target.reset();
    } catch (err) {
      if (msg) {
        msg.textContent = 'Не удалось отправить заявку. Попробуйте позже или обратитесь в админку.';
        msg.style.color = '#ef4444';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadServices();
    document.getElementById('fx-service-order-form')?.addEventListener('submit', submitOrder);
  });
})();
