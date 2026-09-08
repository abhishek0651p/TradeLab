export interface AccountState {
  startingBalance: number;
  cashBalance: number;
  investedValue: number;
  portfolioValue: number;
  realizedPnL: number;
  unrealizedPnL: number;
}

export interface StockData {
  symbol: string;
  companyName: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  sector: string;
  exchange: string;
  description: string;
}

export interface ChartDataPoint {
  timestamp: string;
  price: number;
  volume: number;
}

export interface PortfolioPosition {
  symbol: string;
  quantity: number;
  averagePrice: number;
}
