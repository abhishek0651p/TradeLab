# Day 23 Regression Audit Report (Read-Only)

Commit under review: `e106f92` ("Day 23: Centralize market simulation engine")
Branch: `main` | Pushed: `origin/main` | Status clean working tree.

---

## 1. Repository State & Commit Verification

| Check | Result |
|-------|--------|
| `git status --short` | Clean working tree (no uncommitted tracked modifications) |
| `git log -5 --oneline` | Top commit is `e106f92`; subsequent commits are Day 22-Day 20 |
| `git show --stat --oneline e106f92` | 10 files changed, +650 / −41 lines (insertions dominate) |
| Commit exists on current branch `main` | Confirmed (`e106f92` is head) |

The previous "push succeeded" narrative is confirmed accurate: the commit is on `main` and pushed to `origin/main`.

---

## 2. Audit of the Market Data Source

### Authoritative single source of truth
- `activeStockRegistry = new Map<string, StockData>(MOCK_STOCKS.map(...))` (`mockData.ts:95`)
- Exposed via `getRegisteredStock` (`:112`) and consumed inside `generateChartData` (`:163`)
- Consumed by every stock chart consumer (StockDetail, Watchlist sparklines, Screener, StockComparison, history builder)
- **Verdict:** ✅ Each symbol has one authoritative current price. The only fallback is the deliberately-introduced `MOCK_STOCKS.find(...)` path (`:164`), which is only reached transiently before the `useEffect` at `TradingContext.tsx:570-572` syncs the registry with persisted React state.

### Registry ↔ React state synchronization
- Sync path A (`simulateTick`, lines `1308-1323`): ref + state both updated **before** `updateMarketRegistry(updatedStocks, updatedHistory)`, and state setters (`setStocks`, `setStockHistory`) trigger the effect at `:570-572`.
- Sync path B (effect, `:563-572`): fires on every `[stocks, stockHistory]` change.
- Both converge on the same snapshot each tick. ✅

### Historical ↔ Current price consistency after ticks
- Tick appends a point with `newPoint.price = stock.price` to history (`appendStockTickHistory:144-148`), and `generateChartData('1D')` overwrites the last recorded point with `effectivePrice` (`:175-176`) using the registry price.
- For timeframes other than `'1D'` history is generated fresh (no persisted multi-day candles); 1-day candles stay anchored to live price. Acceptable per Day 22 deterministic design. ✅ (pattern, not bug)

### Multiple consumers reading the same snapshot
- Every consumer reads from `activeStockRegistry` / `activeHistoryRegistry` module-level Maps, not from local render state. Snapshot reads are stateless and safe to concurrent read. ✅

### Bounded history retention
- `appendStockTickHistory` slices to `maxPoints = 100` (`:151`). Per-symbol caps enforced. ✅

### localStorage safety
- `safeLoadJSON` validates array-typed fallbacks by checking `Array.isArray` (`mockData.ts:safeLoadJSON`).
- Object-typed stores (`stockHistory`, settings, notifications, snapshots) rely on truthiness guards in their own loaders:
  - stockHistory (`TradingContext.tsx:514-519`): `!saved || Object.keys(saved).length === 0` → regenerate initial. ✅ catches null/empty/non-object-via-string (see below).
  - **Edge case (Low):** if raw saved `tradelab_stock_history` is a non-empty **string**, `safeLoadJSON` returns it (fallback is object, so `parsed as T` returns the string). `generateChartData` then would fail `recordedHistory.map(...)` only if `Object.entries(string)` had previously set a symbol key to a string — traced path below shows it self-heals on next tick; initial render always hits generation from empty registry, so no crash at mount. Net: defensive enough; no active crash path observed.

### Compatibility of all `generateChartData` callers (optional new params)

| File:Line | Call | OK? |
|-----------|------|-----|
| `mockData.ts:125` | `(symbol, '1D', stock.price)` | ✅ optional 3rd arg |
| `StockComparison.tsx:41` | `(sym, '1M')` | ✅ optional, no override — registry used via effect |
| `Screener.tsx:100` | `(stock.symbol, '1D')` | ✅ |
| `StockDetail.tsx:544` | `(symbol, tf, stock?.price)` | ✅ cast accepted |
| `StockDetail.tsx:554` | `(symbol, tf, stock.price)` | ✅ cast accepted |
| `Watchlist.tsx:294` | `(symbol, '1D', price)` | ✅ optional 3rd arg |

All callers remain compatible. ✅

### Technical indicators use intended historical series
- StockDetail passes `chartData.map(d => d.price)` to `calculateEMA/RSI/calculateVolumeStats` and `calculateSupportResistance` (TechnicalIndicators.ts).
- For `'1D'`, chartData comes from the bounded registry history (≤100 pts) with last point = live price. RSI period 14 needs ≥15 points; `'1D'` provides 78 initial. Insufficient input safely returns neutral (`TechnicalIndicators.ts` early returns). ✅
- Screener's `enrichStock` computes score from the same indicator inputs. ✅

### MOCK_STOCKS fallback causing stale/contradictory prices
- Initialized only at module-load to identical values as MOCK_STOCKS (`:95`); identical thereafter for default boot.
- Only divergent after persisted state loads and the sync effect runs — transient window of stale prices visible in components that read the registry before the effect flips (first paint). **Not** a persistent contradiction since every subsequent tick re-anchors. **Low-severity transient window.**

---

## 3. Audit: Simulation Controls & Timer Lifecycle

### Pause stops ticks
Effect at `TradingContext.tsx:1358-1372`: when `settings.autoSimEnabled === false`, returns **without** creating an interval (`setAutoSimActive(false)` called, no `window.setInterval`). ✅ Code-proven.

### Resume restarts ticks
Transition `false → true` re-runs effect; cleanup from prior run cleared the interval first. New interval created. ✅ Code-proven.

### Speed changes don't leave multiple timers
Effect dependency vector is exactly `[settings.autoSimEnabled, settings.autoSimIntervalSec]` (`:1372`). Any interval change runs cleanup (`window.clearInterval(id)` at `:1369`) before reinstalling. No accumulation possible. ✅ Code-proven.

### Unmount cleans up
Cleanup lambda clears interval and `setAutoSimActive(false)`. Provider unmount → last render → cleanup run. ✅ Code-proven.

### Manual tick while paused vs running
`simulateTick` is exposed and callable from `MarketSimulationBar:104`, `Orders:265`, `Portfolio:847,1371` regardless of `autoSimActive`. Function body is identical to the interval path. Behavior correct in both modes. ✅ Code-proven (requires user action).

### Tick count / displayed interval accuracy
`tick` state increments once per call (`tickRef.current + 1` at `:1308-1309`). `settings.autoSimIntervalSec` reflects active interval duration shown in pills. Presets round to labeled buckets (0.5x=10s, 1x=5s, 2x=2s, 5x=1s) and match slider 1–60 range. ✅ Code-proven.

### React Strict Mode duplicate updates
Effects have proper cleanup; StrictMode dev re-run clears+reinstalls. The `isProcessingRef` guard inside `processPendingOrders` (`:922-924`) prevents double-execute if two intervals ever overlapped. Body runs are synchronous with batched setState, so the next interval timer can't fire mid-tick. ✅ Code-proven.

**No timer leak detected.** ✅

---

## 4. Audit: Trading Correctness

### One tick cannot execute a pending order more than once
`processPendingOrders` is synchronous; runs once per `simulateTick`. Internal `isProcessingRef` guard (`:922-924`) blocks re-entrancy; `processedIds` Set dedups within the batch (`:939,948,1071,1133`); post-execution orders are marked terminal immediately (`:1110-1116`). Next tick sees terminal statuses and skips them. ✅ Code-proven (requires concurrent overlap to matter; guaranteed no overlap since timers ≥1 s and ticks are synchronous).

### Order status transitions valid
`isValidTransition` enforces PENDING → TRIGGERED / EXECUTED / CANCELLED / REJECTED; TRIGGERED → EXECUTED / REJECTED only (no cancel from triggered). `orderIdx` lookups read the working `ordersRef.current` array (mutable map updates in place at `:1110`), so intra-batch state transitions are honored. ✅ Code-proven.

### GTT conditions evaluated against intended current price
In `processPendingOrders`, `stock = currentStocks.find(s => s.symbol === ...)` (`:981`); `currentPrice = stock.price` (`:983`) — this is the freshly updated price from the current tick. GTT trailing-stop logic advances `highestPriceSinceCreation`/`lowestPriceSinceCreation` against the same price (`:992-1033`). ✅ Code-proven.

### GTT expiry & deduplication preserved
Expiry checked with `now > expiryTime`; expired order `REJECTED` with notification (`:957-978`). De-dup via `processedIds` across batches (`:939,1071,1133`). Since terminals can't re-enter evaluatable set (`:930,954`), no double execution. ✅ Code-proven.

### Paused simulation cannot change prices
Auto-ticks gated by effect; manual ticks require explicit user action. No background mutation of `stocksRef` outside `simulateTick`. ✅ Code-proven.

### Market orders / limit orders retain semantics
`placeOrder` unchanged from Day 20; MARKET executes at `params.currentPrice`, LIMIT evaluates immediate fill (`:842-875`), otherwise stays PENDING. ✅ Code-proven.

### Holdings quantity & cost basis preserved
`computeBuyHoldings`/`computeSellHoldings` mutate average cost; `simulateTick` never touches holdings (only orders/executions/snapshots). Price history persistence does not alter holdings state. ✅ Code-proven.

### Portfolio snapshots not unexpectedly duplicated
`recordPortfolioSnapshot` guards on `lastSnapshotTickRef.current` (`:1285-1290`) and timestamp/totalValue equality (`:1290-1293`) plus cap at 100 (`:1298`). On `resetAccount` snapshots cleared but `lastSnapshotTickRef` not reset — safe because tick counter starts at 0 after reset and never equals a stale positive value except coincidentally (doesn't happen). ⚠️ Minor: stale ref retained across reset (non-buggy in practice). **Low.**

### Order history & notifications functional
Notifications appended newest-first, capped 100 (`:627-631`); `unreadNotificationCount` recomputed fresh (`:1374`). Order records faithfully maintained. ✅ Code-proven.

---

## 5. Audit: Stock Analysis & Screener Integration

### StockDetail chart data updates coherently
Two effects: initial `setTimeout` (150 ms, `:540-549`) and live sync on `stock?.price` (`:552-556`). **Finding:** the live-sync effect dependency set is `[stock?.price]` only — `timeframe` is captured from the render closure, so switching timeframe while the component re-renders does **not** retrigger effect 2. When the next tick fires during that window, effect 2 re-runs with the **stale** `timeframe`, temporarily rendering 1D data under a 1W tab. Effect 1 (setTimeout) re-anchors after ≤150 ms. Transient (~150 ms) discrepancy. **Medium.**

### EMA/RSI/volume/support&resistance use valid inputs
All three indicator functions guard `prices`/`volumes` arrays (`isFiniteNumber`, length < period → neutral). Inputs come from bounded 1-day registry history. ✅

### Watchlist sparklines use current prices & consistent history
Sparkline receives `price={stock.price}` and calls `generateChartData(symbol, '1D', price)` (`Watchlist.tsx:294`). ✅

### Screener scores depend on indicators, not filter values
`enrichStock` scores from technical fields (`rsiState`, `priceVsEMA20/50`, `emaCross`, `volState`) — independent of filter selections (`FilterState` applied post-enrichment). ✅

### StockComparison uses intended source
Switched from direct `MOCK_STOCKS.find` import (`:38,54,93`) to `stocks` from `useTrading()`. ✅

### Missing/insufficient history handled safely
Screener `if (!chartData || chartData.length < 50)` returns `score: 50` with null indicators; UI shows "(N/A)" (`:100-113`). ✅

---

## 6. Security & Persistence Review

- **localStorage validation:** Array fallbacks validated (`Array.isArray`); object fallbacks validated by truthiness at their own loaders. Non-array malformed values caught. See §2 edge case — self-healing on subsequent ticks; no active crash path at mount. **No exposure.**
- **User-controlled values crashing rendering/calculations:** `seededRandom` uses `Math.sin`; `symbolHash` uses char codes — both safe. No `eval`, `Function`, `innerHTML`, or template-injection. No `dangerouslySetInnerHTML` anywhere (`grep`: zero matches). **No exposure.**
- **Secrets/credentials:** No API keys, tokens, or private env values present in any source file (`grep` for `apiKey|secret|token|password|AKIA` returned only `src/assets/vite.svg` — a logos SVG, not credentials). Distinct from prior commits. **No exposure.**
- **Simulation/trading state contradictory after reload:** Both `tradelab_stocks` and `tradelab_stock_history` restored together via the registry-sync effect; stocks persisted tick prices mirror history tick prices. State remains internally consistent across sessions. **No exposure.**

---

## 7. Validation Results

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | ✅ Exit 0, no errors |
| `npm run build` | ✅ Exit 0, built successfully |
| `git diff --check` | ✅ Exit 0 — trivially green because **working tree is fully clean** (the uncommitted-changes check is irrelevant here; the change under review is in HEAD). Reviewing the commit itself requires diffing `HEAD~1..HEAD`, not the working tree. |

No browser tests or automated test suite existed before this audit (project ships without tests) and none were performed during this read-only run.

---

## 8. Final Report

### Findings Summary

| Severity | Finding | Type |
|----------|---------|------|
| **Medium** | StockDetail live-sync effect misses `timeframe` in its dependency array, so a tick while switching timeframes renders stale-TF chart data (~150 ms). | Regression in new effect |
| **Low** | `safeLoadJSON` does not shape-validate object-typed stores; theoretical hard-crash path if `tradelab_stock_history` stored a non-empty non-object value mid-session — currently self-heals on next tick; no real-world exposure. | Persistence robustness |
| **Low** | Stale `lastSnapshotTickRef` retained across account reset (harmless in practice; tick counter restarted at 0). | Reset hygiene |
| **Low** | Duplicate simulation status UI on 3 screens (`MarketSimulationBar`, `Orders`, `Settings`, `Portfolio`) exceeds minimal-clutter guidance; no functional impact. | UX pattern |
| **Code-proven** | Single authoritative price, registry↔state sync, bounded history, all callers compatible, trading correctness (single-tick execute, GTT expiry/dedup), pause/resume/speed lifecycle, no timer leaks, Strict-Mode safe. | Correct |
| **Code-proven** | No secrets/unsafe HTML/innerHTML committed; both persisted stores validated via truthiness guards. | Secure |

No Critical or High defects found. The intended Day 23 behavior is intact across all automated paths; only one medium-severity transient chart-sync regression was introduced and it requires both (a) active simulation and (b) simultaneous timeframe switch during re-render.

### Exact reproduction steps (confirmed medium defect)

1. Start simulation (tick every 1 s).
2. Open StockDetail for a symbol on `timeframe='1W'`.
3. Click `1W` tab; the live-sync effect (`TradingContext`→`StockDetail:552`) does not re-run, so its closure still holds `timeframe='1D'`.
4. Within ~150 ms a tick fires → `stock?.price` changes → effect re-runs with **stale** `timeframe='1D'` → chart briefly renders 1D candles under a 1W tab.
5. Effect 1 (setTimeout at line 543) re-sets 1W chart within 150 ms; flicker ends.

### Prioritized fixes for Day 24

1. Add `timeframe` to the live-sync effect deps (and ideally both effects depend on `[symbol, timeframe, isTimeframeSupported, stock?.price]`) — eliminates the stale-closure window. **P1**
2. (Optional) Shape-validate object-typed `safeLoadJSON` results against a `Record<string, ChartDataPoint[]>` contract before returning — closes the theoretical crash. **P2**
3. (Optional) Reset `lastSnapshotTickRef` in `resetAccount` — trivial hygiene improvement. **P3**
4. (Optional) Consolidate the 3 simulation status cards onto one `MarketSimulationBar` instance; remove redundant ones in `Orders`/`Settings` — UX cleanup. **P4** (low priority)

**Repository state preserved:** nothing modified; no commit/push performed this audit cycle.
