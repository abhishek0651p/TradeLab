/* ── Day 29: Trading Accounting Model ───────────────────────────────────────────────
Standardized financial accounting definitions and calculations.
Ensures consistent definitions across the application.
Never mutates source data. All calculations are pure functions.
──────────────────────────────────────────────────────────────────────────────── */

import { Holding, StockData, Order, OrderSide, Trade } from '../types';

/** Standardized financial definitions per Day 29 audit. */

/** Cost basis: total purchase cost of currently held positions.
 *  Uses the actual acquisition price (averageBuyPrice × Quantity),
 *  not the current market price — so unrealized P&L reflects real gain/loss.
 */
export const computeCostBasis = (holdings: Holding[], _stocks: StockData[]): number => {
  let total = 0;
  holdings.forEach(h => {
    total += Number((h.averageBuyPrice * h.quantity).toFixed(2));
  });
  return Number(total.toFixed(2));
};

/** Current market value: present valuation of all held positions. */
export const computeCurrentMarketValue = (holdings: Holding[], stocks: StockData[]): number => {
  let total = 0;
  holdings.forEach(h => {
    const stock = stocks.find(s => s.symbol === h.symbol);
    const price = stock ? stock.price : h.averageBuyPrice;
    total += Number((price * h.quantity).toFixed(2));
  });
  return Number(total.toFixed(2));
};

/** Unrealized P&L: Current Market Value - Cost Basis. */
export const computeUnrealizedPnL = (holdings: Holding[], stocks: StockData[]): number => {
  const marketValue = computeCurrentMarketValue(holdings, stocks);
  const costBasis = computeCostBasis(holdings, stocks);
  return Number((marketValue - costBasis).toFixed(2));
};

/** Realized P&L from closed trades. Preserves existing logic. */
export const computeRealizedPnL = (trades: Trade[]): number => {
  let total = 0;
  trades.forEach(t => {
    total += Number((t.realizedPnL ?? 0).toFixed(2));
  });
  return Number(total.toFixed(2));
};

/** Total Portfolio Equity: Cash Balance + Current Market Value. */
export const computePortfolioEquity = (
  cashBalance: number,
  holdings: Holding[],
  stocks: StockData[]
): number => {
  return Number((cashBalance + computeCurrentMarketValue(holdings, stocks)).toFixed(2));
};

/** Available Buying Power: Cash Balance - Reserved Buy Capital. */
export const computeAvailableBuyingPower = (
  cashBalance: number,
  reservedBuyCapital: number
): number => {
  return Math.max(0, Number((cashBalance - reservedBuyCapital).toFixed(2)));
};

/** Available quantity for SELL: Total Holding - Reserved Sell Quantity. */
export const computeAvailableSellQuantityFn = (
  totalHoldingQuantity: number,
  reservedSellQuantity: number
): number => {
  return Math.max(0, totalHoldingQuantity - reservedSellQuantity);
};

/** Portfolio summary with standardized definitions. */
export interface PortfolioSummaryMetrics {
  cashBalance: number;
  costBasis: number;
  currentMarketValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  portfolioEquity: number;
  availableBuyingPower: number;
}

/** Compute portfolio summary metrics using standardized definitions. */
export const computePortfolioSummaryMetrics = (
  cashBalance: number,
  holdings: Holding[],
  stocks: StockData[],
  reservedBuyCapital: number,
  trades: Trade[]
): PortfolioSummaryMetrics => {
  const costBasis = computeCostBasis(holdings, stocks);
  const currentMarketValue = computeCurrentMarketValue(holdings, stocks);
  const unrealizedPnL = computeUnrealizedPnL(holdings, stocks);
  const realizedPnL = computeRealizedPnL(trades);
  const portfolioEquity = Number((cashBalance + currentMarketValue).toFixed(2));
  const availableBuyingPower = Number((cashBalance - reservedBuyCapital).toFixed(2));

  return {
    cashBalance,
    costBasis,
    currentMarketValue,
    unrealizedPnL,
    realizedPnL,
    portfolioEquity: portfolioEquity < 0 ? 0 : portfolioEquity,
    availableBuyingPower: availableBuyingPower < 0 ? 0 : availableBuyingPower
  };
};