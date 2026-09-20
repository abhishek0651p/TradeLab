/* ── Day 13: Deterministic Risk Calculation Model ───────────────────────────────
Pure, deterministic calculations based on existing portfolio / stock data.
Never mutates source arrays. All calculations are derived from reads.
──────────────────────────────────────────────────────────────────────────────── */

import { Holding, StockData, OrderSide } from '../types';

/* ── Pure helpers (no React, no hooks) ──────────────────────────────────────── */

/**
 * Compute the current market price for a holding.
 * Falls back to averageBuyPrice when market data is unavailable.
 */
const getCurrentPrice = (symbol: string, stocks: StockData[]): number => {
  const stock = stocks.find(s => s.symbol === symbol);
  return stock ? stock.price : 0;
};

/**
 * Compute total market value of all holdings.
 * Does NOT mutate the holdings array.
 */
export const computeMarketValue = (
  holdings: Holding[],
  stocks: StockData[]
): number => {
  let total = 0;
  holdings.forEach(h => {
    const price = getCurrentPrice(h.symbol, stocks);
    total += price * h.quantity;
  });
  return total;
};

/**
 * Compute total portfolio value: cash + market value of holdings.
 * Reads from account state; does not mutate holdings / stocks.
 */
export const computePortfolioValue = (
  cashBalance: number,
  holdings: Holding[],
  stocks: StockData[]
): number => {
  return cashBalance + computeMarketValue(holdings, stocks);
};

/**
 * Compute cash utilization percentage.
 * market exposure / portfolio value × 100
 * Returns 0 when portfolio value is 0 (empty portfolio edge case).
 */
export const computeCashUtilization = (
  cashBalance: number,
  holdings: Holding[],
  stocks: StockData[]
): number => {
  const portfolioValue = computePortfolioValue(cashBalance, holdings, stocks);
  if (portfolioValue === 0) return 0;
  return (computeMarketValue(holdings, stocks) / portfolioValue) * 100;
};

/**
 * Compute allocation percentage for a single holding.
 * current value / total market value × 100
 */
export const computeHoldingAllocationPercent = (
  holding: Holding,
  stocks: StockData[],
  totalMarketValue: number
): number => {
  if (totalMarketValue === 0) return 0;
  const price = getCurrentPrice(holding.symbol, stocks);
  const currentValue = price * holding.quantity;
  return (currentValue / totalMarketValue) * 100;
};

/**
 * Compute the largest position allocation percentage.
 * Scans all holdings deterministically (no mutation).
 */
export const computeLargestPositionPercent = (
  holdings: Holding[],
  stocks: StockData[]
): number => {
  let largestPct = 0;
  const totalMarketValue = computeMarketValue(holdings, stocks);
  if (totalMarketValue === 0) return 0;
  holdings.forEach(h => {
    const pct = computeHoldingAllocationPercent(h, stocks, totalMarketValue);
    if (pct > largestPct) largestPct = pct;
  });
  return largestPct;
};

/**
 * Compute sector allocation percentages.
 * Returns a Map<sector, totalCurrentValue>.
 * Does NOT mutate holdings or stocks.
 */
export const computeSectorAllocation = (
  holdings: Holding[],
  stocks: StockData[]
): Map<string, number> => {
  const sectorMap = new Map<string, number>();
  holdings.forEach(h => {
    const stock = stocks.find(s => s.symbol === h.symbol);
    const sector = stock ? stock.sector : 'Unknown';
    const price = getCurrentPrice(h.symbol, stocks);
    const currentValue = price * h.quantity;
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + currentValue);
  });
  return sectorMap;
};

/**
 * Compute position risk rows.
 * Each row: symbol, companyName, sector, quantity, currentValue, allocationPct,
 *           unrealizedPnL, unrealizedPnLPercent, riskClass
 * Sorted by currentValue descending (deterministic).
 * Does NOT mutate the input arrays.
 */
export interface PositionRiskRow {
  symbol: string;
  companyName: string;
  sector: string;
  quantity: number;
  currentValue: number;
  allocationPercent: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  riskClass: 'Low' | 'Moderate' | 'High';
}

export const computePositionRiskRows = (
  holdings: Holding[],
  stocks: StockData[]
): PositionRiskRow[] => {
  const totalMarketValue = computeMarketValue(holdings, stocks);
  if (totalMarketValue === 0) return [];

  // Build rows using immutable patterns (map, never splice/mutate)
  const rows: PositionRiskRow[] = holdings.map(h => {
    const stock = stocks.find(s => s.symbol === h.symbol);
    const currentPrice = stock ? stock.price : h.averageBuyPrice ?? 0;
    const currentValue = currentPrice * h.quantity;
    const investedValue = h.averageBuyPrice * h.quantity;
    const unrealizedPnL = currentValue - investedValue;
    const unrealizedPnLPercent = investedValue > 0 ? (unrealizedPnL / investedValue) * 100 : 0;

    // Allocation % of total market value
    const allocationPercent = (currentValue / totalMarketValue) * 100;

    // Risk class based on allocation percentage (same rule as Portfolio)
    const riskClass = allocationPercent < 20 ? 'Low' : allocationPercent < 40 ? 'Moderate' : 'High';

    return {
      symbol: h.symbol,
      companyName: stock ? stock.companyName : h.symbol,
      sector: stock ? stock.sector : 'Unknown',
      quantity: h.quantity,
      currentValue,
      allocationPercent,
      unrealizedPnL,
      unrealizedPnLPercent,
      riskClass
    };
  });

  // Sort descending by currentValue (deterministic, does not mutate original)
  return [...rows].sort((a, b) => b.currentValue - a.currentValue);
};

/**
 * Compute gainers / losers counts.
 * Positive unrealized P&L = gainer, negative = loser, zero = neutral.
 */
export const computeGainersLosers = (
  holdings: Holding[],
  stocks: StockData[]
): { gainers: number; losers: number; neutral: number } => {
  const rows = computePositionRiskRows(holdings, stocks);
  let gainers = 0;
  let losers = 0;
  let neutral = 0;
  rows.forEach(r => {
    if (r.unrealizedPnL > 0) gainers++;
    else if (r.unrealizedPnL < 0) losers++;
    else neutral++;
  });
  return { gainers, losers, neutral };
};

/**
 * Compute concentration classification.
 * <20% = Low, >=20% and <40% = Moderate, >=40% = High
 * Follows the existing Day 10 rule exactly.
 */
export const computeConcentrationClassification = (
  largestPct: number
): 'Low' | 'Moderate' | 'High' => {
  if (largestPct < 20) return 'Low';
  if (largestPct < 40) return 'Moderate';
  return 'High';
};

/**
 * Compute sector risk rows.
 * Each row: sector, currentValue, allocationPercent, riskClass
 * Sorted by currentValue descending.
 */
export interface SectorRiskRow {
  sector: string;
  currentValue: number;
  allocationPercent: number;
  riskClass: 'Low' | 'Moderate' | 'High';
}

export const computeSectorRiskRows = (
  holdings: Holding[],
  stocks: StockData[]
): SectorRiskRow[] => {
  const sectorMap = computeSectorAllocation(holdings, stocks);
  if (sectorMap.size === 0) return [];

  const totalMarketValue = computeMarketValue(holdings, stocks);
  if (totalMarketValue === 0) return [];

  const rows: SectorRiskRow[] = Array.from(sectorMap.entries()).map(([sector, value]) => {
    const allocationPercent = (value / totalMarketValue) * 100;
    const riskClass = allocationPercent < 20 ? 'Low' : allocationPercent < 40 ? 'Moderate' : 'High';
    return {
      sector,
      currentValue: value,
      allocationPercent,
      riskClass
    };
  });

  // Sort descending by currentValue
  return [...rows].sort((a, b) => b.currentValue - a.currentValue);
};

/**
 * Compute available cash (same as account.cashBalance, included for API consistency).
 */
export const computeAvailableCash = (
  cashBalance: number
): number => cashBalance;

/* ── Pre-order risk preview types ─────────────────────────────────────────────── */

/** Estimated post-order risk snapshot */
export interface PreOrderRiskSnapshot {
  currentAllocationPercent: number;
  estimatedAllocationPercent: number;
  currentCashUtilization: number;
  estimatedCashUtilization: number;
  currentMarketExposure: number;
  estimatedMarketExposure: number;
  concentrationChange: number; // percentage points
  warnings: string[];
}

/**
 * Compute a pre-order risk snapshot: estimated post-order allocation / cash utilization.
 * Does NOT mutate any existing state (holdings, orders, etc.).
 * The "estimated" values assume the order fills at current market price.
 */
export const computePreOrderRiskSnapshot = (
  params: {
    symbol: string;
    side: OrderSide;
    quantity: number;
    currentPrice: number;
    cashBalance: number;
    holdings: Holding[];
    stocks: StockData[];
  }
): PreOrderRiskSnapshot => {
  const { symbol, side, quantity, currentPrice, cashBalance, holdings, stocks } = params;

  // Current risk state
  const currentMarketExposure = computeMarketValue(holdings, stocks);
  const currentPortfolioValue = computePortfolioValue(cashBalance, holdings, stocks);
  const currentCashUtilization = currentPortfolioValue > 0
    ? (currentMarketExposure / currentPortfolioValue) * 100
    : 0;

  // Current largest position % (for context)
  const currentLargestPct = computeLargestPositionPercent(holdings, stocks);

  // Estimate: compute hypothetical new holdings after this order using immutable copies only.
  // For BUY: add to quantity (or create new holding), cash decreases by order value.
  // For SELL: reduce quantity (or remove holding), cash increases by order value.
  let estimatedCash = cashBalance;
  let estimatedHoldings: Holding[];

  if (side === 'BUY') {
    const existing = holdings.find(h => h.symbol === symbol);
    if (existing) {
      const newQty = existing.quantity + quantity;
      const newAvg = ((existing.averageBuyPrice * existing.quantity) + (currentPrice * quantity)) / newQty;
      estimatedHoldings = holdings.map(h => h.symbol === symbol
        ? { ...h, quantity: newQty, averageBuyPrice: Number(newAvg.toFixed(2)) }
        : h);
    } else {
      estimatedHoldings = [...holdings, { symbol, quantity, averageBuyPrice: Number(currentPrice.toFixed(2)) }];
    }
    estimatedCash = cashBalance - (currentPrice * quantity);
  } else {
    // SELL
    const existing = holdings.find(h => h.symbol === symbol);
    if (existing && existing.quantity > 0) {
      const newQty = existing.quantity - quantity;
      if (newQty <= 0) {
        // Fully sold — remove the holding
        estimatedHoldings = holdings.filter(h => h.symbol !== symbol);
      } else {
        // Partial sell — reduce quantity
        estimatedHoldings = holdings.map(h => h.symbol === symbol
          ? { ...h, quantity: newQty }
          : h);
      }
    } else {
      // Holding not found in current portfolio — no change to holdings
      estimatedHoldings = [...holdings];
    }
    estimatedCash = cashBalance + (currentPrice * quantity);
  }

  // Recompute market exposure from the estimated (immutable) holdings copy.
  // The original holdings array is never touched.
  const estimatedMarketExposure = computeMarketValue(estimatedHoldings, stocks);
  const estimatedPortfolioValue = computePortfolioValue(estimatedCash, estimatedHoldings, stocks);
  const estimatedCashUtilization = estimatedPortfolioValue > 0
    ? (estimatedMarketExposure / estimatedPortfolioValue) * 100
    : 0;

  // Estimated allocation for the new/adjusted position.
  // If buying a new symbol, estimate its allocation % from the order value.
  // If selling, compute the new largest % from the estimated holdings.
  let estimatedAllocationPercent = 0;
  if (side === 'BUY') {
    // The new/adjusted holding's estimated allocation % = (price * quantity) / estimatedPortfolioValue * 100
    estimatedAllocationPercent = (currentPrice * quantity / Math.max(estimatedPortfolioValue, 1)) * 100;
  } else {
    // Selling: the remaining portfolio's largest allocation may change.
    // We compute the new largest % from the estimated holdings for context.
    const newLargestPct = computeLargestPositionPercent(estimatedHoldings, stocks);
    estimatedAllocationPercent = newLargestPct;
  }

  // Concentration change in percentage points
  const concentrationChange = estimatedAllocationPercent - currentLargestPct;

  // Build informational warnings (advisory only)
  const warnings: string[] = [];

  // Position concentration warning
  let concentrationWarningSymbol = symbol;
  if (side === 'SELL') {
    const newLargest = estimatedHoldings
      .map(h => ({
        symbol: h.symbol,
        allocationPercent: computeHoldingAllocationPercent(h, stocks, estimatedMarketExposure)
      }))
      .sort((a, b) => b.allocationPercent - a.allocationPercent)[0];
    concentrationWarningSymbol = newLargest ? newLargest.symbol : symbol;
  }

  if (estimatedAllocationPercent > 40) {
    warnings.push(
      `${concentrationWarningSymbol} estimated allocation of ${estimatedAllocationPercent.toFixed(1)}% exceeds the 40% high-concentration threshold.`
    );
  } else if (estimatedAllocationPercent >= 20) {
    warnings.push(
      `${concentrationWarningSymbol} estimated allocation of ${estimatedAllocationPercent.toFixed(1)}% is in the moderate-concentration range (20–40%).`
    );
  }

  // Sector concentration warning
  const sectorMap = computeSectorAllocation(estimatedHoldings, stocks);
  const totalEstimatedMarketValue = computeMarketValue(estimatedHoldings, stocks);
  if (totalEstimatedMarketValue > 0) {
    sectorMap.forEach((sectorValue, sector) => {
      const sectorPct = (sectorValue / totalEstimatedMarketValue) * 100;
      if (sectorPct > 50) {
        // Find the primary symbol in this sector for the warning
        const sectorSymbols = estimatedHoldings
          .filter(h => {
            const s = stocks.find(st => st.symbol === h.symbol);
            return s && s.sector === sector;
          })
          .map(h => h.symbol);
        const primarySymbol = sectorSymbols[0] || symbol;
        warnings.push(
          `${primarySymbol} represents ${sectorPct.toFixed(1)}% of current market exposure, exceeding the 50% sector threshold.`
        );
      }
    });
  }

  // Cash utilization warning
  if (estimatedCashUtilization > 80) {
    warnings.push(
      `Cash utilization is ${estimatedCashUtilization.toFixed(1)}%, leaving limited available capital.`
    );
  }

  return {
    currentAllocationPercent: currentLargestPct,
    estimatedAllocationPercent,
    currentCashUtilization,
    estimatedCashUtilization,
    currentMarketExposure,
    estimatedMarketExposure,
    concentrationChange,
    warnings
  };
};
