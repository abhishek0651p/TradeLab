export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT' | 'TARGET';
export type OrderStatus = 'PENDING' | 'TRIGGERED' | 'EXECUTED' | 'CANCELLED' | 'REJECTED' | 'PARTIALLY_FILLED';

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

/** Transaction cost breakdown (shared across Order, Execution, and Trade).
 *  All fields optional for backward compatibility with historical records.
 *  Phase A: Data model only — no calculation logic yet.
 */
export interface TransactionCosts {
  brokerage?: number;
  stt?: number;
  exchangeTransactionCharges?: number;
  gst?: number;
  sebiCharges?: number;
  stampDuty?: number;
  otherCharges?: number;
  totalCharges?: number;
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
  // Day 32: Transaction cost breakdown (optional, backward compatible)
  charges?: TransactionCosts;
  // Day 32 Phase D: Net financial impact including transaction costs
  netValue?: number;
}

// Day 25: Trade Journal entry
// tradeId is optional: present = linked to a stable trade ID; absent = general observation
export interface TradeJournalEntry {
  id: string;
  tradeId?: string; // undefined = general note; string = linked to trade
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

  // Day 32: Partial-fill tracking (optional, backward compatible)
  filledQuantity?: number;       // Quantity executed so far; undefined means 0 or full fill
  remainingQuantity?: number;   // Quantity still to fill; undefined means quantity (no partial fill)

  // Day 32: Transaction cost breakdown (optional, backward compatible)
  charges?: TransactionCosts;
  // Day 32 Phase D: Net financial impact including transaction costs
  netValue?: number;

  // Day 20: GTT / Conditional order extensions
  isGTT?: boolean;                    // Good-Till-Triggered flag
  expiry?: string | null;             // ISO timestamp for Good-Till-Date; null = Good-Till-Cancelled
  trailingConfig?: TrailingStopConfig; // Trailing stop configuration
  highestPriceSinceCreation?: number; // For trailing SELL stop: highest price observed
  lowestPriceSinceCreation?: number;  // For trailing BUY stop: lowest price observed
  // Day 31: GTT lifecycle tracking
  triggeredAt?: string | null;        // Timestamp when order transitioned to TRIGGERED state

  // Day 32 Phase E: Order modification audit trail, versioning and execution priority
  orderVersion?: number;              // Monotonically increasing revision counter (starts at 1)
  modifiedAt?: string | null;         // Timestamp of latest modification
  modificationCount?: number;         // Total number of successful modifications
  modificationHistory?: OrderModificationRecord[]; // Immutable audit log of all modifications
  priorityTimestamp?: number;         // Epoch timestamp used for FIFO queue execution priority
}

export interface OrderModificationRecord {
  timestamp: string;
  previousQuantity: number;
  newQuantity: number;
  previousRequestedPrice: number;
  newRequestedPrice: number;
  previousTriggerPrice?: number;
  newTriggerPrice?: number;
  previousRemainingQuantity: number;
  newRemainingQuantity: number;
  reason?: string;
  orderVersion: number;
}

export interface ModifyOrderParams {
  orderId: string;
  quantity?: number;         // New total order quantity (must be >= filledQuantity)
  price?: number;            // New limit / requested price
  triggerPrice?: number;     // New trigger price (for STOP_LIMIT or GTT)
  reason?: string;           // Optional user or strategy modification reason
  expectedVersion?: number;  // Optional optimistic lock / version check
}

export interface ModifyOrderResult {
  success: boolean;
  error?: string;
  order?: Order;
  validationDetails?: {
    additionalCapitalRequired?: number;
    additionalHoldingsRequired?: number;
    excessCapitalReleased?: number;
    excessHoldingsReleased?: number;
  };
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
  quantity: number;             // Quantity filled in this individual execution
  executionPrice: number;
  totalValue: number;
  executedAt: string;
  // Day 32: Transaction cost breakdown (optional, backward compatible)
  // Multiple executions may belong to one order; each execution is an independent fill.
  charges?: TransactionCosts;
  // Day 32 Phase D: Net financial impact including transaction costs
  netValue?: number;
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

/** Day 27: A planned order transferred from the position-sizing calculator to the order form.
 *  The user reviews all values before submission — this is a draft, not a live order.
 */
export interface PlannedOrder {
  symbol: string;
  side: OrderSide;
  quantity: number;
  entryPrice: number;
  stopLossPrice?: number;
  targetPrice?: number;
  source: 'position-sizer';
  createdAt: number;
}

/** ── Day 30: Bracket Order Types ─────────────────────────────────────────────────
 *  A bracket group consists of a parent entry order and two child exit orders
 *  (stop-loss and target). One-Cancels-the-Other (OCO) logic ensures only one
 *  exit executes, protecting the remaining position.
 * ──────────────────────────────────────────────────────────────────────────────── */
export interface BracketGroup {
  id: string;                 // Unique bracket group identifier
  parentOrderId: string;     // The entry order ID
  stopLossOrderId: string;   // The stop-loss child order ID
  targetOrderId: string;     // The target child order ID
  positionId: string;        // Linked position identifier
  ocoGroupId: string;        // OCO group identifier (same as bracket id)
  symbol: string;            // Underlying stock symbol
  side: OrderSide;           // 'BUY' or 'SELL'
  entryPrice: number;        // Entry price of the parent order
  stopLossPrice: number;     // Stop-loss price
  targetPrice: number;       // Target price
  originalQuantity: number;  // Original order quantity
  remainingQuantity: number; // Remaining quantity to protect
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  createdAt: number;         // Creation timestamp
  updatedAt: number;         // Last update timestamp
}

export interface BracketOrderResult {
  success: boolean;
  error?: string;
  bracketGroup?: BracketGroup;
  executedOrder?: Order;
}

/** ── Day 30: OCO Execution Result ────────────────────────────────────────────── */
export interface OCOExecutionResult {
  success: boolean;
  error?: string;
  executedLeg: 'STOP_LOSS' | 'TARGET'; // Which leg executed
  cancelledLeg: 'STOP_LOSS' | 'TARGET'; // Which leg was cancelled
  remainingQuantity: number; // Position quantity still protected
  realizedPnL: number; // P&L from the executed leg
  cancelledOrderId: string; // Order ID that was cancelled
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

