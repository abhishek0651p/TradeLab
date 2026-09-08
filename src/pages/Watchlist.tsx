import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrading } from '../context/TradingContext';
import { Search, Star, Trash2 } from 'lucide-react';

const Watchlist = () => {
  const { stocks, watchlist, removeFromWatchlist } = useTrading();
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const watchlistStocks = stocks.filter(stock => watchlist.includes(stock.symbol));
  
  const filteredStocks = watchlistStocks.filter(stock => 
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
      <h1 className="page-title">Watchlist</h1>
      
      {watchlist.length > 0 ? (
        <>
          <div className="search-container">
            <Search className="search-icon" size={20} />
            <input 
              type="text" 
              className="search-input" 
              placeholder="Search watchlist..." 
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
                  <tr 
                    key={stock.symbol}
                    onClick={() => navigate(`/stock/${stock.symbol}`)}
                    className="stock-row-clickable"
                  >
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
                      <button 
                        className="btn btn-outline" 
                        onClick={(e) => { e.stopPropagation(); removeFromWatchlist(stock.symbol); }}
                        style={{ padding: '6px 12px', fontSize: '0.85rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      >
                        <Trash2 size={16} /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredStocks.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '32px' }}>
                      No stocks found matching "{searchTerm}" in your watchlist
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="empty-state card">
          <Star size={48} />
          <h3>Your watchlist is empty</h3>
          <p>Go to the Markets page to add stocks to your watchlist.</p>
        </div>
      )}
    </div>
  );
};

export default Watchlist;
