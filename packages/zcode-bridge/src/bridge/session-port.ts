/**
 * Bridge implementation: session port projection (P3-W3).
 *
 * The collaboration-mode posture projection (the module's KEEP_WITH_
 * ADAPTATIONS core): the substrate's coding-flavored modes pinned as the
 * OBSERVED vocabulary and projected onto product-neutral postures. The
 * projection is a LABEL — even the AUTO posture (application-permission
 * auto-approval) is never financial authorization.
 */

import { IssueCollector } from "../errors.ts";
import { isNonEmptyString, isRecord } from "../shared.ts";
import {
  COLLABORATION_MODE_POSTURES,
  OBSERVED_COLLABORATION_MODES,
  SESSION_STATUSES,
} from "../wire/session-port.ts";
import type {
  CollaborationPostureWire,
  ObservedCollaborationModeWire,
  SessionStatusWire,
  SessionWire,
} from "../wire/session-port.ts";

/** Structural guard: session status. */
export function isSessionStatus(candidate: unknown): candidate is SessionStatusWire {
  return (
    typeof candidate === "string" &&
    SESSION_STATUSES.includes(candidate as SessionStatusWire)
  );
}

/** Structural guard: observed collaboration mode. */
export function isObservedCollaborationMode(
  candidate: unknown,
): candidate is ObservedCollaborationModeWire {
  return (
    typeof candidate === "string" &&
    OBSERVED_COLLABORATION_MODES.includes(candidate as ObservedCollaborationModeWire)
  );
}

/**
 * Project an observed collaboration mode onto its product-neutral posture
 * (plan -> PROPOSE; build/edit -> ACT; yolo/auto -> AUTO). Throws a plain
 * Error for a non-observed mode. The posture is a LABEL ONLY: application
 * permission posture, never financial authorization.
 */
export function collaborationModePosture(
  mode: ObservedCollaborationModeWire,
): CollaborationPostureWire {
  if (!isObservedCollaborationMode(mode)) {
    throw new Error(
      `collaborationModePosture: unknown observed collaboration mode ${JSON.stringify(mode)} (observed vocabulary: ${OBSERVED_COLLABORATION_MODES.join(", ")})`,
    );
  }
  return COLLABORATION_MODE_POSTURES[mode];
}

/**
 * Construct and freeze a validated SessionWire: non-empty id, pinned
 * status, optional observed mode, and the DERIVED projected posture (the
 * posture is always computed from the mode — callers cannot fabricate a
 * posture the mode does not project to; a session without a mode projects
 * to the ACT posture as the substrate's acting default).
 */
export function sessionWire(input: unknown): SessionWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid session wire record: must be an object");
  }
  issues.requireNonEmptyString("id", input.id);
  if (!isSessionStatus(input.status)) {
    issues.add("status", `must be one of: ${SESSION_STATUSES.join(", ")}`);
  }
  if (input.mode !== undefined && !isObservedCollaborationMode(input.mode)) {
    issues.add("mode", `must be one of: ${OBSERVED_COLLABORATION_MODES.join(", ")} when present`);
  }
  issues.throwIfAny("session wire record");
  const record = input as unknown as SessionWire;
  const mode = record.mode;
  return Object.freeze({
    id: record.id,
    status: record.status,
    ...(mode !== undefined ? { mode } : {}),
    projectedPosture: mode === undefined ? "ACT" : collaborationModePosture(mode),
  });
}
