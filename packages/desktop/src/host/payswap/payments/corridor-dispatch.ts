/**
 * PaySwap Desktop (P22-H, ADR-0016 D6) — the CORRIDOR DISPATCH
 * ORCHESTRATION: the composite act's executor. ONE two-act approval
 * over a presented multi-leg corridor plan authorizes the WHOLE plan;
 * this module orchestrates the per-leg commands through the dispatch
 * runtime's own slice — each leg its OWN PaymentDispatchCommand with
 * its OWN connectionRef, its OWN single-use artifact-consumption share,
 * and its OWN idempotency entry keyed
 * (mission, operation, legIndex, intentDigest).
 *
 * LAWS (D6/D13 — the frozen runtime is EXTENDED, never bypassed):
 * - THE PLAN SHAPE: the exact pinned four-leg skeleton (the C-lane
 *   law, mirrored by value); anything else is a typed refusal.
 * - THE PLAN DIGEST: corridorPlanDigest covers EVERY leg (shape id +
 *   each leg's index/kind/lane/amount/destination/asset/deploy facts);
 *   the dispatch runtime enforces its equality with the COMPOSITE
 *   artifact's planDigest (a leg of a different plan is never a
 *   dispatch).
 * - THE CUSTODY-CONTINUITY LAW: a later leg NEVER dispatches after an
 *   earlier leg's non-CONFIRMED outcome — the runtime's own gate (the
 *   corridorLegDispatchPermitted mirror) refuses typed; the chain
 *   stops honestly (UNKNOWN → pending reconciliation; FAILED → the
 *   legs before it as recorded facts; UNRECORDED → never a silent skip).
 * - N=1 IS THE DEGENERATE CASE: the single-leg laws are byte-pinned by
 *   the existing dispatch/authorization/idempotency tests staying green
 *   unmodified — this module never touches them.
 *
 * (P27-E, ADR-0020 D7 — the P27-D lane report §6.5) THE SAGA EXTENSION:
 * dispatchSagaCompositePlan consumes a bound node-network saga plan's
 * per-leg outputs (the share REQUESTS, the saga idempotency keys, the
 * reconciliation checkpoints, the documented compensation records —
 * saga-composite-binding.ts) through the SAME per-leg dispatch path,
 * ADDITIVELY: the pinned four-leg corridor law above is untouched, the
 * outcome rows grow optional per-leg saga records, and the runtime's
 * own custody-continuity + per-leg artifact + idempotency laws stay
 * THE enforcement (intelligence never authorizes — the share requests
 * are requests; the host authority mints the shares).
 */

import { PaymentMissionError } from "./contracts.js";
import type { PaymentDispatchSlice } from "./payment-dispatch-runtime.js";
import type { PaymentDispatchLegPayload } from "./execution-authority.js";
import {
  PINNED_CORRIDOR_LEG_SKELETON,
  PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID,
  type PinnedCorridorLegKind,
} from "../connections/onchain-rail-pins.js";
import {
  sagaLegOf,
  validateSagaLegPresentations,
  type SagaCompositeBinding,
  type SagaLegPresentation,
} from "./saga-composite-binding.js";

/** One leg of the presented corridor plan (the orchestration's input shape). */
export interface CorridorPlanLegInput {
  readonly legIndex: number;
  readonly legKind: PinnedCorridorLegKind;
  readonly lane: { readonly kind: "PROVIDER" | "ONCHAIN_CHAIN"; readonly id: string };
  readonly plannedAmount: { readonly currency: string; readonly minorUnits: string };
  readonly destinationRef: string;
  readonly assetRef?: string;
  readonly deploy?: { readonly sourceHash: string; readonly bytecodeHash: string };
}

/** The presented corridor plan (the shape the digest covers). */
export interface CorridorPlanInput {
  readonly shapeId: string;
  readonly legs: readonly CorridorPlanLegInput[];
}

/**
 * THE PLAN DIGEST (deterministic FNV-1a over the canonical plan facts —
 * the same binding-never-security discipline as the intent digest):
 * covers EVERY leg — shape id + each leg's index/kind/lane/amount/
 * destination/asset/deploy facts. Any material change to any leg
 * changes the digest (the composite authorization binding).
 */
export function corridorPlanDigest(plan: CorridorPlanInput): string {
  const canonical = [
    plan.shapeId,
    ...plan.legs.map((leg) =>
      [
        String(leg.legIndex),
        leg.legKind,
        leg.lane.kind,
        leg.lane.id,
        leg.plannedAmount.currency,
        leg.plannedAmount.minorUnits,
        leg.destinationRef,
        leg.assetRef ?? "",
        leg.deploy !== undefined ? `${leg.deploy.sourceHash}:${leg.deploy.bytecodeHash}` : "",
      ].join("|"),
    ),
  ].join("||");
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `pmt-plan-digest:${hash.toString(16).padStart(8, "0")}`;
}

/**
 * THE PLAN SHAPE LAW (the C-lane skeleton mirror, pinned by value):
 * the cross-provider-corridor shape with the exact four-leg skeleton —
 * leg kinds AND indices; anything else is a typed refusal (never a
 * lenient projection).
 */
export function validateCorridorPlanShape(plan: CorridorPlanInput): void {
  if (plan.shapeId !== PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID) {
    throw new PaymentMissionError(
      "INVALID_TRANSITION",
      `the corridor dispatch orchestrates only the '${PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID}' shape (got '${String(plan.shapeId)}') — never a foreign shape`,
    );
  }
  if (!Array.isArray(plan.legs) || plan.legs.length !== PINNED_CORRIDOR_LEG_SKELETON.length) {
    throw new PaymentMissionError(
      "INVALID_TRANSITION",
      `the corridor plan carries exactly ${String(PINNED_CORRIDOR_LEG_SKELETON.length)} legs (got '${String(Array.isArray(plan.legs) ? plan.legs.length : "non-array")}') — the pinned skeleton is the whole law`,
    );
  }
  for (let index = 0; index < plan.legs.length; index += 1) {
    const leg = plan.legs[index]!;
    if (leg.legIndex !== index || leg.legKind !== PINNED_CORRIDOR_LEG_SKELETON[index]) {
      throw new PaymentMissionError(
        "INVALID_TRANSITION",
        `corridor leg ${String(index)} must be '${String(PINNED_CORRIDOR_LEG_SKELETON[index])}' at index ${String(index)} — the exact skeleton law (ADR-0016 D5)`,
      );
    }
    if (
      (leg.lane.kind !== "PROVIDER" && leg.lane.kind !== "ONCHAIN_CHAIN") ||
      typeof leg.lane.id !== "string" ||
      leg.lane.id.length === 0
    ) {
      throw new PaymentMissionError(
        "INVALID_TRANSITION",
        `corridor leg ${String(index)} requires its own lane (PROVIDER or ONCHAIN_CHAIN with a non-empty id) — the leg-separation law`,
      );
    }
  }
}

/** One leg's dispatch result (the orchestration's per-leg row). */
export interface CorridorLegDispatchResult {
  readonly legIndex: number;
  readonly legKind: PinnedCorridorLegKind;
  readonly outcome: "CONFIRMED" | "UNKNOWN" | "FAILED" | "REFUSED" | "BLOCKED";
  readonly attemptId?: string;
  readonly summary: string;
  /**
   * (P27-E, the saga extension — OPTIONAL, additive) The saga-side
   * per-leg records the composite act consumes: the authorization-share
   * REQUEST (the host authority mints the share), the saga idempotency
   * key (the audit record — the runtime's own derivation stays the
   * enforcement), the reconciliation checkpoint and the documented
   * compensation record. Present only on the saga dispatch path.
   */
  readonly saga?: {
    readonly shareRequest: { readonly legIndex: number; readonly operation: string; readonly approvalTier: string; readonly effectClass: string };
    readonly idempotencyKey: string;
    readonly readBackRoute: string;
    readonly compensation: { readonly documentedMechanism: string | null; readonly mechanismEvidenceRefs: readonly string[] };
  };
}

/** The whole corridor dispatch's outcome (index-aligned rows). */
export interface CorridorDispatchOutcome {
  readonly planDigest: string;
  readonly results: readonly CorridorLegDispatchResult[];
  /** True iff every leg CONFIRMED (the mission's completion law). */
  readonly allLegsConfirmed: boolean;
  /** The first non-CONFIRMED leg's index when the chain stopped honestly. */
  readonly stoppedAfterLeg: number | null;
}

/** Options (the slice + the wiring facts; all injected). */
export interface CorridorDispatchOptions {
  readonly slice: PaymentDispatchSlice;
  readonly missionId: string;
  readonly plan: CorridorPlanInput;
  /** The per-leg executing connections (index-aligned with the plan's legs). */
  readonly connectionRefs: readonly string[];
  readonly authorizationArtifactId: string;
  readonly executionMode: "SANDBOX" | "LIVE";
  readonly now: string;
}

/**
 * THE COMPOSITE DISPATCH (D6): orchestrate the plan's legs through the
 * dispatch runtime's own slice — the per-leg commands carry their OWN
 * connectionRef + legIndex + leg payload, the shared plan digest, and
 * the SAME authorization artifact (whose consumption is per-leg
 * shares). The chain stops honestly at the first non-CONFIRMED leg
 * (the runtime's custody-continuity gate is the enforcement point;
 * this loop also stops — never dispatches past a stopped chain).
 */
export async function dispatchCorridorPlan(
  options: CorridorDispatchOptions,
): Promise<CorridorDispatchOutcome> {
  validateCorridorPlanShape(options.plan);
  if (options.connectionRefs.length !== options.plan.legs.length) {
    throw new PaymentMissionError(
      "INVALID_TRANSITION",
      `the corridor dispatch requires exactly ${String(options.plan.legs.length)} per-leg connections (got ${String(options.connectionRefs.length)}) — each leg is its own command on its own lane`,
    );
  }
  const planDigest = corridorPlanDigest(options.plan);
  const results: CorridorLegDispatchResult[] = [];
  let stoppedAfterLeg: number | null = null;

  for (const leg of options.plan.legs) {
    const legPayload: PaymentDispatchLegPayload = {
      legIndex: leg.legIndex,
      legKind: leg.legKind,
      lane: leg.lane,
      plannedAmount: leg.plannedAmount,
      destinationRef: leg.destinationRef,
      ...(leg.assetRef !== undefined ? { assetRef: leg.assetRef } : {}),
      ...(leg.deploy !== undefined ? { deploy: leg.deploy } : {}),
    };
    let outcome: CorridorLegDispatchResult;
    try {
      const dispatched = await options.slice.dispatch(options.missionId, "CREATE_EXTERNAL_EFFECT", {
        authorizationArtifactId: options.authorizationArtifactId,
        connectionRef: options.connectionRefs[leg.legIndex]!,
        executionMode: options.executionMode,
        legIndex: leg.legIndex,
        leg: legPayload,
        planDigest,
      }, options.now);
      if (dispatched.kind === "REFUSED") {
        outcome = {
          legIndex: leg.legIndex,
          legKind: leg.legKind,
          outcome: "REFUSED",
          attemptId: dispatched.attemptId,
          summary: `leg ${String(leg.legIndex)} (${leg.legKind}) REFUSED (${dispatched.refusal.kind}): ${dispatched.refusal.reason}`,
        };
      } else if (dispatched.envelope.outcome === "UNKNOWN") {
        outcome = {
          legIndex: leg.legIndex,
          legKind: leg.legKind,
          outcome: "UNKNOWN",
          attemptId: dispatched.attemptId,
          summary: `leg ${String(leg.legIndex)} (${leg.legKind}) UNKNOWN (${dispatched.envelope.ambiguityReason ?? "unrecorded"}) — the per-leg attempt is pending reconciliation; the chain waits, honestly`,
        };
      } else if (dispatched.envelope.outcome === "FAILED") {
        outcome = {
          legIndex: leg.legIndex,
          legKind: leg.legKind,
          outcome: "FAILED",
          attemptId: dispatched.attemptId,
          summary: `leg ${String(leg.legIndex)} (${leg.legKind}) FAILED (${dispatched.envelope.providerFailure?.providerErrorCode ?? "no provider code"}) — the chain stops honestly; the legs before it are recorded facts`,
        };
      } else {
        outcome = {
          legIndex: leg.legIndex,
          legKind: leg.legKind,
          outcome: "CONFIRMED",
          attemptId: dispatched.attemptId,
          summary: `leg ${String(leg.legIndex)} (${leg.legKind}) CONFIRMED (references: ${dispatched.envelope.providerReferences.join(", ") || "none acknowledged"})`,
        };
      }
    } catch (error) {
      // The runtime's typed custody-continuity gate (CORRIDOR_LEG_BLOCKED)
      // and the authorization laws surface here — the chain is stopped.
      const reason = error instanceof PaymentMissionError ? error.message : String(error);
      outcome = {
        legIndex: leg.legIndex,
        legKind: leg.legKind,
        outcome: "BLOCKED",
        summary: `leg ${String(leg.legIndex)} (${leg.legKind}) BLOCKED: ${reason}`,
      };
    }
    results.push(outcome);
    if (outcome.outcome !== "CONFIRMED") {
      stoppedAfterLeg = leg.legIndex;
      break; // THE CHAIN STOPS HONESTLY — no later leg dispatches.
    }
  }

  return {
    planDigest,
    results: Object.freeze(results),
    allLegsConfirmed: results.length === options.plan.legs.length && results.every((row) => row.outcome === "CONFIRMED"),
    stoppedAfterLeg,
  };
}

/**
 * (P27-E, ADR-0020 D7 — the P27-D §6.5 seam) THE SAGA COMPOSITE
 * DISPATCH: orchestrate a bound node-network saga plan's legs through
 * the dispatch runtime's own per-leg slice — each saga leg its OWN
 * command (its OWN lane, its OWN connectionRef, its OWN legIndex, the
 * SAGA plan digest bound into the composite authorization artifact),
 * with the binding's per-leg share REQUESTS, saga idempotency keys,
 * reconciliation checkpoints and documented compensation records
 * carried onto the outcome rows. The chain stops honestly at the first
 * non-CONFIRMED leg (the runtime's custody-continuity gate is the
 * enforcement point; this loop also stops — never dispatches past a
 * stopped chain). The pinned corridor dispatch above is untouched.
 */
export async function dispatchSagaCompositePlan(options: {
  readonly slice: PaymentDispatchSlice;
  readonly missionId: string;
  /** The bound saga plan's outputs (bindSagaPlanToCompositeAct — already identity-bound to this mission + intent). */
  readonly binding: SagaCompositeBinding;
  /** The presenter's per-leg execution mapping (index-aligned; validated fail-closed). */
  readonly legPresentations: readonly SagaLegPresentation[];
  readonly authorizationArtifactId: string;
  readonly executionMode: "SANDBOX" | "LIVE";
  readonly now: string;
}): Promise<CorridorDispatchOutcome> {
  const presentations = validateSagaLegPresentations(options.binding, options.legPresentations);
  const plan = options.binding.plan;
  const planDigest = plan.planDigest;
  const results: CorridorLegDispatchResult[] = [];
  let stoppedAfterLeg: number | null = null;

  for (const leg of plan.legs) {
    const presentation = presentations[leg.legIndex]!;
    const saga = Object.freeze({
      shareRequest: Object.freeze({
        legIndex: leg.legIndex,
        operation: leg.operation,
        approvalTier: leg.approvalTier,
        effectClass: leg.effectClass,
      }),
      idempotencyKey: options.binding.idempotencyKeys[leg.legIndex]!,
      readBackRoute: leg.readBackRoute,
      compensation: Object.freeze({
        documentedMechanism: leg.compensation.documentedMechanism,
        mechanismEvidenceRefs: Object.freeze([...leg.compensation.mechanismEvidenceRefs]),
      }),
    });
    const payload = sagaLegOf(leg);
    const legPayload: PaymentDispatchLegPayload = {
      legIndex: leg.legIndex,
      legKind: presentation.legKind,
      lane: payload.lane,
      plannedAmount: payload.plannedAmount,
      destinationRef: payload.destinationRef,
    };
    let outcome: CorridorLegDispatchResult;
    try {
      const dispatched = await options.slice.dispatch(options.missionId, "CREATE_EXTERNAL_EFFECT", {
        authorizationArtifactId: options.authorizationArtifactId,
        connectionRef: presentation.connectionRef,
        executionMode: options.executionMode,
        legIndex: leg.legIndex,
        leg: legPayload,
        planDigest,
      }, options.now);
      if (dispatched.kind === "REFUSED") {
        outcome = {
          legIndex: leg.legIndex,
          legKind: presentation.legKind,
          outcome: "REFUSED",
          attemptId: dispatched.attemptId,
          summary: `saga leg ${String(leg.legIndex)} (${leg.operation}) REFUSED (${dispatched.refusal.kind}): ${dispatched.refusal.reason}`,
          saga,
        };
      } else if (dispatched.envelope.outcome === "UNKNOWN") {
        outcome = {
          legIndex: leg.legIndex,
          legKind: presentation.legKind,
          outcome: "UNKNOWN",
          attemptId: dispatched.attemptId,
          summary: `saga leg ${String(leg.legIndex)} (${leg.operation}) UNKNOWN (${dispatched.envelope.ambiguityReason ?? "unrecorded"}) — pending reconciliation through '${leg.readBackRoute}'; the chain waits, honestly`,
          saga,
        };
      } else if (dispatched.envelope.outcome === "FAILED") {
        outcome = {
          legIndex: leg.legIndex,
          legKind: presentation.legKind,
          outcome: "FAILED",
          attemptId: dispatched.attemptId,
          summary: `saga leg ${String(leg.legIndex)} (${leg.operation}) FAILED (${dispatched.envelope.providerFailure?.providerErrorCode ?? "no provider code"}) — the chain stops honestly; the legs before it are recorded facts with their documented compensation records`,
          saga,
        };
      } else {
        outcome = {
          legIndex: leg.legIndex,
          legKind: presentation.legKind,
          outcome: "CONFIRMED",
          attemptId: dispatched.attemptId,
          summary: `saga leg ${String(leg.legIndex)} (${leg.operation}) CONFIRMED (references: ${dispatched.envelope.providerReferences.join(", ") || "none acknowledged"})`,
          saga,
        };
      }
    } catch (error) {
      const reason = error instanceof PaymentMissionError ? error.message : String(error);
      outcome = {
        legIndex: leg.legIndex,
        legKind: presentation.legKind,
        outcome: "BLOCKED",
        summary: `saga leg ${String(leg.legIndex)} (${leg.operation}) BLOCKED: ${reason}`,
        saga,
      };
    }
    results.push(outcome);
    if (outcome.outcome !== "CONFIRMED") {
      stoppedAfterLeg = leg.legIndex;
      break; // THE CHAIN STOPS HONESTLY — no later leg dispatches.
    }
  }

  return {
    planDigest,
    results: Object.freeze(results),
    allLegsConfirmed: results.length === plan.legs.length && results.every((row) => row.outcome === "CONFIRMED"),
    stoppedAfterLeg,
  };
}
