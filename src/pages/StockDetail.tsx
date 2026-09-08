import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTrading } from '../context/TradingContext';
import { generateChartData } from '../data/mockData';
import { Star, ArrowLeft, Plus, TrendingUp, TrendingDown, BarChart3, Clock, Activity, Building2, Globe, Tag } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ChartDataPoint } from '../types';

type Timeframe = '1D' | '1W' | '1M' | '1Y';

const StockDetail = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const { stocks, watchlist, addToWatchlist, removeFromWatchlist } = useTrading();
  
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [isChartLoading, setIsChartLoading] = useState(false);

  const stock = stocks.find(s => s.symbol === symbol);
  const inWatchlist = symbol ? watchlist.includes(symbol) : false;

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
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(value);
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

  return (
    <div className="stock-detail-page">
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
                formatter={((value: any) => [formatCurrency(Number(value)), 'Price']) as any}
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

      {/* Trade Area - Coming in Day 3 */}
      <div className="card sd-trade-card">
        <h3 className="sd-section-title" style={{ textAlign: 'center' }}>Trade {stock.symbol}</h3>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: '24px', fontSize: '0.9rem' }}>
          Trading execution is coming in Day 3. For now, you can add this stock to your watchlist and analyze the price chart.
        </p>
        <div className="sd-trade-buttons">
          <button className="sd-trade-btn sd-trade-buy" disabled>
            <TrendingUp size={18} />
            Buy
            <span className="sd-trade-coming">Coming in Day 3</span>
          </button>
          <button className="sd-trade-btn sd-trade-sell" disabled>
            <TrendingDown size={18} />
            Sell
            <span className="sd-trade-coming">Coming in Day 3</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockDetail;
