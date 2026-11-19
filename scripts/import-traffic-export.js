const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const fs = require('fs');
const { sequelize } = require('../backend/config/database');
const { Detector, Edge, VehiclePassage, VehicleTrack } = require('../backend/models');

async function main() {
  const file = path.join(__dirname, 'traffic-export.json');
  if (!fs.existsSync(file)) {
    console.error('Missing', file);
    process.exit(1);
  }
  const { detectors, edges, passages, tracks } = JSON.parse(
    fs.readFileSync(file, 'utf8'),
  );

  await sequelize.authenticate();

  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  await VehiclePassage.destroy({ where: {}, truncate: true });
  await VehicleTrack.destroy({ where: {}, truncate: true });
  await Edge.destroy({ where: {}, truncate: true });
  await Detector.destroy({ where: {}, truncate: true });

  for (const row of detectors) {
    await Detector.create({
      id: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      externalId: row.externalId ?? row.external_id ?? null,
    });
  }

  for (const row of edges) {
    await Edge.create({
      id: row.id,
      fromDetectorId: row.from_detector_id ?? row.fromDetectorId,
      toDetectorId: row.to_detector_id ?? row.toDetectorId,
      lengthMeters: row.length_meters ?? row.lengthMeters ?? null,
      speedLimit: row.speed_limit ?? row.speedLimit ?? null,
      geometry:
        typeof row.geometry === 'string'
          ? JSON.parse(row.geometry)
          : row.geometry,
    });
  }

  const passageRows = passages.map((row) => ({
    id: row.id,
    detectorId: row.detector_id,
    vehicleId: row.vehicle_id,
    timestamp: row.timestamp,
    speed: row.speed,
    source: row.source,
  }));
  for (let i = 0; i < passageRows.length; i += 500) {
    await VehiclePassage.bulkCreate(passageRows.slice(i, i + 500));
  }

  const trackRows = tracks.map((row) => ({
    id: row.id,
    vehicleId: row.vehicle_id,
    startTime: row.start_time,
    endTime: row.end_time,
    durationSec: row.duration_sec,
    avgSpeed: row.avg_speed,
    detectorSequence:
      typeof row.detector_sequence === 'string'
        ? JSON.parse(row.detector_sequence)
        : row.detector_sequence,
  }));
  for (let i = 0; i < trackRows.length; i += 500) {
    await VehicleTrack.bulkCreate(trackRows.slice(i, i + 500));
  }

  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  await sequelize.close();
  console.log('Import done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
