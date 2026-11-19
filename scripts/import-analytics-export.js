const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const fs = require('fs');
const { sequelize } = require('../backend/config/database');
const { Fine, Evacuation, TrafficLight } = require('../backend/models');

async function main() {
  const file = path.join(__dirname, 'analytics-export.json');
  if (!fs.existsSync(file)) {
    console.error('Missing', file);
    process.exit(1);
  }
  const { fines, evacuations, trafficLights } = JSON.parse(
    fs.readFileSync(file, 'utf8'),
  );

  await sequelize.authenticate();
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  await Fine.destroy({ where: {}, truncate: true });
  await Evacuation.destroy({ where: {}, truncate: true });
  await TrafficLight.destroy({ where: {}, truncate: true });

  const fineRows = fines.map((row) => ({
    id: row.id,
    date: row.date,
    violationsCount: row.violations_count,
    resolutionsCount: row.resolutions_count,
    imposedAmount: row.imposed_amount,
    collectedAmount: row.collected_amount,
    year: row.year,
    month: row.month,
    district: row.district,
    violationType: row.violation_type,
  }));
  for (let i = 0; i < fineRows.length; i += 500) {
    await Fine.bulkCreate(fineRows.slice(i, i + 500));
  }

  const evacRows = evacuations.map((row) => ({
    id: row.id,
    date: row.date,
    tripsCount: row.trips_count,
    evacuationsCount: row.evacuations_count,
    receiptsAmount: row.receipts_amount,
    year: row.year,
    month: row.month,
    district: row.district,
    vehicleType: row.vehicle_type,
    reason: row.reason,
  }));
  for (let i = 0; i < evacRows.length; i += 500) {
    await Evacuation.bulkCreate(evacRows.slice(i, i + 500));
  }

  const tlRows = trafficLights.map((row) => ({
    id: row.id,
    address: row.address,
    type: row.type,
    installationDate: row.installation_date,
    status: row.status,
    latitude: row.latitude,
    longitude: row.longitude,
    district: row.district,
    manufacturer: row.manufacturer,
    model: row.model,
    lastMaintenance: row.last_maintenance,
    nextMaintenance: row.next_maintenance,
    description: row.description,
  }));
  for (let i = 0; i < tlRows.length; i += 500) {
    await TrafficLight.bulkCreate(tlRows.slice(i, i + 500));
  }

  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  await sequelize.close();
  console.log('Import done:', fineRows.length, evacRows.length, tlRows.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
