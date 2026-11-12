# TradeLab Master Audit Report

**Application:** TradeLab — Virtual Paper Trading Platform  
**Scope:** Full read-only audit across 9 phases  
**Classification:** P0 (Critical) · P1 (High) · P2 (Medium) · P3 (Low)  
**Audit Date:** 2026-11-11  
**Status:** READ-ONLY AUDIT — No source files modified, deleted, committed, or pushed  
**Disclaimer:** This is an audit only. Do not change application source code. Do not start implementing Day 31. Wait for review of this master audit report before making changes.

---

## 1. Executive Summary

TradeLab is a React 18 + TypeScript virtual paper trading platform built with Vite and Vitest. It simulates NSE market data deterministically, supports 5 order types (MARKET, LIMIT, STOP_MARKET, STOP_LIMIT, TARGET), GTT/trailing stop orders, bracket orders with OCO (One-Cancels-the-Other) execution, position sizing and risk management, trade journaling, market replay, portfolio snapshots, and localStorage persistence. The codebase spans ~30 days of incremental feature delivery (Day 15 through Day 30).

The application is well-architected with a clean separation between pure calculation engines (risk, accounting, technical indicators, bracket/OCO) and React state management via `TradingContext`. The deterministic simulation engine is a strength — every tick is reproducible given a seed.

### Severity Summary

| Severity | Count |
|----------|-------|
| P0 (Critical) | 5 |
| P1 (High)     | 7 |
| P2 (Medium)   | 9 |
| P3 (Low)      | 10 |

### Top 3 Critical Risks

1. **`computeAccountMetrics` hardcodes `startingBalance: 1000000`** (`src/engine/BracketOrderEngineHelpers.ts:61`) — bracket OCO execution state will report a wrong starting balance whenever the actual account balance deviates from the initial ₹1,000,000, corrupting portfolio equity tracking during bracket executions.

2. **`computeUnrealizedPnL` always returns 0 when stock data exists** (`src/engine/TradingAccounting.ts`) — cost basis and market value both use current `stock.price`, so unrealized P&L is mathematically forced to 0 and never reflects actual purchase-price-vs-market-price P&L.

3. **No localStorage integrity protection** — all account state (balances, holdings, orders, trades) is persisted to plain-text localStorage with no tamper detection, allowing unrestricted client-side manipulation of virtual capital.

---

## 2. Architecture Map

```
src/
├── App.tsx                          # Root component, 11 routes, TradingProvider wrapper
├── main.tsx                         # Entry: BrowserRouter + TradingProvider + App
├── types/index.ts                   # Type definitions (OrderSide, OrderType, OrderStatus,
│                                      Holding, Trade, Order, BracketGroup, OCOExecutionResult,
│                                      AccountState, StockData, PortfolioSnapshot, PlannedOrder,
│                                      TrailingStopConfig, SIMULATION_SPEED_PRESETS, etc.)
├── context/TradingContext.tsx       # ~1950 lines: React provider, ~20 context values/handlers,
│                                     localStorage persistence for all state
├── engine/
│   ├── BracketOrderEngine.ts        # Day 30: validateBracketOrder, createBracketGroup,
│   │                                    activateChildExits, cancelEntryAndChildren,
│   │                                    rejectEntryAndChildren, findOrphanedChildren
│   ├── BracketOrderEngineHelpers.ts # Day 30: ID generators, computeBuy/SellHoldings,
│   │                                    computeAccountMetrics (hardcoded startingBalance)
│   ├── OCOExecutionEngine.ts        # Day 30: OCO_TIE_BREAKER='STOP_LOSS', evaluateOCOTriggers,
│   │                                    executeOCO, handlePartialExit, cancelAllOCOChildren
│   ├── ReservationModel.ts          # Day 29: buying power & holding quantity validation,
│   │                                    revalidateOrderAtExecution
│   └── TradingAccounting.ts         # Day 29: cost basis, market value, unrealized/realized P&L,
│                                     portfolio equity, buying power
├── analysis/TechnicalIndicators.ts  # Day 18: EMA (Wilder), RSI 14 (Wilder), volume stats,
│                                     support/resistance, computeTechnicalCondition
├── risk/
│   ├── PositionSizingModel.ts       # Day 26: fixed-fractional position sizing
│   ├── RiskCalculationModel.ts      # Day 13: market value, cash utilization, sector allocation,
│   │                                    concentration, pre-order risk snapshot
│   └── PreTradeRiskValidator.ts     # Day 27: validateOrderRisk, stop-loss/target direction,
│                                     buying power validation
├── data/mockData.ts                 # 10 mock NSE stocks, seededRandom, simulateMarketUpdate,
│                                     generateChartData, history registry, sanitization
├── pages/
│   ├── App.tsx (routes)             # Dashboard, Markets, Screener, Watchlist, Orders,
│   │   Risk, Portfolio, TradeHistory, StockDetail, Settings (11 routes)
│   ├── Dashboard.tsx                # Account hero, portfolio snapshot, market pulse,
│   │                                    pending orders, recent trades, risk gauges
│   ├── Markets.tsx                  # 10 mock stocks, market overview, breadth, movers
│   ├── Screener.tsx                 # Technical enrichment, rule-based score 0-100
│   ├── Watchlist.tsx                # Watchlist management, order entry modal
│   ├── Orders.tsx                   # Orders/trades/executions tabs, filtering, GTT badges
│   ├── TradeHistory.tsx             # Trade history stats, strategy analytics, journal
│   ├── StockDetail.tsx              # OrderEntry, technical indicators, replay, planned order
│   ├── Portfolio.tsx                # EnrichHoldings, aggregatePortfolio, HHI, snapshots
│   ├── Risk.tsx                     # Risk management page (HHI, cash allocation, snapshots)
│   └── Settings.tsx                 # Market simulation, display prefs, notifications,
│                                     CSV export, 2-step account reset
├── components/
│   ├── NotificationCenter.tsx       # Activity center, filter tabs, mark/clear
│   ├── OrderFilters.tsx             # Search + status/side/type pill filters
│   ├── OrderAnalytics.tsx           # Order stats: total, open, executed, rejected, cancelled
│   ├── OrderDetails.tsx             # Order lifecycle timeline, GTT/trailing badges
│   ├── TechnicalIndicatorPanel.tsx  # EMA/RSI/Volume toggles, indicator values
│   ├── SupportResistancePanel.tsx   # Support/resistance level display
│   ├── TradePlanningPanel.tsx       # Reference panel (current price, EMA, support/resistance)
│   ├── PositionIntelligence.tsx     # Per-position P&L, allocation, current value
│   ├── StockComparison.tsx          # Multi-stock comparison table with indicators
│   ├── MarketSimulationBar.tsx      # Play/pause, speed presets, event log drawer
│   ├── TradeJournal.tsx             # Trade notes with CRUD, tags, per-trade scoping
│   └── PositionSizingCalculator.tsx # Position sizing + pre-trade risk, transfer to order form
└── __tests__/
    ├── tradingEngine.test.ts        # enrichHoldings + aggregatePortfolio tests
    ├── reservationModel.test.ts     # Reservation model tests
    ├── riskCalculationModel.test.ts # Risk calc tests incl. BUG 04 regression
    ├── preTradeRisk.test.ts         # PreTradeRiskValidator tests
    ├── plannedOrderPrefill.test.ts  # Day 27.1: computeAppliedPrefill tests
    └── tradingAccounting.test.ts    # Day 29: accounting function tests
```

### Key Architectural Patterns

- **Pure engine layer:** All calculation engines (bracket, OCO, reservation, accounting, risk, technical indicators) are pure functions — no React, no state mutation, return descriptions of state changes.
- **React state layer:** `TradingContext` (~1950 lines) owns all mutable state via `useState` + `useRef` refs for atomic reads, with `localStorage` persistence via `useEffect` sync.
- **Order lifecycle:** PENDING → TRIGGERED → EXECUTED/CANCELLED/REJECTED. TRIGGERED → CANCELLED is intentionally blocked (Day 11 fix).
- **Reservation model:** BUY orders reserve buying power (cash minus pending BUY reservations); SELL orders reserve holding quantity (holdings minus pending SELL reservations).
- **Bracket order flow:** `placeBracketOrder` → `createBracketGroup` → entry executes immediately (MARKET) → `activateChildExits` → OCO evaluation on each `simulateTick` → `executeOCO` with STOP_LOSS tie-breaker.

---

## 3. Completed Features

### Day 15 — Account Reset & Persistence
- Full account state persisted to localStorage (account, watchlist, holdings, trades, orders, executions, stocks, stockHistory, tick, settings, notifications, portfolio snapshots, trade journal)
- 2-step account reset with confirmation dialog
- `safeLoadJSON` with type guards for safe deserialization

### Day 16 — Notifications
- Notification center with unread tracking, mark-all-read, clear-all
- Filter tabs: All / Unread / Orders / System
- Priority-based icons, relative timestamps, click-to-route
- Auto-capped at 100 events, newest first

### Day 20 — GTT & Trailing Stop Orders
- GTT (Good-Till-Triggered) with GTC/GTD expiry
- Trailing stop config for SELL stop orders (highest-price reference, percent/absolute distance)
- Expiry validation: GTT cannot apply to MARKET orders; expiry must be future
- Trailing trigger updates only in favorable direction (peak advances up for SELL)

### Day 21 — Portfolio Snapshots
- `recordPortfolioSnapshot()` called on each simulateTick
- Bounded history, persisted to localStorage
- Market alert on ±5% change threshold

### Day 23 — Market Simulation
- Deterministic seeded random walk via `seededRandom` + `symbolHash`
- Auto-sim toggle, speed presets (0.5x/1x/2x/5x), manual step tick
- Market event log drawer with throttled MARKET_TICK events

### Day 24 — Market Replay
- Replay state management (active/paused/symbol/snapshotData/currentIndex/speed)
- Replay speed presets (1x/2x/4x/8x)
- Stock detail page replay integration

### Day 25 — Trade Journal & Strategy Labels
- Trade journal entries with title, content, tags, tradeId linkage
- CRUD operations for journal entries
- Trade strategy label updates (`updateTradeStrategy`)
- Journal cleared on account reset

### Day 26 — Risk Management & Position Sizing
- Fixed-fractional position sizing: `floor(riskAmount / riskPerShare)`
- Risk amount = equity × riskPercent
- Cash constraint: max affordable quantity, exceedsCash flag
- Concentration warnings (>40% equity), risk:reward warnings (<1:1.5)

### Day 27 — Planned Order Integration
- Position-sizing calculator transfers planned order to OrderEntry form
- `computeAppliedPrefill` maps quantity/entry/SL/target to order form fields
- Side-aware priority: SELL → TARGET takes precedence; BUY → LIMIT entry
- Planned order cleared on submission; symbol matching; duplicate-prefill prevention

### Day 27.1 — Complete Planned Order Integration
- Full prefill mapping test suite (`plannedOrderPrefill.test.ts`)
- Idempotent mapping, user-edit preservation via ref guard

### Day 29 — Reservation Model & Trading Accounting
- Reservation model: buying power and holding quantity validation
- `revalidateOrderAtExecution` called before every execution
- Terminal statuses: EXECUTED/CANCELLED/REJECTED
- Standardized accounting: cost basis, market value, unrealized/realized P&L, equity, buying power
- `computePortfolioSummaryMetrics` for all portfolio metrics

### Day 30 — Bracket Orders & OCO Execution
- `validateBracketOrder`: side, prices, quantity, SL/target direction, risk/reward, exit qty vs available, buying power
- `createBracketGroup`: parent entry + STOP_MARKET child + TARGET child, all PENDING
- `activateChildExits`: children PENDING → TRIGGERED after entry executes
- `cancelEntryAndChildren` / `rejectEntryAndChildren`: release all reservations
- `findOrphanedChildren`: detect children whose parent is terminal
- OCO engine: `evaluateOCOTriggers`, `executeOCO` with STOP_LOSS tie-breaker
- `handlePartialExit`: reduce remaining quantity on partial fills
- `isBracketCompleted`, `cancelAllOCOChildren`
- Wired into `TradingContext.simulateTick` OCO evaluation loop

### UI Pages (All 11 Routes)
- Dashboard, Markets, Screener, Watchlist, Orders, Risk, Portfolio, TradeHistory, StockDetail, Settings

---

## 4. Incomplete / Broken Features

| # | Feature | Issue | Severity |
|---|---------|-------|----------|
| 1 | Screener | RSI shows "—" and Score 50 (N/A) when `generateChartData('1D')` returns < 50 points; `enrichStock` returns null | P1 |
| 2 | Accounting | `computeUnrealizedPnL` always returns 0 when stock data exists (cost basis and market value both use current price) | P0 |
| 3 | Accounting | `computeAccountMetrics` (bracket helpers) hardcodes `startingBalance: 1000000` | P0 |
| 4 | Bracket/OCO | No cleanup of orphaned bracket groups when all child orders reach terminal status | P2 |
| 5 | Bracket/OCO | `executeOCO` only computes realized P&L for SELL legs; BUY leg P&L is always 0 | P2 |
| 6 | Reservation | `computePreOrderRiskSnapshot` doesn't account for existing buy reservations when estimating post-BUY cash utilization | P1 |
| 7 | Order validation | SELL target price direction not validated against current market price for existing holdings | P1 |
| 8 | Order lifecycle | `isValidTransition` blocks TRIGGERED → CANCELLED, but `cancelOrder` only allows PENDING → CANCELLED — triggered GTT orders cannot be cancelled | P1 |
| 9 | Bracket/OCO | `activateChildExits` doesn't check if children are already terminal before activating | P2 |
| 10 | Market data | `generateChartData('1D')` depends on `activeHistoryRegistry` which may be empty on fresh load, causing insufficient-data fallback | P2 |
| 11 | Persistence | Bracket groups are NOT persisted to localStorage — lost on page refresh | P2 |
| 12 | Trade journal | Uses `alert()` for validation errors instead of inline UI feedback | P3 |

---

## 5. Critical Financial Calculation Risks

### P0 — Unrealized P&L is Always Zero (`src/engine/TradingAccounting.ts`)

**File:** `src/engine/TradingAccounting.ts`

**Finding:** `computeCostBasis` and `computeCurrentMarketValue` both use current `stock.price` (not `averageBuyPrice`) when stock data is available. This means `computeUnrealizedPnL` (market value − cost basis) is always 0 whenever stock data exists, regardless of the actual purchase price.

**Impact:** Users see no unrealized P&L on positions even when the market has moved significantly away from their average buy price. The Dashboard, Portfolio, and PositionIntelligence components all display misleading P&L figures.

**Failure scenario:** User buys RELIANCE at ₹3000. Price rises to ₹3500. Dashboard shows ₹0 unrealized P&L instead of ₹500/share gain.

**Evidence:** `tradingAccounting.test.ts` line 74-75 confirms: "Both cost basis and market value use stock prices, so P&L = 0 when prices match."

### P0 — Hardcoded Starting Balance in Bracket Accounting (`src/engine/BracketOrderEngineHelpers.ts:61`)

**File:** `src/engine/BracketOrderEngineHelpers.ts:61`

**Finding:** `computeAccountMetrics` hardcodes `startingBalance: 1000000` instead of reading from `account.startingBalance` or the actual account state. This is used during bracket OCO execution to compute `AccountState`.

**Impact:** When a user's account balance deviates from the initial ₹1,000,000 (due to trades, resets, or manual adjustments), bracket executions report incorrect `portfolioValue`, `investedValue`, and total return metrics.

**Failure scenario:** User resets account to ₹500,000, then executes a bracket order. The resulting `AccountState` reports `startingBalance: 1000000`, overstating the baseline.

**Note:** `TradingContext.computeAccountMetrics` (line 227) correctly uses `INITIAL_ACCOUNT_STATE.startingBalance`, but the bracket engine helper does not.

### P1 — Reservation Model Not Applied in Pre-Order Risk Snapshot (`src/risk/RiskCalculationModel.ts`)

**File:** `src/risk/RiskCalculationModel.ts:269-425` (`computePreOrderRiskSnapshot`)

**Finding:** `computePreOrderRiskSnapshot` estimates post-order cash utilization and allocation without accounting for existing buy reservations (pending BUY orders that have reserved capital).

**Impact:** Pre-trade risk warnings may understate cash utilization when multiple pending BUY orders exist, potentially allowing over-commitment of capital.

**Failure scenario:** User has ₹500,000 cash with ₹400,000 reserved by pending BUY orders. Pre-order snapshot for a new BUY estimates cash utilization based on full ₹500,000 available, not the ₹100,000 actually free.

---

## 6. Trading Engine Weaknesses

### P0 — No localStorage Integrity Protection

**Finding:** All account state (cash, holdings, orders, trades, settings) is persisted to plain-text `localStorage` with no integrity checks, encryption, or tamper detection.

**Impact:** Any user with browser DevTools access can modify their virtual balance, holdings, or order history. There is no server-side validation (this is a client-side paper trading app, so this is inherent to the architecture but should be documented as a limitation).

**Failure scenario:** User edits `tradelab_account` in localStorage to set `cashBalance: 999999999`, bypassing all buying power validation.

### P1 — Triggered GTT Orders Cannot Be Cancelled

**File:** `src/context/TradingContext.tsx:173-182` (`isValidTransition`) and `:1203-1234` (`cancelOrder`)

**Finding:** `isValidTransition` explicitly blocks `TRIGGERED → CANCELLED` ("NO CANCELLATION allowed per Day 11 fix"). `cancelOrder` only allows `PENDING → CANCELLED`. GTT stop orders that have been triggered but not yet executed cannot be cancelled.

**Impact:** Users are stuck with triggered conditional orders that will execute when price conditions are met, with no way to abort.

**Failure scenario:** User places a SELL STOP_MARKET GTT order at ₹2900. Price drops to ₹2900, order becomes TRIGGERED. User changes their mind — cannot cancel; order will execute on next price tick.

### P1 — Bracket Groups Not Persisted

**File:** `src/context/TradingContext.tsx:618` (`bracketGroups` state) and persistence `useEffect` block (lines 778-791)

**Finding:** `bracketGroups` state is declared but not included in the localStorage persistence `useEffect` block. Page refresh loses all bracket group metadata.

**Impact:** Bracket OCO groups are lost on refresh. Child orders remain as orphaned PENDING/TRIGGERED orders without bracket context, breaking OCO evaluation on subsequent ticks.

**Failure scenario:** User places a bracket order, refreshes the page. Child stop-loss/target orders still exist but the bracket group is gone. `simulateTick` OCO loop skips them (checks `bracketGroupsRef.current`).

### P2 — `executeOCO` Realized P&L Only for SELL Legs

**File:** `src/engine/OCOExecutionEngine.ts:246-258`

**Finding:** Realized P&L is only computed when `winningOrder.side === 'SELL'`. BUY leg executions (closing a short position) always report `realizedGain = 0`.

**Impact:** Bracket orders used for short positions (SELL entry, BUY exit) report zero realized P&L, corrupting trade history and accounting.

---

## 7. Market Data Limitations

### P2 — Deterministic Simulation Is Not Real Market Data

**File:** `src/data/mockData.ts:71-92` (`simulateMarketUpdate`)

**Finding:** All market data is generated by a deterministic seeded random walk (`seededRandom(symbolHash(symbol) + tick)`). Prices are not connected to any real exchange. The UI shows a "SIMULATED MARKET DATA" badge but users may still conflate simulation with reality.

**Impact:** All trading outcomes are synthetic. No real-world tradability, liquidity, slippage, or market impact modeling.

### P2 — `generateChartData('1D')` Depends on History Registry

**File:** `src/data/mockData.ts:282-381` (`generateChartData`)

**Finding:** For `'1D'` timeframe, `generateChartData` first checks `activeHistoryRegistry`. If fewer than 2 recorded points exist, it falls back to synthetic generation. On a fresh load with no tick history, the 1D chart may show synthetic data instead of recorded live history.

**Impact:** Inconsistent chart data between fresh sessions and sessions that have accumulated tick history.

### P2 — Screener Insufficient Data Handling

**File:** `src/pages/Screener.tsx` (previously read)

**Finding:** When `generateChartData('1D')` returns < 50 points, `enrichStock` returns null, causing RSI to show "—" and Score to default to 50 (N/A). Users cannot distinguish "no data" from "neutral score."

**Impact:** Screener results are unreliable for stocks with limited history; score of 50 is misleading (looks like a neutral score rather than "insufficient data").

---

## 8. UI/UX Problems

### P3 — Trade Journal Uses `alert()` for Validation

**File:** `src/components/TradeJournal.tsx:78` and `:105`

**Finding:** Validation errors use `window.alert()` instead of inline form error messages.

**Impact:** Poor user experience; alerts are disruptive and inaccessible.

### P3 — OrderDetails Does Not Show Bracket Group Association

**File:** `src/components/OrderDetails.tsx`

**Finding:** Order details display does not indicate whether an order is part of a bracket group, or which bracket it belongs to.

**Impact:** Users cannot visually identify bracket child orders (stop-loss/target) in the orders list.

### P3 — No Keyboard Shortcuts

**Finding:** No keyboard shortcuts for common actions (cancel order, place order, toggle simulation, etc.).

**Impact:** Reduced accessibility and efficiency for power users.

### P3 — No Export of Bracket Groups or Portfolio Snapshots

**File:** `src/pages/Settings.tsx`

**Finding:** CSV export only covers trades and orders. Bracket groups and portfolio snapshots cannot be exported.

**Impact:** Limited data portability for analysis.

### P2 — Simulation Disclosure Could Be More Prominent

**File:** `src/components/MarketSimulationBar.tsx:29-33`

**Finding:** The "SIMULATED MARKET DATA" badge is small and could be overlooked by users.

**Impact:** Users may mistake simulated prices for real market prices.

---

## 9. Testing Gaps

| Area | Test Coverage | Gap | Severity |
|------|--------------|-----|----------|
| BracketOrderEngine | ❌ None | No tests for `validateBracketOrder`, `createBracketGroup`, `activateChildExits`, `cancelEntryAndChildren`, `rejectEntryAndChildren`, `findOrphanedChildren` | P1 |
| OCOExecutionEngine | ❌ None | No tests for `evaluateOCOTriggers`, `executeOCO`, `handlePartialExit`, `cancelAllOCOChildren` | P1 |
| ReservationModel | ✅ Partial | `reservationModel.test.ts` exists | — |
| TradingAccounting | ✅ Partial | `tradingAccounting.test.ts` exists | — |
| RiskCalculationModel | ✅ Partial | `riskCalculationModel.test.ts` exists (incl. BUG 04 regression) | — |
| PreTradeRiskValidator | ✅ Partial | `preTradeRisk.test.ts` exists | — |
| TechnicalIndicators | ❌ None | No tests for EMA, RSI, volume stats, support/resistance, computeTechnicalCondition | P2 |
| TradingContext | ❌ None | No tests for the ~1950-line context provider | P2 |
| TradingEngine (enrich/aggregate) | ✅ Partial | `tradingEngine.test.ts` exists | — |
| PlannedOrderPrefill | ✅ Partial | `plannedOrderPrefill.test.ts` exists | — |
| Components | ❌ None | No component tests (NotificationCenter, OrderFilters, StockDetail, etc.) | P3 |
| Integration | ❌ None | No end-to-end or integration tests covering full order flow | P2 |

**Total test files:** 6  
**Untested engine modules:** BracketOrderEngine, OCOExecutionEngine, TechnicalIndicators  
**Untested context:** TradingContext (the largest file at ~1950 lines)

---

## 10. Security / Persistence Risks

### P0 — Plain-Text localStorage with No Integrity Protection

**Files:** `src/context/TradingContext.tsx:522-539` (`safeLoadJSON`), `:778-791` (persistence useEffects)

**Finding:** All state is serialized to `localStorage` as plain JSON. `safeLoadJSON` has no signature verification, no encryption, and no tamper detection. Any browser extension or console script can modify `tradelab_account`, `tradelab_holdings`, `tradelab_orders`, etc.

**Impact:** Complete bypass of all financial validation (buying power, holding quantity, order limits). Virtual capital can be inflated arbitrarily.

### P1 — No Session Isolation

**Finding:** localStorage keys are shared across all tabs and sessions. No namespace per user/session.

**Impact:** Opening TradeLab in two tabs can cause state corruption (last-write-wins on persistence). No multi-user support (expected for a single-user paper trading app, but worth noting).

### P2 — No Input Sanitization on Order Symbols

**File:** `src/context/TradingContext.tsx:393-396` (`validateOrder`)

**Finding:** Stock symbol validation only checks that the symbol exists in the `stocks` array. No additional sanitization for XSS via company names or symbols rendered in the UI.

**Impact:** Low risk (mock data is controlled), but if external stock data were ever integrated, companyName/symbol fields could be XSS vectors.

### P2 — Trade Journal Deletion Is Irreversible

**File:** `src/components/TradeJournal.tsx:120`

**Finding:** `handleDelete` uses `window.confirm()` but there is no soft-delete or undo mechanism.

**Impact:** Accidental deletion of journal entries is permanent.

---

## 11. Prioritized Findings (P0–P3)

### P0 — Critical (5 findings)

| ID | Finding | File | Line(s) |
|----|---------|------|---------|
| P0-1 | `computeUnrealizedPnL` always returns 0 when stock data exists (cost basis and market value both use current price) | `src/engine/TradingAccounting.ts` | computeCostBasis / computeCurrentMarketValue |
| P0-2 | `computeAccountMetrics` hardcodes `startingBalance: 1000000` | `src/engine/BracketOrderEngineHelpers.ts` | 61 |
| P0-3 | No localStorage integrity protection — all state tamperable via browser console | `src/context/TradingContext.tsx` | 522-539, 778-791 |
| P0-4 | Triggered GTT orders cannot be cancelled (`TRIGGERED → CANCELLED` blocked) | `src/context/TradingContext.tsx` | 173-182, 1203-1234 |
| P0-5 | No CSRF/auth — client-side localStorage can be freely modified to inflate virtual capital | `src/context/TradingContext.tsx` | — |

### P1 — High (7 findings)

| ID | Finding | File | Line(s) |
|----|---------|------|---------|
| P1-1 | No tests for BracketOrderEngine (6 functions untested) | `src/engine/BracketOrderEngine.ts` | — |
| P1-2 | No tests for OCOExecutionEngine (5 functions untested) | `src/engine/OCOExecutionEngine.ts` | — |
| P1-3 | `computePreOrderRiskSnapshot` ignores existing buy reservations | `src/risk/RiskCalculationModel.ts` | 269-425 |
| P1-4 | SELL target price direction not validated vs current market price | `src/context/TradingContext.tsx` | 438-446 |
| P1-5 | Screener RSI shows "—" and Score 50 when insufficient data | `src/pages/Screener.tsx` | — |
| P1-6 | Bracket groups not persisted to localStorage | `src/context/TradingContext.tsx` | 618, 778-791 |
| P1-7 | `executeOCO` realized P&L only computed for SELL legs | `src/engine/OCOExecutionEngine.ts` | 246-258 |

### P2 — Medium (9 findings)

| ID | Finding | File | Line(s) |
|----|---------|------|---------|
| P2-1 | No tests for TechnicalIndicators (EMA, RSI, volume, S/R, technical condition) | `src/analysis/TechnicalIndicators.ts` | — |
| P2-2 | No tests for TradingContext (~1950 lines, no coverage) | `src/context/TradingContext.tsx` | — |
| P2-3 | No component tests for any UI component | `src/components/` | — |
| P2-4 | No integration tests for full order flow | — | — |
| P2-5 | `computeCostBasis` uses current stock price instead of averageBuyPrice | `src/engine/TradingAccounting.ts` | — |
| P2-6 | `activateChildExits` doesn't check if children are already terminal | `src/engine/BracketOrderEngine.ts` | 410-442 |
| P2-7 | No cleanup of orphaned bracket groups | `src/engine/BracketOrderEngine.ts` | 507-518 |
| P2-8 | `generateChartData('1D')` depends on history registry that may be empty | `src/data/mockData.ts` | 296-304 |
| P2-9 | Trade journal deletion has no undo/soft-delete | `src/components/TradeJournal.tsx` | 120-123 |

### P3 — Low (10 findings)

| ID | Finding | File | Line(s) |
|----|---------|------|---------|
| P3-1 | Trade journal uses `alert()` for validation errors | `src/components/TradeJournal.tsx` | 78, 105 |
| P3-2 | OrderDetails doesn't show bracket group association | `src/components/OrderDetails.tsx` | — |
| P3-3 | No keyboard shortcuts | — | — |
| P3-4 | No CSV export of bracket groups or portfolio snapshots | `src/pages/Settings.tsx` | 97-148 |
| P3-5 | Simulation disclosure badge could be more prominent | `src/components/MarketSimulationBar.tsx` | 29-33 |
| P3-6 | No session isolation across tabs | `src/context/TradingContext.tsx` | — |
| P3-7 | `formatRelativeTime` uses `Date.now()` (clock skew) | `src/components/NotificationCenter.tsx` | 40-56 |
| P3-8 | No input sanitization on symbols/company names | `src/context/TradingContext.tsx` | 393-396 |
| P3-9 | Market simulation is deterministic, not real market data | `src/data/mockData.ts` | 71-92 |
| P3-10 | `AccountState.startingBalance` never changes after reset (always INITIAL value) | `src/data/mockData.ts` | 3-10 |

---

## 12. 30-Milestone Development Roadmap

### Phase 1: Critical Stabilization (Milestones 1-5)

**M1 — Fix Unrealized P&L Calculation**  
Modify `computeCostBasis` to use `averageBuyPrice` (not current stock price) so `computeUnrealizedPnL` reflects actual purchase-price-vs-market-price P&L.  
*Files: `src/engine/TradingAccounting.ts`*

**M2 — Fix Hardcoded Starting Balance**  
Change `computeAccountMetrics` in `BracketOrderEngineHelpers.ts` to accept `startingBalance` as a parameter instead of hardcoding `1000000`.  
*Files: `src/engine/BracketOrderEngineHelpers.ts`*

**M3 — Add localStorage Integrity Protection**  
Add integrity checks (HMAC/signature) to `safeLoadJSON` and persistence to detect tampering. Log `INVALID_DATA_REJECTED` events on tamper detection.  
*Files: `src/context/TradingContext.tsx`*

**M4 — Allow TRIGGERED → CANCELLED for GTT Orders**  
Update `isValidTransition` to permit `TRIGGERED → CANCELLED` for GTT/trailing stop orders so users can abort triggered conditional orders.  
*Files: `src/context/TradingContext.tsx:173-182`*

**M5 — Persist Bracket Groups to localStorage**  
Add `bracketGroups` to the persistence `useEffect` block and `safeLoadJSON` initializer.  
*Files: `src/context/TradingContext.tsx:618, 778-791`*

### Phase 2: Bracket/OCO Engine Hardening (Milestones 6-10)

**M6 — Bracket Order Unit Tests**  
Write comprehensive tests for `validateBracketOrder`, `createBracketGroup`, `activateChildExits`, `cancelEntryAndChildren`, `rejectEntryAndChildren`, `findOrphanedChildren`, `getRemainingQuantity`.  
*Files: `src/__tests__/bracketOrderEngine.test.ts` (new)*

**M7 — OCO Execution Engine Unit Tests**  
Write tests for `evaluateOCOTriggers` (all trigger combinations), `executeOCO` (both legs, tie-breaker, revalidation failure), `handlePartialExit`, `cancelAllOCOChildren`.  
*Files: `src/__tests__/ocoExecutionEngine.test.ts` (new)*

**M8 — Fix OCO Realized P&L for BUY Legs**  
Compute realized P&L for BUY leg executions (closing short positions) in `executeOCO`.  
*Files: `src/engine/OCOExecutionEngine.ts:246-258`*

**M9 — Terminal-State Check in `activateChildExits`**  
Add guard to skip activation if child orders are already terminal.  
*Files: `src/engine/BracketOrderEngine.ts:410-442`*

**M10 — Orphaned Bracket Group Cleanup**  
Add `cleanupOrphanedBracketGroups` function and call it in `simulateTick` to remove groups where all orders are terminal.  
*Files: `src/engine/BracketOrderEngine.ts`, `src/context/TradingContext.tsx`*

### Phase 3: Risk & Reservation Model (Milestones 11-15)

**M11 — Pre-Order Risk Snapshot Reservation Awareness**  
Update `computePreOrderRiskSnapshot` to subtract existing buy reservations from available cash before estimating post-BUY cash utilization.  
*Files: `src/risk/RiskCalculationModel.ts`*

**M12 — SELL Target Price Direction Validation**  
Add validation in `validateOrder` that SELL target trigger must be above current market price (for existing holdings).  
*Files: `src/context/TradingContext.tsx:438-446`*

**M13 — Position Sizing Model Unit Tests**  
Write tests for `computePositionSizing`, `calculateRiskAmount`, `calculateRiskPerShare`, `calculateRewardPerShare`, `calculateRiskReward`, `validatePositionInputs`.  
*Files: `src/__tests__/positionSizingModel.test.ts` (new)*

**M14 — Technical Indicators Unit Tests**  
Write tests for `calculateEMA`, `calculateRSI`, `calculateVolumeStats`, `calculateSupportResistance`, `computeTechnicalCondition`.  
*Files: `src/__tests__/technicalIndicators.test.ts` (new)*

**M15 — Reservation Model Edge Case Tests**  
Add tests for revalidation at execution with concurrent orders, partial fills, and zero-quantity holdings.  
*Files: `src/__tests__/reservationModel.test.ts` (extend existing)*

### Phase 4: Testing Coverage Expansion (Milestones 16-20)

**M16 — TradingContext Unit Tests**  
Write tests for `placeOrder`, `cancelOrder`, `processPendingOrders`, `simulateTick`, `placeBracketOrder`, `resetAccount`, `updateSettings`.  
*Files: `src/__tests__/tradingContext.test.ts` (new)*

**M17 — Component Tests**  
Write React component tests for `OrderFilters`, `OrderDetails`, `OrderAnalytics`, `NotificationCenter`, `PositionSizingCalculator`, `TradeJournal`.  
*Files: `src/__tests__/components/*.test.tsx` (new)*

**M18 — Integration Tests**  
Write end-to-end integration tests: complete buy flow, complete sell flow, bracket order flow, OCO execution flow, account reset flow.  
*Files: `src/__tests__/integration/*.test.tsx` (new)*

**M19 — TradingEngine Test Expansion**  
Expand `tradingEngine.test.ts` to cover `enrichHoldings` edge cases (missing stocks, zero quantity) and `aggregatePortfolio` edge cases.  
*Files: `src/__tests__/tradingEngine.test.ts` (extend existing)*

**M20 — Achieve 80%+ Code Coverage**  
Run coverage report and add tests until engine modules and context reach 80% line coverage.  
*Files: All test files*

### Phase 5: UI/UX & Data Improvements (Milestones 21-25)

**M21 — Trade Journal Inline Validation**  
Replace `alert()` calls with inline form error messages in `TradeJournal`.  
*Files: `src/components/TradeJournal.tsx`*

**M22 — Bracket Group Badge in OrderDetails**  
Show bracket group association in `OrderDetails` and order list rows.  
*Files: `src/components/OrderDetails.tsx`, `src/pages/Orders.tsx`*

**M23 — CSV Export for Bracket Groups & Snapshots**  
Add export buttons for bracket groups and portfolio snapshots in Settings.  
*Files: `src/pages/Settings.tsx`*

**M24 — Prominent Simulation Disclosure**  
Add a persistent, dismissible banner on Dashboard and Markets pages stating "SIMULATED MARKET DATA — Not real exchange prices."  
*Files: `src/pages/Dashboard.tsx`, `src/pages/Markets.tsx`*

**M25 — Keyboard Shortcuts**  
Add keyboard shortcuts (e.g., Ctrl+K for order entry, Escape to cancel, Space to toggle simulation).  
*Files: `src/App.tsx` or new `src/components/KeyboardShortcuts.tsx`*

### Phase 6: Market Data & Screener (Milestones 26-30)

**M26 — Screener Insufficient Data Handling**  
Show "Insufficient data" state instead of score 50 / RSI "—" when chart data < 50 points.  
*Files: `src/pages/Screener.tsx`*

**M27 — `generateChartData('1D')` History Fallback**  
Ensure 1D chart always falls back to synthetic data when history registry is empty, with consistent behavior across sessions.  
*Files: `src/data/mockData.ts`*

**M28 — Market Event Log Export**  
Add export for market event log (replay events, tick events, invalid data rejections).  
*Files: `src/pages/Settings.tsx`*

**M29 — Session Isolation Warning**  
Add warning when TradeLab is opened in multiple tabs simultaneously.  
*Files: `src/context/TradingContext.tsx`*

**M30 — Documentation & Runbook**  
Create operator runbook: how to reset account, how to interpret P&L, simulation limitations, data export procedure.  
*Files: Documentation (new)*

---

## Disclaimer

**This is a read-only audit report.** No source files were modified, deleted, committed, or pushed during this audit. No new features were implemented. The findings and roadmap above are recommendations for the product team to review. Do not begin implementing Day 31 or any remediation items until this report has been reviewed and approved.

**Report location:** `TRADELAB_MASTER_AUDIT.md` (this file)  
**Repository:** `C:\Users\ABHISHEK Y S\Downloads\tradelab`  
**Branch:** `main`  
**Git user:** Abhishek
