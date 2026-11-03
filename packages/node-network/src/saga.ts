/**
 * @payswap/node-network — the multi-leg saga PLAN (P27-D, ADR-0020 D7;
 * the ADR-0016 D13 discipline, extended per-leg — never rewritten).
 *
 * THE LAW: no route is executable because the graph found it. This module
 * is the INTELLIGENCE-side plan the desktop host authority executes: ONE
 * immutable route digest covering every leg, per-leg authorization-share
 * REQUESTS (the share itself is minted by the existing host authority —
 * intelligence never authorizes), per-leg idempotency keys of the exact
 * ADR-0016 D6 form `(mission, operation, legIndex, intentDigest)`,
 * per-leg evidence requirements, per-leg reconciliation checkpoints
 * (read-back routes) and the DOCUMENTED compensation path for every leg
 * (a leg with no documented provider reversal mechanism says so honestly
 * — never a fabricated reversal).
 *
 * Changing any amount, beneficiary, provider, node, fee, FX quote or
 * settlement path changes the digest and invalidates the affected
 * approvals (a new preview is required — D7).
 */

import { SagaError } from "./errors.ts";
import {
  LIMITS,
  contentDigest,
  deepFreeze,
  isNonEmptyString,
  isRecord,
  requireBoundedString,
  requireCurrencyCode,
  requireExactKeys,
  requireNonNegativeSafeInteger,
  requirePositiveIntegerString,
} from "./canonical.ts";

/** The saga-plan vocabulary version. */
export const SAGA_PLAN_VERSION = "1.0.0" as const;

/** The per-leg lane kinds (the ADR-0016 D6 vocabulary, mirrored). */
export const SAGA_LEG_LANE_KINDS = Object.freeze(["PROVIDER", "ONCHAIN_CHAIN"] as const);

export type SagaLegLaneKind = (typeof SAGA_LEG_LANE_KINDS)[number];

/** The custody-transition record at one hop (D8: custody is recorded at every hop). */
export interface SagaCustodyTransition {
  readonly fromKind: string;
  readonly toKind: string;
  readonly evidenceRefs: readonly string[];
}

/** The documented compensation path for one leg (D7 — honest by construction). */
export interface SagaCompensationPath {
  /** The documented provider mechanism (null = NO documented reversal exists). */
  readonly documentedMechanism: string | null;
  readonly mechanismEvidenceRefs: readonly string[];
}

/** One leg of the saga plan (the per-leg manifest subset the plan binds). */
export interface SagaPlanLeg {
  readonly legIndex: number;
  /** The exact provider operation (the typed edge's operation id). */
  readonly operation: string;
  readonly lane: { readonly kind: SagaLegLaneKind; readonly id: string };
  /** The node operating this leg (null = the local PaySwap instance). */
  readonly operatingNodeId: string | null;
  readonly plannedAmount: { readonly currency: string; readonly minorUnits: string };
  readonly destinationRef: string;
  readonly custodyTransition: SagaCustodyTransition;
  /** The effect class this leg's dispatch would carry (the kernel vocabulary). */
  readonly effectClass: string;
  /** The approval tier the host authority must apply for this leg. */
  readonly approvalTier: string;
  /** The evidence records this leg must produce (the INV-05 lineage). */
  readonly evidenceRequirements: readonly string[];
  /** The reconciliation checkpoint: the read-back that confirms this leg. */
  readonly readBackRoute: string;
  readonly compensation: SagaCompensationPath;
}

/** The immutable multi-leg saga plan (a PLAN — never an authorization). */
export interface MultiLegSagaPlan {
  readonly sagaVersion: string;
  readonly missionRef: string;
  readonly intentDigest: string;
  readonly legs: readonly SagaPlanLeg[];
  /** The immutable route digest covering EVERY leg (D7). */
  readonly planDigest: string;
  /** LITERAL: a saga plan never permits execution (the host authority does). */
  readonly sagaPermitsExecution: false;
}

/** The per-leg authorization-share REQUEST (the host authority mints the share). */
export interface SagaAuthorizationShareRequest {
  readonly missionRef: string;
  readonly intentDigest: string;
  readonly planDigest: string;
  readonly legIndex: number;
  readonly operation: string;
  readonly approvalTier: string;
  readonly effectClass: string;
}

/**
 * THE IMMUTABLE ROUTE DIGEST: covers the mission, the intent digest and
 * EVERY leg's index/operation/lane/node/amount/destination/custody/effect
 * facts. Any material change to any leg changes the digest — the exact
 * ADR-0016 D6 binding discipline, in this package's digest flavor.
 */
export function sagaPlanDigest(input: {
  readonly missionRef: string;
  readonly intentDigest: string;
  readonly legs: readonly SagaPlanLeg[];
}): string {
  return `saga-plan:${contentDigest({
    missionRef: input.missionRef,
    intentDigest: input.intentDigest,
    legs: input.legs.map((leg) => ({
      legIndex: leg.legIndex,
      operation: leg.operation,
      laneKind: leg.lane.kind,
      laneId: leg.lane.id,
      operatingNodeId: leg.operatingNodeId,
      currency: leg.plannedAmount.currency,
      minorUnits: leg.plannedAmount.minorUnits,
      destinationRef: leg.destinationRef,
      custodyFrom: leg.custodyTransition.fromKind,
      custodyTo: leg.custodyTransition.toKind,
      effectClass: leg.effectClass,
      approvalTier: leg.approvalTier,
    })),
  })}`;
}

/**
 * The per-leg idempotency key of the EXACT ADR-0016 D6 form
 * `(mission, operation, legIndex, intentDigest)` — deterministic, so the
 * same leg of the same mission of the same intent replays identically.
 */
export function sagaLegIdempotencyKey(input: {
  readonly missionRef: string;
  readonly operation: string;
  readonly legIndex: number;
  readonly intentDigest: string;
}): string {
  if (input.legIndex < 0 || !Number.isSafeInteger(input.legIndex)) {
    throw new SagaError("the leg index must be a non-negative integer (the key is exact)");
  }
  return `saga-idem:${contentDigest(input)}`;
}

/** Fail-closed validation of ONE saga leg. */
export function validateSagaPlanLeg(candidate: unknown, expectedIndex: number): SagaPlanLeg {
  const record = isRecord(candidate) ? candidate : null;
  if (record === null) {
    throw new SagaError(`saga leg ${expectedIndex} must be an object`);
  }
  if (record["legIndex"] !== expectedIndex) {
    throw new SagaError(
      `saga legs carry their exact index (leg ${expectedIndex} declares '${String(record["legIndex"])}') — the per-leg idempotency keys bind the index`,
    );
  }
  const operation = requireBoundedString(
    record["operation"],
    `saga leg ${expectedIndex}.operation`,
    LIMITS.refMaxLength,
  );
  const lane = record["lane"];
  if (
    !isRecord(lane) ||
    !(SAGA_LEG_LANE_KINDS as readonly unknown[]).includes(lane["kind"]) ||
    !isNonEmptyString(lane["id"])
  ) {
    throw new SagaError(
      `saga leg ${expectedIndex}.lane must carry a kind (PROVIDER | ONCHAIN_CHAIN) and a lane id`,
    );
  }
  const operatingNodeId =
    record["operatingNodeId"] === null
      ? null
      : requireBoundedString(
          record["operatingNodeId"],
          `saga leg ${expectedIndex}.operatingNodeId`,
          LIMITS.refMaxLength,
        );
  const amount = record["plannedAmount"];
  if (
    !isRecord(amount) ||
    typeof amount["currency"] !== "string" ||
    typeof amount["minorUnits"] !== "string"
  ) {
    throw new SagaError(`saga leg ${expectedIndex}.plannedAmount must carry currency + minorUnits`);
  }
  const currency = requireCurrencyCode(
    amount["currency"],
    `saga leg ${expectedIndex}.plannedAmount.currency`,
  );
  const minorUnits = requirePositiveIntegerString(
    amount["minorUnits"],
    `saga leg ${expectedIndex}.plannedAmount.minorUnits`,
  );
  const custody = record["custodyTransition"];
  if (
    !isRecord(custody) ||
    !isNonEmptyString(custody["fromKind"]) ||
    !isNonEmptyString(custody["toKind"]) ||
    !Array.isArray(custody["evidenceRefs"])
  ) {
    throw new SagaError(
      `saga leg ${expectedIndex}.custodyTransition must record the custody position at this hop (D8)`,
    );
  }
  const compensation = record["compensation"];
  if (
    !isRecord(compensation) ||
    !Array.isArray(compensation["mechanismEvidenceRefs"]) ||
    (compensation["documentedMechanism"] !== null &&
      !isNonEmptyString(compensation["documentedMechanism"]))
  ) {
    throw new SagaError(
      `saga leg ${expectedIndex}.compensation must carry the documented mechanism (or an honest null) + evidence refs`,
    );
  }
  const evidenceRequirements = record["evidenceRequirements"];
  if (!Array.isArray(evidenceRequirements) || evidenceRequirements.some((ref) => !isNonEmptyString(ref))) {
    throw new SagaError(
      `saga leg ${expectedIndex}.evidenceRequirements must be an array of evidence kinds (the INV-05 lineage)`,
    );
  }
  return deepFreeze({
    legIndex: expectedIndex,
    operation,
    lane: deepFreeze({ kind: lane["kind"] as SagaLegLaneKind, id: lane["id"] as string }),
    operatingNodeId,
    plannedAmount: deepFreeze({ currency, minorUnits }),
    destinationRef: requireBoundedString(
      record["destinationRef"],
      `saga leg ${expectedIndex}.destinationRef`,
      LIMITS.refMaxLength,
    ),
    custodyTransition: deepFreeze({
      fromKind: custody["fromKind"] as string,
      toKind: custody["toKind"] as string,
      evidenceRefs: Object.freeze([...(custody["evidenceRefs"] as readonly string[])]),
    }),
    effectClass: requireBoundedString(
      record["effectClass"],
      `saga leg ${expectedIndex}.effectClass`,
      LIMITS.refMaxLength,
    ),
    approvalTier: requireBoundedString(
      record["approvalTier"],
      `saga leg ${expectedIndex}.approvalTier`,
      LIMITS.refMaxLength,
    ),
    evidenceRequirements: Object.freeze([...(evidenceRequirements as readonly string[])]),
    readBackRoute: requireBoundedString(
      record["readBackRoute"],
      `saga leg ${expectedIndex}.readBackRoute`,
      LIMITS.refMaxLength,
    ),
    compensation: deepFreeze({
      documentedMechanism: compensation["documentedMechanism"] as string | null,
      mechanismEvidenceRefs: Object.freeze([
        ...(compensation["mechanismEvidenceRefs"] as readonly string[]),
      ]),
    }),
  });
}

/**
 * Build the immutable saga plan: validate every leg (exact indices, at
 * least one leg, the hop law), compute the route digest over the WHOLE
 * plan and freeze. The plan NEVER authorizes — the share requests are
 * derived separately (sagaAuthorizationShareRequests).
 */
export function buildMultiLegSagaPlan(input: {
  readonly missionRef: string;
  readonly intentDigest: string;
  readonly legs: readonly unknown[];
}): MultiLegSagaPlan {
  const missionRef = requireBoundedString(input.missionRef, "saga.missionRef", LIMITS.refMaxLength);
  const intentDigest = requireBoundedString(
    input.intentDigest,
    "saga.intentDigest",
    LIMITS.refMaxLength,
  );
  if (!Array.isArray(input.legs) || input.legs.length === 0) {
    throw new SagaError("a saga plan carries at least one leg (an empty plan binds nothing)");
  }
  if (input.legs.length > LIMITS.maxSagaLegs) {
    throw new SagaError(`a saga plan carries at most ${LIMITS.maxSagaLegs} legs`);
  }
  const legs = input.legs.map((leg, index) => validateSagaPlanLeg(leg, index));
  const planDigest = sagaPlanDigest({ missionRef, intentDigest, legs });
  return deepFreeze({
    sagaVersion: SAGA_PLAN_VERSION,
    missionRef,
    intentDigest,
    legs: Object.freeze(legs),
    planDigest,
    sagaPermitsExecution: false as const,
  });
}

/** The per-leg authorization-share requests (one per leg, index order). */
export function sagaAuthorizationShareRequests(
  plan: MultiLegSagaPlan,
): readonly SagaAuthorizationShareRequest[] {
  return Object.freeze(
    plan.legs.map((leg) =>
      deepFreeze({
        missionRef: plan.missionRef,
        intentDigest: plan.intentDigest,
        planDigest: plan.planDigest,
        legIndex: leg.legIndex,
        operation: leg.operation,
        approvalTier: leg.approvalTier,
        effectClass: leg.effectClass,
      }),
    ),
  );
}

/** The per-leg idempotency keys (the ADR-0016 D6 form, index order). */
export function sagaLegIdempotencyKeys(
  plan: MultiLegSagaPlan,
): readonly string[] {
  return Object.freeze(
    plan.legs.map((leg) =>
      sagaLegIdempotencyKey({
        missionRef: plan.missionRef,
        operation: leg.operation,
        legIndex: leg.legIndex,
        intentDigest: plan.intentDigest,
      }),
    ),
  );
}

/** Re-export the exact-keys helper for the run module's input validation. */
export function requireSagaExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  subject: string,
): void {
  requireExactKeys(record, keys, subject);
}

/** Re-export the non-negative-integer require for the run module. */
export function requireSagaNonNegativeInteger(value: unknown, subject: string): number {
  return requireNonNegativeSafeInteger(value, subject);
}
