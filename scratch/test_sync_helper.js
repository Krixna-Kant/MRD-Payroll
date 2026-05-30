// Mock electron for Node.js environment
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'electron') {
    return {
      app: {
        getPath: (type) => {
          if (type === 'userData') return 'C:\\Users\\a\\AppData\\Roaming\\LocalPayroll';
          return '';
        }
      },
      dialog: {
        showMessageBoxSync: () => 1 // Simulate Force Open
      }
    };
  }
  return originalRequire.apply(this, arguments);
};

const path = require('path');
const fs = require('fs');
const syncHelper = require('../src/utils/syncHelper');

console.log('--- Testing Sync Helper ---');

// 1. Check OneDrive path resolution
const odPath = syncHelper.getOneDrivePath();
console.log('OneDrive Path resolved to:', odPath);

// 2. Check Database path resolution
const { resolveDbPath } = require('../src/database/db');
const dbPath = resolveDbPath();
console.log('Database Path resolved to:', dbPath);

// 3. Test Session Locking (dry run or sandbox)
if (odPath) {
  const testLockDir = path.join(odPath, 'MRD ERP');
  const lockFilePath = path.join(testLockDir, 'session.lock');
  
  console.log('Simulating Session Lock Acquire...');
  // Mock dialog
  const mockApp = { quit: () => console.log('Mock App quit called') };
  const mockDialog = { showMessageBoxSync: () => {
    console.log('Dialog prompt shown.');
    return 1; // Force Open
  }};
  
  // Clean up any existing lock for testing
  if (fs.existsSync(lockFilePath)) {
    fs.unlinkSync(lockFilePath);
  }
  
  syncHelper.acquireSessionLock(mockApp, mockDialog);
  console.log('Lock file exists:', fs.existsSync(lockFilePath));
  if (fs.existsSync(lockFilePath)) {
    console.log('Lock content:', fs.readFileSync(lockFilePath, 'utf8'));
  }
  
  console.log('Releasing Session Lock...');
  syncHelper.releaseSessionLock();
  console.log('Lock file exists after release:', fs.existsSync(lockFilePath));
} else {
  console.log('OneDrive not available, skipping session lock tests.');
}

console.log('--- Tests completed successfully ---');
