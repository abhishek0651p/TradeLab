/* ── Day 27: Pre-Trade Risk Validation ────────────────────────────────────────
Pure, deterministic pre-trade risk validation for order submission.
Never mutates state. All calculations are pure mathematical functions.
──────────────────────────────────────────────────────────────────────────────── */

import { OrderSide, StockData, Holding } from '../types';
import { computePreOrderRiskSnapshot } from './RiskCalculationModel';

/** Validate that side is a valid OrderSide */
export const validateDirection = (side: string): side is OrderSide => {
  return side === 'BUY' || side === 'SELL';
};

/** Validate that price is positive and finite */
export const validatePrice = (price: number): boolean => {
  return Number.isFinite(price) && price > 0;
};

/** Validate that quantity is a positive whole number */
export const validateQuantity = (quantity: number): boolean => {
  return Number.isInteger(quantity) && quantity > 0;
};

/** Validate stop-loss direction rules per the existing trading model.
 *  For BUY (Long): stop-loss must be lower than entry price.
 *  For SELL (Short): stop-loss must be higher than entry price.
 *  Returns { valid, error? }.
 */
export const validateStopLossDirection = (
  entryPrice: number,
  stopLossPrice: number,
  side: OrderSide
): { valid: boolean; error?: string } => {
  if (side === 'BUY') {
    return stopLossPrice < entryPrice
      ? { valid: true }
      : { valid: false, error: 'For a BUY (Long) order, stop-loss price must be lower than the entry price.' };
  } else {
    return stopLossPrice > entryPrice
      ? { valid: true }
      : { valid: false, error: 'For a SELL (Short) order, stop-loss price must be higher than the entry price.' };
  }
};

/** Validate target direction rules per the existing trading model.
 *  For BUY (Long): target must be higher than entry price.
 *  For SELL (Short): target must be lower than entry price.
 *  Returns { valid, error? }.
 */
export const validateTargetDirection = (
  entryPrice: number,
  targetPrice: number,
  side: OrderSide
): { valid: boolean; error?: string } => {
  if (side === 'BUY') {
    return targetPrice > entryPrice
      ? { valid: true }
      : { valid: false, error: 'For a BUY (Long) order, target price must be higher than the entry price.' };
  } else {
    return targetPrice < entryPrice
      ? { valid: true }
      : { valid: false, error: 'For a SELL (Short) order, target price must be lower than the entry price.' };
  }
};

/** Validate that sufficient buying power exists for a BUY order.
 *  Required cash = quantity × entry price.
 *  Returns { valid, error? }.
 */
export const validateBuyingPower = (
  quantity: number,
  entryPrice: number,
  cashBalance: number
): { valid: boolean; error?: string } => {
  const requiredCash = quantity * entryPrice;
  if (cashBalance < requiredCash) {
    return {
      valid: false,
      error: `Insufficient buying power. Required: ₹${requiredCash.toLocaleString('en-IN')} but available: ₹${cashBalance.toLocaleString('en-IN')}.`
    };
  }
  return { valid: true };
};

/** Calculate risk per share based on entry and stop-loss prices,
 *  following the same direction logic as PositionSizingModel.
 *  For BUY: risk = entry - stopLoss if stopLoss < entry, else 0.
 *  For SELL: risk = stopLoss - entry if stopLoss > entry, else 0.
 */
export const computeRiskPerShare = (
  entryPrice: number,
  stopLossPrice: number,
  side: OrderSide
): number => {
  if (entryPrice <= 0 || stopLossPrice <= 0) return 0;
  if (side === 'BUY') {
    return stopLossPrice < entryPrice ? Number((entryPrice - stopLossPrice).toFixed(2)) : 0;
  } else {
    return stopLossPrice > entryPrice ? Number((stopLossPrice - entryPrice).toFixed(2)) : 0;
  }
};

/** Calculate reward per share based on entry and target prices,
 *  following the same direction logic as PositionSizingModel.
 *  For BUY: reward = target - entry if target > entry, else 0.
 *  For SELL: reward = entry - target if target < entry, else 0.
 */
export const computeRewardPerShare = (
  entryPrice: number,
  targetPrice: number | undefined,
  side: OrderSide
): number => {
  if (!targetPrice || targetPrice <= 0 || entryPrice <= 0) return 0;
  if (side === 'BUY') {
    return targetPrice > entryPrice ? Number((targetPrice - entryPrice).toFixed(2)) : 0;
  } else {
    return targetPrice < entryPrice ? Number((entryPrice - targetPrice).toFixed(2)) : 0;
  }
};

/** Calculate risk-to-reward ratio.
 *  Returns ratio value; 0 if risk or reward is not positive.
 */
export const computeRiskRewardRatio = (
  riskPerShare: number,
  rewardPerShare: number
): number => {
  if (riskPerShare <= 0 || rewardPerShare <= 0) return 0;
  return Number((rewardPerShare / riskPerShare).toFixed(2));
};

/** Validate full order risk and compute a risk summary for display.
 *  Pure — does not mutate any state. All inputs are read-only.
 *  Returns { valid, errors, warnings, riskSummary }.
 *
 *  Validation checks (in order):
 *  1. Valid direction (BUY/SELL)
 *  2. Positive, finite entry price
 *  3. Valid positive quantity
 *  4. Valid stop-loss direction when supplied
 *  5. Valid target direction when supplied
 *  6. Sufficient buying power for BUY orders
 *  7. Position concentration and cash utilization warnings
 *
 *  Do not assume long-position rules also apply to short positions.
 */
export interface OrderRiskValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  riskSummary: OrderRiskSummary;
}

export interface OrderRiskSummary {
  direction: OrderSide;
  symbol: string;
  quantity: number;
  entryPrice: number;
  positionValue: number;
  stopLossPrice?: number;
  targetPrice?: number;
  maxLossAtStopLoss: number;
  rewardToRiskRatio?: number;
  availableCash: number;
  estimatedRemainingBuyingPower: number;
  estimatedAllocationPercent: number;
  concentrationWarning: boolean;
  cashUtilizationWarning: boolean;
}

/** Main orchestration function: validate order risk and compute summary. */
export const validateOrderRisk = (
  params: {
    symbol: string;
    side: OrderSide;
    quantity: number;
    entryPrice: number;
    stopLossPrice?: number;
    targetPrice?: number;
    cashBalance: number;
    holdings: Holding[];
    stocks: StockData[];
  }
): OrderRiskValidation => {
  const { symbol, side, quantity, entryPrice, stopLossPrice, targetPrice, cashBalance, holdings, stocks } = params;
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Validate direction
  if (!validateDirection(side)) {
    errors.push('Invalid order direction. Must be BUY or SELL.');
  }

  // 2. Validate entry price is positive and finite
  if (!validatePrice(entryPrice)) {
    errors.push('Entry price must be a positive, finite number.');
  }

  // 3. Validate quantity is a positive whole number
  if (!validateQuantity(quantity)) {
    errors.push('Quantity must be a positive whole number.');
  }

  // 4. Validate stop-loss direction if supplied
  if (stopLossPrice !== undefined && stopLossPrice !== null) {
    if (!validatePrice(stopLossPrice)) {
      errors.push('Stop-loss price must be a positive, finite number.');
    } else {
      const slResult = validateStopLossDirection(entryPrice, stopLossPrice, side);
      if (!slResult.valid) {
        errors.push(slResult.error!);
      }
    }
  }

  // 5. Validate target direction if supplied
  if (targetPrice !== undefined && targetPrice !== null) {
    if (!validatePrice(targetPrice)) {
      errors.push('Target price must be a positive, finite number.');
    } else {
      const tResult = validateTargetDirection(entryPrice, targetPrice, side);
      if (!tResult.valid) {
        errors.push(tResult.error!);
      }
    }
  }

  // 6. Validate buying power for BUY orders
  if (side === 'BUY') {
    const bpResult = validateBuyingPower(quantity, entryPrice, cashBalance);
    if (!bpResult.valid) {
      errors.push(bpResult.error!);
    }
  }

  // 7. Compute risk summary and advisory warnings (only if core inputs valid)
  let riskSummary: OrderRiskSummary;

  if (errors.length === 0 && validatePrice(entryPrice) && validateQuantity(quantity)) {
    // Compute risk/reward metrics
    const riskPerShare = computeRiskPerShare(entryPrice, stopLossPrice ?? entryPrice, side);
    const rewardPerShare = targetPrice !== undefined && targetPrice > 0
      ? computeRewardPerShare(entryPrice, targetPrice, side)
      : 0;
    const riskRewardRatio = riskPerShare > 0 && rewardPerShare > 0
      ? computeRiskRewardRatio(riskPerShare, rewardPerShare)
      : undefined;

    // Get advisory warnings from the existing pre-order risk model
    const riskSnapshot = computePreOrderRiskSnapshot({
      symbol,
      side,
      quantity,
      currentPrice: entryPrice,
      cashBalance,
      holdings,
      stocks
    });

    const concentrationWarning = riskSnapshot.estimatedAllocationPercent > 40;
    const cashUtilizationWarning = riskSnapshot.estimatedCashUtilization > 80;

    // Transfer warnings from the model into our validation warnings array
    riskSnapshot.warnings.forEach(w => {
      if (!warnings.includes(w)) warnings.push(w);
    });

    const fallbackPositionValue = Number((entryPrice * quantity).toFixed(2));

    riskSummary = {
      direction: side,
      symbol,
      quantity,
      entryPrice,
      positionValue: fallbackPositionValue,
      stopLossPrice,
      targetPrice,
      maxLossAtStopLoss: riskPerShare * quantity,
      rewardToRiskRatio: riskRewardRatio,
      availableCash: cashBalance,
      estimatedRemainingBuyingPower: side === 'BUY'
        ? Math.max(0, cashBalance - fallbackPositionValue)
        : cashBalance + fallbackPositionValue,
      estimatedAllocationPercent: riskSnapshot.estimatedAllocationPercent,
      concentrationWarning,
      cashUtilizationWarning
    };
  } else {
    // Fallback risk summary when validation has errors — still provide usable data
    const fallbackPositionValue = Number((entryPrice * quantity).toFixed(2));
    riskSummary = {
      direction: side,
      symbol,
      quantity,
      entryPrice,
      positionValue: fallbackPositionValue,
      stopLossPrice,
      targetPrice,
      maxLossAtStopLoss: 0,
      rewardToRiskRatio: undefined,
      availableCash: cashBalance,
      estimatedRemainingBuyingPower: cashBalance,
      estimatedAllocationPercent: 0,
      concentrationWarning: false,
      cashUtilizationWarning: false
    };
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    riskSummary
  };
};