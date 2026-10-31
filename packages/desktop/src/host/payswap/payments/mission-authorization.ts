/**
 * PaySwap Desktop (P13-C; P19-A, ADR-0012 D3) — the preview +
 * AUTHORIZATION service, split from ./payment-mission-runtime.ts for the
 * ≤400-line file law: the structured preview presentation (gate chain +
 * compile + persistence) and the explicit scoped authorization round-trip
 * (the ONLY key that arms dispatch — a PREVIEW_UI_ACT decision mints a
 * single-use artifact; text/voice/NLP never authorizes), plus the
 * mission-scoped armed lookup (the gate's pure read).
 */

import { PaymentMissionError } from "./contracts.js";
import type { PaymentMissionRecord, PaymentIntakeCaptures } from "./contracts.js";
import type {
  AuthorizationResolution,
  MissionAuthorizationArtifactSnapshot,
  PaymentAuthorizationArtifact,
  PaymentAuthorizationDecision,
  PaymentAuthorizationRequest,
  PaymentAuthorizationScope,
} from "./authorization-gate.js";
import { runValidationGates, type PaymentGateEnvironment } from "./validation-gates.js";
import { compileMissionIntent } from "./intent-compiler.js";
import {
  composeCompensationPreview,
  composePaymentPreview,
  defaultPreviewDisplay,
} from "./preview.js";
import type { StoredPaymentPreview } from "./payment-mission-store.js";
import type { PinnedMoneyDisplayInput } from "../pins/index.js";
import type { PinnedQuoteTermsSource } from "../pins/index.js";
import { compiledIntentDigest } from "./mission-execution.js";
import type { PaymentMissionCore } from "./payment-mission-runtime.js";
import type { PaymentsStoreState } from "./payments-snapshot-format.js";

/** The preview + authorization service surface (composed into the runtime). */
export interface MissionAuthorizationService {
  presentPreview(
    missionId: string,
    env: PaymentGateEnvironment,
    input?: {
      readonly freshQuote?: PinnedQuoteTermsSource;
      readonly display?: PinnedMoneyDisplayInput;
      readonly compensationFor?: string;
    },
  ): Promise<StoredPaymentPreview>;
  requestAuthorization(
    missionId: string,
    now: string,
    /**
     * (P22-H, ADR-0016 D6 — the composite growth) The presented
     * MULTI-LEG corridor plan facts: when supplied, the authorization
     * scope carries the plan digest (covering every leg) + the leg
     * count — the approval authorizes the PLAN (the artifact mints as
     * the COMPOSITE artifact; the dispatch consumes it leg-by-leg).
     * ADDITIVE + OPTIONAL: the N=1 request carries no plan facts
     * byte-identically.
     */
    plan?: { readonly planDigest: string; readonly planLegCount: number },
  ): Promise<PaymentAuthorizationRequest>;
  resolveAuthorization(decision: PaymentAuthorizationDecision, now: string): Promise<AuthorizationResolution>;
  artifact(artifactId: string): Promise<PaymentAuthorizationArtifact | undefined>;
  /**
   * (P19-A, ADR-0012 D3) The mission-scoped armed lookup — the gate's
   * pure read (mint-ordered snapshots with the consumed/expired
   * derivation), for the armed-effect channel member's derivation.
   */
  artifactsForMission(
    missionId: string,
    now: string,
  ): Promise<readonly MissionAuthorizationArtifactSnapshot[]>;
}

export function createMissionAuthorizationService(core: PaymentMissionCore): MissionAuthorizationService {
  function requirePreview(state: PaymentsStoreState, missionId: string): StoredPaymentPreview {
    const mission = core.requireMission(state, missionId);
    if (mission.previewId === undefined) {
      throw new PaymentMissionError(
        "PREVIEW_REQUIRED",
        `Mission ${JSON.stringify(missionId)} has no presented preview — present the structured preview before requesting authorization`,
        { missionId },
      );
    }
    const preview = state.previews.find((candidate) => candidate.previewId === mission.previewId);
    if (preview === undefined) {
      throw new PaymentMissionError(
        "PREVIEW_REQUIRED",
        `The presented preview '${mission.previewId}' is not in the registry — present a fresh preview`,
        { missionId },
      );
    }
    return preview;
  }

  function authorizationScope(mission: PaymentMissionRecord, preview: StoredPaymentPreview): PaymentAuthorizationScope {
    if (mission.intent === undefined) {
      throw new PaymentMissionError(
        "GATES_BLOCKED",
        "The authorization scope requires the compiled intent — a mission without one can never arm authorization",
        { missionId: mission.id },
      );
    }
    return {
      missionId: mission.id,
      direction: mission.direction,
      amount: { ...mission.intent.originAmount },
      destinationSummary:
        preview.destination.status === "OBSERVED_REF"
          ? `observed destination (${preview.destination.displayName})`
          : "stated (unverified) destination",
      intentDigest: compiledIntentDigest(mission.intent),
    };
  }

  return {
    async presentPreview(missionId, env, input = {}) {
      const freshQuote = input.freshQuote;
      const display = input.display ?? defaultPreviewDisplay();
      let preview!: StoredPaymentPreview;
      await core.store.commit((state) => {
        const loaded = core.requireMission(state, missionId);
        let mission = loaded;
        if (input.compensationFor !== undefined) {
          // The compensation path is the ONE lawful terminal-mission
          // operation: a COMPLETED mission whose confirmed effect the
          // user asks to reverse (recorded in the same timeline; the
          // terminal status never rewrites — monotonic law).
          if (mission.status !== "COMPLETED") {
            throw new PaymentMissionError(
              "INVALID_TRANSITION",
              `A compensation preview requires a COMPLETED mission (status ${mission.status}) — reversal targets a confirmed effect`,
              { missionId },
            );
          }
        } else {
          mission = requireActive(mission);
        }
        const gates = runValidationGates(mission, env);
        let next = mission;
        if (input.compensationFor === undefined) {
          const compile = compileMissionIntent({
            missionId: mission.id,
            direction: mission.direction,
            captured: capturedFields(mission),
            principalRef: core.principalRef,
            observedFunding: gates.resolvedFunding,
            observedDestination: gates.resolvedDestination,
            declaredAt: env.now,
            expiresAt:
              freshQuote !== undefined
                ? freshQuote.expiry.at
                : capturedFields(mission).speedDeadline.deadlineAt,
          });
          if (compile.kind === "COMPILED" && mission.intent === undefined) {
            next = {
              ...core.appendEvent(
                mission,
                "VALIDATED",
                `Validation passed and the demand compiled to the canonical intent ${compile.intent.intentId}.`,
                env.now,
              ),
              intent: compile.intent,
              status: mission.status === "DRAFT" ? "ACTIVE" : mission.status,
            };
          }
          const previewId = `pmt-preview:${core.mintRandom()}`;
          preview = composePaymentPreview({ record: next, gates, freshQuote, display, now: env.now, previewId });
        } else {
          const previewId = `pmt-preview:${core.mintRandom()}`;
          preview = composeCompensationPreview({
            record: mission,
            reversalOfAttemptId: input.compensationFor,
            freshQuote,
            display,
            now: env.now,
            previewId,
          });
        }
        next = core.appendEvent(
          { ...next, previewId: preview.previewId },
          "PREVIEW_PRESENTED",
          preview.dispatchable
            ? `Structured preview presented (${preview.previewId})${input.compensationFor !== undefined ? " — compensation for a confirmed effect" : " — dispatchable"}; expires ${preview.expiresAt ?? "never (no quote bounds it)"}.`
            : `Structured preview presented (${preview.previewId}) — BLOCKED: ${preview.gates.reasons.join(" | ")}`,
          env.now,
        );
        return {
          ...state,
          missions: replaceMission(state.missions, next),
          previews: [...state.previews.filter((candidate) => candidate.previewId !== preview.previewId), preview],
        };
      });
      core.log(
        "info",
        `payswap-payments: preview presented ${preview.previewId} (dispatchable=${String(preview.dispatchable)})`,
      );
      return preview;
    },

    async requestAuthorization(missionId, now, plan) {
      const state = await core.store.load();
      const mission = requireActive(core.requireMission(state, missionId));
      const preview = requirePreview(state, missionId);
      const scope = authorizationScope(mission, preview);
      // (P22-H, ADR-0016 D6) The composite growth: the presented plan's
      // digest + leg count ride the scope (the artifact mints as the
      // COMPOSITE artifact — the approval authorizes the WHOLE plan).
      const compositeScope =
        plan !== undefined
          ? { ...scope, planDigest: plan.planDigest, planLegCount: plan.planLegCount }
          : scope;
      const gateBefore = core.getGate().exportState();
      let request: PaymentAuthorizationRequest;
      try {
        request = core.getGate().requestAuthorization(preview, compositeScope, now);
      } catch (error) {
        core.resetGate(gateBefore);
        throw error;
      }
      try {
        await core.store.commit((current) => ({ ...current, authorization: core.getGate().exportState() }));
      } catch (error) {
        core.resetGate(gateBefore);
        throw error;
      }
      core.log("info", `payswap-payments: authorization requested for mission ${missionId} (${request.requestId})`);
      return request;
    },

    async resolveAuthorization(decision, now) {
      const gateBefore = core.getGate().exportState();
      let resolution: AuthorizationResolution;
      try {
        resolution = core.getGate().resolveAuthorization(decision, now);
      } catch (error) {
        core.resetGate(gateBefore);
        throw error;
      }
      if (resolution.outcome.kind === "REJECTED") {
        // No mission event and no state change: a rejected text/voice/NLP
        // attempt is neither granted nor declined (documented boundary).
        core.log(
          "warn",
          `payswap-payments: authorization attempt REJECTED (non-UI origin) for mission ${resolution.missionId}`,
        );
        return resolution;
      }
      try {
        await core.store.commit((state) => {
          const mission = core.requireMission(state, resolution.missionId);
          const withEvent =
            resolution.outcome.kind === "GRANTED"
              ? core.appendEvent(
                  mission,
                  "AUTHORIZATION_GRANTED",
                  `Scoped approval granted on the presented preview (${resolution.outcome.artifact.previewId}) — single-use artifact ${resolution.outcome.artifact.artifactId} minted by an explicit user UI act.`,
                  now,
                  resolution.outcome.artifact.artifactId,
                )
              : core.appendEvent(mission, "AUTHORIZATION_DECLINED", resolution.outcome.reason, now);
          return {
            ...state,
            missions: replaceMission(state.missions, withEvent),
            authorization: core.getGate().exportState(),
          };
        });
      } catch (error) {
        core.resetGate(gateBefore);
        throw error;
      }
      return resolution;
    },

    async artifact(artifactId) {
      return core.getGate().artifact(artifactId);
    },

    async artifactsForMission(missionId, now) {
      return core.getGate().artifactsForMission(missionId, now);
    },
  };
}

function requireActive(mission: PaymentMissionRecord): PaymentMissionRecord {
  if (
    mission.status === "COMPLETED" ||
    mission.status === "FAILED" ||
    mission.status === "CANCELLED" ||
    mission.status === "EXPIRED"
  ) {
    throw new PaymentMissionError(
      "MISSION_TERMINAL",
      `Mission ${JSON.stringify(mission.id)} is terminal (${mission.status}) — terminal missions are monotonic`,
      { missionId: mission.id },
    );
  }
  if (mission.status === "PAUSED") {
    throw new PaymentMissionError(
      "INVALID_TRANSITION",
      `Mission ${JSON.stringify(mission.id)} is paused — resume it before intake, validation, preview or authorization`,
      { missionId: mission.id },
    );
  }
  return mission;
}

function capturedFields(mission: PaymentMissionRecord): PaymentIntakeCaptures {
  const fields = mission.fields;
  const missing = (Object.keys(fields) as (keyof PaymentIntakeCaptures)[]).filter(
    (field) => fields[field].status === "MISSING",
  );
  if (missing.length > 0) {
    throw new PaymentMissionError(
      "INTAKE_INCOMPLETE",
      `The intake is incomplete — missing: ${missing.join(", ")}`,
      { missionId: mission.id },
    );
  }
  const captured = {} as Record<string, unknown>;
  for (const field of Object.keys(fields) as (keyof PaymentIntakeCaptures)[]) {
    captured[field] = (fields[field] as { readonly value: unknown }).value;
  }
  return captured as unknown as PaymentIntakeCaptures;
}

function replaceMission(
  missions: readonly PaymentMissionRecord[],
  next: PaymentMissionRecord,
): readonly PaymentMissionRecord[] {
  return missions.map((mission) => (mission.id === next.id ? next : mission));
}
