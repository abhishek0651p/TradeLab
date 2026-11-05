/* ── Day 29: Risk Calculation Model Tests ──────────────────────────────────────
Tests for pre-trade risk concentration (BUG 04 fix) and risk calculations.
──────────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import {
  computePreOrderRiskSnapshot,
  computeConcentrationClassification,
  computeLargestPositionPercent,
  computeHoldingAllocationPercent,
  computeMarketValue,
  computePortfolioValue,
} from '../risk/RiskCalculationModel';
import { Holding, StockData } from '../types';

const MOCK_STOCKS: StockData[] = [
  { symbol: 'RELIANCE', companyName: 'Reliance Industries', price: 2950.45, previousClose: 2920.10, change: 30.35, changePercent: 1.04, open: 2930.00, dayHigh: 2965.80, dayLow: 2915.20, volume: 4521000, sector: 'Conglomerates', exchange: 'NSE', description: '' },
  { symbol: 'TCS', companyName: 'Tata Consultancy Services', price: 3985.20, previousClose: 4010.50, change: -25.30, changePercent: -0.63, open: 4005.00, dayHigh: 4020.10, dayLow: 3970.50, volume: 2150000, sector: 'IT Services', exchange: 'NSE', description: '' },
  { symbol: 'HDFCBANK', companyName: 'HDFC Bank', price: 1540.60, previousClose: 1520.00, change: 20.60, changePercent: 1.36, open: 1525.50, dayHigh: 1545.00, dayLow: 1520.00, volume: 8950000, sector: 'Banking', exchange: 'NSE', description: '' },
];

const HOLDINGS_EXISTING: Holding[] = [
  { symbol: 'RELIANCE', quantity: 50, averageBuyPrice: 2900 }, // existing 50 shares
  { symbol: 'TCS', quantity: 20, averageBuyPrice: 3950 },
];

describe('computeLargestPositionPercent', () => {
  it('computes largest position allocation percent', () => {
    const pct = computeLargestPositionPercent(HOLDINGS_EXISTING, MOCK_STOCKS);
    // RELIANCE: 50 * 2950.45 = 147522.5
    // TCS: 20 * 3985.20 = 79704
    // Total market value: 227226.5
    // RELIANCE %: 147522.5 / 227226.5 * 100 ≈ 64.92%
    expect(pct).toBeGreaterThan(60);
    expect(pct).toBeLessThan(70);
  });

  it('returns 0 for empty holdings', () => {
    expect(computeLargestPositionPercent([], MOCK_STOCKS)).toBe(0);
  });
});

describe('computeConcentrationClassification', () => {
  it('classifies Low for < 20%', () => {
    expect(computeConcentrationClassification(15)).toBe('Low');
    expect(computeConcentrationClassification(0)).toBe('Low');
    expect(computeConcentrationClassification(19.99)).toBe('Low');
  });

  it('classifies Moderate for >= 20% and < 40%', () => {
    expect(computeConcentrationClassification(20)).toBe('Moderate');
    expect(computeConcentrationClassification(39.99)).toBe('Moderate');
    expect(computeConcentrationClassification(25)).toBe('Moderate');
  });

  it('classifies High for >= 40%', () => {
    expect(computeConcentrationClassification(40)).toBe('High');
    expect(computeConcentrationClassification(45)).toBe('High');
    expect(computeConcentrationClassification(100)).toBe('High');
  });
});

describe('computePreOrderRiskSnapshot — BUY additional shares (BUG 04 regression)', () => {
  const baseParams = {
    symbol: 'RELIANCE',
    side: 'BUY' as const,
    quantity: 20, // buying 20 more shares on top of existing 50
    currentPrice: 2950.45,
    cashBalance: 1000000,
    holdings: HOLDINGS_EXISTING,
    stocks: MOCK_STOCKS,
  };

  it('includes existing holding quantity in BUY allocation estimate (BUG 04 fix)', () => {
    const result = computePreOrderRiskSnapshot(baseParams);
    // existing qty: 50, proposed qty: 20, total: 70 shares at 2950.45 = 206531.5
    // Portfolio value after: cash 1000000 - 20*2950.45 + market value
    // = 1000000 - 59009 + 227226.5 + 59009 = 1000000 + 227226.5 (cash decrease offsets new position value)
    // Wait, estimatedHoldings has 70 RELIANCE shares = 70 * 2950.45 = 206531.5
    // TCS stays 79704. Total exposure = 286235.5
    // estimatedCash = 1000000 - 59009 = 940991
    // estimatedPortfolioValue = 940991 + 286235.5 = 1227226.5
    // estimatedAllocationPercent = 206531.5 / 1227226.5 * 100 ≈ 16.83%
    expect(result.estimatedAllocationPercent).toBeGreaterThan(0);
    expect(result.estimatedAllocationPercent).toBeGreaterThan(15); // should reflect total 70 shares
    expect(result.concentrationChange).toBeDefined();
  });

  it('BUY allocation reflects total position (existing + new), not just new order', () => {
    const result = computePreOrderRiskSnapshot(baseParams);
    // With existing holding: total RELIANCE qty = 50 (existing) + 20 (new) = 70
    // estimatedAllocationPercent uses (70 * 2950.45) / estimatedPortfolioValue
    // Without existing: only 20 shares counted -> estimatedAllocationPercent would be smaller
    const withoutExisting = computePreOrderRiskSnapshot({
      ...baseParams,
      holdings: [], // no existing holding
    });
    // The allocation with existing holding should be greater than without
    expect(result.estimatedAllocationPercent).toBeGreaterThan(
      withoutExisting.estimatedAllocationPercent
    );
  });

  it('BUY with existing holding produces higher allocation estimate than without', () => {
    const withoutExisting = computePreOrderRiskSnapshot({
      ...baseParams,
      holdings: [], // no existing holding
    });
    const withExisting = computePreOrderRiskSnapshot(baseParams);
    expect(withExisting.estimatedAllocationPercent).toBeGreaterThan(
      withoutExisting.estimatedAllocationPercent
    );
  });

  it('computes currentLargestPct correctly', () => {
    const result = computePreOrderRiskSnapshot(baseParams);
    expect(result.currentAllocationPercent).toBeGreaterThan(60);
    expect(result.currentAllocationPercent).toBeLessThan(70);
  });
});

describe('computePreOrderRiskSnapshot — SELL order', () => {
  const sellParams = {
    symbol: 'RELIANCE',
    side: 'SELL' as const,
    quantity: 10,
    currentPrice: 2950.45,
    cashBalance: 1000000,
    holdings: HOLDINGS_EXISTING,
    stocks: MOCK_STOCKS,
  };

  it('computes estimated allocation from remaining holdings after SELL', () => {
    const result = computePreOrderRiskSnapshot(sellParams);
    expect(result.estimatedAllocationPercent).toBeDefined();
    expect(result.estimatedAllocationPercent).toBeGreaterThanOrEqual(0);
    expect(result.estimatedMarketExposure).toBeDefined();
    expect(result.concentrationChange).toBeDefined();
  });

  it('SELL reduces holding value in estimated holdings', () => {
    const result = computePreOrderRiskSnapshot(sellParams);
    // After selling 10 RELIANCE shares, remaining 40 * 2950.45 = 118018
    // Total estimated market exposure should reflect reduced position
    const totalMarketValue = computeMarketValue(HOLDINGS_EXISTING, MOCK_STOCKS);
    expect(result.estimatedMarketExposure).toBeLessThan(totalMarketValue);
  });
});

describe('computePreOrderRiskSnapshot — warnings', () => {
  it('issues concentration warning when estimated allocation exceeds 40%', () => {
    const highConcentrationParams = {
      symbol: 'RELIANCE',
      side: 'BUY' as const,
      quantity: 1000, // very large order
      currentPrice: 2950.45,
      cashBalance: 1000000,
      holdings: HOLDINGS_EXISTING,
      stocks: MOCK_STOCKS,
    };
    const result = computePreOrderRiskSnapshot(highConcentrationParams);
    expect(result.warnings.some(w => w.includes('concentration') || w.includes('allocation'))).toBe(true);
  });

  it('issues cash utilization warning when estimated cash utilization exceeds 80%', () => {
    const highCashUtilParams = {
      symbol: 'TCS',
      side: 'BUY' as const,
      quantity: 100,
      currentPrice: 3985.20,
      cashBalance: 50000, // very low cash
      holdings: [],
      stocks: MOCK_STOCKS,
    };
    const result = computePreOrderRiskSnapshot(highCashUtilParams);
    expect(result.warnings.some(w => w.includes('Cash utilization'))).toBe(true);
  });
});

describe('computeMarketValue', () => {
  it('computes total market value of holdings', () => {
    const value = computeMarketValue(HOLDINGS_EXISTING, MOCK_STOCKS);
    // 50 * 2950.45 + 20 * 3985.20 = 147522.5 + 79704 = 227226.5
    expect(value).toBe(227226.5);
  });

  it('returns 0 for empty holdings', () => {
    expect(computeMarketValue([], MOCK_STOCKS)).toBe(0);
  });
});

describe('computePortfolioValue', () => {
  it('computes cash + market value', () => {
    const value = computePortfolioValue(1000000, HOLDINGS_EXISTING, MOCK_STOCKS);
    expect(value).toBe(1227226.5);
  });

  it('handles zero cash', () => {
    expect(computePortfolioValue(0, HOLDINGS_EXISTING, MOCK_STOCKS)).toBe(227226.5);
  });
});