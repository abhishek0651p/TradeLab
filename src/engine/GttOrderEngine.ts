/* ── Day 31: GTT & Conditional Order Engine ───────────────────────────────────────
Pure, deterministic helper functions for GTT/conditional order logic.
Never mutates state. All calculations are pure mathematical functions.
──────────────────────────────────────────────────────────────────────────────────── */

import { Order, OrderStatus, PlaceOrderParams } from '../types';

/** Terminal order statuses — GTT orders in these states cannot be triggered/executed/cancelled. */
export const GTT_TERMINAL_STATUSES: readonly OrderStatus[] = ['EXECUTED', 'CANCELLED', 'REJECTED'];

/** Check if an order status is terminal (no further lifecycle transitions). */
export const isGttTerminalStatus = (status: OrderStatus): boolean => GTT_TERMINAL_STATUSES.includes(status);

/** Check if a GTT order is eligible for triggering/execution (PENDING or TRIGGERED). */
export const isGttEligibleForTrigger = (status: OrderStatus): boolean =>
  status === 'PENDING' || status === 'TRIGGERED' || status === 'PARTIALLY_FILLED';

/**
 * Result of trigger condition evaluation.
 */
export interface TriggerEvaluationResult {
  met: boolean;
  nextStatus: OrderStatus | null;
  reason?: string;
}

/**
 * Evaluate trigger conditions for a single order against the current market price.
 * Pure function — does not mutate the order.
 */
export const evaluateOrderTrigger = (
  order: Order,
  currentPrice: number
): TriggerEvaluationResult => {
  if (!isGttEligibleForTrigger(order.status)) {
    return { met: false, nextStatus: null, reason: 'Order not eligible for trigger' };
  }

  const side = order.side;
  const type = order.type;
  const triggerPrice = order.triggerPrice;
  const requestedPrice = order.requestedPrice;

  // Guard against invalid trigger price
  if ((type === 'STOP_MARKET' || type === 'STOP_LIMIT' || type === 'TARGET') &&
      (triggerPrice === undefined || triggerPrice === null || triggerPrice <= 0 || !Number.isFinite(triggerPrice))) {
    return { met: false, nextStatus: null, reason: 'Invalid trigger price' };
  }

  // PENDING orders: check if trigger condition is met.
  // PARTIALLY_FILLED orders are re-evaluated so the remaining quantity can fill on subsequent ticks.
  if (order.status === 'PENDING' || order.status === 'PARTIALLY_FILLED') {
    // For PARTIALLY_FILLED STOP_LIMIT orders, we already triggered previously (triggeredAt set),
    // so only the limit condition needs to be checked.
    if (type === 'STOP_LIMIT' && order.status === 'PARTIALLY_FILLED') {
      if (side === 'BUY' && currentPrice <= requestedPrice) {
        return { met: true, nextStatus: 'EXECUTED', reason: 'Buy stop-limit limit price reached' };
      }
      if (side === 'SELL' && currentPrice >= requestedPrice) {
        return { met: true, nextStatus: 'EXECUTED', reason: 'Sell stop-limit limit price reached' };
      }
      return { met: false, nextStatus: null };
    }

    if (type === 'MARKET') {
      return { met: true, nextStatus: 'EXECUTED', reason: 'Market order execution' };
    }

    if (type === 'LIMIT') {
      if (side === 'BUY' && currentPrice <= requestedPrice) {
        return { met: true, nextStatus: 'EXECUTED', reason: 'Buy limit price reached' };
      }
      if (side === 'SELL' && currentPrice >= requestedPrice) {
        return { met: true, nextStatus: 'EXECUTED', reason: 'Sell limit price reached' };
      }
    } else if (type === 'STOP_MARKET') {
      if (side === 'BUY' && currentPrice >= triggerPrice!) {
        return { met: true, nextStatus: 'EXECUTED', reason: 'Buy stop triggered' };
      }
      if (side === 'SELL' && currentPrice <= triggerPrice!) {
        return { met: true, nextStatus: 'EXECUTED', reason: 'Sell stop triggered' };
      }
    } else if (type === 'TARGET') {
      if (side === 'BUY' && currentPrice <= triggerPrice!) {
        return { met: true, nextStatus: 'EXECUTED', reason: 'Buy target triggered' };
      }
      if (side === 'SELL' && currentPrice >= triggerPrice!) {
        return { met: true, nextStatus: 'EXECUTED', reason: 'Sell target triggered' };
      }
    } else if (type === 'STOP_LIMIT') {
      if (side === 'BUY' && currentPrice >= triggerPrice!) {
        return { met: true, nextStatus: 'TRIGGERED', reason: 'Buy stop-limit trigger reached' };
      }
      if (side === 'SELL' && currentPrice <= triggerPrice!) {
        return { met: true, nextStatus: 'TRIGGERED', reason: 'Sell stop-limit trigger reached' };
      }
    }
    return { met: false, nextStatus: null };
  }

  // TRIGGERED STOP_LIMIT orders: check limit condition
  if (order.status === 'TRIGGERED' && type === 'STOP_LIMIT') {
    if (side === 'BUY' && currentPrice <= requestedPrice) {
      return { met: true, nextStatus: 'EXECUTED', reason: 'Buy stop-limit limit price reached' };
    }
    if (side === 'SELL' && currentPrice >= requestedPrice) {
      return { met: true, nextStatus: 'EXECUTED', reason: 'Sell stop-limit limit price reached' };
    }
    return { met: false, nextStatus: null };
  }

  return { met: false, nextStatus: null };
};

/**
 * Result of trailing stop update computation.
 */
export interface TrailingUpdateResult {
  updated: boolean;
  newHighestPrice?: number;
  newLowestPrice?: number;
  newTriggerPrice?: number;
  reason?: string;
}

/**
 * Compute trailing stop update for a GTT order with trailing config.
 * Only updates in the favorable direction (raises trigger for SELL, lowers for BUY).
 * Pure function — returns new values or null if no update.
 */
export const computeTrailingUpdate = (
  order: Order,
  currentPrice: number
): TrailingUpdateResult => {
  if (!order.isGTT || !order.trailingConfig) {
    return { updated: false, reason: 'No trailing config' };
  }

  if (!isGttEligibleForTrigger(order.status)) {
    return { updated: false, reason: 'Order not eligible for trailing update' };
  }

  const { distance, distanceType } = order.trailingConfig;
  const side = order.side;

  if (side === 'SELL') {
    // SELL trailing: track highest price, raise trigger only
    const peak = order.highestPriceSinceCreation ?? currentPrice;
    if (currentPrice > peak) {
      // Price made a new high — advance peak and recalculate trigger upward
      const newPeak = currentPrice;
      const newTrigger = distanceType === 'percent'
        ? Number((newPeak * (1 - distance / 100)).toFixed(2))
        : Number((newPeak - distance).toFixed(2));

      const prevTrigger = order.triggerPrice ?? 0;
      if (newTrigger > prevTrigger) {
        return {
          updated: true,
          newHighestPrice: newPeak,
          newTriggerPrice: newTrigger,
          reason: 'Trailing stop updated: new peak price'
        };
      }
    }
    return { updated: false, reason: 'Price did not exceed peak' };
  } else if (side === 'BUY') {
    // BUY trailing: track lowest price, lower trigger only (defensive, rarely used)
    const trough = order.lowestPriceSinceCreation ?? currentPrice;
    if (currentPrice < trough) {
      // Price made a new low — advance trough and recalculate trigger downward
      const newTrough = currentPrice;
      const newTrigger = distanceType === 'percent'
        ? Number((newTrough * (1 + distance / 100)).toFixed(2))
        : Number((newTrough + distance).toFixed(2));

      const prevTrigger = order.triggerPrice ?? Infinity;
      if (newTrigger < prevTrigger) {
        return {
          updated: true,
          newLowestPrice: newTrough,
          newTriggerPrice: newTrigger,
          reason: 'Trailing stop updated: new trough price'
        };
      }
    }
    return { updated: false, reason: 'Price did not fall below trough' };
  }

  return { updated: false, reason: 'Invalid side for trailing' };
};

/**
 * Check if a GTT order has expired.
 */
export const isGttExpired = (order: Order, now: number = Date.now()): boolean => {
  if (!order.isGTT || !order.expiry) return false; // GTC never expires
  if (isGttTerminalStatus(order.status)) return false; // Terminal orders don't expire further
  const expiryTime = new Date(order.expiry).getTime();
  return now > expiryTime;
};

/**
 * Trigger price validation result.
 */
export interface TriggerValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate trigger price logic for STOP_MARKET, STOP_LIMIT, and TARGET orders.
 * Does NOT silently modify user-entered prices — returns error if invalid.
 */
export const validateTriggerPrices = (
  params: PlaceOrderParams,
  effectiveTriggerPrice: number | undefined
): TriggerValidationResult => {
  const orderType = params.orderType;
  const side = params.side;
  const currentPrice = params.currentPrice;

  // STOP_MARKET / STOP_LIMIT
  if (orderType === 'STOP_MARKET' || orderType === 'STOP_LIMIT') {
    if (side === 'BUY') {
      if (effectiveTriggerPrice === undefined || effectiveTriggerPrice <= 0) {
        return { valid: false, error: 'Buy Stop trigger must be greater than zero.' };
      }
      if (effectiveTriggerPrice <= currentPrice) {
        // Equal-to-market is invalid for stop orders (would trigger immediately)
        return { valid: false, error: 'Buy Stop trigger must be above current market price.' };
      }
    } else { // SELL
      if (effectiveTriggerPrice === undefined || effectiveTriggerPrice <= 0) {
        return { valid: false, error: 'Sell Stop trigger must be greater than zero.' };
      }
      if (effectiveTriggerPrice >= currentPrice) {
        return { valid: false, error: 'Sell Stop trigger must be below current market price.' };
      }
    }
  }

  // TARGET orders
  if (orderType === 'TARGET') {
    if (effectiveTriggerPrice === undefined || effectiveTriggerPrice <= 0) {
      return { valid: false, error: 'Target trigger must be greater than zero.' };
    }
    if (side === 'BUY') {
      if (effectiveTriggerPrice >= currentPrice) {
        return { valid: false, error: 'Buy Target trigger must be below current market price.' };
      }
    } else { // SELL
      if (effectiveTriggerPrice <= currentPrice) {
        return { valid: false, error: 'Sell Target trigger must be above current market price.' };
      }
    }
  }

  return { valid: true };
};

/**
 * Validate trigger vs limit price consistency for STOP_LIMIT orders.
 * BUY STOP_LIMIT: limit must be >= trigger (you won't pay more than limit after trigger)
 * SELL STOP_LIMIT: limit must be <= trigger (you won't sell for less than limit after trigger)
 * Does NOT silently modify prices — returns error if inconsistent.
 */
export const validateTriggerLimitConsistency = (
  params: PlaceOrderParams,
  effectiveTriggerPrice: number | undefined
): TriggerValidationResult => {
  if (params.orderType !== 'STOP_LIMIT') return { valid: true };

  const limitPrice = params.limitPrice;
  const triggerPrice = effectiveTriggerPrice;

  if (limitPrice === undefined || limitPrice === null || limitPrice <= 0) {
    return { valid: false, error: 'Limit price must be greater than zero.' };
  }
  if (triggerPrice === undefined || triggerPrice === null || triggerPrice <= 0) {
    return { valid: false, error: 'Trigger price must be greater than zero.' };
  }

  if (params.side === 'BUY') {
    if (limitPrice < triggerPrice) {
      return {
        valid: false,
        error: 'Buy Stop-Limit: limit price must be greater than or equal to trigger price.'
      };
    }
  } else { // SELL
    if (limitPrice > triggerPrice) {
      return {
        valid: false,
        error: 'Sell Stop-Limit: limit price must be less than or equal to trigger price.'
      };
    }
  }

  return { valid: true };
};

/**
 * GTT order creation validation.
 * Combines all GTT-specific validations.
 */
export interface GttCreationValidationResult {
  valid: boolean;
  error?: string;
}

export const validateGttCreation = (
  params: PlaceOrderParams
): GttCreationValidationResult => {
  if (!params.isGTT) return { valid: true };

  // GTT cannot be MARKET
  if (params.orderType === 'MARKET') {
    return { valid: false, error: 'GTT cannot be applied to immediate Market orders.' };
  }

  // Expiry validation
  if (params.expiry) {
    const expiryTime = new Date(params.expiry).getTime();
    if (isNaN(expiryTime)) {
      return { valid: false, error: 'Invalid expiry date format.' };
    }
    if (expiryTime <= Date.now()) {
      return { valid: false, error: 'Expiry date must be in the future.' };
    }
  }

  // Trailing config validation
  if (params.trailingConfig) {
    if (params.side !== 'SELL') {
      return { valid: false, error: 'Trailing stop-loss is only supported for protective SELL orders on existing holdings.' };
    }
    if (!['STOP_MARKET', 'STOP_LIMIT'].includes(params.orderType)) {
      return { valid: false, error: 'Trailing stop-loss requires a Stop-Market (SL-M) or Stop-Limit (SL-L) order type.' };
    }
    const { distance, distanceType } = params.trailingConfig;
    if (typeof distance !== 'number' || isNaN(distance) || distance <= 0) {
      return { valid: false, error: 'Trailing distance must be greater than zero.' };
    }
    if (distanceType === 'percent' && (distance <= 0 || distance >= 100)) {
      return { valid: false, error: 'Trailing percent distance must be between 0.1% and 99.9%.' };
    }
    if (distanceType === 'absolute' && distance >= params.currentPrice) {
      return { valid: false, error: 'Trailing distance cannot exceed current market price.' };
    }
  }

  return { valid: true };
};

/**
 * Determine if a GTT order can be cancelled.
 * Policy:
 * - PENDING GTT: always allowed
 * - TRIGGERED GTT (STOP_LIMIT awaiting limit): ALLOWED (safe — no execution occurred, releases reservation)
 * - Terminal states: NOT allowed
 * - Non-GTT orders: use standard isValidTransition (PENDING only)
 */
export interface CancellationValidationResult {
  allowed: boolean;
  reason?: string;
}

export const canCancelGttOrder = (order: Order): CancellationValidationResult => {
  if (!order.isGTT) {
    // Non-GTT: only PENDING → CANCELLED allowed (per Day 11 fix)
    if (order.status === 'PENDING') return { allowed: true };
    return { allowed: false, reason: 'Only PENDING orders can be cancelled.' };
  }

  if (isGttTerminalStatus(order.status)) {
    return { allowed: false, reason: `Order is already ${order.status}.` };
  }

  if (order.status === 'PENDING' || order.status === 'TRIGGERED') {
    return { allowed: true };
  }

  return { allowed: false, reason: `Cannot cancel order in ${order.status} state.` };
};

/**
 * Validate an individual persisted order record.
 * Used during storage inspection/recovery.
 */
export const isValidPersistedOrder = (v: unknown): v is Order => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;

  const o = v as Record<string, unknown>;

  // Core required fields
  if (typeof o.id !== 'string' || o.id.trim().length === 0) return false;
  if (typeof o.symbol !== 'string' || o.symbol.trim().length === 0) return false;
  if (typeof o.companyName !== 'string' || o.companyName.trim().length === 0) return false;
  if (o.side !== 'BUY' && o.side !== 'SELL') return false;
  if (!['MARKET', 'LIMIT', 'STOP_MARKET', 'STOP_LIMIT', 'TARGET'].includes(o.type as string)) return false;
  if (typeof o.quantity !== 'number' || !Number.isInteger(o.quantity) || o.quantity <= 0) return false;
  if (typeof o.requestedPrice !== 'number' || !Number.isFinite(o.requestedPrice) || o.requestedPrice < 0) return false;
  if (o.triggerPrice !== undefined && o.triggerPrice !== null &&
      (typeof o.triggerPrice !== 'number' || !Number.isFinite(o.triggerPrice) || o.triggerPrice <= 0)) return false;
  if (!['PENDING', 'TRIGGERED', 'EXECUTED', 'CANCELLED', 'REJECTED', 'PARTIALLY_FILLED'].includes(o.status as string)) return false;
  if (typeof o.createdAt !== 'string') return false;

  // GTT-specific field validation
  if (o.isGTT !== undefined && typeof o.isGTT !== 'boolean') return false;
  if (o.expiry !== undefined && o.expiry !== null && typeof o.expiry !== 'string') return false;
  if (o.expiry && isNaN(new Date(o.expiry).getTime())) return false;
  if (o.trailingConfig !== undefined) {
    if (o.trailingConfig === null) return false;
    if (typeof o.trailingConfig !== 'object') return false;
    const tc = o.trailingConfig as Record<string, unknown>;
    if (typeof tc.distance !== 'number' || !Number.isFinite(tc.distance) || tc.distance <= 0) return false;
    if (!['absolute', 'percent'].includes(tc.distanceType as string)) return false;
  }
  if (o.highestPriceSinceCreation !== undefined &&
      (typeof o.highestPriceSinceCreation !== 'number' || !Number.isFinite(o.highestPriceSinceCreation) || o.highestPriceSinceCreation < 0)) return false;
  if (o.lowestPriceSinceCreation !== undefined &&
      (typeof o.lowestPriceSinceCreation !== 'number' || !Number.isFinite(o.lowestPriceSinceCreation) || o.lowestPriceSinceCreation < 0)) return false;
  if (o.triggeredAt !== undefined &&
      o.triggeredAt !== null && typeof o.triggeredAt !== 'string') return false;

  return true;
};

/**
 * Result of GTT order storage inspection.
 */
export type GttStorageLoadResult =
  | { status: 'missing'; orders: Order[] }
  | { status: 'valid'; orders: Order[] }
  | { status: 'malformed'; orders: Order[]; raw: string }
  | { status: 'invalid_records'; orders: Order[]; raw: string; invalidCount: number };

/**
 * Inspect raw GTT order storage and return a discriminated result.
 * Preserves raw string for malformed/invalid storage to protect from overwrite.
 */
export const inspectGttOrdersStorage = (
  raw: string | null
): GttStorageLoadResult => {
  if (raw === null) {
    return { status: 'missing', orders: [] };
  }

  if (raw.trim().length === 0) {
    return { status: 'malformed', orders: [], raw };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'malformed', orders: [], raw };
  }

  if (!Array.isArray(parsed)) {
    return { status: 'malformed', orders: [], raw };
  }

  const candidates = parsed as unknown[];
  const validOrders: Order[] = [];
  let invalidCount = 0;

  for (const candidate of candidates) {
    if (isValidPersistedOrder(candidate)) {
      validOrders.push(candidate as Order);
    } else {
      invalidCount++;
    }
  }

  if (invalidCount > 0) {
    return { status: 'invalid_records', orders: validOrders, raw, invalidCount };
  }

  return { status: 'valid', orders: validOrders };
};

/**
 * Result of GTT order reconciliation.
 */
export interface GttReconcileResult {
  orders: Order[];
  issuesDetected: string[];
}

/**
 * Reconcile GTT orders against executions and current time.
 * Ensures:
 * 1. Duplicate order IDs deduped (keep first/oldest)
 * 2. Expired non-terminal GTT orders → REJECTED
 * 3. Orders with execution records but non-EXECUTED status → mark EXECUTED (prevents duplicate execution)
 * 4. Terminal orders stay terminal
 * 5. Triggered orders get triggeredAt if missing
 */
export const reconcileGttOrders = (
  orders: Order[],
  executions: { orderId: string }[],
  now: number = Date.now()
): GttReconcileResult => {
  const issuesDetected: string[] = [];
  const seenIds = new Map<string, Order>();
  const executionOrderIds = new Set(executions.map(e => e.orderId));

  // Deduplicate by ID (keep the first/oldest by createdAt)
  for (const order of orders) {
    const existing = seenIds.get(order.id);
    if (existing) {
      issuesDetected.push(`Duplicate order ID detected: ${order.id}`);
      // Keep the one with earliest createdAt (original)
      if (new Date(order.createdAt).getTime() < new Date(existing.createdAt).getTime()) {
        seenIds.set(order.id, order);
      }
    } else {
      seenIds.set(order.id, order);
    }
  }

  const reconciled: Order[] = [];

  for (const order of seenIds.values()) {
    let reconciledOrder = { ...order };

    // Terminal orders stay terminal
    if (isGttTerminalStatus(order.status)) {
      reconciled.push(reconciledOrder);
      continue;
    }

    // Check if this order has an execution record but isn't EXECUTED or PARTIALLY_FILLED
    if (executionOrderIds.has(order.id)) {
      if (order.status !== 'EXECUTED' && order.status !== 'PARTIALLY_FILLED') {
        issuesDetected.push(`Order ${order.id} has execution record but status=${order.status}; marking EXECUTED`);
        reconciledOrder = {
          ...reconciledOrder,
          status: 'EXECUTED',
          executionPrice: reconciledOrder.executionPrice ?? 0,
          totalValue: reconciledOrder.totalValue ?? 0,
          executedAt: reconciledOrder.executedAt ?? new Date().toISOString(),
        };
      }
    }

    // Expired GTT orders → REJECTED
    if (order.isGTT && isGttExpired(order, now)) {
      if (isGttEligibleForTrigger(order.status)) {
        issuesDetected.push(`GTT order ${order.id} has expired; marking REJECTED`);
        reconciledOrder = {
          ...reconciledOrder,
          status: 'REJECTED',
          rejectionReason: 'Order has expired.',
          executedAt: null,
        };
      }
    }

    // Ensure TRIGGERED orders have triggeredAt (migration for older data)
    if (order.status === 'TRIGGERED' && !order.triggeredAt) {
      issuesDetected.push(`Order ${order.id} is TRIGGERED but missing triggeredAt; using createdAt as fallback`);
      reconciledOrder = {
        ...reconciledOrder,
        triggeredAt: order.createdAt, // fallback
      };
    }

    reconciled.push(reconciledOrder);
  }

  return { orders: reconciled, issuesDetected };
};

/**
 * GTT persistence status for UI.
 */
export type GttPersistenceStatus =
  | 'AVAILABLE'
  | 'MALFORMED'
  | 'INVALID_RECORDS';