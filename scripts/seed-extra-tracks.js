/**
 * Добавляет вариативные маршруты (клоны треков с новыми vehicleId).
 */
const { sequelize, VehicleTrack } = require('../backend/models');

async function main() {
  await sequelize.authenticate();
  const base = await VehicleTrack.findAll({ limit: 400, order: [['id', 'ASC']] });
  if (!base.length) {
    console.log('No tracks to clone');
    process.exit(0);
  }
  let created = 0;
  for (let i = 0; i < base.length && created < 350; i++) {
    const t = base[i];
    const seq = t.detectorSequence;
    if (!Array.isArray(seq) || seq.length < 2) continue;
    const suffix = `_r${created + 1}`;
    await VehicleTrack.create({
      vehicleId: `${t.vehicleId || 'v'}${suffix}`,
      detectorSequence: seq.map((p, idx) => ({
        ...p,
        timestamp: new Date(new Date(p.timestamp).getTime() + (idx + created) * 60000).toISOString()
      })),
      startTime: t.startTime,
      endTime: t.endTime,
      durationSec:
        t.durationSec ??
        (t.startTime && t.endTime
          ? Math.max(1, Math.round((new Date(t.endTime) - new Date(t.startTime)) / 1000))
          : 120),
      avgSpeed: t.avgSpeed
    });
    created += 1;
  }
  console.log('Extra tracks created:', created);
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
