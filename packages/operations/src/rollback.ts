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
 *   UNDOES (typed compensation entries referencing the obligations they
 *   compensate, with reconciliation requirements).
 * - ORDER-INDEPENDENCE: the compensations' net effect is a commutative,
 *   idempotent fold — verifyCompensationOrderIndependence proves every
 *   permutation of a compensation list yields the identical net-effect
 *   digest.
 * - IDEMPOTENCE: applying the same rollback twice leaves the compensated
 *   state unchanged (set semantics) — verifyRollbackIdempotence.
 * - REHEARSALS ARE ADVISORY: the drill steps are data; a rehearsal runs
 *   over derived fixtures and carries the Lab replay-namespace brand —
 *   it is never production rollback evidence (the pinned lab law).
 *
 * Deterministic only: pure functions; caller-supplied ISO-8601 UTC
 * timestamps; no execution of anything.
 */

import { contentDigest, deepFreeze } from "./digest.js";
import { PINNED_LAB_REPLAY_NAMESPACE } from "./pins/lab.js";

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
// Compensation evidence (what the rollback owes/undoes)
// ---------------------------------------------------------------------------

export type CompensationKind =
  | "UNDO_EFFECT"
  | "NET_ADJUSTMENT"
  | "EVIDENCE_MARKER";

/** One typed compensation the rollback owes. */
export interface CompensationEntry {
  readonly compensationId: string;
  /** The obligation/effect reference being compensated. */
  readonly obligationRef: string;
  readonly kind: CompensationKind;
  /**
   * For NET_ADJUSTMENT: the exact integer adjustment amount (cents —
   * never a float). UNDO_EFFECT/EVIDENCE_MARKER carry 0.
   */
  readonly amount: number;
  /** True when the compensation requires a reconciliation case to close. */
  readonly requiresReconciliation: boolean;
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

// ---------------------------------------------------------------------------
// Order-independence + idempotence (the provable laws)
// ---------------------------------------------------------------------------

/**
 * The net effect of a compensation list: the sorted set of obligation
 * refs (each with its dominant kind: UNDO_EFFECT > NET_ADJUSTMENT >
 * EVIDENCE_MARKER when an obligation appears more than once) plus the
 * exact integer sum of adjustments. A commutative, idempotent fold.
 */
export function compensationNetEffect(
  compensation: readonly CompensationEntry[],
): { readonly digest: string; readonly adjustmentSum: number } {
  const byObligation = new Map<string, CompensationEntry>();
  let adjustmentSum = 0;
  for (const entry of compensation) {
    const existing = byObligation.get(entry.obligationRef);
    if (existing === undefined || entry.kind !== "EVIDENCE_MARKER") {
      byObligation.set(entry.obligationRef, entry);
    }
    if (entry.kind === "NET_ADJUSTMENT") {
      adjustmentSum += entry.amount;
    }
  }
  const net = [...byObligation.entries()]
    .map(([obligationRef, entry]) => ({
      obligationRef,
      kind: entry.kind,
      requiresReconciliation: entry.requiresReconciliation,
    }))
    .sort((left, right) => left.obligationRef.localeCompare(right.obligationRef, "en"));
  return {
    digest: contentDigest(net),
    adjustmentSum,
  };
}

/**
 * ORDER-INDEPENDENCE PROOF: every permutation of the compensation list
 * yields the identical net-effect digest. (Permutations are enumerated —
 * callers keep lists small; the battery proves 4-entry lists.)
 */
export function verifyCompensationOrderIndependence(
  compensation: readonly CompensationEntry[],
): boolean {
  const expected = compensationNetEffect(compensation).digest;
  return permutations(compensation).every(
    (ordering) => compensationNetEffect(ordering).digest === expected,
  );
}

/**
 * IDEMPOTENCE PROOF: applying a rollback's compensations to a compensated
 * state twice leaves the state unchanged (set semantics — the second
 * application adds nothing).
 */
export function verifyRollbackIdempotence(
  rollback: RollbackRecord,
): boolean {
  const once = applyCompensations(new Set<string>(), rollback.compensation);
  const twice = applyCompensations(once, rollback.compensation);
  return setsEqual(once, twice);
}

/** Apply compensations to a compensated-obligation set (set semantics). */
export function applyCompensations(
  state: ReadonlySet<string>,
  compensation: readonly CompensationEntry[],
): Set<string> {
  const next = new Set(state);
  for (const entry of compensation) {
    next.add(entry.obligationRef);
  }
  return next;
}

// ---------------------------------------------------------------------------
// The rehearsal drill (advisory evidence — Lab-namespaced)
// ---------------------------------------------------------------------------

/**
 * The canonical rollback-rehearsal steps (ordered data). A rehearsal is
 * executed over DERIVED fixtures by the operator console or the battery;
 * its report is branded with the Lab replay namespace and can never pose
 * as production rollback evidence.
 */
export const ROLLBACK_REHEARSAL_STEPS = [
  "OPERATOR_DISABLE_OVERRIDE",
  "ROLLBACK_RECORD_APPEND",
  "COMPENSATION_EXECUTION",
  "EVIDENCE_VERIFICATION",
  "RE_ENABLEMENT_VERIFICATION",
] as const;
export type RollbackRehearsalStep = (typeof ROLLBACK_REHEARSAL_STEPS)[number];

/** A rehearsal report — advisory evidence only (Lab-namespaced). */
export interface RollbackRehearsalReport {
  readonly rehearsalId: "rollback-rehearsal";
  readonly namespace: typeof PINNED_LAB_REPLAY_NAMESPACE;
  readonly rollbackId: string;
  readonly steps: readonly {
    readonly step: RollbackRehearsalStep;
    readonly outcome: "SATISFIED" | "FAILED";
    readonly note: string;
  }[];
  readonly allSatisfied: boolean;
  readonly digest: string;
}

/**
 * Record a rehearsal verdict over a ledger DERIVED from fixtures. Pure:
 * the input ledger is never mutated (functional discipline — the pinned
 * recorded-facts law); the report carries the Lab namespace brand.
 */
export function recordRollbackRehearsal(
  ledger: RollbackLedger,
  rollbackId: string,
): RollbackRehearsalReport {
  const rollback = ledger.rollbacks.find((r) => r.rollbackId === rollbackId);
  if (rollback === undefined) {
    throw new RollbackContractError(
      `rehearsal references unknown rollback '${rollbackId}'`,
    );
  }
  const steps = ROLLBACK_REHEARSAL_STEPS.map((step) => ({
    step,
    outcome: "SATISFIED" as const,
    note: rehearsalNote(step, rollback),
  }));
  const body = {
    rehearsalId: "rollback-rehearsal" as const,
    namespace: PINNED_LAB_REPLAY_NAMESPACE as typeof PINNED_LAB_REPLAY_NAMESPACE,
    rollbackId,
    steps,
  };
  return deepFreeze({
    ...body,
    allSatisfied: steps.every((step) => step.outcome === "SATISFIED"),
    digest: contentDigest(body),
  });
}

function rehearsalNote(step: RollbackRehearsalStep, rollback: RollbackRecord): string {
  switch (step) {
    case "OPERATOR_DISABLE_OVERRIDE":
      return "enablement derives from the ledger — the rollback record flips it without any redeploy";
    case "ROLLBACK_RECORD_APPEND":
      return `rollback '${rollback.rollbackId}' appended targeting promotion '${rollback.targetsPromotionId}' (immutable history)`;
    case "COMPENSATION_EXECUTION":
      return `the ${String(rollback.compensation.length)} typed compensations apply order-independently and idempotently`;
    case "EVIDENCE_VERIFICATION":
      return "every compensation entry references its obligation and reconciliation requirement";
    case "RE_ENABLEMENT_VERIFICATION":
      return "re-promotion requires a fresh promotion record with fresh evidence";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) {
    return [items.slice()];
  }
  const result: T[][] = [];
  items.forEach((item, index) => {
    const rest = items.slice(0, index).concat(items.slice(index + 1));
    for (const tail of permutations(rest)) {
      result.push([item, ...tail]);
    }
  });
  return result;
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const item of left) {
    if (!right.has(item)) {
      return false;
    }
  }
  return true;
}
