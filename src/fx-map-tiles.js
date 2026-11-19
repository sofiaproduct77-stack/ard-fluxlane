(function (global) {
  /** Границы агломерации Смоленска (скрывает дальние подписи за пределами города). */
  const SMOLENSK_BOUNDS = L && typeof L.latLngBounds === 'function'
    ? L.latLngBounds([54.735, 31.98], [54.82, 32.12])
    : null;
  const SMOLENSK_CENTER = [54.775, 32.045];
  const SMOLENSK_DEFAULT_ZOOM = 13;

  /** Убирает блок «Leaflet | © OpenStreetMap» (после создания карты). */
  function hideAttribution(map) {
    if (!map) return;
    try {
      if (map.attributionControl) {
        map.removeControl(map.attributionControl);
        delete map.attributionControl;
      }
    } catch (_) {}
  }

  /** Бесплатная подложка OSM (без API-ключа). */
  function addFluxLaneBaseLayer(map) {
    if (!map || typeof L === 'undefined') return null;
    hideAttribution(map);
    const layer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      minZoom: 11,
      updateWhenIdle: true,
      attribution: false
    });
    layer.addTo(map);
    return layer;
  }

  function applySmolenskView(map, options) {
    if (!map || typeof L === 'undefined') return;
    const opts = options || {};
    if (SMOLENSK_BOUNDS) {
      map.setMaxBounds(SMOLENSK_BOUNDS.pad(0.08));
      map.options.maxBoundsViscosity = 0.85;
    }
    if (opts.fit !== false && SMOLENSK_BOUNDS) {
      map.fitBounds(SMOLENSK_BOUNDS, { padding: [12, 12], maxZoom: opts.maxZoom || 14 });
    } else if (opts.center !== false) {
      map.setView(SMOLENSK_CENTER, opts.zoom || SMOLENSK_DEFAULT_ZOOM);
    }
  }

  function ensureMapSize(map, container) {
    if (!map) return;
    const run = () => {
      try {
        map.invalidateSize({ animate: false });
      } catch (_) {}
    };
    run();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run);
    }
    setTimeout(run, 250);
    if (container && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(run);
      ro.observe(container);
    }
  }

  global.FluxLaneMapTiles = {
    addFluxLaneBaseLayer,
    hideAttribution,
    ensureMapSize,
    applySmolenskView,
    SMOLENSK_BOUNDS,
    SMOLENSK_CENTER,
    SMOLENSK_DEFAULT_ZOOM
  };
})(typeof window !== 'undefined' ? window : globalThis);
