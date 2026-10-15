import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTrading, enrichHoldings, aggregatePortfolio } from '../context/TradingContext';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Briefcase,
  DollarSign,
  Layers,
  PieChart,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  Shield,
  Zap,
  History,
  Scale,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Info,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  ReferenceLine
} from 'recharts';

/* ── Format helpers (module scope, no hooks) ── */

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

const formatCurrency2 = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

const formatSignedCurrency = (value: number) => {
  const formatted = formatCurrency(value);
  return value > 0 ? '+' + formatted : formatted;
};

const formatPercent = (value: number) => {
  const formatted = value.toFixed(2) + '%';
  return value > 0 ? '+' + formatted : formatted;
};

/* ── Stable color from symbol string ── */

const stringToColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
};

/* ── Curated sector color palette ── */

const SECTOR_COLORS: Record<string, string> = {
  'IT Services': '#6366f1',
  'Banking': '#10b981',
  'Conglomerates': '#f59e0b',
  'Pharmaceuticals': '#ec4899',
  'Automotive': '#8b5cf6',
  'FMCG': '#14b8a6',
  'Metals & Mining': '#f97316',
  'Insurance': '#06b6d4',
  'Energy': '#ef4444',
  'Telecom': '#84cc16',
  'Financial Services': '#0ea5e9',
  'Unknown': '#64748b'
};

const getSectorColor = (sector: string): string =>
  SECTOR_COLORS[sector] ?? stringToColor(sector);

/* ── Chart tooltip styles via inline wrappers ── */

const donutTooltipContent = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="tooltip-box">
        <div className="tooltip-name">{d.name || d.symbol}</div>
        <div className="tooltip-row">
          <span>Value</span>
          <span>{formatCurrency(d.value)}</span>
        </div>
        {d.percent !== undefined && (
          <div className="tooltip-row">
            <span>Allocation</span>
            <span>{d.percent.toFixed(1)}%</span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

const barTooltipContent = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="tooltip-box">
        <div className="tooltip-name">{d.symbol}</div>
        <div className="tooltip-row">
          <span>P&L</span>
          <span style={{ color: d.unrealizedPnL >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {formatSignedCurrency(d.unrealizedPnL)}
          </span>
        </div>
        <div className="tooltip-row">
          <span>Return %</span>
          <span>{formatPercent(d.unrealizedPnLPercent)}</span>
        </div>
      </div>
    );
  }
  return null;
};

/* ── Component ── */

const Portfolio = () => {
  const { account, holdings, stocks, trades, portfolioSnapshots, simulateTick } = useTrading();
  const navigate = useNavigate();
  const [perfChartTab, setPerfChartTab] = useState<'snapshots' | 'derived'>('snapshots');

  const hasHoldings = holdings.length > 0;

  /* ── Derived portfolio rows via centralized helper ── */

  const portfolioRows = useMemo(() => {
    return enrichHoldings(holdings, stocks);
  }, [holdings, stocks]);

  /* ── Portfolio totals via centralized helper ── */

  const {
    totalInvestedValue,
    totalCurrentValue,
    totalUnrealizedPnL,
    realizedPnL,
    combinedPnL,
    totalAccountValue,
    totalReturnPercent,
    dayPnL
  } = useMemo(() => {
    return aggregatePortfolio(holdings, stocks, account, trades);
  }, [holdings, stocks, account, trades]);

  /* ── Holdings with allocation ── */

  const holdingsWithAllocation = useMemo(() => {
    return portfolioRows.map(row => ({
      ...row,
      allocationPercent: totalCurrentValue > 0 ? (row.currentValue / totalCurrentValue) * 100 : 0
    }));
  }, [portfolioRows, totalCurrentValue]);

  /* ── Position Intelligence ── */

  const bestPerformer = useMemo(() => {
    if (holdingsWithAllocation.length === 0) return null;
    return [...holdingsWithAllocation].sort((a, b) => b.unrealizedPnLPercent - a.unrealizedPnLPercent)[0];
  }, [holdingsWithAllocation]);

  const worstPerformer = useMemo(() => {
    if (holdingsWithAllocation.length === 0) return null;
    return [...holdingsWithAllocation].sort((a, b) => a.unrealizedPnLPercent - b.unrealizedPnLPercent)[0];
  }, [holdingsWithAllocation]);

  const largestPosition = useMemo(() => {
    if (holdingsWithAllocation.length === 0) return null;
    return [...holdingsWithAllocation].sort((a, b) => b.currentValue - a.currentValue)[0];
  }, [holdingsWithAllocation]);

  const highestAllocation = useMemo(() => {
    if (holdingsWithAllocation.length === 0) return null;
    return [...holdingsWithAllocation].sort((a, b) => b.allocationPercent - a.allocationPercent)[0];
  }, [holdingsWithAllocation]);

  /* ── Risk Snapshot ──
   * Concentration rule (documented):
   *   < 20% largest position  → Low
   *   >= 20% and < 40%        → Moderate
   *   >= 40%                  → High
   */

  const riskSnapshot = useMemo(() => {
    if (holdingsWithAllocation.length === 0) return null;
    // Note: using spread to avoid mutating holdingsWithAllocation
    const sorted = [...holdingsWithAllocation].sort((a, b) => b.currentValue - a.currentValue);
    const largestPct = sorted[0] ? sorted[0].allocationPercent : 0;
    const concentration = largestPct < 20 ? 'Low' : largestPct < 40 ? 'Moderate' : 'High';
    const gainers = holdingsWithAllocation.filter(h => h.unrealizedPnL > 0).length;
    const losers = holdingsWithAllocation.filter(h => h.unrealizedPnL < 0).length;
    return { holdingsCount: holdingsWithAllocation.length, largestPositionPct: largestPct, concentration, gainers, losers };
  }, [holdingsWithAllocation]);

  /* ── Sector Allocation ── */

  const sectorAllocation = useMemo(() => {
    const sectorMap = new Map<string, number>();
    holdingsWithAllocation.forEach(row => {
      const sector = row.sector || 'Unknown';
      sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + row.currentValue);
    });
    const sectors: { name: string; value: number; percent: number; color: string }[] = [];
    sectorMap.forEach((value, name) => {
      sectors.push({
        name,
        value,
        percent: totalCurrentValue > 0 ? (value / totalCurrentValue) * 100 : 0,
        color: getSectorColor(name)
      });
    });
    return sectors.sort((a, b) => b.value - a.value);
  }, [holdingsWithAllocation, totalCurrentValue]);

  /* ── Portfolio Value Over Time (derived from trade history) ── */

  const portfolioValueHistory = useMemo(() => {
    if (trades.length === 0) return [];

    const sortedTrades = [...trades].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let cash = account.startingBalance;
    const symbolData = new Map<string, { quantity: number; avgCost: number }>();
    const data: { date: string; cash: number; costBasis: number; derivedTotal: number }[] = [];

    // Initial state
    data.push({
      date: 'Start',
      cash: account.startingBalance,
      costBasis: 0,
      derivedTotal: account.startingBalance
    });

    sortedTrades.forEach(trade => {
      if (trade.side === 'BUY') {
        cash -= trade.totalValue;
        const existing = symbolData.get(trade.symbol);
        if (existing) {
          const newQty = existing.quantity + trade.quantity;
          const newAvgCost = ((existing.avgCost * existing.quantity) + trade.totalValue) / newQty;
          symbolData.set(trade.symbol, { quantity: newQty, avgCost: Number(newAvgCost.toFixed(2)) });
        } else {
          symbolData.set(trade.symbol, { quantity: trade.quantity, avgCost: trade.executionPrice });
        }
      } else {
        cash += trade.totalValue;
        const existing = symbolData.get(trade.symbol);
        if (existing) {
          const newQty = existing.quantity - trade.quantity;
          if (newQty <= 0) {
            symbolData.delete(trade.symbol);
          } else {
            symbolData.set(trade.symbol, { ...existing, quantity: newQty });
          }
        }
      }

      const costBasis = Array.from(symbolData.values()).reduce(
        (sum, d) => sum + d.avgCost * d.quantity, 0
      );

      data.push({
        date: new Date(trade.timestamp).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        cash: Number(cash.toFixed(0)),
        costBasis: Number(costBasis.toFixed(0)),
        derivedTotal: Number((cash + costBasis).toFixed(0))
      });
    });

    return data;
  }, [trades, account.startingBalance]);

  /* ── Position P&L data ── */

  const positionPnlData = useMemo(() => {
    return holdingsWithAllocation.map(row => ({
      symbol: row.symbol,
      unrealizedPnL: row.unrealizedPnL,
      unrealizedPnLPercent: row.unrealizedPnLPercent
    }));
  }, [holdingsWithAllocation]);

  /* ── Day 21 Analytics: Herfindahl-Hirschman Index (HHI) ──
   * HHI = sum of squared percentage weights of individual holdings (0 to 10,000 scale).
   * US DOJ / FTC benchmarks:
   *   < 1,500        → High Diversification (Low concentration risk)
   *   1,500 – 2,500  → Moderate Concentration
   *   > 2,500        → High Concentration (Dominated by few holdings)
   */

  const hhiAnalysis = useMemo(() => {
    if (holdingsWithAllocation.length === 0 || totalCurrentValue <= 0) {
      return {
        score: 0,
        level: 'Uninvested' as const,
        color: '#64748b',
        badgeClass: 'd21-portfolio-badge-neutral',
        description: 'No active holdings. HHI concentration cannot be evaluated with zero invested equity.'
      };
    }

    let sumSquaredWeights = 0;
    for (const h of holdingsWithAllocation) {
      const val = Math.max(0, h.currentValue || 0);
      const weight = (val / totalCurrentValue) * 100;
      sumSquaredWeights += weight * weight;
    }

    const score = Math.round(sumSquaredWeights);

    if (score < 1500) {
      return {
        score,
        level: 'High Diversification' as const,
        color: '#10b981',
        badgeClass: 'd21-portfolio-badge-success',
        description: 'HHI < 1,500 indicates broad diversification with low single-asset concentration risk.'
      };
    } else if (score <= 2500) {
      return {
        score,
        level: 'Moderate Concentration' as const,
        color: '#f59e0b',
        badgeClass: 'd21-portfolio-badge-warning',
        description: 'HHI 1,500–2,500 indicates moderate concentration. A few positions hold significant weight.'
      };
    } else {
      return {
        score,
        level: 'High Concentration' as const,
        color: '#ef4444',
        badgeClass: 'd21-portfolio-badge-danger',
        description: 'HHI > 2,500 indicates high concentration. Portfolio outcome is heavily dependent on a few positions.'
      };
    }
  }, [holdingsWithAllocation, totalCurrentValue]);

  /* ── Day 21 Analytics: Cash Allocation Indicator ──
   * Cash Allocation % = (cashBalance / totalAccountValue) * 100
   * Measures liquidity buffer and market sensitivity.
   */

  const cashAllocation = useMemo(() => {
    const safeTotal = Math.max(0, totalAccountValue || 0);
    const safeCash = Math.max(0, account.cashBalance || 0);
    const safeInvested = Math.max(0, totalCurrentValue || 0);

    const cashPercent = safeTotal > 0 ? Math.min(100, Math.max(0, (safeCash / safeTotal) * 100)) : 0;
    const investedPercent = Math.max(0, 100 - cashPercent);

    let stance: 'Defensive / High Cash' | 'Balanced Allocation' | 'Aggressive / High Equity' = 'Balanced Allocation';
    let description = '';

    if (cashPercent >= 50) {
      stance = 'Defensive / High Cash';
      description = `${cashPercent.toFixed(1)}% held in liquid cash. Provides capital protection and dry powder with lower market volatility exposure.`;
    } else if (cashPercent >= 20) {
      stance = 'Balanced Allocation';
      description = `${cashPercent.toFixed(1)}% held in cash. Balances capital deployment in equity positions with an active liquidity cushion.`;
    } else {
      stance = 'Aggressive / High Equity';
      description = `${cashPercent.toFixed(1)}% in cash (${investedPercent.toFixed(1)}% in equity). Majority of portfolio value is actively exposed to market movements.`;
    }

    return {
      cashBalance: safeCash,
      investedValue: safeInvested,
      totalAccountValue: safeTotal,
      cashPercent,
      investedPercent,
      stance,
      description
    };
  }, [account.cashBalance, totalAccountValue, totalCurrentValue]);

  /* ── Day 21 Analytics: Profitable and Losing Holdings ──
   * Counts positions with positive, negative, and zero (break-even) unrealized P&L.
   */

  const holdingsHealth = useMemo(() => {
    const total = holdingsWithAllocation.length;
    if (total === 0) {
      return {
        total: 0,
        gainers: 0,
        losers: 0,
        breakeven: 0,
        winRate: 0,
        totalUnrealizedGains: 0,
        totalUnrealizedLosses: 0
      };
    }

    let gainers = 0;
    let losers = 0;
    let breakeven = 0;
    let totalUnrealizedGains = 0;
    let totalUnrealizedLosses = 0;

    for (const h of holdingsWithAllocation) {
      if (h.unrealizedPnL > 0) {
        gainers++;
        totalUnrealizedGains += h.unrealizedPnL;
      } else if (h.unrealizedPnL < 0) {
        losers++;
        totalUnrealizedLosses += Math.abs(h.unrealizedPnL);
      } else {
        breakeven++;
      }
    }

    const winRate = total > 0 ? (gainers / total) * 100 : 0;

    return {
      total,
      gainers,
      losers,
      breakeven,
      winRate,
      totalUnrealizedGains,
      totalUnrealizedLosses
    };
  }, [holdingsWithAllocation]);

  /* ── Day 21 Analytics: Sector Exposure Insights ── */

  const sectorInsights = useMemo(() => {
    if (sectorAllocation.length === 0) {
      return {
        topSector: null,
        sectorCount: 0,
        concentrationLevel: 'None',
        badgeClass: 'd21-portfolio-badge-neutral',
        description: 'No sectors represented. Open positions to see industry allocation.'
      };
    }

    const top = sectorAllocation[0];
    const count = sectorAllocation.length;
    const isHigh = top.percent > 40;
    const isMod = top.percent > 25;

    const concentrationLevel = isHigh ? 'High Concentration' : isMod ? 'Moderate Concentration' : 'Well Balanced';
    const badgeClass = isHigh ? 'd21-portfolio-badge-danger' : isMod ? 'd21-portfolio-badge-warning' : 'd21-portfolio-badge-success';
    const description = isHigh
      ? `Dominant exposure in ${top.name} (${top.percent.toFixed(1)}%). Significant vulnerability to industry-specific shocks.`
      : isMod
        ? `Lead sector is ${top.name} (${top.percent.toFixed(1)}%) across ${count} active sectors.`
        : `Well-distributed across ${count} sectors. Top sector (${top.name}) represents only ${top.percent.toFixed(1)}%.`;

    return {
      topSector: top,
      sectorCount: count,
      concentrationLevel,
      badgeClass,
      description
    };
  }, [sectorAllocation]);

  /* ── Day 21 Analytics: Recorded Performance Snapshots Data ── */

  const snapshotChartData = useMemo(() => {
    if (!portfolioSnapshots || portfolioSnapshots.length === 0) return [];
    return [...portfolioSnapshots]
      .filter(s => s && typeof s.totalAccountValue === 'number' && !isNaN(s.totalAccountValue))
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((s, idx) => {
        const d = new Date(s.timestamp);
        const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
        return {
          ...s,
          idx: idx + 1,
          timeStr,
          dateStr,
          displayLabel: `${dateStr} ${timeStr}`,
          shortLabel: timeStr,
          totalValue: Number(s.totalAccountValue.toFixed(2)),
          investedValue: Number(s.totalInvestedValue.toFixed(2)),
          currentValue: Number(s.totalCurrentValue.toFixed(2)),
          unrealizedPnL: Number(s.totalUnrealizedPnL.toFixed(2)),
          realizedPnL: Number(s.realizedPnL.toFixed(2)),
          returnPercent: Number(s.totalReturnPercent.toFixed(2))
        };
      });
  }, [portfolioSnapshots]);

  const snapshotStats = useMemo(() => {
    if (snapshotChartData.length === 0) return null;
    const values = snapshotChartData.map(d => d.totalValue);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const first = snapshotChartData[0];
    const latest = snapshotChartData[snapshotChartData.length - 1];
    const netChange = latest.totalValue - first.totalValue;
    const netChangePct = first.totalValue > 0 ? (netChange / first.totalValue) * 100 : 0;
    return {
      count: snapshotChartData.length,
      latestValue: latest.totalValue,
      minVal,
      maxVal,
      netChange,
      netChangePct,
      firstTime: first.displayLabel,
      latestTime: latest.displayLabel
    };
  }, [snapshotChartData]);

  const snapshotTooltipContent = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="tooltip-box d21-portfolio-snapshot-tooltip">
          <div className="tooltip-name">{d.displayLabel}</div>
          <div className="tooltip-row">
            <span>Portfolio Value</span>
            <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{formatCurrency(d.totalValue)}</span>
          </div>
          <div className="tooltip-row">
            <span>Invested (Cost)</span>
            <span>{formatCurrency(d.investedValue)}</span>
          </div>
          <div className="tooltip-row">
            <span>Market Value</span>
            <span>{formatCurrency(d.currentValue)}</span>
          </div>
          <div className="tooltip-row">
            <span>Unrealized P&L</span>
            <span style={{ color: d.unrealizedPnL >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatSignedCurrency(d.unrealizedPnL)}
            </span>
          </div>
          <div className="tooltip-row">
            <span>Realized P&L</span>
            <span style={{ color: d.realizedPnL >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatSignedCurrency(d.realizedPnL)}
            </span>
          </div>
          <div className="tooltip-row">
            <span>Return vs Starting</span>
            <span style={{ color: d.returnPercent >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatPercent(d.returnPercent)}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  /* ── Render ── */

  return (
    <div className="portfolio-page">
      {/* ── Hero Header ── */}
      <div className="portfolio-hero">
        <div className="portfolio-hero-main">
          <div className="portfolio-hero-left">
            <h1 className="portfolio-hero-title">Portfolio</h1>
            <div className="portfolio-hero-value">{formatCurrency(totalAccountValue)}</div>
            <div className="portfolio-hero-meta">
              <span className={`portfolio-hero-change ${totalReturnPercent >= 0 ? 'text-success' : 'text-danger'}`}>
                {totalReturnPercent >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                {formatPercent(totalReturnPercent)}
              </span>
              <span className="portfolio-hero-sep">•</span>
              <span className="portfolio-hero-label">Total Return vs ₹10L starting capital</span>
            </div>
          </div>
          {hasHoldings && (
            <div className="portfolio-hero-right">
              <div className="portfolio-hero-stat">
                <span className="portfolio-hero-stat-label">Day P&L</span>
                <span className={`portfolio-hero-stat-value ${dayPnL >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatSignedCurrency(dayPnL)}
                </span>
              </div>
              <div className="portfolio-hero-stat">
                <span className="portfolio-hero-stat-label">Combined P&L</span>
                <span className={`portfolio-hero-stat-value ${combinedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatSignedCurrency(combinedPnL)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Performance Metrics Grid ── */}
      <h2 className="portfolio-section-title">
        <Activity size={18} />
        Portfolio Performance
      </h2>
      <div className="portfolio-metrics-grid">
        <div className="card portfolio-metric-card">
          <div className="portfolio-metric-icon-wrap portfolio-metric-icon-blue">
            <DollarSign size={18} />
          </div>
          <div className="portfolio-metric-info">
            <div className="card-title">Total Portfolio Value</div>
            <div className="card-value">{formatCurrency(totalAccountValue)}</div>
            <div className="card-subtitle text-muted">Cash + market value</div>
          </div>
        </div>

        <div className="card portfolio-metric-card">
          <div className="portfolio-metric-icon-wrap portfolio-metric-icon-purple">
            <Briefcase size={18} />
          </div>
          <div className="portfolio-metric-info">
            <div className="card-title">Invested (Cost Basis)</div>
            <div className="card-value">{formatCurrency(totalInvestedValue)}</div>
            <div className="card-subtitle text-muted">Total cost basis</div>
          </div>
        </div>

        <div className="card portfolio-metric-card">
          <div className="portfolio-metric-icon-wrap portfolio-metric-icon-cyan">
            <BarChart3 size={18} />
          </div>
          <div className="portfolio-metric-info">
            <div className="card-title">Current Market Value</div>
            <div className="card-value">{formatCurrency(totalCurrentValue)}</div>
            <div className="card-subtitle text-muted">Holdings at market price</div>
          </div>
        </div>

        <div className="card portfolio-metric-card">
          <div className="portfolio-metric-icon-wrap portfolio-metric-icon-green">
            <Wallet size={18} />
          </div>
          <div className="portfolio-metric-info">
            <div className="card-title">Available Cash</div>
            <div className="card-value text-success">{formatCurrency(account.cashBalance)}</div>
            <div className="card-subtitle text-muted">Virtual buying power</div>
          </div>
        </div>

        <div className="card portfolio-metric-card">
          <div className={`portfolio-metric-icon-wrap ${realizedPnL >= 0 ? 'portfolio-metric-icon-green' : 'portfolio-metric-icon-red'}`}>
            <TrendingUp size={18} />
          </div>
          <div className="portfolio-metric-info">
            <div className="card-title">Realized P&L</div>
            <div className={`card-value ${realizedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
              {formatSignedCurrency(realizedPnL)}
            </div>
            <div className="card-subtitle text-muted">From closed trades</div>
          </div>
        </div>

        <div className="card portfolio-metric-card">
          <div className={`portfolio-metric-icon-wrap ${totalUnrealizedPnL >= 0 ? 'portfolio-metric-icon-green' : 'portfolio-metric-icon-red'}`}>
            <Activity size={18} />
          </div>
          <div className="portfolio-metric-info">
            <div className="card-title">Unrealized P&L</div>
            <div className={`card-value ${totalUnrealizedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
              {formatSignedCurrency(totalUnrealizedPnL)}
            </div>
            <div className="card-subtitle text-muted">Open positions</div>
          </div>
        </div>

        <div className="card portfolio-metric-card">
          <div className={`portfolio-metric-icon-wrap ${combinedPnL >= 0 ? 'portfolio-metric-icon-green' : 'portfolio-metric-icon-red'}`}>
            <Zap size={18} />
          </div>
          <div className="portfolio-metric-info">
            <div className="card-title">Combined P&L</div>
            <div className={`card-value ${combinedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
              {formatSignedCurrency(combinedPnL)}
            </div>
            <div className="card-subtitle text-muted">Realized + unrealized</div>
          </div>
        </div>

        <div className="card portfolio-metric-card">
          <div className={`portfolio-metric-icon-wrap ${totalReturnPercent >= 0 ? 'portfolio-metric-icon-green' : 'portfolio-metric-icon-red'}`}>
            {totalReturnPercent >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          </div>
          <div className="portfolio-metric-info">
            <div className="card-title">Total Return</div>
            <div className={`card-value ${totalReturnPercent >= 0 ? 'text-success' : 'text-danger'}`}>
              {formatPercent(totalReturnPercent)}
            </div>
            <div className="card-subtitle text-muted">vs starting capital</div>
          </div>
        </div>

        {hasHoldings && (
          <div className="card portfolio-metric-card">
            <div className={`portfolio-metric-icon-wrap ${dayPnL >= 0 ? 'portfolio-metric-icon-green' : 'portfolio-metric-icon-red'}`}>
              {dayPnL >= 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
            </div>
            <div className="portfolio-metric-info">
              <div className="card-title">Day P&L</div>
              <div className={`card-value ${dayPnL >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatSignedCurrency(dayPnL)}
              </div>
              <div className="card-subtitle text-muted">Today's price change × holdings</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Position Intelligence (only when holdings exist) ── */}
      {hasHoldings && (
        <>
          <h2 className="portfolio-section-title">
            <Target size={18} />
            Position Intelligence
          </h2>
          <div className="portfolio-intel-grid">
            <div className="card portfolio-intel-card">
              <div className="portfolio-intel-icon portfolio-intel-icon-blue">
                <Layers size={18} />
              </div>
              <div className="portfolio-intel-label">Holdings</div>
              <div className="portfolio-intel-value">{holdingsWithAllocation.length}</div>
              <div className="portfolio-intel-subtitle">positions in portfolio</div>
            </div>

            <div className="card portfolio-intel-card">
              <div className="portfolio-intel-icon portfolio-intel-icon-success">
                <TrendingUp size={18} />
              </div>
              <div className="portfolio-intel-label">Best Performer</div>
              {bestPerformer ? (
                <>
                  <div className="portfolio-intel-value text-success">{bestPerformer.symbol}</div>
                  <div className="portfolio-intel-subtitle">{bestPerformer.companyName}</div>
                  <div className="card-subtitle text-success">{formatPercent(bestPerformer.unrealizedPnLPercent)}</div>
                </>
              ) : (
                <>
                  <div className="portfolio-intel-value text-muted">—</div>
                  <div className="portfolio-intel-subtitle">No holdings yet</div>
                </>
              )}
            </div>

            <div className="card portfolio-intel-card">
              <div className="portfolio-intel-icon portfolio-intel-icon-danger">
                <TrendingDown size={18} />
              </div>
              <div className="portfolio-intel-label">Worst Performer</div>
              {worstPerformer ? (
                <>
                  <div className={`portfolio-intel-value ${worstPerformer.unrealizedPnLPercent >= 0 ? 'text-success' : 'text-danger'}`}>
                    {worstPerformer.symbol}
                  </div>
                  <div className="portfolio-intel-subtitle">{worstPerformer.companyName}</div>
                  <div className={`card-subtitle ${worstPerformer.unrealizedPnLPercent >= 0 ? 'text-success' : 'text-danger'}`}>
                    {formatPercent(worstPerformer.unrealizedPnLPercent)}
                  </div>
                </>
              ) : (
                <>
                  <div className="portfolio-intel-value text-muted">—</div>
                  <div className="portfolio-intel-subtitle">No holdings yet</div>
                </>
              )}
            </div>

            <div className="card portfolio-intel-card">
              <div className="portfolio-intel-icon portfolio-intel-icon-blue">
                <BarChart3 size={18} />
              </div>
              <div className="portfolio-intel-label">Largest Position</div>
              {largestPosition ? (
                <>
                  <div className="portfolio-intel-value">{largestPosition.symbol}</div>
                  <div className="portfolio-intel-subtitle">{largestPosition.companyName}</div>
                  <div className="card-subtitle text-muted">{formatCurrency(largestPosition.currentValue)}</div>
                </>
              ) : (
                <>
                  <div className="portfolio-intel-value text-muted">—</div>
                  <div className="portfolio-intel-subtitle">No holdings yet</div>
                </>
              )}
            </div>

            <div className="card portfolio-intel-card">
              <div className="portfolio-intel-icon portfolio-intel-icon-success">
                <Target size={18} />
              </div>
              <div className="portfolio-intel-label">Highest Allocation</div>
              {highestAllocation ? (
                <>
                  <div className="portfolio-intel-value">{highestAllocation.symbol}</div>
                  <div className="portfolio-intel-subtitle">{highestAllocation.companyName}</div>
                  <div className="card-subtitle text-muted">{highestAllocation.allocationPercent.toFixed(1)}% of portfolio</div>
                </>
              ) : (
                <>
                  <div className="portfolio-intel-value text-muted">—</div>
                  <div className="portfolio-intel-subtitle">No holdings yet</div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Day 21: Portfolio Risk & Concentration Analytics ── */}
      <div className="d21-portfolio-section-header">
        <h2 className="portfolio-section-title" style={{ margin: 0 }}>
          <Shield size={18} />
          Risk & Diversification Analytics
        </h2>
        <button
          className="d21-portfolio-sim-btn"
          onClick={() => simulateTick()}
          title="Advance market tick and record a portfolio snapshot"
        >
          <RefreshCw size={14} />
          Simulate Tick & Snapshot
        </button>
      </div>

      <div className="d21-portfolio-analytics-grid">
        {/* Card 1: HHI Diversification Score */}
        <div className="d21-portfolio-analytics-card">
          <div>
            <div className="d21-portfolio-card-header">
              <div className="d21-portfolio-card-title">
                <Scale size={16} color="var(--primary)" />
                Diversification (HHI)
              </div>
              <span className={`d21-portfolio-badge ${hhiAnalysis.badgeClass}`}>
                {hhiAnalysis.level}
              </span>
            </div>

            <div className="d21-portfolio-score-wrap">
              <div className="d21-portfolio-score-main">
                <span className="d21-portfolio-score-val" style={{ color: hhiAnalysis.color }}>
                  {hhiAnalysis.score.toLocaleString('en-IN')}
                </span>
                <span className="d21-portfolio-score-sub">/ 10,000</span>
              </div>
            </div>

            <div className="d21-portfolio-hhi-bar-container">
              <div className="d21-portfolio-hhi-bar">
                <div className="d21-portfolio-hhi-seg d21-hhi-seg-low" style={{ width: '15%' }} title="0–1,500: Diversified" />
                <div className="d21-portfolio-hhi-seg d21-hhi-seg-mid" style={{ width: '10%' }} title="1,500–2,500: Moderate" />
                <div className="d21-portfolio-hhi-seg d21-hhi-seg-high" style={{ width: '75%' }} title="2,500–10,000: Concentrated" />
                {hhiAnalysis.score > 0 && (
                  <div
                    className="d21-portfolio-hhi-marker"
                    style={{ left: `${Math.min(99, Math.max(1, (hhiAnalysis.score / 10000) * 100))}%` }}
                    title={`Current HHI: ${hhiAnalysis.score}`}
                  />
                )}
              </div>
              <div className="d21-portfolio-hhi-labels">
                <span>0 (Max Div)</span>
                <span>1,500</span>
                <span>2,500</span>
                <span>10,000 (Solo)</span>
              </div>
            </div>
          </div>

          <div className="d21-portfolio-card-desc">
            {hhiAnalysis.description}
          </div>
        </div>

        {/* Card 2: Cash Allocation */}
        <div className="d21-portfolio-analytics-card">
          <div>
            <div className="d21-portfolio-card-header">
              <div className="d21-portfolio-card-title">
                <Wallet size={16} color="var(--success)" />
                Cash Allocation
              </div>
              <span className="d21-portfolio-badge d21-portfolio-badge-primary">
                {cashAllocation.stance}
              </span>
            </div>

            <div className="d21-portfolio-score-wrap">
              <div className="d21-portfolio-score-main">
                <span className="d21-portfolio-score-val text-success">
                  {cashAllocation.cashPercent.toFixed(1)}%
                </span>
                <span className="d21-portfolio-score-sub">cash buffer</span>
              </div>
            </div>

            <div className="d21-portfolio-split-bar">
              <div
                className="d21-portfolio-split-cash"
                style={{ width: `${cashAllocation.cashPercent}%` }}
                title={`Cash: ${formatCurrency(cashAllocation.cashBalance)} (${cashAllocation.cashPercent.toFixed(1)}%)`}
              />
              <div
                className="d21-portfolio-split-equity"
                style={{ width: `${cashAllocation.investedPercent}%` }}
                title={`Equity: ${formatCurrency(cashAllocation.investedValue)} (${cashAllocation.investedPercent.toFixed(1)}%)`}
              />
            </div>
            <div className="d21-portfolio-split-legend">
              <span className="d21-portfolio-split-item">
                <span className="d21-portfolio-split-dot" style={{ backgroundColor: '#10b981' }} />
                Cash: {formatCurrency(cashAllocation.cashBalance)}
              </span>
              <span className="d21-portfolio-split-item">
                <span className="d21-portfolio-split-dot" style={{ backgroundColor: '#6366f1' }} />
                Equity: {formatCurrency(cashAllocation.investedValue)}
              </span>
            </div>
          </div>

          <div className="d21-portfolio-card-desc">
            {cashAllocation.description}
          </div>
        </div>

        {/* Card 3: Position Health & Win Rate */}
        <div className="d21-portfolio-analytics-card">
          <div>
            <div className="d21-portfolio-card-header">
              <div className="d21-portfolio-card-title">
                <Target size={16} color="#38bdf8" />
                Holdings Health
              </div>
              <span className="d21-portfolio-badge d21-portfolio-badge-success">
                {holdingsHealth.total > 0 ? `${holdingsHealth.winRate.toFixed(0)}% Profitable` : 'No Holdings'}
              </span>
            </div>

            <div className="d21-portfolio-health-stats">
              <div className="d21-portfolio-health-stat">
                <div className="d21-portfolio-health-label text-success">
                  <CheckCircle2 size={12} />
                  Profitable
                </div>
                <div className="d21-portfolio-health-val text-success">
                  {holdingsHealth.gainers}
                </div>
              </div>
              <div className="d21-portfolio-health-stat">
                <div className="d21-portfolio-health-label text-danger">
                  <XCircle size={12} />
                  Losing
                </div>
                <div className="d21-portfolio-health-val text-danger">
                  {holdingsHealth.losers}
                </div>
              </div>
              <div className="d21-portfolio-health-stat">
                <div className="d21-portfolio-health-label text-muted">
                  <MinusCircle size={12} />
                  Break-even
                </div>
                <div className="d21-portfolio-health-val text-muted">
                  {holdingsHealth.breakeven}
                </div>
              </div>
            </div>

            {holdingsHealth.total > 0 && (
              <div className="d21-portfolio-health-bar">
                <div
                  className="d21-portfolio-health-seg-gain"
                  style={{ width: `${(holdingsHealth.gainers / holdingsHealth.total) * 100}%` }}
                />
                <div
                  className="d21-portfolio-health-seg-lose"
                  style={{ width: `${(holdingsHealth.losers / holdingsHealth.total) * 100}%` }}
                />
                <div
                  className="d21-portfolio-health-seg-even"
                  style={{ width: `${(holdingsHealth.breakeven / holdingsHealth.total) * 100}%` }}
                />
              </div>
            )}
          </div>

          <div className="d21-portfolio-card-desc">
            {holdingsHealth.total > 0
              ? `Unrealized gains: +${formatCurrency(holdingsHealth.totalUnrealizedGains)} across ${holdingsHealth.gainers} winning positions vs -${formatCurrency(holdingsHealth.totalUnrealizedLosses)} in paper losses.`
              : 'Open paper trading positions to monitor unrealized gains, losses, and position win rate.'}
          </div>
        </div>

        {/* Card 4: Sector Concentration Insights */}
        <div className="d21-portfolio-analytics-card">
          <div>
            <div className="d21-portfolio-card-header">
              <div className="d21-portfolio-card-title">
                <PieChart size={16} color="#f59e0b" />
                Sector Concentration
              </div>
              <span className={`d21-portfolio-badge ${sectorInsights.badgeClass}`}>
                {sectorInsights.concentrationLevel}
              </span>
            </div>

            <div className="d21-portfolio-score-wrap">
              <div className="d21-portfolio-score-main">
                <span className="d21-portfolio-score-val" style={{ color: sectorInsights.topSector ? 'var(--text-main)' : 'var(--text-muted)' }}>
                  {sectorInsights.topSector ? `${sectorInsights.topSector.percent.toFixed(1)}%` : '—'}
                </span>
                <span className="d21-portfolio-score-sub">
                  {sectorInsights.topSector ? `in ${sectorInsights.topSector.name}` : 'no sectors'}
                </span>
              </div>
            </div>

            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Representing <strong>{sectorInsights.sectorCount}</strong> distinct sector{sectorInsights.sectorCount === 1 ? '' : 's'}
            </div>
          </div>

          <div className="d21-portfolio-card-desc">
            {sectorInsights.description}
          </div>
        </div>
      </div>

      {/* ── Existing Risk Snapshot Summary (when holdings exist) ── */}
      {riskSnapshot && (
        <div className="portfolio-risk-grid" style={{ marginBottom: '32px' }}>
          <div className="card portfolio-risk-card">
            <div className="portfolio-risk-label">Holdings Count</div>
            <div className="portfolio-risk-value">{riskSnapshot.holdingsCount}</div>
            <div className="portfolio-risk-subtitle">positions in book</div>
          </div>
          <div className="card portfolio-risk-card">
            <div className="portfolio-risk-label">Largest Position</div>
            <div className="portfolio-risk-value">{riskSnapshot.largestPositionPct.toFixed(1)}%</div>
            <div className="portfolio-risk-subtitle">of total market value</div>
          </div>
          <div className="card portfolio-risk-card">
            <div className="portfolio-risk-label">Gainers / Losers</div>
            <div className="portfolio-risk-value">
              <span className="text-success">{riskSnapshot.gainers}</span>
              {' / '}
              <span className="text-danger">{riskSnapshot.losers}</span>
            </div>
            <div className="portfolio-risk-subtitle">winning / losing positions</div>
          </div>
          <div className="card portfolio-risk-card">
            <div className="portfolio-risk-label">Concentration Risk</div>
            <div className="portfolio-risk-value">
              <span className={`concentration-badge concentration-${riskSnapshot.concentration.toLowerCase()}`}>
                {riskSnapshot.concentration}
              </span>
            </div>
            <div className="portfolio-risk-subtitle">
              {riskSnapshot.concentration === 'Low'
                ? 'Well diversified'
                : riskSnapshot.concentration === 'Moderate'
                  ? 'Moderate concentration risk'
                  : 'High concentration risk'}
            </div>
          </div>
        </div>
      )}

      {/* ── Holdings Table ── */}
      <h2 className="portfolio-section-title">
        <Briefcase size={18} />
        Holdings
      </h2>
      {holdingsWithAllocation.length > 0 ? (
        <div className="table-container portfolio-table-container">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Company</th>
                <th>Quantity</th>
                <th>Avg. Buy Price</th>
                <th>Current Price</th>
                <th>Invested Value</th>
                <th>Current Value</th>
                <th>Unrealized P&L</th>
                <th>P&L %</th>
                <th>Allocation</th>
              </tr>
            </thead>
            <tbody>
              {holdingsWithAllocation.map((row) => (
                <tr
                  key={row.symbol}
                  className="stock-row-clickable"
                  onClick={() => navigate(`/stock/${row.symbol}`)}
                >
                  <td>
                    <Link
                      to={`/stock/${row.symbol}`}
                      className="portfolio-symbol-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.symbol}
                      <ArrowRight size={14} />
                    </Link>
                  </td>
                  <td>{row.companyName}</td>
                  <td style={{ fontWeight: 600 }}>{row.quantity}</td>
                  <td>{formatCurrency2(row.averageBuyPrice)}</td>
                  <td>{formatCurrency2(row.currentPrice)}</td>
                  <td>{formatCurrency(row.investedValue)}</td>
                  <td>{formatCurrency(row.currentValue)}</td>
                  <td className={row.unrealizedPnL >= 0 ? 'text-success' : 'text-danger'}>
                    {formatSignedCurrency(row.unrealizedPnL)}
                  </td>
                  <td className={row.unrealizedPnLPercent >= 0 ? 'text-success' : 'text-danger'}>
                    {formatPercent(row.unrealizedPnLPercent)}
                  </td>
                  <td className="allocation-cell">{row.allocationPercent.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state card">
          <Briefcase size={48} />
          <h3>No holdings yet</h3>
          <p>Your virtual holdings will appear here after you place your first paper trade.</p>
          <p style={{ marginTop: 8, fontSize: '0.85rem' }}>
            Available cash: <strong className="text-success">{formatCurrency(account.cashBalance)}</strong>
          </p>
        </div>
      )}

      {/* ── Portfolio Allocation (only when holdings exist) ── */}
      {holdingsWithAllocation.length > 0 && (
        <>
          <h2 className="portfolio-section-title">
            <PieChart size={18} />
            Portfolio Allocation
          </h2>
          <div className="portfolio-chart-grid">
            {/* Donut Chart — Stock Allocation */}
            <div className="card">
              <div className="card-title">Stock Allocation</div>
              <div className="portfolio-donut-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <RechartsPieChart>
                    <Pie
                      data={holdingsWithAllocation}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={110}
                      dataKey="currentValue"
                      nameKey="symbol"
                      label={false}
                    >
                      {holdingsWithAllocation.map((row) => (
                        <Cell key={`cell-${row.symbol}`} fill={stringToColor(row.symbol)} />
                      ))}
                    </Pie>
                    <RechartsTooltip content={donutTooltipContent} />
                    <RechartsLegend />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="portfolio-donut-center">
                  <div className="portfolio-donut-total">{formatCurrency(totalCurrentValue)}</div>
                  <div className="portfolio-donut-label">Total Market Value</div>
                </div>
              </div>
            </div>

            {/* Sector Allocation — Pie + Bars */}
            <div className="card">
              <div className="card-title">Sector Allocation</div>
              {sectorAllocation.length > 1 ? (
                <div className="portfolio-donut-wrap">
                  <ResponsiveContainer width="100%" height={280}>
                    <RechartsPieChart>
                      <Pie
                        data={sectorAllocation}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={110}
                        dataKey="value"
                        nameKey="name"
                        label={false}
                      >
                        {sectorAllocation.map((sector) => (
                          <Cell key={`sector-${sector.name}`} fill={sector.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={donutTooltipContent} />
                      <RechartsLegend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                  <div className="portfolio-donut-center">
                    <div className="portfolio-donut-total">{sectorAllocation.length}</div>
                    <div className="portfolio-donut-label">Sectors</div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
                  {sectorAllocation.map(sector => (
                    <div key={sector.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600 }}>
                          {sector.name}
                        </span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {sector.percent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="allocation-bar">
                        <div
                          className="allocation-bar-fill"
                          style={{ width: sector.percent + '%', backgroundColor: sector.color }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sector Breakdown Bars (always shown below charts) */}
          {sectorAllocation.length > 0 && (
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-title">Sector Breakdown</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
                {sectorAllocation.map(sector => (
                  <div key={sector.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="allocation-dot" style={{ backgroundColor: sector.color }}></span>
                        {sector.name}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {sector.percent.toFixed(1)}% — {formatCurrency(sector.value)}
                      </span>
                    </div>
                    <div className="allocation-bar">
                      <div
                        className="allocation-bar-fill"
                        style={{ width: sector.percent + '%', backgroundColor: sector.color }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stock Allocation Rows */}
          <div className="card" style={{ marginTop: '0' }}>
            <div className="card-title">Individual Stock Allocation</div>
            {holdingsWithAllocation.map((row) => {
              const color = stringToColor(row.symbol);
              return (
                <div className="allocation-row" key={row.symbol}>
                  <div className="allocation-symbol-wrap">
                    <div className="allocation-symbol">
                      <span className="allocation-dot" style={{ backgroundColor: color }}></span>
                      {row.symbol}
                    </div>
                    <div className="allocation-company">{row.companyName}</div>
                  </div>
                  <div className="allocation-bar">
                    <div
                      className="allocation-bar-fill"
                      style={{ width: row.allocationPercent + '%', backgroundColor: color }}
                    ></div>
                  </div>
                  <div className="allocation-percent">{row.allocationPercent.toFixed(1)}%</div>
                  <div className="allocation-value">{formatCurrency(row.currentValue)}</div>
                </div>
              );
            })}
            <div className="allocation-footer">
              <span>Total Holdings Value</span>
              <span>{formatCurrency(totalCurrentValue)}</span>
            </div>
          </div>
        </>
      )}

      {/* ── Day 21: Performance History & Valuation Visualization ── */}
      <h2 className="portfolio-section-title">
        <Zap size={18} />
        Performance History & Valuation
      </h2>

      <div className="card d21-portfolio-perf-card">
        <div className="d21-portfolio-perf-header">
          <div>
            <div className="card-title" style={{ marginBottom: 4 }}>
              {perfChartTab === 'snapshots'
                ? 'Simulated Portfolio Valuation History (Recorded Snapshots)'
                : 'Portfolio Value Over Time (Trade-Derived)'}
            </div>
            <div className="card-subtitle text-muted">
              {perfChartTab === 'snapshots'
                ? 'Chronological record of portfolio valuation captured during simulated market ticks.'
                : 'Built only from trade history (cash + cost-basis). Market price changes are not included.'}
            </div>
          </div>

          <div className="d21-portfolio-tab-group">
            <button
              className={`d21-portfolio-tab-btn ${perfChartTab === 'snapshots' ? 'd21-portfolio-tab-active' : ''}`}
              onClick={() => setPerfChartTab('snapshots')}
            >
              <History size={14} />
              Recorded Snapshots ({snapshotChartData.length})
            </button>
            <button
              className={`d21-portfolio-tab-btn ${perfChartTab === 'derived' ? 'd21-portfolio-tab-active' : ''}`}
              onClick={() => setPerfChartTab('derived')}
            >
              <BarChart3 size={14} />
              Trade Cost Basis ({trades.length})
            </button>
          </div>
        </div>

        {perfChartTab === 'snapshots' ? (
          snapshotChartData.length === 0 ? (
            <div className="d21-portfolio-empty-history">
              <History size={48} className="d21-portfolio-empty-icon" />
              <h3 className="d21-portfolio-empty-title">No Performance Snapshots Recorded Yet</h3>
              <p className="d21-portfolio-empty-desc">
                TradeLab captures performance snapshots during simulated market ticks. Click below or turn on auto-simulation in Settings to build your valuation timeline.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => simulateTick()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 8 }}
              >
                <RefreshCw size={14} />
                Record First Snapshot
              </button>
            </div>
          ) : (
            <>
              {snapshotStats && (
                <div className="d21-portfolio-snapshot-summary">
                  <div className="d21-portfolio-stat-pill">
                    <span className="d21-portfolio-stat-pill-label">Latest Valuation</span>
                    <span className="d21-portfolio-stat-pill-val">{formatCurrency(snapshotStats.latestValue)}</span>
                  </div>
                  <div className="d21-portfolio-stat-pill">
                    <span className="d21-portfolio-stat-pill-label">Peak Valuation</span>
                    <span className="d21-portfolio-stat-pill-val text-success">{formatCurrency(snapshotStats.maxVal)}</span>
                  </div>
                  <div className="d21-portfolio-stat-pill">
                    <span className="d21-portfolio-stat-pill-label">Trough Valuation</span>
                    <span className="d21-portfolio-stat-pill-val text-danger">{formatCurrency(snapshotStats.minVal)}</span>
                  </div>
                  <div className="d21-portfolio-stat-pill">
                    <span className="d21-portfolio-stat-pill-label">Net Snapshot Change</span>
                    <span className={`d21-portfolio-stat-pill-val ${snapshotStats.netChange >= 0 ? 'text-success' : 'text-danger'}`}>
                      {formatSignedCurrency(snapshotStats.netChange)} ({formatPercent(snapshotStats.netChangePct)})
                    </span>
                  </div>
                  <div className="d21-portfolio-stat-pill">
                    <span className="d21-portfolio-stat-pill-label">Snapshots Captured</span>
                    <span className="d21-portfolio-stat-pill-val">{snapshotStats.count} records</span>
                  </div>
                </div>
              )}

              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={snapshotChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="d21SnapshotGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    domain={['auto', 'auto']}
                    tickFormatter={((v: number) => {
                      if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
                      if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
                      return `₹${(v / 1000).toFixed(0)}K`;
                    }) as any}
                  />
                  <RechartsTooltip content={snapshotTooltipContent} />
                  <Area
                    type="monotone"
                    dataKey="totalValue"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#d21SnapshotGrad)"
                    dot={{ r: snapshotChartData.length === 1 ? 5 : 2, fill: '#6366f1' }}
                    activeDot={{ r: 6, fill: '#818cf8' }}
                    name="Total Portfolio Value"
                  />
                </AreaChart>
              </ResponsiveContainer>

              <div className="d21-portfolio-card-desc" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14 }}>
                <Info size={14} color="#818cf8" />
                <span>
                  <strong>Locally Recorded Simulated Performance:</strong> Values represent your virtual portfolio valuation recorded at simulated market ticks. This does not represent real-world historical market performance.
                </span>
              </div>
            </>
          )
        ) : (
          /* Derived Trade History Chart */
          portfolioValueHistory.length > 0 ? (
            <>
              <div className="derived-note" style={{ marginBottom: 12 }}>
                Built only from trade history (cash + cost-basis). NOT real market history — market price changes are not included.
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={portfolioValueHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={((v: number) => {
                      if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
                      if (v >= 100000) return `₹${(v / 100000).toFixed(0)}L`;
                      return `₹${(v / 1000).toFixed(0)}K`;
                    }) as any}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: 'var(--panel-bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--text-main)'
                    }}
                    formatter={((value: number) => [formatCurrency(value), '']) as any}
                  />
                  <Area
                    type="monotone"
                    dataKey="cash"
                    stackId="1"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.3}
                    name="Cash"
                  />
                  <Area
                    type="monotone"
                    dataKey="costBasis"
                    stackId="1"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.3}
                    name="Cost Basis"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </>
          ) : (
            <div className="empty-state" style={{ padding: '32px 16px' }}>
              <p>No trade execution history yet. Place orders to populate cash & cost basis history.</p>
            </div>
          )
        )}
      </div>

      {/* Position P&L Bar Chart (when holdings exist) */}
      {positionPnlData.length > 0 && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-title">Position P&L (Unrealized)</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={positionPnlData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="symbol" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={((v: number) => `₹${(v / 1000).toFixed(0)}K`) as any}
              />
              <RechartsTooltip content={barTooltipContent} />
              <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
              <Bar dataKey="unrealizedPnL" radius={[4, 4, 0, 0]}>
                {positionPnlData.map((entry) => (
                  <Cell key={entry.symbol} fill={entry.unrealizedPnL >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Paper Trading Notice ── */}
      <div className="card portfolio-notice">
        <Wallet size={20} />
        <p>
          This is a simulated paper trading environment. All funds, holdings, and P&L figures are virtual —
          no real money is involved, and market data displayed on this platform is for demonstration purposes only.
        </p>
      </div>
    </div>
  );
};

export default Portfolio;
