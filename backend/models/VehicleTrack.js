const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Материализованный трек транспортного средства за интервал
const VehicleTrack = sequelize.define('VehicleTrack', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  vehicleId: { type: DataTypes.STRING, allowNull: false, field: 'vehicle_id' },
  startTime: { type: DataTypes.DATE, allowNull: false, field: 'start_time' },
  endTime: { type: DataTypes.DATE, allowNull: false, field: 'end_time' },
  durationSec: { type: DataTypes.INTEGER, allowNull: false, field: 'duration_sec' },
  avgSpeed: { type: DataTypes.FLOAT, allowNull: true, field: 'avg_speed' },
  detectorSequence: { type: DataTypes.JSON, allowNull: false, field: 'detector_sequence' }
}, {
  tableName: 'VehicleTracks',
  indexes: [
    { fields: ['vehicle_id', 'start_time'] }
  ]
});

module.exports = VehicleTrack;


