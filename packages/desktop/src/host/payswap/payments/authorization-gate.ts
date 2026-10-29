/**
 * PaySwap Desktop (P13-C; P19-A, ADR-0012 D3) — the authorization gate
 * (ADR-0007 D7 core).
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
  /**
   * (P22-H, ADR-0016 D6 — the composite growth) The digest of the
   * presented MULTI-LEG corridor plan the approval covers, covering
   * EVERY leg. ADDITIVE + OPTIONAL: the N=1 scope carries neither
   * field byte-identically.
   */
  readonly planDigest?: string;
  /** (P22-H, D6) The authorized plan's leg count (the artifact's leg domain). */
  readonly planLegCount?: number;
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
  /**
   * (P22-H, ADR-0016 D6 — the composite growth) Present iff this is a
   * COMPOSITE artifact over a multi-leg corridor plan: the plan digest
   * (covering every leg) + the plan's leg count. The artifact's
   * single-use consumption is then per-leg SHARES (consumedLegs) —
   * consumedAt stamps the FIRST share; a leg outside [0, planLegCount)
   * never consumes (the D7 typed AUTHORIZATION_MISMATCH law).
   */
  readonly planDigest?: string;
  readonly planLegCount?: number;
  readonly consumedLegs?: readonly number[];
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

/**
 * One mission-scoped artifact snapshot (P19-A, ADR-0012 D3 — the
 * armed-effect READ view): the artifact's id + scope + lifetime facts
 * with the consumed/expired derivation computed against the read's
 * `now`. HOST-SIDE ONLY — the channel member projects this into the
 * armed card and NEVER lets the artifactId cross (the read never
 * bypasses the dispatch path's own enforcing checks; the expiry here
 * is the artifact's own mint+600s `expiresAt`, derived for display).
 */
export interface MissionAuthorizationArtifactSnapshot {
  readonly artifactId: string;
  readonly scope: PaymentAuthorizationScope;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly consumedAt: string | null;
  /** Derived at read time: true when `now` reached the artifact's expiresAt. */
  readonly expired: boolean;
}

/** The pure authorization gate (the LAW lives here). */
export interface PaymentAuthorizationGate {
  requestAuthorization(
    preview: PaymentPreviewRecord,
    scope: PaymentAuthorizationScope,
    now: string,
  ): PaymentAuthorizationRequest;
  resolveAuthorization(decision: PaymentAuthorizationDecision, now: string): AuthorizationResolution;
  artifact(artifactId: string): PaymentAuthorizationArtifact | undefined;
  /**
   * (P19-A, ADR-0012 D3) The mission-scoped armed lookup: the artifacts
   * bound to the mission's taskRef (`pmt-mission:<missionId>`), in mint
   * order, each with its consumed/expired derivation computed against
   * the read's `now`. A pure READ — it never consumes, never validates
   * the preview/digest binding (the dispatch path's own enforcing
   * checks stay UNCHANGED) and never mutates gate state.
   */
  artifactsForMission(missionId: string, now: string): readonly MissionAuthorizationArtifactSnapshot[];
  consumeArtifact(artifactId: string, now: string, legIndex?: number): PaymentAuthorizationArtifact;
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
        // (P22-H, ADR-0016 D6) The composite growth: an approval over a
        // presented MULTI-LEG plan mints the COMPOSITE artifact (the
        // planDigest covers every leg); the N=1 artifact carries neither
        // field byte-identically.
        ...(request.scope.planDigest !== undefined && request.scope.planLegCount !== undefined
          ? {
              planDigest: request.scope.planDigest,
              planLegCount: request.scope.planLegCount,
              consumedLegs: Object.freeze([]) as readonly number[],
            }
          : {}),
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

    artifactsForMission(missionId, now) {
      // MINT ORDER, derived from the id the gate itself mints
      // (`pmt-auth-<n>` — the counter is monotonic); the string
      // tiebreak keeps the order total even for restored state.
      const mintIndex = (artifactId: string): number => {
        const match = /^pmt-auth-(\d+)$/.exec(artifactId);
        return match === null ? Number.MAX_SAFE_INTEGER : Number(match[1]);
      };
      const taskRef = `pmt-mission:${missionId}`;
      return [...artifacts.values()]
        .filter((artifact) => artifact.taskRef === taskRef)
        .sort((a, b) =>
          mintIndex(a.artifactId) === mintIndex(b.artifactId)
            ? (a.artifactId < b.artifactId ? -1 : 1)
            : mintIndex(a.artifactId) - mintIndex(b.artifactId),
        )
        .map((artifact) => ({
          artifactId: artifact.artifactId,
          scope: { ...artifact.scope, amount: { ...artifact.scope.amount } },
          createdAt: artifact.createdAt,
          expiresAt: artifact.expiresAt,
          consumedAt: artifact.consumedAt,
          expired: now >= artifact.expiresAt,
        }));
    },

    consumeArtifact(artifactId, now, legIndex) {
      const artifact = artifacts.get(artifactId);
      if (artifact === undefined) {
        throw new PaymentMissionError(
          "AUTHORIZATION_REQUIRED",
          `No authorization artifact '${artifactId}' exists — artifacts are minted only by an explicit user act on a presented preview.`,
        );
      }
      if (now >= artifact.expiresAt) {
        throw new PaymentMissionError(
          "AUTHORIZATION_EXPIRED",
          `Authorization artifact '${artifactId}' expired at ${artifact.expiresAt} — approval never outlives its scope.`,
        );
      }
      // (P22-H, ADR-0016 D6 — the composite growth) The per-leg SHARE
      // law: a composite artifact is consumed leg-by-leg — consumedAt
      // stamps the FIRST share; a leg's share is single-use; a leg
      // outside the authorized plan NEVER consumes (the D7 typed
      // AUTHORIZATION_MISMATCH law — a leg outside the authorized plan
      // is never a dispatch). The N=1 artifact consumes exactly as
      // before (a leg-indexed consumption of an N=1 artifact — or a
      // planless consumption of a composite artifact — is a typed
      // mismatch, never a fallback).
      const composite = artifact.planDigest !== undefined && artifact.planLegCount !== undefined;
      if (legIndex !== undefined) {
        if (!composite) {
          throw new PaymentMissionError(
            "AUTHORIZATION_MISMATCH",
            `Authorization artifact '${artifactId}' is not a composite multi-leg artifact — a leg-indexed consumption requires an approval over a presented corridor plan`,
          );
        }
        if (
          typeof legIndex !== "number" ||
          !Number.isSafeInteger(legIndex) ||
          legIndex < 0 ||
          legIndex >= (artifact.planLegCount ?? 0)
        ) {
          throw new PaymentMissionError(
            "AUTHORIZATION_MISMATCH",
            `Corridor leg ${String(legIndex)} is outside the authorized plan (${String(artifact.planLegCount)} legs) — a leg outside the authorized plan is never a dispatch.`,
          );
        }
        const consumedLegs = artifact.consumedLegs ?? [];
        if (consumedLegs.includes(legIndex)) {
          throw new PaymentMissionError(
            "AUTHORIZATION_CONSUMED",
            `Authorization artifact '${artifactId}' already consumed its share for corridor leg ${String(legIndex)} at ${String(artifact.consumedAt)} — each leg's share is single-use; a fresh preview and a fresh explicit approval are required.`,
          );
        }
        const consumed = Object.freeze({
          ...artifact,
          consumedAt: artifact.consumedAt ?? now,
          consumedLegs: Object.freeze([...consumedLegs, legIndex]),
        });
        artifacts.set(artifactId, consumed);
        return consumed;
      }
      if (composite) {
        throw new PaymentMissionError(
          "AUTHORIZATION_MISMATCH",
          `Authorization artifact '${artifactId}' is a composite multi-leg artifact — it is consumed leg-by-leg through the corridor dispatch, never as one planless single consumption.`,
        );
      }
      if (artifact.consumedAt !== null) {
        throw new PaymentMissionError(
          "AUTHORIZATION_CONSUMED",
          `Authorization artifact '${artifactId}' was already consumed at ${artifact.consumedAt} — artifacts are single-use; a new preview and a new explicit approval are required.`,
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
