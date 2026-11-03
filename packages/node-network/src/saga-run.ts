/**
 * @payswap/node-network — the saga RUN projection (P27-D, ADR-0020 D7;
 * ADR-0016 D6/D13 partial-failure law, the intelligence-side model).
 *
 * Given the immutable plan and the per-leg dispatch OUTCOMES (facts the
 * host authority records), this module projects the saga state with the
 * frozen laws:
 * - CUSTODY CONTINUITY: a later leg NEVER dispatches after an earlier
 *   leg's non-CONFIRMED outcome — the chain stops honestly;
 * - INV-04: an UNKNOWN leg is DISTINCT from FAILED — it does not stop
 *   the recording (it stops the DEPENDENTS) and it goes to PENDING
 *   RECONCILIATION, never a blind retry (a second charge because an
 *   earlier response timed out is the exact catastrophe this forbids);
 * - a FAILED leg stops the chain with the custody position recorded;
 * - COMPENSATION uses only DOCUMENTED provider mechanisms — a confirmed
 *   leg with no documented reversal mechanism records the honest
 *   NO_DOCUMENTED_COMPENSATION fact, never a fabricated reversal.
 *
 * The projection is pure and deterministic: it PLANS what the host
 * authority may dispatch next; it never dispatches anything itself.
 */

import { SagaError } from "./errors.ts";
import { contentDigest, deepFreeze, isRecord } from "./canonical.ts";
import {
  requireSagaExactKeys,
  requireSagaNonNegativeInteger,
  type MultiLegSagaPlan,
  type SagaPlanLeg,
} from "./saga.ts";

/** The per-leg dispatch outcome vocabulary (the ADR-0016 D6 mirror). */
export const SAGA_LEG_OUTCOMES = Object.freeze([
  "CONFIRMED",
  "FAILED",
  "UNKNOWN",
  "UNRECORDED",
] as const);

export type SagaLegOutcomeKind = (typeof SAGA_LEG_OUTCOMES)[number];

/** One recorded per-leg outcome (a fact the host authority observed). */
export interface SagaLegOutcomeRecord {
  readonly legIndex: number;
  readonly outcome: SagaLegOutcomeKind;
  /** The evidence reference the outcome was read from (INV-05 lineage). */
  readonly evidenceRef: string;
}

/** The whole-run state vocabulary. */
export const SAGA_RUN_STATES = Object.freeze([
  "NOT_STARTED",
  "RUNNING",
  "COMPLETED",
  "OUTCOME_UNKNOWN",
  "FAILED_STOPPED",
] as const);

export type SagaRunState = (typeof SAGA_RUN_STATES)[number];

/** One leg's projected dispatchability (with the typed reason). */
export interface SagaLegProjection {
  readonly legIndex: number;
  readonly recordedOutcome: SagaLegOutcomeKind | null;
  /** True only when custody continuity permits dispatching this leg. */
  readonly dispatchPermitted: boolean;
  readonly reason: string;
}

/** The compensation record for one confirmed leg after a later failure. */
export interface SagaCompensationRecord {
  readonly legIndex: number;
  readonly documentedMechanism: string | null;
  readonly mechanismEvidenceRefs: readonly string[];
  readonly status: "DOCUMENTED_MECHANISM_AVAILABLE" | "NO_DOCUMENTED_COMPENSATION";
}

/** The saga run projection (a PLAN of what may dispatch — never a dispatch). */
export interface SagaRunProjection {
  readonly missionRef: string;
  readonly planDigest: string;
  readonly state: SagaRunState;
  readonly legs: readonly SagaLegProjection[];
  /** The custody position at the honest stopping point (D8 recorded at every hop). */
  readonly custodyPosition: { readonly afterLegIndex: number; readonly custodyKind: string };
  /** Legs pending reconciliation (UNKNOWN outcomes — INV-04, never blindly retried). */
  readonly pendingReconciliation: readonly {
    readonly legIndex: number;
    readonly evidenceRef: string;
  }[];
  /** Compensation records for confirmed legs when the chain stopped on a failure. */
  readonly compensation: readonly SagaCompensationRecord[];
  readonly runDigest: string;
  /** LITERAL: the projection never permits execution. */
  readonly sagaRunPermitsExecution: false;
}

function outcomeAt(
  outcomes: readonly SagaLegOutcomeRecord[],
  legIndex: number,
): SagaLegOutcomeRecord | undefined {
  return outcomes.find((record) => record.legIndex === legIndex);
}

function validateOutcomes(
  plan: MultiLegSagaPlan,
  candidates: readonly unknown[],
): readonly SagaLegOutcomeRecord[] {
  if (!Array.isArray(candidates)) {
    throw new SagaError("the saga outcomes must be an array of per-leg records");
  }
  const seen = new Set<number>();
  const records: SagaLegOutcomeRecord[] = [];
  for (const candidate of candidates) {
    const record = isRecord(candidate) ? candidate : null;
    if (record === null) {
      throw new SagaError("each saga outcome must be an object");
    }
    requireSagaExactKeys(record, ["legIndex", "outcome", "evidenceRef"], "a saga leg outcome");
    const legIndex = requireSagaNonNegativeInteger(record["legIndex"], "outcome.legIndex");
    if (legIndex >= plan.legs.length) {
      throw new SagaError(
        `outcome.legIndex ${legIndex} is outside the plan (${plan.legs.length} legs) — a foreign leg never projects`,
      );
    }
    if (seen.has(legIndex)) {
      throw new SagaError(
        `leg ${legIndex} carries two outcome records — the projection is one-outcome-per-leg (a re-read is a reconciliation fact, not a second record)`,
      );
    }
    seen.add(legIndex);
    if (!(SAGA_LEG_OUTCOMES as readonly unknown[]).includes(record["outcome"])) {
      throw new SagaError(
        `leg ${legIndex}'s outcome must be CONFIRMED, FAILED, UNKNOWN or UNRECORDED`,
      );
    }
    if (typeof record["evidenceRef"] !== "string" || (record["evidenceRef"] as string).length === 0) {
      throw new SagaError(`leg ${legIndex}'s outcome must cite its evidence reference`);
    }
    records.push(
      deepFreeze({
        legIndex,
        outcome: record["outcome"] as SagaLegOutcomeKind,
        evidenceRef: record["evidenceRef"] as string,
      }),
    );
  }
  return Object.freeze(records);
}

function compensationRecordFor(leg: SagaPlanLeg): SagaCompensationRecord {
  if (leg.compensation.documentedMechanism !== null) {
    return deepFreeze({
      legIndex: leg.legIndex,
      documentedMechanism: leg.compensation.documentedMechanism,
      mechanismEvidenceRefs: leg.compensation.mechanismEvidenceRefs,
      status: "DOCUMENTED_MECHANISM_AVAILABLE" as const,
    });
  }
  return deepFreeze({
    legIndex: leg.legIndex,
    documentedMechanism: null,
    mechanismEvidenceRefs: leg.compensation.mechanismEvidenceRefs,
    status: "NO_DOCUMENTED_COMPENSATION" as const,
  });
}

/**
 * Project the saga run: the custody-continuity law decides per leg (in
 * index order) whether dispatch is permitted; UNKNOWN and FAILED both
 * stop the dependents; UNKNOWN additionally marks the leg pending
 * reconciliation; a failed chain records the compensation paths of every
 * confirmed leg (documented mechanisms only — the honest null otherwise).
 */
export function projectSagaRun(input: {
  readonly plan: MultiLegSagaPlan;
  readonly outcomes: readonly unknown[];
}): SagaRunProjection {
  const plan = input.plan;
  const outcomes = validateOutcomes(plan, input.outcomes);
  const legs: SagaLegProjection[] = [];
  const pendingReconciliation: { legIndex: number; evidenceRef: string }[] = [];
  let chainStopped: SagaLegOutcomeKind | null = null;
  let stoppedAtIndex = -1;
  for (const leg of plan.legs) {
    const recorded = outcomeAt(outcomes, leg.legIndex);
    if (chainStopped !== null) {
      // A later leg NEVER dispatches after an earlier non-CONFIRMED outcome.
      legs.push(
        deepFreeze({
          legIndex: leg.legIndex,
          recordedOutcome: recorded?.outcome ?? null,
          dispatchPermitted: false,
          reason: `leg ${leg.legIndex} depends on leg ${stoppedAtIndex}, whose outcome was ${chainStopped} — the chain stopped honestly (custody continuity; ${chainStopped === "UNKNOWN" ? "INV-04: reconciled, never blindly retried" : "the failure is recorded, the dependents never dispatch"})`,
        }),
      );
      continue;
    }
    if (recorded === undefined) {
      legs.push(
        deepFreeze({
          legIndex: leg.legIndex,
          recordedOutcome: null,
          dispatchPermitted: true,
          reason:
            leg.legIndex === 0
              ? "the first leg is dispatchable once the host authority mints its single-use share"
              : `every earlier leg is CONFIRMED — leg ${leg.legIndex} is dispatchable once the host authority mints its single-use share`,
        }),
      );
      continue;
    }
    switch (recorded.outcome) {
      case "CONFIRMED":
        legs.push(
          deepFreeze({
            legIndex: leg.legIndex,
            recordedOutcome: "CONFIRMED",
            dispatchPermitted: false,
            reason: `leg ${leg.legIndex} is CONFIRMED (${recorded.evidenceRef}) — its share is consumed; the next leg proceeds`,
          }),
        );
        break;
      case "UNKNOWN":
        pendingReconciliation.push({ legIndex: leg.legIndex, evidenceRef: recorded.evidenceRef });
        chainStopped = "UNKNOWN";
        stoppedAtIndex = leg.legIndex;
        legs.push(
          deepFreeze({
            legIndex: leg.legIndex,
            recordedOutcome: "UNKNOWN",
            dispatchPermitted: false,
            reason: `leg ${leg.legIndex} is UNKNOWN (${recorded.evidenceRef}) — INV-04: the dependents NEVER dispatch on an unknown; the leg goes to pending reconciliation, never a blind retry`,
          }),
        );
        break;
      case "FAILED":
        chainStopped = "FAILED";
        stoppedAtIndex = leg.legIndex;
        legs.push(
          deepFreeze({
            legIndex: leg.legIndex,
            recordedOutcome: "FAILED",
            dispatchPermitted: false,
            reason: `leg ${leg.legIndex} FAILED (${recorded.evidenceRef}) — the chain stops honestly with the custody position recorded; compensation uses documented mechanisms only`,
          }),
        );
        break;
      case "UNRECORDED":
        chainStopped = "UNRECORDED";
        stoppedAtIndex = leg.legIndex;
        legs.push(
          deepFreeze({
            legIndex: leg.legIndex,
            recordedOutcome: "UNRECORDED",
            dispatchPermitted: false,
            reason: `leg ${leg.legIndex} was dispatched but its outcome is UNRECORDED — never a silent skip: the dependents do not dispatch until reconciliation resolves it`,
          }),
        );
        break;
    }
  }
  const allConfirmed =
    outcomes.length === plan.legs.length &&
    plan.legs.every((leg) => outcomeAt(outcomes, leg.legIndex)?.outcome === "CONFIRMED");
  const anyUnknown = outcomes.some((record) => record.outcome === "UNKNOWN");
  const anyUnrecorded = outcomes.some((record) => record.outcome === "UNRECORDED");
  const anyFailed = outcomes.some((record) => record.outcome === "FAILED");
  const state: SagaRunState = allConfirmed
    ? "COMPLETED"
    : anyUnknown || anyUnrecorded
      ? "OUTCOME_UNKNOWN"
      : anyFailed
        ? "FAILED_STOPPED"
        : outcomes.length === 0
          ? "NOT_STARTED"
          : "RUNNING";
  const confirmedLegs = plan.legs.filter(
    (leg) => outcomeAt(outcomes, leg.legIndex)?.outcome === "CONFIRMED",
  );
  const compensation =
    state === "FAILED_STOPPED"
      ? Object.freeze(confirmedLegs.map((leg) => compensationRecordFor(leg)))
      : Object.freeze([]);
  const custodyAfter =
    confirmedLegs.length > 0
      ? (confirmedLegs[confirmedLegs.length - 1] as SagaPlanLeg)
      : ({ legIndex: -1 } as SagaPlanLeg);
  const custodyKind =
    custodyAfter.legIndex >= 0 ? custodyAfter.custodyTransition.toKind : "SENDER";
  return deepFreeze({
    missionRef: plan.missionRef,
    planDigest: plan.planDigest,
    state,
    legs: Object.freeze(legs),
    custodyPosition: deepFreeze({
      afterLegIndex: custodyAfter.legIndex,
      custodyKind,
    }),
    pendingReconciliation: Object.freeze(pendingReconciliation),
    compensation,
    runDigest: contentDigest({
      planDigest: plan.planDigest,
      state,
      legs: legs.map((leg) => ({
        legIndex: leg.legIndex,
        recordedOutcome: leg.recordedOutcome,
        dispatchPermitted: leg.dispatchPermitted,
      })),
      pendingReconciliation,
    }),
    sagaRunPermitsExecution: false as const,
  });
}
