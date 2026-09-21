import React, { useState, useCallback } from 'react';
import { useTrading } from '../context/TradingContext';
import {
  Settings as SettingsIcon,
  RefreshCcw,
  Play,
  Pause,
  Timer,
  Download,
  Eye,
  Info,
  AlertTriangle,
  Activity,
  Zap,
  CheckCircle,
  FileText,
  Trash2,
  BarChart3,
  Bell
} from 'lucide-react';

/* ── CSV helpers ── */

const escapeCSV = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
};

const downloadCSV = (filename: string, headers: string[], rows: string[][]) => {
  const csvContent = [
    headers.map(escapeCSV).join(','),
    ...rows.map(row => row.map(escapeCSV).join(','))
  ].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

/* ── Format helpers ── */

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

/* ── Settings Component ── */

const Settings = () => {
  const { trades, orders, settings, autoSimActive, tick, resetAccount, updateSettings } = useTrading();

  const [resetConfirmStep, setResetConfirmStep] = useState<0 | 1 | 2>(0);
  // 0 = default, 1 = confirm prompt, 2 = success feedback
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  /* ── Auto-sim handlers ── */

  const handleToggleAutoSim = () => {
    updateSettings({ autoSimEnabled: !settings.autoSimEnabled });
  };

  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (!isNaN(val)) {
      updateSettings({ autoSimIntervalSec: val });
    }
  };

  /* ── Display pref handler ── */

  const handleTogglePnlPercent = () => {
    updateSettings({ showPnlPercent: !settings.showPnlPercent });
  };

  const handleToggleNotifications = () => {
    updateSettings({ notificationsEnabled: !settings.notificationsEnabled });
  };

  /* ── CSV export handlers ── */

  const handleExportTrades = useCallback(() => {
    if (trades.length === 0) {
      setExportFeedback('No trades to export.');
      setTimeout(() => setExportFeedback(null), 3000);
      return;
    }
    const headers = ['ID', 'Timestamp', 'Symbol', 'Company', 'Side', 'Order Type', 'Quantity', 'Price', 'Total Value', 'Realized P&L'];
    const rows = trades.map(t => [
      t.id,
      t.timestamp,
      t.symbol,
      t.companyName,
      t.side,
      t.orderType ?? 'MARKET',
      String(t.quantity),
      String(t.executionPrice),
      String(t.totalValue),
      t.realizedPnL !== null ? String(t.realizedPnL) : ''
    ]);
    downloadCSV('tradelab-trades.csv', headers, rows);
    setExportFeedback('Trades exported successfully.');
    setTimeout(() => setExportFeedback(null), 3000);
  }, [trades]);

  const handleExportOrders = useCallback(() => {
    if (orders.length === 0) {
      setExportFeedback('No orders to export.');
      setTimeout(() => setExportFeedback(null), 3000);
      return;
    }
    const headers = ['ID', 'Created', 'Symbol', 'Company', 'Side', 'Type', 'Quantity', 'Requested Price', 'Trigger Price', 'Execution Price', 'Total Value', 'Status', 'Executed At', 'Cancelled At', 'Rejection Reason'];
    const rows = orders.map(o => [
      o.id,
      o.createdAt,
      o.symbol,
      o.companyName,
      o.side,
      o.type,
      String(o.quantity),
      String(o.requestedPrice),
      o.triggerPrice !== undefined ? String(o.triggerPrice) : '',
      o.executionPrice !== null ? String(o.executionPrice) : '',
      o.totalValue !== null ? String(o.totalValue) : '',
      o.status,
      o.executedAt ?? '',
      o.cancelledAt ?? '',
      o.rejectionReason ?? ''
    ]);
    downloadCSV('tradelab-orders.csv', headers, rows);
    setExportFeedback('Orders exported successfully.');
    setTimeout(() => setExportFeedback(null), 3000);
  }, [orders]);

  /* ── Reset handler ── */

  const handleResetClick = () => {
    setResetConfirmStep(1);
  };

  const handleResetConfirm = () => {
    resetAccount();
    setResetConfirmStep(2);
    setTimeout(() => setResetConfirmStep(0), 4000);
  };

  const handleResetCancel = () => {
    setResetConfirmStep(0);
  };

  return (
    <div className="d15-settings">
      <h1 className="page-title">Settings</h1>
      <p className="d15-subtitle">Configure your paper trading experience</p>

      {/* ═══════════════════════════════════════════════
          Section 1: Market Simulation
          ═══════════════════════════════════════════════ */}
      <div className="d15-section">
        <div className="d15-section-header">
          <Activity size={20} />
          <h2>Market Simulation</h2>
        </div>

        <div className="d15-card">
          <div className="d15-setting-row">
            <div className="d15-setting-info">
              <div className="d15-setting-label">Auto Market Simulation</div>
              <p className="d15-setting-desc">
                Automatically updates market prices at the configured interval using
                deterministic simulation. Pending orders are evaluated after each tick.
              </p>
            </div>
            <button
              className={`d15-toggle ${settings.autoSimEnabled ? 'd15-toggle-on' : ''}`}
              onClick={handleToggleAutoSim}
              aria-label="Toggle auto simulation"
            >
              <span className="d15-toggle-thumb" />
            </button>
          </div>

          {/* Status indicator */}
          <div className={`d15-sim-status ${autoSimActive ? 'd15-sim-active' : 'd15-sim-inactive'}`}>
            {autoSimActive ? <Play size={14} /> : <Pause size={14} />}
            <span>
              {autoSimActive
                ? `Simulation running — tick every ${settings.autoSimIntervalSec}s`
                : 'Simulation paused'}
            </span>
            <span className="d15-sim-tick">Tick #{tick}</span>
          </div>

          {/* Interval setting */}
          <div className="d15-setting-row d15-interval-row">
            <div className="d15-setting-info">
              <div className="d15-setting-label">
                <Timer size={16} /> Tick Interval
              </div>
              <p className="d15-setting-desc">
                Seconds between each simulated market update (2–60).
              </p>
            </div>
            <div className="d15-interval-control">
              <input
                type="range"
                min={2}
                max={60}
                step={1}
                value={settings.autoSimIntervalSec}
                onChange={handleIntervalChange}
                className="d15-slider"
              />
              <div className="d15-interval-value">{settings.autoSimIntervalSec}s</div>
            </div>
          </div>

          <div className="d15-setting-note">
            <Info size={14} />
            <span>
              Manual simulation is always available via the "Simulate Update" button on the Orders page,
              regardless of auto-simulation settings.
            </span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          Section 2: Display Preferences
          ═══════════════════════════════════════════════ */}
      <div className="d15-section">
        <div className="d15-section-header">
          <Eye size={20} />
          <h2>Display Preferences</h2>
        </div>

        <div className="d15-card">
          <div className="d15-setting-row">
            <div className="d15-setting-info">
              <div className="d15-setting-label">Show P&L Percentages</div>
              <p className="d15-setting-desc">
                Display percentage values alongside currency values in portfolio and trade views.
              </p>
            </div>
            <button
              className={`d15-toggle ${settings.showPnlPercent ? 'd15-toggle-on' : ''}`}
              onClick={handleTogglePnlPercent}
              aria-label="Toggle P&L percentages"
            >
              <span className="d15-toggle-thumb" />
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          Section 2.5: Notifications (Day 16)
          ═══════════════════════════════════════════════ */}
      <div className="d15-section">
        <div className="d15-section-header">
          <Bell size={20} />
          <h2>Notifications</h2>
        </div>

        <div className="d15-card">
          <div className="d15-setting-row">
            <div className="d15-setting-info">
              <div className="d15-setting-label">Enable Notifications</div>
              <p className="d15-setting-desc">
                Receive alerts for order activity, account events, and significant market moves.
                Disabling suppresses market alerts but order and account notifications remain active.
              </p>
            </div>
            <button
              className={`d15-toggle ${settings.notificationsEnabled ? 'd15-toggle-on' : ''}`}
              onClick={handleToggleNotifications}
              aria-label="Toggle notifications"
            >
              <span className="d15-toggle-thumb" />
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          Section 3: Data Management
          ═══════════════════════════════════════════════ */}
      <div className="d15-section">
        <div className="d15-section-header">
          <FileText size={20} />
          <h2>Data Management</h2>
        </div>

        <div className="d15-card">
          {/* CSV Export */}
          <div className="d15-export-group">
            <div className="d15-setting-label">
              <Download size={16} /> Export Data
            </div>
            <p className="d15-setting-desc" style={{ marginBottom: '12px' }}>
              Download your trading data as CSV files for analysis or record-keeping.
            </p>

            <div className="d15-export-buttons">
              <button
                className="d15-export-btn"
                onClick={handleExportTrades}
                disabled={trades.length === 0}
              >
                <BarChart3 size={15} />
                Export Trades
                <span className="d15-export-count">{trades.length}</span>
              </button>
              <button
                className="d15-export-btn"
                onClick={handleExportOrders}
                disabled={orders.length === 0}
              >
                <FileText size={15} />
                Export Orders
                <span className="d15-export-count">{orders.length}</span>
              </button>
            </div>

            {exportFeedback && (
              <div className="d15-feedback">
                <CheckCircle size={14} />
                {exportFeedback}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="d15-divider" />

          {/* Reset */}
          <div className="d15-reset-group">
            <div className="d15-setting-label d15-danger-label">
              <Trash2 size={16} /> Reset Account
            </div>

            {resetConfirmStep === 0 && (
              <>
                <p className="d15-setting-desc" style={{ marginBottom: '12px' }}>
                  Reset your virtual account to its initial state with {formatCurrency(1000000)} starting capital.
                </p>
                <button className="d15-reset-btn" onClick={handleResetClick}>
                  <RefreshCcw size={15} />
                  Reset Virtual Account
                </button>
              </>
            )}

            {resetConfirmStep === 1 && (
              <div className="d15-confirm-box">
                <div className="d15-confirm-warning">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>This action cannot be undone.</strong>
                    <p>This will permanently remove:</p>
                    <ul>
                      <li>All holdings and positions</li>
                      <li>All orders and executions</li>
                      <li>All trade history</li>
                      <li>Your watchlist</li>
                      <li>Simulated market progress (prices return to original)</li>
                    </ul>
                    <p>Cash balance will be reset to {formatCurrency(1000000)}.</p>
                  </div>
                </div>
                <div className="d15-confirm-actions">
                  <button className="d15-confirm-yes" onClick={handleResetConfirm}>
                    <Trash2 size={14} /> Yes, Reset Everything
                  </button>
                  <button className="d15-confirm-no" onClick={handleResetCancel}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {resetConfirmStep === 2 && (
              <div className="d15-success-box">
                <CheckCircle size={18} />
                <span>Account has been reset to its initial state.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          Section 4: About
          ═══════════════════════════════════════════════ */}
      <div className="d15-section">
        <div className="d15-section-header">
          <Info size={20} />
          <h2>About TradeLab</h2>
        </div>

        <div className="d15-card d15-about-card">
          <div className="d15-about-header">
            <Activity size={24} color="var(--primary)" />
            <div>
              <h3>TradeLab</h3>
              <span className="d15-about-tag">VIRTUAL PAPER TRADING</span>
            </div>
          </div>
          <p>
            TradeLab is a virtual paper trading platform designed for educational purposes.
            All funds are simulated. Market data is deterministic and does not reflect real-time prices.
          </p>
          <div className="d15-about-stats">
            <div className="d15-about-stat">
              <Zap size={14} />
              <span>10 NSE Stocks</span>
            </div>
            <div className="d15-about-stat">
              <BarChart3 size={14} />
              <span>5 Order Types</span>
            </div>
            <div className="d15-about-stat">
              <Activity size={14} />
              <span>Deterministic Simulation</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
