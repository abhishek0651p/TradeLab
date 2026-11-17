/* ── Day 31.1: GTT Order Engine Tests ─────────────────────────────────────────────
Pure-function tests for GttOrderEngine helpers.
──────────────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { Order, OrderStatus, OrderSide, OrderType, PlaceOrderParams } from '../types';
import {
  evaluateOrderTrigger,
  computeTrailingUpdate,
  isGttExpired,
  canCancelGttOrder,
  validateTriggerPrices,
  validateTriggerLimitConsistency,
  validateGttCreation,
  inspectGttOrdersStorage,
  reconcileGttOrders,
  isValidPersistedOrder,
  isGttTerminalStatus,
  isGttEligibleForTrigger,
  GttPersistenceStatus,
} from '../engine/GttOrderEngine';

/* ──────────────────────────────────────────────
   Test data factories
────────────────────────────────────────────── */

const baseOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 'ORD-001',
  symbol: 'RELIANCE',
  companyName: 'Reliance Industries',
  side: 'BUY' as OrderSide,
  type: 'STOP_LIMIT' as OrderType,
  quantity: 10,
  requestedPrice: 2500,
  triggerPrice: 2550,
  executionPrice: null,
  totalValue: null,
  status: 'PENDING' as OrderStatus,
  createdAt: '2024-01-01T00:00:00Z',
  executedAt: null,
  cancelledAt: null,
  rejectionReason: null,
  isGTT: true,
  expiry: null,
  trailingConfig: undefined,
  highestPriceSinceCreation: undefined,
  lowestPriceSinceCreation: undefined,
  triggeredAt: null,
  ...overrides,
});

const baseParams = (overrides: Partial<PlaceOrderParams> = {}): PlaceOrderParams => ({
  symbol: 'RELIANCE',
  companyName: 'Reliance Industries',
  side: 'BUY',
  orderType: 'STOP_LIMIT',
  quantity: 10,
  limitPrice: 2500,
  triggerPrice: 2550,
  currentPrice: 2400,
  isGTT: true,
  expiry: null,
  trailingConfig: undefined,
  ...overrides,
});

/* ──────────────────────────────────────────────
   1. Trigger validation tests
────────────────────────────────────────────── */

describe('validateTriggerPrices', () => {
  it('rejects BUY STOP with trigger <= currentPrice', () => {
    const r = validateTriggerPrices(
      { ...baseParams(), side: 'BUY', orderType: 'STOP_MARKET' as OrderType, currentPrice: 2500, triggerPrice: 2500 },
      2500
    );
    expect(r.valid).toBe(false);
    expect(r.error).toContain('above current market price');
  });

  it('rejects BUY STOP with trigger < currentPrice', () => {
    const r = validateTriggerPrices(
      { ...baseParams(), side: 'BUY', orderType: 'STOP_LIMIT' as OrderType, currentPrice: 2500, triggerPrice: 2400 },
      2400
    );
    expect(r.valid).toBe(false);
    expect(r.error).toContain('above current market price');
  });

  it('accepts BUY STOP with trigger > currentPrice', () => {
    const r = validateTriggerPrices(
      { ...baseParams(), side: 'BUY', orderType: 'STOP_MARKET' as OrderType, currentPrice: 2500, triggerPrice: 2600 },
      2600
    );
    expect(r.valid).toBe(true);
  });

  it('rejects SELL STOP with trigger >= currentPrice', () => {
    const r = validateTriggerPrices(
      { ...baseParams(), side: 'SELL', orderType: 'STOP_MARKET' as OrderType, currentPrice: 2500, triggerPrice: 2500 },
      2500
    );
    expect(r.valid).toBe(false);
    expect(r.error).toContain('below current market price');
  });

  it('accepts SELL STOP with trigger < currentPrice', () => {
    const r = validateTriggerPrices(
      { ...baseParams(), side: 'SELL', orderType: 'STOP_LIMIT' as OrderType, currentPrice: 2500, triggerPrice: 2400 },
      2400
    );
    expect(r.valid).toBe(true);
  });

  it('rejects BUY TARGET with trigger >= currentPrice', () => {
    const r = validateTriggerPrices(
      { ...baseParams(), side: 'BUY', orderType: 'TARGET' as OrderType, currentPrice: 2500, triggerPrice: 2500 },
      2500
    );
    expect(r.valid).toBe(false);
    expect(r.error).toContain('below current market price');
  });

  it('accepts BUY TARGET with trigger < currentPrice', () => {
    const r = validateTriggerPrices(
      { ...baseParams(), side: 'BUY', orderType: 'TARGET' as OrderType, currentPrice: 2500, triggerPrice: 2400 },
      2400
    );
    expect(r.valid).toBe(true);
  });

  it('rejects SELL TARGET with trigger <= currentPrice', () => {
    const r = validateTriggerPrices(
      { ...baseParams(), side: 'SELL', orderType: 'TARGET' as OrderType, currentPrice: 2500, triggerPrice: 2500 },
      2500
    );
    expect(r.valid).toBe(false);
    expect(r.error).toContain('above current market price');
  });

  it('accepts SELL TARGET with trigger > currentPrice', () => {
    const r = validateTriggerPrices(
      { ...baseParams(), side: 'SELL', orderType: 'TARGET' as OrderType, currentPrice: 2500, triggerPrice: 2600 },
      2600
    );
    expect(r.valid).toBe(true);
  });

  it('rejects zero or negative trigger price', () => {
    expect(validateTriggerPrices(baseParams(), 0).valid).toBe(false);
    expect(validateTriggerPrices(baseParams(), -10).valid).toBe(false);
  });

  it('returns valid for LIMIT orders (no trigger validation)', () => {
    const r = validateTriggerPrices(
      { ...baseParams(), orderType: 'LIMIT' as OrderType },
      undefined
    );
    expect(r.valid).toBe(true);
  });

  it('returns valid for MARKET orders', () => {
    const r = validateTriggerPrices(
      { ...baseParams(), orderType: 'MARKET' as OrderType },
      undefined
    );
    expect(r.valid).toBe(true);
  });
});

/* ──────────────────────────────────────────────
   2. STOP trigger evaluation tests
────────────────────────────────────────────── */

describe('evaluateOrderTrigger', () => {
  it('PENDING BUY STOP_MARKET triggers when price >= trigger', () => {
    const o = baseOrder({ type: 'STOP_MARKET' as OrderType, side: 'BUY', triggerPrice: 2550, status: 'PENDING' });
    const r = evaluateOrderTrigger(o, 2550);
    expect(r.met).toBe(true);
    expect(r.nextStatus).toBe('EXECUTED');
    expect(r.reason).toContain('Buy stop triggered');
  });

  it('PENDING BUY STOP_MARKET does not trigger when price < trigger', () => {
    const o = baseOrder({ type: 'STOP_MARKET' as OrderType, side: 'BUY', triggerPrice: 2550 });
    const r = evaluateOrderTrigger(o, 2549);
    expect(r.met).toBe(false);
  });

  it('PENDING SELL STOP_MARKET triggers when price <= trigger', () => {
    const o = baseOrder({ type: 'STOP_MARKET' as OrderType, side: 'SELL', triggerPrice: 2450 });
    const r = evaluateOrderTrigger(o, 2450);
    expect(r.met).toBe(true);
    expect(r.nextStatus).toBe('EXECUTED');
    expect(r.reason).toContain('Sell stop triggered');
  });

  it('PENDING BUY TARGET triggers when price <= trigger', () => {
    const o = baseOrder({ type: 'TARGET' as OrderType, side: 'BUY', triggerPrice: 2450 });
    const r = evaluateOrderTrigger(o, 2450);
    expect(r.met).toBe(true);
    expect(r.nextStatus).toBe('EXECUTED');
    expect(r.reason).toContain('Buy target triggered');
  });

  it('PENDING SELL TARGET triggers when price >= trigger', () => {
    const o = baseOrder({ type: 'TARGET' as OrderType, side: 'SELL', triggerPrice: 2550 });
    const r = evaluateOrderTrigger(o, 2550);
    expect(r.met).toBe(true);
    expect(r.nextStatus).toBe('EXECUTED');
    expect(r.reason).toContain('Sell target triggered');
  });

  it('PENDING STOP_LIMIT transitions to TRIGGERED (not EXECUTED) on trigger hit', () => {
    const o = baseOrder({ type: 'STOP_LIMIT' as OrderType, side: 'BUY', triggerPrice: 2550 });
    const r = evaluateOrderTrigger(o, 2550);
    expect(r.met).toBe(true);
    expect(r.nextStatus).toBe('TRIGGERED');
    expect(r.reason).toContain('Buy stop-limit trigger reached');
  });

  it('TRIGGERED STOP_LIMIT transitions to EXECUTED when limit met', () => {
    const o = baseOrder({ type: 'STOP_LIMIT' as OrderType, side: 'BUY', triggerPrice: 2550, requestedPrice: 2600, status: 'TRIGGERED' });
    const r = evaluateOrderTrigger(o, 2600);
    expect(r.met).toBe(true);
    expect(r.nextStatus).toBe('EXECUTED');
    expect(r.reason).toContain('limit price reached');
  });

  it('TRIGGERED STOP_LIMIT does not execute when limit not met', () => {
    const o = baseOrder({ type: 'STOP_LIMIT' as OrderType, side: 'BUY', triggerPrice: 2550, requestedPrice: 2600, status: 'TRIGGERED' });
    const r = evaluateOrderTrigger(o, 2700);
    expect(r.met).toBe(false);
  });

  it('returns false for terminal statuses', () => {
    ['EXECUTED', 'CANCELLED', 'REJECTED'].forEach(s => {
      const o = baseOrder({ status: s as OrderStatus });
      const r = evaluateOrderTrigger(o, 2600);
      expect(r.met).toBe(false);
      expect(r.reason).toContain('not eligible');
    });
  });

  it('rejects invalid trigger price', () => {
    const o = baseOrder({ triggerPrice: 0 });
    const r = evaluateOrderTrigger(o, 2500);
    expect(r.met).toBe(false);
    expect(r.reason).toContain('Invalid trigger price');
  });

  it('LIMIT order executes when price meets requestedPrice', () => {
    const o = baseOrder({ type: 'LIMIT' as OrderType, side: 'BUY', requestedPrice: 2400, triggerPrice: undefined });
    const r = evaluateOrderTrigger(o, 2400);
    expect(r.met).toBe(true);
    expect(r.nextStatus).toBe('EXECUTED');
    expect(r.reason).toContain('limit price reached');
  });
});

/* ──────────────────────────────────────────────
   3. STOP_LIMIT trigger/limit consistency tests
────────────────────────────────────────────── */

describe('validateTriggerLimitConsistency', () => {
  it('rejects BUY STOP_LIMIT when limit < trigger', () => {
    const r = validateTriggerLimitConsistency(
      { ...baseParams(), side: 'BUY', orderType: 'STOP_LIMIT', limitPrice: 2500, triggerPrice: 2600 },
      2600
    );
    expect(r.valid).toBe(false);
    expect(r.error).toContain('limit price must be greater than or equal to trigger price');
  });

  it('accepts BUY STOP_LIMIT when limit == trigger', () => {
    const r = validateTriggerLimitConsistency(
      { ...baseParams(), side: 'BUY', orderType: 'STOP_LIMIT', limitPrice: 2550, triggerPrice: 2550 },
      2550
    );
    expect(r.valid).toBe(true);
  });

  it('accepts BUY STOP_LIMIT when limit > trigger', () => {
    const r = validateTriggerLimitConsistency(
      { ...baseParams(), side: 'BUY', orderType: 'STOP_LIMIT', limitPrice: 2600, triggerPrice: 2550 },
      2550
    );
    expect(r.valid).toBe(true);
  });

  it('rejects SELL STOP_LIMIT when limit > trigger', () => {
    const r = validateTriggerLimitConsistency(
      { ...baseParams(), side: 'SELL', orderType: 'STOP_LIMIT', limitPrice: 2600, triggerPrice: 2550 },
      2550
    );
    expect(r.valid).toBe(false);
    expect(r.error).toContain('limit price must be less than or equal to trigger price');
  });

  it('accepts SELL STOP_LIMIT when limit == trigger', () => {
    const r = validateTriggerLimitConsistency(
      { ...baseParams(), side: 'SELL', orderType: 'STOP_LIMIT', limitPrice: 2550, triggerPrice: 2550 },
      2550
    );
    expect(r.valid).toBe(true);
  });

  it('accepts SELL STOP_LIMIT when limit < trigger', () => {
    const r = validateTriggerLimitConsistency(
      { ...baseParams(), side: 'SELL', orderType: 'STOP_LIMIT', limitPrice: 2500, triggerPrice: 2550 },
      2550
    );
    expect(r.valid).toBe(true);
  });

  it('returns valid for non-STOP_LIMIT orders', () => {
    expect(validateTriggerLimitConsistency({ ...baseParams(), orderType: 'LIMIT' }, 2500).valid).toBe(true);
    expect(validateTriggerLimitConsistency({ ...baseParams(), orderType: 'STOP_MARKET' }, 2500).valid).toBe(true);
    expect(validateTriggerLimitConsistency({ ...baseParams(), orderType: 'TARGET' }, 2500).valid).toBe(true);
    expect(validateTriggerLimitConsistency({ ...baseParams(), orderType: 'MARKET' }, 2500).valid).toBe(true);
  });

  it('rejects missing limit price', () => {
    const r = validateTriggerLimitConsistency(
      { ...baseParams(), orderType: 'STOP_LIMIT', limitPrice: undefined, triggerPrice: 2550 },
      2550
    );
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Limit price must be greater than zero');
  });
});

/* ──────────────────────────────────────────────
   4. LIMIT trigger behavior tests
────────────────────────────────────────────── */

describe('evaluateOrderTrigger LIMIT', () => {
  it('BUY LIMIT executes when price <= requestedPrice', () => {
    const o = baseOrder({ type: 'LIMIT', side: 'BUY', requestedPrice: 2450, triggerPrice: undefined });
    const r = evaluateOrderTrigger(o, 2450);
    expect(r.met).toBe(true);
    expect(r.nextStatus).toBe('EXECUTED');
  });

  it('BUY LIMIT does not execute when price > requestedPrice', () => {
    const o = baseOrder({ type: 'LIMIT', side: 'BUY', requestedPrice: 2450, triggerPrice: undefined });
    const r = evaluateOrderTrigger(o, 2451);
    expect(r.met).toBe(false);
  });

  it('SELL LIMIT executes when price >= requestedPrice', () => {
    const o = baseOrder({ type: 'LIMIT', side: 'SELL', requestedPrice: 2550, triggerPrice: undefined });
    const r = evaluateOrderTrigger(o, 2550);
    expect(r.met).toBe(true);
    expect(r.nextStatus).toBe('EXECUTED');
  });

  it('SELL LIMIT does not execute when price < requestedPrice', () => {
    const o = baseOrder({ type: 'LIMIT', side: 'SELL', requestedPrice: 2550, triggerPrice: undefined });
    const r = evaluateOrderTrigger(o, 2549);
    expect(r.met).toBe(false);
  });
});

/* ──────────────────────────────────────────────
   5. Trailing update behavior tests
────────────────────────────────────────────── */

describe('computeTrailingUpdate', () => {
  it('returns not updated for non-GTT orders', () => {
    const o = baseOrder({ isGTT: false, trailingConfig: { distance: 50, distanceType: 'absolute' } });
    const r = computeTrailingUpdate(o, 2600);
    expect(r.updated).toBe(false);
    expect(r.reason).toContain('No trailing config');
  });

  it('returns not updated for GTT without trailing config', () => {
    const o = baseOrder({ trailingConfig: undefined });
    const r = computeTrailingUpdate(o, 2600);
    expect(r.updated).toBe(false);
    expect(r.reason).toContain('No trailing config');
  });

  it('returns not updated for terminal orders', () => {
    ['EXECUTED', 'CANCELLED', 'REJECTED'].forEach(s => {
      const o = baseOrder({ status: s as OrderStatus });
      const r = computeTrailingUpdate(o, 2600);
      expect(r.updated).toBe(false);
      // Engine returns 'No trailing config' for terminal orders (trailingConfig is checked first)
      expect(r.reason).toContain('No trailing config');
    });
  });

  it('SELL trailing: updates on new peak (absolute)', () => {
    const o = baseOrder({ side: 'SELL', trailingConfig: { distance: 50, distanceType: 'absolute' }, highestPriceSinceCreation: 2500, triggerPrice: 2450 });
    const r = computeTrailingUpdate(o, 2600); // new peak
    expect(r.updated).toBe(true);
    expect(r.newHighestPrice).toBe(2600);
    expect(r.newTriggerPrice).toBe(2550); // 2600 - 50
    expect(r.newTriggerPrice! > o.triggerPrice!).toBe(true); // trigger raised
  });

  it('SELL trailing: does not update when price <= peak', () => {
    const o = baseOrder({ side: 'SELL', trailingConfig: { distance: 50, distanceType: 'absolute' }, highestPriceSinceCreation: 2600, triggerPrice: 2550 });
    const r = computeTrailingUpdate(o, 2580); // below peak
    expect(r.updated).toBe(false);
    expect(r.reason).toContain('did not exceed peak');
  });

  it('SELL trailing: updates on new peak (percent)', () => {
    const o = baseOrder({ side: 'SELL', trailingConfig: { distance: 2, distanceType: 'percent' }, highestPriceSinceCreation: 2500, triggerPrice: 2450 });
    const r = computeTrailingUpdate(o, 2600); // new peak = 2600, trigger = 2600 * 0.98 = 2548
    expect(r.updated).toBe(true);
    expect(r.newTriggerPrice).toBe(2548);
    expect(r.newTriggerPrice! > o.triggerPrice!).toBe(true);
  });

  it('SELL trailing: only raises trigger (never lowers)', () => {
    const o = baseOrder({ side: 'SELL', trailingConfig: { distance: 50, distanceType: 'absolute' }, highestPriceSinceCreation: 2600, triggerPrice: 2550 });
    const r = computeTrailingUpdate(o, 2700); // new peak, trigger = 2700 - 50 = 2650
    expect(r.updated).toBe(true);
    expect(r.newTriggerPrice).toBe(2650);
  });

  it('BUY trailing: updates on new trough (absolute)', () => {
    const o = baseOrder({ side: 'BUY', trailingConfig: { distance: 50, distanceType: 'absolute' }, lowestPriceSinceCreation: 2500, triggerPrice: 2550 });
    const r = computeTrailingUpdate(o, 2400); // new trough
    expect(r.updated).toBe(true);
    expect(r.newLowestPrice).toBe(2400);
    expect(r.newTriggerPrice).toBe(2450); // 2400 + 50
    expect(r.newTriggerPrice! < o.triggerPrice!).toBe(true); // trigger lowered
  });

  it('BUY trailing: does not update when price >= trough', () => {
    const o = baseOrder({ side: 'BUY', trailingConfig: { distance: 50, distanceType: 'absolute' }, lowestPriceSinceCreation: 2400, triggerPrice: 2450 });
    const r = computeTrailingUpdate(o, 2420); // above trough
    expect(r.updated).toBe(false);
    expect(r.reason).toContain('did not fall below trough');
  });

  it('BUY trailing: updates on new trough (percent)', () => {
    const o = baseOrder({ side: 'BUY', trailingConfig: { distance: 2, distanceType: 'percent' }, lowestPriceSinceCreation: 2500, triggerPrice: 2550 });
    const r = computeTrailingUpdate(o, 2400); // new trough = 2400, trigger = 2400 * 1.02 = 2448
    expect(r.updated).toBe(true);
    expect(r.newTriggerPrice).toBe(2448);
    expect(r.newTriggerPrice! < o.triggerPrice!).toBe(true);
  });

  it('BUY trailing: only lowers trigger (never raises)', () => {
    const o = baseOrder({ side: 'BUY', trailingConfig: { distance: 50, distanceType: 'absolute' }, lowestPriceSinceCreation: 2400, triggerPrice: 2450 });
    const r = computeTrailingUpdate(o, 2300); // new trough, trigger = 2300 + 50 = 2350
    expect(r.updated).toBe(true);
    expect(r.newTriggerPrice).toBe(2350);
  });
});

/* ──────────────────────────────────────────────
   6. Expiry handling tests
────────────────────────────────────────────── */

describe('isGttExpired', () => {
  const futureExpiry = new Date(Date.now() + 86400000).toISOString(); // +1 day
  const pastExpiry = new Date(Date.now() - 86400000).toISOString(); // -1 day

  it('returns false for non-GTT orders', () => {
    expect(isGttExpired(baseOrder({ isGTT: false, expiry: futureExpiry }))).toBe(false);
  });

  it('returns false for GTC (expiry null)', () => {
    expect(isGttExpired(baseOrder({ isGTT: true, expiry: null }))).toBe(false);
  });

  it('returns false for GTC (expiry undefined)', () => {
    expect(isGttExpired(baseOrder({ isGTT: true, expiry: undefined }))).toBe(false);
  });

  it('returns false for future expiry', () => {
    expect(isGttExpired(baseOrder({ isGTT: true, expiry: futureExpiry }))).toBe(false);
  });

  it('returns true for past expiry', () => {
    expect(isGttExpired(baseOrder({ isGTT: true, expiry: pastExpiry }))).toBe(true);
  });

  it('returns false for terminal orders even if expired', () => {
    ['EXECUTED', 'CANCELLED', 'REJECTED'].forEach(s => {
      expect(isGttExpired(baseOrder({ isGTT: true, expiry: pastExpiry, status: s as OrderStatus }))).toBe(false);
    });
  });

  it('works with custom now parameter', () => {
    const now = new Date('2024-06-15T00:00:00Z').getTime();
    const expiry = new Date('2024-06-14T00:00:00Z').toISOString();
    expect(isGttExpired(baseOrder({ isGTT: true, expiry }), now)).toBe(true);
  });
});

/* ──────────────────────────────────────────────
   7. Cancellation policy tests
────────────────────────────────────────────── */

describe('canCancelGttOrder', () => {
  // Non-GTT orders: only PENDING
  it('allows PENDING non-GTT', () => {
    const r = canCancelGttOrder(baseOrder({ isGTT: false, status: 'PENDING' }));
    expect(r.allowed).toBe(true);
  });

  it('rejects TRIGGERED non-GTT', () => {
    const r = canCancelGttOrder(baseOrder({ isGTT: false, status: 'TRIGGERED' }));
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('Only PENDING');
  });

  it('rejects EXECUTED non-GTT', () => {
    const r = canCancelGttOrder(baseOrder({ isGTT: false, status: 'EXECUTED' }));
    expect(r.allowed).toBe(false);
  });

  it('rejects CANCELLED non-GTT', () => {
    const r = canCancelGttOrder(baseOrder({ isGTT: false, status: 'CANCELLED' }));
    expect(r.allowed).toBe(false);
  });

  it('rejects REJECTED non-GTT', () => {
    const r = canCancelGttOrder(baseOrder({ isGTT: false, status: 'REJECTED' }));
    expect(r.allowed).toBe(false);
  });

  // GTT orders: PENDING and TRIGGERED
  it('allows PENDING GTT', () => {
    const r = canCancelGttOrder(baseOrder({ isGTT: true, status: 'PENDING' }));
    expect(r.allowed).toBe(true);
  });

  it('allows TRIGGERED GTT (triggered-but-not-executed)', () => {
    const r = canCancelGttOrder(baseOrder({ isGTT: true, status: 'TRIGGERED' }));
    expect(r.allowed).toBe(true);
  });

  it('rejects EXECUTED GTT', () => {
    const r = canCancelGttOrder(baseOrder({ isGTT: true, status: 'EXECUTED' }));
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('already EXECUTED');
  });

  it('rejects CANCELLED GTT (no duplicate cancellation)', () => {
    const r = canCancelGttOrder(baseOrder({ isGTT: true, status: 'CANCELLED' }));
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('already CANCELLED');
  });

  it('rejects REJECTED GTT (expired)', () => {
    const r = canCancelGttOrder(baseOrder({ isGTT: true, status: 'REJECTED' }));
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('already REJECTED');
  });
});

/* ──────────────────────────────────────────────
   8. Duplicate-trigger prevention tests
────────────────────────────────────────────── */

describe('evaluateOrderTrigger duplicate prevention', () => {
  it('PENDING → TRIGGERED STOP_LIMIT stays TRIGGERED on re-evaluation at same price', () => {
    const o1 = baseOrder({ type: 'STOP_LIMIT', side: 'BUY', triggerPrice: 2550, status: 'PENDING' });
    const r1 = evaluateOrderTrigger(o1, 2550);
    expect(r1.nextStatus).toBe('TRIGGERED');

    // Simulate transition to TRIGGERED
    const o2 = { ...o1, status: 'TRIGGERED' as OrderStatus, triggeredAt: '2024-01-01T00:00:01Z' };
    const r2 = evaluateOrderTrigger(o2, 2550);
    // TRIGGERED STOP_LIMIT does NOT re-trigger — only checks limit condition
    expect(r2.met).toBe(false);
  });

  it('TRIGGERED STOP_LIMIT only executes on limit, not re-trigger', () => {
    const o = baseOrder({ type: 'STOP_LIMIT', side: 'BUY', triggerPrice: 2550, requestedPrice: 2600, status: 'TRIGGERED' });
    // Price above limit (2600), so limit condition not met — stays TRIGGERED
    expect(evaluateOrderTrigger(o, 2700).met).toBe(false);
    // Price at limit, executes
    expect(evaluateOrderTrigger(o, 2600).nextStatus).toBe('EXECUTED');
  });

  it('STOP_MARKET/TARGET go directly EXECUTED — no TRIGGERED state to re-trigger', () => {
    const o = baseOrder({ type: 'STOP_MARKET', side: 'BUY', triggerPrice: 2550 });
    expect(evaluateOrderTrigger(o, 2550).nextStatus).toBe('EXECUTED');
  });
});

/* ──────────────────────────────────────────────
   9. triggeredAt assignment tests
────────────────────────────────────────────── */

describe('triggeredAt lifecycle', () => {
  it('is null on order creation', () => {
    const o = baseOrder({ triggeredAt: null });
    expect(o.triggeredAt).toBeNull();
  });

  it('can be set on PENDING → TRIGGERED transition', () => {
    const o = baseOrder({ status: 'PENDING', triggeredAt: null });
    const timestamp = new Date().toISOString();
    const triggered = { ...o, status: 'TRIGGERED' as OrderStatus, triggeredAt: timestamp };
    expect(triggered.triggeredAt).toBe(timestamp);
  });

  it('is preserved during recovery (not overwritten)', () => {
    const o = baseOrder({ status: 'TRIGGERED', triggeredAt: '2024-01-01T00:00:01Z' });
    // Simulate recovery: triggeredAt already exists
    expect(o.triggeredAt).toBe('2024-01-01T00:00:01Z');
  });

  it('historical orders without triggeredAt remain compatible', () => {
    const o = baseOrder({ status: 'TRIGGERED', triggeredAt: undefined });
    expect(o.triggeredAt).toBeUndefined();
  });
});

/* ──────────────────────────────────────────────
   10. Persistence serialization tests
────────────────────────────────────────────── */

describe('isValidPersistedOrder', () => {
  it('accepts valid order with all fields', () => {
    const o = baseOrder({ triggeredAt: '2024-01-01T00:00:01Z' });
    expect(isValidPersistedOrder(o)).toBe(true);
  });

  it('accepts order without optional GTT fields', () => {
    const o = baseOrder({ isGTT: false, expiry: undefined, trailingConfig: undefined });
    expect(isValidPersistedOrder(o)).toBe(true);
  });

  it('rejects missing id', () => {
    expect(isValidPersistedOrder({ ...baseOrder(), id: '' })).toBe(false);
  });

  it('rejects invalid side', () => {
    expect(isValidPersistedOrder({ ...baseOrder(), side: 'INVALID' })).toBe(false);
  });

  it('rejects invalid type', () => {
    expect(isValidPersistedOrder({ ...baseOrder(), type: 'INVALID' })).toBe(false);
  });

  it('rejects invalid status', () => {
    expect(isValidPersistedOrder({ ...baseOrder(), status: 'INVALID' })).toBe(false);
  });

  it('rejects negative quantity', () => {
    expect(isValidPersistedOrder({ ...baseOrder(), quantity: -1 })).toBe(false);
  });

  it('rejects zero quantity', () => {
    expect(isValidPersistedOrder({ ...baseOrder(), quantity: 0 })).toBe(false);
  });

  it('rejects negative requestedPrice', () => {
    expect(isValidPersistedOrder({ ...baseOrder(), requestedPrice: -10 })).toBe(false);
  });

  it('rejects negative triggerPrice', () => {
    expect(isValidPersistedOrder({ ...baseOrder(), triggerPrice: -5 })).toBe(false);
  });

  it('rejects invalid trailingConfig', () => {
    expect(isValidPersistedOrder({ ...baseOrder(), trailingConfig: { distance: -1, distanceType: 'absolute' } })).toBe(false);
    expect(isValidPersistedOrder({ ...baseOrder(), trailingConfig: { distance: 50, distanceType: 'invalid' } })).toBe(false);
  });

  it('rejects invalid expiry format', () => {
    expect(isValidPersistedOrder({ ...baseOrder(), expiry: 'not-a-date' })).toBe(false);
  });

  it('rejects invalid triggeredAt type', () => {
    expect(isValidPersistedOrder({ ...baseOrder(), triggeredAt: 123 })).toBe(false);
  });

  it('accepts empty-string createdAt (type guard only checks type)', () => {
    // The engine's type guard checks typeof, not content validity
    expect(isValidPersistedOrder({ ...baseOrder(), createdAt: '' })).toBe(true);
  });
});

/* ──────────────────────────────────────────────
   11. Unsupported storage version protection
────────────────────────────────────────────── */

describe('inspectGttOrdersStorage version protection', () => {
  it('returns missing for null', () => {
    const r = inspectGttOrdersStorage(null);
    expect(r.status).toBe('missing');
    expect(r.orders).toEqual([]);
  });

  it('returns malformed for empty string', () => {
    const r = inspectGttOrdersStorage('');
    expect(r.status).toBe('malformed');
  });

  it('returns malformed for invalid JSON', () => {
    const r = inspectGttOrdersStorage('not json');
    expect(r.status).toBe('malformed');
    if (r.status === 'malformed') {
      expect(r.raw).toBe('not json');
    }
  });

  it('returns malformed for non-array JSON', () => {
    const r = inspectGttOrdersStorage('{"foo": "bar"}');
    expect(r.status).toBe('malformed');
  });

  it('returns valid for valid array', () => {
    const orders = [baseOrder()];
    const r = inspectGttOrdersStorage(JSON.stringify(orders));
    expect(r.status).toBe('valid');
    expect(r.orders).toHaveLength(1);
  });

  it('returns invalid_records when some records are invalid', () => {
    const orders = [baseOrder(), { ...baseOrder(), id: '' }]; // second invalid
    const r = inspectGttOrdersStorage(JSON.stringify(orders));
    expect(r.status).toBe('invalid_records');
    if (r.status === 'invalid_records') {
      expect(r.orders).toHaveLength(1);
      expect(r.invalidCount).toBe(1);
      // raw preserved for protection
      expect(r.raw).toContain('id');
    }
  });

  it('preserves raw string for malformed to prevent overwrite', () => {
    const bad = '[{ "id": "x" }]'; // missing required fields
    const r = inspectGttOrdersStorage(bad);
    expect(r.status).toBe('invalid_records');
    if (r.status === 'invalid_records') {
      expect(r.raw).toBe(bad);
    }
  });

  it('preserves raw for invalid_records to prevent overwrite', () => {
    const mixed = JSON.stringify([baseOrder(), { id: '' }]);
    const r = inspectGttOrdersStorage(mixed);
    expect(r.status).toBe('invalid_records');
    if (r.status === 'invalid_records') {
      expect(r.raw).toBe(mixed);
    }
  });
});

/* ──────────────────────────────────────────────
   12. Malformed storage protection tests
────────────────────────────────────────────── */

describe('inspectGttOrdersStorage malformed protection', () => {
  it('raw string preserved for malformed', () => {
    const raw = 'not json';
    const r = inspectGttOrdersStorage(raw);
    expect(r.status).toBe('malformed');
    if (r.status === 'malformed') {
      expect(r.raw).toBe(raw);
    }
  });

  it('raw string preserved for invalid_records', () => {
    const raw = JSON.stringify([baseOrder(), { id: '' }]);
    const r = inspectGttOrdersStorage(raw);
    expect(r.status).toBe('invalid_records');
    if (r.status === 'invalid_records') {
      expect(r.raw).toBe(raw);
    }
  });
});

/* ──────────────────────────────────────────────
   13. Recovery of triggered orders tests
────────────────────────────────────────────── */

describe('reconcileGttOrders recovery', () => {
  it('dedupes duplicate order IDs (keeps earliest)', () => {
    const o1 = { ...baseOrder(), id: 'DUP-1', createdAt: '2024-01-01T00:00:00Z' };
    const o2 = { ...baseOrder(), id: 'DUP-1', createdAt: '2024-01-01T00:00:01Z' }; // later
    const r = reconcileGttOrders([o1, o2], []);
    expect(r.orders).toHaveLength(1);
    expect(r.orders[0].createdAt).toBe('2024-01-01T00:00:00Z');
    expect(r.issuesDetected).toContain('Duplicate order ID detected: DUP-1');
  });

  it('marks expired non-terminal GTT as REJECTED', () => {
    const pastExpiry = new Date(Date.now() - 86400000).toISOString();
    const o = baseOrder({ isGTT: true, expiry: pastExpiry, status: 'PENDING' });
    const r = reconcileGttOrders([o], []);
    expect(r.orders[0].status).toBe('REJECTED');
    expect(r.orders[0].rejectionReason).toBe('Order has expired.');
    expect(r.issuesDetected).toContain(`GTT order ${o.id} has expired; marking REJECTED`);
  });

  it('does not expire terminal orders', () => {
    const pastExpiry = new Date(Date.now() - 86400000).toISOString();
    const o = baseOrder({ isGTT: true, expiry: pastExpiry, status: 'EXECUTED' });
    const r = reconcileGttOrders([o], []);
    expect(r.orders[0].status).toBe('EXECUTED');
  });

  it('marks order with execution record as EXECUTED', () => {
    const o = baseOrder({ status: 'TRIGGERED' });
    const r = reconcileGttOrders([o], [{ orderId: o.id }]);
    expect(r.orders[0].status).toBe('EXECUTED');
    expect(r.issuesDetected).toContain(`Order ${o.id} has execution record but status=TRIGGERED; marking EXECUTED`);
  });

  it('adds triggeredAt fallback for TRIGGERED orders missing it', () => {
    const o = baseOrder({ status: 'TRIGGERED', triggeredAt: null });
    const r = reconcileGttOrders([o], []);
    expect(r.orders[0].triggeredAt).toBe(o.createdAt);
    expect(r.issuesDetected).toContain(`Order ${o.id} is TRIGGERED but missing triggeredAt; using createdAt as fallback`);
  });

  it('preserves existing triggeredAt', () => {
    const o = baseOrder({ status: 'TRIGGERED', triggeredAt: '2024-01-01T00:00:01Z' });
    const r = reconcileGttOrders([o], []);
    expect(r.orders[0].triggeredAt).toBe('2024-01-01T00:00:01Z');
  });

  it('terminal orders stay terminal', () => {
    ['EXECUTED', 'CANCELLED', 'REJECTED'].forEach(s => {
      const o = baseOrder({ status: s as OrderStatus });
      const r = reconcileGttOrders([o], []);
      expect(r.orders[0].status).toBe(s);
    });
  });
});

/* ──────────────────────────────────────────────
   14. Historical orders without triggeredAt tests
────────────────────────────────────────────── */

describe('historical compatibility', () => {
  it('orders without triggeredAt are valid', () => {
    const o = { ...baseOrder(), triggeredAt: undefined };
    expect(isValidPersistedOrder(o)).toBe(true);
  });

  it('orders with null triggeredAt are valid', () => {
    const o = { ...baseOrder(), triggeredAt: null };
    expect(isValidPersistedOrder(o)).toBe(true);
  });

  it('reconciliation handles missing triggeredAt', () => {
    const o = baseOrder({ status: 'TRIGGERED' }); // no triggeredAt
    const r = reconcileGttOrders([o], []);
    expect(r.orders[0].triggeredAt).toBe(o.createdAt);
  });
});

/* ──────────────────────────────────────────────
   15. Regression tests for existing order execution
────────────────────────────────────────────── */

describe('regression: existing order behavior unchanged', () => {
  const stocks = [
    { symbol: 'RELIANCE', companyName: 'Reliance', price: 2500, previousClose: 2500, change: 0, changePercent: 0, open: 2500, dayHigh: 2500, dayLow: 2500, volume: 1, sector: 'Test', exchange: 'NSE', description: '' },
  ];

  it('MARKET order: evaluates to EXECUTED (not applicable here but validateTriggerPrices allows)', () => {
    const p = { ...baseParams(), orderType: 'MARKET' as OrderType };
    const r = validateTriggerPrices(p, undefined);
    expect(r.valid).toBe(true);
  });

  it('LIMIT order: evaluates to EXECUTED when price meets requestedPrice', () => {
    const o = baseOrder({ type: 'LIMIT', side: 'BUY', requestedPrice: 2450, triggerPrice: undefined });
    const r = evaluateOrderTrigger(o, 2450);
    expect(r.nextStatus).toBe('EXECUTED');
  });

  it('STOP_MARKET: evaluates to EXECUTED directly (no TRIGGERED state)', () => {
    const o = baseOrder({ type: 'STOP_MARKET', side: 'BUY', triggerPrice: 2550 });
    const r = evaluateOrderTrigger(o, 2550);
    expect(r.nextStatus).toBe('EXECUTED');
  });

  it('TARGET: evaluates to EXECUTED directly', () => {
    const o = baseOrder({ type: 'TARGET', side: 'BUY', triggerPrice: 2450 });
    const r = evaluateOrderTrigger(o, 2450);
    expect(r.nextStatus).toBe('EXECUTED');
  });

  it('GTT flag does not change trigger logic for non-STOP_LIMIT types', () => {
    const oGTT = baseOrder({ type: 'STOP_MARKET', side: 'BUY', triggerPrice: 2550, isGTT: true });
    const oNon = baseOrder({ type: 'STOP_MARKET', side: 'BUY', triggerPrice: 2550, isGTT: false });
    expect(evaluateOrderTrigger(oGTT, 2550)).toEqual(evaluateOrderTrigger(oNon, 2550));
  });

  it('isGttTerminalStatus covers all terminal states', () => {
    expect(isGttTerminalStatus('EXECUTED')).toBe(true);
    expect(isGttTerminalStatus('CANCELLED')).toBe(true);
    expect(isGttTerminalStatus('REJECTED')).toBe(true);
    expect(isGttTerminalStatus('PENDING')).toBe(false);
    expect(isGttTerminalStatus('TRIGGERED')).toBe(false);
  });

  it('isGttEligibleForTrigger covers PENDING and TRIGGERED', () => {
    expect(isGttEligibleForTrigger('PENDING')).toBe(true);
    expect(isGttEligibleForTrigger('TRIGGERED')).toBe(true);
    expect(isGttEligibleForTrigger('EXECUTED')).toBe(false);
    expect(isGttEligibleForTrigger('CANCELLED')).toBe(false);
    expect(isGttEligibleForTrigger('REJECTED')).toBe(false);
  });
});

/* ──────────────────────────────────────────────
   16. GTT creation validation tests
────────────────────────────────────────────── */

describe('validateGttCreation', () => {
  it('allows non-GTT orders', () => {
    const r = validateGttCreation({ ...baseParams(), isGTT: false });
    expect(r.valid).toBe(true);
  });

  it('rejects GTT MARKET orders', () => {
    const r = validateGttCreation({ ...baseParams(), orderType: 'MARKET' as OrderType, isGTT: true });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('GTT cannot be applied to immediate Market orders');
  });

  it('rejects past expiry', () => {
    const pastExpiry = new Date(Date.now() - 86400000).toISOString();
    const r = validateGttCreation({ ...baseParams(), isGTT: true, expiry: pastExpiry });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Expiry date must be in the future');
  });

  it('accepts future expiry', () => {
    const futureExpiry = new Date(Date.now() + 86400000).toISOString();
    const r = validateGttCreation({ ...baseParams(), isGTT: true, expiry: futureExpiry });
    expect(r.valid).toBe(true);
  });

  it('rejects invalid expiry format', () => {
    const r = validateGttCreation({ ...baseParams(), isGTT: true, expiry: 'not-a-date' });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Invalid expiry date format');
  });

  it('rejects trailing for BUY side', () => {
    const r = validateGttCreation({ ...baseParams(), side: 'BUY', isGTT: true, trailingConfig: { distance: 50, distanceType: 'absolute' } });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Trailing stop-loss is only supported for protective SELL orders');
  });

  it('rejects trailing for LIMIT order', () => {
    // default side is BUY, so side check fires first
    const r = validateGttCreation({ ...baseParams(), orderType: 'LIMIT', isGTT: true, trailingConfig: { distance: 50, distanceType: 'absolute' } });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('only supported for protective SELL orders');
  });

  it('rejects trailing for SELL LIMIT order (order type)', () => {
    const r = validateGttCreation({ ...baseParams(), side: 'SELL', orderType: 'LIMIT', isGTT: true, trailingConfig: { distance: 50, distanceType: 'absolute' } });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Trailing stop-loss requires a Stop-Market (SL-M) or Stop-Limit (SL-L) order type');
  });

  it('accepts trailing for SELL STOP_MARKET', () => {
    const r = validateGttCreation({ ...baseParams(), side: 'SELL', orderType: 'STOP_MARKET', isGTT: true, trailingConfig: { distance: 50, distanceType: 'absolute' } });
    expect(r.valid).toBe(true);
  });

  it('accepts trailing for SELL STOP_LIMIT', () => {
    const r = validateGttCreation({ ...baseParams(), side: 'SELL', orderType: 'STOP_LIMIT', isGTT: true, trailingConfig: { distance: 50, distanceType: 'absolute' } });
    expect(r.valid).toBe(true);
  });

  it('rejects zero/negative distance', () => {
    expect(validateGttCreation({ ...baseParams(), side: 'SELL', isGTT: true, trailingConfig: { distance: 0, distanceType: 'absolute' } }).valid).toBe(false);
    expect(validateGttCreation({ ...baseParams(), side: 'SELL', isGTT: true, trailingConfig: { distance: -1, distanceType: 'absolute' } }).valid).toBe(false);
  });

  it('rejects percent distance >= 100', () => {
    expect(validateGttCreation({ ...baseParams(), side: 'SELL', isGTT: true, trailingConfig: { distance: 100, distanceType: 'percent' } }).valid).toBe(false);
    expect(validateGttCreation({ ...baseParams(), side: 'SELL', isGTT: true, trailingConfig: { distance: 150, distanceType: 'percent' } }).valid).toBe(false);
  });

  it('accepts valid percent distance', () => {
    expect(validateGttCreation({ ...baseParams(), side: 'SELL', isGTT: true, trailingConfig: { distance: 5, distanceType: 'percent' } }).valid).toBe(true);
  });

  it('rejects absolute distance >= currentPrice', () => {
    expect(validateGttCreation({ ...baseParams(), side: 'SELL', isGTT: true, trailingConfig: { distance: 2500, distanceType: 'absolute' }, currentPrice: 2500 }).valid).toBe(false);
    expect(validateGttCreation({ ...baseParams(), side: 'SELL', isGTT: true, trailingConfig: { distance: 3000, distanceType: 'absolute' }, currentPrice: 2500 }).valid).toBe(false);
  });

  it('accepts valid absolute distance', () => {
    expect(validateGttCreation({ ...baseParams(), side: 'SELL', isGTT: true, trailingConfig: { distance: 50, distanceType: 'absolute' }, currentPrice: 2500 }).valid).toBe(true);
  });
});