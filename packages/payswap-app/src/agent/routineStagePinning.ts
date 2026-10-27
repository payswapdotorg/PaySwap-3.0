/**
 * @payswap/app — the ROUTINE PIN recorder (P21-B, ADR-0014 D3).
 *
 * Stage 0's typed result: the ROUTINE_PINNED task event (routineId +
 * version + skill digest) that lands in the app task store when the
 * routine loads. THE PERSISTENCE LAW: the pin is recorded EXACTLY ONCE
 * per task — an identical re-pin over the re-read record is a no-op
 * (ALREADY_PINNED; the reload re-derives the same pin), and a DRIFTED
 * re-pin (a different routine id, version or skill digest) is a typed
 * error, never a silent re-write (the append-only timeline + the
 * pinned-facts law).
 *
 * ZERO FINANCIAL AUTHORITY: the recorder appends one orchestration
 * event; it never dispatches, authorizes or observes.
 */

import type { RoutePlanningRoutinePin } from "./routePlanningPins.js";
import type { AgentTaskSessionPort } from "./taskSessionPort.js";

/** The ROUTINE_PINNED event summary prefix (the parse anchor). */
export const ROUTINE_PIN_SUMMARY_PREFIX = "Routine pinned: " as const;

/** The typed drift failure (a drifted routine never silently re-pins). */
export class RoutinePinDriftError extends Error {
  readonly code = "ROUTINE_PIN_DRIFT" as const;
  constructor(message: string) {
    super(message);
    this.name = "RoutinePinDriftError";
  }
}

/** The deterministic pin summary (identical routine → identical text). */
export function routinePinSummary(routine: RoutePlanningRoutinePin): string {
  return `${ROUTINE_PIN_SUMMARY_PREFIX}${routine.routineId} v${routine.routineVersion} · skill digest ${routine.skillContentDigest}`;
}

/** Parse the pinned facts back from a recorded pin summary (null when absent/malformed). */
export function parseRoutinePinSummary(summary: string): RoutePlanningRoutinePin | null {
  if (!summary.startsWith(ROUTINE_PIN_SUMMARY_PREFIX)) {
    return null;
  }
  const rest = summary.slice(ROUTINE_PIN_SUMMARY_PREFIX.length);
  const match = /^(.+) v([^ ]+) · skill digest (.+)$/.exec(rest);
  if (match === null) {
    return null;
  }
  return {
    routineId: match[1]! as RoutePlanningRoutinePin["routineId"],
    routineVersion: match[2]! as RoutePlanningRoutinePin["routineVersion"],
    skillContentDigest: match[3]! as RoutePlanningRoutinePin["skillContentDigest"],
  };
}

/** The recorder's outcome. */
export type RoutinePinOutcome = "PINNED" | "ALREADY_PINNED";

/**
 * Record the stage-0 ROUTINE_PINNED event on a task (idempotent by the
 * persisted record; fail-closed on drift). The `at` instant is an
 * explicit input — never ambient, never displayed.
 */
export async function recordRoutinePin(
  session: AgentTaskSessionPort,
  taskRef: string,
  routine: RoutePlanningRoutinePin,
  at: string,
): Promise<RoutinePinOutcome> {
  const task = await session.taskDetail(taskRef);
  if (task === null) {
    throw new RoutinePinDriftError(`no agent task exists with id '${taskRef}' — the routine pin cannot be recorded`);
  }
  for (const event of task.events) {
    if (event.kind !== "ROUTINE_PINNED") {
      continue;
    }
    const pinned = parseRoutinePinSummary(event.summary);
    if (pinned === null) {
      throw new RoutinePinDriftError(
        `task '${taskRef}' carries an unreadable ROUTINE_PINNED event — the pin is never re-written over a malformed record`,
      );
    }
    if (
      pinned.routineId === routine.routineId &&
      pinned.routineVersion === routine.routineVersion &&
      pinned.skillContentDigest === routine.skillContentDigest
    ) {
      return "ALREADY_PINNED";
    }
    throw new RoutinePinDriftError(
      `task '${taskRef}' is already pinned to ${pinned.routineId} v${pinned.routineVersion} (skill digest ${pinned.skillContentDigest}) — a drifted routine (${routine.routineId} v${routine.routineVersion}) never silently re-pins`,
    );
  }
  await session.appendTaskEvent(taskRef, "ROUTINE_PINNED", at, routinePinSummary(routine), routine.routineId);
  return "PINNED";
}
