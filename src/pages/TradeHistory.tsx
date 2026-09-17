import React, { useState, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { Trade } from '../types';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Award,
  Target,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  History,
  Zap
} from 'lucide-react';
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';

/* ────────────────────────────────────────────────
   Format helpers (module scope, no hooks)
   ──────────────────────────────────────────────── */

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

const formatSignedCurrency = (value: number) => {
  const formatted = formatCurrency(value);
  return value > 0 ? '+' + formatted : formatted;
};

const formatPercent = (value: number) => {
  const formatted = value.toFixed(2) + '%';
  return value > 0 ? '+' + formatted : formatted;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
};

/* ────────────────────────────────────────────────
   Pure analytics helpers
   ──────────────────────────────────────────────── */

/**
 * A "completed trade" is any Trade record where realizedPnL is not null.
 * This corresponds to SELL trades in the current engine.
 *
 * P&L classification (documented per Phase 10):
 *   Winning:    realizedPnL > 0
 *   Losing:     realizedPnL < 0
 *   Break-even: realizedPnL === 0  — NOT counted as win or loss
 *
 * Win rate = winningTrades / (winningTrades + losingTrades) * 100
 * This avoids treating break-even trades as either winning or losing.
 */
interface TradeStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakEvenTrades: number;
  winRate: number;
  lossRate: number;
  totalRealizedPnL: number;
  averageTradePnL: number;
  averageWinningPnL: number;
  averageLosingPnL: number;
  profitFactor: number | null; // null when gross losses are zero
  bestTradePnL: number | null;
  worstTradePnL: number | null;
  grossProfits: number;
  grossLosses: number;
}

const calculateTradeStats = (completedTrades: Trade[]): TradeStats => {
  if (completedTrades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      breakEvenTrades: 0,
      winRate: 0,
      lossRate: 0,
      totalRealizedPnL: 0,
      averageTradePnL: 0,
      averageWinningPnL: 0,
      averageLosingPnL: 0,
      profitFactor: null,
      bestTradePnL: null,
      worstTradePnL: null,
      grossProfits: 0,
      grossLosses: 0
    };
  }

  const pnlValues = completedTrades.map(t => t.realizedPnL as number);

  const winningTrades = completedTrades.filter(t => (t.realizedPnL as number) > 0);
  const losingTrades = completedTrades.filter(t => (t.realizedPnL as number) < 0);
  const breakEvenTrades = completedTrades.filter(t => (t.realizedPnL as number) === 0);

  const grossProfits = winningTrades.reduce((sum, t) => sum + (t.realizedPnL as number), 0);
  const grossLosses = losingTrades.reduce((sum, t) => sum + (t.realizedPnL as number), 0);
  const totalRealizedPnL = pnlValues.reduce((sum, v) => sum + v, 0);

  const decisiveTrades = winningTrades.length + losingTrades.length;
  const winRate = decisiveTrades > 0 ? (winningTrades.length / decisiveTrades) * 100 : 0;
  const lossRate = decisiveTrades > 0 ? (losingTrades.length / decisiveTrades) * 100 : 0;

  return {
    totalTrades: completedTrades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    breakEvenTrades: breakEvenTrades.length,
    winRate,
    lossRate,
    totalRealizedPnL,
    averageTradePnL: totalRealizedPnL / completedTrades.length,
    averageWinningPnL: winningTrades.length > 0 ? grossProfits / winningTrades.length : 0,
    averageLosingPnL: losingTrades.length > 0 ? grossLosses / losingTrades.length : 0,
    profitFactor: grossLosses !== 0 ? grossProfits / Math.abs(grossLosses) : null,
    bestTradePnL: pnlValues.length > 0 ? Math.max(...pnlValues) : null,
    worstTradePnL: pnlValues.length > 0 ? Math.min(...pnlValues) : null,
    grossProfits,
    grossLosses
  };
};

interface SymbolPerformance {
  symbol: string;
  tradeCount: number;
  winningTrades: number;
  losingTrades: number;
  realizedPnL: number;
  winRate: number;
}

const calculateSymbolPerformance = (completedTrades: Trade[]): SymbolPerformance[] => {
  const symbolMap = new Map<string, Trade[]>();

  completedTrades.forEach(t => {
    const existing = symbolMap.get(t.symbol) ?? [];
    existing.push(t);
    symbolMap.set(t.symbol, existing);
  });

  const results: SymbolPerformance[] = [];

  symbolMap.forEach((trades, symbol) => {
    const winning = trades.filter(t => (t.realizedPnL as number) > 0).length;
    const losing = trades.filter(t => (t.realizedPnL as number) < 0).length;
    const decisive = winning + losing;
    const realizedPnL = trades.reduce((sum, t) => sum + (t.realizedPnL as number), 0);

    results.push({
      symbol,
      tradeCount: trades.length,
      winningTrades: winning,
      losingTrades: losing,
      realizedPnL,
      winRate: decisive > 0 ? (winning / decisive) * 100 : 0
    });
  });

  // Sort alphabetically (deterministic ordering)
  return results.sort((a, b) => a.symbol.localeCompare(b.symbol));
};

interface CumulativePnLPoint {
  date: string;
  timestamp: number;
  cumulativePnL: number;
  tradePnL: number;
  symbol: string;
}

const calculateCumulativePnL = (completedTrades: Trade[]): CumulativePnLPoint[] => {
  if (completedTrades.length === 0) return [];

  // Sort chronologically WITHOUT mutating the source array
  const sorted = [...completedTrades].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let cumulative = 0;
  return sorted.map(trade => {
    cumulative += trade.realizedPnL as number;
    return {
      date: new Date(trade.timestamp).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      timestamp: new Date(trade.timestamp).getTime(),
      cumulativePnL: Number(cumulative.toFixed(2)),
      tradePnL: trade.realizedPnL as number,
      symbol: trade.symbol
    };
  });
};

/* ────────────────────────────────────────────────
   Filter types
   ──────────────────────────────────────────────── */

type PnLFilter = 'ALL' | 'WINNING' | 'LOSING';
type SideFilter = 'ALL' | 'BUY' | 'SELL';

/* ────────────────────────────────────────────────
   Chart tooltip
   ──────────────────────────────────────────────── */

const cumulativePnLTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload as CumulativePnLPoint;
    return (
      <div className="tooltip-box">
        <div className="tooltip-name">{d.symbol} — {d.date}</div>
        <div className="tooltip-row">
          <span>Trade P&L</span>
          <span style={{ color: d.tradePnL >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {formatSignedCurrency(d.tradePnL)}
          </span>
        </div>
        <div className="tooltip-row">
          <span>Cumulative</span>
          <span style={{ color: d.cumulativePnL >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {formatSignedCurrency(d.cumulativePnL)}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

/* ────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────── */

const TradeHistory: React.FC = () => {
  const { trades } = useTrading();

  const [pnlFilter, setPnlFilter] = useState<PnLFilter>('ALL');
  const [sideFilter, setSideFilter] = useState<SideFilter>('ALL');

  /* ── Completed trades (realizedPnL !== null) ── */

  const completedTrades = useMemo(() => {
    return trades.filter(t => t.realizedPnL !== null && t.realizedPnL !== undefined);
  }, [trades]);

  /* ── Trade statistics ── */

  const stats = useMemo(() => calculateTradeStats(completedTrades), [completedTrades]);

  /* ── Symbol performance ── */

  const symbolPerformance = useMemo(() => calculateSymbolPerformance(completedTrades), [completedTrades]);

  /* ── Cumulative P&L chart data ── */

  const cumulativePnLData = useMemo(() => calculateCumulativePnL(completedTrades), [completedTrades]);

  /* ── Filtered trades for table ── */

  const filteredTrades = useMemo(() => {
    let result = [...trades]; // immutable copy for sorting

    // Apply P&L filter
    if (pnlFilter === 'WINNING') {
      result = result.filter(t => t.realizedPnL !== null && t.realizedPnL > 0);
    } else if (pnlFilter === 'LOSING') {
      result = result.filter(t => t.realizedPnL !== null && t.realizedPnL < 0);
    }

    // Apply side filter
    if (sideFilter !== 'ALL') {
      result = result.filter(t => t.side === sideFilter);
    }

    // Sort newest first
    return result.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [trades, pnlFilter, sideFilter]);

  /* ── Helpers for display ── */

  const hasCompletedTrades = completedTrades.length > 0;
  const hasTrades = trades.length > 0;

  /* ── Render ── */

  return (
    <div className="trades-page">
      {/* ── Hero Header ── */}
      <div className="trades-hero">
        <div className="trades-hero-main">
          <div className="trades-hero-left">
            <h1 className="trades-hero-title">Trade History</h1>
            <p className="trades-hero-subtitle">
              Review completed trades and realized performance.
            </p>
          </div>
          {hasCompletedTrades && (
            <div className="trades-hero-right">
              <div className="trades-hero-stat">
                <span className="trades-hero-stat-label">Total P&L</span>
                <span className={`trades-hero-stat-value ${stats.totalRealizedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatSignedCurrency(stats.totalRealizedPnL)}
                </span>
              </div>
              <div className="trades-hero-stat">
                <span className="trades-hero-stat-label">Win Rate</span>
                <span className="trades-hero-stat-value">
                  {stats.winRate.toFixed(1)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Empty State ── */}
      {!hasTrades && (
        <div className="card">
          <div className="empty-state">
            <History size={48} />
            <h3>No completed trades yet</h3>
            <p>Completed trades will appear here once an order is executed and closed.</p>
            <p style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Place orders from any stock detail page to get started.
            </p>
          </div>
        </div>
      )}

      {/* ── Summary Metrics ── */}
      {hasTrades && (
        <>
          <h2 className="trades-section-title">
            <BarChart3 size={18} />
            Summary
          </h2>
          <div className="trades-summary-grid">
            <div className="card trades-summary-card">
              <div className="trades-summary-icon trades-icon-blue">
                <BarChart3 size={18} />
              </div>
              <div className="trades-summary-info">
                <div className="trades-summary-label">Total Trades</div>
                <div className="trades-summary-value">{stats.totalTrades}</div>
                <div className="trades-summary-sub">completed with P&L</div>
              </div>
            </div>

            <div className="card trades-summary-card">
              <div className="trades-summary-icon trades-icon-green">
                <TrendingUp size={18} />
              </div>
              <div className="trades-summary-info">
                <div className="trades-summary-label">Winning Trades</div>
                <div className="trades-summary-value text-success">{stats.winningTrades}</div>
                <div className="trades-summary-sub">P&L &gt; 0</div>
              </div>
            </div>

            <div className="card trades-summary-card">
              <div className="trades-summary-icon trades-icon-red">
                <TrendingDown size={18} />
              </div>
              <div className="trades-summary-info">
                <div className="trades-summary-label">Losing Trades</div>
                <div className="trades-summary-value text-danger">{stats.losingTrades}</div>
                <div className="trades-summary-sub">P&L &lt; 0</div>
              </div>
            </div>

            <div className="card trades-summary-card">
              <div className="trades-summary-icon trades-icon-purple">
                <Target size={18} />
              </div>
              <div className="trades-summary-info">
                <div className="trades-summary-label">Win Rate</div>
                <div className="trades-summary-value">{stats.winRate.toFixed(1)}%</div>
                <div className="trades-summary-sub">
                  {stats.breakEvenTrades > 0 ? `${stats.breakEvenTrades} break-even excluded` : 'wins / (wins + losses)'}
                </div>
              </div>
            </div>

            <div className="card trades-summary-card">
              <div className={`trades-summary-icon ${stats.totalRealizedPnL >= 0 ? 'trades-icon-green' : 'trades-icon-red'}`}>
                <Activity size={18} />
              </div>
              <div className="trades-summary-info">
                <div className="trades-summary-label">Realized P&L</div>
                <div className={`trades-summary-value ${stats.totalRealizedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatSignedCurrency(stats.totalRealizedPnL)}
                </div>
                <div className="trades-summary-sub">total from completed trades</div>
              </div>
            </div>

            <div className="card trades-summary-card">
              <div className={`trades-summary-icon ${stats.averageTradePnL >= 0 ? 'trades-icon-green' : 'trades-icon-red'}`}>
                <Zap size={18} />
              </div>
              <div className="trades-summary-info">
                <div className="trades-summary-label">Avg Trade P&L</div>
                <div className={`trades-summary-value ${stats.averageTradePnL >= 0 ? 'text-success' : 'text-danger'}`}>
                  {stats.totalTrades > 0 ? formatSignedCurrency(stats.averageTradePnL) : '₹0'}
                </div>
                <div className="trades-summary-sub">per completed trade</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Performance Statistics ── */}
      {hasCompletedTrades && (
        <>
          <h2 className="trades-section-title">
            <Award size={18} />
            Performance Statistics
          </h2>
          <div className="trades-stats-grid">
            <div className="card trades-stat-card">
              <div className="trades-stat-label">Win Rate</div>
              <div className="trades-stat-value text-success">{stats.winRate.toFixed(1)}%</div>
            </div>
            <div className="card trades-stat-card">
              <div className="trades-stat-label">Loss Rate</div>
              <div className="trades-stat-value text-danger">{stats.lossRate.toFixed(1)}%</div>
            </div>
            <div className="card trades-stat-card">
              <div className="trades-stat-label">Avg Winning Trade</div>
              <div className="trades-stat-value text-success">
                {stats.winningTrades > 0 ? formatSignedCurrency(stats.averageWinningPnL) : '—'}
              </div>
            </div>
            <div className="card trades-stat-card">
              <div className="trades-stat-label">Avg Losing Trade</div>
              <div className="trades-stat-value text-danger">
                {stats.losingTrades > 0 ? formatCurrency(stats.averageLosingPnL) : '—'}
              </div>
            </div>
            <div className="card trades-stat-card">
              <div className="trades-stat-label">Profit Factor</div>
              <div className="trades-stat-value">
                {stats.profitFactor !== null ? stats.profitFactor.toFixed(2) : '—'}
              </div>
              <div className="trades-stat-sub">
                {stats.profitFactor !== null ? 'gross profits / |gross losses|' : 'No losses recorded'}
              </div>
            </div>
            <div className="card trades-stat-card">
              <div className="trades-stat-label">Best Trade</div>
              <div className={`trades-stat-value ${(stats.bestTradePnL ?? 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                {stats.bestTradePnL !== null ? formatSignedCurrency(stats.bestTradePnL) : '—'}
              </div>
            </div>
            <div className="card trades-stat-card">
              <div className="trades-stat-label">Worst Trade</div>
              <div className={`trades-stat-value ${(stats.worstTradePnL ?? 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                {stats.worstTradePnL !== null ? formatSignedCurrency(stats.worstTradePnL) : '—'}
              </div>
            </div>
            <div className="card trades-stat-card">
              <div className="trades-stat-label">Total Realized P&L</div>
              <div className={`trades-stat-value ${stats.totalRealizedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatSignedCurrency(stats.totalRealizedPnL)}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Cumulative P&L Chart ── */}
      {hasCompletedTrades && cumulativePnLData.length > 0 && (
        <>
          <h2 className="trades-section-title">
            <TrendingUp size={18} />
            Cumulative Realized P&L
          </h2>
          <div className="card" style={{ marginBottom: '32px' }}>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={cumulativePnLData}>
                <defs>
                  <linearGradient id="cumulativePnLGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={((v: number) => {
                    if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
                    if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
                    return `₹${v.toFixed(0)}`;
                  }) as any}
                />
                <RechartsTooltip content={cumulativePnLTooltip} />
                <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 4" />
                <Area
                  type="monotone"
                  dataKey="cumulativePnL"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#cumulativePnLGrad)"
                  name="Cumulative P&L"
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="derived-note">
              Derived from completed simulated trades. This is not real market performance.
            </div>
          </div>
        </>
      )}

      {/* ── Filters + Trade Table ── */}
      {hasTrades && (
        <>
          <h2 className="trades-section-title">
            <FileText size={18} />
            Trade Records
          </h2>

          {/* Filter Bar */}
          <div className="trades-filter-bar">
            <div className="orders-filter-group">
              {(['ALL', 'WINNING', 'LOSING'] as PnLFilter[]).map(f => (
                <button
                  key={f}
                  className={`orders-filter-btn ${pnlFilter === f ? 'orders-filter-active' : ''}`}
                  onClick={() => setPnlFilter(f)}
                >
                  {f === 'ALL' ? 'All' : f === 'WINNING' ? 'Winning' : 'Losing'}
                </button>
              ))}
            </div>
            <div className="orders-filter-group">
              {(['ALL', 'BUY', 'SELL'] as SideFilter[]).map(f => (
                <button
                  key={f}
                  className={`orders-filter-btn ${sideFilter === f ? 'orders-filter-active' : ''}`}
                  onClick={() => setSideFilter(f)}
                >
                  {f === 'ALL' ? 'All Sides' : f}
                </button>
              ))}
            </div>
          </div>

          {/* Trade Table */}
          {filteredTrades.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <FileText size={48} />
                <h3>No trades match the selected filter</h3>
                <p>Try changing the filter criteria to see trades.</p>
              </div>
            </div>
          ) : (
            <div className="table-container trades-table-container">
              <table className="trades-table">
                <thead>
                  <tr>
                    <th>Trade ID</th>
                    <th>Date / Time</th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Exec. Price</th>
                    <th style={{ textAlign: 'right' }}>Total Value</th>
                    <th style={{ textAlign: 'right' }}>Realized P&L</th>
                    <th style={{ textAlign: 'right' }}>P&L %</th>
                    <th>Order ID</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.map(trade => {
                    // P&L % only meaningful for SELL trades with non-null realizedPnL
                    // Calculated as realizedPnL / (executionPrice * quantity - realizedPnL) * 100
                    // This gives the return on the cost basis
                    const hasPnL = trade.realizedPnL !== null && trade.realizedPnL !== undefined;
                    const costBasis = hasPnL ? trade.totalValue - (trade.realizedPnL as number) : 0;
                    const pnlPercent = hasPnL && costBasis > 0
                      ? ((trade.realizedPnL as number) / costBasis) * 100
                      : null;

                    return (
                      <tr key={trade.id} className="orders-trade-row">
                        <td>
                          <span className="d8-order-id">{trade.id}</span>
                        </td>
                        <td>
                          <div className="orders-datetime">
                            <span className="orders-date">{formatDate(trade.timestamp)}</span>
                            <span className="orders-time">{formatTime(trade.timestamp)}</span>
                          </div>
                        </td>
                        <td>
                          <span className="orders-symbol">{trade.symbol}</span>
                        </td>
                        <td>
                          <span className={`orders-side-badge ${trade.side === 'BUY' ? 'orders-side-buy' : 'orders-side-sell'}`}>
                            {trade.side === 'BUY' ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                            {trade.side}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{trade.quantity}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(trade.executionPrice)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(trade.totalValue)}</td>
                        <td style={{ textAlign: 'right' }}>
                          {hasPnL ? (
                            <span
                              className={
                                (trade.realizedPnL as number) > 0
                                  ? 'text-success'
                                  : (trade.realizedPnL as number) < 0
                                    ? 'text-danger'
                                    : 'text-muted'
                              }
                              style={{ fontWeight: 600 }}
                            >
                              {formatSignedCurrency(trade.realizedPnL as number)}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {pnlPercent !== null ? (
                            <span
                              className={
                                pnlPercent > 0
                                  ? 'text-success'
                                  : pnlPercent < 0
                                    ? 'text-danger'
                                    : 'text-muted'
                              }
                              style={{ fontWeight: 600, fontSize: '0.85rem' }}
                            >
                              {formatPercent(pnlPercent)}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          <span className="d8-order-id">{trade.orderId ?? '—'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="orders-table-footer">
                <History size={14} />
                <span>Showing {filteredTrades.length} of {trades.length} trade{trades.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Performance by Symbol ── */}
      {hasCompletedTrades && symbolPerformance.length > 0 && (
        <>
          <h2 className="trades-section-title" style={{ marginTop: '32px' }}>
            <Target size={18} />
            Performance by Symbol
          </h2>
          <div className="table-container trades-table-container" style={{ marginBottom: '32px' }}>
            <table className="trades-symbol-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th style={{ textAlign: 'right' }}># Trades</th>
                  <th style={{ textAlign: 'right' }}>Winning</th>
                  <th style={{ textAlign: 'right' }}>Losing</th>
                  <th style={{ textAlign: 'right' }}>Realized P&L</th>
                  <th style={{ textAlign: 'right' }}>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {symbolPerformance.map(sp => (
                  <tr key={sp.symbol} className="orders-trade-row">
                    <td>
                      <span className="orders-symbol">{sp.symbol}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{sp.tradeCount}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="text-success">{sp.winningTrades}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="text-danger">{sp.losingTrades}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span
                        className={sp.realizedPnL >= 0 ? 'text-success' : 'text-danger'}
                        style={{ fontWeight: 600 }}
                      >
                        {formatSignedCurrency(sp.realizedPnL)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 600 }}>{sp.winRate.toFixed(1)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="derived-note" style={{ marginBottom: '24px' }}>
            Historical simulated performance by symbol. Sorted alphabetically. This does not imply future performance.
          </div>
        </>
      )}

      {/* ── Paper Trading Notice ── */}
      <div className="card trades-notice">
        <History size={20} />
        <p>
          This is a simulated paper trading environment. All trade records, realized P&L, and performance statistics
          are virtual — no real money is involved, and market data is for demonstration purposes only.
        </p>
      </div>
    </div>
  );
};

export default TradeHistory;
