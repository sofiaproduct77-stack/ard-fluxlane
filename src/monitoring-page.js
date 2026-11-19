(function () {
  let events = [];
  let filter = 'all';
  let searchQuery = '';
  let trafficWindow = 'all';
  let lastUpdated = null;

  function formatTime(d) {
    const x = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(x.getTime())) return '—';
    return x.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function sevLabel(sev) {
    if (sev === 'crit') return 'Критическое';
    if (sev === 'warn') return 'Предупреждение';
    return 'Информация';
  }

  function setText(sel, text) {
    const el = document.querySelector(sel);
    if (el) el.textContent = text;
  }

  function getSafetyYear() {
    return document.getElementById('accidents-year-select')?.value || '2025';
  }

  function updateContextBanner() {
    const windowLabel =
      trafficWindow === '7' ? 'последние 7 дней' : trafficWindow === '30' ? 'последние 30 дней' : 'вся выборка в базе';
    setText('#fx-ctx-traffic-period', windowLabel);
    setText('#fx-ctx-safety-period', `календарный ${getSafetyYear()} год (архив)`);
    setText('#fx-ctx-updated', lastUpdated ? formatTime(lastUpdated) : '—');
    const title = document.getElementById('fx-safety-chart-title');
    if (title) title.textContent = `Показатели за ${getSafetyYear()} год (исторические данные)`;
  }

  async function loadTrafficSnapshot() {
    const tracks = await fetch('/api/traffic/tracks?limit=5000').then((r) => (r.ok ? r.json() : []));
    const arr = Array.isArray(tracks) ? tracks : [];
    const detectors = await fetch('/api/traffic/detectors').then((r) => (r.ok ? r.json() : []));
    const detN = Array.isArray(detectors) ? detectors.length : 0;

    const now = Date.now();
    const ms =
      trafficWindow === '7' ? 7 * 86400000 : trafficWindow === '30' ? 30 * 86400000 : null;

    let passages = 0;
    arr.forEach((t) => {
      (t.detectorSequence || []).forEach((p) => {
        if (!ms) {
          passages += 1;
          return;
        }
        const ts = new Date(p.timestamp).getTime();
        if (ts >= now - ms) passages += 1;
      });
    });

    setText('[data-mon-detectors]', String(detN));
    setText('[data-mon-passages]', passages.toLocaleString('ru-RU'));
    setText('[data-mon-tracks]', arr.length.toLocaleString('ru-RU'));
  }

  function renderFeed() {
    const root = document.getElementById('fx-events-feed');
    const q = searchQuery.trim().toLowerCase();
    const list = events.filter((e) => {
      if (filter !== 'all' && e.severity !== filter) return false;
      if (!q) return true;
      return `${e.title} ${e.detail}`.toLowerCase().includes(q);
    });

    const alerts = events.filter((e) => e.severity === 'crit' || e.severity === 'warn').length;
    setText('[data-mon-alerts]', String(alerts));

    if (root) {
      root.innerHTML = list.length
        ? list
            .map(
              (e) => `
          <article class="fx-event">
            <div class="fx-event-sev ${e.severity}"></div>
            <div class="fx-event-body">
              <div class="fx-event-head">
                <h3 class="fx-event-title">${e.title}</h3>
                <span class="fx-sev-badge ${e.severity}">${sevLabel(e.severity)}</span>
              </div>
              <p class="fx-event-meta">${e.detail}</p>
            </div>
            <time class="fx-event-time">${formatTime(e.time)}</time>
          </article>`
            )
            .join('')
        : '<p class="fx-empty">Нет уведомлений для выбранного фильтра.</p>';
    }

    renderHomeStrip(list.slice(0, 4));
    document.dispatchEvent(new CustomEvent('fluxlane:monitoring-updated'));
  }

  function renderHomeStrip(items) {
    const home = document.getElementById('fx-home-events');
    if (!home) return;
    if (!items.length) {
      home.innerHTML = '<p class="fx-empty">Нет активных уведомлений</p>';
      return;
    }
    home.innerHTML = items
      .map(
        (e) => {
          const href = e.href || 'monitoring.html';
          return `
      <a class="fx-live-item ${e.severity}" href="${href}">
        <span class="fx-live-item-title">${e.title}</span>
        <span class="fx-live-item-meta">${formatTime(e.time)}</span>
      </a>`;
        }
      )
      .join('');
  }

  async function buildEvents() {
    events = [];
    lastUpdated = new Date();
    const safetyYear = getSafetyYear();

    try {
      const acc = await fetch(`/api/accidents/statistics?year=${safetyYear}`).then((r) => (r.ok ? r.json() : null));
      if (acc?.current?.total) {
        const t = acc.current.total;
        const n = Number(t.accidentsCount);
        if (n > 0) {
          events.push({
            severity: n >= 200 ? 'warn' : 'info',
            title: `Статистика ДТП за ${safetyYear} год`,
            detail: `Всего ${n} случаев · ранено ${t.injuredCount}, погибло ${t.deathsCount}. Исторические агрегаты из базы.`,
            time: lastUpdated
          });
        }
      }
    } catch (_) {}

    try {
      const detectors = await fetch('/api/traffic/detectors').then((r) => (r.ok ? r.json() : []));
      const n = Array.isArray(detectors) ? detectors.length : 0;
      events.push({
        severity: n > 0 ? 'info' : 'warn',
        title: 'Инфраструктура мониторинга',
        detail: n > 0 ? `${n} датчиков доступны для анализа потоков.` : 'Импортируйте датчики в разделе «Данные».',
        time: lastUpdated
      });

      const infra = document.getElementById('fx-infra-stats');
      if (infra) {
        infra.innerHTML = `
          <li><span>Датчики</span><strong>${n}</strong></li>
          <li><span>API</span><strong class="fx-ok">Online</strong></li>
          <li><span>Окно потоков</span><strong>${trafficWindow === 'all' ? 'Вся база' : trafficWindow + ' дн.'}</strong></li>
          <li><span>Обновлено</span><strong>${formatTime(lastUpdated)}</strong></li>`;
      }
    } catch (_) {
      events.push({ severity: 'crit', title: 'Сервер недоступен', detail: 'Запустите npm start и обновите страницу.', time: lastUpdated });
    }

    try {
      const arr = await fetch('/api/traffic/tracks?limit=5000').then((r) => (r.ok ? r.json() : []));
      const tracks = Array.isArray(arr) ? arr : [];
      if (!tracks.length) {
        events.push({
          severity: 'warn',
          title: 'Нет данных о проездах',
          detail: 'Импортируйте выборку для построения аналитики.',
          time: lastUpdated
        });
      } else {
        const hot = new Map();
        tracks.forEach((t) => {
          (t.detectorSequence || []).forEach((p) => {
            if (p.detectorId) hot.set(p.detectorId, (hot.get(p.detectorId) || 0) + 1);
          });
        });
        const top = [...hot.entries()].sort((a, b) => b[1] - a[1])[0];
        if (top && top[1] > 200) {
          events.push({
            severity: 'warn',
            title: 'Высокая интенсивность',
            detail: `Датчик #${top[0]}: ${top[1]} фиксаций в текущей выборке.`,
            time: lastUpdated
          });
        }
      }
    } catch (_) {}

    try {
      const newsPayload = await fetch('/api/news?limit=6').then((r) => (r.ok ? r.json() : null));
      const newsItems = Array.isArray(newsPayload?.data) ? newsPayload.data : [];
      newsItems.forEach((n) => {
        if (!n?.title) return;
        events.push({
          severity: n.category === 'safety' ? 'warn' : 'info',
          title: n.title.length > 72 ? `${n.title.slice(0, 69)}…` : n.title,
          detail: n.excerpt || 'Материал по данным открытых источников — раздел «Новости».',
          time: n.publishedAt || n.createdAt || lastUpdated,
          href: n.id ? `news-detail.html?id=${encodeURIComponent(n.id)}` : 'news.html'
        });
      });
    } catch (_) {}

    events.push({
      severity: 'info',
      title: 'Карта событий и архив ДТП',
      detail: 'Сводки и фильтр по периоду — на вкладке «Карта событий».',
      time: lastUpdated,
      href: 'events-map.html'
    });

    events.push({
      severity: 'info',
      title: 'Дорожные проекты региона',
      detail: 'Ремонты и нацпроекты 2024–2026 — вкладка «Новости», раздел «Проекты».',
      time: lastUpdated,
      href: 'news.html'
    });

    events.sort((a, b) => new Date(b.time) - new Date(a.time));
    await loadTrafficSnapshot();
    updateContextBanner();
    renderFeed();
  }

  window.FluxLaneMonitoring = {
    getAlertCount: async () => {
      if (!events.length) await buildEvents();
      return {
        total: events.filter((e) => e.severity === 'crit' || e.severity === 'warn').length,
        crit: events.filter((e) => e.severity === 'crit').length,
        warn: events.filter((e) => e.severity === 'warn').length,
        info: events.filter((e) => e.severity === 'info').length
      };
    },
    refresh: buildEvents
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-sev-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-sev-filter]').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        filter = btn.getAttribute('data-sev-filter') || 'all';
        renderFeed();
      });
    });

    document.getElementById('fx-event-search')?.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderFeed();
    });

    document.getElementById('fx-traffic-window')?.addEventListener('change', (e) => {
      trafficWindow = e.target.value;
      buildEvents();
    });

    document.getElementById('accidents-year-select')?.addEventListener('change', () => {
      updateContextBanner();
      buildEvents();
      if (typeof window.updateCharts === 'function') window.updateCharts();
    });

    document.getElementById('fx-refresh-events')?.addEventListener('click', buildEvents);

    buildEvents();
    setInterval(buildEvents, 60000);
  });
})();
