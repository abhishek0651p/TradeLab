import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrading } from '../context/TradingContext';
import { Search, Star, Trash2, TrendingUp, TrendingDown, ArrowUpDown, ChevronUp, ChevronDown, Filter, SearchX } from 'lucide-react';

type FilterMode = 'ALL' | 'GAINERS' | 'LOSERS' | 'SECTOR';
type SortField = 'companyName' | 'symbol' | 'price' | 'change' | 'changePercent';
type SortDirection = 'asc' | 'desc';

const Watchlist = () => {
  const { stocks, watchlist, removeFromWatchlist } = useTrading();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('ALL');
  const [selectedSector, setSelectedSector] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('companyName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const navigate = useNavigate();

  const watchlistStocks = useMemo(
    () => stocks.filter(stock => watchlist.includes(stock.symbol)),
    [stocks, watchlist]
  );

  // Summary stats
  const gainersCount = useMemo(
    () => watchlistStocks.filter(s => s.change > 0).length,
    [watchlistStocks]
  );
  const losersCount = useMemo(
    () => watchlistStocks.filter(s => s.change < 0).length,
    [watchlistStocks]
  );

  // Available sectors from watchlist stocks only
  const availableSectors = useMemo(() => {
    const sectors = new Set(watchlistStocks.map(s => s.sector));
    return Array.from(sectors).sort();
  }, [watchlistStocks]);

  // Pipeline: search → filter → sort
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleFilterChange = (mode: FilterMode) => {
    setFilterMode(mode);
    if (mode !== 'SECTOR') {
      setSelectedSector('');
    } else if (availableSectors.length > 0 && !selectedSector) {
      setSelectedSector(availableSectors[0]);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(value);
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="wl-sort-icon-idle" />;
    }
    return sortDirection === 'asc'
      ? <ChevronUp size={14} className="wl-sort-icon-active" />
      : <ChevronDown size={14} className="wl-sort-icon-active" />;
  };

  return (
    <div>
      <h1 className="page-title">Watchlist</h1>

      {watchlist.length > 0 ? (
        <>
          {/* Summary */}
          <div className="wl-summary-grid">
            <div className="card wl-summary-card">
              <div className="wl-summary-icon wl-summary-icon-blue">
                <Star size={18} />
              </div>
              <div className="wl-summary-label">Total Stocks</div>
              <div className="wl-summary-value">{watchlistStocks.length}</div>
            </div>
            <div className="card wl-summary-card">
              <div className="wl-summary-icon wl-summary-icon-success">
                <TrendingUp size={18} />
              </div>
              <div className="wl-summary-label">Gainers</div>
              <div className="wl-summary-value text-success">{gainersCount}</div>
            </div>
            <div className="card wl-summary-card">
              <div className="wl-summary-icon wl-summary-icon-danger">
                <TrendingDown size={18} />
              </div>
              <div className="wl-summary-label">Losers</div>
              <div className="wl-summary-value text-danger">{losersCount}</div>
            </div>
          </div>

          {/* Search */}
          <div className="search-container">
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
          <div className="wl-controls-bar">
            <div className="wl-filter-row">
              <div className="wl-filter-label">
                <Filter size={14} />
                Filter
              </div>
              <div className="orders-filter-group">
                <button
                  className={`orders-filter-btn ${filterMode === 'ALL' ? 'orders-filter-active' : ''}`}
                  onClick={() => handleFilterChange('ALL')}
                >
                  All
                  <span className="orders-filter-count">{watchlistStocks.length}</span>
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
                  className="wl-sector-select"
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

          {/* Table */}
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th
                    className="wl-sortable-th"
                    onClick={() => handleSort('companyName')}
                  >
                    Company {renderSortIcon('companyName')}
                  </th>
                  <th
                    className="wl-sortable-th"
                    onClick={() => handleSort('symbol')}
                  >
                    Symbol {renderSortIcon('symbol')}
                  </th>
                  <th
                    className="wl-sortable-th"
                    onClick={() => handleSort('price')}
                  >
                    Price {renderSortIcon('price')}
                  </th>
                  <th
                    className="wl-sortable-th"
                    onClick={() => handleSort('change')}
                  >
                    Change {renderSortIcon('change')}
                  </th>
                  <th
                    className="wl-sortable-th"
                    onClick={() => handleSort('changePercent')}
                  >
                    Change % {renderSortIcon('changePercent')}
                  </th>
                  <th>Actions</th>
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
                    <td>
                      <button
                        className="btn btn-outline"
                        onClick={(e) => { e.stopPropagation(); removeFromWatchlist(stock.symbol); }}
                        style={{ padding: '6px 12px', fontSize: '0.85rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      >
                        <Trash2 size={16} /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {processedStocks.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="wl-no-results">
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
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="empty-state card">
          <Star size={48} />
          <h3>Your watchlist is empty</h3>
          <p>Go to the Markets page to add stocks to your watchlist.</p>
        </div>
      )}
    </div>
  );
};

export default Watchlist;
