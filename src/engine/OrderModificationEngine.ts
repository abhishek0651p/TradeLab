/* ── Day 32: Phase E — Order Modification & Execution Lifecycle Engine ─────────────
 * Pure, deterministic functions for validating and applying order modifications.
 * Manages order revision tracking, partial-fill constraints, reservation recalculation,
 * and FIFO execution queue priority resets.
 *
 * Never mutates React state.
 * ──────────────────────────────────────────────────────────────────────────────────── */

import {
  Order,
  OrderStatus,
  OrderSide,
  StockData,
  Holding,
  BracketGroup,
  ModifyOrderParams,
  ModifyOrderResult,
  OrderModificationRecord,
} from '../types';
import {
  getEffectiveRemainingQuantity,
  getEffectiveFilledQuantity,
  computeReservedBuyCapital,
  computeReservedSellQuantity,
  computeAvailableBuyingPower,
  computeAvailableSellQuantity,
  getReservationPrice,
} from './ReservationModel';

// ── Ineligible & Terminal Statuses ──────────────────────────────────────────

const TERMINAL_STATUSES: readonly OrderStatus[] = ['EXECUTED', 'CANCELLED', 'REJECTED'];

/**
 * Check whether an order is eligible for modification.
 * Rules:
 * 1. Terminal orders (EXECUTED, CANCELLED, REJECTED) are strictly ineligible.
 * 2. TRIGGERED orders are ineligible (transitioned past pending evaluation).
 * 3. Orders managed by an active bracket group are ineligible for generic modification
 *    to prevent desynchronizing parent-child OCO exit quantities.
 * 4. Only PENDING and PARTIALLY_FILLED orders are eligible.
 */
export const isOrderEligibleForModification = (
  order: Order,
  bracketGroups?: BracketGroup[]
): { eligible: boolean; reason?: string } => {
  if (TERMINAL_STATUSES.includes(order.status)) {
    return {
      eligible: false,
      reason: `Order in ${order.status} state cannot be modified.`,
    };
  }

  if (order.status === 'TRIGGERED') {
    return {
      eligible: false,
      reason: 'Order has already triggered and cannot be modified.',
    };
  }

  if (order.status !== 'PENDING' && order.status !== 'PARTIALLY_FILLED') {
    return {
      eligible: false,
      reason: `Order status ${order.status} does not permit modification.`,
    };
  }

  // Check if order belongs to an active bracket group
  if (bracketGroups && bracketGroups.length > 0) {
    const isBracketOrder = bracketGroups.some(
      bg =>
        bg.status === 'ACTIVE' &&
        (bg.parentOrderId === order.id ||
          bg.stopLossOrderId === order.id ||
          bg.targetOrderId === order.id)
    );
    if (isBracketOrder) {
      return {
        eligible: false,
        reason:
          'Bracket-managed orders cannot be modified directly. Cancel the bracket group to replace it.',
      };
    }
  }

  return { eligible: true };
};

// ── Validation Result Model ─────────────────────────────────────────────────

export interface OrderModificationValidationResult {
  valid: boolean;
  error?: string;
  additionalCapitalRequired?: number;
  additionalHoldingsRequired?: number;
  excessCapitalReleased?: number;
  excessHoldingsReleased?: number;
}

/**
 * Validate an order modification request against resource constraints and lifecycle rules.
 * Pure, deterministic calculation.
 */
export const validateOrderModification = (
  params: ModifyOrderParams,
  order: Order,
  cashBalance: number,
  holdings: Holding[],
  allOrders: Order[],
  stocks: StockData[],
  bracketGroups?: BracketGroup[]
): OrderModificationValidationResult => {
  // 1. Eligibility Check
  const eligibility = isOrderEligibleForModification(order, bracketGroups);
  if (!eligibility.eligible) {
    return { valid: false, error: eligibility.reason };
  }

  // 2. Optimistic Concurrency Control (Version Check)
  const currentVersion = order.orderVersion ?? 1;
  if (params.expectedVersion !== undefined && params.expectedVersion !== currentVersion) {
    return {
      valid: false,
      error: `Stale order version. Expected version ${params.expectedVersion} but order is at version ${currentVersion}.`,
    };
  }

  // 3. Stock Existence
  const stock = stocks.find(s => s.symbol === order.symbol);
  if (!stock) {
    return { valid: false, error: `Stock ${order.symbol} not found.` };
  }

  // 4. Parameter change check (detect no-op / duplicate modification)
  const filledQty = getEffectiveFilledQuantity(order);
  const oldRemaining = getEffectiveRemainingQuantity(order);

  const hasQtyChange = params.quantity !== undefined && params.quantity !== order.quantity;
  const hasPriceChange = params.price !== undefined && params.price !== order.requestedPrice;
  const hasTriggerChange =
    params.triggerPrice !== undefined && params.triggerPrice !== order.triggerPrice;

  if (!hasQtyChange && !hasPriceChange && !hasTriggerChange) {
    return {
      valid: false,
      error: 'No order parameters were changed. Modification request rejected as duplicate.',
    };
  }

  // 5. Quantity Validation
  let newTotalQty = order.quantity;
  let newRemainingQty = oldRemaining;

  if (params.quantity !== undefined) {
    if (!Number.isInteger(params.quantity) || params.quantity <= 0) {
      return { valid: false, error: 'Order quantity must be a positive whole number.' };
    }

    // Critical Invariant: Cannot reduce total quantity below already filled quantity
    if (params.quantity < filledQty) {
      return {
        valid: false,
        error: `Cannot reduce total quantity (${params.quantity}) below already filled quantity (${filledQty}).`,
      };
    }

    newTotalQty = params.quantity;
    newRemainingQty = newTotalQty - filledQty;
  }

  // 6. Price Validation
  let newRequestedPrice = order.requestedPrice;
  if (params.price !== undefined) {
    if (typeof params.price !== 'number' || params.price <= 0 || !Number.isFinite(params.price)) {
      return { valid: false, error: 'Limit price must be a positive number.' };
    }
    if (order.type === 'MARKET') {
      return { valid: false, error: 'Cannot modify price of a MARKET order.' };
    }
    newRequestedPrice = Number(params.price.toFixed(2));
  }

  // 7. Trigger Price Validation
  let newTriggerPrice = order.triggerPrice;
  if (params.triggerPrice !== undefined) {
    if (
      typeof params.triggerPrice !== 'number' ||
      params.triggerPrice <= 0 ||
      !Number.isFinite(params.triggerPrice)
    ) {
      return { valid: false, error: 'Trigger price must be a positive number.' };
    }
    if (order.type !== 'STOP_LIMIT' && order.type !== 'STOP_MARKET' && !order.isGTT) {
      return {
        valid: false,
        error: 'Trigger price can only be specified for STOP or GTT orders.',
      };
    }
    newTriggerPrice = Number(params.triggerPrice.toFixed(2));
  }

  // 8. Capital & Holdings Reservation Validation (Atomic Recalculation)
  let additionalCapitalRequired = 0;
  let excessCapitalReleased = 0;
  let additionalHoldingsRequired = 0;
  let excessHoldingsReleased = 0;

  if (order.side === 'BUY') {
    // Current reservation for this order
    const oldPrice = getReservationPrice(order, stock.price) ?? stock.price;
    const oldReservation = Number((oldPrice * oldRemaining).toFixed(2));

    // Simulated order with new parameters to determine new reservation price
    const simulatedOrder: Order = {
      ...order,
      requestedPrice: newRequestedPrice,
      triggerPrice: newTriggerPrice,
      quantity: newTotalQty,
      remainingQuantity: newRemainingQty,
    };
    const newPrice = getReservationPrice(simulatedOrder, stock.price) ?? stock.price;
    const newReservation = Number((newPrice * newRemainingQty).toFixed(2));

    // Check available buying power excluding this order's own reservation
    const otherOrders = allOrders.filter(o => o.id !== order.id);
    const reservedByOthers = computeReservedBuyCapital(otherOrders, stocks);
    const availableBuyingPower = computeAvailableBuyingPower(cashBalance, reservedByOthers);

    if (newReservation > availableBuyingPower) {
      return {
        valid: false,
        error: `Insufficient available buying power for modification. Required: ₹${newReservation.toLocaleString('en-IN')}, available: ₹${availableBuyingPower.toLocaleString('en-IN')}.`,
      };
    }

    if (newReservation > oldReservation) {
      additionalCapitalRequired = Number((newReservation - oldReservation).toFixed(2));
    } else if (oldReservation > newReservation) {
      excessCapitalReleased = Number((oldReservation - newReservation).toFixed(2));
    }
  } else {
    // SELL Side
    const oldReservedQty = oldRemaining;
    const newReservedQty = newRemainingQty;

    const otherOrders = allOrders.filter(o => o.id !== order.id);
    const reservedByOthers = computeReservedSellQuantity(otherOrders, order.symbol);
    const holding = holdings.find(h => h.symbol === order.symbol);
    const totalHoldingQty = holding ? holding.quantity : 0;
    const availableSellQty = computeAvailableSellQuantity(totalHoldingQty, reservedByOthers);

    if (newReservedQty > availableSellQty) {
      return {
        valid: false,
        error: `Insufficient available holdings for modification. Required: ${newReservedQty} shares of ${order.symbol}, available: ${availableSellQty} shares.`,
      };
    }

    if (newReservedQty > oldReservedQty) {
      additionalHoldingsRequired = newReservedQty - oldReservedQty;
    } else if (oldReservedQty > newReservedQty) {
      excessHoldingsReleased = oldReservedQty - newReservedQty;
    }
  }

  return {
    valid: true,
    additionalCapitalRequired,
    additionalHoldingsRequired,
    excessCapitalReleased,
    excessHoldingsReleased,
  };
};

// ── Application Helper ──────────────────────────────────────────────────────

/**
 * Pure function to apply a validated modification to an Order record.
 * Generates an immutable modification history entry, increments version,
 * and updates priority timestamp.
 *
 * @param order - Original order
 * @param params - Validated modification parameters
 * @param nowIso - Current timestamp
 * @param priorityTimestamp - Timestamp for FIFO queue priority
 */
export const applyOrderModification = (
  order: Order,
  params: ModifyOrderParams,
  nowIso: string = new Date().toISOString(),
  priorityTimestamp: number = Date.now()
): Order => {
  const filledQty = getEffectiveFilledQuantity(order);
  const oldRemaining = getEffectiveRemainingQuantity(order);

  const newTotalQty = params.quantity !== undefined ? params.quantity : order.quantity;
  const newRemainingQty = newTotalQty - filledQty;

  const newRequestedPrice =
    params.price !== undefined ? Number(params.price.toFixed(2)) : order.requestedPrice;
  const newTriggerPrice =
    params.triggerPrice !== undefined ? Number(params.triggerPrice.toFixed(2)) : order.triggerPrice;

  const newVersion = (order.orderVersion ?? 1) + 1;
  const newModificationCount = (order.modificationCount ?? 0) + 1;

  // Create immutable audit history record
  const record: OrderModificationRecord = {
    timestamp: nowIso,
    previousQuantity: order.quantity,
    newQuantity: newTotalQty,
    previousRequestedPrice: order.requestedPrice,
    newRequestedPrice: newRequestedPrice,
    previousTriggerPrice: order.triggerPrice,
    newTriggerPrice: newTriggerPrice,
    previousRemainingQuantity: oldRemaining,
    newRemainingQuantity: newRemainingQty,
    reason: params.reason,
    orderVersion: newVersion,
  };

  // Status handling: if remaining quantity reached 0, transition to EXECUTED, otherwise preserve
  const status: OrderStatus =
    newRemainingQty === 0
      ? 'EXECUTED'
      : filledQty > 0
        ? 'PARTIALLY_FILLED'
        : 'PENDING';

  return {
    ...order,
    quantity: newTotalQty,
    remainingQuantity: newRemainingQty,
    requestedPrice: newRequestedPrice,
    triggerPrice: newTriggerPrice,
    status,
    modifiedAt: nowIso,
    orderVersion: newVersion,
    modificationCount: newModificationCount,
    modificationHistory: [...(order.modificationHistory ?? []), record],
    priorityTimestamp,
  };
};

/**
 * Sort pending orders by execution priority queue order.
 * Follows strict FIFO: orders are ordered by priorityTimestamp (or createdAt if unmodified).
 * When an order undergoes material modification, its priorityTimestamp is reset to the modification time,
 * safely moving it to the back of the queue behind earlier pending orders.
 */
export const sortOrdersByPriority = (orders: Order[]): Order[] => {
  return [...orders].sort((a, b) => {
    const timeA = a.priorityTimestamp ?? new Date(a.createdAt).getTime();
    const timeB = b.priorityTimestamp ?? new Date(b.createdAt).getTime();
    return timeA - timeB;
  });
};
