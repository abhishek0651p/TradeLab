import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTrading } from '../context/TradingContext';
import { generateChartData } from '../data/mockData';
import { calculateEMA, calculateRSI, calculateVolumeStats, calculateSupportResistance, computeTechnicalCondition } from '../analysis/TechnicalIndicators';
import { Star, ArrowLeft, TrendingUp, TrendingDown, BarChart3, Clock, Activity, Building2, Globe, Tag, X, AlertTriangle, GitCompare } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Line, Bar } from 'recharts';
import { ChartDataPoint, Holding, OrderSide, OrderType, StockData } from '../types';
import { computePreOrderRiskSnapshot, PreOrderRiskSnapshot } from '../risk/RiskCalculationModel';
import TechnicalIndicatorPanel from '../components/TechnicalIndicatorPanel';
import SupportResistancePanel from '../components/SupportResistancePanel';
import PositionIntelligence from '../components/PositionIntelligence';
import TradePlanningPanel from '../components/TradePlanningPanel';
import StockComparison from '../components/StockComparison';

type Timeframe = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y';

const SUPPORTED_TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '1Y'];

// ──────────────────────────────────────────────
// Order Entry Modal (Day 8 — upgraded with MARKET/LIMIT)
// ──────────────────────────────────────────────

interface OrderEntryProps {
  symbol: string;
  companyName: string;
  price: number;
  side: OrderSide;
  cashBalance: number;
  quantityOnHand: number;
  holdings: Holding[];
  stocks: StockData[];
  onClose: () => void;
  onPlaceOrder: (orderType: OrderType, quantity: number, limitPrice?: number, triggerPrice?: number) => void;
}

const OrderEntry: React.FC<OrderEntryProps> = ({ symbol, companyName, price, side, cashBalance, quantityOnHand, holdings, stocks, onClose, onPlaceOrder }) => {
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [quantity, setQuantity] = useState<string>('');
  const [limitPrice, setLimitPrice] = useState<string>('');
  const [triggerPrice, setTriggerPrice] = useState<string>('');
  const [error, setError] = useState<string>('');

  const quantityNum = Number(quantity);
  const limitPriceNum = Number(limitPrice);
  const triggerPriceNum = Number(triggerPrice);

  const isQuantityValid = quantity.trim() !== '' && Number.isInteger(quantityNum) && quantityNum > 0;
  const isLimitPriceValid = !['LIMIT', 'STOP_LIMIT'].includes(orderType) || (limitPrice.trim() !== '' && limitPriceNum > 0);
  const isTriggerPriceValid = !['STOP_MARKET', 'STOP_LIMIT', 'TARGET'].includes(orderType) || (triggerPrice.trim() !== '' && triggerPriceNum > 0);

  const effectivePrice = orderType === 'MARKET' ? price : (['LIMIT', 'STOP_LIMIT'].includes(orderType) ? limitPriceNum : triggerPriceNum);
  const estimatedValue = isQuantityValid ? effectivePrice * quantityNum : 0;

  const canSubmit = isQuantityValid && isLimitPriceValid && isTriggerPriceValid;

  /* ── Pre-order risk snapshot ── */
  const preOrderRisk: PreOrderRiskSnapshot | null = useMemo(() => {
    if (!isQuantityValid) return null;
    return computePreOrderRiskSnapshot({
      symbol,
      side,
      quantity: quantityNum,
      currentPrice: effectivePrice,
      cashBalance,
      holdings,
      stocks
    });
  }, [symbol, side, quantityNum, effectivePrice, cashBalance, holdings, stocks, isQuantityValid]);

  const hasRiskWarnings = preOrderRisk && preOrderRisk.warnings.length > 0;

  const handleSubmit = () => {
    if (!isQuantityValid) {
      setError('Please enter a positive whole number for quantity.');
      return;
    }
    if (['LIMIT', 'STOP_LIMIT'].includes(orderType) && !isLimitPriceValid) {
      setError('Please enter a valid limit price greater than zero.');
      return;
    }
    if (['STOP_MARKET', 'STOP_LIMIT', 'TARGET'].includes(orderType) && !isTriggerPriceValid) {
      setError('Please enter a valid trigger price greater than zero.');
      return;
    }

    onPlaceOrder(
      orderType,
      quantityNum,
      ['LIMIT', 'STOP_LIMIT'].includes(orderType) ? limitPriceNum : undefined,
      ['STOP_MARKET', 'STOP_LIMIT', 'TARGET'].includes(orderType) ? triggerPriceNum : undefined
    );
    onClose();
  };

  const sideLabel = side === 'BUY' ? 'BUY' : 'SELL';
  const sideColor = side === 'BUY' ? 'var(--success)' : 'var(--danger)';

  const formatCurr = (v: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

  const formatCurrShort = (v: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

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
          {/* Order Type Toggle */}
          <div className="d8-order-type-toggle">
            <button className={`d8-order-type-option ${orderType === 'MARKET' ? 'd8-order-type-active' : ''}`} onClick={() => { setOrderType('MARKET'); setError(''); }}>Market</button>
            <button className={`d8-order-type-option ${orderType === 'LIMIT' ? 'd8-order-type-active' : ''}`} onClick={() => { setOrderType('LIMIT'); setError(''); }}>Limit</button>
            <button className={`d8-order-type-option ${orderType === 'STOP_MARKET' ? 'd8-order-type-active' : ''}`} onClick={() => { setOrderType('STOP_MARKET'); setError(''); }}>SL-M</button>
            <button className={`d8-order-type-option ${orderType === 'STOP_LIMIT' ? 'd8-order-type-active' : ''}`} onClick={() => { setOrderType('STOP_LIMIT'); setError(''); }}>SL-L</button>
            {side === 'SELL' && (
              <button className={`d8-order-type-option ${orderType === 'TARGET' ? 'd8-order-type-active' : ''}`} onClick={() => { setOrderType('TARGET'); setError(''); }}>Target</button>
            )}
          </div>

          {/* Quantity Input */}
          <div className="form-field">
            <label htmlFor="order-quantity">Quantity</label>
            <input
              id="order-quantity"
              type="number"
              min="1"
              step="1"
              placeholder="Enter quantity"
              value={quantity}
              onChange={(e) => { setQuantity(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            />
            {side === 'SELL' && <div className="field-hint">You own {quantityOnHand} shares of {symbol}</div>}
            {side === 'BUY' && <div className="field-hint">Available cash: {formatCurrShort(cashBalance)}</div>}
          </div>

          {/* Trigger Price Input */}
          {['STOP_MARKET', 'STOP_LIMIT', 'TARGET'].includes(orderType) && (
            <div className="form-field">
              <label htmlFor="order-trigger-price">Trigger Price (₹)</label>
              <input
                id="order-trigger-price"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Enter trigger price"
                value={triggerPrice}
                onChange={(e) => { setTriggerPrice(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              />
              <div className="field-hint">
                {orderType === 'TARGET'
                  ? 'Take-profit executes when market price rises to this level'
                  : (side === 'BUY' ? 'Triggers when market price rises above this level' : 'Triggers when market price drops below this level')
                }
              </div>
            </div>
          )}

          {/* Limit Price Input */}
          {['LIMIT', 'STOP_LIMIT'].includes(orderType) && (
            <div className="form-field">
              <label htmlFor="order-limit-price">Limit Price (₹)</label>
              <input
                id="order-limit-price"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Enter limit price"
                value={limitPrice}
                onChange={(e) => { setLimitPrice(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              />
              <div className="field-hint">
                {side === 'BUY'
                  ? 'Order will execute when market price ≤ limit price'
                  : 'Order will execute when market price ≥ limit price'
                }
              </div>
            </div>
          )}

          {error && <div className="form-error">{error}</div>}

          {/* Order Preview */}
          {canSubmit && (
            <div className="order-summary d8-order-preview">
              <div className="d8-preview-title">Order Preview</div>
              <div className="order-summary-row">
                <span>Side</span>
                <strong style={{ color: sideColor }}>{sideLabel}</strong>
              </div>
              <div className="order-summary-row">
                <span>Symbol</span>
                <strong>{symbol}</strong>
              </div>
              <div className="order-summary-row">
                <span>Order Type</span>
                <strong>{orderType}</strong>
              </div>
              <div className="order-summary-row">
                <span>Quantity</span>
                <strong>{quantityNum} shares</strong>
              </div>
              {['LIMIT', 'STOP_LIMIT'].includes(orderType) && (
                <div className="order-summary-row">
                  <span>Limit Price</span>
                  <strong>{formatCurr(limitPriceNum)}</strong>
                </div>
              )}
              {['STOP_MARKET', 'STOP_LIMIT', 'TARGET'].includes(orderType) && (
                <div className="order-summary-row">
                  <span>Trigger Price</span>
                  <strong>{formatCurr(triggerPriceNum)}</strong>
                </div>
              )}
              <div className="order-summary-row">
                <span>Current Market Price</span>
                <strong>{formatCurr(price)}</strong>
              </div>
              <div className="order-summary-row">
                <span>Estimated Value</span>
                <strong style={{ color: sideColor }}>{formatCurrShort(estimatedValue)}</strong>
              </div>

              {/* ── Pre-order Risk Preview ── */}
              {preOrderRisk && (
                <>
                  <div className="order-summary-row">
                    <span>Current Allocation</span>
                    <strong>{preOrderRisk.currentAllocationPercent.toFixed(1)}%</strong>
                  </div>
                  <div className="order-summary-row">
                    <span>Estimated Allocation</span>
                    <strong>{preOrderRisk.estimatedAllocationPercent.toFixed(1)}%</strong>
                  </div>
                  <div className="order-summary-row">
                    <span>Est. Cash Utilization</span>
                    <strong>{preOrderRisk.estimatedCashUtilization.toFixed(1)}%</strong>
                  </div>

                  {hasRiskWarnings && (
                    <div className="sd-risk-warnings-preview">
                      {preOrderRisk.warnings.map((w, i) => (
                        <div key={i} className="sd-risk-warning-item">
                          <AlertTriangle size={14} />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button
            className="btn"
            style={{ backgroundColor: sideColor, borderColor: sideColor, color: '#fff' }}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {orderType === 'MARKET' ? 'Confirm ' + sideLabel : 'Place ' + orderType.replace('_', ' ') + ' ' + sideLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────
// Stock Detail Page
// ──────────────────────────────────────────────

const StockDetail = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const { stocks, watchlist, addToWatchlist, removeFromWatchlist, placeOrder, account, holdings } = useTrading();

  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [orderModal, setOrderModal] = useState<{ side: OrderSide } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [showEMA20, setShowEMA20] = useState(true);
  const [showEMA50, setShowEMA50] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showRSI, setShowRSI] = useState(false);

  const [comparisonOpen, setComparisonOpen] = useState(false);

  const stock = stocks.find(s => s.symbol === symbol);
  const inWatchlist = symbol ? watchlist.includes(symbol) : false;
  const holding = holdings.find(h => h.symbol === symbol);

  const isTimeframeSupported = SUPPORTED_TIMEFRAMES.includes(timeframe);

  useEffect(() => {
    if (symbol) {
      setIsChartLoading(true);
      const timer = setTimeout(() => {
        setChartData(isTimeframeSupported ? generateChartData(symbol, timeframe as '1D' | '1W' | '1M' | '1Y') : []);
        setIsChartLoading(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [symbol, timeframe, isTimeframeSupported]);

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

  const indicators = useMemo(() => {
    if (chartData.length === 0) return null;
    const prices = chartData.map(d => d.price);
    const volumes = chartData.map(d => d.volume);

    const ema20 = calculateEMA(prices, 20);
    const ema50 = calculateEMA(prices, 50);
    const rsi = calculateRSI(prices, 14);
    const volStats = calculateVolumeStats(volumes);

    return { ema20, ema50, rsi, volStats };
  }, [chartData]);

  const ema20Last = indicators?.ema20.values[indicators.ema20.values.length - 1] ?? null;
  const ema50Last = indicators?.ema50.values[indicators.ema50.values.length - 1] ?? null;
  const rsiCurrent = indicators?.rsi.current ?? null;

  const srResult = useMemo(() => {
    if (chartData.length === 0) return { supports: [], resistances: [], nearestSupport: null, nearestResistance: null };
    const prices = chartData.map(d => d.price);
    return calculateSupportResistance(prices, stock?.price ?? 0);
  }, [chartData, stock?.price]);

  const technicalCondition = useMemo(() => {
    return computeTechnicalCondition(
      ema20Last,
      ema50Last,
      stock?.price ?? 0,
      indicators?.rsi
        ? { current: indicators.rsi.current, state: indicators.rsi.state }
        : null,
      indicators?.volStats ?? { state: 'no_data' as const },
      {
        nearestSupport: srResult.nearestSupport?.price ?? null,
        nearestResistance: srResult.nearestResistance?.price ?? null,
      }
    );
  }, [ema20Last, ema50Last, stock?.price, indicators?.rsi, indicators?.volStats, srResult]);

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
    '3M': '3 Months (limited)',
    '6M': '6 Months (limited)',
    '1Y': 'Past Year',
  };

  const handleOrderSubmit = (side: OrderSide, orderType: OrderType, quantity: number, limitPrice?: number, triggerPrice?: number) => {
    const result = placeOrder({
      symbol: symbol!,
      companyName: stock.companyName,
      side,
      orderType,
      quantity,
      limitPrice,
      triggerPrice,
      currentPrice: stock.price
    });

    if (result.success) {
      if (result.execution) {
        setToast({
          type: 'success',
          message: 'Order executed successfully. ID: ' + (result.order?.id ?? '') + ' — Execution Price: ' + formatCurrency(result.execution.executionPrice)
        });
      } else {
        setToast({
          type: 'success',
          message: `${orderType === 'LIMIT' ? 'Limit' : 'Conditional'} order placed. ID: ` + (result.order?.id ?? '') + ' — Status: PENDING'
        });
      }
    } else {
      setToast({ type: 'error', message: result.error ?? 'Order failed.' });
    }
  };

  const extendedChartData = useMemo(() => {
    if (!indicators) return chartData;
    return chartData.map((d, i) => ({
      ...d,
      ema20: indicators.ema20.values[i] ?? null,
      ema50: indicators.ema50.values[i] ?? null,
    }));
  }, [chartData, indicators]);

  const rsiChartData = useMemo(() => {
    if (!indicators) return [];
    return indicators.rsi.values.map((v, i) => ({
      timestamp: chartData[i]?.timestamp ?? '',
      rsi: v,
    })).filter(d => d.rsi !== null);
  }, [indicators, chartData]);

  return (
    <div className="stock-detail-page">
      {toast && (
        <div className={'toast ' + toast.type}>
          {toast.type === 'success' ? '✓ ' : '✗ '}{toast.message}
        </div>
      )}

      <button className="btn btn-outline back-btn" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} /> Back
      </button>

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
          <button className="btn btn-outline d18-compare-btn" onClick={() => setComparisonOpen(true)} aria-label="Compare stocks">
            <GitCompare size={16} /> Compare
          </button>
          {inWatchlist ? (
            <button className="btn sd-watchlist-btn sd-watchlist-added" onClick={() => removeFromWatchlist(stock.symbol)}>
              <Star size={18} fill="currentColor" /> Added to Watchlist
            </button>
          ) : (
            <button className="btn sd-watchlist-btn" onClick={() => addToWatchlist(stock.symbol)}>
              <Star size={18} /> Add to Watchlist
            </button>
          )}
        </div>
      </div>

      <div className="d18-main-grid">

        <div className="d18-chart-col">

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

            {!isTimeframeSupported ? (
              <div className="d18-no-data-notice">
                <AlertTriangle size={18} />
                <div>
                  <strong>{timeframe} data not available</strong>
                  <p>Historical data for this timeframe isn't loaded in the simulation yet. Use 1D, 1W, 1M, or 1Y for full analysis.</p>
                </div>
              </div>
            ) : isChartLoading ? (
              <div className="sd-chart-area sd-chart-loading">
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={[]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : chartData.length === 0 ? (
              <div className="d18-no-data-notice">
                <AlertTriangle size={18} />
                <div>
                  <strong>Insufficient data</strong>
                  <p>Not enough price points to compute indicators for this timeframe.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="sd-chart-area">
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={extendedChartData} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
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
                        yAxisId="price"
                      />
                      {showVolume && (
                        <YAxis
                          orientation="right"
                          stroke="var(--text-muted)"
                          fontSize={10}
                          tickFormatter={(val) => formatVolume(val)}
                          width={60}
                          axisLine={false}
                          tickLine={false}
                          yAxisId="volume"
                        />
                      )}
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
                        formatter={(value: any, name?: string | number) => {
                          const label = name ?? 'Value';
                          const labelString = String(label);
                          if (labelString === 'Price') return [formatCurrency(Number(value)), 'Price'];
                          if (labelString === 'EMA 20') return [formatCurrency(Number(value)), 'EMA 20'];
                          if (labelString === 'EMA 50') return [formatCurrency(Number(value)), 'EMA 50'];
                          if (labelString === 'Volume') return [formatVolume(Number(value)), 'Volume'];
                          return [value, labelString];
                        }}
                        labelStyle={{ color: 'var(--text-muted)', marginBottom: '6px', fontSize: '0.85rem' }}
                      />
                      {chartData.length > 0 && (
                        <ReferenceLine
                          y={chartData[0].price}
                          stroke="var(--text-muted)"
                          strokeDasharray="4 4"
                          strokeOpacity={0.4}
                          yAxisId="price"
                        />
                      )}
                      {showVolume && (
                        <Bar
                          yAxisId="volume"
                          dataKey="volume"
                          fill="var(--text-muted)"
                          opacity={0.15}
                          barSize={2}
                          animationDuration={600}
                        />
                      )}
                      {showEMA50 && (
                        <Line
                          yAxisId="price"
                          type="monotone"
                          dataKey="ema50"
                          stroke="#3b82f6"
                          strokeWidth={1.5}
                          dot={false}
                          strokeOpacity={0.7}
                          animationDuration={600}
                          connectNulls={false}
                        />
                      )}
                      {showEMA20 && (
                        <Line
                          yAxisId="price"
                          type="monotone"
                          dataKey="ema20"
                          stroke="#f59e0b"
                          strokeWidth={1.5}
                          dot={false}
                          strokeOpacity={0.7}
                          animationDuration={600}
                          connectNulls={false}
                        />
                      )}
                      <Area
                        yAxisId="price"
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

                {showRSI && rsiChartData.length > 0 && (
                  <div className="d18-rsi-panel">
                    <div className="d18-rsi-title">RSI (14)</div>
                    <ResponsiveContainer width="100%" height={100}>
                      <AreaChart data={rsiChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.5} />
                        <XAxis dataKey="timestamp" stroke="var(--text-muted)" fontSize={9} tickMargin={5} minTickGap={40} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} stroke="var(--text-muted)" fontSize={9} width={35} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--panel-bg)',
                            borderColor: 'var(--border)',
                            borderRadius: '8px',
                            color: 'var(--text-main)',
                            fontSize: '0.8rem',
                          }}
                          formatter={(value: any) => [Number(value).toFixed(1), 'RSI']}
                        />
                        <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.5} />
                        <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.5} />
                        <Area type="monotone" dataKey="rsi" stroke="#8b5cf6" strokeWidth={1.5} fill="#8b5cf6" fillOpacity={0.1} dot={false} animationDuration={600} />
                      </AreaChart>
                    </ResponsiveContainer>
                    <div className="d18-rsi-zones">
                      <span className="d18-rsi-zone d18-rsi-oversold">0–30 Oversold</span>
                      <span className="d18-rsi-zone d18-rsi-neutral">30–70 Neutral</span>
                      <span className="d18-rsi-zone d18-rsi-overbought">70–100 Overbought</span>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="sd-timeframe-bar">
              {(['1D', '1W', '1M', '3M', '6M', '1Y'] as Timeframe[]).map(tf => {
                const supported = SUPPORTED_TIMEFRAMES.includes(tf);
                return (
                  <button
                    key={tf}
                    className={`sd-tf-btn ${timeframe === tf ? 'sd-tf-active' : ''} ${!supported ? 'sd-tf-unsupported' : ''}`}
                    onClick={() => supported && setTimeframe(tf)}
                    disabled={!supported}
                    title={!supported ? `${tf} data not available in simulation` : timeframeLabels[tf]}
                  >
                    {tf}
                  </button>
                );
              })}
            </div>
          </div>

          <TechnicalIndicatorPanel
            showEMA20={showEMA20}
            showEMA50={showEMA50}
            showVolume={showVolume}
            showRSI={showRSI}
            onToggleEMA20={() => setShowEMA20(v => !v)}
            onToggleEMA50={() => setShowEMA50(v => !v)}
            onToggleVolume={() => setShowVolume(v => !v)}
            onToggleRSI={() => setShowRSI(v => !v)}
            ema20Last={ema20Last}
            ema50Last={ema50Last}
            rsiCurrent={rsiCurrent}
            volumeState={indicators?.volStats.state ?? 'no_data'}
            formatCurrency={formatCurrency}
          />
        </div>

        <div className="d18-analysis-col">

          <div className="card d18-condition-panel">
            <h3 className="sd-section-title">Technical Condition</h3>
            <div className="d18-condition-grid">
              <div className="d18-condition-row">
                <span className="d18-pos-label">Trend</span>
                <span className={`d18-badge d18-badge-${technicalCondition.trend === 'bullish_momentum' ? 'success' : technicalCondition.trend === 'bearish_momentum' ? 'danger' : 'neutral'}`}>
                  {technicalCondition.trend.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="d18-condition-row">
                <span className="d18-pos-label">Momentum</span>
                <span className={`d18-badge d18-badge-${technicalCondition.momentum === 'rsi_elevated' ? 'danger' : technicalCondition.momentum === 'rsi_weak' ? 'warning' : 'neutral'}`}>
                  {technicalCondition.momentum.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="d18-condition-row">
                <span className="d18-pos-label">Volume</span>
                <span className={`d18-badge d18-badge-${technicalCondition.volume === 'above_average' ? 'success' : technicalCondition.volume === 'below_average' ? 'danger' : 'neutral'}`}>
                  {technicalCondition.volume.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="d18-condition-row">
                <span className="d18-pos-label">Price vs EMA20</span>
                <span className={`d18-badge d18-badge-${technicalCondition.priceVsEMA20 === 'above' ? 'success' : technicalCondition.priceVsEMA20 === 'below' ? 'danger' : 'neutral'}`}>
                  {technicalCondition.priceVsEMA20 === 'unknown' ? 'Unknown' : technicalCondition.priceVsEMA20}
                </span>
              </div>
              <div className="d18-condition-row">
                <span className="d18-pos-label">Price vs EMA50</span>
                <span className={`d18-badge d18-badge-${technicalCondition.priceVsEMA50 === 'above' ? 'success' : technicalCondition.priceVsEMA50 === 'below' ? 'danger' : 'neutral'}`}>
                  {technicalCondition.priceVsEMA50 === 'unknown' ? 'Unknown' : technicalCondition.priceVsEMA50}
                </span>
              </div>
              <div className="d18-condition-row">
                <span className="d18-pos-label">EMA Cross</span>
                <span className={`d18-badge d18-badge-${technicalCondition.emaCross === 'bullish' ? 'success' : technicalCondition.emaCross === 'bearish' ? 'danger' : 'neutral'}`}>
                  {technicalCondition.emaCross}
                </span>
              </div>
            </div>
          </div>

          <SupportResistancePanel
            sr={srResult}
            formatCurrency={formatCurrency}
          />

          <PositionIntelligence
            symbol={symbol!}
            stock={stock}
            holdings={holdings}
            stocks={stocks}
            formatCurrency={formatCurrency}
          />

          <TradePlanningPanel
            currentPrice={stock.price}
            ema20Current={ema20Last}
            ema50Current={ema50Last}
            nearestSupport={srResult.nearestSupport}
            nearestResistance={srResult.nearestResistance}
            position={holding}
            availableCash={account.cashBalance}
            formatCurrency={formatCurrency}
          />
        </div>
      </div>

      <div className="card sd-trade-card">
        <h3 className="sd-section-title" style={{ textAlign: 'center' }}>Trade {stock.symbol}</h3>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: '24px', fontSize: '0.9rem' }}>
          Place market or limit orders at simulated prices. All trades are virtual.
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
          holdings={holdings}
          stocks={stocks}
          onClose={() => setOrderModal(null)}
          onPlaceOrder={(orderType, qty, lp, tp) => handleOrderSubmit(orderModal.side, orderType, qty, lp, tp)}
        />
      )}

      <StockComparison
        open={comparisonOpen}
        onClose={() => setComparisonOpen(false)}
        currentSymbol={symbol!}
        formatCurrency={formatCurrency}
      />
    </div>
  );
};

export default StockDetail;
