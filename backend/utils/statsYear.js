async function yearWithData(Model, year) {
  const y =
    year != null && year !== ''
      ? parseInt(year, 10)
      : new Date().getFullYear();
  const count = await Model.count({ where: { year: y } });
  if (count > 0) return y;
  const latest = await Model.max('year');
  return latest != null ? parseInt(latest, 10) : y;
}

module.exports = { yearWithData };
