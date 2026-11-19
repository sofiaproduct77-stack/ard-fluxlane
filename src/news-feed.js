(function () {
  const CATEGORY = {
    general: 'Общее',
    safety: 'Безопасность',
    technology: 'Технологии',
    construction: 'Инфраструктура',
    events: 'События'
  };

  const PROJECT_STATUS = {
    planning: 'Планирование',
    in_progress: 'В работе',
    completed: 'Завершён',
    suspended: 'Приостановлен'
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

  function coverUrl(raw) {
    if (!raw) return '';
    if (window.apiUtils && window.apiUtils.resolveMediaUrl) {
      return window.apiUtils.resolveMediaUrl(raw);
    }
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = window.API_BASE || '';
    return `${base}${raw.startsWith('/') ? raw : `/${raw}`}`;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function newsCard(n, large) {
    const title = escapeHtml(n.title);
    const excerpt = escapeHtml(n.excerpt || '');
    const date = formatDate(n.publishedAt || n.createdAt);
    const cat = escapeHtml(catLabel(n.category));
    const cover = coverUrl(n.image || n.cover);
    const href = `news-detail.html?id=${encodeURIComponent(n.id)}`;
    const cls = large ? 'fx-news-card fx-news-card--feature' : 'fx-news-card';
    const img = cover
      ? `<div class="fx-news-card-media"><img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async" onerror="this.closest('.fx-news-card-media').classList.add('fx-news-card-media--empty');this.remove();"></div>`
      : `<div class="fx-news-card-media fx-news-card-media--empty" aria-hidden="true"></div>`;
    return `<a class="${cls}" href="${href}">
      ${img}
      <div class="fx-news-card-body">
        <div class="fx-news-card-meta"><time>${date}</time><span class="fx-news-chip">${cat}</span></div>
        <h3 class="fx-news-card-title">${title}</h3>
        <p class="fx-news-card-excerpt">${excerpt}</p>
        <span class="fx-news-card-link">Читать →</span>
      </div>
    </a>`;
  }

  function projectCard(p) {
    const title = escapeHtml(p.title);
    const excerpt = escapeHtml(p.shortDescription || p.description || '');
    const status = escapeHtml(PROJECT_STATUS[p.status] || p.status || '');
    const cover = coverUrl(p.image || p.projectCover);
    const img = cover
      ? `<div class="fx-news-card-media"><img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async" onerror="this.closest('.fx-news-card-media').classList.add('fx-news-card-media--empty');this.remove();"></div>`
      : `<div class="fx-news-card-media fx-news-card-media--empty"></div>`;
    return `<article class="fx-news-card fx-news-card--static">
      ${img}
      <div class="fx-news-card-body">
        <div class="fx-news-card-meta"><span class="fx-news-chip">${status}</span></div>
        <h3 class="fx-news-card-title">${title}</h3>
        <p class="fx-news-card-excerpt">${excerpt}</p>
      </div>
    </article>`;
  }

  async function loadNewsGrid(gridId, limit) {
    const grid = document.getElementById(gridId);
    const empty = document.getElementById('fx-news-page-empty');
    if (!grid) return { total: 0 };
    try {
      const q = limit && limit > 0 ? `?limit=${limit}` : '?limit=100';
      const res = await fetch(`/api/news${q}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const payload = await res.json();
      const items = Array.isArray(payload.data) ? payload.data : [];
      const total = payload.pagination?.total ?? items.length;
      if (!items.length) {
        grid.innerHTML = '';
        if (empty) empty.hidden = false;
        return { total: 0 };
      }
      if (empty) empty.hidden = true;
      grid.innerHTML = items.map((n) => newsCard(n, false)).join('');
      return { total };
    } catch (e) {
      console.warn('[FluxLane] news feed', e);
      if (empty) {
        empty.hidden = false;
        empty.textContent = 'Не удалось загрузить новости.';
      }
      return { total: 0 };
    }
  }

  async function loadProjects() {
    const grid = document.getElementById('fx-projects-grid');
    const empty = document.getElementById('fx-projects-empty');
    if (!grid) return;
    try {
      const res = await fetch('/api/projects?limit=50', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const payload = await res.json();
      const items = (Array.isArray(payload.data) ? payload.data : []).filter((p) => p.isPublic !== false);
      if (!items.length) {
        grid.innerHTML = '';
        if (empty) empty.hidden = false;
        return;
      }
      if (empty) empty.hidden = true;
      grid.innerHTML = items.map(projectCard).join('');
    } catch (e) {
      if (empty) empty.hidden = false;
    }
  }

  function initTabs() {
    const tabs = document.querySelectorAll('[data-fx-news-tab]');
    const panels = document.querySelectorAll('[data-fx-news-panel]');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const id = tab.getAttribute('data-fx-news-tab');
        tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
        panels.forEach((p) => {
          p.hidden = p.getAttribute('data-fx-news-panel') !== id;
        });
      });
    });
  }

  window.FluxLaneNewsFeed = { newsCard, loadNewsGrid, loadProjects, formatDate, catLabel, coverUrl };

  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('fx-news-page-grid')) {
      initTabs();
      loadNewsGrid('fx-news-page-grid', 0);
      loadProjects();
    }
  });
})();
