const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

const sqlite = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../database.sqlite'),
  logging: false,
});

async function main() {
  const [detectors] = await sqlite.query('SELECT * FROM Detectors ORDER BY id');
  const [edges] = await sqlite.query('SELECT * FROM Edges ORDER BY id');
  const [passages] = await sqlite.query('SELECT * FROM VehiclePassages ORDER BY id');
  const [tracks] = await sqlite.query('SELECT * FROM VehicleTracks ORDER BY id');

  const out = path.join(__dirname, 'traffic-export.json');
  fs.writeFileSync(
    out,
    JSON.stringify({ detectors, edges, passages, tracks }),
  );
  console.log(
    'Wrote',
    out,
    `detectors=${detectors.length} edges=${edges.length} passages=${passages.length} tracks=${tracks.length}`,
  );
  await sqlite.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
