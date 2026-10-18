/**
 * @zcode/web/payswap — honest UNKNOWN / error state folds.
 *
 * PORT of the P7-W1 share of payswap.org@8a735bf packages/ux
 * src/honest-states.ts (764L) + src/error-reasons.ts (269L) (MMP-35),
 * re-implemented over the CANONICAL PaySwap 3.0 vocabulary:
 * - provider-runtime's CONFIRMED/UNKNOWN/FAILED execution envelope
 *   (+ AMBIGUITY_REASONS) — pinned in ../pins/provider-runtime-pins.ts;
 * - surface's 16-stage progress lifecycle StageStatus — pinned in
 *   ../pins/surface-pins.ts.
 *
 * The old modules imported @payswap/interfaces / @payswap/execution
 * (packages that do not exist in PaySwap 3.0); the LAWS port, the old type
 * surface does not. PORTED LAWS:
 * - INV-X01: UNKNOWN is NEVER mapped to FAILED — it renders as
 *   reconciling with the reconciliation/action path surfaced, never the
 *   danger tone, never a failure headline.
 * - FAILED renders honestly as failure; its guidance comes from provider
 *   evidence, never inference; retry is only as a NEW intent with a fresh
 *   idempotency key (INV-04/INV-05 posture).
 * - Every error category maps to a deterministic, ACTIONABLE people-
 *   language treatment; AMBIGUOUS_OUTCOME renders as UNKNOWN
 *   reconciliation, never a red error.
 * Deterministic by construction: pure derivations, no DOM, no network,
 * no clock (the old suite's law, kept).
 */

import type {
  ErrorReasonView,
  ExecutionOutcomeFoldInput,
  ExecutionOutcomeView,
  StageStatusView,
  WebErrorFamily,
} from "../contracts/honest-states.js";
import type { HonestTone } from "../contracts/view-models.js";
import type { AmbiguityReasonPin } from "../pins/provider-runtime-pins.js";
import type { StageStatusPin } from "../pins/surface-pins.js";

/* ====================================================================
 * Execution-outcome folds (total over CONFIRMED / UNKNOWN / FAILED)
 * ==================================================================== */

/** People language for each pinned ambiguity reason (verbatim, deterministic). */
const AMBIGUITY_LANGUAGE: Record<AmbiguityReasonPin, string> = {
  TRANSPORT_TIMEOUT_AFTER_DISPATCH:
    "the request was dispatched but the answer timed out — the effect may have landed",
  TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH:
    "the connection was lost after dispatch — the effect may have landed",
  MALFORMED_RESPONSE_AFTER_DISPATCH:
    "the provider answered with bytes that could not be interpreted — the effect may have committed",
};

const RECONCILIATION_NOTE =
  "Reconciliation reads the provider's own record of the effect before any consequential retry — a blind retry could pay twice.";

/**
 * Fold ONE provider-verified execution outcome into its honest view.
 * Total over the pinned three-value vocabulary; UNKNOWN renders as
 * UNKNOWN (reconciliation-first), never as failure or success.
 */
export function foldExecutionOutcome(input: ExecutionOutcomeFoldInput): ExecutionOutcomeView {
  switch (input.outcome) {
    case "CONFIRMED":
      return {
        outcome: "CONFIRMED",
        tone: "positive",
        headline: "Confirmed by the provider",
        guidance:
          "The external effect is provider-verified. Evidence references are recorded with the observation; submission was never the proof — the provider's answer is.",
        actions: [
          {
            actionId: "view-evidence",
            label: "View the evidence",
            kind: "EVIDENCE_VIEW",
            authorityRef: input.authorityRef,
          },
        ],
      };
    case "UNKNOWN":
      return {
        outcome: "UNKNOWN",
        tone: "unknown",
        headline: "Unknown — reconciling",
        guidance: `The outcome is UNKNOWN: ${AMBIGUITY_LANGUAGE[input.ambiguityReason ?? "TRANSPORT_TIMEOUT_AFTER_DISPATCH"]}. This is not a failure — it is unresolved truth, and it is never quietly resolved.`,
        actions: [
          {
            actionId: "view-evidence",
            label: "View the retained provider state",
            kind: "EVIDENCE_VIEW",
            authorityRef: input.authorityRef,
          },
          {
            actionId: "open-reconciliation",
            label: "Open the reconciliation path",
            kind: "NAVIGATION",
            authorityRef: input.authorityRef,
          },
        ],
        reconciliationNote: RECONCILIATION_NOTE,
      };
    case "FAILED":
      return {
        outcome: "FAILED",
        tone: "negative",
        headline: input.providerFailure?.retryable === true
          ? "Failed — retryable"
          : "Failed",
        guidance:
          "The failure reason comes from provider evidence, not inference. Retry only as a NEW intent carrying a fresh idempotency key — never a blind resubmission of the same command.",
        actions: [
          {
            actionId: "view-evidence",
            label: "Investigate the evidence",
            kind: "EVIDENCE_VIEW",
            authorityRef: input.authorityRef,
          },
          {
            actionId: "retry-as-new-intent",
            label: "Retry as a new intent (fresh key)",
            kind: "NAVIGATION",
            authorityRef: input.authorityRef,
          },
        ],
      };
  }
}

/* ====================================================================
 * Progress-stage status folds (total over the pinned StageStatus)
 * ==================================================================== */

/**
 * Fold ONE stage-observation status into its honest view. Total over the
 * pinned six-value StageStatus vocabulary; UNKNOWN renders as
 * reconciliation, FAILED as honest failure — never conflated.
 */
export function foldStageStatus(status: StageStatusPin): StageStatusView {
  switch (status) {
    case "ACHIEVED":
      return {
        status,
        tone: "positive",
        headline: "Achieved",
        guidance: "The stage is recorded as achieved by its authoritative record.",
      };
    case "IN_PROGRESS":
      return {
        status,
        tone: "attention",
        headline: "In progress",
        guidance: "The stage is underway. Progress is not finality — it advances on observations.",
      };
    case "PENDING":
      return {
        status,
        tone: "neutral",
        headline: "Pending",
        guidance: "The stage has not started yet.",
      };
    case "UNKNOWN":
      return {
        status,
        tone: "unknown",
        headline: "Unknown — reconciling",
        guidance:
          "The stage's state is UNKNOWN. This is not a failure: reconciliation resolves it against the authoritative record before anything consequential follows.",
      };
    case "FAILED":
      return {
        status,
        tone: "negative",
        headline: "Failed",
        guidance: "The stage is recorded as failed by its authoritative record.",
      };
    case "NOT_APPLICABLE":
      return {
        status,
        tone: "neutral",
        headline: "Not applicable",
        guidance: "This stage does not apply to this journey.",
      };
  }
}

/* ====================================================================
 * Error-reason folds (deterministic, actionable, never a fake failure)
 * ==================================================================== */

/** Fold an error family into its people-language view (total, deterministic). */
export function foldErrorReason(family: WebErrorFamily): ErrorReasonView {
  switch (family.kind) {
    case "AMBIGUOUS_OUTCOME":
      return {
        family: family.kind,
        tone: "unknown",
        headline: "Outcome unknown — reconciling",
        guidance: `The effect may have landed: ${AMBIGUITY_LANGUAGE[family.reason]}. ${RECONCILIATION_NOTE}`,
        rendersAsUnknown: true,
      };
    case "PROVIDER_FAILURE":
      return {
        family: family.kind,
        tone: "negative",
        headline: family.retryable ? "Provider failure — retryable" : "Provider failure",
        guidance: family.retryable
          ? "The provider reported a transient failure. Retry the operation as a new intent with a fresh idempotency key."
          : "The provider reported a definitive failure. The recorded reason is the truth — retrying the same command will not change it.",
        rendersAsUnknown: false,
      };
    case "NOT_CONFIGURED":
      return {
        family: family.kind,
        tone: "attention",
        headline: "Not configured — and shown as such",
        guidance: `${family.missing} is not configured in this deployment. The surface refuses to fabricate a value for it.`,
        rendersAsUnknown: false,
      };
    case "INVALID_INPUT":
      return {
        family: family.kind,
        tone: "attention",
        headline: "Invalid input",
        guidance: `The input was rejected before any external effect: ${family.detail}. Nothing was dispatched.`,
        rendersAsUnknown: false,
      };
  }
}

/** The honest tone for an outcome word (mapping law: UNKNOWN never negative). */
export function toneForOutcomeWord(word: "CONFIRMED" | "UNKNOWN" | "FAILED"): HonestTone {
  switch (word) {
    case "CONFIRMED":
      return "positive";
    case "UNKNOWN":
      return "unknown";
    case "FAILED":
      return "negative";
  }
}
