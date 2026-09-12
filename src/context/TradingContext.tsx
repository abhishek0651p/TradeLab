import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  AccountState,
  OrderSide,
  OrderType,
  OrderStatus,
  PortfolioPosition,
  Holding,
  Trade,
  StockData,
  Order,
  Execution,
  PlaceOrderParams,
  PlaceOrderResult
} from '../types';
import { INITIAL_ACCOUNT_STATE, MOCK_STOCKS } from '../data/mockData';

// ──────────────────────────────────────────────
// Context interface
// ──────────────────────────────────────────────

interface TradingContextType {
  account: AccountState;
  watchlist: string[];
  positions: PortfolioPosition[];
  holdings: Holding[];
  trades: Trade[];
  orders: Order[];
  executions: Execution[];
  stocks: StockData[];
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  executeBuy: (symbol: string, quantity: number, currentPrice: number, companyName: string) => { success: boolean; error?: string };
  executeSell: (symbol: string, quantity: number, currentPrice: number, companyName: string) => { success: boolean; error?: string };
  placeOrder: (params: PlaceOrderParams) => PlaceOrderResult;
  cancelOrder: (orderId: string) => { success: boolean; error?: string };
  processPendingOrders: () => { processed: number; executed: number; rejected: number };
  resetAccount: () => void;
}

const TradingContext = createContext<TradingContextType | undefined>(undefined);

// ──────────────────────────────────────────────
// ID generators
// ──────────────────────────────────────────────

const generateOrderId = (): string =>
  'ORD-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

const generateExecutionId = (): string =>
  'EXE-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

const generateTradeId = (): string =>
  'TRD-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

// ──────────────────────────────────────────────
// Pure helper functions for state computation
// ──────────────────────────────────────────────

const computeBuyHoldings = (prevHoldings: Holding[], symbol: string, quantity: number, price: number): Holding[] => {
  const existing = prevHoldings.find(h => h.symbol === symbol);
  if (existing) {
    const newQty = existing.quantity + quantity;
    const newAvg = ((existing.averageBuyPrice * existing.quantity) + (price * quantity)) / newQty;
    return prevHoldings.map(h => h.symbol === symbol ? { ...h, quantity: newQty, averageBuyPrice: Number(newAvg.toFixed(2)) } : h);
  }
  return [...prevHoldings, { symbol, quantity, averageBuyPrice: Number(price.toFixed(2)) }];
};

const computeSellHoldings = (prevHoldings: Holding[], symbol: string, quantity: number): Holding[] => {
  const existing = prevHoldings.find(h => h.symbol === symbol);
  if (!existing) return prevHoldings;
  const newQty = existing.quantity - quantity;
  if (newQty <= 0) return prevHoldings.filter(h => h.symbol !== symbol);
  return prevHoldings.map(h => h.symbol === symbol ? { ...h, quantity: newQty } : h);
};

const computeBuyPositions = (prevPositions: PortfolioPosition[], symbol: string, quantity: number, price: number): PortfolioPosition[] => {
  const existing = prevPositions.find(p => p.symbol === symbol);
  if (existing) {
    const newQty = existing.quantity + quantity;
    const newAvg = ((existing.averagePrice * existing.quantity) + (price * quantity)) / newQty;
    return prevPositions.map(p => p.symbol === symbol ? { ...p, quantity: newQty, averagePrice: Number(newAvg.toFixed(2)) } : p);
  }
  return [...prevPositions, { symbol, quantity, averagePrice: Number(price.toFixed(2)) }];
};

const computeSellPositions = (prevPositions: PortfolioPosition[], symbol: string, quantity: number): PortfolioPosition[] => {
  const existing = prevPositions.find(p => p.symbol === symbol);
  if (!existing) return prevPositions;
  const newQty = existing.quantity - quantity;
  if (newQty <= 0) return prevPositions.filter(p => p.symbol !== symbol);
  return prevPositions.map(p => p.symbol === symbol ? { ...p, quantity: newQty } : p);
};

const computeAccountMetrics = (
  cashBalance: number,
  newHoldings: Holding[],
  stocksList: StockData[],
  prevRealizedPnL: number
): AccountState => {
  let investedValue = 0;
  let totalCostBasis = 0;
  let totalCurrentValue = 0;
  newHoldings.forEach(h => {
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
    realizedPnL: prevRealizedPnL,
    unrealizedPnL: totalCurrentValue - totalCostBasis
  };
};

// ──────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  error?: string;
}

const formatINR = (v: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

const validateOrder = (
  params: PlaceOrderParams,
  stocks: StockData[],
  cashBalance: number,
  holdings: Holding[]
): ValidationResult => {
  // Validate side
  if (params.side !== 'BUY' && params.side !== 'SELL') {
    return { valid: false, error: 'Invalid order side.' };
  }

  // Validate order type
  if (params.orderType !== 'MARKET' && params.orderType !== 'LIMIT') {
    return { valid: false, error: 'Invalid order type.' };
  }

  // Validate stock exists
  const stock = stocks.find(s => s.symbol === params.symbol);
  if (!stock) {
    return { valid: false, error: 'Stock ' + params.symbol + ' not found.' };
  }

  // Validate quantity
  if (!Number.isInteger(params.quantity) || params.quantity <= 0) {
    return { valid: false, error: 'Quantity must be a positive whole number.' };
  }

  // Validate limit price for LIMIT orders
  if (params.orderType === 'LIMIT') {
    if (params.limitPrice === undefined || params.limitPrice === null || params.limitPrice <= 0) {
      return { valid: false, error: 'Limit price must be greater than zero.' };
    }
  }

  // Validate cash for BUY
  if (params.side === 'BUY') {
    const price = params.orderType === 'MARKET' ? params.currentPrice : (params.limitPrice ?? params.currentPrice);
    const requiredCash = price * params.quantity;
    if (cashBalance < requiredCash) {
      return {
        valid: false,
        error: 'Insufficient cash. Required: ' + formatINR(requiredCash) + ' but available: ' + formatINR(cashBalance) + '.'
      };
    }
  }

  // Validate holdings for SELL
  if (params.side === 'SELL') {
    const holding = holdings.find(h => h.symbol === params.symbol);
    const availableQty = holding ? holding.quantity : 0;
    if (availableQty < params.quantity) {
      return {
        valid: false,
        error: 'Insufficient holdings. You own ' + availableQty + ' shares of ' + params.symbol + ' but are trying to sell ' + params.quantity + '.'
      };
    }
  }

  return { valid: true };
};

// ──────────────────────────────────────────────
// Safe localStorage loader
// ──────────────────────────────────────────────

function safeLoadJSON<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    if (Array.isArray(fallback)) {
      return (Array.isArray(parsed) ? parsed : fallback) as T;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

// ──────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────

export const TradingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<AccountState>(() => safeLoadJSON('tradelab_account', INITIAL_ACCOUNT_STATE));
  const [watchlist, setWatchlist] = useState<string[]>(() => safeLoadJSON('tradelab_watchlist', []));
  const [positions, setPositions] = useState<PortfolioPosition[]>(() => safeLoadJSON('tradelab_positions', []));
  const [holdings, setHoldings] = useState<Holding[]>(() => safeLoadJSON('tradelab_holdings', []));
  const [trades, setTrades] = useState<Trade[]>(() => safeLoadJSON('tradelab_trades', []));
  const [orders, setOrders] = useState<Order[]>(() => safeLoadJSON('tradelab_orders', []));
  const [executions, setExecutions] = useState<Execution[]>(() => safeLoadJSON('tradelab_executions', []));
  const [stocks] = useState<StockData[]>(MOCK_STOCKS);

  // Refs for atomic reads of latest state
  const accountRef = useRef(account);
  const holdingsRef = useRef(holdings);
  const positionsRef = useRef(positions);
  const stocksRef = useRef(stocks);
  const ordersRef = useRef(orders);

  useEffect(() => { accountRef.current = account; }, [account]);
  useEffect(() => { holdingsRef.current = holdings; }, [holdings]);
  useEffect(() => { positionsRef.current = positions; }, [positions]);
  useEffect(() => { stocksRef.current = stocks; }, [stocks]);
  useEffect(() => { ordersRef.current = orders; }, [orders]);

  // Persist to localStorage
  useEffect(() => { localStorage.setItem('tradelab_account', JSON.stringify(account)); }, [account]);
  useEffect(() => { localStorage.setItem('tradelab_watchlist', JSON.stringify(watchlist)); }, [watchlist]);
  useEffect(() => { localStorage.setItem('tradelab_positions', JSON.stringify(positions)); }, [positions]);
  useEffect(() => { localStorage.setItem('tradelab_holdings', JSON.stringify(holdings)); }, [holdings]);
  useEffect(() => { localStorage.setItem('tradelab_trades', JSON.stringify(trades)); }, [trades]);
  useEffect(() => { localStorage.setItem('tradelab_orders', JSON.stringify(orders)); }, [orders]);
  useEffect(() => { localStorage.setItem('tradelab_executions', JSON.stringify(executions)); }, [executions]);

  // ── Watchlist ──

  const addToWatchlist = (symbol: string) => {
    if (!watchlist.includes(symbol)) {
      setWatchlist([...watchlist, symbol]);
    }
  };

  const removeFromWatchlist = (symbol: string) => {
    setWatchlist(watchlist.filter(s => s !== symbol));
  };

  // ── Internal order execution (shared by market orders and pending-order processing) ──

  const executeOrderInternal = useCallback((
    order: Order,
    executionPrice: number
  ): { execution: Execution; trade: Trade; newAccount: AccountState; newHoldings: Holding[]; newPositions: PortfolioPosition[] } => {
    const now = new Date().toISOString();
    const prevHoldings = holdingsRef.current;
    const prevPositions = positionsRef.current;
    const currentAccount = accountRef.current;

    // Create execution
    const execution: Execution = {
      id: generateExecutionId(),
      orderId: order.id,
      symbol: order.symbol,
      companyName: order.companyName,
      side: order.side,
      quantity: order.quantity,
      executionPrice: Number(executionPrice.toFixed(2)),
      totalValue: Number((executionPrice * order.quantity).toFixed(2)),
      executedAt: now
    };

    let newHoldings: Holding[];
    let newPositions: PortfolioPosition[];
    let newCash: number;
    let realizedGain = 0;

    if (order.side === 'BUY') {
      newHoldings = computeBuyHoldings(prevHoldings, order.symbol, order.quantity, executionPrice);
      newPositions = computeBuyPositions(prevPositions, order.symbol, order.quantity, executionPrice);
      newCash = currentAccount.cashBalance - execution.totalValue;
    } else {
      // SELL
      const existingHolding = prevHoldings.find(h => h.symbol === order.symbol);
      const costBasis = existingHolding ? existingHolding.averageBuyPrice * order.quantity : 0;
      realizedGain = execution.totalValue - costBasis;

      newHoldings = computeSellHoldings(prevHoldings, order.symbol, order.quantity);
      newPositions = computeSellPositions(prevPositions, order.symbol, order.quantity);
      newCash = currentAccount.cashBalance + execution.totalValue;
    }

    const newAccount = computeAccountMetrics(
      newCash,
      newHoldings,
      stocksRef.current,
      currentAccount.realizedPnL + realizedGain
    );

    // Create trade record
    const trade: Trade = {
      id: generateTradeId(),
      timestamp: now,
      symbol: order.symbol,
      companyName: order.companyName,
      side: order.side,
      quantity: order.quantity,
      executionPrice: Number(executionPrice.toFixed(2)),
      totalValue: execution.totalValue,
      realizedPnL: order.side === 'SELL' ? Number(realizedGain.toFixed(2)) : null,
      orderId: order.id,
      executionId: execution.id,
      orderType: order.type
    };

    return { execution, trade, newAccount, newHoldings, newPositions };
  }, []);

  // ── placeOrder — central order creation ──

  const placeOrder = useCallback((params: PlaceOrderParams): PlaceOrderResult => {
    const currentStocks = stocksRef.current;
    const currentAccount = accountRef.current;
    const currentHoldings = holdingsRef.current;

    // Validate
    const validation = validateOrder(params, currentStocks, currentAccount.cashBalance, currentHoldings);
    if (!validation.valid) {
      // Create a rejected order record for history
      const rejectedOrder: Order = {
        id: generateOrderId(),
        symbol: params.symbol,
        companyName: params.companyName,
        side: params.side,
        type: params.orderType,
        quantity: params.quantity,
        requestedPrice: params.orderType === 'LIMIT' ? (params.limitPrice ?? params.currentPrice) : params.currentPrice,
        executionPrice: null,
        totalValue: null,
        status: 'REJECTED' as OrderStatus,
        createdAt: new Date().toISOString(),
        executedAt: null,
        cancelledAt: null,
        rejectionReason: validation.error ?? 'Order validation failed.'
      };
      setOrders(prev => [rejectedOrder, ...prev]);
      return { success: false, error: validation.error, order: rejectedOrder };
    }

    const now = new Date().toISOString();
    const requestedPrice = params.orderType === 'LIMIT' ? (params.limitPrice ?? params.currentPrice) : params.currentPrice;

    // Create the order
    const order: Order = {
      id: generateOrderId(),
      symbol: params.symbol,
      companyName: params.companyName,
      side: params.side,
      type: params.orderType,
      quantity: params.quantity,
      requestedPrice,
      executionPrice: null,
      totalValue: null,
      status: 'PENDING' as OrderStatus,
      createdAt: now,
      executedAt: null,
      cancelledAt: null,
      rejectionReason: null
    };

    // MARKET order — execute immediately
    if (params.orderType === 'MARKET') {
      const executionPrice = params.currentPrice;
      const result = executeOrderInternal(order, executionPrice);

      // Finalize order
      const executedOrder: Order = {
        ...order,
        executionPrice: Number(executionPrice.toFixed(2)),
        totalValue: result.execution.totalValue,
        status: 'EXECUTED' as OrderStatus,
        executedAt: result.execution.executedAt
      };

      // Apply all state updates
      setOrders(prev => [executedOrder, ...prev]);
      setExecutions(prev => [result.execution, ...prev]);
      setTrades(prev => [result.trade, ...prev]);
      setHoldings(result.newHoldings);
      setPositions(result.newPositions);
      setAccount(result.newAccount);

      return { success: true, order: executedOrder, execution: result.execution };
    }

    // LIMIT order — check if it can execute immediately
    if (params.orderType === 'LIMIT' && params.limitPrice !== undefined) {
      const canExecuteNow =
        (params.side === 'BUY' && params.currentPrice <= params.limitPrice) ||
        (params.side === 'SELL' && params.currentPrice >= params.limitPrice);

      if (canExecuteNow) {
        const executionPrice = params.currentPrice;
        const result = executeOrderInternal(order, executionPrice);

        const executedOrder: Order = {
          ...order,
          executionPrice: Number(executionPrice.toFixed(2)),
          totalValue: result.execution.totalValue,
          status: 'EXECUTED' as OrderStatus,
          executedAt: result.execution.executedAt
        };

        setOrders(prev => [executedOrder, ...prev]);
        setExecutions(prev => [result.execution, ...prev]);
        setTrades(prev => [result.trade, ...prev]);
        setHoldings(result.newHoldings);
        setPositions(result.newPositions);
        setAccount(result.newAccount);

        return { success: true, order: executedOrder, execution: result.execution };
      }
    }

    // LIMIT order — stays PENDING
    setOrders(prev => [order, ...prev]);
    return { success: true, order };

  }, [executeOrderInternal]);

  // ── cancelOrder ──

  const cancelOrder = useCallback((orderId: string): { success: boolean; error?: string } => {
    const currentOrders = ordersRef.current;
    const order = currentOrders.find(o => o.id === orderId);

    if (!order) {
      return { success: false, error: 'Order not found.' };
    }

    if (order.status !== 'PENDING') {
      return { success: false, error: 'Only pending orders can be cancelled. This order is ' + order.status + '.' };
    }

    const cancelledOrder: Order = {
      ...order,
      status: 'CANCELLED' as OrderStatus,
      cancelledAt: new Date().toISOString()
    };

    setOrders(prev => prev.map(o => o.id === orderId ? cancelledOrder : o));
    return { success: true };
  }, []);

  // ── processPendingOrders ──

  const processPendingOrders = useCallback((): { processed: number; executed: number; rejected: number } => {
    const currentOrders = ordersRef.current;
    const currentStocks = stocksRef.current;

    const pendingOrders = currentOrders.filter(o => o.status === 'PENDING' && o.type === 'LIMIT');

    if (pendingOrders.length === 0) {
      return { processed: 0, executed: 0, rejected: 0 };
    }

    let executed = 0;
    let rejected = 0;

    // We need to process one at a time since each execution changes account state
    const updatedOrders = [...currentOrders];
    const newExecutions: Execution[] = [];
    const newTrades: Trade[] = [];

    for (const pendingOrder of pendingOrders) {
      const stock = currentStocks.find(s => s.symbol === pendingOrder.symbol);
      if (!stock) continue;

      const currentPrice = stock.price;
      const limitPrice = pendingOrder.requestedPrice;

      // Check limit condition
      const conditionMet =
        (pendingOrder.side === 'BUY' && currentPrice <= limitPrice) ||
        (pendingOrder.side === 'SELL' && currentPrice >= limitPrice);

      if (!conditionMet) continue;

      // Re-validate at execution time
      const latestAccount = accountRef.current;
      const latestHoldings = holdingsRef.current;

      if (pendingOrder.side === 'BUY') {
        const requiredCash = currentPrice * pendingOrder.quantity;
        if (latestAccount.cashBalance < requiredCash) {
          // Reject — insufficient cash
          const idx = updatedOrders.findIndex(o => o.id === pendingOrder.id);
          if (idx >= 0) {
            updatedOrders[idx] = {
              ...pendingOrder,
              status: 'REJECTED' as OrderStatus,
              rejectionReason: 'Insufficient cash at time of execution. Required: ' + formatINR(requiredCash) + ' but available: ' + formatINR(latestAccount.cashBalance) + '.'
            };
          }
          rejected++;
          continue;
        }
      }

      if (pendingOrder.side === 'SELL') {
        const holding = latestHoldings.find(h => h.symbol === pendingOrder.symbol);
        const availableQty = holding ? holding.quantity : 0;
        if (availableQty < pendingOrder.quantity) {
          const idx = updatedOrders.findIndex(o => o.id === pendingOrder.id);
          if (idx >= 0) {
            updatedOrders[idx] = {
              ...pendingOrder,
              status: 'REJECTED' as OrderStatus,
              rejectionReason: 'Insufficient holdings at time of execution. You own ' + availableQty + ' shares but need ' + pendingOrder.quantity + '.'
            };
          }
          rejected++;
          continue;
        }
      }

      // Execute
      const result = executeOrderInternal(pendingOrder, currentPrice);

      // Update account/holdings/positions refs for subsequent orders
      accountRef.current = result.newAccount;
      holdingsRef.current = result.newHoldings;
      positionsRef.current = result.newPositions;

      // Mark order executed in our local array
      const idx = updatedOrders.findIndex(o => o.id === pendingOrder.id);
      if (idx >= 0) {
        updatedOrders[idx] = {
          ...pendingOrder,
          executionPrice: Number(currentPrice.toFixed(2)),
          totalValue: result.execution.totalValue,
          status: 'EXECUTED' as OrderStatus,
          executedAt: result.execution.executedAt
        };
      }

      newExecutions.push(result.execution);
      newTrades.push(result.trade);

      // Apply state immediately so next order in loop sees updated state
      setHoldings(result.newHoldings);
      setPositions(result.newPositions);
      setAccount(result.newAccount);

      executed++;
    }

    // Apply order/execution/trade state
    setOrders(updatedOrders);
    if (newExecutions.length > 0) {
      setExecutions(prev => [...newExecutions.reverse(), ...prev]);
    }
    if (newTrades.length > 0) {
      setTrades(prev => [...newTrades.reverse(), ...prev]);
    }

    return { processed: pendingOrders.length, executed, rejected };
  }, [executeOrderInternal]);

  // ── Legacy executeBuy / executeSell — backward compatible wrappers ──

  const executeBuy = useCallback((symbol: string, quantity: number, currentPrice: number, companyName: string) => {
    const result = placeOrder({
      symbol,
      companyName,
      side: 'BUY',
      orderType: 'MARKET',
      quantity,
      currentPrice
    });
    return { success: result.success, error: result.error };
  }, [placeOrder]);

  const executeSell = useCallback((symbol: string, quantity: number, currentPrice: number, companyName: string) => {
    const result = placeOrder({
      symbol,
      companyName,
      side: 'SELL',
      orderType: 'MARKET',
      quantity,
      currentPrice
    });
    return { success: result.success, error: result.error };
  }, [placeOrder]);

  // ── Reset ──

  const resetAccount = () => {
    setAccount(INITIAL_ACCOUNT_STATE);
    setWatchlist([]);
    setPositions([]);
    setHoldings([]);
    setTrades([]);
    setOrders([]);
    setExecutions([]);
    localStorage.removeItem('tradelab_orders');
    localStorage.removeItem('tradelab_executions');
  };

  return (
    <TradingContext.Provider value={{
      account,
      watchlist,
      positions,
      holdings,
      trades,
      orders,
      executions,
      stocks,
      addToWatchlist,
      removeFromWatchlist,
      executeBuy,
      executeSell,
      placeOrder,
      cancelOrder,
      processPendingOrders,
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