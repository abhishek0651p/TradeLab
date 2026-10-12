import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrading } from '../context/TradingContext';
import { generateChartData } from '../data/mockData';
import { OrderEntry } from './StockDetail';
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
  CartesianGrid, XAxis, YAxis, Tooltip, Area, AreaChart
} from 'recharts';
import {
  Search, Star, Trash2, TrendingUp, TrendingDown, ArrowUpDown,
  ChevronUp, ChevronDown, Filter, SearchX, Clock, Grid as GridIcon,
  List as ListIcon
} from 'lucide-react';
import { StockData, OrderSide, OrderType } from '../types';

type FilterMode = 'ALL' | 'GAINERS' | 'LOSERS' | 'SECTOR';
type SortField = 'companyName' | 'symbol' | 'price' | 'change' | 'changePercent';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'table' | 'grid';

const SECTOR_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
  '#84cc16', '#e11d48'
];

const Watchlist: React.FC = () => {
  const { stocks, watchlist, removeFromWatchlist, placeOrder, account, holdings } = useTrading();
  const navigate = useNavigate();

  // View mode persistence
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const stored = localStorage.getItem('tradelab_wl_view');
      return stored === 'table' ? 'table' : 'grid';
    } catch {
      return 'grid';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('tradelab_wl_view', viewMode);
    } catch {
      // localStorage may not be available
    }
  }, [viewMode]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('ALL');
  const [selectedSector, setSelectedSector] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('companyName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const watchlistStocks = useMemo(
    () => stocks.filter(stock => watchlist.includes(stock.symbol)),
    [stocks, watchlist]
  );

  const availableSectors = useMemo(() => {
    const sectors = new Set(watchlistStocks.map(s => s.sector).filter(Boolean));
    return Array.from(sectors).sort();
  }, [watchlistStocks]);

  // Summary stats
  const gainersCount = useMemo(
    () => watchlistStocks.filter(s => s.change > 0).length,
    [watchlistStocks]
  );
  const losersCount = useMemo(
    () => watchlistStocks.filter(s => s.change < 0).length,
    [watchlistStocks]
  );
  const totalStocks = watchlistStocks.length;

  const bestPerformer = useMemo(() => {
    if (watchlistStocks.length === 0) return null;
    return watchlistStocks.reduce((prev, current) =>
      current.changePercent > prev.changePercent ? current : prev
    );
  }, [watchlistStocks]);

  const worstPerformer = useMemo(() => {
    if (watchlistStocks.length === 0) return null;
    return watchlistStocks.reduce((prev, current) =>
      current.changePercent < prev.changePercent ? current : prev
    );
  }, [watchlistStocks]);

  const averageChangePercent = useMemo(() => {
    if (watchlistStocks.length === 0) return 0;
    const avg = watchlistStocks.reduce((sum, s) => sum + s.changePercent, 0) / watchlistStocks.length;
    return Number(avg.toFixed(2));
  }, [watchlistStocks]);

  // Sector distribution
  const sectorData = useMemo(() => {
    const counts: Record<string, number> = {};
    watchlistStocks.forEach(s => {
      const sector = s.sector || 'Unknown';
      counts[sector] = (counts[sector] || 0) + 1;
    });
    const entries = Object.entries(counts).map(([name, value]) => ({ name, value }));
    return entries.sort((a, b) => b.value - a.value);
  }, [watchlistStocks]);

  // Filtered and sorted stocks
  const processedStocks = useMemo(() => {
    let result = watchlistStocks;

    // Search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        stock =>
          stock.symbol.toLowerCase().includes(term) ||
          stock.companyName.toLowerCase().includes(term)
      );
    }

    // Filter
    switch (filterMode) {
      case 'GAINERS':
        result = result.filter(s => s.change > 0);
        break;
      case 'LOSERS':
        result = result.filter(s => s.change < 0);
        break;
      case 'SECTOR':
        if (selectedSector) {
          result = result.filter(s => s.sector === selectedSector);
        }
        break;
      default:
        break;
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'companyName':
          cmp = a.companyName.localeCompare(b.companyName);
          break;
        case 'symbol':
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case 'price':
          cmp = a.price - b.price;
          break;
        case 'change':
          cmp = a.change - b.change;
          break;
        case 'changePercent':
          cmp = a.changePercent - b.changePercent;
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [watchlistStocks, searchTerm, filterMode, selectedSector, sortField, sortDirection]);

  // Order modal and toast state
  const [orderModal, setOrderModal] = useState<{
    symbol: string;
    side: OrderSide;
    price: number;
    companyName: string;
    quantityOnHand: number;
  } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return value >= 0 ? `+${value.toFixed(2)}%` : `${value.toFixed(2)}%`;
  };

  // Sort handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="d18-wl-sort-icon-idle" />;
    }
    return sortDirection === 'asc'
      ? <ChevronUp size={14} className="d18-wl-sort-icon-active" />
      : <ChevronDown size={14} className="d18-wl-sort-icon-active" />;
  };

  const handleFilterChange = (mode: FilterMode) => {
    setFilterMode(mode);
    if (mode !== 'SECTOR') {
      setSelectedSector('');
    } else if (availableSectors.length > 0 && !selectedSector) {
      setSelectedSector(availableSectors[0]);
    }
  };

  // Open order modal for BUY/SELL action
  const openOrderModal = (stock: StockData, side: OrderSide) => {
    const holding = holdings.find(h => h.symbol === stock.symbol);
    setOrderModal({
      symbol: stock.symbol,
      side: side,
      price: stock.price,
      companyName: stock.companyName,
      quantityOnHand: holding?.quantity ?? 0
    });
  };

  const closeOrderModal = () => {
    setOrderModal(null);
  };

  // Handle order submission from OrderEntry modal
  const handleOrderPlace = (orderType: OrderType, quantity: number, limitPrice?: number, triggerPrice?: number) => {
    if (!orderModal) return;

    const result = placeOrder({
      symbol: orderModal.symbol,
      companyName: orderModal.companyName,
      side: orderModal.side,
      orderType,
      quantity,
      limitPrice,
      triggerPrice,
      currentPrice: orderModal.price
    });

    if (result.success) {
      setToast({
        type: 'success',
        message: `Order executed: ${orderModal.side} ${quantity} ${orderModal.symbol} at ${formatCurrency(result.execution?.executionPrice ?? orderModal.price)}`
      });
    } else {
      setToast({ type: 'error', message: result.error ?? 'Order failed.' });
    }
    setOrderModal(null);
  };

  // Format volume helper
  const formatVolume = (value: number) => {
    if (value >= 10000000) return (value / 10000000).toFixed(2) + ' Cr';
    if (value >= 100000) return (value / 100000).toFixed(2) + ' L';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
    return value.toString();
  };

  // Sparkline component
  const Sparkline: React.FC<{ symbol: string }> = ({ symbol }) => {
    const chartData = useMemo(() => generateChartData(symbol, '1D'), [symbol]);

    const isPositive = chartData.length > 0 && chartData[chartData.length - 1].price >= chartData[0].price;
    const color = isPositive ? '#10b981' : '#ef4444';

    return (
      <ResponsiveContainer width="100%" height={36}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id={`wl-gradient-${symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#wl-gradient-${symbol})`}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  };

  // Empty state when no results
  const noResults = processedStocks.length === 0 && (searchTerm || filterMode !== 'ALL' || selectedSector);

  // No-results message component
  const NoResultsMessage = () => (
    <div className="d18-wl-no-results">
      <SearchX size={36} />
      <h3>No matching stocks</h3>
      <p>
        {searchTerm
          ? `No stocks found matching "${searchTerm}"`
          : filterMode === 'GAINERS'
            ? 'None of your watchlist stocks are gaining today.'
            : filterMode === 'LOSERS'
              ? 'None of your watchlist stocks are losing today.'
              : filterMode === 'SECTOR' && selectedSector
                ? `No watchlist stocks in the "${selectedSector}" sector.`
                : 'No stocks match the current filters.'
        }
      </p>
      <button
        className="btn btn-outline"
        onClick={() => { setSearchTerm(''); setFilterMode('ALL'); setSelectedSector(''); }}
        style={{ marginTop: '12px' }}
      >
        Clear Filters
      </button>
    </div>
  );

  // Table view renderer
  const renderTableView = () => {
    return (
      <>
        {noResults && <NoResultsMessage />}

        {processedStocks.length > 0 && (
          <div className="table-container d18-wl-table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="d18-wl-sortable-th"
                    onClick={() => handleSort('companyName')}
                  >
                    Company {renderSortIcon('companyName')}
                  </th>
                  <th className="d18-wl-sortable-th"
                    onClick={() => handleSort('symbol')}
                  >
                    Symbol {renderSortIcon('symbol')}
                  </th>
                  <th className="d18-wl-sortable-th"
                    onClick={() => handleSort('price')}
                  >
                    Price {renderSortIcon('price')}
                  </th>
                  <th className="d18-wl-sortable-th"
                    onClick={() => handleSort('change')}
                  >
                    Change {renderSortIcon('change')}
                  </th>
                  <th className="d18-wl-sortable-th"
                    onClick={() => handleSort('changePercent')}
                  >
                    Change % {renderSortIcon('changePercent')}
                  </th>
                  <th className="d18-wl-table-sector-header">
                    Sector
                  </th>
                  <th className="d18-wl-table-sparkline-header">
                    Chart
                  </th>
                  <th className="d18-wl-table-actions-header">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {processedStocks.map((stock) => (
                  <tr
                    key={stock.symbol}
                    onClick={() => navigate(`/stock/${stock.symbol}`)}
                    className="stock-row-clickable"
                  >
                    <td>{stock.companyName}</td>
                    <td style={{ fontWeight: 600 }}>{stock.symbol}</td>
                    <td>{formatCurrency(stock.price)}</td>
                    <td className={stock.change >= 0 ? 'text-success' : 'text-danger'}>
                      {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}
                    </td>
                    <td className={stock.changePercent >= 0 ? 'text-success' : 'text-danger'}>
                      {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                    </td>
                    <td className="d18-wl-table-sector">
                      {stock.sector || <span style={{ color: 'var(--text-muted)' }}>&mdash;</span>}
                    </td>
                    <td className="d18-wl-table-sparkline">
                      <Sparkline symbol={stock.symbol} />
                    </td>
                    <td className="d18-wl-table-actions">
                      <div className="d18-wl-table-actions-row">
                        <button
                          className="btn btn-outline d18-wl-action-btn d18-wl-action-buy"
                          onClick={(e) => {
                            e.stopPropagation();
                            openOrderModal(stock, 'BUY');
                          }}
                        >
                          BUY
                        </button>
                        <button
                          className="btn btn-outline d18-wl-action-btn d18-wl-action-sell"
                          onClick={(e) => {
                            e.stopPropagation();
                            openOrderModal(stock, 'SELL');
                          }}
                        >
                          SELL
                        </button>
                        <button
                          className="btn btn-outline d18-wl-action-btn d18-wl-action-remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromWatchlist(stock.symbol);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  };

  // Grid view renderer
  const renderGridView = () => {
    return (
      <>
        {noResults && <NoResultsMessage />}

        {processedStocks.length > 0 && (
          <div className="d18-wl-grid-container">
            <div className="d18-wl-grid-row">
              {processedStocks.map((stock) => (
                <div
                  key={stock.symbol}
                  className="d18-wl-grid-card"
                  onClick={() => navigate(`/stock/${stock.symbol}`)}
                >
                  <div className="d18-wl-grid-header">
                    <div className="d18-wl-grid-company">{stock.companyName}</div>
                    <div className="d18-wl-grid-symbol">{stock.symbol}</div>
                  </div>

                  <div className="d18-wl-grid-price-section">
                    <div className="d18-wl-grid-price">{formatCurrency(stock.price)}</div>
                    <div className={`d18-wl-grid-change ${stock.change >= 0 ? 'd18-wl-positive' : 'd18-wl-negative'}`}>
                      {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)} ({stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%)
                    </div>
                  </div>

                  <div className="d18-wl-grid-sparkline">
                    <Sparkline symbol={stock.symbol} />
                  </div>

                  <div className="d18-wl-grid-sector">
                    <small style={{ color: 'var(--text-muted)' }}>{stock.sector || '\u2014'}</small>
                  </div>

                  <div className="d18-wl-grid-actions">
                    <div className="d18-wl-grid-actions-row">
                      <button
                        className="btn btn-outline d18-wl-action-btn d18-wl-action-buy"
                        onClick={(e) => {
                          e.stopPropagation();
                          openOrderModal(stock, 'BUY');
                        }}
                      >
                        BUY
                      </button>
                      <button
                        className="btn btn-outline d18-wl-action-btn d18-wl-action-sell"
                        onClick={(e) => {
                          e.stopPropagation();
                          openOrderModal(stock, 'SELL');
                        }}
                      >
                        SELL
                      </button>
                      <button
                        className="btn btn-outline d18-wl-action-btn d18-wl-action-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromWatchlist(stock.symbol);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={'toast ' + toast.type}>
          {toast.type === 'success' ? '✓ ' : '✗ '}{toast.message}
        </div>
      )}

      <h1 className="page-title">Watchlist Intelligence Center</h1>

      {watchlist.length > 0 ? (
        <>
          {/* Premium Summary Grid */}
          <div className="d18-wl-summary-grid">
            <div className="card d18-wl-summary-card">
              <div className="d18-wl-summary-icon d18-wl-summary-icon-blue">
                <Star size={18} />
              </div>
              <div className="d18-wl-summary-label">Total Stocks</div>
              <div className="d18-wl-summary-value">{totalStocks}</div>
            </div>

            {bestPerformer && bestPerformer.changePercent > 0 && (
              <div className="card d18-wl-summary-card">
                <div className="d18-wl-summary-icon d18-wl-summary-icon-success">
                  <TrendingUp size={18} />
                </div>
                <div className="d18-wl-summary-label">Best Performer</div>
                <div className="d18-wl-summary-value">
                  {bestPerformer.symbol} {formatPercent(bestPerformer.changePercent)}
                </div>
              </div>
            )}

            {worstPerformer && worstPerformer.changePercent < 0 && (
              <div className="card d18-wl-summary-card">
                <div className="d18-wl-summary-icon d18-wl-summary-icon-danger">
                  <TrendingDown size={18} />
                </div>
                <div className="d18-wl-summary-label">Worst Performer</div>
                <div className="d18-wl-summary-value">
                  {worstPerformer.symbol} {formatPercent(worstPerformer.changePercent)}
                </div>
              </div>
            )}

            <div className="card d18-wl-summary-card">
              <div className="d18-wl-summary-icon d18-wl-summary-icon-info">
                <Clock size={18} />
              </div>
              <div className="d18-wl-summary-label">Avg Change</div>
              <div className="d18-wl-summary-value">{formatPercent(averageChangePercent)}</div>
            </div>

            <div className="card d18-wl-summary-card">
              <div className="d18-wl-summary-icon d18-wl-summary-icon-success">
                <TrendingUp size={18} />
              </div>
              <div className="d18-wl-summary-label">Gainers</div>
              <div className="d18-wl-summary-value text-success">{gainersCount}</div>
            </div>

            <div className="card d18-wl-summary-card">
              <div className="d18-wl-summary-icon d18-wl-summary-icon-danger">
                <TrendingDown size={18} />
              </div>
              <div className="d18-wl-summary-label">Losers</div>
              <div className="d18-wl-summary-value text-danger">{losersCount}</div>
            </div>
          </div>

          {/* Controls Bar: search, filters, view toggle, sector chart */}
          <div className="d18-wl-controls">
            {/* Search */}
            <div className="d18-wl-controls-bar">
              <Search className="search-icon" size={20} />
              <input
                type="text"
                className="search-input"
                placeholder="Search watchlist..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Filter Bar */}
            <div className="d18-wl-controls-bar">
              <div className="d18-wl-filter-row">
                <div className="d18-wl-filter-label">
                  <Filter size={14} />
                  Filter
                </div>
                <div className="orders-filter-group">
                  <button
                    className={`orders-filter-btn ${filterMode === 'ALL' ? 'orders-filter-active' : ''}`}
                    onClick={() => handleFilterChange('ALL')}
                  >
                    All
                    <span className="orders-filter-count">{totalStocks}</span>
                  </button>
                  <button
                    className={`orders-filter-btn ${filterMode === 'GAINERS' ? 'orders-filter-active' : ''}`}
                    onClick={() => handleFilterChange('GAINERS')}
                  >
                    Gainers
                    <span className="orders-filter-count">{gainersCount}</span>
                  </button>
                  <button
                    className={`orders-filter-btn ${filterMode === 'LOSERS' ? 'orders-filter-active' : ''}`}
                    onClick={() => handleFilterChange('LOSERS')}
                  >
                    Losers
                    <span className="orders-filter-count">{losersCount}</span>
                  </button>
                  <button
                    className={`orders-filter-btn ${filterMode === 'SECTOR' ? 'orders-filter-active' : ''}`}
                    onClick={() => handleFilterChange('SECTOR')}
                  >
                    Sector
                  </button>
                </div>

                {filterMode === 'SECTOR' && availableSectors.length > 0 && (
                  <select
                    className="d18-wl-sector-select"
                    value={selectedSector}
                    onChange={(e) => setSelectedSector(e.target.value)}
                  >
                    {availableSectors.map(sector => (
                      <option key={sector} value={sector}>{sector}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* View Toggle + Sector Distribution */}
            <div className="d18-wl-controls-end">
              {/* View Mode Toggle */}
              <button
                className="d18-wl-view-toggle-btn"
                onClick={() => setViewMode(prev => (prev === 'table' ? 'grid' : 'table'))}
                title={viewMode === 'table' ? 'Switch to grid view' : 'Switch to table view'}
              >
                {viewMode === 'table' ? (
                  <>
                    <ListIcon size={16} />
                    Table
                  </>
                ) : (
                  <>
                    <GridIcon size={16} />
                    Grid
                  </>
                )}
              </button>

              {/* Sector Distribution Donut Chart */}
              {sectorData.length > 0 && (
                <div className="d18-wl-sector-donut">
                  <ResponsiveContainer width="100%" height={100}>
                    <PieChart>
                      <Pie
                        data={sectorData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={22}
                        outerRadius={42}
                        stroke="rgba(0,0,0,0.2)"
                        strokeWidth={1}
                        paddingAngle={2}
                      >
                        {sectorData.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={SECTOR_COLORS[index % SECTOR_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: 'var(--panel-bg)',
                          borderColor: 'var(--border)',
                          borderRadius: '8px',
                          color: 'var(--text-main)',
                          padding: '8px 12px',
                          fontSize: '0.8rem'
                        }}
                        formatter={(value: any, name: any) => [`${Number(value)} stock${Number(value) !== 1 ? 's' : ''}`, String(name)]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="d18-wl-sector-label">
                    {sectorData[0].name} leading
                  </div>
                </div>
              )}

              {sectorData.length === 0 && (
                <div className="d18-wl-sector-donut-empty">
                  No sector data
                </div>
              )}
            </div>
          </div>

          {/* Render Table or Grid */}
          {viewMode === 'table' ? renderTableView() : renderGridView()}
        </>
      ) : (
        <div className="empty-state card">
          <Star size={48} />
          <h3>Your watchlist is empty</h3>
          <p>Go to the Markets page to add stocks to your watchlist.</p>
        </div>
      )}

      {/* OrderEntry Modal (reuses StockDetail's OrderEntry component) */}
      {orderModal && (
        <OrderEntry
          symbol={orderModal.symbol}
          companyName={orderModal.companyName}
          price={orderModal.price}
          side={orderModal.side}
          cashBalance={account.cashBalance}
          quantityOnHand={orderModal.quantityOnHand}
          holdings={holdings}
          stocks={stocks}
          onClose={closeOrderModal}
          onPlaceOrder={handleOrderPlace}
        />
      )}
    </div>
  );
};

export default Watchlist;