const express = require('express');
const { Accident } = require('../models');
const router = express.Router();

// Получение всех данных по ДТП
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    const { year, month, district, dayOfWeek } = req.query;
    
    const where = {};
    if (year) where.year = year;
    if (month) where.month = month;
    if (district) where.district = district;
    if (dayOfWeek) where.dayOfWeek = dayOfWeek;
    
    const { count, rows } = await Accident.findAndCountAll({
      where,
      order: [['date', 'DESC']],
      limit,
      offset
    });
    
    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
    
  } catch (error) {
    console.error('Ошибка получения данных по ДТП:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получение статистики по ДТП
router.get('/statistics', async (req, res) => {
  try {
    const { year, compareYear } = req.query;
    
    const currentYear = year || new Date().getFullYear();
    const currentData = await Accident.findAll({
      where: { year: currentYear },
      order: [['month', 'ASC']]
    });
    
    let compareData = null;
    if (compareYear && compareYear !== currentYear) {
      compareData = await Accident.findAll({
        where: { year: compareYear },
        order: [['month', 'ASC']]
      });
    }
    
    const currentStats = aggregateAccidentData(currentData);
    const compareStats = compareData ? aggregateAccidentData(compareData) : null;
    
    res.json({
      currentYear: parseInt(currentYear),
      compareYear: compareYear ? parseInt(compareYear) : null,
      current: currentStats,
      compare: compareStats,
      trends: compareStats ? calculateTrends(currentStats, compareStats) : null
    });
    
  } catch (error) {
    console.error('Ошибка получения статистики ДТП:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получение статистики по дням недели
router.get('/by-day-of-week', async (req, res) => {
  try {
    const { year } = req.query;
    const currentYear = year || new Date().getFullYear();
    
    const dayStats = await Accident.findAll({
      where: { year: currentYear },
      attributes: [
        'dayOfWeek',
        [Accident.sequelize.fn('SUM', Accident.sequelize.col('accidentsCount')), 'totalAccidents'],
        [Accident.sequelize.fn('SUM', Accident.sequelize.col('deathsCount')), 'totalDeaths'],
        [Accident.sequelize.fn('SUM', Accident.sequelize.col('injuredCount')), 'totalInjured']
      ],
      group: ['dayOfWeek'],
      order: [['dayOfWeek', 'ASC']],
      raw: true
    });
    
    const dayNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    
    const formattedStats = dayStats.map(stat => ({
      dayOfWeek: stat.dayOfWeek,
      dayName: dayNames[stat.dayOfWeek - 1] || 'Неизвестно',
      accidents: parseInt(stat.totalAccidents) || 0,
      deaths: parseInt(stat.totalDeaths) || 0,
      injured: parseInt(stat.totalInjured) || 0
    }));
    
    res.json(formattedStats);
    
  } catch (error) {
    console.error('Ошибка получения статистики по дням недели:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получение статистики по часам
router.get('/by-hour', async (req, res) => {
  try {
    const { year } = req.query;
    const currentYear = year || new Date().getFullYear();
    
    const hourStats = await Accident.findAll({
      where: { year: currentYear },
      attributes: [
        'hour',
        [Accident.sequelize.fn('SUM', Accident.sequelize.col('accidentsCount')), 'totalAccidents'],
        [Accident.sequelize.fn('SUM', Accident.sequelize.col('deathsCount')), 'totalDeaths'],
        [Accident.sequelize.fn('SUM', Accident.sequelize.col('injuredCount')), 'totalInjured']
      ],
      group: ['hour'],
      order: [['hour', 'ASC']],
      raw: true
    });
    
    const formattedStats = hourStats.map(stat => ({
      hour: stat.hour,
      accidents: parseInt(stat.totalAccidents) || 0,
      deaths: parseInt(stat.totalDeaths) || 0,
      injured: parseInt(stat.totalInjured) || 0
    }));
    
    res.json(formattedStats);
    
  } catch (error) {
    console.error('Ошибка получения статистики по часам:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Создание новой записи о ДТП
router.post('/', async (req, res) => {
  try {
    const accidentData = req.body;
    
    if (!accidentData.date || !accidentData.year || !accidentData.month) {
      return res.status(400).json({ error: 'Дата, год и месяц обязательны' });
    }
    const lat = Number(accidentData.latitude);
    const lon = Number(accidentData.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: 'Поставьте точку ДТП на карте' });
    }
    accidentData.latitude = lat;
    accidentData.longitude = lon;
    // Если год ввели некорректно (длина > 5), обнулим
    if (String(accidentData.year).length > 5) {
      accidentData.year = 0;
    }
    // Значения по умолчанию для сумм/количеств
    accidentData.accidentsCount = parseInt(accidentData.accidentsCount || 1);
    accidentData.deathsCount = parseInt(accidentData.deathsCount || 0);
    accidentData.injuredCount = parseInt(accidentData.injuredCount || 0);
    
    const accident = await Accident.create(accidentData);
    res.status(201).json(accident);
    
  } catch (error) {
    console.error('Ошибка создания записи о ДТП:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Обновление записи о ДТП
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const accident = await Accident.findByPk(id);
    if (!accident) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }
    
    await accident.update(updateData);
    res.json(accident);
    
  } catch (error) {
    console.error('Ошибка обновления записи о ДТП:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Удаление записи о ДТП
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const accident = await Accident.findByPk(id);
    if (!accident) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }
    
    await accident.destroy();
    res.json({ message: 'Запись удалена' });
    
  } catch (error) {
    console.error('Ошибка удаления записи о ДТП:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получение записей для карты событий (фильтр по датам)
router.get('/map-events', async (req, res) => {
  try {
    const { from, to } = req.query;
    const { Op } = require('sequelize');
    const where = {};
    if (from && to) {
      where.date = { [Op.between]: [from, to] };
    } else if (from) {
      where.date = { [Op.gte]: from };
    } else if (to) {
      where.date = { [Op.lte]: to };
    }
    const rows = await Accident.findAll({
      where,
      order: [['date', 'DESC']],
      limit: 5000
    });
    res.json(rows.map((r) => ({
      id: r.id,
      date: r.date,
      time: r.time,
      accidentsCount: sanitizeAccidentRow(r).accidentsCount,
      deathsCount: sanitizeAccidentRow(r).deathsCount,
      injuredCount: sanitizeAccidentRow(r).injuredCount,
      year: r.year,
      month: r.month,
      district: r.district,
      street: r.street,
      accidentType: r.accidentType,
      latitude: r.latitude,
      longitude: r.longitude
    })));
  } catch (error) {
    console.error('Ошибка map-events:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Доступные годы в данных
router.get('/years', async (req, res) => {
  try {
    const rows = await Accident.findAll({
      attributes: [[Accident.sequelize.fn('DISTINCT', Accident.sequelize.col('year')), 'year']],
      order: [[Accident.sequelize.col('year'), 'DESC']],
      raw: true
    });
    const years = rows.map((r) => Number(r.year)).filter((y) => y >= 2000 && y <= 2100);
    res.json({ years: years.length ? years : [new Date().getFullYear()] });
  } catch (e) {
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

function sanitizeAccidentRow(item) {
  const acc = parseInt(item.accidentsCount, 10) || 0;
  let deaths = parseInt(item.deathsCount, 10) || 0;
  let injured = parseInt(item.injuredCount, 10) || 0;
  const cap = (v, max) => (v > max ? 0 : v);
  deaths = cap(deaths, Math.max(500, acc * 30));
  injured = cap(injured, Math.max(2000, acc * 50));
  return {
    month: item.month,
    accidentsCount: acc,
    deathsCount: deaths,
    injuredCount: injured
  };
}

function aggregateAccidentData(data) {
  const byMonth = new Map();
  for (const item of data) {
    const row = sanitizeAccidentRow(item);
    const m = Number(row.month);
    if (!m || m < 1 || m > 12) continue;
    if (!byMonth.has(m)) {
      byMonth.set(m, { month: m, accidentsCount: 0, deathsCount: 0, injuredCount: 0 });
    }
    const bucket = byMonth.get(m);
    bucket.accidentsCount += row.accidentsCount;
    bucket.deathsCount += row.deathsCount;
    bucket.injuredCount += row.injuredCount;
  }

  const monthly = [];
  for (let i = 1; i <= 12; i++) {
    monthly.push(
      byMonth.get(i) || { month: i, accidentsCount: 0, deathsCount: 0, injuredCount: 0 }
    );
  }

  const total = monthly.reduce(
    (acc, item) => ({
      accidentsCount: acc.accidentsCount + item.accidentsCount,
      deathsCount: acc.deathsCount + item.deathsCount,
      injuredCount: acc.injuredCount + item.injuredCount
    }),
    { accidentsCount: 0, deathsCount: 0, injuredCount: 0 }
  );

  return { total, monthly };
}

function calculateTrends(current, compare) {
  return {
    accidentsCount: calculatePercentageChange(current.total.accidentsCount, compare.total.accidentsCount),
    deathsCount: calculatePercentageChange(current.total.deathsCount, compare.total.deathsCount),
    injuredCount: calculatePercentageChange(current.total.injuredCount, compare.total.injuredCount)
  };
}

function calculatePercentageChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous * 100).toFixed(1);
}

router.get('/:id', async (req, res) => {
  try {
    const accident = await Accident.findByPk(req.params.id);
    if (!accident) return res.status(404).json({ error: 'Запись не найдена' });
    res.json(accident);
  } catch (error) {
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
