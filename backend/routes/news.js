const express = require('express');
const { News, User } = require('../models');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseBool } = require('../utils/booleans');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), 'uploads');
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || '');
    cb(null, `${unique}${ext}`);
  }
});
const upload = multer({ storage });

function normalizeNewsPayload(raw) {
  const newsData = { ...(raw || {}) };
  if (newsData.isPublished !== undefined) {
    newsData.isPublished = parseBool(newsData.isPublished, false);
  }
  if (newsData.isFeatured !== undefined) {
    newsData.isFeatured = parseBool(newsData.isFeatured, false);
  }
  if (newsData.category === 'infrastructure') {
    newsData.category = 'construction';
  }
  if (newsData.isPublished) {
    if (!newsData.publishedAt) newsData.publishedAt = new Date();
  } else if (newsData.isPublished === false) {
    newsData.publishedAt = null;
  }
  delete newsData.publishedDate;
  return newsData;
}

// Публичный список
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const { category, featured } = req.query;

    const where = { isPublished: true };
    if (category) where.category = category;
    if (featured === 'true') where.isFeatured = true;

    const { count, rows } = await News.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'author',
        attributes: ['fullName', 'username']
      }],
      order: [['publishedAt', 'DESC']],
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
    console.error('Ошибка получения новостей:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Админ: все новости (включая черновики)
router.get('/admin', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 100;
    const offset = (page - 1) * limit;

    const { count, rows } = await News.findAndCountAll({
      include: [{
        model: User,
        as: 'author',
        attributes: ['fullName', 'username']
      }],
      order: [['updatedAt', 'DESC']],
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
    console.error('Ошибка получения новостей (админ):', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.get('/admin/:id', async (req, res) => {
  try {
    const news = await News.findByPk(req.params.id, {
      include: [{
        model: User,
        as: 'author',
        attributes: ['fullName', 'username']
      }]
    });
    if (!news) {
      return res.status(404).json({ error: 'Новость не найдена' });
    }
    res.json(news);
  } catch (error) {
    console.error('Ошибка получения новости (админ):', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.get('/popular/trending', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 5;

    const popularNews = await News.findAll({
      where: { isPublished: true },
      order: [['viewsCount', 'DESC']],
      limit,
      include: [{
        model: User,
        as: 'author',
        attributes: ['fullName', 'username']
      }]
    });

    res.json(popularNews);
  } catch (error) {
    console.error('Ошибка получения популярных новостей:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.get('/featured/list', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 3;

    const featuredNews = await News.findAll({
      where: {
        isPublished: true,
        isFeatured: true
      },
      order: [['publishedAt', 'DESC']],
      limit,
      include: [{
        model: User,
        as: 'author',
        attributes: ['fullName', 'username']
      }]
    });

    res.json(featuredNews);
  } catch (error) {
    console.error('Ошибка получения рекомендуемых новостей:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const news = await News.findOne({
      where: {
        id,
        isPublished: true
      },
      include: [{
        model: User,
        as: 'author',
        attributes: ['fullName', 'username']
      }]
    });

    if (!news) {
      return res.status(404).json({ error: 'Новость не найдена' });
    }

    await news.increment('viewsCount');
    res.json(news);
  } catch (error) {
    console.error('Ошибка получения новости:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.post('/', upload.fields([
  { name: 'cover', maxCount: 1 },
  { name: 'images', maxCount: 20 },
  { name: 'attachments', maxCount: 20 }
]), async (req, res) => {
  try {
    const newsData = normalizeNewsPayload(req.body || {});

    if (!newsData.title || !newsData.content) {
      return res.status(400).json({ error: 'Заголовок и содержание обязательны' });
    }

    if (req.files && req.files.cover && req.files.cover[0]) {
      newsData.image = `/uploads/${req.files.cover[0].filename}`;
    }
    if (req.files && req.files.images && req.files.images.length) {
      newsData.images = req.files.images.map((f) => `/uploads/${f.filename}`);
    }
    if (req.files && req.files.attachments && req.files.attachments.length) {
      newsData.attachments = req.files.attachments.map((f) => ({
        url: `/uploads/${f.filename}`,
        name: f.originalname
      }));
    }

    const news = await News.create(newsData);
    res.status(201).json(news);
  } catch (error) {
    console.error('Ошибка создания новости:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.put('/:id', upload.fields([
  { name: 'cover', maxCount: 1 },
  { name: 'images', maxCount: 20 }
]), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = normalizeNewsPayload(req.body);

    const news = await News.findByPk(id);
    if (!news) {
      return res.status(404).json({ error: 'Новость не найдена' });
    }

    if (req.files && req.files.cover && req.files.cover[0]) {
      updateData.image = `/uploads/${req.files.cover[0].filename}`;
    }

    if (updateData.isPublished && !news.isPublished && !updateData.publishedAt) {
      updateData.publishedAt = new Date();
    }
    if (updateData.isPublished === false) {
      updateData.publishedAt = null;
    }

    await news.update(updateData);
    res.json(news);
  } catch (error) {
    console.error('Ошибка обновления новости:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const news = await News.findByPk(id);
    if (!news) {
      return res.status(404).json({ error: 'Новость не найдена' });
    }

    await news.destroy();
    res.json({ message: 'Новость удалена' });
  } catch (error) {
    console.error('Ошибка удаления новости:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
