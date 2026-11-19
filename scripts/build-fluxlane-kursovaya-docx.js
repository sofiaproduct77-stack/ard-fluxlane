/**
 * Сборка пояснительной FluxLane: копия шаблона + замена текста без разрушения разметки (Word Online).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TEMPLATE =
  process.env.KURSOVAYA_TEMPLATE ||
  'C:/Users/dtro2/Downloads/Курсовая_веб_сайт_редактор_Сиваков_Иван_Андреевич22222.docx';
const OUT =
  process.env.KURSOVAYA_OUT ||
  'C:/Users/dtro2/Downloads/Kursovaya_FluxLane_poyasnitelnaya.docx';

const templateTexts = require('./kursovaya-template-texts.json');
const fluxlaneTexts = require('./kursovaya-fluxlane-texts.json');

if (templateTexts.length !== fluxlaneTexts.length) {
  console.error('Length mismatch:', templateTexts.length, fluxlaneTexts.length);
  process.exit(1);
}

const work = path.join(__dirname, '_kursovaya_work');
const unpacked = path.join(work, 'unpacked');
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(unpacked, { recursive: true });

const zipCopy = path.join(work, 'doc.zip');
fs.copyFileSync(TEMPLATE, zipCopy);
execSync(
  `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipCopy.replace(/'/g, "''")}' -DestinationPath '${unpacked.replace(/'/g, "''")}' -Force"`,
  { stdio: 'inherit' }
);

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Первый w:r целиком (шаблон стиля списка / гиперссылок). */
function firstRunTemplate(inner) {
  const m = inner.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/);
  return m ? m[0] : '<w:r><w:t xml:space="preserve"></w:t></w:r>';
}

function runWithText(runXml, text) {
  const escaped = escapeXml(text);
  if (/<w:t[\s>]/.test(runXml)) {
    return runXml.replace(
      /<w:t(\s+xml:space="preserve")?\s*>([^<]*)<\/w:t>/,
      `<w:t xml:space="preserve">${escaped}</w:t>`
    );
  }
  return runXml.replace('</w:r>', `<w:t xml:space="preserve">${escaped}</w:t></w:r>`);
}

/** Меняет текст абзаца; \\n — мягкий перенос строки Word (w:br). */
function updateParagraphTextPreserve(inner, newText) {
  const pPrMatch = inner.match(/^([\s\S]*?<\/w:pPr>)/);
  const pPr = pPrMatch ? pPrMatch[1] : '';
  const body = pPrMatch ? inner.slice(pPrMatch[0].length) : inner;
  const runTpl = firstRunTemplate(body);

  if (newText.includes('\n')) {
    const lines = newText.split('\n');
    const runs = lines
      .map((line, i) => {
        const r = runWithText(runTpl, line);
        return i < lines.length - 1 ? r + '<w:r><w:br/></w:r>' : r;
      })
      .join('');
    return pPr + runs;
  }

  const parts = [];
  const re = /<w:t(\s+xml:space="preserve")?\s*>([^<]*)<\/w:t>/g;
  let m;
  let found = false;
  let first = true;
  while ((m = re.exec(inner)) !== null) {
    found = true;
    const preserve = m[1] ? ' xml:space="preserve"' : '';
    const val = first ? escapeXml(newText) : '';
    first = false;
    parts.push({ start: m.index, end: re.lastIndex, repl: `<w:t${preserve}>${val}</w:t>` });
  }
  if (!found) return inner;
  let out = inner;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    out = out.slice(0, p.start) + p.repl + out.slice(p.end);
  }
  return out;
}

const docPath = path.join(unpacked, 'word/document.xml');
let xml = fs.readFileSync(docPath, 'utf8');

const parts = xml.split(/(?=<w:p[ >])/);
let textIdx = 0;
const rebuilt = [];

for (let i = 1; i < parts.length; i++) {
  const chunk = parts[i];
  const end = chunk.indexOf('</w:p>');
  if (end === -1) {
    rebuilt.push(chunk);
    continue;
  }
  const inner = chunk.slice(0, end);
  const tail = chunk.slice(end);
  const texts = [...inner.matchAll(/<w:t(?: xml:space="preserve")?>([^<]*)<\/w:t>/g)].map(
    (m) => m[1]
  );
  const joined = texts.join('');
  let newInner = inner;
  if (joined.trim()) {
    const replacement = fluxlaneTexts[textIdx];
    if (replacement !== undefined && replacement !== joined) {
      newInner = updateParagraphTextPreserve(inner, replacement);
    }
    textIdx++;
  }
  rebuilt.push(newInner + tail);
}

xml = parts[0] + rebuilt.join('');
fs.writeFileSync(docPath, xml, 'utf8');

fs.copyFileSync(TEMPLATE, OUT);

const psUpdate = path.join(work, 'inject-document.ps1');
fs.writeFileSync(
  psUpdate,
  `
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$dest = '${OUT.replace(/\\/g, '/')}'
$docPath = '${docPath.replace(/\\/g, '/')}'
$zip = [System.IO.Compression.ZipFile]::Open($dest, [System.IO.Compression.ZipArchiveMode]::Update)
$old = $zip.GetEntry('word/document.xml')
if ($old) { $old.Delete() }
$entry = $zip.CreateEntry('word/document.xml', [System.IO.Compression.CompressionLevel]::Optimal)
$in = [System.IO.File]::OpenRead($docPath)
$out = $entry.Open()
$in.CopyTo($out)
$out.Close()
$in.Close()
$zip.Dispose()
Write-Host "Updated word/document.xml in" $dest
`,
  'utf8'
);

execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psUpdate}"`, { stdio: 'inherit' });
console.log('Paragraphs replaced:', textIdx);
console.log('Output:', OUT);
