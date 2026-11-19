const { Sequelize } = require('sequelize');
const path = require('path');

const useMysql = process.env.DB_DIALECT === 'mysql' || process.env.MYSQL_DATABASE;

const sequelize = useMysql
  ? new Sequelize(
      process.env.MYSQL_DATABASE,
      process.env.MYSQL_USER,
      process.env.MYSQL_PASSWORD,
      {
        dialect: 'mysql',
        dialectOptions: {
          socketPath: process.env.MYSQL_SOCKET || '/tmp/mysql.sock',
        },
        logging: false,
        define: {
          timestamps: true,
          underscored: true,
        },
      }
    )
  : new Sequelize({
      dialect: 'sqlite',
      storage: path.join(__dirname, '../../database.sqlite'),
      logging: false,
      define: {
        timestamps: true,
        underscored: true,
      },
    });

async function connectDatabase() {
  try {
    await sequelize.authenticate();
    console.log(
      useMysql
        ? '✅ Подключение к MySQL установлено успешно'
        : '✅ Подключение к базе данных установлено успешно'
    );

    await sequelize.sync();
    console.log('✅ Модели синхронизированы с базой данных');

    return sequelize;
  } catch (error) {
    console.error('❌ Ошибка подключения к базе данных:', error);
    throw error;
  }
}

module.exports = {
  sequelize,
  connectDatabase,
};
