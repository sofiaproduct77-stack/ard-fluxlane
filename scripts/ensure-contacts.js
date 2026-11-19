const { sequelize } = require('../backend/config/database');
const { Contact } = require('../backend/models');

const DEFAULTS = [
  {
    type: 'main',
    name: 'Приёмная FluxLane',
    phone: '+7 (4812) 12-34-56',
    email: 'info@fluxlane-smolensk.ru',
    address: 'г. Смоленск',
    working_hours: 'пн–пт 9:00–18:00',
    is_active: true,
    sort_order: 1
  },
  {
    type: 'support',
    name: 'Техническая поддержка',
    phone: '+7 (4812) 12-34-59',
    email: 'support@fluxlane-smolensk.ru',
    working_hours: 'пн–пт 8:00–20:00',
    is_active: true,
    sort_order: 2
  },
  {
    type: 'emergency',
    name: 'Экстренная линия',
    phone: '+7 (4812) 12-34-57',
    email: 'emergency@fluxlane-smolensk.ru',
    working_hours: 'круглосуточно',
    is_active: true,
    sort_order: 3
  }
];

async function main() {
  await sequelize.authenticate();
  const n = await Contact.count();
  if (n === 0) {
    for (const c of DEFAULTS) await Contact.create(c);
    console.log('Contacts seeded:', DEFAULTS.length);
  } else {
    console.log('Contacts already present:', n);
  }
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
