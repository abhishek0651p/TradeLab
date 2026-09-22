import React, { useMemo } from 'react';
import type { Order, Execution } from '../types';

interface OrderAnalyticsProps {
  orders: Order[];
  executions: Execution[];
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

const OrderAnalytics: React.FC<OrderAnalyticsProps> = ({ orders, executions }) => {
  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const openCount = orders.filter(o => o.status === 'PENDING' || o.status === 'TRIGGERED').length;
    const executedCount = orders.filter(o => o.status === 'EXECUTED').length;
    const rejectedCount = orders.filter(o => o.status === 'REJECTED').length;
    const cancelledCount = orders.filter(o => o.status === 'CANCELLED').length;
    const eligibleOrders = executedCount + rejectedCount + cancelledCount;
    const executionRate = eligibleOrders > 0 ? (executedCount / eligibleOrders) * 100 : 0;
    const buyCount = orders.filter(o => o.side === 'BUY').length;
    const sellCount = orders.filter(o => o.side === 'SELL').length;
    const totalExecutedValue = executions.reduce((sum, e) => sum + e.totalValue, 0);
    const totalExecQty = executions.reduce((sum, e) => sum + e.quantity, 0);
    const avgExecPrice = totalExecQty > 0
      ? executions.reduce((sum, e) => sum + e.executionPrice * e.quantity, 0) / totalExecQty
      : 0;

    const typeCounts: Record<string, number> = { MARKET: 0, LIMIT: 0, STOP_MARKET: 0, STOP_LIMIT: 0, TARGET: 0 };
    orders.forEach(o => { typeCounts[o.type] = (typeCounts[o.type] || 0) + 1; });

    return { totalOrders, openCount, executedCount, rejectedCount, cancelledCount, executionRate, buyCount, sellCount, totalExecutedValue, avgExecPrice, typeCounts };
  }, [orders, executions]);

  return (
    <div className="d17-analytics-header">
      <div className="card d17-analytics-card">
        <div className="d17-analytics-label">Total Orders</div>
        <div className="d17-analytics-value">{stats.totalOrders}</div>
      </div>
      <div className="card d17-analytics-card">
        <div className="d17-analytics-label">Open</div>
        <div className="d17-analytics-value" style={{ color: '#f59e0b' }}>{stats.openCount}</div>
      </div>
      <div className="card d17-analytics-card">
        <div className="d17-analytics-label">Executed</div>
        <div className="d17-analytics-value text-success">{stats.executedCount}</div>
      </div>
      <div className="card d17-analytics-card">
        <div className="d17-analytics-label">Rejected</div>
        <div className="d17-analytics-value text-danger">{stats.rejectedCount}</div>
      </div>
      <div className="card d17-analytics-card">
        <div className="d17-analytics-label">Cancelled</div>
        <div className="d17-analytics-value text-muted">{stats.cancelledCount}</div>
      </div>
      <div className="card d17-analytics-card">
        <div className="d17-analytics-label">Execution Rate</div>
        <div className="d17-analytics-value">{stats.executionRate.toFixed(1)}%</div>
        <div className="d17-analytics-sub">{stats.executedCount} eligible</div>
      </div>
      <div className="card d17-analytics-card">
        <div className="d17-analytics-label">BUY / SELL</div>
        <div className="d17-analytics-value">
          <span style={{ color: 'var(--success)' }}>{stats.buyCount}</span>
          <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>/</span>
          <span style={{ color: 'var(--danger)' }}>{stats.sellCount}</span>
        </div>
      </div>
      <div className="card d17-analytics-card">
        <div className="d17-analytics-label">Total Executed Value</div>
        <div className="d17-analytics-value">
          {stats.totalExecutedValue > 0 ? formatCurrency(stats.totalExecutedValue) : '—'}
        </div>
      </div>
      <div className="card d17-analytics-card">
        <div className="d17-analytics-label">Avg Exec Price</div>
        <div className="d17-analytics-value">
          {stats.avgExecPrice > 0 ? formatCurrency(stats.avgExecPrice) : '—'}
        </div>
      </div>
    </div>
  );
};

export default OrderAnalytics;
