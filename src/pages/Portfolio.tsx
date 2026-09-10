import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTrading } from '../context/TradingContext';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Briefcase,
  Layers,
  PieChart,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet
} from 'lucide-react';

interface PortfolioRow {
  symbol: string;
  companyName: string;
  quantity: number;
  averageBuyPrice: number;
  currentPrice: number;
  investedValue: number;
  currentValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
}

interface PortfolioRowWithAllocation extends PortfolioRow {
  allocationPercent: number;
}

const allocationColors = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#22d3ee'
];

const Portfolio = () => {
  const { account, holdings, stocks, trades } = useTrading();
  const navigate = useNavigate();

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

  const getStock = (symbol: string) => stocks.find(s => s.symbol === symbol);

  const portfolioRows: PortfolioRow[] = holdings.map(holding => {
    const stock = getStock(holding.symbol);
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
      unrealizedPnLPercent
    };
  });

  const totalInvested = portfolioRows.reduce((sum, row) => sum + row.investedValue, 0);
  const totalCurrent = portfolioRows.reduce((sum, row) => sum + row.currentValue, 0);
  const totalUnrealizedPnL = totalCurrent - totalInvested;
  const totalReturnPercent = totalInvested > 0 ? (totalUnrealizedPnL / totalInvested) * 100 : 0;
  const realizedPnL = trades.reduce((sum, trade) => sum + (trade.realizedPnL ?? 0), 0);
  const combinedPnL = realizedPnL + totalUnrealizedPnL;

  const holdingsWithAllocation: PortfolioRowWithAllocation[] = portfolioRows.map(row => ({
    ...row,
    allocationPercent: totalCurrent > 0 ? (row.currentValue / totalCurrent) * 100 : 0
  }));

  const sortedByReturn = [...holdingsWithAllocation].sort((a, b) => b.unrealizedPnLPercent - a.unrealizedPnLPercent);
  const bestPerformer = sortedByReturn[0] ?? null;
  const worstPerformer = sortedByReturn[sortedByReturn.length - 1] ?? null;
  const largestPosition = [...holdingsWithAllocation].sort((a, b) => b.currentValue - a.currentValue)[0] ?? null;

  return (
    <div>
      <h1 className="page-title">Portfolio</h1>

      {/* Portfolio Performance */}
      <h2 className="portfolio-section-title">
        <Activity size={18} />
        Portfolio Performance
      </h2>
      <div className="dashboard-grid">
        <div className="card">
          <div className="card-title">Portfolio Value</div>
          <div className="card-value">{formatCurrency(account.portfolioValue)}</div>
          <div className="card-subtitle text-muted">Cash + current holdings value</div>
        </div>

        <div className="card">
          <div className="card-title">Invested Value</div>
          <div className="card-value">{formatCurrency(totalInvested)}</div>
          <div className="card-subtitle text-muted">Total cost basis</div>
        </div>

        <div className="card">
          <div className="card-title">Available Cash</div>
          <div className="card-value text-success">{formatCurrency(account.cashBalance)}</div>
          <div className="card-subtitle text-muted">Virtual buying power</div>
        </div>

        <div className="card">
          <div className="card-title">Unrealized P&L</div>
          <div className={`card-value ${totalUnrealizedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatSignedCurrency(totalUnrealizedPnL)}
          </div>
          <div className={`card-subtitle ${totalReturnPercent >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatPercent(totalReturnPercent)} on invested value
          </div>
        </div>

        <div className="card">
          <div className="card-title">Total Return</div>
          <div className={`card-value ${totalReturnPercent >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatPercent(totalReturnPercent)}
          </div>
          <div className="card-subtitle text-muted">Based on current holdings</div>
        </div>

        <div className="card">
          <div className="card-title">Realized P&L</div>
          <div className={`card-value ${realizedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatSignedCurrency(realizedPnL)}
          </div>
          <div className="card-subtitle text-muted">From closed paper trades</div>
        </div>

        <div className="card">
          <div className="card-title">Combined P&L</div>
          <div className={`card-value ${combinedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatSignedCurrency(combinedPnL)}
          </div>
          <div className="card-subtitle text-muted">Realized + unrealized</div>
        </div>
      </div>

      {/* Position Intelligence */}
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
      </div>

      {/* Holdings */}
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
                <th>Unrealized P&L %</th>
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
        </div>
      )}

      {/* Portfolio Allocation */}
      {holdingsWithAllocation.length > 0 && (
        <>
          <h2 className="portfolio-section-title">
            <PieChart size={18} />
            Portfolio Allocation
          </h2>
          <div className="card">
            {holdingsWithAllocation.map((row, index) => {
              const color = allocationColors[index % allocationColors.length];
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
              <span>{formatCurrency(totalCurrent)}</span>
            </div>
          </div>
        </>
      )}

      {/* Paper Trading Notice */}
      <div className="card portfolio-notice">
        <Wallet size={20} />
        <p>
          This is a simulated paper trading environment. All funds, holdings, and P&L figures are virtual —
          no real money is involved, and market data is for demonstration purposes only.
        </p>
      </div>
    </div>
  );
};

export default Portfolio;