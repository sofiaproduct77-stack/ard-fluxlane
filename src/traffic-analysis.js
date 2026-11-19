// Простая страница карты: подложка OSM через Leaflet и маркеры детекторов
(function() {
  function on(id, event, handler) {
    const el = document.getElementById(id);
    if (!el) {
      console.warn('[traffic-analysis] element not found:', id);
      return null;
    }
    el.addEventListener(event, handler);
    return el;
  }

  const mapEl = document.getElementById('map');
  if (!mapEl || typeof L === 'undefined') {
    console.error('[traffic-analysis] map container or Leaflet missing');
    return;
  }
  const map = L.map('map', { zoomControl: true, attributionControl: false }).setView([54.775, 32.045], 13);
  if (window.FluxLaneMapTiles && window.FluxLaneMapTiles.hideAttribution) {
    window.FluxLaneMapTiles.hideAttribution(map);
  }
  if (window.FluxLaneMapTiles && window.FluxLaneMapTiles.applySmolenskView) {
    window.FluxLaneMapTiles.applySmolenskView(map, { fit: true, maxZoom: 14 });
  }
  window.__fluxLaneMap = map;
  // отдельные панели слоёв, чтобы управлять порядком отрисовки
  const targetPane = map.createPane('targetPane');
  targetPane.style.zIndex = 640; // ниже совпадений
  const matchPane = map.createPane('matchPane');
  matchPane.style.zIndex = 660; // поверх цели
  if (window.FluxLaneMapTiles) {
    window.FluxLaneMapTiles.addFluxLaneBaseLayer(map);
    window.FluxLaneMapTiles.ensureMapSize(map, mapEl);
  } else {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: false }).addTo(map);
  }

  window.addEventListener('resize', () => map.invalidateSize());

  const detectorsLayer = L.layerGroup().addTo(map);
  const tracksLayer = L.layerGroup().addTo(map);

  async function loadDetectors() {
    const res = await fetch('/api/traffic/detectors');
    const data = await res.json();
    detectorsLayer.clearLayers();
    window.__detectorCoords = window.__detectorCoords || {};
    data.forEach((d) => {
      if (!Number.isFinite(d.latitude) || !Number.isFinite(d.longitude)) return;
      window.__detectorCoords[d.id] = [d.latitude, d.longitude];
      const m = L.circleMarker([d.latitude, d.longitude], {
        radius: 6,
        color: '#7dd3fc',
        weight: 2,
        fillColor: '#2563eb',
        fillOpacity: 0.92
      });
      m.bindPopup(`<b>${d.name}</b><br>${d.latitude.toFixed(6)}, ${d.longitude.toFixed(6)}`);
      detectorsLayer.addLayer(m);
    });
  }

  loadDetectors().catch(console.error);

  async function loadTracks(fromIso, toIso) {
    const statusEl = document.getElementById('tracksStatus');
    const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

    const fromDate = new Date(fromIso);
    const toDate = new Date(toIso);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      setStatus('Некорректный интервал времени');
      return alert('Некорректный интервал времени');
    }

    setStatus('Загрузка потоков…');
    const res = await fetch(`/api/traffic/edge-stats?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);
    const data = res.ok ? await res.json() : { edges: [] };
    tracksLayer.clearLayers();
    const edges = (data.edges || []).filter((e) => e.count > 0);
    let drawn = 0;

    for (const e of edges) {
      let path = null;
      if (e.geometry && e.geometry.type === 'LineString') {
        path = (e.geometry.coordinates || []).map(([lon, lat]) => [lat, lon]);
      } else {
        path = await buildSnappedPath([e.fromId, e.toId]);
      }
      if (!path || path.length < 2) {
        const a = window.__detectorCoords[e.fromId];
        const b = window.__detectorCoords[e.toId];
        if (a && b) path = [a, b];
      }
      if (!path || path.length < 2) continue;
      const weight = Math.min(10, 3 + Math.log10(Math.max(1, e.count)));
      const poly = L.polyline(path, { color: '#1f78b4', weight, opacity: 0.88 });
      const mins = e.avgDuration ? Math.round(e.avgDuration / 60) : '—';
      const speed = e.avgSpeed ? e.avgSpeed.toFixed(1) : '—';
      poly.bindPopup(`Участок D${e.fromId}→D${e.toId}<br>ТС: ${e.count}<br>Средн. скорость: ${speed} км/ч<br>Средн. время: ${mins} мин`);
      tracksLayer.addLayer(poly);
      drawn++;
    }

    if (!drawn) {
      setStatus('Нет данных за период — смените интервал (см. подсказку)');
      showUpdateNotification('За выбранный период нет проездов. Смените интервал (даты подставлены по данным в базе).', 'info');
      return;
    }

    setStatus(`Потоки: ${drawn} участков, ${edges.length} пар датчиков`);
    const b = L.latLngBounds([]);
    tracksLayer.eachLayer((l) => l.getLatLngs().forEach((pt) => b.extend(pt)));
    if (b.isValid()) map.fitBounds(b.pad(0.1));
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toLocalInputValue(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  async function initTracksTimeRange() {
    const fromEl = document.getElementById('tracksFrom');
    const toEl = document.getElementById('tracksTo');
    const statusEl = document.getElementById('tracksStatus');
    if (!fromEl || !toEl) return;

    let min = null;
    let max = null;
    try {
      const r = await fetch('/api/traffic/tracks/time-range');
      const j = r.ok ? await r.json() : null;
      if (j?.min) min = new Date(j.min);
      if (j?.max) max = new Date(j.max);
      if (statusEl && j?.count != null) {
        statusEl.textContent = j.count
          ? `В базе ${j.count} треков · интервал подставлен автоматически`
          : 'Треков в базе нет — импортируйте проезды в админке';
      }
    } catch (_) {}

    if (!min || !max || Number.isNaN(min.getTime())) {
      min = new Date('2025-10-01T00:00:00');
      max = new Date('2025-10-31T23:59:00');
      if (statusEl) statusEl.textContent = 'Интервал по умолчанию: октябрь 2025 (есть треки в базе)';
    }

    if (!fromEl.value) fromEl.value = toLocalInputValue(min);
    if (!toEl.value) {
      const end = new Date(max);
      end.setHours(23, 59, 0, 0);
      toEl.value = toLocalInputValue(end);
    }
  }

  // подготовим карту детекторId -> координаты для быстрой отрисовки
  window.__detectorCoords = window.__detectorCoords || {};

  // Локальный граф дорог (без внешних API): assets/data/roads.json
  let roadGraph = null;
  // сначала пробуем динамический API, затем статический файл как фолбэк
  fetch('/api/traffic/roads').then(r => r.ok ? r.json() : []).then(async d => {
    if (!Array.isArray(d) || d.length === 0) {
      const r2 = await fetch('/assets/data/roads.json').catch(()=>null);
      d = r2 && r2.ok ? await r2.json() : [];
    }
    if (Array.isArray(d)) roadGraph = d; else roadGraph = [];
    console.log('roads loaded:', Array.isArray(roadGraph) ? roadGraph.length : 0);
  }).catch(() => { roadGraph = []; });

  // Кеш маршрутов между детекторами (чтобы не дергать API на каждый трек)
  window.__edgeCache = new Map();
  async function getSnappedSegment(fromId, toId) {
    const key = `${fromId}-${toId}`;
    if (window.__edgeCache.has(key)) return window.__edgeCache.get(key);
    const a = window.__detectorCoords[fromId];
    const b = window.__detectorCoords[toId];
    if (!a || !b) return null;
    // 1) Пытаемся взять из локального roadGraph
    if (Array.isArray(roadGraph)) {
      const edge = roadGraph.find(e => e && e.fromId === fromId && e.toId === toId && Array.isArray(e.coords));
      if (edge && edge.coords.length >= 2) {
        const latlngs = edge.coords.map(([lat, lon]) => [lat, lon]);
        window.__edgeCache.set(key, latlngs);
        return latlngs;
      }
    }
    // читаем только кэш из бекенда (строго по дорогам)
    try {
      if (!window.__edgesLoaded) {
        window.__edgesLoaded = fetch('/api/traffic/edges').then(r => r.json());
      }
      const edges = await window.__edgesLoaded;
      const found = edges.find(e => e.fromDetectorId === fromId && e.toDetectorId === toId && e.geometry && e.geometry.type === 'LineString');
      if (found) {
        const latlngs = (found.geometry.coordinates||[]).map(([lon,lat]) => [lat,lon]);
        if (latlngs.length >= 2) {
          window.__edgeCache.set(key, latlngs);
          return latlngs;
        }
      }
    } catch {}
    return null;
  }

  async function buildSnappedPath(detectorIds) {
    const full = [];
    for (let i = 0; i < detectorIds.length - 1; i++) {
      const seg = await getSnappedSegment(detectorIds[i], detectorIds[i+1]);
      if (!seg || seg.length < 2) continue;
      if (full.length) seg.shift(); // стыкуем без дублирования точки
      full.push(...seg);
    }
    return full;
  }

  on('loadTracksBtn', 'click', () => {
    const fromEl = document.getElementById('tracksFrom');
    const toEl = document.getElementById('tracksTo');
    if (!fromEl || !toEl || !fromEl.value || !toEl.value) return alert('Выберите интервал времени');
    const from = new Date(fromEl.value).toISOString();
    const to = new Date(toEl.value).toISOString();
    window.__edgesLoaded = fetch('/api/traffic/edges').then(r => r.json());
    loadVehicleList(from, to);
    loadTracks(from, to).catch(console.error);
  });

  // подгрузка списка авто + кастомный выпадающий список
  let vehicleListCache = [];
  async function loadVehicleList(fromIso, toIso){
    try {
      const url = fromIso && toIso 
        ? `/api/traffic/vehicles?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`
        : '/api/traffic/vehicles';
      const res = await fetch(url);
      vehicleListCache = await res.json();
      console.log('Загружено автомобилей:', vehicleListCache.length);
      renderSuggest('');
    } catch (error) {
      console.error('Ошибка загрузки списка автомобилей:', error);
    }
  }

  function renderSuggest(query){
    const box = document.getElementById('vehicleSuggest');
    if (!box) return;
    const q = String(query||'').toLowerCase();
    if (!q) { box.style.display='none'; box.innerHTML=''; return; }
    const list = (vehicleListCache||[]).filter(v => String(v).toLowerCase().includes(q)).slice(0,100);
    box.innerHTML = list.map(v => `<div data-id="${v}">${v}</div>`).join('');
    box.style.display = list.length ? 'block' : 'none';
  }

  const cmInput = document.getElementById('cmVehicle');
  if (cmInput){
    cmInput.addEventListener('input', (e) => renderSuggest(e.target.value));
    const sug = document.getElementById('vehicleSuggest');
    if (sug) sug.addEventListener('click', (e) => {
      const id = e.target && e.target.getAttribute('data-id');
      if (!id) return;
      cmInput.value = id;
      sug.style.display = 'none';
    });
    document.addEventListener('click', (e) => {
      const wrap = document.querySelector('.select-wrap');
      if (wrap && !wrap.contains(e.target)) {
        const b = document.getElementById('vehicleSuggest');
        if (b) b.style.display = 'none';
      }
    });
  }

  // авто-загрузка списка при изменении дат
  ['tracksFrom','tracksTo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => {
      const f = document.getElementById('tracksFrom').value;
      const t = document.getElementById('tracksTo').value;
      loadVehicleList(f ? new Date(f).toISOString() : null, t ? new Date(t).toISOString() : null);
    });
  });

  // первичная загрузка списка при открытии
  (function initVehicleList(){
    // Загружаем детекторы и координаты
    loadDetectors().then(() => {
      // После загрузки детекторов загружаем список автомобилей
      loadVehicleList();
    }).catch(console.error);
  })();

  on('clearBtn', 'click', () => {
    tracksLayer.clearLayers();
    coLayer.clearLayers();
    clustersLayer.clearLayers();
    problemsLayer.clearLayers();
    comparisonLayer.clearLayers();
    if (pathLayer) clearRoute();
    const sp = document.getElementById('sidePanel');
    if (sp) sp.style.display = 'none';
  });

  // Обработчики модального окна сравнения
  on('comparisonBtn', 'click', () => {
    const modal = document.getElementById('comparisonModal');
    if (modal) modal.hidden = false;
  });

  on('compCancelBtn', 'click', () => {
    const modal = document.getElementById('comparisonModal');
    if (modal) modal.hidden = true;
  });

  on('compStartBtn', 'click', async () => {
    const from1 = document.getElementById('compFrom1')?.value;
    const to1 = document.getElementById('compTo1')?.value;
    const from2 = document.getElementById('compFrom2')?.value;
    const to2 = document.getElementById('compTo2')?.value;
    const topN = Number(document.getElementById('compTopN')?.value || 10);

    if (!from1 || !to1 || !from2 || !to2) {
      alert('Заполните все поля интервалов');
      return;
    }

    const modal = document.getElementById('comparisonModal');
    if (modal) modal.hidden = true;

    await performComparison(from1, to1, from2, to2, topN);
  });

  // Co-movement search and draw
  const coLayer = L.layerGroup().addTo(map);
  const clustersLayer = L.layerGroup().addTo(map);
  const problemsLayer = L.layerGroup().addTo(map);
  const comparisonLayer = L.layerGroup().addTo(map);
  
  // Хранение данных для фильтрации
  let lastCoResult = null;
  let lastCoTargetSeqIds = [];
  let segmentData = new Map(); // храним данные о каждом сегменте для фильтрации
  let allMatchLayers = []; // храним все слои совпадений для фильтрации

  // Функция умного анализа совпадений
  async function applyFilters() {
    if (!lastCoResult || !lastCoTargetSeqIds.length) return;
    
    const minMinutes = Number(document.getElementById('fltMinMin')?.value || 0);
    const minK = Number(document.getElementById('fltMinK')?.value || 1);
    const minPercent = Number(document.getElementById('fltMinPercent')?.value || 0);
    const maxTimeDiff = Number(document.getElementById('fltMaxTimeDiff')?.value || 60);
    
    console.log(`Анализируем совпадения: мин.длительность=${minMinutes}, мин.K=${minK}, мин.%=${minPercent}, макс.разброс=${maxTimeDiff}с`);
    console.log(`Всего слоёв для анализа: ${allMatchLayers.length}`);
    
    // Анализируем качество совпадений
    let significantMatches = 0;
    let randomMatches = 0;
    
    allMatchLayers.forEach(layer => {
      const layerId = layer._leaflet_id;
      const data = segmentData.get(layerId);
      if (data) {
        // Вычисляем процент совпадения от общего трека
        const targetLength = lastCoTargetSeqIds.length;
        const matchPercent = Math.round((data.k / targetLength) * 100);
        
        // Анализируем качество совпадения
        const isSignificant = 
          data.k >= minK && 
          data.minutes >= minMinutes && 
          matchPercent >= minPercent;
        
        console.log(`Слой ${layerId}: K=${data.k}, мин=${data.minutes}, %=${matchPercent}%, ТС=${data.vehicleId} - ${isSignificant ? 'ЗНАЧИМОЕ' : 'СЛУЧАЙНОЕ'}`);
        
        if (isSignificant) {
          significantMatches++;
          // Показываем значимое совпадение
          if (!coLayer.hasLayer(layer)) {
            coLayer.addLayer(layer);
            console.log(`Показываем значимое совпадение ${layerId}`);
          }
        } else {
          randomMatches++;
          // Скрываем случайное совпадение
          if (coLayer.hasLayer(layer)) {
            coLayer.removeLayer(layer);
            console.log(`Скрываем случайное совпадение ${layerId}`);
          }
        }
      }
    });
    
    console.log(`Анализ завершён: ${significantMatches} значимых, ${randomMatches} случайных совпадений`);
    
    // Фильтруем список в панели
    const listEl = document.querySelector('.cm-list');
    if (listEl) {
      const items = listEl.querySelectorAll('.cm-item');
      let shownCount = 0;
      items.forEach(item => {
        const kText = item.querySelector('.cm-meta');
        const durText = item.textContent;
        const kMatch = kText ? kText.textContent.match(/K=(\d+)/) : null;
        const minMatch = durText.match(/(\d+) мин/);
        
        if (kMatch && minMatch) {
          const k = Number(kMatch[1]);
          const mins = Number(minMatch[1]);
          if (k >= minK && mins >= minMinutes) {
            item.style.display = 'block';
            shownCount++;
          } else {
            item.style.display = 'none';
          }
        }
      });
      
      // Обновляем счётчик с результатами анализа
      const countText = document.querySelector('.cm-meta');
      if (countText && countText.textContent.includes('Совместных отрезков:')) {
        const totalMatches = significantMatches + randomMatches;
        countText.textContent = `Совместных отрезков: ${shownCount} (${significantMatches} значимых, ${randomMatches} случайных)${shownCount ? ' · нажмите строку, чтобы подсветить' : ''}`;
      }
    }
  }
  on('coMovementBtn', 'click', async () => {
    coLayer.clearLayers();
    segmentData.clear(); // очищаем данные о сегментах
    allMatchLayers = []; // очищаем массив слоёв
    const vid = document.getElementById('cmVehicle').value.trim();
    const fromEl = document.getElementById('tracksFrom');
    const toEl = document.getElementById('tracksTo');
    const minK = Number(document.getElementById('cmMinK').value || 3);
    const delta = Number(document.getElementById('cmDelta').value || 90);
    if (!vid) return alert('Введите vehicleId');
    let url = `/api/traffic/co-movement?vehicleId=${encodeURIComponent(vid)}&minK=${minK}&maxDeltaT=${delta}`;
    if (fromEl.value && toEl.value) {
      const from = new Date(fromEl.value).toISOString();
      const to = new Date(toEl.value).toISOString();
      url += `&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    if (!data || !data.target) { alert('Трек не найден'); return; }
    
    // Сохраняем данные для фильтрации
    lastCoResult = data;
    const targetSeqIds = (data.target.detectorSequence||[]).map(p => p.detectorId);
    lastCoTargetSeqIds = targetSeqIds;
    
    // draw target track bold
    const targetPath = await buildSnappedPath(targetSeqIds);
    if (targetPath && targetPath.length>=2) {
      L.polyline(targetPath, { pane:'targetPane', color: '#e31a1c', weight: 5, opacity: 0.95 }).addTo(coLayer);
    }
    // заполнить боковую панель + список сегментов
    const sp = document.getElementById('sidePanel');
    if (sp){
      const durMin = Math.round((data.target.durationSec||0)/60);
      const kmh = data.target.avgSpeed ? data.target.avgSpeed.toFixed(1) : '—';
      const items = [];
      (data.matches||[]).forEach(m => (m.segments||[]).forEach(seg => {
        const fromTs = new Date(seg.fromTs*1000);
        const toTs = new Date(seg.toTs*1000);
        const mins = Math.max(1, Math.round((toTs - fromTs)/60000));
        items.push({ vehicleId: m.vehicleId, fromTs, toTs, mins, K: seg.length, aFrom: seg.aIdx[0], aTo: seg.aIdx[1] });
      }));
      
      let htmlItems = '';
      if (items.length > 0) {
        htmlItems = items.map(it =>
          `<div class="cm-item" data-afrom="${it.aFrom}" data-ato="${it.aTo}">
            <div class="cm-row"><b>${it.vehicleId}</b><span class="cm-meta">K=${it.K}</span></div>
            <div class="cm-meta">${it.fromTs.toLocaleString()} — ${it.toTs.toLocaleString()}</div>
            <div class="cm-row"><span class="cm-meta">Длит.: ${it.mins} мин</span></div>
          </div>`
        ).join('');
      } else {
        htmlItems = '<div class="cm-meta">Совместных отрезков нет</div>';
      }
      
      sp.style.display = 'block';
      sp.innerHTML = `<h4>Трек ${data.target.vehicleId}</h4>
        <div class="cm-meta">Длит.: ${durMin} мин · Ср.скор.: ${kmh} км/ч</div>
        <div class="cm-meta">Совместных отрезков: ${items.length}${items.length? ' · нажмите строку, чтобы подсветить' : ''}</div>
        <button id="showFiltersBtn" style="margin-top:6px; width:100%; height:24px; background: linear-gradient(135deg, rgb(98,167,68) 0%, rgb(88,157,58) 100%); color:#fff; border:none; border-radius:4px; font-weight:600; font-size:10px; cursor:pointer; transition:transform 0.1s, box-shadow 0.2s; box-shadow: 0 1px 4px rgba(98,167,68,0.3);">Фильтры</button>
        <div id="filtersPanel" style="display:none; margin-top:6px; padding:8px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius:6px; border: 1px solid rgba(98,167,68,0.2); box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
          <div style="margin-bottom:6px; font-weight:600; color:#495057; font-size:10px; text-transform:uppercase; letter-spacing:0.2px;">Критерии анализа</div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; margin-bottom:8px;">
            <div>
              <label style="display:block; font-size:10px; color:#6c757d; margin-bottom:2px; font-weight:500; line-height:1.2;">Мин. длительность (мин)</label>
              <input type="number" id="fltMinMin" value="20" min="0" style="width:100%; height:24px; padding:2px 6px; border:1px solid #dee2e6; border-radius:4px; background:#fff; font-size:11px; transition:border-color 0.2s;">
            </div>
            <div>
              <label style="display:block; font-size:10px; color:#6c757d; margin-bottom:2px; font-weight:500; line-height:1.2;">Мин. K</label>
              <input type="number" id="fltMinK" value="5" min="1" style="width:100%; height:24px; padding:2px 6px; border:1px solid #dee2e6; border-radius:4px; background:#fff; font-size:11px; transition:border-color 0.2s;">
            </div>
            <div>
              <label style="display:block; font-size:10px; color:#6c757d; margin-bottom:2px; font-weight:500; line-height:1.2;">Мин. % совпадения</label>
              <input type="number" id="fltMinPercent" value="80" min="0" max="100" style="width:100%; height:24px; padding:2px 6px; border:1px solid #dee2e6; border-radius:4px; background:#fff; font-size:11px; transition:border-color 0.2s;">
            </div>
            <div>
              <label style="display:block; font-size:10px; color:#6c757d; margin-bottom:2px; font-weight:500; line-height:1.2;">Макс. разброс (сек)</label>
              <input type="number" id="fltMaxTimeDiff" value="15" min="1" style="width:100%; height:24px; padding:2px 6px; border:1px solid #dee2e6; border-radius:4px; background:#fff; font-size:11px; transition:border-color 0.2s;">
            </div>
          </div>
          <button id="applyFiltersBtn" style="width:100%; height:24px; background: linear-gradient(135deg, rgb(98,167,68) 0%, rgb(88,157,58) 100%); color:#fff; border:none; border-radius:4px; font-weight:600; font-size:10px; cursor:pointer; transition:transform 0.1s, box-shadow 0.2s; box-shadow: 0 1px 4px rgba(98,167,68,0.3);">Анализировать</button>
        </div>
        <div class="cm-list">${htmlItems}</div>`;

      // Обработчик кнопки "Фильтры"
      const showFiltersBtn = document.getElementById('showFiltersBtn');
      const filtersPanel = document.getElementById('filtersPanel');
      if (showFiltersBtn && filtersPanel) {
        showFiltersBtn.addEventListener('click', () => {
          const isVisible = filtersPanel.style.display !== 'none';
          filtersPanel.style.display = isVisible ? 'none' : 'block';
          showFiltersBtn.textContent = isVisible ? 'Фильтры' : 'Скрыть фильтры';
        });
      }

      // Обработчик кнопки "Применить"
      const applyFiltersBtn = document.getElementById('applyFiltersBtn');
      if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', () => {
          applyFilters();
        });
      }

      // Добавляем обработчики кликов только если есть элементы
      if (items.length > 0) {
        sp.querySelectorAll('.cm-item').forEach(el => {
          el.addEventListener('click', async () => {
            const aFrom = Number(el.getAttribute('data-afrom'));
            const aTo = Number(el.getAttribute('data-ato'));
            const ids = targetSeqIds.slice(aFrom, aTo+1);
            const path = await buildSnappedPath(ids);
            if (path && path.length>=2) {
              const poly = L.polyline(path, { color: '#ff7f00', weight: 6, opacity: 0.9 }).addTo(coLayer);
              map.fitBounds(poly.getBounds(), { padding: [30,30] });
              setTimeout(()=> coLayer.removeLayer(poly), 2500);
            }
          });
        });
      }
    }
    // draw matches segments
    (data.matches||[]).forEach(async m => {
      for (const seg of m.segments) {
        const ids = targetSeqIds.slice(seg.aIdx[0], seg.aIdx[1]+1);
        const path = await buildSnappedPath(ids);
        if (path && path.length>=2) {
          // «светящаяся» подложка (видно поверх красной линии цели)
          const glow = L.polyline(path, { pane:'matchPane', color: '#fff200', weight: 10, opacity: 0.25, lineCap:'round' }).addTo(coLayer);
          // основной штрих совпадения
          const poly = L.polyline(path, { pane:'matchPane', color: '#1f78b4', weight: 4, opacity: 0.95 }).addTo(coLayer);
          
          // Вычисляем длительность в минутах
          const fromTsMs = (seg.fromTs || 0) * 1000;
          const toTsMs = (seg.toTs || 0) * 1000;
          const durMin = Math.max(0, Math.round((toTsMs - fromTsMs) / 60000));
          
          poly.bindPopup(`${m.vehicleId}<br>K=${seg.length} · ${durMin} мин`);
          if (poly.bringToFront) poly.bringToFront();
          
          // Сохраняем данные о сегменте для фильтрации (для обоих слоёв)
          const segInfo = {
            k: seg.length,
            minutes: durMin,
            vehicleId: m.vehicleId
          };
          segmentData.set(poly._leaflet_id, segInfo);
          segmentData.set(glow._leaflet_id, segInfo);
          
          // Сохраняем слой для фильтрации
          allMatchLayers.push(poly);
          allMatchLayers.push(glow);
        }
      }
    });
  });


  // Top-N clusters
  on('clustersBtn', 'click', async () => {
    clustersLayer.clearLayers();
    const fromEl = document.getElementById('tracksFrom');
    const toEl = document.getElementById('tracksTo');
    const topN = Number(document.getElementById('topN').value || 10);
    if (!fromEl.value || !toEl.value) return alert('Выберите интервал');
    const from = new Date(fromEl.value).toISOString();
    const to = new Date(toEl.value).toISOString();
    const res = await fetch(`/api/traffic/clusters?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&topN=${topN}`);
    const data = await res.json();
    const routes = data.routes || [];
    
    if (routes.length === 0) {
      alert('Маршруты не найдены в указанном интервале');
      return;
    }
    
    // Нормализация для цвета (по edgeIntensityPerHour)
    const maxEdgeIntensity = routes.reduce((m,r)=>Math.max(m,r.edgeIntensityPerHour||0), 1);
    
    // Цветовая схема по интенсивности (от зелёного к красному)
    function getIntensityColor(intensity, maxIntensity) {
      if (maxIntensity === 0) return '#95a5a6'; // серый если нет данных
      
      const ratio = intensity / maxIntensity;
      
      if (ratio <= 0.15) return '#2E8B57'; // тёмно-зелёный - очень низкая
      if (ratio <= 0.35) return '#32CD32'; // зелёный - низкая
      if (ratio <= 0.55) return '#FFD700'; // жёлтый - средняя
      if (ratio <= 0.75) return '#FF8C00'; // оранжевый - высокая
      if (ratio <= 0.9) return '#FF6347'; // красно-оранжевый - очень высокая
      return '#DC143C'; // тёмно-красный - максимальная
    }
    
    console.log(`Найдено ${routes.length} топ-маршрутов:`);
    const polyRefs = [];
    
    for (let i = 0; i < routes.length; i++) {
      const r = routes[i];
      const path = await buildSnappedPath(r.detectorIds || []);
      if (!path || path.length<2) continue;
      
      // Фиксированная толщина для всех маршрутов, цвет по интенсивности рёбер
      const color = getIntensityColor(r.edgeIntensityPerHour || 0, maxEdgeIntensity);
      
      const poly = L.polyline(path, { 
        color: color, 
        weight: 4, // Фиксированная толщина
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      });
      
      const mins = Math.round((r.avgTravelTime||0)/60);
      const speed = r.avgSpeed ? r.avgSpeed.toFixed(1) : '—';
      const intensity = (r.intensityPerHour||0).toFixed(1);
      const edgeIntensity = (r.edgeIntensityPerHour||0).toFixed(1);
      
      // Детальная статистика в popup (делаем упор на рёбра)
      poly.bindPopup(`
        <div style="min-width:220px;">
          <h4 style="margin:0 0 8px 0; color:#333;">🏆 Топ-маршрут #${i+1}</h4>
          <div style="background:#f8f9fa; padding:8px; border-radius:4px; margin-bottom:8px;">
            <div style="font-size:16px; font-weight:bold; color:#dc3545;">
              🚗 ${r.edgeMinCount || 0} ТС
            </div>
            <div style="font-size:12px; color:#666;">
              По рёбрам (минимум на участке)
            </div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:13px;">
            <div><strong>Инт. по рёбрам:</strong> ${edgeIntensity}/ч</div>
            <div><strong>Σ по рёбрам:</strong> ${r.edgeSumCount || 0}</div>
            <div><strong>Скорость:</strong> ${speed} км/ч</div>
            <div><strong>Время:</strong> ${mins} мин</div>
          </div>
          <div style="margin-top:8px; font-size:12px; color:#666;">
            По маршруту: ТС=${r.count}, инт=${intensity}/ч
          </div>
          <div style="margin-top:8px; font-size:12px; color:#666;">
            Детекторы: ${r.detectorIds.length} шт.
          </div>
        </div>
      `);
      
      clustersLayer.addLayer(poly);
      polyRefs.push({ poly, route: r, color });
      
      console.log(`Маршрут ${i+1}: edgeΣ=${r.edgeSumCount||0}, edgeИнт=${edgeIntensity}/ч, ТС=${r.count}, инт=${intensity}/ч, скорость=${speed} км/ч`);
    }
    
    // Рисуем список топ-маршрутов (выплывающая панель)
    renderTopRoutesPanel(routes, polyRefs, maxEdgeIntensity);
    
    // Обновляем легенду
    updateClustersLegend(routes, maxEdgeIntensity);
  });
  
  // Создание/обновление панели с топ-маршрутами
  function renderTopRoutesPanel(routes, polyRefs, maxEdgeIntensity){
    let panel = document.getElementById('topRoutesPanel');
    if (!panel){
      panel = document.createElement('div');
      panel.id = 'topRoutesPanel';
      panel.style.cssText = 'position:fixed; right:16px; top:80px; width:320px; max-height:70vh; overflow:auto; background:#ffffff; border:1px solid #e5e7eb; box-shadow:0 8px 24px rgba(0,0,0,0.15); border-radius:10px; z-index:9999;';
      const header = document.createElement('div');
      header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid #f1f3f5; background:#f8fafc; position:sticky; top:0;';
      header.innerHTML = '<div style="font-weight:700; font-size:14px; color:#111827;">🏆 Топ-маршруты</div>';
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.setAttribute('aria-label','Закрыть');
      closeBtn.style.cssText = 'background:none; border:none; cursor:pointer; font-size:14px; color:#6b7280;';
      closeBtn.addEventListener('click', ()=> panel.remove());
      header.appendChild(closeBtn);
      panel.appendChild(header);
      const list = document.createElement('div');
      list.id = 'topRoutesList';
      list.style.cssText = 'padding:8px 12px; display:flex; flex-direction:column; gap:8px;';
      panel.appendChild(list);
      document.body.appendChild(panel);
    }
    const list = panel.querySelector('#topRoutesList');
    if (!list) return;
    list.innerHTML = '';

    // Вспомогательная функция получения цвета по интенсивности
    function colorByIntensity(v){
      if (maxEdgeIntensity === 0) return '#95a5a6';
      const ratio = v / maxEdgeIntensity;
      if (ratio <= 0.15) return '#2E8B57';
      if (ratio <= 0.35) return '#32CD32';
      if (ratio <= 0.55) return '#FFD700';
      if (ratio <= 0.75) return '#FF8C00';
      if (ratio <= 0.9) return '#FF6347';
      return '#DC143C';
    }

    routes.forEach((r, idx) => {
      const edgeIntensity = Number((r.edgeIntensityPerHour||0).toFixed(1));
      const color = colorByIntensity(edgeIntensity);
      const item = document.createElement('div');
      item.style.cssText = 'border:1px solid #eef2f7; border-radius:8px; padding:8px; display:flex; gap:8px; align-items:flex-start; transition:box-shadow .15s;';
      item.innerHTML = `
        <div style="width:10px; height:10px; border-radius:2px; margin-top:4px; background:${color};"></div>
        <div style="flex:1;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-weight:700; font-size:13px; color:#111827;">Маршрут #${idx+1}</div>
            <div style="font-size:11px; color:#6b7280;">детекторов: ${r.detectorIds.length}</div>
          </div>
          <div style="margin-top:4px; display:grid; grid-template-columns: 1fr 1fr; gap:6px; font-size:12px; color:#374151;">
            <div><strong>ТС (min по рёбрам):</strong> ${r.edgeMinCount||0}</div>
            <div><strong>Σ по рёбрам:</strong> ${r.edgeSumCount||0}</div>
            <div><strong>Инт. (рёбра):</strong> ${edgeIntensity}/ч</div>
            <div><strong>ТС (маршрут):</strong> ${r.count||0}</div>
          </div>
          <div style="margin-top:6px; display:flex; gap:6px;">
            <button data-action="zoom" style="padding:4px 8px; border:1px solid #e5e7eb; background:#fff; border-radius:6px; cursor:pointer; font-size:12px;">Показать</button>
            <button data-action="highlight" style="padding:4px 8px; border:1px solid #e5e7eb; background:#fff; border-radius:6px; cursor:pointer; font-size:12px;">Подсветить</button>
          </div>
        </div>
      `;

      // Наведение/подсветка соответствующей линии на карте
      const ref = polyRefs[idx];
      item.addEventListener('mouseenter', () => { if (ref?.poly){ ref.poly.setStyle({ weight: 6 }); ref.poly.bringToFront && ref.poly.bringToFront(); }});
      item.addEventListener('mouseleave', () => { if (ref?.poly){ ref.poly.setStyle({ weight: 4 }); }});
      item.querySelector('[data-action="highlight"]').addEventListener('click', () => { if (ref?.poly){ ref.poly.setStyle({ weight: 8 }); setTimeout(()=> ref.poly.setStyle({ weight: 4 }), 1500); }});
      item.querySelector('[data-action="zoom"]').addEventListener('click', async () => {
        // Построим геометрию заново по детекторам, чтобы fitBounds работал чётко
        const path = await buildSnappedPath(r.detectorIds || []);
        if (Array.isArray(path) && path.length >= 2){
          const polyTmp = L.polyline(path);
          map.fitBounds(polyTmp.getBounds(), { padding: [24,24] });
        }
      });

      list.appendChild(item);
    });
  }

  // Функция обновления легенды для кластеров
  function updateClustersLegend(routes, maxIntensity) {
    const legend = document.querySelector('.legend');
    if (!legend) return;
    
    // Удаляем старую легенду кластеров
    const oldClustersLegend = legend.querySelector('.clusters-legend');
    if (oldClustersLegend) oldClustersLegend.remove();
    
    if (routes.length === 0) return;
    
    const clustersDiv = document.createElement('div');
    clustersDiv.className = 'clusters-legend';
    clustersDiv.style.marginTop = '8px';
    clustersDiv.style.paddingTop = '8px';
    clustersDiv.style.borderTop = '1px solid rgba(0,0,0,0.1)';
    
    clustersDiv.innerHTML = `
      <div style="font-weight:600; font-size:12px; margin-bottom:6px; color:#333;">🏆 Топ-${routes.length} маршрутов</div>
      <div style="font-size:11px; color:#666; margin-bottom:6px;">Цвет = интенсивность (ТС/ч)</div>
      <div style="font-size:11px; color:#666; margin-bottom:6px;">Количество ТС → в popup при клике</div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:4px;">
        <div style="display:flex; align-items:center; gap:6px;">
          <div style="width:24px; height:4px; background:#2E8B57; border-radius:2px;"></div>
          <span style="font-size:11px; color:#374151;">Низкая</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <div style="width:24px; height:4px; background:#32CD32; border-radius:2px;"></div>
          <span style="font-size:11px; color:#374151;">Средняя</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <div style="width:24px; height:4px; background:#FFD700; border-radius:2px;"></div>
          <span style="font-size:11px; color:#374151;">Высокая</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <div style="width:24px; height:4px; background:#FF4500; border-radius:2px;"></div>
          <span style="font-size:11px; color:#374151;">Макс.</span>
        </div>
      </div>
    `;
    
    legend.appendChild(clustersDiv);
  }


  // Функция сравнения двух временных интервалов
  async function performComparison(from1, to1, from2, to2, topN) {
    comparisonLayer.clearLayers();
    
    console.log(`Сравнение интервалов: ${from1} - ${to1} vs ${from2} - ${to2}`);
    
    try {
      // Загружаем данные для обоих интервалов
      const [res1, res2] = await Promise.all([
        fetch(`/api/traffic/clusters?from=${encodeURIComponent(from1)}&to=${encodeURIComponent(to1)}&topN=${topN}`),
        fetch(`/api/traffic/clusters?from=${encodeURIComponent(from2)}&to=${encodeURIComponent(to2)}&topN=${topN}`)
      ]);
      
      const data1 = await res1.json();
      const data2 = await res2.json();
      
      const routes1 = data1.routes || [];
      const routes2 = data2.routes || [];
      
      console.log(`Интервал 1: ${routes1.length} маршрутов`);
      console.log(`Интервал 2: ${routes2.length} маршрутов`);
      
      // Создаём карту маршрутов по ключу (последовательность детекторов)
      const routesMap1 = new Map();
      const routesMap2 = new Map();
      
      routes1.forEach(r => {
        const key = r.detectorIds.join('-');
        routesMap1.set(key, r);
      });
      
      routes2.forEach(r => {
        const key = r.detectorIds.join('-');
        routesMap2.set(key, r);
      });
      
      // Анализируем изменения
      const allKeys = new Set([...routesMap1.keys(), ...routesMap2.keys()]);
      let newRoutes = 0, disappearedRoutes = 0, increasedRoutes = 0, decreasedRoutes = 0;
      
      for (const key of allKeys) {
        const route1 = routesMap1.get(key);
        const route2 = routesMap2.get(key);
        
        if (route1 && !route2) {
          // Маршрут исчез
          disappearedRoutes++;
          await drawComparisonRoute(route1, 'disappeared');
        } else if (!route1 && route2) {
          // Новый маршрут
          newRoutes++;
          await drawComparisonRoute(route2, 'new');
        } else if (route1 && route2) {
          // Маршрут есть в обоих интервалах
          const change = ((route2.intensityPerHour - route1.intensityPerHour) / route1.intensityPerHour) * 100;
          if (Math.abs(change) > 10) { // Изменение больше 10%
            if (change > 0) {
              increasedRoutes++;
              await drawComparisonRoute(route2, 'increased', change);
            } else {
              decreasedRoutes++;
              await drawComparisonRoute(route2, 'decreased', Math.abs(change));
            }
          } else {
            // Незначительное изменение
            await drawComparisonRoute(route2, 'stable');
          }
        }
      }
      
      // Обновляем легенду сравнения
      updateComparisonLegend(newRoutes, disappearedRoutes, increasedRoutes, decreasedRoutes, from1, to1, from2, to2);
      
      console.log(`Сравнение завершено: ${newRoutes} новых, ${disappearedRoutes} исчезнувших, ${increasedRoutes} увеличившихся, ${decreasedRoutes} уменьшившихся`);
      
    } catch (error) {
      console.error('Ошибка сравнения:', error);
      alert('Ошибка при сравнении интервалов');
    }
  }
  
  // Функция отрисовки маршрута для сравнения
  async function drawComparisonRoute(route, type, changePercent = 0) {
    const path = await buildSnappedPath(route.detectorIds || []);
    if (!path || path.length < 2) return;
    
    let color, weight, dashArray, opacity;
    
    switch (type) {
      case 'new':
        color = '#00FF00'; // ярко-зелёный
        weight = 4;
        dashArray = null;
        opacity = 0.9;
        break;
      case 'disappeared':
        color = '#FF0000'; // красный
        weight = 4;
        dashArray = '10,5';
        opacity = 0.7;
        break;
      case 'increased':
        color = '#FF8C00'; // оранжевый
        weight = 5;
        dashArray = null;
        opacity = 0.9;
        break;
      case 'decreased':
        color = '#4169E1'; // синий
        weight = 4;
        dashArray = '5,5';
        opacity = 0.8;
        break;
      case 'stable':
        color = '#808080'; // серый
        weight = 2;
        dashArray = '2,2';
        opacity = 0.5;
        break;
    }
    
    const poly = L.polyline(path, {
      color: color,
      weight: weight,
      opacity: opacity,
      dashArray: dashArray,
      lineCap: 'round',
      lineJoin: 'round'
    });
    
    const mins = Math.round((route.avgTravelTime || 0) / 60);
    const speed = route.avgSpeed ? route.avgSpeed.toFixed(1) : '—';
    const intensity = (route.intensityPerHour || 0).toFixed(1);
    
    let popupContent = `
      <div style="min-width:200px;">
        <h4 style="margin:0 0 8px 0; color:#333;">${getTypeLabel(type)}</h4>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:13px;">
          <div><strong>ТС:</strong> ${route.count}</div>
          <div><strong>Интенсивность:</strong> ${intensity}/ч</div>
          <div><strong>Скорость:</strong> ${speed} км/ч</div>
          <div><strong>Время:</strong> ${mins} мин</div>
        </div>
    `;
    
    if (changePercent > 0) {
      popupContent += `<div style="margin-top:8px; font-size:12px; color:#666;">Изменение: ${changePercent.toFixed(1)}%</div>`;
    }
    
    popupContent += `</div>`;
    
    poly.bindPopup(popupContent);
    comparisonLayer.addLayer(poly);
  }
  
  // Функция получения подписи для типа изменения
  function getTypeLabel(type) {
    switch (type) {
      case 'new': return '🆕 Новый маршрут';
      case 'disappeared': return '❌ Исчезнувший маршрут';
      case 'increased': return '📈 Увеличившийся поток';
      case 'decreased': return '📉 Уменьшившийся поток';
      case 'stable': return '➡️ Стабильный поток';
      default: return 'Маршрут';
    }
  }
  
  // Функция обновления легенды сравнения
  function updateComparisonLegend(newRoutes, disappearedRoutes, increasedRoutes, decreasedRoutes, from1, to1, from2, to2) {
    const legend = document.querySelector('.legend');
    if (!legend) return;
    
    // Удаляем старую легенду сравнения
    const oldComparisonLegend = legend.querySelector('.comparison-legend');
    if (oldComparisonLegend) oldComparisonLegend.remove();
    
    const comparisonDiv = document.createElement('div');
    comparisonDiv.className = 'comparison-legend';
    comparisonDiv.style.marginTop = '12px';
    comparisonDiv.style.paddingTop = '12px';
    comparisonDiv.style.borderTop = '2px solid rgba(98,167,68,0.3)';
    
    const time1 = new Date(from1).toLocaleTimeString() + ' - ' + new Date(to1).toLocaleTimeString();
    const time2 = new Date(from2).toLocaleTimeString() + ' - ' + new Date(to2).toLocaleTimeString();
    
    comparisonDiv.innerHTML = `
      <div style="font-weight:600; font-size:12px; margin-bottom:8px; color:#333;">Сравнение потоков:</div>
      <div style="font-size:11px; color:#666; margin-bottom:6px;">${time1} vs ${time2}</div>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px; font-size:11px;">
        <div style="display:flex; align-items:center; gap:4px;">
          <div style="width:12px; height:3px; background:#00FF00; border-radius:1px;"></div>
          <span>Новые (${newRoutes})</span>
        </div>
        <div style="display:flex; align-items:center; gap:4px;">
          <div style="width:12px; height:3px; background:#FF0000; border-radius:1px; border-style:dashed; border-width:1px;"></div>
          <span>Исчезли (${disappearedRoutes})</span>
        </div>
        <div style="display:flex; align-items:center; gap:4px;">
          <div style="width:12px; height:3px; background:#FF8C00; border-radius:1px;"></div>
          <span>Увеличились (${increasedRoutes})</span>
        </div>
        <div style="display:flex; align-items:center; gap:4px;">
          <div style="width:12px; height:3px; background:#4169E1; border-radius:1px; border-style:dashed; border-width:1px;"></div>
          <span>Уменьшились (${decreasedRoutes})</span>
        </div>
      </div>
    `;
    
    legend.appendChild(comparisonDiv);
  }

  // Problem zones (edge stats: show only the most problematic zones)
  on('problemsBtn', 'click', async () => {
    problemsLayer.clearLayers();
    const fromEl = document.getElementById('tracksFrom');
    const toEl = document.getElementById('tracksTo');
    if (!fromEl.value || !toEl.value) return alert('Выберите интервал');
    const from = new Date(fromEl.value).toISOString();
    const to = new Date(toEl.value).toISOString();
    const res = await fetch(`/api/traffic/edge-stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    const data = await res.json();
    const edges = data.edges || [];
    if (!edges.length) return;
    
    // Сортируем по количеству проходов и берем только топ-20% самых проблемных
    const sortedEdges = edges
      .filter(e => e.count > 0) // Исключаем пустые участки
      .sort((a, b) => b.count - a.count); // Сортируем по убыванию интенсивности
    
    // Берем только топ 20% самых проблемных участков
    const topProblematicCount = Math.max(1, Math.ceil(sortedEdges.length * 0.2));
    const problematicEdges = sortedEdges.slice(0, topProblematicCount);
    
    console.log(`Найдено ${edges.length} участков, показано ${problematicEdges.length} самых проблемных`);
    
    // Отображаем только самые проблемные зоны
    for (const e of problematicEdges) {
      let path = null;
      if (e.geometry && e.geometry.type==='LineString') {
        path = (e.geometry.coordinates||[]).map(([lon,lat])=>[lat,lon]);
      } else {
        path = await buildSnappedPath([e.fromId, e.toId]);
      }
      if (!path || path.length<2) continue;
      
      // Красный цвет для проблемных зон с фиксированной толщиной
      const poly = L.polyline(path, { 
        color: '#dc3545', // Красный цвет
        weight: 4,        // Фиксированная толщина
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      });
      
      const mins = e.avgDuration ? Math.round(e.avgDuration/60) : '—';
      const speed = e.avgSpeed ? e.avgSpeed.toFixed(1) : '—';
      const rank = sortedEdges.indexOf(e) + 1; // Ранг проблемности
      
      poly.bindPopup(`
        <strong>🚨 Проблемная зона #${rank}</strong><br>
        Интенсивность: ${e.count} ТС<br>
        Средн. скорость: ${speed} км/ч<br>
        Средн. время: ${mins} мин<br>
        <small>Топ-${topProblematicCount} самых проблемных участков</small>
      `);
      problemsLayer.addLayer(poly);
    }
    
    // Показываем уведомление о количестве найденных проблемных зон
    if (problematicEdges.length > 0) {
      showUpdateNotification(`Найдено ${problematicEdges.length} проблемных зон из ${edges.length} участков`, 'info');
    } else {
      showUpdateNotification('Проблемные зоны не найдены в указанном интервале', 'warning');
    }
  });

  // Shortest path functionality
  let pathLayer = null;
  let pathFromCoords = null;
  let pathToCoords = null;
  let clickStep = 0; // 0 = select from, 1 = select to
  let clickMarkers = [];
  let isSelectingPoints = false; // Режим выбора точек активен

  // Initialize shortest path functionality
  function initShortestPath() {
    pathLayer = L.layerGroup().addTo(map);
    
    // Map click handler
    map.on('click', handleMapClick);
    
    // Buttons
    on('shortestPathBtn', 'click', findShortestPath);
    on('clearRouteBtn', 'click', clearRoute);
    on('selectPointsBtn', 'click', startSelectingPoints);
    on('clearPointsBtn', 'click', clearPoints);
    
    // Initialize click status and buttons
    updateClickStatus();
    updateButtons();
  }

  // Handle map clicks
  function handleMapClick(e) {
    // Клики по карте обрабатываются только если активен режим выбора точек
    if (!isSelectingPoints) return;
    
    const coords = [e.latlng.lat, e.latlng.lng];
    
    if (clickStep === 0) {
      // Select from point (A)
      pathFromCoords = coords;
      addClickMarker(e.latlng, 'A', '#2ecc71');
      clickStep = 1;
      updateClickStatus();
      updateButtons();
    } else if (clickStep === 1) {
      // Select to point (B) - максимум 2 точки
      pathToCoords = coords;
      addClickMarker(e.latlng, 'B', '#e74c3c');
      clickStep = 0;
      // Автоматически отключаем режим выбора после выбора второй точки
      isSelectingPoints = false;
      updateClickStatus();
      updateButtons();
    }
    // Больше точек выбрать нельзя - максимум 2 (A и B)
  }

  // Add click marker
  function addClickMarker(latlng, letter, color) {
    const marker = L.marker(latlng, {
      icon: L.divIcon({
        className: 'custom-marker',
        html: `<div style="background: ${color}; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">${letter}</div>`,
        iconSize: [20, 20]
      })
    });
    
    marker.bindPopup(`<strong>Точка ${letter} ${letter === 'A' ? '(начало)' : '(конец)'} маршрута</strong><br>${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`);
    pathLayer.addLayer(marker);
    clickMarkers.push(marker);
  }

  // Start selecting points
  function startSelectingPoints() {
    // Если уже есть 2 точки, сначала очищаем их
    if (pathFromCoords && pathToCoords) {
      if (confirm('У вас уже выбраны 2 точки. Очистить их и выбрать новые?')) {
        clearPoints();
      } else {
        return; // Отменяем выбор новых точек
      }
    }
    
    isSelectingPoints = true;
    clickStep = 0;
    updateClickStatus();
    
    // Обновляем кнопки
    document.getElementById('selectPointsBtn').disabled = true;
    document.getElementById('selectPointsBtn').textContent = '📍 Выбираем...';
  }

  // Clear selected points
  function clearPoints() {
    // Очищаем координаты
    pathFromCoords = null;
    pathToCoords = null;
    clickStep = 0;
    isSelectingPoints = false;
    
    // Удаляем маркеры
    clickMarkers.forEach(marker => map.removeLayer(marker));
    clickMarkers = [];
    
    // Очищаем маршрут
    pathLayer.clearLayers();
    
    // Обновляем интерфейс
    updateClickStatus();
    updateButtons();
  }

  // Update click status
  function updateClickStatus() {
    const statusEl = document.getElementById('clickStatus');
    if (!statusEl) return;
    
    if (!isSelectingPoints) {
      if (pathFromCoords && pathToCoords) {
        statusEl.textContent = 'Точки A и B выбраны — «Найти маршрут»';
        statusEl.style.color = '#27ae60';
      } else {
        statusEl.textContent = 'Кнопка «Точки на карте», затем два клика';
        statusEl.style.color = '#6c757d';
      }
    } else if (clickStep === 0) {
      statusEl.textContent = 'Выберите точку A (начало маршрута)';
      statusEl.style.color = '#2ecc71';
    } else {
      statusEl.textContent = 'Выберите точку B (конец маршрута)';
      statusEl.style.color = '#e74c3c';
    }
  }

  // Update button states
  function updateButtons() {
    const selectBtn = document.getElementById('selectPointsBtn');
    const clearBtn = document.getElementById('clearPointsBtn');
    const findBtn = document.getElementById('shortestPathBtn');
    
    if (isSelectingPoints) {
      selectBtn.disabled = true;
      selectBtn.textContent = '📍 Выбираем...';
    } else {
      selectBtn.disabled = false;
      selectBtn.textContent = 'Точки на карте';
    }
    
    clearBtn.disabled = !pathFromCoords && !pathToCoords;
    findBtn.disabled = !pathFromCoords || !pathToCoords;
  }



  function formatCoordLabel(lat, lon) {
    return `${Number(lat).toFixed(5)}°, ${Number(lon).toFixed(5)}°`;
  }

  async function findNearestDetectorMeta(coords) {
    try {
      const response = await fetch('/api/traffic/detectors');
      const detectors = await response.json();
      let nearest = null;
      let minDistance = Infinity;
      detectors.forEach((detector) => {
        const distance = getDistance(coords[0], coords[1], detector.latitude, detector.longitude);
        if (distance < minDistance) {
          minDistance = distance;
          nearest = detector;
        }
      });
      return { id: nearest?.id || null, name: nearest?.name || null, km: minDistance };
    } catch (error) {
      console.error('Error finding nearest detector:', error);
      return { id: null, name: null, km: Infinity };
    }
  }

  function showRoutePanel(info) {
    const sidePanel = document.getElementById('sidePanel');
    if (!sidePanel) return;
    sidePanel.className = 'side-panel side-panel--route';
    sidePanel.style.display = 'block';

    const fromLat = info.fromLat;
    const fromLon = info.fromLon;
    const toLat = info.toLat;
    const toLon = info.toLon;

    let distanceKm = info.distanceKm;
    let durationMin = info.durationMin;
    let modeNote = info.modeNote || info.note || 'Маршрут по дорожной сети OpenStreetMap (OSRM)';

    if (info.mode === 'graph' && info.graph) {
      distanceKm = info.graph.totalDistance;
      durationMin = null;
      modeNote = 'Резервный маршрут по сети датчиков (OSM недоступен)';
    }

    const distStr = distanceKm != null ? `~${Number(distanceKm).toFixed(2)} км` : '—';
    const durStr = durationMin != null ? `~${Math.round(durationMin)} мин` : '—';

    let stepsHtml = '';
    if (info.mode === 'graph' && info.graph?.path?.length) {
      stepsHtml = `<div class="route-panel-steps"><strong>Узлы</strong><ol>${info.graph.path.map((p) => `<li>${p.name}</li>`).join('')}</ol></div>`;
    }

    sidePanel.innerHTML = `
      <h4 class="route-panel-title">Маршрут A → B</h4>
      <p class="route-panel-muted">${modeNote}</p>
      <div class="route-panel-row">
        <span class="route-pin route-pin--a">A</span>
        <div><strong>Откуда</strong><span>${info.fromLabel || formatCoordLabel(fromLat, fromLon)}</span></div>
      </div>
      <div class="route-panel-row">
        <span class="route-pin route-pin--b">B</span>
        <div><strong>Куда</strong><span>${info.toLabel || formatCoordLabel(toLat, toLon)}</span></div>
      </div>
      <div class="route-panel-stats">
        <div><span>Расстояние</span><strong>${distStr}</strong></div>
        <div><span>В пути</span><strong>${durStr}</strong></div>
      </div>
      ${stepsHtml}
      <button type="button" class="btn route-panel-clear" id="fx-clear-route-panel">Очистить маршрут</button>`;
    sidePanel.querySelector('#fx-clear-route-panel')?.addEventListener('click', clearRoute);
  }

  async function findShortestPath() {
    if (!pathFromCoords || !pathToCoords) {
      alert('Пожалуйста, выберите начальную и конечную точку на карте');
      return;
    }

    const [fromLat, fromLon] = pathFromCoords;
    const [toLat, toLon] = pathToCoords;
    const btn = document.getElementById('shortestPathBtn');
    const originalText = btn.textContent;

    try {
      pathLayer.clearLayers();
      btn.textContent = '⏳ Поиск...';
      btn.disabled = true;

      const nearFrom = await findNearestDetectorMeta(pathFromCoords);
      const nearTo = await findNearestDetectorMeta(pathToCoords);
      const fromLabel = `${formatCoordLabel(fromLat, fromLon)}${nearFrom.name ? `<br><small class="route-panel-muted">Ближ. датчик: ${nearFrom.name}</small>` : ''}`;
      const toLabel = `${formatCoordLabel(toLat, toLon)}${nearTo.name ? `<br><small class="route-panel-muted">Ближ. датчик: ${nearTo.name}</small>` : ''}`;

      const osrmRes = await fetch(
        `/api/traffic/route?fromLat=${fromLat}&fromLon=${fromLon}&toLat=${toLat}&toLon=${toLon}`
      );
      const osrm = await osrmRes.json();
      if (osrm.found) {
        visualizeOsrmRoute(osrm, pathFromCoords, pathToCoords);
        showRoutePanel({
          mode: 'osrm',
          fromLat,
          fromLon,
          toLat,
          toLon,
          fromLabel,
          toLabel,
          distanceKm: osrm.distanceKm,
          durationMin: osrm.durationMin,
          note: osrm.note
        });
        return;
      }

      const fromDetectorId = nearFrom.id;
      const toDetectorId = nearTo.id;
      if (!fromDetectorId || !toDetectorId) {
        alert(osrm.message || 'Маршрут не найден между выбранными точками');
        return;
      }

      const response = await fetch(
        `/api/traffic/shortest-path?fromDetectorId=${fromDetectorId}&toDetectorId=${toDetectorId}&weightType=distance`
      );
      const result = await response.json();
      if (!result.found) {
        alert(result.message || osrm.message || 'Маршрут не найден');
        return;
      }
      visualizeShortestPath(result);
      showRoutePanel({
        mode: 'graph',
        graph: result,
        fromLat,
        fromLon,
        toLat,
        toLon,
        fromLabel: result.path[0].name,
        toLabel: result.path[result.path.length - 1].name
      });
    } catch (error) {
      console.error('Error finding shortest path:', error);
      alert('Ошибка при поиске маршрута');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  // Find nearest detector to coordinates
  async function findNearestDetector(coords) {
    try {
      const response = await fetch('/api/traffic/detectors');
      const detectors = await response.json();
      
      let nearest = null;
      let minDistance = Infinity;
      
      detectors.forEach(detector => {
        const distance = getDistance(coords[0], coords[1], detector.latitude, detector.longitude);
        if (distance < minDistance) {
          minDistance = distance;
          nearest = detector.id;
        }
      });
      
      return nearest;
    } catch (error) {
      console.error('Error finding nearest detector:', error);
      return null;
    }
  }

  // Calculate distance between two points using Haversine formula
  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
             Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
             Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // Visualize OSRM route between map clicks
  function visualizeOsrmRoute(result, fromPair, toPair) {
    const coords = (result.geometry?.coordinates || []).map(([lon, lat]) => [lat, lon]);
    if (coords.length >= 2) {
      const dur = result.durationMin != null ? ` · ~${Math.round(result.durationMin)} мин` : '';
      const polyline = L.polyline(coords, {
        color: '#38bdf8',
        weight: 6,
        opacity: 0.92
      });
      polyline.bindPopup(
        `<strong>Маршрут по OSM</strong><br>${result.note || ''}<br>~${(result.distanceKm || 0).toFixed(2)} км${dur}`
      );
      pathLayer.addLayer(polyline);
    }
    if (fromPair && fromPair.length === 2) {
      const startMarker = L.marker([fromPair[0], fromPair[1]], {
        icon: L.divIcon({
          className: 'custom-marker',
          html: '<div style="background:#2ecc71;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;">A</div>',
          iconSize: [20, 20]
        })
      });
      pathLayer.addLayer(startMarker);
    }
    if (toPair && toPair.length === 2) {
      const endMarker = L.marker([toPair[0], toPair[1]], {
        icon: L.divIcon({
          className: 'custom-marker',
          html: '<div style="background:#e74c3c;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;">B</div>',
          iconSize: [20, 20]
        })
      });
      pathLayer.addLayer(endMarker);
    }
    if (pathLayer.getLayers().length) {
      map.fitBounds(L.featureGroup(pathLayer.getLayers()).getBounds().pad(0.12));
    }
  }

  // Clear route
  function clearRoute() {
    pathLayer.clearLayers();
    pathFromCoords = null;
    pathToCoords = null;
    clickMarkers = [];
    clickStep = 0;
    isSelectingPoints = false;
    
    // Hide side panel
    const sidePanel = document.getElementById('sidePanel');
    if (sidePanel) sidePanel.style.display = 'none';
    
    // Update click status and buttons
    updateClickStatus();
    updateButtons();
  }

  // Visualize shortest path on map
  function visualizeShortestPath(result) {
    // Draw path edges
    result.edges.forEach(edge => {
      if (edge.geometry && edge.geometry.coordinates) {
        const coords = edge.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
        const polyline = L.polyline(coords, {
          color: '#ff6b35',
          weight: 6,
          opacity: 0.9,
          dashArray: '10, 5'
        });
        
        polyline.bindPopup(`
          <strong>Оптимальный маршрут</strong><br>
          От: ${result.path[0].name}<br>
          До: ${result.path[result.path.length - 1].name}<br>
          Расстояние: ${result.totalDistance.toFixed(2)} км<br>
          Узлов: ${result.totalNodes}
        `);
        
        pathLayer.addLayer(polyline);
      }
    });
    
    // Add markers for start and end points
    const startMarker = L.marker([result.path[0].coordinates[1], result.path[0].coordinates[0]], {
      icon: L.divIcon({
        className: 'custom-marker',
        html: '<div style="background: #2ecc71; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">S</div>',
        iconSize: [20, 20]
      })
    });
    
    const endMarker = L.marker([result.path[result.path.length - 1].coordinates[1], result.path[result.path.length - 1].coordinates[0]], {
      icon: L.divIcon({
        className: 'custom-marker',
        html: '<div style="background: #e74c3c; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">E</div>',
        iconSize: [20, 20]
      })
    });
    
    startMarker.bindPopup(`<strong>Начало маршрута</strong><br>${result.path[0].name}`);
    endMarker.bindPopup(`<strong>Конец маршрута</strong><br>${result.path[result.path.length - 1].name}`);
    
    pathLayer.addLayer(startMarker);
    pathLayer.addLayer(endMarker);
    
    // Fit map to show the entire path
    if (result.edges.length > 0) {
      const group = new L.featureGroup(pathLayer.getLayers());
      map.fitBounds(group.getBounds().pad(0.1));
    }
  }

  // Initialize shortest path functionality
  initShortestPath();

  initTracksTimeRange()
    .then(() => {
      const fromEl = document.getElementById('tracksFrom');
      const toEl = document.getElementById('tracksTo');
      if (fromEl?.value && toEl?.value) {
        loadTracks(new Date(fromEl.value).toISOString(), new Date(toEl.value).toISOString()).catch(console.error);
      }
    })
    .catch(console.warn);
  
  // Initialize WebSocket for real-time updates
  initWebSocket();
  
  // WebSocket для real-time обновлений
  function initWebSocket() {
    try {
      const socket = io();
      
      socket.on('connect', () => {
        console.log('🔌 WebSocket подключен (traffic-analysis)');
      });
      
      socket.on('disconnect', () => {
        console.log('🔌 WebSocket отключен (traffic-analysis)');
      });
      
      socket.on('data_updated', (data) => {
        console.log('📊 Получено уведомление об обновлении данных:', data);
        handleDataUpdate(data);
      });
      
    } catch (error) {
      console.error('❌ Ошибка инициализации WebSocket:', error);
    }
  }

  // Обработка обновления данных в traffic-analysis
  function handleDataUpdate(data) {
    const { type, result, timestamp } = data;
    
    // Показываем уведомление
    showUpdateNotification(`Данные обновлены: ${type}`, 'success');
    
    // Если это детекторы или проходы, обновляем данные
    if (type === 'detectors' || type === 'passages') {
      // Перезагружаем детекторы
      loadDetectors().then(() => {
        console.log('✅ Детекторы обновлены');
        showUpdateNotification('Детекторы обновлены', 'success');
      }).catch(error => {
        console.error('❌ Ошибка обновления детекторов:', error);
        showUpdateNotification('Ошибка обновления детекторов', 'error');
      });
    }
  }
  
  // Показ уведомлений об обновлениях
  function showUpdateNotification(message, type = 'info') {
    // Создаем уведомление
    const notification = document.createElement('div');
    notification.className = `update-notification update-notification-${type}`;
    notification.innerHTML = `
      <div class="update-notification-content">
        <span class="update-notification-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
        <span class="update-notification-message">${message}</span>
      </div>
    `;
    
    // Добавляем стили если их нет
    if (!document.getElementById('update-notification-styles')) {
      const style = document.createElement('style');
      style.id = 'update-notification-styles';
      style.textContent = `
        .update-notification {
          position: fixed;
          top: 20px;
          left: 20px;
          z-index: 10000;
          padding: 12px 16px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          max-width: 300px;
          animation: slideInLeft 0.3s ease-out;
        }
        .update-notification-success {
          background: #d4edda;
          border: 1px solid #c3e6cb;
          color: #155724;
        }
        .update-notification-error {
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          color: #721c24;
        }
        .update-notification-info {
          background: #d1ecf1;
          border: 1px solid #bee5eb;
          color: #0c5460;
        }
        .update-notification-content {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .update-notification-icon {
          font-size: 16px;
        }
        .update-notification-message {
          font-size: 14px;
          font-weight: 500;
        }
        @keyframes slideInLeft {
          from {
            transform: translateX(-100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Добавляем уведомление на страницу
    document.body.appendChild(notification);
    
    // Удаляем через 5 секунд
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }
})();
