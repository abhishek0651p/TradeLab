/* ── Day 26: Risk Management & Position Sizing Model ────────────────────────────
Pure, deterministic calculations for capital preservation and trade sizing.
Never mutates state. All calculations are pure mathematical functions.
──────────────────────────────────────────────────────────────────────────────── */

export type PositionDirection = 'BUY' | 'SELL';

export interface PositionSizingInputs {
  equity: number;
  riskPercent: number; // e.g., 2 for 2%
  entryPrice: number;
  stopLossPrice: number;
  targetPrice?: number;
  direction?: PositionDirection;
  cashBalance?: number;
}

export interface RiskRewardResult {
  riskPerShare: number;
  rewardPerShare: number;
  ratio: number;
}

export interface PositionSizingResult {
  riskAmount: number;
  riskPerShare: number;
  rewardPerShare: number;
  riskRewardRatio: number;
  recommendedQuantity: number;
  totalPositionValue: number;
  maxAffordableQuantity: number;
  effectiveQuantity: number;
  cashRequired: number;
  cashShortfall: number;
  exceedsCash: boolean;
  potentialGain: number;
  potentialLoss: number;
  positionPercentOfEquity: number;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Calculate the total capital at risk for a trade given account equity and risk %.
 * Returns 0 if either value is invalid or negative.
 */
export const calculateRiskAmount = (equity: number, riskPercent: number): number => {
  if (equity <= 0 || riskPercent <= 0) return 0;
  return Number(((equity * riskPercent) / 100).toFixed(2));
};

/**
 * Calculate risk per share based on entry and stop-loss prices.
 * Returns 0 if direction logic is violated.
 */
export const calculateRiskPerShare = (
  entryPrice: number,
  stopLossPrice: number,
  direction: PositionDirection = 'BUY'
): number => {
  if (entryPrice <= 0 || stopLossPrice <= 0) return 0;
  if (direction === 'BUY') {
    return stopLossPrice < entryPrice ? Number((entryPrice - stopLossPrice).toFixed(2)) : 0;
  } else {
    return stopLossPrice > entryPrice ? Number((stopLossPrice - entryPrice).toFixed(2)) : 0;
  }
};

/**
 * Calculate reward per share based on entry and target prices.
 * Returns 0 if target is not specified or direction logic is violated.
 */
export const calculateRewardPerShare = (
  entryPrice: number,
  targetPrice?: number,
  direction: PositionDirection = 'BUY'
): number => {
  if (!targetPrice || targetPrice <= 0 || entryPrice <= 0) return 0;
  if (direction === 'BUY') {
    return targetPrice > entryPrice ? Number((targetPrice - entryPrice).toFixed(2)) : 0;
  } else {
    return targetPrice < entryPrice ? Number((entryPrice - targetPrice).toFixed(2)) : 0;
  }
};

/**
 * Calculate the recommended position size (quantity of shares)
 * Formula: floor(riskAmount / riskPerShare)
 */
export const calculatePositionSize = (
  entryPrice: number,
  stopLossPrice: number,
  riskAmount: number,
  direction: PositionDirection = 'BUY'
): number => {
  const riskPerShare = calculateRiskPerShare(entryPrice, stopLossPrice, direction);
  if (riskPerShare <= 0 || riskAmount <= 0) return 0;
  return Math.floor(riskAmount / riskPerShare);
};

/**
 * Calculate total position market value = entryPrice * quantity.
 */
export const calculatePositionValue = (entryPrice: number, quantity: number): number => {
  if (entryPrice <= 0 || quantity <= 0) return 0;
  return Number((entryPrice * quantity).toFixed(2));
};

/**
 * Calculate Risk-to-Reward ratio.
 * Returns { riskPerShare, rewardPerShare, ratio }.
 */
export const calculateRiskReward = (
  entryPrice: number,
  stopLossPrice: number,
  targetPrice?: number,
  direction: PositionDirection = 'BUY'
): RiskRewardResult => {
  const riskPerShare = calculateRiskPerShare(entryPrice, stopLossPrice, direction);
  const rewardPerShare = calculateRewardPerShare(entryPrice, targetPrice, direction);
  const ratio = riskPerShare > 0 && rewardPerShare > 0
    ? Number((rewardPerShare / riskPerShare).toFixed(2))
    : 0;

  return {
    riskPerShare,
    rewardPerShare,
    ratio
  };
};

/**
 * Validate position sizing inputs and return lists of validation errors.
 */
export const validatePositionInputs = (inputs: PositionSizingInputs): string[] => {
  const errors: string[] = [];
  const direction = inputs.direction ?? 'BUY';

  if (inputs.equity <= 0) {
    errors.push('Account equity must be greater than zero.');
  }

  if (inputs.riskPercent <= 0 || inputs.riskPercent > 100) {
    errors.push('Risk percentage must be between 0.1% and 100%.');
  }

  if (inputs.entryPrice <= 0) {
    errors.push('Entry price must be greater than zero.');
  }

  if (inputs.stopLossPrice <= 0) {
    errors.push('Stop-loss price must be greater than zero.');
  }

  if (inputs.entryPrice > 0 && inputs.stopLossPrice > 0) {
    if (direction === 'BUY' && inputs.stopLossPrice >= inputs.entryPrice) {
      errors.push('For a BUY (Long) trade, stop-loss price must be lower than the entry price.');
    }
    if (direction === 'SELL' && inputs.stopLossPrice <= inputs.entryPrice) {
      errors.push('For a SELL (Short) trade, stop-loss price must be higher than the entry price.');
    }
  }

  if (inputs.targetPrice !== undefined && inputs.targetPrice > 0 && inputs.entryPrice > 0) {
    if (direction === 'BUY' && inputs.targetPrice <= inputs.entryPrice) {
      errors.push('For a BUY (Long) trade, target price must be higher than the entry price.');
    }
    if (direction === 'SELL' && inputs.targetPrice >= inputs.entryPrice) {
      errors.push('For a SELL (Short) trade, target price must be lower than the entry price.');
    }
  }

  return errors;
};

/**
 * Main pure position sizing calculator function.
 * Evaluates risk amount, quantity, position value, cash constraints, and produces warnings.
 */
export const computePositionSizing = (inputs: PositionSizingInputs): PositionSizingResult => {
  const direction = inputs.direction ?? 'BUY';
  const errors = validatePositionInputs(inputs);
  const warnings: string[] = [];

  const isValid = errors.length === 0;

  if (!isValid) {
    return {
      riskAmount: 0,
      riskPerShare: 0,
      rewardPerShare: 0,
      riskRewardRatio: 0,
      recommendedQuantity: 0,
      totalPositionValue: 0,
      maxAffordableQuantity: 0,
      effectiveQuantity: 0,
      cashRequired: 0,
      cashShortfall: 0,
      exceedsCash: false,
      potentialGain: 0,
      potentialLoss: 0,
      positionPercentOfEquity: 0,
      isValid: false,
      errors,
      warnings
    };
  }

  const riskAmount = calculateRiskAmount(inputs.equity, inputs.riskPercent);
  const riskPerShare = calculateRiskPerShare(inputs.entryPrice, inputs.stopLossPrice, direction);
  const rewardPerShare = calculateRewardPerShare(inputs.entryPrice, inputs.targetPrice, direction);
  const riskRewardRatio = riskPerShare > 0 && rewardPerShare > 0
    ? Number((rewardPerShare / riskPerShare).toFixed(2))
    : 0;

  const recommendedQuantity = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0;
  const totalPositionValue = calculatePositionValue(inputs.entryPrice, recommendedQuantity);

  // Cash constraint evaluation
  const cash = inputs.cashBalance ?? inputs.equity;
  const maxAffordableQuantity = inputs.entryPrice > 0 ? Math.floor(cash / inputs.entryPrice) : 0;
  const exceedsCash = totalPositionValue > cash;
  const cashShortfall = exceedsCash ? Number((totalPositionValue - cash).toFixed(2)) : 0;
  const effectiveQuantity = exceedsCash ? maxAffordableQuantity : recommendedQuantity;
  const cashRequired = totalPositionValue;

  const potentialLoss = Number((recommendedQuantity * riskPerShare).toFixed(2));
  const potentialGain = rewardPerShare > 0 ? Number((recommendedQuantity * rewardPerShare).toFixed(2)) : 0;
  const positionPercentOfEquity = inputs.equity > 0
    ? Number(((totalPositionValue / inputs.equity) * 100).toFixed(1))
    : 0;

  // Contextual warnings
  if (recommendedQuantity === 0 && riskPerShare > riskAmount) {
    warnings.push(
      `Risk per share (₹${riskPerShare.toLocaleString('en-IN')}) exceeds total permitted risk (₹${riskAmount.toLocaleString('en-IN')}). Consider tightening the stop-loss or increasing account risk allocation.`
    );
  }

  if (exceedsCash && recommendedQuantity > 0) {
    warnings.push(
      `Total position value (₹${totalPositionValue.toLocaleString('en-IN')}) exceeds available cash (₹${cash.toLocaleString('en-IN')}). You can only afford ${maxAffordableQuantity} shares.`
    );
  }

  if (positionPercentOfEquity > 40) {
    warnings.push(
      `Position represents ${positionPercentOfEquity}% of account equity, which exceeds the recommended 40% single-position concentration limit.`
    );
  }

  if (inputs.targetPrice && inputs.targetPrice > 0 && riskRewardRatio > 0 && riskRewardRatio < 1.0) {
    warnings.push(
      `Risk-Reward ratio is 1:${riskRewardRatio}, which is under the recommended 1:1.5 minimum threshold.`
    );
  }

  return {
    riskAmount,
    riskPerShare,
    rewardPerShare,
    riskRewardRatio,
    recommendedQuantity,
    totalPositionValue,
    maxAffordableQuantity,
    effectiveQuantity,
    cashRequired,
    cashShortfall,
    exceedsCash,
    potentialGain,
    potentialLoss,
    positionPercentOfEquity,
    isValid: true,
    errors,
    warnings
  };
};
