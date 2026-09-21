import React, { useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Bell,
  BellOff,
  Briefcase,
  CheckCircle,
  Clock,
  DollarSign,
  Layers,
  LineChart,
  RotateCcw,
  Shield,
  Star,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
  Zap,
  AlertTriangle,
  Target,
  Info,
  ChevronRight
} from 'lucide-react';
import {
  computeCashUtilization,
  computeLargestPositionPercent,
  computeConcentrationClassification,
  computePositionRiskRows
} from '../risk/RiskCalculationModel';

/* ── Format helpers (module scope, no hooks) ── */

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

const formatCurrency2 = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const formatSignedCurrency = (value: number) => {
  const formatted = formatCurrency(value);
  return value > 0 ? '+' + formatted : formatted;
};

const formatPercent = (value: number) => {
  const formatted = value.toFixed(2) + '%';
  return value > 0 ? '+' + formatted : formatted;
};

/* ── Dashboard Component ── */

const Dashboard = () => {
  const { account, holdings, stocks, orders, trades, notifications } = useTrading();
  const navigate = useNavigate();

  /* ── Derived data ── */

  const totalPnL = account.realizedPnL + account.unrealizedPnL;
  const pnlPercent = account.startingBalance > 0
    ? ((account.portfolioValue - account.startingBalance) / account.startingBalance) * 100
    : 0;

  const pendingOrders = useMemo(
    () => orders.filter(o => o.status === 'PENDING' || o.status === 'TRIGGERED'),
    [orders]
  );

  const recentTrades = useMemo(() => trades.slice(0, 5), [trades]);

  /* Market movers: top 3 gainers & losers by changePercent */
  const { topGainers, topLosers } = useMemo(() => {
    const sorted = [...stocks].sort((a, b) => b.changePercent - a.changePercent);
    return {
      topGainers: sorted.slice(0, 3),
      topLosers: sorted.slice(-3).reverse().filter(s => s.changePercent < 0)
    };
  }, [stocks]);

  /* Portfolio snapshot: top 5 positions by current value */
  const positionRows = useMemo(
    () => computePositionRiskRows(holdings, stocks).slice(0, 5),
    [holdings, stocks]
  );

  /* Risk gauges */
  const cashUtilization = useMemo(
    () => computeCashUtilization(account.cashBalance, holdings, stocks),
    [account.cashBalance, holdings, stocks]
  );

  const largestPositionPct = useMemo(
    () => computeLargestPositionPercent(holdings, stocks),
    [holdings, stocks]
  );

  const concentrationClass = useMemo(
    () => computeConcentrationClassification(largestPositionPct),
    [largestPositionPct]
  );

  const hasHoldings = holdings.length > 0;
  const hasTrades = trades.length > 0;
  const hasPending = pendingOrders.length > 0;

  /* Recent activity: latest 5 notifications for dashboard */
  const recentNotifications = useMemo(() => notifications.slice(0, 5), [notifications]);

  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diffSec = Math.floor((now - timestamp) / 1000);
    if (diffSec < 10) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  };

  const getNotifIcon = (type: string) => {
    switch (type) {
      case 'ORDER_EXECUTED': return <CheckCircle size={15} className="d16-icon d16-icon-success" />;
      case 'ORDER_REJECTED': return <XCircle size={15} className="d16-icon d16-icon-error" />;
      case 'ORDER_CANCELLED': return <XCircle size={15} className="d16-icon d16-icon-muted" />;
      case 'ORDER_TRIGGERED': return <Zap size={15} className="d16-icon d16-icon-warning" />;
      case 'MARKET_EVENT': return <TrendingUp size={15} className="d16-icon d16-icon-warning" />;
      case 'ACCOUNT_EVENT': return <RotateCcw size={15} className="d16-icon d16-icon-info" />;
      default: return <Info size={15} className="d16-icon d16-icon-info" />;
    }
  };

  return (
    <div className="d14-dashboard">
      {/* ─── Page Title ─── */}
      <h1 className="page-title">Dashboard</h1>

      {/* ═══════════════════════════════════════════════
          Section 1: Account Overview Hero
          ═══════════════════════════════════════════════ */}
      <div className="d14-hero">
        <div className="d14-hero-main">
          <div className="d14-hero-label">Portfolio Value</div>
          <div className="d14-hero-value">{formatCurrency(account.portfolioValue)}</div>
          <div className={`d14-hero-pnl ${totalPnL >= 0 ? 'd14-positive' : 'd14-negative'}`}>
            {totalPnL >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            <span>{formatSignedCurrency(totalPnL)}</span>
            <span className="d14-hero-pnl-pct">({formatPercent(pnlPercent)})</span>
          </div>
        </div>
        <div className="d14-hero-stats">
          <div className="d14-hero-stat">
            <div className="d14-hero-stat-icon d14-stat-cash">
              <Wallet size={18} />
            </div>
            <div className="d14-hero-stat-content">
              <span className="d14-hero-stat-label">Available Cash</span>
              <span className="d14-hero-stat-value">{formatCurrency(account.cashBalance)}</span>
            </div>
          </div>
          <div className="d14-hero-stat">
            <div className="d14-hero-stat-icon d14-stat-invested">
              <Briefcase size={18} />
            </div>
            <div className="d14-hero-stat-content">
              <span className="d14-hero-stat-label">Invested Value</span>
              <span className="d14-hero-stat-value">{formatCurrency(account.investedValue)}</span>
            </div>
          </div>
          <div className="d14-hero-stat">
            <div className="d14-hero-stat-icon d14-stat-realized">
              <DollarSign size={18} />
            </div>
            <div className="d14-hero-stat-content">
              <span className="d14-hero-stat-label">Realized P&L</span>
              <span className={`d14-hero-stat-value ${account.realizedPnL >= 0 ? 'd14-positive' : 'd14-negative'}`}>
                {formatSignedCurrency(account.realizedPnL)}
              </span>
            </div>
          </div>
          <div className="d14-hero-stat">
            <div className="d14-hero-stat-icon d14-stat-unrealized">
              <Activity size={18} />
            </div>
            <div className="d14-hero-stat-content">
              <span className="d14-hero-stat-label">Unrealized P&L</span>
              <span className={`d14-hero-stat-value ${account.unrealizedPnL >= 0 ? 'd14-positive' : 'd14-negative'}`}>
                {formatSignedCurrency(account.unrealizedPnL)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Two-column layout for middle sections ─── */}
      <div className="d14-grid-2col">

        {/* ═══════════════════════════════════════════════
            Section 2: Portfolio Snapshot
            ═══════════════════════════════════════════════ */}
        <div className="d14-card">
          <div className="d14-card-header">
            <div className="d14-card-title">
              <Briefcase size={18} /> Portfolio Snapshot
            </div>
            {hasHoldings && (
              <Link to="/portfolio" className="d14-view-all">
                View All <ArrowRight size={14} />
              </Link>
            )}
          </div>

          {hasHoldings ? (
            <div className="d14-positions-table">
              <div className="d14-positions-header">
                <span>Symbol</span>
                <span className="d14-text-right">Value</span>
                <span className="d14-text-right">P&L</span>
                <span className="d14-text-right">Alloc</span>
              </div>
              {positionRows.map(row => (
                <div
                  key={row.symbol}
                  className="d14-positions-row"
                  onClick={() => navigate(`/stock/${row.symbol}`)}
                >
                  <div className="d14-positions-symbol">
                    <span className="d14-symbol-name">{row.symbol}</span>
                    <span className="d14-symbol-qty">{row.quantity} shares</span>
                  </div>
                  <span className="d14-text-right">{formatCurrency(row.currentValue)}</span>
                  <span className={`d14-text-right ${row.unrealizedPnL >= 0 ? 'd14-positive' : 'd14-negative'}`}>
                    {formatSignedCurrency(row.unrealizedPnL)}
                    <span className="d14-pnl-sub">({formatPercent(row.unrealizedPnLPercent)})</span>
                  </span>
                  <span className="d14-text-right">{row.allocationPercent.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="d14-empty-state">
              <Briefcase size={32} strokeWidth={1.5} />
              <p>No holdings yet</p>
              <Link to="/markets" className="d14-empty-action">
                <LineChart size={14} /> Explore Markets
              </Link>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════
            Section 3: Market Pulse
            ═══════════════════════════════════════════════ */}
        <div className="d14-card">
          <div className="d14-card-header">
            <div className="d14-card-title">
              <BarChart3 size={18} /> Market Pulse
            </div>
            <Link to="/markets" className="d14-view-all">
              All Markets <ArrowRight size={14} />
            </Link>
          </div>

          <div className="d14-movers-section">
            {/* Gainers */}
            <div className="d14-movers-group">
              <div className="d14-movers-label d14-positive">
                <TrendingUp size={14} /> Top Gainers
              </div>
              {topGainers.map(stock => (
                <div
                  key={stock.symbol}
                  className="d14-mover-row"
                  onClick={() => navigate(`/stock/${stock.symbol}`)}
                >
                  <div className="d14-mover-info">
                    <span className="d14-mover-symbol">{stock.symbol}</span>
                    <span className="d14-mover-price">{formatCurrency2(stock.price)}</span>
                  </div>
                  <span className="d14-mover-badge d14-positive">
                    <ArrowUpRight size={12} />
                    {formatPercent(stock.changePercent)}
                  </span>
                </div>
              ))}
            </div>

            {/* Losers */}
            {topLosers.length > 0 && (
              <div className="d14-movers-group">
                <div className="d14-movers-label d14-negative">
                  <TrendingDown size={14} /> Top Losers
                </div>
                {topLosers.map(stock => (
                  <div
                    key={stock.symbol}
                    className="d14-mover-row"
                    onClick={() => navigate(`/stock/${stock.symbol}`)}
                  >
                    <div className="d14-mover-info">
                      <span className="d14-mover-symbol">{stock.symbol}</span>
                      <span className="d14-mover-price">{formatCurrency2(stock.price)}</span>
                    </div>
                    <span className="d14-mover-badge d14-negative">
                      <ArrowDownRight size={12} />
                      {formatPercent(stock.changePercent)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Second two-column row ─── */}
      <div className="d14-grid-2col">

        {/* ═══════════════════════════════════════════════
            Section 4: Pending Orders Alert
            ═══════════════════════════════════════════════ */}
        <div className="d14-card">
          <div className="d14-card-header">
            <div className="d14-card-title">
              <Clock size={18} /> Open Orders
            </div>
            {hasPending && (
              <Link to="/orders" className="d14-view-all">
                Manage <ArrowRight size={14} />
              </Link>
            )}
          </div>

          {hasPending ? (
            <div className="d14-orders-list">
              {pendingOrders.slice(0, 5).map(order => (
                <div key={order.id} className="d14-order-row">
                  <div className="d14-order-info">
                    <span className={`d14-order-side ${order.side === 'BUY' ? 'd14-side-buy' : 'd14-side-sell'}`}>
                      {order.side}
                    </span>
                    <span className="d14-order-symbol">{order.symbol}</span>
                    <span className="d14-order-type">{order.type}</span>
                  </div>
                  <div className="d14-order-details">
                    <span>{order.quantity} × {formatCurrency2(order.requestedPrice)}</span>
                    <span className={`d14-order-status d14-status-${order.status.toLowerCase()}`}>
                      {order.status === 'TRIGGERED' && <Zap size={11} />}
                      {order.status === 'PENDING' && <Clock size={11} />}
                      {order.status}
                    </span>
                  </div>
                </div>
              ))}
              {pendingOrders.length > 5 && (
                <div className="d14-order-overflow">
                  +{pendingOrders.length - 5} more open orders
                </div>
              )}
            </div>
          ) : (
            <div className="d14-empty-state">
              <Clock size={32} strokeWidth={1.5} />
              <p>No open orders</p>
              <span className="d14-empty-sub">Place orders from any stock detail page</span>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════
            Section 5: Recent Trades
            ═══════════════════════════════════════════════ */}
        <div className="d14-card">
          <div className="d14-card-header">
            <div className="d14-card-title">
              <Zap size={18} /> Recent Trades
            </div>
            {hasTrades && (
              <Link to="/trades" className="d14-view-all">
                View All <ArrowRight size={14} />
              </Link>
            )}
          </div>

          {hasTrades ? (
            <div className="d14-trades-list">
              {recentTrades.map(trade => (
                <div
                  key={trade.id}
                  className="d14-trade-row"
                  onClick={() => navigate(`/stock/${trade.symbol}`)}
                >
                  <div className="d14-trade-info">
                    <span className={`d14-order-side ${trade.side === 'BUY' ? 'd14-side-buy' : 'd14-side-sell'}`}>
                      {trade.side}
                    </span>
                    <span className="d14-trade-symbol">{trade.symbol}</span>
                    <span className="d14-trade-qty">{trade.quantity} @ {formatCurrency2(trade.executionPrice)}</span>
                  </div>
                  <div className="d14-trade-result">
                    <span className="d14-trade-value">{formatCurrency(trade.totalValue)}</span>
                    {trade.realizedPnL !== null && (
                      <span className={`d14-trade-pnl ${trade.realizedPnL >= 0 ? 'd14-positive' : 'd14-negative'}`}>
                        {formatSignedCurrency(trade.realizedPnL)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="d14-empty-state">
              <Zap size={32} strokeWidth={1.5} />
              <p>No trades yet</p>
              <Link to="/markets" className="d14-empty-action">
                <Star size={14} /> Start Trading
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          Section 6: Quick Risk Gauge
          ═══════════════════════════════════════════════ */}
      <div className="d14-risk-strip">
        <div className="d14-risk-strip-header">
          <div className="d14-card-title">
            <Shield size={18} /> Risk Overview
          </div>
          <Link to="/risk" className="d14-view-all">
            Full Analysis <ArrowRight size={14} />
          </Link>
        </div>

        <div className="d14-risk-gauges">
          {/* Cash Utilization */}
          <div className="d14-gauge-card">
            <div className="d14-gauge-label">Cash Utilization</div>
            <div className="d14-gauge-bar-track">
              <div
                className={`d14-gauge-bar-fill ${
                  cashUtilization > 80 ? 'd14-gauge-danger' :
                  cashUtilization > 50 ? 'd14-gauge-warning' : 'd14-gauge-safe'
                }`}
                style={{ width: `${Math.min(cashUtilization, 100)}%` }}
              />
            </div>
            <div className="d14-gauge-value">{cashUtilization.toFixed(1)}%</div>
          </div>

          {/* Largest Position */}
          <div className="d14-gauge-card">
            <div className="d14-gauge-label">Largest Position</div>
            <div className="d14-gauge-bar-track">
              <div
                className={`d14-gauge-bar-fill ${
                  largestPositionPct >= 40 ? 'd14-gauge-danger' :
                  largestPositionPct >= 20 ? 'd14-gauge-warning' : 'd14-gauge-safe'
                }`}
                style={{ width: `${Math.min(largestPositionPct, 100)}%` }}
              />
            </div>
            <div className="d14-gauge-value">{largestPositionPct.toFixed(1)}%</div>
          </div>

          {/* Concentration */}
          <div className="d14-gauge-card">
            <div className="d14-gauge-label">Concentration</div>
            <div className={`d14-concentration-badge d14-conc-${concentrationClass.toLowerCase()}`}>
              {concentrationClass === 'Low' && <Shield size={14} />}
              {concentrationClass === 'Moderate' && <AlertTriangle size={14} />}
              {concentrationClass === 'High' && <Target size={14} />}
              {concentrationClass}
            </div>
          </div>

          {/* Holdings Count */}
          <div className="d14-gauge-card">
            <div className="d14-gauge-label">Positions</div>
            <div className="d14-gauge-count">
              <Layers size={16} />
              <span>{holdings.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          Section 7: Recent Activity (Day 16)
          ═══════════════════════════════════════════════ */}
      <div className="d14-card d16-activity-card">
        <div className="d14-card-header">
          <div className="d14-card-title">
            <Bell size={18} /> Recent Activity
          </div>
        </div>

        {recentNotifications.length > 0 ? (
          <div className="d16-activity-list">
            {recentNotifications.map(n => (
              <div
                key={n.id}
                className={`d16-activity-row ${!n.read ? 'd16-activity-unread' : ''} ${n.route ? 'd16-activity-clickable' : ''}`}
                onClick={() => {
                  if (n.route) navigate(n.route);
                }}
                role={n.route ? 'button' : undefined}
                tabIndex={n.route ? 0 : undefined}
              >
                <div className="d16-activity-icon">{getNotifIcon(n.type)}</div>
                <div className="d16-activity-content">
                  <div className="d16-activity-title">{n.title}</div>
                  <div className="d16-activity-message">{n.message}</div>
                </div>
                <div className="d16-activity-time">
                  {formatRelativeTime(n.timestamp)}
                  {n.route && <ChevronRight size={12} />}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="d14-empty-state">
            <BellOff size={32} strokeWidth={1.5} />
            <p>No recent activity</p>
            <span className="d14-empty-sub">Order executions, alerts, and events will appear here</span>
          </div>
        )}
      </div>

      {/* ─── Paper Trading Notice ─── */}
      <div className="d14-notice">
        <p>
          <strong>Paper Trading</strong> — This is a simulated environment. All funds are virtual.
          Market data is for demonstration purposes only and may not reflect real-time prices.
        </p>
      </div>
    </div>
  );
};

export default Dashboard;
