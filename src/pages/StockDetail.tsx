import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTrading } from '../context/TradingContext';
import { generateChartData } from '../data/mockData';
import { Star, ArrowLeft, Plus, TrendingUp, TrendingDown, BarChart3, Clock, Activity, Building2, Globe, Tag, X } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ChartDataPoint, OrderSide } from '../types';

type Timeframe = '1D' | '1W' | '1M' | '1Y';

interface OrderEntryProps {
  symbol: string;
  companyName: string;
  price: number;
  side: OrderSide;
  cashBalance: number;
  quantityOnHand: number;
  onClose: () => void;
  onExecute: (quantity: number) => void;
}

const OrderEntry: React.FC<OrderEntryProps> = ({ symbol, companyName, price, side, cashBalance, quantityOnHand, onClose, onExecute }) => {
  const [quantity, setQuantity] = useState<string>('');
  const [error, setError] = useState<string>('');

  const quantityNum = Number(quantity);
  const isQuantityValid = quantity.trim() !== '' && Number.isInteger(quantityNum) && quantityNum > 0;
  const estimatedValue = isQuantityValid ? price * quantityNum : 0;

  const handleExecute = () => {
    if (!isQuantityValid) {
      setError('Please enter a positive whole number for quantity.');
      return;
    }

    onExecute(quantityNum);
    onClose();
  };

  const sideLabel = side === 'BUY' ? 'BUY' : 'SELL';
  const sideColor = side === 'BUY' ? 'var(--success)' : 'var(--danger)';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Place {sideLabel} Order</h2>
            <p className="modal-subtitle">{companyName} ({symbol})</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="order-summary">
            <div className="order-summary-row">
              <span>Current Simulated Price</span>
              <strong>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price)}</strong>
            </div>
            {side === 'BUY' ? (
              <div className="order-summary-row">
                <span>Available Cash</span>
                <strong>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(cashBalance)}</strong>
              </div>
            ) : (
              <div className="order-summary-row">
                <span>Shares Owned</span>
                <strong>{quantityOnHand}</strong>
              </div>
            )}
            <div className="order-summary-row">
              <span>Estimated Order Value</span>
              <strong style={{ color: sideColor }}>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(estimatedValue)}</strong>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="order-quantity">Quantity</label>
            <input
              id="order-quantity"
              type="number"
              min="1"
              step="1"
              placeholder="Enter quantity"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleExecute(); }}
            />
            {side === 'SELL' && <div className="field-hint">You own {quantityOnHand} shares of {symbol}</div>}
            {side === 'BUY' && <div className="field-hint">Available cash: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(cashBalance)}</div>}
            {error && <div className="form-error">{error}</div>}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn" style={{ backgroundColor: sideColor, borderColor: sideColor, color: '#fff' }} onClick={handleExecute} disabled={!isQuantityValid}>
            Confirm {sideLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

const StockDetail = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const { stocks, watchlist, addToWatchlist, removeFromWatchlist, executeBuy, executeSell, account, holdings } = useTrading();

  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [orderModal, setOrderModal] = useState<{ side: OrderSide } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const stock = stocks.find(s => s.symbol === symbol);
  const inWatchlist = symbol ? watchlist.includes(symbol) : false;
  const holding = holdings.find(h => h.symbol === symbol);

  useEffect(() => {
    if (symbol) {
      setIsChartLoading(true);
      const timer = setTimeout(() => {
        setChartData(generateChartData(symbol, timeframe));
        setIsChartLoading(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const chartStats = useMemo(() => {
    if (chartData.length === 0) return { min: 0, max: 0, avg: 0, change: 0, changePercent: 0 };
    const prices = chartData.map(d => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const first = prices[0];
    const last = prices[prices.length - 1];
    const change = last - first;
    const changePercent = (change / first) * 100;
    return { min, max, avg, change, changePercent };
  }, [chartData]);

  if (!stock) {
    return (
      <div className="stock-detail-page">
        <button className="btn btn-outline back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="empty-state card">
          <h2>Stock not found</h2>
          <p>The symbol "{symbol}" could not be found in our simulated market.</p>
        </div>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
  };

  const formatVolume = (value: number) => {
    if (value >= 10000000) return (value / 10000000).toFixed(2) + ' Cr';
    if (value >= 100000) return (value / 100000).toFixed(2) + ' L';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
    return value.toString();
  };

  const isPositive = stock.change >= 0;
  const chartIsPositive = chartStats.change >= 0;
  const chartColor = chartIsPositive ? '#10b981' : '#ef4444';

  const timeframeLabels: Record<Timeframe, string> = {
    '1D': 'Today',
    '1W': 'Past Week',
    '1M': 'Past Month',
    '1Y': 'Past Year',
  };

  const handleOrderSubmit = (side: OrderSide, quantity: number) => {
    if (side === 'BUY') {
      const result = executeBuy(symbol!, quantity, stock.price, stock.companyName);
      if (result.success) {
        setToast({ type: 'success', message: 'Buy order for ' + quantity + ' ' + symbol + ' executed successfully at ' + formatCurrency(stock.price) + '.' });
      } else {
        setToast({ type: 'error', message: result.error || 'Order execution failed.' });
      }
    } else {
      const result = executeSell(symbol!, quantity, stock.price, stock.companyName);
      if (result.success) {
        setToast({ type: 'success', message: 'Sell order for ' + quantity + ' ' + symbol + ' executed successfully at ' + formatCurrency(stock.price) + '.' });
      } else {
        setToast({ type: 'error', message: result.error || 'Order execution failed.' });
      }
    }
  };

  return (
    <div className="stock-detail-page">
      {toast && (
        <div className={'toast ' + toast.type}>
          {toast.type === 'success' ? '✓ ' : '✗ '}{toast.message}
        </div>
      )}

      {/* Back Navigation */}
      <button className="btn btn-outline back-btn" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} /> Back
      </button>

      {/* Header Section */}
      <div className="sd-header">
        <div className="sd-header-left">
          <div className="sd-header-top-row">
            <h1 className="sd-company-name">{stock.companyName}</h1>
            <div className="sd-badges">
              <span className="sd-badge sd-badge-exchange">{stock.exchange}</span>
              <span className="sd-badge sd-badge-sector">{stock.sector}</span>
            </div>
          </div>
          <div className="sd-symbol-row">
            <span className="sd-symbol">{stock.symbol}</span>
            <span className="sd-badge sd-badge-simulated">SIMULATED MARKET DATA</span>
          </div>
          <div className="sd-price-row">
            <span className="sd-price">{formatCurrency(stock.price)}</span>
            <span className={`sd-change ${isPositive ? 'sd-positive' : 'sd-negative'}`}>
              {isPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              {isPositive ? '+' : ''}{stock.change.toFixed(2)} ({isPositive ? '+' : ''}{stock.changePercent.toFixed(2)}%)
            </span>
          </div>
        </div>
        <div className="sd-header-right">
          {inWatchlist ? (
            <button className="btn sd-watchlist-btn sd-watchlist-added" onClick={() => removeFromWatchlist(stock.symbol)}>
              <Star size={18} fill="currentColor" /> Added to Watchlist
            </button>
          ) : (
            <button className="btn sd-watchlist-btn" onClick={() => addToWatchlist(stock.symbol)}>
              <Plus size={18} /> Add to Watchlist
            </button>
          )}
        </div>
      </div>

      {/* Chart Card */}
      <div className="card sd-chart-card">
        <div className="sd-chart-header">
          <div>
            <h3 className="sd-chart-title">Price Chart</h3>
            <span className="sd-chart-subtitle">{timeframeLabels[timeframe]}</span>
          </div>
          <div className="sd-chart-change-summary">
            <span className={chartIsPositive ? 'sd-positive' : 'sd-negative'}>
              {chartIsPositive ? '+' : ''}{chartStats.change.toFixed(2)} ({chartIsPositive ? '+' : ''}{chartStats.changePercent.toFixed(2)}%)
            </span>
          </div>
        </div>

        <div className={`sd-chart-area ${isChartLoading ? 'sd-chart-loading' : ''}`}>
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
              <defs>
                <linearGradient id={`gradient-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={chartColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.5} />
              <XAxis
                dataKey="timestamp"
                stroke="var(--text-muted)"
                fontSize={11}
                tickMargin={10}
                minTickGap={40}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <YAxis
                domain={['auto', 'auto']}
                stroke="var(--text-muted)"
                fontSize={11}
                tickFormatter={(val) => `₹${val.toLocaleString('en-IN')}`}
                width={90}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--panel-bg)',
                  borderColor: 'var(--border)',
                  borderRadius: '10px',
                  color: 'var(--text-main)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                  padding: '12px 16px'
                }}
                itemStyle={{ color: chartColor, fontWeight: 600 }}
                formatter={(value: any) => [formatCurrency(Number(value)), 'Price']}
                labelStyle={{ color: 'var(--text-muted)', marginBottom: '6px', fontSize: '0.85rem' }}
              />
              {chartData.length > 0 && (
                <ReferenceLine
                  y={chartData[0].price}
                  stroke="var(--text-muted)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.4}
                />
              )}
              <Area
                type="monotone"
                dataKey="price"
                stroke={chartColor}
                strokeWidth={2.5}
                fill={`url(#gradient-${symbol})`}
                dot={false}
                activeDot={{ r: 5, fill: chartColor, stroke: 'var(--panel-bg)', strokeWidth: 2 }}
                animationDuration={600}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Timeframe Selector */}
        <div className="sd-timeframe-bar">
          {(['1D', '1W', '1M', '1Y'] as Timeframe[]).map(tf => (
            <button
              key={tf}
              className={`sd-tf-btn ${timeframe === tf ? 'sd-tf-active' : ''}`}
              onClick={() => setTimeframe(tf)}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="sd-metrics-grid">
        <div className="card sd-metric-card">
          <div className="sd-metric-icon"><Activity size={16} /></div>
          <div className="sd-metric-label">Current Price</div>
          <div className="sd-metric-value">{formatCurrency(stock.price)}</div>
        </div>
        <div className="card sd-metric-card">
          <div className="sd-metric-icon"><Clock size={16} /></div>
          <div className="sd-metric-label">Previous Close</div>
          <div className="sd-metric-value">{formatCurrency(stock.previousClose)}</div>
        </div>
        <div className="card sd-metric-card">
          <div className="sd-metric-icon"><TrendingUp size={16} /></div>
          <div className="sd-metric-label">Open</div>
          <div className="sd-metric-value">{formatCurrency(stock.open)}</div>
        </div>
        <div className="card sd-metric-card">
          <div className="sd-metric-icon" style={{ color: 'var(--success)' }}><TrendingUp size={16} /></div>
          <div className="sd-metric-label">Day High</div>
          <div className="sd-metric-value sd-positive">{formatCurrency(stock.dayHigh)}</div>
        </div>
        <div className="card sd-metric-card">
          <div className="sd-metric-icon" style={{ color: 'var(--danger)' }}><TrendingDown size={16} /></div>
          <div className="sd-metric-label">Day Low</div>
          <div className="sd-metric-value sd-negative">{formatCurrency(stock.dayLow)}</div>
        </div>
        <div className="card sd-metric-card">
          <div className="sd-metric-icon"><BarChart3 size={16} /></div>
          <div className="sd-metric-label">Volume</div>
          <div className="sd-metric-value">{formatVolume(stock.volume)}</div>
        </div>
      </div>

      {/* Company Information */}
      <div className="card sd-company-card">
        <h3 className="sd-section-title">Company Information</h3>
        <div className="sd-company-details">
          <div className="sd-company-meta">
            <div className="sd-company-meta-item">
              <Building2 size={16} />
              <div>
                <div className="sd-meta-label">Company</div>
                <div className="sd-meta-value">{stock.companyName}</div>
              </div>
            </div>
            <div className="sd-company-meta-item">
              <Tag size={16} />
              <div>
                <div className="sd-meta-label">Symbol</div>
                <div className="sd-meta-value">{stock.symbol}</div>
              </div>
            </div>
            <div className="sd-company-meta-item">
              <Activity size={16} />
              <div>
                <div className="sd-meta-label">Sector</div>
                <div className="sd-meta-value">{stock.sector}</div>
              </div>
            </div>
            <div className="sd-company-meta-item">
              <Globe size={16} />
              <div>
                <div className="sd-meta-label">Exchange</div>
                <div className="sd-meta-value">{stock.exchange}</div>
              </div>
            </div>
          </div>
          <div className="sd-company-about">
            <div className="sd-meta-label" style={{ marginBottom: '8px' }}>About</div>
            <p className="sd-about-text">{stock.description}</p>
          </div>
        </div>
        <div className="sd-disclaimer">
          All market prices and chart data shown on this page are simulated for paper trading purposes. This is not live market data.
        </div>
      </div>

      {/* Trade Area */}
      <div className="card sd-trade-card">
        <h3 className="sd-section-title" style={{ textAlign: 'center' }}>Trade {stock.symbol}</h3>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: '24px', fontSize: '0.9rem' }}>
          Execute market orders instantly at the current simulated price. All trades are simulated.
        </p>
        <div className="sd-trade-buttons">
          <button className="sd-trade-btn sd-trade-buy" onClick={() => setOrderModal({ side: 'BUY' })}>
            <TrendingUp size={18} />
            Buy
          </button>
          <button className="sd-trade-btn sd-trade-sell" onClick={() => setOrderModal({ side: 'SELL' })}>
            <TrendingDown size={18} />
            Sell
          </button>
        </div>
      </div>

      {orderModal && (
        <OrderEntry
          symbol={symbol!}
          companyName={stock.companyName}
          price={stock.price}
          side={orderModal.side}
          cashBalance={account.cashBalance}
          quantityOnHand={holding ? holding.quantity : 0}
          onClose={() => setOrderModal(null)}
          onExecute={(qty) => handleOrderSubmit(orderModal.side, qty)}
        />
      )}
    </div>
  );
};

export default StockDetail;