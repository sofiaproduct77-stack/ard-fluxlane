const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [
  'monitoring.html',
  'events-map.html',
  'analytics.html',
  'traffic-analysis.html',
  'news.html',
  'news-detail.html',
  'services.html'
];

const navTrim = `\n                <a href="services.html">Услуги и заявки</a>\n                <a href="contacts.html">Контакты</a>\n                <a href="admin.html">Админ</a>`;
const mobileTrim = `\n        <a href="services.html">Услуги и заявки</a>\n        <a href="contacts.html">Контакты</a>\n        <a href="admin.html">Админ</a>`;

const footerBlock = `    <footer class="fx-footer">
        <div class="fx-footer-contacts" id="contacts" aria-label="Контакты">
            <h3 class="fx-footer-heading">Контакты</h3>
            <ul id="fx-footer-contacts-list" class="fx-footer-contact-list"></ul>
        </div>
        <div class="fx-footer-inner">
            <span>© <span id="y"></span> FluxLane</span>
            <span data-fx-footer-links></span>
        </div>
    </footer>`;

for (const f of files) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  let html = fs.readFileSync(p, 'utf8');
  html = html.split(navTrim).join('');
  html = html.split(mobileTrim).join('');
  if (!html.includes('fx-footer-contacts-list')) {
    html = html.replace(/<footer class="fx-footer">[\s\S]*?<\/footer>/, footerBlock);
  }
  if (!html.includes('platform-footer.js')) {
    html = html.replace(
      '<script src="src/platform-shell.js"></script>',
      '<script src="src/platform-shell.js"></script>\n    <script src="src/platform-footer.js"></script>'
    );
  }
  fs.writeFileSync(p, html);
  console.log('patched', f);
}

// redirect contacts page
const contactsPath = path.join(root, 'contacts.html');
if (fs.existsSync(contactsPath)) {
  fs.writeFileSync(
    contactsPath,
    `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=index.html#contacts"><title>Контакты</title></head><body><p><a href="index.html#contacts">Контакты в подвале сайта</a></p></body></html>`
  );
  console.log('contacts.html -> redirect');
}

console.log('done');
