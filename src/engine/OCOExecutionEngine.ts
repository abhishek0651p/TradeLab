/* ── Day 30: OCO Execution Engine ──────────────────────────────────────────────────
Pure, deterministic One-Cancels-the-Other execution logic for bracket order exits.
Never mutates React state. Returns execution results for the caller to apply.
──────────────────────────────────────────────────────────────────────────────────── */

import {
  Order,
  OrderStatus,
  OrderSide,
  OrderType,
  StockData,
  Holding,
  Trade,
  Execution,
  AccountState,
  OCOExecutionResult,
  BracketGroup,
} from '../types';
import { computeBuyHoldings, computeSellHoldings, computeAccountMetrics } from './BracketOrderEngineHelpers';
import { revalidateOrderAtExecution } from './ReservationModel';

/** Terminal order statuses. */
const TERMINAL_STATUSES: readonly OrderStatus[] = ['EXECUTED', 'CANCELLED', 'REJECTED'];

const isTerminalStatus = (status: OrderStatus): boolean => TERMINAL_STATUSES.includes(status);

/** Tie-breaking rule for simultaneous OCO triggers.
 *  Deterministic rule: STOP_LOSS wins over TARGET when both trigger on the same tick.
 *  This prevents both legs from executing against the same shares.
 */
export const OCO_TIE_BREAKER: 'STOP_LOSS' | 'TARGET' = 'STOP_LOSS';

/**
 * OCO Execution result with all state changes needed.
 */
export interface OCOExecutionStateChange {
  success: boolean;
  error?: string;
  executedLeg: 'STOP_LOSS' | 'TARGET';
  cancelledLeg: 'STOP_LOSS' | 'TARGET';
  executedOrder: Order;
  cancelledOrder: Order;
  execution: Execution;
  trade: Trade;
  newHoldings: Holding[];
  newAccount: AccountState;
  updatedBracketGroup: BracketGroup;
  remainingQuantity: number;
  realizedPnL: number;
}

/**
 * Evaluate which OCO leg(s) trigger at the current price.
 * Returns 'STOP_LOSS', 'TARGET', 'BOTH', or 'NONE'.
 */
export const evaluateOCOTriggers = (
  bracketGroup: BracketGroup,
  currentPrice: number
): 'STOP_LOSS' | 'TARGET' | 'BOTH' | 'NONE' => {
  const { side, stopLossPrice, targetPrice } = bracketGroup;

  let slTriggered = false;
  let targetTriggered = false;

  if (side === 'BUY') {
    // BUY position: SL triggers when price drops to/below stopLoss, target triggers when price rises to/above target
    slTriggered = currentPrice <= stopLossPrice;
    targetTriggered = currentPrice >= targetPrice;
  } else {
    // SELL position: SL triggers when price rises to/above stopLoss, target triggers when price drops to/below target
    slTriggered = currentPrice >= stopLossPrice;
    targetTriggered = currentPrice <= targetPrice;
  }

  if (slTriggered && targetTriggered) return 'BOTH';
  if (slTriggered) return 'STOP_LOSS';
  if (targetTriggered) return 'TARGET';
  return 'NONE';
};

/**
 * Execute the winning OCO leg and cancel the competing leg.
 * This is an ATOMIC operation: only one leg can win.
 *
 * @param bracketGroup - The active bracket group
 * @param orders - All current orders (for finding child orders)
 * @param holdings - Current holdings
 * @param trades - Current trades
 * @param stocks - Current stock data
 * @param account - Current account state
 * @param executionPrice - Price at which the winning leg executes
 * @param forcedLeg - Optional: force a specific leg to win (used for tie-breaking)
 * @returns State changes to apply, or error
 */
export const executeOCO = (
  bracketGroup: BracketGroup,
  orders: Order[],
  holdings: Holding[],
  _trades: Trade[],
  stocks: StockData[],
  account: AccountState,
  executionPrice: number,
  forcedLeg?: 'STOP_LOSS' | 'TARGET'
): OCOExecutionStateChange => {
  const now = new Date().toISOString();
  const side = bracketGroup.side;

  // Find child orders
  const slOrder = orders.find(o => o.id === bracketGroup.stopLossOrderId);
  const targetOrder = orders.find(o => o.id === bracketGroup.targetOrderId);

  if (!slOrder || !targetOrder) {
    return {
      success: false,
      error: 'Child orders not found.',
      executedLeg: 'STOP_LOSS',
      cancelledLeg: 'TARGET',
      executedOrder: {} as Order,
      cancelledOrder: {} as Order,
      execution: {} as Execution,
      trade: {} as Trade,
      newHoldings: holdings,
      newAccount: account,
      updatedBracketGroup: bracketGroup,
      remainingQuantity: bracketGroup.remainingQuantity,
      realizedPnL: 0,
    };
  }

  // Check if both children are already terminal
  if (isTerminalStatus(slOrder.status) && isTerminalStatus(targetOrder.status)) {
    return {
      success: false,
      error: 'Both OCO legs are already terminal.',
      executedLeg: 'STOP_LOSS',
      cancelledLeg: 'TARGET',
      executedOrder: slOrder,
      cancelledOrder: targetOrder,
      execution: {} as Execution,
      trade: {} as Trade,
      newHoldings: holdings,
      newAccount: account,
      updatedBracketGroup: bracketGroup,
      remainingQuantity: bracketGroup.remainingQuantity,
      realizedPnL: 0,
    };
  }

  // Determine which leg wins
  let winningLeg: 'STOP_LOSS' | 'TARGET';
  let losingLeg: 'STOP_LOSS' | 'TARGET';
  let winningOrder: Order;
  let losingOrder: Order;

  if (forcedLeg) {
    // Explicit tie-breaker or forced execution
    winningLeg = forcedLeg;
    losingLeg = forcedLeg === 'STOP_LOSS' ? 'TARGET' : 'STOP_LOSS';
    winningOrder = forcedLeg === 'STOP_LOSS' ? slOrder : targetOrder;
    losingOrder = forcedLeg === 'STOP_LOSS' ? targetOrder : slOrder;
  } else {
    // Check which leg is actually eligible (not already terminal)
    const slEligible = !isTerminalStatus(slOrder.status);
    const targetEligible = !isTerminalStatus(targetOrder.status);

    if (slEligible && !targetEligible) {
      winningLeg = 'STOP_LOSS';
      losingLeg = 'TARGET';
      winningOrder = slOrder;
      losingOrder = targetOrder;
    } else if (!slEligible && targetEligible) {
      winningLeg = 'TARGET';
      losingLeg = 'STOP_LOSS';
      winningOrder = targetOrder;
      losingOrder = slOrder;
    } else if (slEligible && targetEligible) {
      // Both eligible — this shouldn't happen in normal flow (evaluateOCOTriggers should have picked one)
      // But as safety, apply tie-breaker
      winningLeg = OCO_TIE_BREAKER;
      losingLeg = OCO_TIE_BREAKER === 'STOP_LOSS' ? 'TARGET' : 'STOP_LOSS';
      winningOrder = winningLeg === 'STOP_LOSS' ? slOrder : targetOrder;
      losingOrder = losingLeg === 'STOP_LOSS' ? slOrder : targetOrder;
    } else {
      return {
        success: false,
        error: 'Both OCO legs are already terminal.',
        executedLeg: 'STOP_LOSS',
        cancelledLeg: 'TARGET',
        executedOrder: slOrder,
        cancelledOrder: targetOrder,
        execution: {} as Execution,
        trade: {} as Trade,
        newHoldings: holdings,
        newAccount: account,
        updatedBracketGroup: bracketGroup,
        remainingQuantity: bracketGroup.remainingQuantity,
        realizedPnL: 0,
      };
    }
  }

  // Revalidate the winning order before execution
  const revalidation = revalidateOrderAtExecution(
    winningOrder,
    account.cashBalance,
    holdings,
    orders,
    stocks
  );

  if (!revalidation.valid) {
    return {
      success: false,
      error: revalidation.reason ?? 'Order validation failed at execution.',
      executedLeg: winningLeg,
      cancelledLeg: losingLeg,
      executedOrder: winningOrder,
      cancelledOrder: losingOrder,
      execution: {} as Execution,
      trade: {} as Trade,
      newHoldings: holdings,
      newAccount: account,
      updatedBracketGroup: bracketGroup,
      remainingQuantity: bracketGroup.remainingQuantity,
      realizedPnL: 0,
    };
  }

  // Execute the winning leg
  const execution: Execution = {
    id: generateExecutionId(),
    orderId: winningOrder.id,
    symbol: winningOrder.symbol,
    companyName: winningOrder.companyName,
    side: winningOrder.side,
    quantity: winningOrder.quantity,
    executionPrice: Number(executionPrice.toFixed(2)),
    totalValue: Number((executionPrice * winningOrder.quantity).toFixed(2)),
    executedAt: now,
  };

  // Compute realized P&L
  const executedQty = winningOrder.quantity;
  let realizedGain = 0;

  if (winningOrder.side === 'SELL') {
    // Closing a long position (BUY bracket)
    const existingHolding = holdings.find(h => h.symbol === winningOrder.symbol);
    if (existingHolding) {
      const costBasis = existingHolding.averageBuyPrice * executedQty;
      realizedGain = execution.totalValue - costBasis;
    }
  } else {
    // BUY leg: closing a short position (SELL bracket)
    // Short was opened at bracketGroup.entryPrice, closed at executionPrice.
    // P&L = entry proceeds - exit cost = (entryPrice - executionPrice) * qty
    const entryProceeds = bracketGroup.entryPrice * executedQty;
    realizedGain = entryProceeds - execution.totalValue;
  }

  // Update holdings
  let newHoldings: Holding[];
  if (winningOrder.side === 'BUY') {
    newHoldings = computeBuyHoldings(holdings, winningOrder.symbol, executedQty, executionPrice);
  } else {
    newHoldings = computeSellHoldings(holdings, winningOrder.symbol, executedQty);
  }

  // Update cash
  const newCash = winningOrder.side === 'BUY'
    ? account.cashBalance - execution.totalValue
    : account.cashBalance + execution.totalValue;

  // Update reserved buy capital (excluding the winning order since it's executed)
  const otherOrders = orders.filter(o => o.id !== winningOrder.id);
  const reservedBuyCapital = otherOrders.reduce((sum, o) => {
    if (o.side === 'BUY' && o.status === 'PENDING') {
      const stock = stocks.find(s => s.symbol === o.symbol);
      if (!stock) return sum;
      const price = o.type === 'LIMIT' ? o.requestedPrice : o.triggerPrice ?? stock.price;
      return sum + price * o.quantity;
    }
    return sum;
  }, 0);

  const newAccount = computeAccountMetrics(
    newCash,
    newHoldings,
    stocks,
    account.realizedPnL + realizedGain,
    account.startingBalance,
    reservedBuyCapital
  );

  // Create trade record
  const trade: Trade = {
    id: generateTradeId(),
    timestamp: now,
    symbol: winningOrder.symbol,
    companyName: winningOrder.companyName,
    side: winningOrder.side,
    quantity: executedQty,
    executionPrice: Number(executionPrice.toFixed(2)),
    totalValue: execution.totalValue,
    realizedPnL: Number(realizedGain.toFixed(2)),
    orderId: winningOrder.id,
    executionId: execution.id,
    orderType: winningOrder.type,
  };

  // Update winning order to EXECUTED
  const executedWinningOrder: Order = {
    ...winningOrder,
    executionPrice: Number(executionPrice.toFixed(2)),
    totalValue: execution.totalValue,
    status: 'EXECUTED' as OrderStatus,
    executedAt: now,
  };

  // Update losing order to CANCELLED
  const cancelledLosingOrder: Order = {
    ...losingOrder,
    status: 'CANCELLED' as OrderStatus,
    cancelledAt: now,
  };

  // Calculate remaining quantity after this execution
  const remainingQuantity = Math.max(0, bracketGroup.remainingQuantity - executedQty);

  // Update bracket group
  const updatedBracketGroup: BracketGroup = {
    ...bracketGroup,
    remainingQuantity,
    status: remainingQuantity === 0 ? 'COMPLETED' : 'ACTIVE',
    updatedAt: Date.now(),
  };

  return {
    success: true,
    executedLeg: winningLeg,
    cancelledLeg: losingLeg,
    executedOrder: executedWinningOrder,
    cancelledOrder: cancelledLosingOrder,
    execution,
    trade,
    newHoldings,
    newAccount,
    updatedBracketGroup,
    remainingQuantity,
    realizedPnL: Number(realizedGain.toFixed(2)),
  };
};

/**
 * Handle partial exit: only part of the position quantity is exited.
 * The remaining shares keep their OCO protection with reduced quantity.
 *
 * @param bracketGroup - The active bracket group
 * @param orders - All current orders
 * @param executedQuantity - Quantity that was actually executed
 * @returns Updated orders and bracket group
 */
export const handlePartialExit = (
  bracketGroup: BracketGroup,
  orders: Order[],
  executedQuantity: number
): { orders: Order[]; bracketGroup: BracketGroup } => {
  if (executedQuantity >= bracketGroup.remainingQuantity) {
    // Full exit - both legs become terminal (one EXECUTED, one CANCELLED)
    // The full exit case is handled by executeOCO
    return { orders, bracketGroup };
  }

  // Reduce remaining quantity
  const newRemainingQuantity = bracketGroup.remainingQuantity - executedQuantity;

  // Update the losing (still-active) child order quantity to match remaining
  // The winning leg already executed and is terminal
  const now = new Date().toISOString();
  const updatedOrders = orders.map(o => {
    if (o.id === bracketGroup.stopLossOrderId || o.id === bracketGroup.targetOrderId) {
      if (!isTerminalStatus(o.status)) {
        return { ...o, quantity: newRemainingQuantity };
      }
    }
    return o;
  });

  const updatedBracketGroup: BracketGroup = {
    ...bracketGroup,
    remainingQuantity: newRemainingQuantity,
    updatedAt: Date.now(),
  };

  return { orders: updatedOrders, bracketGroup: updatedBracketGroup };
};

/**
 * Check if a bracket group should be marked COMPLETED (remaining quantity = 0).
 */
export const isBracketCompleted = (bracketGroup: BracketGroup): boolean =>
  bracketGroup.remainingQuantity <= 0;

/**
 * Cancel all remaining OCO legs when position is fully closed.
 */
export const cancelAllOCOChildren = (
  bracketGroup: BracketGroup,
  orders: Order[]
): Order[] => {
  const now = new Date().toISOString();
  return orders.map(o => {
    if (
      o.id === bracketGroup.stopLossOrderId ||
      o.id === bracketGroup.targetOrderId
    ) {
      if (!isTerminalStatus(o.status)) {
        return { ...o, status: 'CANCELLED' as OrderStatus, cancelledAt: now };
      }
    }
    return o;
  });
};

/**
 * ID generator for OCO execution engine.
 */
const generateExecutionId = (): string =>
  'EXE-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

const generateTradeId = (): string =>
  'TRD-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();