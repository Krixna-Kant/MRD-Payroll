const fs = require('fs');
let s = fs.readFileSync('renderer/js/attendance.js', 'utf8');

const searchStr = `    document.getElementById('att-mode-bulk')?  /* ── BULK DAILY MODE ─────────────────────────────────────────────────────── */
  async function initBulk() {`;

const replaceStr = `    document.getElementById('att-mode-bulk')?.addEventListener('click', () => { _mode = 'bulk'; init(); });
    document.getElementById('att-mode-monthly')?.addEventListener('click', () => { _mode = 'monthly'; init(); });

    if (_mode === 'bulk') await initBulk();
    else await initMonthly();
  }

  /* ── BULK DAILY MODE ─────────────────────────────────────────────────────── */
  async function initBulk() {`;

s = s.replace(searchStr, replaceStr);
fs.writeFileSync('renderer/js/attendance.js', s);
console.log('Fixed attendance syntax!');
