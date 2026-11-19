/** Одноразово скачивает фотообложки с Wikimedia Commons (свободные лицензии). */
const fs = require('fs');
const https = require('https');
const path = require('path');

const DIR = path.join(process.cwd(), 'assets', 'images', 'news');
const UA = 'FluxLaneSeed/1.0 (local educational site; news covers)';

const FILES = {
  'cover-roads-2024.jpg': 'Colorado_State_Highway_71.jpg',
  'cover-asphalt-2025.jpg': 'AF-asphalt-laying-machine.jpg',
  'cover-highway-budget.jpg': 'HWY407_asphalt-concrete.jpg',
  'cover-long-repair.jpg': 'Roadtec_RP-190_Highway_Class_Asphalt_Pavel.jpg',
  'cover-regional-road.jpg': 'Forest_road_Slavne_2017_G8.jpg',
  'cover-yard-roads.jpg': 'Asphalt_P2160056.jpg',
  'cover-bridge.jpg': 'Interstate_25_Highway_Bridge_with_Asphalt_Overlay.jpg',
  'cover-traffic-safety.jpg': 'Asphalt_(2686070942).jpg',
  'cover-project-vyazma.jpg': 'Forest_and_Frith_,_Country_Road_-_geograph.org.uk_-_6686570.jpg',
  'cover-project-roslavl.jpg': 'Kabul-Kandahar_Highway_in_2003.jpg',
  'cover-project-yartsevo.jpg': 'AF-asphalt-layer.jpg',
  'cover-project-rudnya.jpg': 'Warm_mix_asphalt_(39332704701).jpg',
  'cover-project-sovetskaya.jpg': 'Asphalt_Removed_(6147471005).jpg'
};

function fileUrl(name) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=1280`;
}

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode === 429 && redirects < 6) {
        res.resume();
        const wait = 4000 * (redirects + 1);
        setTimeout(() => resolve(download(url, dest, redirects + 1)), wait);
        return;
      }
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects > 6) return reject(new Error('too many redirects'));
        const next = new URL(res.headers.location, url).href;
        return resolve(download(next, dest, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`${res.statusCode} ${url}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(fs.statSync(dest).size)));
    });
    req.on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  for (const [name, remote] of Object.entries(FILES)) {
    const dest = path.join(DIR, name);
    const size = await download(fileUrl(remote), dest);
    console.log(name, size);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
