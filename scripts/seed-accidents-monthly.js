/**
 * Заполняет помесячную статистику ДТП (2024–2026) для графиков и карты.
 * Удаляет некорректные одиночные записи с испорченными счётчиками.
 */
const { connectDatabase } = require('../backend/config/database');
const { Accident } = require('../backend/models');

const MONTHLY = {
  2024: [
    { m: 1, a: 22, d: 4, i: 18 },
    { m: 2, a: 20, d: 3, i: 16 },
    { m: 3, a: 24, d: 5, i: 19 },
    { m: 4, a: 26, d: 5, i: 21 },
    { m: 5, a: 28, d: 6, i: 22 },
    { m: 6, a: 30, d: 7, i: 24 },
    { m: 7, a: 32, d: 8, i: 26 },
    { m: 8, a: 29, d: 6, i: 23 },
    { m: 9, a: 25, d: 5, i: 20 },
    { m: 10, a: 23, d: 4, i: 18 },
    { m: 11, a: 21, d: 4, i: 17 },
    { m: 12, a: 20, d: 3, i: 16 }
  ],
  2025: [
    { m: 1, a: 24, d: 5, i: 19 },
    { m: 2, a: 26, d: 5, i: 21 },
    { m: 3, a: 28, d: 6, i: 22 },
    { m: 4, a: 30, d: 6, i: 24 },
    { m: 5, a: 32, d: 7, i: 25 },
    { m: 6, a: 34, d: 8, i: 27 },
    { m: 7, a: 36, d: 9, i: 28 },
    { m: 8, a: 33, d: 7, i: 26 },
    { m: 9, a: 29, d: 6, i: 23 },
    { m: 10, a: 27, d: 5, i: 21 },
    { m: 11, a: 25, d: 5, i: 20 },
    { m: 12, a: 23, d: 4, i: 18 }
  ],
  2026: [
    { m: 1, a: 18, d: 3, i: 14 },
    { m: 2, a: 19, d: 3, i: 15 },
    { m: 3, a: 21, d: 4, i: 16 },
    { m: 4, a: 0, d: 0, i: 0 },
    { m: 5, a: 0, d: 0, i: 0 },
    { m: 6, a: 0, d: 0, i: 0 },
    { m: 7, a: 0, d: 0, i: 0 },
    { m: 8, a: 0, d: 0, i: 0 },
    { m: 9, a: 0, d: 0, i: 0 },
    { m: 10, a: 0, d: 0, i: 0 },
    { m: 11, a: 0, d: 0, i: 0 },
    { m: 12, a: 0, d: 0, i: 0 }
  ]
};

const DISTRICTS = ['Центральный', 'Ленинский', 'Промышленный', 'Заднепровский'];

const DISTRICT_GPS = {
  Центральный: { latitude: 54.78, longitude: 32.045 },
  Ленинский: { latitude: 54.7805, longitude: 32.034 },
  Промышленный: { latitude: 54.784, longitude: 32.078 },
  Заднепровский: { latitude: 54.799, longitude: 32.035 },
};

function coordsForMonth(district, month) {
  const base = DISTRICT_GPS[district] || DISTRICT_GPS.Центральный;
  const jitter = (month % 7) * 0.0012;
  return {
    latitude: base.latitude + jitter,
    longitude: base.longitude + jitter * 0.85,
  };
}

async function run() {
  await connectDatabase();
  await Accident.destroy({ where: {} });

  for (const year of [2024, 2025, 2026]) {
    for (const row of MONTHLY[year]) {
      if (row.a === 0 && year === 2026 && row.m > 3) continue;
      const day = Math.min(28, 5 + row.m);
      const date = `${year}-${String(row.m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const district = DISTRICTS[row.m % DISTRICTS.length];
      await Accident.create({
        date,
        accidentsCount: row.a,
        deathsCount: row.d,
        injuredCount: row.i,
        year,
        month: row.m,
        dayOfWeek: ((row.m + day) % 7) + 1,
        district,
        street: `ул. Транспортная, ${10 + row.m}`,
        accidentType: 'Столкновение',
        ...coordsForMonth(district, row.m),
      });
    }
  }

  console.log('✅ Помесячная статистика ДТП (2024–2026) загружена');
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
