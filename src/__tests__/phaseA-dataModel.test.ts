/* ── Day 32: Phase A — Data Model Backward Compatibility Tests ─────────────────────
 * Verifies that new optional fields (filledQuantity, remainingQuantity, charges,
 * TransactionCosts) are fully backward-compatible with existing historical records.
 * Phase A ONLY: type-level verification — no execution logic changes yet.
 * ────────────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { Order, Execution, Trade, TransactionCosts } from '../types';

describe('Phase A — Data model backward compatibility', () => {
  // ── 1. Historical Order without new fields ────────────────────────────

  it('1. Historical Order without filledQuantity/remainingQuantity is valid', () => {
    // An order from before Phase A — no new fields present.
    // When deserialized from old localStorage, these fields will be undefined.
    const historicalOrder: Order = {
      id: 'ORD-001',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY' as const,
      type: 'LIMIT' as const,
      quantity: 10,
      requestedPrice: 2940,
      triggerPrice: undefined,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING' as const,
      createdAt: '2024-01-01T00:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
      // NO filledQuantity or remainingQuantity — this is the old format
    };

    // These fields are optional; the Order type accepts them being absent.
    expect(historicalOrder.filledQuantity).toBeUndefined();
    expect(historicalOrder.remainingQuantity).toBeUndefined();

    // Backward-compatible: existing logic that reads filledQuantity/remainingQuantity
    // should treat undefined as "no partial fill" (full order quantity).
    const effectiveFilled = historicalOrder.filledQuantity ?? historicalOrder.quantity;
    const effectiveRemaining = historicalOrder.remainingQuantity ?? historicalOrder.quantity;

    expect(effectiveFilled).toBe(10);
    expect(effectiveRemaining).toBe(10);
  });

  // ── 2. New Order with partial-fill fields ───────────────────────────

  it('2. New Order with filledQuantity and remainingQuantity set', () => {
    const newOrder: Order = {
      id: 'ORD-002',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      side: 'BUY' as const,
      type: 'LIMIT' as const,
      quantity: 50,
      requestedPrice: 3980,
      triggerPrice: undefined,
      executionPrice: 3985,
      totalValue: 199250,
      status: 'EXECUTED' as const,
      createdAt: '2026-11-19T10:00:00Z',
      executedAt: '2026-11-19T10:00:00Z',
      cancelledAt: null,
      rejectionReason: null,
      filledQuantity: 30,   // Partial fill: 30 of 50 executed
      remainingQuantity: 20, // 20 still to fill
    };

    expect(newOrder.filledQuantity).toBe(30);
    expect(newOrder.remainingQuantity).toBe(20);

    // Effective calculations: filled + remaining = original quantity
    expect((newOrder.filledQuantity ?? newOrder.quantity) + (newOrder.remainingQuantity ?? newOrder.quantity)).toBe(
      newOrder.quantity
    );
  });

  // ── 3. Historical Execution without transaction-cost fields ───────────

  it('3. Historical Execution without charges field is valid', () => {
    // An execution from before Phase A — no charges field present.
    const historicalExecution: Execution = {
      id: 'EXE-001',
      orderId: 'ORD-001',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY' as const,
      quantity: 10,
      executionPrice: 2950.45,
      totalValue: 29504.5,
      executedAt: '2024-01-01T10:00:00Z',
      // NO charges field — this is the old format
    };

    expect(historicalExecution.charges).toBeUndefined();
    // Backward-compatible: treat undefined as zero charges.
    const effectiveCharges = historicalExecution.charges ?? { totalCharges: 0 };
    expect(effectiveCharges.totalCharges).toBe(0);
  });

  // ── 4. Historical Trade without transaction-cost fields ──────────────

  it('4. Historical Trade without charges field is valid', () => {
    // A trade from before Phase A — no charges field present.
    const historicalTrade: Trade = {
      id: 'TRD-001',
      timestamp: '2024-01-01T00:00:00Z',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'SELL' as const,
      quantity: 10,
      executionPrice: 3000,
      totalValue: 30000,
      realizedPnL: 1000,
      orderId: 'ORD-001',
      executionId: 'EXE-001',
      orderType: 'MARKET' as const,
      // NO charges field — this is the old format
    };

    expect(historicalTrade.charges).toBeUndefined();
    // Backward-compatible: treat undefined as zero charges.
    const effectiveCharges = historicalTrade.charges ?? { totalCharges: 0 };
    expect(effectiveCharges.totalCharges).toBe(0);
    expect(historicalTrade.realizedPnL).toBe(1000); // unchanged
  });

  // ── 5. New Trade with charges field ─────────────────────────────────

  it('5. New Trade with charges field set', () => {
    const newTrade: Trade = {
      id: 'TRD-002',
      timestamp: '2026-11-19T10:00:00Z',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      side: 'SELL' as const,
      quantity: 5,
      executionPrice: 4000,
      totalValue: 20000,
      realizedPnL: 500,
      orderId: 'ORD-002',
      executionId: 'EXE-002',
      orderType: 'MARKET' as const,
      // Day 32: transaction cost breakdown
      charges: {
        brokerage: 20,
        stt: 200,
        exchangeTransactionCharges: 5,
        gst: 41,
        sebiCharges: 1,
        stampDuty: 40,
        otherCharges: 0,
        totalCharges: 307,
      },
    };

    expect(newTrade.charges).toBeDefined();
    expect(newTrade.charges!.brokerage).toBe(20);
    expect(newTrade.charges!.stt).toBe(200);
    expect(newTrade.charges!.totalCharges).toBe(307);

    // realizedPnL should be independent of charges in Phase A
    expect(newTrade.realizedPnL).toBe(500);
  });

  // ── 6. Multiple Execution records linked to one Order ───────────────

  it('6. Multiple Execution records linked to one Order (type-level)', () => {
    // This test verifies the type system supports multiple Executions per Order.
    // It does NOT create actual execution logic — Phase A is data-model only.
    const order: Order = {
      id: 'ORD-003',
      symbol: 'INFY',
      companyName: 'Infosys',
      side: 'BUY' as const,
      type: 'LIMIT' as const,
      quantity: 100,
      requestedPrice: 1620,
      triggerPrice: undefined,
      executionPrice: null,
      totalValue: null,
      status: 'EXECUTED' as const,
      createdAt: '2026-11-19T10:00:00Z',
      executedAt: '2026-11-19T10:00:00Z',
      cancelledAt: null,
      rejectionReason: null,
      filledQuantity: undefined,
      remainingQuantity: undefined,
      charges: undefined,
    };

    // Two executions for the same order, each filling a different quantity
    const execution1: Execution = {
      id: 'EXE-003a',
      orderId: order.id,
      symbol: order.symbol,
      companyName: order.companyName,
      side: order.side,
      quantity: 40, // first execution filled 40
      executionPrice: 1620,
      totalValue: 64800,
      executedAt: '2026-11-19T10:01:00Z',
      charges: {
        brokerage: 10,
        stt: 200,
        exchangeTransactionCharges: 5,
        gst: 32,
        sebiCharges: 1,
        stampDuty: 20,
        otherCharges: 0,
        totalCharges: 267,
      },
    };

    const execution2: Execution = {
      id: 'EXE-003b',
      orderId: order.id,
      symbol: order.symbol,
      companyName: order.companyName,
      side: order.side,
      quantity: 30, // second execution filled 30 (remaining 30 may fill later)
      executionPrice: 1625,
      totalValue: 48750,
      executedAt: '2026-11-19T10:05:00Z',
      charges: {
        brokerage: 8,
        stt: 180,
        exchangeTransactionCharges: 5,
        gst: 27,
        sebiCharges: 1,
        stampDuty: 15,
        otherCharges: 0,
        totalCharges: 236,
      },
    };

    // Both executions linked to same order
    expect(execution1.orderId).toBe(order.id);
    expect(execution2.orderId).toBe(order.id);

    // Each execution has its own quantity
    expect(execution1.quantity).toBe(40);
    expect(execution2.quantity).toBe(30);

    // Executions are independent records
    expect(execution1.id).not.toBe(execution2.id);
    expect(execution1.charges?.totalCharges).toBe(267);
    expect(execution2.charges?.totalCharges).toBe(236);

    // Phase A: filledQuantity on order tracks cumulative fill if needed,
    // but this test only verifies the type structure supports multiple executions.
  });

  // ── 7. Transaction-cost breakdown type compatibility ──────────────────

  it('7. TransactionCosts type is fully optional and backward compatible', () => {
    // Empty TransactionCosts (all undefined) is valid.
    const emptyCosts: TransactionCosts = {};
    expect(emptyCosts.brokerage).toBeUndefined();
    expect(emptyCosts.stt).toBeUndefined();
    expect(emptyCosts.gst).toBeUndefined();
    expect(emptyCosts.sebiCharges).toBeUndefined();
    expect(emptyCosts.stampDuty).toBeUndefined();
    expect(emptyCosts.otherCharges).toBeUndefined();
    expect(emptyCosts.totalCharges).toBeUndefined();

    // Partial TransactionCosts (some fields set) is valid.
    const partialCosts: TransactionCosts = {
      brokerage: 10,
      totalCharges: 10,
    };
    expect(partialCosts.brokerage).toBe(10);
    expect(partialCosts.stt).toBeUndefined();
    expect(partialCosts.totalCharges).toBe(10);

    // Full TransactionCosts (all fields set) is valid.
    const fullCosts: TransactionCosts = {
      brokerage: 10,
      stt: 200,
      exchangeTransactionCharges: 5,
      gst: 30,
      sebiCharges: 1,
      stampDuty: 40,
      otherCharges: 5,
      totalCharges: 311,
    };
    expect(fullCosts.totalCharges).toBe(311);
  });

  // ── 8. Bracket and GTT persistence compatibility ─────────────────────

  it('8. Bracket group order without new fields persists correctly', () => {
    // A bracket group's parent Order from before Phase A must still be valid.
    const oldBracketParent: Order = {
      id: 'ORD-BRACKET-001',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY' as const,
      type: 'LIMIT' as const,
      quantity: 10,
      requestedPrice: 2500,
      triggerPrice: undefined,
      executionPrice: 2500,
      totalValue: 25000,
      status: 'EXECUTED' as const,
      createdAt: '2024-01-01T00:00:00Z',
      executedAt: '2024-01-01T00:00:00Z',
      cancelledAt: null,
      rejectionReason: null,
      // NO filledQuantity, remainingQuantity, or charges — old format
    };

    // All required fields present; optional new fields absent — backward compatible.
    expect(oldBracketParent.id).toBe('ORD-BRACKET-001');
    expect(oldBracketParent.quantity).toBe(10);
    expect(oldBracketParent.status).toBe('EXECUTED');
    expect(oldBracketParent.filledQuantity).toBeUndefined();
    expect(oldBracketParent.remainingQuantity).toBeUndefined();
    expect(oldBracketParent.charges).toBeUndefined();

    // Effective filledQuantity when absent = full quantity
    const effectiveFilled = oldBracketParent.filledQuantity ?? oldBracketParent.quantity;
    expect(effectiveFilled).toBe(10);
  });

  it('9. Execution from old bracket recovery without charges persists correctly', () => {
    // An Execution record recovered from old bracket persistence (Day 30.3)
    // must remain valid without the charges field.
    const oldExecution: Execution = {
      id: 'EXE-BRACKET-001',
      orderId: 'ORD-BRACKET-001',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY' as const,
      quantity: 10,
      executionPrice: 2500,
      totalValue: 25000,
      executedAt: '2024-01-01T10:00:00Z',
      // NO charges field — old format
    };

    expect(oldExecution.charges).toBeUndefined();
    // Backward-compatible: treat undefined as zero.
    expect((oldExecution.charges ?? { totalCharges: 0 }).totalCharges).toBe(0);
  });
});