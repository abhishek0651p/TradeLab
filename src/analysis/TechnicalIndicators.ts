/* ── Day 18: Technical Indicators ─────────────────────────────────────────────
Pure, deterministic calculations based on price/volume data.
Never mutates source arrays. All calculations are derived from reads.
──────────────────────────────────────────────────────────────────────────────── */

import { ChartDataPoint } from '../types';

/* ── Helpers ──────────────────────────────────────────────────────────────────── */

/**
 * Ensures a value is a finite number.
 * Returns false for NaN, Infinity, -Infinity, strings, null, undefined.
 */
const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/* ── Price/Volume Extractors ──────────────────────────────────────────────────── */

const toPrices = (data: ChartDataPoint[]): number[] =>
  data.map((d) => d.price);

const toVolumes = (data: ChartDataPoint[]): number[] =>
  data.map((d) => d.volume);

/* ── EMA ─────────────────────────────────────────────────────────────────────────

Standard Wilder EMA:
  - Seed = simple moving average of first `period` prices
  - Multiplier = 2 / (period + 1)
  - EMA[i] = (price[i] - EMA[i-1]) * multiplier + EMA[i-1]
*/

export type IndicatorValue = number | null;

export interface EMAResult {
  period: number;
  values: IndicatorValue[];
}

export const calculateEMA = (
  prices: number[],
  period: number
): EMAResult => {
  const p = Math.floor(period);
  if (!Array.isArray(prices) || p <= 0 || prices.length === 0) {
    return { period: 0, values: [] };
  }
  const result: IndicatorValue[] = new Array(prices.length).fill(null);

  if (prices.length < p) {
    // Insufficient data for EMA seed — all nulls
    return { period: p, values: result };
  }

  // Seed with SMA of first p prices
  let sum = 0;
  for (let i = 0; i < p; i++) sum += prices[i];
  let ema = sum / p;
  result[p - 1] = ema;

  // Wilder smoothing multiplier
  const multiplier = 2 / (p + 1);

  for (let i = p; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
    result[i] = ema;
  }

  return { period: p, values: result };
};

/* ── RSI 14 ────────────────────────────────────────────────────────────────────

Standard Wilder RSI:
  - Compute per-period gains (positive change) and losses (magnitude of negative change)
  - First avg gain/loss = simple average over first `period` changes
  - RS = avgGain / avgLoss
  - RSI = 100 - 100 / (1 + RS)
  - Subsequent: Wilder smoothing: avgGain = (prevAvgGain * (period-1) + gain) / period
*/

export interface RSIResult {
  period: number;
  values: IndicatorValue[];
  current: IndicatorValue | null;
  state: 'oversold' | 'neutral' | 'overbought';
}

export const calculateRSI = (
  prices: number[],
  period: number
): RSIResult => {
  const p = Math.floor(period);
  const empty: RSIResult = { period, values: [], current: null, state: 'neutral' };
  if (!Array.isArray(prices) || p <= 0 || prices.length < 2) {
    return empty;
  }
  const result: IndicatorValue[] = new Array(prices.length).fill(null);

  if (prices.length < p + 1) {
    // Not enough data to compute even first average
    return { period: p, values: result, current: null, state: 'neutral' };
  }

  // Compute per-period gains and losses
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  // First average gain/loss = simple average over first p changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < p; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= p;
  avgLoss /= p;

  // First RSI value (at index p in prices, using changes 0..p-1)
  let rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result[p] = rsi;

  // Wilder smoothing for subsequent values
  for (let i = p; i < gains.length; i++) {
    avgGain = (avgGain * (p - 1) + gains[i]) / p;
    avgLoss = (avgLoss * (p - 1) + losses[i]) / p;
    rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result[i + 1] = rsi;
  }

  // Current (most recent) RSI
  const current = result[result.length - 1] as number | null;
  let state: 'oversold' | 'neutral' | 'overbought' = 'neutral';
  if (current !== null) {
    if (current < 30) state = 'oversold';
    else if (current > 70) state = 'overbought';
    else state = 'neutral';
  }

  return { period: p, values: result, current, state };
};

/* ── Volume Statistics ─────────────────────────────────────────────────────────

Pure volume analysis using existing volume data.
*/

export interface VolumeStats {
  average: number;
  latest: number;
  state: 'above_average' | 'below_average' | 'near_average' | 'no_data';
}

export const calculateVolumeStats = (
  volumes: number[]
): VolumeStats => {
  if (!Array.isArray(volumes) || volumes.length === 0) {
    return { average: 0, latest: 0, state: 'no_data' };
  }
  const clean = volumes.filter(isFiniteNumber);
  if (clean.length === 0) {
    return { average: 0, latest: 0, state: 'no_data' };
  }
  const sum = clean.reduce((acc, val) => acc + val, 0);
  const average = sum / clean.length;
  const latest = clean[clean.length - 1];

  // Use 5% tolerance to avoid flipping state on tiny differences
  if (average > 0) {
    if (latest > average * 1.05) return { average, latest, state: 'above_average' };
    if (latest < average * 0.95) return { average, latest, state: 'below_average' };
  }
  return { average, latest, state: 'near_average' };
};

/* ── Support & Resistance ──────────────────────────────────────────────────────

Deterministic calculation using recent swing highs/lows from historical price data.

Algorithm:
  1. Find swing highs/lows using a sliding window
  2. Cluster nearby levels (within tolerance percent of representative price)
  3. Select most relevant: nearest support (highest level below current price) and nearest resistance (lowest level above current price)
  4. Sort by distance from current price
  5. Return top N levels (configurable)
  6. Distance % computed against current price

Does NOT mutate source price array.
*/

export interface SupportResistanceLevel {
  price: number;
  type: 'support' | 'resistance';
  distance: number;            // absolute price distance from current price
  distancePercent: number;     // percent distance from current price
  touches: number;             // number of swing points in the cluster
}

export interface SupportResistanceResult {
  supports: SupportResistanceLevel[];
  resistances: SupportResistanceLevel[];
  nearestSupport: SupportResistanceLevel | null;
  nearestResistance: SupportResistanceLevel | null;
}

export interface SupportResistanceOptions {
  /** Window size for swing detection (default: 3). Higher = fewer swing points. */
  swingWindow?: number;
  /** Maximum number of levels to return per side (default: 3). */
  maxLevels?: number;
  /** Cluster tolerance as percent of representative price (default: 1.5%). */
  clusterTolerancePercent?: number;
}

export const calculateSupportResistance = (
  prices: number[],
  currentPrice: number,
  options?: SupportResistanceOptions
): SupportResistanceResult => {
  const empty: SupportResistanceResult = {
    supports: [],
    resistances: [],
    nearestSupport: null,
    nearestResistance: null,
  };

  if (
    !Array.isArray(prices) ||
    prices.length < 5 ||
    !isFiniteNumber(currentPrice) ||
    currentPrice <= 0
  ) {
    return empty;
  }

  const swingWindow = options?.swingWindow ?? 3;
  const maxLevels = options?.maxLevels ?? 3;
  const clusterTolerancePercent =
    options?.clusterTolerancePercent ?? 0.015; // 1.5%

  /* ── Detect swing highs and swing lows ─────────────────────────────────
   * A point i is a swing high if prices[i] >= prices[j] for all j in [i-window, i+window]
   * A point i is a swing low  if prices[i] <= prices[j] for all j in [i-window, i+window]
   * We use strict > and < comparisons as-is (no epsilon tolerance in detection).
   * ── */
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = swingWindow; i < prices.length - swingWindow; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - swingWindow; j <= i + swingWindow; j++) {
      if (prices[j] > prices[i]) isHigh = false;
      if (prices[j] < prices[i]) isLow = false;
    }
    if (isHigh) swingHighs.push(prices[i]);
    if (isLow) swingLows.push(prices[i]);
  }

  /* ── Cluster nearby levels ───────────────────────────────────────────────
   * Merge levels that are within clusterTolerancePercent of the cluster's average price.
   * Returns representative (average) price for each cluster.
   * ── */
  const cluster = (levels: number[]): number[] => {
    if (levels.length === 0) return [];
    const sorted = [...levels].sort((a, b) => a - b);
    const clusters: number[][] = [];
    let current: number[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const rep =
        current.reduce((a, b) => a + b, 0) / current.length;
      if (sorted[i] - rep <= Math.abs(rep) * clusterTolerancePercent) {
        current.push(sorted[i]);
      } else {
        clusters.push(current);
        current = [sorted[i]];
      }
    }
    clusters.push(current);
    // Return representative price (average) of each cluster
    return clusters.map(c => c.reduce((a, b) => a + b, 0) / c.length);
  };

  const highClusters = cluster(swingHighs); // resistance candidates
  const lowClusters = cluster(swingLows);   // support candidates

  /* ── Count touches: how many original swing points fall within cluster tolerance of representative price ───── */
  const countTouches = (orig: number[], rep: number): number =>
    orig.filter(
      (p) => Math.abs(p - rep) <= Math.abs(rep) * clusterTolerancePercent
    ).length;

  const toLevel = (
    price: number,
    type: 'support' | 'resistance',
    touches: number
  ): SupportResistanceLevel => ({
    price,
    type,
    distance: Math.abs(price - currentPrice),
    distancePercent: Math.abs((price - currentPrice) / currentPrice) * 100,
    touches,
  });

  /* ── Build support levels: clusters with price < currentPrice ───────────── */
  const supports: SupportResistanceLevel[] = lowClusters
    .filter((p) => p < currentPrice)
    .map((p) => toLevel(p, 'support', countTouches(swingLows, p)))
    .sort((a, b) => b.price - a.price) // nearest (highest below current) first
    .slice(0, maxLevels);

  /* ── Build resistance levels: clusters with price > currentPrice ────────── */
  const resistances: SupportResistanceLevel[] = highClusters
    .filter((p) => p > currentPrice)
    .map((p) => toLevel(p, 'resistance', countTouches(swingHighs, p)))
    .sort((a, b) => a.price - b.price) // nearest (lowest above current) first
    .slice(0, maxLevels);

  return {
    supports,
    resistances,
    nearestSupport: supports[0] ?? null,
    nearestResistance: resistances[0] ?? null,
  };
};

/* ── Technical Condition ───────────────────────────────────────────────────────

Computes a structured technical condition state from price/EMA/RSI/volume data.
Used by the condition panel in StockDetail.

All labels are neutral — no BUY/SELL recommendations.
*/

export type TrendState =
  | 'bullish_momentum'
  | 'bearish_momentum'
  | 'neutral_momentum';

export type RSIMomentum = 'rsi_neutral' | 'rsi_elevated' | 'rsi_weak';

export interface TechnicalCondition {
  trend: TrendState;
  momentum: RSIMomentum;
  volume: 'above_average' | 'below_average' | 'near_average' | 'no_data';
  priceVsEMA20: 'above' | 'below' | 'unknown';
  priceVsEMA50: 'above' | 'below' | 'unknown';
  emaCross: 'bullish' | 'bearish' | 'neutral';
  nearestSupport: number | null;
  nearestResistance: number | null;
}

export const computeTechnicalCondition = (
  ema20Last: number | null,
  ema50Last: number | null,
  price: number,
  rsiResult: { current: number | null; state: 'oversold' | 'neutral' | 'overbought' } | null,
  volumeStats: { state: 'above_average' | 'below_average' | 'near_average' | 'no_data' },
  sr: { nearestSupport: number | null; nearestResistance: number | null }
): TechnicalCondition => {
  // EMA cross: EMA20 vs EMA50
  const emaCross: 'bullish' | 'bearish' | 'neutral' =
    ema20Last !== null && ema50Last !== null
      ? ema20Last > ema50Last
        ? 'bullish'
        : ema20Last < ema50Last
        ? 'bearish'
        : 'neutral'
      : 'neutral';

  // Trend: based on price position relative to EMAs and EMA arrangement
  let trend: TrendState = 'neutral_momentum';
  if (ema20Last !== null && ema50Last !== null) {
    if (price > ema50Last && ema20Last > ema50Last) {
      trend = 'bullish_momentum';
    } else if (price < ema50Last && ema20Last < ema50Last) {
      trend = 'bearish_momentum';
    }
  }

  // RSI momentum
  let momentum: RSIMomentum = 'rsi_neutral';
  if (rsiResult && rsiResult.current !== null) {
    if (rsiResult.state === 'oversold') momentum = 'rsi_weak';
    else if (rsiResult.state === 'overbought') momentum = 'rsi_elevated';
    else momentum = 'rsi_neutral';
  }

  // Price vs EMA20
  const priceVsEMA20: 'above' | 'below' | 'unknown' =
    ema20Last !== null
      ? price > ema20Last
        ? 'above'
        : price < ema20Last
        ? 'below'
        : 'unknown'
      : 'unknown';

  // Price vs EMA50
  const priceVsEMA50: 'above' | 'below' | 'unknown' =
    ema50Last !== null
      ? price > ema50Last
        ? 'above'
        : price < ema50Last
        ? 'below'
        : 'unknown'
      : 'unknown';

  return {
    trend,
    momentum,
    volume: volumeStats.state,
    priceVsEMA20,
    priceVsEMA50,
    emaCross,
    nearestSupport: sr.nearestSupport,
    nearestResistance: sr.nearestResistance,
  };
};