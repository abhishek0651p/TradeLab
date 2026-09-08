import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { Search, Star, Plus } from 'lucide-react';

const Markets = () => {
  const { stocks, watchlist, addToWatchlist, removeFromWatchlist } = useTrading();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredStocks = stocks.filter(stock => 
    stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || 
    stock.companyName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(value);
  };

  return (
    <div>
      <h1 className="page-title">Markets</h1>
      
      <div className="search-container">
        <Search className="search-icon" size={20} />
        <input 
          type="text" 
          className="search-input" 
          placeholder="Search stocks by symbol or company..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Symbol</th>
              <th>Price</th>
              <th>Change</th>
              <th>Change %</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStocks.map((stock) => (
              <tr key={stock.symbol}>
                <td>{stock.companyName}</td>
                <td style={{ fontWeight: 600 }}>{stock.symbol}</td>
                <td>{formatCurrency(stock.price)}</td>
                <td className={stock.change >= 0 ? 'text-success' : 'text-danger'}>
                  {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}
                </td>
                <td className={stock.changePercent >= 0 ? 'text-success' : 'text-danger'}>
                  {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                </td>
                <td>
                  {watchlist.includes(stock.symbol) ? (
                    <button 
                      className="btn btn-outline" 
                      onClick={() => removeFromWatchlist(stock.symbol)}
                      style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                    >
                      <Star size={16} fill="currentColor" /> Added
                    </button>
                  ) : (
                    <button 
                      className="btn" 
                      onClick={() => addToWatchlist(stock.symbol)}
                      style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                    >
                      <Plus size={16} /> Watchlist
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filteredStocks.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '32px' }}>
                  No stocks found matching "{searchTerm}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Markets;
