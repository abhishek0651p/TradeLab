/* ── Day 31.2: GTT Creation Protection Guard Tests ──────────────────────────────
Integration tests against the real TradingProvider, covering the GTT creation
guard added to placeOrder() for Day 31.2.

Setup:
- To simulate persistence protection active, `tradelab_orders` is seeded with
  malformed JSON before rendering the provider. On load the provider's
  `inspectGttOrdersStorage` returns status 'malformed', so
  `gttPersistenceAllowedRef.current` is false and guarded order writes are
  skipped.
- With no `tradelab_orders` present, persistence is available (status 'missing')
  and the guard is a no-op.
────────────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTrading, TradingProvider } from '../context/TradingContext';
import { MOCK_STOCKS } from '../data/mockData';
import type { PlaceOrderParams } from '../types';

const RELIANCE = MOCK_STOCKS.find(s => s.symbol === 'RELIANCE')!;

const wrapper = TradingProvider;

const gttBuyLimitParams = (overrides: Partial<PlaceOrderParams> = {}): PlaceOrderParams => ({
  symbol: RELIANCE.symbol,
  companyName: RELIANCE.companyName,
  side: 'BUY',
  orderType: 'LIMIT',
  quantity: 10,
  limitPrice: 2500,
  currentPrice: RELIANCE.price,
  isGTT: true,
  ...overrides,
});

const marketBuyParams = (overrides: Partial<PlaceOrderParams> = {}): PlaceOrderParams => ({
  symbol: RELIANCE.symbol,
  companyName: RELIANCE.companyName,
  side: 'BUY',
  orderType: 'MARKET',
  quantity: 10,
  currentPrice: RELIANCE.price,
  ...overrides,
});

const limitBuyParams = (overrides: Partial<PlaceOrderParams> = {}): PlaceOrderParams => ({
  symbol: RELIANCE.symbol,
  companyName: RELIANCE.companyName,
  side: 'BUY',
  orderType: 'LIMIT',
  quantity: 10,
  limitPrice: 2900, // below current price so order stays PENDING (created, not executed)
  currentPrice: RELIANCE.price,
  ...overrides,
});

const renderProvider = () => renderHook(() => useTrading(), { wrapper });

describe('Day 31.2 — GTT creation protection guard (TradingProvider integration)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('1. rejects GTT creation when persistence protection is active', async () => {
    localStorage.setItem('tradelab_orders', 'not valid json');

    const { result } = renderProvider();

    const res = result.current.placeOrder(gttBuyLimitParams());

    expect(res.success).toBe(false);
    expect(res.error).toContain('GTT orders are temporarily disabled');

    // Warning notification generated
    await waitFor(() => expect(result.current.notifications.length).toBe(1));
    const notification = result.current.notifications[0];
    expect(notification.type).toBe('ORDER_REJECTED');
    expect(notification.priority).toBe('WARNING');
    expect(notification.title).toBe('GTT Orders Disabled');
    expect(notification.message).toContain('GTT orders are temporarily disabled');
    expect(notification.message).toContain('Reset the account to re-enable GTT persistence');
    expect(notification.route).toBe('/settings');
  });

  it('2. allows GTT creation when persistence is available and validations pass', async () => {
    // tradelab_orders absent -> status 'missing' -> allowOrderPersistence true
    const { result } = renderProvider();

    const res = result.current.placeOrder(gttBuyLimitParams());

    expect(res.success).toBe(true);
    expect(res.order?.isGTT).toBe(true);
    expect(res.order?.status).toBe('PENDING');
    await waitFor(() => expect(result.current.orders.some(o => o.isGTT)).toBe(true));
  });

  it('3. allows standard MARKET order creation when GTT persistence is protected', async () => {
    localStorage.setItem('tradelab_orders', '{ broken');

    const { result } = renderProvider();

    const beforeCash = result.current.account.cashBalance;
    const beforeOrders = result.current.orders.length;
    const beforeExecutions = result.current.executions.length;

    const res = result.current.placeOrder(marketBuyParams());

    await waitFor(() => expect(result.current.orders.length).toBe(beforeOrders + 1));

    expect(res.success).toBe(true);
    expect(res.execution).toBeDefined();
    expect(result.current.account.cashBalance).toBeLessThan(beforeCash);
    expect(result.current.executions.length).toBe(beforeExecutions + 1);
  });

  it('4. allows standard LIMIT order creation when GTT persistence is protected', async () => {
    localStorage.setItem('tradelab_orders', '{ broken');

    const { result } = renderProvider();

    const beforeOrders = result.current.orders.length;

    const res = result.current.placeOrder(limitBuyParams());

    await waitFor(() => expect(result.current.orders.length).toBe(beforeOrders + 1));

    expect(res.success).toBe(true);
    expect(res.order?.isGTT).toBe(false);
    expect(res.order?.status).toBe('PENDING');
  });

  it('5. a rejected GTT order does not change cash, holdings, orders, executions or trades', async () => {
    localStorage.setItem('tradelab_orders', '{ broken');

    const { result } = renderProvider();

    const before = {
      cash: result.current.account.cashBalance,
      holdings: result.current.holdings.length,
      orders: result.current.orders.length,
      executions: result.current.executions.length,
      trades: result.current.trades.length,
    };

    const res = result.current.placeOrder(gttBuyLimitParams());

    expect(res.success).toBe(false);
    expect(res.order).toBeUndefined();
    expect(result.current.account.cashBalance).toBe(before.cash);
    expect(result.current.holdings.length).toBe(before.holdings);
    expect(result.current.orders.length).toBe(before.orders);
    expect(result.current.executions.length).toBe(before.executions);
    expect(result.current.trades.length).toBe(before.trades);
    expect(result.current.orders.some(o => o.isGTT)).toBe(false);
  });

  it('6. generates a warning notification directing the user to Settings when GTT creation is rejected', async () => {
    localStorage.setItem('tradelab_orders', '{ broken');

    const { result } = renderProvider();

    result.current.placeOrder(gttBuyLimitParams());

    await waitFor(() => expect(result.current.notifications.length).toBe(1));
    const notification = result.current.notifications[0];

    expect(notification.type).toBe('ORDER_REJECTED');
    expect(notification.priority).toBe('WARNING');
    expect(notification.title).toBe('GTT Orders Disabled');
    expect(notification.message).toBe(
      'GTT orders are temporarily disabled because stored order data could not be safely loaded. Reset the account to re-enable GTT persistence.'
    );
    expect(notification.route).toBe('/settings');
  });
});
