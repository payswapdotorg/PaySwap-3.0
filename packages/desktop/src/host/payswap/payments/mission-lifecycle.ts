/**
 * PaySwap Desktop (P13-C) — the mission LIFECYCLE service, split from
 * ./payment-mission-runtime.ts for the ≤400-line file law: seed
 * (create-or-resume convergence, D6), pause/resume, clean cancel and
 * honest expiry — the orchestration states of the demand-side record
 * (zero financial authority: none of these verbs moves money).
 */

import {
  PAYMENT_MISSION_DIRECTIONS,
  PAYMENT_TASK_VOICE_UNSUPPORTED_STATEMENT,
  PaymentMissionError,
  SUPPORTED_PAYMENT_TASK_ORIGINS,
  type PaymentMissionDirection,
  type PaymentMissionRecord,
  type PaymentTaskOrigin,
} from "./contracts.js";
import { initialIntakeFieldStates } from "./intake-machine.js";
import { missionHasUnresolvedAttempt } from "./mission-execution.js";
import { PAYMENT_MISSION_RESUME_WINDOW_SECONDS, type PaymentMissionCore } from "./payment-mission-runtime.js";

/** The lifecycle service surface (composed into the runtime). */
export interface MissionLifecycleService {
  seedMission(
    input: { readonly direction: PaymentMissionDirection; readonly goalStatement: string; readonly origin: PaymentTaskOrigin },
    now: string,
  ): Promise<{ readonly missionId: string; readonly action: "CREATED" | "RESUMED" }>;
  pause(missionId: string, now: string): Promise<PaymentMissionRecord>;
  resume(missionId: string, now: string): Promise<PaymentMissionRecord>;
  cancelMission(missionId: string, now: string): Promise<{ readonly kind: "CANCELLED" }>;
  expireMission(missionId: string, now: string): Promise<PaymentMissionRecord>;
}

export function createMissionLifecycleService(core: PaymentMissionCore): MissionLifecycleService {
  return {
    async seedMission(input, now) {
      if (!(PAYMENT_MISSION_DIRECTIONS as readonly string[]).includes(input.direction)) {
        throw new PaymentMissionError("INVALID_FIELD_VALUE", "direction must be PAY/RECEIVE/MOVE/CONVERT");
      }
      if (typeof input.goalStatement !== "string" || input.goalStatement.trim().length === 0 || input.goalStatement.length > 2000) {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          "goalStatement must be a non-empty string of at most 2000 characters",
        );
      }
      if (!(SUPPORTED_PAYMENT_TASK_ORIGINS as readonly string[]).includes(input.origin)) {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          `origin '${input.origin}' is declared-unsupported in this deployment. ${PAYMENT_TASK_VOICE_UNSUPPORTED_STATEMENT}`,
        );
      }
      let result!: { missionId: string; action: "CREATED" | "RESUMED" };
      await core.store.commit((state) => {
        const nowMs = Date.parse(now);
        if (Number.isNaN(nowMs)) {
          throw new PaymentMissionError("INVALID_FIELD_VALUE", "now must be an ISO-8601 UTC instant");
        }
        const resumable = state.missions.find((mission) => {
          if (mission.direction !== input.direction) return false;
          if (isTerminalMissionStatus(mission.status)) return false;
          const ageSeconds = (nowMs - Date.parse(mission.updatedAt)) / 1000;
          return ageSeconds >= 0 && ageSeconds <= PAYMENT_MISSION_RESUME_WINDOW_SECONDS;
        });
        if (resumable !== undefined) {
          result = { missionId: resumable.id, action: "RESUMED" };
          return {
            ...state,
            missions: state.missions.map((mission) =>
              mission.id === resumable.id
                ? core.appendEvent(
                    mission.status === "PAUSED"
                      ? { ...mission, status: mission.resumeFrom }
                      : mission,
                    "RESUMED",
                    `Mission resumed (${input.origin} entrypoint converged on the in-window mission for direction ${input.direction}).`,
                    now,
                  )
                : mission,
            ),
          };
        }
        const id = `task:PAYMENT_MISSION:${core.mintRandom()}`;
        const created: PaymentMissionRecord = {
          id,
          direction: input.direction,
          goalStatement: input.goalStatement,
          origin: input.origin,
          createdAt: now,
          updatedAt: now,
          status: "DRAFT",
          resumeFrom: "DRAFT",
          events: [],
          fields: initialIntakeFieldStates(),
          attempts: [],
        };
        result = { missionId: id, action: "CREATED" };
        const withEvent = core.appendEvent(
          created,
          "CREATED",
          `Payment mission created (${input.origin}) — goal: ${input.goalStatement}`,
          now,
        );
        return { ...state, missions: [...state.missions, withEvent] };
      });
      core.log("info", `payswap-payments: mission seeded (${result.action}) ${result.missionId}`);
      return result;
    },
    async pause(missionId, now) {
      let updated!: PaymentMissionRecord;
      await core.store.commit((state) => {
        const mission = requireNonTerminalMission(core.requireMission(state, missionId));
        if (mission.status === "PAUSED") {
          updated = mission;
          return state;
        }
        updated = { ...mission, status: "PAUSED", resumeFrom: mission.status, updatedAt: now };
        return { ...state, missions: replaceMission(state.missions, updated) };
      });
      return updated;
    },

    async resume(missionId, now) {
      let updated!: PaymentMissionRecord;
      await core.store.commit((state) => {
        const mission = core.requireMission(state, missionId);
        if (mission.status !== "PAUSED") {
          throw new PaymentMissionError(
            "INVALID_TRANSITION",
            `Mission ${JSON.stringify(missionId)} is not paused (status ${mission.status}) — only a paused mission resumes`,
            { missionId },
          );
        }
        updated = core.appendEvent(
          { ...mission, status: mission.resumeFrom, resumeFrom: "DRAFT" },
          "RESUMED",
          `Mission resumed from PAUSED back to ${mission.resumeFrom}.`,
          now,
        );
        return { ...state, missions: replaceMission(state.missions, updated) };
      });
      return updated;
    },

    async cancelMission(missionId, now) {
      await core.store.commit((state) => {
        const mission = core.requireMission(state, missionId);
        if (isTerminalMissionStatus(mission.status)) {
          throw new PaymentMissionError(
            "MISSION_TERMINAL",
            mission.status === "COMPLETED"
              ? "The mission is COMPLETED — a confirmed effect cannot be cancelled; compensation (a recorded reversal attempt) is the path"
              : `Mission ${JSON.stringify(missionId)} is terminal (${mission.status}) — terminal missions are monotonic`,
            { missionId, reasons: [mission.status] },
          );
        }
        if (missionHasUnresolvedAttempt(mission)) {
          throw new PaymentMissionError(
            "RETRY_BLOCKED_UNKNOWN",
            `Mission ${JSON.stringify(missionId)} has an unresolved (UNKNOWN or never-answered) attempt — reconcile before cancelling; an ambiguous effect cannot be blindly cancelled`,
            { missionId },
          );
        }
        const cancelled = core.appendEvent(
          { ...mission, status: "CANCELLED" },
          "CANCELLED",
          "Mission cancelled — no confirmed external effect exists, so nothing needs compensation.",
          now,
        );
        return { ...state, missions: replaceMission(state.missions, cancelled) };
      });
      return { kind: "CANCELLED" } as const;
    },

    async expireMission(missionId, now) {
      let updated!: PaymentMissionRecord;
      await core.store.commit((state) => {
        const mission = requireNonTerminalMission(core.requireMission(state, missionId));
        if (missionHasUnresolvedAttempt(mission)) {
          throw new PaymentMissionError(
            "RETRY_BLOCKED_UNKNOWN",
            `Mission ${JSON.stringify(missionId)} has an unresolved attempt — reconcile before expiring`,
            { missionId },
          );
        }
        const deadline = mission.fields.speedDeadline;
        const deadlineAt = deadline.status === "CAPTURED" ? deadline.value.deadlineAt : undefined;
        const intentExpiryMs = mission.intent !== undefined ? mission.intent.expiresAt : undefined;
        const deadlinePassed = deadlineAt !== undefined && now >= deadlineAt;
        const intentExpired = intentExpiryMs !== undefined && Date.parse(now) >= intentExpiryMs;
        if (!deadlinePassed && !intentExpired) {
          throw new PaymentMissionError(
            "INVALID_TRANSITION",
            `Mission ${JSON.stringify(missionId)} has not honestly expired — the captured deadline (${deadlineAt ?? "not captured"}) has not passed and the compiled intent window is open`,
            { missionId },
          );
        }
        updated = core.appendEvent(
          { ...mission, status: "EXPIRED" },
          "EXPIRED",
          "Mission expired — the demand window (the captured deadline) has passed.",
          now,
        );
        return { ...state, missions: replaceMission(state.missions, updated) };
      });
      return updated;
    },

  };
}

/** Terminal mission statuses (monotonic — no exits). */
function isTerminalMissionStatus(status: PaymentMissionRecord["status"]): boolean {
  return status === "COMPLETED" || status === "FAILED" || status === "CANCELLED" || status === "EXPIRED";
}

function requireNonTerminalMission(mission: PaymentMissionRecord): PaymentMissionRecord {
  if (isTerminalMissionStatus(mission.status)) {
    throw new PaymentMissionError(
      "MISSION_TERMINAL",
      `Mission ${JSON.stringify(mission.id)} is terminal (${mission.status}) — terminal missions are monotonic`,
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
