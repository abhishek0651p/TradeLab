/* ── Day 30: Native Bracket Order Engine ───────────────────────────────────────────
Pure, deterministic bracket order engine for native bracket orders and OCO execution.
Never mutates React state. Returns descriptions of state changes for the caller to apply.
──────────────────────────────────────────────────────────────────────────────────── */

import {
  Order,
  OrderSide,
  OrderStatus,
  OrderType,
  BracketGroup,
  BracketOrderResult,
  OCOExecutionResult,
  Execution,
  Trade,
  AccountState,
  StockData,
  Holding,
} from '../types';

export type { BracketGroup };
import {
  computeBuyHoldings,
  computeSellHoldings,
  generateOrderId,
  generateExecutionId,
  generateTradeId,
  generateNotificationId,
} from './BracketOrderEngineHelpers';
import { revalidateOrderAtExecution } from './ReservationModel';

/** Terminal order statuses — reservations must be released for these. */
const TERMINAL_STATUSES: readonly OrderStatus[] = ['EXECUTED', 'CANCELLED', 'REJECTED'];

const isTerminalStatus = (status: OrderStatus): boolean => TERMINAL_STATUSES.includes(status);

/** Validate that a price is positive and finite. */
export const validateBracketPrice = (price: number): boolean =>
  Number.isFinite(price) && price > 0;

/** Validate that quantity is a positive whole number. */
export const validateBracketQuantity = (quantity: number): boolean =>
  Number.isInteger(quantity) && quantity > 0;

/** Validate stop-loss price direction rules per side. */
export const validateStopLossDirection = (
  entryPrice: number,
  stopLossPrice: number,
  side: OrderSide
): { valid: boolean; error?: string } => {
  if (side === 'BUY') {
    return stopLossPrice < entryPrice
      ? { valid: true }
      : { valid: false, error: 'For a BUY bracket, stop-loss price must be lower than entry price.' };
  } else {
    return stopLossPrice > entryPrice
      ? { valid: true }
      : { valid: false, error: 'For a SELL bracket, stop-loss price must be higher than entry price.' };
  }
};

/** Validate target price direction rules per side. */
export const validateTargetDirection = (
  entryPrice: number,
  targetPrice: number,
  side: OrderSide
): { valid: boolean; error?: string } => {
  if (side === 'BUY') {
    return targetPrice > entryPrice
      ? { valid: true }
      : { valid: false, error: 'For a BUY bracket, target price must be higher than entry price.' };
  } else {
    return targetPrice < entryPrice
      ? { valid: true }
      : { valid: false, error: 'For a SELL bracket, target price must be lower than entry price.' };
  }
};

/** Risk-per-share computation. */
export const computeRiskPerShare = (
  entryPrice: number,
  stopLossPrice: number,
  side: OrderSide
): number => {
  if (entryPrice <= 0 || stopLossPrice <= 0) return 0;
  if (side === 'BUY') {
    return stopLossPrice < entryPrice ? Number((entryPrice - stopLossPrice).toFixed(2)) : 0;
  } else {
    return stopLossPrice > entryPrice ? Number((stopLossPrice - entryPrice).toFixed(2)) : 0;
  }
};

/** Reward-per-share computation. */
export const computeRewardPerShare = (
  entryPrice: number,
  targetPrice: number,
  side: OrderSide
): number => {
  if (entryPrice <= 0 || targetPrice <= 0) return 0;
  if (side === 'BUY') {
    return targetPrice > entryPrice ? Number((targetPrice - entryPrice).toFixed(2)) : 0;
  } else {
    return targetPrice < entryPrice ? Number((entryPrice - targetPrice).toFixed(2)) : 0;
  }
};

/** Risk-to-reward ratio (reward / risk). */
export const computeRiskRewardRatio = (
  riskPerShare: number,
  rewardPerShare: number
): number => {
  if (riskPerShare <= 0 || rewardPerShare <= 0) return 0;
  return Number((rewardPerShare / riskPerShare).toFixed(2));
};

/** Full bracket validation result. */
export interface BracketValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  riskSummary?: {
    riskPerShare: number;
    rewardPerShare: number;
    riskRewardRatio: number;
    maxLoss: number;
    maxProfit: number;
  };
}

/**
 * Validate a bracket order proposal before creating any orders.
 * Checks: valid side, positive prices/quantity, stop-loss direction, target direction,
 *         risk/reward ratio, exit quantity not exceeding remaining quantity.
 */
export const validateBracketOrder = (
  side: OrderSide,
  quantity: number,
  entryPrice: number,
  stopLossPrice: number,
  targetPrice: number,
  cashBalance: number,
  holdings: Holding[],
  existingOrders: Order[],
  stocks: StockData[],
  symbol: string
): BracketValidation => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Valid side
  if (side !== 'BUY' && side !== 'SELL') {
    errors.push('Invalid order side. Must be BUY or SELL.');
  }

  // 2. Positive entry price
  if (!validateBracketPrice(entryPrice)) {
    errors.push('Entry price must be a positive, finite number.');
  }

  // 3. Positive quantity
  if (!validateBracketQuantity(quantity)) {
    errors.push('Quantity must be a positive whole number.');
  }

  // 4. Positive stop-loss price
  if (!validateBracketPrice(stopLossPrice)) {
    errors.push('Stop-loss price must be a positive, finite number.');
  }

  // 5. Positive target price
  if (!validateBracketPrice(targetPrice)) {
    errors.push('Target price must be a positive, finite number.');
  }

  // 6. Stop-loss direction (only if prices are valid enough to compare)
  if (validateBracketPrice(entryPrice) && validateBracketPrice(stopLossPrice)) {
    const sl = validateStopLossDirection(entryPrice, stopLossPrice, side);
    if (!sl.valid) errors.push(sl.error!);
  }

  // 7. Target direction
  if (validateBracketPrice(entryPrice) && validateBracketPrice(targetPrice)) {
    const tgt = validateTargetDirection(entryPrice, targetPrice, side);
    if (!tgt.valid) errors.push(tgt.error!);
  }

  // 8. Risk/reward ratio
  const riskPerShare = computeRiskPerShare(entryPrice, stopLossPrice, side);
  const rewardPerShare = computeRewardPerShare(entryPrice, targetPrice, side);
  const riskRewardRatio = computeRiskRewardRatio(riskPerShare, rewardPerShare);

  if (riskPerShare <= 0) {
    errors.push('Stop-loss must create positive risk (risk per share must be > 0).');
  }
  if (rewardPerShare <= 0) {
    errors.push('Target must create positive reward (reward per share must be > 0).');
  }
  if (riskRewardRatio <= 0) {
    errors.push('Risk-to-reward ratio must be positive.');
  }

  // 9. Exit quantity cannot exceed remaining position quantity (only meaningful if we hold)
  if (side === 'SELL') {
    const holding = holdings.find(h => h.symbol === symbol);
    const totalHoldingQty = holding ? holding.quantity : 0;
    const reservedSellQty = existingOrders.reduce(
      (sum, o) => (o.side === 'SELL' && !isTerminalStatus(o.status) && o.symbol === symbol ? sum + o.quantity : sum),
      0
    );
    const availableQty = Math.max(0, totalHoldingQty - reservedSellQty);
    if (quantity > availableQty) {
      errors.push(`Exit quantity ${quantity} exceeds available position quantity ${availableQty} for ${symbol}.`);
    }
  }

  // 10. Buying power for BUY entries
  if (side === 'BUY') {
    const requiredReservation = Number((entryPrice * quantity).toFixed(2));
    const reservedBuyCapital = existingOrders.reduce((sum, o) => {
      if (o.side === 'BUY' && !isTerminalStatus(o.status)) {
        const stock = stocks.find(s => s.symbol === o.symbol);
        if (!stock) return sum;
        const price = o.type === 'LIMIT' ? o.requestedPrice : o.triggerPrice ?? stock.price;
        return sum + price * o.quantity;
      }
      return sum;
    }, 0);
    const availableBuyingPower = Math.max(0, cashBalance - reservedBuyCapital);
    if (requiredReservation > availableBuyingPower) {
      errors.push(
        `Insufficient available buying power. Required: ₹${requiredReservation.toLocaleString('en-IN')} but available: ₹${availableBuyingPower.toLocaleString('en-IN')}.`
      );
    }
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    riskSummary: valid
      ? {
          riskPerShare,
          rewardPerShare,
          riskRewardRatio,
          maxLoss: Number((riskPerShare * quantity).toFixed(2)),
          maxProfit: Number((rewardPerShare * quantity).toFixed(2)),
        }
      : undefined,
  };
};

/**
 * Result of creating a bracket group: describes all orders to create plus the group metadata.
 */
export interface CreateBracketResult extends BracketOrderResult {
  entryOrder: Order;
  stopLossOrder: Order;
  targetOrder: Order;
}

/**
 * Create a bracket group definition with parent entry order + two child exit orders.
 * Does not execute anything — returns plain data structures for the caller to persist.
 *
 * Entry order type: MARKET if entryPrice === currentPrice, otherwise LIMIT at entryPrice.
 * Child orders: STOP_MARKET (stop-loss) and TARGET (target), both on the opposite side,
 *   created in PENDING state (inactive until entry executes).
 */
export const createBracketGroup = (
  side: OrderSide,
  quantity: number,
  entryPrice: number,
  stopLossPrice: number,
  targetPrice: number,
  symbol: string,
  companyName: string,
  currentPrice: number,
  cashBalance: number,
  holdings: Holding[],
  existingOrders: Order[],
  stocks: StockData[]
): CreateBracketResult => {
  const now = new Date().toISOString();
  const nowTimestamp = Date.now();
  const idPrefix = 'BRK-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const bracketId = idPrefix;
  const ocoGroupId = idPrefix;
  const positionId = 'POS-' + symbol + '-' + Date.now();

  // Validate first
  const validation = validateBracketOrder(
    side, quantity, entryPrice, stopLossPrice, targetPrice,
    cashBalance, holdings, existingOrders, stocks, symbol
  );
  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors.join('; '),
      entryOrder: {} as Order,
      stopLossOrder: {} as Order,
      targetOrder: {} as Order,
      bracketGroup: {} as BracketGroup,
    };
  }

  const oppositeSide: OrderSide = side === 'BUY' ? 'SELL' : 'BUY';

  // Entry order type: MARKET when entry equals current price, else LIMIT
  const entryType: OrderType = entryPrice === currentPrice ? 'MARKET' : 'LIMIT';
  const entryRequestedPrice = entryType === 'LIMIT' ? entryPrice : currentPrice;

  const entryOrder: Order = {
    id: 'ORD-' + idPrefix + '-ENTRY',
    symbol,
    companyName,
    side,
    type: entryType,
    quantity,
    requestedPrice: entryRequestedPrice,
    triggerPrice: entryType === 'LIMIT' ? entryPrice : undefined,
    executionPrice: null,
    totalValue: null,
    status: 'PENDING',
    createdAt: now,
    executedAt: null,
    cancelledAt: null,
    rejectionReason: null,
    isGTT: false,
    expiry: null,
  };

  // Stop-loss child order (STOP_MARKET, opposite side)
  const stopLossOrder: Order = {
    id: 'ORD-' + idPrefix + '-SL',
    symbol,
    companyName,
    side: oppositeSide,
    type: 'STOP_MARKET',
    quantity,
    requestedPrice: stopLossPrice,
    triggerPrice: stopLossPrice,
    executionPrice: null,
    totalValue: null,
    status: 'PENDING', // will be activated after entry execution
    createdAt: now,
    executedAt: null,
    cancelledAt: null,
    rejectionReason: null,
    isGTT: false,
    expiry: null,
  };

  // Target child order (TARGET, opposite side)
  const targetOrder: Order = {
    id: 'ORD-' + idPrefix + '-TARGET',
    symbol,
    companyName,
    side: oppositeSide,
    type: 'TARGET',
    quantity,
    requestedPrice: targetPrice,
    triggerPrice: targetPrice,
    executionPrice: null,
    totalValue: null,
    status: 'PENDING', // will be activated after entry execution
    createdAt: now,
    executedAt: null,
    cancelledAt: null,
    rejectionReason: null,
    isGTT: false,
    expiry: null,
  };

  const bracketGroup: BracketGroup = {
    id: bracketId,
    parentOrderId: entryOrder.id,
    stopLossOrderId: stopLossOrder.id,
    targetOrderId: targetOrder.id,
    positionId,
    ocoGroupId,
    symbol,
    side,
    entryPrice,
    stopLossPrice,
    targetPrice,
    originalQuantity: quantity,
    remainingQuantity: quantity,
    status: 'ACTIVE',
    createdAt: nowTimestamp,
    updatedAt: nowTimestamp,
  };

  return {
    success: true,
    entryOrder,
    stopLossOrder,
    targetOrder,
    bracketGroup,
  };
};

/**
 * Activate child exit orders after the parent entry order has executed.
 * Changes child status from PENDING → TRIGGERED (ready to be evaluated on ticks).
 * Returns updated orders and bracket group, or an error if entry is not executed.
 */
export const activateChildExits = (
  bracketGroup: BracketGroup,
  orders: Order[]
): { success: boolean; error?: string; orders: Order[]; bracketGroup: BracketGroup } => {
  const entryOrder = orders.find(o => o.id === bracketGroup.parentOrderId);
  if (!entryOrder) {
    return { success: false, error: 'Parent entry order not found.', orders, bracketGroup };
  }
  if (entryOrder.status !== 'EXECUTED') {
    return {
      success: false,
      error: 'Cannot activate exits: parent entry order is not executed.',
      orders,
      bracketGroup,
    };
  }

  const now = new Date().toISOString();
  const updatedOrders = orders.map(o => {
    if (o.id === bracketGroup.stopLossOrderId || o.id === bracketGroup.targetOrderId) {
      return { ...o, status: 'TRIGGERED' as OrderStatus };
    }
    return o;
  });

  const updatedGroup: BracketGroup = {
    ...bracketGroup,
    status: 'ACTIVE',
    updatedAt: Date.now(),
  };

  return { success: true, orders: updatedOrders, bracketGroup: updatedGroup };
};

/**
 * Handle entry cancellation or rejection: cancel all child orders to prevent orphans.
 */
export const cancelEntryAndChildren = (
  bracketGroup: BracketGroup,
  orders: Order[]
): { success: boolean; orders: Order[]; bracketGroup: BracketGroup } => {
  const now = new Date().toISOString();
  const updatedOrders = orders.map(o => {
    if (
      o.id === bracketGroup.parentOrderId ||
      o.id === bracketGroup.stopLossOrderId ||
      o.id === bracketGroup.targetOrderId
    ) {
      if (!isTerminalStatus(o.status)) {
        return { ...o, status: 'CANCELLED' as OrderStatus, cancelledAt: now };
      }
    }
    return o;
  });

  const updatedGroup: BracketGroup = {
    ...bracketGroup,
    status: 'CANCELLED',
    updatedAt: Date.now(),
  };

  return { success: true, orders: updatedOrders, bracketGroup: updatedGroup };
};

/**
 * Handle entry rejection (same as cancellation — release all reservations).
 */
export const rejectEntryAndChildren = (
  bracketGroup: BracketGroup,
  orders: Order[]
): { success: boolean; orders: Order[]; bracketGroup: BracketGroup } => {
  const now = new Date().toISOString();
  const updatedOrders = orders.map(o => {
    if (
      o.id === bracketGroup.parentOrderId ||
      o.id === bracketGroup.stopLossOrderId ||
      o.id === bracketGroup.targetOrderId
    ) {
      if (!isTerminalStatus(o.status)) {
        return { ...o, status: 'REJECTED' as OrderStatus, cancelledAt: now };
      }
    }
    return o;
  });

  const updatedGroup: BracketGroup = {
    ...bracketGroup,
    status: 'CANCELLED',
    updatedAt: Date.now(),
  };

  return { success: true, orders: updatedOrders, bracketGroup: updatedGroup };
};

/**
 * Check if any child orders are orphaned (parent is terminal but children are not).
 */
export const findOrphanedChildren = (
  bracketGroup: BracketGroup,
  orders: Order[]
): Order[] => {
  const parent = orders.find(o => o.id === bracketGroup.parentOrderId);
  if (!parent || isTerminalStatus(parent.status)) {
    const childrenIds = [bracketGroup.stopLossOrderId, bracketGroup.targetOrderId];
    return orders
      .filter(o => childrenIds.includes(o.id) && !isTerminalStatus(o.status));
  }
  return [];
};

/**
 * Get the remaining protected quantity for a bracket group.
 */
export const getRemainingQuantity = (bracketGroup: BracketGroup): number =>
  bracketGroup.remainingQuantity;