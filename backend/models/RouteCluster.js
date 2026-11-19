const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Кэш результатов кластеризации маршрутов
const RouteCluster = sequelize.define('RouteCluster', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  windowStart: { type: DataTypes.DATE, allowNull: false, field: 'window_start' },
  windowEnd: { type: DataTypes.DATE, allowNull: false, field: 'window_end' },
  method: { type: DataTypes.STRING, allowNull: false },
  clusterLabel: { type: DataTypes.STRING, allowNull: false, field: 'cluster_label' },
  detectorSequence: { type: DataTypes.JSON, allowNull: false, field: 'detector_sequence' },
  vehiclesCount: { type: DataTypes.INTEGER, allowNull: false, field: 'vehicles_count' },
  intensityPerHour: { type: DataTypes.FLOAT, allowNull: false, field: 'intensity_per_hour' },
  avgSpeed: { type: DataTypes.FLOAT, allowNull: true, field: 'avg_speed' },
  avgTravelTime: { type: DataTypes.FLOAT, allowNull: true, field: 'avg_travel_time' }
}, {
  tableName: 'RouteClusters',
  indexes: [
    { fields: ['window_start', 'window_end'] },
    { fields: ['method'] }
  ]
});

module.exports = RouteCluster;


