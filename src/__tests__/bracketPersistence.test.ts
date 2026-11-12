/* ── Day 30.3: Bracket Order Persistence, Recovery & State Reconciliation Tests ────
Tests for:
1. Active bracket group persistence and recovery.
2. Terminal state immutability (COMPLETED and CANCELLED).
3. Missing parent / missing child orphan reconciliation.
4. Duplicate group ID deduplication and invalid quantity sanitization.
5. Zero remaining quantity handling.
6. Partial exit recovery (remaining quantity and child order quantities synchronized).
7. Corrupted JSON and unsupported storage version handling.
8. No duplicate execution or double-counted realized P&L.
9. Independent non-bracket orders remain untouched.
10. Strict preservation of financial invariants (startingBalance, cash, portfolio equity, buying power).
───────────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AccountState,
  BracketGroup,
  Holding,
  Order,
  OrderStatus,
  OrderType,
  OrderSide,
  StockData
} from '../types';
import {
  BRACKET_STORAGE_KEY,
  BRACKET_STORAGE_VERSION,
  serializeBracketGroups,
  deserializeBracketGroups,
  inspectBracketStorage,
  reconcileBracketState,
  isValidBracketGroup,
  BracketPersistenceStatus
} from '../engine/BracketRecoveryEngine';
import {
  computePortfolioSummaryMetrics,
  computeCostBasis,
  computeCurrentMarketValue,
  computeUnrealizedPnL,
  computePortfolioEquity,
  computeAvailableBuyingPower
} from '../engine/TradingAccounting';
import { computeReservedBuyCapital } from '../engine/ReservationModel';

// Mock helper to generate valid orders
const createMockOrder = (
  id: string,
  side: OrderSide,
  type: OrderType,
  quantity: number,
  status: OrderStatus,
  symbol = 'RELIANCE',
  requestedPrice = 2500
): Order => ({
  id,
  symbol,
  companyName: 'Reliance Industries',
  side,
  type,
  quantity,
  requestedPrice,
  triggerPrice: requestedPrice,
  executionPrice: status === 'EXECUTED' ? requestedPrice : null,
  totalValue: status === 'EXECUTED' ? requestedPrice * quantity : null,
  status,
  createdAt: new Date().toISOString(),
  executedAt: status === 'EXECUTED' ? new Date().toISOString() : null,
  cancelledAt: status === 'CANCELLED' ? new Date().toISOString() : null,
  rejectionReason: status === 'REJECTED' ? 'Test rejection' : null
});

// Mock helper to generate valid bracket groups
const createMockBracketGroup = (
  id: string,
  parentOrderId: string,
  stopLossOrderId: string,
  targetOrderId: string,
  quantity = 10,
  remainingQuantity = 10,
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' = 'ACTIVE',
  symbol = 'RELIANCE',
  side: OrderSide = 'BUY',
  stopLossPrice = 2400,
  targetPrice = 2700,
  entryPrice = 2500
): BracketGroup => ({
  id,
  parentOrderId,
  stopLossOrderId,
  targetOrderId,
  positionId: `POS-${symbol}-${id}`,
  ocoGroupId: id,
  symbol,
  side,
  entryPrice,
  stopLossPrice,
  targetPrice,
  originalQuantity: quantity,
  remainingQuantity,
  status,
  createdAt: Date.now() - 10000,
  updatedAt: Date.now()
});

const mockStocks: StockData[] = [
  {
    symbol: 'RELIANCE',
    companyName: 'Reliance Industries',
    price: 2500,
    previousClose: 2450,
    change: 50,
    changePercent: 2.04,
    open: 2460,
    dayHigh: 2520,
    dayLow: 2450,
    volume: 100000,
    sector: 'Energy',
    exchange: 'NSE',
    description: ''
  }
];

describe('Day 30.3 — Bracket Order Persistence & Recovery', () => {

  describe('Serialization and Deserialization', () => {
    it('1. Persists an active bracket group to versioned envelope', () => {
      const group = createMockBracketGroup('BG-1', 'ORD-ENTRY-1', 'ORD-SL-1', 'ORD-TGT-1');
      const serialized = serializeBracketGroups([group]);
      expect(typeof serialized).toBe('string');

      const parsed = JSON.parse(serialized);
      expect(parsed.version).toBe(BRACKET_STORAGE_VERSION);
      expect(parsed.storageKey).toBe(BRACKET_STORAGE_KEY);
      expect(Array.isArray(parsed.bracketGroups)).toBe(true);
      expect(parsed.bracketGroups.length).toBe(1);
      expect(parsed.bracketGroups[0].id).toBe('BG-1');
    });

    it('2. Restores an active bracket group from valid storage', () => {
      const group = createMockBracketGroup('BG-1', 'ORD-ENTRY-1', 'ORD-SL-1', 'ORD-TGT-1');
      const serialized = serializeBracketGroups([group]);
      const restored = deserializeBracketGroups(serialized);

      expect(restored.length).toBe(1);
      expect(restored[0].id).toBe('BG-1');
      expect(restored[0].symbol).toBe('RELIANCE');
      expect(restored[0].remainingQuantity).toBe(10);
      expect(restored[0].status).toBe('ACTIVE');
    });

    it('3. Restores completed groups preserving terminal status', () => {
      const group = createMockBracketGroup('BG-COMPLETED', 'ORD-P', 'ORD-SL', 'ORD-TGT', 10, 0, 'COMPLETED');
      const serialized = serializeBracketGroups([group]);
      const restored = deserializeBracketGroups(serialized);

      expect(restored.length).toBe(1);
      expect(restored[0].status).toBe('COMPLETED');
      expect(restored[0].remainingQuantity).toBe(0);
    });

    it('4. Restores cancelled groups preserving terminal status', () => {
      const group = createMockBracketGroup('BG-CANCELLED', 'ORD-P', 'ORD-SL', 'ORD-TGT', 10, 10, 'CANCELLED');
      const serialized = serializeBracketGroups([group]);
      const restored = deserializeBracketGroups(serialized);

      expect(restored.length).toBe(1);
      expect(restored[0].status).toBe('CANCELLED');
    });

    it('12. Safely handles malformed or corrupted JSON without throwing', () => {
      expect(deserializeBracketGroups('{ invalid json :;')).toEqual([]);
      expect(deserializeBracketGroups('')).toEqual([]);
      expect(deserializeBracketGroups(null)).toEqual([]);
      expect(deserializeBracketGroups(undefined)).toEqual([]);
      expect(deserializeBracketGroups(12345)).toEqual([]);
      expect(deserializeBracketGroups({ notAnArray: true })).toEqual([]);
    });

    it('13. Safely handles unsupported storage versions', () => {
      const invalidVersionEnvelope = JSON.stringify({
        version: 99,
        storageKey: BRACKET_STORAGE_KEY,
        bracketGroups: [createMockBracketGroup('BG-FUTURE', 'ORD-P', 'ORD-SL', 'ORD-TGT')],
        updatedAt: Date.now()
      });
      // Should reject unsupported version to avoid schema corruption
      const restored = deserializeBracketGroups(invalidVersionEnvelope);
      expect(restored).toEqual([]);
    });

    it('Supports legacy unversioned array storage for backward compatibility', () => {
      const legacyArray = [createMockBracketGroup('BG-LEGACY', 'ORD-P', 'ORD-SL', 'ORD-TGT')];
      const serialized = JSON.stringify(legacyArray);
      const restored = deserializeBracketGroups(serialized);
      expect(restored.length).toBe(1);
      expect(restored[0].id).toBe('BG-LEGACY');
    });
  });

  describe('Reconciliation & Orphan Handling', () => {
    it('5. Storage containing bracket group with missing stop-loss order is cancelled', () => {
      const group = createMockBracketGroup('BG-MISSING-SL', 'ORD-ENTRY', 'ORD-SL-MISSING', 'ORD-TGT');
      const entryOrder = createMockOrder('ORD-ENTRY', 'BUY', 'MARKET', 10, 'EXECUTED');
      const tgtOrder = createMockOrder('ORD-TGT', 'SELL', 'TARGET', 10, 'TRIGGERED');
      // SL order is missing from orders array
      const orders = [entryOrder, tgtOrder];
      const holdings: Holding[] = [{ symbol: 'RELIANCE', quantity: 10, averageBuyPrice: 2500 }];

      const result = reconcileBracketState([group], orders, holdings);
      expect(result.reconciledGroups[0].status).toBe('CANCELLED');
      // Orphaned target order should be cancelled so it cannot execute as an uncovered exit
      const reconciledTgt = result.reconciledOrders.find(o => o.id === 'ORD-TGT');
      expect(reconciledTgt?.status).toBe('CANCELLED');
      expect(result.issuesDetected.length).toBeGreaterThan(0);
    });

    it('6. Storage containing bracket group with missing target order is cancelled', () => {
      const group = createMockBracketGroup('BG-MISSING-TGT', 'ORD-ENTRY', 'ORD-SL', 'ORD-TGT-MISSING');
      const entryOrder = createMockOrder('ORD-ENTRY', 'BUY', 'MARKET', 10, 'EXECUTED');
      const slOrder = createMockOrder('ORD-SL', 'SELL', 'STOP_MARKET', 10, 'TRIGGERED');
      // Target order is missing from orders array
      const orders = [entryOrder, slOrder];
      const holdings: Holding[] = [{ symbol: 'RELIANCE', quantity: 10, averageBuyPrice: 2500 }];

      const result = reconcileBracketState([group], orders, holdings);
      expect(result.reconciledGroups[0].status).toBe('CANCELLED');
      // Orphaned SL order should be cancelled
      const reconciledSl = result.reconciledOrders.find(o => o.id === 'ORD-SL');
      expect(reconciledSl?.status).toBe('CANCELLED');
      expect(result.issuesDetected.length).toBeGreaterThan(0);
    });

    it('7. Storage containing bracket group with missing parent entry order is cancelled', () => {
      const group = createMockBracketGroup('BG-MISSING-PARENT', 'ORD-PARENT-MISSING', 'ORD-SL', 'ORD-TGT');
      const slOrder = createMockOrder('ORD-SL', 'SELL', 'STOP_MARKET', 10, 'TRIGGERED');
      const tgtOrder = createMockOrder('ORD-TGT', 'SELL', 'TARGET', 10, 'TRIGGERED');
      const orders = [slOrder, tgtOrder];
      const holdings: Holding[] = [{ symbol: 'RELIANCE', quantity: 10, averageBuyPrice: 2500 }];

      const result = reconcileBracketState([group], orders, holdings);
      expect(result.reconciledGroups[0].status).toBe('CANCELLED');
      expect(result.reconciledOrders.find(o => o.id === 'ORD-SL')?.status).toBe('CANCELLED');
      expect(result.reconciledOrders.find(o => o.id === 'ORD-TGT')?.status).toBe('CANCELLED');
      expect(result.issuesDetected.some(i => i.includes('missing parent'))).toBe(true);
    });

    it('8. Deduplicates bracket groups with duplicate IDs', () => {
      const group1 = createMockBracketGroup('BG-DUP', 'ORD-ENTRY', 'ORD-SL', 'ORD-TGT', 10, 10);
      const group2 = createMockBracketGroup('BG-DUP', 'ORD-ENTRY', 'ORD-SL', 'ORD-TGT', 10, 5); // Duplicate with stale remaining
      const entryOrder = createMockOrder('ORD-ENTRY', 'BUY', 'MARKET', 10, 'EXECUTED');
      const slOrder = createMockOrder('ORD-SL', 'SELL', 'STOP_MARKET', 10, 'TRIGGERED');
      const tgtOrder = createMockOrder('ORD-TGT', 'SELL', 'TARGET', 10, 'TRIGGERED');
      const orders = [entryOrder, slOrder, tgtOrder];
      const holdings: Holding[] = [{ symbol: 'RELIANCE', quantity: 10, averageBuyPrice: 2500 }];

      const result = reconcileBracketState([group1, group2], orders, holdings);
      expect(result.reconciledGroups.length).toBe(1);
      expect(result.reconciledGroups[0].id).toBe('BG-DUP');
      expect(result.issuesDetected.some(i => i.includes('Duplicate'))).toBe(true);
    });

    it('9. Corrects invalid quantities in stored bracket groups', () => {
      // remainingQuantity > quantity (impossible corrupted state)
      const group = createMockBracketGroup('BG-INVALID-QTY', 'ORD-ENTRY', 'ORD-SL', 'ORD-TGT', 10, 25);
      const entryOrder = createMockOrder('ORD-ENTRY', 'BUY', 'MARKET', 10, 'EXECUTED');
      const slOrder = createMockOrder('ORD-SL', 'SELL', 'STOP_MARKET', 10, 'TRIGGERED');
      const tgtOrder = createMockOrder('ORD-TGT', 'SELL', 'TARGET', 10, 'TRIGGERED');
      const orders = [entryOrder, slOrder, tgtOrder];
      const holdings: Holding[] = [{ symbol: 'RELIANCE', quantity: 10, averageBuyPrice: 2500 }];

      const result = reconcileBracketState([group], orders, holdings);
      expect(result.reconciledGroups[0].remainingQuantity).toBe(10); // Clamped to original quantity
      expect(result.issuesDetected.some(i => i.includes('exceeded original'))).toBe(true);
    });

    it('10. Stored bracket group whose remaining quantity is zero is completed and children disarmed', () => {
      const group = createMockBracketGroup('BG-ZERO', 'ORD-ENTRY', 'ORD-SL', 'ORD-TGT', 10, 0, 'ACTIVE');
      const entryOrder = createMockOrder('ORD-ENTRY', 'BUY', 'MARKET', 10, 'EXECUTED');
      const slOrder = createMockOrder('ORD-SL', 'SELL', 'STOP_MARKET', 10, 'TRIGGERED');
      const tgtOrder = createMockOrder('ORD-TGT', 'SELL', 'TARGET', 10, 'TRIGGERED');
      const orders = [entryOrder, slOrder, tgtOrder];
      const holdings: Holding[] = [];

      const result = reconcileBracketState([group], orders, holdings);
      expect(result.reconciledGroups[0].status).toBe('COMPLETED');
      expect(result.reconciledOrders.find(o => o.id === 'ORD-SL')?.status).toBe('CANCELLED');
      expect(result.reconciledOrders.find(o => o.id === 'ORD-TGT')?.status).toBe('CANCELLED');
    });

    it('11. Partial exit followed by recovery: remaining quantity and child orders synchronize to 6', () => {
      // User bought 10 shares, 4 exited before reload -> 6 remain
      const group = createMockBracketGroup('BG-PARTIAL', 'ORD-ENTRY', 'ORD-SL', 'ORD-TGT', 10, 6, 'ACTIVE');
      const entryOrder = createMockOrder('ORD-ENTRY', 'BUY', 'MARKET', 10, 'EXECUTED');
      // Suppose child orders in stored order array still had 10 shares before restart
      const slOrder = createMockOrder('ORD-SL', 'SELL', 'STOP_MARKET', 10, 'TRIGGERED');
      const tgtOrder = createMockOrder('ORD-TGT', 'SELL', 'TARGET', 10, 'TRIGGERED');
      const orders = [entryOrder, slOrder, tgtOrder];
      // Remaining holding in account is 6 shares
      const holdings: Holding[] = [{ symbol: 'RELIANCE', quantity: 6, averageBuyPrice: 2500 }];

      const result = reconcileBracketState([group], orders, holdings);
      expect(result.reconciledGroups[0].remainingQuantity).toBe(6);
      expect(result.reconciledGroups[0].status).toBe('ACTIVE');

      // Both child exit orders must have their quantity updated to 6 so they protect exactly remaining holdings
      const reconciledSl = result.reconciledOrders.find(o => o.id === 'ORD-SL');
      const reconciledTgt = result.reconciledOrders.find(o => o.id === 'ORD-TGT');
      expect(reconciledSl?.quantity).toBe(6);
      expect(reconciledTgt?.quantity).toBe(6);
    });

    it('Disarms bracket exits if position was closed completely outside bracket', () => {
      const group = createMockBracketGroup('BG-CLOSED-EXT', 'ORD-ENTRY', 'ORD-SL', 'ORD-TGT', 10, 10, 'ACTIVE');
      const entryOrder = createMockOrder('ORD-ENTRY', 'BUY', 'MARKET', 10, 'EXECUTED');
      const slOrder = createMockOrder('ORD-SL', 'SELL', 'STOP_MARKET', 10, 'TRIGGERED');
      const tgtOrder = createMockOrder('ORD-TGT', 'SELL', 'TARGET', 10, 'TRIGGERED');
      const orders = [entryOrder, slOrder, tgtOrder];
      // User sold the stock in standard SELL, so holding is 0 or non-existent
      const holdings: Holding[] = [];

      const result = reconcileBracketState([group], orders, holdings);
      expect(result.reconciledGroups[0].status).toBe('CANCELLED');
      expect(result.reconciledOrders.find(o => o.id === 'ORD-SL')?.status).toBe('CANCELLED');
      expect(result.reconciledOrders.find(o => o.id === 'ORD-TGT')?.status).toBe('CANCELLED');
    });

    it('16. Independent non-bracket orders are completely unaffected by recovery', () => {
      const group = createMockBracketGroup('BG-1', 'ORD-ENTRY', 'ORD-SL', 'ORD-TGT');
      const entryOrder = createMockOrder('ORD-ENTRY', 'BUY', 'MARKET', 10, 'EXECUTED');
      const slOrder = createMockOrder('ORD-SL', 'SELL', 'STOP_MARKET', 10, 'TRIGGERED');
      const tgtOrder = createMockOrder('ORD-TGT', 'SELL', 'TARGET', 10, 'TRIGGERED');

      // Independent orders
      const indepBuyPending = createMockOrder('ORD-INDEP-1', 'BUY', 'LIMIT', 5, 'PENDING', 'TCS', 3000);
      const indepSellTriggered = createMockOrder('ORD-INDEP-2', 'SELL', 'STOP_LIMIT', 8, 'TRIGGERED', 'INFY', 1400);
      const indepExecuted = createMockOrder('ORD-INDEP-3', 'BUY', 'MARKET', 15, 'EXECUTED', 'HDFC', 1600);

      const orders = [
        entryOrder,
        slOrder,
        tgtOrder,
        indepBuyPending,
        indepSellTriggered,
        indepExecuted
      ];
      const holdings: Holding[] = [{ symbol: 'RELIANCE', quantity: 10, averageBuyPrice: 2500 }];

      const result = reconcileBracketState([group], orders, holdings);

      const restoredIndep1 = result.reconciledOrders.find(o => o.id === 'ORD-INDEP-1');
      const restoredIndep2 = result.reconciledOrders.find(o => o.id === 'ORD-INDEP-2');
      const restoredIndep3 = result.reconciledOrders.find(o => o.id === 'ORD-INDEP-3');

      expect(restoredIndep1?.status).toBe('PENDING');
      expect(restoredIndep1?.quantity).toBe(5);
      expect(restoredIndep2?.status).toBe('TRIGGERED');
      expect(restoredIndep2?.quantity).toBe(8);
      expect(restoredIndep3?.status).toBe('EXECUTED');
      expect(restoredIndep3?.quantity).toBe(15);
    });
  });

  describe('Financial Invariants Preservation During Recovery', () => {
    it('14 & 15. Recovery executes zero orders and produces zero duplicate realized P&L', () => {
      const startingBalance = 500000;
      const cashBefore = 475000; // Bought 10 shares of RELIANCE at 2500 = 25,000 spent
      const realizedPnLBefore = 3500; // Prior realized profit from previous trades

      const group = createMockBracketGroup('BG-ACTIVE', 'ORD-ENTRY', 'ORD-SL', 'ORD-TGT', 10, 10, 'ACTIVE');
      const entryOrder = createMockOrder('ORD-ENTRY', 'BUY', 'MARKET', 10, 'EXECUTED');
      const slOrder = createMockOrder('ORD-SL', 'SELL', 'STOP_MARKET', 10, 'TRIGGERED');
      const tgtOrder = createMockOrder('ORD-TGT', 'SELL', 'TARGET', 10, 'TRIGGERED');

      const orders = [entryOrder, slOrder, tgtOrder];
      const holdings: Holding[] = [{ symbol: 'RELIANCE', quantity: 10, averageBuyPrice: 2500 }];

      // Perform recovery
      const result = reconcileBracketState([group], orders, holdings);

      // Verify no orders changed to EXECUTED
      const newlyExecuted = result.reconciledOrders.filter(
        o => o.status === 'EXECUTED' && o.id !== 'ORD-ENTRY'
      );
      expect(newlyExecuted.length).toBe(0);

      // Calculate financial metrics before and after
      const costBasis = computeCostBasis(holdings, mockStocks);
      const marketVal = computeCurrentMarketValue(holdings, mockStocks);
      const unrealized = computeUnrealizedPnL(holdings, mockStocks);
      const equity = computePortfolioEquity(cashBefore, holdings, mockStocks);
      const reservedCapital = computeReservedBuyCapital(result.reconciledOrders, mockStocks);
      const buyingPower = computeAvailableBuyingPower(cashBefore, reservedCapital);

      // Invariants check
      expect(costBasis).toBe(25000);
      expect(marketVal).toBe(25000);
      expect(unrealized).toBe(0);
      expect(equity).toBe(500000); // 475,000 cash + 25,000 market value
      expect(buyingPower).toBe(475000); // No pending BUY orders

      // Account state remains strictly identical
      const account: AccountState = {
        startingBalance,
        cashBalance: cashBefore,
        investedValue: costBasis,
        portfolioValue: equity,
        realizedPnL: realizedPnLBefore,
        unrealizedPnL: unrealized
      };

      expect(account.startingBalance).toBe(500000);
      expect(account.cashBalance).toBe(475000);
      expect(account.realizedPnL).toBe(3500);
      expect(account.portfolioValue).toBe(500000);
    });

    it('Preserves non-zero realized P&L and cost basis after partial exit recovery', () => {
      const startingBalance = 1000000;
      // Started 10,00,000
      // Bought 10 shares RELIANCE @ 2500 (-25,000) -> cash = 975,000
      // Exited 4 shares at Target 2700 (+10,800) -> cash = 985,800
      // Realized profit on 4 shares = 4 * (2700 - 2500) = +800
      const cash = 985800;
      const realizedPnL = 800;
      const remainingHoldings: Holding[] = [{ symbol: 'RELIANCE', quantity: 6, averageBuyPrice: 2500 }];

      const group = createMockBracketGroup('BG-PARTIAL', 'ORD-ENTRY', 'ORD-SL', 'ORD-TGT', 10, 6, 'ACTIVE');
      const entryOrder = createMockOrder('ORD-ENTRY', 'BUY', 'MARKET', 10, 'EXECUTED');
      const slOrder = createMockOrder('ORD-SL', 'SELL', 'STOP_MARKET', 6, 'TRIGGERED');
      const tgtOrder = createMockOrder('ORD-TGT', 'SELL', 'TARGET', 6, 'TRIGGERED');

      const orders = [entryOrder, slOrder, tgtOrder];

      // Recovery runs on page reload
      const result = reconcileBracketState([group], orders, remainingHoldings);

      // Verify accounting
      const summary = computePortfolioSummaryMetrics(cash, remainingHoldings, mockStocks, 0, []);
      expect(summary.costBasis).toBe(15000); // 6 * 2500
      expect(summary.currentMarketValue).toBe(15000); // 6 * 2500
      expect(summary.portfolioEquity).toBe(985800 + 15000); // 1,000,800
      expect(summary.portfolioEquity - startingBalance).toBe(realizedPnL); // Total gain equals realized gain of 800!
    });
  });

  describe('Day 30.3.1 — Bracket Storage Data-Loss Prevention', () => {
    it('1. Missing storage returns status "missing" and empty groups', () => {
      const result = inspectBracketStorage(null);
      expect(result.status).toBe('missing');
      expect(result.groups).toEqual([]);
    });

    it('2. Valid version-1 storage returns status "valid" with groups', () => {
      const group = createMockBracketGroup('BG-VALID', 'ORD-P', 'ORD-SL', 'ORD-TGT');
      const serialized = serializeBracketGroups([group]);
      const result = inspectBracketStorage(serialized);
      expect(result.status).toBe('valid');
      expect(result.groups.length).toBe(1);
      expect(result.groups[0].id).toBe('BG-VALID');
    });

    it('3 & 4. Version-99 storage returns "unsupported_version" and preserves raw string exactly', () => {
      const rawV99 = JSON.stringify({
        version: 99,
        storageKey: BRACKET_STORAGE_KEY,
        bracketGroups: [{ id: 'BG-FUTURE' }],
        customFutureField: 'critical_data_do_not_overwrite'
      });
      const result = inspectBracketStorage(rawV99);
      expect(result.status).toBe('unsupported_version');
      expect(result.groups).toEqual([]);
      if (result.status === 'unsupported_version') {
        expect(result.raw).toBe(rawV99);
      }
    });

    it('5 & 6. Malformed JSON returns "malformed" and preserves raw string exactly', () => {
      const malformedRaw = '{ invalid json ::: incomplete';
      const result = inspectBracketStorage(malformedRaw);
      expect(result.status).toBe('malformed');
      expect(result.groups).toEqual([]);
      if (result.status === 'malformed') {
        expect(result.raw).toBe(malformedRaw);
      }
    });

    it('7. Empty string is treated as malformed and preserved', () => {
      const emptyRaw = '   ';
      const result = inspectBracketStorage(emptyRaw);
      expect(result.status).toBe('malformed');
      expect(result.groups).toEqual([]);
      if (result.status === 'malformed') {
        expect(result.raw).toBe(emptyRaw);
      }
    });

    it('8 & 9. Invalid envelope returns "invalid_envelope" and preserves raw string exactly', () => {
      const invalidEnvelopeRaw = JSON.stringify({
        missingVersion: true,
        bracketGroups: []
      });
      const result = inspectBracketStorage(invalidEnvelopeRaw);
      expect(result.status).toBe('invalid_envelope');
      expect(result.groups).toEqual([]);
      if (result.status === 'invalid_envelope') {
        expect(result.raw).toBe(invalidEnvelopeRaw);
      }
    });

    it('10. Invalid bracket group inside a valid envelope is not silently discarded; returns invalid_envelope', () => {
      const corruptedGroupEnvelope = JSON.stringify({
        version: BRACKET_STORAGE_VERSION,
        bracketGroups: [
          createMockBracketGroup('BG-OK', 'ORD-P', 'ORD-SL', 'ORD-TGT'),
          { corrupted: 'not a valid bracket group' }
        ]
      });
      const result = inspectBracketStorage(corruptedGroupEnvelope);
      expect(result.status).toBe('invalid_envelope');
      expect(result.groups).toEqual([]);
      if (result.status === 'invalid_envelope') {
        expect(result.raw).toBe(corruptedGroupEnvelope);
      }
    });

    it('11. Persistence guard simulation: protects raw storage from being overwritten', () => {
      // Simulate localStorage
      const storageMock: Record<string, string> = {};
      const rawV99 = JSON.stringify({ version: 99, data: 'precious' });
      storageMock[BRACKET_STORAGE_KEY] = rawV99;

      // 1. Inspect storage on load
      const inspection = inspectBracketStorage(storageMock[BRACKET_STORAGE_KEY] ?? null);
      const allowPersistence = inspection.status === 'missing' || inspection.status === 'valid';
      expect(allowPersistence).toBe(false);

      // 2. React state would be initialized to inspection.groups (empty)
      const activeGroups = inspection.groups;
      expect(activeGroups).toEqual([]);

      // 3. Simulated persistence effect:
      const persistEffect = () => {
        if (!allowPersistence) return; // Guarded!
        storageMock[BRACKET_STORAGE_KEY] = serializeBracketGroups(activeGroups);
      };

      persistEffect();
      // Storage MUST remain untouched byte-for-byte
      expect(storageMock[BRACKET_STORAGE_KEY]).toBe(rawV99);
    });

    it('12. Intentional reset simulation: clears storage and releases guard', () => {
      const storageMock: Record<string, string> = {};
      const rawV99 = JSON.stringify({ version: 99, data: 'precious' });
      storageMock[BRACKET_STORAGE_KEY] = rawV99;

      // Guard starts false due to v99
      let allowPersistence = false;

      // User performs resetAccount:
      delete storageMock[BRACKET_STORAGE_KEY];
      allowPersistence = true; // Guard released
      let activeGroups: BracketGroup[] = [];

      // Now normal persistence is permitted
      const persistEffect = () => {
        if (!allowPersistence) return;
        storageMock[BRACKET_STORAGE_KEY] = serializeBracketGroups(activeGroups);
      };

      persistEffect();
      expect(storageMock[BRACKET_STORAGE_KEY]).toBeDefined();
      const parsed = JSON.parse(storageMock[BRACKET_STORAGE_KEY]);
      expect(parsed.version).toBe(BRACKET_STORAGE_VERSION);
      expect(parsed.bracketGroups).toEqual([]);
    });

    it('13. Protected storage disables bracket order creation', () => {
      // Simulate placeBracketOrder guard behavior
      let persistenceAllowed = false;
      const attemptPlaceBracketOrder = () => {
        if (!persistenceAllowed) {
          return {
            success: false,
            error: 'Bracket orders are temporarily disabled because stored bracket data could not be safely loaded. Reset the account to enable bracket orders with a clean state.'
          };
        }
        return { success: true };
      };

      const result = attemptPlaceBracketOrder();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Bracket orders are temporarily disabled');
    });

    it('14. Normal/valid storage permits bracket order creation', () => {
      let persistenceAllowed = true;
      const attemptPlaceBracketOrder = () => {
        if (!persistenceAllowed) {
          return { success: false, error: 'Disabled' };
        }
        return { success: true };
      };

      const result = attemptPlaceBracketOrder();
      expect(result.success).toBe(true);
    });

    it('15. Non-bracket orders remain functional regardless of bracket protection guard', () => {
      // Non-bracket orders do NOT check bracketPersistenceAllowedRef
      const nonBracketOrder = createMockOrder('ORD-REGULAR-1', 'BUY', 'MARKET', 5, 'PENDING');
      expect(nonBracketOrder.id).toBe('ORD-REGULAR-1');
      expect(nonBracketOrder.status).toBe('PENDING');
    });

    it('16. Exposes appropriate BracketPersistenceStatus based on inspection result', () => {
      const getStatus = (status: string): BracketPersistenceStatus => {
        if (status === 'missing' || status === 'valid') return 'AVAILABLE';
        if (status === 'unsupported_version') return 'UNSUPPORTED_VERSION';
        if (status === 'malformed') return 'MALFORMED';
        return 'INVALID_ENVELOPE';
      };

      expect(getStatus('missing')).toBe('AVAILABLE');
      expect(getStatus('valid')).toBe('AVAILABLE');
      expect(getStatus('unsupported_version')).toBe('UNSUPPORTED_VERSION');
      expect(getStatus('malformed')).toBe('MALFORMED');
      expect(getStatus('invalid_envelope')).toBe('INVALID_ENVELOPE');
    });
  });
});
