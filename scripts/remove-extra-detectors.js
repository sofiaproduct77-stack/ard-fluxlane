/** Удаляет датчики D20+ (добавленные для районных seed) и связанные рёбра. */
async function main() {
  const { Op } = require('sequelize');
  const { sequelize, Detector, Edge } = require('../backend/models');
  await sequelize.authenticate();

  const extra = await Detector.findAll({
    where: {
      [Op.or]: [
        { id: { [Op.gt]: 19 } },
        { name: { [Op.like]: 'D2_%' } },
        { name: { [Op.like]: 'D2 %' } },
        { name: { [Op.like]: 'D2_%' } },
        { name: { [Op.like]: '% · %' } }
      ]
    }
  });
  const ids = extra.map((d) => d.id);
  if (ids.length) {
    await Edge.destroy({
      where: { [Op.or]: [{ fromDetectorId: ids }, { toDetectorId: ids }] }
    });
    await Detector.destroy({ where: { id: ids } });
  }
  const left = await Detector.count();
  console.log(`✅ Удалено доп. датчиков: ${ids.length}, осталось: ${left}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
