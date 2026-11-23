/* ── Day 32 Phase B — Partial Fill Execution Tests ────────────────────────────────
 * Tests for partial fill execution, cumulative quantities, multiple executions
 * per order, reservation recalculation, duplicate-fill prevention,
 * partially filled cancellation, and GTT/bracket regression.
 * ──────────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import {
  getEffectiveFilledQuantity,
  getEffectiveRemainingQuantity,
  computeExecutableBuyQuantity,
  computeExecutableSellQuantity,
  computeOrderBuyReservation,
  computeOrderSellReservation,
  computeReservedBuyCapital,
  computeReservedSellQuantity,
  isReservationEligible,
  isTerminalStatus,
  revalidateOrderAtExecution,
} from '../engine/ReservationModel';
import { Order, Execution, StockData, Holding, OrderStatus } from '../types';
import { evaluateOrderTrigger, isGttEligibleForTrigger } from '../engine/GttOrderEngine';

// ── Test helpers ────────────────────────────────────────────────────────────

const makeOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 'ORD-TEST-001',
  symbol: 'RELIANCE',
  companyName: 'Reliance Industries',
  side: 'BUY',
  type: 'LIMIT',
  quantity: 100,
  requestedPrice: 2500,
  triggerPrice: undefined,
  executionPrice: null,
  totalValue: null,
  status: 'PENDING',
  createdAt: '2026-01-01T00:00:00Z',
  executedAt: null,
  cancelledAt: null,
  rejectionReason: null,
  ...overrides,
});

const makeStock = (symbol: string = 'RELIANCE', price: number = 2500): StockData => ({
  symbol,
  companyName: 'Test Corp',
  price,
  previousClose: price,
  change: 0,
  changePercent: 0,
  open: price,
  dayHigh: price,
  dayLow: price,
  volume: 100000,
  sector: 'Test',
  exchange: 'NSE',
  description: 'Test',
});

const makeHolding = (symbol: string = 'RELIANCE', quantity: number = 100, avgPrice: number = 2400): Holding => ({
  symbol,
  quantity,
  averageBuyPrice: avgPrice,
});

// ── 1. Effective Filled / Remaining Quantity ─────────────────────────────────

describe('Phase B — Effective filled and remaining quantity', () => {
  it('1. PENDING order with no partial tracking: filled=0, remaining=quantity', () => {
    const order = makeOrder({ status: 'PENDING', quantity: 50 });
    expect(getEffectiveFilledQuantity(order)).toBe(0);
    expect(getEffectiveRemainingQuantity(order)).toBe(50);
  });

  it('2. EXECUTED order without filledQuantity: filled=quantity, remaining=0', () => {
    const order = makeOrder({
      status: 'EXECUTED',
      quantity: 50,
      executionPrice: 2500,
      totalValue: 125000,
    });
    expect(getEffectiveFilledQuantity(order)).toBe(50);
    expect(getEffectiveRemainingQuantity(order)).toBe(0);
  });

  it('3. PARTIALLY_FILLED with explicit tracking', () => {
    const order = makeOrder({
      status: 'PARTIALLY_FILLED',
      quantity: 100,
      filledQuantity: 30,
      remainingQuantity: 70,
    });
    expect(getEffectiveFilledQuantity(order)).toBe(30);
    expect(getEffectiveRemainingQuantity(order)).toBe(70);
  });

  it('4. PARTIALLY_FILLED with filledQuantity only (remainingQuantity derived)', () => {
    const order = makeOrder({
      status: 'PARTIALLY_FILLED',
      quantity: 100,
      filledQuantity: 40,
      // remainingQuantity intentionally omitted
    });
    expect(getEffectiveFilledQuantity(order)).toBe(40);
    expect(getEffectiveRemainingQuantity(order)).toBe(60);
  });

  it('5. filledQuantity clamped to order.quantity', () => {
    const order = makeOrder({
      status: 'PARTIALLY_FILLED',
      quantity: 100,
      filledQuantity: 150, // exceeds quantity
    });
    expect(getEffectiveFilledQuantity(order)).toBe(100);
    expect(getEffectiveRemainingQuantity(order)).toBe(0);
  });

  it('6. remainingQuantity of 0 is respected', () => {
    const order = makeOrder({
      status: 'EXECUTED',
      quantity: 100,
      filledQuantity: 100,
      remainingQuantity: 0,
    });
    expect(getEffectiveRemainingQuantity(order)).toBe(0);
    expect(getEffectiveFilledQuantity(order)).toBe(100);
  });

  it('7. Negative filledQuantity clamped to 0', () => {
    const order = makeOrder({
      status: 'PENDING',
      quantity: 100,
      filledQuantity: -10,
    });
    expect(getEffectiveFilledQuantity(order)).toBe(0);
    expect(getEffectiveRemainingQuantity(order)).toBe(100);
  });
});

// ── 2. Executable Quantity Computation ──────────────────────────────────────

describe('Phase B — Executable quantity computation', () => {
  it('8. BUY full fill when cash is sufficient', () => {
    const order = makeOrder({ side: 'BUY', quantity: 10, requestedPrice: 100 });
    const stocks = [makeStock('RELIANCE', 100)];
    // Cash: 5000, price: 100, quantity: 10, cost: 1000
    const qty = computeExecutableBuyQuantity(order, 100, 5000, [order], stocks);
    expect(qty).toBe(10);
  });

  it('9. BUY partial fill when cash is insufficient for full order', () => {
    const order = makeOrder({ side: 'BUY', quantity: 100, requestedPrice: 100 });
    const stocks = [makeStock('RELIANCE', 100)];
    // Cash: 3000, price: 100, can afford 30 shares
    const qty = computeExecutableBuyQuantity(order, 100, 3000, [order], stocks);
    expect(qty).toBe(30);
  });

  it('10. BUY zero when no cash available', () => {
    const order = makeOrder({ side: 'BUY', quantity: 100, requestedPrice: 100 });
    const stocks = [makeStock('RELIANCE', 100)];
    const qty = computeExecutableBuyQuantity(order, 100, 0, [order], stocks);
    expect(qty).toBe(0);
  });

  it('11. BUY partial fill accounts for other pending orders reservations', () => {
    const order1 = makeOrder({ id: 'ORD-1', side: 'BUY', quantity: 20, requestedPrice: 100 });
    const order2 = makeOrder({ id: 'ORD-2', side: 'BUY', quantity: 30, requestedPrice: 100 });
    const stocks = [makeStock('RELIANCE', 100)];
    // Cash: 4000, order2 reserves 3000, available = 1000, can afford 10 of order1's 20
    const qty = computeExecutableBuyQuantity(order1, 100, 4000, [order1, order2], stocks);
    expect(qty).toBe(10);
  });

  it('12. SELL full fill when holdings are sufficient', () => {
    const order = makeOrder({ side: 'SELL', quantity: 10, requestedPrice: 100 });
    const holdings = [makeHolding('RELIANCE', 50)];
    const qty = computeExecutableSellQuantity(order, holdings, [order]);
    expect(qty).toBe(10);
  });

  it('13. SELL partial fill when holdings insufficient for full order', () => {
    const order = makeOrder({ side: 'SELL', quantity: 50, requestedPrice: 100 });
    const holdings = [makeHolding('RELIANCE', 30)];
    const qty = computeExecutableSellQuantity(order, holdings, [order]);
    expect(qty).toBe(30);
  });

  it('14. SELL zero when no holdings', () => {
    const order = makeOrder({ side: 'SELL', quantity: 50, requestedPrice: 100 });
    const holdings: Holding[] = [];
    const qty = computeExecutableSellQuantity(order, holdings, [order]);
    expect(qty).toBe(0);
  });

  it('15. SELL partial fill with other pending SELL reservations', () => {
    const order1 = makeOrder({ id: 'ORD-1', side: 'SELL', quantity: 30, requestedPrice: 100 });
    const order2 = makeOrder({ id: 'ORD-2', side: 'SELL', quantity: 20, requestedPrice: 100 });
    const holdings = [makeHolding('RELIANCE', 40)];
    // Holdings: 40, order2 reserves 20, available = 20. Order1 wants 30, can fill 20.
    const qty = computeExecutableSellQuantity(order1, holdings, [order1, order2]);
    expect(qty).toBe(20);
  });
});

// ── 3. Reservation Recalculation After Partial Fills ────────────────────────

describe('Phase B — Reservation recalculation after partial fills', () => {
  it('16. BUY reservation decreases after partial fill', () => {
    const stocks = [makeStock('RELIANCE', 100)];

    const freshOrder = makeOrder({ side: 'BUY', quantity: 50, requestedPrice: 100 });
    const fullReservation = computeOrderBuyReservation(freshOrder, stocks);
    expect(fullReservation).toBe(5000);

    const partialOrder = makeOrder({
      side: 'BUY',
      quantity: 50,
      requestedPrice: 100,
      status: 'PARTIALLY_FILLED',
      filledQuantity: 30,
      remainingQuantity: 20,
    });
    const partialReservation = computeOrderBuyReservation(partialOrder, stocks);
    expect(partialReservation).toBe(2000); // 20 remaining × 100
  });

  it('17. SELL reservation decreases after partial fill', () => {
    const freshOrder = makeOrder({ side: 'SELL', quantity: 50, requestedPrice: 100 });
    expect(computeOrderSellReservation(freshOrder, 'RELIANCE')).toBe(50);

    const partialOrder = makeOrder({
      side: 'SELL',
      quantity: 50,
      requestedPrice: 100,
      status: 'PARTIALLY_FILLED',
      filledQuantity: 20,
      remainingQuantity: 30,
    });
    expect(computeOrderSellReservation(partialOrder, 'RELIANCE')).toBe(30);
  });

  it('18. EXECUTED order releases all reservations', () => {
    const stocks = [makeStock('RELIANCE', 100)];
    const executedOrder = makeOrder({
      side: 'BUY',
      quantity: 50,
      requestedPrice: 100,
      status: 'EXECUTED',
      filledQuantity: 50,
      remainingQuantity: 0,
    });
    expect(computeOrderBuyReservation(executedOrder, stocks)).toBe(0);
  });

  it('19. Total reserved buy capital with mix of partial and pending orders', () => {
    const stocks = [makeStock('RELIANCE', 100)];
    const orders = [
      makeOrder({ id: 'O1', side: 'BUY', quantity: 40, requestedPrice: 100, status: 'PENDING' }),
      makeOrder({
        id: 'O2', side: 'BUY', quantity: 60, requestedPrice: 100,
        status: 'PARTIALLY_FILLED', filledQuantity: 20, remainingQuantity: 40,
      }),
      makeOrder({
        id: 'O3', side: 'BUY', quantity: 30, requestedPrice: 100,
        status: 'EXECUTED', filledQuantity: 30, remainingQuantity: 0,
      }),
    ];
    // O1: 40 × 100 = 4000; O2: 40 × 100 = 4000; O3: 0 (executed)
    expect(computeReservedBuyCapital(orders, stocks)).toBe(8000);
  });

  it('20. Total reserved sell quantity with partial fills', () => {
    const orders = [
      makeOrder({ id: 'O1', side: 'SELL', quantity: 30, requestedPrice: 100, status: 'PENDING' }),
      makeOrder({
        id: 'O2', side: 'SELL', quantity: 50, requestedPrice: 100,
        status: 'PARTIALLY_FILLED', filledQuantity: 20, remainingQuantity: 30,
      }),
    ];
    // O1: 30; O2: 30
    expect(computeReservedSellQuantity(orders, 'RELIANCE')).toBe(60);
  });
});

// ── 4. Revalidation with Partial Fills ──────────────────────────────────────

describe('Phase B — Revalidation with partial fills', () => {
  it('21. Revalidation uses effectiveRemaining, not full quantity', () => {
    const stocks = [makeStock('RELIANCE', 100)];
    const partialOrder = makeOrder({
      side: 'BUY', quantity: 100, requestedPrice: 100,
      status: 'PARTIALLY_FILLED', filledQuantity: 80, remainingQuantity: 20,
    });
    // Cash: 2500, remaining: 20 × 100 = 2000. Should be valid.
    const result = revalidateOrderAtExecution(partialOrder, 2500, [], [partialOrder], stocks);
    expect(result.valid).toBe(true);
  });

  it('22. Revalidation fails when cash insufficient for remaining quantity', () => {
    const stocks = [makeStock('RELIANCE', 100)];
    const partialOrder = makeOrder({
      side: 'BUY', quantity: 100, requestedPrice: 100,
      status: 'PARTIALLY_FILLED', filledQuantity: 80, remainingQuantity: 20,
    });
    // Cash: 500, remaining: 20 × 100 = 2000. Should fail.
    const result = revalidateOrderAtExecution(partialOrder, 500, [], [partialOrder], stocks);
    expect(result.valid).toBe(false);
  });

  it('23. SELL revalidation uses effectiveRemaining', () => {
    const stocks = [makeStock('RELIANCE', 100)];
    const holdings = [makeHolding('RELIANCE', 15)];
    const partialOrder = makeOrder({
      side: 'SELL', quantity: 50, requestedPrice: 100,
      status: 'PARTIALLY_FILLED', filledQuantity: 40, remainingQuantity: 10,
    });
    // Holdings: 15, remaining: 10. Should be valid.
    const result = revalidateOrderAtExecution(partialOrder, 10000, holdings, [partialOrder], stocks);
    expect(result.valid).toBe(true);
  });
});

// ── 5. Status Transitions ───────────────────────────────────────────────────

describe('Phase B — Status transitions', () => {
  it('24. PARTIALLY_FILLED is reservation-eligible', () => {
    expect(isReservationEligible('PARTIALLY_FILLED')).toBe(true);
  });

  it('25. PARTIALLY_FILLED is not terminal', () => {
    expect(isTerminalStatus('PARTIALLY_FILLED')).toBe(false);
  });

  it('26. EXECUTED is terminal', () => {
    expect(isTerminalStatus('EXECUTED')).toBe(true);
  });

  it('27. CANCELLED is terminal', () => {
    expect(isTerminalStatus('CANCELLED')).toBe(true);
  });

  it('28. PENDING is reservation-eligible', () => {
    expect(isReservationEligible('PENDING')).toBe(true);
  });

  it('29. TRIGGERED is reservation-eligible', () => {
    expect(isReservationEligible('TRIGGERED')).toBe(true);
  });
});

// ── 6. Cumulative Fill Tracking Simulation ──────────────────────────────────

describe('Phase B — Cumulative fill tracking', () => {
  it('30. Simulated three sequential partial fills accumulate correctly', () => {
    // Simulate: order of 100 shares filled as 30 → 40 → 30
    let order = makeOrder({ quantity: 100 });

    // Fill 1: 30 shares
    const fill1 = getEffectiveRemainingQuantity(order);
    expect(fill1).toBe(100);
    order = { ...order, status: 'PARTIALLY_FILLED' as OrderStatus, filledQuantity: 30, remainingQuantity: 70 };
    expect(getEffectiveFilledQuantity(order)).toBe(30);
    expect(getEffectiveRemainingQuantity(order)).toBe(70);

    // Fill 2: 40 shares
    order = { ...order, filledQuantity: 70, remainingQuantity: 30 };
    expect(getEffectiveFilledQuantity(order)).toBe(70);
    expect(getEffectiveRemainingQuantity(order)).toBe(30);

    // Fill 3: 30 shares (final)
    order = { ...order, status: 'EXECUTED' as OrderStatus, filledQuantity: 100, remainingQuantity: 0 };
    expect(getEffectiveFilledQuantity(order)).toBe(100);
    expect(getEffectiveRemainingQuantity(order)).toBe(0);
  });

  it('31. Reservation shrinks with each partial fill', () => {
    const stocks = [makeStock('RELIANCE', 100)];

    let order = makeOrder({ side: 'BUY', quantity: 100, requestedPrice: 100 });
    expect(computeOrderBuyReservation(order, stocks)).toBe(10000);

    order = { ...order, status: 'PARTIALLY_FILLED' as OrderStatus, filledQuantity: 40, remainingQuantity: 60 };
    expect(computeOrderBuyReservation(order, stocks)).toBe(6000);

    order = { ...order, filledQuantity: 80, remainingQuantity: 20 };
    expect(computeOrderBuyReservation(order, stocks)).toBe(2000);

    order = { ...order, status: 'EXECUTED' as OrderStatus, filledQuantity: 100, remainingQuantity: 0 };
    expect(computeOrderBuyReservation(order, stocks)).toBe(0);
  });
});

// ── 7. Multiple Executions Linked to One Order ──────────────────────────────

describe('Phase B — Multiple executions per order', () => {
  it('32. Each execution has its own quantity and links to the same orderId', () => {
    const orderId = 'ORD-MULTI-001';
    const executions: Execution[] = [
      {
        id: 'EXE-001', orderId, symbol: 'RELIANCE', companyName: 'Reliance',
        side: 'BUY', quantity: 30, executionPrice: 100, totalValue: 3000,
        executedAt: '2026-01-01T10:00:00Z',
      },
      {
        id: 'EXE-002', orderId, symbol: 'RELIANCE', companyName: 'Reliance',
        side: 'BUY', quantity: 40, executionPrice: 102, totalValue: 4080,
        executedAt: '2026-01-01T10:05:00Z',
      },
      {
        id: 'EXE-003', orderId, symbol: 'RELIANCE', companyName: 'Reliance',
        side: 'BUY', quantity: 30, executionPrice: 101, totalValue: 3030,
        executedAt: '2026-01-01T10:10:00Z',
      },
    ];

    // All link to the same order
    expect(executions.every(e => e.orderId === orderId)).toBe(true);

    // Each has distinct ID
    const ids = new Set(executions.map(e => e.id));
    expect(ids.size).toBe(3);

    // Total filled across all executions
    const totalFilled = executions.reduce((sum, e) => sum + e.quantity, 0);
    expect(totalFilled).toBe(100);

    // Total value across all executions
    const totalValue = executions.reduce((sum, e) => sum + e.totalValue, 0);
    expect(totalValue).toBe(10110);
  });
});

// ── 8. Duplicate-Fill Prevention ────────────────────────────────────────────

describe('Phase B — Duplicate fill prevention', () => {
  it('33. EXECUTED order has remaining=0, cannot be filled further', () => {
    const order = makeOrder({
      status: 'EXECUTED',
      quantity: 100,
      filledQuantity: 100,
      remainingQuantity: 0,
    });
    expect(getEffectiveRemainingQuantity(order)).toBe(0);

    const stocks = [makeStock('RELIANCE', 100)];
    const qty = computeExecutableBuyQuantity(order, 100, 100000, [order], stocks);
    // EXECUTED status → isReservationEligible = false → computeOrderBuyReservation = 0
    // But computeExecutableBuyQuantity uses getEffectiveRemainingQuantity which returns 0
    expect(qty).toBe(0);
  });

  it('34. CANCELLED order cannot be filled', () => {
    const order = makeOrder({
      status: 'CANCELLED',
      quantity: 100,
      filledQuantity: 30,
      remainingQuantity: 70,
    });
    // isReservationEligible is false for CANCELLED
    expect(isReservationEligible('CANCELLED')).toBe(false);
    expect(isTerminalStatus('CANCELLED')).toBe(true);
  });
});

// ── 9. Partially Filled Cancellation ────────────────────────────────────────

describe('Phase B — Partially filled cancellation', () => {
  it('35. PARTIALLY_FILLED order can transition to CANCELLED', () => {
    // This tests the type/state compatibility — the actual cancelOrder logic
    // is in TradingContext. Here we verify the reservation model recognizes the transition.
    const partialOrder = makeOrder({
      status: 'PARTIALLY_FILLED',
      quantity: 100,
      filledQuantity: 40,
      remainingQuantity: 60,
    });
    expect(isTerminalStatus(partialOrder.status)).toBe(false);
    expect(isReservationEligible(partialOrder.status)).toBe(true);

    // After cancellation
    const cancelledOrder: Order = {
      ...partialOrder,
      status: 'CANCELLED',
      cancelledAt: new Date().toISOString(),
    };
    expect(isTerminalStatus(cancelledOrder.status)).toBe(true);
    expect(isReservationEligible(cancelledOrder.status)).toBe(false);

    // Filled portion preserved
    expect(cancelledOrder.filledQuantity).toBe(40);
  });

  it('36. Cancelled partial BUY releases only remaining reservation', () => {
    const stocks = [makeStock('RELIANCE', 100)];

    // Before cancellation: reserves for remaining 60
    const partialOrder = makeOrder({
      id: 'O1', side: 'BUY', quantity: 100, requestedPrice: 100,
      status: 'PARTIALLY_FILLED', filledQuantity: 40, remainingQuantity: 60,
    });
    expect(computeOrderBuyReservation(partialOrder, stocks)).toBe(6000);

    // After cancellation: reserves nothing
    const cancelled: Order = { ...partialOrder, status: 'CANCELLED' as OrderStatus };
    expect(computeOrderBuyReservation(cancelled, stocks)).toBe(0);
  });

  it('37. Cancelled partial SELL releases only remaining reservation', () => {
    const partialOrder = makeOrder({
      id: 'O1', side: 'SELL', quantity: 50, requestedPrice: 100,
      status: 'PARTIALLY_FILLED', filledQuantity: 20, remainingQuantity: 30,
    });
    expect(computeOrderSellReservation(partialOrder, 'RELIANCE')).toBe(30);

    const cancelled: Order = { ...partialOrder, status: 'CANCELLED' as OrderStatus };
    expect(computeOrderSellReservation(cancelled, 'RELIANCE')).toBe(0);
  });
});

// ── 10. GTT Partial Fill Regression ─────────────────────────────────────────

describe('Phase B — GTT partial fill regression', () => {
  it('38. PARTIALLY_FILLED is eligible for GTT trigger evaluation', () => {
    expect(isGttEligibleForTrigger('PARTIALLY_FILLED')).toBe(true);
  });

  it('39. PARTIALLY_FILLED LIMIT re-evaluates trigger on next tick', () => {
    const order = makeOrder({
      status: 'PARTIALLY_FILLED',
      type: 'LIMIT',
      side: 'BUY',
      quantity: 100,
      requestedPrice: 100,
      filledQuantity: 30,
      remainingQuantity: 70,
      isGTT: true,
    });
    // Price at limit → should trigger execution
    const result = evaluateOrderTrigger(order, 100);
    expect(result.met).toBe(true);
    expect(result.nextStatus).toBe('EXECUTED');
  });

  it('40. PARTIALLY_FILLED LIMIT does not trigger when price above limit (BUY)', () => {
    const order = makeOrder({
      status: 'PARTIALLY_FILLED',
      type: 'LIMIT',
      side: 'BUY',
      quantity: 100,
      requestedPrice: 100,
      filledQuantity: 30,
      remainingQuantity: 70,
      isGTT: true,
    });
    // Price above limit → should not trigger
    const result = evaluateOrderTrigger(order, 110);
    expect(result.met).toBe(false);
  });

  it('41. PARTIALLY_FILLED STOP_LIMIT evaluates limit condition only', () => {
    const order = makeOrder({
      status: 'PARTIALLY_FILLED',
      type: 'STOP_LIMIT',
      side: 'SELL',
      quantity: 100,
      requestedPrice: 90, // limit price
      triggerPrice: 95, // already triggered
      filledQuantity: 40,
      remainingQuantity: 60,
      triggeredAt: '2026-01-01T09:00:00Z',
      isGTT: true,
    });
    // Price at limit → should execute
    const result = evaluateOrderTrigger(order, 92);
    expect(result.met).toBe(true);
  });

  it('42. PARTIALLY_FILLED STOP_LIMIT does not execute when price above limit (SELL)', () => {
    const order = makeOrder({
      status: 'PARTIALLY_FILLED',
      type: 'STOP_LIMIT',
      side: 'SELL',
      quantity: 100,
      requestedPrice: 90, // limit price
      triggerPrice: 95,
      filledQuantity: 40,
      remainingQuantity: 60,
      triggeredAt: '2026-01-01T09:00:00Z',
      isGTT: true,
    });
    // Price below limit → should not trigger for SELL (need >= requestedPrice)
    // Wait, for SELL stop-limit: limit condition is currentPrice >= requestedPrice
    const result = evaluateOrderTrigger(order, 85);
    expect(result.met).toBe(false);
  });
});

// ── 11. Bracket/OCO Regression with Reservation Model ───────────────────────

describe('Phase B — Bracket/OCO regression', () => {
  it('43. Bracket child (SELL) reservation uses full quantity (no partial fill on bracket children)', () => {
    // Bracket children do not have filledQuantity/remainingQuantity set
    const slOrder = makeOrder({
      id: 'SL-001',
      side: 'SELL',
      type: 'STOP_MARKET',
      quantity: 50,
      status: 'TRIGGERED',
      // No filledQuantity or remainingQuantity
    });
    expect(computeOrderSellReservation(slOrder, 'RELIANCE')).toBe(50);
  });

  it('44. Bracket child reservation is 0 after execution (EXECUTED)', () => {
    const executedSL = makeOrder({
      id: 'SL-001',
      side: 'SELL',
      type: 'STOP_MARKET',
      quantity: 50,
      status: 'EXECUTED',
      executionPrice: 2300,
      totalValue: 115000,
    });
    expect(computeOrderSellReservation(executedSL, 'RELIANCE')).toBe(0);
  });

  it('45. Bracket child reservation is 0 after cancellation (CANCELLED)', () => {
    const cancelledTarget = makeOrder({
      id: 'TGT-001',
      side: 'SELL',
      type: 'TARGET',
      quantity: 50,
      status: 'CANCELLED',
      cancelledAt: new Date().toISOString(),
    });
    expect(computeOrderSellReservation(cancelledTarget, 'RELIANCE')).toBe(0);
  });
});

// ── 12. Historical Backward Compatibility ───────────────────────────────────

describe('Phase B — Historical backward compatibility', () => {
  it('46. Historical PENDING order without new fields: reservation = full quantity', () => {
    const stocks = [makeStock('RELIANCE', 100)];
    const historicalOrder = makeOrder({
      side: 'BUY',
      quantity: 25,
      requestedPrice: 100,
      status: 'PENDING',
      // No filledQuantity, remainingQuantity, charges
    });
    expect(computeOrderBuyReservation(historicalOrder, stocks)).toBe(2500);
  });

  it('47. Historical EXECUTED order without new fields: reservation = 0', () => {
    const stocks = [makeStock('RELIANCE', 100)];
    const historicalOrder = makeOrder({
      side: 'BUY',
      quantity: 25,
      requestedPrice: 100,
      status: 'EXECUTED',
      executionPrice: 100,
      totalValue: 2500,
    });
    expect(computeOrderBuyReservation(historicalOrder, stocks)).toBe(0);
  });

  it('48. Historical CANCELLED order without new fields: reservation = 0', () => {
    const stocks = [makeStock('RELIANCE', 100)];
    const historicalOrder = makeOrder({
      side: 'BUY',
      quantity: 25,
      requestedPrice: 100,
      status: 'CANCELLED',
      cancelledAt: '2026-01-01T12:00:00Z',
    });
    expect(computeOrderBuyReservation(historicalOrder, stocks)).toBe(0);
  });
});

// ── 13. Persistence and Recovery ────────────────────────────────────────────

describe('Phase B — Persistence and recovery', () => {
  it('49. PARTIALLY_FILLED order serialized and deserialized preserves tracking fields', () => {
    const order = makeOrder({
      status: 'PARTIALLY_FILLED',
      quantity: 100,
      filledQuantity: 60,
      remainingQuantity: 40,
    });

    const serialized = JSON.stringify(order);
    const deserialized: Order = JSON.parse(serialized);

    expect(deserialized.status).toBe('PARTIALLY_FILLED');
    expect(deserialized.filledQuantity).toBe(60);
    expect(deserialized.remainingQuantity).toBe(40);
    expect(getEffectiveFilledQuantity(deserialized)).toBe(60);
    expect(getEffectiveRemainingQuantity(deserialized)).toBe(40);
  });

  it('50. PARTIALLY_FILLED order recovered without new fields uses derived values', () => {
    // Simulate an order recovered from storage that only has status=PARTIALLY_FILLED
    // but somehow lost its tracking fields (edge case)
    const recovered: Order = {
      ...makeOrder({ status: 'PARTIALLY_FILLED', quantity: 80 }),
      // filledQuantity and remainingQuantity are undefined
    };
    delete (recovered as unknown as Record<string, unknown>).filledQuantity;
    delete (recovered as unknown as Record<string, unknown>).remainingQuantity;

    // Should derive: filled = 0 (no explicit tracking), remaining = 80
    expect(getEffectiveFilledQuantity(recovered)).toBe(0);
    expect(getEffectiveRemainingQuantity(recovered)).toBe(80);
  });

  it('51. TransactionCosts round-trips through JSON', () => {
    const order = makeOrder({
      charges: {
        brokerage: 20,
        stt: 100,
        gst: 30,
        totalCharges: 150,
      },
    });

    const roundTripped: Order = JSON.parse(JSON.stringify(order));
    expect(roundTripped.charges?.brokerage).toBe(20);
    expect(roundTripped.charges?.stt).toBe(100);
    expect(roundTripped.charges?.gst).toBe(30);
    expect(roundTripped.charges?.totalCharges).toBe(150);
    // Fields not set remain undefined
    expect(roundTripped.charges?.stampDuty).toBeUndefined();
  });
});

// ── 14. Edge Cases ──────────────────────────────────────────────────────────

describe('Phase B — Edge cases', () => {
  it('52. BUY executable quantity with fractional cash (uses Math.floor)', () => {
    const order = makeOrder({ side: 'BUY', quantity: 100, requestedPrice: 33.33 });
    const stocks = [makeStock('RELIANCE', 33.33)];
    // Cash: 100, price: 33.33, Math.floor(100 / 33.33) = 3
    const qty = computeExecutableBuyQuantity(order, 33.33, 100, [order], stocks);
    expect(qty).toBe(3);
  });

  it('53. SELL executable quantity with zero holdings returns 0', () => {
    const order = makeOrder({ side: 'SELL', quantity: 10, requestedPrice: 100 });
    const holdings: Holding[] = []; // No holdings
    const qty = computeExecutableSellQuantity(order, holdings, [order]);
    expect(qty).toBe(0);
  });

  it('54. BUY executable quantity with zero price returns 0', () => {
    const order = makeOrder({ side: 'BUY', quantity: 100, requestedPrice: 0 });
    const stocks = [makeStock('RELIANCE', 0)];
    const qty = computeExecutableBuyQuantity(order, 0, 100000, [order], stocks);
    expect(qty).toBe(0);
  });

  it('55. Remaining quantity stays non-negative even with over-fill tracking', () => {
    const order = makeOrder({
      status: 'PARTIALLY_FILLED',
      quantity: 100,
      filledQuantity: 110, // Over-fill
      remainingQuantity: -10, // Negative (should clamp)
    });
    expect(getEffectiveRemainingQuantity(order)).toBe(0);
    expect(getEffectiveFilledQuantity(order)).toBe(100); // Clamped to quantity
  });
});
