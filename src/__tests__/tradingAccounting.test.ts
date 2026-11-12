/* ── Day 29: Trading Accounting Tests ─────────────────────────────────────────────
Tests for standardized financial accounting definitions and calculations.
──────────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import {
  computeCostBasis,
  computeCurrentMarketValue,
  computeUnrealizedPnL,
  computeRealizedPnL,
  computePortfolioEquity,
  computeAvailableBuyingPower,
  computeAvailableSellQuantityFn,
  PortfolioSummaryMetrics,
  computePortfolioSummaryMetrics,
} from '../engine/TradingAccounting';
import { Holding, StockData, Trade } from '../types';

const MOCK_STOCKS: StockData[] = [
  { symbol: 'RELIANCE', companyName: 'Reliance Industries', price: 2950.45, sector: 'Conglomerates', previousClose: 2920.10, change: 30.35, changePercent: 1.04, open: 2930.00, dayHigh: 2965.80, dayLow: 2915.20, volume: 4521000, exchange: 'NSE', description: '' },
  { symbol: 'TCS', companyName: 'Tata Consultancy Services', price: 3985.20, sector: 'IT Services', previousClose: 4010.50, change: -25.30, changePercent: -0.63, open: 4005.00, dayHigh: 4020.10, dayLow: 3970.50, volume: 2150000, exchange: 'NSE', description: '' },
  { symbol: 'HDFCBANK', companyName: 'HDFC Bank', price: 1540.60, sector: 'Banking', previousClose: 1520.00, change: 20.60, changePercent: 1.36, open: 1525.50, dayHigh: 1545.00, dayLow: 1520.00, volume: 8950000, exchange: 'NSE', description: '' },
];

const MOCK_HOLDINGS: Holding[] = [
  { symbol: 'RELIANCE', quantity: 50, averageBuyPrice: 2900 },
  { symbol: 'TCS', quantity: 20, averageBuyPrice: 3950 },
];

const MOCK_TRADES: Trade[] = [
  { id: 'TRD-001', timestamp: '2024-01-01T00:00:00Z', symbol: 'RELIANCE', companyName: 'Reliance Industries', side: 'SELL', quantity: 10, executionPrice: 3000, totalValue: 30000, realizedPnL: 1000, orderId: 'ORD-001', executionId: 'EXE-001', orderType: 'MARKET' },
  { id: 'TRD-002', timestamp: '2024-01-02T00:00:00Z', symbol: 'TCS', companyName: 'Tata Consultancy Services', side: 'SELL', quantity: 5, executionPrice: 4000, totalValue: 20000, realizedPnL: 250, orderId: 'ORD-002', executionId: 'EXE-002', orderType: 'MARKET' },
];

describe('computeCostBasis', () => {
  it('computes total cost basis from acquisition price (averageBuyPrice), not current market price', () => {
    // RELIANCE: 50 * 2900 (avg buy) = 145000
    // TCS: 20 * 3950 (avg buy) = 79000
    // Total = 224000 (uses averageBuyPrice, NOT stock.price 2950.45 / 3985.20)
    expect(computeCostBasis(MOCK_HOLDINGS, MOCK_STOCKS)).toBe(224000);
  });

  it('returns 0 for empty holdings', () => {
    expect(computeCostBasis([], MOCK_STOCKS)).toBe(0);
  });

  it('uses averageBuyPrice when stock not found', () => {
    const holdings = [{ symbol: 'UNKNOWN', quantity: 10, averageBuyPrice: 100 }];
    // Stock not found in MOCK_STOCKS, uses averageBuyPrice = 100 * 10 = 1000
    expect(computeCostBasis(holdings, MOCK_STOCKS)).toBe(1000);
  });
});

describe('computeCurrentMarketValue', () => {
  it('computes current market value using stock prices', () => {
    // RELIANCE: 50 * 2950.45 = 147522.5
    // TCS: 20 * 3985.20 = 79704
    // Total = 227226.5
    expect(computeCurrentMarketValue(MOCK_HOLDINGS, MOCK_STOCKS)).toBe(227226.5);
  });

  it('returns 0 for empty holdings', () => {
    expect(computeCurrentMarketValue([], MOCK_STOCKS)).toBe(0);
  });

  it('uses averageBuyPrice when stock price not available', () => {
    const holdings = [{ symbol: 'UNKNOWN', quantity: 10, averageBuyPrice: 100 }];
    expect(computeCurrentMarketValue(holdings, MOCK_STOCKS)).toBe(1000);
  });
});

describe('computeUnrealizedPnL', () => {
  it('computes unrealized P&L as market value minus cost basis', () => {
    // Cost basis: 50*2900 + 20*3950 = 224000 (acquisition price)
    // Market value: 50*2950.45 + 20*3985.20 = 227226.5 (current price)
    // P&L: 227226.5 - 224000 = 3226.5 (no longer zero when stock data exists)
    expect(computeUnrealizedPnL(MOCK_HOLDINGS, MOCK_STOCKS)).toBe(3226.5);
  });

  it('returns 0 for empty holdings', () => {
    expect(computeUnrealizedPnL([], MOCK_STOCKS)).toBe(0);
  });

  it('handles negative unrealized P&L when prices drop', () => {
    const fallingStocks: StockData[] = [
      { symbol: 'RELIANCE', companyName: 'Reliance Industries', price: 2800, sector: 'Conglomerates', previousClose: 2920.10, change: -120.10, changePercent: -4.11, open: 2930.00, dayHigh: 2965.80, dayLow: 2915.20, volume: 4521000, exchange: 'NSE', description: '' },
      { symbol: 'TCS', companyName: 'Tata Consultancy Services', price: 3900, sector: 'IT Services', previousClose: 4010.50, change: -110.50, changePercent: -2.76, open: 4005.00, dayHigh: 4020.10, dayLow: 3970.50, volume: 2150000, exchange: 'NSE', description: '' },
    ];
    // Cost basis: 50*2900 + 20*3950 = 224000 (acquisition price, unchanged)
    // Market value: 50*2800 + 20*3900 = 218000 (falling prices)
    // P&L: 218000 - 224000 = -6000
    expect(computeUnrealizedPnL(MOCK_HOLDINGS, fallingStocks)).toBe(-6000);
  });

  it('falls back to averageBuyPrice for market value when stock data is missing, yielding zero P&L', () => {
    // Stock 'RELIANCE' is absent, so computeCurrentMarketValue falls back to
    // averageBuyPrice (3000) and computeCostBasis also uses averageBuyPrice (3000).
    // Without a market price there is no measurable gain/loss → P&L = 0,
    // but cost basis is still derived from the real acquisition price.
    const holdingsNoStock: Holding[] = [
      { symbol: 'RELIANCE', quantity: 50, averageBuyPrice: 3000 }, // bought at 3000
    ];
    const stocksNoMatch: StockData[] = [
      { symbol: 'TCS', companyName: 'Tata Consultancy Services', price: 3985.20, sector: 'IT Services', previousClose: 4010.50, change: -25.30, changePercent: -0.63, open: 4005.00, dayHigh: 4020.10, dayLow: 3970.50, volume: 2150000, exchange: 'NSE', description: '' },
    ];
    expect(computeUnrealizedPnL(holdingsNoStock, stocksNoMatch)).toBe(0);
    expect(computeCostBasis(holdingsNoStock, stocksNoMatch)).toBe(150000);
  });
});

describe('computeRealizedPnL', () => {
  it('sums realized P&L from trades', () => {
    // 1000 + 250 = 1250
    expect(computeRealizedPnL(MOCK_TRADES)).toBe(1250);
  });

  it('returns 0 for empty trades', () => {
    expect(computeRealizedPnL([])).toBe(0);
  });

  it('handles trades with null realizedPnL', () => {
    const tradesWithNull: Trade[] = [
      { ...MOCK_TRADES[0], realizedPnL: null },
      MOCK_TRADES[1],
    ];
    expect(computeRealizedPnL(tradesWithNull)).toBe(250);
  });

  it('handles negative realized P&L', () => {
    const lossTrades: Trade[] = [
      { ...MOCK_TRADES[0], realizedPnL: -500 },
      { ...MOCK_TRADES[1], realizedPnL: -200 },
    ];
    expect(computeRealizedPnL(lossTrades)).toBe(-700);
  });
});

describe('computePortfolioEquity', () => {
  it('computes portfolio equity as cash + market value', () => {
    // Cash: 100000
    // Market value: 227226.5
    // Equity: 327226.5
    expect(computePortfolioEquity(100000, MOCK_HOLDINGS, MOCK_STOCKS)).toBe(327226.5);
  });

  it('handles zero cash balance', () => {
    expect(computePortfolioEquity(0, MOCK_HOLDINGS, MOCK_STOCKS)).toBe(227226.5);
  });
});

describe('computeAvailableBuyingPower', () => {
  it('computes available buying power as cash minus reserved', () => {
    expect(computeAvailableBuyingPower(100000, 29400)).toBe(70600);
  });

  it('floors at 0 when reserved exceeds cash', () => {
    expect(computeAvailableBuyingPower(1000, 50000)).toBe(0);
  });

  it('returns cash when no reservations', () => {
    expect(computeAvailableBuyingPower(100000, 0)).toBe(100000);
  });
});

describe('computeAvailableSellQuantityFn', () => {
  it('computes available sell quantity as holding minus reserved', () => {
    expect(computeAvailableSellQuantityFn(100, 25)).toBe(75);
  });

  it('floors at 0 when reserved exceeds holding', () => {
    expect(computeAvailableSellQuantityFn(10, 50)).toBe(0);
  });

  it('returns full holding when no reservations', () => {
    expect(computeAvailableSellQuantityFn(100, 0)).toBe(100);
  });
});

describe('computePortfolioSummaryMetrics', () => {
  it('computes all portfolio metrics correctly', () => {
    const result = computePortfolioSummaryMetrics(
      100000,          // cashBalance
      MOCK_HOLDINGS,   // holdings
      MOCK_STOCKS,     // stocks
      29400,           // reservedBuyCapital
      MOCK_TRADES      // trades
    );

    // computeCostBasis uses stock.price: RELIANCE=2950.45, TCS=3985.20
    // 50*2950.45 + 20*3985.20 = 147522.5 + 79704 = 227226.5
    expect(result.cashBalance).toBe(100000);
    // Cost basis uses averageBuyPrice: 50*2900 + 20*3950 = 224000
    expect(result.costBasis).toBe(224000);
    // Market value uses stock.price: 50*2950.45 + 20*3985.20 = 227226.5
    expect(result.currentMarketValue).toBe(227226.5);
    expect(result.unrealizedPnL).toBe(3226.5);
    expect(result.realizedPnL).toBe(1250);
    expect(result.portfolioEquity).toBe(327226.5); // 100000 + 227226.5
    expect(result.availableBuyingPower).toBe(70600);
  });

  it('floors portfolioEquity at 0', () => {
    const result = computePortfolioSummaryMetrics(
      0, [], MOCK_STOCKS, 0, []
    );
    expect(result.portfolioEquity).toBe(0);
  });

  it('floors availableBuyingPower at 0', () => {
    const result = computePortfolioSummaryMetrics(
      1000, [], MOCK_STOCKS, 5000, []
    );
    expect(result.availableBuyingPower).toBe(0);
  });

  it('handles empty holdings and trades', () => {
    const result = computePortfolioSummaryMetrics(
      1000000, [], MOCK_STOCKS, 0, []
    );
    expect(result.cashBalance).toBe(1000000);
    expect(result.costBasis).toBe(0);
    expect(result.currentMarketValue).toBe(0);
    expect(result.unrealizedPnL).toBe(0);
    expect(result.realizedPnL).toBe(0);
    expect(result.portfolioEquity).toBe(1000000);
    expect(result.availableBuyingPower).toBe(1000000);
  });
});

/* ── Day 30.1: Financial Accounting Correction — Regression Suite ─────────────
 * Locks in the corrected cost-basis semantics:
 *   cost basis      = averageBuyPrice × quantity        (acquisition cost)
 *   market value    = current stock price × quantity     (falls back to avg buy price)
 *   unrealized P&L  = market value − cost basis
 * These tests guard against reintroducing the bug where cost basis was derived
 * from the current market price (which forced unrealized P&L to always be 0).
 * ─────────────────────────────────────────────────────────────────────────── */

const makeStock = (symbol: string, price: number): StockData => ({
  symbol,
  companyName: `${symbol} Corp`,
  price,
  previousClose: price,
  change: 0,
  changePercent: 0,
  open: price,
  dayHigh: price,
  dayLow: price,
  volume: 1000,
  sector: 'Test',
  exchange: 'NSE',
  description: '',
});

const makeTrade = (realizedPnL: number | null): Trade => ({
  id: 'TRD-REG-' + Math.random().toString(36).slice(2, 8),
  timestamp: '2024-01-01T00:00:00Z',
  symbol: 'TEST',
  companyName: 'Test Corp',
  side: 'SELL',
  quantity: 10,
  executionPrice: 1200,
  totalValue: 12000,
  realizedPnL,
  orderId: 'ORD-REG',
  executionId: 'EXE-REG',
  orderType: 'MARKET',
});

describe('Day 30.1 — Cost Basis Correction Regression', () => {
  it('case 1: BUY at 1000, current 1100 → unrealized P&L +1000', () => {
    const holdings: Holding[] = [{ symbol: 'TEST', quantity: 10, averageBuyPrice: 1000 }];
    const stocks: StockData[] = [makeStock('TEST', 1100)];
    expect(computeCostBasis(holdings, stocks)).toBe(10000);
    expect(computeCurrentMarketValue(holdings, stocks)).toBe(11000);
    expect(computeUnrealizedPnL(holdings, stocks)).toBe(1000);
  });

  it('case 2: BUY at 1000, current 900 → unrealized P&L -1000', () => {
    const holdings: Holding[] = [{ symbol: 'TEST', quantity: 10, averageBuyPrice: 1000 }];
    const stocks: StockData[] = [makeStock('TEST', 900)];
    expect(computeCostBasis(holdings, stocks)).toBe(10000);
    expect(computeCurrentMarketValue(holdings, stocks)).toBe(9000);
    expect(computeUnrealizedPnL(holdings, stocks)).toBe(-1000);
  });

  it('case 3: weighted average 5@1000 + 5@1200 = 1100 drives cost basis', () => {
    // Holding stores the weighted-average buy price (1100), quantity 10.
    // Cost basis must be 10 * 1100 = 11000 — not 5*1000 + 5*1200 double-counted,
    // and not the most recent price (1200 → 12000) nor the first (1000 → 10000).
    const holdings: Holding[] = [{ symbol: 'TEST', quantity: 10, averageBuyPrice: 1100 }];
    const stocks: StockData[] = [makeStock('TEST', 1100)];
    expect(computeCostBasis(holdings, stocks)).toBe(11000);
    expect(computeUnrealizedPnL(holdings, stocks)).toBe(0);
  });

  it('case 4: partial SELL leaves remaining quantity and basis intact', () => {
    // Bought 10 @ 1000, sold 4 → 6 remain, average buy price unchanged at 1000.
    const holdings: Holding[] = [{ symbol: 'TEST', quantity: 6, averageBuyPrice: 1000 }];
    const stocks: StockData[] = [makeStock('TEST', 1200)];
    expect(computeCostBasis(holdings, stocks)).toBe(6000);
    expect(computeCurrentMarketValue(holdings, stocks)).toBe(7200);
    expect(computeUnrealizedPnL(holdings, stocks)).toBe(1200);
  });

  it('case 5: missing stock data keeps cost basis from averageBuyPrice', () => {
    const holdings: Holding[] = [{ symbol: 'NOPRICE', quantity: 4, averageBuyPrice: 250 }];
    const stocks: StockData[] = []; // no market data available
    expect(computeCostBasis(holdings, stocks)).toBe(1000);
    // Market value safely falls back to averageBuyPrice → no measurable P&L.
    expect(computeCurrentMarketValue(holdings, stocks)).toBe(1000);
    expect(computeUnrealizedPnL(holdings, stocks)).toBe(0);
  });

  it('case 6: zero quantity contributes nothing', () => {
    const holdings: Holding[] = [{ symbol: 'TEST', quantity: 0, averageBuyPrice: 1000 }];
    const stocks: StockData[] = [makeStock('TEST', 1200)];
    expect(computeCostBasis(holdings, stocks)).toBe(0);
    expect(computeCurrentMarketValue(holdings, stocks)).toBe(0);
    expect(computeUnrealizedPnL(holdings, stocks)).toBe(0);
  });

  it('case 7: multiple holdings are summed independently', () => {
    const holdings: Holding[] = [
      { symbol: 'AAA', quantity: 10, averageBuyPrice: 100 }, // cost 1000, mkt 10*120 = 1200
      { symbol: 'BBB', quantity: 5, averageBuyPrice: 200 },  // cost 1000, mkt 5*180  = 900
    ];
    const stocks: StockData[] = [makeStock('AAA', 120), makeStock('BBB', 180)];
    expect(computeCostBasis(holdings, stocks)).toBe(2000);
    expect(computeCurrentMarketValue(holdings, stocks)).toBe(2100);
    expect(computeUnrealizedPnL(holdings, stocks)).toBe(100);
  });

  it('case 8: realized P&L from closed trades is separate and not mixed into unrealized P&L', () => {
    const holdings: Holding[] = [{ symbol: 'TEST', quantity: 10, averageBuyPrice: 1000 }];
    const stocks: StockData[] = [makeStock('TEST', 1200)];
    const trades: Trade[] = [makeTrade(5000)]; // 5000 realized from a prior closed trade
    const summary = computePortfolioSummaryMetrics(10000, holdings, stocks, 0, trades);

    expect(summary.realizedPnL).toBe(5000);   // from trades only
    expect(summary.unrealizedPnL).toBe(2000); // 10*1200 - 10*1000, independent of realized
    // Realized P&L must not leak into cost basis or unrealized P&L.
    expect(summary.costBasis).toBe(10000);
    expect(summary.unrealizedPnL).toBe(2000);
    expect(summary.portfolioEquity).toBe(22000); // 10000 cash + 12000 market value
  });
});