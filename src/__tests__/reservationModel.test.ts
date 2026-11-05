/* Day 29: Reservation Model Tests */

import { describe, it, expect } from 'vitest';
import {
  isTerminalStatus,
  isReservationEligible,
  getReservationPrice,
  computeOrderBuyReservation,
  computeOrderSellReservation,
  computeReservedBuyCapital,
  computeReservedSellQuantity,
  computeAvailableBuyingPower,
  computeAvailableSellQuantity,
  validateBuyOrderReservation,
  validateSellOrderReservation,
  revalidateOrderAtExecution,
} from '../engine/ReservationModel';
import { Order, StockData, OrderSide, OrderType, OrderStatus, Holding } from '../types';

const MOCK_STOCKS: StockData[] = [
  { symbol: 'RELIANCE', companyName: 'Reliance Industries', price: 2950.45, previousClose: 2920.10, change: 30.35, changePercent: 1.04, open: 2930.00, dayHigh: 2965.80, dayLow: 2915.20, volume: 4521000, sector: 'Conglomerates', exchange: 'NSE', description: '' },
  { symbol: 'TCS', companyName: 'Tata Consultancy Services', price: 3985.20, previousClose: 4010.50, change: -25.30, changePercent: -0.63, open: 4005.00, dayHigh: 4020.10, dayLow: 3970.50, volume: 2150000, sector: 'IT Services', exchange: 'NSE', description: '' },
];

/** Build a minimal Order with sensible defaults. */
const mk = (overrides: Partial<Order>) => ({
  id: 'O', symbol: 'RELIANCE', companyName: 'Reliance', side: 'BUY' as OrderSide,
  type: 'LIMIT' as OrderType, quantity: 10, requestedPrice: 2940, triggerPrice: undefined,
  executionPrice: null, totalValue: null, status: 'PENDING' as OrderStatus, createdAt: '2024-01-01T00:00:00Z',
  executedAt: null, cancelledAt: null, rejectionReason: null, ...overrides,
});

const BUY_ORDER1: Order = {
  id: 'ORD-001', symbol: 'RELIANCE', companyName: 'Reliance', side: 'BUY',
  type: 'LIMIT', quantity: 10, requestedPrice: 2940, triggerPrice: undefined,
  executionPrice: null, totalValue: null, status: 'PENDING', createdAt: '2024-01-01T00:00:00Z',
  executedAt: null, cancelledAt: null, rejectionReason: null,
};

const MARKET_BUY_ORDER: Order = {
  id: 'ORD-002', symbol: 'TCS', companyName: 'Tata Consultancy', side: 'BUY',
  type: 'MARKET', quantity: 5, requestedPrice: 0, triggerPrice: undefined,
  executionPrice: null, totalValue: null, status: 'PENDING', createdAt: '2024-01-01T00:00:00Z',
  executedAt: null, cancelledAt: null, rejectionReason: null,
};

const SELL_ORDER1: Order = {
  id: 'ORD-003', symbol: 'RELIANCE', companyName: 'Reliance', side: 'SELL',
  type: 'LIMIT', quantity: 5, requestedPrice: 2960, triggerPrice: undefined,
  executionPrice: null, totalValue: null, status: 'PENDING', createdAt: '2024-01-01T00:00:00Z',
  executedAt: null, cancelledAt: null, rejectionReason: null,
};

const EXECUTED_BUY_ORDER: Order = {
  id: 'ORD-004', symbol: 'RELIANCE', companyName: 'Reliance', side: 'BUY',
  type: 'LIMIT', quantity: 10, requestedPrice: 2940, triggerPrice: undefined,
  executionPrice: 3000, totalValue: 30000, status: 'EXECUTED', createdAt: '2024-01-01T00:00:00Z',
  executedAt: '2024-01-01T00:00:00Z', cancelledAt: null, rejectionReason: null,
};

describe('isTerminalStatus', () => {
  it('identifies EXECUTED as terminal', () => {
    expect(isTerminalStatus('EXECUTED')).toBe(true);
  });
  it('identifies CANCELLED as terminal', () => {
    expect(isTerminalStatus('CANCELLED')).toBe(true);
  });
  it('identifies REJECTED as terminal', () => {
    expect(isTerminalStatus('REJECTED')).toBe(true);
  });
  it('identifies PENDING as NOT terminal', () => {
    expect(isTerminalStatus('PENDING')).toBe(false);
  });
  it('identifies TRIGGERED as NOT terminal', () => {
    expect(isTerminalStatus('TRIGGERED')).toBe(false);
  });
});

describe('isReservationEligible', () => {
  it('returns true for PENDING status', () => {
    expect(isReservationEligible('PENDING')).toBe(true);
  });
  it('returns true for TRIGGERED status', () => {
    expect(isReservationEligible('TRIGGERED')).toBe(true);
  });
  it('returns false for EXECUTED status', () => {
    expect(isReservationEligible('EXECUTED')).toBe(false);
  });
  it('returns false for CANCELLED status', () => {
    expect(isReservationEligible('CANCELLED')).toBe(false);
  });
  it('returns false for REJECTED status', () => {
    expect(isReservationEligible('REJECTED')).toBe(false);
  });
});

describe('getReservationPrice', () => {
  it('returns null for MARKET orders', () => {
    const order = mk({ type: 'MARKET' });
    expect(getReservationPrice(order, 2950.45)).toBeNull();
  });
  it('returns requestedPrice for LIMIT orders', () => {
    const order = mk({ type: 'LIMIT' });
    expect(getReservationPrice(order, 2950.45)).toBe(2940);
  });
  it('returns triggerPrice for STOP_MARKET orders', () => {
    const order = mk({ type: 'STOP_MARKET', triggerPrice: 2900 });
    expect(getReservationPrice(order, 2950.45)).toBe(2900);
  });
  it('returns requestedPrice for STOP_LIMIT when TRIGGERED', () => {
    const order = mk({ type: 'STOP_LIMIT', status: 'TRIGGERED', triggerPrice: 2900 });
    expect(getReservationPrice(order, 2950.45)).toBe(2940);
  });
  it('returns triggerPrice for STOP_LIMIT when PENDING', () => {
    const order = mk({ type: 'STOP_LIMIT', status: 'PENDING', triggerPrice: 2900 });
    expect(getReservationPrice(order, 2950.45)).toBe(2900);
  });
  it('returns triggerPrice for TARGET orders', () => {
    const order = mk({ type: 'TARGET', triggerPrice: 3000 });
    expect(getReservationPrice(order, 2950.45)).toBe(3000);
  });
});

describe('computeOrderBuyReservation', () => {
  it('returns 0 for SELL orders', () => {
    const sellOrder = mk({ side: 'SELL' });
    expect(computeOrderBuyReservation(sellOrder, MOCK_STOCKS)).toBe(0);
  });
  it('returns 0 for terminal orders', () => {
    expect(computeOrderBuyReservation(EXECUTED_BUY_ORDER, MOCK_STOCKS)).toBe(0);
  });
  it('returns reserved capital for eligible PENDING LIMIT BUY orders', () => {
    expect(computeOrderBuyReservation(BUY_ORDER1, MOCK_STOCKS)).toBe(29400);
  });
  it('returns 0 when stock not found', () => {
    const unknownSymbol = mk({ symbol: 'UNKNOWN' });
    expect(computeOrderBuyReservation(unknownSymbol, MOCK_STOCKS)).toBe(0);
  });
});

describe('computeOrderSellReservation', () => {
  it('returns 0 for BUY orders', () => {
    const buyOrder = mk({ side: 'BUY' });
    expect(computeOrderSellReservation(buyOrder, 'RELIANCE')).toBe(0);
  });
  it('returns order quantity for eligible PENDING SELL orders matching symbol', () => {
    expect(computeOrderSellReservation(SELL_ORDER1, 'RELIANCE')).toBe(5);
  });
  it('returns 0 for SELL orders with mismatched symbol', () => {
    const sellOrderTcs = mk({ side: 'SELL', symbol: 'TCS' });
    expect(computeOrderSellReservation(sellOrderTcs, 'RELIANCE')).toBe(0);
  });
});

describe('computeReservedBuyCapital', () => {
  it('computes total reserved capital for pending BUY orders', () => {
    // BUY_ORDER1 LIMIT: 2940 * 10 = 29400; MARKET returns 0; EXECUTED is terminal
    // Actually ORD-001 only counts (PENDING LIMIT), so total = 29400
    expect(computeReservedBuyCapital([BUY_ORDER1, MARKET_BUY_ORDER], MOCK_STOCKS)).toBe(29400);
  });
  it('excludes ineligible orders from reservation', () => {
    const result = computeReservedBuyCapital([BUY_ORDER1, MARKET_BUY_ORDER, EXECUTED_BUY_ORDER], MOCK_STOCKS);
    expect(result).toBe(29400);
  });
});

describe('computeReservedSellQuantity', () => {
  it('computes total reserved sell quantity for pending SELL orders', () => {
    expect(computeReservedSellQuantity([SELL_ORDER1], 'RELIANCE')).toBe(5);
  });
  it('excludes terminal orders from reservation', () => {
    // Add a sell order that is terminal
    const terminalSellOrder: Order = {
      ...SELL_ORDER1, status: 'CANCELLED', executedAt: null, cancelledAt: '2024-01-01T00:00:00Z', rejectionReason: null,
    };
    // Only original SELL_ORDER1 remains eligible; terminal one is excluded
    expect(computeReservedSellQuantity([SELL_ORDER1, terminalSellOrder], 'RELIANCE')).toBe(5);
  });
  it('returns 0 when symbol does not match', () => {
    expect(computeReservedSellQuantity([SELL_ORDER1], 'TCS')).toBe(0);
  });
});

describe('computeAvailableBuyingPower', () => {
  it('computes available buying power as cash minus reserved', () => {
    expect(computeAvailableBuyingPower(100000, 29400)).toBe(70600);
  });
  it('floors at 0 when reserved exceeds cash', () => {
    expect(computeAvailableBuyingPower(1000, 50000)).toBe(0);
  });
});

describe('computeAvailableSellQuantity', () => {
  it('computes available sell quantity as holding minus reserved', () => {
    expect(computeAvailableSellQuantity(100, 25)).toBe(75);
  });
  it('floors at 0 when reserved exceeds holding', () => {
    expect(computeAvailableSellQuantity(10, 50)).toBe(0);
  });
});

describe('validateBuyOrderReservation', () => {
  it('validates a BUY order that fits within available buying power', () => {
    const result = validateBuyOrderReservation(
      5, 2940, 100000, [BUY_ORDER1], MOCK_STOCKS
    );
    expect(result.valid).toBe(true);
    expect(result.requiredReservation).toBe(14700);
  });
  it('rejects a BUY order that exceeds available buying power', () => {
    const result = validateBuyOrderReservation(
      50, 2940, 100000, [BUY_ORDER1], MOCK_STOCKS
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Insufficient available buying power');
  });
  it('returns availableBuyingPower and requiredReservation even when invalid', () => {
    const result = validateBuyOrderReservation(
      100, 2940, 1000, [BUY_ORDER1], MOCK_STOCKS
    );
    // cash 1000 - reserved 29400 (BUY_ORDER1) = -28400, floored to 0
    expect(result.valid).toBe(false);
    expect(result.requiredReservation).toBe(294000);
    expect(result.availableBuyingPower).toBe(0);
  });
});

describe('validateSellOrderReservation', () => {
  it('validates a SELL order within available holding', () => {
    const result = validateSellOrderReservation(
      3, 'RELIANCE', [{ symbol: 'RELIANCE', quantity: 50, averageBuyPrice: 2900 }], [SELL_ORDER1]
    );
    // holding 50 - reserved 5 (SELL_ORDER1) = 45 available
    expect(result.valid).toBe(true);
    expect(result.availableQuantity).toBe(45);
  });
  it('rejects a SELL order exceeding available quantity', () => {
    const result = validateSellOrderReservation(
      60, 'RELIANCE', [{ symbol: 'RELIANCE', quantity: 50, averageBuyPrice: 2900 }], [SELL_ORDER1]
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Insufficient available quantity');
  });
  it('handles holdings with no existing shares', () => {
    const result = validateSellOrderReservation(10, 'RELIANCE', [], [SELL_ORDER1]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Insufficient available quantity');
  });
});

describe('revalidateOrderAtExecution', () => {
  const buyOrderObj = (qty: number, rp: number) => mk({ quantity: qty, requestedPrice: rp, id: 'TO-EXEC' });
  const otherPendingBuy = mk({ quantity: 5, requestedPrice: 2940, id: 'OTHER' });
  const holdExisting = () => [{ symbol: 'RELIANCE', quantity: 50, averageBuyPrice: 2900 }] as Holding[];

  it('validates BUY order execution against other pending reservations', () => {
    const buyOrder = buyOrderObj(5, 2940);
    const result = revalidateOrderAtExecution(buyOrder, 100000, holdExisting(), [otherPendingBuy, buyOrder], MOCK_STOCKS);
    expect(result.valid).toBe(true);
  });
  it('rejects BUY order execution when insufficient cash after other reservations', () => {
    const buyOrder = buyOrderObj(50, 2940);
    const result = revalidateOrderAtExecution(buyOrder, 100000, holdExisting(), [otherPendingBuy], MOCK_STOCKS);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Insufficient cash at execution');
  });
  it('validates SELL order execution against other pending reservations', () => {
    const sellOrder = mk({ side: 'SELL', quantity: 5, requestedPrice: 2960, id: 'TO-EXEC' });
    const otherPendingSell = mk({ side: 'SELL', quantity: 3, requestedPrice: 2960, id: 'OTHER' });
    const result = revalidateOrderAtExecution(sellOrder, 100000, holdExisting(), [otherPendingSell], MOCK_STOCKS);
    expect(result.valid).toBe(true);
  });
  it('rejects SELL order execution when insufficient holdings after other reservations', () => {
    const sellOrder = mk({ side: 'SELL', quantity: 60, requestedPrice: 2960, id: 'TO-EXEC' });
    const otherPendingSell = mk({ side: 'SELL', quantity: 50, requestedPrice: 2960, id: 'OTHER' });
    const result = revalidateOrderAtExecution(sellOrder, 100000, holdExisting(), [otherPendingSell], MOCK_STOCKS);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Insufficient holdings at execution');
  });
  it('excludes the executing order from other commitments', () => {
    const buyOrder = mk({ side: 'BUY', quantity: 5, requestedPrice: 2940, id: 'TO-EXEC' });
    const otherOrders = [otherPendingBuy, buyOrder];
    const result = revalidateOrderAtExecution(buyOrder, 100000, holdExisting(), otherOrders, MOCK_STOCKS);
    // otherPendingBuy reserves 29400, buyOrder is excluded
    expect(result.valid).toBe(true);
  });
});
