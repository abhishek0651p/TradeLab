import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AccountState, OrderSide, PortfolioPosition, Holding, Trade, StockData } from '../types';
import { INITIAL_ACCOUNT_STATE, MOCK_STOCKS } from '../data/mockData';

interface TradingContextType {
  account: AccountState;
  watchlist: string[];
  positions: PortfolioPosition[];
  holdings: Holding[];
  trades: Trade[];
  stocks: StockData[];
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  executeBuy: (symbol: string, quantity: number, currentPrice: number, companyName: string) => { success: boolean; error?: string };
  executeSell: (symbol: string, quantity: number, currentPrice: number, companyName: string) => { success: boolean; error?: string };
  resetAccount: () => void;
}

const TradingContext = createContext<TradingContextType | undefined>(undefined);

// Helper to compute new holdings after a buy
const computeBuyHoldings = (prevHoldings: Holding[], symbol: string, quantity: number, price: number): Holding[] => {
  const existing = prevHoldings.find(h => h.symbol === symbol);
  if (existing) {
    const newQty = existing.quantity + quantity;
    const newAvg = ((existing.averageBuyPrice * existing.quantity) + (price * quantity)) / newQty;
    return prevHoldings.map(h => h.symbol === symbol ? { ...h, quantity: newQty, averageBuyPrice: Number(newAvg.toFixed(2)) } : h);
  }
  return [...prevHoldings, { symbol, quantity, averageBuyPrice: Number(price.toFixed(2)) }];
};

// Helper to compute new holdings after a sell
const computeSellHoldings = (prevHoldings: Holding[], symbol: string, quantity: number): Holding[] => {
  const existing = prevHoldings.find(h => h.symbol === symbol);
  if (!existing) return prevHoldings;
  const newQty = existing.quantity - quantity;
  if (newQty <= 0) return prevHoldings.filter(h => h.symbol !== symbol);
  return prevHoldings.map(h => h.symbol === symbol ? { ...h, quantity: newQty } : h);
};

// Helper to compute new positions after a buy
const computeBuyPositions = (prevPositions: PortfolioPosition[], symbol: string, quantity: number, price: number): PortfolioPosition[] => {
  const existing = prevPositions.find(p => p.symbol === symbol);
  if (existing) {
    const newQty = existing.quantity + quantity;
    const newAvg = ((existing.averagePrice * existing.quantity) + (price * quantity)) / newQty;
    return prevPositions.map(p => p.symbol === symbol ? { ...p, quantity: newQty, averagePrice: Number(newAvg.toFixed(2)) } : p);
  }
  return [...prevPositions, { symbol, quantity, averagePrice: Number(price.toFixed(2)) }];
};

// Helper to compute new positions after a sell
const computeSellPositions = (prevPositions: PortfolioPosition[], symbol: string, quantity: number): PortfolioPosition[] => {
  const existing = prevPositions.find(p => p.symbol === symbol);
  if (!existing) return prevPositions;
  const newQty = existing.quantity - quantity;
  if (newQty <= 0) return prevPositions.filter(p => p.symbol !== symbol);
  return prevPositions.map(p => p.symbol === symbol ? { ...p, quantity: newQty } : p);
};

// Recalc account metrics from holdings + cash
const recalcAccountMetrics = (cashBalance: number, holdings: Holding[], stocksList: StockData[]): AccountState => {
  let investedValue = 0;
  let totalCostBasis = 0;
  let totalCurrentValue = 0;
  holdings.forEach(h => {
    const stock = stocksList.find(s => s.symbol === h.symbol);
    const currentPrice = stock ? stock.price : h.averageBuyPrice;
    investedValue += currentPrice * h.quantity;
    totalCostBasis += h.averageBuyPrice * h.quantity;
    totalCurrentValue += currentPrice * h.quantity;
  });
  return {
    startingBalance: INITIAL_ACCOUNT_STATE.startingBalance,
    cashBalance,
    investedValue,
    portfolioValue: cashBalance + investedValue,
    realizedPnL: 0, // placeholder, caller will set
    unrealizedPnL: totalCurrentValue - totalCostBasis
  };
};

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

  const [holdings, setHoldings] = useState<Holding[]>(() => {
    const saved = localStorage.getItem('tradelab_holdings');
    return saved ? JSON.parse(saved) : [];
  });

  const [trades, setTrades] = useState<Trade[]>(() => {
    const saved = localStorage.getItem('tradelab_trades');
    return saved ? JSON.parse(saved) : [];
  });

  const [stocks] = useState<StockData[]>(MOCK_STOCKS);

  // Use refs for atomic reads of latest state
  const accountRef = useRef(account);
  const holdingsRef = useRef(holdings);
  const positionsRef = useRef(positions);
  const stocksRef = useRef(stocks);

  useEffect(() => { accountRef.current = account; }, [account]);
  useEffect(() => { holdingsRef.current = holdings; }, [holdings]);
  useEffect(() => { positionsRef.current = positions; }, [positions]);
  useEffect(() => { stocksRef.current = stocks; }, [stocks]);

  // Persist to localStorage
  useEffect(() => { localStorage.setItem('tradelab_account', JSON.stringify(account)); }, [account]);
  useEffect(() => { localStorage.setItem('tradelab_watchlist', JSON.stringify(watchlist)); }, [watchlist]);
  useEffect(() => { localStorage.setItem('tradelab_positions', JSON.stringify(positions)); }, [positions]);
  useEffect(() => { localStorage.setItem('tradelab_holdings', JSON.stringify(holdings)); }, [holdings]);
  useEffect(() => { localStorage.setItem('tradelab_trades', JSON.stringify(trades)); }, [trades]);

  const addToWatchlist = (symbol: string) => {
    if (!watchlist.includes(symbol)) {
      setWatchlist([...watchlist, symbol]);
    }
  };

  const removeFromWatchlist = (symbol: string) => {
    setWatchlist(watchlist.filter(s => s !== symbol));
  };

  const executeBuy = useCallback((symbol: string, quantity: number, currentPrice: number, companyName: string) => {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, error: 'Quantity must be a positive whole number.' };
    }

    const requiredCash = currentPrice * quantity;
    const currentAccount = accountRef.current;

    if (currentAccount.cashBalance < requiredCash) {
      const fmt = (v: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
      return { success: false, error: 'Insufficient cash. Required: ' + fmt(requiredCash) + ' but available: ' + fmt(currentAccount.cashBalance) + '.' };
    }

    const stock = stocksRef.current.find(s => s.symbol === symbol);
    if (!stock) {
      return { success: false, error: 'Stock ' + symbol + ' not found.' };
    }

    // Compute new state values atomically using refs (latest state)
    const prevHoldings = holdingsRef.current;
    const prevPositions = positionsRef.current;

    const newHoldings = computeBuyHoldings(prevHoldings, symbol, quantity, currentPrice);
    const newPositions = computeBuyPositions(prevPositions, symbol, quantity, currentPrice);
    const newCash = currentAccount.cashBalance - requiredCash;

    // Compute final account metrics
    let newInvestedValue = 0;
    let newTotalCostBasis = 0;
    let newTotalCurrentValue = 0;
    newHoldings.forEach(h => {
      const s = stocksRef.current.find(st => st.symbol === h.symbol);
      const cp = s ? s.price : h.averageBuyPrice;
      newInvestedValue += cp * h.quantity;
      newTotalCostBasis += h.averageBuyPrice * h.quantity;
      newTotalCurrentValue += cp * h.quantity;
    });

    const newAccount: AccountState = {
      startingBalance: currentAccount.startingBalance,
      cashBalance: newCash,
      investedValue: newInvestedValue,
      portfolioValue: newCash + newInvestedValue,
      realizedPnL: currentAccount.realizedPnL,
      unrealizedPnL: newTotalCurrentValue - newTotalCostBasis
    };

    // Apply all state updates atomically
    setAccount(newAccount);
    setHoldings(newHoldings);
    setPositions(newPositions);

    // Create trade record
    const tradeId = 'TRD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    const totalValue = currentPrice * quantity;

    const newTrade: Trade = {
      id: tradeId,
      timestamp: new Date().toISOString(),
      symbol,
      companyName,
      side: 'BUY',
      quantity,
      executionPrice: Number(currentPrice.toFixed(2)),
      totalValue,
      realizedPnL: null
    };
    setTrades(prev => [newTrade, ...prev]);

    return { success: true };
  }, []);

  const executeSell = useCallback((symbol: string, quantity: number, currentPrice: number, companyName: string) => {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, error: 'Quantity must be a positive whole number.' };
    }

    const prevHoldings = holdingsRef.current;
    const existing = prevHoldings.find(h => h.symbol === symbol);

    if (!existing || existing.quantity < quantity) {
      const availableQty = existing ? existing.quantity : 0;
      return { success: false, error: 'Insufficient holdings. You own ' + availableQty + ' shares of ' + symbol + ' but are trying to sell ' + quantity + '.' };
    }

    const currentAccount = accountRef.current;
    const saleValue = currentPrice * quantity;
    const costBasis = existing.averageBuyPrice * quantity;
    const realizedGain = saleValue - costBasis;

    // Compute new state values atomically using refs (latest state)
    const prevPositions = positionsRef.current;

    const newHoldings = computeSellHoldings(prevHoldings, symbol, quantity);
    const newPositions = computeSellPositions(prevPositions, symbol, quantity);
    const newCash = currentAccount.cashBalance + saleValue;

    // Compute final account metrics
    let newInvestedValue = 0;
    let newTotalCostBasis = 0;
    let newTotalCurrentValue = 0;
    newHoldings.forEach(h => {
      const s = stocksRef.current.find(st => st.symbol === h.symbol);
      const cp = s ? s.price : h.averageBuyPrice;
      newInvestedValue += cp * h.quantity;
      newTotalCostBasis += h.averageBuyPrice * h.quantity;
      newTotalCurrentValue += cp * h.quantity;
    });

    const newAccount: AccountState = {
      startingBalance: currentAccount.startingBalance,
      cashBalance: newCash,
      investedValue: newInvestedValue,
      portfolioValue: newCash + newInvestedValue,
      realizedPnL: currentAccount.realizedPnL + realizedGain,
      unrealizedPnL: newTotalCurrentValue - newTotalCostBasis
    };

    // Apply all state updates atomically
    setAccount(newAccount);
    setHoldings(newHoldings);
    setPositions(newPositions);

    // Create trade record
    const tradeId = 'TRD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    const totalValue = saleValue;

    const newTrade: Trade = {
      id: tradeId,
      timestamp: new Date().toISOString(),
      symbol,
      companyName,
      side: 'SELL',
      quantity,
      executionPrice: Number(currentPrice.toFixed(2)),
      totalValue,
      realizedPnL: Number(realizedGain.toFixed(2))
    };
    setTrades(prev => [newTrade, ...prev]);

    return { success: true };
  }, []);

  const resetAccount = () => {
    setAccount(INITIAL_ACCOUNT_STATE);
    setWatchlist([]);
    setPositions([]);
    setHoldings([]);
    setTrades([]);
  };

  return (
    <TradingContext.Provider value={{
      account,
      watchlist,
      positions,
      holdings,
      trades,
      stocks,
      addToWatchlist,
      removeFromWatchlist,
      executeBuy,
      executeSell,
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