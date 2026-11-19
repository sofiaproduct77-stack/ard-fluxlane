const fs = require('fs');
const t = require('./kursovaya-template-texts.json');
let s = '';
t.forEach((x, i) => {
  if (x.length > 80) s += `### ${i}\n${x}\n\n`;
});
fs.writeFileSync(__dirname + '/kursovaya-long-paras.md', s);
