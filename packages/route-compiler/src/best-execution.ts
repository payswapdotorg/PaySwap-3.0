/**
 * @payswap/route-compiler — the best-execution engine (P5-W1).
 *
 * PORT of the old engine (945 lines, MMI-19) onto the zero-sibling
 * law: the security-gate evaluation is an INJECTED port (the real
 * evaluator lives in @payswap/onchain-security — this package never
 * re-implements security). Per-stage machinery: engine-assess.ts;
 * quote validation law: engine-support.ts.
 *
 * THE PIPELINE (venues in registration order): 1 QUOTE (health first;
 * UNAVAILABLE/OUTCOME_UNKNOWN verbatim); 2 ASSESS (rule 14 — hard
 * constraints BEFORE soft optimization); 3 NET EVALUATION for every
 * well-formed quote; 4 SECURITY GATES for every non-disqualified
 * candidate (venue throws contained); 5 RANK + SELECT (net descending,
 * declared tie-breakers, VENUE_ID total order, exact margin recorded).
 * Determinism: same inputs at the same instant -> byte-identical
 * provenance; no ambient clock, no randomness.
 */
import { ValidationError } from "./errors.ts";
import { deepFreeze, contentDigest, isNonEmptyString } from "./canonical.ts";

import { VenueRegistry, validateSwapRequest, type ExecutionVenue, type SwapRequest } from "./venue-port.ts";
import { validateBestExecutionPolicy, policyRef, type BestExecutionPolicy } from "./policy.ts";
import { evaluateNetOutcome, type NetOutcomeEvaluation } from "./scoring.ts";
import { rankCandidates, type RankableCandidate } from "./scoring-order.ts";
import { validateVenueQuote } from "./engine-support.ts";
import type { PinnedGateDecision } from "./pins/onchain.ts";
import type { RouteProvenanceChain } from "./provenance.ts";
import {
  assessCandidate,
  buildProvenance,
  freezeNoRoute,
  traceOf,
  type CandidateState,
  type HealthObservationLike,
  type VenueQuoteProvenanceLike,
} from "./engine-assess.ts";

/** The injected security-gate evaluator (the REAL one lives in the security lane). */
export type SecurityGateEvaluator = (input: {
  readonly write: {
    readonly writeId: string;
    readonly action: string;
    readonly chain: string;
    readonly route: { readonly routeId: string; readonly routeHash: string };
    readonly expiry: number;
    readonly requestedBy: string;
    readonly writeDigest: string;
    readonly preparedAt: number;
  };
  readonly policy: unknown;
  readonly securityState: unknown;
  readonly at: number;
}) => PinnedGateDecision;

/** The engine request (validated fail-closed before the pipeline runs). */
export interface BestExecutionRequest {
  readonly executionId: string;
  readonly swap: SwapRequest;
  readonly policy: BestExecutionPolicy;
  readonly security: {
    readonly policy: { readonly policyId: string; readonly version: number };
    readonly state: unknown;
    /** The injected gate evaluator (never re-implemented here). */
    readonly evaluateGate: SecurityGateEvaluator;
  };
  readonly instances: readonly {
    readonly instanceId: string;
    readonly capabilityId: string;
    readonly protocolKey: string;
    readonly chainKey: string;
    readonly authorizationStatus: string;
    readonly eligible: boolean;
  }[];
  readonly owner: string;
  readonly beneficiary: string;
  readonly requestedBy: string;
  /** Absolute, integer, STRICTLY after `at`. */
  readonly routeExpiryMs: number;
  /** The deterministic evaluation instant (no ambient clock). */
  readonly at: number;
}

/** The selected route (everything the graph needs to bind the decision). */
export interface SelectedRoute {
  readonly routeRef: string;
  readonly routeHash: string;
  readonly venueId: string;
  readonly quoteId: string;
  readonly quote: ReturnType<typeof validateVenueQuote>;
  readonly health: HealthObservationLike;
  readonly write: {
    readonly writeId: string;
    readonly action: string;
    readonly chain: string;
    readonly route: { readonly routeId: string; readonly routeHash: string };
    readonly expiry: number;
    readonly requestedBy: string;
    readonly writeDigest: string;
    readonly preparedAt: number;
  };
  readonly gateDecision: PinnedGateDecision;
  readonly evaluation: NetOutcomeEvaluation;
}

/** The immutable per-candidate assessment trace (the ranking member). */
export type CandidateTrace = ReturnType<typeof traceOf>;

/** The engine decision: ROUTE_SELECTED or the honest NO_EXECUTABLE_ROUTE. */
export type BestExecutionDecision =
  | {
      readonly decision: "ROUTE_SELECTED";
      readonly selected: SelectedRoute;
      readonly ranking: readonly CandidateTrace[];
      readonly provenance: RouteProvenanceChain;
    }
  | {
      readonly decision: "NO_EXECUTABLE_ROUTE";
      readonly ranking: readonly CandidateTrace[]; readonly provenance: RouteProvenanceChain;
      readonly detail: string;
    };

/** The best-execution engine: a deterministic venue-registry decision machine. */
export class BestExecutionEngine {
  private readonly registry = new VenueRegistry();

  /** Register a venue (delegates to the registry law). */
  register(venue: ExecutionVenue): void {
    this.registry.register(venue);
  }

  /** The registered venues in registration order. */
  venues(): readonly ExecutionVenue[] {
    return this.registry.venues();
  }

  /** Execute the five-stage pipeline over the registered venues. */
  execute(request: BestExecutionRequest): BestExecutionDecision {
    validateEngineRequest(request);
    const venues = this.registry.venues();
    const candidates: CandidateState[] = [];
    const venueOutcomes: VenueQuoteProvenanceLike[] = [];

    // Stage 1 — QUOTE (health first, then the quote; outcomes verbatim).
    for (const venue of venues) {
      const health = venue.observeHealth(request.at);
      const outcome = venue.quote(request.swap, request.at);
      venueOutcomes.push(quoteProvenanceParts(venue, outcome));
      if (outcome.kind === "QUOTE") {
        candidates.push(assessCandidate(venue, request, outcome.quote, health));
      }
    }

    // Stage 3 — net evaluation for every well-formed quote.
    for (const candidate of candidates) {
      if (candidate.status !== "DISQUALIFIED" || !candidate.quoteMalformed) {
        try {
          candidate.economic = evaluateNetOutcome({
            candidate: { candidateId: candidate.quoteId, quote: candidate.quote },
            policy: request.policy,
          });
        } catch (error) {
          candidate.disqualifications = [
            ...(candidate.disqualifications ?? []),
            {
              code: "net_evaluation_failed",
              detail: error instanceof Error ? error.message : "the net evaluation failed",
            },
          ];
          candidate.status = "DISQUALIFIED";
        }
      }
    }

    // Stage 4 — SECURITY GATES (every candidate not DISQUALIFIED).
    for (const candidate of candidates) {
      if (candidate.status === "DISQUALIFIED") {
        continue;
      }
      const routeRef = `${request.executionId}/route/${candidate.venue.descriptor.venueId}/${candidate.quoteId}`;
      const routeHash = contentDigest({
        executionId: request.executionId,
        venueId: candidate.venue.descriptor.venueId,
        quoteId: candidate.quoteId,
        worstCaseOutput: candidate.quote.slippage.worstCaseOutput.minorUnits,
      });
      try {
        const scope = executionScopeFor(request, candidate.venue);
        if (scope === undefined) {
          throw new Error("no execution scope for the venue's protocol binding");
        }
        const write = candidate.venue.planWrite({
          quote: candidate.quote,
          instance: scope,
          owner: request.owner,
          beneficiary: request.beneficiary,
          routeRef,
          routeHash,
          expiryMs: request.routeExpiryMs,
          requestedBy: request.requestedBy,
        });
        const gate = request.security.evaluateGate({
          write,
          policy: request.security.policy,
          securityState: request.security.state,
          at: request.at,
        });
        if (gate.decision === "BLOCK") {
          candidate.security = {
            gateDecision: "BLOCK",
            blockReasonCodes: gate.reasons.map((reason) => reason.code),
          };
          candidate.status = "SECURITY_BLOCKED";
        } else if (gate.decision === "UNKNOWN") {
          candidate.security = {
            gateDecision: "UNKNOWN",
            unknownDimensionCodes: gate.dimensions.map((dimension) => dimension.code),
          };
          candidate.status = "UNKNOWN";
          candidate.unknownDimensions = [
            ...(candidate.unknownDimensions ?? []),
            ...gate.dimensions.map((dimension) => ({
              code: "security_gate_unknown",
              detail: `${dimension.code}: ${dimension.message}`,
            })),
          ];
        } else {
          candidate.security = { gateDecision: "ALLOW", writeDigest: write.writeDigest };
          candidate.gate = gate;
          candidate.preparedWrite = write;
        }
      } catch (error) {
        candidate.security = { gateDecision: "NOT_EVALUATED" };
        candidate.disqualifications = [
          ...(candidate.disqualifications ?? []),
          {
            code: "gate_evaluation_failed",
            detail: `the venue's write planning or the gate evaluation threw: ${error instanceof Error ? error.message : String(error)}`,
          },
        ];
        candidate.status = "DISQUALIFIED";
      }
    }

    // Stage 5 — RANK + SELECT.
    const selectable = candidates.filter(
      (candidate) =>
        candidate.status === "PENDING_GATES" &&
        candidate.security.gateDecision === "ALLOW" &&
        candidate.preparedWrite !== undefined &&
        candidate.economic !== undefined,
    );
    if (selectable.length === 0) {
      return freezeNoRoute(request, candidates, venueOutcomes, venues) as BestExecutionDecision;
    }
    const ranked = rankCandidates(
      selectable.map((candidate) => ({
        candidate: { candidateId: candidate.quoteId, quote: candidate.quote },
        evaluation: candidate.economic as NetOutcomeEvaluation,
      })),
      request.policy,
    );
    const bestKey = ranked[0] as RankableCandidate;
    const best = selectable.find(
      (candidate) => candidate.quoteId === bestKey.candidate.candidateId,
    ) as CandidateState;
    best.status = "SELECTED";
    for (const candidate of selectable) {
      if (candidate !== best && candidate.status === "PENDING_GATES") {
        candidate.status = "RUNNER_UP";
      }
    }

    const routeRef = `${request.executionId}/route/${best.venue.descriptor.venueId}/${best.quoteId}`;
    const routeHash = contentDigest({
      executionId: request.executionId,
      venueId: best.venue.descriptor.venueId,
      quoteId: best.quoteId,
      writeDigest: (best.preparedWrite as SelectedRoute["write"]).writeDigest,
      worstCaseOutput: best.quote.slippage.worstCaseOutput.minorUnits,
    });
    const runnerUp = ranked[1];
    const provenance = buildProvenance(request, candidates, venueOutcomes, {
      venueId: best.venue.descriptor.venueId,
      quoteId: best.quoteId,
      routeRef,
      routeHash,
      netNumeraireMinorUnits: (best.economic as NetOutcomeEvaluation).netNumeraireMinorUnits,
      ...(runnerUp !== undefined
        ? {
            marginOverRunnerUpMinorUnits: (
              BigInt((best.economic as NetOutcomeEvaluation).netNumeraireMinorUnits) -
              BigInt(runnerUp.evaluation.netNumeraireMinorUnits)
            ).toString(),
          }
        : {}),
    });
    return deepFreeze({
      decision: "ROUTE_SELECTED",
      selected: deepFreeze({
        routeRef,
        routeHash,
        venueId: best.venue.descriptor.venueId,
        quoteId: best.quoteId,
        quote: best.quote,
        health: best.health,
        write: best.preparedWrite as SelectedRoute["write"],
        gateDecision: best.gate as PinnedGateDecision,
        evaluation: best.economic as NetOutcomeEvaluation,
      }),
      ranking: candidates.map((candidate) => traceOf(candidate)),
      provenance,
    });
  }
}

function executionScopeFor(
  request: BestExecutionRequest,
  venue: ExecutionVenue,
): { instanceId: string; capabilityId: string } | undefined {
  return request.instances.find(
    (instance) =>
      instance.protocolKey === venue.protocol.protocolKey &&
      instance.chainKey === venue.protocol.chainKey &&
      instance.authorizationStatus === "ACTIVE" &&
      instance.eligible,
  );
}

function validateEngineRequest(request: BestExecutionRequest): void {
  if (!isNonEmptyString(request.executionId)) {
    throw new ValidationError("BestExecutionRequest.executionId must be a non-empty string");
  }
  validateSwapRequest(request.swap);
  validateBestExecutionPolicy(request.policy);
  if (
    !isNonEmptyString(request.security.policy.policyId) ||
    !Number.isSafeInteger(request.security.policy.version) ||
    request.security.policy.version < 1
  ) {
    throw new ValidationError("the security policy reference must carry a policyId and a positive version");
  }
  if (typeof request.security.evaluateGate !== "function") {
    throw new ValidationError("the security gate evaluator must be injected (this package never re-implements security)");
  }
  for (const instance of request.instances) {
    if (!isNonEmptyString(instance.instanceId) || !isNonEmptyString(instance.capabilityId)) {
      throw new ValidationError("every instance must carry instanceId and capabilityId");
    }
    if (!isNonEmptyString(instance.protocolKey) || !isNonEmptyString(instance.chainKey)) {
      throw new ValidationError("every instance must carry protocolKey and chainKey (the venue binding match)");
    }
  }
  if (!isNonEmptyString(request.owner) || !isNonEmptyString(request.beneficiary) || !isNonEmptyString(request.requestedBy)) {
    throw new ValidationError("owner, beneficiary and requestedBy must be non-empty strings");
  }
  if (typeof request.at !== "number" || !Number.isSafeInteger(request.at) || request.at < 0) {
    throw new ValidationError("the evaluation instant must be a non-negative integer (no ambient clock)");
  }
  if (!Number.isSafeInteger(request.routeExpiryMs) || request.routeExpiryMs <= request.at) {
    throw new ValidationError("routeExpiryMs must be an integer strictly after the evaluation instant");
  }
}

function quoteProvenanceParts(
  venue: ExecutionVenue,
  outcome: { kind: string; quote?: unknown; reason?: string },
): VenueQuoteProvenanceLike {
  const base = { venueId: venue.descriptor.venueId };
  if (outcome.kind === "QUOTE") {
    const quote = outcome.quote as {
      quoteId?: string;
      quoteSemantics?: string;
      optimizationOrigin?: string;
      freshness?: { asOfMs: number; maxAgeMs: number };
      provenance?: {
        providerName: string;
        source: string;
        capturedAtMs: number;
        evidenceRefs: readonly string[];
      };
    };
    const parts: Record<string, unknown> = { ...base, outcome: "QUOTED" };
    for (const key of ["quoteId", "quoteSemantics", "optimizationOrigin", "freshness", "provenance"] as const) {
      if (quote[key] !== undefined) {
        parts[key] = quote[key];
      }
    }
    return parts as unknown as VenueQuoteProvenanceLike;
  }
  const unknownParts: Record<string, unknown> = {
    ...base,
    outcome: outcome.kind === "UNAVAILABLE" ? "UNAVAILABLE" : "OUTCOME_UNKNOWN",
  };
  if (outcome.reason !== undefined) {
    unknownParts["reason"] = outcome.reason;
  }
  return unknownParts as unknown as VenueQuoteProvenanceLike;
}
