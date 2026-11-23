import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { TradingProvider, useTrading } from '../context/TradingContext';
import {
  validateOrderModification,
  applyOrderModification,
  isOrderEligibleForModification,
  sortOrdersByPriority,
} from '../engine/OrderModificationEngine';
import {
  computeOrderBuyReservation,
  computeOrderSellReservation,
  computeReservedBuyCapital,
  computeReservedSellQuantity,
} from '../engine/ReservationModel';
import { Order, Holding, StockData, BracketGroup, ModifyOrderParams } from '../types';

const MOCK_STOCKS: StockData[] = [
  {
    symbol: 'RELIANCE',
    companyName: 'Reliance Industries',
    price: 2500,
    previousClose: 2480,
    change: 20,
    changePercent: 0.81,
    open: 2490,
    dayHigh: 2520,
    dayLow: 2470,
    volume: 1200000,
    sector: 'Energy',
    exchange: 'NSE',
    description: 'Energy conglomerate',
  },
  {
    symbol: 'TCS',
    companyName: 'Tata Consultancy Services',
    price: 3500,
    previousClose: 3450,
    change: 50,
    changePercent: 1.45,
    open: 3460,
    dayHigh: 3520,
    dayLow: 3440,
    volume: 800000,
    sector: 'Technology',
    exchange: 'NSE',
    description: 'IT Services',
  },
];

const renderProvider = () => {
  return renderHook(() => useTrading(), {
    wrapper: TradingProvider,
  });
};

describe('Day 32 Phase E: Advanced Order Modification & Execution Lifecycle Engine', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ── 1. Valid LIMIT price modification ──
  it('1. permits valid LIMIT price modification on pending order', () => {
    const order: Order = {
      id: 'ORD-1',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 2400,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
      orderVersion: 1,
    };

    const validation = validateOrderModification(
      { orderId: 'ORD-1', price: 2450 },
      order,
      100000,
      [],
      [order],
      MOCK_STOCKS
    );

    expect(validation.valid).toBe(true);
    expect(validation.additionalCapitalRequired).toBe(500); // 10 * 50

    const modified = applyOrderModification(order, { orderId: 'ORD-1', price: 2450 });
    expect(modified.requestedPrice).toBe(2450);
    expect(modified.orderVersion).toBe(2);
    expect(modified.modificationCount).toBe(1);
    expect(modified.modificationHistory?.length).toBe(1);
    expect(modified.modificationHistory?.[0].previousRequestedPrice).toBe(2400);
    expect(modified.modificationHistory?.[0].newRequestedPrice).toBe(2450);
  });

  // ── 2. Invalid LIMIT price ──
  it('2. rejects invalid or negative LIMIT prices', () => {
    const order: Order = {
      id: 'ORD-1',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 2400,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    const vNegative = validateOrderModification(
      { orderId: 'ORD-1', price: -100 },
      order,
      100000,
      [],
      [order],
      MOCK_STOCKS
    );
    expect(vNegative.valid).toBe(false);

    const vZero = validateOrderModification(
      { orderId: 'ORD-1', price: 0 },
      order,
      100000,
      [],
      [order],
      MOCK_STOCKS
    );
    expect(vZero.valid).toBe(false);
  });

  // ── 3. STOP_LIMIT trigger modification ──
  it('3. modifies STOP_LIMIT trigger price cleanly', () => {
    const order: Order = {
      id: 'ORD-2',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY',
      type: 'STOP_LIMIT',
      quantity: 10,
      requestedPrice: 2600,
      triggerPrice: 2550,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    const validation = validateOrderModification(
      { orderId: 'ORD-2', triggerPrice: 2580 },
      order,
      100000,
      [],
      [order],
      MOCK_STOCKS
    );
    expect(validation.valid).toBe(true);

    const modified = applyOrderModification(order, { orderId: 'ORD-2', triggerPrice: 2580 });
    expect(modified.triggerPrice).toBe(2580);
    expect(modified.requestedPrice).toBe(2600);
    expect(modified.modificationHistory?.[0].previousTriggerPrice).toBe(2550);
    expect(modified.modificationHistory?.[0].newTriggerPrice).toBe(2580);
  });

  // ── 4. STOP_LIMIT limit modification ──
  it('4. modifies STOP_LIMIT limit price cleanly', () => {
    const order: Order = {
      id: 'ORD-2',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY',
      type: 'STOP_LIMIT',
      quantity: 10,
      requestedPrice: 2600,
      triggerPrice: 2550,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    const validation = validateOrderModification(
      { orderId: 'ORD-2', price: 2650 },
      order,
      100000,
      [],
      [order],
      MOCK_STOCKS
    );
    expect(validation.valid).toBe(true);

    const modified = applyOrderModification(order, { orderId: 'ORD-2', price: 2650 });
    expect(modified.requestedPrice).toBe(2650);
  });

  // ── 5. Quantity increase ──
  it('5. allows valid total quantity increase', () => {
    const order: Order = {
      id: 'ORD-1',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 3400,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    const validation = validateOrderModification(
      { orderId: 'ORD-1', quantity: 15 },
      order,
      100000,
      [],
      [order],
      MOCK_STOCKS
    );
    expect(validation.valid).toBe(true);
    expect(validation.additionalCapitalRequired).toBe(17000); // 5 * 3400

    const modified = applyOrderModification(order, { orderId: 'ORD-1', quantity: 15 });
    expect(modified.quantity).toBe(15);
    expect(modified.remainingQuantity).toBe(15);
  });

  // ── 6. Quantity decrease ──
  it('6. allows valid total quantity decrease and releases excess reservation', () => {
    const order: Order = {
      id: 'ORD-1',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 3400,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    const validation = validateOrderModification(
      { orderId: 'ORD-1', quantity: 6 },
      order,
      100000,
      [],
      [order],
      MOCK_STOCKS
    );
    expect(validation.valid).toBe(true);
    expect(validation.excessCapitalReleased).toBe(13600); // 4 * 3400

    const modified = applyOrderModification(order, { orderId: 'ORD-1', quantity: 6 });
    expect(modified.quantity).toBe(6);
    expect(modified.remainingQuantity).toBe(6);
  });

  // ── 7. Reject quantity below filled quantity ──
  it('7. strictly rejects reducing total quantity below already filled quantity', () => {
    const partiallyFilledOrder: Order = {
      id: 'ORD-PF',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 100,
      filledQuantity: 40,
      remainingQuantity: 60,
      requestedPrice: 3400,
      executionPrice: 3400,
      totalValue: 136000,
      status: 'PARTIALLY_FILLED',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    // Attempting to set total quantity to 30 when 40 already filled
    const validation = validateOrderModification(
      { orderId: 'ORD-PF', quantity: 30 },
      partiallyFilledOrder,
      200000,
      [],
      [partiallyFilledOrder],
      MOCK_STOCKS
    );
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('Cannot reduce total quantity (30) below already filled quantity (40)');
  });

  // ── 8. Modify BUY order reservation ──
  it('8. updates BUY order reservation calculation atomically', () => {
    const order: Order = {
      id: 'ORD-BUY',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 2000,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    expect(computeOrderBuyReservation(order, MOCK_STOCKS)).toBe(20000);

    const modified = applyOrderModification(order, { orderId: 'ORD-BUY', price: 2100, quantity: 12 });
    expect(computeOrderBuyReservation(modified, MOCK_STOCKS)).toBe(25200); // 12 * 2100
  });

  // ── 9. Modify SELL order reservation ──
  it('9. updates SELL order reservation quantity atomically', () => {
    const order: Order = {
      id: 'ORD-SELL',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      side: 'SELL',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 3600,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    expect(computeOrderSellReservation(order, 'TCS')).toBe(10);

    const modified = applyOrderModification(order, { orderId: 'ORD-SELL', quantity: 15 });
    expect(computeOrderSellReservation(modified, 'TCS')).toBe(15);
  });

  // ── 10. Insufficient additional BUY capital ──
  it('10. rejects modification when available buying power is insufficient for increase', () => {
    const order: Order = {
      id: 'ORD-BUY',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 3000, // ₹30,000 reserved
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    // Cash balance is ₹35,000. New reservation would be 15 * 3000 = ₹45,000 > ₹35,000
    const validation = validateOrderModification(
      { orderId: 'ORD-BUY', quantity: 15 },
      order,
      35000,
      [],
      [order],
      MOCK_STOCKS
    );
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('Insufficient available buying power');
  });

  // ── 11. Insufficient additional SELL holdings ──
  it('11. rejects modification when available holdings are insufficient for quantity increase', () => {
    const order: Order = {
      id: 'ORD-SELL',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      side: 'SELL',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 3600,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    const holdings: Holding[] = [{ symbol: 'TCS', quantity: 12, averageBuyPrice: 3000 }];

    // Trying to increase SELL order to 15 when only 12 shares owned
    const validation = validateOrderModification(
      { orderId: 'ORD-SELL', quantity: 15 },
      order,
      100000,
      holdings,
      [order],
      MOCK_STOCKS
    );
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('Insufficient available holdings');
  });

  // ── 12. Release excess reservation ──
  it('12. releases excess SELL holdings reservation on quantity decrease', () => {
    const order: Order = {
      id: 'ORD-SELL',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      side: 'SELL',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 3600,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    const holdings: Holding[] = [{ symbol: 'TCS', quantity: 10, averageBuyPrice: 3000 }];

    const validation = validateOrderModification(
      { orderId: 'ORD-SELL', quantity: 5 },
      order,
      100000,
      holdings,
      [order],
      MOCK_STOCKS
    );
    expect(validation.valid).toBe(true);
    expect(validation.excessHoldingsReleased).toBe(5);
  });

  // ── 13. Partial-fill modification ──
  it('13. correctly updates remaining quantity on partially filled order modification', () => {
    // 100 shares original, 40 filled, 60 remaining
    // Trader updates total quantity to 80 -> remaining becomes 40
    const pfOrder: Order = {
      id: 'ORD-PF',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 100,
      filledQuantity: 40,
      remainingQuantity: 60,
      requestedPrice: 2400,
      executionPrice: 2400,
      totalValue: 96000,
      status: 'PARTIALLY_FILLED',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    const validation = validateOrderModification(
      { orderId: 'ORD-PF', quantity: 80 },
      pfOrder,
      200000,
      [],
      [pfOrder],
      MOCK_STOCKS
    );
    expect(validation.valid).toBe(true);
    expect(validation.excessCapitalReleased).toBe(48000); // 20 * 2400

    const modified = applyOrderModification(pfOrder, { orderId: 'ORD-PF', quantity: 80 });
    expect(modified.quantity).toBe(80);
    expect(modified.filledQuantity).toBe(40);
    expect(modified.remainingQuantity).toBe(40);
    expect(modified.status).toBe('PARTIALLY_FILLED');
  });

  // ── 14. Preserve execution history ──
  it('14. preserves historical executions and trades during order modification', () => {
    const { result } = renderProvider();

    // Reset account first to have clean slate
    act(() => {
      result.current.resetAccount();
    });

    let placeRes: ReturnType<typeof result.current.placeOrder>;
    act(() => {
      placeRes = result.current.placeOrder({
        symbol: 'RELIANCE',
        companyName: 'Reliance Industries',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 10,
        limitPrice: 2000, // below market, stays pending
        currentPrice: 2500,
      });
    });
    expect(placeRes!.success).toBe(true);
    const orderId = placeRes!.order!.id;

    const executionsBefore = result.current.executions.length;
    const tradesBefore = result.current.trades.length;

    act(() => {
      const modRes = result.current.modifyOrder({
        orderId,
        price: 2100,
        quantity: 12,
      });
      expect(modRes.success).toBe(true);
    });

    // Invariant: modification never creates an execution or trade
    expect(result.current.executions.length).toBe(executionsBefore);
    expect(result.current.trades.length).toBe(tradesBefore);
  });

  // ── 15. Preserve transaction charges ──
  it('15. preserves existing cumulative transaction charges on modified order', () => {
    const order: Order = {
      id: 'ORD-WITH-CHARGES',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 50,
      filledQuantity: 20,
      remainingQuantity: 30,
      requestedPrice: 2400,
      executionPrice: 2400,
      totalValue: 48000,
      charges: {
        brokerage: 14.4,
        stt: 48,
        totalCharges: 65,
      },
      netValue: 48065,
      status: 'PARTIALLY_FILLED',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    const modified = applyOrderModification(order, { orderId: 'ORD-WITH-CHARGES', price: 2420 });
    // Invariant: historical execution charges remain untouched
    expect(modified.charges?.totalCharges).toBe(65);
    expect(modified.netValue).toBe(48065);
    expect(modified.filledQuantity).toBe(20);
  });

  // ── 16. Preserve original order identity ──
  it('16. preserves original order ID, creation timestamp, side and type', () => {
    const order: Order = {
      id: 'ORD-STABLE-ID',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 3400,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: '2024-01-01T09:15:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    const modified = applyOrderModification(order, { orderId: 'ORD-STABLE-ID', price: 3450 });
    expect(modified.id).toBe('ORD-STABLE-ID');
    expect(modified.createdAt).toBe('2024-01-01T09:15:00Z');
    expect(modified.side).toBe('BUY');
    expect(modified.type).toBe('LIMIT');
    expect(modified.symbol).toBe('TCS');
  });

  // ── 17. Reset priority after material modification ──
  it('17. updates priorityTimestamp after material price or quantity change', () => {
    const originalTime = new Date('2024-01-01T09:15:00Z').getTime();
    const order: Order = {
      id: 'ORD-PRIO',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 2400,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: '2024-01-01T09:15:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
      priorityTimestamp: originalTime,
    };

    const newEpoch = originalTime + 50000;
    const modified = applyOrderModification(order, { orderId: 'ORD-PRIO', price: 2420 }, '2024-01-01T09:16:00Z', newEpoch);

    expect(modified.priorityTimestamp).toBe(newEpoch);
    expect(modified.priorityTimestamp).toBeGreaterThan(originalTime);
  });

  // ── 18. FIFO behavior after modification ──
  it('18. orders queue moves materially modified order behind earlier pending orders', () => {
    const t0 = 1000;
    const t1 = 2000;
    const t2 = 3000;

    const order1: Order = {
      id: 'ORD-1',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 3400,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: new Date(t0).toISOString(),
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
      priorityTimestamp: t0,
    };

    const order2: Order = {
      id: 'ORD-2',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 3400,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: new Date(t1).toISOString(),
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
      priorityTimestamp: t1,
    };

    // Initial queue: order1 before order2
    const initialQueue = sortOrdersByPriority([order1, order2]);
    expect(initialQueue[0].id).toBe('ORD-1');
    expect(initialQueue[1].id).toBe('ORD-2');

    // order1 is modified at t2 -> its priority resets to t2
    const modifiedOrder1 = applyOrderModification(order1, { orderId: 'ORD-1', price: 3420 }, new Date(t2).toISOString(), t2);

    // After modification: order2 has priorityTimestamp t1, modifiedOrder1 has t2.
    // order2 executes before modifiedOrder1!
    const updatedQueue = sortOrdersByPriority([modifiedOrder1, order2]);
    expect(updatedQueue[0].id).toBe('ORD-2');
    expect(updatedQueue[1].id).toBe('ORD-1');
  });

  // ── 19. GTT pending modification ──
  it('19. permits modifying trigger price and limit price on PENDING GTT order', () => {
    const gttOrder: Order = {
      id: 'ORD-GTT',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 3200,
      triggerPrice: 3250,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      isGTT: true,
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    const validation = validateOrderModification(
      { orderId: 'ORD-GTT', triggerPrice: 3220, price: 3180 },
      gttOrder,
      100000,
      [],
      [gttOrder],
      MOCK_STOCKS
    );
    expect(validation.valid).toBe(true);

    const modified = applyOrderModification(gttOrder, {
      orderId: 'ORD-GTT',
      triggerPrice: 3220,
      price: 3180,
    });
    expect(modified.triggerPrice).toBe(3220);
    expect(modified.requestedPrice).toBe(3180);
    expect(modified.isGTT).toBe(true);
  });

  // ── 20. Reject modification after GTT trigger ──
  it('20. strictly rejects modifying an order that has already transitioned to TRIGGERED', () => {
    const triggeredGtt: Order = {
      id: 'ORD-GTT-TRIG',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 3200,
      triggerPrice: 3250,
      executionPrice: null,
      totalValue: null,
      status: 'TRIGGERED',
      isGTT: true,
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    const eligibility = isOrderEligibleForModification(triggeredGtt);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain('already triggered');
  });

  // ── 21. Reject modification after execution ──
  it('21. rejects modification of EXECUTED orders', () => {
    const executedOrder: Order = {
      id: 'ORD-EXEC',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY',
      type: 'MARKET',
      quantity: 10,
      requestedPrice: 2500,
      executionPrice: 2500,
      totalValue: 25000,
      status: 'EXECUTED',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: '2024-01-01T10:00:01Z',
      cancelledAt: null,
      rejectionReason: null,
    };

    const eligibility = isOrderEligibleForModification(executedOrder);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain('EXECUTED state cannot be modified');
  });

  // ── 22. Reject modification after cancellation ──
  it('22. rejects modification of CANCELLED orders', () => {
    const cancelledOrder: Order = {
      id: 'ORD-CANC',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 2400,
      executionPrice: null,
      totalValue: null,
      status: 'CANCELLED',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: '2024-01-01T10:05:00Z',
      rejectionReason: null,
    };

    const eligibility = isOrderEligibleForModification(cancelledOrder);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain('CANCELLED state cannot be modified');
  });

  // ── 23. Reject unsupported bracket modification ──
  it('23. rejects generic order modification on orders managed by active bracket groups', () => {
    const bracketGroup: BracketGroup = {
      id: 'BG-1',
      parentOrderId: 'ORD-B-PARENT',
      stopLossOrderId: 'ORD-B-SL',
      targetOrderId: 'ORD-B-TGT',
      positionId: 'POS-1',
      ocoGroupId: 'BG-1',
      symbol: 'TCS',
      side: 'BUY',
      entryPrice: 3500,
      stopLossPrice: 3400,
      targetPrice: 3700,
      originalQuantity: 10,
      remainingQuantity: 10,
      status: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const targetChildOrder: Order = {
      id: 'ORD-B-TGT',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      side: 'SELL',
      type: 'TARGET',
      quantity: 10,
      requestedPrice: 3700,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    const eligibility = isOrderEligibleForModification(targetChildOrder, [bracketGroup]);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain('Bracket-managed orders cannot be modified directly');
  });

  // ── 24. OCO integrity ──
  it('24. protects OCO atomic integrity: bracket parent/child order modification rejected', () => {
    const { result } = renderProvider();

    act(() => {
      result.current.resetAccount();
    });

    // Place an active bracket order
    let bracketRes: ReturnType<typeof result.current.placeBracketOrder>;
    act(() => {
      bracketRes = result.current.placeBracketOrder(
        'BUY',
        10,
        2000, // below current price of RELIANCE, entry stays pending
        1900,
        2200,
        'RELIANCE',
        'Reliance Industries'
      );
    });
    expect(bracketRes!.success).toBe(true);

    const entryId = bracketRes!.entryOrder!.id;

    // Modifying the bracket entry order should be rejected safely
    act(() => {
      const modRes = result.current.modifyOrder({
        orderId: entryId,
        price: 2050,
      });
      expect(modRes.success).toBe(false);
      expect(modRes.error).toContain('Bracket-managed orders cannot be modified directly');
    });
  });

  // ── 25. Duplicate modification prevention ──
  it('25. rejects duplicate modification requests that change no parameters', () => {
    const order: Order = {
      id: 'ORD-1',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 2400,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    // Submitting exact same values
    const validation = validateOrderModification(
      { orderId: 'ORD-1', quantity: 10, price: 2400 },
      order,
      100000,
      [],
      [order],
      MOCK_STOCKS
    );
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('rejected as duplicate');
  });

  // ── 26. Stale version rejection ──
  it('26. rejects modification if expectedVersion does not match current orderVersion', () => {
    const order: Order = {
      id: 'ORD-VER',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      requestedPrice: 2400,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: '2024-01-01T10:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
      orderVersion: 3, // Current version is 3
    };

    const validation = validateOrderModification(
      { orderId: 'ORD-VER', price: 2450, expectedVersion: 2 }, // Client thought it was version 2
      order,
      100000,
      [],
      [order],
      MOCK_STOCKS
    );
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('Stale order version. Expected version 2 but order is at version 3');
  });

  // ── 27. Persistence recovery ──
  it('27. correctly serializes and restores modified orders across sessions', () => {
    const order: Order = {
      id: 'ORD-PERSIST',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 15,
      remainingQuantity: 15,
      requestedPrice: 2450,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING',
      createdAt: '2024-01-01T10:00:00Z',
      modifiedAt: '2024-01-01T10:05:00Z',
      orderVersion: 2,
      modificationCount: 1,
      modificationHistory: [
        {
          timestamp: '2024-01-01T10:05:00Z',
          previousQuantity: 10,
          newQuantity: 15,
          previousRequestedPrice: 2400,
          newRequestedPrice: 2450,
          previousRemainingQuantity: 10,
          newRemainingQuantity: 15,
          orderVersion: 2,
        },
      ],
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
    };

    const json = JSON.stringify([order]);
    const restored: Order[] = JSON.parse(json);

    expect(restored[0].orderVersion).toBe(2);
    expect(restored[0].modificationHistory?.length).toBe(1);
    expect(restored[0].modificationHistory?.[0].newQuantity).toBe(15);
  });

  // ── 28. Reset account behavior ──
  it('28. resetAccount clears all orders and modification history completely', () => {
    const { result } = renderProvider();

    act(() => {
      result.current.placeOrder({
        symbol: 'RELIANCE',
        companyName: 'Reliance Industries',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 10,
        limitPrice: 2000,
        currentPrice: 2500,
      });
    });
    expect(result.current.orders.length).toBe(1);

    act(() => {
      result.current.resetAccount();
    });

    expect(result.current.orders).toEqual([]);
    expect(result.current.account.cashBalance).toBe(1000000);
  });

  // ── 29. No cash deduction during modification ──
  it('29. guarantees cash balance is never deducted merely because an order is modified', () => {
    const { result } = renderProvider();

    act(() => {
      result.current.resetAccount();
    });

    const cashInitial = result.current.account.cashBalance;

    let placeRes: ReturnType<typeof result.current.placeOrder>;
    act(() => {
      placeRes = result.current.placeOrder({
        symbol: 'TCS',
        companyName: 'Tata Consultancy Services',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 10,
        limitPrice: 3000, // below 3500, stays pending
        currentPrice: 3500,
      });
    });
    expect(placeRes!.success).toBe(true);

    const cashAfterPlace = result.current.account.cashBalance;
    expect(cashAfterPlace).toBe(cashInitial); // Pending order does not deduct cash, only reserves

    act(() => {
      const modRes = result.current.modifyOrder({
        orderId: placeRes!.order!.id,
        price: 3100, // price increases
        quantity: 15, // quantity increases
      });
      expect(modRes.success).toBe(true);
    });

    // Invariant: modification never alters live cash balance!
    expect(result.current.account.cashBalance).toBe(cashInitial);
  });

  // ── 30. No holdings mutation during modification ──
  it('30. guarantees holdings quantity is never mutated merely because a SELL order is modified', () => {
    const { result } = renderProvider();

    act(() => {
      result.current.resetAccount();
      // Buy 50 shares of TCS via immediate market order
      result.current.executeBuy('TCS', 50, 3500, 'Tata Consultancy Services');
    });

    const holdingBefore = result.current.holdings.find(h => h.symbol === 'TCS');
    expect(holdingBefore?.quantity).toBe(50);

    // Place pending SELL limit order for 20 shares
    let sellRes: ReturnType<typeof result.current.placeOrder>;
    act(() => {
      sellRes = result.current.placeOrder({
        symbol: 'TCS',
        companyName: 'Tata Consultancy Services',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 20,
        limitPrice: 4000, // above 3500, stays pending
        currentPrice: 3500,
      });
    });
    expect(sellRes!.success).toBe(true);

    // Modify SELL order quantity from 20 to 30
    act(() => {
      const modRes = result.current.modifyOrder({
        orderId: sellRes!.order!.id,
        quantity: 30,
      });
      expect(modRes.success).toBe(true);
    });

    // Invariant: holding quantity still 50! (only reservation changed)
    const holdingAfterMod = result.current.holdings.find(h => h.symbol === 'TCS');
    expect(holdingAfterMod?.quantity).toBe(50);
  });
});
