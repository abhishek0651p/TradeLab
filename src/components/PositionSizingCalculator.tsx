import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrading } from '../context/TradingContext';
import {
  computePositionSizing,
  PositionDirection,
  PositionSizingInputs
} from '../risk/PositionSizingModel';
import { computePortfolioValue } from '../risk/RiskCalculationModel';
import { validateOrderRisk } from '../risk/PreTradeRiskValidator';
import {
  Calculator,
  Shield,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  DollarSign,
  Percent,
  Layers,
  ArrowRight,
  Info,
  Send
} from 'lucide-react';

/* ── Currency and Percent formatters ─────────────────────────────────────────── */

const formatINR = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(value);

const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-IN').format(value);

export const PositionSizingCalculator: React.FC = () => {
  const { account, holdings, stocks, setPlannedOrder } = useTrading();
  const navigate = useNavigate();

  // Read current portfolio equity
  const totalEquity = useMemo(() => {
    const computed = computePortfolioValue(account.cashBalance, holdings, stocks);
    return computed > 0 ? computed : account.cashBalance;
  }, [account.cashBalance, holdings, stocks]);

  // Form state
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [direction, setDirection] = useState<PositionDirection>('BUY');
  const [riskPercent, setRiskPercent] = useState<number>(2.0);
  const [entryPrice, setEntryPrice] = useState<string>('');
  const [stopLossPrice, setStopLossPrice] = useState<string>('');
  const [targetPrice, setTargetPrice] = useState<string>('');

  // Handle symbol selection and autofill entry price with current stock price
  const handleSymbolChange = (sym: string) => {
    setSelectedSymbol(sym);
    if (!sym) return;
    const stock = stocks.find((s) => s.symbol === sym);
    if (stock) {
      setEntryPrice(stock.price.toString());
      // Set default reasonable SL and Target for preview if empty
      const defaultSL = direction === 'BUY'
        ? Number((stock.price * 0.96).toFixed(2))
        : Number((stock.price * 1.04).toFixed(2));
      const defaultTarget = direction === 'BUY'
        ? Number((stock.price * 1.08).toFixed(2))
        : Number((stock.price * 0.92).toFixed(2));

      setStopLossPrice(defaultSL.toString());
      setTargetPrice(defaultTarget.toString());
    }
  };

  // Reset to default clean state
  const handleReset = () => {
    setSelectedSymbol('');
    setDirection('BUY');
    setRiskPercent(2.0);
    setEntryPrice('');
    setStopLossPrice('');
    setTargetPrice('');
  };

  // Parse numeric values
  const numEntry = parseFloat(entryPrice) || 0;
  const numStopLoss = parseFloat(stopLossPrice) || 0;
  const numTarget = targetPrice ? parseFloat(targetPrice) : undefined;

  // Compute position sizing using pure model
  const inputs: PositionSizingInputs = useMemo(() => ({
    equity: totalEquity,
    riskPercent,
    entryPrice: numEntry,
    stopLossPrice: numStopLoss,
    targetPrice: numTarget,
    direction,
    cashBalance: account.cashBalance
  }), [totalEquity, riskPercent, numEntry, numStopLoss, numTarget, direction, account.cashBalance]);

  const calculation = useMemo(() => computePositionSizing(inputs), [inputs]);

  // Quick risk percent presets
  const presets = [0.5, 1.0, 1.5, 2.0, 3.0];

  // Day 27: Pre-trade risk validation on the calculator's own inputs.
  // Pure — does not place any order. Only produces a validation result for display
  // and a planned-order draft for transfer to the order form.
  const riskValidation = useMemo(() => {
    if (!selectedSymbol || numEntry <= 0) return null;
    return validateOrderRisk({
      symbol: selectedSymbol,
      side: direction,
      quantity: calculation.isValid ? calculation.recommendedQuantity : 0,
      entryPrice: numEntry,
      stopLossPrice: numStopLoss > 0 ? numStopLoss : undefined,
      targetPrice: numTarget && numTarget > 0 ? numTarget : undefined,
      cashBalance: account.cashBalance,
      holdings,
      stocks
    });
  }, [selectedSymbol, direction, numEntry, numStopLoss, numTarget, account.cashBalance, holdings, stocks, calculation.isValid, calculation.recommendedQuantity]);

  // Day 27: Transfer the planned order to the order form for final review.
  // The user still must confirm on the stock detail page before any order is placed.
  const handleTransferToOrder = () => {
    if (!selectedSymbol || !riskValidation?.valid) return;
    const plannedOrder = {
      symbol: selectedSymbol,
      side: direction,
      quantity: calculation.recommendedQuantity,
      entryPrice: numEntry,
      stopLossPrice: numStopLoss > 0 ? numStopLoss : undefined,
      targetPrice: numTarget && numTarget > 0 ? numTarget : undefined,
      source: 'position-sizer' as const,
      createdAt: Date.now()
    };
    setPlannedOrder(plannedOrder);
    // Navigate to the stock detail page where the planned order is pre-filled
    // into the existing OrderEntry for review. No order is executed here.
    navigate(`/stock/${selectedSymbol}`);
  };

  const canTransfer = Boolean(selectedSymbol && riskValidation?.valid && calculation.isValid && calculation.recommendedQuantity > 0);

  // Stop loss distance stats
  const slDistance = useMemo(() => {
    if (numEntry <= 0 || numStopLoss <= 0) return null;
    const diff = Math.abs(numEntry - numStopLoss);
    const pct = (diff / numEntry) * 100;
    return { diff, pct };
  }, [numEntry, numStopLoss]);

  // Target distance stats
  const targetDistance = useMemo(() => {
    if (!numTarget || numTarget <= 0 || numEntry <= 0) return null;
    const diff = Math.abs(numTarget - numEntry);
    const pct = (diff / numEntry) * 100;
    return { diff, pct };
  }, [numEntry, numTarget]);

  return (
    <div className="card position-calc-container" id="position-sizing-calculator">
      {/* ── Header ── */}
      <div className="position-calc-header">
        <div className="position-calc-header-title">
          <div className="position-calc-badge-icon">
            <Calculator size={20} />
          </div>
          <div>
            <h3>Position Sizing & Risk Calculator</h3>
            <p className="text-muted">
              Calculate exact share quantities to preserve capital and enforce a disciplined risk-to-reward ratio.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-secondary position-calc-reset-btn"
          onClick={handleReset}
          title="Reset calculator inputs"
        >
          <RotateCcw size={14} />
          <span>Reset</span>
        </button>
      </div>

      {/* ── Top Account Baseline Row ── */}
      <div className="position-calc-equity-bar">
        <div className="position-calc-equity-item">
          <span className="position-calc-equity-label">Portfolio Total Equity</span>
          <span className="position-calc-equity-val">{formatINR(totalEquity)}</span>
        </div>
        <div className="position-calc-equity-item">
          <span className="position-calc-equity-label">Available Cash Buying Power</span>
          <span className="position-calc-equity-val text-success">{formatINR(account.cashBalance)}</span>
        </div>
        <div className="position-calc-equity-item">
          <span className="position-calc-equity-label">Max Allowed Risk ({riskPercent}%)</span>
          <span className="position-calc-equity-val text-warning">
            {formatINR((totalEquity * riskPercent) / 100)}
          </span>
        </div>
      </div>

      {/* ── Main Inputs & Outputs Grid ── */}
      <div className="position-calc-grid">
        {/* Left Column: Form Controls */}
        <div className="position-calc-form-pane">
          {/* Direction toggle */}
          <div className="position-calc-form-group">
            <label className="position-calc-label">Order Direction</label>
            <div className="position-calc-direction-toggle">
              <button
                type="button"
                className={`position-calc-dir-btn ${direction === 'BUY' ? 'active-buy' : ''}`}
                onClick={() => setDirection('BUY')}
              >
                <TrendingUp size={16} />
                <span>BUY (Long)</span>
              </button>
              <button
                type="button"
                className={`position-calc-dir-btn ${direction === 'SELL' ? 'active-sell' : ''}`}
                onClick={() => setDirection('SELL')}
              >
                <TrendingDown size={16} />
                <span>SELL (Short)</span>
              </button>
            </div>
          </div>

          {/* Quick Symbol Picker */}
          <div className="position-calc-form-group">
            <label className="position-calc-label">Select Stock Symbol (Optional Autofill)</label>
            <select
              className="position-calc-select"
              value={selectedSymbol}
              onChange={(e) => handleSymbolChange(e.target.value)}
            >
              <option value="">-- Choose symbol from watchlist / market --</option>
              {stocks.map((stock) => (
                <option key={stock.symbol} value={stock.symbol}>
                  {stock.symbol} — {stock.companyName} ({formatINR(stock.price)})
                </option>
              ))}
            </select>
          </div>

          {/* Risk Percentage Slider + Presets */}
          <div className="position-calc-form-group">
            <div className="position-calc-label-row">
              <label className="position-calc-label">
                Risk Per Trade: <strong>{riskPercent.toFixed(1)}%</strong>
              </label>
              <span className="position-calc-risk-amount">
                {formatINR((totalEquity * riskPercent) / 100)}
              </span>
            </div>
            <input
              type="range"
              min="0.25"
              max="5.0"
              step="0.25"
              value={riskPercent}
              onChange={(e) => setRiskPercent(parseFloat(e.target.value))}
              className="position-calc-range"
            />
            <div className="position-calc-presets">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`position-calc-preset-chip ${riskPercent === p ? 'active' : ''}`}
                  onClick={() => setRiskPercent(p)}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>

          {/* Price Inputs */}
          <div className="position-calc-price-inputs">
            {/* Entry Price */}
            <div className="position-calc-form-group">
              <label className="position-calc-label">Entry Price (₹)</label>
              <div className="position-calc-input-wrap">
                <span className="position-calc-currency-prefix">₹</span>
                <input
                  type="number"
                  placeholder="0.00"
                  step="0.05"
                  min="0"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  className="position-calc-input"
                />
              </div>
            </div>

            {/* Stop Loss Price */}
            <div className="position-calc-form-group">
              <div className="position-calc-label-row">
                <label className="position-calc-label">Stop-Loss Price (₹)</label>
                {slDistance && (
                  <span className="position-calc-distance-tag distance-sl">
                    {slDistance.pct.toFixed(1)}% ({formatINR(slDistance.diff)})
                  </span>
                )}
              </div>
              <div className="position-calc-input-wrap">
                <span className="position-calc-currency-prefix">₹</span>
                <input
                  type="number"
                  placeholder={direction === 'BUY' ? 'Below entry' : 'Above entry'}
                  step="0.05"
                  min="0"
                  value={stopLossPrice}
                  onChange={(e) => setStopLossPrice(e.target.value)}
                  className="position-calc-input"
                />
              </div>
            </div>

            {/* Target Price */}
            <div className="position-calc-form-group">
              <div className="position-calc-label-row">
                <label className="position-calc-label">Target Price (₹, optional)</label>
                {targetDistance && (
                  <span className="position-calc-distance-tag distance-target">
                    +{targetDistance.pct.toFixed(1)}% ({formatINR(targetDistance.diff)})
                  </span>
                )}
              </div>
              <div className="position-calc-input-wrap">
                <span className="position-calc-currency-prefix">₹</span>
                <input
                  type="number"
                  placeholder={direction === 'BUY' ? 'Above entry' : 'Below entry'}
                  step="0.05"
                  min="0"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  className="position-calc-input"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Calculated Results */}
        <div className="position-calc-results-pane">
          {calculation.isValid && numEntry > 0 && numStopLoss > 0 ? (
            <>
              {/* Highlight Output: Recommended Quantity */}
              <div className="position-calc-highlight-card">
                <div className="position-calc-highlight-content">
                  <div className="position-calc-highlight-label">Recommended Position Size</div>
                  <div className="position-calc-highlight-value">
                    {formatNumber(calculation.recommendedQuantity)}
                    <span className="position-calc-highlight-unit">shares</span>
                  </div>
                  <div className="position-calc-highlight-sub">
                    Capital at risk: <strong>{formatINR(calculation.potentialLoss)}</strong> ({riskPercent}% of equity)
                  </div>
                </div>
                <div className="position-calc-highlight-badge">
                  {calculation.exceedsCash ? (
                    <span className="status-badge status-warning">
                      Capped by Cash ({formatNumber(calculation.maxAffordableQuantity)} affordable)
                    </span>
                  ) : (
                    <span className="status-badge status-success">
                      <CheckCircle2 size={12} /> Within Risk Limit
                    </span>
                  )}
                </div>
              </div>

              {/* Key Metrics Grid */}
              <div className="position-calc-metrics-grid">
                <div className="position-calc-metric-box">
                  <span className="position-calc-metric-label">Total Position Value</span>
                  <span className="position-calc-metric-val">{formatINR(calculation.totalPositionValue)}</span>
                  <span className="position-calc-metric-sub">
                    {calculation.positionPercentOfEquity}% of account equity
                  </span>
                </div>

                <div className="position-calc-metric-box">
                  <span className="position-calc-metric-label">Risk Per Share</span>
                  <span className="position-calc-metric-val text-danger">
                    -{formatINR(calculation.riskPerShare)}
                  </span>
                  <span className="position-calc-metric-sub">
                    Distance to stop-loss
                  </span>
                </div>

                <div className="position-calc-metric-box">
                  <span className="position-calc-metric-label">Risk-to-Reward Ratio</span>
                  <span
                    className={`position-calc-metric-val ${
                      calculation.riskRewardRatio >= 2
                        ? 'text-success'
                        : calculation.riskRewardRatio >= 1.5
                        ? 'text-warning'
                        : calculation.riskRewardRatio > 0
                        ? 'text-danger'
                        : ''
                    }`}
                  >
                    {calculation.riskRewardRatio > 0 ? `1 : ${calculation.riskRewardRatio}` : 'N/A'}
                  </span>
                  <span className="position-calc-metric-sub">
                    {calculation.riskRewardRatio >= 2
                      ? 'Favorable ratio'
                      : calculation.riskRewardRatio >= 1.5
                      ? 'Acceptable'
                      : calculation.riskRewardRatio > 0
                      ? 'Unfavorable (< 1:1.5)'
                      : 'Target not set'}
                  </span>
                </div>

                <div className="position-calc-metric-box">
                  <span className="position-calc-metric-label">Potential Gain / Loss</span>
                  <div className="position-calc-pnl-pair">
                    <span className="text-success">
                      +{formatINR(calculation.potentialGain)}
                    </span>
                    <span className="text-muted">/</span>
                    <span className="text-danger">
                      -{formatINR(calculation.potentialLoss)}
                    </span>
                  </div>
                  <span className="position-calc-metric-sub">
                    At target / stop-loss
                  </span>
                </div>
              </div>

              {/* Visual Risk vs Reward Bar */}
              {calculation.riskRewardRatio > 0 && (
                <div className="position-calc-ratio-bar-wrap">
                  <div className="position-calc-ratio-labels">
                    <span className="text-danger">Downside Risk: {formatINR(calculation.potentialLoss)}</span>
                    <span className="text-success">Upside Reward: {formatINR(calculation.potentialGain)}</span>
                  </div>
                  <div className="position-calc-ratio-bar">
                    <div
                      className="position-calc-bar-risk"
                      style={{
                        width: `${Math.max(
                          15,
                          Math.min(85, (1 / (1 + calculation.riskRewardRatio)) * 100)
                        )}%`
                      }}
                    >
                      1R
                    </div>
                    <div
                      className="position-calc-bar-reward"
                      style={{
                        width: `${Math.max(
                          15,
                          Math.min(85, (calculation.riskRewardRatio / (1 + calculation.riskRewardRatio)) * 100)
                        )}%`
                      }}
                    >
                      {calculation.riskRewardRatio}R
                    </div>
                  </div>
                </div>
              )}

              {/* Cash Feasibility Check */}
              <div
                className={`position-calc-cash-status ${
                  calculation.exceedsCash ? 'status-alert-warning' : 'status-alert-ok'
                }`}
              >
                {calculation.exceedsCash ? (
                  <>
                    <AlertTriangle size={16} />
                    <div>
                      <strong>Insufficient Cash for Ideal Size:</strong> Position cost of{' '}
                      {formatINR(calculation.totalPositionValue)} exceeds cash balance of{' '}
                      {formatINR(account.cashBalance)}. Max affordable shares with available cash is{' '}
                      <strong>{formatNumber(calculation.maxAffordableQuantity)}</strong>.
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <div>
                      <strong>Buying Power Feasible:</strong> Required cash of{' '}
                      {formatINR(calculation.totalPositionValue)} is fully covered by available cash (
                      {formatINR(account.cashBalance)}).
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="position-calc-empty-placeholder">
              <Shield size={40} className="text-muted" />
              <h4>Enter Trade Parameters</h4>
              <p className="text-muted">
                Specify your entry price and stop-loss price on the left to see calculated position size,
                risk exposure, and risk-reward profile.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Validation Errors & Warnings ── */}
      {calculation.errors.length > 0 && (
        <div className="position-calc-alerts position-calc-errors">
          <div className="position-calc-alert-title">
            <AlertTriangle size={16} />
            <span>Invalid Parameters:</span>
          </div>
          <ul>
            {calculation.errors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {calculation.warnings.length > 0 && (
        <div className="position-calc-alerts position-calc-warnings">
          <div className="position-calc-alert-title">
            <AlertTriangle size={16} />
            <span>Risk Advisory:</span>
          </div>
          <ul>
            {calculation.warnings.map((warn, idx) => (
              <li key={idx}>{warn}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Day 27: Transfer to Order Form ── */}
      {canTransfer && (
        <div className="position-calc-transfer-panel">
          <button
            type="button"
            className="position-calc-transfer-btn"
            onClick={handleTransferToOrder}
          >
            <Send size={14} /> Transfer to Order Form
          </button>
          <p className="text-muted small">
            The calculator's position size and risk parameters will be pre-filled in the order
            preview for your review. No order is placed until you confirm on the stock detail page.
          </p>
        </div>
      )}

      {/* ── Footer Educational Disclaimer ── */}
      <div className="position-calc-footer">
        <Info size={14} />
        <span>
          Simulated risk modeling for educational and capital preservation analysis. Position sizing adheres to fixed fractional risk management principles. This tool does not execute orders directly.
        </span>
      </div>
    </div>
  );
};
