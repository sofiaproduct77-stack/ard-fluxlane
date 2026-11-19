const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Ребро дорожной сети между двумя детекторами
const Edge = sequelize.define('Edge', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fromDetectorId: { type: DataTypes.INTEGER, allowNull: false, field: 'from_detector_id' },
  toDetectorId: { type: DataTypes.INTEGER, allowNull: false, field: 'to_detector_id' },
  lengthMeters: { type: DataTypes.FLOAT, allowNull: true },
  speedLimit: { type: DataTypes.FLOAT, allowNull: true },
  geometry: { type: DataTypes.JSON, allowNull: true }
}, {
  tableName: 'Edges',
  indexes: [
    { fields: ['from_detector_id'] },
    { fields: ['to_detector_id'] }
  ]
});

module.exports = Edge;


