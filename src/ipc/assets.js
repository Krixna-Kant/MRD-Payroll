const { ipcMain } = require('electron');
const { getDB } = require('../database/db');

module.exports = function registerAssetHandlers() {

  // ── 1. Fetch Assets ────────────────────────────────────────────────────────
  ipcMain.handle('assets:get', async (_, filter = {}) => {
    try {
      const db = getDB();
      let query = `
        SELECT a.*, 
               aa.id as assignment_id, aa.assigned_to_type, aa.assigned_date, aa.expected_return_date, aa.condition_on_assign,
               e.name as employee_name, e.role as employee_role,
               p.id as project_id, p.name as project_name
        FROM assets a
        LEFT JOIN asset_assignments aa ON a.id = aa.asset_id AND aa.actual_return_date IS NULL
        LEFT JOIN employees e ON aa.employee_id = e.id
        LEFT JOIN projects p ON p.id = COALESCE(aa.project_id, e.project_id)
        WHERE 1=1
      `;
      const params = [];

      if (filter.search) {
        query += ' AND (a.name LIKE ? OR a.serial_no LIKE ? OR a.model_no LIKE ?)';
        const searchWild = `%${filter.search}%`;
        params.push(searchWild, searchWild, searchWild);
      }

      if (filter.category) {
        query += ' AND a.category = ?';
        params.push(filter.category);
      }

      if (filter.status) {
        query += ' AND a.status = ?';
        params.push(filter.status);
      }

      query += ' ORDER BY a.created_at DESC';
      const assets = db.prepare(query).all(...params);
      return { success: true, assets };
    } catch (err) {
      console.error('[Assets IPC] Error getting assets:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 2. Create Asset ────────────────────────────────────────────────────────
  ipcMain.handle('assets:create', async (_, data) => {
    try {
      const db = getDB();
      const { name, category, modelNo, serialNo, purchaseDate, purchaseCost, notes } = data;

      if (!name || !category) {
        throw new Error('Asset Name and Category are required.');
      }

      const result = db.prepare(`
        INSERT INTO assets (name, category, model_no, serial_no, purchase_date, purchase_cost, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, 'Available', ?)
      `).run(name, category, modelNo || null, serialNo || null, purchaseDate || null, purchaseCost || 0, notes || null);

      // Audit Log
      const { logActivity } = require('../utils/audit');
      logActivity('Assets', 'Created', `Added asset: ${name} (${category})`, null, `Serial: ${serialNo || 'N/A'}`);

      return { success: true, id: result.lastInsertRowid };
    } catch (err) {
      console.error('[Assets IPC] Error creating asset:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 3. Update Asset ────────────────────────────────────────────────────────
  ipcMain.handle('assets:update', async (_, data) => {
    try {
      const db = getDB();
      const { id, name, category, modelNo, serialNo, purchaseDate, purchaseCost, status, notes } = data;

      if (!id || !name || !category) {
        throw new Error('ID, Asset Name and Category are required for update.');
      }

      db.prepare(`
        UPDATE assets SET
          name = ?,
          category = ?,
          model_no = ?,
          serial_no = ?,
          purchase_date = ?,
          purchase_cost = ?,
          status = COALESCE(?, status),
          notes = ?,
          updated_at = (strftime('%s', 'now'))
        WHERE id = ?
      `).run(name, category, modelNo || null, serialNo || null, purchaseDate || null, purchaseCost || 0, status || null, notes || null, id);

      const { logActivity } = require('../utils/audit');
      logActivity('Assets', 'Updated', `Updated asset details for ID ${id}: ${name}`, null, null);

      return { success: true };
    } catch (err) {
      console.error('[Assets IPC] Error updating asset:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 4. Delete Asset ────────────────────────────────────────────────────────
  ipcMain.handle('assets:delete', async (_, id) => {
    try {
      const db = getDB();
      const asset = db.prepare('SELECT name FROM assets WHERE id = ?').get(id);
      if (!asset) throw new Error('Asset not found');

      db.prepare('DELETE FROM assets WHERE id = ?').run(id);

      const { logActivity } = require('../utils/audit');
      logActivity('Assets', 'Deleted', `Deleted asset: ${asset.name}`, null, null);

      return { success: true };
    } catch (err) {
      console.error('[Assets IPC] Error deleting asset:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 5. Assign Asset ────────────────────────────────────────────────────────
  ipcMain.handle('assets:assign', async (_, data) => {
    try {
      const db = getDB();
      const { assetId, assignedToType, employeeId, projectId, assignedDate, expectedReturnDate, conditionOnAssign, notes } = data;

      if (!assetId || !assignedToType || !assignedDate) {
        throw new Error('Asset ID, Assigned To, and Assigned Date are required.');
      }

      // Check if asset is available
      const asset = db.prepare('SELECT status, name FROM assets WHERE id = ?').get(assetId);
      if (!asset) throw new Error('Asset not found');
      if (asset.status !== 'Available') {
        throw new Error(`Asset is not available. Current status: ${asset.status}`);
      }

      // Start transaction
      const transaction = db.transaction(() => {
        // Insert assignment
        db.prepare(`
          INSERT INTO asset_assignments (
            asset_id, assigned_to_type, employee_id, project_id, assigned_date, 
            expected_return_date, condition_on_assign, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          assetId, assignedToType, 
          assignedToType === 'Employee' ? employeeId : null,
          projectId || null,
          assignedDate, expectedReturnDate || null, conditionOnAssign || 'Good', notes || null
        );

        // Update status of asset
        db.prepare("UPDATE assets SET status = 'Assigned', updated_at = (strftime('%s', 'now')) WHERE id = ?").run(assetId);
      });
      transaction();

      const { logActivity } = require('../utils/audit');
      const targetName = assignedToType === 'Employee' 
        ? db.prepare('SELECT name FROM employees WHERE id = ?').get(employeeId)?.name 
        : db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId)?.name;

      logActivity('Assets', 'Assigned', `Assigned asset '${asset.name}' to ${assignedToType} '${targetName}'`, null, null);

      return { success: true };
    } catch (err) {
      console.error('[Assets IPC] Error assigning asset:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 6. Retrieve Asset (Return to inventory) ────────────────────────────────
  ipcMain.handle('assets:retrieve', async (_, data) => {
    try {
      const db = getDB();
      const { assetId, actualReturnDate, conditionOnReturn, notes } = data;

      if (!assetId || !actualReturnDate) {
        throw new Error('Asset ID and Return Date are required.');
      }

      // Find active assignment
      const activeAssign = db.prepare('SELECT id FROM asset_assignments WHERE asset_id = ? AND actual_return_date IS NULL').get(assetId);
      if (!activeAssign) {
        throw new Error('No active assignment record found for this asset.');
      }

      const asset = db.prepare('SELECT name FROM assets WHERE id = ?').get(assetId);

      const transaction = db.transaction(() => {
        // Update assignment
        db.prepare(`
          UPDATE asset_assignments SET
            actual_return_date = ?,
            condition_on_return = ?,
            notes = COALESCE(?, notes),
            updated_at = (strftime('%s', 'now'))
          WHERE id = ?
        `).run(actualReturnDate, conditionOnReturn || 'Good', notes || null, activeAssign.id);

        // Determine next status (if damaged, send to maintenance, otherwise make available)
        const nextStatus = (conditionOnReturn === 'Damaged') ? 'Maintenance' : 'Available';
        db.prepare("UPDATE assets SET status = ?, updated_at = (strftime('%s', 'now')) WHERE id = ?").run(nextStatus, assetId);
      });
      transaction();

      const { logActivity } = require('../utils/audit');
      logActivity('Assets', 'Retrieved', `Asset '${asset?.name}' returned with condition: ${conditionOnReturn || 'Good'}`, null, null);

      return { success: true };
    } catch (err) {
      console.error('[Assets IPC] Error retrieving asset:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 7. Start Asset Maintenance ─────────────────────────────────────────────
  ipcMain.handle('assets:maintenance:start', async (_, data) => {
    try {
      const db = getDB();
      const { assetId, maintenanceType, provider, sentDate, remarks } = data;

      if (!assetId || !maintenanceType || !sentDate) {
        throw new Error('Asset ID, Maintenance Type, and Sent Date are required.');
      }

      const asset = db.prepare('SELECT status, name FROM assets WHERE id = ?').get(assetId);
      if (!asset) throw new Error('Asset not found');
      if (asset.status === 'Assigned') {
        throw new Error('Cannot send an assigned asset for maintenance. Retrieve it first.');
      }

      const transaction = db.transaction(() => {
        db.prepare(`
          INSERT INTO asset_maintenance (asset_id, maintenance_type, provider, cost, sent_date, remarks)
          VALUES (?, ?, ?, 0, ?, ?)
        `).run(assetId, maintenanceType, provider || null, sentDate, remarks || null);

        db.prepare("UPDATE assets SET status = 'Maintenance', updated_at = (strftime('%s', 'now')) WHERE id = ?").run(assetId);
      });
      transaction();

      const { logActivity } = require('../utils/audit');
      logActivity('Assets', 'Maintenance Sent', `Sent asset '${asset.name}' for maintenance (${maintenanceType})`, null, null);

      return { success: true };
    } catch (err) {
      console.error('[Assets IPC] Error starting maintenance:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 8. Complete Asset Maintenance ──────────────────────────────────────────
  ipcMain.handle('assets:maintenance:complete', async (_, data) => {
    try {
      const db = getDB();
      const { assetId, cost, returnedDate, remarks } = data;

      if (!assetId || !returnedDate) {
        throw new Error('Asset ID and Return Date are required.');
      }

      // Find active maintenance
      const activeMaint = db.prepare('SELECT id FROM asset_maintenance WHERE asset_id = ? AND returned_date IS NULL ORDER BY id DESC LIMIT 1').get(assetId);
      if (!activeMaint) {
        throw new Error('No active maintenance record found for this asset.');
      }

      const asset = db.prepare('SELECT name FROM assets WHERE id = ?').get(assetId);

      const transaction = db.transaction(() => {
        db.prepare(`
          UPDATE asset_maintenance SET
            cost = ?,
            returned_date = ?,
            remarks = COALESCE(?, remarks)
          WHERE id = ?
        `).run(cost || 0, returnedDate, remarks || null, activeMaint.id);

        db.prepare("UPDATE assets SET status = 'Available', updated_at = (strftime('%s', 'now')) WHERE id = ?").run(assetId);
      });
      transaction();

      const { logActivity } = require('../utils/audit');
      logActivity('Assets', 'Maintenance Resolved', `Asset '${asset?.name}' returned from maintenance. Cost: ₹${(cost || 0)/100}`, null, null);

      return { success: true };
    } catch (err) {
      console.error('[Assets IPC] Error completing maintenance:', err);
      return { success: false, error: err.message };
    }
  });

  // ── 9. Fetch Asset History ──────────────────────────────────────────────────
  ipcMain.handle('assets:history:get', async (_, assetId) => {
    try {
      const db = getDB();

      const assignments = db.prepare(`
        SELECT aa.*, e.name as employee_name, p.name as project_name
        FROM asset_assignments aa
        LEFT JOIN employees e ON aa.employee_id = e.id
        LEFT JOIN projects p ON aa.project_id = p.id
        WHERE aa.asset_id = ?
        ORDER BY aa.assigned_date DESC
      `).all(assetId);

      const maintenance = db.prepare(`
        SELECT * FROM asset_maintenance
        WHERE asset_id = ?
        ORDER BY sent_date DESC
      `).all(assetId);

      return { success: true, assignments, maintenance };
    } catch (err) {
      console.error('[Assets IPC] Error getting asset history:', err);
      return { success: false, error: err.message };
    }
  });
};
