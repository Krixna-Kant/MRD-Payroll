/**
 * LocalPayroll — Accommodation Page Module (Unified Single-View Dashboard with Folder Drilldown)
 * Provides a folder-based navigation to configure Rooms, Occupancy, Landlord Payouts, and utilities.
 */
const AccommodationPage = (() => {
  const container = () => document.getElementById('page-accommodation');
  const headerActs = () => document.getElementById('page-header-actions');

  let _roomsData = []; // Combined rooms + allocations + payments + readings
  let _employees = [];
  let _projects = [];
  let _viewMode = 'folders'; // 'folders' | 'room' | 'food_ledger'
  let _selectedRoomId = null;
  let _searchQ = '';
  let _foodExpenses = [];
  let _foodSearchQuery = '';
  let _foodFilterPaidBy = '';
  let _foodFilterRoomId = '';
  let _foodFilterProjectId = '';

  async function init() {
    _viewMode = 'folders';
    _selectedRoomId = null;
    _searchQ = '';
    _foodSearchQuery = '';
    _foodFilterPaidBy = '';
    _foodFilterRoomId = '';
    _foodFilterProjectId = '';

    // Load static data references
    const empRes = await API.getEmployees({ status: 'active' });
    _employees = empRes.employees || [];

    const projRes = await API.getProjects({ status: 'Ongoing' });
    _projects = projRes.projects || [];

    await load();
  }

  async function load() {
    try {
      const roomRes = await API.getRooms();
      const rooms = roomRes.rooms || [];

      // Query detailed sub-records for each room in parallel (Load historical allocations as well)
      _roomsData = await Promise.all(rooms.map(async (r) => {
        const allocsRes = await API.getRoomAllocations({ roomId: r.id });
        const paymentsRes = await API.getLandlordPayments(r.id);
        const readingsRes = await API.getElectricityReadings(r.id);
        const foodRes = await API.getRoomFoodExpenses({ roomId: r.id });

        return {
          ...r,
          allocations: allocsRes.allocations || [],
          payouts: paymentsRes.payments || [],
          readings: readingsRes.readings || [],
          foodExpenses: foodRes.expenses || []
        };
      }));

      if (_viewMode === 'food_ledger') {
        const foodRes = await API.getRoomFoodExpenses();
        _foodExpenses = foodRes.expenses || [];
      }

      // Adjust selection if room is deleted
      if (_viewMode === 'room' && _selectedRoomId) {
        const exists = _roomsData.some(x => x.id === _selectedRoomId);
        if (!exists) {
          _viewMode = 'folders';
          _selectedRoomId = null;
        }
      }

      renderHeader();
      render();
    } catch (err) {
      Toast.error('Failed to load room details: ' + err.message);
    }
  }

  function renderHeader() {
    if (_viewMode === 'room') {
      headerActs().innerHTML = '';
    } else {
      headerActs().innerHTML = `
        <div class="tab-bar" style="margin-bottom:0;border:none">
          <button class="tab-btn ${_viewMode === 'folders'?'active':''}" id="acc-tab-rooms">🏨 Rooms & Rent</button>
          <button class="tab-btn ${_viewMode === 'food_ledger'?'active':''}" id="acc-tab-food">🍲 Room Food Ledger</button>
        </div>
      `;
      document.getElementById('acc-tab-rooms').addEventListener('click', () => { _viewMode = 'folders'; load(); });
      document.getElementById('acc-tab-food').addEventListener('click', () => { _viewMode = 'food_ledger'; load(); });
    }
  }

  function render() {
    if (_viewMode === 'room' && _selectedRoomId) {
      renderRoomDetailView();
    } else if (_viewMode === 'food_ledger') {
      renderFoodLedgerView();
    } else {
      renderFoldersView();
    }
  }

  function getRoomCycles(r) {
    const leaseDate = new Date(r.lease_start_date + 'T00:00:00');
    const today = new Date();
    // Allow generating up to 3 upcoming months in advance
    const limitDate = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
    const closedLimit = (r.status === 'closed' && r.closed_date) ? new Date(r.closed_date + 'T00:00:00') : null;
    const finalLimitDate = closedLimit && closedLimit < limitDate ? closedLimit : limitDate;
    
    function addMonths(baseDate, months) {
      const d = new Date(baseDate);
      const targetMonth = d.getMonth() + months;
      d.setMonth(targetMonth);
      if (d.getMonth() !== (targetMonth % 12 + 12) % 12) {
        d.setDate(0);
      }
      return d;
    }

    const cycles = [];
    let cycleIndex = 0;
    
    while (true) {
      let currentStart = addMonths(leaseDate, cycleIndex);
      
      if (closedLimit && currentStart > closedLimit) {
        break;
      }
      
      let nextStart = addMonths(leaseDate, cycleIndex + 1);
      let currentEnd = new Date(nextStart);
      currentEnd.setDate(nextStart.getDate() - 1);
      
      const startIso = Helpers.todayIso(currentStart);
      const endIso = Helpers.todayIso(currentEnd);
      
      cycles.push({
        startDate: startIso,
        endDate: endIso,
        start: new Date(currentStart),
        end: currentEnd
      });
      
      if (nextStart > finalLimitDate) {
        break;
      }
      cycleIndex++;
    }
    
    return cycles.reverse(); // Latest first
  }

  function sendRoomDetailsWhatsApp(r) {
    const captainName = r.captain_name || (r.room_captain_id ? _employees.find(e => e.id === r.room_captain_id)?.name : '');
    const phoneRaw = r.captain_phone || (r.room_captain_id ? _employees.find(e => e.id === r.room_captain_id)?.phone : '') || '';
    const phone = phoneRaw.replace(/\D/g, '');
    if (!phone) {
      Toast.warning(`No phone number saved for the Room Captain (${captainName || 'Unknown'}).`);
      return;
    }
    const finalPhone = phone.length === 10 ? '91' + phone : phone;

    const message = `Dear ${captainName},\n\nYou have been assigned as the Room Captain for Room ${r.room_no}.\n\n📍 *Location*: ${r.location || 'N/A'}\n📅 *Lease Start Date*: ${Helpers.formatDate(r.lease_start_date)}\n💵 *Rent*: ${API.fmtRupees(r.monthly_rent, true)} per 30 days\n⚡ *Meter Serial*: ${r.electricity_meter_no || 'N/A'}\n🔌 *Initial Meter Reading*: ${r.initial_electricity_reading || 0} units\n🏦 *Landlord Payout Info*: ${r.landlord_payment_details || 'N/A'}\n\nThank you.`;

    window.open(`https://wa.me/${finalPhone}?text=${encodeURIComponent(message)}`, '_blank');
  }

  function renderFoldersView() {
    // Generate dashboard top metrics
    const totalRooms = _roomsData.length;
    const totalBeds = _roomsData.reduce((acc, r) => acc + r.max_capacity, 0);
    
    // Count active occupied roommates
    const occupiedBeds = _roomsData.reduce((acc, r) => {
      const activeAllocs = r.allocations.filter(al => !al.check_out_date);
      return acc + activeAllocs.length;
    }, 0);

    let pendingRentAmount = 0;
    let pendingRentCount = 0;
    let pendingUtilityCount = 0;

    _roomsData.forEach(r => {
      // Find current cycle dates using getRoomCycles
      const cycles = getRoomCycles(r);
      const todayIso = Helpers.todayIso();
      const currentCycle = cycles.find(c => todayIso >= c.startDate && todayIso <= c.endDate) || cycles[cycles.length - 1];
      const cycleStartIso = currentCycle ? currentCycle.startDate : r.lease_start_date;

      const landlordPaid = r.payouts.some(p => p.cycle_start_date === cycleStartIso && p.status === 'Paid');
      if (!landlordPaid) {
        pendingRentAmount += r.monthly_rent;
        pendingRentCount++;
      }

      const utilityLogged = r.readings.some(u => u.cycle_start_date === cycleStartIso);
      if (!utilityLogged) {
        pendingUtilityCount++;
      }
    });

    const q = (_searchQ || '').toLowerCase();
    const filteredRooms = _roomsData.filter(r => 
      r.room_no.toLowerCase().includes(q) || 
      (r.location || '').toLowerCase().includes(q) || 
      (r.project_name || '').toLowerCase().includes(q) ||
      (r.landlord_name || '').toLowerCase().includes(q)
    );

    container().innerHTML = `
      <style>
        .accommodation-dashboard {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .room-detail-container {
          width: 100%;
          max-width: 100%;
        }
        .room-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 24px;
          padding: 24px;
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .room-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 14px;
        }
        .room-card-title {
          font-size: 1.3rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 4px;
        }
        .room-card-subtitle {
          font-size: 0.85rem;
          color: var(--text-muted);
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .room-card-rent {
          font-size: 1.15rem;
          font-weight: 800;
          color: var(--success);
          background: rgba(16, 185, 129, 0.1);
          padding: 6px 12px;
          border-radius: 12px;
          text-align: right;
        }
        .room-section {
          background: var(--bg-subtle);
          border-radius: 16px;
          padding: 16px;
          border: 1px solid var(--border-subtle);
        }
        .room-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-weight: 700;
          font-size: 0.9rem;
          color: var(--text);
        }
        .occupants-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .occupant-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--bg-card);
          padding: 8px 12px;
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
        }
        .occupant-name {
          font-weight: 600;
          font-size: 0.85rem;
          color: var(--text);
        }
        .utility-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.85rem;
        }
        .utility-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 700;
        }
        .card-footer-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: auto;
          border-top: 1px solid var(--border-subtle);
          padding-top: 14px;
        }
      </style>

      <div class="accommodation-dashboard">
        <!-- TOP SUMMARY KPI BAR -->
        <div class="grid grid-cols-4 gap-4">
          <div class="kpi-card-v3 blue">
            <div class="icon-box">🏨</div>
            <div class="title">Active Leased Rooms</div>
            <div class="metric">${totalRooms}</div>
            <div class="footer"><span class="sub">Total capacity: ${totalBeds} beds</span></div>
          </div>
          <div class="kpi-card-v3 green">
            <div class="icon-box">👥</div>
            <div class="title">Total Occupancy</div>
            <div class="metric">${occupiedBeds} <span style="font-size:1rem; opacity:0.7">/ ${totalBeds}</span></div>
            <div class="footer"><span class="sub">Occupancy rate: ${totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0}%</span></div>
          </div>
          <div class="kpi-card-v3 orange">
            <div class="icon-box">💳</div>
            <div class="title">Pending Landlord Rent</div>
            <div class="metric" style="color:var(--warning)">${API.fmtRupees(pendingRentAmount)}</div>
            <div class="footer"><span class="sub">Cycles awaiting payment: ${pendingRentCount}</span></div>
          </div>
          <div class="kpi-card-v3 purple">
            <div class="icon-box">⚡</div>
            <div class="title">Electricity Tasks</div>
            <div class="metric" style="color:var(--accent)">${pendingUtilityCount}</div>
            <div class="footer"><span class="sub">Rooms needing readings</span></div>
          </div>
        </div>

        <!-- SEARCH BAR AND ACTIONS -->
        <div class="toolbar">
          <div class="toolbar-left">
            <div class="search-bar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input id="room-search" class="form-input" placeholder="Search rooms..." value="${Helpers.escapeHtml(_searchQ)}" style="width:320px" />
            </div>
          </div>
          <div class="toolbar-right">
            <button id="add-room-btn-main" class="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Room
            </button>
          </div>
        </div>

        <!-- ROOM FOLDERS GRID -->
        ${filteredRooms.length === 0 ? `
          <div class="empty-state">
            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
            <h3>No accommodations found</h3>
            <p>Try a different search term or configure a room.</p>
          </div>
        ` : `
          <div class="folder-grid">
            ${filteredRooms.map(r => {
              const activeCount = r.allocations.filter(al => !al.check_out_date).length;
              return `
                <div class="folder-card" data-room-id="${r.id}">
                  <div class="folder-icon-wrap">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  </div>
                  <div class="folder-info">
                    <div class="folder-name">Room ${Helpers.escapeHtml(r.room_no)}</div>
                    <div class="folder-stats">
                      <span class="folder-stat-item">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                        ${activeCount} / ${r.max_capacity} beds
                      </span>
                      <span class="folder-stat-item">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
                        ${Helpers.escapeHtml(r.location || 'Site')}
                      </span>
                      <span class="folder-stat-item" style="color:var(--success); font-weight:600">
                        ${API.fmtRupees(r.monthly_rent)}
                      </span>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    // Bind search bar
    document.getElementById('room-search').addEventListener('input', Helpers.debounce(e => {
      _searchQ = e.target.value;
      render();
    }, 200));

    // Bind Add Room button
    document.getElementById('add-room-btn-main').addEventListener('click', () => openRoomForm());

    // Bind folder clicks to enter room detail view
    container().querySelectorAll('.folder-card').forEach(card => {
      card.addEventListener('click', () => {
        _selectedRoomId = parseInt(card.dataset.roomId);
        _viewMode = 'room';
        render();
      });
    });
  }

  function renderRoomDetailView() {
    const r = _roomsData.find(x => x.id === _selectedRoomId);
    if (!r) {
      _viewMode = 'folders';
      _selectedRoomId = null;
      render();
      return;
    }

    const cycles = getRoomCycles(r);

    container().innerHTML = `
      <style>
        .room-detail-container {
          width: 100%;
          max-width: 100%;
        }
        .room-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 24px;
          padding: 24px;
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .room-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 14px;
        }
        .room-card-title {
          font-size: 1.3rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 4px;
        }
        .room-card-subtitle {
          font-size: 0.85rem;
          color: var(--text-muted);
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .room-card-rent {
          font-size: 1.15rem;
          font-weight: 800;
          color: var(--success);
          background: rgba(16, 185, 129, 0.1);
          padding: 6px 12px;
          border-radius: 12px;
          text-align: right;
        }
        .room-section {
          background: var(--bg-subtle);
          border-radius: 16px;
          padding: 16px;
          border: 1px solid var(--border-subtle);
        }
        .room-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-weight: 700;
          font-size: 0.9rem;
          color: var(--text);
        }
        .occupants-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .occupant-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--bg-card);
          padding: 8px 12px;
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
        }
        .occupant-name {
          font-weight: 600;
          font-size: 0.85rem;
          color: var(--text);
        }
        .utility-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.85rem;
        }
        .utility-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 700;
        }
        .card-footer-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: auto;
          border-top: 1px solid var(--border-subtle);
          padding-top: 14px;
        }
      </style>

      <div class="breadcrumb">
        <div class="breadcrumb-item">
          <span class="breadcrumb-btn" id="bc-root">Accommodations</span>
        </div>
        <div class="breadcrumb-separator">/</div>
        <div class="breadcrumb-item active">
          <span>Room ${Helpers.escapeHtml(r.room_no)}</span>
        </div>
      </div>

      <div class="room-detail-container">
        ${renderRoomCard(r, cycles)}
      </div>
    `;

    // Bind breadcrumb back to folders list
    document.getElementById('bc-root').addEventListener('click', () => {
      _viewMode = 'folders';
      _selectedRoomId = null;
      render();
    });

    // Bind click events on monthly cycles grid cards
    container().querySelectorAll('.cycle-card').forEach(card => {
      card.addEventListener('click', () => {
        const start = card.dataset.cycleStart;
        const cycle = cycles.find(c => c.startDate === start);
        if (cycle) {
          openCycleDetailsModal(r, cycle);
        }
      });
    });

    // Bind action events inside detail view (like Checkout and Check-In)
    bindEvents();
  }

  function renderRoomCard(r, cycles) {
    const activeAllocations = r.allocations.filter(al => !al.check_out_date);

    // Render card layout
    return `
      <div class="room-card" data-id="${r.id}">
        <!-- Header -->
        <div class="room-card-header">
          <div>
            <div class="room-card-title">Room ${Helpers.escapeHtml(r.room_no)}</div>
            <div class="room-card-subtitle">
              <span>📍 ${Helpers.escapeHtml(r.location || 'Site')}</span>
              <span style="opacity:0.3">|</span>
              <span class="badge badge-info">${Helpers.escapeHtml(r.project_name || 'General')}</span>
              ${r.captain_name ? `
                <span style="opacity:0.3">|</span>
                <span style="color:var(--accent); font-weight:700; cursor:pointer" class="room-captain-wa-trigger" data-room-id="${r.id}" title="Click to share details via WhatsApp">
                  👤 Captain: ${Helpers.escapeHtml(r.captain_name)} 💬
                </span>
              ` : ''}
            </div>
          </div>
          <div class="room-card-rent">
            ${API.fmtRupees(r.monthly_rent)}
            <div class="text-xs text-muted font-500" style="text-align:right; margin-top:2px">per 30 days</div>
          </div>
        </div>

        <!-- Section 1: Staff Occupants (Active Roommates) -->
        <div class="room-section">
          <div class="room-section-header">
            <span>👥 Room Occupants (${activeAllocations.length} / ${r.max_capacity})</span>
            ${activeAllocations.length < r.max_capacity ? `
              <button class="btn btn-sm btn-ghost checkin-btn" data-room-id="${r.id}" style="color:var(--accent); font-weight:700">+ Check-In</button>
            ` : `<span class="text-xs text-danger">At Capacity</span>`}
          </div>
          <div class="occupants-list">
            ${activeAllocations.length === 0 ? `
              <div class="text-xs text-muted p-2 text-center">Room is currently vacant.</div>
            ` : activeAllocations.map(al => `
              <div class="occupant-item">
                <div>
                  <span class="occupant-name">${Helpers.escapeHtml(al.employee_name)}</span>
                  <div class="text-xs text-muted">Checked in: ${Helpers.formatDateShort(al.check_in_date)} (${al.payer_type === 'Company' ? 'Perk' : 'Deducted'})</div>
                </div>
                <button class="btn btn-sm btn-ghost checkout-btn" data-alloc-id="${al.id}" data-emp-name="${Helpers.escapeHtml(al.employee_name)}" style="color:var(--danger); font-size:11px; padding:2px 8px">🚪 Checkout</button>
              </div>
            `).join('')}
          <        <!-- Section 2: Month-Wise Cycles Grid -->
        <div style="margin-top: 10px;">
        <!-- Section 2: Month-Wise Cycles Data Table -->
        <div style="margin-top: 24px;">
          <h4 class="font-700 text-sm mb-3">📅 Monthly Billing Cycles</h4>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CYCLE MONTH</th>
                  <th>DATE RANGE</th>
                  <th style="text-align:center">RENT STATUS</th>
                  <th style="text-align:center">POWER STATUS</th>
                  <th style="text-align:center">STAYED</th>
                  <th style="text-align:center">ACTION</th>
                </tr>
              </thead>
              <tbody>
                ${cycles.map((c, idx) => {
                  const landlordPayment = r.payouts.find(p => p.cycle_start_date === c.startDate);
                  const isLandlordPaid = landlordPayment && landlordPayment.status === 'Paid';
                  const electricityReading = r.readings.find(e => e.cycle_start_date === c.startDate);
                  const isElectricityLogged = !!electricityReading;
                  const cycleOccupants = r.allocations.filter(al =>
                    al.check_in_date <= c.endDate && (!al.check_out_date || al.check_out_date >= c.startDate)
                  );

                  // Label cycle by the END month (e.g. 25 May–23 Jun = "June")
                  const endDate = new Date(c.endDate + 'T00:00:00');
                  const monthName = endDate.toLocaleString('en-IN', { month: 'long' });
                  const yearLabel = endDate.getFullYear();

                  const todayIso = Helpers.todayIso(new Date());
                  let badgeHtml = '';
                  if (todayIso >= c.startDate && todayIso <= c.endDate) {
                    badgeHtml = '<div class="text-xs" style="color:var(--accent); font-weight:800">CURRENT</div>';
                  } else if (todayIso < c.startDate) {
                    badgeHtml = '<div class="text-xs" style="color:var(--warning); font-weight:800">UPCOMING</div>';
                  }

                  return `
                    <tr class="cycle-card" data-cycle-start="${c.startDate}" data-cycle-end="${c.endDate}" style="cursor:pointer;">
                      <td>
                        <div class="font-600">${monthName} ${yearLabel}</div>
                        ${badgeHtml}
                      </td>
                      <td class="text-muted text-sm">
                        ${Helpers.formatDateShort(c.startDate)} – ${Helpers.formatDateShort(c.endDate)}
                      </td>
                      <td style="text-align:center">
                        <span class="badge ${isLandlordPaid ? 'badge-success' : 'badge-warning'}">
                          ${isLandlordPaid ? '✓ Paid' : '⏳ Due'}
                        </span>
                      </td>
                      <td style="text-align:center">
                        <span class="badge ${isElectricityLogged ? 'badge-success' : 'badge-warning'}">
                          ${isElectricityLogged ? '✓ Logged' : '🔌 Due'}
                        </span>
                      </td>
                      <td style="text-align:center">
                        <div class="font-600">${cycleOccupants.length}</div>
                      </td>
                      <td style="text-align:center">
                        <button class="btn btn-sm btn-primary" style="width:100%">View</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Section 3: Room Food Expenses -->
        <div class="room-section" style="margin-top: 24px;">
          <div class="room-section-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span>🍲 Room Food Expenses</span>
            <button class="btn btn-sm btn-ghost log-food-prefilled-btn" data-room-id="${r.id}" style="color:var(--accent); font-weight:700">+ Log Food Expense</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Paid By</th>
                  <th>Employee</th>
                  <th style="text-align:right">Amount</th>
                  <th>Status</th>
                  <th style="text-align:center">Action</th>
                </tr>
              </thead>
              <tbody>
                ${(r.foodExpenses || []).length === 0 ? `
                  <tr><td colspan="6" class="text-center p-3 text-muted text-xs">No food expenses logged for this room yet.</td></tr>
                ` : r.foodExpenses.map(fe => {
                  let badgeClass = 'badge-muted';
                  let statusLabel = '—';
                  if (fe.paid_by === 'Employee') {
                    if (fe.payment_id) {
                      badgeClass = 'badge-success';
                      statusLabel = '✓ Reimbursed';
                    } else {
                      badgeClass = 'badge-warning';
                      statusLabel = '⏳ Pending';
                    }
                  }
                  return `
                    <tr style="font-size:0.85rem">
                      <td class="text-muted">${Helpers.formatDate(fe.date)}</td>
                      <td><span class="badge ${fe.paid_by === 'Employer' ? 'badge-info' : 'badge-accent'}">${fe.paid_by}</span></td>
                      <td>${fe.employee_name ? Helpers.escapeHtml(fe.employee_name) : '—'}</td>
                      <td style="text-align:right" class="amount font-600">${API.fmtRupees(fe.amount)}</td>
                      <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
                      <td style="text-align:center">
                        <button class="btn btn-sm btn-ghost del-room-food-btn" data-id="${fe.id}" ${fe.payment_id ? 'disabled' : ''} style="color:var(--danger); padding:2px 6px">✕</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Actions -->
        <div class="card-footer-actions">
          <button class="btn btn-sm btn-ghost edit-room-btn" data-room-id="${r.id}" style="color:var(--text-muted)">✏️ Edit Room</button>
          <button class="btn btn-sm btn-ghost del-room-btn" data-room-id="${r.id}" style="color:var(--danger)">🗑️ Delete</button>
        </div>
      </div>
    `;
  }

  function openCycleDetailsModal(r, c) {
    const landlordPayment = r.payouts.find(p => p.cycle_start_date === c.startDate);
    const isLandlordPaid = landlordPayment && landlordPayment.status === 'Paid';

    const electricityReading = r.readings.find(e => e.cycle_start_date === c.startDate);
    const isElectricityLogged = !!electricityReading;

    const cycleOccupants = r.allocations.filter(al => 
      al.check_in_date <= c.endDate && (!al.check_out_date || al.check_out_date >= c.startDate)
    );

    const cycles = getRoomCycles(r);
    const currentCycleIdx = cycles.findIndex(x => x.startDate === c.startDate);
    let prevReading = r.initial_electricity_reading || 0;
    if (currentCycleIdx !== -1 && currentCycleIdx < cycles.length - 1) {
      const prevCycle = cycles[currentCycleIdx + 1];
      const prevReadingRecord = r.readings.find(e => e.cycle_start_date === prevCycle.startDate);
      if (prevReadingRecord) {
        prevReading = prevReadingRecord.current_reading;
      }
    } else {
      const olderReadings = r.readings.filter(e => e.cycle_start_date < c.startDate);
      if (olderReadings.length > 0) {
        prevReading = olderReadings[0].current_reading;
      }
    }

    const endDate = new Date(c.endDate + 'T00:00:00');
    const cycleMonthLabel = endDate.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

    Modal.open({
      title: `📅 ${cycleMonthLabel} — ${Helpers.formatDateShort(c.startDate)} to ${Helpers.formatDateShort(c.endDate)}`,

      size: 'modal-md',
      body: `
        <div class="cycle-details-modal" style="display:flex; flex-direction:column; gap:16px">
          <!-- 1. Rent Payout Detail -->
          <div class="room-section">
            <div class="room-section-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px; margin-bottom: 10px; font-weight:700; color:var(--text); font-size:0.9rem; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span>💳 Landlord Rent Payout</span>
                <span class="badge ${isLandlordPaid ? 'badge-success' : 'badge-warning'}">${isLandlordPaid ? 'Paid' : 'Pending'}</span>
              </div>
              ${isLandlordPaid ? `<button class="btn btn-sm btn-ghost del-landlord-btn" data-id="${landlordPayment.id}" style="color:var(--danger); padding:2px 6px; font-size:0.75rem">🗑️ Delete</button>` : ''}
            </div>
            ${isLandlordPaid ? `
              <div class="utility-row mb-1">
                <span class="text-muted">Paid to Landlord:</span>
                <span class="font-600">${Helpers.escapeHtml(r.landlord_name || 'N/A')}</span>
              </div>
              <div class="utility-row mb-1">
                <span class="text-muted">Amount Paid:</span>
                <span class="font-700 text-success">${API.fmtRupees(landlordPayment.amount_paid)}</span>
              </div>
              <div class="utility-row mb-1">
                <span class="text-muted">Paid On:</span>
                <span>${Helpers.formatDate(landlordPayment.payment_date)}</span>
              </div>
              <div class="utility-row mb-1">
                <span class="text-muted">Payment Mode:</span>
                <span>${landlordPayment.payment_mode}</span>
              </div>
              <div class="utility-row">
                <span class="text-muted">Reference / UTR:</span>
                <span class="font-mono text-xs" style="background:var(--bg-card); padding:2px 6px; border-radius:4px; border:1px solid var(--border-subtle)">${landlordPayment.reference_no || 'N/A'}</span>
              </div>
            ` : `
              <p class="text-xs text-muted mb-3">No rent payout recorded for this cycle.</p>
              <button class="btn btn-sm btn-primary pay-landlord-btn" 
                      style="background:rgba(217, 119, 6, 0.15); color:#d97706; border:1px solid rgba(217, 119, 6, 0.3); font-weight:700">
                Record Landlord Payout
              </button>
            `}
          </div>

          <!-- 2. Utility Detail -->
          <div class="room-section">
            <div class="room-section-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px; margin-bottom: 10px; font-weight:700; color:var(--text); font-size:0.9rem; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span>⚡ Electricity Invoice & Reading</span>
                <span class="badge ${isElectricityLogged ? 'badge-success' : 'badge-warning'}">${isElectricityLogged ? 'Logged' : 'Reading Due'}</span>
              </div>
              ${isElectricityLogged ? `<button class="btn btn-sm btn-ghost del-reading-btn" data-id="${electricityReading.id}" style="color:var(--danger); padding:2px 6px; font-size:0.75rem">🗑️ Delete</button>` : ''}
            </div>
            ${isElectricityLogged ? `
              <div class="utility-row mb-1">
                <span class="text-muted">Meter State:</span>
                <span>${electricityReading.previous_reading} → ${electricityReading.current_reading} (${electricityReading.units_consumed} units)</span>
              </div>
              <div class="utility-row mb-1">
                <span class="text-muted">Bill Amount:</span>
                <span class="font-700 text-danger">${API.fmtRupees(electricityReading.total_bill_amount)} <span class="text-xs text-muted">(${electricityReading.payer_type})</span></span>
              </div>
              <div class="utility-row mb-1">
                <span class="text-muted">Bill Status:</span>
                <span class="font-600 text-success">${electricityReading.payment_status}</span>
              </div>
              ${electricityReading.payment_status === 'Paid' ? `
                <div class="utility-row mb-1">
                  <span class="text-muted">Paid On:</span>
                  <span>${Helpers.formatDate(electricityReading.payment_date)} (${electricityReading.payment_mode})</span>
                </div>
                <div class="utility-row">
                  <span class="text-muted">Reference / UTR:</span>
                  <span class="font-mono text-xs" style="background:var(--bg-card); padding:2px 6px; border-radius:4px; border:1px solid var(--border-subtle)">${electricityReading.reference_no || 'N/A'}</span>
                </div>
              ` : ''}
            ` : `
              <p class="text-xs text-muted mb-3">No meter reading recorded for this cycle.</p>
              <button class="btn btn-sm btn-primary log-utility-btn" 
                      style="background:rgba(139, 92, 246, 0.15); color:#8b5cf6; border:1px solid rgba(139, 92, 246, 0.3); font-weight:700">
                Submit Meter Reading
              </button>
            `}
          </div>

          <!-- 3. Cycle Occupants Detail -->
          <div class="room-section">
            <div class="room-section-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px; margin-bottom: 10px; font-weight:700; color:var(--text); font-size:0.9rem">
              <span>👥 Occupants During Cycle</span>
              <span class="badge badge-info">${cycleOccupants.length} Stayed</span>
            </div>
            <div class="occupants-list">
              ${cycleOccupants.length === 0 ? `
                <div class="text-xs text-muted p-2 text-center">No occupants checked in during this cycle.</div>
              ` : cycleOccupants.map(o => `
                <div class="occupant-item" style="padding: 6px 12px; font-size: 0.8rem; background:var(--bg-card)">
                  <div>
                    <span class="font-600">${Helpers.escapeHtml(o.employee_name)}</span>
                    <div class="text-xs text-muted">Stayed: ${Helpers.formatDateShort(o.check_in_date)} to ${o.check_out_date ? Helpers.formatDateShort(o.check_out_date) : 'Present'}</div>
                  </div>
                  <span class="badge badge-muted" style="font-size: 10px">${o.payer_type === 'Company' ? 'Perk' : 'Deducted'}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-success wa-report-btn" style="background:#25D366; color:#fff; border:none; margin-right:auto; font-weight:700">
          <svg style="margin-right:6px" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
          WhatsApp Room Captain
        </button>
        <button class="btn btn-secondary" onclick="Modal.close()">Close Details</button>
      `
    });

    const waModalEl = document.getElementById('global-modal');

    const waBtn = waModalEl.querySelector('.wa-report-btn');
    if (waBtn) {
      waBtn.addEventListener('click', () => {
        if (cycleOccupants.length === 0) {
          Toast.warning('No occupants in this cycle to send a report to.');
          return;
        }
        const captain = cycleOccupants[0]; // first member is room captain
        const phoneRaw = captain.employee_phone || '';
        const phone = phoneRaw.replace(/\D/g, '');
        if (!phone) {
          Toast.warning('No phone number saved for the room captain (' + captain.employee_name + ').');
          return;
        }
        const finalPhone = phone.length === 10 ? '91' + phone : phone;
        
        let report = `Dear ${captain.employee_name},\n\nHere is the cycle report for Room ${r.room_no} (${cycleMonthLabel}):\n\n`;
        if (isLandlordPaid) {
          report += `✅ *Rent Payout*\nAmount: ₹${API.fmtRupees(landlordPayment.amount_paid, true)}\nPaid On: ${Helpers.formatDate(landlordPayment.payment_date)}\nMode: ${landlordPayment.payment_mode}\n`;
        } else {
          report += `⏳ *Rent Payout*: Pending\n`;
        }
        
        report += `\n`;
        
        if (isElectricityLogged) {
          report += `⚡ *Electricity*\nBill: ₹${API.fmtRupees(electricityReading.total_bill_amount, true)}\nReading: ${electricityReading.previous_reading} → ${electricityReading.current_reading} (${electricityReading.units_consumed} units)\nStatus: ${electricityReading.payment_status}\n`;
        } else {
          report += `🔌 *Electricity*: Reading Due\n`;
        }
        
        report += `\nThank you.`;
        
        window.open(`https://wa.me/${finalPhone}?text=${encodeURIComponent(report)}`, '_blank');
      });
    }

    document.querySelectorAll('.del-landlord-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Modal.confirm('Are you sure you want to delete this rent payout record? You can re-record it afterwards.', async () => {
          const res = await API.deleteLandlordPayment(parseInt(btn.dataset.id));
          if (res.success) {
            Toast.success('Rent payout record deleted.');
            Modal.close();
            load();
          } else {
            Toast.error(res.error);
          }
        }, { title: 'Delete Rent Record', danger: true });
      });
    });

    document.querySelectorAll('.del-reading-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Modal.confirm('Are you sure you want to delete this electricity reading? You can re-record it afterwards.', async () => {
          const res = await API.deleteElectricityReading(parseInt(btn.dataset.id));
          if (res.success) {
            Toast.success('Electricity reading deleted.');
            Modal.close();
            load();
          } else {
            Toast.error(res.error);
          }
        }, { title: 'Delete Reading', danger: true });
      });
    });

    const modalEl = document.getElementById('global-modal');
    
    const payBtn = modalEl.querySelector('.pay-landlord-btn');
    if (payBtn) {
      payBtn.addEventListener('click', () => {
        Modal.close();
        openRentPaymentForm(r.id, c.startDate, c.endDate, r.monthly_rent);
      });
    }

    const logBtn = modalEl.querySelector('.log-utility-btn');
    if (logBtn) {
      logBtn.addEventListener('click', () => {
        Modal.close();
        openElectricityReadingForm(r.id, c.startDate, c.endDate, prevReading);
      });
    }
  }

  function bindEvents() {
    // Check-In Staff
    container().querySelectorAll('.checkin-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openAllocationForm(parseInt(btn.dataset.roomId));
      });
    });

    // Check-Out Staff
    container().querySelectorAll('.checkout-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openCheckoutForm(parseInt(btn.dataset.allocId), btn.dataset.empName);
      });
    });

    // Record Landlord payout
    container().querySelectorAll('.pay-landlord-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openRentPaymentForm(
          parseInt(btn.dataset.roomId),
          btn.dataset.start,
          btn.dataset.end,
          parseInt(btn.dataset.rent)
        );
      });
    });

    // Submit Electricity Reading
    container().querySelectorAll('.log-utility-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openElectricityReadingForm(
          parseInt(btn.dataset.roomId),
          btn.dataset.start,
          btn.dataset.end,
          parseFloat(btn.dataset.prev)
        );
      });
    });

    // Share Room Captain Details via WhatsApp
    container().querySelectorAll('.room-captain-wa-trigger').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.roomId);
        const room = _roomsData.find(x => x.id === id);
        if (room) {
          sendRoomDetailsWhatsApp(room);
        }
      });
    });

    // Edit Room
    container().querySelectorAll('.edit-room-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.roomId);
        const room = _roomsData.find(x => x.id === id);
        openRoomForm(room);
      });
    });

    // Delete Room
    container().querySelectorAll('.del-room-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteRoom(parseInt(btn.dataset.roomId));
      });
    });

    // Log Food Expense prefilled
    container().querySelectorAll('.log-food-prefilled-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openFoodExpenseForm(parseInt(btn.dataset.roomId));
      });
    });

    // Delete Room Food Expense inside Room Detail
    container().querySelectorAll('.del-room-food-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        Modal.confirm('Are you sure you want to delete this food expense record?', async () => {
          const res = await API.deleteRoomFoodExpense(id);
          if (res.success) {
            Toast.success('Deleted successfully.');
            load();
          } else {
            Toast.error(res.error);
          }
        }, { title: 'Delete Food Expense', danger: true });
      });
    });
  }

  // ── 5. FORM MODAL DIALOGS ──────────────────────────────────────────────────

  // Room Creation / Edit Form Modal
  function openRoomForm(r = null) {
    Modal.open({
      title: r ? '✏️ Edit Rented Accommodation' : '🏨 Configure New Accommodation',
      size: 'modal-lg',
      body: `
        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label font-700">Room Number / Name</label>
            <input type="text" id="rm-room-no" class="form-input" placeholder="e.g. Room A" value="${r ? Helpers.escapeHtml(r.room_no) : ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label font-700">Max Occupancy Capacity</label>
            <input type="number" id="rm-capacity" class="form-input" min="1" value="${r ? r.max_capacity : '4'}" required />
          </div>
        </div>

        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label font-700">Location / Site Address</label>
            <input type="text" id="rm-location" class="form-input" placeholder="City or landmark" value="${r ? Helpers.escapeHtml(r.location || '') : ''}" />
          </div>
          <div class="form-group">
            <label class="form-label font-700">Assign to Project Site</label>
            <select id="rm-project" class="form-select">
              <option value="">General (No project linkage)</option>
              ${_projects.map(p => `<option value="${p.id}" ${r && r.project_id === p.id ? 'selected' : ''}>${Helpers.escapeHtml(p.name)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label font-700">Lease Start Date</label>
            <input type="date" id="rm-lease-start" class="form-input" value="${r ? r.lease_start_date : Helpers.todayIso()}" required />
          </div>
          <div class="form-group">
            <label class="form-label font-700">Monthly Rent Amount (₹)</label>
            <input type="number" step="0.01" id="rm-rent" class="form-input" placeholder="e.g. 6000" value="${r ? API.toRupees(r.monthly_rent) : ''}" required />
          </div>
        </div>

        <div class="nav-divider mb-3"></div>
        <h4 class="font-700 text-sm mb-3">Landlord & Utility Info</h4>

        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label font-700">Landlord Name</label>
            <input type="text" id="rm-landlord" class="form-input" placeholder="Landlord Name" value="${r ? Helpers.escapeHtml(r.landlord_name || '') : ''}" />
          </div>
          <div class="form-group">
            <label class="form-label font-700">Landlord Phone</label>
            <input type="text" id="rm-phone" class="form-input" placeholder="Phone Number" value="${r ? Helpers.escapeHtml(r.landlord_phone || '') : ''}" />
          </div>
        </div>

        <div class="form-group mb-3">
          <label class="form-label font-700">Landlord Bank Account / UPI ID Details</label>
          <input type="text" id="rm-bank" class="form-input" placeholder="UPI ID or Bank Acc No & IFSC" value="${r ? Helpers.escapeHtml(r.landlord_payment_details || '') : ''}" />
        </div>

        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label font-700">Electricity Meter Serial Number</label>
            <input type="text" id="rm-meter" class="form-input" placeholder="Meter ID / Number" value="${r ? Helpers.escapeHtml(r.electricity_meter_no || '') : ''}" />
          </div>
          <div class="form-group">
            <label class="form-label font-700">Initial Meter Reading (Rent Start)</label>
            <input type="number" step="0.1" id="rm-initial-reading" class="form-input" placeholder="e.g. 0.0" value="${r ? (r.initial_electricity_reading || 0) : '0.0'}" />
          </div>
        </div>

        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label font-700">Room Status</label>
            <select id="rm-status" class="form-select">
              <option value="active" ${r && r.status === 'active' ? 'selected' : ''}>Active / In Use</option>
              <option value="inactive" ${r && r.status === 'inactive' ? 'selected' : ''}>Inactive / Leased Ended</option>
              <option value="closed" ${r && r.status === 'closed' ? 'selected' : ''}>Closed Room</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label font-700">Room Captain</label>
            <select id="rm-captain" class="form-select">
              <option value="">-- No Captain Selected --</option>
              ${_employees.map(e => `<option value="${e.id}" ${r && r.room_captain_id === e.id ? 'selected' : ''}>${Helpers.escapeHtml(e.name)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-group" id="rm-closed-date-group" style="display:${r && r.status === 'closed' ? 'block' : 'none'}">
          <label class="form-label font-700">Room Closed Date</label>
          <input type="date" id="rm-closed-date" class="form-input" value="${r && r.closed_date ? r.closed_date : Helpers.todayIso()}" />
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="save-room-btn">Save Room</button>
      `
    });

    const statusSel = document.getElementById('rm-status');
    const closedGroup = document.getElementById('rm-closed-date-group');
    statusSel.addEventListener('change', () => {
      closedGroup.style.display = (statusSel.value === 'closed') ? 'block' : 'none';
    });

    document.getElementById('save-room-btn').addEventListener('click', async () => {
      const data = {
        roomNo: document.getElementById('rm-room-no').value,
        maxCapacity: parseInt(document.getElementById('rm-capacity').value),
        location: document.getElementById('rm-location').value,
        projectId: document.getElementById('rm-project').value ? parseInt(document.getElementById('rm-project').value) : null,
        leaseStartDate: document.getElementById('rm-lease-start').value,
        monthlyRent: parseFloat(document.getElementById('rm-rent').value || 0),
        landlordName: document.getElementById('rm-landlord').value,
        landlordPhone: document.getElementById('rm-phone').value,
        landlordPaymentDetails: document.getElementById('rm-bank').value,
        electricity_meter_no: document.getElementById('rm-meter').value,
        status: document.getElementById('rm-status').value,
        closedDate: document.getElementById('rm-closed-date') ? document.getElementById('rm-closed-date').value : null,
        initialElectricityReading: parseFloat(document.getElementById('rm-initial-reading').value || 0),
        roomCaptainId: document.getElementById('rm-captain').value ? parseInt(document.getElementById('rm-captain').value) : null
      };

      if (!data.roomNo || !data.leaseStartDate || !data.monthlyRent) {
        return Toast.error('Please fill in all required fields (Room No, Lease Start, Rent).');
      }

      Helpers.setLoading('save-room-btn', true);
      let res;
      if (r) {
        res = await API.updateRoom(r.id, data);
      } else {
        res = await API.createRoom(data);
      }
      Helpers.setLoading('save-room-btn', false);

      if (res.success) {
        Toast.success(r ? 'Accommodation details updated.' : 'New accommodation configured successfully!');
        Modal.close();
        
        // If a captain is selected, automatically share details via WhatsApp
        if (data.roomCaptainId) {
          const capEmp = _employees.find(e => e.id === data.roomCaptainId);
          if (capEmp) {
            const tempRoom = {
              room_no: data.roomNo,
              location: data.location,
              lease_start_date: data.leaseStartDate,
              monthly_rent: data.monthlyRent * 100, // API.fmtRupees expects paisa
              electricity_meter_no: data.electricity_meter_no,
              initial_electricity_reading: data.initialElectricityReading,
              landlord_payment_details: data.landlordPaymentDetails,
              room_captain_id: data.roomCaptainId,
              captain_name: capEmp.name,
              captain_phone: capEmp.phone
            };
            sendRoomDetailsWhatsApp(tempRoom);
          }
        }

        // If it was a new room, we want to stay in folders view. If edited, keep view mode.
        if (res.roomId && !r) {
          _viewMode = 'folders';
          _selectedRoomId = null;
        }
        
        load();
      } else {
        Toast.error(res.error);
      }
    });
  }

  // Employee Room Check-In Form Modal
  function openAllocationForm(preSelectedRoomId = null) {
    Modal.open({
      title: '👥 Check-In Employee to Accommodation',
      size: 'modal-lg',
      body: `
        <div class="form-group mb-3">
          <label class="form-label font-700">Select Room</label>
          <select id="al-room" class="form-select">
            ${_roomsData.map(x => `<option value="${x.id}" ${preSelectedRoomId === x.id ? 'selected' : ''}>Room ${Helpers.escapeHtml(x.room_no)} (Cap: ${x.allocations.filter(al=>!al.check_out_date).length}/${x.max_capacity}) - ${Helpers.escapeHtml(x.location || 'Site')}</option>`).join('')}
          </select>
        </div>

        <div class="form-group mb-3">
          <label class="form-label font-700">Search Team Member</label>
          <input list="al-emp-list" id="al-emp-search" class="form-input" placeholder="Type name or ID to lookup..." autocomplete="off" />
          <datalist id="al-emp-list">
            ${_employees.map(e => `<option value="${Helpers.escapeHtml(e.name)} (EMP${e.id})"></option>`).join('')}
          </datalist>
        </div>

        <div class="form-group mb-3">
          <label class="form-label font-700">Check-In Date</label>
          <input type="date" id="al-checkin" class="form-input" value="${Helpers.todayIso()}" required />
        </div>

        <div class="form-group mb-3">
          <label class="form-label font-700">Rent Payer Settings</label>
          <select id="al-payer" class="form-select">
            <option value="Company">Company-Paid (Accommodation provided as a perk)</option>
            <option value="Employee">Employee-Paid (Rent deducted from salary)</option>
          </select>
        </div>

        <div id="al-rent-settings" style="display:none" class="alert alert-warning py-3 px-4 mb-3">
          <div class="form-group mb-2">
            <label class="form-label font-700">Rent Deduction Model</label>
            <select id="al-model" class="form-select">
              <option value="split">Dynamic Split (Rent divided equally among roommates)</option>
              <option value="fixed">Fixed Flat Deduction (Constant amount deducted monthly)</option>
            </select>
          </div>
          <div class="form-group" id="al-fixed-group" style="display:none">
            <label class="form-label font-700">Monthly Flat Deduction Amount (₹)</label>
            <input type="number" id="al-fixed-amount" class="form-input" placeholder="e.g. 1500" />
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="save-alloc-btn">Confirm Check-In</button>
      `
    });

    const payerSel = document.getElementById('al-payer');
    const rentSettings = document.getElementById('al-rent-settings');
    const modelSel = document.getElementById('al-model');
    const fixedGroup = document.getElementById('al-fixed-group');

    payerSel.addEventListener('change', () => {
      rentSettings.style.display = payerSel.value === 'Employee' ? 'block' : 'none';
    });

    modelSel.addEventListener('change', () => {
      fixedGroup.style.display = modelSel.value === 'fixed' ? 'block' : 'none';
    });

    document.getElementById('save-alloc-btn').addEventListener('click', async () => {
      const empSearch = document.getElementById('al-emp-search').value;
      const match = empSearch.match(/\(EMP(\d+)\)$/);
      const employeeId = match ? parseInt(match[1]) : null;

      const data = {
        roomId: parseInt(document.getElementById('al-room').value),
        employeeId,
        checkInDate: document.getElementById('al-checkin').value,
        payerType: payerSel.value,
        rentModel: modelSel.value,
        fixedDeductionAmount: parseFloat(document.getElementById('al-fixed-amount').value || 0)
      };

      if (!data.roomId || !data.employeeId || !data.checkInDate) {
        return Toast.error('Please select a valid room, employee, and check-in date.');
      }

      Helpers.setLoading('save-alloc-btn', true);
      const res = await API.allocateRoom(data);
      Helpers.setLoading('save-alloc-btn', false);

      if (res.success) {
        Toast.success('Employee checked in successfully!');
        Modal.close();
        load();
      } else {
        Toast.error(res.error);
      }
    });
  }

  // Employee Check-Out Form Modal
  function openCheckoutForm(id, name) {
    Modal.open({
      title: '🚪 Check-Out Employee',
      size: 'modal-sm',
      body: `
        <p class="text-sm">Record check-out details for <strong>${name}</strong>.</p>
        <div class="form-group mb-3">
          <label class="form-label font-700">Check-Out Date</label>
          <input type="date" id="co-date" class="form-input" value="${Helpers.todayIso()}" required />
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-danger" id="confirm-co-btn">Confirm Check-Out</button>
      `
    });

    document.getElementById('confirm-co-btn').addEventListener('click', async () => {
      const checkOutDate = document.getElementById('co-date').value;
      if (!checkOutDate) return Toast.error('Date required.');

      Helpers.setLoading('confirm-co-btn', true);
      const res = await API.deallocateRoom(id, checkOutDate);
      Helpers.setLoading('confirm-co-btn', false);

      if (res.success) {
        Toast.success('Employee checked out successfully.');
        Modal.close();
        load();
      } else {
        Toast.error(res.error);
      }
    });
  }

  // Landlord Rent Payout recording Modal
  function openRentPaymentForm(roomId, start, end, rentAmount) {
    Modal.open({
      title: '💸 Record Lease Payment to Landlord',
      size: 'modal-md',
      body: `
        <p class="text-sm mb-3">Log monthly lease payout for cycle <strong>${Helpers.formatDate(start)} to ${Helpers.formatDate(end)}</strong>.</p>
        
        <div class="form-group mb-3">
          <label class="form-label font-700">Payment Date</label>
          <input type="date" id="lrp-date" class="form-input" value="${Helpers.todayIso()}" required />
        </div>

        <div class="form-group mb-3">
          <label class="form-label font-700">Paid Amount (₹)</label>
          <input type="number" step="0.01" id="lrp-amount" class="form-input" value="${API.toRupees(rentAmount)}" required />
        </div>

        <div class="form-group mb-3">
          <label class="form-label font-700">Payment Mode</label>
          <select id="lrp-mode" class="form-select">
            <option value="Bank">Bank Account Transfer</option>
            <option value="UPI">UPI (GPay/PhonePe/Paytm)</option>
            <option value="Cash">Cash Payout</option>
          </select>
        </div>

        <div class="form-group mb-3">
          <label class="form-label font-700">Transaction Reference / UTR Number</label>
          <input type="text" id="lrp-ref" class="form-input" placeholder="e.g. UTR12345678" />
        </div>

        <div class="form-group">
          <label class="form-label font-700">Remarks</label>
          <input type="text" id="lrp-remarks" class="form-input" placeholder="Optional notes" />
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="lrp-save-btn">Confirm Payout</button>
      `
    });

    document.getElementById('lrp-save-btn').addEventListener('click', async () => {
      const data = {
        roomId,
        cycleStartDate: start,
        cycleEndDate: end,
        amountPaid: parseFloat(document.getElementById('lrp-amount').value || 0),
        paymentDate: document.getElementById('lrp-date').value,
        paymentMode: document.getElementById('lrp-mode').value,
        referenceNo: document.getElementById('lrp-ref').value,
        remarks: document.getElementById('lrp-remarks').value
      };

      if (!data.paymentDate || !data.amountPaid) {
        return Toast.error('Please specify payment date and amount paid.');
      }

      Helpers.setLoading('lrp-save-btn', true);
      const res = await API.payLandlordRent(data);
      Helpers.setLoading('lrp-save-btn', false);

      if (res.success) {
        Toast.success('Landlord payout recorded.');
        Modal.close();
        load();
      } else {
        Toast.error(res.error);
      }
    });
  }

  // Electricity meter Reading Submission Modal
  function openElectricityReadingForm(roomId, start, end, prevReading) {
    Modal.open({
      title: '🔌 Submit Electricity Meter Reading',
      size: 'modal-md',
      body: `
        <p class="text-sm mb-3">Record utility metrics for cycle <strong>${Helpers.formatDate(start)} to ${Helpers.formatDate(end)}</strong>.</p>
        
        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label font-700">Previous Reading</label>
            <input type="number" step="0.1" id="elr-prev" class="form-input" value="${prevReading}" readonly />
          </div>
          <div class="form-group">
            <label class="form-label font-700">Current Reading (Meters State)</label>
            <input type="number" step="0.1" id="elr-curr" class="form-input" placeholder="Enter meter state" required />
          </div>
        </div>

        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label font-700">Rate Per Unit (₹)</label>
            <input type="number" step="0.1" id="elr-rate" class="form-input" value="8.0" required />
          </div>
          <div class="form-group">
            <label class="form-label font-700">Fixed Surcharges (₹)</label>
            <input type="number" step="0.01" id="elr-fixed" class="form-input" value="0.0" />
          </div>
        </div>

        <div class="form-group mb-3">
          <label class="form-label font-700">Consumption Estimate</label>
          <div class="alert alert-info py-2 px-3 text-sm font-700 m-0" id="elr-calc-preview">Units Consumed: 0 | Bill Estimate: ₹0.00</div>
        </div>

        <div class="form-group mb-3">
          <label class="form-label font-700">Utility Payer Settings</label>
          <select id="elr-payer" class="form-select">
            <option value="Company">Company-Paid (Operational project site expense)</option>
            <option value="Employee">Employee-Paid (Split equally and deducted from occupants)</option>
          </select>
        </div>

        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label font-700">Bill Payment Status</label>
            <select id="elr-status" class="form-select">
              <option value="Pending">Pending Payment (Record unpaid liability)</option>
              <option value="Paid">Already Paid (Log payout to utility provider)</option>
            </select>
          </div>
        </div>

        <div id="elr-payout-fields" style="display:none" class="alert alert-success py-3 px-4">
          <div class="form-group mb-2">
            <label class="form-label font-700">Payout Date</label>
            <input type="date" id="elr-pay-date" class="form-input" value="${Helpers.todayIso()}" />
          </div>
          <div class="form-group mb-2">
            <label class="form-label font-700">Payout Mode</label>
            <select id="elr-pay-mode" class="form-select">
              <option value="UPI">UPI (GPay/PhonePe)</option>
              <option value="Bank">Bank Net Transfer</option>
              <option value="Cash">Cash Payout</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label font-700">Transaction Reference UTR</label>
            <input type="text" id="elr-pay-ref" class="form-input" placeholder="e.g. UTR09876543" />
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="elr-save-btn">Confirm Readings</button>
      `
    });

    const prevInput = document.getElementById('elr-prev');
    const currInput = document.getElementById('elr-curr');
    const rateInput = document.getElementById('elr-rate');
    const fixedInput = document.getElementById('elr-fixed');
    const calcPreview = document.getElementById('elr-calc-preview');

    const statusSel = document.getElementById('elr-status');
    const payoutFields = document.getElementById('elr-payout-fields');

    statusSel.addEventListener('change', () => {
      payoutFields.style.display = statusSel.value === 'Paid' ? 'block' : 'none';
    });

    function recalculate() {
      const prev = parseFloat(prevInput.value || 0);
      const curr = parseFloat(currInput.value || 0);
      const rate = parseFloat(rateInput.value || 8.0);
      const fixed = parseFloat(fixedInput.value || 0);

      const units = Math.max(0, curr - prev);
      const total = (units * rate) + fixed;

      calcPreview.innerText = `Units Consumed: ${units.toFixed(1)} | Bill Estimate: ₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    currInput.addEventListener('input', recalculate);
    rateInput.addEventListener('input', recalculate);
    fixedInput.addEventListener('input', recalculate);

    document.getElementById('elr-save-btn').addEventListener('click', async () => {
      const data = {
        roomId,
        cycleStartDate: start,
        cycleEndDate: end,
        previousReading: parseFloat(prevInput.value || 0),
        currentReading: parseFloat(currInput.value),
        ratePerUnit: parseFloat(rateInput.value || 8.0),
        fixedCharges: parseFloat(fixedInput.value || 0),
        payerType: document.getElementById('elr-payer').value,
        paymentStatus: statusSel.value,
        paymentDate: statusSel.value === 'Paid' ? document.getElementById('elr-pay-date').value : null,
        paymentMode: statusSel.value === 'Paid' ? document.getElementById('elr-pay-mode').value : null,
        referenceNo: statusSel.value === 'Paid' ? document.getElementById('elr-pay-ref').value : null
      };

      if (isNaN(data.currentReading) || data.currentReading < data.previousReading) {
        return Toast.error('Current reading must be greater than or equal to previous reading.');
      }

      Helpers.setLoading('elr-save-btn', true);
      const res = await API.saveElectricityReading(data);
      Helpers.setLoading('elr-save-btn', false);

      if (res.success) {
        Toast.success('Electricity readings recorded.');
        Modal.close();
        load();
      } else {
        Toast.error(res.error);
      }
    });
  }

  // Delete Room Action
  async function deleteRoom(id) {
    const room = _roomsData.find(x => x.id === id);
    Modal.confirm(`Are you sure you want to delete Room ${room?.room_no}? This will also delete all historical allocations and payments for this room.`, async () => {
      const res = await API.deleteRoom(id);
      if (res.success) {
        Toast.success('Room deleted successfully.');
        // Go back to folders view if the active detail view room was deleted
        if (_selectedRoomId === id) {
          _viewMode = 'folders';
          _selectedRoomId = null;
        }
        load();
      } else {
        Toast.error(res.error);
      }
    }, { danger: true });
  }

  function renderFoodLedgerView() {
    const q = (_foodSearchQuery || '').toLowerCase().trim();
    
    const filteredExpenses = _foodExpenses.filter(e => {
      if (_foodFilterRoomId && String(e.room_id) !== String(_foodFilterRoomId)) return false;
      if (_foodFilterProjectId && String(e.project_id) !== String(_foodFilterProjectId)) return false;
      if (_foodFilterPaidBy && e.paid_by !== _foodFilterPaidBy) return false;
      
      if (q) {
        const empName = (e.employee_name || '').toLowerCase();
        const dateStr = Helpers.formatDate(e.date).toLowerCase();
        const amountStr = String(e.amount / 100).toLowerCase();
        const roomNo = (e.room_no || '').toLowerCase();
        const projName = (e.project_name || '').toLowerCase();
        
        return empName.includes(q) || dateStr.includes(q) || amountStr.includes(q) || roomNo.includes(q) || projName.includes(q);
      }
      return true;
    });

    const totalAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

    container().innerHTML = `
      <style>
        .food-ledger-dashboard {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
      </style>
      
      <div class="food-ledger-dashboard">
        <!-- Top Summary KPI card -->
        <div class="grid grid-cols-4 gap-4">
          <div class="kpi-card-v3 orange">
            <div class="icon-box">🍲</div>
            <div class="title">Total Food Expenses</div>
            <div class="metric">${API.fmtRupees(totalAmount)}</div>
            <div class="footer"><span class="sub">Total across filtered records</span></div>
          </div>
          <div class="kpi-card-v3 blue">
            <div class="icon-box">🏢</div>
            <div class="title">Employer Paid</div>
            <div class="metric">${API.fmtRupees(filteredExpenses.filter(e => e.paid_by === 'Employer').reduce((sum, e) => sum + e.amount, 0))}</div>
            <div class="footer"><span class="sub">Company direct cost</span></div>
          </div>
          <div class="kpi-card-v3 green">
            <div class="icon-box">👥</div>
            <div class="title">Employee Paid</div>
            <div class="metric">${API.fmtRupees(filteredExpenses.filter(e => e.paid_by === 'Employee').reduce((sum, e) => sum + e.amount, 0))}</div>
            <div class="footer"><span class="sub">Reimbursements routed</span></div>
          </div>
          <div class="kpi-card-v3 purple">
            <div class="icon-box">✅</div>
            <div class="title">Reimbursements Settled</div>
            <div class="metric">${API.fmtRupees(filteredExpenses.filter(e => e.paid_by === 'Employee' && e.payment_id).reduce((sum, e) => sum + e.amount, 0))}</div>
            <div class="footer"><span class="sub">Processed via Payroll</span></div>
          </div>
        </div>

        <!-- Filter bar -->
        <div class="toolbar">
          <div class="toolbar-left flex gap-2 items-center" style="flex-wrap:wrap">
            <select id="fl-filter-room" class="form-select" style="width:150px">
              <option value="">All Rooms</option>
              ${_roomsData.map(r => `<option value="${r.id}" ${String(r.id) === String(_foodFilterRoomId) ? 'selected' : ''}>Room ${Helpers.escapeHtml(r.room_no)}</option>`).join('')}
            </select>
            <select id="fl-filter-project" class="form-select" style="width:160px">
              <option value="">All Projects</option>
              ${_projects.map(p => `<option value="${p.id}" ${String(p.id) === String(_foodFilterProjectId) ? 'selected' : ''}>${Helpers.escapeHtml(p.name)}</option>`).join('')}
            </select>
            <select id="fl-filter-paidby" class="form-select" style="width:140px">
              <option value="">All Payer Types</option>
              <option value="Employer" ${_foodFilterPaidBy === 'Employer' ? 'selected' : ''}>Employer</option>
              <option value="Employee" ${_foodFilterPaidBy === 'Employee' ? 'selected' : ''}>Employee</option>
            </select>
            <div class="search-bar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input id="fl-search" class="form-input" placeholder="Search ledger..." value="${Helpers.escapeHtml(_foodSearchQuery)}" style="width:220px" />
            </div>
          </div>
          <div class="toolbar-right">
            <button id="log-food-btn" class="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Log Food Expense
            </button>
          </div>
        </div>

        <!-- Ledger Table -->
        <div id="food-ledger-list-container">
          ${filteredExpenses.length === 0 ? `
            <div class="empty-state">
              <h3>No food expenses logged</h3>
              <p>No records match your criteria.</p>
            </div>
          ` : `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Room</th>
                    <th>Project</th>
                    <th>Paid By</th>
                    <th>Employee Name</th>
                    <th style="text-align:right">Amount</th>
                    <th>Payroll Status</th>
                    <th style="text-align:center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${filteredExpenses.map(e => {
                    let badgeClass = 'badge-muted';
                    let statusLabel = '—';
                    if (e.paid_by === 'Employee') {
                      if (e.payment_id) {
                        badgeClass = 'badge-success';
                        statusLabel = '✓ Reimbursed';
                      } else {
                        badgeClass = 'badge-warning';
                        statusLabel = '⏳ Pending Salary';
                      }
                    }

                    return `
                      <tr>
                        <td class="text-muted text-sm">${Helpers.formatDate(e.date)}</td>
                        <td class="font-600">Room ${Helpers.escapeHtml(e.room_no)}</td>
                        <td><span class="badge badge-subtle">${Helpers.escapeHtml(e.project_name)}</span></td>
                        <td><span class="badge ${e.paid_by === 'Employer' ? 'badge-info' : 'badge-accent'}">${e.paid_by}</span></td>
                        <td class="font-500">${e.employee_name ? Helpers.escapeHtml(e.employee_name) : '—'}</td>
                        <td style="text-align:right" class="amount font-600">${API.fmtRupees(e.amount)}</td>
                        <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
                        <td style="text-align:center">
                          <button class="btn btn-sm btn-ghost del-food-expense-btn" data-id="${e.id}" ${e.payment_id ? 'disabled title="Cannot delete settled payment"' : ''} style="color:var(--danger)">✕</button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>
    `;

    // Bind filters and search
    document.getElementById('fl-filter-room').addEventListener('change', e => {
      _foodFilterRoomId = e.target.value;
      renderFoodLedgerView();
    });
    document.getElementById('fl-filter-project').addEventListener('change', e => {
      _foodFilterProjectId = e.target.value;
      renderFoodLedgerView();
    });
    document.getElementById('fl-filter-paidby').addEventListener('change', e => {
      _foodFilterPaidBy = e.target.value;
      renderFoodLedgerView();
    });
    document.getElementById('fl-search').addEventListener('input', Helpers.debounce(e => {
      _foodSearchQuery = e.target.value;
      renderFoodLedgerView();
    }, 200));

    // Bind action buttons
    document.getElementById('log-food-btn').addEventListener('click', () => openFoodExpenseForm());

    container().querySelectorAll('.del-food-expense-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        Modal.confirm('Are you sure you want to delete this room food expense record?', async () => {
          const res = await API.deleteRoomFoodExpense(id);
          if (res.success) {
            Toast.success('Food expense record deleted.');
            load();
          } else {
            Toast.error(res.error);
          }
        }, { title: 'Delete Food Expense', danger: true });
      });
    });
  }

  function openFoodExpenseForm(preSelectedRoomId = null) {
    let preRoom = _roomsData.find(x => x.id === preSelectedRoomId);
    let preProjId = preRoom ? preRoom.project_id : '';

    Modal.open({
      title: '🍲 Log Room Food Expense',
      size: 'modal-md',
      body: `
        <div class="form-group mb-3">
          <label class="form-label font-700">Select Room</label>
          <select id="fe-room" class="form-select">
            <option value="">-- Select Room --</option>
            ${_roomsData.map(x => `<option value="${x.id}" ${preSelectedRoomId === x.id ? 'selected' : ''}>Room ${Helpers.escapeHtml(x.room_no)} (${Helpers.escapeHtml(x.location || 'Site')})</option>`).join('')}
          </select>
        </div>

        <div class="form-group mb-3">
          <label class="form-label font-700">Assign to Project Site</label>
          <select id="fe-project" class="form-select">
            <option value="">-- Select Project --</option>
            ${_projects.map(p => `<option value="${p.id}" ${preProjId === p.id ? 'selected' : ''}>${Helpers.escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>

        <div class="form-row mb-3">
          <div class="form-group">
            <label class="form-label font-700">Date</label>
            <input type="date" id="fe-date" class="form-input" value="${Helpers.todayIso()}" required />
          </div>
          <div class="form-group">
            <label class="form-label font-700">Amount (₹)</label>
            <input type="number" step="0.01" id="fe-amount" class="form-input" placeholder="0.00" required />
          </div>
        </div>

        <div class="form-group mb-3">
          <label class="form-label font-700">Paid By</label>
          <select id="fe-paid-by" class="form-select">
            <option value="Employer">Employer (Paid directly by company)</option>
            <option value="Employee">Employee (Paid by staff, needs payroll reimbursement)</option>
          </select>
        </div>

        <div id="fe-employee-group" style="display:none" class="form-group mb-3">
          <label class="form-label font-700">Paid By Employee</label>
          <select id="fe-employee" class="form-select">
            <option value="">-- Select Employee --</option>
            ${_employees.map(e => `<option value="${e.id}">${Helpers.escapeHtml(e.name)}</option>`).join('')}
          </select>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="save-fe-btn">Log Expense</button>
      `
    });

    const paidBySel = document.getElementById('fe-paid-by');
    const empGroup = document.getElementById('fe-employee-group');

    paidBySel.addEventListener('change', () => {
      empGroup.style.display = paidBySel.value === 'Employee' ? 'block' : 'none';
    });

    // Auto-select project when room is changed (if the room is linked to a project)
    const roomSel = document.getElementById('fe-room');
    const projSel = document.getElementById('fe-project');
    roomSel.addEventListener('change', () => {
      const selectedRoomId = parseInt(roomSel.value);
      const room = _roomsData.find(x => x.id === selectedRoomId);
      if (room && room.project_id) {
        projSel.value = room.project_id;
      }
    });

    document.getElementById('save-fe-btn').addEventListener('click', async () => {
      const data = {
        roomId: parseInt(roomSel.value),
        projectId: parseInt(projSel.value),
        date: document.getElementById('fe-date').value,
        amount: parseFloat(document.getElementById('fe-amount').value || 0),
        paidBy: paidBySel.value,
        employeeId: document.getElementById('fe-employee').value ? parseInt(document.getElementById('fe-employee').value) : null
      };

      if (!data.roomId || !data.projectId || !data.date || data.amount <= 0 || !data.paidBy) {
        return Toast.error('Please fill in all required fields (Room, Project, Date, Amount, Paid By).');
      }
      if (data.paidBy === 'Employee' && !data.employeeId) {
        return Toast.error('Please select the employee who paid for the food.');
      }

      Helpers.setLoading('save-fe-btn', true);
      const res = await API.createRoomFoodExpense(data);
      Helpers.setLoading('save-fe-btn', false);

      if (res.success) {
        Toast.success('Room food expense logged successfully.');
        Modal.close();
        load();
      } else {
        Toast.error(res.error);
      }
    });
  }

  return { init };
})();
