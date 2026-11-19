const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

const sqlite = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../database.sqlite'),
  logging: false,
});

async function main() {
  const [fines] = await sqlite.query('SELECT * FROM fines ORDER BY id');
  const [evacuations] = await sqlite.query('SELECT * FROM evacuations ORDER BY id');
  const [trafficLights] = await sqlite.query('SELECT * FROM traffic_lights ORDER BY id');

  const out = path.join(__dirname, 'analytics-export.json');
  fs.writeFileSync(
    out,
    JSON.stringify({ fines, evacuations, trafficLights }),
  );
  console.log(
    'Wrote',
    out,
    `fines=${fines.length} evacuations=${evacuations.length} trafficLights=${trafficLights.length}`,
  );
  await sqlite.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
