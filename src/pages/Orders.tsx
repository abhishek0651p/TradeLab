import React, { useState, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { OrderSide, OrderStatus, OrderType } from '../types';
import {
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  ShieldCheck,
  XCircle,
  AlertTriangle,
  List,
  BarChart3,
  Zap,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Timer,
  Activity,
  Play,
  Pause,
} from 'lucide-react';
import OrderFilters from '../components/OrderFilters';
import OrderAnalytics from '../components/OrderAnalytics';
import OrderDetails from '../components/OrderDetails';

type ActiveTab = 'orders' | 'trades' | 'executions';
type OrderFilterStatus = 'ALL' | OrderStatus;
type SideFilter = 'ALL' | OrderSide;

const Orders: React.FC = () => {
  const {
    trades, orders, executions, stocks, cancelOrder,
    processPendingOrders, simulateTick, tick,
    autoSimActive, settings,
  } = useTrading();

  const [activeTab, setActiveTab] = useState<ActiveTab>('orders');
  const [orderStatusFilter, setOrderStatusFilter] = useState<OrderFilterStatus>('ALL');
  const [sideFilter, setSideFilter] = useState<SideFilter>('ALL');
  const [tradeFilter, setTradeFilter] = useState<SideFilter>('ALL');
  // Day 17 filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<OrderType | 'ALL'>('ALL');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // ── Formatting helpers ──

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  };

  const getStatusClass = (status: OrderStatus | string): string => {
    switch (status) {
      case 'PENDING': return 'order-status-pending';
      case 'TRIGGERED': return 'order-status-triggered';
      case 'EXECUTED': return 'order-status-executed';
      case 'CANCELLED': return 'order-status-cancelled';
      case 'REJECTED': return 'order-status-rejected';
      default: return '';
    }
  };

  const getStatusIcon = (status: OrderStatus | string) => {
    switch (status) {
      case 'PENDING': return <Clock size={12} />;
      case 'TRIGGERED': return <Zap size={12} />;
      case 'EXECUTED': return <ShieldCheck size={12} />;
      case 'CANCELLED': return <XCircle size={12} />;
      case 'REJECTED': return <AlertTriangle size={12} />;
      default: return null;
    }
  };

  const getCurrentPrice = (symbol: string): number => {
    const stock = stocks.find(s => s.symbol === symbol);
    return stock ? stock.price : 0;
  };

  // ── Summary metrics ──

  const totalOrders = orders.length;
  const pendingCount = orders.filter(o => o.status === 'PENDING').length;
  const triggeredCount = orders.filter(o => o.status === 'TRIGGERED').length;
  const executedCount = orders.filter(o => o.status === 'EXECUTED').length;
  const cancelledCount = orders.filter(o => o.status === 'CANCELLED').length;
  const rejectedCount = orders.filter(o => o.status === 'REJECTED').length;
  const totalTrades = trades.length;
  const totalRealizedPnL = trades.reduce((sum, t) => sum + (t.realizedPnL ?? 0), 0);

  // ── Filtered orders (presentation only — underlying orders never mutated) ──

  const filteredOrders = useMemo(() => {
    let filtered = orders;
    if (orderStatusFilter !== 'ALL') {
      filtered = filtered.filter(o => o.status === orderStatusFilter);
    }
    if (sideFilter !== 'ALL') {
      filtered = filtered.filter(o => o.side === sideFilter);
    }
    if (typeFilter !== 'ALL') {
      filtered = filtered.filter(o => o.type === typeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(o =>
        o.symbol.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.companyName.toLowerCase().includes(q)
      );
    }
    return [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, orderStatusFilter, sideFilter, typeFilter, searchQuery]);

  // ── Filtered trades ──

  const filteredTrades = useMemo(() => {
    const filtered = tradeFilter === 'ALL' ? trades : trades.filter(t => t.side === tradeFilter);
    return [...filtered].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [trades, tradeFilter]);

  // ── Sorted executions ──

  const sortedExecutions = useMemo(() => {
    return [...executions].sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
  }, [executions]);

  // ── Cancel handler ──

  const handleCancel = (orderId: string) => {
    const result = cancelOrder(orderId);
    if (!result.success) {
      window.alert(result.error);
    }
  };

  // ── Process pending orders ──

  const handleProcessPending = () => {
    processPendingOrders();
  };

  // ── Filter state helpers ──

  const activeFilterCount = [
    orderStatusFilter !== 'ALL',
    sideFilter !== 'ALL',
    typeFilter !== 'ALL',
    searchQuery.trim() !== '',
  ].filter(Boolean).length;

  const handleClearFilters = () => {
    setOrderStatusFilter('ALL');
    setSideFilter('ALL');
    setTypeFilter('ALL');
    setSearchQuery('');
  };

  // ── Tab config ──

  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'orders', label: 'Order Book', icon: <List size={16} />, count: totalOrders },
    { id: 'trades', label: 'Trade History', icon: <BarChart3 size={16} />, count: totalTrades },
    { id: 'executions', label: 'Executions', icon: <Zap size={16} />, count: executions.length },
  ];

  return (
    <div className="orders-page">
      <h1 className="page-title">Trading Activity</h1>

      {/* Summary Cards */}
      <div className="orders-summary-grid d8-summary-grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
        <div className="card orders-summary-card">
          <div className="card-title">Total Orders</div>
          <div className="card-value">{totalOrders}</div>
        </div>
        <div className="card orders-summary-card">
          <div className="card-title">Pending</div>
          <div className="card-value" style={{ color: 'var(--warning, #f59e0b)' }}>{pendingCount}</div>
        </div>
        <div className="card orders-summary-card">
          <div className="card-title">Triggered</div>
          <div className="card-value" style={{ color: 'var(--primary, #3b82f6)' }}>{triggeredCount}</div>
        </div>
        <div className="card orders-summary-card">
          <div className="card-title">Executed</div>
          <div className="card-value text-success">{executedCount}</div>
        </div>
        <div className="card orders-summary-card">
          <div className="card-title">Cancelled</div>
          <div className="card-value text-muted">{cancelledCount}</div>
        </div>
        <div className="card orders-summary-card">
          <div className="card-title">Rejected</div>
          <div className="card-value text-danger">{rejectedCount}</div>
        </div>
        <div className="card orders-summary-card">
          <div className="card-title">Realized P&L</div>
          <div className={`card-value ${totalRealizedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatCurrency(totalRealizedPnL)}
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="d8-tab-bar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`d8-tab-btn ${activeTab === tab.id ? 'd8-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
            <span className="d8-tab-count">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* ═══ ORDER BOOK TAB ═══ */}
      {activeTab === 'orders' && (
        <>
          {/* Analytics — uses real existing data from context */}
          <OrderAnalytics orders={orders} executions={executions} />

          {/* Filters */}
          <OrderFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={orderStatusFilter}
            onStatusFilterChange={setOrderStatusFilter}
            sideFilter={sideFilter}
            onSideFilterChange={setSideFilter}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            resultCount={filteredOrders.length}
            totalCount={totalOrders}
            activeFilterCount={activeFilterCount}
            onClearFilters={handleClearFilters}
          />

          {/* Action buttons */}
          <div className="d17-actions-bar">
            {pendingCount > 0 && (
              <button className="btn d8-process-btn" onClick={handleProcessPending} title="Check if any pending limit orders can be filled at current prices">
                <Zap size={14} />
                Process Pending
              </button>
            )}

            <button
              className="btn d8-process-btn"
              onClick={simulateTick}
              title="Update market prices deterministically (tick {tick})"
            >
              <Zap size={14} />
              Simulate Update
            </button>

            {/* Market Simulation Status */}
            <div className="d17-sim-status">
              {autoSimActive ? <Play size={14} /> : <Pause size={14} />}
              <span>
                {autoSimActive
                  ? `Simulation running — tick every ${settings.autoSimIntervalSec}s`
                  : 'Simulation paused'}
              </span>
              <span className="d17-sim-tick">Tick #{tick}</span>
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <FileText size={48} />
                <h3>No orders yet</h3>
                <p>Place your first order from a stock detail page to see your order book here.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="table-container orders-table-container d17-desktop-table">
                <table className="orders-table d8-orders-table">
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Date</th>
                      <th>Side</th>
                      <th>Type</th>
                      <th>Symbol</th>
                      <th>Company</th>
                      <th style={{ textAlign: 'right' }}>Qty</th>
                      <th style={{ textAlign: 'right' }}>Req. Price</th>
                      <th style={{ textAlign: 'right' }}>Exec. Price</th>
                      <th>Status</th>
                      <th>Reason</th>
                      <th style={{ textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map(order => {
                      const isExpanded = expandedOrderId === order.id;
                      return (
                        <React.Fragment key={order.id}>
                          <tr
                            className={`orders-trade-row ${isExpanded ? 'd17-row-expanded' : ''}`}
                            onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td>
                              <span className="d8-order-id">{order.id}</span>
                            </td>
                            <td>
                              <div className="orders-datetime">
                                <span className="orders-date">{formatDate(order.createdAt)}</span>
                                <span className="orders-time">{formatTime(order.createdAt)}</span>
                              </div>
                            </td>
                            <td>
                              <span className={`orders-side-badge ${order.side === 'BUY' ? 'orders-side-buy' : 'orders-side-sell'}`}>
                                {order.side === 'BUY' ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                                {order.side}
                              </span>
                            </td>
                            <td>
                              <span className={`d8-type-badge d8-type-${order.type.toLowerCase().replace('_', '-')}`}>
                                {order.type.replace('_', ' ')}
                              </span>
                            </td>
                            <td>
                              <span className="orders-symbol">{order.symbol}</span>
                            </td>
                            <td>
                              <span className="orders-company">{order.companyName}</span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{order.quantity}</td>
                            <td style={{ textAlign: 'right' }}>
                              {order.type === 'MARKET' ? (
                                <span className="text-muted">Market</span>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
                                  {['LIMIT', 'STOP_LIMIT'].includes(order.type) && (
                                    <span title="Limit Price" style={{ fontSize: '0.85rem' }}>
                                      L: {formatCurrency(order.requestedPrice)}
                                    </span>
                                  )}
                                  {order.triggerPrice && (
                                    <span title="Trigger Price" style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>
                                      T: {formatCurrency(order.triggerPrice)}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {order.executionPrice !== null ? formatCurrency(order.executionPrice) : <span className="text-muted">—</span>}
                            </td>
                            <td>
                              <span className={`d8-status-badge ${getStatusClass(order.status)}`}>
                                {getStatusIcon(order.status)}
                                {order.status}
                              </span>
                            </td>
                            <td>
                              {order.status === 'REJECTED' && order.rejectionReason && (
                                <span className="d8-rejection-cell" title={order.rejectionReason}>
                                  {order.rejectionReason}
                                </span>
                              )}
                              {order.status !== 'REJECTED' && <span className="text-muted">—</span>}
                            </td>
                            <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                              {order.status === 'PENDING' ? (
                                <button
                                  className="d8-cancel-btn"
                                  onClick={() => handleCancel(order.id)}
                                  aria-label={'Cancel order ' + order.id}
                                >
                                  Cancel
                                </button>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="d17-expand-row">
                              <td colSpan={12}>
                                <OrderDetails
                                  order={order}
                                  currentPrice={getCurrentPrice(order.symbol)}
                                  onCancel={handleCancel}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="d17-mobile-cards">
                {filteredOrders.map(order => {
                  const isExpanded = expandedOrderId === order.id;
                  const currentPrice = getCurrentPrice(order.symbol);
                  return (
                    <div
                      key={order.id}
                      className={`d17-order-card ${isExpanded ? 'd17-card-expanded' : ''}`}
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="d17-card-header">
                        <div className="d17-card-id">
                          <span className="d8-order-id">{order.id}</span>
                          <span className={`orders-side-badge ${order.side === 'BUY' ? 'orders-side-buy' : 'orders-side-sell'}`}>
                            {order.side}
                          </span>
                        </div>
                        <span className={`d8-status-badge ${getStatusClass(order.status)}`}>
                          {getStatusIcon(order.status)}
                          {order.status}
                        </span>
                      </div>
                      <div className="d17-card-body">
                        <div className="d17-card-meta">
                          <span className="orders-symbol">{order.symbol}</span>
                          <span className="orders-company">{order.companyName}</span>
                          <span className={`d8-type-badge d8-type-${order.type.toLowerCase().replace('_', '-')}`}>
                            {order.type.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="d17-card-details">
                          <div>Qty: <strong>{order.quantity}</strong></div>
                          <div>Req: <strong>{order.type === 'MARKET' ? 'Market' : formatCurrency(order.requestedPrice)}</strong></div>
                          {order.triggerPrice && <div>Trigger: <strong>{formatCurrency(order.triggerPrice)}</strong></div>}
                          <div>Exec: <strong>{order.executionPrice !== null ? formatCurrency(order.executionPrice) : '—'}</strong></div>
                        </div>
                      </div>
                      <div className="d17-card-footer">
                        <span className="orders-date">{formatDate(order.createdAt)}</span>
                        <span className="d17-expand-icon">
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="d17-card-expand" onClick={(e) => e.stopPropagation()}>
                          <OrderDetails
                            order={order}
                            currentPrice={currentPrice}
                            onCancel={handleCancel}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="orders-table-footer">
                <Clock size={14} />
                <span>Showing {filteredOrders.length} of {totalOrders} order{totalOrders !== 1 ? 's' : ''}</span>
              </div>
            </>
          )}

          {/* Pending orders detail — if any have rejection reasons, show them */}
          {filteredOrders.some(o => o.rejectionReason) && orderStatusFilter === 'REJECTED' && (
            <div className="card" style={{ marginTop: '16px' }}>
              <h3 style={{ marginBottom: '12px', fontSize: '0.95rem' }}>Rejection Details</h3>
              {filteredOrders.filter(o => o.rejectionReason).map(o => (
                <div key={o.id} className="d8-rejection-detail">
                  <span className="d8-order-id">{o.id}</span>
                  <span className="text-danger" style={{ fontSize: '0.85rem' }}>{o.rejectionReason}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ TRADE HISTORY TAB ═══ */}
      {activeTab === 'trades' && (
        <>
          <div className="orders-filter-bar">
            <div className="orders-filter-group">
              {(['ALL', 'BUY', 'SELL'] as SideFilter[]).map(f => (
                <button
                  key={f}
                  className={`orders-filter-btn ${tradeFilter === f ? 'orders-filter-active' : ''}`}
                  onClick={() => setTradeFilter(f)}
                >
                  {f === 'ALL' ? 'All Trades' : f === 'BUY' ? 'Buys' : 'Sells'}
                  <span className="orders-filter-count">
                    {f === 'ALL' ? totalTrades : trades.filter(t => t.side === f).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {filteredTrades.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <FileText size={48} />
                <h3>No trades yet</h3>
                <p>
                  {tradeFilter === 'ALL'
                    ? 'Execute your first trade from a stock detail page to see your trade history here.'
                    : `No ${tradeFilter} trades found. Try changing the filter.`
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
                    <th>Order Type</th>
                    <th>Symbol</th>
                    <th>Company</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th style={{ textAlign: 'right' }}>Total Value</th>
                    <th style={{ textAlign: 'right' }}>Realized P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.map(trade => (
                    <tr key={trade.id} className="orders-trade-row">
                      <td>
                        <div className="orders-datetime">
                          <span className="orders-date">{formatDate(trade.timestamp)}</span>
                          <span className="orders-time">{formatTime(trade.timestamp)}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`orders-side-badge ${trade.side === 'BUY' ? 'orders-side-buy' : 'orders-side-sell'}`}>
                          {trade.side === 'BUY' ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                          {trade.side}
                        </span>
                      </td>
                      <td>
                        <span className={`d8-type-badge ${(trade.orderType ?? 'MARKET') === 'LIMIT' ? 'd8-type-limit' : 'd8-type-market'}`}>
                          {trade.orderType ?? 'Market'}
                        </span>
                      </td>
                      <td>
                        <span className="orders-symbol">{trade.symbol}</span>
                      </td>
                      <td>
                        <span className="orders-company">{trade.companyName}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{trade.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(trade.executionPrice)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(trade.totalValue)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {trade.realizedPnL !== null && trade.realizedPnL !== undefined ? (
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
                <span>Showing {filteredTrades.length} of {totalTrades} trade{totalTrades !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ EXECUTIONS TAB ═══ */}
      {activeTab === 'executions' && (
        <>
          {sortedExecutions.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <Zap size={48} />
                <h3>No executions yet</h3>
                <p>When your orders are filled, execution records will appear here showing the actual fill details.</p>
              </div>
            </div>
          ) : (
            <div className="table-container orders-table-container">
              <table className="orders-table d8-exec-table">
                <thead>
                  <tr>
                    <th>Execution ID</th>
                    <th>Order ID</th>
                    <th>Date</th>
                    <th>Side</th>
                    <th>Symbol</th>
                    <th>Company</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Exec. Price</th>
                    <th style={{ textAlign: 'right' }}>Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedExecutions.map(exec => (
                    <tr key={exec.id} className="orders-trade-row">
                      <td>
                        <span className="d8-order-id">{exec.id}</span>
                      </td>
                      <td>
                        <span className="d8-order-id">{exec.orderId}</span>
                      </td>
                      <td>
                        <div className="orders-datetime">
                          <span className="orders-date">{formatDate(exec.executedAt)}</span>
                          <span className="orders-time">{formatTime(exec.executedAt)}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`orders-side-badge ${exec.side === 'BUY' ? 'orders-side-buy' : 'orders-side-sell'}`}>
                          {exec.side === 'BUY' ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                          {exec.side}
                        </span>
                      </td>
                      <td>
                        <span className="orders-symbol">{exec.symbol}</span>
                      </td>
                      <td>
                        <span className="orders-company">{exec.companyName}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{exec.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(exec.executionPrice)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(exec.totalValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="orders-table-footer">
                <Clock size={14} />
                <span>Showing {sortedExecutions.length} execution{sortedExecutions.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Orders;
