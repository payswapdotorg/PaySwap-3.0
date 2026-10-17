/**
 * PaySwap Desktop (P7-W2) — the journey honest-states derivation.
 *
 * THE DESKTOP HONEST-STATES LAW (work order, hard constraint):
 * desktop UI states derive from PROVIDER-VERIFIED OBSERVATIONS
 * (CONFIRMED/UNKNOWN/FAILED), never from submission. This module is that
 * law as code:
 *
 * - CONFIRMED (provider-verified success) renders `CONFIRMED`.
 * - UNKNOWN renders `UNKNOWN_RECONCILING` — NEITHER failure NOR success
 *   (INV-04): reconciliation with the provider precedes any retry; no
 *   blind retry exists on this surface.
 * - FAILED renders `FAILED` — retry is offered only as a NEW intent with
 *   fresh terms, never as a blind re-run.
 * - A recorded attempt with NO provider observation yet (PENDING/IN_FLIGHT)
 *   renders `PENDING_OBSERVATION` — in progress, never a success
 *   (submission is not finality). Rendering NOTHING without either an
 *   observation or an in-flight attempt fails closed.
 * - The provider envelope ALWAYS outranks a lagging attempt record: the
 *   observation is the provider-verified fact.
 * - An attempt held OUTCOME_UNKNOWN by the protocol authority renders
 *   UNKNOWN_RECONCILING regardless of any envelope claim — reconciliation
 *   is authoritative for ambiguous external effects.
 * - A terminal attempt state contradicting the provider envelope is an
 *   AMBIGUITY: it renders UNKNOWN_RECONCILING with the dispute note (the
 *   desktop never adjudicates between authorities).
 */

import type {
  DesktopJourneyObservationInput,
  DesktopJourneyObservationState,
  DesktopJourneyStateView,
} from "./contracts.js";
import { DESKTOP_PIN_PROVENANCE, isPinnedExternalEffectOutcome } from "../pins/index.js";

const SUBMISSION_NOT_FINALITY_NOTE =
  "The command was submitted and acknowledged. Submission is not finality — the outcome is not yet observed.";

const UNKNOWN_NOTE =
  "The provider-verified outcome is UNKNOWN — neither failure nor success. It must be reconciled with the provider before any consequential retry; no blind retry is possible from this surface.";

const FAILED_NOTE =
  "The provider-verified outcome is FAILED. A retry, if offered, is a NEW intent with fresh terms — never a blind re-run of this one.";

const CONTRADICTION_NOTE =
  "The provider envelope and the protocol authority's attempt record disagree. That disagreement is an ambiguity, not a verdict — reconciliation resolves it, and this surface renders only reconciled truth.";

function headlineFor(state: DesktopJourneyObservationState, contradiction: boolean): string {
  if (contradiction) {
    return `Outcome disputed between authorities — ${CONTRADICTION_NOTE}`;
  }
  switch (state) {
    case "PENDING_OBSERVATION":
      return `In progress — ${SUBMISSION_NOT_FINALITY_NOTE}`;
    case "CONFIRMED":
      return "Confirmed by provider observation.";
    case "UNKNOWN_RECONCILING":
      return `Outcome unknown — reconciling. ${UNKNOWN_NOTE}`;
    case "FAILED":
      return `Failed. ${FAILED_NOTE}`;
  }
}

function outcomeState(outcome: "CONFIRMED" | "UNKNOWN" | "FAILED"): DesktopJourneyObservationState {
  switch (outcome) {
    case "CONFIRMED":
      return "CONFIRMED";
    case "UNKNOWN":
      return "UNKNOWN_RECONCILING";
    case "FAILED":
      return "FAILED";
  }
}

function toneFor(state: DesktopJourneyObservationState):
  | "neutral"
  | "success"
  | "warning"
  | "danger" {
  switch (state) {
    case "PENDING_OBSERVATION":
      return "neutral";
    case "CONFIRMED":
      return "success";
    case "UNKNOWN_RECONCILING":
      return "warning";
    case "FAILED":
      return "danger";
  }
}

function stateView(
  observation: DesktopJourneyObservationInput,
  state: DesktopJourneyObservationState,
  contradiction: boolean,
): DesktopJourneyStateView {
  return {
    journeyRef: observation.journeyRef,
    state,
    tone: toneFor(state),
    headline: headlineFor(state, contradiction),
    authorityRecordRef: observation.authorityRecordRef,
    evidenceRefs: Object.freeze([...observation.evidenceRefs]),
    observedAt: observation.observedAt,
    pin: DESKTOP_PIN_PROVENANCE,
  };
}

/**
 * Derive one journey's honest desktop state. Pure and fail-closed: an
 * unknown outcome token, a malformed record ref, a missing timestamp, or
 * an input with NEITHER a provider-verified observation NOR an in-flight
 * attempt record throws — the desktop never renders a fabricated state.
 */
export function deriveDesktopJourneyState(
  observation: DesktopJourneyObservationInput,
): DesktopJourneyStateView {
  if (observation === null || typeof observation !== "object") {
    throw new Error("deriveDesktopJourneyState: observation must be an object");
  }
  if (typeof observation.journeyRef !== "string" || observation.journeyRef.length === 0) {
    throw new Error("deriveDesktopJourneyState: journeyRef must be a non-empty string");
  }
  if (
    typeof observation.authorityRecordRef !== "string" ||
    observation.authorityRecordRef.length === 0
  ) {
    throw new Error(
      "deriveDesktopJourneyState: authorityRecordRef must be a non-empty reference (the desktop never owns the record)",
    );
  }
  if (typeof observation.observedAt !== "string" || observation.observedAt.length === 0) {
    throw new Error(
      "deriveDesktopJourneyState: observedAt must be a non-empty ISO-8601 string",
    );
  }
  const outcome = observation.outcome;
  if (outcome !== undefined && !isPinnedExternalEffectOutcome(outcome)) {
    throw new Error(
      `deriveDesktopJourneyState: outcome must be CONFIRMED, UNKNOWN or FAILED — got ${JSON.stringify(outcome)}`,
    );
  }

  const attempt = observation.attemptState;

  // No provider-verified observation yet: only an in-flight attempt may
  // render (in progress, never a success). Anything else fails closed.
  if (outcome === undefined) {
    if (attempt === "PENDING" || attempt === "IN_FLIGHT") {
      return stateView(observation, "PENDING_OBSERVATION", false);
    }
    throw new Error(
      "deriveDesktopJourneyState: no provider-verified observation and no in-flight attempt — nothing honest to render (fail closed)",
    );
  }

  // A provider envelope outranks a lagging attempt record: the observation
  // IS the provider-verified fact (states derive from observations, never
  // from submission).
  if (attempt === undefined || attempt === "PENDING" || attempt === "IN_FLIGHT") {
    return stateView(observation, outcomeState(outcome), false);
  }

  // The protocol authority holds the outcome unknown: reconciliation is
  // authoritative — UNKNOWN renders as reconciling regardless of envelope.
  if (attempt === "OUTCOME_UNKNOWN") {
    const envelopeClaimsTerminal = outcome !== "UNKNOWN";
    return stateView(observation, "UNKNOWN_RECONCILING", envelopeClaimsTerminal);
  }

  // Terminal attempt vs provider envelope: agreement decides; disagreement
  // is an ambiguity (reconciliation owns the resolution).
  const attemptTerminal: DesktopJourneyObservationState =
    attempt === "SUCCEEDED" ? "CONFIRMED" : "FAILED";
  const contradiction = attemptTerminal !== outcomeState(outcome);
  return stateView(
    observation,
    contradiction ? "UNKNOWN_RECONCILING" : outcomeState(outcome),
    contradiction,
  );
}
