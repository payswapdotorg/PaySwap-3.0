/**
 * Implementation barrel (P3-W3, commit 2 layer): validators, guards,
 * projections, the provenance factory, and the 13 surface observations +
 * inventory — re-exported from the bridge modules.
 */

export {
  SUBSTRATE_AUTHORITY_BOUNDARY,
  assertNoFinancialAuthoritySemantics,
  findFinancialAuthorityTerms,
  isAuthorityBoundary,
  isZcodeBridgeSurfaceObservation,
  validateZcodeBridgeSurfaceObservation,
} from "./authority.ts";

export {
  formatRuntimeId,
  isRuntimeId,
  isRuntimeIdOfKind,
  parseRuntimeId,
  runtimeIdKindOf,
} from "./ids.ts";

export {
  isToolExecutionMode,
  isToolRiskLevel,
  isToolSideEffectScope,
  projectToolContracts,
  toolMetadata,
  toolRegistryEntry,
  toolRegistrySnapshot,
} from "./tool-registry.ts";

export {
  isToolPermissionPatternSourceList,
  toolCancellationPolicy,
  toolContractDeclaration,
  toolPermissionSpec,
  toolResultBudget,
  toolTimeoutPolicy,
  toolTracePolicy,
} from "./tool-declaration.ts";

export {
  isModelBoolean,
  isModelContentBlockKind,
  isModelMessageRole,
  isModelStreamEventKind,
  isModelToolChoice,
  modelToolCall,
  modelToolContract,
  modelToolResult,
} from "./model-tool.ts";

export {
  isMcpRuntimeScope,
  mcpServerStatus,
  mcpToolCallResult,
  mcpToolDescriptor,
  validateMcpServerConfig,
} from "./mcp.ts";

export {
  admitsMcpTool,
  mcpToolRegistrationPolicy,
  parseMcpToolName,
  toModelVisibleMcpNamePart,
  toMcpToolName,
} from "./mcp-naming.ts";

export {
  isSkillScope,
  isSkillSource,
  skillMetadata,
  skillRoot,
  skillStructuredOutput,
} from "./skills.ts";

export {
  isIsoUtcTimestamp,
  isSessionEventType,
  sessionEvent,
  sessionEventFamilyCoverage,
  sessionEventFamilyOf,
} from "./session-events.ts";

export {
  collaborationModePosture,
  isObservedCollaborationMode,
  isSessionStatus,
  sessionWire,
} from "./session-port.ts";

export {
  agentOutput,
  agentProfile,
  isSubagentTaskStatus,
  isSubagentTerminalStatus,
  subagentRunRequest,
  subagentTaskSnapshot,
} from "./subagents.ts";

export {
  formatModelSelection,
  isModelSelection,
  modelSelection,
  parseModelSelection,
} from "./model-selection.ts";

export {
  dwfPersonaSpec,
  dwfRef,
  dwfRefToString,
  dwfRunEvent,
  dwfSubmitVerdict,
  dwfWorkflowErrorJson,
  isDwfAskStats,
  isDwfNodeKind,
  isDwfPhaseNameList,
  isDwfRunEventKind,
  isDwfRunStatus,
  isDwfRunStopReason,
  isDwfWorkflowErrorCode,
} from "./workflow-engine.ts";

export {
  dwfCompleteMessage,
  dwfCreateActorMessage,
  dwfDeclareArtifactEventMessage,
  dwfLogEventMessage,
  dwfPhaseEnteredEventMessage,
  dwfReportEventMessage,
  dwfRequestMessage,
  dwfResponseMessage,
  dwfWireError,
  isDwfWireEventType,
} from "./workflow-runtime.ts";

export {
  decodeRpcFrameHeader,
  encodeRpcFrameHeader,
  isRpcProtocolMessageType,
  isRpcRequestType,
  isRpcResponseType,
  isRpcSerializationDataType,
  rpcProtocolMessageTypeName,
} from "./rpc-wire.ts";

export {
  MODEL_SELECTION_SURFACE,
  MODEL_TOOL_WIRE_SURFACE,
  MCP_PORT_SURFACE,
  MCP_REGISTRY_SURFACE,
  RPC_WIRE_SURFACE,
  SESSION_EVENTS_SURFACE,
  SESSION_PORT_SURFACE,
  SKILLS_SURFACE,
  SUBAGENTS_SURFACE,
  TOOL_DECLARATION_SURFACE,
  TOOL_REGISTRY_SURFACE,
  WORKFLOW_ENGINE_SURFACE,
  WORKFLOW_RUNTIME_SURFACE,
  ZCODE_BRIDGE_SURFACE_COUNT,
  ZCODE_BRIDGE_SURFACES,
  zcodeBridgeInventoryLaw,
  zcodeBridgeSurfaceById,
  zcodeBridgeSurfacesByClassification,
} from "./inventory.ts";

export { zcodeBridgeProvenance } from "./provenance.ts";
