const { getDB } = require('./src/database/db');
const { app } = require('electron');
const path = require('path');

// Mock Electron app for the DB script to work if needed
// Actually, it's easier to just try to get the DB path if it fails
try {
  const db = getDB();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  console.log('--- DB Check ---');
  const sample = db.prepare('SELECT date FROM attendance LIMIT 5').all();
  console.log('Sample dates:', sample);

  const monthlyTrends = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(now.getMonth() - i);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const mStr = String(m).padStart(2, '0');
    
    // Test both patterns
    const count1 = db.prepare(`SELECT COUNT(*) as n FROM attendance WHERE date LIKE ? AND status IN ('P', 'H')`).get(`${y}-${mStr}%`).n;
    const count2 = db.prepare(`SELECT COUNT(*) as n FROM attendance WHERE date LIKE ? AND status IN ('P', 'H')`).get(`%-${mStr}-${y}`).n;
    
    monthlyTrends.push({ month: mStr, year: y, pattern1: `${y}-${mStr}%`, count1, pattern2: `%-${mStr}-${y}`, count2 });
  }
  console.log('Monthly Trends Debug:', JSON.stringify(monthlyTrends, null, 2));

} catch (err) {
  console.error('Error:', err);
}
