const express = require('express');
const multer = require('multer');
const path = require('path');
const { Document, User } = require('../models');
const { parseBool } = require('../utils/booleans');
const router = express.Router();

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Функция для определения MIME-типа файла
function getContentType(fileType) {
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed'
  };
  
  return mimeTypes[fileType.toLowerCase()] || 'application/octet-stream';
}

function normalizeFileType(fileType) {
  if (!fileType) return '';
  const t = String(fileType).trim().toLowerCase();
  return t.startsWith('.') ? t : `.${t.replace(/^\./, '')}`;
}

// Получение всех документов (публичных)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const { category, fileType } = req.query;
    
    const where = { isPublic: true };
    if (category) where.category = category;
    if (fileType) where.fileType = fileType;
    
    const { count, rows } = await Document.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'uploader',
        attributes: ['fullName', 'username']
      }],
      order: [['createdAt', 'DESC']],
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
    console.error('Ошибка получения документов:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.get('/admin', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 100;
    const offset = (page - 1) * limit;

    const { count, rows } = await Document.findAndCountAll({
      include: [{
        model: User,
        as: 'uploader',
        attributes: ['fullName', 'username']
      }],
      order: [['createdAt', 'DESC']],
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
    console.error('Ошибка получения документов (админ):', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.get('/admin/:id', async (req, res) => {
  try {
    const document = await Document.findByPk(req.params.id, {
      include: [{
        model: User,
        as: 'uploader',
        attributes: ['fullName', 'username']
      }]
    });
    if (!document) {
      return res.status(404).json({ error: 'Документ не найден' });
    }
    res.json(document);
  } catch (error) {
    console.error('Ошибка получения документа (админ):', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.get('/statistics/overview', async (req, res) => {
  try {
    const stats = await Document.findAll({
      attributes: [
        'category',
        'fileType',
        [Document.sequelize.fn('COUNT', Document.sequelize.col('id')), 'count'],
        [Document.sequelize.fn('SUM', Document.sequelize.col('downloadCount')), 'totalDownloads']
      ],
      group: ['category', 'fileType'],
      raw: true
    });

    const groupedStats = {
      byCategory: {},
      byFileType: {},
      total: 0,
      totalDownloads: 0
    };

    stats.forEach((stat) => {
      const count = parseInt(stat.count, 10);
      const downloads = parseInt(stat.totalDownloads, 10) || 0;

      groupedStats.total += count;
      groupedStats.totalDownloads += downloads;

      if (!groupedStats.byCategory[stat.category]) {
        groupedStats.byCategory[stat.category] = { count: 0, downloads: 0 };
      }
      groupedStats.byCategory[stat.category].count += count;
      groupedStats.byCategory[stat.category].downloads += downloads;

      if (!groupedStats.byFileType[stat.fileType]) {
        groupedStats.byFileType[stat.fileType] = { count: 0, downloads: 0 };
      }
      groupedStats.byFileType[stat.fileType].count += count;
      groupedStats.byFileType[stat.fileType].downloads += downloads;
    });

    res.json(groupedStats);
  } catch (error) {
    console.error('Ошибка получения статистики документов:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получение документа по ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await Document.findOne({
      where: { 
        id,
        isPublic: true 
      },
      include: [{
        model: User,
        as: 'uploader',
        attributes: ['fullName', 'username']
      }]
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Документ не найден' });
    }
    
    res.json(document);
    
  } catch (error) {
    console.error('Ошибка получения документа:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Просмотр документа
router.get('/:id/view', async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await Document.findOne({
      where: { 
        id,
        isPublic: true 
      }
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Документ не найден' });
    }
    
    // Проверяем, существует ли файл
    const fs = require('fs');
    const path = require('path');
    
    // Простой путь: файл лежит в папке uploads
    const filePath = path.join(__dirname, '../../uploads', document.filePath);
    
    console.log('Ищем файл по пути:', filePath);
    console.log('filePath из БД:', document.filePath);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        error: 'Файл не найден на сервере',
        searchedPath: filePath,
        documentPath: document.filePath,
        documentName: document.fileName
      });
    }
    
    // Отправляем файл для просмотра в браузере
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Content-Type', getContentType(normalizeFileType(document.fileType)));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.resolve(filePath), (err) => {
      if (err) {
        console.error('Ошибка отправки файла для просмотра:', err);
        res.status(500).json({ error: 'Ошибка просмотра файла' });
      }
    });
    
  } catch (error) {
    console.error('Ошибка просмотра документа:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Скачивание документа
router.get('/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await Document.findOne({
      where: { 
        id,
        isPublic: true 
      }
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Документ не найден' });
    }
    
    // Увеличиваем счетчик скачиваний
    await document.increment('downloadCount');
    
    // Проверяем, существует ли файл
    const fs = require('fs');
    const path = require('path');
    
    // Простой путь: файл лежит в папке uploads
    const filePath = path.join(__dirname, '../../uploads', document.filePath);
    
    console.log('Ищем файл по пути:', filePath);
    console.log('filePath из БД:', document.filePath);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        error: 'Файл не найден на сервере',
        searchedPath: filePath,
        documentPath: document.filePath,
        documentName: document.fileName
      });
    }
    
    // Отправляем файл
    res.download(path.resolve(filePath), document.fileName, (err) => {
      if (err) {
        console.error('Ошибка отправки файла:', err);
        res.status(500).json({ error: 'Ошибка скачивания файла' });
      }
    });
    
  } catch (error) {
    console.error('Ошибка скачивания документа:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Создание нового документа
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const documentData = req.body;
    
    if (!documentData.title) {
      return res.status(400).json({ error: 'Название документа обязательно' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'Файл обязателен' });
    }
    
    // Подготавливаем данные документа
    const newDocument = {
      title: documentData.title,
      description: documentData.description || '',
      category: documentData.category || 'general',
      fileName: req.file.originalname,
      filePath: req.file.filename, // Имя файла с уникальным суффиксом
      fileSize: req.file.size,
      fileType: normalizeFileType(path.extname(req.file.originalname)),
      isPublic: parseBool(documentData.isPublic, true),
      uploaderId: 1 // ID текущего пользователя
    };
    
    console.log('Создаем документ:', newDocument);
    
    const document = await Document.create(newDocument);
    res.status(201).json(document);
    
  } catch (error) {
    console.error('Ошибка создания документа:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Обновление документа
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const document = await Document.findByPk(id);
    if (!document) {
      return res.status(404).json({ error: 'Документ не найден' });
    }

    const updateData = { ...req.body };
    if (updateData.isPublic !== undefined) {
      updateData.isPublic = parseBool(updateData.isPublic, document.isPublic);
    }

    await document.update(updateData);
    res.json(document);
  } catch (error) {
    console.error('Ошибка обновления документа:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Удаление документа
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await Document.findByPk(id);
    if (!document) {
      return res.status(404).json({ error: 'Документ не найден' });
    }
    
    await document.destroy();
    res.json({ message: 'Документ удален' });
    
  } catch (error) {
    console.error('Ошибка удаления документа:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
