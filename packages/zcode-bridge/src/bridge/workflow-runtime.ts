/**
 * Bridge implementation: dynamic-workflow runtime protocol (P3-W3).
 *
 * Validators for the pinned NDJSON stdio wire between the workflow sandbox
 * child and the host: child messages (create-actor, request, event,
 * complete) and the parent response, plus the serializable wire error.
 */

import { IssueCollector } from "../errors.ts";
import { cloneAndFreeze, isBoolean, isNonEmptyString, isRecord } from "../shared.ts";
import {
  DWF_WIRE_EVENT_TYPES,
  DWF_WIRE_REQUEST_TYPES,
} from "../wire/workflow-runtime.ts";
import type {
  DwfCompleteMessageWire,
  DwfCreateActorMessageWire,
  DwfDeclareArtifactEventMessageWire,
  DwfLogEventMessageWire,
  DwfPhaseEnteredEventMessageWire,
  DwfReportEventMessageWire,
  DwfRequestMessageWire,
  DwfResponseMessageWire,
  DwfWireErrorWire,
} from "../wire/workflow-runtime.ts";

/** Construct and freeze a validated wire error (name/message + optional detail). */
export function dwfWireError(input: unknown): DwfWireErrorWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid DWF wire error: must be an object");
  }
  issues.requireNonEmptyString("name", input.name);
  issues.requireNonEmptyString("message", input.message);
  if (input.code !== undefined) {
    issues.requireNonEmptyString("code", input.code, "must be a non-empty string when present");
  }
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
  if (input.stack !== undefined) {
    issues.requireNonEmptyString("stack", input.stack, "must be a non-empty string when present");
  }
  issues.throwIfAny("DWF wire error");
  const record = input as unknown as DwfWireErrorWire;
  return Object.freeze({
    name: record.name,
    message: record.message,
    ...(record.code !== undefined ? { code: record.code } : {}),
    ...(record.violations !== undefined
      ? { violations: Object.freeze(record.violations.map((v) => Object.freeze({ ...v }))) }
      : {}),
    ...(record.finalText !== undefined ? { finalText: record.finalText } : {}),
    ...(record.stack !== undefined ? { stack: record.stack } : {}),
  });
}

/** Construct and freeze a validated create-actor message. */
export function dwfCreateActorMessage(input: unknown): DwfCreateActorMessageWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid DWF create-actor message: must be an object");
  }
  if (input.kind !== "create-actor") {
    issues.add("kind", "must be the literal 'create-actor'");
  }
  issues.requireNonEmptyString("localId", input.localId);
  issues.requireNonEmptyString("siteId", input.siteId);
  if (input.name !== undefined) {
    issues.requireNonEmptyString("name", input.name, "must be a non-empty string when present");
  }
  issues.throwIfAny("DWF create-actor message");
  const record = input as unknown as DwfCreateActorMessageWire;
  return Object.freeze({
    kind: "create-actor",
    localId: record.localId,
    siteId: record.siteId,
    ...(record.name !== undefined ? { name: record.name } : {}),
    ...(record.persona !== undefined ? { persona: cloneAndFreeze(record.persona) } : {}),
  });
}

/**
 * Construct and freeze a validated request message: a pinned request type,
 * non-empty id and siteId, and the per-type member law — `ask` carries
 * instructions (and optionally the actor handle), `world-read` carries op
 * (and optionally positional args), `publish-artifact` carries artifactOp
 * from the content family ("file" | "markdown") and args.
 */
export function dwfRequestMessage(input: unknown): DwfRequestMessageWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid DWF request message: must be an object");
  }
  if (input.kind !== "request") {
    issues.add("kind", "must be the literal 'request'");
  }
  issues.requireNonEmptyString("id", input.id);
  if (
    typeof input.type !== "string" ||
    !DWF_WIRE_REQUEST_TYPES.includes(input.type as DwfRequestMessageWire["type"])
  ) {
    issues.add("type", `must be one of: ${DWF_WIRE_REQUEST_TYPES.join(", ")}`);
  }
  issues.requireNonEmptyString("siteId", input.siteId);
  if (input.actor !== undefined) {
    issues.requireNonEmptyString("actor", input.actor, "must be a non-empty string when present");
  }
  if (input.instructions !== undefined) {
    issues.requireNonEmptyString(
      "instructions",
      input.instructions,
      "must be a non-empty string when present",
    );
  }
  if (input.op !== undefined) {
    issues.requireNonEmptyString("op", input.op, "must be a non-empty string when present");
  }
  if (input.artifactOp !== undefined) {
    if (
      typeof input.artifactOp !== "string" ||
      (input.artifactOp !== "file" && input.artifactOp !== "markdown")
    ) {
      issues.add("artifactOp", 'must be "file" or "markdown" when present');
    }
  }
  if (input.args !== undefined && !Array.isArray(input.args)) {
    issues.add("args", "must be an array when present");
  }
  issues.throwIfAny("DWF request message");
  const record = input as unknown as DwfRequestMessageWire;
  return Object.freeze({
    kind: "request",
    id: record.id,
    type: record.type,
    siteId: record.siteId,
    ...(record.actor !== undefined ? { actor: record.actor } : {}),
    ...(record.instructions !== undefined
      ? { instructions: record.instructions }
      : {}),
    ...(record.op !== undefined ? { op: record.op } : {}),
    ...(record.artifactOp !== undefined ? { artifactOp: record.artifactOp } : {}),
    ...(record.args !== undefined ? { args: Object.freeze([...record.args]) } : {}),
  });
}

/** Construct and freeze a validated log event message. */
export function dwfLogEventMessage(input: unknown): DwfLogEventMessageWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid DWF log event message: must be an object");
  }
  if (input.kind !== "event" || input.type !== "log") {
    issues.add("kind/type", "must be the literals 'event' and 'log'");
  }
  issues.requireNonEmptyString("message", input.message);
  issues.throwIfAny("DWF log event message");
  const record = input as unknown as DwfLogEventMessageWire;
  return Object.freeze({ kind: "event", type: "log", message: record.message });
}

/** Construct and freeze a validated report event message. */
export function dwfReportEventMessage(input: unknown): DwfReportEventMessageWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid DWF report event message: must be an object");
  }
  if (input.kind !== "event" || input.type !== "report") {
    issues.add("kind/type", "must be the literals 'event' and 'report'");
  }
  issues.requireNonEmptyString("siteId", input.siteId);
  if (input.artifactId !== undefined) {
    issues.requireNonEmptyString(
      "artifactId",
      input.artifactId,
      "must be a non-empty string when present",
    );
  }
  issues.throwIfAny("DWF report event message");
  const record = input as unknown as DwfReportEventMessageWire;
  return Object.freeze({
    kind: "event",
    type: "report",
    siteId: record.siteId,
    item: cloneAndFreeze(record.item),
    ...(record.artifactId !== undefined ? { artifactId: record.artifactId } : {}),
  });
}

/** Construct and freeze a validated declare-artifact event message. */
export function dwfDeclareArtifactEventMessage(
  input: unknown,
): DwfDeclareArtifactEventMessageWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid DWF declare-artifact event message: must be an object");
  }
  if (input.kind !== "event" || input.type !== "declare-artifact") {
    issues.add("kind/type", "must be the literals 'event' and 'declare-artifact'");
  }
  issues.requireNonEmptyString("siteId", input.siteId);
  if (
    typeof input.op !== "string" ||
    (input.op !== "chart" &&
      input.op !== "table" &&
      input.op !== "metrics" &&
      input.op !== "board")
  ) {
    issues.add("op", 'must be one of: chart, table, metrics, board');
  }
  if (!Array.isArray(input.args)) {
    issues.add("args", "must be an array");
  }
  issues.throwIfAny("DWF declare-artifact event message");
  const record = input as unknown as DwfDeclareArtifactEventMessageWire;
  return Object.freeze({
    kind: "event",
    type: "declare-artifact",
    siteId: record.siteId,
    op: record.op,
    args: Object.freeze([...record.args]),
  });
}

/** Construct and freeze a validated phase-entered event message. */
export function dwfPhaseEnteredEventMessage(
  input: unknown,
): DwfPhaseEnteredEventMessageWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid DWF phase-entered event message: must be an object");
  }
  if (input.kind !== "event" || input.type !== "phase-entered") {
    issues.add("kind/type", "must be the literals 'event' and 'phase-entered'");
  }
  issues.requireNonEmptyString("name", input.name);
  issues.throwIfAny("DWF phase-entered event message");
  const record = input as unknown as DwfPhaseEnteredEventMessageWire;
  return Object.freeze({ kind: "event", type: "phase-entered", name: record.name });
}

/** Construct and freeze a validated complete message. */
export function dwfCompleteMessage(input: unknown): DwfCompleteMessageWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid DWF complete message: must be an object");
  }
  if (input.kind !== "complete") {
    issues.add("kind", "must be the literal 'complete'");
  }
  issues.requireBoolean("ok", input.ok);
  let parsedError: DwfWireErrorWire | undefined;
  if (input.error !== undefined) {
    try {
      parsedError = dwfWireError(input.error);
    } catch (error) {
      issues.add("error", error instanceof Error ? error.message : String(error));
    }
  }
  issues.throwIfAny("DWF complete message");
  const record = input as unknown as DwfCompleteMessageWire;
  return Object.freeze({
    kind: "complete",
    ok: record.ok,
    ...(record.value !== undefined ? { value: cloneAndFreeze(record.value) } : {}),
    ...(parsedError !== undefined ? { error: parsedError } : {}),
  });
}

/** Construct and freeze a validated parent response message. */
export function dwfResponseMessage(input: unknown): DwfResponseMessageWire {
  const issues = new IssueCollector();
  if (!isRecord(input)) {
    throw new Error("Invalid DWF response message: must be an object");
  }
  if (input.kind !== "response") {
    issues.add("kind", "must be the literal 'response'");
  }
  issues.requireNonEmptyString("id", input.id);
  issues.requireBoolean("ok", input.ok);
  let parsedError: DwfWireErrorWire | undefined;
  if (input.error !== undefined) {
    try {
      parsedError = dwfWireError(input.error);
    } catch (error) {
      issues.add("error", error instanceof Error ? error.message : String(error));
    }
  }
  issues.throwIfAny("DWF response message");
  const record = input as unknown as DwfResponseMessageWire;
  return Object.freeze({
    kind: "response",
    id: record.id,
    ok: record.ok,
    ...(record.value !== undefined ? { value: cloneAndFreeze(record.value) } : {}),
    ...(parsedError !== undefined ? { error: parsedError } : {}),
  });
}

/** Structural guard: wire event type. */
export function isDwfWireEventType(
  candidate: unknown,
): candidate is DwfLogEventMessageWire["type"] {
  return (
    typeof candidate === "string" &&
    DWF_WIRE_EVENT_TYPES.includes(candidate as DwfLogEventMessageWire["type"])
  );
}
