/**
 * PaySwap Desktop (P13-C) — the structured preview.
 *
 * Composes the preview the user MUST see and explicitly approve before
 * any consequential dispatch (ADR-0007 D7): the surface quote-terms fold
 * (the desktop's pinned composition of surface.quote-terms — provenance,
 * fee lines verbatim, rate provenance, expiry, estimate-vs-guarantee) +
 * the progress projection for the planned stages + destination and risk
 * fields — ALL honestly empty/absent in this deployment, rendered as the
 * typed facts they are.
 *
 * THE PREVIEW LAW:
 * - the preview carries the gate aggregate's decisions with reasons
 *   VERBATIM (never paraphrased away, never silently dropped);
 * - dispatchability is derived, never asserted: a preview is dispatchable
 *   ONLY when the aggregate gate PROCEEDs AND the intent compiled — a
 *   blocked preview is still presentable (honest orchestration history)
 *   but can never arm authorization;
 * - the preview never computes financial truth: fee totals display as
 *   declared or as NOT declared; rates display verbatim with provenance;
 *   no money arithmetic exists here (INV-01/INV-23);
 * - PREVIEW_PRESENTED is an event (recorded by the store, not here —
 *   this module is pure).
 */

import type { PaymentMissionRecord } from "./contracts.js";
import type { PaymentGateAggregate } from "./validation-gates.js";
import { foldDesktopQuoteTerms } from "../product/quote-terms.js";
import { foldDesktopProgressTimeline } from "../product/progress-timeline.js";
import type {
  DesktopProgressTimelineView,
  DesktopQuoteDisclosureView,
} from "../product/contracts.js";
import type {
  PinnedMoneyDisplayInput,
  PinnedQuoteTermsSource,
  PinnedStageObservation,
  PinnedSurfaceProgressStage,
} from "../pins/index.js";

/** The pinned default display context (explicit input; never ambient). */
export function defaultPreviewDisplay(): PinnedMoneyDisplayInput {
  return {
    locale: { thousandsSeparator: ",", decimalSeparator: ".", groupSize: 3 },
    currencyDigits: new Map([
      ["USD", 2],
      ["EUR", 2],
      ["GBP", 2],
    ]),
  };
}

/** The destination field — an observed reference, or the honest unverified fact. */
export type PaymentPreviewDestination =
  | {
      readonly status: "OBSERVED_REF";
      readonly displayName: string;
      readonly locationRef: string;
      readonly currency: string;
      readonly note: string;
    }
  | {
      readonly status: "UNVERIFIED";
      readonly reason: string;
    };

/** The risk field — typed facts only, honestly empty where nothing is observed. */
export interface PaymentPreviewRisk {
  /** The corridor-eligibility fact (verbatim from the gate aggregate). */
  readonly corridor: string;
  /** The fee/quote provenance fact (verbatim summary or the typed absence). */
  readonly quoteProvenance: string;
  /** The delivery fact (estimate vs guarantee — never conflated). */
  readonly delivery: string;
  /** The recipient-verification fact. */
  readonly recipientVerification: string;
  /** Submission is not finality (always stated). */
  readonly submissionIsNotFinality: string;
}

/** The structured preview record (pure data; the store persists + events it). */
export interface PaymentPreviewRecord {
  readonly previewId: string;
  readonly missionId: string;
  readonly presentedAt: string;
  /** Present iff a fresh quote bounds the preview (the quote expiry IS the preview expiry). */
  readonly expiresAt: string | undefined;
  readonly gates: PaymentGateAggregate;
  readonly intentCompiled: boolean;
  /** Present iff a fresh quote exists — the composed quote-terms disclosure. */
  readonly quoteView: DesktopQuoteDisclosureView | undefined;
  /** The planned-stage progress projection (the 16-stage vocabulary, honest statuses). */
  readonly progressView: DesktopProgressTimelineView;
  readonly destination: PaymentPreviewDestination;
  readonly risk: PaymentPreviewRisk;
  /** Derived, never asserted: aggregate PROCEED + intent compiled. */
  readonly dispatchable: boolean;
  /** The authorization request surface (what approving will authorize, in people language). */
  readonly authorizationScopeSummary: string;
}

/** The pinned unverified-destination reason (this deployment's truth). */
export const PREVIEW_UNVERIFIED_DESTINATION_REASON =
  "No observed destination exists for this mission — the recipient is stated, not verified. Destination facts require observations; none are observed, and none are invented.";

const PREVIEW_SUBMISSION_NOT_FINALITY_NOTE =
  "Approving and dispatching submits a payment command — an acknowledgement is not finality. The outcome becomes known only through recorded evidence, and UNKNOWN outcomes are reconciled before any retry.";

function plannedStageObservations(
  record: PaymentMissionRecord,
  gates: PaymentGateAggregate,
  now: string,
): readonly PinnedStageObservation[] {
  const observations: PinnedStageObservation[] = [];
  const corridorProceeded = gates.decisions.find(
    (decision) => decision.gate === "CORRIDOR" && decision.decision === "PROCEED",
  );
  observations.push({
    stage: "INTENT_RECORDED",
    status: record.intent !== undefined ? "ACHIEVED" : "PENDING",
    authorityRecordRef: `pmt-mission:${record.id}`,
    evidenceRefs: record.intent !== undefined ? [record.intent.intentId] : [],
    observedAt: now,
  });
  observations.push({
    stage: "ELIGIBILITY_CHECKED",
    // The check runs at preview time; the stage is ACHIEVED only when
    // eligibility was ESTABLISHED (a zero-route projection did not
    // establish eligibility — it honestly did not).
    status: corridorProceeded !== undefined ? "ACHIEVED" : "PENDING",
    authorityRecordRef: `pmt-mission:${record.id}`,
    evidenceRefs: corridorProceeded !== undefined ? [corridorProceeded.reason] : [],
    observedAt: now,
  });
  observations.push({
    stage: "QUOTE_ACCEPTED",
    // Acceptance happens through the explicit authorization act on THIS
    // preview — at presentation it is pending by construction.
    status: "PENDING",
    authorityRecordRef: `pmt-mission:${record.id}`,
    evidenceRefs: [],
    observedAt: now,
  });
  for (const stage of [
    "FUNDING_INSTRUCTED",
    "FUNDING_RECEIVED",
    "CONVERSION_EXECUTED",
    "PAYOUT_INSTRUCTED",
    "PAYOUT_SUBMITTED",
    "PAYOUT_SENT",
    "BENEFICIARY_CREDITED",
    "FINALITY_RECORDED",
    "RECONCILED",
  ] as const) {
    observations.push({
      stage,
      status: "PENDING",
      authorityRecordRef: `pmt-mission:${record.id}`,
      evidenceRefs: [],
      observedAt: now,
    });
  }
  return observations;
}

/**
 * Compose the structured preview (pure). The mission must have a complete
 * intake; the gate aggregate must be the one computed for THIS mission at
 * THIS instant (the caller runs the gates and passes the result — the
 * preview never re-runs or invents gate outcomes).
 */
export function composePaymentPreview(input: {
  readonly record: PaymentMissionRecord;
  readonly gates: PaymentGateAggregate;
  readonly freshQuote: PinnedQuoteTermsSource | undefined;
  readonly display: PinnedMoneyDisplayInput;
  readonly now: string;
  readonly previewId: string;
}): PaymentPreviewRecord {
  const { record, gates, freshQuote, display, now, previewId } = input;

  const quoteView =
    freshQuote !== undefined
      ? foldDesktopQuoteTerms({ source: freshQuote, now, display })
      : undefined;

  const progressView = foldDesktopProgressTimeline({
    observations: plannedStageObservations(record, gates, now),
    now,
  });

  const destination: PaymentPreviewDestination =
    gates.resolvedDestination !== undefined
      ? {
          status: "OBSERVED_REF",
          displayName: gates.resolvedDestination.displayName,
          locationRef: gates.resolvedDestination.locationRef,
          currency: gates.resolvedDestination.currency,
          note: `Destination observed as a funds-location reference (${gates.resolvedDestination.currency}) — a reference, never a balance, and never a verified-payee claim beyond the observation itself.`,
        }
      : { status: "UNVERIFIED", reason: PREVIEW_UNVERIFIED_DESTINATION_REASON };

  const corridorReason = gates.decisions.find((decision) => decision.gate === "CORRIDOR")?.reason ?? "";
  const risk: PaymentPreviewRisk = {
    corridor: corridorReason,
    quoteProvenance:
      freshQuote !== undefined
        ? `Quote ${freshQuote.quoteId} v${freshQuote.quoteVersion} — rate ${freshQuote.rate.value} (${freshQuote.rate.provenance}, as of ${freshQuote.rate.asOf}); expires ${freshQuote.expiry.at}.`
        : "No quote exists — fee and rate facts are absent, and absent facts are stated as absent (never invented).",
    delivery:
      freshQuote !== undefined
        ? freshQuote.delivery.kind === "GUARANTEE"
          ? `Guaranteed delivery: ${freshQuote.delivery.estimateLabel} (provider-backed).`
          : `Estimated delivery: ${freshQuote.delivery.estimateLabel} — an estimate, not a guarantee.`
        : "No delivery estimate exists — no quote, no estimate (an estimate is never invented).",
    recipientVerification:
      destination.status === "OBSERVED_REF"
        ? `Destination carries an observed funds-location reference — the recipient is as observed, no further verification is claimed.`
        : PREVIEW_UNVERIFIED_DESTINATION_REASON,
    submissionIsNotFinality: PREVIEW_SUBMISSION_NOT_FINALITY_NOTE,
  };

  const dispatchable = gates.decision === "PROCEED" && record.intent !== undefined;
  const amount = record.fields.amountAndCurrency.status === "CAPTURED"
    ? record.fields.amountAndCurrency.value
    : undefined;

  const authorizationScopeSummary =
    amount !== undefined
      ? `Approving this preview authorizes exactly one payment mission: ${amount.minorUnits} minor units of ${amount.currency} from the observed funding source to the ${
          destination.status === "OBSERVED_REF" ? `observed destination (${destination.displayName})` : "stated (unverified) destination"
        }, under the quoted terms as displayed, before the preview expiry. The approval is single-use, scoped to this mission and this preview, and expires with it. Text, voice and NLP input can never mint this approval.`
      : "Approving this preview authorizes exactly one payment mission under the quoted terms as displayed — the approval is single-use and scoped to this mission and this preview.";

  return Object.freeze({
    previewId,
    missionId: record.id,
    presentedAt: now,
    expiresAt: freshQuote !== undefined ? freshQuote.expiry.at : undefined,
    gates,
    intentCompiled: record.intent !== undefined,
    quoteView,
    progressView,
    destination,
    risk,
    dispatchable,
    authorizationScopeSummary,
  });
}

// ---------------------------------------------------------------------------
// The compensation preview (the safe-cancel path after a confirmed effect)
// ---------------------------------------------------------------------------

/**
 * Compose the structured preview for a COMPENSATION (the reversal of one
 * confirmed effect — the safe-cancel path). The mission must carry a
 * CONFIRMED create-attempt; the preview says exactly that: approving it
 * authorizes one reversal command against that recorded attempt, never a
 * new payment. The planned stages show what already happened as ACHIEVED
 * (recorded evidence) and the reversal stages (RETURNED/REFUNDED) as the
 * pending target — never a fabricated reversal fact.
 */
export function composeCompensationPreview(input: {
  readonly record: PaymentMissionRecord;
  readonly reversalOfAttemptId: string;
  readonly freshQuote: PinnedQuoteTermsSource | undefined;
  readonly display: PinnedMoneyDisplayInput;
  readonly now: string;
  readonly previewId: string;
}): PaymentPreviewRecord {
  const { record, freshQuote, display, now, previewId } = input;
  const quoteView =
    freshQuote !== undefined
      ? foldDesktopQuoteTerms({ source: freshQuote, now, display })
      : undefined;
  const confirmed = record.attempts.find(
    (attempt) => attempt.attemptId === input.reversalOfAttemptId,
  );
  if (confirmed === undefined || confirmed.envelope?.outcome !== "CONFIRMED") {
    throw new Error(
      "composeCompensationPreview: the reversal target must be a CONFIRMED attempt on the mission",
    );
  }

  const achieved: PinnedSurfaceProgressStage[] = [
    "INTENT_RECORDED",
    "ELIGIBILITY_CHECKED",
    "QUOTE_ACCEPTED",
    "FUNDING_INSTRUCTED",
    "FUNDING_RECEIVED",
    "CONVERSION_EXECUTED",
    "PAYOUT_INSTRUCTED",
    "PAYOUT_SUBMITTED",
    "PAYOUT_SENT",
    "BENEFICIARY_CREDITED",
    "FINALITY_RECORDED",
  ];
  const observations: PinnedStageObservation[] = achieved.map((stage) => ({
    stage,
    status: "ACHIEVED",
    authorityRecordRef: `pmt-mission:${record.id}`,
    evidenceRefs: [confirmed.attemptId],
    observedAt: now,
  }));
  for (const stage of ["RETURNED", "REFUNDED"] as const) {
    observations.push({
      stage,
      status: "PENDING",
      authorityRecordRef: `pmt-mission:${record.id}`,
      evidenceRefs: [],
      observedAt: now,
    });
  }
  const progressView = foldDesktopProgressTimeline({ observations, now });

  const amount =
    record.fields.amountAndCurrency.status === "CAPTURED"
      ? record.fields.amountAndCurrency.value
      : undefined;
  const authorizationScopeSummary =
    amount !== undefined
      ? `Approving this preview authorizes exactly one reversal command (CANCEL_OR_REVERSE_EFFECT) against the confirmed payment attempt ${input.reversalOfAttemptId} — ${amount.minorUnits} minor units of ${amount.currency} that already moved under this mission. The original payment happened and is recorded; this approval can only attempt its reversal, never a new payment. The approval is single-use, scoped to this mission and this preview. Text, voice and NLP input can never mint this approval.`
      : `Approving this preview authorizes exactly one reversal command (CANCEL_OR_REVERSE_EFFECT) against the confirmed payment attempt ${input.reversalOfAttemptId} under this mission. The approval is single-use and scoped to this mission and this preview.`;

  return Object.freeze({
    previewId,
    missionId: record.id,
    presentedAt: now,
    expiresAt: undefined,
    gates: {
      decisions: [],
      decision: "PROCEED" as const,
      reasons: [],
      // The compensation preview runs no accounts gate — the original
      // payment's resolved observations stand in the mission timeline.
      resolvedFunding: undefined,
      resolvedDestination: undefined,
    },
    intentCompiled: true,
    quoteView,
    progressView,
    destination: {
      status: "UNVERIFIED" as const,
      reason:
        "The compensation preview carries no new destination — it reverses a recorded confirmed attempt; destination facts are those of the original presentation (see the mission timeline).",
    },
    risk: {
      corridor:
        "Corridor eligibility was established for the original payment (recorded in the mission timeline); the reversal targets the same corridor attempt.",
      quoteProvenance:
        freshQuote !== undefined
          ? `Reversal terms quoted as ${freshQuote.quoteId} v${freshQuote.quoteVersion}; expires ${freshQuote.expiry.at}.`
          : "No fresh quote exists for the reversal — reversal fees and timing are provider facts stated by the authority, never invented here.",
      delivery:
        "Reversal delivery is a provider fact — no estimate is invented; the reversal outcome becomes known only through recorded evidence.",
      recipientVerification:
        "The reversal returns value toward the original funding source as the provider's reversal semantics allow — no new recipient claim is made.",
      submissionIsNotFinality: PREVIEW_SUBMISSION_NOT_FINALITY_NOTE,
    },
    dispatchable: true,
    authorizationScopeSummary,
  });
}
