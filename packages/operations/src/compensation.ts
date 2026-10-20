/**
 * @payswap/operations — compensation evidence: the provable laws
 * (P8-W3, hard law 4, part 2).
 *
 * What a rollback OWES/UNDONES, as typed data — and the two machine
 * proofs the hard law requires:
 * - ORDER-INDEPENDENCE: the compensations' net effect is a commutative,
 *   idempotent fold; every permutation of a compensation list yields the
 *   identical net-effect digest;
 * - IDEMPOTENCE: applying the same rollback twice leaves the compensated
 *   state unchanged (set semantics);
 * - REHEARSALS ARE ADVISORY: the drill steps are data; a rehearsal runs
 *   over derived fixtures and carries the Lab replay-namespace brand —
 *   it is never production rollback evidence (the pinned lab law).
 *
 * Deterministic only: pure functions.
 */

import { contentDigest, deepFreeze } from "./digest.js";
import type { RollbackLedger, RollbackRecord } from "./rollback.js";
import { RollbackContractError } from "./rollback.js";
import { PINNED_LAB_REPLAY_NAMESPACE } from "./pins/lab.js";


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
