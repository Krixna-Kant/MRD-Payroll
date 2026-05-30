const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const dbPath = fs.existsSync('D:\\') ? 'D:\\LocalPayroll\\payroll.db' : path.join(os.homedir(), 'AppData', 'Roaming', 'local-payroll', 'payroll.db');
console.log('Using DB Path:', dbPath);

const db = new Database(dbPath);

try {
  const date = '2026-05-22';
  const satStr = '2026-05-23'; // example
  const monStr = '2026-05-25'; // example
  const isSun = false;

  const query = `
    SELECT e.id, e.name, e.phone, e.role, e.joining_date,
           a.status, a.notes, a.id as attendance_id,
           a.in_time, a.out_time, a.overtime_hours, a.is_sunday_work, a.site_name, a.project_id, a.is_finalized,
           a.extra_shift_type, a.extra_in, a.extra_out, a.extra_notes,
           (SELECT status FROM attendance WHERE employee_id = e.id AND date = date(?, '-1 day')) AS yesterday_status
           ${isSun ? `, (SELECT status FROM attendance WHERE employee_id = e.id AND date = ?) AS sat_status, (SELECT status FROM attendance WHERE employee_id = e.id AND date = ?) AS mon_status` : ''}
    FROM employees e
    LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?
    WHERE e.status = 'active'
      AND (e.joining_date IS NULL OR e.joining_date <= ?)
    ORDER BY e.name ASC
  `;
  
  const params = isSun ? [date, satStr, monStr, date, date] : [date, date, date];
  
  console.log('Query:', query);
  console.log('Params:', params);
  
  const rows = db.prepare(query).all(...params);
  console.log(`Success! Found ${rows.length} rows.`);
  if (rows.length > 0) {
    console.log('Sample row:', rows[0]);
  }
} catch (err) {
  console.error('Query failed:', err);
} finally {
  db.close();
}

process.exit(0);
