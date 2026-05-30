const fs = require('fs');
const path = require('path');

const srcDir = 'C:\\Users\\a\\Downloads\\LocalPayroll-Deepanshu\\LocalPayroll';
const destDir = 'C:\\Users\\a\\OneDrive\\LocalPayroll';

const FILES_TO_COPY = [
  'main.js',
  'preload.js',
  'src/database/db.js',
  'src/utils/syncHelper.js',
  'src/ipc/sync.js',
  'src/ipc/backup.js',
  'renderer/js/app.js',
  'renderer/js/api.js',
  'scratch_pack.js',
  'update_pc_2.bat'
];

console.log('--- Copying updated source files to OneDrive folder ---');

if (!fs.existsSync(destDir)) {
  console.error(`Destination OneDrive source directory does not exist: ${destDir}`);
  process.exit(1);
}

FILES_TO_COPY.forEach(f => {
  const srcFile = path.join(srcDir, f);
  const destFile = path.join(destDir, f);
  
  if (fs.existsSync(srcFile)) {
    // Ensure destination subdirectories exist
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    
    // Copy
    fs.copyFileSync(srcFile, destFile);
    console.log(`Copied: ${f} -> ${destFile}`);
  } else {
    console.warn(`WARNING: Source file does not exist: ${srcFile}`);
  }
});

console.log('--- Copy completed successfully ---');
