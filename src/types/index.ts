export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT' | 'TARGET';
export type OrderStatus = 'PENDING' | 'TRIGGERED' | 'EXECUTED' | 'CANCELLED' | 'REJECTED';

export interface Holding {
  symbol: string;
  quantity: number;
  averageBuyPrice: number;
}

export interface Trade {
  id: string;
  timestamp: string;
  symbol: string;
  companyName: string;
  side: OrderSide;
  quantity: number;
  executionPrice: number;
  totalValue: number;
  realizedPnL: number | null;
  orderId?: string;
  executionId?: string;
  orderType?: OrderType;
}

export interface Order {
  id: string;
  symbol: string;
  companyName: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  requestedPrice: number;
  triggerPrice?: number;
  executionPrice: number | null;
  totalValue: number | null;
  status: OrderStatus;
  createdAt: string;
  executedAt: string | null;
  cancelledAt: string | null;
  rejectionReason: string | null;
}

export interface Execution {
  id: string;
  orderId: string;
  symbol: string;
  companyName: string;
  side: OrderSide;
  quantity: number;
  executionPrice: number;
  totalValue: number;
  executedAt: string;
}

export interface PlaceOrderParams {
  symbol: string;
  companyName: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  limitPrice?: number;
  triggerPrice?: number;
  currentPrice: number;
}

export interface PlaceOrderResult {
  success: boolean;
  error?: string;
  order?: Order;
  execution?: Execution;
}

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
