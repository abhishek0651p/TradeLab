import { StockData, ChartDataPoint } from '../types';

export const INITIAL_ACCOUNT_STATE = {
  startingBalance: 1000000,
  cashBalance: 1000000,
  investedValue: 0,
  portfolioValue: 1000000,
  realizedPnL: 0,
  unrealizedPnL: 0
};

export const MOCK_STOCKS: StockData[] = [
  { 
    symbol: 'RELIANCE', companyName: 'Reliance Industries', price: 2950.45, previousClose: 2920.10, change: 30.35, changePercent: 1.04,
    open: 2930.00, dayHigh: 2965.80, dayLow: 2915.20, volume: 4521000, sector: 'Conglomerates', exchange: 'NSE', description: 'Reliance Industries Limited is an Indian multinational conglomerate company, headquartered in Mumbai. It has diverse businesses including energy, petrochemicals, natural gas, retail, telecommunications, mass media, and textiles.'
  },
  { 
    symbol: 'TCS', companyName: 'Tata Consultancy Services', price: 3985.20, previousClose: 4010.50, change: -25.30, changePercent: -0.63,
    open: 4005.00, dayHigh: 4020.10, dayLow: 3970.50, volume: 2150000, sector: 'IT Services', exchange: 'NSE', description: 'Tata Consultancy Services is an Indian multinational information technology services and consulting company headquartered in Mumbai.'
  },
  { 
    symbol: 'HDFCBANK', companyName: 'HDFC Bank', price: 1540.60, previousClose: 1520.00, change: 20.60, changePercent: 1.36,
    open: 1525.50, dayHigh: 1545.00, dayLow: 1520.00, volume: 8950000, sector: 'Banking', exchange: 'NSE', description: 'HDFC Bank Limited is an Indian banking and financial services company headquartered in Mumbai. It is India\'s largest private sector bank by assets.'
  },
  { 
    symbol: 'INFY', companyName: 'Infosys', price: 1620.30, previousClose: 1615.10, change: 5.20, changePercent: 0.32,
    open: 1618.00, dayHigh: 1630.50, dayLow: 1610.20, volume: 3420000, sector: 'IT Services', exchange: 'NSE', description: 'Infosys Limited is an Indian multinational information technology company that provides business consulting, information technology and outsourcing services.'
  },
  { 
    symbol: 'ICICIBANK', companyName: 'ICICI Bank', price: 1120.75, previousClose: 1110.25, change: 10.50, changePercent: 0.95,
    open: 1115.00, dayHigh: 1125.40, dayLow: 1110.00, volume: 6780000, sector: 'Banking', exchange: 'NSE', description: 'ICICI Bank Limited is an Indian multinational bank and financial services company headquartered in Mumbai. It offers a wide range of banking products and financial services.'
  },
  { 
    symbol: 'SBIN', companyName: 'State Bank of India', price: 780.40, previousClose: 795.60, change: -15.20, changePercent: -1.91,
    open: 790.00, dayHigh: 792.50, dayLow: 778.10, volume: 11200000, sector: 'Banking', exchange: 'NSE', description: 'State Bank of India is an Indian multinational public sector bank and financial services statutory body headquartered in Mumbai.'
  },
  { 
    symbol: 'BHARTIARTL', companyName: 'Bharti Airtel', price: 1250.90, previousClose: 1240.50, change: 10.40, changePercent: 0.84,
    open: 1245.00, dayHigh: 1258.20, dayLow: 1240.10, volume: 4100000, sector: 'Telecommunications', exchange: 'NSE', description: 'Bharti Airtel Limited, also known as Airtel, is an Indian multinational telecommunications services company based in New Delhi.'
  },
  { 
    symbol: 'ITC', companyName: 'ITC', price: 430.25, previousClose: 425.50, change: 4.75, changePercent: 1.12,
    open: 426.00, dayHigh: 432.10, dayLow: 425.00, volume: 9500000, sector: 'Consumer Goods', exchange: 'NSE', description: 'ITC Limited is an Indian conglomerate company headquartered in Kolkata. Its diversified business includes FMCG, hotels, software, packaging, paperboards, specialty papers and agribusiness.'
  },
  { 
    symbol: 'LT', companyName: 'Larsen & Toubro', price: 3650.10, previousClose: 3620.80, change: 29.30, changePercent: 0.81,
    open: 3630.00, dayHigh: 3665.50, dayLow: 3625.00, volume: 1250000, sector: 'Construction & Engineering', exchange: 'NSE', description: 'Larsen & Toubro Ltd, commonly known as L&T, is an Indian multinational conglomerate company, with business interests in engineering, construction, manufacturing, technology, information technology and financial services.'
  },
  { 
    symbol: 'HINDUNILVR', companyName: 'Hindustan Unilever', price: 2350.60, previousClose: 2360.20, change: -9.60, changePercent: -0.41,
    open: 2355.00, dayHigh: 2365.00, dayLow: 2345.10, volume: 1850000, sector: 'Consumer Goods', exchange: 'NSE', description: 'Hindustan Unilever Limited is an Indian consumer goods company headquartered in Mumbai. It is a subsidiary of Unilever, a British company.'
  },
];

// Deterministic pseudo-random generator
export const seededRandom = (seed: number) => {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
};

// Deterministic hash for per-symbol seeds
export const symbolHash = (symbol: string): number => {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

// Simulate a deterministic market tick
export const simulateMarketUpdate = (stocks: StockData[], tick: number): StockData[] => {
  const MAX_CHANGE = 0.02;

  return stocks.map(stock => {
    const rand = seededRandom(symbolHash(stock.symbol) + tick);
    const changePct = (rand - 0.5) * 2 * MAX_CHANGE;
    const newPrice = Math.max(1, stock.price * (1 + changePct));
    const clampedPrice = Number(newPrice.toFixed(2));

    const newChange = Number((clampedPrice - stock.previousClose).toFixed(2));
    const newChangePercent = Number((((newChange / stock.previousClose) * 100).toFixed(2)));

    return {
      ...stock,
      price: clampedPrice,
      change: newChange,
      changePercent: newChangePercent,
      dayHigh: Math.max(stock.dayHigh, clampedPrice),
      dayLow: Math.min(stock.dayLow, clampedPrice)
    };
  });
};

// In-memory registry keeping active market prices and bounded 1D history
const activeStockRegistry = new Map<string, StockData>(MOCK_STOCKS.map(s => [s.symbol, s]));
const activeHistoryRegistry = new Map<string, ChartDataPoint[]>();

/** Synchronize the central market registry with active simulated state */
export const updateMarketRegistry = (
  stocks: StockData[],
  history?: Record<string, ChartDataPoint[]>
) => {
  stocks.forEach(s => activeStockRegistry.set(s.symbol, { ...s }));
  if (history && typeof history === 'object' && !Array.isArray(history)) {
    const sanitized = sanitizeStockHistory(history);
    Object.entries(sanitized).forEach(([sym, pts]) => {
      // Do not overwrite existing valid history with empty/all-rejected points
      if (pts.length > 0) {
        activeHistoryRegistry.set(sym, pts);
      }
    });
  }
};

/** Get the authoritative current simulated stock from the central registry (defensive copy) */
export const getRegisteredStock = (symbol: string): StockData | undefined => {
  const stock = activeStockRegistry.get(symbol);
  return stock ? { ...stock } : undefined;
};

/** Get the authoritative bounded 1D history from the central registry (defensive copy) */
export const getRegisteredHistory = (symbol: string): ChartDataPoint[] | undefined => {
  const hist = activeHistoryRegistry.get(symbol);
  if (!hist) return undefined;
  return hist.map(pt => ({ ...pt }));
};

// ── Day 24: Market data validation ──

/** Maximum history points kept per symbol */
const MAX_HISTORY_POINTS = 100;

/** Accumulated rejection log for diagnostics (bounded) */
const _rejectionLog: { timestamp: number; reason: string }[] = [];

/** Record a data rejection for diagnostic purposes */
const recordRejection = (reason: string) => {
  _rejectionLog.push({ timestamp: Date.now(), reason });
  if (_rejectionLog.length > 50) _rejectionLog.splice(0, _rejectionLog.length - 50);
};

/** Get a copy of recent rejections for event log purposes */
export const getRecentRejections = (): { timestamp: number; reason: string }[] => {
  return [..._rejectionLog];
};

/** Drain and clear recent rejections for synchronization with React event log */
export const drainRecentRejections = (): { timestamp: number; reason: string }[] => {
  return _rejectionLog.splice(0, _rejectionLog.length);
};

/** Helper to parse timestamp string for chronological comparison */
const parseTimeOrder = (ts: string): number | null => {
  const direct = Date.parse(ts);
  if (!Number.isNaN(direct)) return direct;
  const m = ts.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (m) {
    let hours = parseInt(m[1], 10);
    const mins = parseInt(m[2], 10);
    const secs = m[3] ? parseInt(m[3], 10) : 0;
    const ampm = m[4]?.toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return hours * 3600 + mins * 60 + secs;
  }
  return null;
};

/** Validate a single chart data point — reject non-finite/non-positive prices, negative volumes, empty timestamps */
export const validateChartDataPoint = (pt: unknown): pt is ChartDataPoint => {
  if (!pt || typeof pt !== 'object') return false;
  const p = pt as Record<string, unknown>;
  if (typeof p.timestamp !== 'string' || p.timestamp.trim().length === 0) return false;
  if (typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price <= 0) return false;
  if (typeof p.volume !== 'number' || !Number.isFinite(p.volume) || p.volume < 0) return false;
  return true;
};

/** Validate a full stock history record structure (type guard only — does not filter) */
export const validateStockHistory = (
  history: unknown
): history is Record<string, ChartDataPoint[]> => {
  if (!history || typeof history !== 'object' || Array.isArray(history)) return false;
  const entries = Object.entries(history as Record<string, unknown>);
  for (const [sym, pts] of entries) {
    if (typeof sym !== 'string' || !Array.isArray(pts)) return false;
    for (const pt of pts) {
      if (!validateChartDataPoint(pt)) return false;
    }
  }
  return true;
};

/**
 * Sanitize stock history: filter invalid points per-symbol, deduplicate timestamps,
 * sort chronologically, and bound to MAX_HISTORY_POINTS. Invalid points are logged
 * but never silently replaced.
 */
export const sanitizeStockHistory = (
  history: Record<string, unknown[]> | Record<string, ChartDataPoint[]>
): Record<string, ChartDataPoint[]> => {
  const result: Record<string, ChartDataPoint[]> = {};

  for (const [sym, pts] of Object.entries(history)) {
    if (!Array.isArray(pts)) {
      recordRejection(`Symbol "${sym}": history is not an array`);
      continue;
    }

    const validPoints: ChartDataPoint[] = [];
    const seenTimestamps = new Set<string>();

    for (const pt of pts) {
      if (!validateChartDataPoint(pt)) {
        recordRejection(`Symbol "${sym}": rejected invalid data point ${JSON.stringify(pt)}`);
        continue;
      }
      // Deduplicate deterministically: keep only the first occurrence of each timestamp
      if (seenTimestamps.has(pt.timestamp)) {
        continue;
      }
      seenTimestamps.add(pt.timestamp);
      validPoints.push({ timestamp: pt.timestamp, price: pt.price, volume: pt.volume });
    }

    // Sort chronologically if timestamps have parseable order
    const sorted = [...validPoints].sort((a, b) => {
      const ta = parseTimeOrder(a.timestamp);
      const tb = parseTimeOrder(b.timestamp);
      if (ta !== null && tb !== null) return ta - tb;
      return 0; // preserve stable arrival order if not parseable
    });

    // Bound to maximum
    const bounded = sorted.length > MAX_HISTORY_POINTS
      ? sorted.slice(-MAX_HISTORY_POINTS)
      : sorted;

    result[sym] = bounded;
  }

  return result;
};


/** Generate baseline 1D historical series for all stocks */
export const generateInitialStockHistory = (stocks: StockData[]): Record<string, ChartDataPoint[]> => {
  const result: Record<string, ChartDataPoint[]> = {};
  stocks.forEach(stock => {
    result[stock.symbol] = generateChartData(stock.symbol, '1D', stock.price);
  });
  return result;
};

/** Append a market tick to bounded stock history (max 100 points) */
export const appendStockTickHistory = (
  prevHistory: Record<string, ChartDataPoint[]>,
  updatedStocks: StockData[],
  maxPoints = 100
): Record<string, ChartDataPoint[]> => {
  const nextHistory: Record<string, ChartDataPoint[]> = { ...prevHistory };
  const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  updatedStocks.forEach(stock => {
    const existing = nextHistory[stock.symbol] || [];
    const tickSeed = symbolHash(stock.symbol) + stock.volume;
    const tickVolume = Math.floor(1000 + seededRandom(tickSeed) * 5000);

    const newPoint: ChartDataPoint = {
      timestamp: nowLabel,
      price: stock.price,
      volume: tickVolume,
    };

    const combined = [...existing, newPoint];
    nextHistory[stock.symbol] = combined.length > maxPoints ? combined.slice(-maxPoints) : combined;
  });

  return nextHistory;
};

export const generateChartData = (
  symbol: string,
  timeframe: '1D' | '1W' | '1M' | '1Y',
  currentPriceOverride?: number,
  historyOverride?: ChartDataPoint[]
): ChartDataPoint[] => {
  const registeredStock = activeStockRegistry.get(symbol);
  const fallbackStock = MOCK_STOCKS.find(s => s.symbol === symbol);
  const stock = registeredStock || fallbackStock;

  const effectivePrice = currentPriceOverride ?? stock?.price ?? 1000;
  const effectiveChangePercent = stock?.changePercent ?? 0;

  // For 1D timeframe, return recorded live history if available
  if (timeframe === '1D') {
    const recordedHistory = historyOverride || activeHistoryRegistry.get(symbol);
    if (recordedHistory && recordedHistory.length >= 2) {
      // Ensure the very last point accurately reflects effectivePrice
      const cloned = recordedHistory.map(pt => ({ ...pt }));
      cloned[cloned.length - 1].price = effectivePrice;
      return cloned;
    }
  }

  const dataPoints: ChartDataPoint[] = [];

  // Create a seed based on symbol so it's deterministic per stock
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) {
    seed += symbol.charCodeAt(i);
  }

  let pointsCount = 0;
  let intervalMs = 0;
  let volatility = 0;

  switch (timeframe) {
    case '1D':
      pointsCount = 78; // Every 5 mins for 6.5 hours
      intervalMs = 5 * 60 * 1000;
      volatility = 0.002;
      break;
    case '1W':
      pointsCount = 100;
      intervalMs = 60 * 60 * 1000; // Hourly
      volatility = 0.005;
      break;
    case '1M':
      pointsCount = 30;
      intervalMs = 24 * 60 * 60 * 1000; // Daily
      volatility = 0.015;
      break;
    case '1Y':
      pointsCount = 52;
      intervalMs = 7 * 24 * 60 * 60 * 1000; // Weekly
      volatility = 0.03;
      break;
  }

  let currentWalkPrice = effectivePrice * (1 - (timeframe === '1D' ? effectiveChangePercent / 100 : volatility * 5));
  const now = new Date();
  const startTime = now.getTime() - (pointsCount * intervalMs);

  for (let i = 0; i < pointsCount; i++) {
    // Determine random walk
    const rand = seededRandom(seed + i + timeframe.charCodeAt(0));
    const change = currentWalkPrice * volatility * (rand - 0.48); // Slight upward bias

    currentWalkPrice += change;

    // Ensure final point matches current price closely if it's 1D
    if (i === pointsCount - 1 && timeframe === '1D') {
      currentWalkPrice = effectivePrice;
    }

    const pointTime = new Date(startTime + (i * intervalMs));
    let timeLabel = '';

    if (timeframe === '1D') {
      timeLabel = pointTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (timeframe === '1W' || timeframe === '1M') {
      timeLabel = pointTime.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } else {
      timeLabel = pointTime.toLocaleDateString([], { month: 'short', year: '2-digit' });
    }

    dataPoints.push({
      timestamp: timeLabel,
      price: Number(currentWalkPrice.toFixed(2)),
      volume: Math.floor(10000 + seededRandom(seed + i * 2) * 50000)
    });
  }

  // Ensure last point matches current price exactly
  if (dataPoints.length > 0) {
    dataPoints[dataPoints.length - 1].price = effectivePrice;
  }

  return dataPoints;
};
