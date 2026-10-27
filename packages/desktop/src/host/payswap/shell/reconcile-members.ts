/**
 * PaySwap Desktop (P20-A, ADR-0013 D1/D2/D3) — the RECONCILIATION
 * channel members, implemented over the REAL PaymentMissionRuntime's
 * dispatch slice, following the approval/dispatch member pattern (the
 * ≤400-line file law; the contracts live in ./reconcile-contracts.ts).
 *
 * THE EDGE PIN (the P18-A approval-members discipline, ADR-0013 D1):
 * the act's actor is pinned HERE, at the channel boundary —
 * CHANNEL_RECONCILIATION_ORIGIN = "OPERATOR_EVIDENCE_ACT" and
 * CHANNEL_RECONCILIATION_PRINCIPAL = "principal:operator". The runtime's
 * reconcile verb takes neither (it stays untouched by law), so the pins
 * are the channel-law RECORD: they document and log WHO the submission
 * actor is at this edge, and they are NEVER inputs — the renderer
 * supplies ONLY the mission id, the attempt id and the evidence.
 *
 * THE ACT-TIME LAW (the P19-A lane-choice law, repeated): the pending
 * set is recomputed HOST-SIDE at act time by the runtime's OWN rule
 * (attemptIsUnresolved, imported from payments/mission-execution.ts —
 * never a parallel derivation, ADR-0013 D3); an attemptId that does
 * not exist on the mission at all is the typed INVALID_FIELD_VALUE
 * refusal BEFORE any runtime call — "no reconciliation was recorded",
 * nothing changed — while an attempt that EXISTS but is closed (the
 * re-send case) is delegated to the runtime's own honest typed
 * refusal (the single-shot law below). The evidence bounds validate
 * at the edge by the runtime's own bounds (source ∈ the frozen
 * vocabulary; refs non-empty, each 1..512 chars) BEFORE any runtime
 * call — reconciliation never closes on a bare assertion (ADR-0013 D2).
 *
 * THE RUNTIME VERB STAYS THE ONLY CLOSER: the member validates and
 * delegates to runtime.dispatch.reconcile() — the one path out of
 * UNKNOWN — and the runtime's typed errors (RECONCILIATION_NOT_PENDING
 * / RECONCILIATION_EVIDENCE_INVALID) rethrow through unchanged (the
 * dispatch-members precedent: no mapping, no masking). The outcome
 * carries facts only, derived from the returned record's
 * reconciliation sub-record; the evidence refs NEVER echo as structure.
 * Instants are stamped HERE, at the channel edge, from the injected
 * host clock — never renderer-supplied. Every member fails closed when
 * the runtime was not composed (the typed
 * PaymentPlaneNotConfiguredError, thrown by the resolver the service
 * injects).
 */

import { PaymentMissionError, type PaymentAttemptRecord } from "../payments/contracts.js";
import { attemptIsUnresolved } from "../payments/mission-execution.js";
import type { PaymentMissionChannelDeps } from "./payment-mission-members.js";
import type {
  IPaySwapDesktopPaymentMissionMembers,
  PaymentMissionPendingAttemptDto,
} from "./payment-mission-contracts.js";
import type {
  PaymentMissionReconciliationOutcomeDto,
  PaymentReconciliationSourceKind,
} from "./reconcile-contracts.js";
import { PAYMENT_RECONCILIATION_SOURCE_KINDS } from "./reconcile-contracts.js";

/**
 * The pinned act origin — the channel-law record of WHO submits
 * evidence at this edge (the operator's explicit evidence act). Never
 * an input: the runtime verb takes no origin (ADR-0013 D1).
 */
export const CHANNEL_RECONCILIATION_ORIGIN = "OPERATOR_EVIDENCE_ACT" as const;

/**
 * The pinned principal (the P18-A discipline; the trust plane owns
 * identity). Never an input — the submission actor record only.
 */
export const CHANNEL_RECONCILIATION_PRINCIPAL = "principal:operator";

/**
 * The channel-edge id maxima, derived from the REAL minted formats with
 * generous headroom (task:PAYMENT_MISSION:<32 hex> = 53; pmt-attempt:
 * <32 hex> = 44): a channel-supplied id beyond them is a typed refusal,
 * never a store lookup.
 */
const MISSION_ID_MAX = 128;
const ATTEMPT_ID_MAX = 128;

/** The evidence-ref bound — the runtime's own (never widened here). */
const EVIDENCE_REF_MAX = 512;

/** The pinned honest note (the people-language law, ADR-0013 D1/D2). */
const PENDING_RECONCILIATION_NOTE =
  "Reconciliation closes an unknown outcome with provider evidence — a statement or a retrieval citation — and it never guesses: record only what the provider's evidence says.";

/** The per-attempt pending summary (the P18-A projection's phrasing, mirrored verbatim). */
function pendingAttemptSummaryOf(attempt: PaymentAttemptRecord): string {
  return attempt.envelope === undefined
    ? "The attempt started and no answer is recorded yet — it is in flight (or was interrupted before the answer landed); the restart sweep marks such attempts outcome-unknown."
    : "The outcome is unknown — the command may have landed; it reconciles before any retry and nothing is blindly repeated.";
}

/**
 * Derive the pending attempts by the RUNTIME'S OWN rule (ADR-0013 D3):
 * the exported attemptIsUnresolved from payments/mission-execution.ts,
 * applied directly — refused → not pending, reconciled → not pending,
 * no-envelope → pending, envelope UNKNOWN → pending. No parallel
 * derivation exists in this file.
 */
function pendingAttemptsOf(attempts: readonly PaymentAttemptRecord[]): readonly PaymentAttemptRecord[] {
  return attempts.filter((attempt) => attemptIsUnresolved(attempt));
}

/** Project one pending attempt to the wire DTO (people-language facts only). */
function toPendingAttemptDto(attempt: PaymentAttemptRecord): PaymentMissionPendingAttemptDto {
  return {
    attemptId: attempt.attemptId,
    startedAt: attempt.startedAt,
    operation: attempt.operation,
    executionMode: attempt.executionMode,
    summary: pendingAttemptSummaryOf(attempt),
  };
}

/** The outcome summary (the P18-A RECONCILED phrasing, with the transcribed source in people language). */
function reconciliationSummaryOf(
  resolvedTo: "CONFIRMED" | "FAILED",
  source: PaymentReconciliationSourceKind,
): string {
  const sourceLabel =
    source === "EXTERNAL_PROVIDER_STATEMENT"
      ? "Provider statement evidence"
      : "Provider retrieval evidence";
  return resolvedTo === "CONFIRMED"
    ? `${sourceLabel} closed the unknown outcome to confirmed — the effect stands as recorded evidence.`
    : `${sourceLabel} closed the unknown outcome to failed — no effect stands.`;
}

/** Fail-closed on the channel-supplied mission id (the dispatch-members precedent). */
function requireMissionIdShape(missionId: string, what: string): void {
  if (typeof missionId !== "string" || missionId.length === 0 || missionId.length > MISSION_ID_MAX) {
    throw new PaymentMissionError("MISSION_NOT_FOUND", `missionId must be a non-empty string of at most ${String(MISSION_ID_MAX)} characters (the ${what})`);
  }
}

/**
 * Create the reconciliation channel members over the injected runtime
 * (P20-A, ADR-0013 D1). Returned as a Pick of the mission-member
 * interface so the service can spread them beside the P17-A/P18-A/
 * P19-A families over the SAME fail-closed resolver and host clock.
 */
export function createPaymentReconciliationChannelMembers(
  deps: PaymentMissionChannelDeps,
): Pick<
  IPaySwapDesktopPaymentMissionMembers,
  "paymentMissionPendingReconciliation" | "paymentMissionReconcile"
> {
  return {
    async paymentMissionPendingReconciliation(missionId) {
      const runtime = deps.resolveRuntime();
      // Fail-closed on the channel-supplied mission id BEFORE the
      // runtime call (the RPC boundary carries no types).
      requireMissionIdShape(missionId, "mission whose pending reconciliation is read");
      const mission = await runtime.getMission(missionId);
      if (mission === null) {
        throw new PaymentMissionError("MISSION_NOT_FOUND", `No payment mission '${missionId}' exists`, {
          missionId,
        });
      }
      // D3 — the same-rule derivation: the card is computed per read
      // from the same records the runtime enforces over.
      const pending = pendingAttemptsOf(mission.attempts).map(toPendingAttemptDto);
      deps.log(
        "info",
        `payswap-desktop: pending reconciliation read for mission ${missionId} (${String(pending.length)} attempt(s) pending) — derived by the runtime's own unresolved rule`,
      );
      return {
        pending,
        acceptedSources: [...PAYMENT_RECONCILIATION_SOURCE_KINDS],
        note: PENDING_RECONCILIATION_NOTE,
      };
    },

    async paymentMissionReconcile(missionId, attemptId, evidence) {
      const runtime = deps.resolveRuntime();
      // (1) THE EDGE VALIDATION — all of it BEFORE any runtime call
      // (the P19-A law): shape first, so a malformed submission can
      // never reach the store, the pending recompute or the closer.
      requireMissionIdShape(missionId, "mission the reconciliation act runs over");
      if (typeof attemptId !== "string" || attemptId.length === 0 || attemptId.length > ATTEMPT_ID_MAX) {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          `attemptId must be a non-empty string of at most ${String(ATTEMPT_ID_MAX)} characters (the pending attempt the evidence closes)`,
          { missionId },
        );
      }
      if (typeof evidence !== "object" || evidence === null) {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          "evidence must be the provider-evidence submission (the resolved direction, the source kind and the provider reference strings)",
          { missionId },
        );
      }
      if (evidence.resolvedTo !== "CONFIRMED" && evidence.resolvedTo !== "FAILED") {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          "resolvedTo must be CONFIRMED or FAILED (the direction the provider evidence closes the unknown outcome to — never guessed, never derived)",
          { missionId },
        );
      }
      if (!(PAYMENT_RECONCILIATION_SOURCE_KINDS as readonly string[]).includes(evidence.source)) {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          `source must be one of the accepted provider evidence sources (${PAYMENT_RECONCILIATION_SOURCE_KINDS.join(", ")})`,
          { missionId },
        );
      }
      if (
        !Array.isArray(evidence.evidenceRefs) ||
        evidence.evidenceRefs.length === 0 ||
        evidence.evidenceRefs.some(
          (ref) => typeof ref !== "string" || ref.length === 0 || ref.length > EVIDENCE_REF_MAX,
        )
      ) {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          `evidenceRefs must be a non-empty array of provider reference strings (each 1..${String(EVIDENCE_REF_MAX)} characters) — reconciliation never closes on a bare assertion`,
          { missionId },
        );
      }
      // (2) Mission existence (the member convention: an unknown
      // mission is the typed MISSION_NOT_FOUND refusal).
      const mission = await runtime.getMission(missionId);
      if (mission === null) {
        throw new PaymentMissionError("MISSION_NOT_FOUND", `No payment mission '${missionId}' exists`, {
          missionId,
        });
      }
      // (3) THE ACT-TIME PENDING RECOMPUTATION (the P19-A lane-choice
      // law): the addressing key is checked against the JUST-DERIVED
      // pending set — the runtime's own rule, never a parallel
      // derivation. An attemptId outside it that does not exist on
      // this mission at all is the typed refusal BEFORE the runtime
      // call: no reconciliation is recorded and nothing changes. An
      // attempt that EXISTS but is CLOSED (already reconciled,
      // refused, or resolved) is delegated to the runtime's own
      // honest typed refusal (the ADR-0013 D1 single-shot law: a
      // re-send against a closed attempt is the typed
      // RECONCILIATION_NOT_PENDING refusal with the runtime's honest
      // reason — rethrown through unchanged below, never a parallel
      // error taxonomy at this edge).
      const pending = pendingAttemptsOf(mission.attempts);
      if (!pending.some((attempt) => attempt.attemptId === attemptId)) {
        if (!mission.attempts.some((attempt) => attempt.attemptId === attemptId)) {
          throw new PaymentMissionError(
            "INVALID_FIELD_VALUE",
            `attemptId '${attemptId}' is not pending reconciliation on this mission — no reconciliation was recorded and nothing changed`,
            { missionId },
          );
        }
      }
      // (4) THE CLOSER — the runtime's reconcile verb, the ONLY path
      // out of UNKNOWN, with the instant stamped at this edge from the
      // host clock. Its typed errors rethrow through unchanged.
      const updated = await runtime.dispatch.reconcile(
        missionId,
        attemptId,
        {
          resolvedTo: evidence.resolvedTo,
          source: evidence.source,
          evidenceRefs: [...evidence.evidenceRefs],
        },
        deps.now(),
      );
      // (5) The outcome derives facts ONLY from the returned record's
      // reconciliation sub-record; the evidence refs never echo.
      const reconciled = updated.attempts.find((candidate) => candidate.attemptId === attemptId);
      const record = reconciled?.reconciliation;
      if (record === undefined) {
        // Unreachable by the runtime's own contract (reconcile either
        // throws typed or returns the record WITH the sub-record) —
        // fail closed rather than fabricate an outcome.
        throw new PaymentMissionError(
          "PERSISTENCE_FAILED",
          `the runtime returned no reconciliation record for attempt '${attemptId}' — no outcome is fabricated`,
          { missionId },
        );
      }
      deps.log(
        "info",
        `payswap-desktop: reconciliation recorded for attempt ${attemptId} on mission ${missionId} (to ${record.resolvedTo}) — origin pinned ${CHANNEL_RECONCILIATION_ORIGIN} at the channel edge; the runtime verb stayed the only closer`,
      );
      const outcome: PaymentMissionReconciliationOutcomeDto = {
        attemptId,
        resolvedTo: record.resolvedTo,
        summary: reconciliationSummaryOf(record.resolvedTo, record.source),
      };
      return outcome;
    },
  };
}
