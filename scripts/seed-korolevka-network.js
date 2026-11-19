/**
 * Датчики и рёбра OSM в микрорайоне Королёvka (Заднепровский район, Смоленск).
 */
async function getFetch() {
  const mod = await import('node-fetch');
  return mod.default;
}

const KOROLEVKA_DETECTORS = [
  { name: 'D20 · ул. Кутузова', latitude: 54.77142, longitude: 32.04818 },
  { name: 'D21 · ул. Фрунзе', latitude: 54.77288, longitude: 32.05142 },
  { name: 'D22 · Свердловский пер.', latitude: 54.77358, longitude: 32.04635 },
  { name: 'D23 · пр. Гагарина (Заднепровский)', latitude: 54.77075, longitude: 32.05392 },
  { name: 'D24 · ул. Рыленкова', latitude: 54.76985, longitude: 32.04588 }
];

const CHAIN = [
  ['D20 · ул. Кутузова', 'D21 · ул. Фрунзе'],
  ['D21 · ул. Фрунзе', 'D22 · Свердловский пер.'],
  ['D20 · ул. Кутузова', 'D23 · пр. Гагарина (Заднепровский)'],
  ['D23 · пр. Гагарина (Заднепровский)', 'D24 · ул. Рыленкова'],
  ['D24 · ул. Рыленкова', 'D20 · ул. Кутузова']
];

const BRIDGE_TO_CITY = [
  ['D23 · пр. Гагарина (Заднепровский)', 'D3'],
  ['D21 · ул. Фрунзе', 'D4'],
  ['D20 · ул. Кутузова', 'D18'],
  ['D22 · Свердловский пер.', 'D13']
];

async function osrmGeometry(from, to) {
  const fetch = await getFetch();
  const url = `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(url, { signal: controller.signal });
    const j = await r.json();
    const coords = j?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    return coords;
  } finally {
    clearTimeout(t);
  }
}

async function ensureEdge(Edge, fromDet, toDet, force) {
  let edge = await Edge.findOne({
    where: { fromDetectorId: fromDet.id, toDetectorId: toDet.id }
  });
  const existing = edge?.geometry?.coordinates;
  if (!force && Array.isArray(existing) && existing.length >= 3) return 'skip';

  const coords = await osrmGeometry(fromDet, toDet);
  if (!coords || coords.length < 2) return 'fail';
  const geometry = { type: 'LineString', coordinates: coords };
  if (!edge) {
    await Edge.create({ fromDetectorId: fromDet.id, toDetectorId: toDet.id, geometry });
  } else {
    edge.geometry = geometry;
    await edge.save();
  }

  let rev = await Edge.findOne({
    where: { fromDetectorId: toDet.id, toDetectorId: fromDet.id }
  });
  const revGeom = { type: 'LineString', coordinates: coords.slice().reverse() };
  if (!rev) {
    await Edge.create({ fromDetectorId: toDet.id, toDetectorId: fromDet.id, geometry: revGeom });
  } else if (force || !rev.geometry?.coordinates?.length) {
    rev.geometry = revGeom;
    await rev.save();
  }
  return 'built';
}

async function main() {
  const { sequelize, Detector, Edge } = require('../backend/models');
  await sequelize.authenticate();

  const byName = new Map();
  for (const row of KOROLEVKA_DETECTORS) {
    const [det] = await Detector.findOrCreate({
      where: { name: row.name },
      defaults: row
    });
    if (det.latitude !== row.latitude || det.longitude !== row.longitude) {
      det.latitude = row.latitude;
      det.longitude = row.longitude;
      await det.save();
    }
    byName.set(row.name, det);
  }

  const all = await Detector.findAll();
  all.forEach((d) => {
    if (!byName.has(d.name)) byName.set(d.name, d);
    if (/^D\d+$/.test(d.name)) byName.set(d.name, d);
  });

  const pairs = [...CHAIN];
  for (const [aName, bName] of BRIDGE_TO_CITY) {
    const a = byName.get(aName);
    const b = byName.get(bName) || all.find((d) => d.name === bName || d.name.startsWith(bName + ' '));
    if (a && b) pairs.push([a.name, b.name]);
  }

  let built = 0;
  let skipped = 0;
  let failed = 0;
  const force = process.argv.includes('--force');

  for (const [fromName, toName] of pairs) {
    const fromDet = byName.get(fromName) || all.find((d) => d.name === fromName);
    const toDet = byName.get(toName) || all.find((d) => d.name === toName || d.name.startsWith(toName));
    if (!fromDet || !toDet) {
      console.warn('skip pair (missing):', fromName, '->', toName);
      failed++;
      continue;
    }
    const status = await ensureEdge(Edge, fromDet, toDet, force);
    if (status === 'built') built++;
    else if (status === 'skip') skipped++;
    else failed++;
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log(`✅ Королёvka: датчиков ${KOROLEVKA_DETECTORS.length}, рёбер построено ${built}, пропущено ${skipped}, ошибок ${failed}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
