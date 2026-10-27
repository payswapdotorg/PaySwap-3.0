/**
 * @payswap/app — agent-task fail-closed validation + the seed fold
 * (mirrors packages/surface/src/agent-task-validation.ts, P13-0).
 *
 * The app-side mirror of the shared contract's validation module: the
 * pinned typed error, the structural validators for intents/events/
 * tasks, and `resolvePinnedAgentTaskSeed` — the CONVERGENCE fold that
 * makes entrypoint convergence executable. Every accept/reject decision
 * is verified against the REAL source validators by
 * test/payswap/agent-task-pin-mirror.test.ts (the two-step mirror
 * discipline; the TL wires real imports at integration).
 *
 * Laws (canonical, carried from the source):
 * - Fail-closed: unknown kinds, extra fields and malformed instants
 *   throw typed errors — never silently coerced.
 * - Exact-keys: the canonical shapes are closed; extra fields are drift.
 */

import {
  AGENT_TASK_CONNECTION_FORMS_PIN,
  AGENT_TASK_EVENT_KINDS_PIN,
  AGENT_TASK_KINDS_PIN,
  AGENT_TASK_ORIGINS_PIN,
  AGENT_TASK_RESUME_WINDOW_SECONDS_PIN,
  AGENT_TASK_STATUSES_PIN,
  agentTaskResumeKeyPin,
  isResumableAgentTaskStatusPin,
  type AgentTaskIdPin,
  type AgentTaskIntentPin,
  type AgentTaskOriginPin,
  type AgentTaskPin,
  type AgentTaskSeedDecisionPin,
  type ConnectionSetupIntentPin,
  type PaymentMissionIntentPin,
} from "./agent-task-pins.js";

/** Mirrors surface InvalidAgentTaskError. */
export class InvalidPinnedAgentTaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPinnedAgentTaskError";
  }
}

const ISO_8601_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const ID_RE = /^\S.{0,127}$/;

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidPinnedAgentTaskError(`${field} must be a non-empty string`);
  }
  return value;
}

function requireInstant(value: unknown, field: string): string {
  if (typeof value !== "string" || !ISO_8601_UTC_RE.test(value)) {
    throw new InvalidPinnedAgentTaskError(
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
    throw new InvalidPinnedAgentTaskError(
      `${what} has unexpected fields: got [${keys.join(", ")}], want [${want.join(", ")}]`,
    );
  }
}

/** Mirrors surface validateConnectionSetupIntent (fail-closed). */
export function validatePinnedConnectionSetupIntent(
  intent: unknown,
): ConnectionSetupIntentPin {
  if (intent === null || typeof intent !== "object" || Array.isArray(intent)) {
    throw new InvalidPinnedAgentTaskError("a ConnectionSetupIntent object is required");
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
    throw new InvalidPinnedAgentTaskError("kind must be 'CONNECTION_SETUP'");
  }
  const providerId = requireString(record["providerId"], "providerId");
  if (!ID_RE.test(providerId)) {
    throw new InvalidPinnedAgentTaskError(
      "providerId must be 1-128 chars with no leading whitespace",
    );
  }
  const form = record["form"];
  if (
    typeof form !== "string" ||
    !(AGENT_TASK_CONNECTION_FORMS_PIN as readonly string[]).includes(form)
  ) {
    throw new InvalidPinnedAgentTaskError(
      `form must be one of [${AGENT_TASK_CONNECTION_FORMS_PIN.join(", ")}], got '${String(form)}'`,
    );
  }
  if (record["useCaseRef"] !== undefined) {
    requireString(record["useCaseRef"], "useCaseRef");
  }
  return intent as ConnectionSetupIntentPin;
}

/** Mirrors surface validatePaymentMissionIntent (fail-closed). */
export function validatePinnedPaymentMissionIntent(
  intent: unknown,
): PaymentMissionIntentPin {
  if (intent === null || typeof intent !== "object" || Array.isArray(intent)) {
    throw new InvalidPinnedAgentTaskError("a PaymentMissionIntent object is required");
  }
  const record = intent as Readonly<Record<string, unknown>>;
  requireExactKeys(record, ["direction", "goalStatement", "kind"], "PaymentMissionIntent");
  if (record["kind"] !== "PAYMENT_MISSION") {
    throw new InvalidPinnedAgentTaskError("kind must be 'PAYMENT_MISSION'");
  }
  const direction = record["direction"];
  if (
    typeof direction !== "string" ||
    !["PAY", "RECEIVE", "MOVE", "CONVERT"].includes(direction)
  ) {
    throw new InvalidPinnedAgentTaskError(
      `direction must be one of PAY/RECEIVE/MOVE/CONVERT, got '${String(direction)}'`,
    );
  }
  const goalStatement = record["goalStatement"];
  if (typeof goalStatement !== "string" || goalStatement.trim().length === 0) {
    throw new InvalidPinnedAgentTaskError("goalStatement must be a non-empty string");
  }
  if (goalStatement.length > 2000) {
    throw new InvalidPinnedAgentTaskError("goalStatement must be at most 2000 characters");
  }
  return intent as PaymentMissionIntentPin;
}

/** Mirrors surface validateAgentTaskIntent (dispatch by kind). */
export function validatePinnedAgentTaskIntent(intent: unknown): AgentTaskIntentPin {
  const kind = (intent as { kind?: unknown } | null)?.kind;
  if (kind === "CONNECTION_SETUP") return validatePinnedConnectionSetupIntent(intent);
  if (kind === "PAYMENT_MISSION") return validatePinnedPaymentMissionIntent(intent);
  throw new InvalidPinnedAgentTaskError(
    "intent.kind must be 'CONNECTION_SETUP' or 'PAYMENT_MISSION'",
  );
}

/** Mirrors surface validateAgentTask (persisted/wire record shape). */
export function validatePinnedAgentTask(task: unknown): AgentTaskPin {
  if (task === null || typeof task !== "object" || Array.isArray(task)) {
    throw new InvalidPinnedAgentTaskError("an AgentTask object is required");
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
    validatePinnedModelSelection(record["modelSelection"]);
  }
  if (typeof record["id"] !== "string" || !ID_RE.test(record["id"])) {
    throw new InvalidPinnedAgentTaskError("id must be a non-empty task id (1-128 chars)");
  }
  if (
    typeof record["kind"] !== "string" ||
    !(AGENT_TASK_KINDS_PIN as readonly string[]).includes(record["kind"])
  ) {
    throw new InvalidPinnedAgentTaskError(
      `kind must be one of [${AGENT_TASK_KINDS_PIN.join(", ")}]`,
    );
  }
  const intent = validatePinnedAgentTaskIntent(record["intent"]);
  if (intent.kind !== record["kind"]) {
    throw new InvalidPinnedAgentTaskError("intent.kind must match task kind");
  }
  if (
    typeof record["origin"] !== "string" ||
    !(AGENT_TASK_ORIGINS_PIN as readonly string[]).includes(record["origin"])
  ) {
    throw new InvalidPinnedAgentTaskError(
      `origin must be one of [${AGENT_TASK_ORIGINS_PIN.join(", ")}]`,
    );
  }
  if (
    typeof record["status"] !== "string" ||
    !(AGENT_TASK_STATUSES_PIN as readonly string[]).includes(record["status"])
  ) {
    throw new InvalidPinnedAgentTaskError(
      `status must be one of [${AGENT_TASK_STATUSES_PIN.join(", ")}]`,
    );
  }
  requireInstant(record["createdAt"], "createdAt");
  requireInstant(record["updatedAt"], "updatedAt");
  if (!Array.isArray(record["events"])) {
    throw new InvalidPinnedAgentTaskError("events must be an array");
  }
  const seenEventIds = new Set<string>();
  for (const event of record["events"]) {
    if (event === null || typeof event !== "object" || Array.isArray(event)) {
      throw new InvalidPinnedAgentTaskError("each event must be an object");
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
      throw new InvalidPinnedAgentTaskError("event ids must be unique non-empty strings");
    }
    seenEventIds.add(e["id"]);
    requireInstant(e["at"], "event.at");
    if (
      typeof e["kind"] !== "string" ||
      !(AGENT_TASK_EVENT_KINDS_PIN as readonly string[]).includes(e["kind"])
    ) {
      throw new InvalidPinnedAgentTaskError(`event.kind '${String(e["kind"])}' is not canonical`);
    }
    requireString(e["summary"], "event.summary");
    if (typeof e["summary"] === "string" && e["summary"].length > 500) {
      throw new InvalidPinnedAgentTaskError("event.summary must be at most 500 characters");
    }
    if (e["correlationRef"] !== undefined) {
      requireString(e["correlationRef"], "event.correlationRef");
    }
  }
  return task as AgentTaskPin;
}

/* ====================================================================
 * The optional model/difficulty selection (P21-B, D4 — mirrors surface
 * requireValidModelSelection, fail-closed)
 * ==================================================================== */

/** Mirrors surface requireValidModelSelection (exact keys, non-empty strings). */
export function validatePinnedModelSelection(value: unknown): AgentTaskPin["modelSelection"] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidPinnedAgentTaskError("modelSelection must be an object { providerId, modelId, reasoningLevel }");
  }
  const selection = value as Readonly<Record<string, unknown>>;
  requireExactKeys(selection, ["modelId", "providerId", "reasoningLevel"], "modelSelection");
  requireString(selection["providerId"], "modelSelection.providerId");
  requireString(selection["modelId"], "modelSelection.modelId");
  requireString(selection["reasoningLevel"], "modelSelection.reasoningLevel");
  return selection as unknown as AgentTaskPin["modelSelection"];
}

/* ====================================================================
 * The seed-decision fold (mirrors surface resolveAgentTaskSeed)
 * ==================================================================== */
/**
 * Mirrors surface resolveAgentTaskSeed — the CONVERGENCE fold: given an
 * incoming intent (from ANY supported entrypoint) and the existing
 * tasks, decide CREATE vs RESUME. A task whose resume key matches, whose
 * status is resumable and whose updatedAt is inside the resume window is
 * RESUMED — never duplicated. Terminal and stale tasks never resume.
 *
 * The signature is INTERCHANGEABLE with the shared contract's fold so
 * the adapter (and the desktop host binding at P13-D) can inject the
 * real one; the mirror test asserts the two agree case-for-case.
 */
export function resolvePinnedAgentTaskSeed(
  intent: AgentTaskIntentPin,
  existing: readonly AgentTaskPin[],
  now: string,
): AgentTaskSeedDecisionPin {
  validatePinnedAgentTaskIntent(intent);
  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) {
    throw new InvalidPinnedAgentTaskError("now must be an ISO-8601 UTC instant");
  }
  const key = agentTaskResumeKeyPin(intent);
  for (const task of existing) {
    if (task.intent.kind !== intent.kind) continue;
    if (!isResumableAgentTaskStatusPin(task.status)) continue;
    if (agentTaskResumeKeyPin(task.intent) !== key) continue;
    const updatedMs = Date.parse(task.updatedAt);
    if (Number.isNaN(updatedMs)) {
      throw new InvalidPinnedAgentTaskError(
        `task '${task.id}' has an invalid updatedAt instant`,
      );
    }
    const ageSeconds = (nowMs - updatedMs) / 1000;
    if (ageSeconds >= 0 && ageSeconds <= AGENT_TASK_RESUME_WINDOW_SECONDS_PIN) {
      return { action: "RESUME", taskId: task.id };
    }
  }
  return { action: "CREATE", origin: "SURFACE_ACTION" };
}

/** Resolve the task id a seed decision refers to (fail-closed typing). */
export function seedDecisionTaskId(decision: AgentTaskSeedDecisionPin): AgentTaskIdPin | null {
  return decision.action === "RESUME" ? decision.taskId ?? null : null;
}

/** The origin a seed decision records (informational, mirroring the source). */
export function seedDecisionOrigin(decision: AgentTaskSeedDecisionPin): AgentTaskOriginPin {
  return decision.origin ?? "SURFACE_ACTION";
}
