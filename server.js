const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { connectDatabase } = require('./backend/config/database');
const { initContacts } = require('./scripts/init-contacts');
const { initProjects } = require('./scripts/init-projects');
const { initUsers } = require('./scripts/init-users');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Отключаем кэширование для разработки
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// Статические файлы
app.use(express.static('.'));
// Раздача загруженных файлов
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));

// API Routes (пока заглушки)
app.use('/api/auth', require('./backend/routes/auth'));
app.use('/api/fines', require('./backend/routes/fines'));
app.use('/api/evacuations', require('./backend/routes/evacuations'));
app.use('/api/traffic-lights', require('./backend/routes/trafficLights'));
app.use('/api/accidents', require('./backend/routes/accidents'));
app.use('/api/news', require('./backend/routes/news'));
app.use('/api/documents', require('./backend/routes/documents'));
app.use('/api/projects', require('./backend/routes/projects'));
app.use('/api/transport', require('./backend/routes/transport'));
app.use('/api/services', require('./backend/routes/services'));
app.use('/api/orders', require('./backend/routes/orders'));
app.use('/api/vacancies', require('./backend/routes/vacancies'));
app.use('/api/contacts', require('./backend/routes/contacts'));
app.use('/api/search', require('./backend/routes/search'));
app.use('/api/traffic', require('./backend/routes/traffic'));
app.use('/api/db', require('./backend/routes/databaseInfo'));

// Новые маршруты для аналитики и маршрутов
app.use('/api/fines-analytics', require('./backend/routes/finesAnalytics'));
app.use('/api/evacuation-analytics', require('./backend/routes/evacuationAnalytics'));
app.use('/api/evacuation-routes', require('./backend/routes/evacuationRoutes'));

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Что-то пошло не так!' });
});

// 404 обработчик
app.use((req, res) => {
  res.status(404).json({ error: 'Страница не найдена' });
});

// Запуск сервера
async function startServer() {
  try {
    // Подключаемся к базе данных
    await connectDatabase();
    
    // Модели уже синхронизированы в connectDatabase()
    
    // Инициализируем контакты
    await initContacts();
    
    // Инициализируем проекты
    await initProjects();
    
    // Инициализируем пользователей
    await initUsers();
    
    // WebSocket обработчики
    io.on('connection', (socket) => {
      console.log('🔌 Клиент подключился:', socket.id);
      
      socket.on('disconnect', () => {
        console.log('🔌 Клиент отключился:', socket.id);
      });
    });
    
    // Делаем io доступным для других модулей
    app.set('io', io);
    
    server.listen(PORT, () => {
      console.log(`🚀 Сервер запущен на порту ${PORT}`);
      console.log(`📱 Откройте http://localhost:${PORT} в браузере`);
      console.log(`🗄️ База данных: database.sqlite`);
      console.log(`🔌 WebSocket сервер активен`);
    });
  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  }
}

startServer();


