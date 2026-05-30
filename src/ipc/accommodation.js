/**
 * LocalPayroll - Accommodation (Room Rent & Utilities) IPC Handlers
 * Manage staff rooms, occupancy, landlord lease payments, and electricity readings.
 */

const { getDB } = require('../database/db');
const { logActivity } = require('../utils/audit');

module.exports = function registerAccommodationHandlers(ipcMain) {

  // ── 1. ROOM MASTER OPERATIONS ──────────────────────────────────────────────

  // Get all rooms (with occupant counts and project link details)
  ipcMain.handle('accommodation:getRooms', async (_, filter = {}) => {
    try {
      const db = getDB();
      let query = `
        SELECT r.*, p.name as project_name,
               e_cap.name as captain_name, e_cap.phone as captain_phone,
               (SELECT COUNT(*) FROM room_allocations WHERE room_id = r.id AND check_out_date IS NULL) as current_occupants
        FROM rooms r
        LEFT JOIN projects p ON p.id = r.project_id
        LEFT JOIN employees e_cap ON e_cap.id = r.room_captain_id
        WHERE 1=1
      `;
      const params = [];

      if (filter.projectId) {
        query += ` AND r.project_id = ?`;
        params.push(filter.projectId);
      }
      if (filter.status) {
        query += ` AND r.status = ?`;
        params.push(filter.status);
      } else {
        query += ` AND (r.status IS NULL OR r.status != 'closed')`;
      }

      query += ` ORDER BY r.room_no ASC`;
      const rooms = db.prepare(query).all(...params);
      return { success: true, rooms };
    } catch (err) {
      console.error('[Accommodation IPC] getRooms error:', err);
      return { success: false, error: err.message };
    }
  });

  // Create new room
  ipcMain.handle('accommodation:createRoom', async (_, data) => {
    const db = getDB();
    const { roomNo, location, projectId, leaseStartDate, monthlyRent, maxCapacity, landlordName, landlordPhone, landlordPaymentDetails, status, closedDate, initialElectricityReading, roomCaptainId } = data;

    if (!roomNo || !leaseStartDate) {
      return { success: false, error: 'Room number and lease start date are required.' };
    }

    try {
      const result = db.prepare(`
        INSERT INTO rooms (room_no, location, project_id, lease_start_date, monthly_rent, max_capacity, landlord_name, landlord_phone, landlord_payment_details, status, closed_date, initial_electricity_reading, room_captain_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        roomNo,
        location || null,
        projectId || null,
        leaseStartDate,
        monthlyRent || 0,
        maxCapacity || 4,
        landlordName || null,
        landlordPhone || null,
        landlordPaymentDetails || null,
        status || 'active',
        (status === 'closed') ? (closedDate || null) : null,
        initialElectricityReading || 0,
        roomCaptainId || null
      );

      // Audit Log
      logActivity('Accommodation', 'Room Created', `Created Room ${roomNo} at location ${location || 'N/A'}`, null, `Rent: ₹${(monthlyRent || 0) / 100}`);

      return { success: true, roomId: result.lastInsertRowid };
    } catch (err) {
      console.error('[Accommodation IPC] createRoom error:', err);
      return { success: false, error: err.message };
    }
  });

  // Update room
  ipcMain.handle('accommodation:updateRoom', async (_, { id, data }) => {
    const db = getDB();
    const { roomNo, location, projectId, leaseStartDate, monthlyRent, maxCapacity, landlordName, landlordPhone, landlordPaymentDetails, status, closedDate, initialElectricityReading, roomCaptainId } = data;

    if (!id || !roomNo || !leaseStartDate) {
      return { success: false, error: 'Room ID, room number, and lease start date are required.' };
    }

    try {
      db.prepare(`
        UPDATE rooms
        SET room_no = ?, location = ?, project_id = ?, lease_start_date = ?, monthly_rent = ?, max_capacity = ?, landlord_name = ?, landlord_phone = ?, landlord_payment_details = ?, status = ?, closed_date = ?, initial_electricity_reading = ?, room_captain_id = ?
        WHERE id = ?
      `).run(
        roomNo,
        location || null,
        projectId || null,
        leaseStartDate,
        monthlyRent || 0,
        maxCapacity || 4,
        landlordName || null,
        landlordPhone || null,
        landlordPaymentDetails || null,
        status || 'active',
        (status === 'closed') ? (closedDate || null) : null,
        initialElectricityReading || 0,
        roomCaptainId || null,
        id
      );

      // Audit Log
      logActivity('Accommodation', 'Room Updated', `Updated Room ${roomNo} parameters`, null, null);

      return { success: true };
    } catch (err) {
      console.error('[Accommodation IPC] updateRoom error:', err);
      return { success: false, error: err.message };
    }
  });

  // Delete room
  ipcMain.handle('accommodation:deleteRoom', async (_, id) => {
    const db = getDB();
    try {
      const room = db.prepare('SELECT room_no FROM rooms WHERE id = ?').get(id);
      if (!room) return { success: false, error: 'Room not found.' };

      db.prepare('DELETE FROM rooms WHERE id = ?').run(id);

      // Audit Log
      logActivity('Accommodation', 'Room Deleted', `Deleted Room ${room.room_no}`, null, null);

      return { success: true };
    } catch (err) {
      console.error('[Accommodation IPC] deleteRoom error:', err);
      return { success: false, error: err.message };
    }
  });


  // ── 2. STAFF ALLOCATIONS ───────────────────────────────────────────────────

  // Get allocations (active or historical)
  ipcMain.handle('accommodation:getAllocations', async (_, filter = {}) => {
    try {
      const db = getDB();
      let query = `
        SELECT ra.*, e.name as employee_name, e.phone as employee_phone, e.role as employee_role,
               r.room_no, r.location
        FROM room_allocations ra
        JOIN employees e ON e.id = ra.employee_id
        JOIN rooms r ON r.id = ra.room_id
        WHERE 1=1
      `;
      const params = [];

      if (filter.roomId) {
        query += ` AND ra.room_id = ?`;
        params.push(filter.roomId);
      }
      if (filter.employeeId) {
        query += ` AND ra.employee_id = ?`;
        params.push(filter.employeeId);
      }
      if (filter.activeOnly) {
        query += ` AND ra.check_out_date IS NULL`;
      }

      query += ` ORDER BY ra.check_in_date DESC`;
      const allocations = db.prepare(query).all(...params);
      return { success: true, allocations };
    } catch (err) {
      console.error('[Accommodation IPC] getAllocations error:', err);
      return { success: false, error: err.message };
    }
  });

  // Allocate a staff member to a room (Check-In)
  ipcMain.handle('accommodation:allocateRoom', async (_, data) => {
    const db = getDB();
    const { roomId, employeeId, checkInDate, payerType, rentModel, fixedDeductionAmount } = data;

    if (!roomId || !employeeId || !checkInDate) {
      return { success: false, error: 'Room ID, Employee ID, and Check-In Date are required.' };
    }

    try {
      // 1. Verify capacity
      const room = db.prepare('SELECT room_no, max_capacity FROM rooms WHERE id = ?').get(roomId);
      if (!room) return { success: false, error: 'Room not found.' };

      const activeCount = db.prepare('SELECT COUNT(*) as count FROM room_allocations WHERE room_id = ? AND check_out_date IS NULL').get(roomId).count;
      if (activeCount >= room.max_capacity) {
        return { success: false, error: `Room ${room.room_no} is already at its capacity of ${room.max_capacity} occupants.` };
      }

      // 2. Perform allocation
      const result = db.prepare(`
        INSERT INTO room_allocations (room_id, employee_id, check_in_date, payer_type, rent_model, fixed_deduction_amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        roomId,
        employeeId,
        checkInDate,
        payerType || 'Company',
        rentModel || 'split',
        fixedDeductionAmount || 0
      );

      // 3. Generate system alert
      const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(employeeId);
      db.prepare(`
        INSERT INTO alerts (title, message, type, module)
        VALUES (?, ?, ?, ?)
      `).run(
        'Occupancy & Rent Started',
        `${emp?.name} checked into Room ${room.room_no}. Billing cycle (${payerType}) started from ${checkInDate}.`,
        'Info',
        'Accommodation'
      );

      // Audit Log
      logActivity('Accommodation', 'Staff Allocated', `Checked ${emp?.name} into Room ${room.room_no}`, null, `Date: ${checkInDate}, Payer: ${payerType}`);

      return { success: true, allocationId: result.lastInsertRowid };
    } catch (err) {
      console.error('[Accommodation IPC] allocateRoom error:', err);
      return { success: false, error: err.message };
    }
  });

  // De-allocate a staff member (Check-Out)
  ipcMain.handle('accommodation:deallocateRoom', async (_, { id, checkOutDate }) => {
    const db = getDB();
    if (!id || !checkOutDate) {
      return { success: false, error: 'Allocation ID and check-out date are required.' };
    }

    try {
      const allocation = db.prepare(`
        SELECT ra.*, e.name as employee_name, r.room_no 
        FROM room_allocations ra
        JOIN employees e ON e.id = ra.employee_id
        JOIN rooms r ON r.id = ra.room_id
        WHERE ra.id = ?
      `).get(id);

      if (!allocation) return { success: false, error: 'Allocation record not found.' };

      db.prepare('UPDATE room_allocations SET check_out_date = ? WHERE id = ?').run(checkOutDate, id);

      // Audit Log
      logActivity('Accommodation', 'Staff Checked Out', `Checked ${allocation.employee_name} out of Room ${allocation.room_no}`, null, `Date: ${checkOutDate}`);

      return { success: true };
    } catch (err) {
      console.error('[Accommodation IPC] deallocateRoom error:', err);
      return { success: false, error: err.message };
    }
  });


  // ── 3. LANDLORD LEASE PAYMENTS ─────────────────────────────────────────────

  // Get landlord payouts for a room
  ipcMain.handle('accommodation:getLandlordPayments', async (_, roomId) => {
    const db = getDB();
    try {
      const payments = db.prepare(`
        SELECT rlp.*, r.room_no, r.landlord_name
        FROM room_landlord_payments rlp
        JOIN rooms r ON r.id = rlp.room_id
        WHERE rlp.room_id = ?
        ORDER BY rlp.cycle_start_date DESC
      `).all(roomId);
      return { success: true, payments };
    } catch (err) {
      console.error('[Accommodation IPC] getLandlordPayments error:', err);
      return { success: false, error: err.message };
    }
  });

  // Delete landlord payout
  ipcMain.handle('accommodation:deleteLandlordPayment', async (_, id) => {
    const db = getDB();
    try {
      db.prepare(`DELETE FROM room_landlord_payments WHERE id = ?`).run(id);
      return { success: true };
    } catch (err) {
      console.error('[Accommodation IPC] deleteLandlordPayment error:', err);
      return { success: false, error: err.message };
    }
  });

  // Record a payment made to a landlord
  ipcMain.handle('accommodation:payLandlordRent', async (_, data) => {
    const db = getDB();
    const { roomId, cycleStartDate, cycleEndDate, amountPaid, paymentDate, paymentMode, referenceNo, remarks } = data;

    if (!roomId || !cycleStartDate || !cycleEndDate || !amountPaid) {
      return { success: false, error: 'Missing required lease billing parameters.' };
    }

    try {
      db.prepare(`
        INSERT INTO room_landlord_payments (room_id, cycle_start_date, cycle_end_date, amount_paid, payment_date, payment_mode, reference_no, status, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Paid', ?)
        ON CONFLICT(room_id, cycle_start_date) DO UPDATE SET
          amount_paid = excluded.amount_paid,
          payment_date = excluded.payment_date,
          payment_mode = excluded.payment_mode,
          reference_no = excluded.reference_no,
          status = 'Paid',
          remarks = excluded.remarks
      `).run(
        roomId,
        cycleStartDate,
        cycleEndDate,
        amountPaid,
        paymentDate,
        paymentMode || 'Bank',
        referenceNo || null,
        remarks || null
      );

      const room = db.prepare('SELECT room_no FROM rooms WHERE id = ?').get(roomId);

      // Audit Log
      logActivity('Accommodation', 'Rent Paid', `Recorded lease payment of ₹${amountPaid / 100} to landlord for Room ${room?.room_no}`, null, `Cycle: ${cycleStartDate} to ${cycleEndDate}`);

      return { success: true };
    } catch (err) {
      console.error('[Accommodation IPC] payLandlordRent error:', err);
      return { success: false, error: err.message };
    }
  });


  // ── 4. ELECTRICITY READING OPERATIONS ──────────────────────────────────────

  // Get reading log for a room
  ipcMain.handle('accommodation:getElectricityReadings', async (_, roomId) => {
    const db = getDB();
    try {
      const readings = db.prepare(`
        SELECT rer.*, r.room_no, r.electricity_meter_no
        FROM room_electricity_readings rer
        JOIN rooms r ON r.id = rer.room_id
        WHERE rer.room_id = ?
        ORDER BY rer.cycle_start_date DESC
      `).all(roomId);
      return { success: true, readings };
    } catch (err) {
      console.error('[Accommodation IPC] getElectricityReadings error:', err);
      return { success: false, error: err.message };
    }
  });

  // Delete electricity reading
  ipcMain.handle('accommodation:deleteElectricityReading', async (_, id) => {
    const db = getDB();
    try {
      db.prepare(`DELETE FROM room_electricity_readings WHERE id = ?`).run(id);
      return { success: true };
    } catch (err) {
      console.error('[Accommodation IPC] deleteElectricityReading error:', err);
      return { success: false, error: err.message };
    }
  });

  // Record an electricity reading (Utility Invoice)
  ipcMain.handle('accommodation:saveElectricityReading', async (_, data) => {
    const db = getDB();
    const { roomId, cycleStartDate, cycleEndDate, previousReading, currentReading, ratePerUnit, fixedCharges, payerType, paymentStatus, paymentDate, paymentMode, referenceNo } = data;

    if (!roomId || !cycleStartDate || !cycleEndDate || previousReading === undefined || currentReading === undefined) {
      return { success: false, error: 'Meter parameters and readings are required.' };
    }

    try {
      // 1. Calculations
      const unitsConsumed = Math.max(0, currentReading - previousReading);
      const activeRate = ratePerUnit !== undefined ? ratePerUnit : 800; // default ₹8.00/unit
      const activeFixed = fixedCharges || 0;
      const totalBillAmount = Math.round(unitsConsumed * activeRate) + activeFixed;

      // 2. Write reading to DB
      db.prepare(`
        INSERT INTO room_electricity_readings (
          room_id, cycle_start_date, cycle_end_date, previous_reading, current_reading, units_consumed,
          rate_per_unit, fixed_charges, total_bill_amount, payer_type, payment_status, payment_date, payment_mode, reference_no
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(room_id, cycle_start_date) DO UPDATE SET
          current_reading = excluded.current_reading,
          units_consumed = excluded.units_consumed,
          rate_per_unit = excluded.rate_per_unit,
          fixed_charges = excluded.fixed_charges,
          total_bill_amount = excluded.total_bill_amount,
          payer_type = excluded.payer_type,
          payment_status = excluded.payment_status,
          payment_date = excluded.payment_date,
          payment_mode = excluded.payment_mode,
          reference_no = excluded.reference_no
      `).run(
        roomId,
        cycleStartDate,
        cycleEndDate,
        previousReading,
        currentReading,
        unitsConsumed,
        activeRate,
        activeFixed,
        totalBillAmount,
        payerType || 'Company',
        paymentStatus || 'Pending',
        paymentDate || null,
        paymentMode || null,
        referenceNo || null
      );

      const room = db.prepare('SELECT room_no, project_id, location FROM rooms WHERE id = ?').get(roomId);

      // 3. If Company Paid, automatically log as a general Company Expense under the "Accommodation" category
      if (payerType === 'Company' && paymentStatus === 'Paid') {
        const expenseDate = paymentDate || new Date().toISOString().split('T')[0];
        
        db.prepare(`
          INSERT INTO expenses (employee_id, project_id, project_name, category, amount, date, remarks, status)
          VALUES (
            (SELECT id FROM employees WHERE status = 'active' LIMIT 1), -- fallback to first active staff
            ?,
            (SELECT name FROM projects WHERE id = ?),
            'Accommodation',
            ?,
            ?,
            ?,
            'approved'
          )
        `).run(
          room.project_id || null,
          room.project_id || null,
          totalBillAmount,
          expenseDate,
          `Electricity bill: Room ${room.room_no} (${unitsConsumed} units, cycle ending ${cycleEndDate})`
        );
      }

      // Audit Log
      logActivity('Accommodation', 'Electricity Recorded', `Recorded ${unitsConsumed} units for Room ${room?.room_no}`, null, `Bill: ₹${totalBillAmount / 100}, Payer: ${payerType}`);

      return { success: true };
    } catch (err) {
      console.error('[Accommodation IPC] saveElectricityReading error:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 5. ROOM FOOD EXPENSE LEDGER OPERATIONS ─────────────────────────────────

  // Get food expenses
  ipcMain.handle('accommodation:getFoodExpenses', async (_, filter = {}) => {
    try {
      const db = getDB();
      let query = `
        SELECT rf.*, r.room_no, p.name as project_name, e.name as employee_name
        FROM room_food_expenses rf
        JOIN rooms r ON r.id = rf.room_id
        JOIN projects p ON p.id = rf.project_id
        LEFT JOIN employees e ON e.id = rf.employee_id
        WHERE 1=1
      `;
      const params = [];

      if (filter.roomId) {
        query += ` AND rf.room_id = ?`;
        params.push(parseInt(filter.roomId));
      }
      if (filter.projectId) {
        query += ` AND rf.project_id = ?`;
        params.push(parseInt(filter.projectId));
      }
      if (filter.employeeId) {
        query += ` AND rf.employee_id = ?`;
        params.push(parseInt(filter.employeeId));
      }
      if (filter.paidBy) {
        query += ` AND rf.paid_by = ?`;
        params.push(filter.paidBy);
      }
      if (filter.month && filter.year) {
        const monthStr = String(filter.month).padStart(2, '0');
        query += ` AND rf.date LIKE ?`;
        params.push(`${filter.year}-${monthStr}-%`);
      }

      query += ` ORDER BY rf.date DESC, rf.created_at DESC`;
      const expenses = db.prepare(query).all(...params);
      return { success: true, expenses };
    } catch (err) {
      console.error('[Accommodation IPC] getFoodExpenses error:', err);
      return { success: false, error: err.message };
    }
  });

  // Create new food expense
  ipcMain.handle('accommodation:createFoodExpense', async (_, data) => {
    const db = getDB();
    const { roomId, projectId, date, amount, paidBy, employeeId } = data;

    if (!roomId || !projectId || !date || !amount || !paidBy) {
      return { success: false, error: 'Room, Project, Date, Amount, and Paid By are required.' };
    }
    if (paidBy === 'Employee' && !employeeId) {
      return { success: false, error: 'Employee is required for Employee Paid food expenses.' };
    }

    try {
      const result = db.prepare(`
        INSERT INTO room_food_expenses (room_id, project_id, date, amount, paid_by, employee_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        roomId,
        projectId,
        date,
        amount,
        paidBy,
        paidBy === 'Employee' ? employeeId : null
      );

      // Audit Log
      const room = db.prepare('SELECT room_no FROM rooms WHERE id = ?').get(roomId);
      const proj = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
      const emp = paidBy === 'Employee' ? db.prepare('SELECT name FROM employees WHERE id = ?').get(employeeId) : null;
      const details = paidBy === 'Employee' ? `Paid by employee: ${emp?.name}` : 'Paid by employer';

      logActivity(
        'Accommodation',
        'Room Food Expense Created',
        `Logged food expense of ₹${amount / 100} for Room ${room?.room_no} (Project: ${proj?.name})`,
        null,
        details
      );

      return { success: true, expenseId: result.lastInsertRowid };
    } catch (err) {
      console.error('[Accommodation IPC] createFoodExpense error:', err);
      return { success: false, error: err.message };
    }
  });

  // Delete food expense
  ipcMain.handle('accommodation:deleteFoodExpense', async (_, id) => {
    const db = getDB();
    try {
      const expense = db.prepare(`
        SELECT rf.*, r.room_no 
        FROM room_food_expenses rf 
        JOIN rooms r ON r.id = rf.room_id 
        WHERE rf.id = ?
      `).get(id);
      
      if (!expense) return { success: false, error: 'Food expense record not found.' };

      if (expense.payment_id) {
        return { success: false, error: 'Cannot delete a food expense that has already been settled in payroll.' };
      }

      db.prepare('DELETE FROM room_food_expenses WHERE id = ?').run(id);

      // Audit Log
      logActivity(
        'Accommodation',
        'Room Food Expense Deleted',
        `Deleted food expense of ₹${expense.amount / 100} for Room ${expense.room_no}`,
        null,
        null
      );

      return { success: true };
    } catch (err) {
      console.error('[Accommodation IPC] deleteFoodExpense error:', err);
      return { success: false, error: err.message };
    }
  });

};

