const path = require('path');
const fs = require('fs');

process.chdir(__dirname);

try {
  require(path.join(__dirname, 'server.js'));
} catch (err) {
  fs.appendFileSync(
    path.join(__dirname, 'tmp', 'passenger-error.log'),
    `${new Date().toISOString()}\n${err.stack}\n\n`
  );
  throw err;
}
