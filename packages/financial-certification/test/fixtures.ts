/**
 * Shared deterministic fixtures for the @payswap/financial-certification
 * test suite (Work Order P8-W1). Every identifier, instant and amount
 * below is a fixed constant; provider names are obviously synthetic.
 * The fixtures assemble the artifacts a SYNTHETIC CONFORMING CORRIDOR
 * would submit to the certification machinery — contract-level,
 * hermetic evidence only (the GAP-02 law: nothing here touches a live
 * provider, and no fixture ever claims to).
 */

import {
  applyLateEvent,
  certifiedQuoteDigest,
  classifyAmbiguousOutcome,
  conformanceVerdict,
  defineCertifiedQuoteObservation,
  reconcileProviderEvents,
  resolveUnknownOutcome,
  type CertifiedLegObservation,
  type CertifiedProviderEvent,
  type CertifiedQuoteCommand,
  type CertifiedQuoteObservation,
  type ConformanceVerdict,
  type ConformanceScenarioId,
  type RecordedAmbiguousAttempt,
  type RecordedEndpointDispatch,
  type RecordedPostLateState,
  type RecordedUnknownResolution,
  type LateEventObservation,
  type ReconciledRecordRef,
  type ReopenedReconciliation,
  type CertificationEvidence,
} from "../src/index.ts";

// ---------------------------------------------------------------------------
// Deterministic clocks + constants (both pinned clock kinds)
// ---------------------------------------------------------------------------

/** The fixed conformance epoch (the bigint window clock). */
export const T0: bigint = 1_766_000_000_000n;
/** The same instant on the number freshness clock. */
export const T0_NUM = 1_766_000_000_000;
/** The quote validity window (bigint ms). */
export const VALIDITY_MS = 30_000n;
/** The quote freshness bound (number ms). */
export const MAX_AGE_MS = 30_000;

export const SYNTHETIC_PROVIDER = "psp-alpha";
export const SYNTHETIC_RAIL = "fiat:sepa";

// ---------------------------------------------------------------------------
// LAW 1 — quote honesty fixtures
// ---------------------------------------------------------------------------

/** A conforming EXECUTABLE quote (fresh, unexpired, complete terms). */
export function conformingQuote(): CertifiedQuoteObservation {
  return defineCertifiedQuoteObservation({
    quoteId: "quote:alpha-1",
    quotedAt: T0,
    validUntil: T0 + VALIDITY_MS,
    freshness: { asOfMs: T0_NUM, maxAgeMs: MAX_AGE_MS },
    quoteSemantics: "EXECUTABLE",
    materialTerms: {
      beneficiaryId: "bene:alpha-1",
      payoutCurrency: "EUR",
      payoutAmountMinor: 10_000n,
      fiatPriceMinor: 1_050n,
      railId: SYNTHETIC_RAIL,
    },
    sourceRef: "obs:quote-alpha-1",
  });
}

/** A command correctly grounded in the quote (digest-bound, same terms). */
export function conformingCommandFor(
  quote: CertifiedQuoteObservation,
): CertifiedQuoteCommand {
  return {
    commandId: "cmd:alpha-1",
    quoteId: quote.quoteId,
    quoteDigest: certifiedQuoteDigest(quote),
    presentedTerms: { ...quote.materialTerms },
    evidenceRefs: ["ev:quote-alpha-1", "ev:cmd-alpha-1"],
  };
}

// ---------------------------------------------------------------------------
// LAW 2 — endpoint idempotency fixtures
// ---------------------------------------------------------------------------

/**
 * A conforming dispatch log: a first execution, a faithful replay, a
 * correctly-surfaced typed conflict, and a DISTINCT key for a distinct
 * intent.
 */
export function conformingDispatchLog(): RecordedEndpointDispatch[] {
  return [
    {
      endpointId: "op:create-payout",
      idempotencyKey: "payswap:cmd:alpha-1",
      commandId: "cmd:alpha-1",
      commandDigest: "fnv1a64:1111111111111111",
      externalEffectId: "ext:effect-1",
      outcome: "CONFIRMED",
    },
    {
      endpointId: "op:create-payout",
      idempotencyKey: "payswap:cmd:alpha-1",
      commandId: "cmd:alpha-1",
      commandDigest: "fnv1a64:1111111111111111",
      externalEffectId: "ext:effect-1",
      outcome: "CONFIRMED",
    },
    {
      endpointId: "op:create-payout",
      idempotencyKey: "payswap:cmd:alpha-1",
      commandId: "cmd:alpha-1",
      commandDigest: "fnv1a64:2222222222222222",
      outcome: "FAILED",
      conflictSurfaced: true,
    },
    {
      endpointId: "op:create-payout",
      idempotencyKey: "payswap:cmd:beta-2",
      commandId: "cmd:beta-2",
      commandDigest: "fnv1a64:3333333333333333",
      externalEffectId: "ext:effect-2",
      outcome: "CONFIRMED",
    },
  ];
}

// ---------------------------------------------------------------------------
// LAW 3 — leg separation fixtures
// ---------------------------------------------------------------------------

/** A conforming leg pair (separate everything, external payout). */
export function conformingLegs(): {
  funding: CertifiedLegObservation;
  payout: CertifiedLegObservation;
} {
  return {
    funding: {
      legKind: "FUNDING",
      legId: "leg:funding-1",
      authorizationLineage: {
        mandateRef: "mandate:corp-1",
        grantRef: "grant:funding-1",
        issuedAtEpoch: 7n,
      },
      observationEvidenceRefs: ["ev:funding-obs-1", "ev:funding-obs-2"],
      reconciliationRef: "recon:funding-1",
      custody: { party: "PAYER", externalDestination: false },
    },
    payout: {
      legKind: "PAYOUT",
      legId: "leg:payout-1",
      authorizationLineage: {
        mandateRef: "mandate:corp-1",
        grantRef: "grant:payout-1",
        issuedAtEpoch: 7n,
      },
      observationEvidenceRefs: ["ev:payout-obs-1"],
      reconciliationRef: "recon:payout-1",
      custody: { party: "PROVIDER", externalDestination: true },
    },
  };
}

// ---------------------------------------------------------------------------
// LAW 4 — event ordering fixtures
// ---------------------------------------------------------------------------

/**
 * A conforming event set (arrival order deliberately out-of-order, with
 * a duplicate delivery and a delayed late revision).
 */
export function conformingEventSet(): CertifiedProviderEvent[] {
  return [
    {
      providerName: SYNTHETIC_PROVIDER,
      eventId: "evt:3",
      externalId: "obj:payout-1",
      revision: 3,
      lifecycleStep: "PAYOUT_SENT",
      terminal: false,
    },
    {
      providerName: SYNTHETIC_PROVIDER,
      eventId: "evt:1",
      externalId: "obj:payout-1",
      revision: 1,
      lifecycleStep: "PAYOUT_INSTRUCTED",
      terminal: false,
    },
    {
      providerName: SYNTHETIC_PROVIDER,
      eventId: "evt:3", // duplicate delivery of evt:3 — harmless
      externalId: "obj:payout-1",
      revision: 3,
      lifecycleStep: "PAYOUT_SENT",
      terminal: false,
    },
    {
      providerName: SYNTHETIC_PROVIDER,
      eventId: "evt:2",
      externalId: "obj:payout-1",
      revision: 2,
      lifecycleStep: "PAYOUT_SUBMITTED",
      terminal: false,
    },
    {
      providerName: SYNTHETIC_PROVIDER,
      eventId: "evt:4",
      externalId: "obj:payout-1",
      revision: 4,
      lifecycleStep: "BENEFICIARY_CREDITED",
      terminal: true,
    },
    {
      providerName: SYNTHETIC_PROVIDER,
      eventId: "evt:9",
      externalId: "obj:refund-1",
      revision: 1,
      lifecycleStep: "REFUND_INITIATED",
      terminal: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// LAW 5 — ambiguity discipline fixtures
// ---------------------------------------------------------------------------

/** A conforming ambiguity dossier (UNKNOWN classified + external closure). */
export function conformingAmbiguityDossier(): {
  attempts: RecordedAmbiguousAttempt[];
  resolutions: RecordedUnknownResolution[];
} {
  return {
    attempts: [
      {
        commandRef: "cmd:gamma-1",
        transport: { kind: "TIMEOUT_AFTER_DISPATCH" },
        classifiedOutcome: classifyAmbiguousOutcome({
          kind: "TIMEOUT_AFTER_DISPATCH",
        }).outcome,
      },
      {
        commandRef: "cmd:gamma-2",
        transport: { kind: "CONNECTION_LOST_AFTER_DISPATCH" },
        classifiedOutcome: classifyAmbiguousOutcome({
          kind: "CONNECTION_LOST_AFTER_DISPATCH",
        }).outcome,
      },
    ],
    resolutions: [
      {
        commandRef: "cmd:gamma-1",
        resolvedTo: "CONFIRMED",
        closedBy: {
          source: "EXTERNAL_PROVIDER_RETRIEVAL",
          evidenceRefs: ["ev:retrieval-gamma-1"],
        },
      },
      {
        commandRef: "cmd:gamma-2",
        resolvedTo: "FAILED",
        closedBy: {
          source: "EXTERNAL_PROVIDER_STATEMENT",
          evidenceRefs: ["ev:statement-gamma-2"],
        },
      },
    ],
  };
}

/** The reference resolution used by the dossier (external only). */
export function conformingResolution(commandRef: string): ReturnType<typeof resolveUnknownOutcome> {
  return resolveUnknownOutcome({
    commandRef,
    resolvedTo: "CONFIRMED",
    evidence: {
      source: "EXTERNAL_PROVIDER_RETRIEVAL",
      evidenceRefs: ["ev:retrieval-1"],
    },
  });
}

// ---------------------------------------------------------------------------
// LAW 6 — late event fixtures
// ---------------------------------------------------------------------------

/** A conforming late-return probe (prior preserved, state reopened). */
export function conformingLateEventProbe(): {
  prior: ReconciledRecordRef;
  late: LateEventObservation;
  after: RecordedPostLateState;
  reopened: ReopenedReconciliation;
} {
  const prior: ReconciledRecordRef = {
    recordRef: "recon:payout-1",
    recordDigest: "fnv1a64:4444444444444444",
  };
  const late: LateEventObservation = {
    kind: "RETURN",
    providerRef: "ret:provider-77",
    occurredAt: T0 + 2_000_000n,
    receivedAt: T0 + 20_000_000n,
    amountMinor: 10_000n,
    currency: "EUR",
  };
  const reopened = applyLateEvent(prior, late);
  return {
    prior,
    late,
    after: {
      status: reopened.status,
      priorRecordDigest: reopened.priorRecordDigest,
      surfaceStage: reopened.surfaceStage,
    },
    reopened,
  };
}

// ---------------------------------------------------------------------------
// The assembled conforming-corridor dossier
// ---------------------------------------------------------------------------

/** Hermetic evidence (the honest marker — never a live claim). */
export function conformingEvidence(): CertificationEvidence[] {
  return [
    {
      evidenceId: "ev:hermetic-1",
      kind: "SYNTHETIC_CONTRACT_LEVEL",
      artifactRef: "artifact:conformance-dossier-1",
      contentDigest: "fnv1a64:5555555555555555",
    },
  ];
}

function verdictFrom(
  lawId: ConformanceVerdict["lawId"],
  scenarioId: ConformanceScenarioId,
  violations: readonly string[],
): ConformanceVerdict {
  return conformanceVerdict({
    lawId,
    scenarioId,
    subjectRef: "corridor:psp-alpha-sepa",
    violations,
    evidenceRefs: ["ev:hermetic-1"],
  });
}

/**
 * The full conforming-verdict set: all six behavioral laws exercised and
 * passing across all eight scenario families.
 */
export function conformingVerdicts(): ConformanceVerdict[] {
  return [
    verdictFrom("FIN-LAW-01", "QUOTE_EXPIRY", []),
    verdictFrom("FIN-LAW-01", "QUOTE_MATERIAL_CHANGE", []),
    verdictFrom("FIN-LAW-02", "ENDPOINT_IDEMPOTENCY", []),
    verdictFrom("FIN-LAW-03", "FUNDING_PAYOUT_SEPARATION", []),
    verdictFrom("FIN-LAW-04", "DUPLICATE_PROVIDER_EVENTS", []),
    verdictFrom("FIN-LAW-04", "OUT_OF_ORDER_PROVIDER_EVENTS", []),
    verdictFrom("FIN-LAW-05", "AMBIGUOUS_TIMEOUT_RECONCILIATION", []),
    verdictFrom("FIN-LAW-06", "LATE_RETURNS_REFUNDS_CHARGEBACKS", []),
  ];
}

/** The reconciled state of the conforming event set (for assertions). */
export function conformingReconciledState() {
  return reconcileProviderEvents(conformingEventSet());
}
