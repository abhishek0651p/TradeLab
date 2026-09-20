import React, { useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { Link, useNavigate } from 'react-router-dom';
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

import {
  Shield,
  Activity,
  DollarSign,
  Wallet,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Briefcase,
  Target,
  Layers,
  Zap,
  Clock,
  AlertTriangle
} from 'lucide-react';

import {
  computeMarketValue,
  computePortfolioValue,
  computeCashUtilization,
  computeLargestPositionPercent,
  computePositionRiskRows,
  computeSectorRiskRows,
  computeGainersLosers,
  computeConcentrationClassification
} from '../risk/RiskCalculationModel';

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

/* ── Component ── */

const Risk = () => {
  const { account, holdings, stocks } = useTrading();
  const navigate = useNavigate();

  /* ── Derived risk metrics ── */

  const hasHoldings = holdings.length > 0;
  const totalMarketValue = hasHoldings ? computeMarketValue(holdings, stocks) : 0;
  const portfolioValue = hasHoldings ? computePortfolioValue(account.cashBalance, holdings, stocks) : account.cashBalance;

  /* ── Position-level risk data ── */

  const positionRows = useMemo(() => {
    return computePositionRiskRows(holdings, stocks);
  }, [holdings, stocks]);

  /* ── Sector-level risk data ── */

  const sectorRows = useMemo(() => {
    return computeSectorRiskRows(holdings, stocks);
  }, [holdings, stocks]);

  /* ── Risk snapshots and counts ── */

  const gainersLosers = useMemo(() => {
    return computeGainersLosers(holdings, stocks);
  }, [holdings, stocks]);

  const largestPositionPct = useMemo(() => {
    return computeLargestPositionPercent(holdings, stocks);
  }, [holdings, stocks]);

  const largestSectorPct = useMemo(() => {
    const sectorMap = new Map<string, number>();
    holdings.forEach(h => {
      const stock = stocks.find(s => s.symbol === h.symbol);
      const sector = stock ? stock.sector : 'Unknown';
      const price = stock ? stock.price : h.averageBuyPrice ?? 0;
      const currentValue = price * h.quantity;
      sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + currentValue);
    });
    const total = computeMarketValue(holdings, stocks);
    if (total === 0) return 0;
    let largest = 0;
    sectorMap.forEach(value => {
      const pct = (value / total) * 100;
      if (pct > largest) largest = pct;
    });
    return largest;
  }, [holdings, stocks]);

  const cashUtilizationPct = useMemo(() => {
    return computeCashUtilization(account.cashBalance, holdings, stocks);
  }, [account.cashBalance, holdings, stocks]);

  const concentrationClassification = useMemo(() => {
    return computeConcentrationClassification(largestPositionPct);
  }, [largestPositionPct]);

  /* ── Generate warnings based on current risk state ── */

  const warnings = useMemo(() => {
    const warns: string[] = [];

    // Position concentration warning
    if (largestPositionPct > 40) {
      const largestPosition = positionRows[0];
      if (largestPosition) {
        warns.push(
          `${largestPosition.symbol} represents ${largestPositionPct.toFixed(1)}% of current market exposure, exceeding the 40% high-concentration threshold.`
        );
      }
    } else if (largestPositionPct >= 20) {
      const largestPosition = positionRows[0];
      if (largestPosition) {
        warns.push(
          `${largestPosition.symbol} represents ${largestPositionPct.toFixed(1)}% of current market exposure, which is in the moderate-concentration range (20–40%).`
        );
      }
    }

    // Sector concentration warning
    if (largestSectorPct > 50) {
      const largestSector = sectorRows[0];
      if (largestSector) {
        warns.push(
          `${largestSector.sector} represents ${largestSectorPct.toFixed(1)}% of current market exposure, exceeding the 50% sector threshold.`
        );
      }
    }

    // Cash utilization warning
    if (cashUtilizationPct > 80) {
      warns.push(
        `Cash utilization is ${cashUtilizationPct.toFixed(1)}%, leaving limited available capital.`
      );
    }

    return warns;
  }, [largestPositionPct, positionRows, largestSectorPct, sectorRows, cashUtilizationPct]);

  /* ── Render ── */

  return (
    <div className="risk-page">
      {/* ── Hero Header ── */}
      <div className="risk-hero">
        <div className="risk-hero-main">
          <div className="risk-hero-left">
            <h1 className="risk-hero-title">Risk Management</h1>
            <div className="risk-hero-value">{formatCurrency(portfolioValue)}</div>
            <div className="risk-hero-meta">
              <span className={`risk-hero-change ${cashUtilizationPct >= 0 ? 'text-success' : 'text-danger'}`}>
                {cashUtilizationPct >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                {formatPercent(cashUtilizationPct)}
              </span>
              <span className="risk-hero-sep">•</span>
              <span className="risk-hero-label">Cash Utilization</span>
            </div>
          </div>
          {hasHoldings && (
            <div className="risk-hero-right">
              <div className="risk-hero-stat">
                <span className="risk-hero-stat-label">Market Exposure</span>
                <span className="risk-hero-stat-value">{formatCurrency(totalMarketValue)}</span>
              </div>
              <div className="risk-hero-stat">
                <span className="risk-hero-stat-label">Available Cash</span>
                <span className="risk-hero-stat-value text-success">{formatCurrency(account.cashBalance)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Summary Metrics Grid ── */}
      <h2 className="risk-section-title">
        <Activity size={18} />
        Portfolio Overview
      </h2>
      <div className="risk-metrics-grid">
        <div className="card risk-metric-card">
          <div className="risk-metric-icon-wrap risk-metric-icon-blue">
            <DollarSign size={18} />
          </div>
          <div className="risk-metric-info">
            <div className="card-title">Total Portfolio Value</div>
            <div className="card-value">{formatCurrency(portfolioValue)}</div>
            <div className="card-subtitle text-muted">Cash + market value</div>
          </div>
        </div>

        <div className="card risk-metric-card">
          <div className="risk-metric-icon-wrap risk-metric-icon-green">
            <Wallet size={18} />
          </div>
          <div className="risk-metric-info">
            <div className="card-title">Available Cash</div>
            <div className="card-value text-success">{formatCurrency(account.cashBalance)}</div>
            <div className="card-subtitle text-muted">Virtual buying power</div>
          </div>
        </div>

        <div className="card risk-metric-card">
          <div className="risk-metric-icon-wrap risk-metric-icon-purple">
            <BarChart3 size={18} />
          </div>
          <div className="risk-metric-info">
            <div className="card-title">Market Exposure</div>
            <div className="card-value">{formatCurrency(totalMarketValue)}</div>
            <div className="card-subtitle text-muted">Holdings at market price</div>
          </div>
        </div>

        <div className="card risk-metric-card">
          <div className={`risk-metric-icon-wrap ${cashUtilizationPct >= 0 ? 'risk-metric-icon-green' : 'risk-metric-icon-red'}`}>
            <Activity size={18} />
          </div>
          <div className="risk-metric-info">
            <div className="card-title">Cash Utilization</div>
            <div className={`card-value ${cashUtilizationPct >= 0 ? 'text-success' : 'text-danger'}`}>
              {formatPercent(cashUtilizationPct)}
            </div>
            <div className="card-subtitle text-muted">Market exposure / portfolio value</div>
          </div>
        </div>

        <div className="card risk-metric-card">
          <div className={`risk-metric-icon-wrap ${concentrationClassification === 'Low' ? 'risk-metric-icon-green' : concentrationClassification === 'Moderate' ? 'risk-metric-icon-warning' : 'risk-metric-icon-red'}`}>
            <Shield size={18} />
          </div>
          <div className="risk-metric-info">
            <div className="card-title">Largest Position</div>
            <div className="card-value">{largestPositionPct.toFixed(1)}%</div>
            <div className="card-subtitle text-muted">
              {concentrationClassification === 'Low'
                ? 'Well diversified'
                : concentrationClassification === 'Moderate'
                  ? 'Moderate concentration risk'
                  : 'High concentration risk'}
            </div>
          </div>
        </div>

        <div className="card risk-metric-card">
          <div className="risk-metric-icon-wrap risk-metric-icon-blue">
            <Layers size={18} />
          </div>
          <div className="risk-metric-info">
            <div className="card-title">Largest Sector</div>
            <div className="card-value">{largestSectorPct.toFixed(1)}%</div>
            <div className="card-subtitle text-muted">Sector allocation</div>
          </div>
        </div>
      </div>

      {/* ── Position Risk Table (only when holdings exist) ── */}
      {hasHoldings && (
        <>
          <h2 className="risk-section-title">
            <Briefcase size={18} />
            Position Risk
          </h2>
          {positionRows.length > 0 ? (
            <div className="table-container risk-table-container">
              <table className="risk-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Company</th>
                    <th>Sector</th>
                    <th>Qty</th>
                    <th>Current Value</th>
                    <th>Allocation</th>
                    <th>Unrealized P&L</th>
                    <th>P&L %</th>
                    <th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {positionRows.map((row) => (
                    <tr
                      key={row.symbol}
                      className="stock-row-clickable"
                      onClick={() => navigate(`/stock/${row.symbol}`)}
                    >
                      <td>
                        <Link
                          to={`/stock/${row.symbol}`}
                          className="risk-symbol-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.symbol}
                          <ArrowRight size={14} />
                        </Link>
                      </td>
                      <td>{row.companyName}</td>
                      <td>{row.sector}</td>
                      <td style={{ fontWeight: 600 }}>{row.quantity}</td>
                      <td>{formatCurrency(row.currentValue)}</td>
                      <td className="allocation-cell">{row.allocationPercent.toFixed(1)}%</td>
                      <td className={row.unrealizedPnL >= 0 ? 'text-success' : 'text-danger'}>
                        {formatSignedCurrency(row.unrealizedPnL)}
                      </td>
                      <td className={row.unrealizedPnLPercent >= 0 ? 'text-success' : 'text-danger'}>
                        {formatPercent(row.unrealizedPnLPercent)}
                      </td>
                      <td>
                        <span className={`concentration-badge concentration-${row.riskClass.toLowerCase()}`}>
                          {row.riskClass}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state card">
              <Briefcase size={48} />
              <h3>No positions to display</h3>
              <p>Your positions will appear here after you acquire holdings.</p>
            </div>
          )}
        </>
      )}

      {/* ── Sector Risk (only when holdings exist) ── */}
      {hasHoldings && (
        <>
          <h2 className="risk-section-title">
            <Target size={18} />
            Sector Risk
          </h2>
          <div className="risk-chart-grid">
            {/* Donut Chart — Sector Allocation */}
            <div className="card">
              <div className="card-title">Sector Allocation</div>
              <div className="risk-donut-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <RechartsPieChart>
                    <Pie
                      data={sectorRows}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={110}
                      dataKey="currentValue"
                      nameKey="sector"
                      label={false}
                    >
                      {sectorRows.map((sector) => (
                        <Cell key={`sector-${sector.sector}`} fill={getSectorColor(sector.sector)} />
                      ))}
                    </Pie>
                    <RechartsTooltip content={sectorTooltipContent} />
                    <RechartsLegend />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="risk-donut-center">
                  <div className="risk-donut-total">{formatCurrency(totalMarketValue)}</div>
                  <div className="risk-donut-label">Total Market Value</div>
                </div>
              </div>
            </div>

            {/* Sector Breakdown Bars (always shown below charts) */}
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-title">Sector Breakdown</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
                {sectorRows.map(sector => (
                  <div key={sector.sector}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="allocation-dot" style={{ backgroundColor: getSectorColor(sector.sector) }}></span>
                        {sector.sector}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {sector.allocationPercent.toFixed(1)}% — {formatCurrency(sector.currentValue)}
                      </span>
                    </div>
                    <div className="allocation-bar">
                      <div
                        className="allocation-bar-fill"
                        style={{ width: sector.allocationPercent + '%', backgroundColor: getSectorColor(sector.sector) }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Active Warnings ── */}
      <div className="risk-warnings-section">
        <h2 className="risk-section-title">
          <AlertTriangle size={18} />
          Risk Warnings
        </h2>
        <div className="card risk-warnings-card">
          {warnings.length > 0 ? (
            <div>
              {warnings.map((warning, index) => (
                <div key={index} className="risk-warning-item">
                  <AlertTriangle size={16} className="risk-warning-icon" />
                  <span className="risk-warning-text">{warning}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted">
              No significant portfolio concentration or utilization warnings.
            </div>
          )}
        </div>
      </div>

      {/* ── Empty State (when no holdings) ── */}
      {!hasHoldings && (
        <div className="empty-state card">
          <Shield size={48} />
          <h3>No holdings yet</h3>
          <p>Your virtual holdings will appear here after you place your first paper trade.</p>
          <p style={{ marginTop: 8, fontSize: '0.85rem' }}>
            Available cash: <strong className="text-success">{formatCurrency(account.cashBalance)}</strong>
          </p>
        </div>
      )}

      {/* ── Paper Trading Notice ── */}
      <div className="card risk-notice">
        <Shield size={20} />
        <p>
          This is a simulated paper trading environment. All funds, holdings, and risk metrics are virtual —
          no real money is involved, and market data displayed on this platform is for demonstration purposes only.
        </p>
      </div>
    </div>
  );
};

/* ── Helper functions ── */

/**
 * Get color for a sector, using the curated palette from Portfolio or falling back to hash-based color.
 */
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

/**
 * Stable color from symbol string (used for position-level visualization if needed).
 */
const stringToColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
};

/**
 * Tooltip content for sector donut chart.
 */
const sectorTooltipContent = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="tooltip-box">
        <div className="tooltip-name">{d.name || d.sector}</div>
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

export default Risk;