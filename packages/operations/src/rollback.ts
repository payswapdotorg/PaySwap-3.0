/**
 * @payswap/operations — rollback as a first-class artifact (P8-W3, law 4).
 *
 * REAUTHORED from payswap.org@8a735bf packages/operations/src/recovery.ts
 * + provider-rollout.ts (the rollback/deactivation half) onto the
 * canonical architecture. The laws:
 *
 * - ROLLBACK IS VERSIONED + DIGEST-CHAINED: every promotion record and
 *   every rollback record carries a version and a content digest; the
 *   ledger is FUNCTIONAL and append-only — appending returns a NEW
 *   ledger, history is never rewritten.
 * - A ROLLBACK RECORD EXISTS FOR EVERY PROMOTION RECORD: checkRollback
 *   Coverage fails closed on any promotion without its rollback record
 *   (an unrollbackable promotion cannot ship).
 * - COMPENSATION EVIDENCE: a rollback record enumerates what it OWES/
 *   UNDOES (typed compensation entries — compensation.ts).
 * - The ORDER-INDEPENDENCE + IDEMPOTENCE proofs and the rehearsal drill
 *   live in compensation.ts (the provable laws).
 *
 * Deterministic only: pure functions; caller-supplied ISO-8601 UTC
 * timestamps; no execution of anything.
 */

import { contentDigest, deepFreeze } from "./digest.js";
import type { CompensationEntry } from "./compensation.js";

/** Raised when the rollback contract is violated. */
export class RollbackContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RollbackContractError";
  }
}

const ISO_8601_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

// ---------------------------------------------------------------------------
// Promotion records (what a rollback undoes)
// ---------------------------------------------------------------------------

/** A promotion of a release identity into an environment. */
export interface PromotionRecord {
  readonly promotionId: string;
  /** Procedure version — historical records bind to the executed version. */
  readonly version: number;
  /** The deployment identity's chain digest this promotion carries. */
  readonly releaseIdentityDigest: string;
  /** Caller-supplied ISO-8601 UTC timestamp. */
  readonly promotedAt: string;
  readonly promotedBy: string;
  readonly digest: string;
}

/** Assemble a digest-chained promotion record (fail-closed). */
export function definePromotionRecord(input: {
  readonly promotionId: string;
  readonly version: number;
  readonly releaseIdentityDigest: string;
  readonly promotedAt: string;
  readonly promotedBy: string;
}): PromotionRecord {
  if (input.promotionId.length < 3) {
    throw new RollbackContractError("promotionId must be a non-trivial string");
  }
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new RollbackContractError("version must be a positive integer");
  }
  if (input.releaseIdentityDigest.length < 3) {
    throw new RollbackContractError(
      "a promotion carries its release identity digest",
    );
  }
  if (!ISO_8601_UTC_PATTERN.test(input.promotedAt)) {
    throw new RollbackContractError("promotedAt must be ISO-8601 UTC");
  }
  if (input.promotedBy.length < 2) {
    throw new RollbackContractError("promotedBy is required (lineage)");
  }
  const body = {
    promotionId: input.promotionId,
    version: input.version,
    releaseIdentityDigest: input.releaseIdentityDigest,
    promotedAt: input.promotedAt,
    promotedBy: input.promotedBy,
  };
  return deepFreeze({ ...body, digest: contentDigest(body) });
}

// ---------------------------------------------------------------------------
// Rollback records
// ---------------------------------------------------------------------------

export type RollbackMode =
  | "REVERSIBLE"
  | "COMPENSATING_ACTION"
  | "IRREVERSIBLE_WITH_AUDIT";

/** A versioned rollback artifact targeting one promotion. */
export interface RollbackRecord {
  readonly rollbackId: string;
  readonly version: number;
  /** The promotion this rollback undoes (must exist in the ledger). */
  readonly targetsPromotionId: string;
  readonly mode: RollbackMode;
  readonly compensation: readonly CompensationEntry[];
  /**
   * The operator authorization evidence reference — a rollback is
   * OPERATOR-AUTHORIZED execution, never ambient (law 9).
   */
  readonly operatorAuthorizationRef: string;
  readonly executedAt: string;
  readonly executedBy: string;
  readonly digest: string;
}

/** Assemble a digest-chained rollback record (fail-closed). */
export function defineRollbackRecord(input: {
  readonly rollbackId: string;
  readonly version: number;
  readonly targetsPromotionId: string;
  readonly mode: RollbackMode;
  readonly compensation: readonly CompensationEntry[];
  readonly operatorAuthorizationRef: string;
  readonly executedAt: string;
  readonly executedBy: string;
}): RollbackRecord {
  if (input.rollbackId.length < 3) {
    throw new RollbackContractError("rollbackId must be a non-trivial string");
  }
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new RollbackContractError("version must be a positive integer");
  }
  if (input.targetsPromotionId.length < 3) {
    throw new RollbackContractError(
      "a rollback record targets a promotion record",
    );
  }
  if (
    input.mode !== "REVERSIBLE" &&
    input.mode !== "COMPENSATING_ACTION" &&
    input.mode !== "IRREVERSIBLE_WITH_AUDIT"
  ) {
    throw new RollbackContractError(`unknown rollback mode '${String(input.mode)}'`);
  }
  if (input.compensation.length === 0) {
    throw new RollbackContractError(
      "a rollback record carries its compensation evidence (>= 1 entry) — what it owes/undoes",
    );
  }
  const seen = new Set<string>();
  for (const entry of input.compensation) {
    if (seen.has(entry.compensationId)) {
      throw new RollbackContractError(
        `duplicate compensationId '${entry.compensationId}'`,
      );
    }
    seen.add(entry.compensationId);
    if (entry.obligationRef.length < 3) {
      throw new RollbackContractError(
        `compensation '${entry.compensationId}' references its obligationRef`,
      );
    }
    if (!Number.isInteger(entry.amount) || entry.amount < 0) {
      throw new RollbackContractError(
        `compensation '${entry.compensationId}' amount must be a non-negative integer (cents)`,
      );
    }
    if (entry.kind === "NET_ADJUSTMENT" && entry.amount === 0) {
      throw new RollbackContractError(
        `compensation '${entry.compensationId}' is a NET_ADJUSTMENT with amount 0 — use EVIDENCE_MARKER`,
      );
    }
    if (entry.kind !== "NET_ADJUSTMENT" && entry.amount !== 0) {
      throw new RollbackContractError(
        `compensation '${entry.compensationId}' carries an amount but is not a NET_ADJUSTMENT`,
      );
    }
  }
  if (input.operatorAuthorizationRef.length < 3) {
    throw new RollbackContractError(
      "a rollback cites its operator authorization evidence — rollbacks are operator-authorized, never ambient",
    );
  }
  if (!ISO_8601_UTC_PATTERN.test(input.executedAt)) {
    throw new RollbackContractError("executedAt must be ISO-8601 UTC");
  }
  if (input.executedBy.length < 2) {
    throw new RollbackContractError("executedBy is required (lineage)");
  }
  const body = {
    rollbackId: input.rollbackId,
    version: input.version,
    targetsPromotionId: input.targetsPromotionId,
    mode: input.mode,
    compensation: input.compensation,
    operatorAuthorizationRef: input.operatorAuthorizationRef,
    executedAt: input.executedAt,
    executedBy: input.executedBy,
  };
  return deepFreeze({ ...body, digest: contentDigest(body) });
}

// ---------------------------------------------------------------------------
// The functional append-only ledger
// ---------------------------------------------------------------------------

export interface RollbackLedger {
  readonly promotions: readonly PromotionRecord[];
  readonly rollbacks: readonly RollbackRecord[];
}

export function emptyRollbackLedger(): RollbackLedger {
  return { promotions: [], rollbacks: [] };
}

/** Append a promotion (unique id, fail-closed) — returns a NEW ledger. */
export function appendPromotion(
  ledger: RollbackLedger,
  promotion: PromotionRecord,
): RollbackLedger {
  if (
    ledger.promotions.some(
      (existing) => existing.promotionId === promotion.promotionId,
    )
  ) {
    throw new RollbackContractError(
      `duplicate promotionId '${promotion.promotionId}' (the ledger is append-only)`,
    );
  }
  return { ...ledger, promotions: [...ledger.promotions, promotion] };
}

/**
 * Append a rollback (unique id; its target promotion must exist; the
 * promotion must not already be rolled back) — returns a NEW ledger.
 */
export function appendRollback(
  ledger: RollbackLedger,
  rollback: RollbackRecord,
): RollbackLedger {
  if (ledger.rollbacks.some((r) => r.rollbackId === rollback.rollbackId)) {
    throw new RollbackContractError(
      `duplicate rollbackId '${rollback.rollbackId}' (the ledger is append-only)`,
    );
  }
  const target = ledger.promotions.find(
    (promotion) => promotion.promotionId === rollback.targetsPromotionId,
  );
  if (target === undefined) {
    throw new RollbackContractError(
      `rollback '${rollback.rollbackId}' targets unknown promotion '${rollback.targetsPromotionId}'`,
    );
  }
  if (
    ledger.rollbacks.some(
      (r) => r.targetsPromotionId === rollback.targetsPromotionId,
    )
  ) {
    throw new RollbackContractError(
      `promotion '${rollback.targetsPromotionId}' is already rolled back — re-promote first (history is never rewritten)`,
    );
  }
  return { ...ledger, rollbacks: [...ledger.rollbacks, rollback] };
}

// ---------------------------------------------------------------------------
// Coverage: a rollback record exists for every promotion record
// ---------------------------------------------------------------------------

export interface RollbackCoverageReport {
  readonly passed: boolean;
  readonly unrollbackablePromotions: readonly string[];
}

/** The coverage law: every promotion in the ledger has its rollback. */
export function checkRollbackCoverage(
  ledger: RollbackLedger,
): RollbackCoverageReport {
  const rolledBack = new Set(
    ledger.rollbacks.map((r) => r.targetsPromotionId),
  );
  const unrollbackable = ledger.promotions
    .map((p) => p.promotionId)
    .filter((id) => !rolledBack.has(id));
  return {
    passed: unrollbackable.length === 0,
    unrollbackablePromotions: unrollbackable,
  };
}
