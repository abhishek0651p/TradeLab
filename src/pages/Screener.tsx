import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrading } from '../context/TradingContext';
import {
  Search,
  Archive,
  CheckCircle,
  X,
  ChevronUp,
  ChevronDown,
  Zap,
} from 'lucide-react';
import { StockData } from '../types';
import { generateChartData } from '../data/mockData';
import {
  calculateEMA,
  calculateRSI,
  calculateVolumeStats,
  VolumeStats,
} from '../analysis/TechnicalIndicators';

/* ── Type definitions ────────────────────────────────────────────── */

type SortField = 'symbol' | 'companyName' | 'price' | 'changePercent' | 'rsi' | 'emaCross' | 'volume';
type SortDirection = 'asc' | 'desc';

interface FilterState {
  searchTerm: string;
  sector: string;
  minPrice: number | null;
  maxPrice: number | null;
  minChangePercent: number | null;
  maxChangePercent: number | null;
  rsiState: 'oversold' | 'neutral' | 'overbought' | 'any';
  emaCross: 'bullish' | 'bearish' | 'neutral' | 'any';
}

interface SavedScreener {
  name: string;
  filters: FilterState;
  sortField: SortField;
  sortDirection: SortDirection;
}

interface EnrichedStock extends StockData {
  rsiCurrent: number | null;
  rsiState: 'oversold' | 'neutral' | 'overbought' | 'unknown';
  priceVsEMA20: 'above' | 'below' | 'unknown';
  priceVsEMA50: 'above' | 'below' | 'unknown';
  emaCross: 'bullish' | 'bearish' | 'neutral';
  volState: VolumeStats['state'];
  score: number; // transparent rule-based score, 0-100
}

/* ── Helper functions ────────────────────────────────────────────── */

const formatINR = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

const formatPercent = (value: number) =>
  (value >= 0 ? '+' : '') + value.toFixed(2) + '%';

/* ── Initial filter state ────────────────────────────────────────── */

const initialFilters = (): FilterState => ({
  searchTerm: '',
  sector: '',
  minPrice: null,
  maxPrice: null,
  minChangePercent: null,
  maxChangePercent: null,
  rsiState: 'any',
  emaCross: 'any',
});

/* ── Persistence helpers ─────────────────────────────────────────── */

const loadJSON = (key: string) => {
  const stored = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
};

const saveJSON = (key: string, value: any) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

/* ── Indicator computation ─────────────────────────────────────────
 * Reuses existing indicator utilities from TechnicalIndicators.ts.
 * Uses '1D' timeframe (78 data points, 5-min intervals).
 * ── */

const enrichStock = (stock: StockData): EnrichedStock | null => {
  const chartData = generateChartData(stock.symbol, '1D');
  if (!chartData || chartData.length < 50) {
    // Not enough data for EMA50; skip technical indicators but keep the stock
    return {
      ...stock,
      rsiCurrent: null,
      rsiState: 'unknown',
      priceVsEMA20: 'unknown',
      priceVsEMA50: 'unknown',
      emaCross: 'neutral',
      volState: 'no_data',
      score: 50,
    };
  }

  const prices = chartData.map((d) => d.price);
  const volumes = chartData.map((d) => d.volume);

  const ema20 = calculateEMA(prices, 20);
  const ema50 = calculateEMA(prices, 50);
  const rsi = calculateRSI(prices, 14);
  const volStats = calculateVolumeStats(volumes);

  // Current EMA values (last in the result arrays)
  const ema20Values = ema20.values;
  const ema50Values = ema50.values;
  const ema20Last = ema20Values[ema20Values.length - 1];
  const ema50Last = ema50Values[ema50Values.length - 1];
  const rsiCurrent = rsi.current;

  // RSI state
  let rsiState: 'oversold' | 'neutral' | 'overbought' | 'unknown' = 'unknown';
  if (rsiCurrent !== null) {
    if (rsiCurrent < 30) rsiState = 'oversold';
    else if (rsiCurrent > 70) rsiState = 'overbought';
    else rsiState = 'neutral';
  }

  // Price vs EMA
  const price = stock.price;
  const priceVsEMA20: 'above' | 'below' | 'unknown' =
    ema20Last != null
      ? price > ema20Last
        ? 'above'
        : price < ema20Last
          ? 'below'
          : 'unknown'
      : 'unknown';
  const priceVsEMA50: 'above' | 'below' | 'unknown' =
    ema50Last != null
      ? price > ema50Last
        ? 'above'
        : price < ema50Last
          ? 'below'
          : 'unknown'
      : 'unknown';

  // EMA cross: EMA20 vs EMA50
  const emaCross: 'bullish' | 'bearish' | 'neutral' =
    ema20Last != null && ema50Last != null
      ? ema20Last > ema50Last
        ? 'bullish'
        : ema20Last < ema50Last
          ? 'bearish'
          : 'neutral'
      : 'neutral';

  // ── Transparent rule-based score (0-100) ────────────────────────
  let score = 50;
  if (rsiState === 'oversold') score += 15;
  if (rsiState === 'overbought') score -= 15;
  if (priceVsEMA20 === 'above') score += 10;
  if (priceVsEMA20 === 'below') score -= 10;
  if (priceVsEMA50 === 'above') score += 5;
  if (priceVsEMA50 === 'below') score -= 5;
  if (emaCross === 'bullish') score += 10;
  if (emaCross === 'bearish') score -= 10;
  if (volStats.state === 'above_average') score += 5;
  if (volStats.state === 'below_average') score -= 5;
  score = Math.max(0, Math.min(100, score));

  return {
    ...stock,
    rsiCurrent,
    rsiState,
    priceVsEMA20,
    priceVsEMA50,
    emaCross,
    volState: volStats.state,
    score,
  };
};

/* ── SortIndicator component ─────────────────────────────────────── */

const SortIndicator: React.FC<{
  active: boolean;
  direction: SortDirection;
}> = ({ active, direction }) => (
  <span className={active ? 'wl-sort-icon-active' : 'wl-sort-icon-idle'}>
    {active ? (direction === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronDown size={13} />}
  </span>
);

/* ── Sortable header helper ──────────────────────────────────────── */

const SortableHeader = (props: {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
  setSort: (field: SortField) => void;
  children: React.ReactNode;
  className?: string;
}) => {
  const { field, sortField, sortDirection, setSort, children, className } = props;
  const active = sortField === field;
  return (
    <th className={className}>
      <button
        className="screener-sortable-header"
        onClick={() => setSort(field)}
      >
        <span>{children}</span>
        <SortIndicator active={active} direction={sortDirection} />
      </button>
    </th>
  );
};

/* ── Main Component ───────────────────────────────────────────────── */

const Screener: React.FC = () => {
  const { stocks, watchlist, addToWatchlist, removeFromWatchlist } = useTrading();
  const navigate = useNavigate();

  // Filter state (persisted)
  const [filterState, setFilterState] = useState<FilterState>(() => {
    const stored = loadJSON('tradelab_screener_filters');
    return stored ? { ...initialFilters(), ...stored } : initialFilters();
  });

  // Sort state
  const [sortField, setSortField] = useState<SortField>('changePercent');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Save filter state to localStorage whenever it changes
  useEffect(() => {
    saveJSON('tradelab_screener_filters', filterState);
  }, [filterState]);

  // Saved screeners (persisted)
  const [savedScreeners, setSavedScreeners] = useState<SavedScreener[]>(() => {
    const stored = loadJSON('tradelab_saved_screeners');
    return stored ? stored : [];
  });

  /* ── Enrich all stocks with technical indicators (memoized) ──── */

  const enrichedStocks = useMemo(() => {
    return stocks
      .map(enrichStock)
      .filter((s): s is EnrichedStock => s !== null);
  }, [stocks]);

  /* ── Apply filters ────────────────────────────────────────────── */

  const filteredStocks = useMemo(() => {
    let result = [...enrichedStocks];

    // Search by symbol or company name
    if (filterState.searchTerm.trim()) {
      const term = filterState.searchTerm.trim().toLowerCase();
      result = result.filter(
        (stock) =>
          stock.symbol.toLowerCase().includes(term) ||
          stock.companyName.toLowerCase().includes(term)
      );
    }

    // Sector filter
    if (filterState.sector) {
      result = result.filter((stock) => stock.sector === filterState.sector);
    }

    // Price range filter
    if (filterState.minPrice !== null) {
      result = result.filter((stock) => stock.price >= filterState.minPrice!);
    }
    if (filterState.maxPrice !== null) {
      result = result.filter((stock) => stock.price <= filterState.maxPrice!);
    }

    // Price change % filter
    if (filterState.minChangePercent !== null) {
      result = result.filter((stock) => stock.changePercent >= filterState.minChangePercent!);
    }
    if (filterState.maxChangePercent !== null) {
      result = result.filter((stock) => stock.changePercent <= filterState.maxChangePercent!);
    }

    // RSI state filter
    if (filterState.rsiState !== 'any') {
      result = result.filter((stock) => stock.rsiState === filterState.rsiState);
    }

    // EMA cross filter
    if (filterState.emaCross !== 'any') {
      result = result.filter((stock) => stock.emaCross === filterState.emaCross);
    }

    return result;
  }, [enrichedStocks, filterState]);

  /* ── Sort results ─────────────────────────────────────────────── */

  const sortedStocks = useMemo(() => {
    return [...filteredStocks].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'symbol':
          comparison = a.symbol.localeCompare(b.symbol);
          break;
        case 'companyName':
          comparison = a.companyName.localeCompare(b.companyName);
          break;
        case 'price':
          comparison = a.price - b.price;
          break;
        case 'changePercent':
          comparison = a.changePercent - b.changePercent;
          break;
        case 'rsi':
          comparison = (b.rsiCurrent ?? 50) - (a.rsiCurrent ?? 50);
          break;
        case 'emaCross':
          // Bullish first, then neutral, then bearish
          const rankA = a.emaCross === 'bullish' ? 3 : a.emaCross === 'neutral' ? 2 : 1;
          const rankB = b.emaCross === 'bullish' ? 3 : b.emaCross === 'neutral' ? 2 : 1;
          comparison = rankB - rankA;
          break;
        case 'volume':
          comparison = a.volume - b.volume;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredStocks, sortField, sortDirection]);

  /* ── Sort helper ──────────────────────────────────────────────── */

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  /* ── Watchlist toggle ─────────────────────────────────────────── */

  const toggleWatchlist = (stock: StockData) => {
    if (watchlist.includes(stock.symbol)) {
      removeFromWatchlist(stock.symbol);
    } else {
      addToWatchlist(stock.symbol);
    }
  };

  /* ── Save current screener criteria ──────────────────────────── */

  const saveCurrentScreener = (name: string) => {
    const newScreener: SavedScreener = {
      name,
      filters: { ...filterState },
      sortField,
      sortDirection,
    };
    const updated = savedScreeners.filter((s) => s.name !== name);
    const newList = [...updated, newScreener];
    setSavedScreeners(newList);
    saveJSON('tradelab_saved_screeners', newList);
  };

  const deleteScreener = (name: string) => {
    const newList = savedScreeners.filter((s) => s.name !== name);
    setSavedScreeners(newList);
    saveJSON('tradelab_saved_screeners', newList);
  };

  const applySavedScreener = (screener: SavedScreener) => {
    setFilterState({ ...initialFilters(), ...screener.filters });
    setSortField(screener.sortField);
    setSortDirection(screener.sortDirection);
  };

  /* ── Derived values ──────────────────────────────────────────── */

  const hasFiltersApplied =
    filterState.searchTerm.trim() !== '' ||
    filterState.sector !== '' ||
    filterState.minPrice !== null ||
    filterState.maxPrice !== null ||
    filterState.minChangePercent !== null ||
    filterState.maxChangePercent !== null ||
    filterState.rsiState !== 'any' ||
    filterState.emaCross !== 'any';

  const availableSectors = useMemo(
    () =>
      Array.from(new Set(stocks.map((s) => s.sector)))
        .filter((s) => s && s !== '')
        .sort(),
    [stocks]
  );

  /* ── Render ──────────────────────────────────────────────────── */

  return (
    <div className="d22-screener-page">
      {/* ── Header ── */}
      <div className="d22-screener-header">
        <div className="d22-screener-header-left">
          <h1 className="d22-screener-title">
            <Search size={20} /> Market Intelligence & Stock Screener
          </h1>
          <p className="d22-screener-subtitle">
            Screen <strong>{stocks.length}</strong> stocks by technical indicators, price, sector, and search
          </p>
        </div>
        <div className="d22-screener-header-actions">
          {hasFiltersApplied && (
            <button
              className="btn btn-secondary d22-screener-clear-btn"
              onClick={() => setFilterState(initialFilters())}
            >
              Clear All
            </button>
          )}
          <button
            className="btn btn-primary d22-screener-save-btn"
            onClick={() => saveCurrentScreener('My Screener')}
            disabled={filteredStocks.length === 0}
          >
            Save Criteria
          </button>
        </div>
      </div>

      {/* ── Filter Panel ── */}
      <div className="d22-screener-filter-panel">
        {/* Search */}
        <div className="d22-screener-filter-group">
          <label className="d22-screener-filter-label">Search</label>
          <div className="d22-screener-input-wrap">
            <Search size={16} className="d22-screener-input-icon" />
            <input
              type="text"
              placeholder="Symbol or company name..."
              value={filterState.searchTerm}
              onChange={(e) => setFilterState((prev) => ({ ...prev, searchTerm: e.target.value }))}
              className="d22-screener-search-input"
            />
          </div>
        </div>

        {/* Sector filter */}
        <div className="d22-screener-filter-group">
          <label className="d22-screener-filter-label">Sector</label>
          <select
            value={filterState.sector}
            onChange={(e) => setFilterState((prev) => ({ ...prev, sector: e.target.value }))}
            className="d22-screener-select"
          >
            <option value="">All sectors</option>
            {availableSectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Price range filter */}
        <div className="d22-screener-filter-group">
          <label className="d22-screener-filter-label">Price Range (₹)</label>
          <div className="d22-screener-range-inputs">
            <input
              type="number"
              placeholder="Min"
              value={filterState.minPrice ?? ''}
              onChange={(e) =>
                setFilterState((prev) => ({
                  ...prev,
                  minPrice: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
              className="d22-screener-number-input"
            />
            <span className="d22-screener-range-separator">—</span>
            <input
              type="number"
              placeholder="Max"
              value={filterState.maxPrice ?? ''}
              onChange={(e) =>
                setFilterState((prev) => ({
                  ...prev,
                  maxPrice: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
              className="d22-screener-number-input"
            />
          </div>
        </div>

        {/* Change % filter */}
        <div className="d22-screener-filter-group">
          <label className="d22-screener-filter-label">Change %</label>
          <div className="d22-screener-range-inputs">
            <input
              type="number"
              placeholder="Min"
              value={filterState.minChangePercent ?? ''}
              onChange={(e) =>
                setFilterState((prev) => ({
                  ...prev,
                  minChangePercent: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
              className="d22-screener-number-input"
            />
            <span className="d22-screener-range-separator">—</span>
            <input
              type="number"
              placeholder="Max"
              value={filterState.maxChangePercent ?? ''}
              onChange={(e) =>
                setFilterState((prev) => ({
                  ...prev,
                  maxChangePercent: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
              className="d22-screener-number-input"
              step="0.01"
            />
          </div>
        </div>

        {/* RSI state filter */}
        <div className="d22-screener-filter-group">
          <label className="d22-screener-filter-label">RSI (14)</label>
          <select
            value={filterState.rsiState}
            onChange={(e) =>
              setFilterState((prev) => ({
                ...prev,
                rsiState: e.target.value as FilterState['rsiState'],
              }))
            }
            className="d22-screener-select"
          >
            <option value="any">Any</option>
            <option value="oversold">Oversold (&lt; 30)</option>
            <option value="neutral">Neutral (30–70)</option>
            <option value="overbought">Overbought (&gt; 70)</option>
          </select>
        </div>

        {/* EMA cross filter */}
        <div className="d22-screener-filter-group">
          <label className="d22-screener-filter-label">EMA Cross (20 vs 50)</label>
          <select
            value={filterState.emaCross}
            onChange={(e) =>
              setFilterState((prev) => ({
                ...prev,
                emaCross: e.target.value as FilterState['emaCross'],
              }))
            }
            className="d22-screener-select"
          >
            <option value="any">Any</option>
            <option value="bullish">Bullish (EMA20 &gt; EMA50)</option>
            <option value="bearish">Bearish (EMA20 &lt; EMA50)</option>
          </select>
        </div>
      </div>

      {/* ── Results Summary ── */}
      <div className="d22-screener-results-summary">
        <div className="d22-screener-results-count">
          {filteredStocks.length} of {stocks.length} stocks match
        </div>
        <div className="d22-screener-sim-badge">
          <Zap size={13} /> SIMULATED • Technical indicators derived
        </div>
      </div>

      {/* ── Results Table ── */}
      <div className="d22-screener-results-table-wrap">
        {filteredStocks.length === 0 ? (
          <div className="d22-screener-empty-state card">
            <Search size={48} className="d22-screener-empty-icon" />
            <h3>No stocks match your criteria</h3>
            <p>Adjust your filter settings to find stocks in the mock universe.</p>
            <p className="d22-screener-empty-subtext">
              {stocks.length} stocks available across {availableSectors.length} sectors
            </p>
            {hasFiltersApplied && (
              <button
                className="btn btn-primary"
                style={{ marginTop: 12 }}
                onClick={() => setFilterState(initialFilters())}
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <table className="d22-screener-table">
            <thead>
              <tr>
                <th className="d22-screener-col-symbol">#</th>
                <th className="d22-screener-col-symbol">
                  <SortableHeader
                    field="symbol"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    setSort={handleSort}
                  >
                    Symbol
                  </SortableHeader>
                </th>
                <SortableHeader
                  field="companyName"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  setSort={handleSort}
                  className="d22-screener-col-company"
                >
                  Company
                </SortableHeader>
                <SortableHeader
                  field="price"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  setSort={handleSort}
                  className="d22-screener-col-price"
                >
                  Price (₹)
                </SortableHeader>
                <SortableHeader
                  field="changePercent"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  setSort={handleSort}
                  className="d22-screener-col-change"
                >
                  Change %
                </SortableHeader>
                <SortableHeader
                  field="rsi"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  setSort={handleSort}
                  className="d22-screener-col-rsi"
                >
                  RSI (14)
                </SortableHeader>
                <SortableHeader
                  field="emaCross"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  setSort={handleSort}
                  className="d22-screener-col-ema"
                >
                  EMA Cross
                </SortableHeader>
                <SortableHeader
                  field="volume"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  setSort={handleSort}
                  className="d22-screener-col-volume"
                >
                  Volume
                </SortableHeader>
                <th className="d22-screener-col-sector">Sector</th>
                <th className="d22-screener-col-action">WL</th>
              </tr>
            </thead>
            <tbody>
              {sortedStocks.map((stock) => {
                const isOnWatchlist = watchlist.includes(stock.symbol);
                return (
                  <tr
                    key={stock.symbol}
                    className="stock-row-clickable"
                    onClick={() => navigate(`/stock/${stock.symbol}`)}
                  >
                    <td className="d22-screener-col-symbol d22-screener-row-index">
                      <span className="d22-screener-symbol">{stock.symbol}</span>
                    </td>
                    <td className="d22-screener-col-company">
                      <div className="d22-screener-company">
                        {stock.companyName}
                      </div>
                      <div className="d22-screener-score-wrap">
                        <span
                          className="d22-screener-score"
                          style={{
                            color:
                              stock.score >= 65
                                ? 'var(--success)'
                                : stock.score >= 35
                                  ? 'var(--text-muted)'
                                  : 'var(--danger)',
                          }}
                          title="Transparent rule-based score (RSI + EMA position + EMA cross + volume)"
                        >
                          Score: {stock.score}
                        </span>
                        {stock.rsiState === 'unknown' && (
                          <span className="d22-screener-na" title="Technical indicators unavailable">
                            (N/A)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="d22-screener-col-price">{formatINR(stock.price)}</td>
                    <td className={stock.changePercent >= 0 ? 'text-success' : 'text-danger'}>
                      {formatPercent(stock.changePercent)}
                    </td>
                    <td className="d22-screener-col-rsi">
                      {stock.rsiCurrent !== null
                        ? formatPercent(stock.rsiCurrent / 100)
                        : '—'}
                      <div>
                        {stock.rsiState === 'oversold' ? (
                          <span className="text-success">Oversold</span>
                        ) : stock.rsiState === 'overbought' ? (
                          <span className="text-danger">Overbought</span>
                        ) : stock.rsiState === 'neutral' ? (
                          <span className="text-muted">Neutral</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </div>
                    </td>
                    <td className="d22-screener-col-ema">
                      {stock.emaCross === 'bullish' ? (
                        <span className="text-success">Bullish</span>
                      ) : stock.emaCross === 'bearish' ? (
                        <span className="text-danger">Bearish</span>
                      ) : (
                        <span className="text-muted">Neutral</span>
                      )}
                    </td>
                    <td className="d22-screener-col-volume">
                      {new Intl.NumberFormat('en-IN').format(stock.volume)}
                    </td>
                    <td className="d22-screener-col-sector">
                      <span className="d22-screener-sector">{stock.sector}</span>
                    </td>
                    <td className="d22-screener-col-action">
                      <button
                        className={`btn btn-ghost ${isOnWatchlist ? 'd22-screener-wl-active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleWatchlist(stock);
                        }}
                        title={
                          isOnWatchlist
                            ? 'Remove from watchlist'
                            : 'Add to watchlist'
                        }
                      >
                        {isOnWatchlist ? (
                          <Archive size={16} fill="currentColor" />
                        ) : (
                          <Archive size={16} />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Saved Screeners Panel ── */}
      {savedScreeners.length > 0 && (
        <div className="d22-screener-saved-panel">
          <h2 className="d22-screener-saved-title">
            <Archive size={18} /> Saved Screeners
          </h2>
          <div className="d22-screener-saved-list">
            {savedScreeners.map((screener) => (
              <div key={screener.name} className="d22-screener-saved-item">
                <div className="d22-screener-saved-item-header">
                  <span className="d22-screener-saved-name">{screener.name}</span>
                  <div className="d22-screener-saved-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => applySavedScreener(screener)}
                      title="Apply these criteria"
                    >
                      <CheckCircle size={12} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => deleteScreener(screener.name)}
                      title="Delete saved screener"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
                <div className="d22-screener-saved-filters">
                  {screener.filters.rsiState !== 'any' && (
                    <span className="d22-screener-saved-tag">
                      RSI: {screener.filters.rsiState}
                    </span>
                  )}
                  {screener.filters.emaCross !== 'any' && (
                    <span className="d22-screener-saved-tag">
                      EMA: {screener.filters.emaCross}
                    </span>
                  )}
                  {screener.filters.sector && (
                    <span className="d22-screener-saved-tag">
                      {screener.filters.sector}
                    </span>
                  )}
                  <span className="d22-screener-saved-tag">
                    Sort: {screener.sortField} ({screener.sortDirection})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Screener;
