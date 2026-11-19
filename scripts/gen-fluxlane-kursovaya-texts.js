/**
 * Генерирует kursovaya-fluxlane-texts.json из шаблона + точечные замены.
 */
const fs = require('fs');
const path = require('path');
const template = require('./kursovaya-template-texts.json');

const THEME =
  'Разработка веб-платформы мониторинга и аналитики дорожного движения «FluxLane» (г. Смоленск)';

/** Точная замена по индексу (приоритет над map). */
const byIndex = {
  5: THEME,
  7: 'Саргсян Р.А.',
  17: 'Зимина Е.А.',
};

/** Точная замена по полному тексту абзаца шаблона. */
const byExact = require('./kursovaya-fluxlane-by-exact.json');

/** Перенос длинных URL в списке литературы (Word Online не рвёт строку без разрывов). */
function formatBibliographyForWord(text) {
  if (!text.includes('URL:') || !text.includes('http')) return text;
  const wrapped = text.replace(
    /^(.+?\])\.\s+—\s+URL:\s+(https?:\/\/\S+)\s+\((дата обращения:[^)]+)\)\.?$/,
    '$1.\n— URL: $2\n($3).'
  );
  return softBreakUrl(wrapped);
}

function softBreakUrl(text) {
  return text.replace(/(https?:\/\/[^\s)]+)/g, (url) =>
    url.replace(/\//g, '/\u200B').replace(/\./g, '.\u200B')
  );
}

const out = template.map((text, i) => {
  if (byIndex[i] !== undefined) return byIndex[i];
  if (byExact[text]) return byExact[text];
  return text
    .replace(/Studio/g, 'FluxLane')
    .replace(/web-редактор/g, 'веб-платформу «FluxLane»')
    .replace(/визуального создания сайтов/g, 'мониторинга дорожного движения')
    .replace(/визуальных конструкторов сайтов/g, 'информационных систем мониторинга транспорта')
    .replace(/создания и редактирования сайта/g, 'работы с платформой FluxLane')
    .replace(/создания сайта/g, 'использования платформы FluxLane')
    .replace(/информационной системы Studio/g, 'информационной системы FluxLane')
    .replace(/платформы Studio/g, 'платформы FluxLane')
    .replace(/программного продукта Studio/g, 'программного продукта FluxLane')
    .replace(/работы Studio/g, 'работы FluxLane')
    .replace(/алгоритма работы Studio/g, 'алгоритма работы FluxLane')
    .replace(/Документация Go \[Электронный ресурс\].*/, 'Документация Express [Электронный ресурс]. — URL: https://expressjs.com/ (дата обращения: 21.10.2026).')
    .replace(/Документация React \[Электронный ресурс\].*/, 'Документация Leaflet [Электронный ресурс]. — URL: https://leafletjs.com/reference.html (дата обращения: 21.10.2026).')
    .replace(/Документация TypeScript \[Электронный ресурс\].*/, 'Документация Sequelize [Электронный ресурс]. — URL: https://sequelize.org/docs/v6/ (дата обращения: 11.10.2026).')
    .replace(/Документация Vite \[Электронный ресурс\].*/, 'Документация Chart.js [Электронный ресурс]. — URL: https://www.chartjs.org/docs/latest/ (дата обращения: 23.10.2026).');
}).map((text) => formatBibliographyForWord(text));

fs.writeFileSync(path.join(__dirname, 'kursovaya-fluxlane-texts.json'), JSON.stringify(out, null, 2), 'utf8');
console.log('Written', out.length, 'paragraphs');
