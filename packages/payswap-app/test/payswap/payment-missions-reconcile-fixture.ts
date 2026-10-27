/**
 * @payswap/app — the payment-missions RECONCILIATION FAKE harness (P20-B;
 * the jsdom battery's in-memory reconciliation plane), composed OVER the
 * P18 fake port (./payment-missions-fixture.ts) as the
 * reconciliation-capable PaymentMissionsPortWithReconciliation — a
 * separate file so the earlier fixtures keep their line budgets
 * untouched.
 *
 * Deterministic + honest per ADR-0013 D1/D2/D3 and the REAL host members
 * (the P20-A lane's reconcile members): the pending card derives from
 * the base fake's attempt projections by the runtime's OWN rule (an
 * attempt is pending iff its outcome looks unresolved — the unknown
 * envelope or the never-answered write-ahead), the accepted-sources echo
 * is the frozen two-kind vocabulary, and the act recomputes the pending
 * set AT ACT TIME: an attemptId outside the recomputed set is a THROWN
 * typed error with nothing recorded, a re-send against a closed attempt
 * is the typed already-reconciled refusal, and a successful submission
 * records the reconciliation (the attempt's outcome becomes reconciled
 * on the detail overlay, the mission completes on a confirmed create)
 * and returns the outcome facts. Every call is recorded in the shared
 * ledger (the call-order law); pendingReconciliation + reconcile are
 * vi.fn spies so the battery can assert EXACT call arguments.
 */
import { vi } from "vitest";
import type {
  PaymentMissionsPendingAttempt,
  PaymentMissionsPendingReconciliation,
  PaymentMissionsPortWithReconciliation,
  PaymentMissionsReconcileEvidence,
  PaymentMissionsReconcileOutcome,
  PaymentMissionsReconciliationSource,
} from "../../src/agent/paymentMissionsReconcilePins.js";
import type {
  PaymentMissionsAttemptState,
  PaymentMissionsEvent,
} from "../../src/agent/paymentMissionsPins.js";
import { M1, M2, T2, makeFakeMissionsPort } from "./payment-missions-fixture.js";

/* --------------------------- the deterministic facts --------------------------- */

export const M2_ATTEMPT_ID = "attempt:e5f6a7b8:1";
/** The defensive multi-pending shape (the runtime's one-unresolved law
 * prevents it in practice; the wire shape allows it — the card must
 * never guess which attempt is addressed). */
export const M2_ATTEMPT_ID_2 = "attempt:e5f6a7b8:2";
export const T7 = "2026-10-26T12:12:00Z";
export const ACCEPTED_SOURCES: readonly PaymentMissionsReconciliationSource[] = [
  "EXTERNAL_PROVIDER_STATEMENT",
  "EXTERNAL_PROVIDER_RETRIEVAL",
];
export const PENDING_NOTE =
  "Reconciliation closes an unknown outcome with provider evidence — a provider statement or a provider retrieval citation — and never guesses: the direction and the references come from you, transcribing what the provider's own records say.";
export const RECONCILED_CONFIRMED_SUMMARY =
  "Provider evidence closed the unknown outcome to confirmed — the effect stands as recorded evidence and the mission is complete.";
export const RECONCILED_FAILED_SUMMARY =
  "Provider evidence closed the unknown outcome to failed — no effect stands and the mission stays open.";
export const TYPED_SUBMIT_FAILURE =
  "the reconciliation evidence was refused — no reconciliation was recorded; the entered evidence stays exactly as you left it";
export const OUTSIDE_ATTEMPT_ERROR = (attemptId: string): string =>
  `attemptId '${attemptId}' is not pending reconciliation for this mission; no reconciliation was recorded`;
export const ALREADY_RECONCILED_ERROR =
  "the attempt was already reconciled — the reconciliation record is append-only, one per attempt; no reconciliation was recorded";

/** The fake's pending-attempt configurations. */
export type FakeReconcilePendingMode = "one" | "two";

export interface FakeReconcileOptions {
  /** The pending-attempt count the read derives (the defensive multi-pending shape). */
  readonly pending?: FakeReconcilePendingMode;
  /** When true, the FIRST reconcile submission THROWS the typed failure (nothing recorded, the entry facts survive). */
  readonly throwOnFirstSubmit?: boolean;
}

/** The runtime's own pending rule over the projected attempt states. */
function isUnresolved(attempt: PaymentMissionsAttemptState): boolean {
  return attempt.outcome === "OUTCOME_UNKNOWN" || attempt.outcome === "STARTED";
}

/** Build the reconciliation-capable fake port (deterministic; every call recorded; both members spied). */
export function makeFakeReconcileMissionsPort(options: FakeReconcileOptions = {}) {
  const base = makeFakeMissionsPort();
  const calls = base.calls;
  let threwOnce = options.throwOnFirstSubmit === true;
  const reconciled = new Map<string, { readonly resolvedTo: "CONFIRMED" | "FAILED" }>();
  const extraEvents: PaymentMissionsEvent[] = [];
  const extraAttempts: PaymentMissionsAttemptState[] =
    options.pending === "two"
      ? [
          {
            attemptId: M2_ATTEMPT_ID_2,
            startedAt: T2,
            operation: "CREATE_EXTERNAL_EFFECT",
            executionMode: "SANDBOX",
            outcome: "STARTED",
            summary:
              "The attempt started and no answer is recorded yet — it is in flight (or was interrupted before the answer landed); the restart sweep marks such attempts outcome-unknown.",
          },
        ]
      : [];

  /** The detail with the reconciliation overlay applied (the reconciled attempt states + the timeline events land on the record). */
  const readDetail = async (missionId: string) => {
    const detail = await base.port.detail(missionId);
    if (detail === null || detail.id !== M2) {
      return detail;
    }
    const attempts: readonly PaymentMissionsAttemptState[] = [
      ...(detail.attempts ?? []),
      ...extraAttempts,
    ].map((attempt) => {
      const rec = reconciled.get(attempt.attemptId);
      if (rec === undefined) {
        return attempt;
      }
      return {
        ...attempt,
        outcome: "RECONCILED" as const,
        summary:
          rec.resolvedTo === "CONFIRMED"
            ? "Provider evidence closed the unknown outcome to confirmed — the effect stands as recorded evidence."
            : "Provider evidence closed the unknown outcome to failed — no effect stands.",
      };
    });
    return {
      ...detail,
      // A confirmed reconciliation of a create attempt completes the
      // mission (ADR-0013); a failed one leaves it open.
      status: attempts.some(
        (attempt) =>
          attempt.operation === "CREATE_EXTERNAL_EFFECT" &&
          reconciled.get(attempt.attemptId)?.resolvedTo === "CONFIRMED",
      )
        ? ("COMPLETED" as const)
        : detail.status,
      events: [...detail.events, ...extraEvents],
      attempts,
    };
  };

  const toPending = (attempt: PaymentMissionsAttemptState): PaymentMissionsPendingAttempt => ({
    attemptId: attempt.attemptId,
    startedAt: attempt.startedAt,
    operation: attempt.operation,
    executionMode: attempt.executionMode,
    summary: attempt.summary,
  });

  const pendingReconciliation = vi.fn(
    async (missionId: string): Promise<PaymentMissionsPendingReconciliation> => {
      calls.push(`pendingReconciliation:${missionId}`);
      if (missionId !== M1 && missionId !== M2) {
        throw new Error(`no mission '${missionId}' exists on the fake reconciliation plane`);
      }
      const detail = await readDetail(missionId);
      return {
        pending: (detail?.attempts ?? []).filter(isUnresolved).map(toPending),
        acceptedSources: ACCEPTED_SOURCES,
        note: PENDING_NOTE,
      };
    },
  );

  const reconcile = vi.fn(
    async (
      missionId: string,
      attemptId: string,
      evidence: PaymentMissionsReconcileEvidence,
    ): Promise<PaymentMissionsReconcileOutcome> => {
      calls.push(`reconcile:${missionId}:${attemptId}`);
      if (missionId !== M1 && missionId !== M2) {
        throw new Error(`no mission '${missionId}' exists on the fake reconciliation plane`);
      }
      if (threwOnce) {
        // The typed failure: nothing recorded, nothing changed.
        threwOnce = false;
        throw new Error(TYPED_SUBMIT_FAILURE);
      }
      // The act-time recomputed pending set (the P19-A lane-choice law).
      const detail = await readDetail(missionId);
      const attempts = detail?.attempts ?? [];
      const addressed = attempts.find((attempt) => attempt.attemptId === attemptId);
      if (addressed !== undefined && !isUnresolved(addressed)) {
        throw new Error(ALREADY_RECONCILED_ERROR);
      }
      if (addressed === undefined) {
        throw new Error(OUTSIDE_ATTEMPT_ERROR(attemptId));
      }
      // The edge evidence bounds (the runtime's own): the frozen source
      // vocabulary + the non-empty refs floor.
      if (
        !ACCEPTED_SOURCES.includes(evidence.source as PaymentMissionsReconciliationSource) ||
        evidence.evidenceRefs.length === 0
      ) {
        throw new Error(
          "the reconciliation evidence is invalid — reconciliation never closes on a bare assertion",
        );
      }
      reconciled.set(attemptId, { resolvedTo: evidence.resolvedTo });
      extraEvents.push({
        id: `evt:${attemptId}:reconciled`,
        at: T7,
        kind: "OPAQUE_HOST_KIND",
        summary: "Reconciliation recorded — provider evidence closed the unknown outcome.",
      });
      return {
        attemptId,
        resolvedTo: evidence.resolvedTo,
        summary: evidence.resolvedTo === "CONFIRMED" ? RECONCILED_CONFIRMED_SUMMARY : RECONCILED_FAILED_SUMMARY,
      };
    },
  );

  const port: PaymentMissionsPortWithReconciliation = {
    ...base.port,
    async detail(missionId) {
      return readDetail(missionId);
    },
    pendingReconciliation,
    reconcile,
  };

  return { port, calls, resolveApproval: base.resolveApproval, pendingReconciliation, reconcile };
}
