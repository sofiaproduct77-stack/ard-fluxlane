const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Срабатывание детектора: проход транспортного средства
const VehiclePassage = sequelize.define('VehiclePassage', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  detectorId: { type: DataTypes.INTEGER, allowNull: false, field: 'detector_id' },
  vehicleId: { type: DataTypes.STRING, allowNull: false, field: 'vehicle_id' },
  timestamp: { type: DataTypes.DATE, allowNull: false },
  speed: { type: DataTypes.FLOAT, allowNull: true },
  source: { type: DataTypes.STRING, allowNull: true } // selection1/selection2
}, {
  tableName: 'VehiclePassages',
  indexes: [
    { fields: ['vehicle_id', 'timestamp'] },
    { fields: ['detector_id', 'timestamp'] }
  ]
});

module.exports = VehiclePassage;


