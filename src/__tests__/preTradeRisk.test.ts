import { describe, it, expect } from 'vitest';
import {
  validateOrderRisk,
  validateDirection,
  validatePrice,
  validateQuantity,
  validateStopLossDirection,
  validateTargetDirection,
  validateBuyingPower,
  computeRiskPerShare,
  computeRewardPerShare,
  computeRiskRewardRatio,
  OrderRiskValidation,
} from '../risk/PreTradeRiskValidator';
import { MOCK_STOCKS } from '../data/mockData';
import { INITIAL_ACCOUNT_STATE } from '../data/mockData';

describe('Pre-Trade Risk Validator', () => {
  const defaultParams = {
    symbol: 'RELIANCE',
    side: 'BUY' as const,
    quantity: 10,
    entryPrice: 2950.45,
    cashBalance: 1000000,
    holdings: [] as { symbol: string; quantity: number; averageBuyPrice: number }[],
    stocks: MOCK_STOCKS,
  };

  // ── Individual validator tests ──

  describe('validateDirection', () => {
    it('returns true for BUY', () => {
      expect(validateDirection('BUY')).toBe(true);
    });
    it('returns true for SELL', () => {
      expect(validateDirection('SELL')).toBe(true);
    });
    it('returns false for invalid direction', () => {
      expect(validateDirection('HOLD')).toBe(false);
    });
  });

  describe('validatePrice', () => {
    it('accepts a positive finite price', () => {
      expect(validatePrice(100)).toBe(true);
    });
    it('rejects zero', () => {
      expect(validatePrice(0)).toBe(false);
    });
    it('rejects negative price', () => {
      expect(validatePrice(-10)).toBe(false);
    });
    it('rejects NaN', () => {
      expect(validatePrice(NaN)).toBe(false);
    });
    it('rejects Infinity', () => {
      expect(validatePrice(Infinity)).toBe(false);
    });
  });

  describe('validateQuantity', () => {
    it('accepts a positive integer quantity', () => {
      expect(validateQuantity(10)).toBe(true);
    });
    it('rejects zero', () => {
      expect(validateQuantity(0)).toBe(false);
    });
    it('rejects negative quantity', () => {
      expect(validateQuantity(-5)).toBe(false);
    });
    it('rejects non-integer quantity', () => {
      expect(validateQuantity(10.5)).toBe(false);
    });
  });

  describe('validateStopLossDirection', () => {
    it('accepts stop-loss below entry for BUY', () => {
      expect(validateStopLossDirection(2950.45, 2900, 'BUY').valid).toBe(true);
    });
    it('rejects stop-loss above entry for BUY', () => {
      const result = validateStopLossDirection(2950.45, 3000, 'BUY');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('lower than');
    });
    it('accepts stop-loss above entry for SELL', () => {
      expect(validateStopLossDirection(2950.45, 3000, 'SELL').valid).toBe(true);
    });
    it('rejects stop-loss below entry for SELL', () => {
      const result = validateStopLossDirection(2950.45, 2900, 'SELL');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('higher than');
    });
    it('rejects stop-loss equal to entry for BUY', () => {
      const result = validateStopLossDirection(2950.45, 2950.45, 'BUY');
      expect(result.valid).toBe(false);
    });
    it('rejects stop-loss equal to entry for SELL', () => {
      const result = validateStopLossDirection(2950.45, 2950.45, 'SELL');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateTargetDirection', () => {
    it('accepts target above entry for BUY', () => {
      expect(validateTargetDirection(2950.45, 3000, 'BUY').valid).toBe(true);
    });
    it('rejects target below entry for BUY', () => {
      const result = validateTargetDirection(2950.45, 2900, 'BUY');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('higher than');
    });
    it('accepts target below entry for SELL', () => {
      expect(validateTargetDirection(2950.45, 2900, 'SELL').valid).toBe(true);
    });
    it('rejects target above entry for SELL', () => {
      const result = validateTargetDirection(2950.45, 3000, 'SELL');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('lower than');
    });
  });

  describe('validateBuyingPower', () => {
    it('accepts when cash covers required amount', () => {
      expect(validateBuyingPower(10, 100, 2000).valid).toBe(true);
    });
    it('rejects when cash is insufficient', () => {
      const result = validateBuyingPower(10, 100, 500);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient buying power');
    });
    it('rejects when cash is exactly zero for positive order', () => {
      const result = validateBuyingPower(1, 100, 0);
      expect(result.valid).toBe(false);
    });
  });

  describe('computeRiskPerShare', () => {
    it('computes positive risk for BUY with stop below entry', () => {
      expect(computeRiskPerShare(2950.45, 2900, 'BUY')).toBe(50.45);
    });
    it('returns 0 for BUY when stop is not below entry', () => {
      expect(computeRiskPerShare(2950.45, 3000, 'BUY')).toBe(0);
    });
    it('computes positive risk for SELL with stop above entry', () => {
      expect(computeRiskPerShare(2950.45, 3000, 'SELL')).toBe(49.55);
    });
    it('returns 0 for SELL when stop is not above entry', () => {
      expect(computeRiskPerShare(2950.45, 2900, 'SELL')).toBe(0);
    });
  });

  describe('computeRewardPerShare', () => {
    it('computes positive reward for BUY with target above entry', () => {
      expect(computeRewardPerShare(2950.45, 3000, 'BUY')).toBe(49.55);
    });
    it('returns 0 for BUY when target is not above entry', () => {
      expect(computeRewardPerShare(2950.45, 2900, 'BUY')).toBe(0);
    });
    it('computes positive reward for SELL with target below entry', () => {
      expect(computeRewardPerShare(2950.45, 2900, 'SELL')).toBe(50.45);
    });
    it('returns 0 for SELL when target is not below entry', () => {
      expect(computeRewardPerShare(2950.45, 3000, 'SELL')).toBe(0);
    });
    it('returns 0 when target is undefined', () => {
      expect(computeRewardPerShare(2950.45, undefined, 'BUY')).toBe(0);
    });
  });

  describe('computeRiskRewardRatio', () => {
    it('computes positive ratio when risk and reward are positive', () => {
      expect(computeRiskRewardRatio(50, 100)).toBe(2);
    });
    it('returns 0 when risk is 0', () => {
      expect(computeRiskRewardRatio(0, 100)).toBe(0);
    });
    it('returns 0 when reward is 0', () => {
      expect(computeRiskRewardRatio(50, 0)).toBe(0);
    });
  });

  // ── Orchestration tests ──

  describe('validateOrderRisk — Valid BUY order', () => {
    it('returns valid with no errors for a valid BUY order', () => {
      const result = validateOrderRisk(defaultParams);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid BUY summary with risk metrics', () => {
      const result = validateOrderRisk(defaultParams);
      const { riskSummary } = result;
      expect(riskSummary.direction).toBe('BUY');
      expect(riskSummary.symbol).toBe('RELIANCE');
      expect(riskSummary.quantity).toBe(10);
      expect(riskSummary.entryPrice).toBe(2950.45);
      expect(riskSummary.positionValue).toBeGreaterThan(0);
      expect(riskSummary.availableCash).toBe(1000000);
      expect(riskSummary.estimatedRemainingBuyingPower).toBe(
        1000000 - riskSummary.positionValue
      );
      expect(riskSummary.maxLossAtStopLoss).toBe(0); // no stop-loss supplied
    });

    it('computes max loss at stop-loss when supplied', () => {
      const result = validateOrderRisk({ ...defaultParams, stopLossPrice: 2900 });
      const { riskSummary } = result;
      expect(riskSummary.maxLossAtStopLoss).toBeGreaterThan(0);
    });

    it('computes reward-to-risk ratio when target supplied', () => {
      const result = validateOrderRisk({
        ...defaultParams,
        stopLossPrice: 2900,
        targetPrice: 3050,
      });
      const { riskSummary } = result;
      expect(riskSummary.rewardToRiskRatio).toBeDefined();
      expect(riskSummary.rewardToRiskRatio!).toBeGreaterThan(0);
    });
  });

  describe('validateOrderRisk — Valid SELL order', () => {
    it('returns valid with no errors for a valid SELL order', () => {
      const result = validateOrderRisk({ ...defaultParams, side: 'SELL' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('does not require buying power for SELL', () => {
      // Even with zero cash, SELL should pass buying power check
      const result = validateOrderRisk({
        ...defaultParams,
        side: 'SELL',
        cashBalance: 0,
        holdings: [{ symbol: 'RELIANCE', quantity: 100, averageBuyPrice: 2900 }],
      });
      const buyPowerErrors = result.errors.filter(e => e.includes('buying power'));
      expect(buyPowerErrors).toHaveLength(0);
    });

    it('computes estimated remaining buying power including sale proceeds', () => {
      const result = validateOrderRisk({
        ...defaultParams,
        side: 'SELL',
      });
      const { riskSummary } = result;
      expect(riskSummary.estimatedRemainingBuyingPower).toBeGreaterThan(
        defaultParams.cashBalance
      );
    });
  });

  describe('validateOrderRisk — Invalid quantity', () => {
    it('rejects zero quantity', () => {
      const result = validateOrderRisk({ ...defaultParams, quantity: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Quantity must be a positive whole number.');
    });

    it('rejects negative quantity', () => {
      const result = validateOrderRisk({ ...defaultParams, quantity: -5 });
      expect(result.valid).toBe(false);
    });

    it('rejects non-integer quantity', () => {
      const result = validateOrderRisk({ ...defaultParams, quantity: 10.5 });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateOrderRisk — Invalid price', () => {
    it('rejects zero entry price', () => {
      const result = validateOrderRisk({ ...defaultParams, entryPrice: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Entry price must be a positive, finite number.');
    });

    it('rejects negative entry price', () => {
      const result = validateOrderRisk({ ...defaultParams, entryPrice: -100 });
      expect(result.valid).toBe(false);
    });

    it('rejects NaN entry price', () => {
      const result = validateOrderRisk({ ...defaultParams, entryPrice: NaN });
      expect(result.valid).toBe(false);
    });

    it('rejects Infinity entry price', () => {
      const result = validateOrderRisk({ ...defaultParams, entryPrice: Infinity });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateOrderRisk — Insufficient buying power', () => {
    it('rejects BUY order when cash is insufficient', () => {
      const result = validateOrderRisk({
        ...defaultParams,
        cashBalance: 1000,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('buying power'))).toBe(true);
    });

    it('accepts BUY order when cash exactly covers order', () => {
      const result = validateOrderRisk({
        ...defaultParams,
        cashBalance: defaultParams.quantity * defaultParams.entryPrice,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('validateOrderRisk — Invalid stop-loss direction', () => {
    it('rejects stop-loss above entry for BUY', () => {
      const result = validateOrderRisk({ ...defaultParams, stopLossPrice: 3000 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('lower than'))).toBe(true);
    });

    it('rejects stop-loss below entry for SELL', () => {
      const result = validateOrderRisk({
        ...defaultParams,
        side: 'SELL',
        stopLossPrice: 2900,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('higher than'))).toBe(true);
    });
  });

  describe('validateOrderRisk — Invalid target direction', () => {
    it('rejects target below entry for BUY', () => {
      const result = validateOrderRisk({ ...defaultParams, targetPrice: 2900 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('higher than'))).toBe(true);
    });

    it('rejects target above entry for SELL', () => {
      const result = validateOrderRisk({
        ...defaultParams,
        side: 'SELL',
        targetPrice: 3000,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('lower than'))).toBe(true);
    });
  });

  describe('validateOrderRisk — Optional stop-loss and target', () => {
    it('is valid without stop-loss', () => {
      const result = validateOrderRisk(defaultParams);
      expect(result.valid).toBe(true);
    });

    it('is valid without target', () => {
      const result = validateOrderRisk({ ...defaultParams, stopLossPrice: 2900 });
      expect(result.valid).toBe(true);
    });

    it('is valid without either stop-loss or target', () => {
      const result = validateOrderRisk(defaultParams);
      expect(result.valid).toBe(true);
      expect(result.riskSummary.stopLossPrice).toBeUndefined();
      expect(result.riskSummary.targetPrice).toBeUndefined();
    });

    it('does not add stop-loss direction error when stop-loss is undefined', () => {
      const result = validateOrderRisk(defaultParams);
      const slErrors = result.errors.filter(e => e.includes('stop-loss'));
      expect(slErrors).toHaveLength(0);
    });
  });

  describe('validateOrderRisk — Risk summary fields', () => {
    it('includes all required risk summary fields', () => {
      const result = validateOrderRisk(defaultParams);
      const rs = result.riskSummary;
      expect(rs.direction).toBeDefined();
      expect(rs.symbol).toBeDefined();
      expect(rs.quantity).toBeDefined();
      expect(rs.entryPrice).toBeDefined();
      expect(rs.positionValue).toBeDefined();
      expect(rs.availableCash).toBeDefined();
      expect(rs.estimatedRemainingBuyingPower).toBeDefined();
      expect(rs.estimatedAllocationPercent).toBeDefined();
    });

    it('distinguishes estimated risk from guaranteed loss (disclaimer-style summary)', () => {
      const result = validateOrderRisk({
        ...defaultParams,
        stopLossPrice: 2900,
        targetPrice: 3050,
      });
      const rs = result.riskSummary;
      // maxLossAtStopLoss is an estimate, not a guarantee
      expect(typeof rs.maxLossAtStopLoss).toBe('number');
      expect(rs.maxLossAtStopLoss).toBeGreaterThanOrEqual(0);
    });
  });
});
