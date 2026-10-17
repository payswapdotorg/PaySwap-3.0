/**
 * Pinned wire shapes: dynamic-workflow engine vocabulary (P3-W3).
 *
 * PIN of apps/zcode-cli/packages/dynamic-workflow/src/engine/types.ts (the
 * three engine boundaries: host API, driver port, run events — NodeKind,
 * NodeOutcome, RunStatus, RunStopReason, the 25-kind RunEvent vocabulary,
 * PersonaSpec, InstanceRef/ActorRef, submit verdicts, ask observations),
 * src/engine/errors.ts (the 25-code WorkflowErrorCode vocabulary and the
 * serializable WorkflowErrorJson), src/engine/concurrency.ts strategy
 * constants (REPAIR_ATTEMPTS / NUDGE_ATTEMPTS) and
 * src/facade/registry.ts (the world-read and artifact op registries).
 *
 * ADAPTATION (migration map: workflows appear on the PAYSWAP-ADAPT list —
 * the workflow UX adapts; the ENGINE mechanics are product-neutral KEEP):
 * the bridge pins the engine's deterministic vocabulary and journals; the
 * facade's files/git world-read ops are pinned as OBSERVED vocabulary.
 */

/** Workflow node kinds (pin of NodeKind). */
export type DwfNodeKindWire =
  | "ask"
  | "world-read"
  | "world-run"
  | "report"
  | "artifact";

/** The frozen node-kind vocabulary. */
export const DWF_NODE_KINDS: readonly DwfNodeKindWire[] = Object.freeze([
  "ask",
  "world-read",
  "world-run",
  "report",
  "artifact",
]);

/** Node outcomes (pin of NodeOutcome). */
export type DwfNodeOutcomeWire = "ok" | "failed" | "cancelled";

/** The frozen node-outcome vocabulary. */
export const DWF_NODE_OUTCOMES: readonly DwfNodeOutcomeWire[] = Object.freeze([
  "ok",
  "failed",
  "cancelled",
]);

/** Run lifecycle statuses (pin of RunStatus). */
export type DwfRunStatusWire =
  | "pending"
  | "running"
  | "completed"
  | "errored"
  | "stopped";

/** The frozen run-status vocabulary. */
export const DWF_RUN_STATUSES: readonly DwfRunStatusWire[] = Object.freeze([
  "pending",
  "running",
  "completed",
  "errored",
  "stopped",
]);

/** Terminal run statuses (the substrate's three settled states). */
export const DWF_TERMINAL_RUN_STATUSES: readonly DwfRunStatusWire[] =
  Object.freeze(["completed", "errored", "stopped"]);

/** Why a run stopped (pin of RunStopReason). */
export type DwfRunStopReasonWire =
  | "user"
  | "model"
  | "provider"
  | "interrupted"
  | "superseded";

/** The frozen run-stop-reason vocabulary. */
export const DWF_RUN_STOP_REASONS: readonly DwfRunStopReasonWire[] =
  Object.freeze(["user", "model", "provider", "interrupted", "superseded"]);

/** An ask-instance reference (pin of InstanceRef: siteId @ ordinal, ordinal from 1). */
export interface DwfInstanceRefWire {
  readonly siteId: string;
  readonly ordinal: number;
}

/** An actor reference (pin of ActorRef — same shape, actor semantics). */
export interface DwfActorRefWire {
  readonly siteId: string;
  readonly ordinal: number;
}

/** A frozen actor persona (pin of PersonaSpec: identity only — name + system prompt). */
export interface DwfPersonaSpecWire {
  readonly name?: string;
  readonly system?: string;
}

/** Run concurrency caps (pin of Caps). */
export interface DwfCapsWire {
  readonly maxConcurrency: number;
}

/** A typed-ask schema violation (pin of Violation). */
export interface DwfViolationWire {
  readonly path: string;
  readonly expected: string;
  readonly got: string;
}

/** The submit verdict a driver returns for an actor's result (pin of SubmitVerdict). */
export type DwfSubmitVerdictWire =
  | { readonly kind: "accept" }
  | { readonly kind: "reject"; readonly violations: readonly DwfViolationWire[] }
  | { readonly kind: "nudge" };

/** Ask statistics (pin of AskStats). */
export interface DwfAskStatsWire {
  readonly tokens: number;
  readonly toolCalls: number;
  readonly turns: number;
  readonly worldToolCalls?: number;
}

/** Ask progress (pin of AskProgress). */
export interface DwfAskProgressWire {
  readonly turn: number;
  readonly toolCalls: number;
  readonly lastTool?: {
    readonly name: string;
    readonly target?: string;
  };
}

/** Provider stop detail kinds (pin of ProviderStopDetails.kind). */
export type DwfProviderStopKindWire =
  | "auth"
  | "not_configured"
  | "model_unavailable"
  | "invalid_request"
  | "quota"
  | "other";

/** The frozen provider-stop-kind vocabulary. */
export const DWF_PROVIDER_STOP_KINDS: readonly DwfProviderStopKindWire[] =
  Object.freeze([
    "auth",
    "not_configured",
    "model_unavailable",
    "invalid_request",
    "quota",
    "other",
  ]);

/** Structured value mismatch (pin of WorkflowErrorMismatch). */
export interface DwfErrorMismatchWire {
  readonly expected: string;
  readonly got: string;
}

/** The serializable workflow error (pin of WorkflowErrorJson). */
export interface DwfWorkflowErrorJsonWire {
  readonly code: string;
  readonly message: string;
  readonly violations?: readonly DwfViolationWire[];
  readonly finalText?: string;
  readonly mismatch?: DwfErrorMismatchWire;
  readonly providerStop?: {
    readonly kind: DwfProviderStopKindWire;
    readonly reason: string;
  };
}

/**
 * The workflow error code vocabulary (pin of WorkflowErrorCode — all 25
 * codes, frozen in substrate declaration order).
 */
export const DWF_WORKFLOW_ERROR_CODES: readonly string[] = Object.freeze([
  "ValidationFailed",
  "ResultNotSubmitted",
  "DriverError",
  "WorldReadCapExceeded",
  "Cancelled",
  "ContextLimit",
  "ReportCapExceeded",
  "InputHashMismatch",
  "UnknownActor",
  "MissingAskSpec",
  "DuplicateActorName",
  "ScriptHashMismatch",
  "Interrupted",
  "ProviderStop",
  "ArtifactSourceMissing",
  "ArtifactPathOutsideWorkspace",
  "ArtifactTooLarge",
  "ArtifactStoreUnavailable",
  "ArtifactVersionCapExceeded",
  "ArtifactKindMismatch",
  "ArtifactCapExceeded",
  "ArtifactSpecInvalid",
  "ArtifactRedeclared",
  "ArtifactUndeclared",
  "ArtifactPrimaryConflict",
]);

/** The engine's repair strategy constants (pin of REPAIR_ATTEMPTS / NUDGE_ATTEMPTS). */
export const DWF_REPAIR_ATTEMPTS = 3 as const;
export const DWF_NUDGE_ATTEMPTS = 1 as const;

/**
 * The RunEvent vocabulary (pin of the RunEvent union discriminants — all 25
 * kinds, frozen in substrate declaration order). One engine transition per
 * event; `compaction` is reserved by the substrate and never emitted in v1.
 */
export type DwfRunEventKindWire =
  | "run-started"
  | "run-launched"
  | "actor-created"
  | "node-queued"
  | "node-dispatched"
  | "node-repairing"
  | "node-nudged"
  | "node-waiting"
  | "node-executing"
  | "concurrency-changed"
  | "run-caps-changed"
  | "node-settled"
  | "node-progress"
  | "usage-updated"
  | "log"
  | "import-cache-closed"
  | "phase-entered"
  | "report"
  | "artifact-published"
  | "artifact-failed"
  | "compaction"
  | "escalation-raised"
  | "escalation-resolved"
  | "run-stalled"
  | "run-settled";

/** The frozen run-event-kind vocabulary. */
export const DWF_RUN_EVENT_KINDS: readonly DwfRunEventKindWire[] =
  Object.freeze([
    "run-started",
    "run-launched",
    "actor-created",
    "node-queued",
    "node-dispatched",
    "node-repairing",
    "node-nudged",
    "node-waiting",
    "node-executing",
    "concurrency-changed",
    "run-caps-changed",
    "node-settled",
    "node-progress",
    "usage-updated",
    "log",
    "import-cache-closed",
    "phase-entered",
    "report",
    "artifact-published",
    "artifact-failed",
    "compaction",
    "escalation-raised",
    "escalation-resolved",
    "run-stalled",
    "run-settled",
  ]);

/** The world-read op registry (pin of WORLD_READ_REGISTRY ops — OBSERVED vocabulary). */
export const DWF_WORLD_READ_OPS: readonly string[] = Object.freeze([
  "glob",
  "read",
  "grep",
  "git-changed-files",
  "git-diff",
  "git-status",
  "git-log",
  "run",
]);

/** The artifact content ops (pin of ARTIFACT_REGISTRY family "content"). */
export const DWF_ARTIFACT_CONTENT_OPS: readonly string[] = Object.freeze([
  "file",
  "markdown",
]);

/** The artifact preset ops (pin of ARTIFACT_REGISTRY family "preset"). */
export const DWF_ARTIFACT_PRESET_OPS: readonly string[] = Object.freeze([
  "chart",
  "table",
  "metrics",
  "board",
]);

/** A workflow run event on the wire (engine Boundary C, descriptive slice). */
export interface DwfRunEventWire {
  readonly type: DwfRunEventKindWire;
  readonly runId?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}
