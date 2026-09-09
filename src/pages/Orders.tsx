import React, { useState, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { OrderSide } from '../types';
import { Clock, ArrowUpRight, ArrowDownRight, FileText } from 'lucide-react';

type FilterOption = 'ALL' | OrderSide;

const Orders: React.FC = () => {
  const { trades } = useTrading();
  const [filter, setFilter] = useState<FilterOption>('ALL');

  // Sort newest-first (trades are already prepended newest-first in context,
  // but we sort explicitly to guarantee correctness after localStorage reload)
  const sortedAndFiltered = useMemo(() => {
    const filtered = filter === 'ALL'
      ? trades
      : trades.filter(t => t.side === filter);

    return [...filtered].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [trades, filter]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
  };

  const filters: { label: string; value: FilterOption }[] = [
    { label: 'All Trades', value: 'ALL' },
    { label: 'Buys', value: 'BUY' },
    { label: 'Sells', value: 'SELL' },
  ];

  const totalTrades = trades.length;
  const buyCount = trades.filter(t => t.side === 'BUY').length;
  const sellCount = trades.filter(t => t.side === 'SELL').length;
  const totalRealizedPnL = trades.reduce((sum, t) => sum + (t.realizedPnL ?? 0), 0);

  return (
    <div className="orders-page">
      <h1 className="page-title">Orders & Trade History</h1>

      {/* Summary Cards */}
      <div className="orders-summary-grid">
        <div className="card orders-summary-card">
          <div className="card-title">Total Trades</div>
          <div className="card-value">{totalTrades}</div>
        </div>
        <div className="card orders-summary-card">
          <div className="card-title">Buy Orders</div>
          <div className="card-value" style={{ color: 'var(--success)' }}>{buyCount}</div>
        </div>
        <div className="card orders-summary-card">
          <div className="card-title">Sell Orders</div>
          <div className="card-value" style={{ color: 'var(--danger)' }}>{sellCount}</div>
        </div>
        <div className="card orders-summary-card">
          <div className="card-title">Realized P&L</div>
          <div className={`card-value ${totalRealizedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatCurrency(totalRealizedPnL)}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="orders-filter-bar">
        <div className="orders-filter-group">
          {filters.map(f => (
            <button
              key={f.value}
              className={`orders-filter-btn ${filter === f.value ? 'orders-filter-active' : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
              {f.value === 'ALL' && <span className="orders-filter-count">{totalTrades}</span>}
              {f.value === 'BUY' && <span className="orders-filter-count">{buyCount}</span>}
              {f.value === 'SELL' && <span className="orders-filter-count">{sellCount}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Trade Table or Empty State */}
      {sortedAndFiltered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <FileText size={48} />
            <h3>No trades yet</h3>
            <p>
              {filter === 'ALL'
                ? 'Execute your first trade from a stock detail page to see your order history here.'
                : `No ${filter} orders found. Try changing the filter or execute a ${filter.toLowerCase()} trade.`
              }
            </p>
          </div>
        </div>
      ) : (
        <div className="table-container orders-table-container">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Type</th>
                <th>Symbol</th>
                <th>Company</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th style={{ textAlign: 'right' }}>Total Value</th>
                <th style={{ textAlign: 'right' }}>Realized P&L</th>
              </tr>
            </thead>
            <tbody>
              {sortedAndFiltered.map(trade => (
                <tr key={trade.id} className="orders-trade-row">
                  <td>
                    <div className="orders-datetime">
                      <span className="orders-date">{formatDate(trade.timestamp)}</span>
                      <span className="orders-time">{formatTime(trade.timestamp)}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`orders-side-badge ${trade.side === 'BUY' ? 'orders-side-buy' : 'orders-side-sell'}`}>
                      {trade.side === 'BUY'
                        ? <ArrowDownRight size={14} />
                        : <ArrowUpRight size={14} />
                      }
                      {trade.side}
                    </span>
                  </td>
                  <td>
                    <span className="orders-symbol">{trade.symbol}</span>
                  </td>
                  <td>
                    <span className="orders-company">{trade.companyName}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {trade.quantity}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {formatCurrency(trade.executionPrice)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatCurrency(trade.totalValue)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {trade.realizedPnL !== null ? (
                      <span className={trade.realizedPnL >= 0 ? 'text-success' : 'text-danger'} style={{ fontWeight: 600 }}>
                        {trade.realizedPnL >= 0 ? '+' : ''}{formatCurrency(trade.realizedPnL)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="orders-table-footer">
            <Clock size={14} />
            <span>Showing {sortedAndFiltered.length} of {totalTrades} trade{totalTrades !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
