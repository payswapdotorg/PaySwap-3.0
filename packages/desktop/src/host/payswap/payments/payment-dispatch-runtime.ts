/* oxlint-disable eslint(max-lines) -- The two-phase dispatch protocol (write-ahead → authority call → answer recording) must stay in ONE module: the halves share the idempotency/authorization/mission state invariants atomically; splitting them across files invites drift between the write-ahead and its resolution — the exact ambiguity the UNKNOWN-reconciles law exists to prevent. */
/**
 * PaySwap Desktop (P13-C) — the consequential runtime slice: dispatch,
 * reconciliation and interruption recovery.
 *
 * THE CONSEQUENTIAL DISCIPLINE (the work order's core laws, executable):
 * - WRITE-AHEAD: an attempt and its IN_FLIGHT idempotency record persist
 *   BEFORE the authority is called — a crash mid-dispatch can never
 *   double-execute (the persisted record REPLAYs or CONFLICTs, never
 *   re-begins);
 * - NO DUPLICATE WRITE: a completed idempotency record replays its
 *   recorded envelope without touching the authority; an in-flight or
 *   AMBIGUOUS record blocks with RETRY_BLOCKED_UNKNOWN;
 * - UNKNOWN RECONCILES BEFORE RETRY (INV-04): an UNKNOWN envelope (or an
 *   interrupted write-ahead) blocks dispatch, cancel and expiry until
 *   reconciliation evidence closes it; UNKNOWN is never rewritten to
 *   FAILED or success by this runtime — only evidence does;
 * - SINGLE-USE AUTHORIZATION: the artifact is consumed exactly once,
 *   bound to the mission, the CURRENT presented preview and the compiled
 *   intent digest (a material change invalidates the match, typed);
 * - REFUSAL IS NOT AN ANSWER: a typed authority refusal records
 *   definitively-no-effect (no envelope is fabricated for it) and the
 *   idempotency record fails (retryable under the same key/hash);
 * - SANDBOX ≠ LIVE (INV-25): every attempt record is branded with its
 *   execution mode — a SANDBOX attempt can never be presented as proof
 *   of live behavior, and sandbox tests never certify live corridors.
 */

import {
  PaymentMissionError,
  type PaymentAttemptVerification,
  type PaymentExecutionMode,
  type PaymentMissionRecord,
  type PaymentResultEnvelope,
} from "./contracts.js";
import type { PaymentMissionCore } from "./payment-mission-runtime.js";
import { projectAttemptVerification } from "./attempt-verification.js";
import type { StripeReadBackPort } from "./stripe-read-back.js";
import {
  compiledIntentDigest,
  confirmedCreateAttempt,
  corridorLegDispatchPermitted,
  corridorLegOutcomes,
  missionHasUnresolvedAttempt,
  planInterruptionRecovery,
  type InterruptionRecoveryItem,
} from "./mission-execution.js";
import {
  PAYMENT_OPERATION_SCOPES,
  beginIdempotency,
  completeIdempotency,
  failIdempotency,
  markAmbiguousIdempotency,
  paymentIdempotencyKey,
  paymentIdempotencyRecordScopeKey,
  type PaymentIdempotencyRecord,
} from "./idempotency.js";
import type { ExecutionAuthorityRefusal, PaymentDispatchLegPayload } from "./execution-authority.js";
import { validatePaymentDispatchCommand } from "./execution-authority.js";

/** What a dispatch consumes (the user-approved key + the wiring facts). */
export interface PaymentDispatchInput {
  readonly authorizationArtifactId: string;
  /** The executing connected instance (opaque; the registry owns meaning). */
  readonly connectionRef: string;
  /** INV-25: the mode this dispatch runs under (SANDBOX or LIVE). */
  readonly executionMode: PaymentExecutionMode;
  /**
   * (P22-H, ADR-0016 D6 — the composite growth) Present iff this dispatch
   * is ONE LEG of an authorized corridor plan: the leg's index (the
   * per-leg idempotency key + the custody-continuity gate key) and the
   * leg's OWN facts (the kernel's lane payload). ADDITIVE + OPTIONAL:
   * the N=1 dispatch carries neither byte-identically.
   */
  readonly legIndex?: number;
  readonly leg?: PaymentDispatchLegPayload;
  /**
   * (P22-H, D6) The digest of the plan this leg belongs to (computed by
   * the corridor orchestration over EVERY leg) — must equal the COMPOSITE
   * artifact's planDigest (a leg of a different plan is a typed mismatch).
   */
  readonly planDigest?: string;
}

/** The typed dispatch outcome. */
export type PaymentDispatchOutcome =
  | { readonly kind: "DISPATCHED"; readonly attemptId: string; readonly envelope: PaymentResultEnvelope }
  | { readonly kind: "REPLAYED"; readonly attemptId: string; readonly envelope: PaymentResultEnvelope }
  | { readonly kind: "REFUSED"; readonly attemptId: string; readonly refusal: ExecutionAuthorityRefusal };

/** Reconciliation evidence — the ONLY closer of an UNKNOWN (never a guess). */
export interface PaymentReconciliationEvidence {
  readonly resolvedTo: "CONFIRMED" | "FAILED";
  readonly source: "EXTERNAL_PROVIDER_STATEMENT" | "EXTERNAL_PROVIDER_RETRIEVAL";
  readonly evidenceRefs: readonly string[];
}

/**
 * The typed verification outcome (the P21-D reviewer-gate, Gap C):
 * outcome facts ONLY — the addressing echo, the provider status the
 * authoritative read-back observed, the verification instant and a
 * people-language summary that NEVER uses the word "reconciled" (this
 * is not a reconciliation). Every non-verifiable state is a THROWN
 * typed PaymentMissionError (VERIFICATION_REFUSED / MISSION_NOT_FOUND)
 * — the channel's established fail-closed discipline.
 */
export interface PaymentAttemptVerificationOutcome {
  readonly kind: "VERIFIED";
  readonly attemptId: string;
  readonly readBackStatus: string;
  readonly verifiedAt: string;
  readonly summary: string;
}

/** The verification event's people-language summary (no ambiguity ever existed — never the word "reconciled"). */
function verificationSummaryOf(paymentIntentId: string, readBackStatus: string): string {
  return `Authoritative read-back verified the confirmed attempt: the provider's own record for ${paymentIntentId} reports '${readBackStatus}', agreeing with the recorded confirmation. No ambiguity ever existed; the typed verification persists on the attempt record as its own fact.`;
}

/** The consequential slice surface. */
export interface PaymentDispatchSlice {
  /**
   * Dispatch one consequential command through the canonical path. The
   * idempotent-replay law holds across crashes: a completed record
   * returns its recorded envelope (kind REPLAYED — no duplicate write).
   */
  dispatch(
    missionId: string,
    operation: "CREATE_EXTERNAL_EFFECT" | "CANCEL_OR_REVERSE_EFFECT",
    input: PaymentDispatchInput,
    now: string,
  ): Promise<PaymentDispatchOutcome>;
  /**
   * Close an UNKNOWN (or interrupted) attempt with provider evidence.
   */
  reconcile(
    missionId: string,
    attemptId: string,
    evidence: PaymentReconciliationEvidence,
    now: string,
  ): Promise<PaymentMissionRecord>;
  /**
   * (P21-D reviewer-gate, Gap C) Verify a CONFIRMED attempt through the
   * AUTHORITATIVE provider read-back: the typed, persisted verification
   * result that completes the final stage when reconciliation is not
   * needed (no ambiguity ever existed). An ambiguous outcome NEVER
   * verifies — it must remain UNKNOWN and require the actual
   * reconciliation path (the pure decision in ./attempt-verification.ts
   * enforces the law; the typed refusals carry it in the message). The
   * readBackPort is a PARAMETER (the channel member supplies the
   * composed port) — the runtime stays seam-pure. Idempotent: an
   * already-verified attempt replays its recorded verification with
   * NOTHING appended.
   */
  verify(
    missionId: string,
    attemptId: string,
    readBackPort: StripeReadBackPort,
    now: string,
  ): Promise<PaymentAttemptVerificationOutcome>;
  /**
   * The restart sweep: mark every interrupted write-ahead UNKNOWN (the
   * command may have landed) and AMBIGUOUS in the registrar. Call ONCE
   * at composition, before any dispatch.
   */
  recoverInterruptions(now: string): Promise<readonly InterruptionRecoveryItem[]>;
}

function toEpochMs(instant: string, what: string): bigint {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) {
    throw new PaymentMissionError("INVALID_FIELD_VALUE", `${what} must be an ISO-8601 UTC instant`);
  }
  return BigInt(ms);
}

function requireActiveMission(core: PaymentMissionCore, mission: PaymentMissionRecord): PaymentMissionRecord {
  if (
    mission.status === "COMPLETED" ||
    mission.status === "FAILED" ||
    mission.status === "CANCELLED" ||
    mission.status === "EXPIRED"
  ) {
    throw new PaymentMissionError(
      "MISSION_TERMINAL",
      `Mission ${JSON.stringify(mission.id)} is terminal (${mission.status}) — no consequential dispatch is possible`,
      { missionId: mission.id },
    );
  }
  if (mission.status === "PAUSED") {
    throw new PaymentMissionError(
      "INVALID_TRANSITION",
      `Mission ${JSON.stringify(mission.id)} is paused — resume it before dispatch`,
      { missionId: mission.id },
    );
  }
  return mission;
}

/** Create the consequential slice over the shared core. */
export function createPaymentDispatchSlice(core: PaymentMissionCore): PaymentDispatchSlice {
  const { store, executionAuthority, log, mintRandom } = core;

  function applyIdempotencyMutation(
    records: readonly PaymentIdempotencyRecord[],
    mutation: { readonly scopeKey: string; readonly record: PaymentIdempotencyRecord },
  ): readonly PaymentIdempotencyRecord[] {
    const existing = records.find(
      (candidate) => paymentIdempotencyRecordScopeKey(candidate) === mutation.scopeKey,
    );
    if (existing === undefined) return [...records, mutation.record];
    return records.map((record) =>
      paymentIdempotencyRecordScopeKey(record) === mutation.scopeKey ? mutation.record : record,
    );
  }

  return {
    dispatch(missionId, operation, input, now) {
      return core.serialized(async () => {
        const state0 = await store.load();
        const mission0 = core.requireMission(state0, missionId);
        if (mission0.intent === undefined || mission0.previewId === undefined) {
          throw new PaymentMissionError(
            "PREVIEW_REQUIRED",
            `Mission ${JSON.stringify(missionId)} has no compiled intent + presented preview — the canonical path (intake → validation → preview → explicit authorization) must complete before dispatch`,
            { missionId },
          );
        }
        const reversalTarget =
          operation === "CANCEL_OR_REVERSE_EFFECT" ? confirmedCreateAttempt(mission0) : undefined;
        if (operation === "CREATE_EXTERNAL_EFFECT") {
          requireActiveMission(core, mission0);
          if (missionHasUnresolvedAttempt(mission0)) {
            throw new PaymentMissionError(
              "RETRY_BLOCKED_UNKNOWN",
              `Mission ${JSON.stringify(missionId)} has an unresolved (UNKNOWN or never-answered) attempt — reconcile before any retry; UNKNOWN is never blindly repeated`,
              { missionId },
            );
          }
        } else if (reversalTarget === undefined) {
          throw new PaymentMissionError(
            "INVALID_TRANSITION",
            `Mission ${JSON.stringify(missionId)} has no CONFIRMED effect to reverse — compensation targets a confirmed create-attempt on a COMPLETED mission`,
            { missionId },
          );
        }

        // (P22-H, ADR-0016 D6 — the composite growth) THE CUSTODY-
        // CONTINUITY GATE: a corridor leg dispatch first projects the
        // mission's per-leg outcome vector and refuses typed when any
        // EARLIER leg is not exactly CONFIRMED (UNKNOWN blocks pending
        // reconciliation; FAILED blocks with the chain stopped honestly;
        // UNRECORDED blocks — legs never silently skip). Leg 0 has no
        // prior leg — the gate passes byte-identically for the N=1 path
        // (no legIndex at all skips this whole block).
        if (input.legIndex !== undefined) {
          const priorOutcomes = corridorLegOutcomes(mission0, input.legIndex + 1);
          const verdict = corridorLegDispatchPermitted(input.legIndex, priorOutcomes);
          if (!verdict.permitted) {
            throw new PaymentMissionError("CORRIDOR_LEG_BLOCKED", verdict.reason, {
              missionId,
              reasons: [`legIndex:${String(input.legIndex)}`],
            });
          }
        }

        // The artifact law: single-use, bound to THIS mission, the
        // CURRENT presented preview and the compiled intent digest.
        // (P22-H, D6) A corridor leg dispatch consumes the COMPOSITE
        // artifact's leg SHARE (the leg domain + the per-leg single-use
        // law live in the gate's consumeArtifact); the N=1 path consumes
        // exactly as before.
        const digest = compiledIntentDigest(mission0.intent);
        const artifact = core.getGate().artifact(input.authorizationArtifactId);
        if (artifact === undefined) {
          throw new PaymentMissionError(
            "AUTHORIZATION_REQUIRED",
            `No authorization artifact '${input.authorizationArtifactId}' exists — artifacts are minted only by an explicit user act on a presented preview`,
            { missionId },
          );
        }
        if (artifact.taskRef !== `pmt-mission:${missionId}` || artifact.previewId !== mission0.previewId) {
          throw new PaymentMissionError(
            "AUTHORIZATION_MISMATCH",
            `Authorization artifact '${input.authorizationArtifactId}' is not bound to this mission's current presented preview — a fresh preview and a fresh explicit approval are required`,
            { missionId },
          );
        }
        if (artifact.intentDigest !== digest) {
          throw new PaymentMissionError(
            "AUTHORIZATION_MISMATCH",
            `Authorization artifact '${input.authorizationArtifactId}' was minted against different terms (intent digest mismatch — a material change intervened); renewed authorization is required`,
            { missionId },
          );
        }
        if (input.legIndex !== undefined) {
          // THE COMPOSITE BINDING: a leg dispatch requires the COMPOSITE
          // artifact over the presented plan — a leg dispatch against an
          // N=1 artifact is a typed mismatch (the D7 no-bypass law), and
          // the dispatched plan's digest must EQUAL the artifact's (a
          // leg of a different plan is never a dispatch).
          if (artifact.planDigest === undefined || artifact.planLegCount === undefined) {
            throw new PaymentMissionError(
              "AUTHORIZATION_MISMATCH",
              `Authorization artifact '${input.authorizationArtifactId}' is not a composite multi-leg artifact — a corridor leg dispatch requires the two-act approval over the presented plan (never a single-leg artifact)`,
              { missionId },
            );
          }
          if (input.planDigest === undefined || input.planDigest !== artifact.planDigest) {
            throw new PaymentMissionError(
              "AUTHORIZATION_MISMATCH",
              `The dispatched corridor plan's digest does not match the authorized artifact's plan digest — a leg outside the authorized plan is never a dispatch (the artifact's digest covers every leg of the approved plan)`,
              { missionId },
            );
          }
          if (input.legIndex >= artifact.planLegCount) {
            throw new PaymentMissionError(
              "AUTHORIZATION_MISMATCH",
              `Corridor leg ${String(input.legIndex)} is outside the authorized plan (${String(artifact.planLegCount)} legs) — a leg outside the authorized plan is never a dispatch`,
              { missionId },
            );
          }
        }

        // The idempotency decision (pure, over the persisted records).
        // (P22-H, D6) A corridor leg's key embeds its legIndex —
        // (mission, operation, legIndex, intentDigest), the appendix law.
        const idempotencyKey = paymentIdempotencyKey(missionId, operation, digest, input.legIndex);
        const hashPayload = {
          operation,
          intent: mission0.intent,
          executionMode: input.executionMode,
          connectionRef: input.connectionRef,
          ...(reversalTarget !== undefined
            ? { reversalOf: reversalTarget.attemptId }
            : {}),
        };
        const begin = beginIdempotency(state0.idempotency, {
          scope: PAYMENT_OPERATION_SCOPES[operation],
          connectionId: input.connectionRef,
          commandId: `pmt-cmd:${mintRandom()}`,
          correlationId: `pmt-corr:${mintRandom()}`,
          idempotencyKey,
          command: hashPayload,
          now: toEpochMs(now, "now"),
        });

        if (begin.outcome.kind === "REPLAY" && begin.outcome.record.status === "COMPLETED") {
          // NO DUPLICATE WRITE: the completed record replays its
          // recorded envelope — the authority is never touched.
          const replayed = mission0.attempts.find(
            (attempt) => attempt.idempotencyKey === idempotencyKey && attempt.envelope !== undefined,
          );
          if (replayed?.envelope === undefined) {
            throw new PaymentMissionError(
              "IDEMPOTENCY_CONFLICT",
              `The idempotency record for mission ${JSON.stringify(missionId)} is COMPLETED but the mission carries no recorded envelope — reconciliation evidence is required`,
              { missionId },
            );
          }
          const gateBefore = core.getGate().exportState();
          const consumed = core.getGate().consumeArtifact(input.authorizationArtifactId, now, input.legIndex);
          try {
            await store.commit((state) => {
              const mission = core.requireMission(state, missionId);
              const next = {
                ...mission,
                authorizationArtifactId: consumed.artifactId,
              };
              return {
                ...state,
                missions: state.missions.map((candidate) => (candidate.id === missionId ? next : candidate)),
                authorization: core.getGate().exportState(),
              };
            });
          } catch (error) {
            core.resetGate(gateBefore);
            throw error;
          }
          log("info", `payswap-payments: dispatch REPLAYED (no duplicate write) for mission ${missionId}`);
          return { kind: "REPLAYED", attemptId: replayed.attemptId, envelope: replayed.envelope };
        }
        if (begin.outcome.kind === "REPLAY") {
          throw new PaymentMissionError(
            "RETRY_BLOCKED_UNKNOWN",
            `The idempotency record for mission ${JSON.stringify(missionId)} is ${begin.outcome.record.status} — an in-flight or AMBIGUOUS command reconciles before any retry`,
            { missionId },
          );
        }
        if (begin.outcome.kind === "CONFLICT") {
          throw new PaymentMissionError(
            "IDEMPOTENCY_CONFLICT",
            `The idempotency key for mission ${JSON.stringify(missionId)} is already bound to a DIFFERENT command (INV-06) — same key, different body is a violation attempt, never a re-execution`,
            { missionId },
          );
        }

        // PHASE 1 — the write-ahead: consume the artifact, persist the
        // attempt + the IN_FLIGHT idempotency record + ATTEMPT_STARTED.
        const attemptId = `pmt-attempt:${mintRandom()}`;
        const commandId = `pmt-cmd:${mintRandom()}`;
        const correlationId = `pmt-corr:${mintRandom()}`;
        const gateBefore = core.getGate().exportState();
        core.getGate().consumeArtifact(input.authorizationArtifactId, now, input.legIndex);
        if (begin.mutation === undefined) {
          throw new PaymentMissionError("IDEMPOTENCY_CONFLICT", "the idempotency begin produced no mutation");
        }
        const command = {
          attemptId,
          operation,
          intent: mission0.intent,
          authorizationArtifactId: input.authorizationArtifactId,
          idempotencyKey,
          commandId,
          correlationId,
          connectionRef: input.connectionRef,
          executionMode: input.executionMode,
          ...(reversalTarget !== undefined
            ? { reversalOf: { attemptId: reversalTarget.attemptId, providerReferences: reversalTarget.envelope?.providerReferences ?? [] } }
            : {}),
          // (P22-H, ADR-0016 D6) the corridor leg payload rides the
          // command (the kernel's lane facts); absent for the N=1 path.
          ...(input.leg !== undefined ? { leg: input.leg } : {}),
        } as const;
        validatePaymentDispatchCommand(command);
        try {
          await store.commit((state) => {
            const mission = core.requireMission(state, missionId);
            const withAttempt: PaymentMissionRecord = {
              ...mission,
              authorizationArtifactId: input.authorizationArtifactId,
              attempts: [
                ...mission.attempts,
                {
                  attemptId,
                  operation,
                  idempotencyKey,
                  commandId,
                  correlationId,
                  connectionRef: input.connectionRef,
                  executionMode: input.executionMode,
                  // (P22-H, D6) the leg attempt carries its legIndex (the
                  // custody-continuity projection's key); absent for N=1.
                  ...(input.legIndex !== undefined ? { legIndex: input.legIndex } : {}),
                  authorizationArtifactId: input.authorizationArtifactId,
                  startedAt: now,
                },
              ],
            };
            const withEvent = core.appendEvent(
              withAttempt,
              "ATTEMPT_STARTED",
              `Consequential attempt started (${operation}, ${input.executionMode}, connection ${input.connectionRef}) — single-use authorization ${input.authorizationArtifactId} consumed; idempotency key ${idempotencyKey}.`,
              now,
              idempotencyKey,
            );
            return {
              ...state,
              missions: state.missions.map((candidate) => (candidate.id === missionId ? withEvent : candidate)),
              idempotency:
                begin.mutation === undefined
                  ? state.idempotency
                  : applyIdempotencyMutation(state.idempotency, begin.mutation),
              authorization: core.getGate().exportState(),
            };
          });
        } catch (error) {
          core.resetGate(gateBefore);
          throw error;
        }

        // THE AUTHORITY CALL (inside the serialized chain).
        const answer = await executionAuthority.dispatch(command);

        // PHASE 2 — record the answer. A failure here degrades honestly
        // to the interrupted-write-ahead state (the restart sweep marks
        // it UNKNOWN; the registrar record stays occupied).
        await store.commit((state) => {
          const mission = core.requireMission(state, missionId);
          const attemptIndex = mission.attempts.findIndex((attempt) => attempt.attemptId === attemptId);
          if (attemptIndex < 0) {
            throw new PaymentMissionError("MISSION_NOT_FOUND", `attempt ${attemptId} vanished from mission ${missionId}`, { missionId });
          }
          const attempts = [...mission.attempts];
          const attempt = attempts[attemptIndex]!;
          let missionNext = mission;
          if (answer.kind === "REFUSED") {
            const refusal = answer.refusal;
            attempts[attemptIndex] = { ...attempt, refusal: { kind: refusal.kind, reason: refusal.reason } };
            const failed = failIdempotency(state.idempotency, {
              scope: PAYMENT_OPERATION_SCOPES[operation],
              connectionId: input.connectionRef,
              idempotencyKey,
              now: toEpochMs(now, "now"),
            });
            missionNext = core.appendEvent(
              { ...missionNext, attempts },
              "ATTEMPT_FAILED",
              `The execution authority REFUSED the command (${refusal.kind}): ${refusal.reason} — definitively no effect; the attempt is retryable under a fresh authorization.`,
              now,
              attemptId,
            );
            return {
              ...state,
              missions: state.missions.map((candidate) => (candidate.id === missionId ? missionNext : candidate)),
              idempotency: applyIdempotencyMutation(state.idempotency, failed.mutation),
              authorization: core.getGate().exportState(),
            };
          }
          const envelope = answer.envelope;
          attempts[attemptIndex] = { ...attempt, envelope };
          if (envelope.outcome === "CONFIRMED") {
            const completed = completeIdempotency(state.idempotency, {
              scope: PAYMENT_OPERATION_SCOPES[operation],
              connectionId: input.connectionRef,
              idempotencyKey,
              providerReferences: envelope.providerReferences,
              now: toEpochMs(now, "now"),
            });
            // (P22-H, ADR-0016 D6) THE COMPOSITE COMPLETION LAW: a
            // corridor leg's confirmation completes the mission ONLY
            // when EVERY leg of the authorized plan is CONFIRMED (the
            // per-leg outcome vector projected after this attempt
            // lands); the N=1 path completes exactly as before.
            let nextStatus = operation === "CREATE_EXTERNAL_EFFECT" ? "COMPLETED" : mission.status;
            if (input.legIndex !== undefined && artifact.planLegCount !== undefined) {
              const legCount = artifact.planLegCount;
              const projected = corridorLegOutcomes(
                { ...mission, attempts },
                legCount,
              );
              nextStatus = projected.every((outcome) => outcome === "CONFIRMED")
                ? "COMPLETED"
                : mission.status;
            }
            missionNext = core.appendEvent(
              { ...missionNext, attempts, status: nextStatus },
              "ATTEMPT_CONFIRMED",
              operation === "CREATE_EXTERNAL_EFFECT"
                ? `Effect CONFIRMED by the execution authority (provider references: ${envelope.providerReferences.join(", ") || "none acknowledged"}). The mission is complete — an acknowledgement is not finality; the recorded envelope is the evidence.`
                : `Reversal CONFIRMED by the execution authority (provider references: ${envelope.providerReferences.join(", ") || "none acknowledged"}) — recorded in the completed mission's timeline (the original payment and its reversal both stand as recorded evidence).`,
              now,
              attemptId,
            );
            return {
              ...state,
              missions: state.missions.map((candidate) => (candidate.id === missionId ? missionNext : candidate)),
              idempotency: applyIdempotencyMutation(state.idempotency, completed.mutation),
              authorization: core.getGate().exportState(),
            };
          }
          if (envelope.outcome === "FAILED") {
            const failed = failIdempotency(state.idempotency, {
              scope: PAYMENT_OPERATION_SCOPES[operation],
              connectionId: input.connectionRef,
              idempotencyKey,
              now: toEpochMs(now, "now"),
            });
            missionNext = core.appendEvent(
              { ...missionNext, attempts },
              "ATTEMPT_FAILED",
              `Attempt definitively FAILED (${envelope.providerFailure?.providerErrorCode ?? "no provider code"}: ${envelope.providerFailure?.providerErrorMessage ?? "no provider message"}) — the effect did not happen; the mission stays open for a fresh authorization and retry.`,
              now,
              attemptId,
            );
            return {
              ...state,
              missions: state.missions.map((candidate) => (candidate.id === missionId ? missionNext : candidate)),
              idempotency: applyIdempotencyMutation(state.idempotency, failed.mutation),
              authorization: core.getGate().exportState(),
            };
          }
          const ambiguous = markAmbiguousIdempotency(state.idempotency, {
            scope: PAYMENT_OPERATION_SCOPES[operation],
            connectionId: input.connectionRef,
            idempotencyKey,
            now: toEpochMs(now, "now"),
          });
          missionNext = core.appendEvent(
            { ...missionNext, attempts },
            "OUTCOME_UNKNOWN",
            `Outcome UNKNOWN (${envelope.ambiguityReason ?? "unrecorded reason"}) — the command may have landed. UNKNOWN is not failure and not success: it reconciles before any retry, and nothing is blindly repeated.`,
            now,
            attemptId,
          );
          return {
            ...state,
            missions: state.missions.map((candidate) => (candidate.id === missionId ? missionNext : candidate)),
            idempotency: applyIdempotencyMutation(state.idempotency, ambiguous.mutation),
            authorization: core.getGate().exportState(),
          };
        });

        if (answer.kind === "REFUSED") {
          log("warn", `payswap-payments: dispatch REFUSED (${answer.refusal.kind}) for mission ${missionId}`);
          return { kind: "REFUSED", attemptId, refusal: answer.refusal };
        }
        log("info", `payswap-payments: dispatch ${answer.envelope.outcome} for mission ${missionId}`);
        return { kind: "DISPATCHED", attemptId, envelope: answer.envelope };
      });
    },

    async reconcile(missionId, attemptId, evidence, now) {
      if (evidence.resolvedTo !== "CONFIRMED" && evidence.resolvedTo !== "FAILED") {
        throw new PaymentMissionError("RECONCILIATION_EVIDENCE_INVALID", "resolvedTo must be CONFIRMED or FAILED");
      }
      if (
        evidence.source !== "EXTERNAL_PROVIDER_STATEMENT" &&
        evidence.source !== "EXTERNAL_PROVIDER_RETRIEVAL"
      ) {
        throw new PaymentMissionError(
          "RECONCILIATION_EVIDENCE_INVALID",
          "source must be EXTERNAL_PROVIDER_STATEMENT or EXTERNAL_PROVIDER_RETRIEVAL",
        );
      }
      if (
        !Array.isArray(evidence.evidenceRefs) ||
        evidence.evidenceRefs.length === 0 ||
        evidence.evidenceRefs.some((ref) => typeof ref !== "string" || ref.length === 0 || ref.length > 512)
      ) {
        throw new PaymentMissionError(
          "RECONCILIATION_EVIDENCE_INVALID",
          "evidenceRefs must be a non-empty array of bounded non-empty strings — reconciliation never closes on a bare assertion",
        );
      }
      let updated!: PaymentMissionRecord;
      await core.serialized(() =>
        store.commit((state) => {
          const mission = core.requireMission(state, missionId);
          const attemptIndex = mission.attempts.findIndex((attempt) => attempt.attemptId === attemptId);
          if (attemptIndex < 0) {
            throw new PaymentMissionError(
              "MISSION_NOT_FOUND",
              `No attempt '${attemptId}' exists on mission '${missionId}'`,
              { missionId },
            );
          }
          const attempt = mission.attempts[attemptIndex]!;
          if (attempt.envelope !== undefined && attempt.envelope.outcome !== "UNKNOWN") {
            throw new PaymentMissionError(
              "RECONCILIATION_NOT_PENDING",
              `Attempt '${attemptId}' is not pending reconciliation (outcome ${attempt.envelope.outcome}) — only UNKNOWN or never-answered attempts accept evidence`,
              { missionId },
            );
          }
          if (attempt.refusal !== undefined) {
            throw new PaymentMissionError(
              "RECONCILIATION_NOT_PENDING",
              `Attempt '${attemptId}' was refused before any effect — there is nothing to reconcile`,
              { missionId },
            );
          }
          if (attempt.reconciliation !== undefined) {
            throw new PaymentMissionError(
              "RECONCILIATION_NOT_PENDING",
              `Attempt '${attemptId}' is already reconciled (${attempt.reconciliation.resolvedTo}) — reconciliation records are append-only`,
              { missionId },
            );
          }
          const attempts = [...mission.attempts];
          attempts[attemptIndex] = {
            ...attempt,
            reconciliation: {
              resolvedTo: evidence.resolvedTo,
              source: evidence.source,
              evidenceRefs: Object.freeze([...evidence.evidenceRefs]),
              resolvedAt: now,
            },
          };
          let next: PaymentMissionRecord = { ...mission, attempts };
          if (evidence.resolvedTo === "CONFIRMED") {
            const completed = completeIdempotency(state.idempotency, {
              scope: PAYMENT_OPERATION_SCOPES[attempt.operation],
              connectionId: attempt.connectionRef,
              idempotencyKey: attempt.idempotencyKey,
              providerReferences: evidence.evidenceRefs,
              now: toEpochMs(now, "now"),
            });
            next = core.appendEvent(
              next,
              "ATTEMPT_CONFIRMED",
              `Reconciliation evidence (${evidence.source}) CONFIRMED the effect — provider evidence: ${evidence.evidenceRefs.join(", ")}.`,
              now,
              attemptId,
            );
            next = core.appendEvent(
              attempt.operation === "CREATE_EXTERNAL_EFFECT"
                ? { ...next, status: "COMPLETED" }
                : next,
              "RECONCILED",
              `UNKNOWN closed to CONFIRMED by provider evidence (${evidence.source}); the effect stands as recorded evidence.`,
              now,
              attemptId,
            );
            updated = next;
            return {
              ...state,
              missions: state.missions.map((candidate) => (candidate.id === missionId ? next : candidate)),
              idempotency: applyIdempotencyMutation(state.idempotency, completed.mutation),
            };
          }
          const failed = failIdempotency(state.idempotency, {
            scope: PAYMENT_OPERATION_SCOPES[attempt.operation],
            connectionId: attempt.connectionRef,
            idempotencyKey: attempt.idempotencyKey,
            now: toEpochMs(now, "now"),
          });
          next = core.appendEvent(
            next,
            "ATTEMPT_FAILED",
            `Reconciliation evidence (${evidence.source}) proved NO effect — the attempt definitively did not happen; the mission stays open for a fresh authorization and retry.`,
            now,
            attemptId,
          );
          next = core.appendEvent(
            next,
            "RECONCILED",
            `UNKNOWN closed to FAILED by provider evidence (${evidence.source}); no effect stands.`,
            now,
            attemptId,
          );
          updated = next;
          return {
            ...state,
            missions: state.missions.map((candidate) => (candidate.id === missionId ? next : candidate)),
            idempotency: applyIdempotencyMutation(state.idempotency, failed.mutation),
          };
        }),
      );
      log("info", `payswap-payments: attempt ${attemptId} reconciled to ${evidence.resolvedTo}`);
      return updated;
    },

    async verify(missionId, attemptId, readBackPort, now) {
      let outcome!: PaymentAttemptVerificationOutcome;
      await core.serialized(async () => {
        const state = await store.load();
        const mission = core.requireMission(state, missionId);
        // (1) THE PURE DECISION drives everything (the reviewer's law).
        const decision = projectAttemptVerification(mission, attemptId);
        if (decision.kind === "NO_SUCH_ATTEMPT") {
          throw new PaymentMissionError(
            "MISSION_NOT_FOUND",
            `No attempt '${attemptId}' exists on mission '${missionId}'`,
            { missionId },
          );
        }
        if (decision.kind === "ALREADY_VERIFIED") {
          // THE IDEMPOTENT REPLAY: the recorded typed fact answers;
          // NOTHING is appended and the recorded instant never rewrites.
          const recorded = mission.events.find(
            (event) => event.kind === "ATTEMPT_VERIFIED" && event.correlationRef === attemptId,
          );
          outcome = {
            kind: "VERIFIED",
            attemptId,
            readBackStatus: decision.verification.readBackStatus,
            verifiedAt: decision.verification.verifiedAt,
            summary:
              recorded?.summary ??
              verificationSummaryOf(
                decision.verification.providerReferences[0] ?? "the provider's object",
                decision.verification.readBackStatus,
              ),
          };
          return;
        }
        if (decision.kind === "ALREADY_RECONCILED") {
          throw new PaymentMissionError(
            "VERIFICATION_REFUSED",
            `Attempt '${attemptId}' was already closed by reconciliation evidence — verification is not applicable to a reconciled attempt; nothing was recorded`,
            { missionId },
          );
        }
        if (decision.kind === "RECONCILIATION_REQUIRED") {
          throw new PaymentMissionError(
            "VERIFICATION_REFUSED",
            `Attempt '${attemptId}' is unresolved — an ambiguous outcome must remain UNKNOWN and require the actual reconciliation path; verification never substitutes for reconciliation`,
            { missionId },
          );
        }
        if (decision.kind === "NOT_CONFIRMED") {
          // The decision carries no payload by contract; the recorded
          // attempt (it exists — NO_SUCH_ATTEMPT did not fire) names WHY.
          const recorded = mission.attempts.find((candidate) => candidate.attemptId === attemptId)!;
          throw new PaymentMissionError(
            "VERIFICATION_REFUSED",
            recorded.envelope?.outcome === "FAILED"
              ? `Attempt '${attemptId}' definitively failed — no confirmed effect exists to verify; the mission stays open for a fresh authorization`
              : `Attempt '${attemptId}' was refused before any effect — no provider object exists to read back; the mission stays open for a fresh authorization`,
            { missionId },
          );
        }
        if (decision.kind === "NO_PROVIDER_REFERENCE") {
          throw new PaymentMissionError(
            "VERIFICATION_REFUSED",
            `Attempt '${attemptId}' is CONFIRMED but its recorded envelope carries no provider reference — the read-back has nothing to address; nothing was recorded`,
            { missionId },
          );
        }
        // (2) VERIFIABLE — THE AUTHORITATIVE READ-BACK (inside the
        // serialized chain, exactly like the dispatch authority call).
        const readBack = await readBackPort.readBack({
          connectionRef: decision.attempt.connectionRef,
          paymentIntentId: decision.paymentIntentId,
          executionMode: decision.attempt.executionMode,
        });
        if (readBack.outcome === "UNKNOWN") {
          // Append NOTHING: the attempt stays exactly as recorded.
          throw new PaymentMissionError(
            "VERIFICATION_REFUSED",
            `The read-back itself was ambiguous for attempt '${attemptId}' — the attempt stays exactly as recorded; reconciliation remains the path`,
            { missionId },
          );
        }
        if (readBack.outcome === "FAILED" || readBack.paymentIntentStatus !== "succeeded") {
          // Append NOTHING: the envelope is never mutated.
          throw new PaymentMissionError(
            "VERIFICATION_REFUSED",
            `The provider's read-back does not agree with the recorded confirmation for attempt '${attemptId}' (observed '${readBack.paymentIntentStatus ?? "no status"}') — take the reconciliation path; nothing was rewritten`,
            { missionId },
          );
        }
        // (3) THE AGREEMENT — the typed persisted verification fact + the
        // append-only event land in ONE store transaction.
        const verification: PaymentAttemptVerification = {
          readBackStatus: readBack.paymentIntentStatus,
          providerReferences: [readBack.paymentIntentId, readBack.paymentIntentStatus],
          source: "EXTERNAL_PROVIDER_RETRIEVAL",
          verifiedAt: now,
        };
        const summary = verificationSummaryOf(readBack.paymentIntentId, readBack.paymentIntentStatus);
        await store.commit((current) => {
          const missionNow = core.requireMission(current, missionId);
          const attemptIndex = missionNow.attempts.findIndex((candidate) => candidate.attemptId === attemptId);
          if (attemptIndex < 0) {
            throw new PaymentMissionError(
              "MISSION_NOT_FOUND",
              `No attempt '${attemptId}' exists on mission '${missionId}'`,
              { missionId },
            );
          }
          const attempts = [...missionNow.attempts];
          attempts[attemptIndex] = { ...attempts[attemptIndex]!, verification };
          const withEvent = core.appendEvent(
            { ...missionNow, attempts },
            "ATTEMPT_VERIFIED",
            summary,
            now,
            attemptId,
          );
          return {
            ...current,
            missions: current.missions.map((candidate) => (candidate.id === missionId ? withEvent : candidate)),
          };
        });
        outcome = {
          kind: "VERIFIED",
          attemptId,
          readBackStatus: verification.readBackStatus,
          verifiedAt: now,
          summary,
        };
      });
      log(
        "info",
        `payswap-payments: attempt ${attemptId} verified by the authoritative read-back on mission ${missionId} — the typed persisted verification fact (never a reconciliation)`,
      );
      return outcome;
    },

    async recoverInterruptions(now) {
      const state = await store.load();
      const plan = planInterruptionRecovery(state.missions);
      if (plan.length === 0) return plan;
      await core.serialized(async () => {
        for (const item of plan) {
          await store.commit((current) => {
            const mission = core.requireMission(current, item.missionId);
            const attempt = mission.attempts.find((candidate) => candidate.attemptId === item.attemptId);
            if (attempt === undefined) return current;
            const ambiguous = markAmbiguousIdempotency(current.idempotency, {
              scope: PAYMENT_OPERATION_SCOPES[attempt.operation],
              connectionId: attempt.connectionRef,
              idempotencyKey: attempt.idempotencyKey,
              now: toEpochMs(now, "now"),
            });
            const next = core.appendEvent(
              mission,
              "OUTCOME_UNKNOWN",
              "The runtime was interrupted before the execution authority answered — the command may have landed. UNKNOWN is not failure and not success: it reconciles before any retry.",
              now,
              attempt.attemptId,
            );
            return {
              ...current,
              missions: current.missions.map((candidate) =>
                candidate.id === item.missionId ? next : candidate,
              ),
              idempotency: applyIdempotencyMutation(current.idempotency, ambiguous.mutation),
            };
          });
        }
      });
      log("warn", `payswap-payments: interruption recovery marked ${String(plan.length)} attempt(s) UNKNOWN`);
      return plan;
    },
  };
}
