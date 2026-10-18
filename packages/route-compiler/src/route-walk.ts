/**
 * @payswap/route-compiler — the route plan walk (P5-W1).
 *
 * PORT of the old compiler's walkRoutePlan (837 lines, MMI-19): the
 * deterministic, fault-injectable plan-level walk. The walk is a LAB
 * SIMULATION (the never-production tier — every result carries
 * LAB_EXECUTION_TIER): it walks the plan's legs in hop order, applies
 * optional typed faults, and records where value honestly sits at every
 * stop. The lane-level walk lives in execution-walk.ts; this module
 * drives it for DEX legs and constructs the kernel-law-shaped
 * observations for write legs, fiat legs, payout legs, bank legs and
 * merchant legs.
 *
 * The preserved laws:
 * - walking an INELIGIBLE_CANDIDATE plan throws (would fabricate
 *   execution — fail closed);
 * - grounding failures stop the route FIRST (GROUNDING_STALE);
 * - UNKNOWN is an honest terminal state (INV-X01): OUTCOME_UNKNOWN legs
 *   yield ROUTE_REQUIRES_RECONCILIATION with the mandatory
 *   reconciliation plan (blind retry forbidden, INV-X02; the settlement
 *   reconciliation authority is the only resolver, INV-X03);
 * - SUBMITTED_NOT_FINAL never confirms (rule 29);
 * - downstream legs of an unresolved route are NOT_EXECUTED with the
 *   honest reason;
 * - custodyAtStop is ALWAYS defined (no hidden custody, even
 *   mid-failure);
 * - faults are typed per rail family (a cross-family fault throws);
 * - write legs require caller-supplied finality models (chain
 *   knowledge is never guessed).
 */

import { RouteWalkError } from "./errors.ts";
import { deepFreeze, isNonEmptyString } from "./canonical.ts";
import { LAB_EXECUTION_TIER } from "./simulation-tier.ts";
import { walkLeg, describePartyName } from "./walk-outcomes.ts";
import type { RoutePlan, RouteLeg } from "./route-plan.ts";
import { planCustodyChain } from "./route-plan.ts";
import { walkExecutionRefs, walkPayoutRefs, walkProviderSettlementRefs } from "./identifiers.ts";
import type { CustodyParty } from "./custody.ts";
import type { PinnedChainFinalityModel } from "./pins/onchain.ts";

/** The closed route-leg fault vocabulary (frozen; typed per rail family). */
export const ROUTE_LEG_FAULT_KINDS = Object.freeze([
  "ONCHAIN_PROTOCOL_FAILURE",
  "ONCHAIN_UNFINALIZED_BROADCAST",
  "ONCHAIN_OUTCOME_UNKNOWN",
  "FIAT_OUTCOME_UNKNOWN",
  "FIAT_DEFINITIVE_FAILED",
  "MERCHANT_OUTCOME_UNKNOWN",
] as const);

export type RouteLegFaultKind = (typeof ROUTE_LEG_FAULT_KINDS)[number];

/** One injectable route-leg fault. */
export type RouteLegFault =
  | {
      readonly kind: "ONCHAIN_PROTOCOL_FAILURE";
      readonly failureClass: "REJECTED" | "REVERTED" | "INSUFFICIENT_FUNDS" | "EXPIRED" | "POLICY_BLOCKED" | "SECURITY_BLOCKED" | "PROVIDER_DEFINED";
      readonly description: string;
      readonly retryGuidance: "SAFE_TO_RETRY" | "REQUIRES_RECONCILIATION" | "NOT_RETRYABLE";
    }
  | { readonly kind: "ONCHAIN_UNFINALIZED_BROADCAST" }
  | { readonly kind: "ONCHAIN_OUTCOME_UNKNOWN"; readonly reason: string }
  | { readonly kind: "FIAT_OUTCOME_UNKNOWN"; readonly reason: string }
  | { readonly kind: "FIAT_DEFINITIVE_FAILED"; readonly reason: string }
  | { readonly kind: "MERCHANT_OUTCOME_UNKNOWN"; readonly reason: string };

/** The walk input. */
export interface WalkRoutePlanInput {
  readonly plan: RoutePlan;
  readonly at: number;
  readonly observedAtIso: string;
  readonly faults?: Readonly<Record<string, RouteLegFault>>;
  readonly onchainFinalityModels?: Readonly<Record<string, PinnedChainFinalityModel>>;
}

/** The per-leg execution outcome statuses (frozen vocabulary). */
export const LEG_EXECUTION_OUTCOME_STATUSES = Object.freeze([
  "OBSERVED_FINALITY_CANDIDATE",
  "SUBMITTED_NOT_FINAL",
  "DEFINITIVE_FAILED",
  "OUTCOME_UNKNOWN",
  "NOT_EXECUTED",
  "GROUNDING_STALE",
] as const);

export type LegExecutionOutcomeStatus = (typeof LEG_EXECUTION_OUTCOME_STATUSES)[number];

/** One leg's execution record in the walk. */
export interface RouteLegExecution {
  readonly legId: string;
  readonly legKind: RouteLeg["legKind"];
  readonly status: LegExecutionOutcomeStatus;
  readonly custodyTo: CustodyParty;
  readonly eventCandidate?: { kind: string; event?: string; reason?: string };
  readonly onchainOutcome?: "BROADCAST" | "CONFIRMED" | "FAILED" | "OUTCOME_UNKNOWN";
  readonly failure?: {
    readonly failureClass: string;
    readonly description: string;
    readonly retryGuidance: "SAFE_TO_RETRY" | "REQUIRES_RECONCILIATION" | "NOT_RETRYABLE";
  };
  readonly unknownReason?: string;
  readonly notExecutedReason?: string;
  readonly evidenceRefs: readonly string[];
}

/** The route-level result statuses (frozen vocabulary). */
export const ROUTE_WALK_RESULT_STATUSES = Object.freeze([
  "ROUTE_COMPLETED_ALL_LEGS_OBSERVED",
  "ROUTE_PENDING_FINALITY",
  "ROUTE_REQUIRES_RECONCILIATION",
  "ROUTE_STOPPED_DEFINITIVE_FAILURE",
  "ROUTE_GROUNDING_STALE",
] as const);

export type RouteWalkResultStatus = (typeof ROUTE_WALK_RESULT_STATUSES)[number];

/** The mandatory reconciliation plan (INV-X02/X03 — the only resolver). */
export interface RouteReconciliationPlan {
  readonly operationKind: "RouteReconciliationPlan";
  readonly planId: string;
  readonly reasons: readonly string[];
  readonly externalChecks: readonly {
    readonly check: string;
    readonly providerNames: readonly string[];
  }[];
  readonly blindRetryForbidden: true;
  readonly resolver: "SETTLEMENT_RECONCILIATION_AUTHORITY";
}

/** The walk result (Lab-tiered, custody-honest). */
export interface RouteWalkResult {
  readonly planId: string;
  readonly intentRef: string;
  readonly status: RouteWalkResultStatus;
  readonly executionTier: typeof LAB_EXECUTION_TIER;
  readonly legExecutions: readonly RouteLegExecution[];
  /** Where the value honestly sits at the stop (always defined while legs exist). */
  readonly custodyAtStop: { readonly party: CustodyParty; readonly assetRef: string } | undefined;
  readonly reconciliation?: RouteReconciliationPlan;
  readonly evidenceRefs: readonly string[];
}

/** Walk a compiled plan deterministically (fault-injectable; never production). */
export function walkRoutePlan(input: WalkRoutePlanInput): RouteWalkResult {
  const { plan } = input;
  if (typeof input.at !== "number" || !Number.isSafeInteger(input.at) || input.at < 0) {
    throw new RouteWalkError("the walk instant must be a non-negative integer (no ambient clock)");
  }
  if (!isNonEmptyString(input.observedAtIso)) {
    throw new RouteWalkError("observedAtIso must be a non-empty string (the observation stamp is data)");
  }
  if (plan.candidateStatus === "INELIGIBLE_CANDIDATE") {
    throw new RouteWalkError(
      `plan '${plan.planId}' is an INELIGIBLE_CANDIDATE — walking it would fabricate execution (fail closed; the ineligibility reasons are on the plan)`,
    );
  }
  const legExecutions: RouteLegExecution[] = [];
  const evidenceRefs: string[] = [];
  let stopped: RouteWalkResultStatus | undefined;
  let custodyAtStop: RouteWalkResult["custodyAtStop"];
  let reconciliation: RouteReconciliationPlan | undefined;
  const faultFor = (leg: RouteLeg): RouteLegFault | undefined => input.faults?.[leg.legId];

  for (const leg of plan.legs) {
    if (stopped !== undefined) {
      legExecutions.push(
        deepFreeze({
          legId: leg.legId,
          legKind: leg.legKind,
          status: "NOT_EXECUTED",
          custodyTo: leg.custody.to,
          notExecutedReason:
            "an upstream leg did not reach an observed finality candidate — downstream hops never execute on an unresolved route (the honest partial state)",
          evidenceRefs: [],
        }),
      );
      continue;
    }
    if (leg.stateGrounding.groundingFailures.length > 0) {
      stopped = "ROUTE_GROUNDING_STALE";
      custodyAtStop = deepFreeze({ party: leg.custody.from, assetRef: leg.custody.assetRef });
      legExecutions.push(
        deepFreeze({
          legId: leg.legId,
          legKind: leg.legKind,
          status: "GROUNDING_STALE",
          custodyTo: leg.custody.to,
          evidenceRefs: [],
        }),
      );
      continue;
    }
    const fault = faultFor(leg);
    const outcome = walkLeg(input, leg, fault);
    legExecutions.push(outcome.execution);
    evidenceRefs.push(...outcome.execution.evidenceRefs);
    switch (outcome.execution.status) {
      case "OBSERVED_FINALITY_CANDIDATE":
        custodyAtStop = deepFreeze({ party: leg.custody.to, assetRef: leg.custody.assetRef });
        break;
      case "OUTCOME_UNKNOWN": {
        stopped = "ROUTE_REQUIRES_RECONCILIATION";
        custodyAtStop = custodyAtStop ?? deepFreeze({ party: leg.custody.from, assetRef: leg.custody.assetRef });
        const providerNames = leg.custody.via !== undefined && leg.custody.via.kind === "EXTERNAL_PROVIDER"
          ? [leg.custody.via.providerName]
          : [describePartyName(leg.custody.from), describePartyName(leg.custody.to)];
        reconciliation = deepFreeze({
          operationKind: "RouteReconciliationPlan",
          planId: plan.planId,
          reasons: [
            `leg '${leg.legId}' (${leg.legKind}) resolved OUTCOME_UNKNOWN: ${outcome.execution.unknownReason ?? ""} — UNKNOWN is an honest terminal state (INV-X01)`,
            `the value position between '${describePartyName(leg.custody.from)}' and '${describePartyName(leg.custody.to)}' is UNKNOWN — reconciliation resolves it; blind retry is forbidden (INV-X02)`,
          ],
          externalChecks: [
            {
              check: "re-observe the external outcome through the provider(s) and the chain",
              providerNames: Object.freeze(providerNames),
            },
          ],
          blindRetryForbidden: true,
          resolver: "SETTLEMENT_RECONCILIATION_AUTHORITY",
        });
        break;
      }
      case "SUBMITTED_NOT_FINAL":
        stopped = stopped ?? "ROUTE_PENDING_FINALITY";
        custodyAtStop = custodyAtStop ?? deepFreeze({ party: leg.custody.from, assetRef: leg.custody.assetRef });
        break;
      case "DEFINITIVE_FAILED":
        stopped = "ROUTE_STOPPED_DEFINITIVE_FAILURE";
        custodyAtStop = custodyAtStop ?? deepFreeze({ party: leg.custody.from, assetRef: leg.custody.assetRef });
        break;
      default:
        break;
    }
  }

  const finalStatus: RouteWalkResultStatus =
    stopped ??
    (legExecutions.some((execution) => execution.status === "SUBMITTED_NOT_FINAL")
      ? "ROUTE_PENDING_FINALITY"
      : "ROUTE_COMPLETED_ALL_LEGS_OBSERVED");
  return deepFreeze({
    planId: plan.planId,
    intentRef: plan.intentRef,
    status: finalStatus,
    executionTier: LAB_EXECUTION_TIER,
    legExecutions: Object.freeze(legExecutions),
    custodyAtStop,
    ...(reconciliation !== undefined ? { reconciliation } : {}),
    evidenceRefs: Object.freeze([...new Set(evidenceRefs)]),
  });
}
