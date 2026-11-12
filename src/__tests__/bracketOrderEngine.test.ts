/* ── Day 30.2: Bracket Accounting Correction ─────────────────────────────────────
Starting balance must travel with the account through bracket entry and OCO exits.
Portfolio equity is cash plus current market value, from TradingAccounting.
──────────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { AccountState, Holding, Order, StockData } from '../types';
import { INITIAL_ACCOUNT_STATE } from '../data/mockData';
import {
  computeAccountMetrics,
  computeBuyHoldings,
  computeSellHoldings,
} from '../engine/BracketOrderEngineHelpers';
import { activateChildExits, createBracketGroup, cancelEntryAndChildren } from '../engine/BracketOrderEngine';
import { executeOCO, handlePartialExit } from '../engine/OCOExecutionEngine';
import {
  computeAvailableBuyingPower,
  computePortfolioEquity,
} from '../engine/TradingAccounting';
import { aggregatePortfolio } from '../context/TradingContext';

const ENTRY = 2500;
const POSITION_QTY = 10;
const EXIT_QTY = 4;

const stock = (symbol: string, companyName: string, price: number): StockData => ({
  symbol,
  companyName,
  price,
  previousClose: price,
  change: 0,
  changePercent: 0,
  open: price,
  dayHigh: price,
  dayLow: price,
  volume: 1,
  sector: 'Test',
  exchange: 'NSE',
  description: '',
});

const stocksAt = (reliancePrice: number): StockData[] => [
  stock('RELIANCE', 'Reliance Industries', reliancePrice),
  stock('TCS', 'Tata Consultancy Services', 3000),
];

/** Account after buying POSITION_QTY shares at ENTRY from an untouched starting balance. */
const fundedLong = (startingBalance: number, markPrice: number): { account: AccountState; holdings: Holding[] } => {
  const holdings: Holding[] = [
    { symbol: 'RELIANCE', quantity: POSITION_QTY, averageBuyPrice: ENTRY },
  ];
  const cashBalance = Number((startingBalance - ENTRY * POSITION_QTY).toFixed(2));
  const account = computeAccountMetrics(cashBalance, holdings, stocksAt(markPrice), 0, startingBalance, 0);
  return { account, holdings };
};

const otherPendingBuy = (): Order => ({
  id: 'ORD-OTHER-BUY',
  symbol: 'TCS',
  companyName: 'Tata Consultancy Services',
  side: 'BUY',
  type: 'LIMIT',
  quantity: 2,
  requestedPrice: 3000,
  executionPrice: null,
  totalValue: null,
  status: 'PENDING',
  createdAt: '2024-01-01T00:00:00Z',
  executedAt: null,
  cancelledAt: null,
  rejectionReason: null,
});

const OTHER_BUY_RESERVATION = 3000 * 2;

/**
 * Active BUY bracket whose child SELL orders are TRIGGERED.
 * Quantity is the exit size, which can be smaller than the open position.
 */
const triggeredBuyBracket = (
  quantity: number,
  cashBalance: number,
  holdings: Holding[],
  markPrice: number
) => {
  const created = createBracketGroup(
    'BUY',
    quantity,
    ENTRY,
    2400,
    2700,
    'RELIANCE',
    'Reliance Industries',
    ENTRY,
    cashBalance,
    holdings,
    [],
    stocksAt(markPrice)
  );
  if (!created.success || !created.bracketGroup) {
    throw new Error(created.error ?? 'bracket creation failed');
  }
  const executedEntry: Order = {
    ...created.entryOrder,
    status: 'EXECUTED',
    executionPrice: ENTRY,
    totalValue: Number((ENTRY * quantity).toFixed(2)),
    executedAt: '2024-01-01T00:00:01Z',
  };
  const activation = activateChildExits(created.bracketGroup, [
    executedEntry,
    created.stopLossOrder,
    created.targetOrder,
  ]);
  if (!activation.success) {
    throw new Error(activation.error ?? 'activation failed');
  }
  return {
    bracketGroup: activation.bracketGroup,
    orders: [...activation.orders, otherPendingBuy()],
  };
};

const applyOrders = (orders: Order[], executed: Order, cancelled: Order): Order[] =>
  orders.map(order => {
    if (order.id === executed.id) return executed;
    if (order.id === cancelled.id) return cancelled;
    return order;
  });

describe('computeAccountMetrics starting balance', () => {
  it('keeps a ₹10,00,000 starting balance on the account', () => {
    const { account } = fundedLong(1000000, 2600);
    expect(account.startingBalance).toBe(1000000);
  });

  it('keeps a ₹5,00,000 starting balance on the account', () => {
    const { account } = fundedLong(500000, 2600);
    expect(account.startingBalance).toBe(500000);
    expect(account.startingBalance).not.toBe(1000000);
  });

  it('keeps the starting balance recorded on a reset account', () => {
    const reset = { ...INITIAL_ACCOUNT_STATE };
    const holdings: Holding[] = [{ symbol: 'RELIANCE', quantity: POSITION_QTY, averageBuyPrice: ENTRY }];
    const cashBalance = Number((reset.startingBalance - ENTRY * POSITION_QTY).toFixed(2));
    const account = computeAccountMetrics(
      cashBalance,
      holdings,
      stocksAt(2600),
      reset.realizedPnL,
      reset.startingBalance,
      0
    );
    expect(account.startingBalance).toBe(reset.startingBalance);
    expect(account.startingBalance).toBe(INITIAL_ACCOUNT_STATE.startingBalance);
  });

  it('passes an arbitrary starting balance through unchanged', () => {
    const account = computeAccountMetrics(1000, [], stocksAt(2500), 0, 123456.78, 0);
    expect(account.startingBalance).toBe(123456.78);
  });
});

describe('bracket entry accounting', () => {
  it.each([1000000, 500000])(
    'BUY entry from ₹%s updates cash and holdings and keeps starting balance',
    (startingBalance) => {
      const mark = 2600;
      const stocks = stocksAt(mark);
      const holdings = computeBuyHoldings([], 'RELIANCE', POSITION_QTY, ENTRY);
      const cashBalance = Number((startingBalance - ENTRY * POSITION_QTY).toFixed(2));
      const account = computeAccountMetrics(cashBalance, holdings, stocks, 0, startingBalance, 0);

      expect(holdings).toEqual([
        { symbol: 'RELIANCE', quantity: POSITION_QTY, averageBuyPrice: ENTRY },
      ]);
      expect(account.startingBalance).toBe(startingBalance);
      expect(account.cashBalance).toBe(cashBalance);
      expect(account.investedValue).toBe(ENTRY * POSITION_QTY);
      expect(account.unrealizedPnL).toBe((mark - ENTRY) * POSITION_QTY);
      expect(account.portfolioValue).toBe(computePortfolioEquity(cashBalance, holdings, stocks));
      expect(account.portfolioValue).toBe(startingBalance + (mark - ENTRY) * POSITION_QTY);
      expect(account.portfolioValue).not.toBe(startingBalance);
      expect(account.realizedPnL).toBe(0);
    }
  );

  it.each([1000000, 500000])(
    'SELL entry from ₹%s returns cash, realizes P&L, and keeps the remaining shares',
    (startingBalance) => {
      const mark = 2600;
      const stocks = stocksAt(mark);
      const open = fundedLong(startingBalance, mark);
      const holdings = computeSellHoldings(open.holdings, 'RELIANCE', EXIT_QTY);
      const proceeds = Number((mark * EXIT_QTY).toFixed(2));
      const cost = ENTRY * EXIT_QTY;
      const realized = proceeds - cost;
      const cashBalance = Number((open.account.cashBalance + proceeds).toFixed(2));
      const account = computeAccountMetrics(
        cashBalance,
        holdings,
        stocks,
        open.account.realizedPnL + realized,
        open.account.startingBalance,
        0
      );

      expect(holdings).toEqual([
        { symbol: 'RELIANCE', quantity: POSITION_QTY - EXIT_QTY, averageBuyPrice: ENTRY },
      ]);
      expect(account.startingBalance).toBe(startingBalance);
      expect(account.cashBalance).toBe(cashBalance);
      expect(account.realizedPnL).toBe(realized);
      expect(account.investedValue).toBe(ENTRY * (POSITION_QTY - EXIT_QTY));
      expect(account.portfolioValue).toBe(computePortfolioEquity(cashBalance, holdings, stocks));
      const summary = aggregatePortfolio(holdings, stocks, account, []);
      expect(summary.totalAccountValue).toBe(account.portfolioValue);
      expect(summary.totalReturnPercent).toBe(
        Number((((summary.totalAccountValue - startingBalance) / startingBalance) * 100).toFixed(2))
      );
    }
  );
});

describe('OCO bracket exits', () => {
  it.each([
    { startingBalance: 1000000, leg: 'TARGET' as const, executionPrice: 2700 },
    { startingBalance: 500000, leg: 'TARGET' as const, executionPrice: 2700 },
    { startingBalance: 1000000, leg: 'STOP_LOSS' as const, executionPrice: 2400 },
    { startingBalance: 500000, leg: 'STOP_LOSS' as const, executionPrice: 2400 },
  ])(
    '$leg exit on a ₹$startingBalance account keeps starting balance and marks equity from cash plus market value',
    ({ startingBalance, leg, executionPrice }) => {
      const open = fundedLong(startingBalance, executionPrice);
      const { bracketGroup, orders } = triggeredBuyBracket(
        EXIT_QTY,
        open.account.cashBalance,
        open.holdings,
        executionPrice
      );

      const result = executeOCO(
        bracketGroup,
        orders,
        open.holdings,
        [],
        stocksAt(executionPrice),
        open.account,
        executionPrice,
        leg
      );

      const proceeds = Number((executionPrice * EXIT_QTY).toFixed(2));
      const realized = proceeds - ENTRY * EXIT_QTY;
      const cashBalance = Number((open.account.cashBalance + proceeds).toFixed(2));
      const stocks = stocksAt(executionPrice);

      expect(result.success).toBe(true);
      expect(result.executedLeg).toBe(leg);
      expect(result.cancelledLeg).toBe(leg === 'TARGET' ? 'STOP_LOSS' : 'TARGET');
      expect(result.newAccount.startingBalance).toBe(startingBalance);
      expect(result.newAccount.cashBalance).toBe(cashBalance);
      expect(result.newAccount.realizedPnL).toBe(Number(realized.toFixed(2)));
      expect(result.trade.realizedPnL).toBe(Number(realized.toFixed(2)));
      expect(result.newHoldings).toEqual([
        { symbol: 'RELIANCE', quantity: POSITION_QTY - EXIT_QTY, averageBuyPrice: ENTRY },
      ]);
      expect(result.remainingQuantity).toBe(0);
      expect(result.updatedBracketGroup.status).toBe('COMPLETED');
      expect(result.newAccount.portfolioValue).toBe(
        computePortfolioEquity(cashBalance, result.newHoldings, stocks)
      );
      expect(result.newAccount.investedValue).toBe(ENTRY * (POSITION_QTY - EXIT_QTY));
      expect(result.newAccount.unrealizedPnL).toBe(
        Number(((executionPrice - ENTRY) * (POSITION_QTY - EXIT_QTY)).toFixed(2))
      );
      expect(result.newAccount.portfolioValue).not.toBe(startingBalance);

      const summary = aggregatePortfolio(result.newHoldings, stocks, result.newAccount, [result.trade]);
      expect(summary.totalAccountValue).toBe(result.newAccount.portfolioValue);
      expect(summary.cashBalance).toBe(cashBalance);
      expect(summary.totalReturnPercent).toBe(
        Number((((summary.totalAccountValue - startingBalance) / startingBalance) * 100).toFixed(2))
      );

      const buyingPower = computeAvailableBuyingPower(cashBalance, OTHER_BUY_RESERVATION);
      expect(buyingPower).toBe(Number((cashBalance - OTHER_BUY_RESERVATION).toFixed(2)));
      expect(result.newAccount.portfolioValue).not.toBe(buyingPower);
    }
  );

  it('preserves starting balance from a reset account after a target exit', () => {
    const reset = { ...INITIAL_ACCOUNT_STATE };
    const open = fundedLong(reset.startingBalance, 2700);
    const { bracketGroup, orders } = triggeredBuyBracket(
      EXIT_QTY,
      open.account.cashBalance,
      open.holdings,
      2700
    );
    const result = executeOCO(
      bracketGroup,
      orders,
      open.holdings,
      [],
      stocksAt(2700),
      { ...open.account, startingBalance: reset.startingBalance },
      2700,
      'TARGET'
    );

    expect(result.success).toBe(true);
    expect(result.newAccount.startingBalance).toBe(INITIAL_ACCOUNT_STATE.startingBalance);
    expect(result.newAccount.portfolioValue).toBe(
      computePortfolioEquity(result.newAccount.cashBalance, result.newHoldings, stocksAt(2700))
    );
  });

  it('does not apply the same OCO exit twice', () => {
    const open = fundedLong(500000, 2700);
    const { bracketGroup, orders } = triggeredBuyBracket(
      EXIT_QTY,
      open.account.cashBalance,
      open.holdings,
      2700
    );
    const first = executeOCO(
      bracketGroup,
      orders,
      open.holdings,
      [],
      stocksAt(2700),
      open.account,
      2700,
      'TARGET'
    );
    expect(first.success).toBe(true);

    const second = executeOCO(
      first.updatedBracketGroup,
      applyOrders(orders, first.executedOrder, first.cancelledOrder),
      first.newHoldings,
      [first.trade],
      stocksAt(2700),
      first.newAccount,
      2700,
      'TARGET'
    );

    expect(second.success).toBe(false);
    expect(second.newAccount).toEqual(first.newAccount);
    expect(second.newHoldings).toEqual(first.newHoldings);
    expect(second.newAccount.cashBalance).toBe(first.newAccount.cashBalance);
    expect(second.newAccount.realizedPnL).toBe(first.newAccount.realizedPnL);
    expect(second.newAccount.startingBalance).toBe(500000);
  });

  it('partial exit keeps the unsold shares and their average price', () => {
    const open = fundedLong(1000000, 2700);
    const { bracketGroup, orders } = triggeredBuyBracket(
      EXIT_QTY,
      open.account.cashBalance,
      open.holdings,
      2700
    );
    const result = executeOCO(
      bracketGroup,
      orders,
      open.holdings,
      [],
      stocksAt(2700),
      open.account,
      2700,
      'TARGET'
    );

    expect(result.success).toBe(true);
    const remaining = result.newHoldings.find(h => h.symbol === 'RELIANCE');
    expect(remaining?.quantity).toBe(POSITION_QTY - EXIT_QTY);
    expect(remaining?.averageBuyPrice).toBe(ENTRY);
    expect(result.newAccount.investedValue).toBe(ENTRY * (POSITION_QTY - EXIT_QTY));
  });

  it('reduces OCO child quantity on a partial exit without closing the remaining shares', () => {
    const open = fundedLong(1000000, 2500);
    const { bracketGroup, orders } = triggeredBuyBracket(
      POSITION_QTY,
      open.account.cashBalance,
      open.holdings,
      2500
    );
    const partial = handlePartialExit(bracketGroup, orders, EXIT_QTY);

    expect(partial.bracketGroup.remainingQuantity).toBe(POSITION_QTY - EXIT_QTY);
    const children = partial.orders.filter(
      order => order.id === bracketGroup.stopLossOrderId || order.id === bracketGroup.targetOrderId
    );
    expect(children).toHaveLength(2);
    children.forEach(order => {
      expect(order.quantity).toBe(POSITION_QTY - EXIT_QTY);
      expect(order.status).toBe('TRIGGERED');
    });
    expect(open.holdings).toEqual([
      { symbol: 'RELIANCE', quantity: POSITION_QTY, averageBuyPrice: ENTRY },
    ]);
  });

  it('BUY exit on a SELL bracket spends cash once and keeps the account starting balance', () => {
    const startingBalance = 500000;
    const open = fundedLong(startingBalance, 2600);
    const soldHoldings = computeSellHoldings(open.holdings, 'RELIANCE', EXIT_QTY);
    const saleProceeds = Number((2600 * EXIT_QTY).toFixed(2));
    const saleRealized = saleProceeds - ENTRY * EXIT_QTY;
    const cashAfterSale = Number((open.account.cashBalance + saleProceeds).toFixed(2));
    const afterEntry = computeAccountMetrics(
      cashAfterSale,
      soldHoldings,
      stocksAt(2600),
      saleRealized,
      startingBalance,
      0
    );

    const created = createBracketGroup(
      'SELL',
      EXIT_QTY,
      2600,
      2700,
      2400,
      'RELIANCE',
      'Reliance Industries',
      2600,
      open.account.cashBalance,
      open.holdings,
      [],
      stocksAt(2600)
    );
    expect(created.success).toBe(true);
    if (!created.bracketGroup) {
      throw new Error(created.error ?? 'bracket creation failed');
    }
    const executedEntry: Order = {
      ...created.entryOrder,
      status: 'EXECUTED',
      executionPrice: 2600,
      totalValue: saleProceeds,
      executedAt: '2024-01-01T00:00:01Z',
    };
    const activation = activateChildExits(created.bracketGroup, [
      executedEntry,
      created.stopLossOrder,
      created.targetOrder,
    ]);
    expect(activation.success).toBe(true);

    const exitPrice = 2400;
    const result = executeOCO(
      activation.bracketGroup,
      activation.orders,
      soldHoldings,
      [],
      stocksAt(exitPrice),
      afterEntry,
      exitPrice,
      'TARGET'
    );

    const buyCost = Number((exitPrice * EXIT_QTY).toFixed(2));
    const cashAfterBuy = Number((cashAfterSale - buyCost).toFixed(2));
    const holdingsAfterBuy = computeBuyHoldings(soldHoldings, 'RELIANCE', EXIT_QTY, exitPrice);
    // BUY OCO exit closes the short: P&L = entry proceeds - exit cost
    const buyRealized = Number((activation.bracketGroup.entryPrice * EXIT_QTY - exitPrice * EXIT_QTY).toFixed(2));
    const totalRealized = saleRealized + buyRealized;

    expect(result.success).toBe(true);
    expect(result.executedOrder.side).toBe('BUY');
    expect(result.newAccount.startingBalance).toBe(startingBalance);
    expect(result.newAccount.cashBalance).toBe(cashAfterBuy);
    expect(result.newAccount.realizedPnL).toBe(totalRealized);
    expect(result.trade.realizedPnL).toBe(buyRealized);
    expect(result.realizedPnL).toBe(buyRealized);
    expect(result.newHoldings).toEqual(holdingsAfterBuy);
    expect(result.newAccount.portfolioValue).toBe(
      computePortfolioEquity(cashAfterBuy, holdingsAfterBuy, stocksAt(exitPrice))
    );
    expect(result.newAccount.portfolioValue).not.toBe(startingBalance);
  });
});

/* ── Day 30.4: BUY-side OCO realized P&L regression suite ───────────────
 * Locks in the corrected BUY-leg accounting:
 *   For a SELL bracket (short position):
 *     entry  = SELL @ entryPrice   → cash IN  (entryPrice * qty)
 *     exit   = BUY  @ executionPrice → cash OUT (executionPrice * qty)
 *     realized P&L = entryProceeds − exitCost = (entryPrice − executionPrice) * qty
 *   Trade record always carries a numeric realizedPnL (never null) for OCO exits.
 * ──────────────────────────────────────────────────────────────────────── */

describe('Day 30.4 — BUY-side OCO realized P&L', () => {

  /** Build an activated SELL bracket with the entry already executed.
   * Provides dummy long holdings to pass the SELL-side validation.
   * The short position P&L is computed from bracketGroup.entryPrice, not holdings.
   */
  const activatedSellBracket = (
    quantity: number,
    entryPrice: number,
    stopLossPrice: number,
    targetPrice: number,
    cashBalance: number,
    _holdings: Holding[],
    markPrice: number
  ) => {
    // Dummy long holdings (100 shares) to satisfy SELL validation
    // The actual short P&L uses bracketGroup.entryPrice, not averageBuyPrice
    const dummyHoldings: Holding[] = [
      { symbol: 'RELIANCE', quantity: 100, averageBuyPrice: entryPrice }
    ];
    const created = createBracketGroup(
      'SELL', quantity, entryPrice, stopLossPrice, targetPrice,
      'RELIANCE', 'Reliance Industries', markPrice,
      cashBalance, dummyHoldings, [], stocksAt(markPrice)
    );
    if (!created.success || !created.bracketGroup) {
      throw new Error(created.error ?? 'bracket creation failed');
    }
    const executedEntry: Order = {
      ...created.entryOrder,
      status: 'EXECUTED',
      executionPrice: entryPrice,
      totalValue: Number((entryPrice * quantity).toFixed(2)),
      executedAt: '2024-01-01T00:00:01Z',
    };
    const activation = activateChildExits(created.bracketGroup, [
      executedEntry,
      created.stopLossOrder,
      created.targetOrder,
    ]);
    if (!activation.success) {
      throw new Error(activation.error ?? 'activation failed');
    }
    return {
      bracketGroup: activation.bracketGroup,
      orders: activation.orders,
    };
  };

  it('1. Profitable short exit: SELL bracket, BUY target closes short at profit', () => {
    // SELL entry at 2500 (short opened), BUY target at 2400 (closed at profit)
    // P&L = (2500 - 2400) * 10 = +1000
    const startingBalance = 1000000;
    const holdings: Holding[] = []; // short position — no long holdings needed

    const { bracketGroup, orders } = activatedSellBracket(
      10, 2500, 2700, 2400,
      startingBalance, holdings, 2500
    );

    // After SELL entry, account has cash from the short sale
    const shortProceeds = Number((2500 * 10).toFixed(2)); // 25000
    const cashAfterEntry = startingBalance + shortProceeds;
    const account: AccountState = {
      startingBalance,
      cashBalance: cashAfterEntry,
      investedValue: 0,
      portfolioValue: cashAfterEntry,
      realizedPnL: 0,
      unrealizedPnL: 0,
    };

    const result = executeOCO(
      bracketGroup,
      orders,
      holdings,
      [],
      stocksAt(2400),
      account,
      2400,
      'TARGET'
    );

    expect(result.success).toBe(true);
    expect(result.executedLeg).toBe('TARGET');
    expect(result.executedOrder.side).toBe('BUY');
    expect(result.realizedPnL).toBe(1000); // (2500 - 2400) * 10
    expect(result.newAccount.realizedPnL).toBe(1000);
    expect(result.trade.realizedPnL).toBe(1000);
    expect(result.trade.realizedPnL).not.toBeNull();
  });

  it('2. Loss-making short exit: SELL bracket, BUY stop-loss closes short at loss', () => {
    // SELL entry at 2500 (short opened), BUY stop-loss at 2700 (closed at loss)
    // P&L = (2500 - 2700) * 10 = -2000
    const startingBalance = 1000000;
    const holdings: Holding[] = [];

    const { bracketGroup, orders } = activatedSellBracket(
      10, 2500, 2700, 2400,
      startingBalance, holdings, 2500
    );

    const shortProceeds = Number((2500 * 10).toFixed(2));
    const cashAfterEntry = startingBalance + shortProceeds;
    const account: AccountState = {
      startingBalance,
      cashBalance: cashAfterEntry,
      investedValue: 0,
      portfolioValue: cashAfterEntry,
      realizedPnL: 0,
      unrealizedPnL: 0,
    };

    const result = executeOCO(
      bracketGroup,
      orders,
      holdings,
      [],
      stocksAt(2700),
      account,
      2700,
      'STOP_LOSS'
    );

    expect(result.success).toBe(true);
    expect(result.executedLeg).toBe('STOP_LOSS');
    expect(result.executedOrder.side).toBe('BUY');
    expect(result.realizedPnL).toBe(-2000); // (2500 - 2700) * 10
    expect(result.newAccount.realizedPnL).toBe(-2000);
    expect(result.trade.realizedPnL).toBe(-2000);
  });

  it('3. Partial BUY exit: remaining shares stay protected with correct P&L', () => {
    // SELL 10 shares @ 2500, exit 4 via BUY target @ 2400
    // P&L on 4 shares = (2500 - 2400) * 4 = +400
    // Remaining 6 shares keep OCO protection
    const startingBalance = 1000000;
    const holdings: Holding[] = [];

    const { bracketGroup, orders } = activatedSellBracket(
      10, 2500, 2700, 2400,
      startingBalance, holdings, 2500
    );

    // Simulate partial exit: only 4 shares exit
    const partialOrders = orders.map(o => {
      if (o.id === bracketGroup.stopLossOrderId || o.id === bracketGroup.targetOrderId) {
        return { ...o, quantity: 4 };
      }
      return o;
    });

    const shortProceeds = Number((2500 * 10).toFixed(2));
    const account: AccountState = {
      startingBalance,
      cashBalance: startingBalance + shortProceeds,
      investedValue: 0,
      portfolioValue: startingBalance + shortProceeds,
      realizedPnL: 0,
      unrealizedPnL: 0,
    };

    const result = executeOCO(
      bracketGroup,
      partialOrders,
      holdings,
      [],
      stocksAt(2400),
      account,
      2400,
      'TARGET'
    );

    expect(result.success).toBe(true);
    expect(result.realizedPnL).toBe(400); // (2500 - 2400) * 4
    expect(result.newAccount.realizedPnL).toBe(400);
    expect(result.trade.realizedPnL).toBe(400);
    expect(result.remainingQuantity).toBe(6); // 10 - 4 = 6 remaining
    expect(result.updatedBracketGroup.status).toBe('ACTIVE'); // still active
    expect(result.updatedBracketGroup.remainingQuantity).toBe(6);
  });

  it('4. Full BUY exit: SELL bracket, BUY target closes all shares', () => {
    // SELL 10 shares @ 2500, BUY target @ 2400 closes all 10
    // P&L = (2500 - 2400) * 10 = +1000
    const startingBalance = 1000000;
    const holdings: Holding[] = [];

    const { bracketGroup, orders } = activatedSellBracket(
      10, 2500, 2700, 2400,
      startingBalance, holdings, 2500
    );

    const shortProceeds = Number((2500 * 10).toFixed(2));
    const account: AccountState = {
      startingBalance,
      cashBalance: startingBalance + shortProceeds,
      investedValue: 0,
      portfolioValue: startingBalance + shortProceeds,
      realizedPnL: 0,
      unrealizedPnL: 0,
    };

    const result = executeOCO(
      bracketGroup,
      orders,
      holdings,
      [],
      stocksAt(2400),
      account,
      2400,
      'TARGET'
    );

    expect(result.success).toBe(true);
    expect(result.realizedPnL).toBe(1000);
    expect(result.remainingQuantity).toBe(0);
    expect(result.updatedBracketGroup.status).toBe('COMPLETED');
  });

  it('5. Duplicate execution prevention: second OCO call on completed bracket fails', () => {
    const startingBalance = 1000000;
    const holdings: Holding[] = [];

    const { bracketGroup, orders } = activatedSellBracket(
      10, 2500, 2700, 2400,
      startingBalance, holdings, 2500
    );

    const shortProceeds = Number((2500 * 10).toFixed(2));
    const account: AccountState = {
      startingBalance,
      cashBalance: startingBalance + shortProceeds,
      investedValue: 0,
      portfolioValue: startingBalance + shortProceeds,
      realizedPnL: 0,
      unrealizedPnL: 0,
    };

    const first = executeOCO(
      bracketGroup, orders, holdings, [], stocksAt(2400), account, 2400, 'TARGET'
    );
    expect(first.success).toBe(true);
    expect(first.realizedPnL).toBe(1000);

    // Apply first result to orders
    const afterFirstOrders = applyOrders(orders, first.executedOrder, first.cancelledOrder);

    // Second call must fail — both legs terminal
    const second = executeOCO(
      first.updatedBracketGroup,
      afterFirstOrders,
      first.newHoldings,
      [first.trade],
      stocksAt(2400),
      first.newAccount,
      2400,
      'TARGET'
    );

    expect(second.success).toBe(false);
    expect(second.newAccount).toEqual(first.newAccount);
    expect(second.newHoldings).toEqual(first.newHoldings);
    expect(second.newAccount.realizedPnL).toBe(first.newAccount.realizedPnL);
  });

  it('6. Correct account realized P&L: BUY exit adds to account realized P&L exactly once', () => {
    // Start with 500 realized P&L from a prior trade, then close a short at +800
    const startingBalance = 1000000;
    const holdings: Holding[] = [];

    const { bracketGroup, orders } = activatedSellBracket(
      10, 2500, 2700, 2400,
      startingBalance, holdings, 2500
    );

    const shortProceeds = Number((2500 * 10).toFixed(2));
    const account: AccountState = {
      startingBalance,
      cashBalance: startingBalance + shortProceeds,
      investedValue: 0,
      portfolioValue: startingBalance + shortProceeds,
      realizedPnL: 500, // prior realized from earlier trades
      unrealizedPnL: 0,
    };

    const result = executeOCO(
      bracketGroup, orders, holdings, [], stocksAt(2400), account, 2400, 'TARGET'
    );

    // BUY exit P&L = (2500 - 2400) * 10 = 1000
    // Account realized = prior 500 + new 1000 = 1500
    expect(result.realizedPnL).toBe(1000);
    expect(result.newAccount.realizedPnL).toBe(1500);
    expect(result.trade.realizedPnL).toBe(1000);
  });

  it('7. Correct trade-history realized P&L: BUY exit trade has numeric realizedPnL', () => {
    const startingBalance = 1000000;
    const holdings: Holding[] = [];

    const { bracketGroup, orders } = activatedSellBracket(
      10, 2500, 2700, 2400,
      startingBalance, holdings, 2500
    );

    const shortProceeds = Number((2500 * 10).toFixed(2));
    const account: AccountState = {
      startingBalance,
      cashBalance: startingBalance + shortProceeds,
      investedValue: 0,
      portfolioValue: startingBalance + shortProceeds,
      realizedPnL: 0,
      unrealizedPnL: 0,
    };

    const result = executeOCO(
      bracketGroup, orders, holdings, [], stocksAt(2400), account, 2400, 'TARGET'
    );

    expect(result.trade.realizedPnL).toBe(1000);
    expect(typeof result.trade.realizedPnL).toBe('number');
    expect(result.trade.realizedPnL).not.toBeNull();
  });
});

describe('buying power reservation stays independent of equity', () => {
  it('subtracts reserved buy capital from buying power and leaves portfolio equity as cash plus market value', () => {
    const startingBalance = 500000;
    const holdings: Holding[] = [{ symbol: 'RELIANCE', quantity: POSITION_QTY, averageBuyPrice: ENTRY }];
    const cashBalance = startingBalance - ENTRY * POSITION_QTY;
    const reserved = 50000;
    const stocks = stocksAt(2600);
    const account = computeAccountMetrics(cashBalance, holdings, stocks, 0, startingBalance, reserved);

    expect(account.startingBalance).toBe(startingBalance);
    expect(account.cashBalance).toBe(cashBalance);
    expect(account.portfolioValue).toBe(computePortfolioEquity(cashBalance, holdings, stocks));
    expect(computeAvailableBuyingPower(cashBalance, reserved)).toBe(cashBalance - reserved);
    expect(account.portfolioValue).not.toBe(account.startingBalance);
  });
});

describe('Day 30.4 — Pending LIMIT bracket execution & state transitions', () => {
  it('1. Pending BUY LIMIT: stays pending while market price is above limit price', () => {
    const limitPrice = 2400;
    const currentPrice = 2500;
    const created = createBracketGroup(
      'BUY', 10, limitPrice, 2300, 2600,
      'RELIANCE', 'Reliance Industries', currentPrice,
      1000000, [], [], stocksAt(currentPrice)
    );
    expect(created.success).toBe(true);
    expect(created.entryOrder.type).toBe('LIMIT');
    expect(created.entryOrder.status).toBe('PENDING');
    expect(created.stopLossOrder.status).toBe('PENDING');
    expect(created.targetOrder.status).toBe('PENDING');

    // Condition check: market price (2500) > limit price (2400) -> condition not met
    const conditionMet = created.entryOrder.side === 'BUY' && currentPrice <= created.entryOrder.requestedPrice;
    expect(conditionMet).toBe(false);
  });

  it('2. Pending BUY LIMIT: executes when market price falls to or below limit price', () => {
    const limitPrice = 2400;
    const initialPrice = 2500;
    const created = createBracketGroup(
      'BUY', 10, limitPrice, 2300, 2600,
      'RELIANCE', 'Reliance Industries', initialPrice,
      1000000, [], [], stocksAt(initialPrice)
    );

    const tickPrice = 2390; // Market dropped below limit price
    const conditionMet = created.entryOrder.side === 'BUY' && tickPrice <= created.entryOrder.requestedPrice;
    expect(conditionMet).toBe(true);

    const executedParent: Order = {
      ...created.entryOrder,
      status: 'EXECUTED',
      executionPrice: tickPrice,
      totalValue: tickPrice * 10,
      executedAt: '2024-01-01T00:00:02Z'
    };

    // Child exits activate only after entry executes
    const activation = activateChildExits(created.bracketGroup!, [
      executedParent,
      created.stopLossOrder,
      created.targetOrder
    ]);
    expect(activation.success).toBe(true);
    const sl = activation.orders.find(o => o.id === created.stopLossOrder.id);
    const tgt = activation.orders.find(o => o.id === created.targetOrder.id);
    expect(sl?.status).toBe('TRIGGERED');
    expect(tgt?.status).toBe('TRIGGERED');
  });

  it('3. Pending SELL LIMIT: stays pending while market price is below limit price', () => {
    const limitPrice = 2600;
    const currentPrice = 2500;
    const holdings: Holding[] = [{ symbol: 'RELIANCE', quantity: 20, averageBuyPrice: 2400 }];
    const created = createBracketGroup(
      'SELL', 10, limitPrice, 2700, 2400,
      'RELIANCE', 'Reliance Industries', currentPrice,
      1000000, holdings, [], stocksAt(currentPrice)
    );
    expect(created.success).toBe(true);
    expect(created.entryOrder.type).toBe('LIMIT');
    expect(created.entryOrder.status).toBe('PENDING');

    const conditionMet = created.entryOrder.side === 'SELL' && currentPrice >= created.entryOrder.requestedPrice;
    expect(conditionMet).toBe(false);
  });

  it('4. Pending SELL LIMIT: executes when market price rises to or above limit price', () => {
    const limitPrice = 2600;
    const currentPrice = 2500;
    const holdings: Holding[] = [{ symbol: 'RELIANCE', quantity: 20, averageBuyPrice: 2400 }];
    const created = createBracketGroup(
      'SELL', 10, limitPrice, 2700, 2400,
      'RELIANCE', 'Reliance Industries', currentPrice,
      1000000, holdings, [], stocksAt(currentPrice)
    );

    const tickPrice = 2610; // Market rose above limit price
    const conditionMet = created.entryOrder.side === 'SELL' && tickPrice >= created.entryOrder.requestedPrice;
    expect(conditionMet).toBe(true);

    const executedParent: Order = {
      ...created.entryOrder,
      status: 'EXECUTED',
      executionPrice: tickPrice,
      totalValue: tickPrice * 10,
      executedAt: '2024-01-01T00:00:02Z'
    };

    const activation = activateChildExits(created.bracketGroup!, [
      executedParent,
      created.stopLossOrder,
      created.targetOrder
    ]);
    expect(activation.success).toBe(true);
  });

  it('5. Cancellation before entry execution cleanly cancels parent and disarms child orders', () => {
    const created = createBracketGroup(
      'BUY', 10, 2400, 2300, 2600,
      'RELIANCE', 'Reliance Industries', 2500,
      1000000, [], [], stocksAt(2500)
    );

    const allOrders = [created.entryOrder, created.stopLossOrder, created.targetOrder];
    const cancelRes = cancelEntryAndChildren(created.bracketGroup!, allOrders);

    expect(cancelRes.bracketGroup.status).toBe('CANCELLED');
    const entryCancelled = cancelRes.orders.find(o => o.id === created.entryOrder.id);
    const slCancelled = cancelRes.orders.find(o => o.id === created.stopLossOrder.id);
    const tgtCancelled = cancelRes.orders.find(o => o.id === created.targetOrder.id);

    expect(entryCancelled?.status).toBe('CANCELLED');
    expect(slCancelled?.status).toBe('CANCELLED');
    expect(tgtCancelled?.status).toBe('CANCELLED');
  });

  it('6. Child exits are NOT activated before entry execution', () => {
    const created = createBracketGroup(
      'BUY', 10, 2400, 2300, 2600,
      'RELIANCE', 'Reliance Industries', 2500,
      1000000, [], [], stocksAt(2500)
    );

    // Initial state: children are PENDING
    expect(created.stopLossOrder.status).toBe('PENDING');
    expect(created.targetOrder.status).toBe('PENDING');

    // activateChildExits with pending parent fails
    const activation = activateChildExits(created.bracketGroup!, [
      created.entryOrder, // status: 'PENDING'
      created.stopLossOrder,
      created.targetOrder
    ]);
    expect(activation.success).toBe(false);
    expect(activation.error).toContain('parent entry order is not executed');
  });

  it('7. MARKET bracket orders execute immediately and activate child exits', () => {
    const marketPrice = 2500;
    const created = createBracketGroup(
      'BUY', 10, marketPrice, 2400, 2700,
      'RELIANCE', 'Reliance Industries', marketPrice,
      1000000, [], [], stocksAt(marketPrice)
    );

    expect(created.success).toBe(true);
    expect(created.entryOrder.type).toBe('MARKET');
    expect(created.entryOrder.requestedPrice).toBe(marketPrice);
  });
});
