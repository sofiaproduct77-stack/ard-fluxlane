(function () {
  // Рамки по границам районов Смоленска (OSM) и по тому, как районы читаются на карте:
  // Ленинский — западнее, вокруг Казанской горы; Промышленный — восточнее, Рачевка и ул. Бабушкина.
  const DISTRICT_BOXES = {
    Ленинский: { lat: [54.768, 54.793], lon: [32.018, 32.05] },
    Промышленный: { lat: [54.766, 54.802], lon: [32.058, 32.098] },
    Заднепровский: { lat: [54.788, 54.81], lon: [32.02, 32.05] },
    Центральный: { lat: [54.774, 54.786], lon: [32.038, 32.052] },
    'Не указан': { lat: [54.775, 54.785], lon: [32.04, 32.055] }
  };

  let mapEl;
  let map;
  let layer;
  let fromInput;
  let toInput;
  let applyBtn;
  let districtSelect;
  let eventsCache = [];
  let markerById = new Map();
  let districtChart = null;
  let selectedId = null;
  const severityOn = new Set(['death', 'injured', 'none']);

  function ensureDom() {
    mapEl = document.getElementById('fx-events-map');
    if (!mapEl || typeof L === 'undefined') return false;
    layer = layer || L.layerGroup();
    fromInput = document.getElementById('fx-events-from');
    toInput = document.getElementById('fx-events-to');
    applyBtn = document.getElementById('fx-events-apply');
    districtSelect = document.getElementById('fx-events-district');
    return true;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function defaultRange() {
    const to = new Date();
    if (fromInput) fromInput.value = '2024-01-01';
    if (toInput) {
      const end = to.getFullYear() > 2026 ? new Date(2026, 11, 31) : to;
      toInput.value = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
    }
    [fromInput, toInput].forEach((el) => {
      if (!el) return;
      el.max = '2026-12-31';
      el.min = '2020-01-01';
    });
  }

  function severityKey(ev) {
    if (ev.deathsCount > 0) return 'death';
    if (ev.injuredCount > 0) return 'injured';
    return 'none';
  }

  const PLACE_COORDS = {
    'ул. Николаева, 44': [54.7695243, 32.0193609],
    'ул. Николаева, поворот на 2-й Краснинский пер.': [54.7747652, 32.0357964],
    'ул. Николаева, 54': [54.7684145, 32.0130718],
    'ул. Кирова, 20': [54.7685748, 32.0309492],
    'ул. Кирова, 41': [54.7694348, 32.04346],
    'ул. Кирова, 43': [54.769146, 32.0454713],
    'ул. Дзержинского, 1': [54.7808654, 32.0367545],
    'ул. Большая Советская, 13': [54.7851853, 32.0541796],
    'ул. Исаковского / ул. Тенишевой': [54.7786, 32.0597],
    'ул. Индустриальная, 2А': [54.7695669, 32.098647]
  };

  function coordsForEvent(ev, index) {
    const lat = Number(ev.latitude);
    const lon = Number(ev.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];
    const hit = PLACE_COORDS[ev.street];
    if (hit) return hit;
    const district = ev.district || 'Не указан';
    const box = DISTRICT_BOXES[district] || DISTRICT_BOXES['Не указан'];
    const h = (Number(ev.id) * 9973 + index * 131) >>> 0;
    const uLat = (h % 1000) / 999;
    const uLon = (Math.floor(h / 1000) % 1000) / 999;
    return [
      box.lat[0] + uLat * (box.lat[1] - box.lat[0]),
      box.lon[0] + uLon * (box.lon[1] - box.lon[0])
    ];
  }

  function markerColor(ev) {
    if (ev.deathsCount > 0) return '#ef4444';
    if (ev.injuredCount > 0) return '#f59e0b';
    return '#38bdf8';
  }

  function severityLabel(ev) {
    if (ev.deathsCount > 0) return 'С погибшими';
    if (ev.injuredCount > 0) return 'С пострадавшими';
    return 'Без пострадавших';
  }

  function filteredEvents() {
    const q = (document.getElementById('fx-events-search')?.value || '').trim().toLowerCase();
    const district = districtSelect?.value || '';
    return eventsCache.filter((ev) => {
      if (!severityOn.has(severityKey(ev))) return false;
      if (district && (ev.district || '') !== district) return false;
      if (!q) return true;
      const hay = `${ev.date} ${ev.district || ''} ${ev.street || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function updateDistrictFilterOptions(events) {
    if (!districtSelect) return;
    const current = districtSelect.value;
    const districts = [...new Set(events.map((e) => e.district).filter(Boolean))].sort();
    districtSelect.innerHTML =
      '<option value="">Все районы</option>' + districts.map((d) => `<option value="${d}">${d}</option>`).join('');
    if (current && districts.includes(current)) districtSelect.value = current;
  }

  function updateSummary(events) {
    let acc = 0;
    let inj = 0;
    let death = 0;
    const byDistrict = new Map();
    events.forEach((ev) => {
      acc += Number(ev.accidentsCount || 0);
      inj += Number(ev.injuredCount || 0);
      death += Number(ev.deathsCount || 0);
      const d = ev.district || 'Не указан';
      byDistrict.set(d, (byDistrict.get(d) || 0) + Number(ev.accidentsCount || 0));
    });
    const elAcc = document.getElementById('fx-ev-stat-acc');
    const elInj = document.getElementById('fx-ev-stat-inj');
    const elDeath = document.getElementById('fx-ev-stat-death');
    if (elAcc) elAcc.textContent = String(acc);
    if (elInj) elInj.textContent = String(inj);
    if (elDeath) elDeath.textContent = String(death);

    const chartEl = document.getElementById('fx-events-district-chart');
    if (!chartEl || !window.Chart) return;
    const labels = [...byDistrict.keys()].slice(0, 6);
    const data = labels.map((l) => byDistrict.get(l));
    if (districtChart) districtChart.destroy();
    districtChart = new Chart(chartEl, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'ДТП', data, backgroundColor: 'rgba(56,189,248,0.4)', borderColor: '#38bdf8', borderWidth: 1 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 9 }, maxRotation: 45, minRotation: 0 }, grid: { display: false } },
          y: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    });
  }

  function renderList(events) {
    const root = document.getElementById('fx-events-list');
    if (!root) return;
    root.innerHTML = events.length
      ? events
          .map(
            (ev) => `<button type="button" class="fx-events-list-item${selectedId === ev.id ? ' is-active' : ''}" data-ev-id="${ev.id}">
              <span class="fx-events-list-date">${ev.date}</span>
              <span class="fx-events-list-place">${ev.district || '—'}${ev.street ? ', ' + ev.street : ''}</span>
              <span class="fx-events-list-meta">ДТП ${ev.accidentsCount} · ${severityLabel(ev)}</span>
            </button>`
          )
          .join('')
      : '<p class="fx-events-empty">Нет событий по фильтрам</p>';

    root.querySelectorAll('[data-ev-id]').forEach((btn) => {
      btn.addEventListener('click', () => selectEvent(Number(btn.getAttribute('data-ev-id'))));
    });
  }

  function showDetail(ev) {
    const panel = document.getElementById('fx-event-detail');
    const title = document.getElementById('fx-event-detail-title');
    const body = document.getElementById('fx-event-detail-body');
    if (!panel || !body) return;
    selectedId = ev.id;
    if (title) title.textContent = `ДТП · ${ev.date}`;
    body.innerHTML = `
      <div><dt>Район</dt><dd>${ev.district || '—'}</dd></div>
      <div><dt>Адрес</dt><dd>${ev.street || '—'}</dd></div>
      <div><dt>Тип</dt><dd>${ev.accidentType || '—'}</dd></div>
      <div><dt>ДТП</dt><dd>${ev.accidentsCount}</dd></div>
      <div><dt>Ранено</dt><dd>${ev.injuredCount}</dd></div>
      <div><dt>Погибло</dt><dd>${ev.deathsCount}</dd></div>
      <div><dt>Критичность</dt><dd>${severityLabel(ev)}</dd></div>`;
    panel.hidden = false;
    renderList(filteredEvents());
    const m = markerById.get(ev.id);
    if (m && map) {
      map.setView(m.getLatLng(), Math.max(map.getZoom(), 14), { animate: true });
      m.openPopup();
    }
  }

  function selectEvent(id) {
    const ev = eventsCache.find((e) => e.id === id);
    if (ev) showDetail(ev);
  }

  function drawMarkers(events) {
    markerById.clear();
    layer.clearLayers();
    events.forEach((ev, idx) => {
      const [lat, lon] = coordsForEvent(ev, idx);
      const color = markerColor(ev);
      const m = L.circleMarker([lat, lon], {
        radius: selectedId === ev.id ? 10 : 7,
        color: selectedId === ev.id ? '#fff' : '#080b12',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.92
      });
      m.bindPopup(
        `<strong>${ev.date}</strong><br>${ev.district || '—'}${ev.street ? ', ' + ev.street : ''}<br>ДТП: ${ev.accidentsCount}`
      );
      m.on('click', () => showDetail(ev));
      m.addTo(layer);
      markerById.set(ev.id, m);
    });

    if (events.length > 1 && map) {
      const bounds = L.latLngBounds(events.map((ev, idx) => coordsForEvent(ev, idx)));
      if (window.FluxLaneMapTiles?.SMOLENSK_BOUNDS) {
        map.fitBounds(bounds.pad(0.12), { maxZoom: 14 });
      } else {
        map.fitBounds(bounds.pad(0.12));
      }
    }
  }

  async function loadEvents() {
    const from = fromInput?.value;
    const to = toInput?.value;
    if (!from || !to) return;

    const countEl = document.getElementById('fx-events-map-count');
    const rangeEl = document.getElementById('fx-events-map-range');

    let events = [];
    try {
      const res = await fetch(`/api/accidents/map-events?${new URLSearchParams({ from, to })}`);
      events = res.ok ? await res.json() : [];
      if (!Array.isArray(events)) events = [];
    } catch (_) {
      events = [];
    }

    eventsCache = events;
    updateDistrictFilterOptions(events);
    const visible = filteredEvents();
    if (countEl) countEl.textContent = String(visible.length);
    if (rangeEl) rangeEl.textContent = `${from} — ${to}`;
    updateSummary(visible);
    renderList(visible);
    drawMarkers(visible);
    map?.invalidateSize();
  }

  function refreshView() {
    const visible = filteredEvents();
    const countEl = document.getElementById('fx-events-map-count');
    if (countEl) countEl.textContent = String(visible.length);
    updateSummary(visible);
    renderList(visible);
    drawMarkers(visible);
  }

  function initMap() {
    map = L.map(mapEl, { zoomControl: false, attributionControl: false }).setView([54.775, 32.045], 13);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    if (window.FluxLaneMapTiles && window.FluxLaneMapTiles.hideAttribution) {
      window.FluxLaneMapTiles.hideAttribution(map);
    }
    if (window.FluxLaneMapTiles) {
      window.FluxLaneMapTiles.addFluxLaneBaseLayer(map);
      window.FluxLaneMapTiles.applySmolenskView(map, { fit: true, maxZoom: 14 });
      window.FluxLaneMapTiles.ensureMapSize(map, mapEl);
    } else {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: false }).addTo(map);
    }
    layer.addTo(map);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!ensureDom()) return;
    defaultRange();
    initMap();
    loadEvents().catch(console.warn);

    applyBtn?.addEventListener('click', () => loadEvents().catch(console.warn));
    document.getElementById('fx-events-search')?.addEventListener('input', refreshView);
    districtSelect?.addEventListener('change', refreshView);

    document.querySelectorAll('#fx-events-severity .fx-ev-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-sev');
        if (severityOn.has(key)) {
          if (severityOn.size <= 1) return;
          severityOn.delete(key);
          btn.classList.remove('is-on');
        } else {
          severityOn.add(key);
          btn.classList.add('is-on');
        }
        refreshView();
      });
    });

    document.getElementById('fx-event-detail-close')?.addEventListener('click', () => {
      const panel = document.getElementById('fx-event-detail');
      if (panel) panel.hidden = true;
      selectedId = null;
      refreshView();
    });

    requestAnimationFrame(() => {
      map?.invalidateSize();
    });
  });

  window.FluxLaneEventsMap = { reload: loadEvents };
})();
