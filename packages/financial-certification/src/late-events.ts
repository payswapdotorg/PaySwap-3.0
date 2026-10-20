/**
 * @payswap/financial-certification — LAW 6: late returns/refunds/
 * chargebacks (P8-W1).
 *
 * Late money movement is FIRST-CLASS: a return, a refund or a
 * chargeback that arrives after a payout was reconciled RE-OPENS the
 * reconciled state honestly —
 *
 * - NO SILENT ABSORPTION: the reconciled state after the late event
 *   must change to REOPENED (a late event that leaves the state
 *   untouched was silently absorbed);
 * - HISTORY IS NEVER REWRITTEN: the reopened record carries the prior
 *   record's reference AND digest (lineage); the prior record is
 *   preserved verbatim;
 * - HONEST ORDERING: a late event is received at or after it occurred
 *   (receivedAt >= occurredAt — an event received before it happened is
 *   impossible);
 * - SURFACE-VISIBLE: the late event maps onto the pinned surface late
 *   stages (RETURNED / REFUNDED / CHARGED_BACK) — a customer-visible
 *   lifecycle stage, never a hidden edit.
 */

import { ConformanceError } from "./errors.ts";
import { conformanceVerdict, type ConformanceVerdict } from "./laws.ts";
import type { PinnedSurfaceLateStage } from "./pins/surface.ts";

/** The first-class late-event kinds. */
export const LATE_EVENT_KINDS = ["RETURN", "REFUND", "CHARGEBACK"] as const;

export type LateEventKind = (typeof LATE_EVENT_KINDS)[number];

/** The kind -> pinned surface stage mapping (byte-stable). */
export const LATE_EVENT_SURFACE_STAGES: Readonly<
  Record<LateEventKind, PinnedSurfaceLateStage>
> = Object.freeze({
  RETURN: "RETURNED",
  REFUND: "REFUNDED",
  CHARGEBACK: "CHARGED_BACK",
});

/** One late event as the certification sees it (the subject's artifact). */
export interface LateEventObservation {
  readonly kind: LateEventKind;
  readonly providerRef: string;
  /** When the event occurred provider-side. */
  readonly occurredAt: bigint;
  /** When PaySwap learned of it (>= occurredAt). */
  readonly receivedAt: bigint;
  readonly amountMinor: bigint;
  readonly currency: string;
}

/** A reference to a reconciled record (the state a late event re-opens). */
export interface ReconciledRecordRef {
  readonly recordRef: string;
  readonly recordDigest: string;
}

/** The reopened reconciliation (lineage-carrying by construction). */
export interface ReopenedReconciliation {
  readonly status: "REOPENED";
  readonly reopenedBy: LateEventKind;
  readonly priorRecordRef: string;
  readonly priorRecordDigest: string;
  readonly lateEvent: LateEventObservation;
  readonly surfaceStage: PinnedSurfaceLateStage;
}

function validateLateEvent(late: LateEventObservation): void {
  if (
    late === null ||
    typeof late !== "object" ||
    !(LATE_EVENT_KINDS as readonly string[]).includes(late.kind)
  ) {
    throw new ConformanceError("a late event requires a canonical kind");
  }
  if (late.providerRef.length === 0) {
    throw new ConformanceError("a late event requires a providerRef");
  }
  if (typeof late.occurredAt !== "bigint" || typeof late.receivedAt !== "bigint") {
    throw new ConformanceError("late event times must be bigint TimestampMs");
  }
  if (late.receivedAt < late.occurredAt) {
    throw new ConformanceError(
      `late ${late.kind} '${late.providerRef}': receivedAt precedes occurredAt — an event received before it happened is impossible`,
    );
  }
  if (typeof late.amountMinor !== "bigint" || late.amountMinor <= 0n) {
    throw new ConformanceError("a late event carries a positive amount");
  }
  if (late.currency.length !== 3) {
    throw new ConformanceError("a late event carries a 3-letter currency");
  }
}

/**
 * Applies a late event to a reconciled record: RE-OPENS with full
 * lineage — the prior record's reference and digest are carried
 * verbatim (history is never rewritten), the surface stage is the
 * pinned late stage for the kind.
 */
export function applyLateEvent(
  prior: ReconciledRecordRef,
  late: LateEventObservation,
): ReopenedReconciliation {
  if (prior.recordRef.length === 0 || prior.recordDigest.length === 0) {
    throw new ConformanceError(
      "a reconciled record reference requires a ref and a digest",
    );
  }
  validateLateEvent(late);
  return Object.freeze({
    status: "REOPENED",
    reopenedBy: late.kind,
    priorRecordRef: prior.recordRef,
    priorRecordDigest: prior.recordDigest,
    lateEvent: Object.freeze({ ...late }),
    surfaceStage: LATE_EVENT_SURFACE_STAGES[late.kind],
  });
}

/** The subject's post-late-event state (what it submits for audit). */
export interface RecordedPostLateState {
  readonly status: string;
  /** The prior record digest the post-state carries (absent = none). */
  readonly priorRecordDigest?: string;
  readonly surfaceStage?: string;
}

/**
 * CERTIFIES the late-event honesty law (FIN-LAW-06) over one
 * (prior, late, after) probe: the state must be REOPENED (no silent
 * absorption), must carry the prior record's digest (no history
 * rewrite), the event ordering must be possible, and the surface stage
 * must be the pinned late stage for the kind.
 */
export function certifyLateEventHonesty(input: {
  readonly subjectRef: string;
  readonly prior: ReconciledRecordRef;
  readonly late: LateEventObservation;
  readonly after: RecordedPostLateState;
  readonly evidenceRefs: readonly string[];
}): ConformanceVerdict {
  validateLateEvent(input.late);
  const violations: string[] = [];
  if (input.prior.recordRef.length === 0 || input.prior.recordDigest.length === 0) {
    throw new ConformanceError(
      "a reconciled record reference requires a ref and a digest",
    );
  }
  if (input.after.status !== "REOPENED") {
    violations.push(
      `FIN-LAW-06 (silent absorption): the reconciled state is '${input.after.status}' after a late ${input.late.kind} ('${input.late.providerRef}') — a first-class late event RE-OPENS reconciled state; it is never silently absorbed`,
    );
  }
  if (input.after.priorRecordDigest !== input.prior.recordDigest) {
    violations.push(
      `FIN-LAW-06 (history rewrite): the post-event state carries prior digest '${input.after.priorRecordDigest ?? "(none)"}' but the prior record's digest is '${input.prior.recordDigest}' — the reopened record must carry the prior record's digest (history is never rewritten)`,
    );
  }
  if (
    input.after.surfaceStage !== undefined &&
    input.after.surfaceStage !== LATE_EVENT_SURFACE_STAGES[input.late.kind]
  ) {
    violations.push(
      `FIN-LAW-06 (surface visibility): the post-event surface stage '${input.after.surfaceStage}' is not the pinned late stage '${LATE_EVENT_SURFACE_STAGES[input.late.kind]}' for a ${input.late.kind}`,
    );
  }
  if (input.after.surfaceStage === undefined) {
    violations.push(
      `FIN-LAW-06 (surface visibility): the post-event state declares NO surface stage — a late ${input.late.kind} is a customer-visible lifecycle stage, never a hidden edit`,
    );
  }
  return conformanceVerdict({
    lawId: "FIN-LAW-06",
    scenarioId: "LATE_RETURNS_REFUNDS_CHARGEBACKS",
    subjectRef: input.subjectRef,
    violations,
    evidenceRefs: input.evidenceRefs,
  });
}
