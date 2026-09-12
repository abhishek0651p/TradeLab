import React from 'react';
import { useTrading } from '../context/TradingContext';
import { Clock, Zap } from 'lucide-react';

const Dashboard = () => {
  const { account, orders, trades } = useTrading();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  };

  const pnlPercent = account.investedValue > 0 
    ? ((account.portfolioValue - account.startingBalance) / account.startingBalance) * 100 
    : 0;

  const pendingCount = orders.filter(o => o.status === 'PENDING').length;
  const totalTrades = trades.length;
  const hasActivity = pendingCount > 0 || totalTrades > 0;

  return (
    <div>
      <h1 className="page-title">Virtual Portfolio</h1>
      
      <div className="dashboard-grid">
        <div className="card">
          <div className="card-title">Starting Virtual Capital</div>
          <div className="card-value">{formatCurrency(account.startingBalance)}</div>
        </div>
        
        <div className="card">
          <div className="card-title">Available Cash</div>
          <div className="card-value text-success">{formatCurrency(account.cashBalance)}</div>
        </div>

        <div className="card">
          <div className="card-title">Invested Value</div>
          <div className="card-value">{formatCurrency(account.investedValue)}</div>
        </div>

        <div className="card">
          <div className="card-title">Overall P&L</div>
          <div className={`card-value ${account.realizedPnL + account.unrealizedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatCurrency(account.realizedPnL + account.unrealizedPnL)}
          </div>
          <div className={`card-subtitle ${pnlPercent >= 0 ? 'text-success' : 'text-danger'}`}>
            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Trading Activity — only shown if there's activity */}
      {hasActivity && (
        <div className="d8-dashboard-activity">
          <h2 className="d8-dashboard-activity-title">
            <Zap size={18} />
            Trading Activity
          </h2>
          <div className="d8-dashboard-activity-grid">
            {pendingCount > 0 && (
              <div className="card d8-dashboard-activity-card">
                <div className="d8-activity-icon d8-activity-icon-pending">
                  <Clock size={18} />
                </div>
                <div className="card-title">Pending Orders</div>
                <div className="card-value" style={{ color: 'var(--warning, #f59e0b)' }}>{pendingCount}</div>
                <div className="card-subtitle text-muted">Awaiting execution</div>
              </div>
            )}
            <div className="card d8-dashboard-activity-card">
              <div className="d8-activity-icon d8-activity-icon-trades">
                <Zap size={18} />
              </div>
              <div className="card-title">Total Trades</div>
              <div className="card-value">{totalTrades}</div>
              <div className="card-subtitle text-muted">Executed transactions</div>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: '32px' }}>
        <h2 style={{ marginBottom: '16px' }}>Paper Trading Notice</h2>
        <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
          This is a simulated paper trading environment. All funds are virtual. No real money is involved.
          Market data displayed on this platform is for demonstration purposes only and may not reflect real-time market prices.
        </p>
      </div>
    </div>
  );
};

export default Dashboard;
