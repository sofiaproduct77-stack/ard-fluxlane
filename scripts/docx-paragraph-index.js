const fs = require('fs');
const path = require('path');
const xml = fs.readFileSync(process.argv[2], 'utf8');
const paras = xml.split(/<w:p[ >]/).slice(1);
const out = paras.map((p, i) => {
  const texts = [...p.matchAll(/<w:t(?: xml:space="preserve")?>([^<]*)<\/w:t>/g)].map((m) => m[1]);
  const styleMatch = p.match(/<w:pStyle w:val="([^"]+)"/);
  return { i, style: styleMatch ? styleMatch[1] : '', text: texts.join('') };
});
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 2), 'utf8');
console.log('paragraphs', out.length);
