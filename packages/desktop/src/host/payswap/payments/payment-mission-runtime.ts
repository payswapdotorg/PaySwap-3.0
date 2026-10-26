/**
 * PaySwap Desktop (P13-C) — the payment-mission runtime (the host-side
 * orchestrator of the canonical D7 path).
 *
 * THE LANE'S SERVICE: seeding with entrypoint CONVERGENCE (a Pay action
 * click and a Pay composer text resume the SAME in-window mission by
 * `payment:<direction>` — ADR-0007 D6), conversational intake that ASKS
 * and never guesses, validation against real state, structured preview
 * presentation, the authorization round-trip, pause/resume/expiry and
 * clean cancel — all durable under the store discipline, with the
 * consequential slice (dispatch/reconcile/interruption recovery)
 * implemented in ./payment-dispatch-runtime.ts over the SAME core.
 *
 * STATUS LAW (honest, monotonic terminals):
 * - DRAFT while intake is incomplete; ACTIVE once the demand compiled;
 * - COMPLETED exactly when a create-effect is CONFIRMED (by envelope or
 *   reconciliation evidence) — and a completed mission STAYS completed:
 *   a later compensation (reversal) is recorded in the same append-only
 *   timeline as a CANCEL_OR_REVERSE_EFFECT attempt (monotonic terminals,
 *   never a COMPLETED→CANCELLED rewrite of history);
 * - CANCELLED only when NO confirmed effect exists (clean cancel);
 * - EXPIRED only when the captured deadline / compiled window honestly
 *   passed and nothing is unresolved;
 * - FAILED is pinned vocabulary with no runtime path in this lane (a
 *   definitively failed attempt leaves the mission ACTIVE — the retry
 *   path stays open); AWAITING_EXTERNAL_RETURN is reserved for the
 *   zcode://payment/callback wiring (see the worklog's seam request).
 *
 * OTHER HONEST BOUNDARIES (stated by construction):
 * - PAUSED carries no dedicated event kind — the frozen shared
 *   vocabulary (TL-owned) has none; the status records the pause and
 *   the RESUMED event records the round-trip (a lane note for the TL,
 *   never an in-lane vocabulary edit);
 * - a rejected NLP authorization attempt records NO mission event (it
 *   is neither granted nor declined) — returned typed to the caller and
 *   logged host-side.
 */

import { createMissionLifecycleService } from "./mission-lifecycle.js";
import { createMissionAuthorizationService } from "./mission-authorization.js";
import {
  PAYMENT_PLAN_SELECTION_LIMITS,
  PaymentMissionError,
  type PaymentMissionDirection,
  type PaymentMissionEvent,
  type PaymentMissionPlanSelection,
  type PaymentMissionPlanSelectionInput,
  type PaymentMissionRecord,
  type PaymentTaskOrigin,
} from "./contracts.js";
import {
  captureIntakeField,
  recordIntakeAsk,
} from "./intake-machine.js";
import { runValidationGates, type PaymentGateAggregate, type PaymentGateEnvironment } from "./validation-gates.js";
import {
  createAuthorizationGate,
  type AuthorizationResolution,
  type MissionAuthorizationArtifactSnapshot,
  type PaymentAuthorizationArtifact,
  type PaymentAuthorizationGate,
  type PaymentAuthorizationGateState,
  type PaymentAuthorizationRequest,
  type PaymentAuthorizationDecision,
} from "./authorization-gate.js";
import type { PaymentMissionStore, PaymentsStoreHealthReport } from "./payment-mission-store.js";
import type { PaymentsStoreState, StoredPaymentPreview } from "./payments-snapshot-format.js";
import type { ExecutionAuthorityPort } from "./execution-authority.js";
import { createUnwiredExecutionAuthority } from "./execution-authority.js";
import { createPaymentDispatchSlice, type PaymentDispatchSlice } from "./payment-dispatch-runtime.js";
import type { PinnedMoneyDisplayInput, PinnedQuoteTermsSource } from "../pins/index.js";

/** The resume window (mirrors AGENT_TASK_RESUME_WINDOW_SECONDS). */
export const PAYMENT_MISSION_RESUME_WINDOW_SECONDS = 900;

/** The runtime's log shape (the host seam log discipline — never console). */
export type PaymentRuntimeLog = (level: "info" | "warn" | "error", message: string) => void;

/** Options for constructing the runtime. */
export interface PaymentMissionRuntimeOptions {
  /** The durable store (opened by the composition edge with injected fs). */
  readonly store: PaymentMissionStore;
  /**
   * The execution authority port. Defaults to the honest UNWIRED one —
   * the real kernel (execution-graph + provider transport) is composed
   * behind it at TL integration.
   */
  readonly executionAuthority?: ExecutionAuthorityPort;
  /**
   * The principal reference (opaque; the trust plane owns identity —
   * supplied by the composition edge in this deployment).
   */
  readonly principalRef: string;
  /** Crypto-random id material factory (32 lowercase hex chars; injectable for tests). */
  readonly mintRandom?: () => string;
  /** Host-seam log (never console; no secret material is ever logged). */
  readonly log?: PaymentRuntimeLog;
}

function defaultMintRandom(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The shared core (store + gate + mints), used by both runtime slices. */
export interface PaymentMissionCore {
  readonly store: PaymentMissionStore;
  readonly executionAuthority: ExecutionAuthorityPort;
  readonly principalRef: string;
  readonly mintRandom: () => string;
  readonly log: PaymentRuntimeLog;
  getGate(): PaymentAuthorizationGate;
  resetGate(state: PaymentAuthorizationGateState): void;
  /** Serialize consequential operations (one dispatch/recovery in flight at a time). */
  serialized<T>(operation: () => Promise<T>): Promise<T>;
  requireMission(state: PaymentsStoreState, missionId: string): PaymentMissionRecord;
  appendEvent(
    record: PaymentMissionRecord,
    kind: PaymentMissionEvent["kind"],
    summary: string,
    at: string,
    correlationRef?: string,
  ): PaymentMissionRecord;
}

/** The payment-mission runtime surface (the lane's host service). */
export interface PaymentMissionRuntime {
  /** Seed-or-resume with entrypoint convergence (D6: `payment:<direction>`). */
  seedMission(
    input: { readonly direction: PaymentMissionDirection; readonly goalStatement: string; readonly origin: PaymentTaskOrigin },
    now: string,
  ): Promise<{ readonly missionId: string; readonly action: "CREATED" | "RESUMED" }>;
  getMission(missionId: string): Promise<PaymentMissionRecord | null>;
  listMissions(): Promise<readonly PaymentMissionRecord[]>;
  /** Ask for the next missing field (deterministic order; null when intake is complete). */
  askNextMissingField(
    missionId: string,
    now: string,
  ): Promise<{ readonly fieldId: string; readonly question: string } | null>;
  captureField(
    missionId: string,
    fieldId: Parameters<typeof captureIntakeField>[1],
    value: unknown,
    now: string,
  ): Promise<PaymentMissionRecord>;
  /**
   * Record the stage-9a plan selection (P17-A, ADR-0010 D3): a RECORD,
   * never an authorization — the PLAN_SELECTION_RECORDED event appends
   * (the timeline is append-only) while the record's planSelection
   * field carries the LATEST selection (re-selection replaces the
   * field, never the history). The approval artifact is still minted
   * later, against the presented preview, by an explicit user UI act.
   */
  recordPlanSelection(
    missionId: string,
    input: PaymentMissionPlanSelectionInput,
    now: string,
  ): Promise<PaymentMissionRecord>;
  /** Run the six gates (pure read — no mutation; surfaces may render the aggregate). */
  runGates(missionId: string, env: PaymentGateEnvironment): Promise<PaymentGateAggregate>;
  /**
   * Present the structured preview (validation + compile + PREVIEW_PRESENTED,
   * persisted). With `compensationFor` (a confirmed attempt id) presents the
   * COMPENSATION preview on a COMPLETED mission (the safe-cancel path).
   */
  presentPreview(
    missionId: string,
    env: PaymentGateEnvironment,
    input?: {
      readonly freshQuote?: PinnedQuoteTermsSource;
      readonly display?: PinnedMoneyDisplayInput;
      readonly compensationFor?: string;
    },
  ): Promise<StoredPaymentPreview>;
  /** Mint a pending authorization request bound to the CURRENT presented preview. */
  requestAuthorization(missionId: string, now: string): Promise<PaymentAuthorizationRequest>;
  /** Resolve a request (ONLY a PREVIEW_UI_ACT origin can decide). */
  resolveAuthorization(decision: PaymentAuthorizationDecision, now: string): Promise<AuthorizationResolution>;
  artifact(artifactId: string): Promise<PaymentAuthorizationArtifact | undefined>;
  /**
   * (P19-A, ADR-0012 D3) The mission-scoped armed lookup (mint-ordered
   * snapshots with the consumed/expired derivation) — the read surface
   * the armed-effect channel member derives over. A pure read: the
   * dispatch path's own enforcing checks stay UNCHANGED.
   */
  artifactsForMission(
    missionId: string,
    now: string,
  ): Promise<readonly MissionAuthorizationArtifactSnapshot[]>;
  pause(missionId: string, now: string): Promise<PaymentMissionRecord>;
  resume(missionId: string, now: string): Promise<PaymentMissionRecord>;
  /** Clean cancel — only when NO confirmed effect exists (compensation is the completed-mission path). */
  cancelMission(missionId: string, now: string): Promise<{ readonly kind: "CANCELLED" }>;
  /** Expire a mission whose demand window has honestly passed (the captured deadline). */
  expireMission(missionId: string, now: string): Promise<PaymentMissionRecord>;
  /** The consequential slice (dispatch / reconcile / interruption recovery). */
  dispatch: PaymentDispatchSlice;
  health(): Promise<PaymentsStoreHealthReport>;
}

function isTerminalStatus(status: PaymentMissionRecord["status"]): boolean {
  return status === "COMPLETED" || status === "FAILED" || status === "CANCELLED" || status === "EXPIRED";
}

function requireNonTerminal(mission: PaymentMissionRecord): PaymentMissionRecord {
  if (isTerminalStatus(mission.status)) {
    throw new PaymentMissionError(
      "MISSION_TERMINAL",
      `Mission ${JSON.stringify(mission.id)} is terminal (${mission.status}) — terminal missions are monotonic`,
      { missionId: mission.id },
    );
  }
  return mission;
}

function requireActive(mission: PaymentMissionRecord): PaymentMissionRecord {
  requireNonTerminal(mission);
  if (mission.status === "PAUSED") {
    throw new PaymentMissionError(
      "INVALID_TRANSITION",
      `Mission ${JSON.stringify(mission.id)} is paused — resume it before intake, validation, preview or authorization`,
      { missionId: mission.id },
    );
  }
  return mission;
}


function replaceMission(
  missions: readonly PaymentMissionRecord[],
  next: PaymentMissionRecord,
): readonly PaymentMissionRecord[] {
  return missions.map((mission) => (mission.id === next.id ? next : mission));
}

/**
 * Create the payment-mission runtime. The composition edge (TL
 * integration) opens the store with the injected node:fs under the
 * PaySwap user-data directory and calls `dispatch.recoverInterruptions`
 * once at composition, before any dispatch.
 */
export function createPaymentMissionRuntime(
  options: PaymentMissionRuntimeOptions,
): PaymentMissionRuntime {
  const log: PaymentRuntimeLog = options.log ?? (() => {});
  const mintRandom = options.mintRandom ?? defaultMintRandom;
  let gate = createAuthorizationGate();
  let chain: Promise<unknown> = Promise.resolve();

  const core: PaymentMissionCore = {
    store: options.store,
    executionAuthority: options.executionAuthority ?? createUnwiredExecutionAuthority(),
    principalRef: options.principalRef,
    mintRandom,
    log,
    getGate: () => gate,
    resetGate(state) {
      gate = createAuthorizationGate(state);
    },
    serialized<T>(operation: () => Promise<T>): Promise<T> {
      const run = chain.then(operation, operation);
      chain = run.catch(() => undefined);
      return run;
    },
    requireMission(state, missionId) {
      const mission = state.missions.find((candidate) => candidate.id === missionId);
      if (mission === undefined) {
        throw new PaymentMissionError("MISSION_NOT_FOUND", `No payment mission '${missionId}' exists`, {
          missionId,
        });
      }
      return mission;
    },
    appendEvent(record, kind, summary, at, correlationRef) {
      const event: PaymentMissionEvent = {
        id: `${record.id}-ev-${String(record.events.length + 1)}`,
        at,
        kind,
        summary,
        ...(correlationRef !== undefined ? { correlationRef } : {}),
      };
      return { ...record, events: [event, ...record.events], updatedAt: at };
    },
  };

  // Restore the authorization gate from the persisted snapshot (the
  // approval round-trip survives restarts: pending requests and minted
  // artifacts reload with their expiry + single-use state intact).
  void options.store
    .load()
    .then((state) => {
      gate = createAuthorizationGate(state.authorization);
    })
    .catch(() => undefined);



  const lifecycle = createMissionLifecycleService(core);
  const authorization = createMissionAuthorizationService(core);

  const runtime: PaymentMissionRuntime = {
    seedMission: (input, now) => lifecycle.seedMission(input, now),
    pause: (missionId, now) => lifecycle.pause(missionId, now),
    resume: (missionId, now) => lifecycle.resume(missionId, now),
    cancelMission: (missionId, now) => lifecycle.cancelMission(missionId, now),
    expireMission: (missionId, now) => lifecycle.expireMission(missionId, now),
    presentPreview: (missionId, env, input) => authorization.presentPreview(missionId, env, input),
    requestAuthorization: (missionId, now) => authorization.requestAuthorization(missionId, now),
    resolveAuthorization: (decision, now) => authorization.resolveAuthorization(decision, now),
    artifact: (artifactId) => authorization.artifact(artifactId),
    artifactsForMission: (missionId, now) => authorization.artifactsForMission(missionId, now),
    dispatch: createPaymentDispatchSlice(core),

    async getMission(missionId) {
      const state = await options.store.load();
      return state.missions.find((mission) => mission.id === missionId) ?? null;
    },

    async listMissions() {
      const state = await options.store.load();
      return state.missions;
    },

    async askNextMissingField(missionId, now) {
      let ask: { fieldId: string; question: string } | null = null;
      await options.store.commit((state) => {
        const mission = requireActive(core.requireMission(state, missionId));
        const outcome = recordIntakeAsk(mission, now);
        ask = outcome.ask;
        return outcome.ask === null ? state : { ...state, missions: replaceMission(state.missions, outcome.record) };
      });
      return ask;
    },

    async captureField(missionId, fieldId, value, now) {
      let updated!: PaymentMissionRecord;
      await options.store.commit((state) => {
        const mission = requireActive(core.requireMission(state, missionId));
        updated = captureIntakeField(mission, fieldId, value as never, now);
        return { ...state, missions: replaceMission(state.missions, updated) };
      });
      return updated;
    },

    async recordPlanSelection(missionId, input, now) {
      if (typeof now !== "string" || Number.isNaN(Date.parse(now))) {
        throw new PaymentMissionError("INVALID_FIELD_VALUE", "now must be an ISO-8601 UTC instant");
      }
      const limits = PAYMENT_PLAN_SELECTION_LIMITS;
      for (const field of ["planId", "viewDigest", "routineId", "routineVersion"] as const) {
        const value = input[field];
        const limit = limits[field];
        if (typeof value !== "string" || value.trim().length === 0 || value.length > limit) {
          throw new PaymentMissionError(
            "INVALID_FIELD_VALUE",
            `plan selection ${field} must be a non-empty string of at most ${String(limit)} characters (bounded, never trimmed)`,
            { missionId },
          );
        }
      }
      let updated!: PaymentMissionRecord;
      await options.store.commit((state) => {
        const mission = requireActive(core.requireMission(state, missionId));
        const selection: PaymentMissionPlanSelection = { ...input, selectedAt: now };
        const withEvent = core.appendEvent(
          mission,
          "PLAN_SELECTION_RECORDED",
          `Plan ${input.planId} selected from the ${input.routineId} routine (v${input.routineVersion}, view digest ${input.viewDigest}) — a RECORD only, never an authorization: the scoped approval artifact is minted later, against the presented preview, by an explicit user UI act.`,
          now,
        );
        updated = { ...withEvent, planSelection: selection };
        return { ...state, missions: replaceMission(state.missions, updated) };
      });
      core.log(
        "info",
        `payswap-payments: plan selection recorded for mission ${missionId} (${input.planId}) — record only, never an authorization`,
      );
      return updated;
    },

    async runGates(missionId, env) {
      const state = await options.store.load();
      return runValidationGates(core.requireMission(state, missionId), env);
    },


    async health() {
      return options.store.health();
    },
  };
  return runtime;
}
