/**
 * @payswap/route-compiler — the engine assessment stages (P5-W1).
 *
 * PORT of the old best-execution engine's per-candidate assessment
 * (#assessCandidate, traceOf, provenance assembly, the honest
 * no-route freeze), split out of the engine class under the file law.
 *
 * Stage-2 ASSESS law (rule 14 — hard constraints BEFORE soft
 * optimization): quote validation, request binding, freshness
 * (inclusive bound), semantics (INDICATIVE never selectable — the
 * no-fake-quote law), policy hard constraints (allowlist, hops, time
 * budget, risk cap), health (UNHEALTHY disqualifies; DEGRADED per
 * policy; UNKNOWN or stale health HOLDS the candidate UNKNOWN — never
 * failed, INV-X01) and execution scope (INV-C05: an ACTIVE, eligible,
 * protocol-matching connected instance; a catalogue claim never
 * grounds execution).
 */

import { deepFreeze } from "./canonical.ts";
import { policyRef, type BestExecutionPolicy } from "./policy.ts";
import { riskClassRank, isHealthObservationStale, type HealthObservation } from "./quote-fees.ts";
import type { NetOutcomeEvaluation } from "./scoring.ts";
import { validateVenueQuote } from "./engine-support.ts";
import type { HealthObservationLike, VenueQuoteProvenanceLike } from "./engine-support.ts";
import type { ExecutionVenue } from "./venue-port.ts";
import type { BestExecutionRequest, SelectedRoute } from "./best-execution.ts";
import type { PinnedGateDecision } from "./pins/onchain.ts";
import type { RouteProvenanceChain } from "./provenance.ts";

/** The mutable assessment state of one candidate (engine-private). */
export interface CandidateState {
  readonly venue: ExecutionVenue;
  readonly quoteId: string;
  readonly quote: ReturnType<typeof validateVenueQuote>;
  readonly health: HealthObservationLike;
  readonly policyCompliance: { compliant: boolean; violations: readonly string[] };
  economic?: NetOutcomeEvaluation;
  security: {
    gateDecision: "ALLOW" | "BLOCK" | "UNKNOWN" | "NOT_EVALUATED";
    writeDigest?: string;
    blockReasonCodes?: readonly string[];
    unknownDimensionCodes?: readonly string[];
  };
  /** The full gate decision of an ALLOWed candidate (the selected route's binding). */
  gate?: PinnedGateDecision;
  preparedWrite?: SelectedRoute["write"];
  quoteMalformed?: boolean;
  status: "SELECTED" | "RUNNER_UP" | "UNKNOWN" | "DISQUALIFIED" | "SECURITY_BLOCKED" | "PENDING_GATES";
  disqualifications?: { readonly code: string; readonly detail: string }[];
  unknownDimensions?: { readonly code: string; readonly detail: string }[];
}

/** Stage 2 — the deterministic per-candidate assessment. */
export function assessCandidate(
  venue: ExecutionVenue,
  request: BestExecutionRequest,
  quote: unknown,
  health: HealthObservationLike,
): CandidateState {
  let validated: ReturnType<typeof validateVenueQuote>;
  try {
    validated = validateVenueQuote(quote);
  } catch (error) {
    return {
      venue,
      quoteId: "",
      quote: quote as ReturnType<typeof validateVenueQuote>,
      health,
      policyCompliance: { compliant: false, violations: [] },
      security: { gateDecision: "NOT_EVALUATED" },
      quoteMalformed: true,
      status: "DISQUALIFIED",
      disqualifications: [
        {
          code: "quote_validation_failed",
          detail: error instanceof Error ? error.message : "the venue produced a malformed quote",
        },
      ],
    };
  }

  const disqualifications: { code: string; detail: string }[] = [];
  const unknownDimensions: { code: string; detail: string }[] = [];
  const violations: string[] = [];

  if (
    validated.requestId !== request.swap.requestId ||
    validated.chain !== request.swap.chain ||
    validated.swapKind !== request.swap.swapKind ||
    validated.inputAsset.assetId !== request.swap.inputAsset.assetId ||
    validated.outputAsset.assetId !== request.swap.outputAsset.assetId ||
    validated.inputAmount.minorUnits !== request.swap.amount.minorUnits
  ) {
    disqualifications.push({
      code: "quote_request_mismatch",
      detail: "the quote does not bind to the request (id, chain, kind, assets or amount)",
    });
  }
  if (request.at - validated.freshness.asOfMs > validated.freshness.maxAgeMs) {
    disqualifications.push({
      code: "quote_stale",
      detail: `the quote aged out at the evaluation instant (asOfMs ${validated.freshness.asOfMs}, maxAgeMs ${validated.freshness.maxAgeMs}, at ${request.at})`,
    });
  }
  if (validated.quoteSemantics !== "EXECUTABLE") {
    disqualifications.push({
      code: "quote_not_executable",
      detail: "an INDICATIVE quote is never a selectable execution price",
    });
  }
  if (
    request.policy.allowedVenues !== undefined &&
    !request.policy.allowedVenues.includes(venue.descriptor.venueId)
  ) {
    violations.push(`venue '${venue.descriptor.venueId}' is not in the policy allowlist`);
  }
  if (
    request.policy.maxRouteHops !== undefined &&
    validated.routeShape.length > request.policy.maxRouteHops
  ) {
    violations.push(
      `the quote's hop count (${validated.routeShape.length}) exceeds the policy budget (${request.policy.maxRouteHops})`,
    );
  }
  if (validated.timeToSettlement.estimatedMs > request.policy.maxSettlementMs) {
    disqualifications.push({
      code: "settlement_too_slow",
      detail: `estimated settlement ${validated.timeToSettlement.estimatedMs}ms exceeds the policy budget ${request.policy.maxSettlementMs}ms`,
    });
  }
  if (riskClassRank(validated.failureRisk.riskClass) > riskClassRank(request.policy.maxFailureRiskClass)) {
    disqualifications.push({
      code: "failure_risk_above_tolerance",
      detail: `failure risk class '${validated.failureRisk.riskClass}' exceeds the policy cap '${request.policy.maxFailureRiskClass}'`,
    });
  }
  if (health.status === "UNHEALTHY") {
    disqualifications.push({ code: "venue_unhealthy", detail: "the venue reports UNHEALTHY" });
  } else if (health.status === "DEGRADED" && request.policy.degradedVenuePolicy === "DISQUALIFY") {
    disqualifications.push({
      code: "venue_degraded",
      detail: "the venue reports DEGRADED and the policy disqualifies degraded venues",
    });
  } else if (health.status === "UNKNOWN" || isHealthObservationStale(health, request.at)) {
    unknownDimensions.push({
      code: "health_unknown",
      detail: "the venue's health is UNKNOWN or stale — the candidate is held UNKNOWN, never failed (INV-X01)",
    });
  }
  if (executionScopeMatches(request, venue) === false) {
    disqualifications.push({
      code: "no_execution_scope",
      detail: "no ACTIVE, eligible connected instance matches the venue's protocol binding (catalogue claims never ground execution)",
    });
  }
  if (violations.length > 0) {
    disqualifications.push({
      code: "venue_not_permitted_by_policy",
      detail: violations.join("; "),
    });
  }

  let status: CandidateState["status"] = "PENDING_GATES";
  if (disqualifications.length > 0) {
    status = "DISQUALIFIED";
  } else if (unknownDimensions.length > 0) {
    status = "UNKNOWN";
  }

  return {
    venue,
    quoteId: validated.quoteId,
    quote: validated,
    health,
    policyCompliance: {
      compliant: violations.length === 0,
      violations: Object.freeze([...violations]),
    },
    security: { gateDecision: "NOT_EVALUATED" },
    status,
    ...(disqualifications.length > 0 ? { disqualifications: Object.freeze(disqualifications) as { readonly code: string; readonly detail: string }[] } : {}),
    ...(unknownDimensions.length > 0 ? { unknownDimensions: Object.freeze(unknownDimensions) as { readonly code: string; readonly detail: string }[] } : {}),
  };
}

function executionScopeMatches(request: BestExecutionRequest, venue: ExecutionVenue): boolean {
  return request.instances.some(
    (instance) =>
      instance.protocolKey === venue.protocol.protocolKey &&
      instance.chainKey === venue.protocol.chainKey &&
      instance.authorizationStatus === "ACTIVE" &&
      instance.eligible,
  );
}

/** The immutable trace of one candidate (the provenance-chain member). */
export function traceOf(candidate: CandidateState) {
  const economic = candidate.economic;
  return deepFreeze({
    venueId: candidate.venue.descriptor.venueId,
    quoteId: candidate.quoteId,
    quoteProvenance: {
      venueId: candidate.venue.descriptor.venueId,
      outcome: "QUOTED" as const,
      quoteId: candidate.quoteId,
      quoteSemantics: candidate.quote.quoteSemantics,
      optimizationOrigin: candidate.quote.optimizationOrigin,
      freshness: candidate.quote.freshness,
      provenance: candidate.quote.provenance,
    },
    health: candidate.health,
    policyCompliance: candidate.policyCompliance,
    ...(economic !== undefined ? { economic } : {}),
    security: candidate.security,
    status: candidate.status as "SELECTED" | "RUNNER_UP" | "UNKNOWN" | "DISQUALIFIED" | "SECURITY_BLOCKED",
    ...(candidate.disqualifications !== undefined
      ? { disqualifications: candidate.disqualifications }
      : {}),
    ...(candidate.unknownDimensions !== undefined
      ? { unknownDimensions: candidate.unknownDimensions }
      : {}),
  });
}

/** The provenance-chain assembly (evidence refs deduped, order-stable). */
export function buildProvenance(
  request: BestExecutionRequest,
  candidates: readonly CandidateState[],
  venueOutcomes: readonly VenueQuoteProvenanceLike[],
  selection: RouteProvenanceChain["selection"],
): RouteProvenanceChain {
  const evidenceRefs: string[] = [
    `best-execution-policy:${policyRef(request.policy)}`,
    `security-policy:${request.security.policy.policyId}@${request.security.policy.version}`,
  ];
  for (const candidate of candidates) {
    for (const ref of candidate.quote.provenance.evidenceRefs) {
      evidenceRefs.push(ref);
    }
  }
  return deepFreeze({
    executionId: request.executionId,
    decidedAt: request.at,
    policyRef: policyRef(request.policy),
    numeraire: request.policy.numeraire,
    securityPolicyRef: `${request.security.policy.policyId}@${request.security.policy.version}`,
    venues: Object.freeze([...venueOutcomes]) as unknown as RouteProvenanceChain["venues"],
    candidates: Object.freeze(candidates.map((candidate) => traceOf(candidate))) as unknown as RouteProvenanceChain["candidates"],
    ...(selection !== undefined ? { selection } : {}),
    evidenceRefs: Object.freeze([...new Set(evidenceRefs)]),
  });
}

/** The honest no-route freeze (the detail preserves UNKNOWN counts). */
export function freezeNoRoute(
  request: BestExecutionRequest,
  candidates: readonly CandidateState[],
  venueOutcomes: readonly VenueQuoteProvenanceLike[],
  venues: readonly ExecutionVenue[],
): { decision: "NO_EXECUTABLE_ROUTE"; ranking: readonly unknown[]; provenance: RouteProvenanceChain; detail: string } {
  const unknownVenueCount = venueOutcomes.filter(
    (outcome) => outcome.outcome === "OUTCOME_UNKNOWN",
  ).length;
  const detail =
    candidates.length === 0
      ? `no venue produced a quote (${venues.length} venues asked; ${unknownVenueCount} returned OUTCOME_UNKNOWN — recorded, never converted to failure)`
      : `${candidates.length} quote(s) considered: ${candidates.filter((candidate) => candidate.status === "DISQUALIFIED").length} disqualified by hard constraints, ${candidates.filter((candidate) => candidate.status === "SECURITY_BLOCKED").length} security-blocked, ${candidates.filter((candidate) => candidate.status === "UNKNOWN").length} held UNKNOWN (INV-X01) — no gate-ALLOWed executable route remains`;
  return deepFreeze({
    decision: "NO_EXECUTABLE_ROUTE" as const,
    ranking: Object.freeze(candidates.map((candidate) => traceOf(candidate))),
    provenance: buildProvenance(request, candidates, venueOutcomes, undefined),
    detail,
  });
}

/** Re-exported trace types (the engine's public surface shape). */
export type { HealthObservation, HealthObservationLike, VenueQuoteProvenanceLike, BestExecutionPolicy };
