import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  AccountState,
  OrderSide,
  OrderType,
  OrderStatus,
  Holding,
  Trade,
  StockData,
  Order,
  Execution,
  PlaceOrderParams,
  PlaceOrderResult,
  Notification,
  NotificationType,
  NotificationPriority,
  PortfolioSnapshot,
  ChartDataPoint,
  SimulationSpeed,
  SIMULATION_SPEED_PRESETS,
  MarketEvent,
  MarketEventType,
  ReplayState,
  ReplaySpeed,
  TradeJournalEntry,
  PlannedOrder,
  TransactionCosts,
  ModifyOrderParams,
  ModifyOrderResult
} from '../types';
import {
  INITIAL_ACCOUNT_STATE,
  MOCK_STOCKS,
  simulateMarketUpdate,
  updateMarketRegistry,
  generateInitialStockHistory,
  appendStockTickHistory,
  sanitizeStockHistory,
  validateChartDataPoint,
  drainRecentRejections
} from '../data/mockData';
import {
  createBracketGroup,
  activateChildExits,
  cancelEntryAndChildren,
  rejectEntryAndChildren,
  findOrphanedChildren,
  getRemainingQuantity,
  BracketGroup,
  validateBracketOrder,
} from '../engine/BracketOrderEngine';
import {
  computeAccountMetrics,
} from '../engine/BracketOrderEngineHelpers';
import {
  evaluateOCOTriggers,
  executeOCO,
  OCO_TIE_BREAKER,
} from '../engine/OCOExecutionEngine';
import {
  computePortfolioSummaryMetrics
} from '../engine/TradingAccounting';
import {
  computeReservedBuyCapital,
  validateBuyOrderReservation,
  validateSellOrderReservation,
  getEffectiveRemainingQuantity,
  getEffectiveFilledQuantity,
  computeExecutableBuyQuantity,
  computeExecutableSellQuantity,
  revalidateOrderAtExecution,
  isTerminalStatus
} from '../engine/ReservationModel';
import {
  BRACKET_STORAGE_KEY,
  serializeBracketGroups,
  deserializeBracketGroups,
  inspectBracketStorage,
  reconcileBracketState,
  BracketPersistenceStatus
} from '../engine/BracketRecoveryEngine';
import {
  validateTriggerPrices,
  validateTriggerLimitConsistency,
  validateGttCreation,
  evaluateOrderTrigger,
  computeTrailingUpdate,
  isGttExpired,
  canCancelGttOrder,
  inspectGttOrdersStorage,
  reconcileGttOrders,
  GttPersistenceStatus
} from '../engine/GttOrderEngine';
import {
  computeAvailableTickLiquidity,
  computeLiquidityConstrainedQuantity,
  computeSlippage,
  applyOrderTypePriceProtection
} from '../engine/LiquidityEngine';
import {
  TransactionCostConfig,
  DEFAULT_TRANSACTION_COST_CONFIG,
  calculateTransactionCosts,
  calculateTotalCharges,
  calculateNetExecutionValue,
  aggregateOrderCharges,
  computeHoldingAverageBuyPriceWithCosts,
  computeRealizedPnLWithCosts,
  calculateTransactionCostAnalytics,
  TransactionCostAnalytics,
  TransactionCostInput
} from '../engine/TransactionCostEngine';
import {
  validateOrderModification,
  applyOrderModification,
  sortOrdersByPriority
} from '../engine/OrderModificationEngine';

// ──────────────────────────────────────────────
// Settings model
// ──────────────────────────────────────────────

export interface TradingSettings {
  autoSimEnabled: boolean;
  autoSimIntervalSec: number;   // 1–60 seconds
  showPnlPercent: boolean;      // show % alongside ₹ values
  notificationsEnabled: boolean; // Day 16: toggle non-critical notifications
  // Day 32 Phase D: Transaction cost simulation toggle
  transactionCostsEnabled: boolean;
}

const DEFAULT_SETTINGS: TradingSettings = {
  autoSimEnabled: false,
  autoSimIntervalSec: 10,
  showPnlPercent: true,
  notificationsEnabled: true,
  transactionCostsEnabled: true
};

const AUTO_SIM_MIN_SEC = 1;
const AUTO_SIM_MAX_SEC = 60;

const clampInterval = (sec: number): number =>
  Math.max(AUTO_SIM_MIN_SEC, Math.min(AUTO_SIM_MAX_SEC, Math.round(sec)));

// ──────────────────────────────────────────────
// Context interface
// ──────────────────────────────────────────────

interface TradingContextType {
  account: AccountState;
  watchlist: string[];
  holdings: Holding[];
  trades: Trade[];
  orders: Order[];
  executions: Execution[];
  stocks: StockData[];
  stockHistory: Record<string, ChartDataPoint[]>;
  tick: number;
  settings: TradingSettings;
  autoSimActive: boolean;
  simulationSpeed: SimulationSpeed;
  toggleSimulation: () => void;
  setSimulationSpeed: (speed: SimulationSpeed) => void;
  notifications: Notification[];
  unreadNotificationCount: number;
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  executeBuy: (symbol: string, quantity: number, currentPrice: number, companyName: string) => { success: boolean; error?: string };
  executeSell: (symbol: string, quantity: number, currentPrice: number, companyName: string) => { success: boolean; error?: string };
  placeOrder: (params: PlaceOrderParams) => PlaceOrderResult;
  cancelOrder: (orderId: string) => { success: boolean; error?: string };
  processPendingOrders: () => { processed: number; executed: number; rejected: number };
  simulateTick: () => void;
  portfolioSnapshots: PortfolioSnapshot[];
  recordPortfolioSnapshot: () => void;
  resetAccount: () => void;
  updateSettings: (patch: Partial<TradingSettings>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  // Day 24: Market event log
  marketEvents: MarketEvent[];
  clearMarketEvents: () => void;
  // Day 24: Replay
  replayState: ReplayState;
  startReplay: (symbol: string) => void;
  pauseReplay: () => void;
  resumeReplay: () => void;
  stopReplay: () => void;
  setReplaySpeed: (speed: ReplaySpeed) => void;
  // Day 25: Trade Journal
  tradeJournal: TradeJournalEntry[];
  addJournalEntry: (entry: Omit<TradeJournalEntry, 'id' | 'createdAt'>) => void;
  updateJournalEntry: (id: string, patch: Partial<Pick<TradeJournalEntry, 'title' | 'content' | 'tags'>>) => void;
  deleteJournalEntry: (id: string) => void;
  getJournalEntriesForTrade: (tradeId: string) => TradeJournalEntry[];
  // Day 25: Strategy labels on trades
  updateTradeStrategy: (tradeId: string, strategy: string) => void;
  // Day 27: Planned order transferred from position-sizing calculator to order form
  plannedOrder: PlannedOrder | null;
  setPlannedOrder: (order: PlannedOrder | null) => void;
  // Day 30: Bracket Order Management
  bracketGroups: BracketGroup[];
  // Day 30.3.2: Expose bracket persistence availability status and recovery issue
  bracketPersistenceStatus: BracketPersistenceStatus;
  placeBracketOrder: (
    side: OrderSide,
    quantity: number,
    entryPrice: number,
    stopLossPrice: number,
    targetPrice: number,
    symbol: string,
    companyName: string
  ) => { success: boolean; bracketGroup?: BracketGroup; entryOrder?: Order; execution?: Execution; error?: string };
  // Day 31: GTT order persistence status
  gttPersistenceStatus: GttPersistenceStatus;
  // Day 32 Phase D: Transaction cost analytics and configuration
  transactionCostAnalytics: TransactionCostAnalytics;
  transactionCostConfig: TransactionCostConfig;
  // Day 32 Phase E: Advanced order modification
  modifyOrder: (params: ModifyOrderParams) => ModifyOrderResult;
}

const TradingContext = createContext<TradingContextType | undefined>(undefined);

// ──────────────────────────────────────────────
// ID generators
// ──────────────────────────────────────────────

const generateOrderId = (): string =>
  'ORD-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

const generateExecutionId = (): string =>
  'EXE-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

const generateTradeId = (): string =>
  'TRD-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

const generateNotificationId = (): string =>
  'NOT-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

// ──────────────────────────────────────────────
// Pure helper functions for state computation
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// State-transition guard
// ──────────────────────────────────────────────

const isValidTransition = (from: OrderStatus, to: OrderStatus): boolean => {
  // No-op / self-transition
  if (from === to) return from === 'PENDING' || from === 'TRIGGERED'
  // From PENDING we can go to TRIGGERED or terminal states
  if (from === 'PENDING') return to === 'TRIGGERED' || to === 'EXECUTED' || to === 'CANCELLED' || to === 'REJECTED'
  // From TRIGGERED we can go to terminal states (NO CANCELLATION allowed per Day 11 fix)
  if (from === 'TRIGGERED') return to === 'EXECUTED' || to === 'REJECTED'
  // From terminal states, no outgoing allowed
  return false
}

// ──────────────────────────────────────────────
// Pure helper: revalidate an order before final execution
// Delegates to the centralized ReservationModel so BUY orders are
// validated against available buying power (cash minus other pending BUY
// reservations) and SELL orders against available holding quantity
// (holdings minus other pending SELL reservations).
// ──────────────────────────────────────────────

interface RevalidateResult {
  valid: boolean
  reason?: string
}

const revalidateExecution = (
  order: Order,
  cashBalance: number,
  holdings: Holding[],
  orders: Order[],
  stocks: StockData[]
): RevalidateResult => {
  return revalidateOrderAtExecution(order, cashBalance, holdings, orders, stocks);
}

// ──────────────────────────────────────────────
// Pure helper: compute account metrics (standardized accounting)
// Imported from BracketOrderEngineHelpers to ensure unified implementation
// and consistent parameter ordering across the engine.
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// Portfolio aggregation helpers (centralized)
// ──────────────────────────────────────────────

export interface EnrichedHolding extends Holding {
  companyName: string;
  currentPrice: number;
  investedValue: number;
  currentValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  sector: string;
}

export interface PortfolioSummary {
  totalInvestedValue: number;
  totalCurrentValue: number;
  totalUnrealizedPnL: number;
  totalUnrealizedPnLPercent: number;
  cashBalance: number;
  totalAccountValue: number;
  dayPnL: number;
  realizedPnL: number;
  combinedPnL: number;
  totalReturnPercent: number;
}

/** Compute enriched holdings (current price, invested value, P&L, etc.) */
export const enrichHoldings = (
  holdings: Holding[],
  stocks: StockData[]
): EnrichedHolding[] => {
  return holdings.map(holding => {
    const stock = stocks.find(s => s.symbol === holding.symbol);
    const currentPrice = stock ? stock.price : holding.averageBuyPrice;
    const investedValue = holding.averageBuyPrice * holding.quantity;
    const currentValue = currentPrice * holding.quantity;
    const unrealizedPnL = currentValue - investedValue;
    const unrealizedPnLPercent = investedValue > 0 ? (unrealizedPnL / investedValue) * 100 : 0;

    return {
      ...holding,
      companyName: stock ? stock.companyName : holding.symbol,
      currentPrice,
      investedValue: Number(investedValue.toFixed(2)),
      currentValue: Number(currentValue.toFixed(2)),
      unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
      unrealizedPnLPercent: Number(unrealizedPnLPercent.toFixed(2)),
      sector: stock ? stock.sector : 'Unknown'
    };
  });
};

/** Aggregate portfolio-level metrics from holdings + account state */
export const aggregatePortfolio = (
  holdings: Holding[],
  stocks: StockData[],
  account: AccountState,
  trades: Trade[]
): PortfolioSummary => {
  const enriched = enrichHoldings(holdings, stocks);

  let totalCostBasis = 0;
  let totalCurrentValue = 0;
  enriched.forEach(h => {
    totalCostBasis += h.investedValue;
    totalCurrentValue += h.currentValue;
  });

  const unrealizedPnL = totalCurrentValue - totalCostBasis;
  const realizedPnL = trades.reduce((sum, t) => sum + (t.realizedPnL ?? 0), 0);
  const totalAccountValue = account.cashBalance + totalCurrentValue;
  const totalReturnPercent = account.startingBalance > 0
    ? ((totalAccountValue - account.startingBalance) / account.startingBalance) * 100
    : 0;

  // Day P&L: today's price change × holdings quantity
  const dayPnL = holdings.reduce((sum, h) => {
    const stock = stocks.find(s => s.symbol === h.symbol);
    return sum + (stock ? stock.change * h.quantity : 0);
  }, 0);

  return {
    totalInvestedValue: totalCostBasis,
    totalCurrentValue,
    totalUnrealizedPnL: unrealizedPnL,
    totalUnrealizedPnLPercent: totalCostBasis > 0 ? (unrealizedPnL / totalCostBasis) * 100 : 0,
    cashBalance: account.cashBalance,
    totalAccountValue,
    dayPnL: Number(dayPnL.toFixed(2)),
    realizedPnL,
    combinedPnL: realizedPnL + unrealizedPnL,
    totalReturnPercent: Number(totalReturnPercent.toFixed(2))
  };
};

// ──────────────────────────────────────────────
// Original helpers (unchanged)
// ──────────────────────────────────────────────

const formatINR = (v: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)

const computeBuyHoldings = (prevHoldings: Holding[], symbol: string, quantity: number, price: number): Holding[] => {
  const existing = prevHoldings.find(h => h.symbol === symbol);
  if (existing) {
    const newQty = existing.quantity + quantity;
    const newAvg = ((existing.averageBuyPrice * existing.quantity) + (price * quantity)) / newQty;
    return prevHoldings.map(h => h.symbol === symbol ? { ...h, quantity: newQty, averageBuyPrice: Number(newAvg.toFixed(2)) } : h);
  }
  return [...prevHoldings, { symbol, quantity, averageBuyPrice: Number(price.toFixed(2)) }];
};

const computeSellHoldings = (prevHoldings: Holding[], symbol: string, quantity: number): Holding[] => {
  const existing = prevHoldings.find(h => h.symbol === symbol);
  if (!existing) return prevHoldings;
  const newQty = existing.quantity - quantity;
  if (newQty <= 0) return prevHoldings.filter(h => h.symbol !== symbol);
  return prevHoldings.map(h => h.symbol === symbol ? { ...h, quantity: newQty } : h);
};

// ──────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────



// ──────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  error?: string;
}



const validateOrder = (
  params: PlaceOrderParams,
  stocks: StockData[],
  cashBalance: number,
  holdings: Holding[],
  existingOrders: Order[]
): ValidationResult => {
  // Validate side
  if (params.side !== 'BUY' && params.side !== 'SELL') {
    return { valid: false, error: 'Invalid order side.' };
  }

  // Validate order type
  if (!['MARKET', 'LIMIT', 'STOP_MARKET', 'STOP_LIMIT', 'TARGET'].includes(params.orderType)) {
    return { valid: false, error: 'Invalid order type.' };
  }

  // Validate stock exists
  const stock = stocks.find(s => s.symbol === params.symbol);
  if (!stock) {
    return { valid: false, error: 'Stock ' + params.symbol + ' not found.' };
  }

  // Validate quantity
  if (!Number.isInteger(params.quantity) || params.quantity <= 0) {
    return { valid: false, error: 'Quantity must be a positive whole number.' };
  }

  // Validate limit price for LIMIT / STOP_LIMIT orders
  if (['LIMIT', 'STOP_LIMIT'].includes(params.orderType)) {
    if (params.limitPrice === undefined || params.limitPrice === null || params.limitPrice <= 0) {
      return { valid: false, error: 'Limit price must be greater than zero.' };
    }
  }

  // Determine effective trigger price if trailingConfig is present
  const effectiveTriggerPrice = params.triggerPrice ?? (
    params.isGTT && params.trailingConfig
      ? (params.side === 'SELL'
        ? (params.trailingConfig.distanceType === 'percent'
          ? Number((params.currentPrice * (1 - params.trailingConfig.distance / 100)).toFixed(2))
          : Number((params.currentPrice - params.trailingConfig.distance).toFixed(2)))
        : (params.trailingConfig.distanceType === 'percent'
          ? Number((params.currentPrice * (1 + params.trailingConfig.distance / 100)).toFixed(2))
          : Number((params.currentPrice + params.trailingConfig.distance).toFixed(2))))
      : undefined
  );

  // Day 31: Trigger price validation (centralized in GttOrderEngine)
  if (['STOP_MARKET', 'STOP_LIMIT', 'TARGET'].includes(params.orderType)) {
    const triggerValidation = validateTriggerPrices(params, effectiveTriggerPrice);
    if (!triggerValidation.valid) {
      return triggerValidation;
    }
  }

  // Day 31: Trigger vs limit consistency for STOP_LIMIT orders
  const consistencyValidation = validateTriggerLimitConsistency(params, effectiveTriggerPrice);
  if (!consistencyValidation.valid) {
    return consistencyValidation;
  }

  // Day 20/31: GTT validation (centralized in GttOrderEngine)
  const gttValidation = validateGttCreation(params);
  if (!gttValidation.valid) {
    return gttValidation;
  }

  // Validate cash for BUY using reservation model
  if (params.side === 'BUY') {
    let reservationPrice = params.currentPrice;
    if (params.orderType === 'LIMIT' || params.orderType === 'STOP_LIMIT') reservationPrice = params.limitPrice!;
    else if (params.orderType === 'STOP_MARKET' || params.orderType === 'TARGET') reservationPrice = effectiveTriggerPrice!;

    const buyValidation = validateBuyOrderReservation(
      params.quantity,
      reservationPrice,
      cashBalance,
      existingOrders,
      stocks
    );
    if (!buyValidation.valid) {
      return { valid: false, error: buyValidation.error };
    }
  }

  // Validate holdings for SELL using reservation model
  if (params.side === 'SELL') {
    const sellValidation = validateSellOrderReservation(
      params.quantity,
      params.symbol,
      holdings,
      existingOrders
    );
    if (!sellValidation.valid) {
      return { valid: false, error: sellValidation.error };
    }
  }

  return { valid: true };
};

// ──────────────────────────────────────────────
// Safe localStorage loader
// ──────────────────────────────────────────────

function safeLoadJSON<T>(
  key: string,
  fallback: T,
  validate?: (parsed: unknown) => parsed is T
): T {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    if (Array.isArray(fallback)) {
      return (Array.isArray(parsed) ? parsed : fallback) as T;
    }
    if (validate && !validate(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

/** Type guards for persisted object stores */
const isAccountState = (v: unknown): v is AccountState =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  typeof (v as Record<string, unknown>).cashBalance === 'number' &&
  typeof (v as Record<string, unknown>).portfolioValue === 'number' &&
  typeof (v as Record<string, unknown>).startingBalance === 'number';

const isTradingSettings = (v: unknown): v is TradingSettings =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  typeof (v as Record<string, unknown>).autoSimEnabled === 'boolean' &&
  typeof (v as Record<string, unknown>).autoSimIntervalSec === 'number' &&
  typeof (v as Record<string, unknown>).showPnlPercent === 'boolean' &&
  typeof (v as Record<string, unknown>).notificationsEnabled === 'boolean';

const isStockHistory = (v: unknown): v is Record<string, ChartDataPoint[]> =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Day 25: Type guard for persisted trade journal entries */
const isTradeJournalEntry = (v: unknown): v is TradeJournalEntry =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  typeof (v as any).id === 'string' && (v as any).id.trim().length > 0 &&
  (typeof (v as any).tradeId === 'string' || (v as any).tradeId === undefined) &&
  typeof (v as any).title === 'string' &&
  typeof (v as any).content === 'string' &&
  Array.isArray((v as any).tags) &&
  (v as any).tags.every((t: unknown) => typeof t === 'string') &&
  typeof (v as any).createdAt === 'number' && Number.isFinite((v as any).createdAt);

// ──────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────

export const TradingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<AccountState>(() =>
    safeLoadJSON('tradelab_account', INITIAL_ACCOUNT_STATE, isAccountState)
  );
  const [watchlist, setWatchlist] = useState<string[]>(() => safeLoadJSON('tradelab_watchlist', []));
  const [holdings, setHoldings] = useState<Holding[]>(() => safeLoadJSON('tradelab_holdings', []));
  const [trades, setTrades] = useState<Trade[]>(() => safeLoadJSON('tradelab_trades', []));

  // Day 30.3: Recover and reconcile bracket groups and child orders on load
  // Day 31: Inspect + reconcile persisted orders (including GTT) on load.
  const orderRecovery = React.useMemo(() => {
    try {
      const rawOrders = typeof localStorage !== 'undefined' ? localStorage.getItem('tradelab_orders') : null;
      const inspection = inspectGttOrdersStorage(rawOrders);
      const rawExecutions = safeLoadJSON<Execution[]>('tradelab_executions', []);
      const reconciliation = reconcileGttOrders(inspection.orders, rawExecutions);
      return {
        orders: reconciliation.orders,
        issuesDetected: reconciliation.issuesDetected,
        allowOrderPersistence: inspection.status === 'missing' || inspection.status === 'valid',
        orderStorageStatus:
          inspection.status === 'invalid_records' ? 'INVALID_RECORDS' as const
            : inspection.status === 'malformed' ? 'MALFORMED' as const
              : 'AVAILABLE' as const,
      };
    } catch {
      return {
        orders: [] as Order[],
        issuesDetected: ['Order storage initialization failed'],
        allowOrderPersistence: false,
        orderStorageStatus: 'MALFORMED' as const,
      };
    }
  }, []);

  // Day 30.3.1: Use inspectBracketStorage to distinguish valid vs protected storage
  const initialReconciliation = React.useMemo(() => {
    try {
      const rawOrders = orderRecovery.orders;
      const rawHoldings = safeLoadJSON<Holding[]>('tradelab_holdings', []);

      const rawBracketStorage =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(BRACKET_STORAGE_KEY)
          : null;

      const storageResult = inspectBracketStorage(rawBracketStorage);

      const reconciliation = reconcileBracketState(
        storageResult.groups,
        rawOrders,
        rawHoldings
      );

      return {
        ...reconciliation,
        allowBracketPersistence:
          storageResult.status === 'missing' ||
          storageResult.status === 'valid',
        recoveryIssue:
          storageResult.status === 'unsupported_version' ||
            storageResult.status === 'malformed' ||
            storageResult.status === 'invalid_envelope'
            ? storageResult.status
            : null,
      };
    } catch {
      return {
        reconciledGroups: [] as BracketGroup[],
        reconciledOrders: orderRecovery.orders,
        issuesDetected: ['Bracket storage initialization failed'],
        allowBracketPersistence: false,
        recoveryIssue: 'invalid_envelope' as const,
      };
    }
  }, [orderRecovery]);

  const [orders, setOrders] = useState<Order[]>(() => orderRecovery.orders);
  const [executions, setExecutions] = useState<Execution[]>(() => safeLoadJSON('tradelab_executions', []));
  const [stocks, setStocks] = useState<StockData[]>(() => safeLoadJSON<StockData[]>('tradelab_stocks', MOCK_STOCKS));
  const [stockHistory, setStockHistory] = useState<Record<string, ChartDataPoint[]>>(() => {
    const raw = safeLoadJSON<Record<string, unknown[]>>('tradelab_stock_history', {}, isStockHistory);
    const initial = generateInitialStockHistory(MOCK_STOCKS);
    if (!raw || Object.keys(raw).length === 0) {
      return initial;
    }
    // Day 24: sanitize persisted history — filter invalid points, dedup, bound
    const sanitized = sanitizeStockHistory(raw);
    // Ensure all baseline stocks have history
    MOCK_STOCKS.forEach(stock => {
      if (!sanitized[stock.symbol] || sanitized[stock.symbol].length < 2) {
        sanitized[stock.symbol] = initial[stock.symbol] || [];
      }
    });
    return sanitized;
  });
  const [tick, setTick] = useState<number>(() =>
    safeLoadJSON<number>('tradelab_tick', 0, isFiniteNumber)
  );
  const [settings, setSettings] = useState<TradingSettings>(() => {
    const saved = safeLoadJSON<TradingSettings>('tradelab_settings', DEFAULT_SETTINGS, isTradingSettings);
    return { ...DEFAULT_SETTINGS, ...saved, autoSimIntervalSec: clampInterval(saved.autoSimIntervalSec ?? DEFAULT_SETTINGS.autoSimIntervalSec) };
  });
  // ── Day 30: Bracket group tracking (restored via reconciliation) ──
  const [bracketGroups, setBracketGroups] = useState<BracketGroup[]>(() => initialReconciliation.reconciledGroups);
  // Day 30.3.1: Persistence guard — prevents overwriting protected storage
  const bracketPersistenceAllowedRef = React.useRef(initialReconciliation.allowBracketPersistence);
  // Day 30.3.2: Persistence status state (reactive for UI consumers)
  const [bracketPersistenceStatus, setBracketPersistenceStatus] = useState<BracketPersistenceStatus>(() => {
    if (initialReconciliation.allowBracketPersistence) return 'AVAILABLE';
    if (initialReconciliation.recoveryIssue === 'unsupported_version') return 'UNSUPPORTED_VERSION';
    if (initialReconciliation.recoveryIssue === 'malformed') return 'MALFORMED';
    return 'INVALID_ENVELOPE';
  });
  // Day 31: GTT order persistence guard — prevents overwriting protected order storage
  const gttPersistenceAllowedRef = React.useRef(orderRecovery.allowOrderPersistence);
  // Day 31: GTT order persistence status state (reactive for UI consumers)
  const [gttPersistenceStatus, setGttPersistenceStatus] = useState<GttPersistenceStatus>(() => orderRecovery.orderStorageStatus);
  const [autoSimActive, setAutoSimActive] = useState(false);

  // ── Portfolio Snapshots (Day 21) ──
  const [portfolioSnapshots, setPortfolioSnapshots] = useState<PortfolioSnapshot[]>(() => {
    const raw = safeLoadJSON<PortfolioSnapshot[]>('tradelab_portfolio_snapshots', []);
    if (!Array.isArray(raw)) return [];
    return raw.filter(s =>
      s &&
      typeof s.id === 'string' &&
      typeof s.timestamp === 'number' &&
      !isNaN(s.timestamp) &&
      typeof s.totalAccountValue === 'number' &&
      !isNaN(s.totalAccountValue)
    );
  });

  // ── Notification state (Day 16) ──
  const [notifications, setNotifications] = useState<Notification[]>(() =>
    safeLoadJSON<Notification[]>('tradelab_notifications', [])
  );

  // ── Day 24: Market event log ──
  const [marketEvents, setMarketEvents] = useState<MarketEvent[]>([]);
  const marketEventsRef = useRef(marketEvents);
  useEffect(() => { marketEventsRef.current = marketEvents; }, [marketEvents]);

  const generateEventId = (): string =>
    'EVT-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

  // Track last tick event timestamp to throttle MARKET_TICK events
  const lastTickEventRef = useRef<number>(0);

  const addMarketEvent = useCallback((type: MarketEventType, message: string, detail?: string) => {
    // Throttle MARKET_TICK events: at most one per 2 seconds
    if (type === 'MARKET_TICK') {
      const now = Date.now();
      if (now - lastTickEventRef.current < 2000) return;
      lastTickEventRef.current = now;
    }

    const event: MarketEvent = {
      id: generateEventId(),
      type,
      message,
      timestamp: Date.now(),
      detail
    };
    setMarketEvents(prev => {
      const next = [event, ...prev];
      return next.length > 100 ? next.slice(0, 100) : next;
    });
  }, []);

  const clearMarketEvents = useCallback(() => {
    setMarketEvents([]);
  }, []);

  // ── Day 24: Replay state ──
  const INITIAL_REPLAY_STATE: ReplayState = {
    active: false,
    paused: false,
    symbol: '',
    snapshotData: [],
    currentIndex: 0,
    speed: 1
  };
  const [replayState, setReplayState] = useState<ReplayState>(INITIAL_REPLAY_STATE);

  // ── Day 27: Planned order transferred from position-sizing calculator ──
  const [plannedOrder, setPlannedOrder] = useState<PlannedOrder | null>(null);
  const replayStateRef = useRef(replayState);
  useEffect(() => { replayStateRef.current = replayState; }, [replayState]);
  const [marketAlertState, setMarketAlertState] = useState<Record<string, boolean>>({});

  // ── Day 25: Trade Journal ──
  // Scoped to the current account: cleared on account reset so notes from one
  // account never leak into another after a reset or switch.
  const [tradeJournal, setTradeJournal] = useState<TradeJournalEntry[]>(() => {
    const raw = safeLoadJSON<unknown[]>('tradelab_trade_journal', []);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(isTradeJournalEntry)
      .map(entry => ({
        ...entry,
        // Day 25.1: migrate ambiguous empty-string trade IDs to undefined so
        // general notes are explicitly represented rather than hidden behind
        // an empty trade ID.
        tradeId: entry.tradeId && entry.tradeId.trim().length > 0 ? entry.tradeId : undefined
      }));
  });

  const generateJournalId = (): string =>
    'JNL-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

  const addJournalEntry = useCallback((entry: Omit<TradeJournalEntry, 'id' | 'createdAt'>) => {
    const newEntry: TradeJournalEntry = {
      ...entry,
      id: generateJournalId(),
      createdAt: Date.now()
    };
    setTradeJournal(prev => [newEntry, ...prev]);
  }, []);

  const updateJournalEntry = useCallback((
    id: string,
    patch: Partial<Pick<TradeJournalEntry, 'title' | 'content' | 'tags'>>
  ) => {
    setTradeJournal(prev => prev.map(e =>
      e.id === id ? { ...e, ...patch } : e
    ));
  }, []);

  const deleteJournalEntry = useCallback((id: string) => {
    setTradeJournal(prev => prev.filter(e => e.id !== id));
  }, []);

  const getJournalEntriesForTrade = useCallback((tradeId: string) => {
    return tradeJournal.filter(e => e.tradeId === tradeId);
  }, [tradeJournal]);

  // Day 25: Update trade strategy label
  const updateTradeStrategy = useCallback((tradeId: string, strategy: string) => {
    setTrades(prev => prev.map(t =>
      t.id === tradeId ? { ...t, strategy: strategy.trim() || undefined } : t
    ));
  }, []);

  // Refs for atomic reads of latest state
  const accountRef = useRef(account);
  const holdingsRef = useRef(holdings);
  const tradesRef = useRef(trades);
  const stocksRef = useRef(stocks);
  const stockHistoryRef = useRef(stockHistory);
  const ordersRef = useRef(orders);
  const notificationsRef = useRef(notifications);
  const marketAlertStateRef = useRef(marketAlertState);
  const isProcessingRef = useRef(false);

  useEffect(() => { accountRef.current = account; }, [account]);
  useEffect(() => { holdingsRef.current = holdings; }, [holdings]);
  useEffect(() => { tradesRef.current = trades; }, [trades]);
  useEffect(() => { stocksRef.current = stocks; }, [stocks]);
  useEffect(() => { stockHistoryRef.current = stockHistory; }, [stockHistory]);
  useEffect(() => { ordersRef.current = orders; }, [orders]);
  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);
  useEffect(() => { marketAlertStateRef.current = marketAlertState; }, [marketAlertState]);
  const bracketGroupsRef = useRef(bracketGroups);
  useEffect(() => { bracketGroupsRef.current = bracketGroups; }, [bracketGroups]);

  // Synchronize market registry with authoritative stocks and history, logging any rejections
  useEffect(() => {
    updateMarketRegistry(stocks, stockHistory);
    const rejections = drainRecentRejections();
    rejections.forEach(r => {
      addMarketEvent('INVALID_DATA_REJECTED', 'Market data point rejected', r.reason);
    });
  }, [stocks, stockHistory, addMarketEvent]);

  // Persist to localStorage
  useEffect(() => { localStorage.setItem('tradelab_account', JSON.stringify(account)); }, [account]);
  useEffect(() => { localStorage.setItem('tradelab_watchlist', JSON.stringify(watchlist)); }, [watchlist]);
  useEffect(() => { localStorage.setItem('tradelab_holdings', JSON.stringify(holdings)); }, [holdings]);
  useEffect(() => { localStorage.setItem('tradelab_trades', JSON.stringify(trades)); }, [trades]);
  // Day 31: Guarded order persistence — skip write when storage contains invalid/malformed data
  useEffect(() => {
    if (!gttPersistenceAllowedRef.current) {
      return;
    }
    try {
      localStorage.setItem('tradelab_orders', JSON.stringify(orders));
    } catch {
      // Safe fallback if storage quota exceeded or unavailable
    }
  }, [orders]);
  useEffect(() => { localStorage.setItem('tradelab_executions', JSON.stringify(executions)); }, [executions]);
  useEffect(() => { localStorage.setItem('tradelab_stocks', JSON.stringify(stocks)); }, [stocks]);
  useEffect(() => { localStorage.setItem('tradelab_stock_history', JSON.stringify(stockHistory)); }, [stockHistory]);
  useEffect(() => { localStorage.setItem('tradelab_tick', JSON.stringify(tick)); }, [tick]);
  useEffect(() => { localStorage.setItem('tradelab_settings', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem('tradelab_notifications', JSON.stringify(notifications)); }, [notifications]);
  useEffect(() => { localStorage.setItem('tradelab_portfolio_snapshots', JSON.stringify(portfolioSnapshots)); }, [portfolioSnapshots]);
  // Day 25: persist trade journal
  useEffect(() => { localStorage.setItem('tradelab_trade_journal', JSON.stringify(tradeJournal)); }, [tradeJournal]);
  // Day 30.3: persist bracket groups
  // Day 30.3.1: Guarded — skip write when storage contains unsupported/malformed data
  useEffect(() => {
    if (!bracketPersistenceAllowedRef.current) {
      return;
    }

    try {
      localStorage.setItem(BRACKET_STORAGE_KEY, serializeBracketGroups(bracketGroups));
    } catch {
      // Safe fallback if storage quota exceeded or unavailable
    }
  }, [bracketGroups]);

  // ── Watchlist ──

  const addToWatchlist = (symbol: string) => {
    if (!watchlist.includes(symbol)) {
      setWatchlist([...watchlist, symbol]);
    }
  };

  const removeFromWatchlist = (symbol: string) => {
    setWatchlist(watchlist.filter(s => s !== symbol));
  };

  // ── Notification helpers (Day 16) ──

  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const addNotification = useCallback((
    type: NotificationType,
    priority: NotificationPriority,
    title: string,
    message: string,
    metadata?: { symbol?: string; orderId?: string; tradeId?: string; route?: string }
  ) => {
    // Suppress MARKET_EVENT when notifications are disabled
    if (type === 'MARKET_EVENT' && !settingsRef.current.notificationsEnabled) {
      return;
    }

    const notification: Notification = {
      id: generateNotificationId(),
      type,
      priority,
      title,
      message,
      timestamp: Date.now(),
      read: false,
      ...metadata
    };

    setNotifications(prev => {
      // Newest first, capped at 100
      const next = [notification, ...prev].slice(0, 100);
      return next;
    });
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // ── Internal order execution (shared by market orders and pending-order processing) ──

  // Day 32 Phase D: Derive active transaction cost config from settings
  const activeTransactionCostConfig: TransactionCostConfig = useMemo(() => ({
    ...DEFAULT_TRANSACTION_COST_CONFIG,
    enabled: settings.transactionCostsEnabled
  }), [settings.transactionCostsEnabled]);

  const executeOrderInternal = useCallback((
    order: Order,
    executionPrice: number,
    executedQuantity?: number
  ): { execution: Execution; trade: Trade; newAccount: AccountState; newHoldings: Holding[]; filledQuantity: number; remainingQuantity: number; charges: Required<TransactionCosts> } => {
    const now = new Date().toISOString();
    const prevHoldings = holdingsRef.current;
    const currentAccount = accountRef.current;

    // Determine the quantity to fill: defaults to full order quantity for backward compatibility.
    const fillQty = executedQuantity ?? order.quantity;
    const effectiveRemaining = getEffectiveRemainingQuantity(order);
    // Clamp fill quantity to effective remaining (safety).
    const clampedFillQty = Math.min(fillQty, effectiveRemaining);

    // Cumulative tracking: this execution adds to any previously filled quantity.
    const prevFilled = getEffectiveFilledQuantity(order);
    const filledQuantity = prevFilled + clampedFillQty;
    const remainingQuantity = Math.max(0, effectiveRemaining - clampedFillQty);

    // Day 32 Phase D: Calculate transaction costs for this fill.
    const costInput: TransactionCostInput = {
      side: order.side,
      quantity: clampedFillQty,
      price: executionPrice
    };
    const charges = calculateTransactionCosts(
      costInput,
      activeTransactionCostConfig,
      order.charges // existing cumulative charges for partial-fill brokerage cap
    );
    const netValue = calculateNetExecutionValue(costInput, charges);

    // Create execution — each execution represents only the quantity filled during this execution.
    const execution: Execution = {
      id: generateExecutionId(),
      orderId: order.id,
      symbol: order.symbol,
      companyName: order.companyName,
      side: order.side,
      quantity: clampedFillQty, // This execution's filled quantity only
      executionPrice: Number(executionPrice.toFixed(2)),
      totalValue: Number((executionPrice * clampedFillQty).toFixed(2)),
      executedAt: now,
      charges
    };

    let newHoldings: Holding[];
    let newCash: number;
    let realizedGain = 0;

    if (order.side === 'BUY') {
      // Day 32 Phase D: Include BUY charges in cost basis via weighted-average buy price.
      // newAvg = ((prevAvg * prevQty) + (price * addedQty) + buyCharges) / (prevQty + addedQty)
      const existingHolding = prevHoldings.find(h => h.symbol === order.symbol);
      const prevAvg = existingHolding ? existingHolding.averageBuyPrice : 0;
      const prevQty = existingHolding ? existingHolding.quantity : 0;
      const newAvgBuyPrice = computeHoldingAverageBuyPriceWithCosts(
        prevAvg, prevQty, clampedFillQty, executionPrice, charges.totalCharges
      );
      const newQty = prevQty + clampedFillQty;
      if (existingHolding) {
        newHoldings = prevHoldings.map(h =>
          h.symbol === order.symbol ? { ...h, quantity: newQty, averageBuyPrice: newAvgBuyPrice } : h
        );
      } else {
        newHoldings = [...prevHoldings, { symbol: order.symbol, quantity: newQty, averageBuyPrice: newAvgBuyPrice }];
      }
      // Deduct gross execution value + total charges from cash.
      newCash = currentAccount.cashBalance - execution.totalValue - charges.totalCharges;
    } else {
      // SELL: Net realized P&L = (grossSaleValue - sellCharges) - costBasis
      const existingHolding = prevHoldings.find(h => h.symbol === order.symbol);
      const costBasis = existingHolding ? existingHolding.averageBuyPrice * clampedFillQty : 0;
      realizedGain = computeRealizedPnLWithCosts(execution.totalValue, charges.totalCharges, costBasis);

      // Reduce holdings only by executed quantity.
      newHoldings = computeSellHoldings(prevHoldings, order.symbol, clampedFillQty);
      // Credit net sale proceeds (gross - charges) to cash.
      newCash = currentAccount.cashBalance + execution.totalValue - charges.totalCharges;
    }

    // Defensive: ensure cash never goes negative (should be caught by validation, but belt-and-suspenders)
    if (newCash < 0) {
      console.warn('[executeOrderInternal] Negative cash detected, clamping to 0', { orderId: order.id, newCash });
      newCash = 0;
    }

    // Compute reserved buy capital from other pending orders (excluding the one being executed)
    const otherOrders = ordersRef.current.filter(o => o.id !== order.id);
    const reservedBuyCapital = computeReservedBuyCapital(otherOrders, stocksRef.current);

    const newAccount = computeAccountMetrics(
      newCash,
      newHoldings,
      stocksRef.current,
      currentAccount.realizedPnL + realizedGain,
      currentAccount.startingBalance,
      reservedBuyCapital
    );

    // Create trade record — one trade per execution, linked to the order and execution.
    const trade: Trade = {
      id: generateTradeId(),
      timestamp: now,
      symbol: order.symbol,
      companyName: order.companyName,
      side: order.side,
      quantity: clampedFillQty,
      executionPrice: Number(executionPrice.toFixed(2)),
      totalValue: execution.totalValue,
      realizedPnL: order.side === 'SELL' ? Number(realizedGain.toFixed(2)) : null,
      orderId: order.id,
      executionId: execution.id,
      orderType: order.type,
      charges,
      netValue
    };

    return { execution, trade, newAccount, newHoldings, filledQuantity, remainingQuantity, charges };
  }, [activeTransactionCostConfig]);

  // ── placeOrder — central order creation ──

  const placeOrder = useCallback((params: PlaceOrderParams): PlaceOrderResult => {
    // Day 31.2: GTT creation protection guard — when persisted order storage
    // cannot be safely loaded (malformed/invalid records), reject new GTT orders
    // before creating or executing them. Without this guard a GTT order would
    // appear successful in memory and silently vanish after reload (data loss),
    // because the guarded persistence effect below skips writing orders.
    if (params.isGTT && !gttPersistenceAllowedRef.current) {
      const errorMsg =
        'GTT orders are temporarily disabled because stored order data could not be safely loaded. Reset the account to re-enable GTT persistence.';
      addNotification(
        'ORDER_REJECTED',
        'WARNING',
        'GTT Orders Disabled',
        errorMsg,
        { symbol: params.symbol, route: '/settings' }
      );
      return { success: false, error: errorMsg };
    }

    const currentStocks = stocksRef.current;
    const currentAccount = accountRef.current;
    const currentHoldings = holdingsRef.current;

    // Validate
    const validation = validateOrder(params, currentStocks, currentAccount.cashBalance, currentHoldings, ordersRef.current);
    if (!validation.valid) {
      // Create a rejected order record for history
      const rejectedOrder: Order = {
        id: generateOrderId(),
        symbol: params.symbol,
        companyName: params.companyName,
        side: params.side,
        type: params.orderType,
        quantity: params.quantity,
        requestedPrice: params.orderType === 'LIMIT' ? (params.limitPrice ?? params.currentPrice) : params.currentPrice,
        executionPrice: null,
        totalValue: null,
        status: 'REJECTED' as OrderStatus,
        createdAt: new Date().toISOString(),
        executedAt: null,
        cancelledAt: null,
        rejectionReason: validation.error ?? 'Order validation failed.'
      };
      setOrders(prev => [rejectedOrder, ...prev]);
      addNotification(
        'ORDER_REJECTED',
        'ERROR',
        'Order Rejected',
        `${params.side} ${params.quantity} ${params.symbol} — ${validation.error ?? 'Order validation failed.'}`,
        { symbol: params.symbol, orderId: rejectedOrder.id, route: '/orders' }
      );
      return { success: false, error: validation.error, order: rejectedOrder };
    }

    const now = new Date().toISOString();
    const requestedPrice = params.orderType === 'LIMIT' ? (params.limitPrice ?? params.currentPrice) : params.currentPrice;

    // Determine initial triggerPrice and trailing reference price
    let triggerPrice = params.triggerPrice;
    let highestPriceSinceCreation: number | undefined = undefined;
    let lowestPriceSinceCreation: number | undefined = undefined;

    if (params.isGTT && params.trailingConfig) {
      const { distance, distanceType } = params.trailingConfig;
      if (params.side === 'SELL') {
        highestPriceSinceCreation = params.currentPrice;
        if (triggerPrice === undefined || triggerPrice <= 0) {
          triggerPrice = distanceType === 'percent'
            ? Number((params.currentPrice * (1 - distance / 100)).toFixed(2))
            : Number((params.currentPrice - distance).toFixed(2));
        }
      } else if (params.side === 'BUY') {
        lowestPriceSinceCreation = params.currentPrice;
        if (triggerPrice === undefined || triggerPrice <= 0) {
          triggerPrice = distanceType === 'percent'
            ? Number((params.currentPrice * (1 + distance / 100)).toFixed(2))
            : Number((params.currentPrice + distance).toFixed(2));
        }
      }
    }

    // Create the order
    const order: Order = {
      id: generateOrderId(),
      symbol: params.symbol,
      companyName: params.companyName,
      side: params.side,
      type: params.orderType,
      quantity: params.quantity,
      requestedPrice,
      triggerPrice,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING' as OrderStatus,
      createdAt: now,
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,

      // Day 20: GTT / conditional order fields
      isGTT: params.isGTT ?? false,
      expiry: params.expiry ?? null,
      trailingConfig: params.trailingConfig ?? undefined,
      highestPriceSinceCreation,
      lowestPriceSinceCreation
    };

    // MARKET order — execute immediately
    if (params.orderType === 'MARKET') {
      const stock = currentStocks.find(s => s.symbol === params.symbol);
      const availableLiquidity = stock
        ? computeAvailableTickLiquidity(stock, params.side, tickRef.current)
        : Infinity;

      const fillQty = Math.min(params.quantity, availableLiquidity);
      if (fillQty > 0) {
        const { executionPrice: rawPrice } = computeSlippage(
          params.currentPrice,
          fillQty,
          params.side,
          availableLiquidity
        );
        const { executionPrice } = applyOrderTypePriceProtection(rawPrice, order, params.currentPrice);

        const result = executeOrderInternal(order, executionPrice, fillQty);

        const isFull = result.remainingQuantity === 0;
        const executedOrder: Order = {
          ...order,
          executionPrice: Number(executionPrice.toFixed(2)),
          totalValue: result.execution.totalValue,
          status: (isFull ? 'EXECUTED' : 'PARTIALLY_FILLED') as OrderStatus,
          executedAt: isFull ? result.execution.executedAt : null,
          filledQuantity: result.filledQuantity,
          remainingQuantity: result.remainingQuantity,
          charges: aggregateOrderCharges(order.charges, result.charges),
          netValue: result.trade.netValue
        };

        // Apply all state updates
        ordersRef.current = [executedOrder, ...ordersRef.current];
        accountRef.current = result.newAccount;
        holdingsRef.current = result.newHoldings;
        setOrders(prev => [executedOrder, ...prev]);
        setExecutions(prev => [result.execution, ...prev]);
        setTrades(prev => [result.trade, ...prev]);
        setHoldings(result.newHoldings);
        setAccount(result.newAccount);

        addNotification(
          'ORDER_EXECUTED',
          'SUCCESS',
          'Order Executed',
          `${order.side} ${fillQty} ${order.symbol} at ${formatINR(executionPrice)}${result.remainingQuantity > 0 ? ` (${result.remainingQuantity} remaining)` : ''}`,
          { symbol: order.symbol, orderId: order.id, tradeId: result.trade.id, route: '/orders' }
        );

        return { success: true, order: executedOrder, execution: result.execution };
      }
    }

    // LIMIT order — check if it can execute immediately
    if (params.orderType === 'LIMIT' && params.limitPrice !== undefined) {
      const canExecuteNow =
        (params.side === 'BUY' && params.currentPrice <= params.limitPrice) ||
        (params.side === 'SELL' && params.currentPrice >= params.limitPrice);

      if (canExecuteNow) {
        const stock = currentStocks.find(s => s.symbol === params.symbol);
        const availableLiquidity = stock
          ? computeAvailableTickLiquidity(stock, params.side, tickRef.current)
          : Infinity;
        const fillQty = Math.min(params.quantity, availableLiquidity);

        if (fillQty > 0) {
          const { executionPrice: rawPrice } = computeSlippage(
            params.currentPrice,
            fillQty,
            params.side,
            availableLiquidity
          );
          const { executionPrice } = applyOrderTypePriceProtection(rawPrice, order, params.currentPrice);

          const result = executeOrderInternal(order, executionPrice, fillQty);

          const isFull = result.remainingQuantity === 0;
          const executedOrder: Order = {
            ...order,
            executionPrice: Number(executionPrice.toFixed(2)),
            totalValue: result.execution.totalValue,
            status: (isFull ? 'EXECUTED' : 'PARTIALLY_FILLED') as OrderStatus,
            executedAt: isFull ? result.execution.executedAt : null,
            filledQuantity: result.filledQuantity,
            remainingQuantity: result.remainingQuantity,
            charges: aggregateOrderCharges(order.charges, result.charges),
            netValue: result.trade.netValue
          };

          ordersRef.current = [executedOrder, ...ordersRef.current];
          accountRef.current = result.newAccount;
          holdingsRef.current = result.newHoldings;
          setOrders(prev => [executedOrder, ...prev]);
          setExecutions(prev => [result.execution, ...prev]);
          setTrades(prev => [result.trade, ...prev]);
          setHoldings(result.newHoldings);
          setAccount(result.newAccount);

          addNotification(
            'ORDER_EXECUTED',
            'SUCCESS',
            'Order Executed',
            `${order.side} ${fillQty} ${order.symbol} at ${formatINR(executionPrice)}${result.remainingQuantity > 0 ? ` (${result.remainingQuantity} remaining)` : ''}`,
            { symbol: order.symbol, orderId: order.id, tradeId: result.trade.id, route: '/orders' }
          );

          return { success: true, order: executedOrder, execution: result.execution };
        }
      }
    }

    // LIMIT order — stays PENDING
    ordersRef.current = [order, ...ordersRef.current];
    setOrders(prev => [order, ...prev]);
    return { success: true, order };

  }, [executeOrderInternal]);

  // ── Day 30: Place bracket order ──

  const placeBracketOrder = useCallback((
    side: OrderSide,
    quantity: number,
    entryPrice: number,
    stopLossPrice: number,
    targetPrice: number,
    symbol: string,
    companyName: string
  ) => {
    // Day 30.3.2: Prevent creating bracket orders when persistence is disabled due to protected storage
    if (!bracketPersistenceAllowedRef.current) {
      const errorMsg = 'Bracket orders are temporarily disabled because stored bracket data could not be safely loaded. Reset the account to enable bracket orders with a clean state.';
      addNotification(
        'ORDER_REJECTED',
        'WARNING',
        'Bracket Order Blocked',
        errorMsg,
        { symbol, route: '/settings' }
      );
      return { success: false, error: errorMsg };
    }

    const currentStocks = stocksRef.current;
    const currentAccount = accountRef.current;
    const currentHoldings = holdingsRef.current;
    const currentOrders = ordersRef.current;

    // 1. Validate bracket order
    const bracketResult = createBracketGroup(
      side, quantity, entryPrice, stopLossPrice, targetPrice,
      symbol, companyName, currentStocks.find(s => s.symbol === symbol)?.price ?? 0,
      currentAccount.cashBalance, currentHoldings, currentOrders, currentStocks
    );

    if (!bracketResult.success || !bracketResult.bracketGroup) {
      // Create rejected entry order for history
      const rejectedOrder: Order = {
        ...bracketResult.entryOrder,
        status: 'REJECTED' as OrderStatus,
        rejectionReason: bracketResult.error ?? 'Order validation failed.'
      };
      setOrders(prev => [rejectedOrder, ...prev]);
      addNotification(
        'ORDER_REJECTED',
        'ERROR',
        'Bracket Order Rejected',
        bracketResult.error ?? 'Order validation failed.',
        { symbol, route: '/stock/' + symbol }
      );
      return { success: false, error: bracketResult.error };
    }

    const { entryOrder, stopLossOrder, targetOrder, bracketGroup } = bracketResult;

    // 2. Add all three orders to state
    setOrders(prev => [entryOrder, stopLossOrder, targetOrder, ...prev]);

    // 3. Check if entry should execute immediately
    // MARKET orders always execute; LIMIT orders execute only when price condition is met
    const marketPrice = currentStocks.find(s => s.symbol === symbol)?.price ?? 0;
    const isMarketOrder = entryOrder.type === 'MARKET';
    const limitConditionMet = isMarketOrder ||
      (entryOrder.side === 'BUY' && marketPrice <= entryOrder.requestedPrice) ||
      (entryOrder.side === 'SELL' && marketPrice >= entryOrder.requestedPrice);

    if (!limitConditionMet) {
      // LIMIT entry not yet satisfied — keep entry PENDING, children stay PENDING
      // Bracket group is stored but remains INACTIVE until entry executes
      const inactiveBracketGroup: BracketGroup = {
        ...bracketGroup,
        status: 'ACTIVE', // bracket group itself is active, entry just pending
      };
      setBracketGroups(prev => [inactiveBracketGroup, ...prev]);
      addNotification(
        'ORDER_TRIGGERED',
        'INFO',
        'Bracket Order Pending',
        `${side} ${quantity} ${symbol} LIMIT bracket placed. Entry will execute when market ${side === 'BUY' ? 'drops to' : 'rises to'} ${formatINR(entryPrice)}.`,
        { symbol, orderId: bracketGroup.id, route: '/stock/' + symbol }
      );
      return {
        success: true,
        bracketGroup: inactiveBracketGroup,
        entryOrder,
      };
    }

    // 4. LIMIT condition met (or MARKET) — execute entry immediately
    // Use the internal executeOrderInternal for direct execution
    const result = executeOrderInternal(entryOrder, entryPrice);

    // 5. Update order to executed
    const executedEntryOrder: Order = {
      ...entryOrder,
      executionPrice: Number(entryPrice.toFixed(2)),
      totalValue: result.execution.totalValue,
      status: 'EXECUTED' as OrderStatus,
      executedAt: result.execution.executedAt,
      charges: aggregateOrderCharges(entryOrder.charges, result.charges),
      netValue: result.trade.netValue
    };

    // 6. Entry executed — activate child exits
    const activationResult = activateChildExits(bracketGroup, [executedEntryOrder, stopLossOrder, targetOrder, ...currentOrders]);

    if (!activationResult.success) {
      // Rollback: cancel all orders
      setOrders(prev => prev.filter(o => o.id !== entryOrder.id && o.id !== stopLossOrder.id && o.id !== targetOrder.id));
      setBracketGroups(prev => prev.filter(bg => bg.id !== bracketGroup.id));
      addNotification(
        'ORDER_REJECTED',
        'ERROR',
        'Bracket Order Failed',
        activationResult.error ?? 'Could not activate exits.',
        { symbol, route: '/stock/' + symbol }
      );
      return { success: false, error: activationResult.error };
    }

    // 7. Update state with executed entry and activated children
    const updatedOrders = activationResult.orders.map(o => {
      if (o.id === bracketGroup.parentOrderId) return executedEntryOrder;
      return o;
    });

    setOrders(updatedOrders);
    setExecutions(prev => [result.execution, ...prev]);
    setTrades(prev => [result.trade, ...prev]);
    setHoldings(result.newHoldings);
    setAccount(result.newAccount);

    // 8. Store bracket group
    setBracketGroups(prev => [bracketGroup, ...prev]);

    // 8. Add notification
    addNotification(
      'ORDER_EXECUTED',
      'SUCCESS',
      'Bracket Order Executed',
      `${side} ${quantity} ${symbol} bracket placed. Stop-loss: ${formatINR(stopLossPrice)}, Target: ${formatINR(targetPrice)}`,
      { symbol, orderId: bracketGroup.id, route: '/stock/' + symbol }
    );

    return {
      success: true,
      bracketGroup,
      entryOrder: executedEntryOrder,
      execution: result.execution,
    };
  }, [executeOrderInternal, addNotification]);

  // ── cancelOrder ──

  const cancelOrder = useCallback((orderId: string): { success: boolean; error?: string } => {
    const currentOrders = ordersRef.current;
    const order = currentOrders.find(o => o.id === orderId);

    if (!order) {
      return { success: false, error: 'Order not found.' };
    }

    // Day 30.3: Check if order is part of an active bracket group
    const matchingBracket = bracketGroupsRef.current.find(bg =>
      bg.status === 'ACTIVE' &&
      (bg.parentOrderId === orderId || bg.stopLossOrderId === orderId || bg.targetOrderId === orderId)
    );

    if (matchingBracket) {
      const cancelRes = cancelEntryAndChildren(matchingBracket, currentOrders);
      ordersRef.current = cancelRes.orders;
      setOrders(cancelRes.orders);
      setBracketGroups(prev => prev.map(bg => bg.id === matchingBracket.id ? cancelRes.bracketGroup : bg));
      addNotification(
        'ORDER_CANCELLED',
        'INFO',
        'Bracket Order Cancelled',
        `${order.side} ${order.quantity} ${order.symbol} (Bracket group disarmed)`,
        { symbol: order.symbol, orderId: order.id, route: '/orders' }
      );
      return { success: true };
    }

    // Day 32: Cancellation policy — partially filled orders may also be cancelled.
    // For GTT orders: PENDING, TRIGGERED, and PARTIALLY_FILLED are all allowed.
    // For non-GTT orders: PENDING and PARTIALLY_FILLED are allowed (Day 11+32 fix).
    // Terminal states are never cancellable.
    const isGTT = order.isGTT ?? false;
    const isTerminal = isTerminalStatus(order.status);
    if (isTerminal) {
      return {
        success: false,
        error: `Invalid cancel. Orders in ${order.status} state cannot be cancelled.`
      };
    }

    let allowed = false;

    if (isGTT) {
      // GTT: PENDING, TRIGGERED, and PARTIALLY_FILLED are allowed
      if (order.status === 'PENDING' || order.status === 'TRIGGERED' || order.status === 'PARTIALLY_FILLED') {
        allowed = true;
      }
    } else {
      // Non-GTT: PENDING and PARTIALLY_FILLED are allowed; TRIGGERED is not
      if (order.status === 'PENDING' || order.status === 'PARTIALLY_FILLED') {
        allowed = true;
      }
    }

    if (!allowed) {
      return {
        success: false,
        error: `Invalid cancel. Orders in ${order.status} state cannot be cancelled.`
      };
    }

    const cancelledOrder: Order = {
      ...order,
      status: 'CANCELLED' as OrderStatus,
      cancelledAt: new Date().toISOString()
    };

    const cancelledOrders = currentOrders.map(o => o.id === orderId ? cancelledOrder : o);
    ordersRef.current = cancelledOrders;
    setOrders(cancelledOrders);
    addNotification(
      'ORDER_CANCELLED',
      'INFO',
      'Order Cancelled',
      `${order.side} ${order.quantity} ${order.symbol}`,
      { symbol: order.symbol, orderId: order.id, route: '/orders' }
    );
    return { success: true };
  }, []);

  // ── Day 32 Phase E: Advanced Order Modification ──

  const modifyOrder = useCallback((params: ModifyOrderParams): ModifyOrderResult => {
    const currentOrders = ordersRef.current;
    const currentStocks = stocksRef.current;
    const currentAccount = accountRef.current;
    const currentHoldings = holdingsRef.current;
    const currentBracketGroups = bracketGroupsRef.current;

    const order = currentOrders.find(o => o.id === params.orderId);
    if (!order) {
      return { success: false, error: 'Order not found.' };
    }

    const validation = validateOrderModification(
      params,
      order,
      currentAccount.cashBalance,
      currentHoldings,
      currentOrders,
      currentStocks,
      currentBracketGroups
    );

    if (!validation.valid) {
      addNotification(
        'ORDER_REJECTED',
        'ERROR',
        'Order Modification Failed',
        validation.error ?? 'Validation failed.',
        { symbol: order.symbol, orderId: order.id, route: '/orders' }
      );
      return { success: false, error: validation.error };
    }

    const nowIso = new Date().toISOString();
    const nowEpoch = Date.now();
    const modifiedOrder = applyOrderModification(order, params, nowIso, nowEpoch);

    const updatedOrders = currentOrders.map(o => (o.id === order.id ? modifiedOrder : o));
    ordersRef.current = updatedOrders;
    setOrders(updatedOrders);

    addNotification(
      'ACCOUNT_EVENT',
      'SUCCESS',
      'Order Modified',
      `${modifiedOrder.side} ${modifiedOrder.symbol} modified: Qty ${modifiedOrder.quantity}, Price ₹${modifiedOrder.requestedPrice}`,
      { symbol: modifiedOrder.symbol, orderId: modifiedOrder.id, route: '/orders' }
    );

    return {
      success: true,
      order: modifiedOrder,
      validationDetails: {
        additionalCapitalRequired: validation.additionalCapitalRequired,
        additionalHoldingsRequired: validation.additionalHoldingsRequired,
        excessCapitalReleased: validation.excessCapitalReleased,
        excessHoldingsReleased: validation.excessHoldingsReleased,
      },
    };
  }, [addNotification]);

  // ── processPendingOrders ──

  const processPendingOrders = useCallback((): { processed: number; executed: number; rejected: number } => {
    // Prevent re-entrant / duplicate processing
    if (isProcessingRef.current) {
      return { processed: 0, executed: 0, rejected: 0 };
    }
    isProcessingRef.current = true;

    const currentOrders = ordersRef.current;
    const currentStocks = stocksRef.current;

    // Collect bracket order IDs to exclude from generic processing.
    // Bracket orders are handled by the bracket OCO evaluation loop in simulateTick.
    const bracketOrderIds = new Set<string>();
    bracketGroupsRef.current.forEach(bg => {
      bracketOrderIds.add(bg.parentOrderId);
      bracketOrderIds.add(bg.stopLossOrderId);
      bracketOrderIds.add(bg.targetOrderId);
    });

    // PENDING, TRIGGERED STOP_LIMIT, and PARTIALLY_FILLED orders are eligible for processing.
    // Bracket orders are excluded — they are managed by the bracket engine.
    // Day 32 Phase E: Sort eligible orders by priority queue timestamp (FIFO with priority resets).
    const evaluatableOrders = sortOrdersByPriority(
      currentOrders.filter(o =>
        !bracketOrderIds.has(o.id) &&
        (o.status === 'PENDING' || (o.status === 'TRIGGERED' && o.type === 'STOP_LIMIT') || o.status === 'PARTIALLY_FILLED')
      )
    );

    if (evaluatableOrders.length === 0) {
      isProcessingRef.current = false;
      return { processed: 0, executed: 0, rejected: 0 };
    }

    let executed = 0;
    let rejected = 0;
    const processedIds = new Set<string>();

    // We need to process one at a time since each execution changes account state
    const updatedOrders = [...currentOrders];
    const newExecutions: Execution[] = [];
    const newTrades: Trade[] = [];

    // Day 32 Phase C: Track consumed tick liquidity per (symbol, side) to ensure
    // multiple orders in the same tick share the finite available tick liquidity pool.
    const consumedTickLiquidity = new Map<string, number>();

    for (const order of evaluatableOrders) {
      // Duplicate execution prevention: skip if already processed in this batch
      if (processedIds.has(order.id)) continue;

      // Check current status in local working array (not just the snapshot)
      const orderIdx = updatedOrders.findIndex(o => o.id === order.id);
      if (orderIdx < 0) continue;
      let currentState = { ...updatedOrders[orderIdx] };
      if (currentState.status !== 'PENDING' && currentState.status !== 'TRIGGERED' && currentState.status !== 'PARTIALLY_FILLED') continue;

      // Day 31.1: Expiry check (centralized in GttOrderEngine)
      if (isGttExpired(currentState)) {
        // Order expired — reject it cleanly
        updatedOrders[orderIdx] = {
          ...currentState,
          status: 'REJECTED' as OrderStatus,
          rejectionReason: 'Order has expired.',
          executedAt: null,
        };
        addNotification(
          'ORDER_REJECTED',
          'ERROR',
          'Order Expired',
          `${currentState.side} ${currentState.quantity} ${currentState.symbol} — order has expired.`,
          { symbol: currentState.symbol, orderId: currentState.id, route: '/orders' }
        );
        processedIds.add(currentState.id);
        rejected++;
        continue;
      }

      const stock = currentStocks.find(s => s.symbol === currentState.symbol);
      if (!stock) continue;
      const currentPrice = stock.price;

      // Day 31.1: Trailing stop update (centralized in GttOrderEngine)
      if (currentState.isGTT && currentState.trailingConfig) {
        const trailing = computeTrailingUpdate(currentState, currentPrice);
        if (trailing.updated) {
          currentState = {
            ...currentState,
            highestPriceSinceCreation: trailing.newHighestPrice ?? currentState.highestPriceSinceCreation,
            lowestPriceSinceCreation: trailing.newLowestPrice ?? currentState.lowestPriceSinceCreation,
            triggerPrice: trailing.newTriggerPrice ?? currentState.triggerPrice,
          };
          updatedOrders[orderIdx] = currentState;
        }
      }

      // Day 31.1: Evaluate trigger conditions (centralized in GttOrderEngine)
      const trigger = evaluateOrderTrigger(currentState, currentPrice);
      if (!trigger.met || !trigger.nextStatus) continue;
      const newStatus = trigger.nextStatus;

      // 2. If it's just transitioning to TRIGGERED (STOP_LIMIT)
      if (newStatus === 'TRIGGERED') {
        // Day 31.1: Record triggeredAt once on the PENDING → TRIGGERED transition.
        // Preserve an existing value if one somehow exists (idempotent).
        updatedOrders[orderIdx] = {
          ...currentState,
          status: 'TRIGGERED',
          triggeredAt: currentState.triggeredAt ?? new Date().toISOString(),
        };
        addNotification(
          'ORDER_TRIGGERED',
          'WARNING',
          'Order Triggered',
          `${currentState.side} ${currentState.quantity} ${currentState.symbol} @ ${formatINR(currentState.triggerPrice ?? currentState.requestedPrice)}`,
          { symbol: currentState.symbol, orderId: currentState.id, route: '/orders' }
        );
        processedIds.add(currentState.id);
        continue;
      }

      // Day 32: Determine executable quantity using resource-aware computation.
      // This supports partial fills: if full fill is not affordable,
      // the maximum affordable quantity is filled and the order remains pending.
      const financialFillQty = currentState.side === 'BUY'
        ? computeExecutableBuyQuantity(currentState, currentPrice, accountRef.current.cashBalance, updatedOrders, currentStocks)
        : computeExecutableSellQuantity(currentState, holdingsRef.current, updatedOrders);

      if (financialFillQty <= 0) {
        // Insufficient funds/holdings — reject the order.
        updatedOrders[orderIdx] = {
          ...currentState,
          status: 'REJECTED' as OrderStatus,
          rejectionReason: 'Insufficient available capital or holdings.'
        };
        addNotification(
          'ORDER_REJECTED',
          'ERROR',
          'Order Rejected',
          `${currentState.side} ${currentState.quantity} ${currentState.symbol} — insufficient available capital or holdings.`,
          { symbol: currentState.symbol, orderId: currentState.id, route: '/orders' }
        );
        processedIds.add(currentState.id);
        rejected++;
        continue;
      }

      // Day 32 Phase C: Constrain by available tick liquidity.
      // Daily traded volume is not the volume available in one simulation tick.
      // Only a fraction (tickLiquidityRatio) of daily volume is executable per tick.
      const liquidityKey = `${currentState.symbol}:${currentState.side}`;
      const totalTickLiquidity = computeAvailableTickLiquidity(stock, currentState.side, tickRef.current);
      const consumed = consumedTickLiquidity.get(liquidityKey) ?? 0;
      const availableLiquidity = Math.max(0, totalTickLiquidity - consumed);
      const liquidityFillQty = computeLiquidityConstrainedQuantity(financialFillQty, availableLiquidity);

      if (liquidityFillQty <= 0) {
        // Tick liquidity temporarily exhausted — leave the order for the next tick.
        // Do not reject — liquidity may return on a subsequent tick.
        continue;
      }

      // Day 32 Phase C: Compute slippage-adjusted execution price.
      // BUY slips upward (higher price), SELL slips downward (lower price).
      const { executionPrice: rawPrice } = computeSlippage(currentPrice, liquidityFillQty, currentState.side, availableLiquidity);
      const { executionPrice } = applyOrderTypePriceProtection(rawPrice, currentState, currentPrice);

      // Re-check buying power at the slippage-adjusted price (BUY only; slippage raises cost).
      let fillQty = liquidityFillQty;
      if (currentState.side === 'BUY') {
        const otherOrders = updatedOrders.filter(o => o.id !== currentState.id);
        const reservedBuyCapital = computeReservedBuyCapital(otherOrders, currentStocks);
        const availableBuyingPower = Math.max(0, accountRef.current.cashBalance - reservedBuyCapital);
        const affordable = Math.floor(availableBuyingPower / executionPrice);
        fillQty = Math.min(fillQty, affordable);
      }

      if (fillQty <= 0) {
        // Slippage-adjusted price temporarily unaffordable — retry next tick.
        continue;
      }

      // Execute the fill quantity at the slippage-adjusted price.
      const result = executeOrderInternal(currentState, executionPrice, fillQty);
      consumedTickLiquidity.set(liquidityKey, consumed + fillQty);

      const { execution, trade, newAccount, newHoldings, filledQuantity, remainingQuantity } = result;

      // Determine new order status.
      const orderStatus = remainingQuantity === 0 ? 'EXECUTED' : 'PARTIALLY_FILLED';

      // Compute cumulative totalValue for the order.
      const prevTotalValue = currentState.totalValue ?? 0;
      const newTotalValue = Number((prevTotalValue + execution.totalValue).toFixed(2));

      // Update the order in the working array.
      updatedOrders[orderIdx] = {
        ...currentState,
        executionPrice: Number(currentPrice.toFixed(2)),
        totalValue: newTotalValue,
        status: orderStatus,
        filledQuantity,
        remainingQuantity,
        executedAt: remainingQuantity === 0 ? execution.executedAt : currentState.executedAt,
        charges: aggregateOrderCharges(currentState.charges, result.charges),
        netValue: Number((( currentState.netValue ?? 0) + (trade.netValue ?? 0)).toFixed(2))
      };

      // Update account/holdings refs for subsequent orders
      accountRef.current = newAccount;
      holdingsRef.current = newHoldings;

      newExecutions.push(execution);
      newTrades.push(trade);

      // Apply state immediately so next order in loop sees updated state
      setHoldings(newHoldings);
      setAccount(newAccount);

      addNotification(
        'ORDER_EXECUTED',
        'SUCCESS',
        'Order Executed',
        `${currentState.side} ${fillQty} ${currentState.symbol} at ${formatINR(currentPrice)}${remainingQuantity > 0 ? ` (${remainingQuantity} remaining)` : ''}`,
        { symbol: currentState.symbol, orderId: currentState.id, tradeId: trade.id, route: '/orders' }
      );

      processedIds.add(currentState.id);
      executed++;
    }

    // Apply order/execution/trade state
    ordersRef.current = updatedOrders;
    setOrders(updatedOrders);
    if (newExecutions.length > 0) {
      setExecutions(prev => [...newExecutions.reverse(), ...prev]);
    }
    if (newTrades.length > 0) {
      setTrades(prev => [...newTrades.reverse(), ...prev]);
    }

    isProcessingRef.current = false;
    return { processed: executed + rejected, executed, rejected };
  }, [executeOrderInternal]);

  // ── Legacy executeBuy / executeSell — backward compatible wrappers ──

  const executeBuy = useCallback((symbol: string, quantity: number, currentPrice: number, companyName: string) => {
    const result = placeOrder({
      symbol,
      companyName,
      side: 'BUY',
      orderType: 'MARKET',
      quantity,
      currentPrice
    });
    return { success: result.success, error: result.error };
  }, [placeOrder]);

  const executeSell = useCallback((symbol: string, quantity: number, currentPrice: number, companyName: string) => {
    const result = placeOrder({
      symbol,
      companyName,
      side: 'SELL',
      orderType: 'MARKET',
      quantity,
      currentPrice
    });
    return { success: result.success, error: result.error };
  }, [placeOrder]);

  // ── Reset (Day 15 fix: fully reset ALL persisted state) ──

  const resetAccount = useCallback(() => {
    // Reset all React state to initial values
    accountRef.current = INITIAL_ACCOUNT_STATE;
    holdingsRef.current = [];
    ordersRef.current = [];
    bracketGroupsRef.current = [];
    setAccount(INITIAL_ACCOUNT_STATE);
    setWatchlist([]);
    setHoldings([]);
    setTrades([]);
    setOrders([]);
    setExecutions([]);
    setStocks(MOCK_STOCKS);
    const initialHistory = generateInitialStockHistory(MOCK_STOCKS);
    setStockHistory(initialHistory);
    updateMarketRegistry(MOCK_STOCKS, initialHistory);
    setTick(0);
    // Reset snapshot-dedup ref so the next tick records a fresh snapshot
    // (otherwise a stale positive tick id could suppress the first new one)
    lastSnapshotTickRef.current = -1;

    // Clear notifications and snapshots first, then add reset notification
    setNotifications([]);
    setPortfolioSnapshots([]);

    // Day 24: Clear replay and events on reset
    setReplayState(INITIAL_REPLAY_STATE);
    setMarketEvents([]);
    // Day 25: Clear trade journal on reset (scoped to account)
    setTradeJournal([]);
    // Day 30.3.1: Release bracket persistence guard on intentional reset
    bracketPersistenceAllowedRef.current = true;
    // Day 30.3.2: Reset bracket persistence status to AVAILABLE
    setBracketPersistenceStatus('AVAILABLE');
    // Day 31: Release GTT order persistence guard on intentional reset
    gttPersistenceAllowedRef.current = true;
    setGttPersistenceStatus('AVAILABLE');
    // Day 30.3: Clear bracket groups on reset
    setBracketGroups([]);

    // Clear ALL persisted keys so a page refresh doesn't restore stale data
    localStorage.removeItem('tradelab_account');
    localStorage.removeItem('tradelab_watchlist');
    localStorage.removeItem('tradelab_holdings');
    localStorage.removeItem('tradelab_trades');
    localStorage.removeItem('tradelab_orders');
    localStorage.removeItem('tradelab_executions');
    localStorage.removeItem('tradelab_stocks');
    localStorage.removeItem('tradelab_stock_history');
    localStorage.removeItem('tradelab_tick');
    localStorage.removeItem('tradelab_notifications');
    localStorage.removeItem('tradelab_portfolio_snapshots');
    // Day 25: Clear trade journal so previous account's notes cannot leak into
    // a fresh account after reset or switch.
    localStorage.removeItem('tradelab_trade_journal');
    // Day 30.3: Clear bracket groups from storage
    localStorage.removeItem(BRACKET_STORAGE_KEY);
    // Note: tradelab_settings is intentionally preserved across resets

    // Day 27: Clear any planned order transferred from the position-sizing calculator
    setPlannedOrder(null);

    // Add reset notification AFTER clearing — this survives because
    // React batches the setNotifications([]) and this addNotification
    // but addNotification uses functional updater, so it appends to []
    addNotification(
      'ACCOUNT_EVENT',
      'INFO',
      'Account Reset',
      'Your paper trading account has been reset to its initial state.',
      { route: '/settings' }
    );

    // Reset market alert state
    setMarketAlertState({});
  }, [addNotification]);

  // ── Update settings ──

  const updateSettings = useCallback((patch: Partial<TradingSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      if (patch.autoSimIntervalSec !== undefined) {
        next.autoSimIntervalSec = clampInterval(patch.autoSimIntervalSec);
      }
      return next;
    });
  }, []);

  // ── Simulation controls (Day 23 + Day 24 event logging) ──

  const simulationSpeed: SimulationSpeed = React.useMemo(() => {
    const sec = settings.autoSimIntervalSec;
    if (sec <= 1) return '5x';
    if (sec <= 2) return '2x';
    if (sec <= 5) return '1x';
    return '0.5x';
  }, [settings.autoSimIntervalSec]);

  const toggleSimulation = useCallback(() => {
    setSettings(prev => {
      const nextEnabled = !prev.autoSimEnabled;
      // Log event after toggling
      addMarketEvent(
        nextEnabled ? 'SIM_STARTED' : 'SIM_PAUSED',
        nextEnabled ? 'Market simulation started' : 'Market simulation paused'
      );
      return { ...prev, autoSimEnabled: nextEnabled };
    });
  }, [addMarketEvent]);

  const setSimulationSpeed = useCallback((speed: SimulationSpeed) => {
    const preset = SIMULATION_SPEED_PRESETS.find(p => p.speed === speed);
    if (preset) {
      setSettings(prev => ({ ...prev, autoSimIntervalSec: preset.intervalSec }));
      addMarketEvent('SIM_SPEED_CHANGED', `Simulation speed changed to ${speed}`);
    }
  }, [addMarketEvent]);

  // ── Day 24: Replay control methods ──

  const startReplay = useCallback((symbol: string) => {
    // Get snapshot of current history (deep copy for isolation)
    const history = stockHistoryRef.current[symbol];
    if (!history || history.length < 2) {
      addMarketEvent('INVALID_DATA_REJECTED', `Cannot start replay for ${symbol}: insufficient history (${history?.length ?? 0} points)`);
      return;
    }

    const snapshot = history.map(pt => ({ ...pt }));
    setReplayState(prev => ({
      active: true,
      paused: false,
      symbol,
      snapshotData: snapshot,
      currentIndex: 0,
      speed: prev.speed || 1
    }));
    addMarketEvent('REPLAY_STARTED', `Historical replay started for ${symbol}`, `${snapshot.length} data points`);
  }, [addMarketEvent]);

  const pauseReplay = useCallback(() => {
    setReplayState(prev => {
      if (!prev.active || prev.paused) return prev;
      addMarketEvent('REPLAY_PAUSED', `Replay paused for ${prev.symbol}`);
      return { ...prev, paused: true };
    });
  }, [addMarketEvent]);

  const resumeReplay = useCallback(() => {
    setReplayState(prev => {
      if (!prev.active || !prev.paused) return prev;
      addMarketEvent('REPLAY_RESUMED', `Replay resumed for ${prev.symbol}`);
      return { ...prev, paused: false };
    });
  }, [addMarketEvent]);

  const stopReplay = useCallback(() => {
    setReplayState(prev => {
      if (!prev.active) return prev;
      addMarketEvent('REPLAY_STOPPED', `Replay stopped for ${prev.symbol}`);
      return { ...prev, active: false, paused: false, currentIndex: 0 };
    });
  }, [addMarketEvent]);

  const setReplaySpeed = useCallback((speed: ReplaySpeed) => {
    setReplayState(prev => ({ ...prev, speed }));
  }, []);

  // Day 24: Replay timer effect — clean lifecycle, automatic speed adjustment and cleanup
  useEffect(() => {
    if (!replayState.active || replayState.paused) {
      return;
    }

    const baseInterval = 500; // ms per data point at 1x
    const intervalMs = Math.max(50, Math.round(baseInterval / replayState.speed));

    const timerId = window.setInterval(() => {
      setReplayState(prev => {
        if (!prev.active || prev.paused) return prev;

        const nextIndex = prev.currentIndex + 1;
        if (nextIndex >= prev.snapshotData.length) {
          addMarketEvent('REPLAY_COMPLETED', `Replay completed for ${prev.symbol}`);
          return {
            ...prev,
            active: false,
            paused: false,
            currentIndex: prev.snapshotData.length - 1
          };
        }

        return { ...prev, currentIndex: nextIndex };
      });
    }, intervalMs);

    return () => {
      window.clearInterval(timerId);
    };
  }, [replayState.active, replayState.paused, replayState.speed, addMarketEvent]);

  // ── Portfolio Snapshot Recording (Day 21) ──

  const lastSnapshotTickRef = useRef<number>(-1);

  const recordPortfolioSnapshot = useCallback((overrideStocks?: StockData[], tickNum?: number) => {
    const activeStocks = overrideStocks ?? stocksRef.current;
    const summary = aggregatePortfolio(
      holdingsRef.current,
      activeStocks,
      accountRef.current,
      tradesRef.current
    );

    const now = Date.now();
    const snapshot: PortfolioSnapshot = {
      id: `SNP-${now}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      timestamp: now,
      totalAccountValue: summary.totalAccountValue,
      totalCurrentValue: summary.totalCurrentValue,
      totalInvestedValue: summary.totalInvestedValue,
      totalUnrealizedPnL: summary.totalUnrealizedPnL,
      realizedPnL: summary.realizedPnL,
      totalReturnPercent: summary.totalReturnPercent
    };

    setPortfolioSnapshots(prev => {
      // Guard against duplicate recording for the exact same tick or same millisecond
      if (tickNum !== undefined && tickNum === lastSnapshotTickRef.current) {
        return prev;
      }
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        if (now === last.timestamp && last.totalAccountValue === snapshot.totalAccountValue) {
          return prev;
        }
      }
      if (tickNum !== undefined) {
        lastSnapshotTickRef.current = tickNum;
      }
      const updated = [...prev, snapshot];
      return updated.length > 100 ? updated.slice(-100) : updated;
    });
  }, []);

  // ── Simulate market update ──

  const tickRef = useRef(tick);
  useEffect(() => { tickRef.current = tick; }, [tick]);

  const simulateTick = useCallback(() => {
    const nextTick = tickRef.current + 1;
    tickRef.current = nextTick;
    setTick(nextTick);

    // Compute updated stock prices deterministically
    const updatedStocks = simulateMarketUpdate(stocksRef.current, nextTick);
    stocksRef.current = updatedStocks;
    setStocks(updatedStocks);

    // Recalculate account metrics against updated prices (BUG 03 fix:
    // stale account metrics during market simulation ticks — Dashboard vs
    // Portfolio mismatch when prices move but account state isn't refreshed).
    const reservedBuyCapital = computeReservedBuyCapital(ordersRef.current, updatedStocks);
    const refreshedAccount = computeAccountMetrics(
      accountRef.current.cashBalance,
      holdingsRef.current,
      updatedStocks,
      accountRef.current.realizedPnL,
      accountRef.current.startingBalance,
      reservedBuyCapital
    );
    if (
      refreshedAccount.investedValue !== accountRef.current.investedValue ||
      refreshedAccount.portfolioValue !== accountRef.current.portfolioValue ||
      refreshedAccount.unrealizedPnL !== accountRef.current.unrealizedPnL
    ) {
      setAccount(refreshedAccount);
      accountRef.current = refreshedAccount;
    }

    // Append bounded tick to stock history (max 100 points)
    const updatedHistory = appendStockTickHistory(stockHistoryRef.current, updatedStocks, 100);
    stockHistoryRef.current = updatedHistory;
    setStockHistory(updatedHistory);

    // Keep registry immediately synchronized
    updateMarketRegistry(updatedStocks, updatedHistory);

    // Market alert: notify when a stock crosses the ±5% threshold
    const alertUpdates: Record<string, boolean> = {};
    updatedStocks.forEach(stock => {
      const nowAbove = Math.abs(stock.changePercent) >= 5;
      const wasAbove = marketAlertStateRef.current[stock.symbol] ?? false;
      if (nowAbove && !wasAbove) {
        const direction = stock.changePercent >= 0 ? 'up' : 'down';
        addNotification(
          'MARKET_EVENT',
          'WARNING',
          'Market Alert',
          `${stock.symbol} is ${direction} ${Math.abs(stock.changePercent).toFixed(1)}% today.`,
          { symbol: stock.symbol, route: `/stock/${stock.symbol}` }
        );
      }
      alertUpdates[stock.symbol] = nowAbove;
    });
    setMarketAlertState(prev => ({ ...prev, ...alertUpdates }));

    // Record portfolio snapshot reflecting the newly updated prices (Day 21)
    recordPortfolioSnapshot(updatedStocks, nextTick);

    // Process pending orders and GTT triggers against the new prices
    processPendingOrdersRef.current();

    // ── Day 30: Evaluate OCO triggers for bracket orders ──
    // After pending orders are processed, evaluate any active bracket OCO legs
    bracketGroupsRef.current.forEach(bg => {
      if (bg.status !== 'ACTIVE') return;

      // Check if entry is executed and children are triggered
      const parent = ordersRef.current.find(o => o.id === bg.parentOrderId);
      const slChild = ordersRef.current.find(o => o.id === bg.stopLossOrderId);
      const tgtChild = ordersRef.current.find(o => o.id === bg.targetOrderId);
      if (!parent || !slChild || !tgtChild) return;

      // Get current price for this bracket's symbol
      const stockPrice = updatedStocks.find(s => s.symbol === bg.symbol)?.price;
      if (!stockPrice || stockPrice <= 0) return;

      // ── Day 30.4: Handle pending LIMIT bracket entries ──
      // If the entry order is still PENDING (LIMIT not yet met), check the condition
      if (parent.status === 'PENDING' && parent.type === 'LIMIT') {
        const limitConditionMet =
          (parent.side === 'BUY' && stockPrice <= parent.requestedPrice) ||
          (parent.side === 'SELL' && stockPrice >= parent.requestedPrice);

        if (!limitConditionMet) return;

        // LIMIT condition met — execute the entry order
        const entryResult = executeOrderInternal(parent, stockPrice);

        // Update parent order to EXECUTED
        const executedParent: Order = {
          ...parent,
          executionPrice: Number(stockPrice.toFixed(2)),
          totalValue: entryResult.execution.totalValue,
          status: 'EXECUTED' as OrderStatus,
          executedAt: entryResult.execution.executedAt,
          charges: aggregateOrderCharges(parent.charges, entryResult.charges),
          netValue: entryResult.trade.netValue
        };

        // Activate child exits
        const activation = activateChildExits(bg, [executedParent, slChild, tgtChild, ...ordersRef.current]);
        if (!activation.success) {
          console.warn('[simulateTick] Bracket entry activation failed:', activation.error);
          return;
        }

        // Apply entry execution state
        const updatedOrdersList = ordersRef.current.map(o => {
          if (o.id === parent.id) return executedParent;
          if (o.id === bg.stopLossOrderId || o.id === bg.targetOrderId) {
            const activated = activation.orders.find(a => a.id === o.id);
            return activated ?? o;
          }
          return o;
        });
        ordersRef.current = updatedOrdersList;
        setOrders(updatedOrdersList);

        setExecutions(prev => [entryResult.execution, ...prev]);
        setTrades(prev => [entryResult.trade, ...prev]);
        setHoldings(entryResult.newHoldings);
        holdingsRef.current = entryResult.newHoldings;
        setAccount(entryResult.newAccount);
        accountRef.current = entryResult.newAccount;

        addNotification(
          'ORDER_EXECUTED',
          'SUCCESS',
          'Bracket Entry Executed',
          `${bg.side} ${bg.originalQuantity} ${bg.symbol} LIMIT bracket entry executed at ${formatINR(stockPrice)}.`,
          { symbol: bg.symbol, orderId: bg.id, route: `/stock/${bg.symbol}` }
        );

        // Now continue to OCO evaluation with the newly executed parent
        // (fall through to the OCO check below)
        return; // OCO evaluation will happen on the next tick
      }

      // Entry not yet executed — skip OCO evaluation
      if (parent.status !== 'EXECUTED') return;
      if (slChild.status !== 'TRIGGERED' && tgtChild.status !== 'TRIGGERED') return;

      // Evaluate which leg triggers
      const triggerResult = evaluateOCOTriggers(bg, stockPrice);
      if (triggerResult === 'NONE') return;

      // Determine which leg wins (use tie-breaker for simultaneous triggers)
      const winningLeg = triggerResult === 'BOTH' ? OCO_TIE_BREAKER : triggerResult;

      // Execute the winning leg using executeOCO
      const currentOrders = ordersRef.current;
      const executionResult = executeOCO(
        bg,
        currentOrders,
        holdingsRef.current,
        tradesRef.current,
        updatedStocks,
        accountRef.current,
        stockPrice,
        winningLeg, // force specific leg for BOTH case (tie-breaker)
        settingsRef.current.transactionCostsEnabled !== false ? DEFAULT_TRANSACTION_COST_CONFIG : undefined
      );

      if (!executionResult.success) {
        console.warn('[simulateTick] OCO execution failed:', executionResult.error);
        // Cleanly disarm bracket if underlying position was closed outside the bracket
        const currentHoldings = holdingsRef.current;
        const holding = currentHoldings.find(h => h.symbol === bg.symbol);
        if (bg.side === 'BUY' && (!holding || holding.quantity <= 0)) {
          const cancelRes = cancelEntryAndChildren(bg, ordersRef.current);
          setOrders(cancelRes.orders);
          setBracketGroups(prev => prev.map(b => b.id === bg.id ? cancelRes.bracketGroup : b));
        }
        return;
      }

      // Apply OCO execution results
      setOrders(prev => prev.map(o => {
        if (o.id === executionResult.executedOrder.id) return executionResult.executedOrder;
        if (o.id === executionResult.cancelledOrder.id) return executionResult.cancelledOrder;
        return o;
      }));
      setExecutions(prev => [executionResult.execution, ...prev]);
      setTrades(prev => [executionResult.trade, ...prev]);
      setHoldings(executionResult.newHoldings);
      setAccount(executionResult.newAccount);

      // Update bracket group
      setBracketGroups(prev =>
        prev.map(b => b.id === bg.id ? executionResult.updatedBracketGroup : b)
      );

      // If bracket is completed, we can optionally remove it or keep it as COMPLETED
      if (executionResult.updatedBracketGroup.status === 'COMPLETED') {
        // Keep it for history, or remove after some time
      }

      // Add notification
      addNotification(
        'ORDER_EXECUTED',
        'SUCCESS',
        'OCO Executed',
        `${bg.side} bracket OCO executed: ${executionResult.executedLeg}. ${executionResult.realizedPnL >= 0 ? '+' : ''}${formatINR(executionResult.realizedPnL)} P&L.`,
        { symbol: bg.symbol, orderId: bg.id, route: `/stock/${bg.symbol}` }
      );
    });

    // Day 24: Log market tick event (throttled by addMarketEvent)
    addMarketEvent('MARKET_TICK', `Tick #${nextTick} processed`);
  }, [addNotification, recordPortfolioSnapshot, addMarketEvent]);

  // ── Auto-simulation interval (Day 15 & Day 23) ──

  const simulateTickRef = useRef(simulateTick);
  useEffect(() => { simulateTickRef.current = simulateTick; }, [simulateTick]);
  const processPendingOrdersRef = useRef(processPendingOrders);
  useEffect(() => { processPendingOrdersRef.current = processPendingOrders; }, [processPendingOrders]);

  useEffect(() => {
    if (!settings.autoSimEnabled) {
      setAutoSimActive(false);
      return;
    }
    setAutoSimActive(true);
    const intervalMs = settings.autoSimIntervalSec * 1000;
    const id = window.setInterval(() => {
      simulateTickRef.current();
    }, intervalMs);
    return () => {
      window.clearInterval(id);
      setAutoSimActive(false);
    };
  }, [settings.autoSimEnabled, settings.autoSimIntervalSec]);

  const unreadNotificationCount = notifications.filter(n => !n.read).length;

  // Day 32 Phase D: Memoize transaction cost analytics from recorded trades
  const transactionCostAnalytics = useMemo(
    () => calculateTransactionCostAnalytics(trades),
    [trades]
  );

  return (
    <TradingContext.Provider value={{
      account,
      watchlist,
      holdings,
      trades,
      orders,
      executions,
      stocks,
      stockHistory,
      tick,
      settings,
      autoSimActive,
      simulationSpeed,
      toggleSimulation,
      setSimulationSpeed,
      notifications,
      unreadNotificationCount,
      addToWatchlist,
      removeFromWatchlist,
      executeBuy,
      executeSell,
      placeOrder,
      cancelOrder,
      processPendingOrders,
      simulateTick,
      portfolioSnapshots,
      recordPortfolioSnapshot,
      resetAccount,
      updateSettings,
      markNotificationRead,
      markAllNotificationsRead,
      clearNotifications,
      marketEvents,
      clearMarketEvents,
      replayState,
      startReplay,
      pauseReplay,
      resumeReplay,
      stopReplay,
      setReplaySpeed,
      // Day 25: Trade Journal
      tradeJournal,
      addJournalEntry,
      updateJournalEntry,
      deleteJournalEntry,
      getJournalEntriesForTrade,
      // Day 25: Strategy labels
      updateTradeStrategy,
      // Day 27: Planned order transferred from position-sizing calculator
      plannedOrder,
      setPlannedOrder,
      // Day 30: Bracket orders
      bracketGroups,
      bracketPersistenceStatus,
      placeBracketOrder,
      // Day 31: GTT persistence status
      gttPersistenceStatus,
      // Day 32 Phase D: Transaction cost analytics and config
      transactionCostAnalytics,
      transactionCostConfig: activeTransactionCostConfig,
      // Day 32 Phase E: Advanced order modification
      modifyOrder
    }}>
      {children}
    </TradingContext.Provider>
  );
};

export const useTrading = () => {
  const context = useContext(TradingContext);
  if (context === undefined) {
    throw new Error('useTrading must be used within a TradingProvider');
  }
  return context;
};