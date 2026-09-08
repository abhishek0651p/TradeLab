import React, { createContext, useContext, useState, useEffect } from 'react';
import { AccountState, PortfolioPosition, StockData } from '../types';
import { INITIAL_ACCOUNT_STATE, MOCK_STOCKS } from '../data/mockData';

interface TradingContextType {
  account: AccountState;
  watchlist: string[];
  positions: PortfolioPosition[];
  stocks: StockData[];
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  resetAccount: () => void;
}

const TradingContext = createContext<TradingContextType | undefined>(undefined);

export const TradingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<AccountState>(() => {
    const saved = localStorage.getItem('tradelab_account');
    return saved ? JSON.parse(saved) : INITIAL_ACCOUNT_STATE;
  });

  const [watchlist, setWatchlist] = useState<string[]>(() => {
    const saved = localStorage.getItem('tradelab_watchlist');
    return saved ? JSON.parse(saved) : [];
  });

  const [positions, setPositions] = useState<PortfolioPosition[]>(() => {
    const saved = localStorage.getItem('tradelab_positions');
    return saved ? JSON.parse(saved) : [];
  });

  // Simulated market data for Day 1
  const [stocks] = useState<StockData[]>(MOCK_STOCKS);

  useEffect(() => {
    localStorage.setItem('tradelab_account', JSON.stringify(account));
  }, [account]);

  useEffect(() => {
    localStorage.setItem('tradelab_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    localStorage.setItem('tradelab_positions', JSON.stringify(positions));
  }, [positions]);

  const addToWatchlist = (symbol: string) => {
    if (!watchlist.includes(symbol)) {
      setWatchlist([...watchlist, symbol]);
    }
  };

  const removeFromWatchlist = (symbol: string) => {
    setWatchlist(watchlist.filter(s => s !== symbol));
  };

  const resetAccount = () => {
    setAccount(INITIAL_ACCOUNT_STATE);
    setWatchlist([]);
    setPositions([]);
  };

  return (
    <TradingContext.Provider value={{
      account,
      watchlist,
      positions,
      stocks,
      addToWatchlist,
      removeFromWatchlist,
      resetAccount
    }}>
      {children}
    </TradingContext.Provider>
  );
};

export const useTrading = () => {
  const context = useContext(TradingContext);
  if (context === undefined) {
    throw new Error('useTrading must be used within a TradingProvider');
  }
  return context;
};
