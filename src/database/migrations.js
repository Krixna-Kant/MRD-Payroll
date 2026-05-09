/**
 * LocalPayroll - Database Migrations
 * Creates all tables and indexes on first run.
 * Uses IF NOT EXISTS for idempotent execution (safe to run every startup).
 *
 * MONEY NOTE: All financial amounts are stored as INTEGERS in paisa (1/100 of ₹).
 *   ₹10,000  → stored as 1,000,000 (paisa)
 *   Divide by 100 only in the UI layer, never in DB queries.
 */

const { getDB } = require('./db');
const bcrypt = require('bcryptjs');

function runMigrations() {
  const db = getDB();

  db.exec(`
    -- ─────────────────────────────────────────────────────────────────────
    -- USERS (multi-user support with role-based access)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      username             TEXT    UNIQUE NOT NULL,
      password_hash        TEXT    NOT NULL,
      full_name            TEXT,
      role                 TEXT    NOT NULL DEFAULT 'staff', -- 'admin' | 'staff'
      must_change_password INTEGER NOT NULL DEFAULT 0,       -- 1 = force change on next login
      created_at           INTEGER DEFAULT (strftime('%s', 'now'))
    );

    -- ─────────────────────────────────────────────────────────────────────
    -- EMPLOYEES
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS employees (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      phone        TEXT,
      role         TEXT,
      salary       INTEGER NOT NULL DEFAULT 0, -- IN PAISA
      joining_date TEXT,                        -- YYYY-MM-DD
      status       TEXT    NOT NULL DEFAULT 'active', -- 'active' | 'inactive'
      balance      INTEGER NOT NULL DEFAULT 0, -- RUNNING BALANCE IN PAISA (Positive = Pending, Negative = Advance)
      notes        TEXT,
      created_at   INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at   INTEGER DEFAULT (strftime('%s', 'now'))
    );

    -- ─────────────────────────────────────────────────────────────────────
    -- LEDGER (Transaction history for running balance)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS ledger (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id      INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      type             TEXT    NOT NULL, -- 'ADVANCE', 'SALARY', 'PAYMENT', 'ADJUSTMENT'
      amount           INTEGER NOT NULL, -- IN PAISA (signed)
      running_balance  INTEGER NOT NULL, -- IN PAISA (balance AFTER this tx)
      date             TEXT    NOT NULL, -- YYYY-MM-DD
      month            INTEGER,
      year             INTEGER,
      notes            TEXT,
      reference_id     INTEGER,          -- ID of related advance/payment record
      created_at       INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_emp_date ON ledger(employee_id, date);

    -- ─────────────────────────────────────────────────────────────────────
    -- ATTENDANCE
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS attendance (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      date        TEXT    NOT NULL, -- YYYY-MM-DD
      status      TEXT    NOT NULL DEFAULT 'P', -- 'P' | 'A' | 'H'
      notes       TEXT,
      marked_by   INTEGER REFERENCES users(id),
      created_at  INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(employee_id, date)
    );

    -- Compound index: makes monthly attendance queries lightning fast
    CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id, date);
    CREATE INDEX IF NOT EXISTS idx_attendance_date     ON attendance(date);

    -- ─────────────────────────────────────────────────────────────────────
    -- ADVANCES (cash/UPI/bank given before salary)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS advances (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      amount      INTEGER NOT NULL, -- IN PAISA
      mode        TEXT    NOT NULL DEFAULT 'Cash', -- 'Cash' | 'UPI' | 'Bank'
      date        TEXT    NOT NULL, -- YYYY-MM-DD
      month       INTEGER,          -- salary month this advance is against (1–12)
      year        INTEGER,
      notes       TEXT,
      created_by  INTEGER REFERENCES users(id),
      created_at  INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_advances_emp        ON advances(employee_id);
    CREATE INDEX IF NOT EXISTS idx_advances_month_year ON advances(employee_id, month, year);

    -- ─────────────────────────────────────────────────────────────────────
    -- PAYMENTS (monthly salary record per employee)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS payments (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id       INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      month             INTEGER NOT NULL, -- 1–12
      year              INTEGER NOT NULL,
      gross_salary      INTEGER NOT NULL, -- IN PAISA (full month salary)
      attendance_days   REAL    DEFAULT 0, -- P + 0.5*H
      total_days        INTEGER DEFAULT 26, -- working days denominator
      use_attendance    INTEGER DEFAULT 0,  -- 1 = prorate by attendance
      effective_salary  INTEGER NOT NULL,  -- IN PAISA (after attendance prorate)
      advance_deducted  INTEGER DEFAULT 0, -- IN PAISA
      other_deductions  INTEGER DEFAULT 0, -- IN PAISA
      net_paid          INTEGER NOT NULL,  -- IN PAISA (what employee gets)
      mode              TEXT    NOT NULL DEFAULT 'Cash', -- 'Cash' | 'UPI' | 'Bank'
      payment_date      TEXT,              -- YYYY-MM-DD
      notes             TEXT,
      status            TEXT    NOT NULL DEFAULT 'pending', -- 'pending' | 'paid'
      created_by        INTEGER REFERENCES users(id),
      created_at        INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(employee_id, month, year)
    );

    CREATE INDEX IF NOT EXISTS idx_payments_emp        ON payments(employee_id);
    CREATE INDEX IF NOT EXISTS idx_payments_month_year ON payments(month, year);

    -- ─────────────────────────────────────────────────────────────────────
    -- SETTINGS (key-value store for app config)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
    -- ─────────────────────────────────────────────────────────────────────
    -- ATTENDANCE AUDIT (Tracking changes for integrity)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS attendance_audit (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      date         TEXT    NOT NULL, -- YYYY-MM-DD
      old_status   TEXT,
      new_status   TEXT,
      action_type  TEXT    NOT NULL, -- 'RESET', 'EDIT'
      changed_by   INTEGER REFERENCES users(id),
      timestamp    INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_att_audit_date ON attendance_audit(date);

    -- ─────────────────────────────────────────────────────────────────────
    -- STAFF DOCUMENTS
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS staff_documents (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id      INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      document_name    TEXT    NOT NULL,
      document_type    TEXT    NOT NULL, -- 'Aadhaar', 'PAN', etc.
      category         TEXT    NOT NULL, -- 'Identity', 'Bank', etc.
      file_path        TEXT    NOT NULL,
      file_size        INTEGER,
      upload_date      TEXT    NOT NULL, -- YYYY-MM-DD
      expiry_date      TEXT,              -- YYYY-MM-DD
      ocr_status       TEXT    NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed'
      ocr_data         TEXT,              -- JSON string
      created_at       INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_staff_docs_emp ON staff_documents(employee_id);

    -- ─────────────────────────────────────────────────────────────────────
    -- LEAVES
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS leaves (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id      INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      type             TEXT    NOT NULL, -- 'CL', 'SL', 'LWP'
      from_date        TEXT    NOT NULL, -- YYYY-MM-DD
      to_date          TEXT    NOT NULL, -- YYYY-MM-DD
      total_days       REAL    NOT NULL,
      reason           TEXT,
      status           TEXT    NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
      attachment_path  TEXT,
      created_by       INTEGER REFERENCES users(id),
      created_at       INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at       INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_leaves_emp ON leaves(employee_id);

    -- ─────────────────────────────────────────────────────────────────────
    -- EXPENSES
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS expenses (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id      INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      project_name     TEXT,
      category         TEXT    NOT NULL, -- 'Travel', 'Food', 'Material', 'Fuel', 'Accommodation', 'Miscellaneous'
      amount           INTEGER NOT NULL, -- IN PAISA
      date             TEXT    NOT NULL, -- YYYY-MM-DD
      remarks          TEXT,
      status           TEXT    NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
      attachment_path  TEXT,
      payment_id       INTEGER REFERENCES payments(id) ON DELETE SET NULL, -- Track reimbursement
      created_by       INTEGER REFERENCES users(id),
      created_at       INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at       INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_emp ON expenses(employee_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_payment ON expenses(payment_id);

    -- ─────────────────────────────────────────────────────────────────────
    -- PROJECTS (Project Master)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS projects (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      name                TEXT NOT NULL,
      client_name         TEXT,
      code                TEXT,
      site_address        TEXT,
      start_date          TEXT,
      end_date            TEXT,
      status              TEXT DEFAULT 'Upcoming', -- Upcoming, Ongoing, Completed, On Hold, Delayed
      supervisor_name     TEXT,
      contact_number      TEXT,
      revenue             INTEGER DEFAULT 0, -- In Paisa
      progress            INTEGER DEFAULT 0, -- 0-100
      current_stage       TEXT,
      delay_reason        TEXT,
      expected_completion TEXT,
      notes               TEXT,
      created_by          INTEGER REFERENCES users(id),
      created_at          INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at          INTEGER DEFAULT (strftime('%s', 'now'))
    );

    -- ─────────────────────────────────────────────────────────────────────
    -- SITE REPORTS (Daily progress updates)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS site_reports (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      date            TEXT NOT NULL, -- YYYY-MM-DD
      supervisor_name TEXT,
      work_done       TEXT,
      manpower_count  INTEGER DEFAULT 0,
      ot_details      TEXT,
      issues          TEXT,
      material_used   TEXT,
      photos          TEXT, -- JSON Array of paths
      created_at      INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at      INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_site_reports_project ON site_reports(project_id);
    CREATE INDEX IF NOT EXISTS idx_site_reports_date ON site_reports(date);

    -- ─────────────────────────────────────────────────────────────────────
    -- ACTIVITY LOGS (Audit Trail)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS activity_logs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER,
      user_name       TEXT,
      module          TEXT NOT NULL,
      action          TEXT NOT NULL,
      old_value       TEXT,
      new_value       TEXT,
      description     TEXT,
      device_info     TEXT,
      timestamp       TEXT DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_activity_logs_module ON activity_logs(module);

    -- ─────────────────────────────────────────────────────────────────────
    -- ALERTS & REMINDERS
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS alerts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT NOT NULL,
      message         TEXT NOT NULL,
      type            TEXT NOT NULL DEFAULT 'Info', -- Critical, Warning, Info, Success
      module          TEXT NOT NULL,
      is_read         INTEGER DEFAULT 0,
      user_id         INTEGER, -- Optional, if assigned to specific user
      created_at      TEXT DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(is_read);
  `);
  // ── Migration: Add attendance time/project tracking columns ───────────────
  // Safe column additions — only add if they don't exist
  const attCols = db.prepare(`PRAGMA table_info(attendance)`).all().map(c => c.name);
  if (!attCols.includes('check_in')) {
    db.exec(`ALTER TABLE attendance ADD COLUMN check_in TEXT`);
    console.log('[DB] Added attendance.check_in column');
  }
  if (!attCols.includes('check_out')) {
    db.exec(`ALTER TABLE attendance ADD COLUMN check_out TEXT`);
    console.log('[DB] Added attendance.check_out column');
  }
  if (!attCols.includes('overtime_hours')) {
    db.exec(`ALTER TABLE attendance ADD COLUMN overtime_hours REAL DEFAULT 0`);
    console.log('[DB] Added attendance.overtime_hours column');
  }
  if (!attCols.includes('is_sunday_work')) {
    db.exec(`ALTER TABLE attendance ADD COLUMN is_sunday_work INTEGER DEFAULT 0`);
    console.log('[DB] Added attendance.is_sunday_work column');
  }
  if (!attCols.includes('project_name')) {
    db.exec(`ALTER TABLE attendance ADD COLUMN project_name TEXT`);
    console.log('[DB] Added attendance.project_name column');
  }
  if (!attCols.includes('project_id')) {
    db.exec(`ALTER TABLE attendance ADD COLUMN project_id INTEGER`);
    console.log('[DB] Added attendance.project_id column');
  }

  // ── Migration: Allowances & Salary updates ─────────────────────────────────
  const expCols = db.prepare(`PRAGMA table_info(expenses)`).all().map(c => c.name);
  if (expCols.length > 0 && !expCols.includes('project_id')) {
    db.exec(`ALTER TABLE expenses ADD COLUMN project_id INTEGER`);
    console.log('[DB] Added expenses.project_id column');
  }

  const empCols = db.prepare(`PRAGMA table_info(employees)`).all().map(c => c.name);
  if (!empCols.includes('fixed_gross_salary')) {
    db.exec(`ALTER TABLE employees ADD COLUMN fixed_gross_salary INTEGER DEFAULT 0`);
    console.log('[DB] Added employees.fixed_gross_salary column');
  }

  if (!empCols.includes('aadhaar_no')) {
    db.exec(`ALTER TABLE employees ADD COLUMN aadhaar_no TEXT`);
  }
  if (!empCols.includes('pan_no')) {
    db.exec(`ALTER TABLE employees ADD COLUMN pan_no TEXT`);
  }
  if (!empCols.includes('dob')) {
    db.exec(`ALTER TABLE employees ADD COLUMN dob TEXT`);
  }
  if (!empCols.includes('gender')) {
    db.exec(`ALTER TABLE employees ADD COLUMN gender TEXT`);
  }
  if (!empCols.includes('address')) {
    db.exec(`ALTER TABLE employees ADD COLUMN address TEXT`);
  }
  if (!empCols.includes('bank_name')) {
    db.exec(`ALTER TABLE employees ADD COLUMN bank_name TEXT`);
  }
  if (!empCols.includes('account_no')) {
    db.exec(`ALTER TABLE employees ADD COLUMN account_no TEXT`);
  }
  if (!empCols.includes('ifsc_code')) {
    db.exec(`ALTER TABLE employees ADD COLUMN ifsc_code TEXT`);
  }
  if (!empCols.includes('father_name')) {
    db.exec(`ALTER TABLE employees ADD COLUMN father_name TEXT`);
  }
  if (!empCols.includes('account_holder_name')) {
    db.exec(`ALTER TABLE employees ADD COLUMN account_holder_name TEXT`);
  }

  const payCols = db.prepare(`PRAGMA table_info(payments)`).all().map(c => c.name);
  if (!payCols.includes('food_allowance')) {
    db.exec(`ALTER TABLE payments ADD COLUMN food_allowance INTEGER DEFAULT 0`);
    console.log('[DB] Added payments.food_allowance column');
  }
  if (!payCols.includes('travel_allowance')) {
    db.exec(`ALTER TABLE payments ADD COLUMN travel_allowance INTEGER DEFAULT 0`);
    console.log('[DB] Added payments.travel_allowance column');
  }
  if (!payCols.includes('present_days')) {
    db.exec(`ALTER TABLE payments ADD COLUMN present_days REAL DEFAULT 0`);
  }
  if (!payCols.includes('half_days')) {
    db.exec(`ALTER TABLE payments ADD COLUMN half_days REAL DEFAULT 0`);
  }
  if (!payCols.includes('absent_days')) {
    db.exec(`ALTER TABLE payments ADD COLUMN absent_days REAL DEFAULT 0`);
  }
  if (!payCols.includes('wo_days')) {
    db.exec(`ALTER TABLE payments ADD COLUMN wo_days REAL DEFAULT 0`);
  }
  if (!payCols.includes('overtime_hours')) {
    db.exec(`ALTER TABLE payments ADD COLUMN overtime_hours REAL DEFAULT 0`);
  }
  if (!payCols.includes('overtime_pay')) {
    db.exec(`ALTER TABLE payments ADD COLUMN overtime_pay INTEGER DEFAULT 0`);
  }

  // ── Migration: Add balance column if missing (for existing DBs) ───────────
  if (!empCols.includes('balance')) {
    db.exec(`ALTER TABLE employees ADD COLUMN balance INTEGER DEFAULT 0`);
    console.log('[DB] Added employees.balance column');
  }

  const payCols2 = db.prepare(`PRAGMA table_info(payments)`).all().map(c => c.name);
  if (!payCols2.includes('salary_earned')) {
    db.exec(`ALTER TABLE payments ADD COLUMN salary_earned INTEGER DEFAULT 0`);
    console.log('[DB] Added payments.salary_earned column');
  }
  if (!payCols2.includes('opening_balance')) {
    db.exec(`ALTER TABLE payments ADD COLUMN opening_balance INTEGER DEFAULT 0`);
    console.log('[DB] Added payments.opening_balance column');
  }
  if (!payCols2.includes('reimbursed_expenses')) {
    db.exec(`ALTER TABLE payments ADD COLUMN reimbursed_expenses INTEGER DEFAULT 0`);
    console.log('[DB] Added payments.reimbursed_expenses column');
  }

  // ── Migration: Create ledger table if missing (for existing DBs) ──────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS ledger (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id      INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      type             TEXT    NOT NULL,
      amount           INTEGER NOT NULL,
      running_balance  INTEGER NOT NULL,
      date             TEXT    NOT NULL,
      month            INTEGER,
      year             INTEGER,
      notes            TEXT,
      reference_id     INTEGER,
      created_at       INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  // ── Migration: Seed default settings ───────────────────────────────────────
  const initSetting = (k, v) => db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`).run(k, v);
  initSetting('company_name', 'My Payroll Co.');
  initSetting('office_start_time', '09:00');
  initSetting('office_end_time', '18:00');
  initSetting('sunday_pay_multiplier', '2.0');
  initSetting('projects_list', JSON.stringify(['Head Office', 'Site A', 'Site B']));

  // ── Seed default admin user if no users exist ────────────────────────────
  const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, must_change_password)
      VALUES ('admin', ?, 'Administrator', 'admin', 1)
    `).run(hash);
    console.log('[DB] Default admin user created (admin / admin123)');
  }

  // ── Default settings ─────────────────────────────────────────────────────
  const setDefault = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  setDefault.run('working_days_per_month', '26');
  setDefault.run('company_name', 'My Company');
  setDefault.run('use_attendance_for_salary', '0');
  setDefault.run('office_start_time', '09:00');
  setDefault.run('office_end_time', '18:00');
  setDefault.run('sunday_pay_multiplier', '2');
  setDefault.run('enable_sunday_ot', '1');
  setDefault.run('enable_weekly_off', '1');

  console.log('[DB] Migrations complete.');
}

module.exports = { runMigrations };
