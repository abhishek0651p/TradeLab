import React, { memo } from 'react';
import { useTrading } from '../context/TradingContext';
import { Holding, StockData } from '../types';
import { SupportResistanceLevel } from '../analysis/TechnicalIndicators';

interface Props {
  currentPrice: number;
  ema20Current: number | null;
  ema50Current: number | null;
  nearestSupport: SupportResistanceLevel | null;
  nearestResistance: SupportResistanceLevel | null;
  position: Holding | undefined;
  availableCash: number;
  formatCurrency: (v: number) => string;
}

const TradePlanningPanel: React.FC<Props> = memo(({
  currentPrice,
  ema20Current,
  ema50Current,
  nearestSupport,
  nearestResistance,
  position,
  availableCash,
  formatCurrency,
}) => {
  const distToSupport = nearestSupport
    ? Math.abs(currentPrice - nearestSupport.price)
    : null;
  const distToResistance = nearestResistance
    ? Math.abs(currentPrice - nearestResistance.price)
    : null;

  const rows = [
    { label: 'Current Price', value: formatCurrency(currentPrice), color: 'var(--text-main)' },
    { label: 'EMA20', value: ema20Current !== null ? formatCurrency(ema20Current) : '—', color: '#f59e0b' },
    { label: 'EMA50', value: ema50Current !== null ? formatCurrency(ema50Current) : '—', color: '#3b82f6' },
    { label: 'Nearest Support', value: nearestSupport ? formatCurrency(nearestSupport.price) : '—', color: 'var(--success)' },
    { label: 'Nearest Resistance', value: nearestResistance ? formatCurrency(nearestResistance.price) : '—', color: 'var(--danger)' },
    { label: 'Current Position', value: position ? `${position.quantity} shares @ ${formatCurrency(position.averageBuyPrice)}` : 'None', color: position ? 'var(--text-main)' : 'var(--text-muted)' },
    { label: 'Available Cash', value: formatCurrency(availableCash), color: 'var(--primary)' },
    { label: 'Dist. to Support', value: distToSupport !== null ? formatCurrency(distToSupport) : '—', color: 'var(--success)' },
    { label: 'Dist. to Resistance', value: distToResistance !== null ? formatCurrency(distToResistance) : '—', color: 'var(--danger)' },
  ];

  return (
    <div className="card d18-planning-panel">
      <h3 className="sd-section-title">Trade Planning</h3>
      <div className="d18-planning-grid">
        {rows.map((row) => (
          <div key={row.label} className="d18-planning-row">
            <span className="d18-pos-label">{row.label}</span>
            <span className="d18-pos-value" style={{ color: row.color }}>{row.value}</span>
          </div>
        ))}
      </div>
      <div className="d18-planning-note">
        This panel is for informational reference only. It does not place orders or modify any state.
      </div>
    </div>
  );
});

TradePlanningPanel.displayName = 'TradePlanningPanel';

export default TradePlanningPanel;
