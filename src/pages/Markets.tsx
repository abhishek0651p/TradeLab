import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrading } from '../context/TradingContext';
import {
  Search,
  Star,
  Plus,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  TrendingDown,
  Activity,
  Briefcase,
  MinusCircle,
  Zap
} from 'lucide-react';

type SortField = 'companyName' | 'symbol' | 'price' | 'change' | 'changePercent';
type SortDirection = 'asc' | 'desc';

const Markets = () => {
  const { stocks, watchlist, addToWatchlist, removeFromWatchlist } = useTrading();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('companyName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const navigate = useNavigate();

  // ---- Market overview stats (derived from stocks) ----
  const totalStocks = stocks.length;
  const gainers = useMemo(
    () => stocks.filter(stock => stock.changePercent > 0),
    [stocks]
  );
  const losers = useMemo(
    () => stocks.filter(stock => stock.changePercent < 0),
    [stocks]
  );
  const unchanged = useMemo(
    () => stocks.filter(stock => stock.changePercent === 0),
    [stocks]
  );
  const gainersPct = totalStocks > 0 ? (gainers.length / totalStocks) * 100 : 0;
  const losersPct = totalStocks > 0 ? (losers.length / totalStocks) * 100 : 0;
  const unchangedPct = totalStocks > 0 ? (unchanged.length / totalStocks) * 100 : 0;

  // ---- Top movers ----
  const topGainers = useMemo(
    () => [...stocks].sort((a, b) => b.changePercent - a.changePercent).slice(0, 5),
    [stocks]
  );
  const topLosers = useMemo(
    () => [...stocks].sort((a, b) => a.changePercent - b.changePercent).slice(0, 5),
    [stocks]
  );

  // ---- Sector performance ----
  interface SectorStats {
    name: string;
    count: number;
    avgChange: number;
  }
  const sectorStats = useMemo<SectorStats[]>(() => {
    const map = new Map<string, { count: number; sum: number }>();
    stocks.forEach(stock => {
      const current = map.get(stock.sector);
      if (current) {
        map.set(stock.sector, { count: current.count + 1, sum: current.sum + stock.changePercent });
      } else {
        map.set(stock.sector, { count: 1, sum: stock.changePercent });
      }
    });
    return Array.from(map.entries())
      .map(([name, { count, sum }]) => ({ name, count, avgChange: sum / count }))
      .sort((a, b) => b.avgChange - a.avgChange);
  }, [stocks]);

  const bestSector = sectorStats.length > 0 ? sectorStats[0] : null;
  const worstSector = sectorStats.length > 0 ? sectorStats[sectorStats.length - 1] : null;

  // ---- Search + sort pipeline: stocks -> filter -> sort ----
  const filteredStocks = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return stocks.filter(stock =>
      stock.symbol.toLowerCase().includes(term) ||
      stock.companyName.toLowerCase().includes(term)
    );
  }, [stocks, searchTerm]);

  const sortedStocks = useMemo(() => {
    return [...filteredStocks].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'companyName') {
        comparison = a.companyName.localeCompare(b.companyName);
      } else if (sortField === 'symbol') {
        comparison = a.symbol.localeCompare(b.symbol);
      } else {
        comparison = (a[sortField] as number) - (b[sortField] as number);
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredStocks, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(value);

  const formatPercent = (value: number) =>
    (value >= 0 ? '+' : '') + value.toFixed(2) + '%';

  const formatVolume = (value: number) =>
    new Intl.NumberFormat('en-IN').format(value);

  const SortIndicator = (props: { field: SortField; active: boolean; direction: SortDirection }) => (
    <span className={props.active ? 'wl-sort-icon-active' : 'wl-sort-icon-idle'}>
      {props.active ? (props.direction === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ArrowDown size={13} />}
    </span>
  );

  return (
    <div className="markets-page">
      <div className="markets-page-header">
        <h1 className="page-title">Markets</h1>
        <div className="simulated-badge">
          <Zap size={13} />
          SIMULATED MARKET DATA
        </div>
      </div>

      {/* ---- Market Overview ---- */}
      <section className="dashboard-grid markets-overview" aria-label="Market overview">
        <div className="card overview-card">
          <div className="overview-icon overview-icon-blue"><Activity size={18} /></div>
          <div className="overview-label">Market Status</div>
          <div className="overview-value">{totalStocks > 0 ? 'Simulated Session' : 'No Data'}</div>
          <div className="overview-subtitle">Live simulated feed</div>
        </div>
        <div className="card overview-card">
          <div className="overview-icon overview-icon-blue"><Briefcase size={18} /></div>
          <div className="overview-label">Total Stocks</div>
          <div className="overview-value">{totalStocks}</div>
          <div className="overview-subtitle">In the mock universe</div>
        </div>
        <div className="card overview-card">
          <div className="overview-icon overview-icon-success"><TrendingUp size={18} /></div>
          <div className="overview-label">Gainers</div>
          <div className="overview-value">{gainers.length}</div>
          <div className="overview-subtitle">{gainersPct.toFixed(1)}% of market</div>
        </div>
        <div className="card overview-card">
          <div className="overview-icon overview-icon-danger"><TrendingDown size={18} /></div>
          <div className="overview-label">Losers</div>
          <div className="overview-value">{losers.length}</div>
          <div className="overview-subtitle">{losersPct.toFixed(1)}% of market</div>
        </div>
        <div className="card overview-card">
          <div className="overview-icon overview-icon-neutral"><MinusCircle size={18} /></div>
          <div className="overview-label">Unchanged</div>
          <div className="overview-value">{unchanged.length}</div>
          <div className="overview-subtitle">{unchangedPct.toFixed(1)}% of market</div>
        </div>
      </section>

      {/* ---- Market Breadth ---- */}
      <section className="card breadth-card">
        <div className="card-title">Market Breadth</div>
        <div className="breadth-bar" role="img" aria-label="Market breadth: gainers, unchanged, losers">
          <div className="breadth-segment breadth-gainers" style={{ width: gainersPct + '%' }} />
          <div className="breadth-segment breadth-unchanged" style={{ width: unchangedPct + '%' }} />
          <div className="breadth-segment breadth-losers" style={{ width: losersPct + '%' }} />
        </div>
        <div className="breadth-legend">
          <div className="breadth-legend-item">
            <span className="breadth-dot breadth-dot-gainers" />
            <span>Gainers</span>
            <strong>{gainers.length} ({gainersPct.toFixed(1)}%)</strong>
          </div>
          <div className="breadth-legend-item">
            <span className="breadth-dot breadth-dot-unchanged" />
            <span>Unchanged</span>
            <strong>{unchanged.length} ({unchangedPct.toFixed(1)}%)</strong>
          </div>
          <div className="breadth-legend-item">
            <span className="breadth-dot breadth-dot-losers" />
            <span>Losers</span>
            <strong>{losers.length} ({losersPct.toFixed(1)}%)</strong>
          </div>
        </div>
      </section>

      {/* ---- Top Movers ---- */}
      <section className="dashboard-grid movers-grid" aria-label="Top movers">
        <div className="card movers-card">
          <div className="movers-card-header movers-card-header-gainers">
            <div className="movers-card-icon"><TrendingUp size={18} /></div>
            <h2 className="card-title" style={{ margin: 0 }}>Top Gainers</h2>
          </div>
          <div className="movers-list">
            {topGainers.map(stock => (
              <button
                key={stock.symbol}
                className="mover-row"
                onClick={() => navigate(`/stock/${stock.symbol}`)}
              >
                <span className="mover-symbol">{stock.symbol}</span>
                <span className="mover-company">{stock.companyName}</span>
                <span className="mover-price">{formatCurrency(stock.price)}</span>
                <span className="mover-change gain">
                  <ArrowUp size={14} />
                  {formatPercent(stock.changePercent)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="card movers-card">
          <div className="movers-card-header movers-card-header-losers">
            <div className="movers-card-icon"><TrendingDown size={18} /></div>
            <h2 className="card-title" style={{ margin: 0 }}>Top Losers</h2>
          </div>
          <div className="movers-list">
            {topLosers.map(stock => (
              <button
                key={stock.symbol}
                className="mover-row"
                onClick={() => navigate(`/stock/${stock.symbol}`)}
              >
                <span className="mover-symbol">{stock.symbol}</span>
                <span className="mover-company">{stock.companyName}</span>
                <span className="mover-price">{formatCurrency(stock.price)}</span>
                <span className="mover-change loss">
                  <ArrowDown size={14} />
                  {formatPercent(stock.changePercent)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Sector Performance ---- */}
      <section className="card sectors-card">
        <div className="card-title">Sector Performance</div>
        <div className="sector-summary">
          <div className="sector-summary-item">
            <span className="sector-summary-label">Best Performer</span>
            {bestSector ? (
              <span className="sector-summary-value gain">{bestSector.name} <span>({formatPercent(bestSector.avgChange)})</span></span>
            ) : (
              <span className="sector-summary-value">—</span>
            )}
          </div>
          <div className="sector-summary-item">
            <span className="sector-summary-label">Worst Performer</span>
            {worstSector ? (
              <span className="sector-summary-value loss">{worstSector.name} <span>({formatPercent(worstSector.avgChange)})</span></span>
            ) : (
              <span className="sector-summary-value">—</span>
            )}
          </div>
        </div>
        <div className="table-container">
          <table className="sector-table">
            <thead>
              <tr>
                <th>Sector</th>
                <th>Stocks</th>
                <th>Average Change</th>
                <th>Performance</th>
              </tr>
            </thead>
            <tbody>
              {sectorStats.map(sector => (
                <tr key={sector.name}>
                  <td>
                    <span className="sector-name">{sector.name}</span>
                    {bestSector && sector.name === bestSector.name && (
                      <span className="sector-badge sector-badge-best">Best</span>
                    )}
                    {worstSector && sector.name === worstSector.name && sectorStats.length > 1 && (
                      <span className="sector-badge sector-badge-worst">Worst</span>
                    )}
                  </td>
                  <td className="text-muted">{sector.count}</td>
                  <td className={sector.avgChange >= 0 ? 'text-success' : 'text-danger'}>
                    {formatPercent(sector.avgChange)}
                  </td>
                  <td>
                    <div className="sector-bar">
                      <div
                        className={sector.avgChange >= 0 ? 'sector-bar-fill gain' : 'sector-bar-fill loss'}
                        style={{ width: `${Math.min(Math.abs(sector.avgChange) * 8, 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- Stock Table ---- */}
      <section className="card markets-table-section">
        <div className="markets-table-header">
          <h2 className="card-title" style={{ margin: 0, color: 'var(--text-main)', fontWeight: 600 }}>
            All Stocks
          </h2>
          <div className="search-container">
            <Search className="search-icon" size={18} />
            <input
              type="text"
              className="search-input"
              placeholder="Search stocks by symbol or company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="table-container">
          <table className="markets-table">
            <thead>
              <tr>
                <th className="sortable-th" onClick={() => handleSort('companyName')}>
                  Company <SortIndicator field="companyName" active={sortField === 'companyName'} direction={sortDirection} />
                </th>
                <th className="sortable-th" onClick={() => handleSort('symbol')}>
                  Symbol <SortIndicator field="symbol" active={sortField === 'symbol'} direction={sortDirection} />
                </th>
                <th className="sortable-th" onClick={() => handleSort('price')}>
                  Price <SortIndicator field="price" active={sortField === 'price'} direction={sortDirection} />
                </th>
                <th className="sortable-th" onClick={() => handleSort('change')}>
                  Change <SortIndicator field="change" active={sortField === 'change'} direction={sortDirection} />
                </th>
                <th className="sortable-th" onClick={() => handleSort('changePercent')}>
                  Change % <SortIndicator field="changePercent" active={sortField === 'changePercent'} direction={sortDirection} />
                </th>
                <th>Volume</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedStocks.map(stock => (
                <tr
                  key={stock.symbol}
                  className="stock-row-clickable"
                  onClick={() => navigate(`/stock/${stock.symbol}`)}
                >
                  <td className="stock-company">{stock.companyName}</td>
                  <td className="stock-symbol">{stock.symbol}</td>
                  <td className="text-right">{formatCurrency(stock.price)}</td>
                  <td className={stock.change >= 0 ? 'text-success text-right' : 'text-danger text-right'}>
                    {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}
                  </td>
                  <td className={stock.changePercent >= 0 ? 'text-success text-right' : 'text-danger text-right'}>
                    {formatPercent(stock.changePercent)}
                  </td>
                  <td className="text-muted text-right">{formatVolume(stock.volume)}</td>
                  <td>
                    {watchlist.includes(stock.symbol) ? (
                      <button
                        className="btn btn-outline watchlist-btn"
                        onClick={(e) => { e.stopPropagation(); removeFromWatchlist(stock.symbol); }}
                      >
                        <Star size={14} fill="currentColor" /> Added
                      </button>
                    ) : (
                      <button
                        className="btn watchlist-btn"
                        onClick={(e) => { e.stopPropagation(); addToWatchlist(stock.symbol); }}
                      >
                        <Plus size={14} /> Watchlist
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {sortedStocks.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                    No stocks found matching "{searchTerm}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="markets-table-footer">
          <span>Showing {sortedStocks.length} of {totalStocks} simulated stocks</span>
          <span>Click a row to view stock detail</span>
        </div>
      </section>
    </div>
  );
};

export default Markets;
