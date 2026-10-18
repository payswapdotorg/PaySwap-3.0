/**
 * @payswap/route-compiler — the decision-provenance contracts (P5-W1).
 *
 * PORT of the old best-execution provenance.ts (MMI-19): the DECISION
 * TRACE — every venue asked, every candidate assessed, the selection
 * (with the exact margin over the runner-up) and the evidence refs.
 * Provenance is what makes best execution AUDITABLE: the same inputs at
 * the same instant produce byte-identical provenance JSON.
 *
 * UNKNOWN is carried, never converted (INV-X01): a candidate that is
 * neither selectable nor failed stays UNKNOWN in the trace with its
 * unknown dimensions; only fresh evidence resolves it.
 */

import type { HealthObservation } from "./quote-fees.ts";
import type { NetOutcomeEvaluation } from "./scoring.ts";
import type { OptimizationOrigin } from "./quote.ts";
/** One venue's quote-stage outcome as recorded in the chain (verbatim). */
export interface VenueQuoteProvenance {
  readonly venueId: string;
  readonly outcome: "QUOTED" | "UNAVAILABLE" | "OUTCOME_UNKNOWN";
  readonly quoteId?: string;
  readonly quoteSemantics?: "INDICATIVE" | "EXECUTABLE";
  readonly optimizationOrigin?: OptimizationOrigin;
  readonly freshness?: { readonly asOfMs: number; readonly maxAgeMs: number };
  readonly provenance?: {
    readonly providerName: string;
    readonly source: string;
    readonly capturedAtMs: number;
    readonly evidenceRefs: readonly string[];
  };
  readonly reason?: string;
}

/** The candidate status vocabulary (SELECTED wins; UNKNOWN never converts). */
export const CANDIDATE_STATUSES = Object.freeze([
  "SELECTED",
  "RUNNER_UP",
  "UNKNOWN",
  "DISQUALIFIED",
  "SECURITY_BLOCKED",
] as const);

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

/** One disqualification reason (code + detail, never just the first). */
export interface DisqualificationReason {
  readonly code: string;
  readonly detail: string;
}

/** One unknown dimension (held UNKNOWN, resolvable by fresh evidence). */
export interface UnknownEvaluationDimension {
  readonly code: string;
  readonly detail: string;
}

/** The security-gate outcome trace of one candidate. */
export interface GateOutcomeTrace {
  readonly gateDecision: "ALLOW" | "BLOCK" | "UNKNOWN" | "NOT_EVALUATED";
  readonly writeDigest?: string;
  readonly blockReasonCodes?: readonly string[];
  readonly unknownDimensionCodes?: readonly string[];
}

/** The full assessment trace of one candidate. */
export interface CandidateEvaluationTrace {
  /** From the REGISTERED venue, never the (possibly malformed) quote. */
  readonly venueId: string;
  readonly quoteId: string;
  readonly quoteProvenance: VenueQuoteProvenance;
  readonly health: HealthObservation;
  readonly policyCompliance: {
    readonly compliant: boolean;
    readonly violations: readonly string[];
  };
  /** Present whenever the quote was well-formed (even if disqualified). */
  readonly economic?: NetOutcomeEvaluation;
  readonly security: GateOutcomeTrace;
  readonly status: CandidateStatus;
  readonly disqualifications?: readonly DisqualificationReason[];
  readonly unknownDimensions?: readonly UnknownEvaluationDimension[];
}

/** The selection provenance (with the exact net margin over the runner-up). */
export interface SelectionProvenance {
  readonly venueId: string;
  readonly quoteId: string;
  readonly routeRef: string;
  readonly routeHash: string;
  readonly netNumeraireMinorUnits: string;
  readonly marginOverRunnerUpMinorUnits?: string;
}

/** Build the policy reference of a provenance chain (deterministic). */
export function provenanceEvidenceRefs(chain: RouteProvenanceChain): readonly string[] {
  return chain.evidenceRefs;
}

/** The complete provenance chain of one best-execution decision. */
export interface RouteProvenanceChain {
  readonly executionId: string;
  readonly decidedAt: number;
  /** `${policyId}@${version}` of the best-execution policy. */
  readonly policyRef: string;
  readonly numeraire: string;
  readonly securityPolicyRef: string;
  readonly venues: readonly {
    readonly venueId: string;
    readonly outcome: "QUOTED" | "UNAVAILABLE" | "OUTCOME_UNKNOWN";
    readonly quoteId?: string;
    readonly quoteSemantics?: "INDICATIVE" | "EXECUTABLE";
    readonly optimizationOrigin?: "PROVIDER_NATIVE" | "COMPOSED";
    readonly freshness?: { readonly asOfMs: number; readonly maxAgeMs: number };
    readonly provenance?: {
      readonly providerName: string;
      readonly source: string;
      readonly capturedAtMs: number;
      readonly evidenceRefs: readonly string[];
    };
    readonly reason?: string;
  }[];
  readonly candidates: readonly {
    readonly venueId: string;
    readonly quoteId: string;
    readonly quoteProvenance: {
      readonly venueId: string;
      readonly outcome: "QUOTED" | "UNAVAILABLE" | "OUTCOME_UNKNOWN";
    };
    readonly health: {
      readonly status: string;
      readonly observedAtMs: number;
      readonly maxAgeMs: number;
    };
    readonly policyCompliance: { readonly compliant: boolean; readonly violations: readonly string[] };
    readonly economic?: {
      readonly candidateId: string;
      readonly numeraire: string;
      readonly netNumeraireMinorUnits: string;
    };
    readonly security: {
      readonly gateDecision: "ALLOW" | "BLOCK" | "UNKNOWN" | "NOT_EVALUATED";
      readonly writeDigest?: string;
      readonly blockReasonCodes?: readonly string[];
      readonly unknownDimensionCodes?: readonly string[];
    };
    readonly status: "SELECTED" | "RUNNER_UP" | "UNKNOWN" | "DISQUALIFIED" | "SECURITY_BLOCKED";
    readonly disqualifications?: readonly { readonly code: string; readonly detail: string }[];
    readonly unknownDimensions?: readonly { readonly code: string; readonly detail: string }[];
  }[];
  readonly selection?: {
    readonly venueId: string;
    readonly quoteId: string;
    readonly routeRef: string;
    readonly routeHash: string;
    readonly netNumeraireMinorUnits: string;
    readonly marginOverRunnerUpMinorUnits?: string;
  };
  readonly evidenceRefs: readonly string[];
}
