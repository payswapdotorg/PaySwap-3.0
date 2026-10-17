/**
 * PaySwap Desktop (P7-W2) — the progress timeline fold.
 *
 * Composes the pinned progress-states contract (surface.progress-states)
 * into the desktop timeline view. The fold mirrors the accepted contract
 * law exactly:
 *
 * - Stages render in CANONICAL lifecycle order regardless of input order.
 * - Duplicate stages are refused (one observation per stage).
 * - UNKNOWN renders as UNKNOWN — neither failure nor success — with the
 *   reconciliation-first wording (INV-04).
 * - PAYOUT_SUBMITTED renders an acknowledgement, never finality
 *   (submission is not finality).
 * - PAYOUT_SENT carries the honest statement (a payout sent is not
 *   beneficiary credit); BENEFICIARY_CREDITED claimed ACHIEVED without
 *   evidence REFUSES the fold (INV-24 — no fabricated provider effects).
 * - Late returns: whenever PAYOUT_SENT is observed, the return-path note
 *   is appended and history is never rewritten.
 * - Every stage observation carries a REFERENCE to the authoritative
 *   record (INV-23) — the view never embeds the record itself.
 */

import type { DesktopProgressFoldInput, DesktopProgressTimelineView } from "./contracts.js";
import {
  PINNED_SURFACE_PROGRESS_STAGES,
  isPinnedProgressStage,
  isPinnedStageStatus,
} from "../pins/index.js";
import type {
  PinnedStageObservation,
  PinnedStageStatus,
  PinnedStageTone,
  PinnedStageView,
  PinnedSurfaceProgressStage,
} from "../pins/index.js";
import { pinnedSurfaceProvenance } from "../pins/index.js";

const SUBMISSION_NOT_FINALITY_NOTE =
  "The provider acknowledged the payout command. An acknowledgement is not finality — the outcome is not yet known.";

const PAYOUT_SENT_NOT_BENEFICIARY_CREDIT_NOTE =
  "Funds were sent to the recipient's bank/payment network. A payout sent is not beneficiary credit — the recipient's bank crediting the account is a separate observation with its own evidence.";

const RETURN_PATH_NOTE =
  "Returns can arrive days or weeks after the payout was sent. If funds return, the return path records it as new history — nothing is rewritten.";

const UNKNOWN_NOTE =
  "UNKNOWN is neither failure nor success. The outcome must be reconciled with the provider before any retry — no blind retry is possible from this surface.";

const NO_OBSERVATIONS_LINE =
  "No stage observations yet — the timeline renders only what the authoritative planes record.";

function toneFor(status: PinnedStageStatus): PinnedStageTone {
  switch (status) {
    case "ACHIEVED":
      return "success";
    case "IN_PROGRESS":
      return "progress";
    case "PENDING":
      return "neutral";
    case "UNKNOWN":
      return "warning";
    case "FAILED":
      return "danger";
    case "NOT_APPLICABLE":
      return "neutral";
  }
}

function stageHeadline(
  stage: PinnedSurfaceProgressStage,
  status: PinnedStageStatus,
): string {
  if (status === "UNKNOWN") {
    return "This stage is not yet decided";
  }
  switch (stage) {
    case "INTENT_RECORDED":
      return "Intent recorded";
    case "ELIGIBILITY_CHECKED":
      return "Eligibility checked";
    case "QUOTE_ACCEPTED":
      return "Quote accepted";
    case "FUNDING_INSTRUCTED":
      return "Funding instructed";
    case "FUNDING_RECEIVED":
      return "Funding received";
    case "CONVERSION_EXECUTED":
      return "Conversion executed";
    case "PAYOUT_INSTRUCTED":
      return "Payout instructed";
    case "PAYOUT_SUBMITTED":
      return "Payout submitted";
    case "PAYOUT_SENT":
      return "Payout sent";
    case "BENEFICIARY_CREDITED":
      return "Beneficiary credited";
    case "FINALITY_RECORDED":
      return "Finality recorded";
    case "RECONCILED":
      return "Reconciled";
    case "RETURNED":
      return "Funds returned";
    case "REFUNDED":
      return "Funds refunded";
    case "CHARGED_BACK":
      return "Chargeback recorded";
    case "CANCELLED":
      return "Cancelled";
  }
}

function stageExplanation(
  stage: PinnedSurfaceProgressStage,
  status: PinnedStageStatus,
): string {
  if (status === "UNKNOWN") return UNKNOWN_NOTE;
  if (status === "NOT_APPLICABLE") return "This stage does not apply to this journey.";
  switch (stage) {
    case "PAYOUT_SUBMITTED":
      return status === "ACHIEVED"
        ? SUBMISSION_NOT_FINALITY_NOTE
        : "The payout command has not yet been submitted.";
    case "PAYOUT_SENT":
      return PAYOUT_SENT_NOT_BENEFICIARY_CREDIT_NOTE;
    case "BENEFICIARY_CREDITED":
      return "The recipient's bank/payment network credited the account — recorded only with its own provider/rail evidence, never inferred from the payout being sent.";
    case "PAYOUT_INSTRUCTED":
      return "The payout instruction was issued to the provider. Instructing is not sending.";
    case "FUNDING_INSTRUCTED":
      return "The funding instruction was issued. Instructing is not receiving.";
    case "FUNDING_RECEIVED":
      return "Evidence exists that funds were received — a distinct record from the instruction.";
    case "CONVERSION_EXECUTED":
      return "The conversion ran with the actual rate and fees applied — a distinct record from the quoted terms.";
    case "QUOTE_ACCEPTED":
      return "The versioned quote terms were accepted. A quote is a bounded offer, never an authorization.";
    case "INTENT_RECORDED":
      return "The economic goal and its intent are recorded by the economic authority.";
    case "ELIGIBILITY_CHECKED":
      return "Corridor/capability eligibility was established as a discovery projection — catalogue support alone never made anything executable.";
    case "FINALITY_RECORDED":
      return "The financial protocol recorded finality — the sole authority for financial truth.";
    case "RECONCILED":
      return "Reconciliation and evidence closed the loop.";
    case "RETURNED":
      return "Funds came back — recorded as new history, never as a rewrite of the payout record.";
    case "REFUNDED":
      return "Funds were refunded — a compensating path, not a mutation of history.";
    case "CHARGED_BACK":
      return "A chargeback was recorded — the return path stays open.";
    case "CANCELLED":
      return "The journey was cancelled before completion.";
  }
}

const STAGE_ORDER: ReadonlyMap<PinnedSurfaceProgressStage, number> = new Map(
  PINNED_SURFACE_PROGRESS_STAGES.map((stage, index) => [stage, index] as const),
);

function validateObservation(observation: PinnedStageObservation): void {
  if (!isPinnedProgressStage(observation.stage)) {
    throw new Error(
      `unknown stage ${JSON.stringify(observation.stage)} — the stage vocabulary is closed`,
    );
  }
  if (!isPinnedStageStatus(observation.status)) {
    throw new Error(
      `stage ${observation.stage}: unknown status ${JSON.stringify(observation.status)} — the status vocabulary is closed`,
    );
  }
  if (
    typeof observation.authorityRecordRef !== "string" ||
    observation.authorityRecordRef.length === 0
  ) {
    throw new Error(
      `stage ${observation.stage}: authorityRecordRef must be a non-empty reference (the surface never owns the record)`,
    );
  }
  if (typeof observation.observedAt !== "string" || observation.observedAt.length === 0) {
    throw new Error(
      `stage ${observation.stage}: observedAt must be a non-empty ISO-8601 string`,
    );
  }
  if (
    observation.stage === "BENEFICIARY_CREDITED" &&
    observation.status === "ACHIEVED" &&
    observation.evidenceRefs.length === 0
  ) {
    throw new Error(
      "BENEFICIARY_CREDITED cannot be claimed ACHIEVED without evidence — a payout sent is not beneficiary credit (INV-24: no fabricated provider effects)",
    );
  }
}

function stageView(observation: PinnedStageObservation): PinnedStageView {
  return {
    stage: observation.stage,
    status: observation.status,
    tone: toneFor(observation.status),
    headline: stageHeadline(observation.stage, observation.status),
    explanation: stageExplanation(observation.stage, observation.status),
    authorityRecordRef: observation.authorityRecordRef,
    evidenceRefs: observation.evidenceRefs,
    observedAt: observation.observedAt,
    ...(observation.providerStatus !== undefined
      ? { providerStatus: observation.providerStatus }
      : {}),
  };
}

/**
 * Fold stage observations into the desktop progress timeline view. Pure:
 * same input, same view; `now` is an explicit input. Stages render in
 * canonical lifecycle order regardless of input order; duplicate stages
 * are refused. Fail-closed on invalid observations.
 */
export function foldDesktopProgressTimeline(
  input: DesktopProgressFoldInput,
): DesktopProgressTimelineView {
  const observations = input.observations;
  const seen = new Set<PinnedSurfaceProgressStage>();
  for (const observation of observations) {
    validateObservation(observation);
    if (seen.has(observation.stage)) {
      throw new Error(`duplicate stage ${observation.stage} — one observation per stage`);
    }
    seen.add(observation.stage);
  }

  const stages = [...observations]
    .sort((a, b) => (STAGE_ORDER.get(a.stage) ?? 0) - (STAGE_ORDER.get(b.stage) ?? 0))
    .map(stageView);

  const submitted = observations.find((o) => o.stage === "PAYOUT_SUBMITTED");
  const payoutSent = observations.find((o) => o.stage === "PAYOUT_SENT");
  const beneficiaryCredited = observations.find((o) => o.stage === "BENEFICIARY_CREDITED");
  const facts = {
    submissionIsNotFinality: submitted !== undefined,
    payoutSentWithoutBeneficiaryCredit:
      payoutSent?.status === "ACHIEVED" && beneficiaryCredited?.status !== "ACHIEVED",
    returnPathOpen: payoutSent !== undefined,
  };

  const latest = stages[stages.length - 1];
  const outcomeLine = latest
    ? `${latest.headline} — ${latest.explanation}${facts.returnPathOpen ? ` ${RETURN_PATH_NOTE}` : ""}`
    : NO_OBSERVATIONS_LINE;

  return {
    outcomeLine,
    stages: Object.freeze(stages),
    facts,
    provenance: pinnedSurfaceProvenance("P2-W3"),
  };
}
