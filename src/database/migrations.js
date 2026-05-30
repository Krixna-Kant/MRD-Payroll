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
      username             TEXT    UNIQUE NOT NULL COLLATE NOCASE,
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
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id   INTEGER NOT NULL,
      date          TEXT    NOT NULL, -- YYYY-MM-DD
      status        TEXT    NOT NULL, -- 'P', 'A', 'H', 'WO', 'LWP', 'CL', 'SL'
      in_time       TEXT,             -- HH:MM AM/PM
      out_time      TEXT,             -- HH:MM AM/PM
      
      -- Extra Shift Support (Night/Shutdown)
      extra_shift_type  TEXT,         -- 'night', 'shutdown'
      extra_in          TEXT,         -- HH:MM AM/PM
      extra_out         TEXT,         -- HH:MM AM/PM
      extra_notes       TEXT,
      
      project_id    INTEGER,
      site_name     TEXT,
      marked_by     INTEGER,
      created_at    INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(employee_id, date),
      FOREIGN KEY(employee_id) REFERENCES employees(id),
      FOREIGN KEY(project_id) REFERENCES projects(id)
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
    -- ADVANCE REQUESTS (Approval Flow for Advances)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS advance_requests (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id      INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      requested_amount INTEGER NOT NULL, -- IN PAISA
      approved_amount  INTEGER,          -- IN PAISA
      request_date     TEXT    NOT NULL, -- YYYY-MM-DD
      reason           TEXT,
      notes            TEXT,
      payment_mode     TEXT,
      status           TEXT    NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'paid'
      approval_remarks TEXT,
      created_by       INTEGER REFERENCES users(id),
      approved_by      INTEGER REFERENCES users(id),
      paid_at          TEXT,             -- YYYY-MM-DD
      created_at       INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at       INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_adv_req_status ON advance_requests(status);
    CREATE INDEX IF NOT EXISTS idx_adv_req_emp    ON advance_requests(employee_id);

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
      due_date        TEXT,    -- Optional: YYYY-MM-DD for scheduled reminders
      created_at      TEXT DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(is_read);
    -- ─────────────────────────────────────────────────────────────────────
    -- ATTENDANCE CORRECTIONS (Approval Flow for HR)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS attendance_corrections (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      date            TEXT NOT NULL, -- YYYY-MM-DD
      requested_status TEXT NOT NULL,
      reason          TEXT,
      status          TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
      requested_by    INTEGER REFERENCES users(id),
      resolved_by     INTEGER REFERENCES users(id),
      created_at      TEXT DEFAULT (datetime('now', 'localtime')),
      resolved_at     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_att_corrections_status ON attendance_corrections(status);

    -- ─────────────────────────────────────────────────────────────────────
    -- ROOMS (Staff Accommodation Master)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS rooms (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      room_no                  TEXT    NOT NULL,
      location                 TEXT,                        
      project_id               INTEGER REFERENCES projects(id) ON DELETE SET NULL, 
      lease_start_date         TEXT    NOT NULL,            -- YYYY-MM-DD (Base date for rolling 30-day cycles)
      monthly_rent             INTEGER NOT NULL DEFAULT 0,  -- Rent for 30 days (in Paisa)
      max_capacity             INTEGER NOT NULL DEFAULT 4,  
      landlord_name            TEXT,
      landlord_phone           TEXT,
      landlord_payment_details TEXT,                        
      electricity_meter_no     TEXT,                        -- Sub-meter number
      status                   TEXT    NOT NULL DEFAULT 'active', 
      initial_electricity_reading REAL DEFAULT 0,
      room_captain_id          INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      closed_date              TEXT,
      created_at               INTEGER DEFAULT (strftime('%s', 'now'))
    );

    -- ─────────────────────────────────────────────────────────────────────
    -- ROOM ALLOCATIONS (Staff assigned to rooms)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS room_allocations (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id                INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      employee_id            INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      check_in_date          TEXT    NOT NULL,          -- YYYY-MM-DD
      check_out_date         TEXT,                      -- YYYY-MM-DD (NULL if current)
      payer_type             TEXT    NOT NULL DEFAULT 'Company', -- 'Company' | 'Employee'
      rent_model             TEXT    NOT NULL DEFAULT 'split',   
      fixed_deduction_amount INTEGER DEFAULT 0,         -- In Paisa
      created_at             INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(employee_id, room_id, check_in_date)
    );

    -- ─────────────────────────────────────────────────────────────────────
    -- ROOM LANDLORD PAYMENTS (Lease payouts to landlords)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS room_landlord_payments (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id          INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      cycle_start_date TEXT    NOT NULL,                -- YYYY-MM-DD
      cycle_end_date   TEXT    NOT NULL,                -- YYYY-MM-DD (always start_date + 29 days)
      amount_paid      INTEGER NOT NULL,                -- In Paisa
      payment_date     TEXT,                            
      payment_mode     TEXT    NOT NULL DEFAULT 'Bank', 
      reference_no     TEXT,                            
      status           TEXT    NOT NULL DEFAULT 'Pending',
      remarks          TEXT,
      created_at       INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(room_id, cycle_start_date)
    );

    -- ─────────────────────────────────────────────────────────────────────
    -- ROOM ELECTRICITY READINGS (Utility readings on 30-day cycles)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS room_electricity_readings (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id            INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      cycle_start_date   TEXT    NOT NULL,                -- YYYY-MM-DD
      cycle_end_date     TEXT    NOT NULL,                -- YYYY-MM-DD
      previous_reading   REAL NOT NULL,                     
      current_reading    REAL NOT NULL,                     
      units_consumed     REAL NOT NULL,                     
      rate_per_unit      INTEGER NOT NULL DEFAULT 800,      -- In Paisa
      fixed_charges      INTEGER NOT NULL DEFAULT 0,        -- In Paisa
      total_bill_amount  INTEGER NOT NULL,                  -- In Paisa
      payer_type         TEXT NOT NULL DEFAULT 'Company',   -- 'Company' | 'Employee'
      payment_status     TEXT NOT NULL DEFAULT 'Pending',   
      payment_date       TEXT,                              
      payment_mode       TEXT,                              
      reference_no       TEXT,                              
      created_at         INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(room_id, cycle_start_date)
    );

    -- ─────────────────────────────────────────────────────────────────────
    -- ROOM FOOD EXPENSES
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS room_food_expenses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id     INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      date        TEXT    NOT NULL, -- YYYY-MM-DD
      amount      INTEGER NOT NULL, -- IN PAISA
      paid_by     TEXT    NOT NULL DEFAULT 'Employer', -- 'Employer' | 'Employee'
      employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      payment_id  INTEGER REFERENCES payments(id) ON DELETE SET NULL,
      created_at  INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at  INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_room_food_expenses_room ON room_food_expenses(room_id);
    CREATE INDEX IF NOT EXISTS idx_room_food_expenses_proj ON room_food_expenses(project_id);
    CREATE INDEX IF NOT EXISTS idx_room_food_expenses_emp  ON room_food_expenses(employee_id);

    -- ─────────────────────────────────────────────────────────────────────
    -- AUTOMATED PERFORMANCE BONUS ENGINE
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS performance_scores (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id        INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      month              INTEGER NOT NULL,
      year               INTEGER NOT NULL,
      attendance_score   INTEGER NOT NULL DEFAULT 0,
      overtime_score     INTEGER NOT NULL DEFAULT 0,
      productivity_score INTEGER NOT NULL DEFAULT 0,
      supervisor_score   INTEGER NOT NULL DEFAULT 0,
      project_score      INTEGER NOT NULL DEFAULT 0,
      special_incentive  INTEGER NOT NULL DEFAULT 0,
      penalty_deduction  INTEGER NOT NULL DEFAULT 0,
      total_score        INTEGER NOT NULL DEFAULT 0,
      remarks            TEXT,
      created_at         INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_perf_scores_emp ON performance_scores(employee_id);

    CREATE TABLE IF NOT EXISTS bonus_recommendations (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id        INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      month              INTEGER NOT NULL,
      year               INTEGER NOT NULL,
      score_id           INTEGER REFERENCES performance_scores(id) ON DELETE CASCADE,
      recommended_bonus  INTEGER NOT NULL, -- IN PAISA
      approved_bonus     INTEGER,          -- IN PAISA
      status             TEXT NOT NULL DEFAULT 'Pending Approval', -- 'Pending Approval', 'Approved', 'Held', 'Rejected', 'Paid'
      approved_by        INTEGER REFERENCES users(id),
      approval_date      TEXT, -- YYYY-MM-DD
      remarks            TEXT,
      created_at         INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_bonus_recs_emp ON bonus_recommendations(employee_id);
    CREATE INDEX IF NOT EXISTS idx_bonus_recs_status ON bonus_recommendations(status);
  `);

  // ── Migration: Alerts updates ──────────────────────────────────────────────
  const alrCols = db.prepare(`PRAGMA table_info(alerts)`).all().map(c => c.name);
  if (!alrCols.includes('due_date')) {
    db.exec(`ALTER TABLE alerts ADD COLUMN due_date TEXT`);
    console.log('[DB] Added alerts.due_date column');
  }

  // ── Migration: Add attendance time/project tracking columns ───────────────
  // Safe column additions — only add if they don't exist
  const attCols = db.prepare(`PRAGMA table_info(attendance)`).all().map(c => c.name);
  if (!attCols.includes('in_time')) {
    db.exec(`ALTER TABLE attendance ADD COLUMN in_time TEXT`);
    console.log('[DB] Added attendance.in_time column');
  }
  if (!attCols.includes('out_time')) {
    db.exec(`ALTER TABLE attendance ADD COLUMN out_time TEXT`);
    console.log('[DB] Added attendance.out_time column');
  }
  if (!attCols.includes('check_in')) {
    db.exec(`ALTER TABLE attendance ADD COLUMN check_in TEXT`);
  }
  if (!attCols.includes('check_out')) {
    db.exec(`ALTER TABLE attendance ADD COLUMN check_out TEXT`);
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
  if (!attCols.includes('site_name')) {
    db.exec(`ALTER TABLE attendance ADD COLUMN site_name TEXT`);
    console.log('[DB] Added attendance.site_name column');
  }
  if (!attCols.includes('project_id')) {
    db.exec(`ALTER TABLE attendance ADD COLUMN project_id INTEGER`);
    console.log('[DB] Added attendance.project_id column');
  }
  if (!attCols.includes('is_finalized')) {
    db.exec(`ALTER TABLE attendance ADD COLUMN is_finalized INTEGER DEFAULT 1`);
    console.log('[DB] Added attendance.is_finalized column');
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
  if (!payCols.includes('bonus_amount')) {
    db.exec(`ALTER TABLE payments ADD COLUMN bonus_amount INTEGER DEFAULT 0`);
    console.log('[DB] Added payments.bonus_amount column');
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

  // 17. CHATS
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT,                    -- Null for private chats, name for groups
      type         TEXT    NOT NULL,        -- 'private', 'group', 'project'
      project_id   INTEGER,                 -- Optional: link to a project
      created_by   INTEGER,
      created_at   INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY(project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS chat_participants (
      chat_id      INTEGER NOT NULL,
      user_id      INTEGER NOT NULL,
      joined_at    INTEGER DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY(chat_id, user_id),
      FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id         INTEGER NOT NULL,
      sender_id       INTEGER NOT NULL,
      content         TEXT,
      type            TEXT    DEFAULT 'text', -- 'text', 'file', 'image', 'system'
      attachment_path TEXT,
      status          TEXT    DEFAULT 'sent', -- 'sent', 'delivered', 'seen'
      created_at      INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE,
      FOREIGN KEY(sender_id) REFERENCES users(id)
    );
  `);

  // Add last_active_at to users if missing
  const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userCols.includes('last_active_at')) {
    db.exec(`ALTER TABLE users ADD COLUMN last_active_at INTEGER`);
  }
  if (!userCols.includes('status_message')) {
    db.exec(`ALTER TABLE users ADD COLUMN status_message TEXT`);
  }

  // Add extra shift columns to attendance if missing
  const attColsUpdate = db.prepare('PRAGMA table_info(attendance)').all().map(c => c.name);
  if (!attColsUpdate.includes('extra_shift_type')) {
    db.exec(`ALTER TABLE attendance ADD COLUMN extra_shift_type TEXT`);
  }
  if (!attColsUpdate.includes('extra_in')) {
    db.exec(`ALTER TABLE attendance ADD COLUMN extra_in TEXT`);
  }
  if (!attColsUpdate.includes('extra_out')) {
    db.exec(`ALTER TABLE attendance ADD COLUMN extra_out TEXT`);
  }
  if (!attColsUpdate.includes('extra_notes')) {
    db.exec(`ALTER TABLE attendance ADD COLUMN extra_notes TEXT`);
  }

  // DATA MIGRATION: Copy site_name to project_name for existing records
  if (attColsUpdate.includes('site_name') && attColsUpdate.includes('project_name')) {
    db.exec(`UPDATE attendance SET project_name = site_name WHERE project_name IS NULL AND site_name IS NOT NULL`);
    console.log('[DB] Migrated site_name to project_name for existing records.');
  }

  // ── Migration: Add electricity_meter_no column to rooms if missing
  const roomCols = db.prepare('PRAGMA table_info(rooms)').all().map(c => c.name);
  if (roomCols.length > 0 && !roomCols.includes('electricity_meter_no')) {
    db.exec(`ALTER TABLE rooms ADD COLUMN electricity_meter_no TEXT`);
    console.log('[DB] Added rooms.electricity_meter_no column via migration');
  }
  if (roomCols.length > 0 && !roomCols.includes('closed_date')) {
    db.exec(`ALTER TABLE rooms ADD COLUMN closed_date TEXT`);
    console.log('[DB] Added rooms.closed_date column via migration');
  }
  if (roomCols.length > 0 && !roomCols.includes('initial_electricity_reading')) {
    db.exec(`ALTER TABLE rooms ADD COLUMN initial_electricity_reading REAL DEFAULT 0`);
    console.log('[DB] Added rooms.initial_electricity_reading column via migration');
  }
  if (roomCols.length > 0 && !roomCols.includes('room_captain_id')) {
    db.exec(`ALTER TABLE rooms ADD COLUMN room_captain_id INTEGER`);
    console.log('[DB] Added rooms.room_captain_id column via migration');
  }

  // ── Migration: Add special_incentive column to performance_scores if missing
  const perfCols = db.prepare('PRAGMA table_info(performance_scores)').all().map(c => c.name);
  if (perfCols.length > 0 && !perfCols.includes('special_incentive')) {
    db.exec(`ALTER TABLE performance_scores ADD COLUMN special_incentive INTEGER DEFAULT 0`);
    console.log('[DB] Added performance_scores.special_incentive column via migration');
  }

  // ── Migration: Add columns to projects table ──────────────────────────────
  const projectCols = db.prepare('PRAGMA table_info(projects)').all().map(c => c.name);
  if (projectCols.length > 0) {
    if (!projectCols.includes('project_type')) {
      db.exec(`ALTER TABLE projects ADD COLUMN project_type TEXT`);
      console.log('[DB] Added projects.project_type column');
    }
    if (!projectCols.includes('billing_cycle')) {
      db.exec(`ALTER TABLE projects ADD COLUMN billing_cycle TEXT`);
      console.log('[DB] Added projects.billing_cycle column');
    }
    if (!projectCols.includes('client_email')) {
      db.exec(`ALTER TABLE projects ADD COLUMN client_email TEXT`);
      console.log('[DB] Added projects.client_email column');
    }
    if (!projectCols.includes('client_phone')) {
      db.exec(`ALTER TABLE projects ADD COLUMN client_phone TEXT`);
      console.log('[DB] Added projects.client_phone column');
    }
    if (!projectCols.includes('color_tag')) {
      db.exec(`ALTER TABLE projects ADD COLUMN color_tag TEXT`);
      console.log('[DB] Added projects.color_tag column');
    }
    if (!projectCols.includes('required_manpower')) {
      db.exec(`ALTER TABLE projects ADD COLUMN required_manpower INTEGER DEFAULT 0`);
      console.log('[DB] Added projects.required_manpower column');
    }
  }

  // ── Migration: Add columns to employees table ─────────────────────────────
  const empColsProj = db.prepare('PRAGMA table_info(employees)').all().map(c => c.name);
  if (empColsProj.length > 0 && !empColsProj.includes('project_id')) {
    db.exec(`ALTER TABLE employees ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL`);
    console.log('[DB] Added employees.project_id column');
  }

  // ── Migration: Create project_invoices table ─────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_invoices (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      invoice_number   TEXT NOT NULL,
      invoice_date     TEXT NOT NULL,
      due_date         TEXT NOT NULL,
      amount           INTEGER NOT NULL DEFAULT 0,
      gst_amount       INTEGER NOT NULL DEFAULT 0,
      retention_amount INTEGER NOT NULL DEFAULT 0,
      payment_status   TEXT NOT NULL DEFAULT 'Pending',
      paid_amount      INTEGER NOT NULL DEFAULT 0,
      created_at       INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at       INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);
  console.log('[DB] Checked project_invoices table existence');

  // ── Migration: Create asset tracking tables ──────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      category      TEXT NOT NULL,
      model_no      TEXT,
      serial_no     TEXT UNIQUE,
      purchase_date TEXT,
      purchase_cost INTEGER DEFAULT 0,
      status        TEXT DEFAULT 'Available',
      notes         TEXT,
      created_at    INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at    INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
    CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);

    CREATE TABLE IF NOT EXISTS asset_assignments (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id             INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      assigned_to_type     TEXT NOT NULL,
      employee_id          INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      project_id           INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      assigned_date        TEXT NOT NULL,
      expected_return_date TEXT,
      actual_return_date   TEXT,
      condition_on_assign  TEXT,
      condition_on_return  TEXT,
      notes                TEXT,
      created_at           INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at           INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_asset_assign_asset ON asset_assignments(asset_id);
    CREATE INDEX IF NOT EXISTS idx_asset_assign_emp ON asset_assignments(employee_id);
    CREATE INDEX IF NOT EXISTS idx_asset_assign_proj ON asset_assignments(project_id);

    CREATE TABLE IF NOT EXISTS asset_maintenance (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id         INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      maintenance_type TEXT NOT NULL,
      provider         TEXT,
      cost             INTEGER DEFAULT 0,
      sent_date        TEXT NOT NULL,
      returned_date    TEXT,
      remarks          TEXT,
      created_at       INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_asset_maint_asset ON asset_maintenance(asset_id);
  `);
  console.log('[DB] Checked asset tracking tables existence');

  // ── Seed Head Office project if missing ──────────────────────────────────
  const hoCount = db.prepare("SELECT COUNT(*) as n FROM projects WHERE name = 'Head Office'").get().n;
  if (hoCount === 0) {
    db.prepare(`
      INSERT INTO projects (name, project_type, status, revenue, client_name, site_address, code)
      VALUES ('Head Office', 'Internal Department', 'Ongoing', 0, 'Internal', 'Head Office', 'HO')
    `).run();
    console.log("[DB] Seeded 'Head Office' default internal attendance project.");
  } else {
    // Auto-heal existing record if it lacks correct classification
    db.prepare(`
      UPDATE projects 
      SET project_type = 'Internal Department', status = 'Ongoing', revenue = 0, client_name = 'Internal', site_address = 'Head Office', code = 'HO'
      WHERE name = 'Head Office' AND (project_type IS NULL OR project_type != 'Internal Department')
    `).run();
    console.log("[DB] Ensured 'Head Office' project is categorized as Internal Department.");
  }

  console.log('[DB] Migrations complete.');
}

module.exports = { runMigrations };
