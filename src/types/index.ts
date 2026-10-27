export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT' | 'TARGET';
export type OrderStatus = 'PENDING' | 'TRIGGERED' | 'EXECUTED' | 'CANCELLED' | 'REJECTED';

export type NotificationType =
  | 'ORDER_EXECUTED'
  | 'ORDER_REJECTED'
  | 'ORDER_CANCELLED'
  | 'ORDER_TRIGGERED'
  | 'MARKET_EVENT'
  | 'ACCOUNT_EVENT'
  | 'SYSTEM';

export type NotificationPriority = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  symbol?: string;
  orderId?: string;
  tradeId?: string;
  timestamp: number;
  read: boolean;
  route?: string;
}

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
  // Day 25: User-entered strategy label (optional, leaves undefined for execution-created trades)
  strategy?: string;
}

// Day 25: Trade Journal entry
export interface TradeJournalEntry {
  id: string;
  tradeId: string; // Links to a stable trade ID
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
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

  // Day 20: GTT / Conditional order extensions
  isGTT?: boolean;                    // Good-Till-Triggered flag
  expiry?: string | null;             // ISO timestamp for Good-Till-Date; null = Good-Till-Cancelled
  trailingConfig?: TrailingStopConfig; // Trailing stop configuration
  highestPriceSinceCreation?: number; // For trailing SELL stop: highest price observed
  lowestPriceSinceCreation?: number;  // For trailing BUY stop: lowest price observed
}

export interface TrailingStopConfig {
  distance: number;           // Distance from peak/trough (absolute or percent)
  distanceType: 'absolute' | 'percent'; // How distance is specified
  // Direction is inferred from order side: SELL trails highest price (protect downside), BUY trails lowest price (protect upside)
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
  // Day 20: GTT / conditional order extensions
  isGTT?: boolean;
  expiry?: string | null; // ISO timestamp for Good-Till-Date; null/undefined = Good-Till-Cancelled
  trailingConfig?: TrailingStopConfig;
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

/** A recorded portfolio snapshot — timestamp + key metrics */
export interface PortfolioSnapshot {
  id: string;
  timestamp: number; // ISO epoch ms when recorded
  totalAccountValue: number;
  totalCurrentValue: number;
  totalInvestedValue: number;
  totalUnrealizedPnL: number;
  realizedPnL: number;
  totalReturnPercent: number;
}

// Day 23: Market Simulation types
export type SimulationSpeed = '0.5x' | '1x' | '2x' | '5x';

export interface SimulationSpeedPreset {
  speed: SimulationSpeed;
  label: string;
  intervalSec: number;
}

export const SIMULATION_SPEED_PRESETS: SimulationSpeedPreset[] = [
  { speed: '0.5x', label: '0.5x (10s)', intervalSec: 10 },
  { speed: '1x', label: '1x (5s)', intervalSec: 5 },
  { speed: '2x', label: '2x (2s)', intervalSec: 2 },
  { speed: '5x', label: '5x (1s)', intervalSec: 1 },
];

// Day 24: Market event log types
export type MarketEventType =
  | 'SIM_STARTED'
  | 'SIM_PAUSED'
  | 'SIM_RESUMED'
  | 'SIM_SPEED_CHANGED'
  | 'MARKET_TICK'
  | 'REPLAY_STARTED'
  | 'REPLAY_PAUSED'
  | 'REPLAY_RESUMED'
  | 'REPLAY_STOPPED'
  | 'REPLAY_COMPLETED'
  | 'INVALID_DATA_REJECTED';

export interface MarketEvent {
  id: string;
  type: MarketEventType;
  message: string;
  timestamp: number;
  detail?: string;
}

// Day 24: Replay types
export type ReplaySpeed = 1 | 2 | 4 | 8;

export const REPLAY_SPEED_PRESETS: { speed: ReplaySpeed; label: string }[] = [
  { speed: 1, label: '1×' },
  { speed: 2, label: '2×' },
  { speed: 4, label: '4×' },
  { speed: 8, label: '8×' },
];

export interface ReplayState {
  active: boolean;
  paused: boolean;
  symbol: string;
  snapshotData: ChartDataPoint[];
  currentIndex: number;
  speed: ReplaySpeed;
}

