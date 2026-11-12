/* ── Day 30.3: Bracket Order Persistence, Recovery & State Reconciliation ────────
Pure, deterministic recovery and persistence functions for bracket order groups.
Validates, reconciles, and cleans up orphaned or inconsistent state safely.
Never mutates financial state or executes trades during recovery.
──────────────────────────────────────────────────────────────────────────────────── */

import { BracketGroup, Holding, Order, OrderStatus } from '../types';

export const BRACKET_STORAGE_KEY = 'tradelab_bracket_groups';
export const BRACKET_STORAGE_VERSION = 1;

/** Storage schema envelope for versioned persistence */
export interface VersionedBracketStorage {
  version: number;
  storageKey?: string;
  bracketGroups: BracketGroup[];
}

export interface ReconcileResult {
  reconciledGroups: BracketGroup[];
  reconciledOrders: Order[];
  issuesDetected: string[];
}

/** Day 30.3.1: Discriminated result for safe bracket storage inspection */
export type BracketStorageLoadResult =
  | { status: 'missing'; groups: BracketGroup[] }
  | { status: 'valid'; groups: BracketGroup[] }
  | { status: 'unsupported_version'; groups: BracketGroup[]; raw: string }
  | { status: 'malformed'; groups: BracketGroup[]; raw: string }
  | { status: 'invalid_envelope'; groups: BracketGroup[]; raw: string };

/** Day 30.3.2: Status of bracket persistence availability */
export type BracketPersistenceStatus =
  | 'AVAILABLE'
  | 'UNSUPPORTED_VERSION'
  | 'MALFORMED'
  | 'INVALID_ENVELOPE';

const TERMINAL_STATUSES: readonly OrderStatus[] = ['EXECUTED', 'CANCELLED', 'REJECTED'];
const isTerminalStatus = (status: OrderStatus): boolean => TERMINAL_STATUSES.includes(status);

/** Validate if an unknown value conforms to the BracketGroup interface */
export const isValidBracketGroup = (v: unknown): v is BracketGroup => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;

  const b = v as Record<string, unknown>;

  return (
    typeof b.id === 'string' && b.id.trim().length > 0 &&
    typeof b.parentOrderId === 'string' && b.parentOrderId.trim().length > 0 &&
    typeof b.stopLossOrderId === 'string' && b.stopLossOrderId.trim().length > 0 &&
    typeof b.targetOrderId === 'string' && b.targetOrderId.trim().length > 0 &&
    typeof b.positionId === 'string' && b.positionId.trim().length > 0 &&
    typeof b.ocoGroupId === 'string' && b.ocoGroupId.trim().length > 0 &&
    typeof b.symbol === 'string' && b.symbol.trim().length > 0 &&
    (b.side === 'BUY' || b.side === 'SELL') &&
    typeof b.entryPrice === 'number' && Number.isFinite(b.entryPrice) && b.entryPrice > 0 &&
    typeof b.stopLossPrice === 'number' && Number.isFinite(b.stopLossPrice) && b.stopLossPrice > 0 &&
    typeof b.targetPrice === 'number' && Number.isFinite(b.targetPrice) && b.targetPrice > 0 &&
    typeof b.originalQuantity === 'number' && Number.isInteger(b.originalQuantity) && b.originalQuantity > 0 &&
    typeof b.remainingQuantity === 'number' && Number.isInteger(b.remainingQuantity) && b.remainingQuantity >= 0 && b.remainingQuantity <= b.originalQuantity &&
    (b.status === 'ACTIVE' || b.status === 'COMPLETED' || b.status === 'CANCELLED') &&
    typeof b.createdAt === 'number' && Number.isFinite(b.createdAt) &&
    typeof b.updatedAt === 'number' && Number.isFinite(b.updatedAt)
  );
};

/** Serialize bracket groups to versioned JSON string */
export const serializeBracketGroups = (groups: BracketGroup[]): string => {
  const payload: VersionedBracketStorage = {
    version: BRACKET_STORAGE_VERSION,
    storageKey: BRACKET_STORAGE_KEY,
    bracketGroups: groups,
  };
  return JSON.stringify(payload);
};

/**
 * Deserialize and validate bracket groups from storage.
 * Handles:
 * - null / undefined / empty string -> returns []
 * - malformed JSON -> returns []
 * - unversioned arrays -> backward compatible
 * - versioned object envelope
 * - unsupported future versions -> returns [] safely without crashing
 */
export const deserializeBracketGroups = (raw: unknown): BracketGroup[] => {
  if (!raw) return [];

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (!parsed || typeof parsed !== 'object') return [];

  let candidates: unknown[] = [];

  if (Array.isArray(parsed)) {
    // Legacy / unversioned array format
    candidates = parsed;
  } else {
    const envelope = parsed as Record<string, unknown>;
    // Check version compatibility
    if (typeof envelope.version === 'number') {
      if (envelope.version !== BRACKET_STORAGE_VERSION) {
        console.warn(`[deserializeBracketGroups] Unsupported storage version ${envelope.version}; expected ${BRACKET_STORAGE_VERSION}`);
        return [];
      }
      if (Array.isArray(envelope.bracketGroups)) {
        candidates = envelope.bracketGroups;
      }
    }
  }

  // Filter valid bracket groups
  return candidates.filter(isValidBracketGroup);
};

/**
 * Day 30.3.1: Inspect raw bracket storage and return a discriminated result.
 * Unlike deserializeBracketGroups, this function preserves the original raw
 * string for unsupported, malformed, or invalid storage so the caller can
 * protect it from being overwritten.
 *
 * Does NOT load incompatible data into active bracket state.
 */
export const inspectBracketStorage = (
  raw: string | null
): BracketStorageLoadResult => {
  if (raw === null) {
    return { status: 'missing', groups: [] };
  }

  if (raw.trim().length === 0) {
    return { status: 'malformed', groups: [], raw };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'malformed', groups: [], raw };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { status: 'invalid_envelope', groups: [], raw };
  }

  let candidates: unknown[];

  if (Array.isArray(parsed)) {
    // Legacy / unversioned array format — treat as valid for backward compat
    candidates = parsed;
  } else {
    const envelope = parsed as Record<string, unknown>;

    if (typeof envelope.version !== 'number') {
      return { status: 'invalid_envelope', groups: [], raw };
    }

    if (envelope.version !== BRACKET_STORAGE_VERSION) {
      return { status: 'unsupported_version', groups: [], raw };
    }

    if (!Array.isArray(envelope.bracketGroups)) {
      return { status: 'invalid_envelope', groups: [], raw };
    }

    candidates = envelope.bracketGroups;
  }

  // If any group fails validation, treat entire envelope as invalid
  // to avoid silently discarding groups and overwriting their storage.
  if (!candidates.every(isValidBracketGroup)) {
    return { status: 'invalid_envelope', groups: [], raw };
  }

  return {
    status: 'valid',
    groups: candidates as BracketGroup[],
  };
};

/**
 * Reconcile bracket groups against loaded orders and holdings.
 * Ensures:
 * 1. Duplicate bracket IDs are deduped (keeping latest updatedAt).
 * 2. Terminal groups remain terminal and cannot reactivate.
 * 3. Groups missing parent orders are marked CANCELLED.
 * 4. Groups missing child orders are marked CANCELLED.
 * 5. Groups with 0 remaining quantity are marked COMPLETED.
 * 6. Groups whose underlying position no longer exists are marked CANCELLED.
 * 7. Active child orders have their quantity reconciled to remainingQuantity.
 * 8. Independent orders outside bracket groups are preserved completely untouched.
 * 9. Pure function: does NOT execute orders or mutate financial account state.
 */
export const reconcileBracketState = (
  rawGroups: BracketGroup[],
  orders: Order[],
  holdings: Holding[]
): ReconcileResult => {
  const issuesDetected: string[] = [];
  const workingOrders: Order[] = orders.map(o => ({ ...o }));

  // 1. Deduplicate bracket groups by ID (keep the one with latest updatedAt)
  const dedupedMap = new Map<string, BracketGroup>();
  for (const group of rawGroups) {
    if (!group || typeof group !== 'object') {
      issuesDetected.push(`Discarded invalid bracket group item`);
      continue;
    }
    const bgCandidate = { ...(group as BracketGroup) };
    if (bgCandidate.remainingQuantity > bgCandidate.originalQuantity) {
      issuesDetected.push(`Bracket group ${bgCandidate.id} remaining quantity exceeded original quantity; clamped`);
      bgCandidate.remainingQuantity = bgCandidate.originalQuantity;
    }
    if (!isValidBracketGroup(bgCandidate)) {
      issuesDetected.push(`Discarded invalid bracket group item`);
      continue;
    }
    const existing = dedupedMap.get(bgCandidate.id);
    if (existing) {
      issuesDetected.push(`Duplicate bracket group ID detected: ${bgCandidate.id}`);
      if (bgCandidate.updatedAt > existing.updatedAt) {
        dedupedMap.set(bgCandidate.id, bgCandidate);
      }
    } else {
      dedupedMap.set(bgCandidate.id, bgCandidate);
    }
  }

  const reconciledGroups: BracketGroup[] = [];
  const now = new Date().toISOString();

  // Helper to safely cancel order if it is non-terminal
  const cancelOrderIfActive = (orderId: string, reason: string) => {
    const idx = workingOrders.findIndex(o => o.id === orderId);
    if (idx >= 0 && !isTerminalStatus(workingOrders[idx].status)) {
      workingOrders[idx] = {
        ...workingOrders[idx],
        status: 'CANCELLED' as OrderStatus,
        cancelledAt: now,
        rejectionReason: reason,
      };
      issuesDetected.push(`Cancelled order ${orderId}: ${reason}`);
    }
  };

  for (const group of dedupedMap.values()) {
    const bg: BracketGroup = { ...group };

    // Case 1: Group is already terminal (COMPLETED or CANCELLED)
    if (bg.status === 'COMPLETED' || bg.status === 'CANCELLED') {
      // Ensure any dangling child orders are cancelled so they can never fire
      cancelOrderIfActive(bg.stopLossOrderId, `Bracket group ${bg.id} is terminal (${bg.status})`);
      cancelOrderIfActive(bg.targetOrderId, `Bracket group ${bg.id} is terminal (${bg.status})`);
      reconciledGroups.push(bg);
      continue;
    }

    // Case 2: Group is marked ACTIVE but remainingQuantity is 0
    if (bg.remainingQuantity === 0) {
      bg.status = 'COMPLETED';
      bg.updatedAt = Date.now();
      cancelOrderIfActive(bg.stopLossOrderId, `Bracket group ${bg.id} remaining quantity is 0`);
      cancelOrderIfActive(bg.targetOrderId, `Bracket group ${bg.id} remaining quantity is 0`);
      issuesDetected.push(`Bracket group ${bg.id} had 0 remaining quantity; marked COMPLETED`);
      reconciledGroups.push(bg);
      continue;
    }

    // Case 3: Parent entry order check
    const parentOrder = workingOrders.find(o => o.id === bg.parentOrderId);
    if (!parentOrder) {
      bg.status = 'CANCELLED';
      bg.updatedAt = Date.now();
      cancelOrderIfActive(bg.stopLossOrderId, `Parent order ${bg.parentOrderId} missing`);
      cancelOrderIfActive(bg.targetOrderId, `Parent order ${bg.parentOrderId} missing`);
      issuesDetected.push(`Bracket group ${bg.id} missing parent order; marked CANCELLED`);
      reconciledGroups.push(bg);
      continue;
    }

    // If parent was rejected or cancelled, entry never happened
    if (parentOrder.status === 'REJECTED' || parentOrder.status === 'CANCELLED') {
      bg.status = 'CANCELLED';
      bg.updatedAt = Date.now();
      cancelOrderIfActive(bg.stopLossOrderId, `Parent order ${parentOrder.id} was ${parentOrder.status}`);
      cancelOrderIfActive(bg.targetOrderId, `Parent order ${parentOrder.id} was ${parentOrder.status}`);
      issuesDetected.push(`Bracket group ${bg.id} parent was ${parentOrder.status}; marked CANCELLED`);
      reconciledGroups.push(bg);
      continue;
    }

    // Case 4: Child exit orders check
    const slIdx = workingOrders.findIndex(o => o.id === bg.stopLossOrderId);
    const tgtIdx = workingOrders.findIndex(o => o.id === bg.targetOrderId);

    if (slIdx < 0 || tgtIdx < 0) {
      // Missing one or both child orders breaks OCO
      bg.status = 'CANCELLED';
      bg.updatedAt = Date.now();
      cancelOrderIfActive(bg.stopLossOrderId, `Child exit order missing from bracket ${bg.id}`);
      cancelOrderIfActive(bg.targetOrderId, `Child exit order missing from bracket ${bg.id}`);
      issuesDetected.push(`Bracket group ${bg.id} missing child exit order; marked CANCELLED`);
      reconciledGroups.push(bg);
      continue;
    }

    const slOrder = workingOrders[slIdx];
    const tgtOrder = workingOrders[tgtIdx];

    // If both child orders are terminal, bracket is COMPLETED
    if (isTerminalStatus(slOrder.status) && isTerminalStatus(tgtOrder.status)) {
      bg.status = 'COMPLETED';
      bg.remainingQuantity = 0;
      bg.updatedAt = Date.now();
      issuesDetected.push(`Both child orders terminal for bracket ${bg.id}; marked COMPLETED`);
      reconciledGroups.push(bg);
      continue;
    }

    // Case 5: Position / Holdings check for long positions (BUY bracket)
    if (bg.side === 'BUY') {
      const holding = holdings.find(h => h.symbol === bg.symbol);
      const holdingQty = holding ? holding.quantity : 0;

      if (holdingQty <= 0) {
        // Underlying position no longer exists
        bg.status = 'CANCELLED';
        bg.remainingQuantity = 0;
        bg.updatedAt = Date.now();
        cancelOrderIfActive(bg.stopLossOrderId, `Position for ${bg.symbol} no longer exists`);
        cancelOrderIfActive(bg.targetOrderId, `Position for ${bg.symbol} no longer exists`);
        issuesDetected.push(`Position for bracket ${bg.id} (${bg.symbol}) no longer exists; marked CANCELLED`);
        reconciledGroups.push(bg);
        continue;
      }

      if (holdingQty < bg.remainingQuantity) {
        issuesDetected.push(`Clamped remaining quantity for bracket ${bg.id} from ${bg.remainingQuantity} to holding quantity ${holdingQty}`);
        bg.remainingQuantity = holdingQty;
        bg.updatedAt = Date.now();
      }
    }

    // Case 6: Parent entry executed -> child orders should be TRIGGERED and match remainingQuantity
    if (parentOrder.status === 'EXECUTED') {
      // Reconcile child orders if non-terminal
      if (!isTerminalStatus(slOrder.status)) {
        workingOrders[slIdx] = {
          ...slOrder,
          status: 'TRIGGERED' as OrderStatus,
          quantity: bg.remainingQuantity,
        };
      }
      if (!isTerminalStatus(tgtOrder.status)) {
        workingOrders[tgtIdx] = {
          ...tgtOrder,
          status: 'TRIGGERED' as OrderStatus,
          quantity: bg.remainingQuantity,
        };
      }
    } else if (parentOrder.status === 'PENDING') {
      // Entry still pending -> children remain PENDING
      if (!isTerminalStatus(slOrder.status)) {
        workingOrders[slIdx] = {
          ...slOrder,
          status: 'PENDING' as OrderStatus,
          quantity: bg.remainingQuantity,
        };
      }
      if (!isTerminalStatus(tgtOrder.status)) {
        workingOrders[tgtIdx] = {
          ...tgtOrder,
          status: 'PENDING' as OrderStatus,
          quantity: bg.remainingQuantity,
        };
      }
    }

    reconciledGroups.push(bg);
  }

  return {
    reconciledGroups,
    reconciledOrders: workingOrders,
    issuesDetected,
  };
};

