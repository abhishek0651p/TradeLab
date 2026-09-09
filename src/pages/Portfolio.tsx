import React from 'react';
import { useTrading } from '../context/TradingContext';
import { Briefcase, TrendingUp, TrendingDown } from 'lucide-react';

const Portfolio = () => {
  const { account, holdings, stocks } = useTrading();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(value);
  };

  const formatCurrency2 = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const getStock = (symbol: string) => stocks.find(s => s.symbol === symbol);

  const portfolioRows = holdings.map(holding => {
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

  return (
    <div>
      <h1 className="page-title">Portfolio</h1>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-title">Portfolio Value</div>
          <div className="card-value">{formatCurrency(account.portfolioValue)}</div>
        </div>

        <div className="card">
          <div className="card-title">Invested Value</div>
          <div className="card-value">{formatCurrency(account.investedValue)}</div>
        </div>

        <div className="card">
          <div className="card-title">Available Cash</div>
          <div className="card-value text-success">{formatCurrency(account.cashBalance)}</div>
        </div>

        <div className="card">
          <div className="card-title">Unrealized P&L</div>
          <div className={`card-value ${totalUnrealizedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatCurrency(totalUnrealizedPnL)}
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: '32px', marginBottom: '24px' }}>Holdings</h2>

      {portfolioRows.length > 0 ? (
        <div className="table-container">
          <table>
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
              </tr>
            </thead>
            <tbody>
              {portfolioRows.map((row) => (
                <tr key={row.symbol}>
                  <td style={{ fontWeight: 600 }}>{row.symbol}</td>
                  <td>{row.companyName}</td>
                  <td>{row.quantity}</td>
                  <td>{formatCurrency2(row.averageBuyPrice)}</td>
                  <td>{formatCurrency2(row.currentPrice)}</td>
                  <td>{formatCurrency(row.investedValue)}</td>
                  <td>{formatCurrency(row.currentValue)}</td>
                  <td className={row.unrealizedPnL >= 0 ? 'text-success' : 'text-danger'}>
                    {row.unrealizedPnL >= 0 ? '+' : ''}{formatCurrency(row.unrealizedPnL)}
                  </td>
                  <td className={row.unrealizedPnLPercent >= 0 ? 'text-success' : 'text-danger'}>
                    {row.unrealizedPnLPercent >= 0 ? '+' : ''}{row.unrealizedPnLPercent.toFixed(2)}%
                  </td>
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
    </div>
  );
};

export default Portfolio;