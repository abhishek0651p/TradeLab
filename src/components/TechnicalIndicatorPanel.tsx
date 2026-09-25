import React, { memo } from 'react';
import { IndicatorValue } from '../analysis/TechnicalIndicators';

interface Props {
  showEMA20: boolean;
  showEMA50: boolean;
  showVolume: boolean;
  showRSI: boolean;
  onToggleEMA20: () => void;
  onToggleEMA50: () => void;
  onToggleVolume: () => void;
  onToggleRSI: () => void;
  ema20Last: IndicatorValue;
  ema50Last: IndicatorValue;
  rsiCurrent: IndicatorValue | null;
  volumeState: 'above_average' | 'below_average' | 'near_average' | 'no_data';
  formatCurrency: (v: number) => string;
}

const IndicatorRow: React.FC<{
  label: string;
  value: string;
  color?: string;
}> = memo(({ label, value, color }) => (
  <div className="d18-indicator-row">
    <span className="d18-indicator-label">{label}</span>
    <span className="d18-indicator-value" style={color ? { color } : undefined}>
      {value}
    </span>
  </div>
));

IndicatorRow.displayName = 'IndicatorRow';

const STATE_LABELS: Record<string, string> = {
  above_average: 'Above average',
  below_average: 'Below average',
  near_average: 'Average',
  no_data: 'No data',
};

const RSI_STATE_LABELS: Record<string, string> = {
  oversold: 'RSI weak',
  neutral: 'RSI neutral',
  overbought: 'RSI elevated',
};

const TechnicalIndicatorPanel: React.FC<Props> = ({
  showEMA20,
  showEMA50,
  showVolume,
  showRSI,
  onToggleEMA20,
  onToggleEMA50,
  onToggleVolume,
  onToggleRSI,
  ema20Last,
  ema50Last,
  rsiCurrent,
  volumeState,
  formatCurrency,
}) => {
  return (
    <div className="card d18-indicator-panel">
      <h3 className="sd-section-title">Technical Indicators</h3>
      <div className="d18-toggle-row">
        <button
          className={`d18-toggle-btn ${showEMA20 ? 'd18-toggle-active' : ''}`}
          onClick={onToggleEMA20}
          type="button"
        >
          EMA 20 {showEMA20 ? '✓' : ''}
        </button>
        <button
          className={`d18-toggle-btn ${showEMA50 ? 'd18-toggle-active' : ''}`}
          onClick={onToggleEMA50}
          type="button"
        >
          EMA 50 {showEMA50 ? '✓' : ''}
        </button>
        <button
          className={`d18-toggle-btn ${showVolume ? 'd18-toggle-active' : ''}`}
          onClick={onToggleVolume}
          type="button"
        >
          Volume {showVolume ? '✓' : ''}
        </button>
        <button
          className={`d18-toggle-btn ${showRSI ? 'd18-toggle-active' : ''}`}
          onClick={onToggleRSI}
          type="button"
        >
          RSI 14 {showRSI ? '✓' : ''}
        </button>
      </div>

      <div className="d18-indicator-values">
        {ema20Last !== null && (
          <IndicatorRow
            label="EMA 20"
            value={formatCurrency(ema20Last)}
            color="#f59e0b"
          />
        )}
        {ema50Last !== null && (
          <IndicatorRow
            label="EMA 50"
            value={formatCurrency(ema50Last)}
            color="#3b82f6"
          />
        )}
        <IndicatorRow
          label="Volume"
          value={STATE_LABELS[volumeState] ?? volumeState}
        />
        {rsiCurrent !== null && (
          <IndicatorRow
            label="RSI (14)"
            value={`${rsiCurrent.toFixed(1)}`}
          />
        )}
        {rsiCurrent !== null && (
          <IndicatorRow
            label="RSI State"
            value={RSI_STATE_LABELS[
              rsiCurrent < 30 ? 'oversold' : rsiCurrent > 70 ? 'overbought' : 'neutral'
            ]}
          />
        )}
      </div>
    </div>
  );
};

TechnicalIndicatorPanel.displayName = 'TechnicalIndicatorPanel';

export default TechnicalIndicatorPanel;
