/**
 * @payswap/surface — progress/exception/UNKNOWN state projections (P2-W3).
 *
 * NET-NEW module implementing the work order's PROGRESS/EXCEPTION/UNKNOWN
 * STATES: understandable progress states, return/refund paths,
 * authorization-change linkage, and honest UNKNOWN/error states.
 *
 * LAWS enforced here (canonical):
 * - INV-04 (UNKNOWN is not FAILED and is reconciled rather than blindly
 *   retried) at the UX boundary: an UNKNOWN observation renders as UNKNOWN
 *   — neither failure nor success — with the reconciliation-first wording.
 * - "Submission is not finality" (PAYSWAP-3.0.md financial protocol section):
 *   the surface can SAY it — PAYOUT_SUBMITTED renders an acknowledgement,
 *   never finality.
 * - "A payout sent is not beneficiary credit" (Wise §1/§6: provider status
 *   semantics; outgoing_payment_sent does not prove the beneficiary bank
 *   credited the account): PAYOUT_SENT carries the honest statement, and
 *   BENEFICIARY_CREDITED exists only as its own evidence-backed observation
 *   (fail-closed: claimed without evidence throws — no fabricated provider
 *   effects, INV-24).
 * - Late returns (Wise §4.4: "Keep return and refund paths open after a
 *   payout was reported sent"): whenever PAYOUT_SENT is observed, the view
 *   states that returns can arrive days or weeks later and that history is
 *   never rewritten.
 * - INV-23 (UI never owns financial truth): every stage observation carries
 *   a REFERENCE to the authoritative record (authorityRecordRef +
 *   evidenceRefs); the view never embeds or duplicates the record itself.
 */

import { surfaceProvenance, type SurfaceContractProvenance } from "./version.ts";

/** Raised when a progress observation is invalid (fail-closed). */
export class InvalidProgressObservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProgressObservationError";
  }
}

/**
 * The canonical surface lifecycle stages (Wise §4.3 "One truthful financial
 * lifecycle" mapped to PaySwap authorities; order = lifecycle order, then
 * late-exception paths). The closed, versioned vocabulary.
 */
export const SURFACE_PROGRESS_STAGES = [
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
  "RECONCILED",
  "RETURNED",
  "REFUNDED",
  "CHARGED_BACK",
  "CANCELLED",
] as const;

export type SurfaceProgressStage = (typeof SURFACE_PROGRESS_STAGES)[number];

/** The status of one stage observation. UNKNOWN is a first-class status (INV-04). */
export type StageStatus =
  | "ACHIEVED"
  | "IN_PROGRESS"
  | "PENDING"
  | "UNKNOWN"
  | "FAILED"
  | "NOT_APPLICABLE";

/**
 * One stage observation — a PROJECTION input. The surface references the
 * authoritative record; it never carries the record itself (INV-23).
 */
export interface StageObservation {
  readonly stage: SurfaceProgressStage;
  readonly status: StageStatus;
  /** Reference to the authoritative record that owns this stage (never the record). */
  readonly authorityRecordRef: string;
  /** Evidence references — every definitive claim is evidence-backed. */
  readonly evidenceRefs: readonly string[];
  /** When this observation was made (explicit input; ISO-8601 string). */
  readonly observedAt: string;
  /** Optional provider-visible status label, displayed verbatim (normalization must not erase provider semantics). */
  readonly providerStatus?: string;
}

/** Explicit fold inputs — the clock is an INPUT, never ambient. */
export interface ProgressFoldInput {
  /** ISO-8601 now (deterministic; used for display only). */
  readonly now: string;
}

/** People-language tone for a stage view (UI tone, not a new verdict). */
export type StageTone = "neutral" | "progress" | "success" | "warning" | "danger";

/** One stage's people-language view. */
export interface StageView {
  readonly stage: SurfaceProgressStage;
  readonly status: StageStatus;
  readonly tone: StageTone;
  /** The headline a person reads first. */
  readonly headline: string;
  /** The person-actionable explanation. */
  readonly explanation: string;
  readonly authorityRecordRef: string;
  readonly evidenceRefs: readonly string[];
  readonly observedAt: string;
  readonly providerStatus?: string;
}

/** Honest facts the renderer can branch on (the surface can SAY these). */
export interface ProgressFacts {
  /** True when a payout submission exists in any status. */
  readonly submissionIsNotFinality: boolean;
  /** True when PAYOUT_SENT is ACHIEVED without BENEFICIARY_CREDITED achieved. */
  readonly payoutSentWithoutBeneficiaryCredit: boolean;
  /** True whenever PAYOUT_SENT is observed — late returns stay possible. */
  readonly returnPathOpen: boolean;
}

/** The full progress timeline view. */
export interface ProgressTimelineView {
  /** The SIMPLE outcome line (progressive disclosure level 1). */
  readonly outcomeLine: string;
  /** Stage views in canonical lifecycle order. */
  readonly stages: readonly StageView[];
  readonly facts: ProgressFacts;
  readonly provenance: SurfaceContractProvenance;
}

const SUBMISSION_NOT_FINALITY_NOTE =
  "The provider acknowledged the payout command. An acknowledgement is not finality — the outcome is not yet known.";

const PAYOUT_SENT_NOT_BENEFICIARY_CREDIT_NOTE =
  "Funds were sent to the recipient's bank/payment network. A payout sent is not beneficiary credit — the recipient's bank crediting the account is a separate observation with its own evidence.";

const RETURN_PATH_NOTE =
  "Returns can arrive days or weeks after the payout was sent. If funds return, the return path records it as new history — nothing is rewritten.";

const UNKNOWN_NOTE =
  "UNKNOWN is neither failure nor success. The outcome must be reconciled with the provider before any retry — no blind retry is possible from this surface.";

function toneFor(status: StageStatus): StageTone {
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

function stageHeadline(stage: SurfaceProgressStage, status: StageStatus): string {
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

function stageExplanation(stage: SurfaceProgressStage, status: StageStatus): string {
  if (status === "UNKNOWN") return UNKNOWN_NOTE;
  if (status === "NOT_APPLICABLE") return "This stage does not apply to this journey.";
  switch (stage) {
    case "PAYOUT_SUBMITTED":
      return status === "ACHIEVED" ? SUBMISSION_NOT_FINALITY_NOTE : "The payout command has not yet been submitted.";
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

function stageView(observation: StageObservation): StageView {
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

const STAGE_ORDER: ReadonlyMap<SurfaceProgressStage, number> = new Map(
  SURFACE_PROGRESS_STAGES.map((stage, index) => [stage, index] as const),
);

function validateObservation(observation: StageObservation): void {
  if (!STAGE_ORDER.has(observation.stage)) {
    throw new InvalidProgressObservationError(
      `unknown stage ${JSON.stringify(observation.stage)} — the stage vocabulary is closed`,
    );
  }
  if (typeof observation.authorityRecordRef !== "string" || observation.authorityRecordRef.length === 0) {
    throw new InvalidProgressObservationError(
      `stage ${observation.stage}: authorityRecordRef must be a non-empty reference (the surface never owns the record)`,
    );
  }
  if (typeof observation.observedAt !== "string" || observation.observedAt.length === 0) {
    throw new InvalidProgressObservationError(`stage ${observation.stage}: observedAt must be a non-empty ISO-8601 string`);
  }
  if (
    observation.stage === "BENEFICIARY_CREDITED" &&
    observation.status === "ACHIEVED" &&
    observation.evidenceRefs.length === 0
  ) {
    throw new InvalidProgressObservationError(
      "BENEFICIARY_CREDITED cannot be claimed ACHIEVED without evidence — a payout sent is not beneficiary credit (INV-24: no fabricated provider effects)",
    );
  }
}

/**
 * Fold stage observations into the progress timeline view. Pure: same
 * input, same view; `now` is an explicit input. Stages render in canonical
 * lifecycle order regardless of input order; duplicate stages are refused.
 * Fail-closed on invalid observations.
 */
export function foldProgressTimeline(
  observations: readonly StageObservation[],
  input: ProgressFoldInput,
): ProgressTimelineView {
  const seen = new Set<SurfaceProgressStage>();
  for (const observation of observations) {
    validateObservation(observation);
    if (seen.has(observation.stage)) {
      throw new InvalidProgressObservationError(
        `duplicate stage ${observation.stage} — one observation per stage`,
      );
    }
    seen.add(observation.stage);
  }

  const stages = [...observations]
    .sort((a, b) => (STAGE_ORDER.get(a.stage) ?? 0) - (STAGE_ORDER.get(b.stage) ?? 0))
    .map(stageView);

  const submitted = observations.find((o) => o.stage === "PAYOUT_SUBMITTED");
  const payoutSent = observations.find((o) => o.stage === "PAYOUT_SENT");
  const beneficiaryCredited = observations.find((o) => o.stage === "BENEFICIARY_CREDITED");
  const facts: ProgressFacts = {
    submissionIsNotFinality: submitted !== undefined,
    payoutSentWithoutBeneficiaryCredit:
      payoutSent?.status === "ACHIEVED" && beneficiaryCredited?.status !== "ACHIEVED",
    returnPathOpen: payoutSent !== undefined,
  };

  const latest = stages[stages.length - 1];
  const outcomeLine = latest
    ? `${latest.headline} — ${latest.explanation}${facts.returnPathOpen ? ` ${RETURN_PATH_NOTE}` : ""}`
    : "No stage observations yet — the timeline renders only what the authoritative planes record.";

  return {
    outcomeLine,
    stages,
    facts,
    provenance: surfaceProvenance("P2-W3"),
  };
}
