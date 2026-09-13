import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTrading } from '../context/TradingContext';
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
  Zap
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
  const { account, holdings, stocks, trades } = useTrading();
  const navigate = useNavigate();

  const hasHoldings = holdings.length > 0;

  /* ── Derived portfolio rows ── */

  const portfolioRows = useMemo(() => {
    return holdings.map(holding => {
      const stock = stocks.find(s => s.symbol === holding.symbol);
      const currentPrice = stock ? stock.price : holding.averageBuyPrice;
      const investedValue = holding.averageBuyPrice * holding.quantity;
      const currentValue = currentPrice * holding.quantity;
      const unrealizedPnL = currentValue - investedValue;
      const unrealizedPnLPercent = investedValue > 0 ? (unrealizedPnL / investedValue) * 100 : 0;

      return {
        symbol: holding.symbol,
        companyName: stock ? stock.companyName : holding.symbol,
        quantity: holding.quantity,
        averageBuyPrice: holding.averageBuyPrice,
        currentPrice,
        investedValue,
        currentValue,
        unrealizedPnL,
        unrealizedPnLPercent,
        sector: stock ? stock.sector : 'Unknown'
      };
    });
  }, [holdings, stocks]);

  /* ── Portfolio totals ── */

  const {
    totalCostBasis,
    totalCurrentValue,
    totalUnrealizedPnL,
    realizedPnL,
    combinedPnL,
    portfolioValue,
    totalReturnPercent,
    dayPnL
  } = useMemo(() => {
    let costBasis = 0;
    let currentValue = 0;
    portfolioRows.forEach(row => {
      costBasis += row.averageBuyPrice * row.quantity;
      currentValue += row.currentValue;
    });
    const unrealizedPnL = currentValue - costBasis;
    const realized = trades.reduce((sum, t) => sum + (t.realizedPnL ?? 0), 0);
    const portValue = account.cashBalance + currentValue;
    const returnPct = account.startingBalance > 0
      ? ((portValue - account.startingBalance) / account.startingBalance) * 100
      : 0;
    const dayPnL = holdings.reduce((sum, h) => {
      const stock = stocks.find(s => s.symbol === h.symbol);
      return sum + (stock ? stock.change * h.quantity : 0);
    }, 0);

    return {
      totalCostBasis: costBasis,
      totalCurrentValue: currentValue,
      totalUnrealizedPnL: unrealizedPnL,
      realizedPnL: realized,
      combinedPnL: realized + unrealizedPnL,
      portfolioValue: portValue,
      totalReturnPercent: returnPct,
      dayPnL
    };
  }, [portfolioRows, trades, account, holdings, stocks]);

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

  /* ── Render ── */

  return (
    <div className="portfolio-page">
      {/* ── Hero Header ── */}
      <div className="portfolio-hero">
        <div className="portfolio-hero-main">
          <div className="portfolio-hero-left">
            <h1 className="portfolio-hero-title">Portfolio</h1>
            <div className="portfolio-hero-value">{formatCurrency(portfolioValue)}</div>
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
            <div className="card-value">{formatCurrency(portfolioValue)}</div>
            <div className="card-subtitle text-muted">Cash + market value</div>
          </div>
        </div>

        <div className="card portfolio-metric-card">
          <div className="portfolio-metric-icon-wrap portfolio-metric-icon-purple">
            <Briefcase size={18} />
          </div>
          <div className="portfolio-metric-info">
            <div className="card-title">Invested (Cost Basis)</div>
            <div className="card-value">{formatCurrency(totalCostBasis)}</div>
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

      {/* ── Risk Snapshot (only when holdings exist) ── */}
      {riskSnapshot && (
        <>
          <h2 className="portfolio-section-title">
            <Shield size={18} />
            Risk Snapshot
          </h2>
          <div className="portfolio-risk-grid">
            <div className="card portfolio-risk-card">
              <div className="portfolio-risk-label">Holdings</div>
              <div className="portfolio-risk-value">{riskSnapshot.holdingsCount}</div>
              <div className="portfolio-risk-subtitle">positions</div>
            </div>
            <div className="card portfolio-risk-card">
              <div className="portfolio-risk-label">Largest Position</div>
              <div className="portfolio-risk-value">{riskSnapshot.largestPositionPct.toFixed(1)}%</div>
              <div className="portfolio-risk-subtitle">of total value</div>
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
              <div className="portfolio-risk-label">Concentration</div>
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
        </>
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

      {/* ── Performance Visualization ── */}
      {(trades.length > 0 || holdingsWithAllocation.length > 0) && (
        <>
          <h2 className="portfolio-section-title">
            <Zap size={18} />
            Performance Visualization
          </h2>
          <div className="portfolio-chart-grid">
            {/* Portfolio Value Over Time (derived from trade history) */}
            {portfolioValueHistory.length > 0 && (
              <div className="card">
                <div className="card-title">Portfolio Value Over Time (Derived)</div>
                <div className="derived-note">
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
              </div>
            )}

            {/* Position P&L Bar Chart */}
            {positionPnlData.length > 0 && (
              <div className="card">
                <div className="card-title">Position P&L</div>
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
          </div>
        </>
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
