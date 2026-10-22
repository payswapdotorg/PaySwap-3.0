/**
 * PaySwap Desktop (P13-C) — the authorization gate (ADR-0007 D7 core).
 *
 * THE LAW: a scoped approval artifact is minted ONLY by an explicit user
 * UI act on the presented preview. The runtime exposes
 * requestAuthorization(previewId) → a PENDING request; the artifact lands
 * via an approve/decline decision input modeled as a HOST-RECEIVED
 * PRINCIPAL ACTION whose origin is typed:
 *
 * - "PREVIEW_UI_ACT" — an explicit user act on the preview (the ONLY
 *   origin that can decide; both approve AND decline — a principal
 *   decision is a UI act, never a chat interpretation);
 * - "COMPOSER_TEXT" / "COMPOSER_VOICE" / "SYSTEM" — REJECTED with the
 *   typed reason: text, voice and NLP are NEVER authorization.
 *
 * The artifact is typed (scope, taskRef, createdAt, expiresAt, single-use)
 * and is the ONLY key that arms dispatch: the execution runtime consumes
 * it exactly once (consumedAt), bound to the mission AND the preview AND
 * the intent digest (a material change to the mission invalidates the
 * match — the P3-W2 law, enforced at dispatch with the typed mismatch).
 *
 * Pure state machine over injected state; the runtime persists the
 * AUTHORIZATION_GRANTED/AUTHORIZATION_DECLINED events on the mission.
 */

import {
  PaymentMissionError,
  type PaymentMissionDirection,
} from "./contracts.js";
import type { PaymentPreviewRecord } from "./preview.js";

/** The origins a principal action can arrive with (pinned vocabulary). */
export const AUTHORIZATION_ACTION_ORIGINS = [
  "PREVIEW_UI_ACT",
  "COMPOSER_TEXT",
  "COMPOSER_VOICE",
  "SYSTEM",
] as const;
export type AuthorizationActionOrigin = (typeof AUTHORIZATION_ACTION_ORIGINS)[number];

/** The pinned rejection reason (verbatim; asserted in tests). */
export const AUTHORIZATION_NLP_REJECTION_REASON =
  "Authorization requires an explicit user act on the presented preview — text, voice and NLP input are never authorization. The decision must be made on the preview's approve/decline control.";

/** The default artifact lifetime (seconds; the AGENT_TASK_STATE_LIFETIME pin). */
export const AUTHORIZATION_ARTIFACT_LIFETIME_SECONDS = 600;

/** The scope an approval covers (copied verbatim from the preview). */
export interface PaymentAuthorizationScope {
  readonly missionId: string;
  readonly direction: PaymentMissionDirection;
  readonly amount: { readonly currency: string; readonly minorUnits: string };
  readonly destinationSummary: string;
  /** The digest of the compiled intent the approval covers (material-change binding). */
  readonly intentDigest: string;
}

/** A pending authorization request (created by requestAuthorization). */
export interface PaymentAuthorizationRequest {
  readonly requestId: string;
  readonly previewId: string;
  readonly missionId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly scope: PaymentAuthorizationScope;
  readonly scopeSummary: string;
  readonly status: "PENDING" | "RESOLVED";
}

/** The scoped approval artifact — single-use; the ONLY key that arms dispatch. */
export interface PaymentAuthorizationArtifact {
  readonly artifactId: string;
  readonly taskRef: string;
  readonly previewId: string;
  readonly intentDigest: string;
  readonly scope: PaymentAuthorizationScope;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly singleUse: true;
  readonly consumedAt: string | null;
}

/** The typed decision input (a host-received principal action). */
export interface PaymentAuthorizationDecision {
  readonly requestId: string;
  readonly decision: "APPROVE" | "DECLINE";
  /** Where the action came from — ONLY PREVIEW_UI_ACT can decide. */
  readonly origin: AuthorizationActionOrigin;
}

/** Fail-closed structural validation of a decision input. */
export function validateAuthorizationDecision(decision: PaymentAuthorizationDecision): void {
  if (typeof decision.requestId !== "string" || decision.requestId.length === 0) {
    throw new PaymentMissionError(
      "AUTHORIZATION_ORIGIN_REJECTED",
      "an authorization decision requires a requestId",
    );
  }
  if (decision.decision !== "APPROVE" && decision.decision !== "DECLINE") {
    throw new PaymentMissionError(
      "AUTHORIZATION_ORIGIN_REJECTED",
      "an authorization decision must be APPROVE or DECLINE",
    );
  }
  if (!(AUTHORIZATION_ACTION_ORIGINS as readonly string[]).includes(decision.origin)) {
    throw new PaymentMissionError(
      "AUTHORIZATION_ORIGIN_REJECTED",
      `an authorization decision origin must be one of [${AUTHORIZATION_ACTION_ORIGINS.join(", ")}]`,
    );
  }
}

/** The pure authorization-gate state (requests + artifacts). */
export interface PaymentAuthorizationGateState {
  readonly requests: readonly PaymentAuthorizationRequest[];
  readonly artifacts: readonly PaymentAuthorizationArtifact[];
}

export function initialAuthorizationGateState(): PaymentAuthorizationGateState {
  return { requests: [], artifacts: [] };
}

function plusSeconds(instant: string, seconds: number): string {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) {
    throw new PaymentMissionError("AUTHORIZATION_EXPIRED", "instants must be ISO-8601 UTC");
  }
  return new Date(ms + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** The typed resolution outcome. */
export type AuthorizationResolution = {
  readonly outcome:
    | { readonly kind: "GRANTED"; readonly artifact: PaymentAuthorizationArtifact }
    | { readonly kind: "DECLINED"; readonly reason: string }
    | { readonly kind: "REJECTED"; readonly reason: string };
  readonly missionId: string;
  readonly previewId: string;
};

/** The pure authorization gate (the LAW lives here). */
export interface PaymentAuthorizationGate {
  requestAuthorization(
    preview: PaymentPreviewRecord,
    scope: PaymentAuthorizationScope,
    now: string,
  ): PaymentAuthorizationRequest;
  resolveAuthorization(decision: PaymentAuthorizationDecision, now: string): AuthorizationResolution;
  artifact(artifactId: string): PaymentAuthorizationArtifact | undefined;
  consumeArtifact(artifactId: string, now: string): PaymentAuthorizationArtifact;
  exportState(): PaymentAuthorizationGateState;
}

/** The intent digest binding (deterministic; material-change detection). */
export function paymentIntentDigest(parts: {
  readonly intentId: string;
  readonly originLocationRef: string;
  readonly destinationLocationRef: string;
  readonly minorUnits: string;
  readonly currency: string;
  readonly arrivalCurrency: string;
  readonly expiresAt: number;
}): string {
  const canonical = [
    parts.intentId,
    parts.originLocationRef,
    parts.destinationLocationRef,
    `${parts.currency}:${parts.minorUnits}`,
    parts.arrivalCurrency,
    String(parts.expiresAt),
  ].join("|");
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `pmt-auth-digest:${hash.toString(16).padStart(8, "0")}`;
}

/** Create the pure authorization gate (optionally restored from state). */
export function createAuthorizationGate(
  initial: PaymentAuthorizationGateState = initialAuthorizationGateState(),
): PaymentAuthorizationGate {
  const requests = new Map(initial.requests.map((request) => [request.requestId, request]));
  const artifacts = new Map(initial.artifacts.map((artifact) => [artifact.artifactId, artifact]));
  let requestCounter = requests.size;
  let artifactCounter = artifacts.size;

  return {
    requestAuthorization(preview, scope, now) {
      if (preview.missionId !== scope.missionId) {
        throw new PaymentMissionError(
          "AUTHORIZATION_MISMATCH",
          "the authorization scope must belong to the preview's mission",
        );
      }
      if (!preview.dispatchable) {
        throw new PaymentMissionError(
          "GATES_BLOCKED",
          "Authorization can be requested only for a dispatchable preview (gates PROCEED + intent compiled) — a blocked preview can never arm authorization.",
          { missionId: preview.missionId, reasons: preview.gates.reasons },
        );
      }
      if (preview.expiresAt !== undefined && now >= preview.expiresAt) {
        throw new PaymentMissionError(
          "PREVIEW_EXPIRED",
          `The preview expired at ${preview.expiresAt} — a fresh preview (and a fresh quote) is required; authorization never extends expired terms.`,
          { missionId: preview.missionId },
        );
      }
      requestCounter += 1;
      const request: PaymentAuthorizationRequest = Object.freeze({
        requestId: `pmt-auth-req-${String(requestCounter)}`,
        previewId: preview.previewId,
        missionId: preview.missionId,
        createdAt: now,
        expiresAt: plusSeconds(now, AUTHORIZATION_ARTIFACT_LIFETIME_SECONDS),
        scope: Object.freeze({ ...scope }),
        scopeSummary: preview.authorizationScopeSummary,
        status: "PENDING",
      });
      requests.set(request.requestId, request);
      return request;
    },

    resolveAuthorization(decision, now) {
      validateAuthorizationDecision(decision);
      const request = requests.get(decision.requestId);
      if (request === undefined) {
        throw new PaymentMissionError(
          "AUTHORIZATION_REQUIRED",
          `No authorization request '${decision.requestId}' exists — requests are minted only by requestAuthorization on a dispatchable preview.`,
        );
      }
      if (request.status === "RESOLVED") {
        throw new PaymentMissionError(
          "AUTHORIZATION_REQUIRED",
          `Authorization request '${decision.requestId}' is already resolved — requests are single-use (never silently re-decided).`,
        );
      }
      // ORIGIN LAW (checked BEFORE any state change): a non-UI origin is
      // REJECTED with NO effect on the pending request — a rejected
      // text/voice/NLP attempt does not consume the user's ability to
      // decide on the preview control (the rejection is recorded as an
      // event by the runtime, never as a resolution here).
      if (decision.origin !== "PREVIEW_UI_ACT") {
        return {
          outcome: { kind: "REJECTED", reason: AUTHORIZATION_NLP_REJECTION_REASON },
          missionId: request.missionId,
          previewId: request.previewId,
        };
      }
      if (now >= request.expiresAt) {
        throw new PaymentMissionError(
          "AUTHORIZATION_EXPIRED",
          `Authorization request '${decision.requestId}' expired at ${request.expiresAt} — the pending request lapsed; a fresh request on a fresh preview is required.`,
          { missionId: request.missionId },
        );
      }
      requests.set(request.requestId, Object.freeze({ ...request, status: "RESOLVED" }));

      if (decision.decision === "DECLINE") {
        return {
          outcome: {
            kind: "DECLINED",
            reason:
              "The user declined on the preview's authorization control — no artifact is minted and nothing is dispatched.",
          },
          missionId: request.missionId,
          previewId: request.previewId,
        };
      }
      artifactCounter += 1;
      const artifact: PaymentAuthorizationArtifact = Object.freeze({
        artifactId: `pmt-auth-${String(artifactCounter)}`,
        taskRef: `pmt-mission:${request.missionId}`,
        previewId: request.previewId,
        intentDigest: request.scope.intentDigest,
        scope: request.scope,
        createdAt: now,
        expiresAt: request.expiresAt,
        singleUse: true,
        consumedAt: null,
      });
      artifacts.set(artifact.artifactId, artifact);
      return {
        outcome: { kind: "GRANTED", artifact },
        missionId: request.missionId,
        previewId: request.previewId,
      };
    },

    artifact(artifactId) {
      return artifacts.get(artifactId);
    },

    consumeArtifact(artifactId, now) {
      const artifact = artifacts.get(artifactId);
      if (artifact === undefined) {
        throw new PaymentMissionError(
          "AUTHORIZATION_REQUIRED",
          `No authorization artifact '${artifactId}' exists — artifacts are minted only by an explicit user act on a presented preview.`,
        );
      }
      if (artifact.consumedAt !== null) {
        throw new PaymentMissionError(
          "AUTHORIZATION_CONSUMED",
          `Authorization artifact '${artifactId}' was already consumed at ${artifact.consumedAt} — artifacts are single-use; a new preview and a new explicit approval are required.`,
        );
      }
      if (now >= artifact.expiresAt) {
        throw new PaymentMissionError(
          "AUTHORIZATION_EXPIRED",
          `Authorization artifact '${artifactId}' expired at ${artifact.expiresAt} — approval never outlives its scope.`,
        );
      }
      const consumed = Object.freeze({ ...artifact, consumedAt: now });
      artifacts.set(artifactId, consumed);
      return consumed;
    },

    exportState() {
      return Object.freeze({
        requests: Object.freeze([...requests.values()]),
        artifacts: Object.freeze([...artifacts.values()]),
      });
    },
  };
}
