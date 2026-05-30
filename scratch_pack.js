/**
 * scratch_pack.js — Fast Deploy Script
 * 
 * Strategy: Extract existing deployed asar → patch changed files → repack → deploy
 * This avoids copying node_modules (300MB+) every time, making deploys ~30s instead of hanging.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcDir   = 'C:\\Users\\a\\Downloads\\LocalPayroll-Deepanshu\\LocalPayroll';
const destAsar = 'C:\\Users\\a\\OneDrive\\LocalPayroll\\dist\\win-unpacked\\resources\\app.asar';
const backupAsar = 'C:\\Users\\a\\OneDrive\\LocalPayroll\\dist\\win-unpacked\\resources\\app.asar.bak';
const tempExtract = path.join(srcDir, 'temp_extract_pack');
const newAsar  = path.join(srcDir, 'app_new.asar');
const asarBin  = path.join(srcDir, 'node_modules', 'asar', 'bin', 'asar.js');

// Source files to patch in (relative to srcDir)
const FILES_TO_PATCH = [
  'renderer/js/accommodation.js',
  'renderer/js/app.js',
  'renderer/js/api.js',
  'renderer/js/attendance.js',
  'renderer/js/staff_docs.js',
  'renderer/js/payments.js',
  'renderer/js/performance.js',
  'renderer/js/performance_v2.js',
  'renderer/index.html',
  'renderer/css/main.css',
  'renderer/css/advances.css',
  'renderer/css/payments.css',
  'src/ipc/accommodation.js',
  'src/ipc/attendance.js',
  'src/ipc/staff_docs.js',
  'src/ipc/payments.js',
  'src/ipc/performance.js',
  'src/utils/pdf.js',
  'src/database/migrations.js',
  'src/database/db.js',
  'src/utils/syncHelper.js',
  'src/ipc/sync.js',
  'src/ipc/backup.js',
  'main.js',
  'preload.js',
  'renderer/js/settings.js',
  'src/ipc/employees.js',
  'src/ipc/expenses.js',
];

try {
  // 1. Clean temp extract dir
  if (fs.existsSync(tempExtract)) {
    console.log('Cleaning previous temp extract...');
    fs.rmSync(tempExtract, { recursive: true, force: true });
  }

  // 2. Extract existing deployed asar
  console.log('Extracting existing app.asar...');
  execSync(`node "${asarBin}" extract "${destAsar}" "${tempExtract}"`, { stdio: 'ignore' });
  console.log('Extraction complete.');

  // 3. Patch in updated source files
  console.log('Patching updated source files...');
  FILES_TO_PATCH.forEach(f => {
    const src  = path.join(srcDir, f);
    const dest = path.join(tempExtract, f);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      console.log('  Patched:', f);
    } else {
      console.warn('  WARNING - source not found:', f);
    }
  });

  // 4. Repack into new asar
  console.log('Repacking app.asar...');
  execSync(`node "${asarBin}" pack "${tempExtract}" "${newAsar}"`, { stdio: 'ignore' });
  console.log('Repack complete.');

  // 5. Backup and deploy
  const destPaths = [
    { asar: 'C:\\Users\\a\\OneDrive\\LocalPayroll\\dist\\win-unpacked\\resources\\app.asar', backup: 'C:\\Users\\a\\OneDrive\\LocalPayroll\\dist\\win-unpacked\\resources\\app.asar.bak' },
    { asar: 'D:\\LocalPayroll\\resources\\app.asar', backup: 'D:\\LocalPayroll\\resources\\app.asar.bak' }
  ];

  destPaths.forEach(paths => {
    if (fs.existsSync(paths.asar)) {
      try {
        fs.copyFileSync(paths.asar, paths.backup);
        console.log('Backed up existing app.asar at:', paths.asar);
      } catch (e) {
        console.warn('WARNING - failed to backup existing app.asar at:', paths.asar, e.message);
      }
      try {
        fs.copyFileSync(newAsar, paths.asar);
        const size = (fs.statSync(paths.asar).size / 1024 / 1024).toFixed(1);
        console.log(`Deployed! New app.asar at: ${paths.asar} (${size} MB)`);
      } catch (e) {
        console.error('ERROR - failed to deploy app.asar to:', paths.asar, e.message);
      }
    } else {
      console.log('Target path does not exist, skipping:', paths.asar);
    }
  });

} catch (err) {
  console.error('Error during packaging:', err.message);
} finally {
  // 6. Cleanup
  console.log('Cleaning up...');
  if (fs.existsSync(tempExtract)) fs.rmSync(tempExtract, { recursive: true, force: true });
  if (fs.existsSync(newAsar))     fs.unlinkSync(newAsar);
  console.log('Done.');
}
