import React, { useMemo, memo } from 'react';
import { X } from 'lucide-react';
import { MOCK_STOCKS } from '../data/mockData';
import { generateChartData } from '../data/mockData';
import { useTrading } from '../context/TradingContext';
import { calculateEMA, calculateRSI, calculateVolumeStats } from '../analysis/TechnicalIndicators';

interface Props {
  open: boolean;
  onClose: () => void;
  currentSymbol: string;
  formatCurrency: (v: number) => string;
}

const MAX_SELECTION = 3;

const StockComparison: React.FC<Props> = memo(({ open, onClose, currentSymbol, formatCurrency }) => {
  const { holdings } = useTrading();
  const [selection, setSelection] = React.useState<string[]>([currentSymbol]);

  // Reset selection to currentSymbol when opened from a new stock
  React.useEffect(() => {
    setSelection([currentSymbol]);
  }, [currentSymbol]);

  const toggleStock = (symbol: string) => {
    setSelection((prev) => {
      if (prev.includes(symbol)) {
        if (prev.length <= 1) return prev; // keep at least current
        return prev.filter((s) => s !== symbol);
      }
      if (prev.length >= MAX_SELECTION) return prev;
      return [...prev, symbol];
    });
  };

  const comparisonData = useMemo(() => {
    return selection.map((sym) => {
      const stock = MOCK_STOCKS.find((s) => s.symbol === sym);
      if (!stock) return null;

      const chartData = generateChartData(sym, '1M');
      const prices = chartData.map((d) => d.price);
      const volumes = chartData.map((d) => d.volume);

      const ema20 = calculateEMA(prices, 20);
      const ema50 = calculateEMA(prices, 50);
      const rsi = calculateRSI(prices, 14);
      const volStats = calculateVolumeStats(volumes);

      const ema20Last = ema20.values[ema20.values.length - 1] as number | null;
      const ema50Last = ema50.values[ema50.values.length - 1] as number | null;

      return {
        stock,
        ema20Last,
        ema50Last,
        rsiCurrent: rsi.current,
        volStats,
      };
    }).filter(Boolean);
  }, [selection]);

  const getEmaLabel = (price: number | null, currentPrice: number) => {
    if (price === null) return '—';
    return price > currentPrice ? 'Above EMA' : 'Below EMA';
  };

  const volStateLabel = (state: string) => {
    const map: Record<string, string> = {
      above_average: 'Above avg',
      below_average: 'Below avg',
      near_average: 'Average',
      no_data: '—',
    };
    return map[state] ?? state;
  };

  if (!open) return null;

  return (
    <div className="d18-comparison-overlay" onClick={onClose}>
      <div className="card d18-comparison-panel" onClick={(e) => e.stopPropagation()}>
        <div className="d18-comparison-header">
          <h3 className="sd-section-title" style={{ marginBottom: 0 }}>Stock Comparison</h3>
          <button className="d18-comparison-close" onClick={onClose} aria-label="Close comparison">
            <X size={18} />
          </button>
        </div>

        <p className="d18-comparison-subtitle">
          Select up to {MAX_SELECTION} stocks (currently selected: {selection.length})
        </p>

        {/* Stock selectors */}
        <div className="d18-comparison-selector-row">
          {MOCK_STOCKS.filter((s) => s.symbol === currentSymbol || !selection.includes(s.symbol)).map((s) => (
            <button
              key={s.symbol}
              className={`d18-comparison-chip ${selection.includes(s.symbol) ? 'd18-chip-active' : ''}`}
              onClick={() => toggleStock(s.symbol)}
              type="button"
            >
              {s.symbol}
            </button>
          ))}
        </div>

        {/* Comparison table */}
        <div className="d18-comparison-table-wrap">
          <table className="d18-comparison-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Price</th>
                <th>Change %</th>
                <th>RSI</th>
                <th>EMA20</th>
                <th>EMA50</th>
                <th>Volume</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map((row) => {
                if (!row) return null;
                const { stock, ema20Last, ema50Last, rsiCurrent, volStats } = row;
                return (
                  <tr key={stock.symbol}>
                    <td className="d18-comp-symbol">{stock.symbol}</td>
                    <td>{formatCurrency(stock.price)}</td>
                    <td className={stock.changePercent >= 0 ? 'sd-positive' : 'sd-negative'}>
                      {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                    </td>
                    <td>{rsiCurrent !== null ? rsiCurrent.toFixed(1) : '—'}</td>
                    <td>{getEmaLabel(ema20Last, stock.price)}</td>
                    <td>{getEmaLabel(ema50Last, stock.price)}</td>
                    <td>{volStateLabel(volStats.state)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

StockComparison.displayName = 'StockComparison';

export default StockComparison;
