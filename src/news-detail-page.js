(function () {
  const CATEGORY = {
    general: 'Общее',
    safety: 'Безопасность',
    technology: 'Технологии',
    construction: 'Инфраструктура',
    events: 'События'
  };

  function catLabel(c) {
    return CATEGORY[c] || c || 'Новость';
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch (_) {
      return '';
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function coverUrl(n) {
    if (window.apiUtils && window.apiUtils.resolveMediaUrl) {
      return window.apiUtils.resolveMediaUrl(n.image || n.cover);
    }
    const raw = n.image || n.cover || '';
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = window.API_BASE || '';
    return `${base}${raw.startsWith('/') ? raw : `/${raw}`}`;
  }

  function renderContent(htmlOrText) {
    const raw = String(htmlOrText || '');
    if (/<[a-z][\s\S]*>/i.test(raw)) {
      return raw;
    }
    return raw
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
      .join('');
  }

  async function loadArticle() {
    const root = document.getElementById('fx-news-article');
    if (!root) return;

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
      root.innerHTML = '<p class="fx-page-desc">Не указана новость. <a href="index.html#news">К списку</a></p>';
      return;
    }

    try {
      const base = window.API_BASE || '';
      const res = await fetch(`${base}/api/news/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const n = await res.json();

      document.title = `${n.title || 'Новость'} — FluxLane`;

      const title = escapeHtml(n.title);
      const date = formatDate(n.publishedAt || n.createdAt);
      const cat = escapeHtml(catLabel(n.category));
      const cover = coverUrl(n);
      const coverBlock = cover
        ? `<img class="fx-article-cover" src="${escapeHtml(cover)}" alt="">`
        : '';
      const body = renderContent(n.content);

      root.innerHTML = `
        ${coverBlock}
        <div class="fx-article-meta">
          <time datetime="${escapeHtml(n.publishedAt || n.createdAt || '')}">${date}</time>
          <span class="fx-news-chip">${cat}</span>
        </div>
        <h1 class="fx-page-title">${title}</h1>
        <div class="fx-article-body">${body}</div>
      `;
    } catch (e) {
      console.warn('[FluxLane] news detail', e);
      root.innerHTML =
        '<p class="fx-page-desc">Новость не найдена или недоступна. <a href="index.html#news">К списку</a></p>';
    }
  }

  document.addEventListener('DOMContentLoaded', loadArticle);
})();
