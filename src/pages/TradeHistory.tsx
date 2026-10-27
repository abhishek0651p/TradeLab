import React, { useState, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { Trade } from '../types';
import TradeJournal from '../components/TradeJournal';
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
  Zap,
  Edit2,
  Tag,
  X,
  BookOpen,
  Check
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

/* ────────────────────────────────────────────────
   Day 25: Strategy Analytics (Phase 6)
   ──────────────────────────────────────────────── */

/**
 * Day 25 — Strategy Analytics
 *
 * Distinction documented here:
 *   Recorded facts: trade realizedPnL, symbol, quantity, timestamp (from execution records)
 *   User-entered labels: trade.strategy (set by the user, NOT derived from execution data)
 *   Derived metrics: win rate per strategy, P&L per strategy, average win/loss per strategy
 *   Missing data: trades with strategy === undefined are excluded from strategy metrics
 *
 * A strategy label is optional and retroactively applied via the TradeHistory UI.
 * It is never auto-inferred or generated by the system.
 */

const getValidTradePnL = (t: Trade): number =>
  typeof t.realizedPnL === 'number' && Number.isFinite(t.realizedPnL) ? t.realizedPnL : 0;

interface StrategyStats {
  strategy: string;
  tradeCount: number;
  winningTrades: number;
  losingTrades: number;
  breakEvenTrades: number;
  winRate: number;
  totalRealizedPnL: number;
  averageWinningPnL: number;
  averageLosingPnL: number;
  bestTradePnL: number | null;
  worstTradePnL: number | null;
  /** Minimum sample-size indicator (>= 5 trades). Indicates sample volume; does NOT prove statistical significance. */
  meetsMinimumSampleSize: boolean;
}

const MIN_TRADES_FOR_STRATEGY_STATS = 5;

const calculateStrategyStats = (completedTrades: Trade[]): StrategyStats[] => {
  const strategyMap = new Map<string, Trade[]>();

  completedTrades.forEach(t => {
    const strat = t.strategy?.trim();
    if (!strat) return; // Skip unlabeled trades
    const existing = strategyMap.get(strat) ?? [];
    existing.push(t);
    strategyMap.set(strat, existing);
  });

  const results: StrategyStats[] = [];

  strategyMap.forEach((trades, strategy) => {
    const winning = trades.filter(t => getValidTradePnL(t) > 0);
    const losing = trades.filter(t => getValidTradePnL(t) < 0);
    const breakEven = trades.filter(t => getValidTradePnL(t) === 0);
    const decisive = winning.length + losing.length;
    const totalRealizedPnL = trades.reduce((sum, t) => sum + getValidTradePnL(t), 0);
    const grossProfits = winning.reduce((sum, t) => sum + getValidTradePnL(t), 0);
    const grossLosses = losing.reduce((sum, t) => sum + getValidTradePnL(t), 0);

    const pnlValues = trades.map(getValidTradePnL);
    const bestTradePnL = pnlValues.length > 0 ? Math.max(...pnlValues) : null;
    const worstTradePnL = pnlValues.length > 0 ? Math.min(...pnlValues) : null;

    results.push({
      strategy,
      tradeCount: trades.length,
      winningTrades: winning.length,
      losingTrades: losing.length,
      breakEvenTrades: breakEven.length,
      winRate: decisive > 0 ? (winning.length / decisive) * 100 : 0,
      totalRealizedPnL,
      averageWinningPnL: winning.length > 0 ? grossProfits / winning.length : 0,
      averageLosingPnL: losing.length > 0 ? grossLosses / losing.length : 0,
      bestTradePnL,
      worstTradePnL,
      meetsMinimumSampleSize: trades.length >= MIN_TRADES_FOR_STRATEGY_STATS
    });
  });

  // Sort by total realized P&L descending (deterministic)
  return results.sort((a, b) => b.totalRealizedPnL - a.totalRealizedPnL);
};

/**
 * Returns trades that are NOT labeled with any strategy.
 * Used to prompt users to label unlabeled trades.
 */
const unlabeledTrades = (completedTrades: Trade[]): Trade[] =>
  completedTrades.filter(t => !t.strategy || t.strategy.trim().length === 0);


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
  const { trades, updateTradeStrategy, tradeJournal } = useTrading();

  const [pnlFilter, setPnlFilter] = useState<PnLFilter>('ALL');
  const [sideFilter, setSideFilter] = useState<SideFilter>('ALL');
  const [strategyFilter, setStrategyFilter] = useState<string>('ALL');
  const [showStrategyModal, setShowStrategyModal] = useState<{ tradeId: string; current: string } | null>(null);
  const [strategyInput, setStrategyInput] = useState<string>('');
  const [showJournalModal, setShowJournalModal] = useState<string | null>(null);

  /* ── Completed trades (realizedPnL is a finite number) ── */
  const completedTrades = useMemo(() => {
    return trades.filter(
      t => typeof t.realizedPnL === 'number' && Number.isFinite(t.realizedPnL)
    );
  }, [trades]);

  /* ── Trade statistics ── */
  const stats = useMemo(() => calculateTradeStats(completedTrades), [completedTrades]);

  /* ── Strategy Analytics ── */
  const strategyStats = useMemo(() => calculateStrategyStats(completedTrades), [completedTrades]);

  const unlabeledCount = useMemo(() => unlabeledTrades(completedTrades).length, [completedTrades]);

  const uniqueStrategies = useMemo(() => {
    const strategies = new Set<string>();
    completedTrades.forEach(t => {
      if (t.strategy && t.strategy.trim().length > 0) {
        strategies.add(t.strategy.trim());
      }
    });
    return Array.from(strategies).sort();
  }, [completedTrades]);

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

    // Apply strategy filter
    if (strategyFilter === 'UNLABELED') {
      result = result.filter(t => !t.strategy || t.strategy.trim().length === 0);
    } else if (strategyFilter !== 'ALL') {
      result = result.filter(t => (t.strategy ?? '') === strategyFilter);
    }

    // Sort newest first
    return result.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [trades, pnlFilter, sideFilter, strategyFilter]);

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
          <div className="trades-hero-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
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
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setShowJournalModal('ALL')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              title="View all trade journal entries"
            >
              <BookOpen size={14} />
              <span>Trade Journal {tradeJournal.length > 0 ? `(${tradeJournal.length})` : ''}</span>
            </button>
          </div>
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

      {/* ── Strategy Performance ── */}
      {hasCompletedTrades && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '32px', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <h2 className="trades-section-title" style={{ margin: 0 }}>
              <Tag size={18} />
              Strategy Performance
            </h2>
            {unlabeledCount > 0 && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {unlabeledCount} trade{unlabeledCount === 1 ? '' : 's'} unlabeled (
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: 0, textDecoration: 'underline', font: 'inherit' }}
                  onClick={() => setStrategyFilter('UNLABELED')}
                >
                  filter to label
                </button>
                )
              </span>
            )}
          </div>

          {strategyStats.length === 0 ? (
            <div className="card" style={{ padding: '24px', textAlign: 'center', marginBottom: '32px' }}>
              <Tag size={32} style={{ opacity: 0.4, marginBottom: '8px' }} />
              <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem' }}>No strategies defined yet</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Assign strategy labels to completed trades in the table below to track win rates and P&L by trading strategy.
              </p>
            </div>
          ) : (
            <>
              <div className="table-container trades-table-container" style={{ marginBottom: '12px' }}>
                <table className="trades-symbol-table">
                  <thead>
                    <tr>
                      <th>Strategy</th>
                      <th style={{ textAlign: 'right' }}># Trades</th>
                      <th style={{ textAlign: 'right' }}>Win Rate</th>
                      <th style={{ textAlign: 'right' }}>Realized P&L</th>
                      <th style={{ textAlign: 'right' }}>Avg Win</th>
                      <th style={{ textAlign: 'right' }}>Avg Loss</th>
                      <th style={{ textAlign: 'right' }}>Best / Worst</th>
                      <th style={{ textAlign: 'center' }}>Sample Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {strategyStats.map(s => (
                      <tr key={s.strategy} className="orders-trade-row">
                        <td>
                          <button
                            type="button"
                            onClick={() => setStrategyFilter(s.strategy)}
                            title={`Filter table by ${s.strategy}`}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', font: 'inherit' }}
                          >
                            <span className="strategy-badge">{s.strategy}</span>
                          </button>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{s.tradeCount}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          <span className={s.winRate >= 50 ? 'text-success' : 'text-danger'}>
                            {s.winRate.toFixed(1)}%
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
                            {s.winningTrades}W / {s.losingTrades}L
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span
                            className={s.totalRealizedPnL >= 0 ? 'text-success' : 'text-danger'}
                            style={{ fontWeight: 600 }}
                          >
                            {formatSignedCurrency(s.totalRealizedPnL)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {s.winningTrades > 0 ? (
                            <span className="text-success">{formatSignedCurrency(s.averageWinningPnL)}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {s.losingTrades > 0 ? (
                            <span className="text-danger">{formatCurrency(Math.abs(s.averageLosingPnL))}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                          <div style={{ color: (s.bestTradePnL ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {s.bestTradePnL !== null ? formatSignedCurrency(s.bestTradePnL) : '—'}
                          </div>
                          <div style={{ color: (s.worstTradePnL ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: '0.75rem' }}>
                            {s.worstTradePnL !== null ? formatSignedCurrency(s.worstTradePnL) : '—'}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {s.meetsMinimumSampleSize ? (
                            <span className="sample-badge sample-badge-ok" title="Meets minimum sample threshold of 5 trades">
                              <Check size={11} /> N ≥ 5
                            </span>
                          ) : (
                            <span className="sample-badge sample-badge-warn" title="Exploratory sample (< 5 trades). Does not establish statistical significance.">
                              Low Sample ({s.tradeCount}/5)
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="derived-note" style={{ marginBottom: '32px' }}>
                Strategy metrics are based on user-assigned labels for completed simulated trades. Minimum sample threshold (N ≥ 5) indicates preliminary sample volume, not proof of statistical significance. Unlabeled trades are excluded until labeled.
              </div>
            </>
          )}
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
            {(uniqueStrategies.length > 0 || unlabeledCount > 0) && (
              <div className="orders-filter-group" style={{ borderLeft: '1px solid var(--border)', paddingLeft: '12px' }}>
                <span className="filter-group-label" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '8px', alignSelf: 'center' }}>Strategy:</span>
                <button
                  key="strategy-all"
                  className={`orders-filter-btn ${strategyFilter === 'ALL' ? 'orders-filter-active' : ''}`}
                  onClick={() => setStrategyFilter('ALL')}
                  title="Show all trades"
                >
                  <Tag size={12} /> All
                </button>
                {uniqueStrategies.map(s => (
                  <button
                    key={s}
                    className={`orders-filter-btn ${strategyFilter === s ? 'orders-filter-active' : ''}`}
                    onClick={() => setStrategyFilter(s)}
                    title={`Filter by ${s} strategy`}
                  >
                    {s.substring(0, 12)}{s.length > 12 ? '+' : ''}
                  </button>
                ))}
                {unlabeledCount > 0 && (
                  <button
                    key="strategy-unlabeled"
                    className={`orders-filter-btn ${strategyFilter === 'UNLABELED' ? 'orders-filter-active' : ''}`}
                    onClick={() => setStrategyFilter('UNLABELED')}
                    title="Show unlabeled trades"
                  >
                    <X size={12} /> Unlabeled ({unlabeledCount})
                  </button>
                )}
              </div>
            )}
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
                    <th>Strategy</th>
                    <th>Notes</th>
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
                    const notes = tradeJournal.filter(j => j.tradeId === trade.id);

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
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {trade.strategy && trade.strategy.trim() ? (
                              <span className="strategy-badge">{trade.strategy}</span>
                            ) : (
                              <span className="text-muted" style={{ fontSize: '0.85rem' }}>—</span>
                            )}
                            <button
                              type="button"
                              className="trade-action-icon-btn"
                              onClick={() => {
                                setShowStrategyModal({ tradeId: trade.id, current: trade.strategy || '' });
                                setStrategyInput(trade.strategy || '');
                              }}
                              title={trade.strategy ? 'Edit strategy' : 'Assign strategy'}
                            >
                              <Edit2 size={12} />
                            </button>
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`trade-journal-btn ${notes.length > 0 ? 'trade-journal-btn-active' : ''}`}
                            onClick={() => setShowJournalModal(trade.id)}
                            title={notes.length > 0 ? `View ${notes.length} note(s)` : 'Add journal note'}
                          >
                            <BookOpen size={12} />
                            <span>{notes.length > 0 ? `${notes.length}` : '+ Note'}</span>
                          </button>
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

      {/* ── Assign Strategy Modal ── */}
      {showStrategyModal && (
        <div className="modal-overlay" onClick={() => setShowStrategyModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title" style={{ fontSize: '1.25rem' }}>Assign Strategy</h2>
                <p className="modal-subtitle">Trade ID: {showStrategyModal.tradeId}</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowStrategyModal(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label htmlFor="strategy-modal-input">Strategy Label</label>
                <input
                  id="strategy-modal-input"
                  type="text"
                  value={strategyInput}
                  onChange={e => setStrategyInput(e.target.value)}
                  placeholder="e.g. Breakout, Momentum, Mean Reversion"
                  autoFocus
                />
              </div>

              <div style={{ marginTop: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
                  Quick presets:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {['Breakout', 'Momentum', 'Trend Following', 'Scalp', 'Mean Reversion', 'Swing'].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      className="strategy-preset-chip"
                      onClick={() => setStrategyInput(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                Strategy labels are user-defined tags used for grouping analytics. They do not alter authoritative execution records, prices, or account balances.
              </p>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                {showStrategyModal.current && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm text-danger"
                    onClick={() => {
                      updateTradeStrategy(showStrategyModal.tradeId, '');
                      setShowStrategyModal(null);
                    }}
                  >
                    Clear Strategy
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowStrategyModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    updateTradeStrategy(showStrategyModal.tradeId, strategyInput);
                    setShowStrategyModal(null);
                  }}
                >
                  Save Strategy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Trade Journal Modal ── */}
      {showJournalModal && (
        <div className="modal-overlay" onClick={() => setShowJournalModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: '640px', width: '95%' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-body" style={{ padding: '20px' }}>
              <TradeJournal
                tradeId={showJournalModal === 'ALL' ? undefined : showJournalModal}
                tradeSymbol={
                  showJournalModal === 'ALL'
                    ? undefined
                    : trades.find(t => t.id === showJournalModal)?.symbol
                }
                onClose={() => setShowJournalModal(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TradeHistory;
