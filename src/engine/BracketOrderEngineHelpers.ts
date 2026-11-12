/* ── Day 30: Bracket Order Engine Helpers ─────────────────────────────────────────
Pure helper functions extracted from TradingContext for use in BracketOrderEngine.
Never mutates React state.
──────────────────────────────────────────────────────────────────────────────────── */

import { Holding, StockData, AccountState } from '../types';
import { computePortfolioSummaryMetrics } from './TradingAccounting';

/** ID generators (mirroring TradingContext) */
export const generateOrderId = (): string =>
  'ORD-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

export const generateExecutionId = (): string =>
  'EXE-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

export const generateTradeId = (): string =>
  'TRD-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

export const generateNotificationId = (): string =>
  'NOT-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

/** Compute holdings after BUY execution */
export const computeBuyHoldings = (prevHoldings: Holding[], symbol: string, quantity: number, price: number): Holding[] => {
  const existing = prevHoldings.find(h => h.symbol === symbol);
  if (existing) {
    const newQty = existing.quantity + quantity;
    const newAvg = ((existing.averageBuyPrice * existing.quantity) + (price * quantity)) / newQty;
    return prevHoldings.map(h =>
      h.symbol === symbol ? { ...h, quantity: newQty, averageBuyPrice: Number(newAvg.toFixed(2)) } : h
    );
  }
  return [...prevHoldings, { symbol, quantity, averageBuyPrice: Number(price.toFixed(2)) }];
};

/** Compute holdings after SELL execution */
export const computeSellHoldings = (prevHoldings: Holding[], symbol: string, quantity: number): Holding[] => {
  const existing = prevHoldings.find(h => h.symbol === symbol);
  if (!existing) return prevHoldings;
  const newQty = existing.quantity - quantity;
  if (newQty <= 0) return prevHoldings.filter(h => h.symbol !== symbol);
  return prevHoldings.map(h => (h.symbol === symbol ? { ...h, quantity: newQty } : h));
};

/** Account metrics computation. startingBalance is the live account value supplied by the caller. */
export const computeAccountMetrics = (
  cashBalance: number,
  newHoldings: Holding[],
  stocksList: StockData[],
  prevRealizedPnL: number,
  startingBalance: number,
  reservedBuyCapital: number = 0
): AccountState => {
  const accounting = computePortfolioSummaryMetrics(
    cashBalance,
    newHoldings,
    stocksList,
    reservedBuyCapital,
    []
  );

  return {
    startingBalance,
    cashBalance,
    investedValue: accounting.costBasis,
    portfolioValue: accounting.portfolioEquity,
    realizedPnL: prevRealizedPnL,
    unrealizedPnL: accounting.unrealizedPnL,
  };
};
