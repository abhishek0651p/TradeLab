import React from 'react';
import { useTrading } from '../context/TradingContext';
import { Briefcase } from 'lucide-react';

const Portfolio = () => {
  const { account, positions } = useTrading();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(value);
  };

  return (
    <div>
      <h1 className="page-title">Portfolio</h1>
      
      <div className="dashboard-grid">
        <div className="card">
          <div className="card-title">Portfolio Value</div>
          <div className="card-value">{formatCurrency(account.portfolioValue)}</div>
        </div>
        
        <div className="card">
          <div className="card-title">Invested</div>
          <div className="card-value">{formatCurrency(account.investedValue)}</div>
        </div>

        <div className="card">
          <div className="card-title">Available Cash</div>
          <div className="card-value text-success">{formatCurrency(account.cashBalance)}</div>
        </div>
      </div>

      <h2 style={{ marginTop: '32px', marginBottom: '24px' }}>Holdings</h2>

      {positions.length > 0 ? (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Quantity</th>
                <th>Avg. Price</th>
                <th>Invested Amount</th>
                <th>Current Value</th>
                <th>P&L</th>
                <th>P&L %</th>
              </tr>
            </thead>
            <tbody>
              {/* Future milestone: Render actual holdings here */}
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
