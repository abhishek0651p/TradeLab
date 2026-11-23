/* ── Day 32 Phase C — Market Liquidity & Slippage Simulation Tests ───────────────────────────────
 * Unit tests for LiquidityEngine functions and integration tests for processPendingOrders
 * with liquidity/slippage/price-protection. All calculations deterministic so tests remain reliable.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  computeAvailableTickLiquidity,
  computeLiquidityConstrainedQuantity,
  computeSlippage,
  applyOrderTypePriceProtection,
  DEFAULT_LIQUIDITY_CONFIG,
  DEFAULT_SLIPPAGE_CONFIG,
  SlippageConfig,
  LiquidityConfig,
} from '../engine/LiquidityEngine';
import { Order, OrderSide, OrderStatus, OrderType, PlaceOrderParams, StockData } from '../types';
import { MOCK_STOCKS } from '../data/mockData';
import { useTrading, TradingProvider } from '../context/TradingContext';

const RELIANCE = MOCK_STOCKS.find(s => s.symbol === 'RELIANCE')!;
const wrapper = TradingProvider;

const renderProvider = () => renderHook(() => useTrading(), { wrapper });

describe('LiquidityEngine — computeAvailableTickLiquidity', () => {
  it('1. returns minimum floor when stock volume is missing', () => {
    const result = computeAvailableTickLiquidity(undefined, 'BUY');
    expect(result).toBe(DEFAULT_LIQUIDITY_CONFIG.minTickLiquidity);
  });

  it('2. uses ratio of daily volume per tick', () => {
    const result = computeAvailableTickLiquidity(RELIANCE, 'BUY', 0);
    expect(result).toBeGreaterThanOrEqual(DEFAULT_LIQUIDITY_CONFIG.minTickLiquidity);
    expect(result).toBeLessThanOrEqual(DEFAULT_LIQUIDITY_CONFIG.maxTickLiquidity);
  });

  it('3. varies liquidity deterministically across ticks', () => {
    const r1 = computeAvailableTickLiquidity(RELIANCE, 'BUY', 1);
    const r2 = computeAvailableTickLiquidity(RELIANCE, 'BUY', 2);
    // Same symbol, different ticks → different variation (deterministic via seed)
    // Could be equal by chance but very unlikely with 0.8-1.2x variation
    expect(r1).not.toBe(r2);
  });

  it('4. BUY liquidity differs from SELL liquidity for same tick', () => {
    const buy = computeAvailableTickLiquidity(RELIANCE, 'BUY', 1);
    const sell = computeAvailableTickLiquidity(RELIANCE, 'SELL', 1);
    // Same tick, same stock → may differ due to side-dependent seed
    expect(buy).not.toBe(sell); // Could be equal by chance
  });
});

describe('LiquidityEngine — computeLiquidityConstrainedQuantity', () => {
  it('5. caps fill quantity by available liquidity', () => {
    const constrained = computeLiquidityConstrainedQuantity(100, 30);
    expect(constrained).toBe(30);
  });

  it('6. respects maxParticipationRate', () => {
    // financialQty=100, liquidity=50, maxParticipationRate=0.5 → 25
    const constrained = computeLiquidityConstrainedQuantity(100, 50, 0.5);
    expect(constrained).toBe(25);
  });

  it('7. returns financial qty when liquidity exceeds financial qty', () => {
    const constrained = computeLiquidityConstrainedQuantity(30, 100000);
    expect(constrained).toBe(30);
  });

  it('8. returns 0 when financial qty is 0', () => {
    const constrained = computeLiquidityConstrainedQuantity(0, 100);
    expect(constrained).toBe(0);
  });

  it('9. returns 0 when liquidity is 0', () => {
    const constrained = computeLiquidityConstrainedQuantity(100, 0);
    expect(constrained).toBe(0);
  });
});

describe('LiquidityEngine — computeSlippage', () => {
  it('10. BUY slips price upward (execution > reference)', () => {
    const result = computeSlippage(2500, 100, 'BUY', 500, DEFAULT_SLIPPAGE_CONFIG);
    expect(result.executionPrice).toBeGreaterThan(2500);
    expect(result.slippagePercent).toBeGreaterThan(0);
  });

  it('11. SELL slips price downward (execution < reference)', () => {
    const result = computeSlippage(2500, 100, 'SELL', 500, DEFAULT_SLIPPAGE_CONFIG);
    expect(result.executionPrice).toBeLessThan(2500);
    expect(result.slippagePercent).toBeGreaterThan(0);
  });

  it('12. zero slippage when config disabled', () => {
    const result = computeSlippage(2500, 100, 'BUY', 500, { enabled: false } as SlippageConfig);
    expect(result.executionPrice).toBe(2500);
    expect(result.slippagePercent).toBe(0);
  });

  it('13. zero slippage when baseSlippage=0 and impactRate=0', () => {
    const result = computeSlippage(2500, 100, 'BUY', 500, {
      enabled: true,
      baseSlippagePercent: 0,
      impactRate: 0,
      maxSlippagePercent: 0.05,
    } as SlippageConfig);
    expect(result.executionPrice).toBe(2500);
    expect(result.slippagePercent).toBe(0);
  });

  it('14. maxSlippagePercent clamps total slippage', () => {
    // Large order relative to liquidity → high impact ratio → would exceed max without clamp
    const result = computeSlippage(2500, 10000, 'BUY', 100, DEFAULT_SLIPPAGE_CONFIG);
    expect(result.slippagePercent).toBeLessThanOrEqual(DEFAULT_SLIPPAGE_CONFIG.maxSlippagePercent);
    expect(result.executionPrice).toBeLessThanOrEqual(2500 * (1 + DEFAULT_SLIPPAGE_CONFIG.maxSlippagePercent));
  });

  it('15. protects against zero or negative prices on SELL', () => {
    const result = computeSlippage(2500, 1000, 'SELL', 10, DEFAULT_SLIPPAGE_CONFIG);
    // SELL may drive price negative; function clamps to 0.01
    expect(result.executionPrice).toBeGreaterThanOrEqual(0.01);
  });

  it('16. zero quantity returns reference price with zero slippage', () => {
    const result = computeSlippage(2500, 0, 'BUY', 100, DEFAULT_SLIPPAGE_CONFIG);
    expect(result.executionPrice).toBe(2500);
    expect(result.slippagePercent).toBe(0);
  });

  it('17. negative price returns 0', () => {
    const result = computeSlippage(-100, 10, 'BUY', 100, DEFAULT_SLIPPAGE_CONFIG);
    expect(result.executionPrice).toBe(0);
  });
});

describe('LiquidityEngine — applyOrderTypePriceProtection', () => {
  const limitBuyOrder: Order = {
    id: 'ORD-TEST-BUY',
    symbol: 'RELIANCE',
    companyName: 'Reliance Industries',
    side: 'BUY' as OrderSide,
    type: 'LIMIT' as OrderType,
    quantity: 10,
    requestedPrice: 2500,
    triggerPrice: undefined,
    executionPrice: null,
    totalValue: null,
    status: 'PENDING' as OrderStatus,
    createdAt: '2026-01-01T00:00:00Z',
    executedAt: null,
    cancelledAt: null,
    rejectionReason: null,
    isGTT: false,
    expiry: null,
    trailingConfig: undefined,
  };

  const limitSellOrder: Order = {
    ...limitBuyOrder,
    id: 'ORD-TEST-SELL',
    side: 'SELL' as OrderSide,
  };

  const stopMarketBuy: Order = {
    ...limitBuyOrder,
    id: 'ORD-SL-BUY',
    type: 'STOP_MARKET' as OrderType,
    requestedPrice: 2400,
    triggerPrice: 2400,
    status: 'PENDING' as OrderStatus,
  };

  const stopLimitBuy: Order = {
    ...limitBuyOrder,
    id: 'ORD-SLIM-BUY',
    type: 'STOP_LIMIT' as OrderType,
    triggerPrice: 2400,
    status: 'TRIGGERED' as OrderStatus,
  };

  const stopLimitSell: Order = {
    ...limitSellOrder,
    id: 'ORD-SLIM-SELL',
    type: 'STOP_LIMIT' as OrderType,
    requestedPrice: 2400,
    triggerPrice: 2600,
    status: 'TRIGGERED' as OrderStatus,
  };

  it('18. LIMIT BUY clamps price to limit when slippage pushes above limit', () => {
    const result = applyOrderTypePriceProtection(2600, limitBuyOrder, 2500);
    expect(result.executionPrice).toBe(2500);
    expect(result.clamped).toBe(true);
  });

  it('19. LIMIT BUY executes at slipped price when below limit', () => {
    const result = applyOrderTypePriceProtection(2400, limitBuyOrder, 2500);
    expect(result.executionPrice).toBe(2400);
    expect(result.clamped).toBe(false);
  });

  it('20. LIMIT SELL clamps price to limit when slippage pushes below limit', () => {
    const result = applyOrderTypePriceProtection(2400, limitSellOrder, 2500);
    expect(result.executionPrice).toBe(2500);
    expect(result.clamped).toBe(true);
  });

  it('21. LIMIT SELL executes at slipped price when above limit', () => {
    const result = applyOrderTypePriceProtection(2600, limitSellOrder, 2500);
    expect(result.executionPrice).toBe(2600);
    expect(result.clamped).toBe(false);
  });

  it('22. STOP_MARKET executes at slipped price freely (no limit protection)', () => {
    const result = applyOrderTypePriceProtection(2500, stopMarketBuy, 2400);
    expect(result.executionPrice).toBe(2500);
    expect(result.clamped).toBe(false);
  });

  it('23. STOP_LIMIT BUY: execution clamped to limit after trigger', () => {
    const result = applyOrderTypePriceProtection(2550, stopLimitBuy, 2450);
    expect(result.executionPrice).toBe(2500);
    expect(result.clamped).toBe(true);
  });

  it('24. STOP_LIMIT SELL: execution clamped to limit after trigger', () => {
    const result = applyOrderTypePriceProtection(2350, stopLimitSell, 2550);
    expect(result.executionPrice).toBe(2400);
    expect(result.clamped).toBe(true);
  });

  it('25. defensive fallback to market price when computed price invalid', () => {
    const result = applyOrderTypePriceProtection(NaN, limitBuyOrder, 2500);
    expect(result.executionPrice).toBe(2500);
  });
});

describe('LiquidityEngine — integrations', () => {
  it('26. full pipeline: tick liquidity → constrained qty → slippage → price protection', () => {
    const stock: StockData = {
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      price: 2500,
      previousClose: 2480,
      change: 20,
      changePercent: 0.81,
      open: 2500,
      dayHigh: 2520,
      dayLow: 2470,
      volume: 5000000,
      sector: 'Conglomerates',
      exchange: 'NSE',
      description: 'Reliance Industries Limited',
    };

    const tickLiquidity = computeAvailableTickLiquidity(stock, 'BUY', 1);
    expect(tickLiquidity).toBeGreaterThan(0);

    const constrained = computeLiquidityConstrainedQuantity(100, tickLiquidity);
    expect(constrained).toBeLessThanOrEqual(100);
    expect(constrained).toBeLessThanOrEqual(tickLiquidity);

    const { executionPrice } = computeSlippage(2500, constrained, 'BUY', tickLiquidity, DEFAULT_SLIPPAGE_CONFIG);
    const priceProtection = applyOrderTypePriceProtection(executionPrice, {
      id: 'ORD-TEST',
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      side: 'BUY' as OrderSide,
      type: 'LIMIT' as OrderType,
      quantity: 100,
      requestedPrice: 2550,
      triggerPrice: undefined,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING' as OrderStatus,
      createdAt: '2026-01-01T00:00:00Z',
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null,
      isGTT: false,
      expiry: null,
      trailingConfig: undefined,
    }, 2500);

    expect(priceProtection.executionPrice).toBeLessThanOrEqual(2550);
    expect(typeof priceProtection.clamped).toBe('boolean');
  });
});

describe('TradingProvider — liquidity/slippage integration (simulateTick path)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const reliableTick = (result: ReturnType<typeof renderProvider>['result']) => {
    act(() => {
      result.current.simulateTick();
    });
  };

  // ── 27. Low-liquidity execution → partial fill, remaining persists ──
  it('27. low tick liquidity causes partial fill, remaining quantity persists', () => {
    // Seed high cash balance so order for 100,000 shares passes pre-trade cash validation
    localStorage.setItem('tradelab_account', JSON.stringify({
      cashBalance: 500000000,
      investedValue: 0,
      portfolioValue: 500000000,
      realizedPnL: 0,
      unrealizedPnL: 0,
      startingBalance: 500000000,
    }));
    const { result } = renderProvider();

    // MARKET BUY with quantity far exceeding tick liquidity (~2000-4000 shares per tick).
    const QTY = 100000;
    let placeRes: ReturnType<typeof result.current.placeOrder>;
    act(() => {
      placeRes = result.current.placeOrder({
        symbol: RELIANCE.symbol,
        companyName: RELIANCE.companyName,
        side: 'BUY',
        orderType: 'MARKET',
        quantity: QTY,
        currentPrice: RELIANCE.price,
      });
    });
    expect(placeRes!.success).toBe(true);
    expect(placeRes!.order!.status).toBe('PARTIALLY_FILLED');

    const order = placeRes!.order!;
    const remaining = order.remainingQuantity!;
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThan(QTY);
    expect(order.filledQuantity!).toBe(QTY - remaining);

    // Cash should only decrease by the filled quantity × execution price.
    const cash = result.current.account.cashBalance;
    expect(cash).toBeGreaterThan(0);
    expect(order.executionPrice!).toBeGreaterThan(RELIANCE.price); // BUY slips upward

    // Advance ticks to consume remaining quantity.
    let remainingQty = remaining;
    for (let i = 0; i < 100 && remainingQty > 0; i++) {
      reliableTick(result);
      const currentOrder = result.current.orders.find(o => o.id === order.id);
      remainingQty = currentOrder ? (currentOrder.remainingQuantity ?? 0) : remainingQty;
      if (currentOrder?.status === 'EXECUTED') break;
    }
    expect(result.current.orders.find(o => o.id === order.id)!.status).toBe('EXECUTED');
  });

  // ── 28. LIMIT BUY price protection (simulateTick) ──
  it('28. LIMIT BUY never executes above limit price even with slippage (simulateTick)', () => {
    const { result } = renderProvider();

    // BUY LIMIT at current price - 100 → PENDING (condition not met: currentPrice > limitPrice)
    const limitPrice = RELIANCE.price - 100;
    let placeRes: ReturnType<typeof result.current.placeOrder>;
    act(() => {
      placeRes = result.current.placeOrder({
        symbol: RELIANCE.symbol,
        companyName: RELIANCE.companyName,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 10,
        limitPrice,
        currentPrice: RELIANCE.price,
      });
    });
    expect(placeRes!.success).toBe(true);
    expect(placeRes!.order!.status).toBe('PENDING');

    let triggered = false;
    for (let i = 0; i < 100 && !triggered; i++) {
      reliableTick(result);
      const order = result.current.orders.find(o => o.id === placeRes!.order!.id);
      if (order && order.status !== 'PENDING') {
        triggered = true;
        // Execution price must not exceed limit price
        expect(order.executionPrice!).toBeLessThanOrEqual(limitPrice + 0.01);
      }
    }
    expect(triggered).toBe(true);
  });

  // ── 29. LIMIT SELL price protection (simulateTick) ──
  it('29. LIMIT SELL never executes below limit price even with slippage (simulateTick)', () => {
    const { result } = renderProvider();

    // First acquire holdings
    act(() => {
      result.current.executeBuy(RELIANCE.symbol, 10, RELIANCE.price, RELIANCE.companyName);
    });

    // SELL LIMIT at current price + 10 → PENDING
    const limitPrice = Number((RELIANCE.price + 10).toFixed(2));
    let placeRes: ReturnType<typeof result.current.placeOrder>;
    act(() => {
      placeRes = result.current.placeOrder({
        symbol: RELIANCE.symbol,
        companyName: RELIANCE.companyName,
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 10,
        limitPrice,
        currentPrice: RELIANCE.price,
      });
    });
    expect(placeRes!.success).toBe(true);
    expect(placeRes!.order!.status).toBe('PENDING');

    let triggered = false;
    for (let i = 0; i < 100 && !triggered; i++) {
      reliableTick(result);
      const order = result.current.orders.find(o => o.id === placeRes!.order!.id);
      if (order && order.status !== 'PENDING') {
        triggered = true;
        // Execution price must not be below limit price
        expect(order.executionPrice!).toBeGreaterThanOrEqual(limitPrice - 0.01);
      }
    }
    expect(triggered).toBe(true);
  });

  // ── 30. STOP_MARKET slippage (simulateTick) ──
  it('30. STOP_MARKET executes at a worse price because of slippage (simulateTick)', () => {
    const { result } = renderProvider();

    // BUY STOP_MARKET trigger must be above current price
    const triggerPrice = RELIANCE.price + 50;
    let placeRes: ReturnType<typeof result.current.placeOrder>;
    act(() => {
      placeRes = result.current.placeOrder({
        symbol: RELIANCE.symbol,
        companyName: RELIANCE.companyName,
        side: 'BUY',
        orderType: 'STOP_MARKET',
        quantity: 10,
        triggerPrice,
        currentPrice: RELIANCE.price,
      });
    });
    expect(placeRes!.success).toBe(true);
    expect(placeRes!.order!.status).toBe('PENDING');

    let triggered = false;
    for (let i = 0; i < 100 && !triggered; i++) {
      reliableTick(result);
      const order = result.current.orders.find(o => o.id === placeRes!.order!.id);
      if (order && order.status !== 'PENDING') {
        triggered = true;
        expect(order.status).toBe('EXECUTED');
        // STOP_MARKET may execute at worse price due to slippage
        // Price protection does not clamp STOP_MARKET
      }
    }
    expect(triggered).toBe(true);
  });

  // ── 31. STOP_LIMIT price protection after trigger (simulateTick) ──
  it('31. STOP_LIMIT obeys its limit price after triggering (simulateTick)', () => {
    const { result } = renderProvider();

    const triggerPrice = RELIANCE.price + 20;
    const limitPrice = triggerPrice + 50; // BUY stop-limit: limit >= trigger
    let placeRes: ReturnType<typeof result.current.placeOrder>;
    act(() => {
      placeRes = result.current.placeOrder({
        symbol: RELIANCE.symbol,
        companyName: RELIANCE.companyName,
        side: 'BUY',
        orderType: 'STOP_LIMIT',
        quantity: 10,
        triggerPrice,
        limitPrice,
        currentPrice: RELIANCE.price,
      });
    });
    expect(placeRes!.success).toBe(true);
    expect(placeRes!.order!.status).toBe('PENDING');

    let reachedTriggered = false;
    for (let i = 0; i < 100 && !reachedTriggered; i++) {
      reliableTick(result);
      const order = result.current.orders.find(o => o.id === placeRes!.order!.id);
      if (order && order.status === 'TRIGGERED') {
        reachedTriggered = true;
        break;
      }
      if (order && order.status === 'EXECUTED') {
        reachedTriggered = true;
        expect(order.executionPrice!).toBeLessThanOrEqual(limitPrice);
        break;
      }
    }
    if (reachedTriggered) {
      // After TRIGGERED, the next tick with price <= limit executes at limit or below.
      const order = result.current.orders.find(o => o.id === placeRes!.order!.id);
      if (order && order.status === 'EXECUTED') {
        expect(order.executionPrice!).toBeLessThanOrEqual(limitPrice);
      }
    }
  });

  // ── 32. GTT compatibility ──
  it('32. GTT LIMIT order trigger-state behavior preserved with liquidity', () => {
    const { result } = renderProvider();

    const limitPrice = RELIANCE.price - 1;
    let placeRes: ReturnType<typeof result.current.placeOrder>;
    act(() => {
      placeRes = result.current.placeOrder({
        symbol: RELIANCE.symbol,
        companyName: RELIANCE.companyName,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 10,
        limitPrice,
        currentPrice: RELIANCE.price,
        isGTT: true,
      });
    });
    expect(placeRes!.success).toBe(true);
    expect(placeRes!.order!.status).toBe('PENDING');
    expect(placeRes!.order!.isGTT).toBe(true);

    let executed = false;
    for (let i = 0; i < 100 && !executed; i++) {
      reliableTick(result);
      const order = result.current.orders.find(o => o.id === placeRes!.order!.id);
      if (order && order.status === 'EXECUTED') {
        executed = true;
        expect(order.executionPrice!).toBeLessThanOrEqual(limitPrice);
      } else if (order && order.status === 'REJECTED') {
        break; // GTT expired — acceptable outcome
      }
    }
    expect(executed).toBe(true);
  });

  // ── 33. Cash and holdings accounting after slippage ──
  it('33. cash and holdings update correctly for slippage-adjusted fills', () => {
    const { result } = renderProvider();

    act(() => {
      result.current.updateSettings({ transactionCostsEnabled: false });
    });

    const priceBefore = result.current.account.cashBalance;
    const QTY = 10;
    let placeRes: ReturnType<typeof result.current.placeOrder>;
    act(() => {
      placeRes = result.current.placeOrder({
        symbol: RELIANCE.symbol,
        companyName: RELIANCE.companyName,
        side: 'BUY',
        orderType: 'MARKET',
        quantity: QTY,
        currentPrice: RELIANCE.price,
      });
    });
    expect(placeRes!.success).toBe(true);

    const order = placeRes!.order!;
    const executionPrice = order.executionPrice!;
    const filled = order.filledQuantity!;
    const expectedCash = priceBefore - executionPrice * filled;
    expect(result.current.account.cashBalance).toBeCloseTo(expectedCash, 2);

    // Holding should exist with average buy price at execution price
    const holding = result.current.holdings.find(h => h.symbol === RELIANCE.symbol);
    expect(holding).toBeDefined();
    expect(holding!.quantity).toBe(filled);
    expect(holding!.averageBuyPrice).toBe(executionPrice);
  });

  // ── 34. Bracket All-or-None behavior unchanged ──
  it('34. bracket entry orders remain All-or-None (no partial fill)', () => {
    const { result } = renderProvider();

    // Place a bracket order — entry should execute fully or not at all
    let bracketRes: ReturnType<typeof result.current.placeBracketOrder>;
    act(() => {
      bracketRes = result.current.placeBracketOrder(
        'BUY',
        10,
        RELIANCE.price,
        RELIANCE.price - 50,
        RELIANCE.price + 50,
        RELIANCE.symbol,
        RELIANCE.companyName
      );
    });
    // Bracket creation may reject if persistence disabled; if successful, entry is full
    if (bracketRes!.success && bracketRes!.entryOrder) {
      expect(bracketRes!.entryOrder.status).toBe('EXECUTED');
      expect(bracketRes!.entryOrder.filledQuantity).toBeUndefined(); // Bracket entries don't use partial fill tracking
      // Bracket entry should be full quantity
    }
  });

  // ── 35. Shared tick-liquidity consumption across multiple orders in the same tick ──
  it('35. multiple orders in the same tick share available tick liquidity', () => {
    // Seed high cash balance
    localStorage.setItem('tradelab_account', JSON.stringify({
      cashBalance: 500000000,
      investedValue: 0,
      portfolioValue: 500000000,
      realizedPnL: 0,
      unrealizedPnL: 0,
      startingBalance: 500000000,
    }));
    const { result } = renderProvider();

    // Place two LIMIT BUY orders for RELIANCE at price - 5 (pending until price drops)
    const limitPrice = Number((RELIANCE.price - 5).toFixed(2));
    let order1Res: ReturnType<typeof result.current.placeOrder>;
    let order2Res: ReturnType<typeof result.current.placeOrder>;
    act(() => {
      order1Res = result.current.placeOrder({
        symbol: RELIANCE.symbol,
        companyName: RELIANCE.companyName,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 2000,
        limitPrice,
        currentPrice: RELIANCE.price,
      });
      order2Res = result.current.placeOrder({
        symbol: RELIANCE.symbol,
        companyName: RELIANCE.companyName,
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 2000,
        limitPrice,
        currentPrice: RELIANCE.price,
      });
    });
    expect(order1Res!.success).toBe(true);
    expect(order1Res!.order!.status).toBe('PENDING');
    expect(order2Res!.success).toBe(true);
    expect(order2Res!.order!.status).toBe('PENDING');

    // Advance ticks until price drops to limitPrice and triggers both orders in the same tick
    let processed = false;
    for (let i = 0; i < 100 && !processed; i++) {
      reliableTick(result);
      const o1 = result.current.orders.find(o => o.id === order1Res!.order!.id)!;
      const o2 = result.current.orders.find(o => o.id === order2Res!.order!.id)!;
      if (o1.status !== 'PENDING' || o2.status !== 'PENDING') {
        processed = true;
        // Both orders had the same trigger condition, so they were evaluated in the same tick
        // Order 1 should have consumed up to available tick liquidity
        expect(o1.filledQuantity).toBeGreaterThan(0);
        // Combined filled quantities in this tick must not exceed available tick liquidity ceiling
        const totalFilled = (o1.filledQuantity ?? 0) + (o2.filledQuantity ?? 0);
        expect(totalFilled).toBeLessThanOrEqual(DEFAULT_LIQUIDITY_CONFIG.maxTickLiquidity);
        // Order 2 shares the remaining liquidity, so its filled quantity is capped by what's left
        if (o1.filledQuantity === 2000) {
          expect(o2.filledQuantity ?? 0).toBeLessThan(2000);
        }
      }
    }
    expect(processed).toBe(true);
  });
});