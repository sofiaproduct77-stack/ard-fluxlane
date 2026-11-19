(function () {
  const mapEl = document.getElementById('fx-overview-map');

  function setMetric(id, value, sub) {
    const valEl = document.querySelector(`[data-metric="${id}"]`);
    const subEl = document.querySelector(`[data-metric-sub="${id}"]`);
    if (valEl) valEl.textContent = value;
    if (subEl && sub != null) subEl.textContent = sub;
  }

  function computeLoadPercent(counts) {
    if (!counts.length) return 0;
    const vals = counts.map((c) => c[1]);
    const max = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (max <= 0) return 0;
    return Math.min(95, Math.round((avg / max) * 55 + (max > avg * 2 ? 25 : 10)));
  }

  async function loadMetrics() {
    try {
      const [detRes, tracksRes] = await Promise.all([
        fetch('/api/traffic/detectors'),
        fetch('/api/traffic/tracks?limit=5000')
      ]);
      const detectors = detRes.ok ? await detRes.json() : [];
      const tracksPayload = tracksRes.ok ? await tracksRes.json() : [];
      const tracks = Array.isArray(tracksPayload) ? tracksPayload : tracksPayload.tracks || [];
      const detN = Array.isArray(detectors) ? detectors.length : 0;

      setMetric('detectors', detN || '—', detN ? 'в сети мониторинга' : 'нет данных');

      let totalPassages = 0;
      let speedSum = 0;
      let speedN = 0;
      const counts = new Map();

      tracks.forEach((t) => {
        (t.detectorSequence || []).forEach((p) => {
          totalPassages += 1;
          if (p.detectorId) counts.set(p.detectorId, (counts.get(p.detectorId) || 0) + 1);
          if (p.speed != null && !Number.isNaN(Number(p.speed))) {
            speedSum += Number(p.speed);
            speedN += 1;
          }
        });
      });

      setMetric(
        'intensity',
        totalPassages > 0 ? totalPassages.toLocaleString('ru-RU') : '—',
        totalPassages > 0 ? 'фиксаций в выборке' : 'импортируйте проезды'
      );

      const avgSpeed = speedN ? Math.round(speedSum / speedN) : null;
      setMetric(
        'speed',
        avgSpeed != null ? `${avgSpeed} км/ч` : '—',
        speedN ? `${speedN.toLocaleString('ru-RU')} замеров` : 'нет замеров скорости'
      );

      const topCounts = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const loadPct = computeLoadPercent(topCounts);
      setMetric(
        'load',
        loadPct ? `${loadPct}%` : '—',
        loadPct > 70 ? 'высокая нагрузка' : loadPct > 40 ? 'умеренная' : 'низкая'
      );

      setMetric('tracks', tracks.length ? tracks.length.toLocaleString('ru-RU') : '0', 'треков для анализа');

      if (window.FluxLaneMonitoring && typeof window.FluxLaneMonitoring.getAlertCount === 'function') {
        const alerts = await window.FluxLaneMonitoring.getAlertCount();
        setMetric('alerts', String(alerts.total), `${alerts.crit} крит. · ${alerts.warn} предупр.`);
      } else {
        setMetric('alerts', '—', 'см. мониторинг');
      }

      if (mapEl && window.L) initMap(detectors, loadPct);
      renderHotspots(topCounts, detectors);
    } catch (e) {
      console.warn('[FluxLane] metrics', e);
    }
  }

  let map;

  function initMap(detectors, loadPct) {
    if (map) {
      map.remove();
      map = null;
    }
    const center =
      detectors.length > 0 ? [detectors[0].latitude, detectors[0].longitude] : [54.782635, 32.045134];

    map = L.map(mapEl, { zoomControl: true, attributionControl: false }).setView(center, 12);
    if (window.FluxLaneMapTiles && window.FluxLaneMapTiles.hideAttribution) {
      window.FluxLaneMapTiles.hideAttribution(map);
    }
    if (window.FluxLaneMapTiles) {
      window.FluxLaneMapTiles.addFluxLaneBaseLayer(map);
      window.FluxLaneMapTiles.ensureMapSize(map, mapEl);
    } else {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: false }).addTo(map);
    }
    mapEl.classList.add('fx-map-ready');

    detectors.forEach((d) => {
      const color = loadPct > 70 ? '#ef4444' : loadPct > 45 ? '#f59e0b' : '#38bdf8';
      L.circleMarker([d.latitude, d.longitude], {
        radius: 6,
        color: '#080b12',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.9
      })
        .bindPopup(`<strong>${d.name || 'Датчик ' + d.id}</strong>`)
        .addTo(map);
    });

    if (detectors.length > 1) {
      map.fitBounds(L.latLngBounds(detectors.map((d) => [d.latitude, d.longitude])).pad(0.12));
    }
  }

  function renderHotspots(top, detectors) {
    const list = document.getElementById('fx-hotspots');
    if (!list) return;
    const detMap = new Map(detectors.map((d) => [d.id, d.name || `D${d.id}`]));
    const slice = top.slice(0, 6);
    if (!slice.length) {
      list.innerHTML = '<li class="fx-empty">Нет данных о проездах</li>';
      return;
    }
    const max = slice[0][1];
    list.innerHTML = slice
      .map(([id, n]) => {
        const pct = Math.round((n / max) * 100);
        const name = detMap.get(Number(id)) || `#${id}`;
        return `<li><span class="fx-hotspot-name">${name}</span><div class="fx-bar"><span style="width:${pct}%"></span></div><strong>${n}</strong></li>`;
      })
      .join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadMetrics();
    document.addEventListener('fluxlane:monitoring-updated', loadMetrics);
  });
})();
