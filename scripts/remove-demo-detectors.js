/** Удаляет демо-датчики Заднепровского и связанные рёбра. */
async function main() {
  const { Op } = require('sequelize');
  const { sequelize, Detector, Edge } = require('../backend/models');
  await sequelize.authenticate();

  const demo = await Detector.findAll({ where: { name: { [Op.like]: '[демо]%' } } });
  const ids = demo.map((d) => d.id);
  if (ids.length) {
    await Edge.destroy({
      where: {
        [Op.or]: [{ fromDetectorId: ids }, { toDetectorId: ids }]
      }
    });
    await Detector.destroy({ where: { id: ids } });
  }
  console.log(`✅ Удалено демо-датчиков: ${ids.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
