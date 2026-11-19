const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { Op } = require('sequelize');
const {
  Detector,
  Edge,
  VehiclePassage,
  VehicleTrack
} = require('../models');

const upload = multer({ storage: multer.memoryStorage() });

// GET detectors
router.get('/detectors', async (req, res) => {
  const rows = await Detector.findAll({ order: [['name', 'ASC']] });
  res.json(rows);
});

// GET edges
router.get('/edges', async (req, res) => {
  const rows = await Edge.findAll();
  res.json(rows);
});

// Export roads in lightweight format for frontend (no external API required)
router.get('/roads', async (req, res, next) => {
  try {
    const edges = await Edge.findAll({ attributes: ['fromDetectorId','toDetectorId','geometry'] });
    const roads = edges
      .filter(e => e.geometry && e.geometry.type === 'LineString' && Array.isArray(e.geometry.coordinates) && e.geometry.coordinates.length >= 2)
      .map(e => ({
        fromId: e.fromDetectorId,
        toId: e.toDetectorId,
        coords: e.geometry.coordinates.map(([lon,lat]) => [lat,lon])
      }));
    res.json(roads);
  } catch (e) { next(e); }
});
// Build and cache road geometries between consecutive detectors using OSRM
router.post('/edges/build', async (req, res, next) => {
  try {
    const force = String(req.query.force || '0') === '1';
    // gather unique consecutive detector pairs from tracks
    const tracks = await VehicleTrack.findAll({ attributes: ['detectorSequence'], limit: 5000 });
    const pairs = new Set();
    tracks.forEach(t => {
      const seq = Array.isArray(t.detectorSequence) ? t.detectorSequence.map(p => p.detectorId) : [];
      for (let i = 0; i < seq.length - 1; i++) {
        const a = seq[i]; const b = seq[i+1];
        if (!a || !b || a === b) continue;
        const key = `${a}-${b}`;
        const key2 = `${b}-${a}`;
        if (!pairs.has(key) && !pairs.has(key2)) pairs.add(key);
      }
    });

    let built = 0; let skipped = 0;
    for (const key of pairs) {
      const [fromId, toId] = key.split('-').map(n => Number(n));
      const from = await Detector.findByPk(fromId);
      const to = await Detector.findByPk(toId);
      if (!from || !to) { skipped++; continue; }
      let edge = await Edge.findOne({ where: { fromDetectorId: fromId, toDetectorId: toId } });
      const existingCoords = edge && edge.geometry ? edge.geometry.coordinates : undefined;
      if (!force && Array.isArray(existingCoords) && existingCoords.length >= 3) { skipped++; continue; }
      const GH_URL = process.env.GRAPHHOPPER_URL || null; // e.g. http://localhost:8989
      const url = GH_URL
        ? `${GH_URL.replace(/\/$/, '')}/route?point=${from.latitude},${from.longitude}&point=${to.latitude},${to.longitude}&profile=car&points_encoded=false`
        : `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`;
      try {
        const fetch = require('node-fetch');
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutHandle = setTimeout(() => { try { controller && controller.abort(); } catch(_){} }, 2000);
        const opts = controller ? { signal: controller.signal } : {};
        const r = await fetch(url, opts);
        clearTimeout(timeoutHandle);
        const j = await r.json();
        let coords = null;
        if (GH_URL) {
          coords = j && j.paths && j.paths[0] && j.paths[0].points && j.paths[0].points.coordinates ? j.paths[0].points.coordinates : null;
        } else {
          coords = j && j.routes && j.routes[0] && j.routes[0].geometry && j.routes[0].geometry.coordinates ? j.routes[0].geometry.coordinates : null;
        }
        if (!coords) { skipped++; continue; }
        // отбрасываем почти-прямые (плохой ответ) — требуем >= 3 вершин
        if (!Array.isArray(coords) || coords.length < 3) { skipped++; continue; }
        const geometry = { type: 'LineString', coordinates: coords };
        if (!edge) {
          edge = await Edge.create({ fromDetectorId: fromId, toDetectorId: toId, geometry });
        } else {
          edge.geometry = geometry;
          await edge.save();
        }
        // ensure reverse edge exists too (для отрисовки в обратном направлении)
        let rev = await Edge.findOne({ where: { fromDetectorId: toId, toDetectorId: fromId } });
        const reversedCoords = coords.slice().reverse();
        const revGeom = { type: 'LineString', coordinates: reversedCoords };
        if (!rev) {
          await Edge.create({ fromDetectorId: toId, toDetectorId: fromId, geometry: revGeom });
        } else if (force || !rev.geometry || !Array.isArray(rev.geometry.coordinates) || rev.geometry.coordinates.length < 3) {
          rev.geometry = revGeom;
          await rev.save();
        }
        built++;
      } catch (e) {
        skipped++;
      }
    }
    res.json({ built, skipped, totalPairs: pairs.size });
  } catch (e) { next(e); }
});

// Clusters: Top-N most frequent routes in window
router.get('/clusters', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const maxHops = Math.max(2, Math.min(Number(req.query.maxHops || 0), 100)); // 0 = полный маршрут
    const minHops = 2;
    const topN = Math.max(1, Math.min(Number(req.query.topN || 10), 50));
    if (!from || !to) return res.status(400).json({ error: 'from, to required' });
    // Включаем треки, которые ПЕРЕСЕКАЮТ интервал (а не строго внутри)
    const rows = await VehicleTrack.findAll({
      where: {
        [Op.and]: [
          { startTime: { [Op.lte]: new Date(to) } },
          { endTime: { [Op.gte]: new Date(from) } }
        ]
      },
      attributes: ['vehicleId', 'durationSec', 'avgSpeed', 'detectorSequence']
    });
    
    console.log(`📊 API clusters: найдено ${rows.length} треков в интервале ${from} - ${to}`);
    // 1) Построим карту рёбер (как в /edge-stats): key "a-b" -> {count}
    const edgeMap = new Map();
    for (const r of rows) {
      const seqFull = Array.isArray(r.detectorSequence) ? r.detectorSequence : [];
      for (let i = 0; i < seqFull.length - 1; i++) {
        const a = seqFull[i];
        const b = seqFull[i+1];
        if (!a || !b || !a.detectorId || !b.detectorId) continue;
        const key = `${a.detectorId}-${b.detectorId}`;
        if (!edgeMap.has(key)) edgeMap.set(key, { fromId: a.detectorId, toId: b.detectorId, count: 0 });
        const e = edgeMap.get(key);
        e.count += 1;
      }
    }

    // 2) Сжимаем треки до уникальных ПОЛНЫХ маршрутов (как есть, без окон)
    const routes = new Map();
    for (const r of rows) {
      const seq = Array.isArray(r.detectorSequence) ? r.detectorSequence.map(p => p.detectorId) : [];
      if (seq.length < minHops) continue;
      // remove duplicates in a row
      const compact = seq.filter((id, idx) => idx === 0 || id !== seq[idx-1]);
      if (compact.length < minHops) continue;
      const routeIds = (maxHops && maxHops > 0) ? compact.slice(0, Math.min(maxHops, compact.length)) : compact;
      const key = routeIds.join('-');
      if (!routes.has(key)) routes.set(key, { detectorIds: routeIds, items: [] });
      routes.get(key).items.push({ durationSec: r.durationSec, avgSpeed: r.avgSpeed, vehicleId: r.vehicleId });
    }
    // 3) Агрегируем статистики + считаем метрики по рёбрам для маршрута
    const hours = Math.max(1, (new Date(to) - new Date(from)) / 3600000);
    const agg = Array.from(routes.values()).map(rt => {
      // Уникальные ТС на этот сегмент маршрута (скользящее окно)
      const vehicleSet = new Set(rt.items.map(i => i.vehicleId).filter(Boolean));
      const count = vehicleSet.size;
      const intensityPerHour = count / hours;
      
      // Calculate average speed more accurately
      const validSpeeds = rt.items.filter(i => i.avgSpeed != null && i.avgSpeed > 0);
      const avgSpeed = validSpeeds.length > 0 
        ? validSpeeds.reduce((s, i) => s + i.avgSpeed, 0) / validSpeeds.length 
        : 0;
      
      // Calculate average travel time more accurately  
      const validDurations = rt.items.filter(i => i.durationSec != null && i.durationSec > 0);
      const avgTravelTime = validDurations.length > 0 
        ? validDurations.reduce((s, i) => s + i.durationSec, 0) / validDurations.length 
        : 0;

      // Edge-based metrics for the full route: суммарный поток по всем рёбрам маршрута
      let edgeSumCount = 0;
      let edgeMinCount = Number.POSITIVE_INFINITY;
      for (let i = 0; i < rt.detectorIds.length - 1; i++) {
        const a = rt.detectorIds[i];
        const b = rt.detectorIds[i+1];
        const key = `${a}-${b}`;
        const edge = edgeMap.get(key);
        const c = edge && edge.count ? edge.count : 0;
        edgeSumCount += c;
        edgeMinCount = Math.min(edgeMinCount, c);
      }
      if (!Number.isFinite(edgeMinCount)) edgeMinCount = 0;
      const edgeIntensityPerHour = Math.round((edgeSumCount / hours) * 10) / 10;

      // Возвращаем обе метрики: по уникальным ТС и по рёбрам
      return {
        detectorIds: rt.detectorIds,
        // Unique vehicles per route
        count: count,
        intensityPerHour: Math.round(intensityPerHour * 10) / 10,
        // Edge-based totals (как в обычных маршрутах)
        edgeSumCount: edgeSumCount,
        edgeMinCount: edgeMinCount,
        edgeIntensityPerHour: edgeIntensityPerHour,
        // Averages
        avgSpeed: Math.round(avgSpeed * 10) / 10,
        avgTravelTime: Math.round(avgTravelTime),
        totalTrips: count
      };
    }).sort((a,b)=> (b.edgeSumCount - a.edgeSumCount) || (b.count - a.count)).slice(0, topN);
    
    console.log(`📊 API clusters: сформировано ${agg.length} уникальных маршрутов, возвращаем топ-${topN}`);
    if (agg.length > 0) {
      console.log(`🏆 Топ-маршрут: ТС=${agg[0].count}, интенсивность=${agg[0].intensityPerHour}/ч, скорость=${agg[0].avgSpeed} км/ч`);
    }
    
    res.json({ from, to, topN: agg.length, routes: agg });
  } catch (e) { next(e); }
});

// Edge-level stats: intensity and avg speed per consecutive pair
router.get('/edge-stats', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from, to required' });
    const rows = await VehicleTrack.findAll({
      where: {
        startTime: { [Op.lte]: new Date(to) },
        endTime: { [Op.gte]: new Date(from) }
      },
      attributes: ['detectorSequence']
    });
    const edgeMap = new Map(); // key: a-b
    for (const r of rows) {
      const seq = Array.isArray(r.detectorSequence) ? r.detectorSequence : [];
      for (let i = 0; i < seq.length - 1; i++) {
        const a = seq[i];
        const b = seq[i+1];
        if (!a || !b || !a.detectorId || !b.detectorId) continue;
        const key = `${a.detectorId}-${b.detectorId}`;
        if (!edgeMap.has(key)) edgeMap.set(key, { fromId: a.detectorId, toId: b.detectorId, count: 0, speeds: [], durations: [] });
        const e = edgeMap.get(key);
        e.count += 1;
        if (a.speed != null && b.speed != null) e.speeds.push((Number(a.speed)+Number(b.speed))/2);
        const dt = (new Date(b.timestamp) - new Date(a.timestamp)) / 1000;
        if (dt > 0 && dt < 3600) e.durations.push(dt);
      }
    }
    const stats = [];
    for (const e of edgeMap.values()) {
      const avgSpeed = e.speeds.length ? e.speeds.reduce((s,v)=>s+v,0)/e.speeds.length : null;
      const avgDuration = e.durations.length ? e.durations.reduce((s,v)=>s+v,0)/e.durations.length : null;
      // attach geometry if exists
      const edgeRow = await Edge.findOne({ where: { fromDetectorId: e.fromId, toDetectorId: e.toId } });
      stats.push({ fromId: e.fromId, toId: e.toId, count: e.count, avgSpeed, avgDuration, geometry: (edgeRow && edgeRow.geometry) ? edgeRow.geometry : null });
    }
    res.json({ from, to, edges: stats });
  } catch (e) { next(e); }
});

// Clear all cached geometries
router.post('/edges/clear', async (req, res, next) => {
  try {
    await Edge.update({ geometry: null }, { where: {} });
    res.json({ cleared: true });
  } catch (e) { next(e); }
});

// Функция для построения рёбер из треков
async function buildEdgesFromTracks() {
  try {
    // Получаем все треки
    const tracks = await VehicleTrack.findAll({
      attributes: ['detectorSequence'],
      limit: 5000
    });
    
    // Собираем уникальные пары последовательных детекторов
    const pairs = new Set();
    tracks.forEach(t => {
      const seq = Array.isArray(t.detectorSequence) ? t.detectorSequence.map(p => p.detectorId) : [];
      for (let i = 0; i < seq.length - 1; i++) {
        pairs.add(`${seq[i]}-${seq[i + 1]}`);
      }
    });
    
    console.log(`📊 Найдено ${pairs.size} уникальных пар детекторов для построения рёбер`);
    
    // Получаем все детекторы для координат
    const detectors = await Detector.findAll({
      attributes: ['id', 'latitude', 'longitude']
    });
    
    const detectorMap = new Map();
    detectors.forEach(detector => {
      detectorMap.set(detector.id, detector);
    });
    
    let edgesCreated = 0;
    
    // Создаём рёбра для каждой пары
    for (const pair of pairs) {
      const [fromId, toId] = pair.split('-').map(Number);
      const fromDetector = detectorMap.get(fromId);
      const toDetector = detectorMap.get(toId);
      
      if (!fromDetector || !toDetector) continue;
      
      // Создаём простое рёбро (прямая линия между детекторами)
      const geometry = {
        type: 'LineString',
        coordinates: [
          [fromDetector.longitude, fromDetector.latitude],
          [toDetector.longitude, toDetector.latitude]
        ]
      };
      
      await Edge.upsert({
        fromDetectorId: fromId,
        toDetectorId: toId,
        geometry: geometry
      });
      
      edgesCreated++;
    }
    
    return edgesCreated;
  } catch (error) {
    console.error('❌ Ошибка при построении рёбер:', error);
    throw error;
  }
}

// Import detectors from Excel/CSV
router.post('/import-detectors', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File is required' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // Читаем как массивы, чтобы игнорировать вариации имен заголовков
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    const bulk = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const name = row[0] != null ? String(row[0]).trim() : '';
      let lat = row[1] != null ? String(row[1]).toString() : '';
      let lng = row[2] != null ? String(row[2]).toString() : '';
      lat = Number(String(lat).replace(',', '.'));
      lng = Number(String(lng).replace(',', '.'));
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      bulk.push({ name, latitude: lat, longitude: lng, externalId: null });
    }
    for (const d of bulk) { await Detector.upsert(d); }
    
    // Автоматически строим рёбра после импорта детекторов
    console.log('🔄 Автоматически строим рёбра дорог...');
    try {
      const edgesResult = await buildEdgesFromTracks();
      console.log(`✅ Построено ${edgesResult} рёбер дорог`);
    } catch (error) {
      console.error('❌ Ошибка при построении рёбер:', error);
    }
    
    // Отправляем уведомление через WebSocket
    const io = req.app.get('io');
    if (io) {
      io.emit('data_updated', {
        type: 'detectors',
        result: { inserted: bulk.length },
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ inserted: bulk.length });
  } catch (e) { next(e); }
});

// Функция для построения треков из проходов
async function buildTracksFromPassages(fromDt, toDt) {
  try {
    // get all passages in window
    const passages = await VehiclePassage.findAll({
      where: { timestamp: { [Op.between]: [fromDt, toDt] } },
      order: [['vehicleId', 'ASC'], ['timestamp', 'ASC']]
    });
    
    // group by vehicle
    const byVehicle = new Map();
    for (const p of passages) {
      if (!byVehicle.has(p.vehicleId)) byVehicle.set(p.vehicleId, []);
      byVehicle.get(p.vehicleId).push(p);
    }
    
    let created = 0;
    for (const [vehicleId, list] of byVehicle) {
      const seq = [];
      let lastDetectorId = null;
      let sumSpeed = 0; let speedCount = 0;
      
      for (const p of list) {
        if (p.detectorId !== lastDetectorId) {
          seq.push({ detectorId: p.detectorId, timestamp: p.timestamp, speed: p.speed });
          lastDetectorId = p.detectorId;
        }
        if (p.speed != null) { sumSpeed += p.speed; speedCount++; }
      }
      
      if (seq.length < 2) continue;
      
      const startTime = seq[0].timestamp;
      const endTime = seq[seq.length - 1].timestamp;
      const durationSec = Math.max(1, Math.round((endTime - startTime) / 1000));
      const avgSpeed = speedCount ? (sumSpeed / speedCount) : null;
      
      await VehicleTrack.create({ 
        vehicleId, 
        startTime, 
        endTime, 
        durationSec, 
        avgSpeed, 
        detectorSequence: seq 
      });
      created++;
    }
    
    return created;
  } catch (error) {
    console.error('❌ Ошибка при построении треков:', error);
    throw error;
  }
}

// Import passages (selection1/2)
router.post('/import-passages', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File is required' });
  const source = req.query.source || null;
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    // Try to detect header
    let startIdx = 0;
    if (rows.length && typeof rows[0][0] === 'string' && rows[0][0].toLowerCase().includes('detector')) {
      startIdx = 1;
    }
    const batch = [];
    function parseTs(ts) {
      if (ts == null) return null;
      if (ts instanceof Date) return ts;
      if (typeof ts === 'number') {
        // Excel serial date -> JS Date
        const ms = Math.round((ts - 25569) * 86400 * 1000);
        return new Date(ms);
      }
      const s = String(ts).trim().replace('T', ' ');
      // normalize dd.mm.yyyy hh:mm:ss -> yyyy-mm-dd hh:mm:ss
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
      if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
      const m2 = s.match(/^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (m2) return new Date(`${m2[3]}-${m2[2]}-${m2[1]}T${m2[4]}:${m2[5]}:${m2[6]||'00'}Z`);
      return new Date(s);
    }

    console.log(`📊 Обрабатываем ${rows.length - startIdx} строк данных проходов`);
    let processedCount = 0;
    let skippedCount = 0;
    
    for (let i = startIdx; i < rows.length; i++) {
      const [detectorName, ts, vehicleId, speed] = rows[i];
      
      if (!detectorName || !ts || !vehicleId) {
        skippedCount++;
        continue;
      }
      
      const detector = await Detector.findOne({ where: { name: String(detectorName).trim() } });
      if (!detector) {
        console.log(`⚠️ Детектор не найден: ${detectorName}`);
        skippedCount++;
        continue;
      }
      
      const date = parseTs(ts);
      if (!(date instanceof Date) || isNaN(date)) {
        console.log(`⚠️ Неверная дата: ${ts}`);
        skippedCount++;
        continue;
      }
      
      batch.push({
        detectorId: detector.id,
        vehicleId: String(vehicleId).trim(),
        timestamp: date,
        speed: speed != null ? Number(String(speed).replace(',', '.')) : null,
        source
      });
      
      processedCount++;
      
      if (batch.length >= 1000) {
        await VehiclePassage.bulkCreate(batch);
        console.log(`✅ Сохранено ${batch.length} записей проходов`);
        batch.length = 0;
      }
    }
    
    console.log(`📊 Статистика обработки: обработано ${processedCount}, пропущено ${skippedCount}`);
    
    if (batch.length) {
      await VehiclePassage.bulkCreate(batch);
      console.log(`✅ Сохранено ${batch.length} записей проходов (финальный батч)`);
    }
    
    // Проверяем общее количество записей в базе
    const totalPassages = await VehiclePassage.count();
    const totalTracks = await VehicleTrack.count();
    console.log(`📊 Всего записей проходов в базе: ${totalPassages}`);
    console.log(`📊 Всего треков в базе: ${totalTracks}`);
    
    // Автоматически строим треки после импорта проходов
    if (totalPassages > 0) {
      console.log('🔄 Автоматически строим треки из проходов...');
      try {
        // Получаем диапазон дат из проходов
        const firstPassage = await VehiclePassage.findOne({ 
          order: [['timestamp', 'ASC']],
          attributes: ['timestamp']
        });
        const lastPassage = await VehiclePassage.findOne({ 
          order: [['timestamp', 'DESC']],
          attributes: ['timestamp']
        });
        
        if (firstPassage && lastPassage) {
          console.log(`📅 Строим треки с ${firstPassage.timestamp} по ${lastPassage.timestamp}`);
          
          // Строим треки
          const tracks = await buildTracksFromPassages(firstPassage.timestamp, lastPassage.timestamp);
          console.log(`✅ Построено ${tracks} треков`);
          
          // Строим рёбра после построения треков
          console.log('🔄 Строим рёбра дорог из треков...');
          const edges = await buildEdgesFromTracks();
          console.log(`✅ Построено ${edges} рёбер дорог`);
        }
      } catch (error) {
        console.error('❌ Ошибка при построении треков:', error);
      }
    }
    
    // Отправляем уведомление через WebSocket
    const io = req.app.get('io');
    if (io) {
      io.emit('data_updated', {
        type: 'passages',
        result: { inserted: processedCount, total: totalPassages },
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ inserted: processedCount, total: totalPassages });
  } catch (e) { next(e); }
});

// Build tracks for interval
router.post('/build-tracks', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const fromDt = new Date(from);
    const toDt = new Date(to);
    if (Number.isNaN(fromDt) || Number.isNaN(toDt)) {
      return res.status(400).json({ error: 'Invalid from/to' });
    }
    // get all passages in window
    const passages = await VehiclePassage.findAll({
      where: { timestamp: { [Op.between]: [fromDt, toDt] } },
      order: [['vehicleId', 'ASC'], ['timestamp', 'ASC']]
    });
    // group by vehicle
    const byVehicle = new Map();
    for (const p of passages) {
      if (!byVehicle.has(p.vehicleId)) byVehicle.set(p.vehicleId, []);
      byVehicle.get(p.vehicleId).push(p);
    }
    let created = 0;
    for (const [vehicleId, list] of byVehicle) {
      const seq = [];
      let lastDetectorId = null;
      let sumSpeed = 0; let speedCount = 0;
      for (const p of list) {
        if (p.detectorId !== lastDetectorId) {
          seq.push({ detectorId: p.detectorId, timestamp: p.timestamp, speed: p.speed });
          lastDetectorId = p.detectorId;
        }
        if (p.speed != null) { sumSpeed += p.speed; speedCount++; }
      }
      if (seq.length < 2) continue;
      const startTime = seq[0].timestamp;
      const endTime = seq[seq.length - 1].timestamp;
      const durationSec = Math.max(1, Math.round((endTime - startTime) / 1000));
      const avgSpeed = speedCount ? (sumSpeed / speedCount) : null;
      await VehicleTrack.create({ vehicleId, startTime, endTime, durationSec, avgSpeed, detectorSequence: seq });
      created++;
    }
    res.json({ tracksCreated: created });
  } catch (e) { next(e); }
});

// Get tracks
router.get('/tracks', async (req, res, next) => {
  try {
    const { from, to, vehicleId } = req.query;
    const where = {};
    if (vehicleId) where.vehicleId = vehicleId;
    if (from && to) {
      where.startTime = { [Op.lte]: new Date(to) };
      where.endTime = { [Op.gte]: new Date(from) };
    }
    const rows = await VehicleTrack.findAll({ where, limit: 5000, order: [['startTime', 'ASC']] });
    res.json(rows);
  } catch (e) { next(e); }
});

// Диапазон дат треков в БД (для подсказки на карте)
router.get('/tracks/time-range', async (req, res, next) => {
  try {
    const min = await VehicleTrack.min('startTime');
    const max = await VehicleTrack.max('endTime');
    const count = await VehicleTrack.count();
    res.json({
      count,
      min: min ? new Date(min).toISOString() : null,
      max: max ? new Date(max).toISOString() : null
    });
  } catch (e) { next(e); }
});

// Joint movement analysis - find vehicles moving together
router.get('/joint-movement', async (req, res, next) => {
  try {
    const { from, to, targetVehicleId, timeWindow = 300 } = req.query; // timeWindow in seconds
    if (!from || !to) return res.status(400).json({ error: 'from, to required' });
    
    const timeWindowMs = parseInt(timeWindow) * 1000;
    const fromDt = new Date(from);
    const toDt = new Date(to);
    
    // Get all tracks in time window
    const allTracks = await VehicleTrack.findAll({
      where: { 
        startTime: { [Op.gte]: fromDt }, 
        endTime: { [Op.lte]: toDt } 
      },
      attributes: ['vehicleId', 'startTime', 'endTime', 'detectorSequence']
    });
    
    // Find target vehicle track
    const targetTrack = targetVehicleId 
      ? allTracks.find(t => t.vehicleId === targetVehicleId)
      : allTracks[0]; // Use first track if no target specified
    
    if (!targetTrack) {
      return res.json({ targetVehicleId, jointMovements: [], message: 'Target vehicle not found' });
    }
    
    const jointMovements = [];
    const targetSequence = Array.isArray(targetTrack.detectorSequence) 
      ? targetTrack.detectorSequence.map(p => p.detectorId) 
      : [];
    
    // Find other vehicles with similar paths
    for (const track of allTracks) {
      if (track.vehicleId === targetTrack.vehicleId) continue;
      
      const otherSequence = Array.isArray(track.detectorSequence) 
        ? track.detectorSequence.map(p => p.detectorId) 
        : [];
      
      // Find common detectors
      const commonDetectors = targetSequence.filter(id => otherSequence.includes(id));
      
      if (commonDetectors.length >= 2) {
        // Check time overlap
        const timeOverlap = Math.min(
          targetTrack.endTime.getTime(), 
          track.endTime.getTime()
        ) - Math.max(
          targetTrack.startTime.getTime(), 
          track.startTime.getTime()
        );
        
        if (timeOverlap > 0) {
          // Calculate joint movement duration
          const jointDuration = Math.min(timeOverlap, timeWindowMs);
          const jointDurationMinutes = Math.round(jointDuration / 60000);
          
          jointMovements.push({
            vehicleId: track.vehicleId,
            commonDetectors: commonDetectors,
            commonDetectorCount: commonDetectors.length,
            timeOverlap: timeOverlap,
            jointDurationMinutes: jointDurationMinutes,
            targetStartTime: targetTrack.startTime,
            targetEndTime: targetTrack.endTime,
            otherStartTime: track.startTime,
            otherEndTime: track.endTime
          });
        }
      }
    }
    
    // Sort by number of common detectors and duration
    jointMovements.sort((a, b) => {
      if (a.commonDetectorCount !== b.commonDetectorCount) {
        return b.commonDetectorCount - a.commonDetectorCount;
      }
      return b.jointDurationMinutes - a.jointDurationMinutes;
    });
    
    res.json({
      targetVehicleId: targetTrack.vehicleId,
      targetTrack: {
        vehicleId: targetTrack.vehicleId,
        startTime: targetTrack.startTime,
        endTime: targetTrack.endTime,
        detectorSequence: targetSequence
      },
      jointMovements: jointMovements.slice(0, 20), // Top 20 joint movements
      totalJointMovements: jointMovements.length
    });
    
  } catch (e) { 
    console.error('Error in joint movement analysis:', e);
    next(e); 
  }
});

// Unique vehicleIds (optionally filtered by window)
router.get('/vehicles', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const where = {};
    if (from && to) {
      const fromDt = new Date(from);
      const toDt = new Date(to);
      // включаем треки, которые хотя бы пересекают интервал
      where[Op.and] = [
        { startTime: { [Op.lte]: toDt } },
        { endTime: { [Op.gte]: fromDt } }
      ];
    }
    const rows = await VehicleTrack.findAll({ where, attributes: ['vehicleId'], limit: 20000 });
    const set = new Set(rows.map(r => r.vehicleId).filter(Boolean));
    res.json(Array.from(set).sort());
  } catch (e) { next(e); }
});

// Co-movement: find vehicles moving together with a target vehicle
router.get('/co-movement', async (req, res, next) => {
  try {
    const { vehicleId, from, to } = req.query;
    const minK = Number(req.query.minK || 3);
    const maxDeltaT = Number(req.query.maxDeltaT || 90); // seconds
    if (!vehicleId) return res.status(400).json({ error: 'vehicleId required' });
    let target = null;
    if (from && to) {
      const windowWhere = { startTime: { [Op.gte]: new Date(from) }, endTime: { [Op.lte]: new Date(to) } };
      target = await VehicleTrack.findOne({ where: { vehicleId, ...windowWhere }, order: [['startTime', 'ASC']] });
    } else {
      // без окна — берём самый поздний трек ТС
      target = await VehicleTrack.findOne({ where: { vehicleId }, order: [['startTime', 'DESC']] });
    }
    if (!target) return res.json({ target: null, matches: [] });

    const targetSeq = Array.isArray(target.detectorSequence) ? target.detectorSequence : [];
    const targetSimple = targetSeq.map(p => ({ id: p.detectorId, t: new Date(p.timestamp).getTime() / 1000 }));
    if (targetSimple.length === 0) return res.json({ target, matches: [] });

    let othersWhere = { vehicleId: { [Op.ne]: vehicleId } };
    if (from && to) {
      othersWhere = { ...othersWhere, startTime: { [Op.gte]: new Date(from) }, endTime: { [Op.lte]: new Date(to) } };
    } else {
      // берём треки, пересекающиеся по времени с целевым окном
      othersWhere = { ...othersWhere, [Op.and]: [
        { startTime: { [Op.lte]: target.endTime } },
        { endTime: { [Op.gte]: target.startTime } }
      ] };
    }
    const others = await VehicleTrack.findAll({ where: othersWhere, limit: 5000, order: [['startTime','ASC']] });

    console.log(`Target vehicle ${vehicleId}: ${targetSimple.length} detectors, window: ${target.startTime} - ${target.endTime}`);
    console.log(`Target sequence:`, targetSimple.map(p => `D${p.id}@${new Date(p.t*1000).toLocaleTimeString()}`));
    console.log(`Found ${others.length} other vehicles to compare`);

    function lcssWithTime(a, b) {
      // returns {k, segments:[{ai,bi,length,fromTs,toTs}]}
      const n = a.length, m = b.length;
      const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
      for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
          if (a[i-1].id === b[j-1].id && Math.abs(a[i-1].t - b[j-1].t) <= maxDeltaT) {
            dp[i][j] = dp[i-1][j-1] + 1;
          } else {
            dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
          }
        }
      }
      // recover segments greedily (simple)
      let i = n, j = m; const matched = [];
      while (i>0 && j>0) {
        if (a[i-1].id === b[j-1].id && Math.abs(a[i-1].t - b[j-1].t) <= maxDeltaT && dp[i][j] === dp[i-1][j-1] + 1) {
          matched.push({ ai: i-1, bi: j-1 }); i--; j--;
        } else if (dp[i-1][j] >= dp[i][j-1]) { i--; } else { j--; }
      }
      matched.reverse();
      // consolidate consecutive matches into segments
      const segments = [];
      let cur = null;
      matched.forEach(mh => {
        if (!cur) {
          cur = { startA: mh.ai, endA: mh.ai, startB: mh.bi, endB: mh.bi };
        } else if (mh.ai === cur.endA + 1 && mh.bi === cur.endB + 1) {
          cur.endA = mh.ai; cur.endB = mh.bi;
        } else {
          segments.push(cur); cur = { startA: mh.ai, endA: mh.ai, startB: mh.bi, endB: mh.bi };
        }
      });
      if (cur) segments.push(cur);
      const norm = segments
        .map(s => ({
          length: s.endA - s.startA + 1,
          fromTs: Math.max(a[s.startA].t, b[s.startB].t),
          toTs: Math.min(a[s.endA].t, b[s.endB].t),
          aIdx: [s.startA, s.endA], bIdx: [s.startB, s.endB]
        }))
        .filter(s => s.length >= minK && s.toTs >= s.fromTs);
      return { k: dp[n][m], segments: norm };
    }

    const matches = [];
    for (const o of others) {
      const seq = Array.isArray(o.detectorSequence) ? o.detectorSequence.map(p => ({ id: p.detectorId, t: new Date(p.timestamp).getTime()/1000 })) : [];
      if (seq.length === 0) continue;
      console.log(`Comparing with ${o.vehicleId}:`, seq.map(p => `D${p.id}@${new Date(p.t*1000).toLocaleTimeString()}`));
      const resM = lcssWithTime(targetSimple, seq);
      if (resM.segments.length) {
        console.log(`Found match with ${o.vehicleId}: ${resM.segments.length} segments, K=${resM.k}`);
        resM.segments.forEach((seg, i) => {
          const durMin = Math.round((seg.toTs - seg.fromTs) / 60);
          console.log(`  Segment ${i+1}: K=${seg.length}, duration=${durMin}min, from=${new Date(seg.fromTs*1000).toLocaleTimeString()}, to=${new Date(seg.toTs*1000).toLocaleTimeString()}`);
        });
        matches.push({ vehicleId: o.vehicleId, segments: resM.segments });
      } else {
        console.log(`No match with ${o.vehicleId}: K=${resM.k}, segments=${resM.segments.length}`);
      }
    }

    console.log(`Total matches found: ${matches.length}`);
    res.json({ target, matches });
  } catch (e) { next(e); }
});

// Shortest path between two detectors using Dijkstra algorithm
router.get('/shortest-path', async (req, res, next) => {
  try {
    const { fromDetectorId, toDetectorId, weightType = 'distance' } = req.query;
    
    if (!fromDetectorId || !toDetectorId) {
      return res.status(400).json({ error: 'fromDetectorId and toDetectorId are required' });
    }

    const fromId = Number(fromDetectorId);
    const toId = Number(toDetectorId);

    // Get all edges to build the graph
    const edges = await Edge.findAll({
      attributes: ['fromDetectorId', 'toDetectorId', 'geometry'],
      where: {
        geometry: { [Op.ne]: null }
      }
    });

    // Get all detectors for coordinates
    const detectors = await Detector.findAll({
      attributes: ['id', 'latitude', 'longitude', 'name']
    });

    // Build adjacency list
    const graph = new Map();
    const detectorMap = new Map();
    
    detectors.forEach(detector => {
      detectorMap.set(detector.id, detector);
      graph.set(detector.id, []);
    });

    // Add edges to graph with weights
    edges.forEach(edge => {
      if (edge.geometry && edge.geometry.coordinates && edge.geometry.coordinates.length >= 2) {
        const fromDetector = detectorMap.get(edge.fromDetectorId);
        const toDetector = detectorMap.get(edge.toDetectorId);
        
        if (fromDetector && toDetector) {
          let weight;
          
          if (weightType === 'distance') {
            // Calculate distance using Haversine formula
            const R = 6371; // Earth's radius in km
            const dLat = (toDetector.latitude - fromDetector.latitude) * Math.PI / 180;
            const dLon = (toDetector.longitude - fromDetector.longitude) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                     Math.cos(fromDetector.latitude * Math.PI / 180) * Math.cos(toDetector.latitude * Math.PI / 180) *
                     Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            weight = R * c; // Distance in km
          } else {
            // Default weight of 1 for unweighted graph
            weight = 1;
          }

          graph.get(edge.fromDetectorId).push({
            to: edge.toDetectorId,
            weight: weight,
            geometry: edge.geometry
          });
        }
      }
    });

    // Dijkstra's algorithm
    function dijkstra(start, end) {
      const distances = new Map();
      const previous = new Map();
      const visited = new Set();
      const queue = [];

      // Initialize distances
      detectors.forEach(detector => {
        distances.set(detector.id, Infinity);
        previous.set(detector.id, null);
      });
      
      distances.set(start, 0);
      queue.push({ id: start, distance: 0 });

      while (queue.length > 0) {
        // Sort queue by distance (simple implementation)
        queue.sort((a, b) => a.distance - b.distance);
        const current = queue.shift();
        
        if (visited.has(current.id)) continue;
        visited.add(current.id);

        if (current.id === end) break;

        const neighbors = graph.get(current.id) || [];
        for (const neighbor of neighbors) {
          if (visited.has(neighbor.to)) continue;
          
          const newDistance = distances.get(current.id) + neighbor.weight;
          
          if (newDistance < distances.get(neighbor.to)) {
            distances.set(neighbor.to, newDistance);
            previous.set(neighbor.to, current.id);
            queue.push({ id: neighbor.to, distance: newDistance });
          }
        }
      }

      // Reconstruct path
      const path = [];
      let current = end;
      
      while (current !== null) {
        path.unshift(current);
        current = previous.get(current);
      }

      return {
        path: path,
        distance: distances.get(end),
        found: distances.get(end) !== Infinity
      };
    }

    const result = dijkstra(fromId, toId);
    
    if (!result.found) {
      return res.json({ 
        found: false, 
        message: 'No path found between the specified detectors' 
      });
    }

    // Get path details with coordinates and geometry
    const pathDetails = result.path.map(detectorId => {
      const detector = detectorMap.get(detectorId);
      return {
        id: detectorId,
        name: detector.name,
        coordinates: [detector.longitude, detector.latitude]
      };
    });

    // Get edge geometries for the path
    const pathEdges = [];
    for (let i = 0; i < result.path.length - 1; i++) {
      const fromId = result.path[i];
      const toId = result.path[i + 1];
      
      const edge = edges.find(e => 
        e.fromDetectorId === fromId && e.toDetectorId === toId
      );
      
      if (edge && edge.geometry) {
        pathEdges.push({
          from: fromId,
          to: toId,
          geometry: edge.geometry
        });
      }
    }

    res.json({
      found: true,
      path: pathDetails,
      edges: pathEdges,
      totalDistance: result.distance,
      totalNodes: result.path.length,
      weightType: weightType
    });

  } catch (e) { 
    console.error('Shortest path error:', e);
    next(e); 
  }
});

// Построение маршрута по дорожной сети OSM (OSRM) между произвольными точками
router.get('/route', async (req, res, next) => {
  try {
    const fromLat = Number(req.query.fromLat);
    const fromLon = Number(req.query.fromLon);
    const toLat = Number(req.query.toLat);
    const toLon = Number(req.query.toLon);
    if (![fromLat, fromLon, toLat, toLon].every(Number.isFinite)) {
      return res.status(400).json({ error: 'fromLat, fromLon, toLat, toLon required' });
    }
    const GH_URL = process.env.GRAPHHOPPER_URL || null;
    const url = GH_URL
      ? `${GH_URL.replace(/\/$/, '')}/route?point=${fromLat},${fromLon}&point=${toLat},${toLon}&profile=car&points_encoded=false`
      : `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;
    const { default: fetch } = await import('node-fetch');
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutHandle = setTimeout(() => { try { controller && controller.abort(); } catch (_) {} }, 12000);
    const opts = controller ? { signal: controller.signal } : {};
    const r = await fetch(url, opts);
    clearTimeout(timeoutHandle);
    const j = await r.json();
    let coords = null;
    let distanceKm = null;
    let durationMin = null;
    if (GH_URL) {
      coords = j?.paths?.[0]?.points?.coordinates;
      distanceKm = j?.paths?.[0]?.distance ? j.paths[0].distance / 1000 : null;
      durationMin = j?.paths?.[0]?.time ? j.paths[0].time / 60000 : null;
    } else {
      coords = j?.routes?.[0]?.geometry?.coordinates;
      distanceKm = j?.routes?.[0]?.distance ? j.routes[0].distance / 1000 : null;
      durationMin = j?.routes?.[0]?.duration ? j.routes[0].duration / 60 : null;
    }
    if (!coords || coords.length < 2) {
      return res.json({ found: false, message: 'Маршрут по дорогам не найден для выбранных точек' });
    }
    res.json({
      found: true,
      geometry: { type: 'LineString', coordinates: coords },
      distanceKm,
      durationMin: durationMin != null ? Math.round(durationMin * 10) / 10 : null,
      provider: GH_URL ? 'graphhopper' : 'osrm',
      note: 'Маршрут построен по открытой дорожной сети OSM'
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;


