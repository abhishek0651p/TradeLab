import React, { memo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { SupportResistanceResult } from '../analysis/TechnicalIndicators';

interface Props {
  sr: SupportResistanceResult;
  formatCurrency: (v: number) => string;
}

const SupportResistancePanel: React.FC<Props> = memo(({ sr, formatCurrency }) => {
  const hasData = sr.supports.length > 0 || sr.resistances.length > 0;

  return (
    <div className="card d18-sr-panel">
      <h3 className="sd-section-title">Support & Resistance</h3>
      {!hasData ? (
        <div className="d18-empty-state">Insufficient data — need at least 5 price points</div>
      ) : (
        <>
          <div className="d18-sr-header-row">
            <span className="d18-sr-header-label">Detected Support</span>
            <span className="d18-sr-header-label">Detected Resistance</span>
          </div>

          {/* Nearest levels */}
          <div className="d18-nearest-row">
            <span className="d18-nearest-label">Nearest Support</span>
            <span className="d18-nearest-value d18-support">
              {sr.nearestSupport
                ? `${formatCurrency(sr.nearestSupport.price)} (${sr.nearestSupport.distancePercent.toFixed(2)}%)`
                : '—'}
            </span>
          </div>
          <div className="d18-nearest-row">
            <span className="d18-nearest-label">Nearest Resistance</span>
            <span className="d18-nearest-value d18-resistance">
              {sr.nearestResistance
                ? `${formatCurrency(sr.nearestResistance.price)} (${sr.nearestResistance.distancePercent.toFixed(2)}%)`
                : '—'}
            </span>
          </div>

          {/* Full level lists */}
          {sr.supports.length > 0 && (
            <div className="d18-level-list">
              <div className="d18-level-list-title">Supports</div>
              {sr.supports.map((s, i) => (
                <div key={`support-${i}`} className="d18-level-item d18-support">
                  <span>{formatCurrency(s.price)}</span>
                  <span>{s.distancePercent.toFixed(2)}% — {s.touches} touch{s.touches !== 1 ? 'es' : ''}</span>
                </div>
              ))}
            </div>
          )}
          {sr.resistances.length > 0 && (
            <div className="d18-level-list">
              <div className="d18-level-list-title">Resistances</div>
              {sr.resistances.map((r, i) => (
                <div key={`resistance-${i}`} className="d18-level-item d18-resistance">
                  <span>{formatCurrency(r.price)}</span>
                  <span>{r.distancePercent.toFixed(2)}% — {r.touches} touch{r.touches !== 1 ? 'es' : ''}</span>
                </div>
              ))}
            </div>
          )}

          <div className="d18-sr-disclaimer">
            <AlertTriangle size={13} /> Detected levels are based on historical swing points and are not guarantees of future price action.
          </div>
        </>
      )}
    </div>
  );
});

SupportResistancePanel.displayName = 'SupportResistancePanel';

export default SupportResistancePanel;
