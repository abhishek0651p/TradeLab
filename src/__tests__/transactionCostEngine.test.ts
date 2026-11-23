import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateTransactionCosts,
  calculateTotalCharges,
  calculateNetExecutionValue,
  aggregateOrderCharges,
  computeHoldingAverageBuyPriceWithCosts,
  computeRealizedPnLWithCosts,
  calculateTransactionCostAnalytics,
  DEFAULT_TRANSACTION_COST_CONFIG,
  INTRADAY_TRANSACTION_COST_CONFIG,
  TransactionCostConfig,
} from '../engine/TransactionCostEngine';
import { Order, Execution, Trade, Holding, BracketGroup, AccountState, StockData } from '../types';
import { executeOCO } from '../engine/OCOExecutionEngine';
import { computeReservedBuyCapital, computeAvailableBuyingPower } from '../engine/ReservationModel';

describe('Day 32 Phase D: Transaction Cost & Brokerage Simulation Engine', () => {
  // ── 1. Brokerage Calculations ──────────────────────────────────────────────

  it('1. calculates proportional brokerage on BUY orders correctly', () => {
    // ₹10,000 turnover at 0.03% = ₹3.00 (below ₹20 cap)
    const costs = calculateTransactionCosts({
      side: 'BUY',
      quantity: 10,
      price: 1000,
    });
    expect(costs.brokerage).toBe(3);
  });

  it('2. calculates proportional brokerage on SELL orders correctly', () => {
    // ₹5,000 turnover at 0.03% = ₹1.50
    const costs = calculateTransactionCosts({
      side: 'SELL',
      quantity: 5,
      price: 1000,
    });
    expect(costs.brokerage).toBe(1.5);
  });

  it('3. enforces maximum brokerage cap per order (e.g. ₹20 cap on large turnover)', () => {
    // ₹10,00,000 turnover at 0.03% = ₹300, clamped to ₹20 cap
    const costs = calculateTransactionCosts({
      side: 'BUY',
      quantity: 1000,
      price: 1000,
    });
    expect(costs.brokerage).toBe(20);
  });

  it('4. enforces minimum brokerage floor when configured', () => {
    const config: TransactionCostConfig = {
      ...DEFAULT_TRANSACTION_COST_CONFIG,
      minBrokerage: 5,
    };
    // ₹1,000 turnover at 0.03% = ₹0.30, floored to minBrokerage ₹5.00
    const costs = calculateTransactionCosts(
      { side: 'BUY', quantity: 1, price: 1000 },
      config
    );
    expect(costs.brokerage).toBe(5);
  });

  it('5. supports zero-brokerage models (e.g., zero delivery brokerage)', () => {
    const config: TransactionCostConfig = {
      ...DEFAULT_TRANSACTION_COST_CONFIG,
      brokeragePercent: 0,
      brokerageFlat: 0,
      minBrokerage: 0,
      maxBrokerage: 0,
    };
    const costs = calculateTransactionCosts(
      { side: 'BUY', quantity: 100, price: 500 },
      config
    );
    expect(costs.brokerage).toBe(0);
    // Non-brokerage statutory fees (STT, Exchange, GST, etc.) still apply
    expect(costs.stt).toBeGreaterThan(0);
    expect(costs.totalCharges).toBeGreaterThan(0);
  });

  // ── 2. Statutory & Regulatory Taxes ────────────────────────────────────────

  it('6. calculates STT on BUY delivery turnover (0.1%)', () => {
    // ₹50,000 turnover at 0.1% = ₹50.00
    const costs = calculateTransactionCosts({
      side: 'BUY',
      quantity: 50,
      price: 1000,
    });
    expect(costs.stt).toBe(50);
  });

  it('7. calculates STT on SELL delivery turnover (0.1%)', () => {
    // ₹30,000 turnover at 0.1% = ₹30.00
    const costs = calculateTransactionCosts({
      side: 'SELL',
      quantity: 30,
      price: 1000,
    });
    expect(costs.stt).toBe(30);
  });

  it('8. applies intraday STT rate differences (0% BUY, 0.025% SELL)', () => {
    const buyCosts = calculateTransactionCosts(
      { side: 'BUY', quantity: 100, price: 1000 },
      INTRADAY_TRANSACTION_COST_CONFIG
    );
    expect(buyCosts.stt).toBe(0);

    const sellCosts = calculateTransactionCosts(
      { side: 'SELL', quantity: 100, price: 1000 },
      INTRADAY_TRANSACTION_COST_CONFIG
    );
    // ₹100,000 turnover at 0.025% = ₹25.00
    expect(sellCosts.stt).toBe(25);
  });

  it('9. calculates NSE exchange turnover charges correctly (0.00345%)', () => {
    // ₹100,000 turnover at 0.00345% = ₹3.45
    const costs = calculateTransactionCosts({
      side: 'BUY',
      quantity: 100,
      price: 1000,
    });
    expect(costs.exchangeTransactionCharges).toBe(3.45);
  });

  it('10. calculates SEBI turnover charges correctly (0.0001% = ₹10/crore)', () => {
    // ₹1,000,000 turnover at 0.0001% = ₹1.00
    const costs = calculateTransactionCosts({
      side: 'BUY',
      quantity: 1000,
      price: 1000,
    });
    expect(costs.sebiCharges).toBe(1);
  });

  it('11. calculates Stamp Duty on BUY side only (0.015% in delivery)', () => {
    // ₹100,000 turnover at 0.015% = ₹15.00 on BUY
    const buyCosts = calculateTransactionCosts({
      side: 'BUY',
      quantity: 100,
      price: 1000,
    });
    expect(buyCosts.stampDuty).toBe(15);

    // 0% stamp duty on SELL side in equity delivery
    const sellCosts = calculateTransactionCosts({
      side: 'SELL',
      quantity: 100,
      price: 1000,
    });
    expect(sellCosts.stampDuty).toBe(0);
  });

  it('12. calculates GST at 18% on eligible charges (Brokerage + Exchange + SEBI)', () => {
    // Turnover = ₹10,000
    // Brokerage = ₹3.00
    // Exchange = 10,000 * 0.0000345 = ₹0.35 (rounded)
    // SEBI = 10,000 * 0.000001 = ₹0.01
    // Taxable base = 3.00 + 0.35 + 0.01 = 3.36
    // GST = 3.36 * 0.18 = 0.60
    const costs = calculateTransactionCosts({
      side: 'BUY',
      quantity: 10,
      price: 1000,
    });
    const taxableServices = costs.brokerage + costs.exchangeTransactionCharges + costs.sebiCharges;
    const expectedGst = Number((taxableServices * 0.18).toFixed(2));
    expect(costs.gst).toBe(expectedGst);
  });

  it('13. supports other optional charges (rate and flat component)', () => {
    const config: TransactionCostConfig = {
      ...DEFAULT_TRANSACTION_COST_CONFIG,
      otherChargesRate: 0.0001,
      otherChargesFlat: 10,
    };
    // ₹10,000 turnover * 0.0001 = ₹1.00 + ₹10.00 flat = ₹11.00
    const costs = calculateTransactionCosts(
      { side: 'BUY', quantity: 10, price: 1000 },
      config
    );
    expect(costs.otherCharges).toBe(11);
  });

  it('14. totalCharges exactly matches the sum of all individual charge components', () => {
    const costs = calculateTransactionCosts({
      side: 'BUY',
      quantity: 25,
      price: 1450,
    });
    const componentSum = Number((
      costs.brokerage +
      costs.stt +
      costs.exchangeTransactionCharges +
      costs.gst +
      costs.sebiCharges +
      costs.stampDuty +
      costs.otherCharges
    ).toFixed(2));
    expect(costs.totalCharges).toBe(componentSum);
  });

  it('15. returns zero for all charges when enabled is false', () => {
    const costs = calculateTransactionCosts(
      { side: 'BUY', quantity: 100, price: 1000 },
      { enabled: false }
    );
    expect(costs.brokerage).toBe(0);
    expect(costs.stt).toBe(0);
    expect(costs.exchangeTransactionCharges).toBe(0);
    expect(costs.gst).toBe(0);
    expect(costs.sebiCharges).toBe(0);
    expect(costs.stampDuty).toBe(0);
    expect(costs.totalCharges).toBe(0);
  });

  it('16. safely handles invalid, negative, or zero price/quantity inputs', () => {
    const zero1 = calculateTransactionCosts({ side: 'BUY', quantity: 0, price: 1000 });
    const zero2 = calculateTransactionCosts({ side: 'BUY', quantity: 10, price: 0 });
    const zero3 = calculateTransactionCosts({ side: 'BUY', quantity: -5, price: 500 });
    const zero4 = calculateTransactionCosts({ side: 'BUY', quantity: 5, price: -500 });
    const zero5 = calculateTransactionCosts({ side: 'BUY', quantity: NaN, price: 100 });

    [zero1, zero2, zero3, zero4, zero5].forEach(z => {
      expect(z.totalCharges).toBe(0);
      expect(z.brokerage).toBe(0);
    });
  });

  // ── 3. Net Financial Execution Value ────────────────────────────────────────

  it('17. calculates net execution value for BUY (gross + total charges)', () => {
    // Turnover = ₹10,000, Total Charges = ₹15.00 -> Net = ₹10,015.00
    const input = { side: 'BUY' as const, quantity: 10, price: 1000, totalValue: 10000 };
    const charges = { brokerage: 3, stt: 10, totalCharges: 15 };
    const net = calculateNetExecutionValue(input, charges);
    expect(net).toBe(10015);
  });

  it('18. calculates net execution value for SELL (gross - total charges)', () => {
    // Turnover = ₹10,000, Total Charges = ₹15.00 -> Net = ₹9,985.00
    const input = { side: 'SELL' as const, quantity: 10, price: 1000, totalValue: 10000 };
    const charges = { brokerage: 3, stt: 10, totalCharges: 15 };
    const net = calculateNetExecutionValue(input, charges);
    expect(net).toBe(9985);
  });

  // ── 4. Capital Accounting & Cost Basis Incorporation ────────────────────────

  it('19. incorporates BUY transaction costs into the holding cost basis (averageBuyPrice)', () => {
    // Buying 10 shares at ₹100 with ₹10 BUY charges:
    // Total acquisition cost = ₹1,000 + ₹10 = ₹1,010
    // Cost basis per share = 1010 / 10 = ₹101.00
    const avg = computeHoldingAverageBuyPriceWithCosts(0, 0, 10, 100, 10);
    expect(avg).toBe(101);
  });

  it('20. correctly updates weighted-average cost basis on subsequent BUY with charges', () => {
    // Existing: 10 shares at ₹101 (cost basis ₹1,010)
    // Adding: 10 shares at ₹120 with ₹10 BUY charges (cost basis ₹1,210)
    // Combined cost = 1010 + 1210 = ₹2,220 across 20 shares = ₹111.00/share
    const avg = computeHoldingAverageBuyPriceWithCosts(101, 10, 10, 120, 10);
    expect(avg).toBe(111);
  });

  it('21. calculates net realized P&L taking into account cost basis and SELL charges', () => {
    // Sold 10 shares at ₹150 = Gross ₹1,500
    // SELL charges = ₹15 -> Net proceeds = ₹1,485
    // Cost basis = 10 shares * ₹111 = ₹1,110
    // Net Realized P&L = ₹1,485 - ₹1,110 = ₹375.00
    const netPnL = computeRealizedPnLWithCosts(1500, 15, 1110);
    expect(netPnL).toBe(375);
  });

  it('22. round-trip trade net P&L equals gross P&L minus all BUY and SELL charges', () => {
    // Buy 10 shares at ₹100, buy charges = ₹12
    const buyCharges = 12;
    const avgBuyPrice = computeHoldingAverageBuyPriceWithCosts(0, 0, 10, 100, buyCharges);
    // avgBuyPrice = 101.20

    // Sell 10 shares at ₹150, sell charges = ₹18
    const sellCharges = 18;
    const grossSale = 10 * 150; // 1500
    const grossGain = grossSale - (10 * 100); // 1500 - 1000 = 500 gross gain

    const costBasis = avgBuyPrice * 10; // 1012.00
    const netPnL = computeRealizedPnLWithCosts(grossSale, sellCharges, costBasis);

    // 1500 - 18 - 1012 = 470
    expect(netPnL).toBe(470);
    // Invariant: Net P&L = Gross P&L - (Buy Charges + Sell Charges)
    expect(netPnL).toBe(grossGain - (buyCharges + sellCharges));
  });

  // ── 5. Partial Fills & Brokerage Cap Enforcement ────────────────────────────

  it('23. calculates charges independently for each partial fill execution', () => {
    // Fill 1: 5 shares at ₹1,000 = ₹5,000 turnover
    const fill1Charges = calculateTransactionCosts({
      side: 'BUY',
      quantity: 5,
      price: 1000,
    });
    // Fill 2: 5 shares at ₹1,000 = ₹5,000 turnover
    const fill2Charges = calculateTransactionCosts(
      { side: 'BUY', quantity: 5, price: 1000 },
      DEFAULT_TRANSACTION_COST_CONFIG,
      fill1Charges
    );

    expect(fill1Charges.brokerage).toBe(1.5);
    expect(fill2Charges.brokerage).toBe(1.5);
    expect(fill1Charges.totalCharges).toBeGreaterThan(0);
    expect(fill2Charges.totalCharges).toBeGreaterThan(0);
  });

  it('24. prevents cumulative order brokerage from exceeding maxBrokerage across partial fills', () => {
    // Max brokerage = ₹20
    // Fill 1: ₹50,000 turnover -> 0.03% = ₹15 brokerage (unclamped < 20)
    const fill1 = calculateTransactionCosts({
      side: 'BUY',
      quantity: 50,
      price: 1000,
    });
    expect(fill1.brokerage).toBe(15);

    // Fill 2: ₹50,000 turnover -> 0.03% = ₹15, but only ₹5 headroom remains under ₹20 cap
    const fill2 = calculateTransactionCosts(
      { side: 'BUY', quantity: 50, price: 1000 },
      DEFAULT_TRANSACTION_COST_CONFIG,
      fill1
    );
    expect(fill2.brokerage).toBe(5); // Headroom: 20 - 15 = 5

    // Fill 3: further fills pay 0 brokerage since ₹20 cap is fully exhausted
    const cumulativeAfterFill2 = aggregateOrderCharges(fill1, fill2);
    expect(cumulativeAfterFill2.brokerage).toBe(20);

    const fill3 = calculateTransactionCosts(
      { side: 'BUY', quantity: 50, price: 1000 },
      DEFAULT_TRANSACTION_COST_CONFIG,
      cumulativeAfterFill2
    );
    expect(fill3.brokerage).toBe(0);
  });

  it('25. aggregates order charges accurately across all fills', () => {
    const f1 = calculateTransactionCosts({ side: 'BUY', quantity: 10, price: 100 });
    const f2 = calculateTransactionCosts({ side: 'BUY', quantity: 20, price: 100 }, DEFAULT_TRANSACTION_COST_CONFIG, f1);

    const aggregated = aggregateOrderCharges(f1, f2);
    expect(aggregated.brokerage).toBe(Number(((f1.brokerage ?? 0) + (f2.brokerage ?? 0)).toFixed(2)));
    expect(aggregated.stt).toBe(Number(((f1.stt ?? 0) + (f2.stt ?? 0)).toFixed(2)));
    expect(aggregated.totalCharges).toBe(Number(((f1.totalCharges ?? 0) + (f2.totalCharges ?? 0)).toFixed(2)));
  });

  // ── 6. OCO and Bracket Integration ──────────────────────────────────────────

  it('26. executeOCO applies transaction costs when costConfig is provided', () => {
    const bracketGroup: BracketGroup = {
      id: 'BG-1',
      parentOrderId: 'ORD-P',
      stopLossOrderId: 'ORD-SL',
      targetOrderId: 'ORD-TGT',
      positionId: 'POS-1',
      ocoGroupId: 'BG-1',
      symbol: 'TCS',
      side: 'BUY',
      entryPrice: 3500,
      stopLossPrice: 3400,
      targetPrice: 3700,
      originalQuantity: 10,
      remainingQuantity: 10,
      status: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const orders: Order[] = [
      {
        id: 'ORD-SL',
        symbol: 'TCS',
        companyName: 'Tata Consultancy Services',
        side: 'SELL',
        type: 'STOP_MARKET',
        quantity: 10,
        requestedPrice: 3400,
        triggerPrice: 3400,
        executionPrice: null,
        totalValue: null,
        status: 'TRIGGERED',
        createdAt: new Date().toISOString(),
        executedAt: null,
        cancelledAt: null,
        rejectionReason: null,
      },
      {
        id: 'ORD-TGT',
        symbol: 'TCS',
        companyName: 'Tata Consultancy Services',
        side: 'SELL',
        type: 'TARGET',
        quantity: 10,
        requestedPrice: 3700,
        triggerPrice: 3700,
        executionPrice: null,
        totalValue: null,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        executedAt: null,
        cancelledAt: null,
        rejectionReason: null,
      },
    ];

    const holdings: Holding[] = [{ symbol: 'TCS', quantity: 20, averageBuyPrice: 3500 }];
    const stocks: StockData[] = [
      {
        symbol: 'TCS',
        companyName: 'Tata Consultancy Services',
        price: 3700,
        previousClose: 3600,
        change: 100,
        changePercent: 2.7,
        open: 3600,
        dayHigh: 3750,
        dayLow: 3580,
        volume: 100000,
        sector: 'Technology',
        exchange: 'NSE',
        description: 'IT Services',
      },
    ];

    const account: AccountState = {
      startingBalance: 100000,
      cashBalance: 65000,
      investedValue: 70000,
      portfolioValue: 139000,
      realizedPnL: 0,
      unrealizedPnL: 4000,
    };

    // Execute TARGET leg at ₹3,700 with costs enabled
    const res = executeOCO(
      bracketGroup,
      orders,
      holdings,
      [],
      stocks,
      account,
      3700,
      'TARGET',
      DEFAULT_TRANSACTION_COST_CONFIG
    );

    expect(res.success).toBe(true);
    expect(res.execution.charges).toBeDefined();
    expect(res.execution.charges!.totalCharges).toBeGreaterThan(0);
    expect(res.trade.charges).toBeDefined();
    expect(res.executedOrder.charges).toBeDefined();

    // Losing leg (STOP_LOSS) must be CANCELLED with no execution charges
    expect(res.cancelledOrder.status).toBe('CANCELLED');
    expect(res.cancelledOrder.charges).toBeUndefined();

    // Net cash credited must equal gross sale minus total charges
    const grossSale = 3700 * 10; // 37,000
    const charges = res.execution.charges!.totalCharges!;
    expect(res.newAccount.cashBalance).toBe(account.cashBalance + grossSale - charges);

    // Realized P&L should reflect SELL charges
    const expectedPnL = Number((grossSale - charges - 35000).toFixed(2));
    expect(res.realizedPnL).toBe(expectedPnL);
  });

  // ── 7. Transaction Cost Analytics ──────────────────────────────────────────

  it('27. calculateTransactionCostAnalytics aggregates trade charges and P&L accurately', () => {
    const mockTrades: Trade[] = [
      {
        id: 'T1',
        timestamp: new Date().toISOString(),
        symbol: 'INFY',
        companyName: 'Infosys',
        side: 'BUY',
        quantity: 10,
        executionPrice: 1500,
        totalValue: 15000,
        realizedPnL: null,
        charges: {
          brokerage: 4.5,
          stt: 15,
          exchangeTransactionCharges: 0.52,
          gst: 0.9,
          sebiCharges: 0.02,
          stampDuty: 2.25,
          otherCharges: 0,
          totalCharges: 23.19,
        },
      },
      {
        id: 'T2',
        timestamp: new Date().toISOString(),
        symbol: 'INFY',
        companyName: 'Infosys',
        side: 'SELL',
        quantity: 10,
        executionPrice: 1600,
        totalValue: 16000,
        realizedPnL: 976.81, // Net P&L after ₹23.19 charges
        charges: {
          brokerage: 4.8,
          stt: 16,
          exchangeTransactionCharges: 0.55,
          gst: 0.96,
          sebiCharges: 0.02,
          stampDuty: 0,
          otherCharges: 0,
          totalCharges: 22.33,
        },
      },
    ];

    const analytics = calculateTransactionCostAnalytics(mockTrades);

    expect(analytics.totalBrokerage).toBe(9.3);
    expect(analytics.totalSTT).toBe(31);
    expect(analytics.buySideCharges).toBe(23.19);
    expect(analytics.sellSideCharges).toBe(22.33);
    expect(analytics.totalCharges).toBe(45.52);
    expect(analytics.netRealizedPnL).toBe(976.81);
    expect(analytics.grossRealizedPnL).toBe(999.14); // 976.81 + 22.33
  });

  it('28. calculateTotalCharges sums undefined/partial charge properties safely', () => {
    expect(calculateTotalCharges(undefined)).toBe(0);
    expect(calculateTotalCharges({})).toBe(0);
    expect(calculateTotalCharges({ brokerage: 10, stt: 20 })).toBe(30);
    expect(calculateTotalCharges({ totalCharges: 55.5 })).toBe(55.5);
  });
});
