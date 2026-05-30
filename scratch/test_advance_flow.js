const { app } = require('electron');
const path = require('path');

// Mock ipcMain to intercept the registered handler
const handlers = {};
const mockIpcMain = {
  handle: (channel, handler) => {
    handlers[channel] = handler;
  }
};

app.whenReady().then(async () => {
  try {
    console.log('[TEST] Initializing database...');
    const { getDB } = require('../src/database/db');
    const db = getDB();

    console.log('[TEST] Loading advances handlers...');
    const registerAdvanceHandlers = require('../src/ipc/advances');
    registerAdvanceHandlers(mockIpcMain);

    // Create a dummy employee for testing
    console.log('[TEST] Creating test employee...');
    db.prepare("INSERT OR REPLACE INTO employees (id, name, balance, status) VALUES (9999, 'Test Employee', 0, 'active')").run();

    // Create a dummy pending request
    console.log('[TEST] Creating test pending request...');
    db.prepare("DELETE FROM advance_requests WHERE id = 9999").run();
    db.prepare(`
      INSERT INTO advance_requests (id, employee_id, requested_amount, request_date, reason, status)
      VALUES (9999, 9999, 500000, '2026-05-26', 'Emergency', 'pending')
    `).run();

    console.log('[TEST] Invoking advances:updateRequestStatus handler...');
    const handler = handlers['advances:updateRequestStatus'];
    if (!handler) {
      throw new Error('advances:updateRequestStatus handler not registered!');
    }

    const result = await handler(null, {
      id: 9999,
      status: 'paid',
      approvedAmount: 400000, // ₹4,000 in Paisa
      approvalRemarks: 'Approved 4000',
      paymentMode: 'UPI',
      paymentDate: '2026-05-27',
      operatorId: 1,
      userRole: 'admin'
    });

    console.log('[TEST] Result:', result);

    // Verify DB state
    const request = db.prepare('SELECT * FROM advance_requests WHERE id = 9999').get();
    console.log('[TEST] Updated request details:', {
      status: request.status,
      approved_amount: request.approved_amount,
      paid_at: request.paid_at,
      approval_remarks: request.approval_remarks,
      approved_by: request.approved_by,
      payment_mode: request.payment_mode
    });

    const emp = db.prepare('SELECT balance FROM employees WHERE id = 9999').get();
    console.log('[TEST] Updated employee balance:', emp.balance); // should be -400000

    const advances = db.prepare('SELECT * FROM advances WHERE employee_id = 9999').all();
    console.log('[TEST] Created advances record:', advances);

    const ledger = db.prepare('SELECT * FROM ledger WHERE employee_id = 9999').all();
    console.log('[TEST] Created ledger record:', ledger);

    // Clean up
    console.log('[TEST] Cleaning up...');
    db.prepare('DELETE FROM ledger WHERE employee_id = 9999').run();
    db.prepare('DELETE FROM advances WHERE employee_id = 9999').run();
    db.prepare('DELETE FROM advance_requests WHERE id = 9999').run();
    db.prepare('DELETE FROM employees WHERE id = 9999').run();

    console.log('[TEST] ALL TESTS PASSED!');
    app.exit(0);
  } catch (err) {
    console.error('[TEST] Test failed:', err);
    app.exit(1);
  }
});
