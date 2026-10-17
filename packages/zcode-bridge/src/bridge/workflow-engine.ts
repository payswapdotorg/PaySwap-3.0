/**
 * Bridge implementation: dynamic-workflow engine vocabulary (P3-W3).
 *
 * Validators for the pinned engine vocabulary: run statuses, stop reasons,
 * run events (the 25-kind Boundary C vocabulary), submit verdicts, ask
 * observations, and the serializable workflow error form.
 */

import { IssueCollector } from "../errors.ts";
import {
  cloneAndFreeze,
  isNonEmptyString,
  isNonNegativeInteger,
  isPositiveInteger,
  isRecord,
  isStringArray,
} from "../shared.ts";
import {
  DWF_NODE_KINDS,
  DWF_PROVIDER_STOP_KINDS,
  DWF_RUN_EVENT_KINDS,
  DWF_RUN_STATUSES,
  DWF_RUN_STOP_REASONS,
  DWF_WORKFLOW_ERROR_CODES,
} from "../wire/workflow-engine.ts";
import type {
  DwfRunStopReasonWire,
  DwfInstanceRefWire,
  DwfPersonaSpecWire,
  DwfProviderStopKindWire,
  DwfRunEventWire,
  DwfRunStatusWire,
  DwfSubmitVerdictWire,
  DwfWorkflowErrorJsonWire,
} from "../wire/workflow-engine.ts";

/** Structural guard: run status. */
export function isDwfRunStatus(candidate: unknown): candidate is DwfRunStatusWire {
  return (
    typeof candidate === "string" &&
    DWF_RUN_STATUSES.includes(candidate as DwfRunStatusWire)
  );
}

/** Structural guard: run event kind. */
export function isDwfRunEventKind(
  candidate: unknown,
): candidate is DwfRunEventWire["type"] {
  return (
    typeof candidate === "string" &&
    DWF_RUN_EVENT_KINDS.includes(candidate as DwfRunEventWire["type"])
  );
}

/** Structural guard: run stop reason. */
export function isDwfRunStopReason(
  candidate: unknown,
): candidate is DwfRunStopReasonWire {
  return (
    typeof candidate === "string" &&
    DWF_RUN_STOP_REASONS.includes(candidate as DwfRunStopReasonWire)
  );
}

/** Structural guard: workflow error code. */
export function isDwfWorkflowErrorCode(candidate: unknown): candidate is string {
  return (
    typeof candidate === "string" &&
    DWF_WORKFLOW_ERROR_CODES.includes(candidate)
  );
}

/** Construct and freeze a validated instance/actor reference (siteId @ ordinal, ordinal >= 1). */
export function dwfRef(input: unknown): DwfInstanceRefWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid DWF reference: must be an object");
  }
  issues.requireNonEmptyString("siteId", input.siteId);
  issues.requirePositiveInteger("ordinal", input.ordinal);
  issues.throwIfAny("DWF reference");
  const record = input as unknown as DwfInstanceRefWire;
  return Object.freeze({ siteId: record.siteId, ordinal: record.ordinal });
}

/** Render a reference as the stable `site@ordinal` handle (pin of refToString). */
export function dwfRefToString(ref: DwfInstanceRefWire): string {
  return `${ref.siteId}@${ref.ordinal}`;
}

/** Construct and freeze a validated persona spec (name/system, identity only). */
export function dwfPersonaSpec(input: unknown): DwfPersonaSpecWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid DWF persona spec: must be an object");
  }
  if (input.name !== undefined) {
    issues.requireNonEmptyString("name", input.name, "must be a non-empty string when present");
  }
  if (input.system !== undefined) {
    issues.requireNonEmptyString("system", input.system, "must be a non-empty string when present");
  }
  issues.throwIfAny("DWF persona spec");
  const record = input as unknown as DwfPersonaSpecWire;
  return Object.freeze({
    ...(record.name !== undefined ? { name: record.name } : {}),
    ...(record.system !== undefined ? { system: record.system } : {}),
  });
}

/**
 * Construct and freeze a validated submit verdict: accept | reject (with
 * non-empty violations: path/expected/got) | nudge — the driver's verdict
 * on an actor's submitted result.
 */
export function dwfSubmitVerdict(input: unknown): DwfSubmitVerdictWire {
  if (!isRecord(input)) {
    throw new Error("Invalid DWF submit verdict: must be an object");
  }
  if (input.kind === "accept") {
    return Object.freeze({ kind: "accept" });
  }
  if (input.kind === "nudge") {
    return Object.freeze({ kind: "nudge" });
  }
  if (input.kind === "reject") {
    const issues = new IssueCollector();
    if (
      !Array.isArray(input.violations) ||
      input.violations.length === 0 ||
      !input.violations.every(
        (violation: unknown) =>
          isRecord(violation) &&
          isNonEmptyString(violation.path) &&
          isNonEmptyString(violation.expected) &&
          isNonEmptyString(violation.got),
      )
    ) {
      issues.add(
        "violations",
        "must be a non-empty array of { path, expected, got } on the reject verdict",
      );
    }
    issues.throwIfAny("DWF submit verdict");
    const record = input as unknown as { kind: "reject"; violations: readonly {
      path: string;
      expected: string;
      got: string;
    }[] };
    return Object.freeze({
      kind: "reject",
      violations: Object.freeze(record.violations.map((v) => Object.freeze({ ...v }))),
    });
  }
  throw new Error(
    `Invalid DWF submit verdict: kind must be 'accept', 'reject' or 'nudge' (got ${JSON.stringify(input.kind)})`,
  );
}

/**
 * Construct and freeze a validated DwfRunEventWire (the descriptive slice
 * of a Boundary C engine event): a pinned event kind, optional non-empty
 * runId (required semantics for run-scoped kinds are the engine's law; the
 * bridge pins the wire shape), optional JSON payload record.
 */
export function dwfRunEvent(input: unknown): DwfRunEventWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid DWF run event: must be an object");
  }
  if (!isDwfRunEventKind(input.type)) {
    issues.add("type", "must be a pinned DWF run event kind (see DWF_RUN_EVENT_KINDS)");
  }
  if (input.runId !== undefined) {
    issues.requireNonEmptyString("runId", input.runId, "must be a non-empty string when present");
  }
  if (input.payload !== undefined && !isRecord(input.payload)) {
    issues.add("payload", "must be an object when present");
  }
  issues.throwIfAny("DWF run event");
  const record = input as unknown as DwfRunEventWire;
  return Object.freeze({
    type: record.type,
    ...(record.runId !== undefined ? { runId: record.runId } : {}),
    ...(record.payload !== undefined ? { payload: cloneAndFreeze(record.payload) } : {}),
  });
}

/**
 * Construct and freeze a validated DwfWorkflowErrorJsonWire: a pinned error
 * code, non-empty message, optional violations (path/expected/got),
 * optional finalText and mismatch (expected/got), optional providerStop
 * with a pinned kind and non-empty reason.
 */
export function dwfWorkflowErrorJson(input: unknown): DwfWorkflowErrorJsonWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid DWF workflow error json: must be an object");
  }
  if (!isDwfWorkflowErrorCode(input.code)) {
    issues.add("code", "must be a pinned workflow error code (see DWF_WORKFLOW_ERROR_CODES)");
  }
  issues.requireNonEmptyString("message", input.message);
  if (input.violations !== undefined) {
    if (
      !Array.isArray(input.violations) ||
      !input.violations.every(
        (violation: unknown) =>
          isRecord(violation) &&
          isNonEmptyString(violation.path) &&
          isNonEmptyString(violation.expected) &&
          isNonEmptyString(violation.got),
      )
    ) {
      issues.add("violations", "must be an array of { path, expected, got } when present");
    }
  }
  if (input.finalText !== undefined) {
    issues.requireNonEmptyString("finalText", input.finalText, "must be a non-empty string when present");
  }
  if (input.mismatch !== undefined) {
    const mismatch = input.mismatch;
    if (!isRecord(mismatch)) {
      issues.add("mismatch", "must be an object when present");
    } else {
      issues.requireNonEmptyString("mismatch.expected", mismatch.expected);
      issues.requireNonEmptyString("mismatch.got", mismatch.got);
    }
  }
  if (input.providerStop !== undefined) {
    const providerStop = input.providerStop;
    if (!isRecord(providerStop)) {
      issues.add("providerStop", "must be an object when present");
    } else {
      if (
        typeof providerStop.kind !== "string" ||
        !DWF_PROVIDER_STOP_KINDS.includes(
          providerStop.kind as DwfProviderStopKindWire,
        )
      ) {
        issues.add("providerStop.kind", `must be one of: ${DWF_PROVIDER_STOP_KINDS.join(", ")}`);
      }
      issues.requireNonEmptyString("providerStop.reason", providerStop.reason);
    }
  }
  issues.throwIfAny("DWF workflow error json");
  const record = input as unknown as DwfWorkflowErrorJsonWire;
  return Object.freeze({
    code: record.code,
    message: record.message,
    ...(record.violations !== undefined
      ? {
          violations: Object.freeze(
            record.violations.map((v) => Object.freeze({ ...v })),
          ),
        }
      : {}),
    ...(record.finalText !== undefined ? { finalText: record.finalText } : {}),
    ...(record.mismatch !== undefined
      ? { mismatch: Object.freeze({ ...record.mismatch }) }
      : {}),
    ...(record.providerStop !== undefined
      ? { providerStop: Object.freeze({ ...record.providerStop }) }
      : {}),
  });
}

/** Structural guard: node kind (the engine's five node vocabularies). */
export function isDwfNodeKind(candidate: unknown): candidate is string {
  return typeof candidate === "string" && DWF_NODE_KINDS.includes(candidate as never);
}

/** Structural guard: ask stats record (tokens/toolCalls/turns non-negative). */
export function isDwfAskStats(candidate: unknown): boolean {
  if (!isRecord(candidate)) return false;
  return (
    isNonNegativeInteger(candidate.tokens) &&
    isNonNegativeInteger(candidate.toolCalls) &&
    isNonNegativeInteger(candidate.turns) &&
    (candidate.worldToolCalls === undefined ||
      isNonNegativeInteger(candidate.worldToolCalls)) &&
    !Array.isArray(candidate)
  );
}

/** Structural guard: string array (used by phase-name lists on run-launched). */
export function isDwfPhaseNameList(candidate: unknown): candidate is readonly string[] {
  return isStringArray(candidate);
}
