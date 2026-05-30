/**
 * LocalPayroll - Advances IPC Handlers
 * Staff-wise advance ledger system with running balance tracking.
 * All amounts in PAISA.
 */

const { getDB } = require('../database/db');
const { logActivity } = require('../utils/audit');

module.exports = function registerAdvanceHandlers(ipcMain) {

  // ── Employee Advance Summary (for main ledger cards view) ─────────────────
  // ── Employee Advance Summary (for main ledger cards view) ─────────────────
  ipcMain.handle('advances:employeeSummaries', async (_, filter = {}) => {
    console.log('[Advances IPC] advances:employeeSummaries called', filter);
    try {
      const db = getDB();
      // 1. SELF-HEALING: Sync all balances with Ledger Sums before loading
      // Optimized for performance: Single-query batch update
      try {
        db.prepare(`
          UPDATE employees 
          SET balance = (
            SELECT COALESCE(SUM(amount), 0) 
            FROM ledger 
            WHERE ledger.employee_id = employees.id
          )
          WHERE EXISTS (SELECT 1 FROM ledger WHERE ledger.employee_id = employees.id)
        `).run();
      } catch (repairErr) {
        console.error('[Advances IPC] Self-healing failed:', repairErr);
      }

      // 2. Get Base Employees
      let empQuery = `
        SELECT e.id, e.name, e.phone, e.role, e.balance, p.name as project_name, p.site_address as project_location
        FROM employees e
        LEFT JOIN projects p ON p.id = e.project_id
        WHERE e.status = 'active'
      `;
      const params = [];
      if (filter.includeInactive) {
        empQuery = `
          SELECT e.id, e.name, e.phone, e.role, e.balance, p.name as project_name, p.site_address as project_location
          FROM employees e
          LEFT JOIN projects p ON p.id = e.project_id
          WHERE 1=1
        `;
      }
      if (filter.employeeId) {
        empQuery += ` AND e.id = ?`;
        params.push(parseInt(filter.employeeId));
      }
      if (filter.projectId) {
        empQuery += ` AND e.project_id = ?`;
        params.push(parseInt(filter.projectId));
      }
      empQuery += ` ORDER BY e.name ASC`;
      const employees = db.prepare(empQuery).all(...params);
      
      // 2. Fetch Bulk Stats for all employees at once to avoid N+1 problem
      const givenMap = {};
      db.prepare(`SELECT employee_id, SUM(amount) as total FROM advances GROUP BY employee_id`).all().forEach(r => givenMap[r.employee_id] = r.total);
      
      const recoveredMap = {};
      db.prepare(`SELECT employee_id, SUM(advance_deducted) as total FROM payments WHERE status = 'paid' GROUP BY employee_id`).all().forEach(r => recoveredMap[r.employee_id] = r.total);

      // 3. Map Summaries
      const summaries = employees.map(emp => {
        const totalGiven = givenMap[emp.id] || 0;
        const totalRecovered = recoveredMap[emp.id] || 0;
        const outstanding = emp.balance < 0 ? Math.abs(emp.balance) : 0;

        return {
          id: emp.id,
          name: emp.name,
          phone: emp.phone || '',
          role: emp.role || '',
          projectName: emp.project_name || 'Main Project',
          site: emp.project_location || 'Mumbai',
          totalGiven,
          totalRecovered,
          outstanding,
          balance: emp.balance,
          hasOutstanding: emp.balance < 0
        };
      });
      
      let result = summaries;
      if (filter.outstandingOnly) result = summaries.filter(s => s.hasOutstanding);
      if (filter.search) {
        const q = filter.search.toLowerCase();
        result = result.filter(s => s.name.toLowerCase().includes(q));
      }

      // 4. Global Stats
      const now = new Date();
      const monthStr = String(now.getMonth() + 1).padStart(2, '0');
      const yearStr = String(now.getFullYear());
      const monthStart = `${yearStr}-${monthStr}-01`;
      const monthEnd   = `${yearStr}-${monthStr}-31`;
      
      const advancesThisMonth = db.prepare(`SELECT COALESCE(SUM(amount), 0) as n FROM advances WHERE date >= ? AND date <= ?`).get(monthStart, monthEnd).n;
      const recoveredThisMonth = db.prepare(`SELECT COALESCE(SUM(advance_deducted), 0) as n FROM payments WHERE payment_date >= ? AND payment_date <= ? AND status = 'paid'`).get(monthStart, monthEnd).n;
      const pendingRequestsCount = db.prepare(`SELECT COUNT(*) as n FROM advance_requests WHERE status = 'pending'`).get().n;

      const stats = {
        totalOutstanding: summaries.reduce((s, e) => s + e.outstanding, 0),
        activeAdvanceEmployees: summaries.filter(s => s.hasOutstanding).length,
        totalGivenAll: summaries.reduce((s, e) => s + e.totalGiven, 0),
        advancesThisMonth,
        recoveredThisMonth,
        pendingRequestsCount
      };

      return { success: true, summaries: result, stats };
    } catch (err) {
      console.error('[Advances IPC] Summaries Error:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Employee Ledger Detail (chronological transactions with running balance) ─
  ipcMain.handle('advances:employeeLedger', async (_, empId, filter = {}) => {
    const db = getDB();
    try {
      const employee = db.prepare(`
        SELECT id, name, phone, role, balance, salary 
        FROM employees WHERE id = ?
      `).get(empId);
      
      if (!employee) return { success: false, error: 'Employee not found.' };
      
      // Fetch all advance records
      let advQuery = `
        SELECT 
          a.id, a.date, 'ADVANCE' as type, a.amount as debit, 0 as credit,
          a.mode, a.notes, a.month, a.year, a.created_by,
          u.full_name as created_by_name
        FROM advances a
        LEFT JOIN users u ON u.id = a.created_by
        WHERE a.employee_id = ?
      `;
      const advParams = [empId];
      
      if (filter.fromDate) { advQuery += ` AND a.date >= ?`; advParams.push(filter.fromDate); }
      if (filter.toDate)   { advQuery += ` AND a.date <= ?`; advParams.push(filter.toDate); }
      
      const advances = db.prepare(advQuery).all(...advParams);
      
      // Fetch all salary recovery records (paid payments with advance deducted)
      let payQuery = `
        SELECT 
          p.id, p.payment_date as date, 'RECOVERY' as type, 0 as debit, p.advance_deducted as credit,
          p.mode, 
          CASE 
            WHEN p.notes IS NOT NULL AND p.notes != '' THEN p.notes 
            ELSE 'Salary Advance Recovery (' || p.month || ' ' || p.year || ')' 
          END as notes, 
          p.month, p.year, p.created_by,
          u.full_name as created_by_name
        FROM payments p
        LEFT JOIN users u ON u.id = p.created_by
        WHERE p.employee_id = ? AND p.status = 'paid' AND p.advance_deducted > 0
      `;
      const payParams = [empId];
      
      if (filter.fromDate) { payQuery += ` AND p.payment_date >= ?`; payParams.push(filter.fromDate); }
      if (filter.toDate)   { payQuery += ` AND p.payment_date <= ?`; payParams.push(filter.toDate); }
      
      const recoveries = db.prepare(payQuery).all(...payParams);
      
      // Fetch ledger adjustments (ADJUSTMENT type entries)
      // Only include if it's a manual advance adjustment, not a salary reversal
      let adjQuery = `
        SELECT 
          l.id, l.date, 'ADJUSTMENT' as type,
          CASE WHEN l.amount < 0 THEN ABS(l.amount) ELSE 0 END as debit,
          CASE WHEN l.amount > 0 THEN l.amount ELSE 0 END as credit,
          'Manual' as mode, l.notes, l.month, l.year, null as created_by,
          null as created_by_name
        FROM ledger l
        WHERE l.employee_id = ? AND l.type = 'ADJUSTMENT'
      `;
      const adjParams = [empId];
      if (filter.fromDate) { adjQuery += ` AND l.date >= ?`; adjParams.push(filter.fromDate); }
      if (filter.toDate)   { adjQuery += ` AND l.date <= ?`; adjParams.push(filter.toDate); }
      
      const adjustments = db.prepare(adjQuery).all(...adjParams);
      
      // Merge and sort chronologically
      const allTx = [...advances, ...recoveries, ...adjustments]
        .sort((a, b) => {
          const da = a.date || '0000-00-00';
          const db_ = b.date || '0000-00-00';
          if (da < db_) return -1;
          if (da > db_) return 1;
          // Within same date, advances come before recoveries
          if (a.type === 'ADVANCE' && b.type !== 'ADVANCE') return -1;
          if (a.type !== 'ADVANCE' && b.type === 'ADVANCE') return 1;
          return 0;
        });
      
      // Calculate running balance (starting from zero, advances subtract, recoveries add)
      // Note: We track the advance-specific running balance separately from the main salary balance
      // Advance given = debit (employee owes more)
      // Recovery = credit (employee owes less)
      let runningBalance = 0; // starts at 0 (no outstanding), increases with advances, decreases with recovery
      const txWithBalance = allTx.map(tx => {
        runningBalance += (tx.debit || 0) - (tx.credit || 0);
        return { ...tx, runningBalance };
      });
      
      // SELF-HEALING: If the profile balance doesn't match the SUM of the ledger, sync it.
      // We calculate the sum of the ENTIRE ledger history for this employee.
      const ledgerTotal = db.prepare('SELECT SUM(amount) as total FROM ledger WHERE employee_id = ?').get(empId).total || 0;
      
      if (employee.balance !== ledgerTotal) {
        console.warn(`[Advances IPC] Self-Healing Balance for ${employee.name}. Profile: ${employee.balance}, Ledger Sum: ${ledgerTotal}.`);
        db.prepare('UPDATE employees SET balance = ? WHERE id = ?').run(ledgerTotal, empId);
        employee.balance = ledgerTotal;
      }
      
      let outstanding = employee.balance < 0 ? Math.abs(employee.balance) : 0;
      
      return {
        success: true,
        employee: { ...employee, outstanding },
        transactions: txWithBalance,
        summary: {
          totalGiven: advances.reduce((s, a) => s + a.debit, 0),
          totalRecovered: recoveries.reduce((s, r) => s + r.credit, 0),
          outstanding,
          txCount: txWithBalance.length,
        }
      };
    } catch (err) {
      console.error('[Advances IPC] employeeLedger error:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Get All Transactions (unified stream for History tab) ────────────────
  ipcMain.handle('advances:get', async (_, filter = {}) => {
    const db = getDB();
    const limit = filter.limit || 100;
    const params = [];
    
    // Union advances and recoveries (payments)
    let query = `
      SELECT * FROM (
        SELECT 
          a.id, a.date, 'ADVANCE' as type, a.amount, a.mode, 
          COALESCE(a.notes, 'Advance Issued') as notes,
          e.name as employee_name, e.id as employee_id,
          CAST(strftime('%m', a.date) AS INTEGER) as tx_month,
          CAST(strftime('%Y', a.date) AS INTEGER) as tx_year,
          u.full_name as operator_name,
          COALESCE(u_req.full_name, 'HR') as requester_name,
          ar.request_date as request_date,
          u_app.full_name as approver_name
        FROM advances a
        JOIN employees e ON e.id = a.employee_id
        LEFT JOIN users u ON u.id = a.created_by
        LEFT JOIN ledger l ON l.reference_id = a.id AND l.type = 'ADVANCE'
        LEFT JOIN advance_requests ar ON l.notes = 'Advance Request #' || ar.id || ' Paid'
        LEFT JOIN users u_req ON u_req.id = ar.created_by
        LEFT JOIN users u_app ON u_app.id = ar.approved_by
        
        UNION ALL
        
        SELECT 
          p.id, p.payment_date as date, 'RECOVERY' as type, p.advance_deducted as amount, p.mode,
          'Salary Advance Recovery (' || p.month || ' ' || p.year || ')' as notes,
          e.name as employee_name, e.id as employee_id,
          CAST(strftime('%m', p.payment_date) AS INTEGER) as tx_month,
          CAST(strftime('%Y', p.payment_date) AS INTEGER) as tx_year,
          u.full_name as operator_name,
          null as requester_name,
          null as request_date,
          null as approver_name
        FROM payments p
        JOIN employees e ON e.id = p.employee_id
        LEFT JOIN users u ON u.id = p.created_by
        WHERE p.status = 'paid' AND p.advance_deducted > 0
      )
      WHERE 1=1
    `;
    
    if (filter.month) {
      query += ` AND tx_month = ?`;
      params.push(parseInt(filter.month));
    }
    if (filter.year) {
      query += ` AND tx_year = ?`;
      params.push(parseInt(filter.year));
    }
    
    query += ` ORDER BY date DESC, id DESC`;
    
    if (!filter.month && !filter.year) {
      query += ` LIMIT ?`;
      params.push(limit);
    }
    
    try {
      const transactions = db.prepare(query).all(...params);
      return { success: true, advances: transactions };
    } catch (err) {
      console.error('[Advances IPC] advances:get error:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Add Advance ───────────────────────────────────────────────────────────
  ipcMain.handle('advances:add', async (_, data) => {
    const db = getDB();
    const { employeeId, amount, mode, date, month, year, notes, createdBy, operatorId } = data;
    const finalCreatedBy = createdBy || operatorId;

    if (!employeeId) return { success: false, error: 'Employee is required.' };
    if (!amount || amount <= 0) return { success: false, error: 'Amount must be greater than zero.' };

    const employee = db.prepare('SELECT id, balance FROM employees WHERE id = ?').get(employeeId);
    if (!employee) return { success: false, error: 'Employee not found.' };

    const transaction = db.transaction(() => {
      // 1. Insert advance record
      const result = db.prepare(`
        INSERT INTO advances (employee_id, amount, mode, date, month, year, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(employeeId, amount, mode || 'Cash', date, month || null, year || null, notes || null, finalCreatedBy || null);

      const advanceId = result.lastInsertRowid;

      // 2. Update employee balance (Advance = subtract from balance)
      const newBalance = employee.balance - amount;
      db.prepare('UPDATE employees SET balance = ?, updated_at = (strftime(\'%s\', \'now\')) WHERE id = ?')
        .run(newBalance, employeeId);

      // 3. Record in ledger
      db.prepare(`
        INSERT INTO ledger (employee_id, type, amount, running_balance, date, month, year, notes, reference_id)
        VALUES (?, 'ADVANCE', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        employeeId, 
        -amount,
        newBalance, 
        date, 
        month || null, 
        year || null, 
        notes || 'Manual Advance', 
        advanceId
      );

      return advanceId;
    });

    try {
      const advanceId = transaction();

      const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(employeeId);
      const userObj = db.prepare('SELECT id, full_name as fullName, username FROM users WHERE id = ?').get(finalCreatedBy);
      logActivity('Advances', 'Added', `Added advance of ₹${amount/100} for ${emp?.name}`, null, `Amount: ₹${amount/100}`, userObj);

      return { success: true, advanceId };
    } catch (err) {
      console.error('[Advances IPC] Error adding advance:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Delete Advance ─────────────────────────────────────────────────────────
  ipcMain.handle('advances:delete', async (_, { id, operatorId, userRole }) => {
    if (userRole !== 'admin') return { success: false, error: 'Unauthorized: Only Administrators can delete or reverse advances.' };
    
    const db = getDB();
    const existing = db.prepare('SELECT * FROM advances WHERE id = ?').get(id);
    if (!existing) return { success: false, error: 'Advance record not found.' };

    const employee = db.prepare('SELECT id, balance, name FROM employees WHERE id = ?').get(existing.employee_id);
    if (!employee) return { success: false, error: 'Employee not found.' };

    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM advances WHERE id = ?').run(id);

      const newBalance = employee.balance + existing.amount;
      db.prepare('UPDATE employees SET balance = ?, updated_at = (strftime(\'%s\', \'now\')) WHERE id = ?')
        .run(newBalance, employee.id);

      db.prepare(`
        INSERT INTO ledger (employee_id, type, amount, running_balance, date, month, year, notes, reference_id)
        VALUES (?, 'ADJUSTMENT', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        employee.id,
        existing.amount,
        newBalance,
        new Date().toISOString().split('T')[0],
        existing.month,
        existing.year,
        `Reversal of Advance ID: ${id}`,
        id
      );
      return true;
    });

    try {
      transaction();

      const userObj = db.prepare('SELECT id, full_name as fullName, username FROM users WHERE id = ?').get(operatorId || existing.created_by);
      logActivity('Advances', 'Deleted', `Deleted advance of ₹${existing.amount/100} for ${employee.name}`, `Amount: ₹${existing.amount/100}`, null, userObj);

      return { success: true };
    } catch (err) {
      console.error('[Advances IPC] Error deleting advance:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Get total advances for an employee in a specific month/year ───────────
  ipcMain.handle('advances:summary', async (_, empId, month, year) => {
    const db = getDB();
    const row = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM advances
      WHERE employee_id = ? AND month = ? AND year = ?
    `).get(empId, month, year);
    return { success: true, total: row.total };
  });

  // ── Advance Request Flow (New Workflow) ───────────────────────────────────

  // 0. Delete Advance Request (with reversal if paid)
  ipcMain.handle('advances:deleteRequest', async (_, { id, userRole, operatorId }) => {
    if (userRole !== 'admin') return { success: false, error: 'Unauthorized.' };
    const db = getDB();
    
    try {
      const request = db.prepare('SELECT * FROM advance_requests WHERE id = ?').get(id);
      if (!request) return { success: false, error: 'Request not found.' };

      const transaction = db.transaction(() => {
        // If PAID, we need to revert balance and delete linked records
        if (request.status === 'paid') {
          const finalAmount = request.approved_amount || request.requested_amount;
          
          // 1. Revert Employee Balance
          const employee = db.prepare('SELECT balance FROM employees WHERE id = ?').get(request.employee_id);
          if (employee) {
            const newBalance = employee.balance + finalAmount;
            db.prepare('UPDATE employees SET balance = ? WHERE id = ?').run(newBalance, request.employee_id);
          }

          // 2. Find the Ledger entry to get the exact advance ID
          const ledgerNote = `Advance Request #${id} Paid`;
          const ledgerEntry = db.prepare("SELECT reference_id FROM ledger WHERE employee_id = ? AND notes = ? AND type = 'ADVANCE'").get(request.employee_id, ledgerNote);
          
          if (ledgerEntry && ledgerEntry.reference_id) {
            // 3. Delete the precise Advance record using its ID
            db.prepare("DELETE FROM advances WHERE id = ?").run(ledgerEntry.reference_id);
          }

          // 4. Delete the Ledger entry itself
          db.prepare("DELETE FROM ledger WHERE employee_id = ? AND notes = ?").run(request.employee_id, ledgerNote);
        }

        // 4. Delete the request itself
        db.prepare('DELETE FROM advance_requests WHERE id = ?').run(id);
      });

      transaction();

      const userObj = db.prepare('SELECT id, full_name as fullName, username FROM users WHERE id = ?').get(operatorId);
      logActivity('Advances', 'Deleted', `Deleted advance request ID: ${id}`, null, null, userObj);

      return { success: true };
    } catch (err) {
      console.error('[Advances IPC] deleteRequest error:', err);
      return { success: false, error: err.message };
    }
  });

  // 1. Create Advance Request (HR or Admin)
  ipcMain.handle('advances:createRequest', async (_, data) => {
    const db = getDB();
    const { employeeId, requestedAmount, requestDate, reason, notes, paymentMode, createdBy, operatorId, userRole } = data;
    const finalCreatedBy = createdBy || operatorId;
    
    // Authorization: HR and Admin can create requests
    if (userRole !== 'hr' && userRole !== 'admin') {
      return { success: false, error: 'Unauthorized: Only HR or Admin can create advance requests.' };
    }

    try {
      const result = db.prepare(`
        INSERT INTO advance_requests (employee_id, requested_amount, request_date, reason, notes, payment_mode, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(employeeId, requestedAmount, requestDate, reason, notes, paymentMode, finalCreatedBy);

      // Audit Log
      const { logActivity } = require('../utils/audit');
      const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(employeeId);
      const userObj = db.prepare('SELECT id, full_name as fullName, username FROM users WHERE id = ?').get(finalCreatedBy);
      logActivity('Advances', 'Request Created', `HR created advance request of ₹${requestedAmount/100} for ${emp?.name}`, null, `Amount: ₹${requestedAmount/100}`, userObj);

      // Generate System Alert
      db.prepare(`
        INSERT INTO alerts (title, message, type, module)
        VALUES (?, ?, ?, ?)
      `).run('New Advance Request', `${emp?.name} requested an advance of ₹${requestedAmount/100}.`, 'Info', 'Advances');

      return { success: true, requestId: result.lastInsertRowid };
    } catch (err) {
      console.error('[Advances IPC] createRequest error:', err);
      return { success: false, error: err.message };
    }
  });

  // 2. Get Advance Requests (Filterable)
  ipcMain.handle('advances:getRequests', async (_, filter = {}, userRole) => {
    const db = getDB();
    let query = `
      SELECT ar.*, e.name as employee_name, e.phone as employee_phone,
             COALESCE(u1.full_name, 'HR') as created_by_name, u2.full_name as approved_by_name
      FROM advance_requests ar
      JOIN employees e ON e.id = ar.employee_id
      LEFT JOIN users u1 ON u1.id = ar.created_by
      LEFT JOIN users u2 ON u2.id = ar.approved_by
      WHERE 1=1
    `;
    const params = [];

    if (filter.status) { query += ` AND ar.status = ?`; params.push(filter.status); }
    if (filter.employeeId) { query += ` AND ar.employee_id = ?`; params.push(filter.employeeId); }
    
    query += ` ORDER BY ar.created_at DESC`;

    // --- AUTO-REPAIR LOGIC FOR DECIMAL BUG ---
    // Fix any record where approved_amount is exactly 100x requested_amount (result of the previous bug)
    // Or any record where approved_amount is > 10,000x requested_amount (double conversion)
    try {
      db.prepare(`
        UPDATE advance_requests 
        SET approved_amount = approved_amount / 100,
            updated_at = (strftime('%s', 'now'))
        WHERE (status = 'approved' OR status = 'pending')
          AND (approved_amount >= requested_amount * 100)
          AND approved_amount > 1000
      `).run();
    } catch(e) { console.error("Auto-repair failed:", e); }
    // ------------------------------------------

    const requests = db.prepare(query).all(...params);
    return { success: true, requests };
  });

  // 3. Update Request Status (Approve/Reject/Pay)
  ipcMain.handle('advances:updateRequestStatus', async (_, data) => {
    const db = getDB();
    const { id, status, approvedAmount, approvalRemarks, paymentMode, paymentDate, operatorId, userRole } = data;

    // Authorization: Only Admin can Approve/Reject/Pay
    if (userRole !== 'admin') {
      return { success: false, error: 'Unauthorized: Only Administrators can approve or release advance payments.' };
    }

    try {
      const request = db.prepare('SELECT * FROM advance_requests WHERE id = ?').get(id);
      if (!request) return { success: false, error: 'Request not found.' };

      if (status === 'paid') {
        // MARK AS PAID FLOW
        const transaction = db.transaction(() => {
          const finalAmount = approvedAmount || request.approved_amount || request.requested_amount;
          const payDate = paymentDate || new Date().toISOString().split('T')[0];
          const resolvedPaymentMode = paymentMode || request.payment_mode || 'Cash';

          // 1. Update Request
          db.prepare(`
            UPDATE advance_requests 
            SET status = 'paid', paid_at = ?, approved_amount = ?, approval_remarks = ?, approved_by = ?, payment_mode = ?, updated_at = (strftime('%s', 'now'))
            WHERE id = ?
          `).run(payDate, finalAmount, approvalRemarks || null, operatorId, resolvedPaymentMode, id);

          // 2. Create Advance Record (Legacy table for compatibility)
          const advResult = db.prepare(`
            INSERT INTO advances (employee_id, amount, mode, date, month, year, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(request.employee_id, finalAmount, resolvedPaymentMode, payDate, null, null, request.notes || 'Advance Request Approved', operatorId);

          const advanceId = advResult.lastInsertRowid;

          // 3. Update Employee Balance
          const employee = db.prepare('SELECT balance FROM employees WHERE id = ?').get(request.employee_id);
          const newBalance = (employee?.balance || 0) - finalAmount;
          db.prepare('UPDATE employees SET balance = ?, updated_at = (strftime(\'%s\', \'now\')) WHERE id = ?')
            .run(newBalance, request.employee_id);

          // 4. Record in Ledger
          db.prepare(`
            INSERT INTO ledger (employee_id, type, amount, running_balance, date, notes, reference_id)
            VALUES (?, 'ADVANCE', ?, ?, ?, ?, ?)
          `).run(
            request.employee_id, 
            -finalAmount,
            newBalance, 
            payDate, 
            `Advance Request #${id} Paid`, 
            advanceId
          );
        });
        transaction();
      } else {
        // APPROVE / REJECT FLOW
        db.prepare(`
          UPDATE advance_requests 
          SET status = ?, approved_amount = ?, approval_remarks = ?, approved_by = ?, updated_at = (strftime('%s', 'now'))
          WHERE id = ?
        `).run(status, approvedAmount || null, approvalRemarks || null, operatorId, id);
      }

      // Audit Log
      const { logActivity } = require('../utils/audit');
      const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(request.employee_id);
      const userObj = db.prepare('SELECT id, full_name as fullName, username FROM users WHERE id = ?').get(operatorId);
      logActivity('Advances', `Request ${status}`, `Admin ${status} advance request of ₹${(approvedAmount || request.requested_amount)/100} for ${emp?.name}`, `Status: ${request.status}`, `Status: ${status}`, userObj);

      return { success: true };
    } catch (err) {
      console.error('[Advances IPC] updateRequestStatus error:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Export Advance Ledger Excel ────────────────────────────────────────────
  ipcMain.handle('advances:exportLedgerExcel', async (_, empId) => {
    const db = getDB();
    const { dialog } = require('electron');
    
    try {
      const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
      if (!employee) return { success: false, error: 'Employee not found.' };

      const advances = db.prepare(`
        SELECT a.*, u.full_name as created_by_name
        FROM advances a LEFT JOIN users u ON u.id = a.created_by
        WHERE a.employee_id = ? ORDER BY a.date ASC
      `).all(empId);

      const recoveries = db.prepare(`
        SELECT p.id, p.payment_date as date, p.advance_deducted, p.mode, p.month, p.year, p.notes,
               u.full_name as created_by_name
        FROM payments p LEFT JOIN users u ON u.id = p.created_by
        WHERE p.employee_id = ? AND p.status = 'paid' AND p.advance_deducted > 0
        ORDER BY p.payment_date ASC
      `).all(empId);

      const { generateAdvanceLedgerExcel } = require('../utils/excel');
      const outstanding = employee.balance < 0 ? Math.abs(employee.balance) : 0;

      const { filePath } = await dialog.showSaveDialog({
        title: 'Save Advance Ledger Excel',
        defaultPath: `Advance_Ledger_${employee.name.replace(/\s+/g, '_')}.xlsx`,
        filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
      });

      if (!filePath) return { success: false, error: 'Cancelled.' };

      await generateAdvanceLedgerExcel(employee, advances, recoveries, outstanding, filePath);
      return { success: true, filePath };
    } catch (err) {
      console.error('[Advances IPC] exportLedgerExcel error:', err);
      return { success: false, error: err.message };
    }
  });

};
