const { connectDatabase } = require('../backend/config/database');
const { User, Fine, Evacuation, TrafficLight, Accident, News, Document, Project, Transport, Service } = require('../backend/models');

async function initializeDatabase() {
  try {
    console.log('🚀 Инициализация базы данных...');
    
    // Подключаемся к БД
    await connectDatabase();
    
    // Создаем тестовых пользователей
    console.log('👥 Создание тестовых пользователей...');
    
    const adminUser = await User.findOrCreate({
      where: { username: 'admin' },
      defaults: {
        username: 'admin',
        email: 'admin@fluxlane-smolensk.ru',
        password: 'admin123',
        role: 'admin',
        fullName: 'Администратор системы'
      }
    });
    
    const editorUser = await User.findOrCreate({
      where: { username: 'editor' },
      defaults: {
        username: 'editor',
        email: 'editor@fluxlane-smolensk.ru',
        password: 'editor123',
        role: 'editor',
        fullName: 'Редактор контента'
      }
    });
    
    console.log('✅ Пользователи созданы');
    
    // Создаем тестовые услуги
    console.log('🛠️ Создание тестовых услуг...');
    
    const services = [
      {
        title: 'Разработка проектно-сметной документации',
        description: 'Для строительства светофорных объектов',
        category: 'documentation',
        price: 'от 50 000 ₽',
        isActive: true,
        order: 1,
        formFields: [
          { type: 'text', label: 'Название объекта', name: 'objectName', required: true, placeholder: 'Введите название объекта' },
          { type: 'text', label: 'Адрес', name: 'address', required: true, placeholder: 'Введите адрес объекта' },
          { type: 'tel', label: 'Контактный телефон', name: 'phone', required: true, placeholder: '+7 (xxx) xxx-xx-xx' },
          { type: 'email', label: 'Email', name: 'email', required: false, placeholder: 'example@email.com' },
          { type: 'textarea', label: 'Дополнительные требования', name: 'requirements', required: false, placeholder: 'Опишите дополнительные требования' }
        ]
      },
      {
        title: 'Аренда автовышки',
        description: 'Для обслуживания светофорных объектов',
        category: 'equipment',
        price: 'от 3 000 ₽/день',
        isActive: true,
        order: 2,
        formFields: [
          { type: 'text', label: 'Высота работ', name: 'height', required: true, placeholder: 'Введите высоту в метрах' },
          { type: 'date', label: 'Дата начала работ', name: 'startDate', required: true },
          { type: 'number', label: 'Количество дней', name: 'days', required: true, placeholder: '1', min: 1, max: 30 },
          { type: 'tel', label: 'Контактный телефон', name: 'phone', required: true, placeholder: '+7 (xxx) xxx-xx-xx' },
          { type: 'text', label: 'Адрес объекта', name: 'address', required: true, placeholder: 'Введите адрес объекта' }
        ]
      },
      {
        title: 'Вызов эвакуатора',
        description: 'Быстрое реагирование на нарушения',
        category: 'evacuation',
        price: 'от 2 500 ₽',
        isActive: true,
        order: 3,
        formFields: [
          { type: 'text', label: 'Адрес эвакуации', name: 'address', required: true, placeholder: 'Введите точный адрес' },
          { type: 'text', label: 'Марка и модель автомобиля', name: 'carModel', required: true, placeholder: 'Toyota Camry 2020' },
          { type: 'text', label: 'Госномер', name: 'licensePlate', required: true, placeholder: 'А123БВ77' },
          { type: 'tel', label: 'Контактный телефон', name: 'phone', required: true, placeholder: '+7 (xxx) xxx-xx-xx' },
          { type: 'textarea', label: 'Причина эвакуации', name: 'reason', required: false, placeholder: 'Опишите причину эвакуации' }
        ]
      }
    ];
    
    for (const serviceData of services) {
      await Service.findOrCreate({
        where: { title: serviceData.title },
        defaults: serviceData
      });
    }
    
    console.log('✅ Услуги созданы');
    
    console.log('✅ Данные по транспорту созданы');
    
    console.log('🎉 База данных успешно инициализирована!');
    console.log('\n📋 Созданные пользователи:');
    console.log('👤 Администратор: admin / admin123');
    console.log('✏️ Редактор: editor / editor123');
    console.log('\n🗄️ База данных: database.sqlite');
    
  } catch (error) {
    console.error('❌ Ошибка инициализации базы данных:', error);
    process.exit(1);
  }
}

// Запускаем инициализацию
initializeDatabase();
