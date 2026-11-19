const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Детектор: узел графа с координатами
const Detector = sequelize.define('Detector', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  latitude: { type: DataTypes.FLOAT, allowNull: false },
  longitude: { type: DataTypes.FLOAT, allowNull: false },
  externalId: { type: DataTypes.STRING, allowNull: true }
}, {
  tableName: 'Detectors',
  indexes: [
    { unique: true, fields: ['name'] }
  ]
});

module.exports = Detector;


