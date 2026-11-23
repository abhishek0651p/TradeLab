/* ── Day 32: Phase D — Transaction Costs & Brokerage Simulation Engine ──────────────
 * Pure, deterministic mathematical models for Indian equity transaction charges.
 * Calculates brokerage, STT, exchange turnover fees, GST, SEBI charges, stamp duty,
 * and net execution values across BUY and SELL executions and partial fills.
 *
 * NOTE: All rate schedules and formulas represent indicative paper-trading simulation
 * assumptions inspired by standard Indian equity delivery/intraday schedules (Zerodha/Groww).
 * They are NOT guaranteed broker fees, official exchange levies, or tax advice.
 * Never mutates React state.
 * ──────────────────────────────────────────────────────────────────────────────────── */

import { OrderSide, Trade, TransactionCosts } from '../types';

// ── Configuration Models ─────────────────────────────────────────────────────

export type TradeSegment = 'DELIVERY' | 'INTRADAY';

export interface TransactionCostConfig {
  /** Master toggle for transaction charges (default: true). When false, all charges are 0. */
  enabled?: boolean;
  /** Trade segment: DELIVERY (equity delivery) or INTRADAY (equity intraday). */
  segment?: TradeSegment;
  /** Brokerage percentage on turnover (e.g. 0.0003 = 0.03%). */
  brokeragePercent?: number;
  /** Flat brokerage per order/fill in INR (default: 0). */
  brokerageFlat?: number;
  /** Minimum brokerage per order in INR (default: 0). */
  minBrokerage?: number;
  /** Maximum brokerage cap per order in INR (e.g. ₹20 per executed order). */
  maxBrokerage?: number;
  /** Securities Transaction Tax on BUY turnover (default: 0.001 = 0.1% for equity delivery). */
  sttBuyRate?: number;
  /** Securities Transaction Tax on SELL turnover (default: 0.001 = 0.1% for equity delivery). */
  sttSellRate?: number;
  /** Exchange transaction turnover charge rate (default: 0.0000345 = 0.00345% for NSE). */
  exchangeRate?: number;
  /** SEBI turnover charge rate (default: 0.000001 = ₹10/crore = 0.0001%). */
  sebiRate?: number;
  /** Stamp duty on BUY turnover (default: 0.00015 = 0.015%). */
  stampDutyBuyRate?: number;
  /** Stamp duty on SELL turnover (default: 0 = 0%). */
  stampDutySellRate?: number;
  /** Goods & Services Tax on (brokerage + exchange charges + sebi charges) (default: 0.18 = 18%). */
  gstRate?: number;
  /** Other optional charges as a fraction of turnover (default: 0). */
  otherChargesRate?: number;
  /** Other optional flat charge in INR (default: 0). */
  otherChargesFlat?: number;
}

/**
 * Standard default indicative simulation configuration for Indian equity delivery:
 * - Brokerage: 0.03% or ₹20 per executed order, whichever is lower.
 * - STT: 0.1% on BUY and SELL.
 * - Exchange transaction charges: 0.00345% (NSE).
 * - SEBI charges: ₹10 per crore (0.0001%).
 * - Stamp duty: 0.015% on BUY side only.
 * - GST: 18% on (Brokerage + Exchange + SEBI).
 */
export const DEFAULT_TRANSACTION_COST_CONFIG: Required<TransactionCostConfig> = {
  enabled: true,
  segment: 'DELIVERY',
  brokeragePercent: 0.0003,      // 0.03%
  brokerageFlat: 0,
  minBrokerage: 0,
  maxBrokerage: 20,              // ₹20 cap
  sttBuyRate: 0.001,             // 0.1%
  sttSellRate: 0.001,            // 0.1%
  exchangeRate: 0.0000345,       // 0.00345%
  sebiRate: 0.000001,            // ₹10/crore
  stampDutyBuyRate: 0.00015,     // 0.015% on BUY
  stampDutySellRate: 0,          // 0% on SELL
  gstRate: 0.18,                 // 18% on (Brokerage + Exchange + SEBI)
  otherChargesRate: 0,
  otherChargesFlat: 0,
};

/**
 * Alternative indicative configuration for Equity Intraday trading:
 * - STT: 0% on BUY, 0.025% on SELL.
 * - Stamp duty: 0.003% on BUY.
 */
export const INTRADAY_TRANSACTION_COST_CONFIG: Required<TransactionCostConfig> = {
  ...DEFAULT_TRANSACTION_COST_CONFIG,
  segment: 'INTRADAY',
  brokeragePercent: 0.0003,
  maxBrokerage: 20,
  sttBuyRate: 0,
  sttSellRate: 0.00025,          // 0.025% on SELL turnover only
  stampDutyBuyRate: 0.00003,     // 0.003% on BUY turnover
  stampDutySellRate: 0,
};

// ── Calculation Models ───────────────────────────────────────────────────────

export interface TransactionCostInput {
  side: OrderSide;
  quantity: number;
  price: number;
  totalValue?: number;
  segment?: TradeSegment;
}

export interface TransactionCostAnalytics {
  totalBrokerage: number;
  totalSTT: number;
  totalExchangeCharges: number;
  totalGST: number;
  totalSEBI: number;
  totalStampDuty: number;
  totalOtherCharges: number;
  totalCharges: number;
  buySideCharges: number;
  sellSideCharges: number;
  grossRealizedPnL: number;
  netRealizedPnL: number;
}

// ── Core Engine Calculations ─────────────────────────────────────────────────

const round2 = (num: number): number => Number((Number.isFinite(num) ? num : 0).toFixed(2));

/**
 * Calculate the complete transaction cost breakdown for an execution.
 * Pure function: deterministic and returns rounded INR values.
 *
 * @param input - Order side, quantity, price, and optional segment.
 * @param config - Configurable fee/tax rates and limits (defaults to DEFAULT_TRANSACTION_COST_CONFIG).
 * @param existingOrderCharges - Optional cumulative charges already recorded for prior partial fills
 *                               under the same order (used to enforce order-level caps like maxBrokerage).
 */
export const calculateTransactionCosts = (
  input: TransactionCostInput,
  config: TransactionCostConfig = DEFAULT_TRANSACTION_COST_CONFIG,
  existingOrderCharges?: TransactionCosts
): Required<TransactionCosts> => {
  const zeroResult: Required<TransactionCosts> = {
    brokerage: 0,
    stt: 0,
    exchangeTransactionCharges: 0,
    gst: 0,
    sebiCharges: 0,
    stampDuty: 0,
    otherCharges: 0,
    totalCharges: 0,
  };

  if (config.enabled === false) {
    return zeroResult;
  }

  const { side, quantity, price } = input;
  if (quantity <= 0 || price <= 0 || !Number.isFinite(quantity) || !Number.isFinite(price)) {
    return zeroResult;
  }

  const turnover = quantity * price;

  // 1. Brokerage calculation
  const bPercent = config.brokeragePercent ?? DEFAULT_TRANSACTION_COST_CONFIG.brokeragePercent;
  const bFlat = config.brokerageFlat ?? DEFAULT_TRANSACTION_COST_CONFIG.brokerageFlat;
  const minB = config.minBrokerage ?? DEFAULT_TRANSACTION_COST_CONFIG.minBrokerage;
  const maxB = config.maxBrokerage ?? DEFAULT_TRANSACTION_COST_CONFIG.maxBrokerage;

  let unclampedBrokerage = (turnover * bPercent) + bFlat;

  let brokerage = unclampedBrokerage;
  if (existingOrderCharges && typeof existingOrderCharges.brokerage === 'number') {
    // Partial fill allocation: clamp against remaining headroom under the order's maxBrokerage
    const priorBrokerage = Math.max(0, existingOrderCharges.brokerage);
    const headroom = Math.max(0, maxB - priorBrokerage);
    brokerage = Math.min(unclampedBrokerage, headroom);
  } else {
    // Single / first fill: clamp between min and max brokerage
    brokerage = Math.min(maxB, Math.max(minB, unclampedBrokerage));
  }
  brokerage = round2(Math.max(0, brokerage));

  // 2. Securities Transaction Tax (STT)
  const sttRate = side === 'BUY'
    ? (config.sttBuyRate ?? DEFAULT_TRANSACTION_COST_CONFIG.sttBuyRate)
    : (config.sttSellRate ?? DEFAULT_TRANSACTION_COST_CONFIG.sttSellRate);
  const stt = round2(turnover * Math.max(0, sttRate));

  // 3. Exchange Transaction Charges
  const exRate = config.exchangeRate ?? DEFAULT_TRANSACTION_COST_CONFIG.exchangeRate;
  const exchangeTransactionCharges = round2(turnover * Math.max(0, exRate));

  // 4. SEBI Turnover Charges
  const sebiRate = config.sebiRate ?? DEFAULT_TRANSACTION_COST_CONFIG.sebiRate;
  const sebiCharges = round2(turnover * Math.max(0, sebiRate));

  // 5. Stamp Duty (statutorily on BUY side only in standard delivery)
  const stampRate = side === 'BUY'
    ? (config.stampDutyBuyRate ?? DEFAULT_TRANSACTION_COST_CONFIG.stampDutyBuyRate)
    : (config.stampDutySellRate ?? DEFAULT_TRANSACTION_COST_CONFIG.stampDutySellRate);
  const stampDuty = round2(turnover * Math.max(0, stampRate));

  // 6. Goods & Services Tax (GST: 18% on Brokerage + Exchange charges + SEBI charges)
  const gstRate = config.gstRate ?? DEFAULT_TRANSACTION_COST_CONFIG.gstRate;
  const gstTaxableServices = brokerage + exchangeTransactionCharges + sebiCharges;
  const gst = round2(gstTaxableServices * Math.max(0, gstRate));

  // 7. Other Charges (configurable turnover rate + flat component)
  const otherRate = config.otherChargesRate ?? DEFAULT_TRANSACTION_COST_CONFIG.otherChargesRate;
  const otherFlat = config.otherChargesFlat ?? DEFAULT_TRANSACTION_COST_CONFIG.otherChargesFlat;
  const otherCharges = round2((turnover * Math.max(0, otherRate)) + Math.max(0, otherFlat));

  // 8. Total Transaction Costs
  const totalCharges = round2(
    brokerage +
    stt +
    exchangeTransactionCharges +
    gst +
    sebiCharges +
    stampDuty +
    otherCharges
  );

  return {
    brokerage,
    stt,
    exchangeTransactionCharges,
    gst,
    sebiCharges,
    stampDuty,
    otherCharges,
    totalCharges,
  };
};

/**
 * Sum up all non-undefined charge components in a TransactionCosts structure.
 */
export const calculateTotalCharges = (charges: TransactionCosts | undefined): number => {
  if (!charges) return 0;
  if (typeof charges.totalCharges === 'number' && Number.isFinite(charges.totalCharges)) {
    return round2(charges.totalCharges);
  }
  const sum = (charges.brokerage ?? 0) +
    (charges.stt ?? 0) +
    (charges.exchangeTransactionCharges ?? 0) +
    (charges.gst ?? 0) +
    (charges.sebiCharges ?? 0) +
    (charges.stampDuty ?? 0) +
    (charges.otherCharges ?? 0);
  return round2(sum);
};

/**
 * Calculate the net financial execution value taking transaction costs into account:
 * - BUY:  Gross Value + Total Charges (Total cash outflow needed to acquire the shares).
 * - SELL: Gross Value - Total Charges (Net cash inflow received after deducting charges).
 */
export const calculateNetExecutionValue = (
  input: TransactionCostInput,
  charges: TransactionCosts
): number => {
  const gross = input.totalValue ?? (input.quantity * input.price);
  const totalCost = charges.totalCharges ?? calculateTotalCharges(charges);
  if (input.side === 'BUY') {
    return round2(gross + totalCost);
  } else {
    return round2(Math.max(0, gross - totalCost));
  }
};

/**
 * Aggregate transaction costs across multiple fills for an order.
 * Ensures the order's cumulative charges equal the exact sum of all execution charges.
 */
export const aggregateOrderCharges = (
  previousCharges?: TransactionCosts,
  newCharges?: TransactionCosts
): Required<TransactionCosts> => {
  const p = previousCharges ?? {};
  const n = newCharges ?? {};

  const brokerage = round2((p.brokerage ?? 0) + (n.brokerage ?? 0));
  const stt = round2((p.stt ?? 0) + (n.stt ?? 0));
  const exchangeTransactionCharges = round2((p.exchangeTransactionCharges ?? 0) + (n.exchangeTransactionCharges ?? 0));
  const gst = round2((p.gst ?? 0) + (n.gst ?? 0));
  const sebiCharges = round2((p.sebiCharges ?? 0) + (n.sebiCharges ?? 0));
  const stampDuty = round2((p.stampDuty ?? 0) + (n.stampDuty ?? 0));
  const otherCharges = round2((p.otherCharges ?? 0) + (n.otherCharges ?? 0));
  const totalCharges = round2(
    brokerage + stt + exchangeTransactionCharges + gst + sebiCharges + stampDuty + otherCharges
  );

  return {
    brokerage,
    stt,
    exchangeTransactionCharges,
    gst,
    sebiCharges,
    stampDuty,
    otherCharges,
    totalCharges,
  };
};

/**
 * Update a holding's weighted average buy price to incorporate BUY-side acquisition transaction costs.
 * Formula:
 *   newAvg = ((prevAvg * prevQty) + (price * addedQty) + addedBuyCharges) / (prevQty + addedQty)
 *
 * This ensures that subsequent realized P&L calculations on SELL naturally account
 * for the true cost basis of the position without losing BUY-side transaction costs.
 */
export const computeHoldingAverageBuyPriceWithCosts = (
  prevAvg: number,
  prevQty: number,
  addedQty: number,
  executionPrice: number,
  addedBuyCharges: number = 0
): number => {
  if (addedQty <= 0) return round2(prevAvg);
  const prevCost = prevQty > 0 ? (prevAvg * prevQty) : 0;
  const newAcquisitionCost = (executionPrice * addedQty) + addedBuyCharges;
  const totalShares = prevQty + addedQty;
  return round2(totalShares > 0 ? (prevCost + newAcquisitionCost) / totalShares : 0);
};

/**
 * Calculate net realized P&L for a SELL execution after accounting for:
 * 1. Holding cost basis (which already reflects the BUY-side acquisition costs via weighted average buy price).
 * 2. Applicable SELL-side transaction charges.
 *
 * Formula:
 *   Net Realized P&L = (Gross Sale Value - SELL Charges) - (averageBuyPrice * soldQuantity)
 */
export const computeRealizedPnLWithCosts = (
  grossSaleValue: number,
  sellCharges: number,
  costBasis: number
): number => {
  const netSaleProceeds = grossSaleValue - sellCharges;
  return round2(netSaleProceeds - costBasis);
};

/**
 * Pure aggregation helper: computes transaction cost analytics from recorded trade records.
 * Uses only actual recorded execution charges from historical trades, never re-evaluating
 * current configuration on past data.
 */
export const calculateTransactionCostAnalytics = (trades: Trade[]): TransactionCostAnalytics => {
  let totalBrokerage = 0;
  let totalSTT = 0;
  let totalExchangeCharges = 0;
  let totalGST = 0;
  let totalSEBI = 0;
  let totalStampDuty = 0;
  let totalOtherCharges = 0;
  let totalCharges = 0;
  let buySideCharges = 0;
  let sellSideCharges = 0;
  let grossRealizedPnL = 0;
  let netRealizedPnL = 0;

  for (const trade of trades) {
    const c = trade.charges;
    if (c) {
      const b = c.brokerage ?? 0;
      const st = c.stt ?? 0;
      const ex = c.exchangeTransactionCharges ?? 0;
      const gs = c.gst ?? 0;
      const sb = c.sebiCharges ?? 0;
      const sd = c.stampDuty ?? 0;
      const ot = c.otherCharges ?? 0;
      const tot = c.totalCharges ?? (b + st + ex + gs + sb + sd + ot);

      totalBrokerage += b;
      totalSTT += st;
      totalExchangeCharges += ex;
      totalGST += gs;
      totalSEBI += sb;
      totalStampDuty += sd;
      totalOtherCharges += ot;
      totalCharges += tot;

      if (trade.side === 'BUY') {
        buySideCharges += tot;
      } else {
        sellSideCharges += tot;
      }
    }

    if (trade.realizedPnL !== null && trade.realizedPnL !== undefined) {
      netRealizedPnL += trade.realizedPnL;
      // Reconstruct gross realized P&L if charges are present
      const sellFee = trade.charges?.totalCharges ?? 0;
      grossRealizedPnL += (trade.realizedPnL + sellFee);
    }
  }

  return {
    totalBrokerage: round2(totalBrokerage),
    totalSTT: round2(totalSTT),
    totalExchangeCharges: round2(totalExchangeCharges),
    totalGST: round2(totalGST),
    totalSEBI: round2(totalSEBI),
    totalStampDuty: round2(totalStampDuty),
    totalOtherCharges: round2(totalOtherCharges),
    totalCharges: round2(totalCharges),
    buySideCharges: round2(buySideCharges),
    sellSideCharges: round2(sellSideCharges),
    grossRealizedPnL: round2(grossRealizedPnL),
    netRealizedPnL: round2(netRealizedPnL),
  };
};
