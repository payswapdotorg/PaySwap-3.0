/**
 * RECORDED FIXTURE — the canonical PaySwap 3.0 contract vocabulary as
 * recorded from the accepted packages at base commit 2999bbb (Phase-2-
 * complete STATE), for the desktop pin-fidelity battery (P7-W2).
 *
 * Recording method (auditable):
 * - RUNTIME-RECORDED vocabularies were imported from the accepted
 *   packages' source and dumped verbatim by
 *   scripts/record-payswap-pins.mjs (tsx ESM import of
 *   packages/{surface,protocol,provider-runtime}/src/index.ts) into
 *   recorded-contract-vocabulary.json — surface API version, the five
 *   outcome actions (labels, outcome lines, disclosures, dispatch
 *   authority + journey ids), the eleven areas (labels, routes, purposes,
 *   law citations, empty states), the sixteen progress stages, the eight
 *   authorization-change kinds, the five attempt states + six attempt
 *   events, the three external-effect outcomes + three ambiguity reasons.
 * - TYPE-UNION vocabularies below (stage statuses, fee bases, delivery
 *   estimate kinds, evidence node kinds, execution modes) were READ from
 *   the declared unions in the accepted source files at the same commit:
 *   packages/surface/src/progress-states.ts (StageStatus),
 *   quote-terms.ts (QuoteFeeBasis, DeliveryEstimateKind),
 *   packages/protocol/src/settlement/evidence.ts (EvidenceNodeKind),
 *   packages/provider-runtime/src/execution-mode.ts (ExecutionMode).
 *
 * The desktop's structural pins MUST equal this recording — drift fails
 * the battery rather than silently widening a contract.
 */

import recordedJson from "./recorded-contract-vocabulary.json" with { type: "json" };

export const recordedBaseCommit: string = recordedJson.baseCommit;
export const recordedAt: string = recordedJson.recordedAt;

export const recordedSurface = recordedJson.surface as {
  packageName: string;
  apiVersion: string;
  outcomeActions: {
    id: string;
    label: string;
    outcomeLine: string;
    advancedDisclosure: string[];
    dispatch: { authority: string; intentKind: string; journeyId: string };
  }[];
  areaIds: string[];
  areas: {
    id: string;
    label: string;
    route: string;
    purpose: string;
    lawCitations: string[];
    emptyState: { reason: string; nextAction: { kind: string; value: string } };
  }[];
  progressStages: string[];
  authorizationChangeKinds: string[];
};

export const recordedProtocol = recordedJson.protocol as {
  packageName: string;
  attemptStates: string[];
  attemptEvents: string[];
};

export const recordedProviderRuntime = recordedJson.providerRuntime as {
  packageName: string;
  externalEffectOutcomes: string[];
  ambiguityReasons: string[];
};

// Type-union vocabularies READ from the accepted source (see header).
export const recordedStageStatuses: readonly string[] = [
  "ACHIEVED",
  "IN_PROGRESS",
  "PENDING",
  "UNKNOWN",
  "FAILED",
  "NOT_APPLICABLE",
];

export const recordedQuoteFeeBases: readonly string[] = [
  "FLAT",
  "PERCENTAGE_OF_SOURCE",
  "PERCENTAGE_OF_TARGET",
  "PROVIDER_DISCLOSED",
];

export const recordedDeliveryEstimateKinds: readonly string[] = ["ESTIMATE", "GUARANTEE"];

export const recordedEvidenceNodeKinds: readonly string[] = [
  "AUTHORIZATION",
  "FUNDING",
  "CONVERSION",
  "PAYOUT",
  "OBSERVATION",
  "FINALITY",
  "RECONCILIATION",
];

export const recordedExecutionModes: readonly string[] = ["SANDBOX", "LIVE"];
