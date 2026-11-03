/**
 * PaySwap Desktop (P27-E, ADR-0020 D7 under ADR-0016 D13 — the P27-D
 * lane report §6.5 composite-act seam) — the SAGA COMPOSITE BINDING:
 * the host-side consumption of the node-network multi-leg saga plan by
 * the existing composite act (corridor-dispatch.ts /
 * payment-dispatch-runtime.ts / mission-execution.ts — extended
 * per-leg, never rewritten).
 *
 * THE LAYER LAW (the stripe-plane-adapters precedent, honestly
 * recorded): the desktop host layer never imports @payswap/* PACKAGE
 * SPECIFIERS — this ONE composition module imports the node-network
 * WORKSPACE SOURCE by relative path, exactly the way the stripe plane
 * pulls the provider-runtime source. The node-network package is
 * ZERO-runtime-dependency pure TypeScript (its own package law) and
 * its src carries no node builtins. The saga functions are the SAME
 * source objects the node-network battery tests — never a by-value
 * copy, never a parallel kernel.
 *
 * THE LAWS (D7 + ADR-0016 D6):
 * - INTELLIGENCE NEVER AUTHORIZES (MODULE-OWNERSHIP): the saga plan is
 *   a PLAN; this binding derives the per-leg authorization-share
 *   REQUESTS and hands them to the composite act — the SHARE itself is
 *   minted by the existing host authority (the per-leg artifact
 *   consumption the dispatch runtime already enforces).
 * - THE IMMUTABLE ROUTE DIGEST: the wire plan is re-validated through
 *   the REAL builder (buildMultiLegSagaPlan) and the re-derived digest
 *   must equal the presented one — any change to any amount,
 *   destination, node, operation or tier invalidates the plan (and the
 *   approvals it bound); a mismatch is a typed refusal, never a repair.
 * - THE IDENTITY BINDING: the plan's missionRef + intentDigest must
 *   equal the composite act's own mission id + intent digest (the same
 *   dimensions the runtime's per-leg idempotency keys embed) — a saga
 *   plan for a different mission or a different intent is never
 *   dispatched. The saga-side per-leg idempotency keys (the exact
 *   (mission, operation, legIndex, intentDigest) form) are derived
 *   through the REAL saga function and carried as the per-leg audit
 *   record; the runtime's own derivation stays THE enforcement (no
 *   parallel idempotency kernel).
 * - THE CONSUMED SAGA OUTPUTS: the per-leg share REQUESTS, the
 *   per-leg idempotency keys, the per-leg reconciliation checkpoints
 *   (readBackRoute) and the documented compensation records are all
 *   carried onto the composite act's per-leg rows — an honest null
 *   compensation stays an honest null (never a fabricated reversal).
 */

import {
  buildMultiLegSagaPlan,
  sagaAuthorizationShareRequests,
  sagaLegIdempotencyKeys,
  type MultiLegSagaPlan,
  type SagaAuthorizationShareRequest,
  type SagaPlanLeg,
} from "../../../../../node-network/src/saga.ts";
import { PaymentMissionError } from "./contracts.js";

/** The consumed saga outputs (index-aligned with the plan's legs). */
export interface SagaCompositeBinding {
  /** The re-validated immutable plan (the REAL builder's output). */
  readonly plan: MultiLegSagaPlan;
  /** The per-leg authorization-share REQUESTS (the host authority mints the shares). */
  readonly shareRequests: readonly SagaAuthorizationShareRequest[];
  /** The per-leg saga idempotency keys (the audit record; the runtime's own derivation stays the enforcement). */
  readonly idempotencyKeys: readonly string[];
  /** The per-leg reconciliation checkpoints (the read-back route that confirms the leg — INV-04). */
  readonly reconciliationCheckpoints: readonly SagaReconciliationCheckpoint[];
  /** The per-leg documented compensation records (an honest null is an honest null — D7). */
  readonly compensationRecords: readonly SagaCompensationRecord[];
  /** LITERAL: the binding never permits execution (the host authority does). */
  readonly sagaBindingPermitsExecution: false;
}

/** One leg's reconciliation checkpoint (the read-back that confirms the leg). */
export interface SagaReconciliationCheckpoint {
  readonly legIndex: number;
  readonly operation: string;
  readonly readBackRoute: string;
}

/** One leg's documented compensation record. */
export interface SagaCompensationRecord {
  readonly legIndex: number;
  readonly operation: string;
  /** The documented provider mechanism (null = NO documented reversal exists — honest). */
  readonly documentedMechanism: string | null;
  readonly mechanismEvidenceRefs: readonly string[];
}

/**
 * Bind a saga plan wire to the composite act. Fail-closed: the wire is
 * re-validated through the REAL node-network builder (every leg, the
 * hop law, the digest re-derivation) and its identity must match the
 * dispatch's mission + intent digest — anything else is the typed
 * refusal, never a repair, never a silent projection.
 */
export function bindSagaPlanToCompositeAct(input: {
  /** The composite act's own mission id (the runtime's idempotency dimension). */
  readonly missionId: string;
  /** The composite act's own intent digest (the runtime's idempotency dimension). */
  readonly intentDigest: string;
  /** The saga plan wire (unknown — validated through the REAL builder). */
  readonly plan: unknown;
}): SagaCompositeBinding {
  const wire = input.plan;
  if (wire === null || typeof wire !== "object" || Array.isArray(wire)) {
    throw new PaymentMissionError("INVALID_TRANSITION", "a saga plan wire must be an object");
  }
  const record = wire as {
    sagaVersion?: unknown;
    missionRef?: unknown;
    intentDigest?: unknown;
    legs?: unknown;
    planDigest?: unknown;
  };
  if (record.sagaVersion !== "1.0.0" || typeof record.missionRef !== "string" || typeof record.intentDigest !== "string" || !Array.isArray(record.legs) || typeof record.planDigest !== "string") {
    throw new PaymentMissionError(
      "INVALID_TRANSITION",
      "the saga plan wire must carry its version, missionRef, intentDigest, legs and planDigest — a malformed plan binds nothing",
    );
  }
  // THE IDENTITY BINDING: the saga plan must be FOR this mission and
  // THIS intent (the runtime's own idempotency dimensions).
  if (record.missionRef !== input.missionId) {
    throw new PaymentMissionError(
      "INVALID_TRANSITION",
      `the saga plan is for mission '${record.missionRef}' but the composite act dispatches mission '${input.missionId}' — a saga plan for a different mission is never dispatched`,
    );
  }
  if (record.intentDigest !== input.intentDigest) {
    throw new PaymentMissionError(
      "INVALID_TRANSITION",
      `the saga plan's intent digest does not match the mission's compiled intent digest — a saga plan over a different intent is never dispatched (the material-change binding)`,
    );
  }
  // THE REAL RE-VALIDATION: the builder validates every leg and
  // re-derives the immutable route digest.
  let plan: MultiLegSagaPlan;
  try {
    plan = buildMultiLegSagaPlan({
      missionRef: record.missionRef,
      intentDigest: record.intentDigest,
      legs: record.legs,
    });
  } catch (error) {
    throw new PaymentMissionError(
      "INVALID_TRANSITION",
      `the saga plan failed its own validation (${error instanceof Error ? error.message : String(error)}) — never a repair, never a projection`,
    );
  }
  if (plan.planDigest !== record.planDigest) {
    throw new PaymentMissionError(
      "INVALID_TRANSITION",
      `the saga plan's presented digest does not match the re-derived route digest — any material change to any leg invalidates the plan and the approvals it bound (D7)`,
    );
  }
  const shareRequests = sagaAuthorizationShareRequests(plan);
  const idempotencyKeys = sagaLegIdempotencyKeys(plan);
  const reconciliationCheckpoints: SagaReconciliationCheckpoint[] = plan.legs.map((leg) => ({
    legIndex: leg.legIndex,
    operation: leg.operation,
    readBackRoute: leg.readBackRoute,
  }));
  const compensationRecords: SagaCompensationRecord[] = plan.legs.map((leg) => ({
    legIndex: leg.legIndex,
    operation: leg.operation,
    documentedMechanism: leg.compensation.documentedMechanism,
    mechanismEvidenceRefs: [...leg.compensation.mechanismEvidenceRefs],
  }));
  return Object.freeze({
    plan,
    shareRequests: Object.freeze(shareRequests),
    idempotencyKeys: Object.freeze(idempotencyKeys),
    reconciliationCheckpoints: Object.freeze(reconciliationCheckpoints),
    compensationRecords: Object.freeze(compensationRecords),
    sagaBindingPermitsExecution: false as const,
  });
}

/** The typed per-leg corridor legKind vocabulary (the pinned corridor skeleton, mirrored for the presenter's mapping). */
const CORRIDOR_LEG_KINDS = ["FIAT_PSP_COLLECT", "PSP_STABLECOIN_ISSUANCE", "ONCHAIN_TRANSFER", "OFF_RAMP_PAYOUT"] as const;

/** One saga leg's presentation onto the composite act (the caller's execution-vocabulary mapping). */
export interface SagaLegPresentation {
  readonly legIndex: number;
  /** The corridor legKind the executing kernel understands (validated against the pinned vocabulary). */
  readonly legKind: (typeof CORRIDOR_LEG_KINDS)[number];
  /** The executing connection for this leg (the lane's own ACTIVE SANDBOX connection). */
  readonly connectionRef: string;
}

/**
 * Validate the presenter's per-leg mapping (index-aligned with the
 * binding's legs; each legKind inside the pinned vocabulary; each
 * connectionRef non-empty). The mapping is DATA the caller presents —
 * the executing kernel + the lane law stay the enforcement.
 */
export function validateSagaLegPresentations(
  binding: SagaCompositeBinding,
  presentations: readonly SagaLegPresentation[],
): readonly SagaLegPresentation[] {
  if (!Array.isArray(presentations) || presentations.length !== binding.plan.legs.length) {
    throw new PaymentMissionError(
      "INVALID_TRANSITION",
      `the saga dispatch requires exactly ${String(binding.plan.legs.length)} per-leg presentations (the legs' own lane/connection mapping) — index-aligned, never projected`,
    );
  }
  return presentations.map((presentation, index) => {
    if (
      presentation === null ||
      typeof presentation !== "object" ||
      presentation.legIndex !== index ||
      !(CORRIDOR_LEG_KINDS as readonly unknown[]).includes(presentation.legKind) ||
      typeof presentation.connectionRef !== "string" ||
      presentation.connectionRef.length === 0
    ) {
      throw new PaymentMissionError(
        "INVALID_TRANSITION",
        `saga leg ${String(index)}'s presentation must carry its exact index, a pinned corridor legKind and a non-empty executing connection — the mapping is data, never a guess`,
      );
    }
    return presentation;
  });
}

/** The saga leg's corridor-dispatch payload projection (the lane/amount/destination the runtime dispatches). */
export function sagaLegOf(leg: SagaPlanLeg): {
  readonly legIndex: number;
  readonly lane: { readonly kind: "PROVIDER" | "ONCHAIN_CHAIN"; readonly id: string };
  readonly plannedAmount: { readonly currency: string; readonly minorUnits: string };
  readonly destinationRef: string;
} {
  return {
    legIndex: leg.legIndex,
    lane: { kind: leg.lane.kind, id: leg.lane.id },
    plannedAmount: { currency: leg.plannedAmount.currency, minorUnits: leg.plannedAmount.minorUnits },
    destinationRef: leg.destinationRef,
  };
}
