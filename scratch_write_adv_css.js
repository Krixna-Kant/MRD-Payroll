const fs = require('fs');
const css = `
/* ============================================================================
   ADVANCE LEDGER MODULE
   Staff-wise advance ledger with card grid + timeline ledger view
   ============================================================================ */

/* ── Global Stats Bar ────────────────────────────────────────────────────── */
.adv-stats-bar {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}
.adv-stat-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  position: relative;
  overflow: hidden;
}
.adv-stat-item::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
.adv-stat-item.danger::before  { background: var(--danger); }
.adv-stat-item.accent::before  { background: var(--accent); }
.adv-stat-item.success::before { background: var(--success); }
.adv-stat-item svg { opacity: 0.6; flex-shrink: 0; }
.adv-stat-item.danger svg  { stroke: var(--danger); }
.adv-stat-item.accent svg  { stroke: var(--accent); }
.adv-stat-item.success svg { stroke: var(--success); }
.adv-stat-label { font-size: 0.75rem; color: var(--text-muted); font-weight: 500; }
.adv-stat-value { font-size: 1.5rem; font-weight: 800; margin-top: 2px; }
.adv-stat-item.danger  .adv-stat-value { color: var(--danger);  }
.adv-stat-item.accent  .adv-stat-value { color: var(--accent);  }
.adv-stat-item.success .adv-stat-value { color: var(--success); }

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
.adv-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.adv-toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  padding: 8px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: all var(--transition);
  user-select: none;
}
.adv-toggle-label:hover { border-color: var(--accent); color: var(--text-primary); }
.adv-toggle-label input[type=checkbox] { accent-color: var(--accent); width: 15px; height: 15px; }

/* ── Employee Cards Grid ─────────────────────────────────────────────────── */
.adv-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.adv-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 0;
  cursor: pointer;
  transition: all var(--transition);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}
.adv-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--border);
  transition: background var(--transition);
}
.adv-card.has-outstanding::before { background: linear-gradient(90deg, var(--danger), #fb7185); }
.adv-card.is-settled::before      { background: linear-gradient(90deg, var(--success), #34d399); }
.adv-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
  border-color: var(--accent);
}

.adv-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 16px 12px;
}
.adv-card-avatar {
  width: 44px; height: 44px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--accent), #818cf8);
  color: white;
  font-size: 1.1rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(99,102,241,0.3);
}
.adv-card.has-outstanding .adv-card-avatar {
  background: linear-gradient(135deg, var(--danger), #fb7185);
  box-shadow: 0 4px 12px rgba(244,63,94,0.3);
}
.adv-card-info { flex: 1; min-width: 0; }
.adv-card-name { font-weight: 700; font-size: 0.95rem; }
.adv-card-role { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
.adv-card-status {
  font-size: 0.68rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em;
  padding: 3px 8px; border-radius: var(--radius-full);
}
.adv-card-status.danger  { background: var(--danger-faint);  color: var(--danger);  }
.adv-card-status.success { background: var(--success-faint); color: var(--success); }

.adv-card-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.adv-card-metric {
  display: flex;
  flex-direction: column;
  padding: 10px 16px;
  gap: 2px;
}
.adv-card-metric:first-child { border-right: 1px solid var(--border); }
.adv-metric-label { font-size: 0.7rem; color: var(--text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; }
.adv-metric-val   { font-size: 0.9rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.adv-metric-val.amount-success { color: var(--success); }

.adv-card-outstanding {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
}
.adv-card-outstanding.danger  { background: var(--danger-faint);  }
.adv-card-outstanding.success { background: var(--success-faint); }
.adv-outstanding-label { font-size: 0.78rem; font-weight: 600; color: var(--text-muted); }
.adv-card-outstanding.danger  .adv-outstanding-label { color: var(--danger);  }
.adv-card-outstanding.success .adv-outstanding-label { color: var(--success); }
.adv-outstanding-val {
  font-size: 1.1rem; font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.adv-card-outstanding.danger  .adv-outstanding-val { color: var(--danger);  }
.adv-card-outstanding.success .adv-outstanding-val { color: var(--success); }

.adv-card-footer {
  padding: 8px 16px;
  font-size: 0.72rem;
  color: var(--text-faint);
}

/* ── Ledger View ─────────────────────────────────────────────────────────── */
.adv-ledger-topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.adv-ledger-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}
.adv-ledger-avatar {
  width: 48px; height: 48px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--accent), #818cf8);
  color: white; font-size: 1.3rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 16px rgba(99,102,241,0.3);
}
.adv-ledger-name { font-size: 1.1rem; font-weight: 700; }
.adv-ledger-sub  { font-size: 0.8rem; color: var(--text-muted); margin-top: 2px; }
.adv-ledger-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* ── Summary Cards Row ───────────────────────────────────────────────────── */
.adv-sum-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}
.adv-sum-card {
  padding: 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  text-align: center;
  transition: all var(--transition);
}
.adv-sum-card.accent  { background: var(--accent-faint);  border-color: var(--accent);  }
.adv-sum-card.success { background: var(--success-faint); border-color: var(--success); }
.adv-sum-card.danger  { background: var(--danger-faint);  border-color: var(--danger);  }
.adv-sum-card.muted   { background: var(--bg-card);       border-color: var(--border);  }
.adv-sum-label { font-size: 0.72rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
.adv-sum-val { font-size: 1.25rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.adv-sum-card.accent  .adv-sum-val { color: var(--accent);  }
.adv-sum-card.success .adv-sum-val { color: var(--success); }
.adv-sum-card.danger  .adv-sum-val { color: var(--danger);  }

/* ── Timeline / Ledger Table ─────────────────────────────────────────────── */
.adv-timeline {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.adv-timeline-header {
  display: grid;
  grid-template-columns: 160px 1fr 130px 130px 130px 44px;
  gap: 0;
  padding: 10px 16px;
  background: var(--bg-input);
  border-bottom: 1px solid var(--border);
  font-size: 0.72rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--text-muted);
}
.adv-tx-row {
  display: grid;
  grid-template-columns: 160px 1fr 130px 130px 130px 44px;
  align-items: center;
  gap: 0;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  transition: background var(--transition);
}
.adv-tx-row:last-child { border-bottom: none; }
.adv-tx-row:hover { background: var(--bg-card-hover); }

.adv-tx-cell { padding: 0 4px; }
.adv-tx-type-badge {
  display: inline-block;
  font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  margin-bottom: 4px;
}
.adv-tx-type-badge.danger  { background: var(--danger-faint);  color: var(--danger);  }
.adv-tx-type-badge.success { background: var(--success-faint); color: var(--success); }
.adv-tx-type-badge.muted   { background: var(--bg-input);      color: var(--text-muted); }
.adv-tx-date-val { font-size: 0.78rem; color: var(--text-muted); }

.adv-tx-detail { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.adv-tx-notes { font-size: 0.8rem; color: var(--text-muted); }

.adv-tx-num {
  text-align: right;
  font-size: 0.9rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}
.adv-tx-num.amount-danger  { color: var(--danger);  }
.adv-tx-num.amount-success { color: var(--success); }
.adv-tx-bal { color: var(--text-primary); font-weight: 700; }

/* ── Amount display ──────────────────────────────────────────────────────── */
.amount-danger { color: var(--danger) !important; }
`;

// Append to main.css
const mainCss = require('fs').readFileSync('renderer/css/main.css', 'utf8');
if (!mainCss.includes('ADVANCE LEDGER MODULE')) {
  fs.writeFileSync('renderer/css/main.css', mainCss + css);
  console.log('CSS appended, length:', css.length);
} else {
  console.log('CSS already present, skipping');
}
