/**
 * @payswap/route-compiler — the route-leg base contract (P5-W1).
 *
 * PORT+ADAPT of the old compiler's RouteLegBase (MMI-19): every leg of
 * every route plan carries, STRUCTURALLY, the full chain of custody and
 * lineage for its hop:
 *
 * 1. identity — legId (deterministic: `${planId}:leg:${hop}:${kind}`),
 *    legKind (closed vocabulary), hopIndex (contiguous from zero),
 *    intentRef (referenced, never re-declared);
 * 2. authorization lineage (the intent root + the leg-level evidence);
 * 3. state grounding (the observations WITH their exact versions, plus
 *    honest grounding failures);
 * 4. finality (candidates only — never assumed);
 * 5. custody (the explicit transfer with evidence);
 * 6. failure semantics (the frozen INV-X contract, never per-leg config);
 * 7. planned amount (explicit grounding basis — INTENT/QUOTE/CONVERSION/
 *    UNKNOWN);
 * 8. auditable assumptions (the fifth comparability requirement);
 * 9. evidence refs (non-empty, INV-E02).
 *
 * The leg-KIND arms (fiat legs, onchain legs, merchant legs) extend this
 * base with their family-specific grounding records — see fiat-legs.ts,
 * onchain-legs.ts and merchant-legs.ts.
 */

import { InvalidRouteLegContractError } from "./errors.ts";
import { deepFreeze, requireBoundedString, requireNonNegativeSafeInteger, requireObject, type Fail } from "./canonical.ts";
import { isRouteLegKind, type RouteLegKind } from "./leg-kinds.ts";
import type { AuthorizationLineage } from "./authorization.ts";
import type { LegStateGrounding } from "./grounding.ts";
import type { LegFinalityContract, LegFailureSemantics } from "./finality.ts";
import type { CustodyTransfer } from "./custody.ts";
import type { PlannedLegAmount } from "./planned-amount.ts";
import type { AuditableAssumption } from "./assumptions.ts";

const fail: Fail = (message: string) => new InvalidRouteLegContractError(message);

/** The structural base of every route leg (the nine-part law above). */
export interface RouteLegBase {
  /** Deterministic: `${planId}:leg:${hopIndex}:${legKind}`. */
  readonly legId: string;
  readonly legKind: RouteLegKind;
  readonly hopIndex: number;
  /** The intent this leg executes — referenced, never re-declared. */
  readonly intentRef: string;
  readonly authorizationLineage: AuthorizationLineage;
  readonly stateGrounding: LegStateGrounding;
  readonly finality: LegFinalityContract;
  readonly custody: CustodyTransfer;
  readonly failureSemantics: LegFailureSemantics;
  readonly plannedAmount: PlannedLegAmount;
  /** The leg's auditable assumptions (may be empty ONLY on baseline legs). */
  readonly assumptions: readonly AuditableAssumption[];
  readonly evidenceRefs: readonly string[];
}

/**
 * Fail-closed validation of the leg BASE laws (identity, lineage,
 * grounding, finality, failure semantics, evidence). Kind arms validate
 * their own extension surfaces and delegate here.
 */
export function validateRouteLegBase(
  candidate: unknown,
): RouteLegBase {
  const record = requireObject(candidate, "a RouteLeg", fail);
  const legId = requireBoundedString(record["legId"], "leg.legId", 512, fail);
  const legKind = record["legKind"];
  if (!isRouteLegKind(legKind)) {
    throw fail(`leg.legKind '${String(legKind)}' is not a member of the closed leg vocabulary`);
  }
  const hopIndex = requireNonNegativeSafeInteger(record["hopIndex"], "leg.hopIndex", fail);
  const intentRef = requireBoundedString(record["intentRef"], "leg.intentRef", 256, fail);
  const authorizationLineage = record["authorizationLineage"];
  if (authorizationLineage === undefined) {
    throw fail("leg.authorizationLineage is required (lineage is never optional)");
  }
  const stateGrounding = record["stateGrounding"];
  if (stateGrounding === undefined) {
    throw fail("leg.stateGrounding is required (grounding is never optional)");
  }
  const finality = record["finality"];
  if (finality === undefined) {
    throw fail("leg.finality is required (the finality contract is never optional)");
  }
  const custody = record["custody"];
  if (custody === undefined) {
    throw fail("leg.custody is required (custody is never optional — INV-C09)");
  }
  const failureSemantics = record["failureSemantics"];
  if (failureSemantics === undefined) {
    throw fail("leg.failureSemantics is required (the INV-X contract is never optional)");
  }
  const plannedAmount = record["plannedAmount"];
  if (plannedAmount === undefined) {
    throw fail("leg.plannedAmount is required (a leg without a planned amount is unrepresentable)");
  }
  const rawAssumptions = record["assumptions"];
  if (!Array.isArray(rawAssumptions)) {
    throw fail("leg.assumptions must be an array (possibly empty on baseline legs only)");
  }
  const rawEvidence = record["evidenceRefs"];
  if (!Array.isArray(rawEvidence) || rawEvidence.length === 0) {
    throw fail("leg.evidenceRefs must be a non-empty array (INV-E02: a leg is always evidenced)");
  }
  for (const evidence of rawEvidence) {
    if (typeof evidence !== "string" || evidence.length === 0) {
      throw fail("leg.evidenceRefs entries must be non-empty strings");
    }
  }
  return deepFreeze({
    legId,
    legKind,
    hopIndex,
    intentRef,
    authorizationLineage: authorizationLineage as AuthorizationLineage,
    stateGrounding: stateGrounding as LegStateGrounding,
    finality: finality as LegFinalityContract,
    custody: custody as CustodyTransfer,
    failureSemantics: failureSemantics as LegFailureSemantics,
    plannedAmount: plannedAmount as PlannedLegAmount,
    assumptions: Object.freeze([...rawAssumptions]) as readonly AuditableAssumption[],
    evidenceRefs: Object.freeze([...rawEvidence]) as readonly string[],
  });
}

/**
 * The leg-executability projection: which leg-level verdicts make a leg
 * executable (the honest-status law of the old buildRoutePlan, expressed
 * per evidence family):
 * - ONCHAIN gate decisions: ALLOW (BLOCK/UNKNOWN are honest ineligibility);
 * - payout gates: allowed AND every check passed;
 * - corridor lineage: the leg's grounding carries no failures;
 * - provider-verified settlement: present (validated upstream);
 * - intent-authorization-only: executable (evidenced consequence).
 */
export function legIsExecutable(leg: RouteLegBase): boolean {
  if (leg.stateGrounding.groundingFailures.length > 0) {
    return false;
  }
  switch (leg.authorizationLineage.legAuthorization.kind) {
    case "ONCHAIN_GATE_DECISION":
      return leg.authorizationLineage.legAuthorization.gateDecision.decision === "ALLOW";
    case "PAYOUT_TRANSFER_OUT_GRANT":
      return payoutGatePassed(leg);
    default:
      return true;
  }
}

function payoutGatePassed(leg: RouteLegBase): boolean {
  const evidence = leg.authorizationLineage.legAuthorization;
  if (evidence.kind !== "PAYOUT_TRANSFER_OUT_GRANT") {
    return false;
  }
  return evidence.gate.allowed && evidence.gate.checks.every((check) => check.pass);
}
