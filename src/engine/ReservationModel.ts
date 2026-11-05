/* ── Day 29: Centralized Reservation Model ───────────────────────────────────────
Pure, deterministic calculations for capital and holding reservations.
Never mutates state. All calculations are pure mathematical functions.
──────────────────────────────────────────────────────────────────────────────── */

import { Order, OrderStatus, OrderSide, OrderType, Holding, StockData } from '../types';

/** Terminal order statuses — reservations must be released for these. */
const TERMINAL_STATUSES: readonly OrderStatus[] = ['EXECUTED', 'CANCELLED', 'REJECTED'];

/** Check if an order status is terminal (no longer reserves resources). */
export const isTerminalStatus = (status: OrderStatus): boolean => {
  return TERMINAL_STATUSES.includes(status);
};

/** Check if an order is eligible for reservation (pending or triggered). */
export const isReservationEligible = (status: OrderStatus): boolean => {
  return status === 'PENDING' || status === 'TRIGGERED';
};

/**
 * Determine the reservation price for a pending order based on its type.
 * Returns the price at which capital/quantity would be committed if executed.
 * Returns null if the order type cannot have a reliable reservation price.
 */
export const getReservationPrice = (order: Order, _currentMarketPrice: number): number | null => {
  const { type, side, requestedPrice, triggerPrice } = order;

  switch (type) {
    case 'MARKET':
      // MARKET orders execute immediately — no pending reservation needed
      return null;

    case 'LIMIT':
      // LIMIT orders reserve at the limit price
      return requestedPrice > 0 ? requestedPrice : null;

    case 'STOP_MARKET':
      // STOP_MARKET orders will execute at market when triggered
      // Reserve at trigger price as best estimate
      return triggerPrice ?? null;

    case 'STOP_LIMIT':
      // STOP_LIMIT: reserves at limit price once triggered
      // Before trigger: reserve at trigger price (estimate)
      // After trigger (TRIGGERED status): reserve at limit price
      if (order.status === 'TRIGGERED') {
        return requestedPrice > 0 ? requestedPrice : null;
      }
      return triggerPrice ?? null;

    case 'TARGET':
      // TARGET orders execute at market when target price reached
      return triggerPrice ?? null;

    default:
      return null;
  }
};

/**
 * Compute the capital reserved by a single eligible pending BUY order.
 * Returns 0 if the order is not a BUY, not eligible, or has no valid reservation price.
 */
export const computeOrderBuyReservation = (order: Order, stocks: StockData[]): number => {
  if (order.side !== 'BUY') return 0;
  if (!isReservationEligible(order.status)) return 0;

  const stock = stocks.find(s => s.symbol === order.symbol);
  if (!stock) return 0;

  const reservationPrice = getReservationPrice(order, stock.price);
  if (reservationPrice === null) return 0;

  return Number((reservationPrice * order.quantity).toFixed(2));
};

/**
 * Compute the quantity reserved by a single eligible pending SELL order.
 * Returns 0 if the order is not a SELL, not eligible, or symbol doesn't match.
 */
export const computeOrderSellReservation = (order: Order, symbol: string): number => {
  if (order.side !== 'SELL') return 0;
  if (!isReservationEligible(order.status)) return 0;
  if (order.symbol !== symbol) return 0;

  return order.quantity;
};

/**
 * Compute total capital reserved by all eligible pending BUY orders.
 * Excludes terminal orders and MARKET orders (which execute immediately).
 */
export const computeReservedBuyCapital = (orders: Order[], stocks: StockData[]): number => {
  let total = 0;
  for (const order of orders) {
    if (order.side === 'BUY' && isReservationEligible(order.status)) {
      total += computeOrderBuyReservation(order, stocks);
    }
  }
  return Number(total.toFixed(2));
};

/**
 * Compute total quantity reserved by all eligible pending SELL orders for a specific symbol.
 * Excludes terminal orders.
 */
export const computeReservedSellQuantity = (orders: Order[], symbol: string): number => {
  let total = 0;
  for (const order of orders) {
    if (order.side === 'SELL' && isReservationEligible(order.status) && order.symbol === symbol) {
      total += computeOrderSellReservation(order, symbol);
    }
  }
  return total;
};

/**
 * Compute available buying power: Cash Balance - Reserved Buy Capital.
 * Never negative — floors at 0.
 */
export const computeAvailableBuyingPower = (cashBalance: number, reservedBuyCapital: number): number => {
  const available = cashBalance - reservedBuyCapital;
  return Math.max(0, Number(available.toFixed(2)));
};

/**
 * Compute available sell quantity for a symbol: Total Holding - Reserved Sell Quantity.
 * Never negative — floors at 0.
 */
export const computeAvailableSellQuantity = (
  totalHoldingQuantity: number,
  reservedSellQuantity: number
): number => {
  const available = totalHoldingQuantity - reservedSellQuantity;
  return Math.max(0, available);
};

/**
 * Compute all reservation metrics for the account in one pass.
 * Useful for UI display and pre-trade validation.
 */
export interface AccountReservationMetrics {
  cashBalance: number;
  reservedBuyCapital: number;
  availableBuyingPower: number;
  pendingBuyOrders: number;
  pendingSellOrders: number;
  reservationsBySymbol: Map<string, { reservedSellQty: number; availableSellQty: number; holdingQty: number }>;
}

export const computeAccountReservationMetrics = (
  orders: Order[],
  holdings: Holding[],
  stocks: StockData[],
  cashBalance: number
): AccountReservationMetrics => {
  const reservedBuyCapital = computeReservedBuyCapital(orders, stocks);
  const availableBuyingPower = computeAvailableBuyingPower(cashBalance, reservedBuyCapital);

  const pendingBuyOrders = orders.filter(o => o.side === 'BUY' && isReservationEligible(o.status)).length;
  const pendingSellOrders = orders.filter(o => o.side === 'SELL' && isReservationEligible(o.status)).length;

  // Build per-symbol sell reservations
  const reservationsBySymbol = new Map<string, { reservedSellQty: number; availableSellQty: number; holdingQty: number }>();

  for (const holding of holdings) {
    const reservedSellQty = computeReservedSellQuantity(orders, holding.symbol);
    const availableSellQty = computeAvailableSellQuantity(holding.quantity, reservedSellQty);
    reservationsBySymbol.set(holding.symbol, {
      reservedSellQty,
      availableSellQty,
      holdingQty: holding.quantity
    });
  }

  // Also include symbols with pending SELL orders but no current holding
  for (const order of orders) {
    if (order.side === 'SELL' && isReservationEligible(order.status) && !reservationsBySymbol.has(order.symbol)) {
      const reservedSellQty = computeReservedSellQuantity(orders, order.symbol);
      reservationsBySymbol.set(order.symbol, {
        reservedSellQty,
        availableSellQty: 0,
        holdingQty: 0
      });
    }
  }

  return {
    cashBalance,
    reservedBuyCapital: Number(reservedBuyCapital.toFixed(2)),
    availableBuyingPower,
    pendingBuyOrders,
    pendingSellOrders,
    reservationsBySymbol
  };
};

/**
 * Validate a new BUY order against available buying power.
 * Returns { valid, error?, availableBuyingPower, requiredReservation }.
 */
export interface BuyOrderValidationResult {
  valid: boolean;
  error?: string;
  availableBuyingPower: number;
  requiredReservation: number;
}

export const validateBuyOrderReservation = (
  quantity: number,
  reservationPrice: number,
  cashBalance: number,
  existingOrders: Order[],
  stocks: StockData[]
): BuyOrderValidationResult => {
  const requiredReservation = Number((reservationPrice * quantity).toFixed(2));
  const reservedBuyCapital = computeReservedBuyCapital(existingOrders, stocks);
  const availableBuyingPower = computeAvailableBuyingPower(cashBalance, reservedBuyCapital);

  if (requiredReservation > availableBuyingPower) {
    return {
      valid: false,
      error: `Insufficient available buying power. Required: ₹${requiredReservation.toLocaleString('en-IN')} but available: ₹${availableBuyingPower.toLocaleString('en-IN')} (₹${reservedBuyCapital.toLocaleString('en-IN')} reserved for pending BUY orders).`,
      availableBuyingPower,
      requiredReservation
    };
  }

  return { valid: true, availableBuyingPower, requiredReservation };
};

/**
 * Validate a new SELL order against available holding quantity.
 * Returns { valid, error?, availableQuantity, requiredQuantity }.
 */
export interface SellOrderValidationResult {
  valid: boolean;
  error?: string;
  availableQuantity: number;
  requiredQuantity: number;
}

export const validateSellOrderReservation = (
  quantity: number,
  symbol: string,
  holdings: Holding[],
  existingOrders: Order[]
): SellOrderValidationResult => {
  const holding = holdings.find(h => h.symbol === symbol);
  const totalHoldingQty = holding ? holding.quantity : 0;
  const reservedSellQty = computeReservedSellQuantity(existingOrders, symbol);
  const availableQuantity = computeAvailableSellQuantity(totalHoldingQty, reservedSellQty);

  if (quantity > availableQuantity) {
    return {
      valid: false,
      error: `Insufficient available quantity. You own ${totalHoldingQty} shares of ${symbol} but ${reservedSellQty} share${reservedSellQty !== 1 ? 's' : ''} ${reservedSellQty === 1 ? 'is' : 'are'} already committed to pending SELL orders. Available: ${availableQuantity}.`,
      availableQuantity,
      requiredQuantity: quantity
    };
  }

  return { valid: true, availableQuantity, requiredQuantity: quantity };
};

/**
 * Revalidate an order at execution time against current reservations and state.
 * Ensures the order's reservation is still valid and resources are available.
 */
export interface RevalidationResult {
  valid: boolean;
  reason?: string;
}

export const revalidateOrderAtExecution = (
  order: Order,
  cashBalance: number,
  holdings: Holding[],
  orders: Order[],
  stocks: StockData[]
): RevalidationResult => {
  // Skip if not eligible for execution
  if (!isReservationEligible(order.status) && order.status !== 'EXECUTED') {
    return { valid: false, reason: `Order in ${order.status} state cannot be executed.` };
  }

  const stock = stocks.find(s => s.symbol === order.symbol);
  if (!stock) {
    return { valid: false, reason: 'Stock data not available.' };
  }

  if (order.side === 'BUY') {
    // For BUY orders, check if cash is still available after accounting for other reservations
    // Exclude this order's own reservation from the check
    const otherOrders = orders.filter(o => o.id !== order.id);
    const reservedBuyCapital = computeReservedBuyCapital(otherOrders, stocks);
    const availableBuyingPower = computeAvailableBuyingPower(cashBalance, reservedBuyCapital);

    const reservationPrice = getReservationPrice(order, stock.price) ?? stock.price;
    const requiredCash = Number((reservationPrice * order.quantity).toFixed(2));

    if (requiredCash > availableBuyingPower) {
      return {
        valid: false,
        reason: `Insufficient cash at execution. Required: ₹${requiredCash.toLocaleString('en-IN')} but available: ₹${availableBuyingPower.toLocaleString('en-IN')} (₹${reservedBuyCapital.toLocaleString('en-IN')} reserved for other pending BUY orders).`
      };
    }
  } else {
    // For SELL orders, check if holding quantity is still available
    const otherOrders = orders.filter(o => o.id !== order.id);
    const reservedSellQty = computeReservedSellQuantity(otherOrders, order.symbol);
    const holding = holdings.find(h => h.symbol === order.symbol);
    const totalHoldingQty = holding ? holding.quantity : 0;
    const availableQty = computeAvailableSellQuantity(totalHoldingQty, reservedSellQty);

    if (order.quantity > availableQty) {
      return {
        valid: false,
        reason: `Insufficient holdings at execution. You own ${totalHoldingQty} shares of ${order.symbol} but ${reservedSellQty} share${reservedSellQty !== 1 ? 's' : ''} ${reservedSellQty === 1 ? 'is' : 'are'} committed to other pending SELL orders. Available: ${availableQty}.`
      };
    }
  }

  return { valid: true };
};