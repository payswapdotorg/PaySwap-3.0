/**
 * @payswap/app — the PRODUCT TASK-COMPLETION PROJECTION (P21-D Gap B,
 * ADR-0014 D3/D8).
 *
 * THE LAW: when a payment mission reaches COMPLETED with a create-effect
 * attempt CONFIRMED through the execution authority, the PRODUCT projects
 * the linked agent task to COMPLETED with the ATTEMPT_CONFIRMED event
 * through the PUBLIC session port — driven by the product's own
 * mission-state observation, never by a test or a manual caller. (The
 * named gap in the accepted bridge battery,
 * packages/desktop/test/payswap/p21-journey-bridge.test.ts, where the
 * TEST drove updateTaskStatus by hand.)
 *
 * THE WIRING CHOICE (surveyed, then decided — documented per the work
 * order): a MOUNT-SIDE HOOK. The P18-B law names PaymentMissionsMount
 * the owner of every port call on the missions surface, and the mount's
 * own observation paths are exactly where the product re-reads the
 * mission detail after every dispatch/reconcile outcome (refreshDetail)
 * and on every detail load (openMission). The composition that renders
 * the mount in BOTH shipped products is PaySwapAgentExperience
 * (in-package; rendered by the web and desktop hosts' main.tsx), which
 * owns the composer's ONE task-session port (controller.sessionPort())
 * and the live mission-intake link — so the projection composes with
 * ZERO host-side changes: no desktop/renderer edits, no new shared
 * bindings, no barrel growth. An absent session seam = the projection is
 * not composed in that deployment — an honest no-op, never a fabricated
 * task session.
 *
 * THE PROJECTION LAWS:
 * - PROJECT only when mission.status === "COMPLETED" AND at least one
 *   attempt carries outcome "CONFIRMED" AND the linked task exists AND
 *   its status is NOT terminal (COMPLETED/FAILED/CANCELLED/EXPIRED —
 *   the pinned monotonic-terminal vocabulary). Then EXACTLY ONE
 *   updateTaskStatus(taskId, "COMPLETED", "ATTEMPT_CONFIRMED", now,
 *   summary) with correlationRef = missionId — the people-language
 *   summary VERBATIM from the accepted bridge battery.
 * - IDEMPOTENT BY CHECK-FIRST (never catch-and-swallow): a second
 *   observation of the same completed mission sees the task terminal
 *   and is a NO_PROJECTION — the monotonic-terminal law is never
 *   tripped, never relied upon.
 * - THE LINK: primary = the composer session's live mission-intake link
 *   ({missionId, taskId} — the binding's in-memory state); fallback =
 *   the PERSISTED correlation scan (the task whose events carry
 *   correlationRef === missionId — the mission-intake binding's own
 *   persisted link, re-derivable after reload). An ambiguous live link
 *   (several non-terminal candidates) resolves to null — never a
 *   guessed task.
 * - THE CLOCK: explicit injection at the driver seam (default: the
 *   package's ONE pinned ambient site — the ambientMutationClock
 *   pattern shared with the composer controller and the mission-intake
 *   binding; never ambient inside the pure core, never a displayed
 *   value).
 * - ZERO FINANCIAL AUTHORITY: the projection RECORDS the mission's
 *   authority events on the demand-side task record — it never
 *   dispatches, authorizes, reconciles or observes a provider.
 */

import { useCallback } from "react";
import { ambientMutationClock } from "../console/useWorkspaceStore.js";
import { isTerminalAgentTaskStatusPin, type AgentTaskPin } from "../lib/agent-task-pins.js";
import type { PaymentMissionsDetail } from "./paymentMissionsPins.js";
import type { AgentTaskSessionPort } from "./taskSessionPort.js";

/** The session-port seam the mount consumes (re-exported so the mount binds ONE module for the projection). */
export type { AgentTaskSessionPort } from "./taskSessionPort.js";

/* ---------------------- the pinned people language ---------------------- */

/**
 * The projection's event summary — the bridge battery's own people-language
 * phrasing, VERBATIM (the journey's session record speaks the same language
 * the accepted journey spoke).
 */
export const MISSION_COMPLETION_PROJECTION_SUMMARY =
  "The mission's dispatch attempt confirmed through the execution authority — the task completes with the mission." as const;

/* ---------------------------- the decision ---------------------------- */

/** The honest no-projection reasons (typed — the caller can disclose them). */
export const MISSION_COMPLETION_NO_PROJECTION_REASONS = Object.freeze([
  "MISSION_NOT_COMPLETED",
  "NO_CONFIRMED_ATTEMPT",
  "NO_LINKED_TASK",
  "TASK_ALREADY_TERMINAL",
] as const);
export type MissionCompletionNoProjectionReason =
  (typeof MISSION_COMPLETION_NO_PROJECTION_REASONS)[number];

/** The one mutation the law permits (fully descriptive — the caller executes it verbatim). */
export interface MissionCompletionProjectionPlan {
  readonly kind: "PROJECT";
  readonly taskId: string;
  readonly missionId: string;
  readonly toStatus: "COMPLETED";
  readonly eventKind: "ATTEMPT_CONFIRMED";
  readonly summary: typeof MISSION_COMPLETION_PROJECTION_SUMMARY;
  /** The persisted mission↔task link (correlationRef = missionId). */
  readonly correlationRef: string;
}

export type MissionCompletionDecision =
  | MissionCompletionProjectionPlan
  | { readonly kind: "NO_PROJECTION"; readonly reason: MissionCompletionNoProjectionReason };

/**
 * The PURE decision core: same mission detail + linked task, same decision,
 * forever. Every gate is check-first (the idempotence law) and every
 * refusal is typed (never a guessed projection, never a terminal-escape).
 */
export function projectMissionCompletion(
  detail: PaymentMissionsDetail,
  task: AgentTaskPin | null,
): MissionCompletionDecision {
  if (detail.status !== "COMPLETED") {
    return { kind: "NO_PROJECTION", reason: "MISSION_NOT_COMPLETED" };
  }
  if (!(detail.attempts ?? []).some((attempt) => attempt.outcome === "CONFIRMED")) {
    return { kind: "NO_PROJECTION", reason: "NO_CONFIRMED_ATTEMPT" };
  }
  if (task === null) {
    return { kind: "NO_PROJECTION", reason: "NO_LINKED_TASK" };
  }
  if (isTerminalAgentTaskStatusPin(task.status)) {
    return { kind: "NO_PROJECTION", reason: "TASK_ALREADY_TERMINAL" };
  }
  return {
    kind: "PROJECT",
    taskId: task.id,
    missionId: detail.id,
    toStatus: "COMPLETED",
    eventKind: "ATTEMPT_CONFIRMED",
    summary: MISSION_COMPLETION_PROJECTION_SUMMARY,
    correlationRef: detail.id,
  };
}

/* ------------------------- the link resolution ------------------------- */

/** The composer session's live mission↔task link (the mission-intake binding's in-memory state). */
export interface MissionTaskLiveLink {
  readonly missionId: string;
  readonly taskId: string;
}

/** The link lookup the driver injects (testable; no ambient state). */
export type MissionTaskLinkLookup = (missionId: string) => Promise<AgentTaskPin | null>;

/**
 * The PERSISTED correlation scan: the task whose events carry
 * correlationRef = missionId (the mission-intake binding's own writes —
 * the journey's session record). Several candidates can only mean a
 * re-seeded journey after a terminal task or a contract violation: the
 * unique NON-TERMINAL match is THE task (only a non-terminal task can
 * receive the projection); an all-terminal set falls to the first (the
 * decision then no-ops with the honest TASK_ALREADY_TERMINAL reason);
 * several live matches are an AMBIGUOUS link — null, never a guess.
 */
export function createPersistedMissionTaskLinkLookup(
  session: AgentTaskSessionPort,
): MissionTaskLinkLookup {
  return async (missionId) => {
    const linked = (await session.listTasks()).filter((task) =>
      task.events.some((event) => event.correlationRef === missionId),
    );
    if (linked.length <= 1) {
      return linked[0] ?? null;
    }
    const live = linked.filter((task) => !isTerminalAgentTaskStatusPin(task.status));
    if (live.length === 1) {
      return live[0]!;
    }
    return live.length === 0 ? linked[0]! : null;
  };
}

/**
 * The composed lookup: the composer session's LIVE link first (exact,
 * in-memory, no scan), the persisted correlation scan as the fallback
 * (the reload path — a fresh composition over the same store). A live
 * link naming another mission, or whose task no longer exists, falls
 * back honestly.
 */
export function createMissionTaskLinkLookup(parts: {
  readonly session: AgentTaskSessionPort;
  readonly liveLink?: () => MissionTaskLiveLink | null;
}): MissionTaskLinkLookup {
  const persisted = createPersistedMissionTaskLinkLookup(parts.session);
  const liveLink = parts.liveLink;
  if (liveLink === undefined) {
    return persisted;
  }
  return async (missionId) => {
    const live = liveLink();
    if (live !== null && live.missionId === missionId) {
      const task = await parts.session.taskDetail(live.taskId);
      if (task !== null) {
        return task;
      }
    }
    return persisted(missionId);
  };
}

/* ------------------------------ the driver ------------------------------ */

export interface MissionCompletionProjectionOptions {
  /** The composer's ONE task-session port (the public session port — the only mutation surface). */
  readonly session: AgentTaskSessionPort;
  /** The mission↔task link lookup (injected — testable, no ambient state). */
  readonly resolveLinkedTask: MissionTaskLinkLookup;
  /** The mutation clock — ISO-8601 UTC instants (explicit injection). */
  readonly clock: () => string;
}

export type MissionCompletionProjectionOutcome =
  | { readonly kind: "PROJECTED"; readonly taskId: string; readonly missionId: string }
  | { readonly kind: "NO_PROJECTION"; readonly reason: MissionCompletionNoProjectionReason };

export interface MissionCompletionProjection {
  /** Observe one mission detail: project the linked task when — and only when — the law holds. */
  observeDetail(detail: PaymentMissionsDetail): Promise<MissionCompletionProjectionOutcome>;
}

/**
 * Create the projection driver. Resolves the link, decides purely, and
 * fires EXACTLY ONE updateTaskStatus when the decision is PROJECT — a
 * typed port failure propagates to the caller (never swallowed here).
 */
export function createMissionCompletionProjection(
  options: MissionCompletionProjectionOptions,
): MissionCompletionProjection {
  return {
    async observeDetail(detail) {
      const task = await options.resolveLinkedTask(detail.id);
      const plan = projectMissionCompletion(detail, task);
      if (plan.kind === "NO_PROJECTION") {
        return { kind: "NO_PROJECTION", reason: plan.reason };
      }
      await options.session.updateTaskStatus(
        plan.taskId,
        plan.toStatus,
        plan.eventKind,
        options.clock(),
        plan.summary,
        plan.correlationRef,
      );
      return { kind: "PROJECTED", taskId: plan.taskId, missionId: plan.missionId };
    },
  };
}

/* --------------------------- the mount wiring --------------------------- */

function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/**
 * The mount-side wiring seam (the usePaymentMissionsDispatchFlow pattern):
 * returns the observe function the mount calls on its own mission-detail
 * observation paths. An absent session = the projection is not composed in
 * this deployment — every observation is an honest no-op (the missions
 * surface keeps working; the task record stays untouched). A typed failure
 * (a store refusal, a raced terminal) surfaces on the mount's honest
 * flow-error line — never masked, and never cleared here (the flows that
 * own that line clear it at their act starts).
 *
 * The mutation instant defaults to the package's ONE pinned ambient clock
 * site (the ambientMutationClock pattern — it supplies the port's explicit
 * `now` argument only, never a displayed value).
 */
export function useMissionCompletionProjection(
  session: AgentTaskSessionPort | undefined,
  liveLink: (() => MissionTaskLiveLink | null) | undefined,
  onFlowError: (message: string) => void,
): (detail: PaymentMissionsDetail) => void {
  return useCallback(
    (detail: PaymentMissionsDetail): void => {
      if (session === undefined) {
        return;
      }
      const projection = createMissionCompletionProjection({
        session,
        resolveLinkedTask: createMissionTaskLinkLookup({ session, liveLink }),
        clock: ambientMutationClock,
      });
      void projection.observeDetail(detail).catch((thrown: unknown) => {
        onFlowError(
          `the mission's task completion could not be projected: ${messageOf(thrown)}`,
        );
      });
    },
    [session, liveLink, onFlowError],
  );
}
