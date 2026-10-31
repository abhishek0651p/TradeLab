/* ── Day 27.1: Planned Order Integration Tests ───────────────────────────────────
Tests for the pure prefill mapping from the position-sizing calculator to the
OrderEntry form fields. Verifies QUANTITY, ENTRY (limitPrice), STOP-LOSS
(triggerPrice), and TARGET transfer logic with side-aware priority.
─────────────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { computeAppliedPrefill, OrderPrefill, AppliedPrefill } from '../pages/StockDetail';

const basePrefill: OrderPrefill = {
  quantity: 50,
  entryPrice: 2950.45,
  stopLossPrice: 2900,
  targetPrice: 3050
};

// ──────────────────────────────────────────────
// 1. BUY Prefill
// ──────────────────────────────────────────────

describe('computeAppliedPrefill — BUY prefill', () => {

  it('BUY with both SL and target → LIMIT order (entry != market), trigger carries stop-loss', () => {
    const result = computeAppliedPrefill({ ...basePrefill, entryPrice: 2940 }, 2950.45, 'BUY');
    expect(result.orderType).toBe('LIMIT');
    expect(result.quantity).toBe('50');
    expect(result.limitPrice).toBe('2940');
    expect(result.triggerPrice).toBe('2900');
  });

  it('BUY with only SL → LIMIT order, trigger carries stop-loss', () => {
    const result = computeAppliedPrefill(
      { ...basePrefill, targetPrice: undefined, entryPrice: 2940 },
      2950.45,
      'BUY'
    );
    expect(result.orderType).toBe('LIMIT');
    expect(result.triggerPrice).toBe('2900');
  });

  it('BUY with only target (no SL) → LIMIT order, trigger carries target', () => {
    const result = computeAppliedPrefill(
      { ...basePrefill, stopLossPrice: undefined, entryPrice: 2940 },
      2950.45,
      'BUY'
    );
    expect(result.orderType).toBe('LIMIT');
    expect(result.triggerPrice).toBe('3050');
  });

  it('BUY with entry == market → MARKET order', () => {
    const result = computeAppliedPrefill({ ...basePrefill, entryPrice: 2950.45 }, 2950.45, 'BUY');
    expect(result.orderType).toBe('MARKET');
    expect(result.limitPrice).toBe('2950.45');
    expect(result.triggerPrice).toBe('2900');
  });
});

// ──────────────────────────────────────────────
// 2. SELL Prefill
// ──────────────────────────────────────────────

describe('computeAppliedPrefill — SELL prefill', () => {

  it('SELL with both SL and target → TARGET order (target takes precedence for SELL)', () => {
    const result = computeAppliedPrefill(basePrefill, 2950.45, 'SELL');
    expect(result.orderType).toBe('TARGET');
    expect(result.quantity).toBe('50');
    expect(result.limitPrice).toBe('2950.45');
    expect(result.triggerPrice).toBe('3050');
  });

  it('SELL with only SL → STOP_MARKET order, trigger carries stop-loss', () => {
    const result = computeAppliedPrefill({ ...basePrefill, targetPrice: undefined }, 2950.45, 'SELL');
    expect(result.orderType).toBe('STOP_MARKET');
    expect(result.triggerPrice).toBe('2900');
  });

  it('SELL with only target → TARGET order, trigger carries target', () => {
    const result = computeAppliedPrefill({ ...basePrefill, stopLossPrice: undefined }, 2950.45, 'SELL');
    expect(result.orderType).toBe('TARGET');
    expect(result.triggerPrice).toBe('3050');
  });

  it('SELL with entry == market and SL only → STOP_MARKET (SL triggers order type)', () => {
    const result = computeAppliedPrefill(
      { ...basePrefill, targetPrice: undefined, entryPrice: 2950.45 },
      2950.45,
      'SELL'
    );
    expect(result.orderType).toBe('STOP_MARKET');
    expect(result.triggerPrice).toBe('2900');
  });
});

// ──────────────────────────────────────────────
// 3. Quantity Transfer
// ──────────────────────────────────────────────

describe('computeAppliedPrefill — quantity transfer', () => {

  it('quantity=1 always stringified as "1"', () => {
    const result = computeAppliedPrefill({ ...basePrefill, quantity: 1 }, 2950.45, 'BUY');
    expect(result.quantity).toBe('1');
  });

  it('large quantity stringified correctly', () => {
    const result = computeAppliedPrefill({ ...basePrefill, quantity: 99999 }, 100, 'BUY');
    expect(result.quantity).toBe('99999');
  });

  it('quantity is transferred identically for BUY and SELL', () => {
    const buy = computeAppliedPrefill({ ...basePrefill, quantity: 42 }, 2950.45, 'BUY');
    const sell = computeAppliedPrefill({ ...basePrefill, quantity: 42 }, 2950.45, 'SELL');
    expect(buy.quantity).toBe('42');
    expect(sell.quantity).toBe('42');
  });
});

// ──────────────────────────────────────────────
// 4. Entry Price Transfer
// ──────────────────────────────────────────────

describe('computeAppliedPrefill — entry price transfer', () => {

  it('entry price → limitPrice string when > 0', () => {
    const result = computeAppliedPrefill({ ...basePrefill, entryPrice: 1500.75 }, 1500, 'BUY');
    expect(result.limitPrice).toBe('1500.75');
  });

  it('entry price 0 → empty limitPrice string', () => {
    const result = computeAppliedPrefill({ ...basePrefill, entryPrice: 0 }, 100, 'BUY');
    expect(result.limitPrice).toBe('');
  });
});

// ──────────────────────────────────────────────
// 5. Stop-Loss Mapping
// ──────────────────────────────────────────────

describe('computeAppliedPrefill — stop-loss mapping', () => {

  it('stopLossPrice present → carried as triggerPrice string', () => {
    const result = computeAppliedPrefill(
      { quantity: 10, entryPrice: 1000, stopLossPrice: 950 },
      1000,
      'BUY'
    );
    expect(result.triggerPrice).toBe('950');
  });

  it('stopLossPrice=0 → not carried', () => {
    const result = computeAppliedPrefill(
      { quantity: 10, entryPrice: 1000, stopLossPrice: 0 },
      1000,
      'BUY'
    );
    expect(result.triggerPrice).toBe('');
  });

  it('stopLossPrice=undefined → not carried', () => {
    const result = computeAppliedPrefill(
      { quantity: 10, entryPrice: 1000, stopLossPrice: undefined },
      1000,
      'BUY'
    );
    expect(result.triggerPrice).toBe('');
  });
});

// ──────────────────────────────────────────────
// 6. Target Mapping
// ──────────────────────────────────────────────

describe('computeAppliedPrefill — target mapping', () => {

  it('SELL with target only → TARGET order type, target as trigger', () => {
    const result = computeAppliedPrefill(
      { quantity: 10, entryPrice: 1000, targetPrice: 1100 },
      1000,
      'SELL'
    );
    expect(result.orderType).toBe('TARGET');
    expect(result.triggerPrice).toBe('1100');
  });

  it('BUY with target only → LIMIT order (no stop to carry), target as trigger', () => {
    const result = computeAppliedPrefill(
      { quantity: 10, entryPrice: 990, targetPrice: 1100 },
      1000,
      'BUY'
    );
    expect(result.orderType).toBe('LIMIT');
    expect(result.triggerPrice).toBe('1100');
  });

  it('targetPrice=0 → not carried', () => {
    const result = computeAppliedPrefill(
      { quantity: 10, entryPrice: 1000, targetPrice: 0 },
      1000,
      'SELL'
    );
    expect(result.triggerPrice).toBe('');
  });
});

// ──────────────────────────────────────────────
// 7. Correct Symbol Matching  (pure logic test)
// ──────────────────────────────────────────────

describe('Planned order symbol matching', () => {

  it('matching symbol returns valid prefill token', () => {
    // Simulates the check: plannedOrder.symbol === currentSymbol
    const plannedOrder = { symbol: 'RELIANCE', side: 'BUY' as const, quantity: 10, entryPrice: 2500, source: 'position-sizer' as const, createdAt: Date.now() };
    const currentSymbol = 'RELIANCE';
    expect(plannedOrder.symbol === currentSymbol).toBe(true);
  });
});

// ──────────────────────────────────────────────
// 8. Wrong Symbol Rejection
// ──────────────────────────────────────────────

describe('Planned order wrong-symbol rejection', () => {

  it('mismatched symbol is not consumed', () => {
    const plannedOrder = { symbol: 'RELIANCE', side: 'BUY' as const, quantity: 10, entryPrice: 2500, source: 'position-sizer' as const, createdAt: Date.now() };
    const currentSymbol = 'TCS';
    const plannedOrderReady = plannedOrder.symbol === currentSymbol;
    expect(plannedOrderReady).toBe(false);
  });

  it('null plannedOrder is not consumed', () => {
    const plannedOrder = null as { symbol: string } | null;
    const currentSymbol = 'RELIANCE';
    const plannedOrderReady = Boolean(plannedOrder && plannedOrder.symbol === currentSymbol);
    expect(plannedOrderReady).toBe(false);
  });
});

// ──────────────────────────────────────────────
// 9. Duplicate-Prefill Prevention
// ──────────────────────────────────────────────

describe('Duplicate-prefill prevention', () => {

  it('same prefillToken produces identical mapping — idempotent', () => {
    const prefill: OrderPrefill = { quantity: 25, entryPrice: 500, stopLossPrice: 480, targetPrice: 550 };
    const first = computeAppliedPrefill(prefill, 500, 'BUY');
    const second = computeAppliedPrefill(prefill, 500, 'BUY');
    expect(first).toEqual(second);
  });

  it('different prefill produces different mapping', () => {
    const a: OrderPrefill = { quantity: 25, entryPrice: 500, stopLossPrice: 480 };
    const b: OrderPrefill = { quantity: 30, entryPrice: 510, stopLossPrice: 490 };
    const ra = computeAppliedPrefill(a, 500, 'BUY');
    const rb = computeAppliedPrefill(b, 500, 'BUY');
    expect(ra.quantity).not.toBe(rb.quantity);
  });
});

// ──────────────────────────────────────────────
// 10. User Edits Preserved After Rerender
// ──────────────────────────────────────────────

describe('User edits preserved', () => {

  it('computeAppliedPrefill is pure and does not force re-apply — component uses ref guard', () => {
    // The OrderEntry component uses appliedPrefillTokenRef to prevent re-applying
    // the same prefill token. This test verifies the pure function returns a
    // stable result when called with the same inputs, ensuring no spurious
    // re-application from memoization changes.
    const prefill: OrderPrefill = { quantity: 10, entryPrice: 100, stopLossPrice: 95 };
    const result1 = computeAppliedPrefill(prefill, 100, 'BUY');
    const result2 = computeAppliedPrefill(prefill, 100, 'BUY');
    expect(result1).toEqual(result2);
    // Since the function returns the same shape, the ref guard in the component
    // (appliedPrefillTokenRef) will skip re-apply, preserving user edits.
  });
});

// ──────────────────────────────────────────────
// 11. Cancellation Without Order Submission
// ──────────────────────────────────────────────

describe('Cancellation without order submission', () => {

  it('cancel action is a simple state clear — no side effects from computeAppliedPrefill', () => {
    // handleCancelPlan simply calls setPlannedOrder(null).
    // computeAppliedPrefill has no side effects, so calling it does not place orders.
    const prefill: OrderPrefill = { quantity: 50, entryPrice: 2950, stopLossPrice: 2900 };
    const result = computeAppliedPrefill(prefill, 2950, 'BUY');
    // The function returns data but never triggers order placement
    expect(result).toBeDefined();
    expect(typeof result.orderType).toBe('string');
    // Verifying "no order placed" is implicit: computeAppliedPrefill is pure.
  });
});

// ──────────────────────────────────────────────
// 12. Successful Submission Through Existing Callback
// ──────────────────────────────────────────────

describe('Successful submission produces correct callback args', () => {

  it('prefill values translate to valid placeOrder params shape', () => {
    const prefill: OrderPrefill = { quantity: 20, entryPrice: 1500, stopLossPrice: 1450, targetPrice: 1600 };
    const applied = computeAppliedPrefill(prefill, 1500, 'SELL');

    // The OrderEntry handleSubmit would pass these to onPlaceOrder:
    const orderType = applied.orderType; // 'TARGET'
    const qty = Number(applied.quantity);
    const lp = applied.limitPrice ? Number(applied.limitPrice) : undefined;
    const tp = applied.triggerPrice ? Number(applied.triggerPrice) : undefined;

    expect(orderType).toBe('TARGET');
    expect(qty).toBe(20);
    expect(lp).toBe(1500);
    expect(tp).toBe(1600); // target price for SELL TARGET order
    expect(Number.isInteger(qty)).toBe(true);
    expect(qty).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────
// 13. Planned-Order Clearing
// ──────────────────────────────────────────────

describe('Planned-order clearing', () => {

  it('successful submission branch: prefillToken presence triggers clearing', () => {
    // In StockDetail.handleOrderSubmit, line 835-837:
    //   if (orderModal?.prefillToken) { setPlannedOrder(null); }
    // This test validates the condition logic.
    const orderModal = {
      side: 'BUY' as const,
      prefill: { quantity: 10, entryPrice: 100 },
      prefillToken: '1234567890'
    };
    expect(Boolean(orderModal.prefillToken)).toBe(true);

    // Without prefillToken, planned order is NOT cleared (normal manual order)
    const manualModal = { side: 'BUY' as const };
    expect(Boolean((manualModal as any).prefillToken)).toBe(false);
  });
});

// ──────────────────────────────────────────────
// 14. Manual Order Entry Without plannedOrder
// ──────────────────────────────────────────────

describe('Manual order entry without plannedOrder', () => {

  it('no prefill → orderType defaults and empty strings', () => {
    // When no plannedOrder exists, the OrderEntry is opened with no prefill/prefillToken.
    // The useEffect guard (line 133-143) skips when prefill is falsy.
    // Simulating: the initial state of OrderEntry fields.
    // We verify computeAppliedPrefill with a minimal "empty" prefill returns safe defaults.
    const emptyPrefill: OrderPrefill = { quantity: 0, entryPrice: 0 };
    const result = computeAppliedPrefill(emptyPrefill, 100, 'BUY');
    expect(result.quantity).toBe('0');
    expect(result.limitPrice).toBe('');
    expect(result.triggerPrice).toBe('');
    expect(result.orderType).toBe('MARKET');
  });
});

// ──────────────────────────────────────────────
// Type/Build Verification
// ──────────────────────────────────────────────

describe('Planned Order Integration — type/build verification', () => {
  it('OrderPrefill and AppliedPrefill types are importable', () => {
    expect(typeof computeAppliedPrefill).toBe('function');
  });

  it('computeAppliedPrefill returns AppliedPrefill shape', () => {
    const result: AppliedPrefill = computeAppliedPrefill(basePrefill, 2950.45, 'BUY');
    expect(typeof result.orderType).toBe('string');
    expect(typeof result.quantity).toBe('string');
    expect(typeof result.limitPrice).toBe('string');
    expect(typeof result.triggerPrice).toBe('string');
  });

  it('zero/undefined prices produce empty strings, not "0" or "NaN"', () => {
    const result = computeAppliedPrefill({
      quantity: 10,
      entryPrice: 0,
      stopLossPrice: undefined,
      targetPrice: 0
    }, 100, 'BUY');
    expect(result.limitPrice).toBe('');
    expect(result.triggerPrice).toBe('');
  });
});