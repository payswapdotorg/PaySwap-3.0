/**
 * PaySwap Desktop (P18-A, ADR-0011 D2/D3) — the approval channel
 * members, implemented over the REAL PaymentMissionRuntime and split
 * from ./payment-mission-members.ts for the ≤400-line file law.
 *
 * THE EDGE PIN (the law this file enforces, ADR-0011 D2): the renderer
 * supplies ONLY a missionId (request) or a requestId + APPROVE|DECLINE
 * (resolve). The decision ORIGIN is pinned here to PREVIEW_UI_ACT and
 * the principal to the host operator ref — a non-UI origin can never
 * arrive through this channel, so the approval act IS a preview UI act
 * by construction (the authorization gate rejects every other origin,
 * which is why a successful grant through this member PROVES the pin).
 *
 * THE ARTIFACT NEVER CROSSES: the single-use
 * PaymentAuthorizationArtifact a grant mints is host-side only — the
 * resolution DTO echoes the scope + expiry and NEVER the artifactId;
 * the observable truth is the resolution outcome + the mission
 * timeline's AUTHORIZATION_GRANTED / AUTHORIZATION_DECLINED event.
 *
 * The attempt-state projection (ADR-0011 D3) also lives here: outcome
 * facts only, derived from the attempt records host-side — no
 * idempotency keys, no command/correlation ids, no connection refs,
 * no artifact ids. Instants are stamped HERE, at the channel edge,
 * from the injected host clock — never renderer-supplied. Every
 * member fails closed when the runtime was not composed (the typed
 * PaymentPlaneNotConfiguredError, thrown by the resolver the service
 * injects).
 */

import { PaymentMissionError, type PaymentAttemptRecord } from "../payments/contracts.js";
import type {
  AuthorizationResolution,
  PaymentAuthorizationDecision,
  PaymentAuthorizationRequest,
} from "../payments/authorization-gate.js";
import type { PaymentMissionChannelDeps } from "./payment-mission-members.js";
import type {
  IPaySwapDesktopPaymentMissionMembers,
  PaymentAttemptOutcome,
  PaymentAuthorizationRequestDto,
  PaymentAuthorizationResolutionDto,
  PaymentAuthorizationScopeDto,
  PaymentMissionAttemptStateDto,
} from "./payment-mission-contracts.js";

/** The pinned decision origin — the ONLY origin that can decide (the origin law). */
const CHANNEL_APPROVAL_ORIGIN = "PREVIEW_UI_ACT" as const;

/** The pinned principal (the P14 E2E literal; the trust plane owns identity). */
const CHANNEL_APPROVAL_PRINCIPAL = "principal:operator";

/** Project a pending authorization request to the wire DTO (NO artifact fields). */
function toRequestDto(request: PaymentAuthorizationRequest): PaymentAuthorizationRequestDto {
  return {
    requestId: request.requestId,
    previewId: request.previewId,
    missionId: request.missionId,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    scope: toScopeDto(request.scope),
    scopeSummary: request.scopeSummary,
  };
}

/** Copy the scope verbatim (fresh objects — the host record is never aliased onto the wire). */
function toScopeDto(scope: PaymentAuthorizationScopeDto): PaymentAuthorizationScopeDto {
  return { ...scope, amount: { ...scope.amount } };
}

/**
 * Project the runtime's resolution to the wire DTO. The GRANTED branch
 * reads the minted artifact's scope + expiry (host-side) and echoes
 * ONLY those — the artifactId and every other artifact field stay
 * host-side (ADR-0011 D2: the artifact never crosses).
 */
function toResolutionDto(resolution: AuthorizationResolution): PaymentAuthorizationResolutionDto {
  const outcome = resolution.outcome;
  return {
    outcome:
      outcome.kind === "GRANTED"
        ? {
            kind: "GRANTED",
            scope: toScopeDto(outcome.artifact.scope),
            expiresAt: outcome.artifact.expiresAt,
          }
        : outcome.kind === "DECLINED"
          ? { kind: "DECLINED", reason: outcome.reason }
          : { kind: "REJECTED", reason: outcome.reason },
    missionId: resolution.missionId,
    previewId: resolution.previewId,
  };
}

/** Derive one attempt's outcome fact from its record (ADR-0011 D3). */
function attemptOutcomeOf(attempt: PaymentAttemptRecord): PaymentAttemptOutcome {
  if (attempt.refusal !== undefined) {
    return "REFUSED"; // the authority refused before any effect — definitively no-effect
  }
  if (attempt.reconciliation !== undefined) {
    return "RECONCILED"; // provider evidence closed the attempt (INV-04 satisfied)
  }
  if (attempt.envelope === undefined) {
    return "STARTED"; // write-ahead persisted, answer never recorded
  }
  if (attempt.envelope.outcome === "CONFIRMED") {
    return "CONFIRMED";
  }
  if (attempt.envelope.outcome === "FAILED") {
    return "FAILED";
  }
  return "OUTCOME_UNKNOWN"; // the envelope's third value — UNKNOWN ≠ FAILED (INV-04)
}

/** The people-language summary for one attempt outcome (facts only, no lineage). */
function attemptSummaryOf(attempt: PaymentAttemptRecord, outcome: PaymentAttemptOutcome): string {
  switch (outcome) {
    case "STARTED":
      return "The attempt started and no answer is recorded yet — it is in flight (or was interrupted before the answer landed); the restart sweep marks such attempts outcome-unknown.";
    case "CONFIRMED":
      return "The execution authority confirmed the effect — the confirmed fact stands as recorded evidence.";
    case "FAILED":
      return "The attempt definitively failed — the effect did not happen; the mission stays open for a fresh authorization and retry.";
    case "OUTCOME_UNKNOWN":
      return "The outcome is unknown — the command may have landed; it reconciles before any retry and nothing is blindly repeated.";
    case "RECONCILED":
      return attempt.reconciliation?.resolvedTo === "CONFIRMED"
        ? "Provider evidence closed the unknown outcome to confirmed — the effect stands as recorded evidence."
        : "Provider evidence closed the unknown outcome to failed — no effect stands.";
    case "REFUSED":
      return `The execution authority refused the command before any effect (${attempt.refusal?.kind ?? "refused"}) — definitively no effect; retryable under a fresh authorization.`;
  }
}

/**
 * Project the attempt records to the wire's attempt STATES (P18-A,
 * ADR-0011 D3): outcome facts only, in start order. The projection
 * NEVER carries idempotencyKey, commandId, correlationId,
 * connectionRef or authorizationArtifactId — the consumed-artifact
 * lineage stays host-side (the ADR-0010 D2 DTO law). Exported for the
 * mission members' toDetailDto (the one detail projection).
 */
export function projectAttemptStates(
  attempts: readonly PaymentAttemptRecord[],
): readonly PaymentMissionAttemptStateDto[] {
  return attempts.map((attempt) => {
    const outcome = attemptOutcomeOf(attempt);
    return {
      attemptId: attempt.attemptId,
      startedAt: attempt.startedAt,
      operation: attempt.operation,
      executionMode: attempt.executionMode,
      outcome,
      summary: attemptSummaryOf(attempt, outcome),
      // (P21-D reviewer-gate, Gap C) The typed verification fact — its OWN
      // fact, never a new outcome: the observed status + the instant only
      // (the provider references stay host-side with the envelope).
      ...(attempt.verification !== undefined
        ? {
            verification: {
              readBackStatus: attempt.verification.readBackStatus,
              verifiedAt: attempt.verification.verifiedAt,
            },
          }
        : {}),
    };
  });
}

/**
 * Create the approval channel members over the injected runtime
 * (P18-A, ADR-0011 D2). Returned as a Pick of the mission-member
 * interface so the service can spread them beside the P17-A members
 * over the SAME fail-closed resolver and host clock.
 */
export function createPaymentApprovalChannelMembers(
  deps: PaymentMissionChannelDeps,
): Pick<
  IPaySwapDesktopPaymentMissionMembers,
  "paymentMissionRequestApproval" | "paymentMissionResolveApproval"
> {
  return {
    async paymentMissionRequestApproval(missionId) {
      const runtime = deps.resolveRuntime();
      // Fail-closed on the channel-supplied mission id BEFORE the
      // runtime call (the RPC boundary carries no types — a malformed
      // id is a typed refusal, never a silently-guessed mission).
      if (typeof missionId !== "string" || missionId.length === 0) {
        throw new PaymentMissionError(
          "MISSION_NOT_FOUND",
          "missionId must be a non-empty string (the mission whose persisted preview the approval request is scoped over)",
        );
      }
      // The runtime mints the request over the mission's PERSISTED
      // preview (requireActive + requirePreview + the dispatchable
      // gate — typed failures for every invalid posture).
      const request = await runtime.requestAuthorization(missionId, deps.now());
      deps.log(
        "info",
        `payswap-desktop: authorization request ${request.requestId} minted over the persisted preview (mission ${missionId}) — scope verbatim; no artifact field exists on the wire`,
      );
      return toRequestDto(request);
    },

    async paymentMissionResolveApproval(requestId, decision) {
      const runtime = deps.resolveRuntime();
      // Fail-closed input validation at the edge — the same typed
      // kinds the gate itself produces (a malformed id or decision is
      // a typed refusal, never a silently-coerced decision).
      if (typeof requestId !== "string" || requestId.length === 0) {
        throw new PaymentMissionError(
          "AUTHORIZATION_ORIGIN_REJECTED",
          "an authorization decision requires a requestId",
        );
      }
      if (decision !== "APPROVE" && decision !== "DECLINE") {
        throw new PaymentMissionError(
          "AUTHORIZATION_ORIGIN_REJECTED",
          "an authorization decision must be APPROVE or DECLINE",
        );
      }
      // THE EDGE PIN (ADR-0011 D2): origin := PREVIEW_UI_ACT and the
      // operator principal are fixed HERE, at the channel boundary —
      // the renderer cannot supply, forge or see either. Only a
      // PREVIEW_UI_ACT origin can decide (the gate rejects every
      // other origin with no effect on the pending request), so the
      // pin IS the origin law at this edge.
      const pinnedDecision: PaymentAuthorizationDecision & { readonly principalRef: string } = {
        requestId,
        decision,
        origin: CHANNEL_APPROVAL_ORIGIN,
        principalRef: CHANNEL_APPROVAL_PRINCIPAL,
      };
      const resolution = await runtime.resolveAuthorization(pinnedDecision, deps.now());
      deps.log(
        "info",
        `payswap-desktop: authorization ${resolution.outcome.kind} for request ${requestId} (mission ${resolution.missionId}) — origin pinned PREVIEW_UI_ACT at the channel edge; the artifact stays host-side`,
      );
      return toResolutionDto(resolution);
    },
  };
}
