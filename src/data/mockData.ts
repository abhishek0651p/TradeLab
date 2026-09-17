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

export const generateChartData = (symbol: string, timeframe: '1D' | '1W' | '1M' | '1Y'): ChartDataPoint[] => {
  const stock = MOCK_STOCKS.find(s => s.symbol === symbol);
  const basePrice = stock ? stock.price : 1000;
  
  const dataPoints: ChartDataPoint[] = [];
  
  // Create a seed based on symbol so it's deterministic per stock
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) {
    seed += symbol.charCodeAt(i);
  }
  
  let pointsCount = 0;
  let intervalMs = 0;
  let volatility = 0;
  
  switch(timeframe) {
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
  
  let currentPrice = basePrice * (1 - (timeframe === '1D' ? (stock?.changePercent || 0)/100 : volatility * 5));
  const now = new Date();
  const startTime = now.getTime() - (pointsCount * intervalMs);
  
  for (let i = 0; i < pointsCount; i++) {
    // Determine random walk
    const rand = seededRandom(seed + i + timeframe.charCodeAt(0));
    const change = currentPrice * volatility * (rand - 0.48); // Slight upward bias
    
    currentPrice += change;
    
    // Ensure final point matches current price closely if it's 1D
    if (i === pointsCount - 1 && timeframe === '1D') {
      currentPrice = basePrice;
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
      price: Number(currentPrice.toFixed(2)),
      volume: Math.floor(10000 + seededRandom(seed + i * 2) * 50000)
    });
  }
  
  return dataPoints;
};
