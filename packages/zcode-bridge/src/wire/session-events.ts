/**
 * Pinned wire shapes: session events (P3-W3).
 *
 * PIN of apps/zcode-cli/packages/contracts/src/events/session.events.ts: the
 * session event envelope and the full SessionEventType vocabulary (79 event
 * names, snake_case, frozen here in substrate declaration order) plus the
 * tool-call result payload and turn-completion result types.
 *
 * SERIALIZATION PIN (noted, classification stays KEEP): the substrate's
 * envelope carries `timestamp: Date`; this bridge pins the WIRE form as a
 * strict ISO-8601 UTC string carried as DATA (the accepted capability-lane
 * freshness-stamp discipline — deterministic, framework-free, no ambient
 * clock at the bridge boundary).
 */

/** The session event envelope on the wire (pin of SessionEvent). */
export interface SessionEventWire {
  readonly id: string;
  readonly sessionId: string;
  readonly turnId?: string;
  readonly type: SessionEventTypeWire;
  /** Strict ISO-8601 UTC string (serialization pin; see module header). */
  readonly timestamp: string;
  readonly traceId: string;
  readonly sequenceNumber: number;
  readonly payload: unknown;
}

/**
 * The session event type vocabulary (pin of SessionEventType values — all
 * 79, frozen in substrate declaration order).
 */
export type SessionEventTypeWire =
  | "session_created"
  | "session_resumed"
  | "session_forked"
  | "session_compacted"
  | "session_title_updated"
  | "session_mode_changed"
  | "session_ended"
  | "turn_started"
  | "turn_input_received"
  | "turn_steer_queued"
  | "turn_steer_delivery_changed"
  | "turn_steer_dispatch_changed"
  | "turn_steer_drained"
  | "turn_steer_rejected"
  | "turn_steer_discarded"
  | "session_input_promoted"
  | "turn_steer_reordered"
  | "queue_auto_drain_changed"
  | "followup_mode_changed"
  | "turn_complete"
  | "turn_error"
  | "user_message"
  | "assistant_message"
  | "assistant_feedback_updated"
  | "system_message"
  | "model_request"
  | "model_selected"
  | "model_streaming"
  | "streaming_tool_ledger_updated"
  | "stream_recovery_anchor_created"
  | "stream_recovery_started"
  | "stream_recovery_anchor_selected"
  | "stream_recovery_tail_discarded"
  | "stream_recovery_retry_started"
  | "stream_recovery_blocked"
  | "model_network_status"
  | "model_anomaly_warning"
  | "network_request_status"
  | "model_complete"
  | "model_error"
  | "tool_call_scheduled"
  | "tool_call_started"
  | "tool_call_progress"
  | "tool_call_result"
  | "tool_call_error"
  | "tool_batch_complete"
  | "background_task_started"
  | "background_task_updated"
  | "background_task_completed"
  | "dynamic_workflow_run_progress"
  | "permission_requested"
  | "permission_resolved"
  | "permission_denied"
  | "user_input_auto_resolution_updated"
  | "workspace_hook_review_requested"
  | "workspace_hook_review_settled"
  | "workspace_hook_review_superseded"
  | "workspace_hook_admission_updated"
  | "hook_run_started"
  | "hook_run_progress"
  | "hook_run_completed"
  | "hook_run_failed"
  | "hook_run_blocked"
  | "compact_started"
  | "compact_completed"
  | "compact_failed"
  | "compact_boundary"
  | "microcompact_boundary"
  | "rewind_triggered"
  | "checkpoint_created"
  | "target_changed"
  | "target_completion_verification"
  | "subagent_spawned"
  | "subagent_message"
  | "subagent_stopped"
  | "interrupt"
  | "cancel"
  | "resume"
  | "error";

/** The frozen session event type list (substrate declaration order). */
export const SESSION_EVENT_TYPES: readonly SessionEventTypeWire[] =
  Object.freeze([
    "session_created",
    "session_resumed",
    "session_forked",
    "session_compacted",
    "session_title_updated",
    "session_mode_changed",
    "session_ended",
    "turn_started",
    "turn_input_received",
    "turn_steer_queued",
    "turn_steer_delivery_changed",
    "turn_steer_dispatch_changed",
    "turn_steer_drained",
    "turn_steer_rejected",
    "turn_steer_discarded",
    "session_input_promoted",
    "turn_steer_reordered",
    "queue_auto_drain_changed",
    "followup_mode_changed",
    "turn_complete",
    "turn_error",
    "user_message",
    "assistant_message",
    "assistant_feedback_updated",
    "system_message",
    "model_request",
    "model_selected",
    "model_streaming",
    "streaming_tool_ledger_updated",
    "stream_recovery_anchor_created",
    "stream_recovery_started",
    "stream_recovery_anchor_selected",
    "stream_recovery_tail_discarded",
    "stream_recovery_retry_started",
    "stream_recovery_blocked",
    "model_network_status",
    "model_anomaly_warning",
    "network_request_status",
    "model_complete",
    "model_error",
    "tool_call_scheduled",
    "tool_call_started",
    "tool_call_progress",
    "tool_call_result",
    "tool_call_error",
    "tool_batch_complete",
    "background_task_started",
    "background_task_updated",
    "background_task_completed",
    "dynamic_workflow_run_progress",
    "permission_requested",
    "permission_resolved",
    "permission_denied",
    "user_input_auto_resolution_updated",
    "workspace_hook_review_requested",
    "workspace_hook_review_settled",
    "workspace_hook_review_superseded",
    "workspace_hook_admission_updated",
    "hook_run_started",
    "hook_run_progress",
    "hook_run_completed",
    "hook_run_failed",
    "hook_run_blocked",
    "compact_started",
    "compact_completed",
    "compact_failed",
    "compact_boundary",
    "microcompact_boundary",
    "rewind_triggered",
    "checkpoint_created",
    "target_changed",
    "target_completion_verification",
    "subagent_spawned",
    "subagent_message",
    "subagent_stopped",
    "interrupt",
    "cancel",
    "resume",
    "error",
  ]);

const FAMILY_SESSION: readonly SessionEventTypeWire[] = Object.freeze([
  "session_created",
  "session_resumed",
  "session_forked",
  "session_compacted",
  "session_title_updated",
  "session_mode_changed",
  "session_ended",
]);
const FAMILY_TURN: readonly SessionEventTypeWire[] = Object.freeze([
  "turn_started",
  "turn_input_received",
  "turn_complete",
  "turn_error",
]);
const FAMILY_INPUT_CONTROL: readonly SessionEventTypeWire[] = Object.freeze([
  "turn_steer_queued",
  "turn_steer_delivery_changed",
  "turn_steer_dispatch_changed",
  "turn_steer_drained",
  "turn_steer_rejected",
  "turn_steer_discarded",
  "session_input_promoted",
  "turn_steer_reordered",
  "queue_auto_drain_changed",
  "followup_mode_changed",
]);
const FAMILY_MESSAGE: readonly SessionEventTypeWire[] = Object.freeze([
  "user_message",
  "assistant_message",
  "assistant_feedback_updated",
  "system_message",
]);
const FAMILY_MODEL: readonly SessionEventTypeWire[] = Object.freeze([
  "model_request",
  "model_selected",
  "model_streaming",
  "streaming_tool_ledger_updated",
  "model_network_status",
  "model_anomaly_warning",
  "network_request_status",
  "model_complete",
  "model_error",
]);
const FAMILY_STREAM_RECOVERY: readonly SessionEventTypeWire[] = Object.freeze([
  "stream_recovery_anchor_created",
  "stream_recovery_started",
  "stream_recovery_anchor_selected",
  "stream_recovery_tail_discarded",
  "stream_recovery_retry_started",
  "stream_recovery_blocked",
]);
const FAMILY_TOOL: readonly SessionEventTypeWire[] = Object.freeze([
  "tool_call_scheduled",
  "tool_call_started",
  "tool_call_progress",
  "tool_call_result",
  "tool_call_error",
  "tool_batch_complete",
]);
const FAMILY_BACKGROUND_TASK: readonly SessionEventTypeWire[] = Object.freeze([
  "background_task_started",
  "background_task_updated",
  "background_task_completed",
  "dynamic_workflow_run_progress",
]);
const FAMILY_PERMISSION_AND_HOOKS: readonly SessionEventTypeWire[] = Object.freeze([
  "permission_requested",
  "permission_resolved",
  "permission_denied",
  "user_input_auto_resolution_updated",
  "workspace_hook_review_requested",
  "workspace_hook_review_settled",
  "workspace_hook_review_superseded",
  "workspace_hook_admission_updated",
  "hook_run_started",
  "hook_run_progress",
  "hook_run_completed",
  "hook_run_failed",
  "hook_run_blocked",
]);
const FAMILY_HISTORY_AND_LIFECYCLE: readonly SessionEventTypeWire[] = Object.freeze([
  "compact_started",
  "compact_completed",
  "compact_failed",
  "compact_boundary",
  "microcompact_boundary",
  "rewind_triggered",
  "checkpoint_created",
  "target_changed",
  "target_completion_verification",
  "subagent_spawned",
  "subagent_message",
  "subagent_stopped",
  "interrupt",
  "cancel",
  "resume",
  "error",
]);

/**
 * Event families: the bridge's projection of the substrate vocabulary into
 * the ten families PaySwap consumers reason about. Frozen map, family name
 * -> member event types (order mirrors SESSION_EVENT_TYPES).
 */
export const SESSION_EVENT_FAMILIES: Readonly<
  Record<string, readonly SessionEventTypeWire[]>
> = Object.freeze({
  session: FAMILY_SESSION,
  turn: FAMILY_TURN,
  input_control: FAMILY_INPUT_CONTROL,
  message: FAMILY_MESSAGE,
  model: FAMILY_MODEL,
  stream_recovery: FAMILY_STREAM_RECOVERY,
  tool: FAMILY_TOOL,
  background_task: FAMILY_BACKGROUND_TASK,
  permission_and_hooks: FAMILY_PERMISSION_AND_HOOKS,
  history_and_lifecycle: FAMILY_HISTORY_AND_LIFECYCLE,
});

/** The frozen family-name list. */
export const SESSION_EVENT_FAMILY_NAMES: readonly string[] = Object.freeze([
  "session",
  "turn",
  "input_control",
  "message",
  "model",
  "stream_recovery",
  "tool",
  "background_task",
  "permission_and_hooks",
  "history_and_lifecycle",
]);

/**
 * The tool result payload (pin of ToolResultPayload minus the display and
 * perf members, which are UI/telemetry detail outside the bridge's wire).
 */
export interface ToolResultPayloadWire {
  readonly success: boolean;
  readonly content: string;
  readonly error?: ErrorPayloadWire;
  readonly truncated?: boolean;
  readonly originalBytes?: number;
  readonly returnedBytes?: number;
  readonly budgetStrategy?: string;
  readonly artifactPath?: string;
}

/** An error payload (pin of ErrorPayload: type + message + optional detail). */
export interface ErrorPayloadWire {
  readonly type: string;
  readonly message: string;
  readonly detail?: string;
}

/** Turn completion result types (pin of TurnCompletePayload.resultType). */
export type TurnCompleteResultTypeWire =
  | "success"
  | "cancelled"
  | "error_max_turns"
  | "error_max_budget"
  | "error_during_execution"
  | "error_max_tool_calls";

/** The frozen turn-completion result-type vocabulary. */
export const TURN_COMPLETE_RESULT_TYPES: readonly TurnCompleteResultTypeWire[] =
  Object.freeze([
    "success",
    "cancelled",
    "error_max_turns",
    "error_max_budget",
    "error_during_execution",
    "error_max_tool_calls",
  ]);

/** Background task kinds (pin of BackgroundTaskPayloadBase.taskKind). */
export type BackgroundTaskKindWire = "bash" | "subagent" | "workflow";

/** The frozen background-task-kind vocabulary. */
export const BACKGROUND_TASK_KINDS: readonly BackgroundTaskKindWire[] =
  Object.freeze(["bash", "subagent", "workflow"]);

/** Permission resolution decisions (pin of PermissionResolvedPayload.decision). */
export type PermissionDecisionWire =
  | "allow"
  | "deny"
  | "escalate"
  | "modify";

/** The frozen permission-decision vocabulary. */
export const PERMISSION_DECISIONS: readonly PermissionDecisionWire[] =
  Object.freeze(["allow", "deny", "escalate", "modify"]);
