/* ── Day 29: Trading Engine Tests ──────────────────────────────────────────────
Tests for trading engine integration — enrichment, aggregation, and reservation
validation as used by the TradingProvider engine.
──────────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { enrichHoldings, aggregatePortfolio } from '../context/TradingContext';
import { MOCK_STOCKS } from '../data/mockData';

const MOCK_HOLDINGS = [
  { symbol: 'RELIANCE', quantity: 50, averageBuyPrice: 2900 },
  { symbol: 'TCS', quantity: 20, averageBuyPrice: 3950 },
];

const MOCK_ACCOUNT = {
  startingBalance: 1000000,
  cashBalance: 250000,
  investedValue: 224000,
  portfolioValue: 477226.5,
  realizedPnL: 1250,
  unrealizedPnL: 3226.5,
};

const MOCK_TRADES = [
  { id: 'TRD-001', timestamp: '2024-01-01T00:00:00Z', symbol: 'RELIANCE', companyName: 'Reliance Industries', side: 'SELL' as const, quantity: 10, executionPrice: 3000, totalValue: 30000, realizedPnL: 1000 },
  { id: 'TRD-002', timestamp: '2024-01-02T00:00:00Z', symbol: 'TCS', companyName: 'Tata Consultancy Services', side: 'SELL' as const, quantity: 5, executionPrice: 4000, totalValue: 20000, realizedPnL: 250 },
];

describe('enrichHoldings', () => {
  it('computes current price, invested value, current value, P&L, and sector', () => {
    const enriched = enrichHoldings(MOCK_HOLDINGS, MOCK_STOCKS);
    expect(enriched).toHaveLength(2);

    const reliance = enriched.find(h => h.symbol === 'RELIANCE');
    expect(reliance).toBeDefined();
    expect(reliance!.currentPrice).toBe(2950.45);
    expect(reliance!.investedValue).toBe(145000); // 50 * 2900
    expect(reliance!.currentValue).toBe(147522.5); // 50 * 2950.45
    expect(reliance!.unrealizedPnL).toBe(2522.5); // 147522.5 - 145000
    expect(reliance!.companyName).toBe('Reliance Industries');
    expect(reliance!.sector).toBe('Conglomerates');

    const tcs = enriched.find(h => h.symbol === 'TCS');
    expect(tcs).toBeDefined();
    expect(tcs!.currentPrice).toBe(3985.20);
    expect(tcs!.investedValue).toBe(79000); // 20 * 3950
    expect(tcs!.currentValue).toBe(79704); // 20 * 3985.20
    expect(tcs!.unrealizedPnL).toBe(704); // 79704 - 79000
    expect(tcs!.sector).toBe('IT Services');
  });

  it('falls back to averageBuyPrice when stock not found', () => {
    const holdings = [{ symbol: 'UNKNOWN', quantity: 10, averageBuyPrice: 100 }];
    const enriched = enrichHoldings(holdings, MOCK_STOCKS);
    expect(enriched[0].currentPrice).toBe(100);
    expect(enriched[0].investedValue).toBe(1000);
    expect(enriched[0].currentValue).toBe(1000);
    expect(enriched[0].unrealizedPnL).toBe(0);
    expect(enriched[0].companyName).toBe('UNKNOWN');
    expect(enriched[0].sector).toBe('Unknown');
  });

  it('returns empty array for empty holdings', () => {
    expect(enrichHoldings([], MOCK_STOCKS)).toEqual([]);
  });
});

describe('aggregatePortfolio', () => {
  it('computes all portfolio-level metrics correctly', () => {
    const summary = aggregatePortfolio(MOCK_HOLDINGS, MOCK_STOCKS, MOCK_ACCOUNT, MOCK_TRADES);

    expect(summary.totalInvestedValue).toBe(224000); // 145000 + 79000
    expect(summary.totalCurrentValue).toBe(227226.5); // 147522.5 + 79704
    expect(summary.totalUnrealizedPnL).toBe(3226.5); // 227226.5 - 224000
    expect(summary.cashBalance).toBe(250000);
    expect(summary.totalAccountValue).toBe(477226.5); // 250000 + 227226.5
    expect(summary.realizedPnL).toBe(1250); // 1000 + 250
    expect(summary.combinedPnL).toBe(4476.5); // 1250 + 3226.5
    expect(summary.totalUnrealizedPnLPercent).toBeCloseTo(
      (3226.5 / 224000) * 100,
      4
    );
    expect(summary.dayPnL).toBeDefined();
  });

  it('handles empty holdings', () => {
    const emptyAccount = { ...MOCK_ACCOUNT, cashBalance: 1000000 };
    const summary = aggregatePortfolio([], MOCK_STOCKS, emptyAccount, []);
    expect(summary.totalInvestedValue).toBe(0);
    expect(summary.totalCurrentValue).toBe(0);
    expect(summary.totalUnrealizedPnL).toBe(0);
    expect(summary.totalAccountValue).toBe(1000000);
    expect(summary.realizedPnL).toBe(0);
    expect(summary.combinedPnL).toBe(0);
  });

  it('computes totalReturnPercent relative to starting balance', () => {
    const summary = aggregatePortfolio(MOCK_HOLDINGS, MOCK_STOCKS, MOCK_ACCOUNT, MOCK_TRADES);
    // aggregatePortfolio rounds totalReturnPercent with Number(totalReturnPercent.toFixed(2))
    // = ((477226.5 - 1000000) / 1000000) * 100 = -52.27735 → rounded to -52.28
    expect(summary.totalReturnPercent).toBeCloseTo(-52.28, 2);
  });

  it('computes dayPnL from stock change × quantity', () => {
    const summary = aggregatePortfolio(MOCK_HOLDINGS, MOCK_STOCKS, MOCK_ACCOUNT, MOCK_TRADES);
    // RELIANCE change: 30.35 * 50 = 1517.5
    // TCS change: -25.30 * 20 = -506
    // dayPnL: 1011.5
    expect(summary.dayPnL).toBeCloseTo(1011.5, 2);
  });

  it('handles negative dayPnL when all prices fall', () => {
    const fallingStocks = MOCK_STOCKS.map(s => ({ ...s, change: -Math.abs(s.change) }));
    const summary = aggregatePortfolio(MOCK_HOLDINGS, fallingStocks, MOCK_ACCOUNT, MOCK_TRADES);
    expect(summary.dayPnL).toBeLessThan(0);
  });
});