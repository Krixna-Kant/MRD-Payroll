const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'renderer', 'js');
const files = fs.readdirSync(dir);

files.forEach(file => {
  if (file.endsWith('.js')) {
    const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (line.includes('wa.me')) {
        console.log(`[${file}:${index + 1}] ${line.trim()}`);
      }
    });
  }
});
