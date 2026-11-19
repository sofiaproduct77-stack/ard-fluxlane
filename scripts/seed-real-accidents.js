/** Реальные ДТП Смоленска 2024–2026 по сообщениям ГИБДД, МЧС и городских СМИ. */
const { sequelize } = require('../backend/config/database');
const { Accident } = require('../backend/models');

function dow(date) {
  const js = new Date(`${date}T12:00:00`).getDay();
  return js === 0 ? 7 : js;
}

const STREET_COORDS = {
  'ул. Николаева, 44': { latitude: 54.7695243, longitude: 32.0193609 },
  'ул. Николаева, поворот на 2-й Краснинский пер.': {
    latitude: 54.7747652,
    longitude: 32.0357964,
  },
  'ул. Николаева, 54': { latitude: 54.7684145, longitude: 32.0130718 },
  'ул. Кирова, 20': { latitude: 54.7685748, longitude: 32.0309492 },
  'ул. Кирова, 41': { latitude: 54.7694348, longitude: 32.04346 },
  'ул. Кирова, 43': { latitude: 54.769146, longitude: 32.0454713 },
  'ул. Дзержинского, 1': { latitude: 54.7808654, longitude: 32.0367545 },
  'ул. Большая Советская, 13': { latitude: 54.7851853, longitude: 32.0541796 },
  'ул. Исаковского / ул. Тенишевой': { latitude: 54.7786, longitude: 32.0597 },
  'ул. Индустриальная, 2А': { latitude: 54.7695669, longitude: 32.098647 },
};

const ROWS = [
  {
    date: '2024-01-15',
    time: '07:40:00',
    hour: 7,
    district: 'Ленинский',
    street: 'ул. Николаева, 44',
    accidentType: 'столкновение',
    injuredCount: 2,
    deathsCount: 0
  },
  {
    date: '2024-03-07',
    district: 'Ленинский',
    street: 'ул. Николаева, поворот на 2-й Краснинский пер.',
    accidentType: 'столкновение',
    injuredCount: 0,
    deathsCount: 0
  },
  {
    date: '2024-07-18',
    district: 'Ленинский',
    street: 'ул. Николаева, 54',
    accidentType: 'столкновение',
    injuredCount: 1,
    deathsCount: 0
  },
  {
    date: '2024-09-23',
    district: 'Ленинский',
    street: 'ул. Кирова, 20',
    accidentType: 'наезд на пешеходов',
    injuredCount: 4,
    deathsCount: 0
  },
  {
    date: '2025-03-03',
    time: '14:50:00',
    hour: 14,
    district: 'Ленинский',
    street: 'ул. Дзержинского, 1',
    accidentType: 'столкновение',
    injuredCount: 2,
    deathsCount: 0
  },
  {
    date: '2025-06-04',
    time: '09:15:00',
    hour: 9,
    district: 'Промышленный',
    street: 'ул. Большая Советская, 13',
    accidentType: 'наезд на препятствие',
    injuredCount: 2,
    deathsCount: 0
  },
  {
    date: '2025-06-26',
    time: '01:40:00',
    hour: 1,
    district: 'Ленинский',
    street: 'ул. Кирова, 43',
    accidentType: 'столкновение',
    injuredCount: 1,
    deathsCount: 0
  },
  {
    date: '2025-07-15',
    district: 'Промышленный',
    street: 'ул. Исаковского / ул. Тенишевой',
    accidentType: 'столкновение с трамваем',
    injuredCount: 8,
    deathsCount: 0
  },
  {
    date: '2025-09-22',
    time: '17:20:00',
    hour: 17,
    district: 'Ленинский',
    street: 'ул. Кирова, 41',
    accidentType: 'столкновение',
    injuredCount: 1,
    deathsCount: 0
  },
  {
    date: '2026-08-26',
    time: '22:28:00',
    hour: 22,
    district: 'Промышленный',
    street: 'ул. Индустриальная, 2А',
    accidentType: 'опрокидывание',
    injuredCount: 0,
    deathsCount: 1
  }
];

async function main() {
  await sequelize.authenticate();
  const { Op } = require('sequelize');
  const streets = ROWS.map((r) => r.street);
  await Accident.destroy({ where: { street: { [Op.in]: streets } } });
  for (const row of ROWS) {
    const [y, m] = row.date.split('-').map(Number);
    const gps = STREET_COORDS[row.street];
    await Accident.create({
      ...row,
      ...gps,
      accidentsCount: 1,
      year: y,
      month: m,
      dayOfWeek: dow(row.date),
    });
  }
  console.log('Real accidents:', ROWS.length);
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
