/**
 * Wire-shape barrel (P3-W3, commit 1 layer): every pinned wire shape and
 * frozen canonical vocabulary, re-exported from its surface module.
 * Consumers import from the package root; this barrel exists to keep every
 * authored file within the 400-line package-local law.
 */

export {
  PACKAGE_NAME,
  SUBSTRATE_PIN,
  ZCODE_BRIDGE_VERSION,
  type ZcodeBridgeProvenance,
  type ZcodeBridgeStability,
} from "../version.ts";

export {
  AUTHORITY_BOUNDARY_LAW,
  BRIDGE_AUTHORITY_DOMAIN,
  FORBIDDEN_FINANCIAL_AUTHORITY_TERMS,
  type AuthorityBoundary,
  type BridgeAuthorityDomain,
  type ZcodeBridgeSurfaceClassification,
  type ZcodeBridgeSurfaceObservation,
} from "./authority.ts";

export {
  RUNTIME_ID_KINDS,
  RUNTIME_ID_PREFIXES,
  type RuntimeIdKind,
  type RuntimeIdParts,
  type RuntimeIdWire,
} from "./ids.ts";

export {
  TOOL_EXECUTION_MODES,
  TOOL_RISK_LEVELS,
  TOOL_SIDE_EFFECT_SCOPES,
  type McpPresentationWire,
  type ProviderNativeToolSpecWire,
  type ToolExecutionModeWire,
  type ToolMetadataWire,
  type ToolRegistryEntryWire,
  type ToolRegistrySnapshotWire,
  type ToolRiskLevelWire,
  type ToolSideEffectScopeWire,
} from "./tool-registry.ts";

export {
  TOOL_CANCELLATION_CLEANUPS,
  TOOL_DENY_PRIORITIES,
  TOOL_JSON_SCHEMA_DIALECT,
  TOOL_PERMISSION_PATTERN_SOURCES,
  TOOL_RESULT_BUDGET_RETENTIONS,
  TOOL_RESULT_BUDGET_STRATEGIES,
  TOOL_TRACE_RECORD_LEVELS,
  type NoToolTimeoutPolicyWire,
  type TimedToolTimeoutPolicyWire,
  type ToolAskOptionsWire,
  type ToolCancellationCleanupWire,
  type ToolCancellationPolicyWire,
  type ToolDeclarationWire,
  type ToolDenyPriorityWire,
  type ToolPermissionPatternSourceWire,
  type ToolPermissionSpecWire,
  type ToolResultBudgetArtifactWire,
  type ToolResultBudgetPreviewWire,
  type ToolResultBudgetStrategyWire,
  type ToolResultBudgetWire,
  type ToolTimeoutPolicyWire,
  type ToolTracePolicyWire,
  type ToolTraceRecordLevelWire,
} from "./tool-declaration.ts";

export {
  MODEL_CONTENT_BLOCK_KINDS,
  MODEL_MESSAGE_ROLES,
  MODEL_STREAM_EVENT_KINDS,
  MODEL_TOOL_CHOICE_KINDS,
  MODEL_TOOL_SIDE_EFFECT_SCOPES,
  type ModelCacheControlScopeWire,
  type ModelContentBlockKindWire,
  type ModelMessageRoleWire,
  type ModelStreamEventKindWire,
  type ModelToolChoiceWire,
  type ModelToolContractWire,
  type ModelToolCallWire,
  type ModelToolResultWire,
  type ModelToolSideEffectScopeWire,
} from "./model-tool.ts";

export {
  MCP_OAUTH_GRANT_KINDS,
  MCP_PROTOCOL_ERAS,
  MCP_PROTOCOL_VERSIONS,
  MCP_RUNTIME_SCOPES,
  MCP_SERVER_ISOLATIONS,
  MCP_SERVER_STATUS_KINDS,
  MCP_SERVER_TRANSPORT_TYPES,
  MCP_TOOL_ANNOTATION_HINTS,
  type McpCallToolRequestWire,
  type McpConnectionSnapshotWire,
  type McpContentBlockWire,
  type McpHttpServerConfigWire,
  type McpOAuthConfigWire,
  type McpOAuthGrantKindWire,
  type McpProtocolEraWire,
  type McpProtocolVersionWire,
  type McpRuntimeScopeWire,
  type McpServerConfigBaseWire,
  type McpServerConfigWire,
  type McpServerIsolationWire,
  type McpServerRuntimeSourceWire,
  type McpServerStatusKindWire,
  type McpServerStatusWire,
  type McpServerTransportTypeWire,
  type McpSseServerConfigWire,
  type McpStdioServerConfigWire,
  type McpToolAnnotationsWire,
  type McpToolAnnotationHintWire,
  type McpToolCallResultWire,
  type McpToolDescriptorWire,
} from "./mcp.ts";

export {
  MCP_TOOL_NAME_FALLBACK,
  MCP_TOOL_NAME_PREFIX,
  MCP_TOOL_NAME_SEPARATOR,
  MCP_TOOL_OUTPUT_JSON_SCHEMA,
  type McpToolNameParts,
  type McpToolRegistrationPolicyWire,
} from "./mcp-naming.ts";

export {
  SKILL_DIAGNOSTIC_CODES,
  SKILL_DIAGNOSTIC_SEVERITIES,
  SKILL_SCOPES,
  SKILL_SOURCES,
  type SkillDiagnosticSeverityWire,
  type SkillDiagnosticWire,
  type SkillLoadOutcomeWire,
  type SkillMetadataWire,
  type SkillPolicyWire,
  type SkillRootWire,
  type SkillScopeWire,
  type SkillSourceWire,
  type SkillStructuredOutputWire,
} from "./skills.ts";

export {
  BACKGROUND_TASK_KINDS,
  PERMISSION_DECISIONS,
  SESSION_EVENT_FAMILIES,
  SESSION_EVENT_FAMILY_NAMES,
  SESSION_EVENT_TYPES,
  TURN_COMPLETE_RESULT_TYPES,
  type BackgroundTaskKindWire,
  type ErrorPayloadWire,
  type PermissionDecisionWire,
  type SessionEventWire,
  type SessionEventTypeWire,
  type ToolResultPayloadWire,
  type TurnCompleteResultTypeWire,
} from "./session-events.ts";

export {
  COLLABORATION_MODE_POSTURES,
  COLLABORATION_POSTURES,
  OBSERVED_COLLABORATION_MODES,
  SESSION_MANAGER_CAPABILITIES,
  SESSION_STATUSES,
  type CollaborationPostureWire,
  type ObservedCollaborationModeWire,
  type SessionStatusWire,
  type SessionWire,
} from "./session-port.ts";

export {
  AGENT_PERMISSION_MODES,
  AGENT_PROFILE_SOURCES,
  OBSERVED_BUILT_IN_AGENT_TYPES,
  SUBAGENT_PORT_CAPABILITIES,
  SUBAGENT_TASK_STATUSES,
  SUBAGENT_TERMINAL_STATUSES,
  type AgentBackgroundedOutputWire,
  type AgentCompletedOutputWire,
  type AgentOutputWire,
  type AgentPermissionModeWire,
  type AgentProfileSourceWire,
  type AgentProfileWire,
  type AgentTextContentBlockWire,
  type SubagentRunRequestWire,
  type SubagentTaskSnapshotWire,
  type SubagentTaskStatusWire,
} from "./subagents.ts";

export {
  MODEL_PROVIDER_SEPARATOR,
  MODEL_REASONING_SEPARATOR,
  MODEL_SELECTION_ISSUES,
  MODEL_SELECTION_VALIDATION_KINDS,
  type ModelSelectionIssueWire,
  type ModelSelectionValidationKindWire,
  type ModelSelectionWire,
} from "./model-selection.ts";

export {
  DWF_ARTIFACT_CONTENT_OPS,
  DWF_ARTIFACT_PRESET_OPS,
  DWF_NODE_KINDS,
  DWF_NODE_OUTCOMES,
  DWF_NUDGE_ATTEMPTS,
  DWF_PROVIDER_STOP_KINDS,
  DWF_REPAIR_ATTEMPTS,
  DWF_RUN_EVENT_KINDS,
  DWF_RUN_STATUSES,
  DWF_RUN_STOP_REASONS,
  DWF_TERMINAL_RUN_STATUSES,
  DWF_WORKFLOW_ERROR_CODES,
  DWF_WORLD_READ_OPS,
  type DwfActorRefWire,
  type DwfAskProgressWire,
  type DwfAskStatsWire,
  type DwfCapsWire,
  type DwfErrorMismatchWire,
  type DwfInstanceRefWire,
  type DwfNodeKindWire,
  type DwfNodeOutcomeWire,
  type DwfPersonaSpecWire,
  type DwfProviderStopKindWire,
  type DwfRunEventKindWire,
  type DwfRunEventWire,
  type DwfRunStatusWire,
  type DwfRunStopReasonWire,
  type DwfSubmitVerdictWire,
  type DwfViolationWire,
  type DwfWorkflowErrorJsonWire,
} from "./workflow-engine.ts";

export {
  DWF_CHILD_MESSAGE_KINDS,
  DWF_PARENT_MESSAGE_KINDS,
  DWF_WIRE_EVENT_TYPES,
  DWF_WIRE_REQUEST_TYPES,
  type DwfChildMessageKindWire,
  type DwfCompleteMessageWire,
  type DwfCreateActorMessageWire,
  type DwfDeclareArtifactEventMessageWire,
  type DwfLogEventMessageWire,
  type DwfParentMessageKindWire,
  type DwfPhaseEnteredEventMessageWire,
  type DwfReportEventMessageWire,
  type DwfRequestMessageWire,
  type DwfResponseMessageWire,
  type DwfWireErrorWire,
  type DwfWireEventTypeWire,
  type DwfWireRequestTypeWire,
} from "./workflow-runtime.ts";

export {
  RPC_CHANNEL_CAPABILITIES,
  RPC_HEADER_FIELD_OFFSETS,
  RPC_HEADER_FIELD_WIDTHS,
  RPC_HEADER_SIZE,
  RPC_PROTOCOL_MESSAGE_TYPE_NAMES,
  RPC_PROTOCOL_MESSAGE_TYPES,
  RPC_REQUEST_TYPES,
  RPC_RESPONSE_TYPES,
  RPC_SERIALIZATION_DATA_TYPES,
  type RpcFrameHeaderWire,
} from "./rpc-wire.ts";
