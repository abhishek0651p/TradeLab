/* ── Day 32: Phase C — Market Liquidity & Slippage Simulation Engine ──────────────
 * Pure, deterministic mathematical models for realistic market liquidity and slippage.
 * Evaluates available tick liquidity, calculates size-dependent price impact (slippage),
 * enforces order-type price protections, and provides liquidity-constrained fill quantities.
 * Never mutates React state.
 * ──────────────────────────────────────────────────────────────────────────────────── */

import { Order, OrderSide, OrderType, StockData, Holding } from '../types';
import { symbolHash, seededRandom } from '../data/mockData';

// ── Configuration Models ─────────────────────────────────────────────────────

export interface LiquidityConfig {
  /** Master toggle for liquidity constraints (default: true). */
  enabled?: boolean;
  /** Fraction of daily volume available in a single simulation tick (default: 0.0005 = 0.05%). */
  tickLiquidityRatio?: number;
  /** Minimum floor on available tick liquidity to prevent total freeze (default: 10 shares). */
  minTickLiquidity?: number;
  /** Maximum ceiling on available tick liquidity per tick (default: 100,000 shares). */
  maxTickLiquidity?: number;
  /** Maximum participation rate of available liquidity a single order can consume (default: 1.0 = 100%). */
  maxParticipationRate?: number;
}

export interface SlippageConfig {
  /** Master toggle for slippage adjustments (default: true). */
  enabled?: boolean;
  /** Base half-spread / execution friction (default: 0.0002 = 0.02%). */
  baseSlippagePercent?: number;
  /** Impact factor scaling with order quantity relative to available liquidity (default: 0.001 = 0.1%). */
  impactRate?: number;
  /** Hard cap on total slippage percentage to prevent unreasonable spikes (default: 0.05 = 5.0%). */
  maxSlippagePercent?: number;
}

export const DEFAULT_LIQUIDITY_CONFIG: Required<LiquidityConfig> = {
  enabled: true,
  tickLiquidityRatio: 0.0005, // 0.05% of daily traded volume per tick
  minTickLiquidity: 10,       // Minimum 10 shares per tick
  maxTickLiquidity: 100000,   // Maximum 100,000 shares per tick
  maxParticipationRate: 1.0,  // Order can consume up to 100% of available tick liquidity
};

export const DEFAULT_SLIPPAGE_CONFIG: Required<SlippageConfig> = {
  enabled: true,
  baseSlippagePercent: 0.0002, // 0.02% base spread
  impactRate: 0.001,          // 0.1% impact when order size equals 100% of tick liquidity
  maxSlippagePercent: 0.05,   // 5% max slippage clamp
};

// ── Liquidity Calculations ───────────────────────────────────────────────────

/**
 * Determine the available market liquidity (shares) for a stock in a single simulation tick.
 * Considers daily volume, side, and deterministic tick variation.
 *
 * @param stock - The target stock data.
 * @param side - BUY (Ask liquidity) or SELL (Bid liquidity).
 * @param tick - Optional simulation tick number for deterministic time-based variation.
 * @param config - Optional liquidity configuration overrides.
 * @returns Available executable share volume for this tick.
 */
export const computeAvailableTickLiquidity = (
  stock: StockData | undefined,
  side: OrderSide = 'BUY',
  tick: number = 0,
  config: LiquidityConfig = DEFAULT_LIQUIDITY_CONFIG
): number => {
  if (config.enabled === false) {
    return Infinity;
  }

  const minFloor = config.minTickLiquidity ?? DEFAULT_LIQUIDITY_CONFIG.minTickLiquidity;
  const maxCap = config.maxTickLiquidity ?? DEFAULT_LIQUIDITY_CONFIG.maxTickLiquidity;

  if (!stock || typeof stock.volume !== 'number' || !Number.isFinite(stock.volume) || stock.volume <= 0) {
    return minFloor;
  }

  const ratio = config.tickLiquidityRatio ?? DEFAULT_LIQUIDITY_CONFIG.tickLiquidityRatio;
  let baseVolume = Math.round(stock.volume * ratio);

  // Deterministic variation across simulation ticks (0.8x to 1.2x)
  if (tick > 0 && stock.symbol) {
    const seed = symbolHash(stock.symbol) + tick * 17 + (side === 'BUY' ? 1 : 2);
    const variation = 0.8 + 0.4 * seededRandom(seed);
    baseVolume = Math.round(baseVolume * variation);
  }

  return Math.max(minFloor, Math.min(maxCap, baseVolume));
};

/**
 * Constrain an order's executable quantity by market liquidity.
 *
 * @param financialExecutableQty - Max quantity affordable by cash/holdings.
 * @param availableLiquidity - Available market volume in this tick.
 * @param maxParticipationRate - Max fraction of tick volume an order can consume.
 * @returns Liquidity-constrained fill quantity.
 */
export const computeLiquidityConstrainedQuantity = (
  financialExecutableQty: number,
  availableLiquidity: number,
  maxParticipationRate: number = 1.0
): number => {
  if (financialExecutableQty <= 0) return 0;
  if (!Number.isFinite(availableLiquidity) || availableLiquidity === Infinity) {
    return financialExecutableQty;
  }

  const effectiveLiquidity = Math.max(0, Math.floor(availableLiquidity * Math.max(0, maxParticipationRate)));
  return Math.min(financialExecutableQty, effectiveLiquidity);
};

// ── Slippage Calculations ────────────────────────────────────────────────────

export interface SlippageResult {
  /** Execution price after slippage adjustment (rounded to 2 decimal places). */
  executionPrice: number;
  /** Total slippage percentage applied (e.g. 0.005 for 0.5%). */
  slippagePercent: number;
  /** Absolute price difference per share caused by slippage. */
  slippageAmount: number;
}

/**
 * Calculate execution price adjustment (slippage) based on order size and available liquidity.
 * BUY orders slip UPWARD (higher price).
 * SELL orders slip DOWNWARD (lower price).
 *
 * @param referencePrice - Reference market price.
 * @param quantity - Number of shares executing in this fill.
 * @param side - BUY or SELL.
 * @param availableLiquidity - Market liquidity available for this fill.
 * @param config - Slippage configuration.
 */
export const computeSlippage = (
  referencePrice: number,
  quantity: number,
  side: OrderSide,
  availableLiquidity: number,
  config: SlippageConfig = DEFAULT_SLIPPAGE_CONFIG
): SlippageResult => {
  if (referencePrice <= 0 || quantity <= 0 || !Number.isFinite(referencePrice) || !Number.isFinite(quantity)) {
    const safePrice = Number.isFinite(referencePrice) && referencePrice > 0 ? Number(referencePrice.toFixed(2)) : 0;
    return { executionPrice: safePrice, slippagePercent: 0, slippageAmount: 0 };
  }

  if (config.enabled === false) {
    return {
      executionPrice: Number(referencePrice.toFixed(2)),
      slippagePercent: 0,
      slippageAmount: 0,
    };
  }

  const baseSlippage = Math.max(0, config.baseSlippagePercent ?? DEFAULT_SLIPPAGE_CONFIG.baseSlippagePercent);
  const impactRate = Math.max(0, config.impactRate ?? DEFAULT_SLIPPAGE_CONFIG.impactRate);
  const maxSlippage = Math.max(0, config.maxSlippagePercent ?? DEFAULT_SLIPPAGE_CONFIG.maxSlippagePercent);

  // If both rates are 0, return zero slippage
  if (baseSlippage === 0 && impactRate === 0) {
    return {
      executionPrice: Number(referencePrice.toFixed(2)),
      slippagePercent: 0,
      slippageAmount: 0,
    };
  }

  // Impact ratio: quantity relative to liquidity
  const safeLiquidity = Number.isFinite(availableLiquidity) && availableLiquidity > 0
    ? availableLiquidity
    : quantity;
  const impactRatio = quantity / safeLiquidity;

  // Slippage % = base + impactRate * (quantity / liquidity)
  let slippagePercent = baseSlippage + (impactRate * impactRatio);
  // Clamp to max configured slippage cap
  slippagePercent = Math.min(maxSlippage, Math.max(0, slippagePercent));

  let executionPrice: number;
  let slippageAmount: number;

  if (side === 'BUY') {
    // BUY price increases (worse for buyer)
    slippageAmount = Number((referencePrice * slippagePercent).toFixed(2));
    executionPrice = Number((referencePrice + slippageAmount).toFixed(2));
  } else {
    // SELL price decreases (worse for seller)
    slippageAmount = Number((referencePrice * slippagePercent).toFixed(2));
    executionPrice = Number((referencePrice - slippageAmount).toFixed(2));
    // Protect against zero or negative prices
    executionPrice = Math.max(0.01, executionPrice);
  }

  return { executionPrice, slippagePercent, slippageAmount };
};

// ── Order-Type Price Protection ──────────────────────────────────────────────

export interface PriceProtectionResult {
  /** The final price at which the order is permitted to execute. */
  executionPrice: number;
  /** Whether the order is allowed to execute at this price. */
  canExecute: boolean;
  /** Whether the price was clamped to obey limit constraints. */
  clamped: boolean;
  /** Reason for rejection or deferral, if any. */
  reason?: string;
}

/**
 * Enforce order-type price boundaries:
 * - LIMIT BUY must NEVER execute above limit price.
 * - LIMIT SELL must NEVER execute below limit price.
 * - STOP_MARKET may execute at a worse price due to slippage.
 * - STOP_LIMIT must obey its limit price after triggering.
 * - MARKET orders execute at the slipped price.
 *
 * @param computedExecutionPrice - Price after slippage computation.
 * @param order - The order being executed.
 * @param marketPrice - Current market price.
 */
export const applyOrderTypePriceProtection = (
  computedExecutionPrice: number,
  order: Order,
  marketPrice: number
): PriceProtectionResult => {
  const { type, side, requestedPrice } = order;

  // Defensive: if computed price is invalid (NaN or <= 0), fall back to market price.
  if (!Number.isFinite(computedExecutionPrice) || computedExecutionPrice <= 0) {
    return { executionPrice: Number(marketPrice.toFixed(2)), canExecute: true, clamped: false };
  }

  // MARKET orders execute at slipped price
  if (type === 'MARKET') {
    return { executionPrice: computedExecutionPrice, canExecute: true, clamped: false };
  }

  // STOP_MARKET orders execute at market price with slippage (can slip worse than trigger)
  if (type === 'STOP_MARKET') {
    return { executionPrice: computedExecutionPrice, canExecute: true, clamped: false };
  }

  // TARGET orders (trigger like profit targets, market exit)
  if (type === 'TARGET') {
    return { executionPrice: computedExecutionPrice, canExecute: true, clamped: false };
  }

  // LIMIT and STOP_LIMIT orders (obey limit price strictly)
  if (type === 'LIMIT' || type === 'STOP_LIMIT') {
    const limitPrice = requestedPrice;

    if (side === 'BUY') {
      // LIMIT BUY: must NEVER execute above limit price.
      // If slippage would push price above limit price, clamp it to limit price.
      if (computedExecutionPrice > limitPrice) {
        return {
          executionPrice: Number(limitPrice.toFixed(2)),
          canExecute: true,
          clamped: true,
          reason: `Buy price clamped from ₹${computedExecutionPrice} to limit price ₹${limitPrice}`,
        };
      }
      return { executionPrice: computedExecutionPrice, canExecute: true, clamped: false };
    } else {
      // LIMIT SELL: must NEVER execute below limit price.
      // If slippage would push price below limit price, clamp it to limit price.
      if (computedExecutionPrice < limitPrice) {
        return {
          executionPrice: Number(limitPrice.toFixed(2)),
          canExecute: true,
          clamped: true,
          reason: `Sell price clamped from ₹${computedExecutionPrice} to limit price ₹${limitPrice}`,
        };
      }
      return { executionPrice: computedExecutionPrice, canExecute: true, clamped: false };
    }
  }

  return { executionPrice: computedExecutionPrice, canExecute: true, clamped: false };
};
