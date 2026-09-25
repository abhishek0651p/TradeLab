import React, { memo } from 'react';
import { Holding, StockData } from '../types';
import { computeMarketValue } from '../risk/RiskCalculationModel';

interface Props {
  symbol: string;
  stock: StockData;
  holdings: Holding[];
  stocks: StockData[];
  formatCurrency: (v: number) => string;
}

const PositionIntelligence: React.FC<Props> = memo(({ symbol, stock, holdings, stocks, formatCurrency }) => {
  const holding = holdings.find((h) => h.symbol === symbol);

  const { currentValue, unrealizedPnL, unrealizedPnLPercent, allocationPercent } = (() => {
    if (!holding) {
      return { currentValue: 0, unrealizedPnL: 0, unrealizedPnLPercent: 0, allocationPercent: 0 };
    }
    const price = stock.price;
    const currentValue = price * holding.quantity;
    const investedValue = holding.averageBuyPrice * holding.quantity;
    const unrealizedPnL = currentValue - investedValue;
    const unrealizedPnLPercent = investedValue > 0 ? (unrealizedPnL / investedValue) * 100 : 0;
    const totalMarketValue = computeMarketValue(holdings, stocks);
    const allocationPercent = totalMarketValue > 0 ? (currentValue / totalMarketValue) * 100 : 0;
    return { currentValue, unrealizedPnL, unrealizedPnLPercent, allocationPercent };
  })();

  if (!holding) {
    return (
      <div className="card d18-position-card">
        <h3 className="sd-section-title">Position Intelligence</h3>
        <div className="d18-no-position">No open position</div>
        <div className="d18-no-position-sub">
          You do not currently hold {symbol}. No position data available.
        </div>
      </div>
    );
  }

  const pnlPositive = unrealizedPnL >= 0;

  return (
    <div className="card d18-position-card">
      <h3 className="sd-section-title">Position Intelligence</h3>
      <div className="d18-position-grid">
        <div className="d18-pos-row">
          <span className="d18-pos-label">Quantity</span>
          <span className="d18-pos-value">{holding.quantity}</span>
        </div>
        <div className="d18-pos-row">
          <span className="d18-pos-label">Avg Buy Price</span>
          <span className="d18-pos-value">{formatCurrency(holding.averageBuyPrice)}</span>
        </div>
        <div className="d18-pos-row">
          <span className="d18-pos-label">Current Price</span>
          <span className="d18-pos-value">{formatCurrency(stock.price)}</span>
        </div>
        <div className="d18-pos-row">
          <span className="d18-pos-label">Current Value</span>
          <span className="d18-pos-value">{formatCurrency(currentValue)}</span>
        </div>
        <div className="d18-pos-row">
          <span className="d18-pos-label">Unrealized P&L</span>
          <span className={`d18-pos-value ${pnlPositive ? 'sd-positive' : 'sd-negative'}`}>
            {pnlPositive ? '+' : ''}{formatCurrency(unrealizedPnL)}
          </span>
        </div>
        <div className="d18-pos-row">
          <span className="d18-pos-label">P&L %</span>
          <span className={`d18-pos-value ${pnlPositive ? 'sd-positive' : 'sd-negative'}`}>
            {pnlPositive ? '+' : ''}{unrealizedPnLPercent.toFixed(2)}%
          </span>
        </div>
        <div className="d18-pos-row">
          <span className="d18-pos-label">Portfolio Allocation</span>
          <span className="d18-pos-value">{allocationPercent.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
});

PositionIntelligence.displayName = 'PositionIntelligence';

export default PositionIntelligence;
