/**
 * @payswap/surface — agent-task fail-closed validation + the seed fold
 * (P13-0, ADR-0007 D6).
 *
 * Split from ./agent-tasks.ts for the <=400-line file law (the established
 * package discipline). Contains: the typed error, the structural validators
 * for intents/events/tasks, and `resolveAgentTaskSeed` — the CONVERGENCE
 * fold that makes entrypoint convergence executable rather than aspirational.
 *
 * Laws (canonical):
 * - Fail-closed: unknown kinds, extra fields and malformed instants throw
 *   typed errors — never silently coerced (the console-missions discipline).
 * - Exact-keys: the canonical shapes are closed; a record carrying extra
 *   fields is invalid (drift is a defect, not a feature).
 */

import { AGENT_TASK_CONNECTION_FORMS, AGENT_TASK_EVENT_KINDS, AGENT_TASK_KINDS, AGENT_TASK_ORIGINS, AGENT_TASK_RESUME_WINDOW_SECONDS, AGENT_TASK_STATUSES, agentTaskResumeKey, isResumableAgentTaskStatus, type AgentTask, type AgentTaskId, type AgentTaskIntent, type AgentTaskOrigin, type ConnectionSetupIntent, type PaymentMissionIntent } from "./agent-tasks.ts";

export class InvalidAgentTaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAgentTaskError";
  }
}

const ISO_8601_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const ID_RE = /^\S.{0,127}$/;

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidAgentTaskError(`${field} must be a non-empty string`);
  }
  return value;
}

function requireInstant(value: unknown, field: string): string {
  if (typeof value !== "string" || !ISO_8601_UTC_RE.test(value)) {
    throw new InvalidAgentTaskError(
      `${field} must be an ISO-8601 UTC instant (e.g. 2026-10-22T12:00:00Z)`,
    );
  }
  return value;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  what: string,
): void {
  const keys = Object.keys(record).sort();
  const want = [...expected].sort();
  if (keys.join(",") !== want.join(",")) {
    throw new InvalidAgentTaskError(
      `${what} has unexpected fields: got [${keys.join(", ")}], want [${want.join(", ")}]`,
    );
  }
}

/** Fail-closed structural validation of a ConnectionSetupIntent. */
export function validateConnectionSetupIntent(intent: unknown): ConnectionSetupIntent {
  if (intent === null || typeof intent !== "object" || Array.isArray(intent)) {
    throw new InvalidAgentTaskError("a ConnectionSetupIntent object is required");
  }
  const record = intent as Readonly<Record<string, unknown>>;
  requireExactKeys(
    record,
    record["useCaseRef"] === undefined
      ? ["form", "kind", "providerId"]
      : ["form", "kind", "providerId", "useCaseRef"],
    "ConnectionSetupIntent",
  );
  if (record["kind"] !== "CONNECTION_SETUP") {
    throw new InvalidAgentTaskError("kind must be 'CONNECTION_SETUP'");
  }
  const providerId = requireString(record["providerId"], "providerId");
  if (!ID_RE.test(providerId)) {
    throw new InvalidAgentTaskError("providerId must be 1-128 chars with no leading whitespace");
  }
  const form = record["form"];
  if (
    typeof form !== "string" ||
    !(AGENT_TASK_CONNECTION_FORMS as readonly string[]).includes(form)
  ) {
    throw new InvalidAgentTaskError(
      `form must be one of [${AGENT_TASK_CONNECTION_FORMS.join(", ")}], got '${String(form)}'`,
    );
  }
  if (record["useCaseRef"] !== undefined) {
    requireString(record["useCaseRef"], "useCaseRef");
  }
  return intent as ConnectionSetupIntent;
}

/** Fail-closed structural validation of a PaymentMissionIntent. */
export function validatePaymentMissionIntent(intent: unknown): PaymentMissionIntent {
  if (intent === null || typeof intent !== "object" || Array.isArray(intent)) {
    throw new InvalidAgentTaskError("a PaymentMissionIntent object is required");
  }
  const record = intent as Readonly<Record<string, unknown>>;
  requireExactKeys(record, ["direction", "goalStatement", "kind"], "PaymentMissionIntent");
  if (record["kind"] !== "PAYMENT_MISSION") {
    throw new InvalidAgentTaskError("kind must be 'PAYMENT_MISSION'");
  }
  const direction = record["direction"];
  if (
    typeof direction !== "string" ||
    !["PAY", "RECEIVE", "MOVE", "CONVERT"].includes(direction)
  ) {
    throw new InvalidAgentTaskError(
      `direction must be one of PAY/RECEIVE/MOVE/CONVERT, got '${String(direction)}'`,
    );
  }
  const goalStatement = record["goalStatement"];
  if (typeof goalStatement !== "string" || goalStatement.trim().length === 0) {
    throw new InvalidAgentTaskError("goalStatement must be a non-empty string");
  }
  if (goalStatement.length > 2000) {
    throw new InvalidAgentTaskError("goalStatement must be at most 2000 characters");
  }
  return intent as PaymentMissionIntent;
}

/** Fail-closed validation of any AgentTaskIntent. */
export function validateAgentTaskIntent(intent: unknown): AgentTaskIntent {
  const kind = (intent as { kind?: unknown } | null)?.kind;
  if (kind === "CONNECTION_SETUP") return validateConnectionSetupIntent(intent);
  if (kind === "PAYMENT_MISSION") return validatePaymentMissionIntent(intent);
  throw new InvalidAgentTaskError(
    "intent.kind must be 'CONNECTION_SETUP' or 'PAYMENT_MISSION'",
  );
}

/** Fail-closed structural validation of an AgentTask record (persisted/wire). */
export function validateAgentTask(task: unknown): AgentTask {
  if (task === null || typeof task !== "object" || Array.isArray(task)) {
    throw new InvalidAgentTaskError("an AgentTask object is required");
  }
  const record = task as Readonly<Record<string, unknown>>;
  requireExactKeys(
    record,
    record["modelSelection"] === undefined
      ? ["createdAt", "events", "id", "intent", "kind", "origin", "status", "updatedAt"]
      : ["createdAt", "events", "id", "intent", "kind", "modelSelection", "origin", "status", "updatedAt"],
    "AgentTask",
  );
  if (record["modelSelection"] !== undefined) {
    requireValidModelSelection(record["modelSelection"]);
  }
  if (typeof record["id"] !== "string" || !ID_RE.test(record["id"])) {
    throw new InvalidAgentTaskError("id must be a non-empty task id (1-128 chars)");
  }
  if (
    typeof record["kind"] !== "string" ||
    !(AGENT_TASK_KINDS as readonly string[]).includes(record["kind"])
  ) {
    throw new InvalidAgentTaskError(`kind must be one of [${AGENT_TASK_KINDS.join(", ")}]`);
  }
  const intent = validateAgentTaskIntent(record["intent"]);
  if (intent.kind !== record["kind"]) {
    throw new InvalidAgentTaskError("intent.kind must match task kind");
  }
  if (
    typeof record["origin"] !== "string" ||
    !(AGENT_TASK_ORIGINS as readonly string[]).includes(record["origin"])
  ) {
    throw new InvalidAgentTaskError(`origin must be one of [${AGENT_TASK_ORIGINS.join(", ")}]`);
  }
  if (
    typeof record["status"] !== "string" ||
    !(AGENT_TASK_STATUSES as readonly string[]).includes(record["status"])
  ) {
    throw new InvalidAgentTaskError(
      `status must be one of [${AGENT_TASK_STATUSES.join(", ")}]`,
    );
  }
  requireInstant(record["createdAt"], "createdAt");
  requireInstant(record["updatedAt"], "updatedAt");
  if (!Array.isArray(record["events"])) {
    throw new InvalidAgentTaskError("events must be an array");
  }
  const seenEventIds = new Set<string>();
  for (const event of record["events"]) {
    if (event === null || typeof event !== "object" || Array.isArray(event)) {
      throw new InvalidAgentTaskError("each event must be an object");
    }
    const e = event as Readonly<Record<string, unknown>>;
    requireExactKeys(
      e,
      e["correlationRef"] === undefined
        ? ["at", "id", "kind", "summary"]
        : ["at", "id", "kind", "summary", "correlationRef"],
      "event",
    );
    if (typeof e["id"] !== "string" || e["id"].length === 0 || seenEventIds.has(e["id"])) {
      throw new InvalidAgentTaskError("event ids must be unique non-empty strings");
    }
    seenEventIds.add(e["id"]);
    requireInstant(e["at"], "event.at");
    if (
      typeof e["kind"] !== "string" ||
      !(AGENT_TASK_EVENT_KINDS as readonly string[]).includes(e["kind"])
    ) {
      throw new InvalidAgentTaskError(`event.kind '${String(e["kind"])}' is not canonical`);
    }
    requireString(e["summary"], "event.summary");
    if (typeof e["summary"] === "string" && e["summary"].length > 500) {
      throw new InvalidAgentTaskError("event.summary must be at most 500 characters");
    }
    if (e["correlationRef"] !== undefined) {
      requireString(e["correlationRef"], "event.correlationRef");
    }
  }
  return task as AgentTask;
}

/* ====================================================================
 * The seed-decision fold (the convergence law, executable)
 * ==================================================================== */

/** Fail-closed validation of the optional model/difficulty selection (P21-B, D4). */
function requireValidModelSelection(value: unknown): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidAgentTaskError("modelSelection must be an object { providerId, modelId, reasoningLevel }");
  }
  const selection = value as Readonly<Record<string, unknown>>;
  requireExactKeys(selection, ["modelId", "providerId", "reasoningLevel"], "modelSelection");
  requireString(selection["providerId"], "modelSelection.providerId");
  requireString(selection["modelId"], "modelSelection.modelId");
  requireString(selection["reasoningLevel"], "modelSelection.reasoningLevel");
}

/** The outcome of the seed fold (defined here to keep agent-tasks.ts lean). */
export interface AgentTaskSeedDecision {
  readonly action: "CREATE" | "RESUME";
  /** Present iff action is RESUME — the task to resume. */
  readonly taskId?: AgentTaskId;
  /** The origin recorded on CREATED events by the adapter (informational). */
  readonly origin?: AgentTaskOrigin;
}

/**
 * The convergence fold: given an incoming intent (from ANY supported
 * entrypoint) and the existing tasks with their updatedAt instants, decide
 * CREATE vs RESUME. A task whose resume key matches, whose status is
 * resumable and whose updatedAt is within the resume window is RESUMED —
 * never duplicated. Terminal and stale tasks never resume; a new task is
 * created.
 *
 * This is the typed enforcement of the UX reference: "clicking Stripe
 * Connect, typing 'connect Stripe', … and clicking Pay must converge on the
 * correct shared task system."
 */
export function resolveAgentTaskSeed(
  intent: AgentTaskIntent,
  existing: readonly AgentTask[],
  now: string,
): AgentTaskSeedDecision {
  validateAgentTaskIntent(intent);
  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) {
    throw new InvalidAgentTaskError("now must be an ISO-8601 UTC instant");
  }
  const key = agentTaskResumeKey(intent);
  for (const task of existing) {
    if (task.intent.kind !== intent.kind) continue;
    if (!isResumableAgentTaskStatus(task.status)) continue;
    if (agentTaskResumeKey(task.intent) !== key) continue;
    const updatedMs = Date.parse(task.updatedAt);
    if (Number.isNaN(updatedMs)) {
      throw new InvalidAgentTaskError(`task '${task.id}' has an invalid updatedAt instant`);
    }
    const ageSeconds = (nowMs - updatedMs) / 1000;
    if (ageSeconds >= 0 && ageSeconds <= AGENT_TASK_RESUME_WINDOW_SECONDS) {
      return { action: "RESUME", taskId: task.id };
    }
  }
  return { action: "CREATE", origin: "SURFACE_ACTION" };
}
