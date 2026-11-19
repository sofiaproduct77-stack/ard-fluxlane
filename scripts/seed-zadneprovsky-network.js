/**
 * Датчики и рёбра OSM в Заднепровском районе (севернее ж/д, вокзал Смоленск-Центральный).
 * Область по карте: Витебское шоссе, 12 лет Октября, Фрунзе, Беляева, рынок.
 */
async function getFetch() {
  const mod = await import('node-fetch');
  return mod.default;
}

const ZADNEPROV_DETECTORS = [
  { name: 'D20 · вокзал Смоленск-Центральный', latitude: 54.77972, longitude: 32.02639 },
  { name: 'D21 · Витебское шоссе', latitude: 54.78425, longitude: 32.0388 },
  { name: 'D22 · ул. 12 лет Октября', latitude: 54.78055, longitude: 32.04785 },
  { name: 'D23 · ул. Фрунзе (Заднепровский)', latitude: 54.7896, longitude: 32.0512 },
  { name: 'D24 · ул. Беляева', latitude: 54.78485, longitude: 32.04115 },
  { name: 'D25 · Заднепровский рынок', latitude: 54.77695, longitude: 32.04555 },
  { name: 'D26 · Ново-Московская', latitude: 54.77585, longitude: 32.0595 }
];

/** Границы района на карте (как на скриншоте пользователя). */
const ZADNEPROV_BOUNDS = {
  south: 54.774,
  north: 54.802,
  west: 32.022,
  east: 32.068
};

const CHAIN = [
  ['D20 · вокзал Смоленск-Центральный', 'D21 · Витебское шоссе'],
  ['D21 · Витебское шоссе', 'D24 · ул. Беляева'],
  ['D24 · ул. Беляева', 'D22 · ул. 12 лет Октября'],
  ['D22 · ул. 12 лет Октября', 'D23 · ул. Фрунзе (Заднепровский)'],
  ['D22 · ул. 12 лет Октября', 'D25 · Заднепровский рынок'],
  ['D25 · Заднепровский рынок', 'D26 · Ново-Московская'],
  ['D20 · вокзал Смоленск-Центральный', 'D25 · Заднепровский рынок']
];

const BRIDGE_TO_CITY = [
  ['D20 · вокзал Смоленск-Центральный', 'D2'],
  ['D21 · Витебское шоссе', 'D19'],
  ['D22 · ул. 12 лет Октября', 'D3'],
  ['D25 · Заднепровский рынок', 'D18'],
  ['D26 · Ново-Московская', 'D4']
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

function resolveDetector(all, byName, nameOrCode) {
  if (byName.has(nameOrCode)) return byName.get(nameOrCode);
  return all.find((d) => d.name === nameOrCode || d.name.startsWith(nameOrCode + ' ') || d.name.startsWith(nameOrCode + '·'));
}

async function main() {
  const { sequelize, Detector, Edge } = require('../backend/models');
  const { Op } = require('sequelize');
  await sequelize.authenticate();

  const legacyNames = [
    'D20 · ул. Кутузова',
    'D21 · ул. Фрунзе',
    'D22 · Свердловский пер.',
    'D23 · пр. Гагарина (Заднепровский)',
    'D24 · ул. Рыленкова'
  ];
  const legacy = await Detector.findAll({ where: { name: { [Op.in]: legacyNames } } });
  const legacyIds = legacy.map((d) => d.id);
  if (legacyIds.length) {
    await Edge.destroy({
      where: { [Op.or]: [{ fromDetectorId: legacyIds }, { toDetectorId: legacyIds }] }
    });
    await Detector.destroy({ where: { id: legacyIds } });
    console.log(`🗑 Удалены старые точки (Королёvka): ${legacyIds.length}`);
  }

  const byName = new Map();
  for (const row of ZADNEPROV_DETECTORS) {
    const [det, created] = await Detector.findOrCreate({
      where: { name: row.name },
      defaults: row
    });
    if (!created && (det.latitude !== row.latitude || det.longitude !== row.longitude)) {
      det.latitude = row.latitude;
      det.longitude = row.longitude;
      await det.save();
    }
    byName.set(row.name, det);
  }

  const all = await Detector.findAll();
  all.forEach((d) => {
    byName.set(d.name, d);
    if (/^D\d+$/.test(d.name)) byName.set(d.name, d);
  });

  const pairs = [...CHAIN];
  for (const [aName, bName] of BRIDGE_TO_CITY) {
    pairs.push([aName, bName]);
  }

  let built = 0;
  let skipped = 0;
  let failed = 0;
  const force = process.argv.includes('--force');

  for (const [fromName, toName] of pairs) {
    const fromDet = resolveDetector(all, byName, fromName);
    const toDet = resolveDetector(all, byName, toName);
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

  console.log(
    `✅ Заднепровский: датчиков ${ZADNEPROV_DETECTORS.length}, рёбер построено ${built}, пропущено ${skipped}, ошибок ${failed}`
  );
  console.log(
    `   bounds lat ${ZADNEPROV_BOUNDS.south}–${ZADNEPROV_BOUNDS.north}, lon ${ZADNEPROV_BOUNDS.west}–${ZADNEPROV_BOUNDS.east}`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
