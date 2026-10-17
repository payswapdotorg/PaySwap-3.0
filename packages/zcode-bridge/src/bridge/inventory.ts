/**
 * Bridge implementation: the 13-surface inventory (P3-W3).
 *
 * Every substrate surface this work order bridges, as one typed
 * observation: migration-map classification (KEEP / KEEP_WITH_ADAPTATIONS
 * per the product-neutrality law), the repo-relative source paths verified
 * ON DISK in this worktree, the substrate capabilities exposed
 * (descriptive only), and the never-financial-authority stamp. The
 * inventory is the single source the evidence record cites.
 */

import { validateZcodeBridgeSurfaceObservation } from "./authority.ts";
import { SUBSTRATE_AUTHORITY_BOUNDARY } from "./authority.ts";
import type { ZcodeBridgeSurfaceObservation } from "../wire/authority.ts";
import { SUBSTRATE_PIN, ZCODE_BRIDGE_VERSION } from "../version.ts";

function surface(input: Omit<ZcodeBridgeSurfaceObservation, "authority" | "substratePin" | "bridgeVersion">): ZcodeBridgeSurfaceObservation {
  return validateZcodeBridgeSurfaceObservation({
    ...input,
    authority: SUBSTRATE_AUTHORITY_BOUNDARY,
    substratePin: SUBSTRATE_PIN,
    bridgeVersion: ZCODE_BRIDGE_VERSION,
  });
}

/** Surface 1: tool registry (KEEP). */
export const TOOL_REGISTRY_SURFACE = surface({
  surfaceId: "tool-registry",
  title: "Tool registry",
  classification: "KEEP",
  sourcePaths: [
    "apps/zcode-cli/packages/core/src/tool/registry.ts",
    "apps/zcode-cli/packages/core/src/tool/types.ts",
  ],
  capabilities: [
    "Register and project substrate tools with a canonical-name-priority alias law",
    "Tool metadata safety envelope (risk level, side-effect scope, concurrency safety, user-confirmation need)",
    "Model-facing contract projection (one contract per model-visible name)",
  ],
  adaptationNotes: [],
  notes: [
    "Execution machinery (handler, executor, context ports) deliberately not bridged — the registry surface is descriptive only",
  ],
});

/** Surface 2: tool contract declaration (KEEP_WITH_ADAPTATIONS). */
export const TOOL_DECLARATION_SURFACE = surface({
  surfaceId: "tool-declaration",
  title: "Tool contract declaration",
  classification: "KEEP_WITH_ADAPTATIONS",
  sourcePaths: [
    "apps/zcode-cli/packages/contracts/src/tools/contract.ts",
    "apps/zcode-cli/packages/contracts/src/tools/json-schema.ts",
  ],
  capabilities: [
    "Tool declaration with JSON-Schema 2020-12 input/output contracts",
    "Permission spec with pattern sources and deny priority (APPLICATION permission)",
    "Result budget, timeout policy, cancellation policy, trace policy",
  ],
  adaptationNotes: [
    "ToolPermissionSpecWire carries an explicit authorityDomain: 'APPLICATION' literal — the migration map's critical boundary (ZCode application permission is not PaySwap financial authorization) is enforced structurally; a financial permission domain is unrepresentable",
    "ProviderNativeToolSpec.args is pinned as an optional passthrough record without interpreting provider-specific shapes",
  ],
  notes: [
    "Canonical JSON-Schema dialect pinned verbatim (TOOL_JSON_SCHEMA_DIALECT)",
  ],
});

/** Surface 3: model-facing tool wire (KEEP). */
export const MODEL_TOOL_WIRE_SURFACE = surface({
  surfaceId: "model-tool-wire",
  title: "Model-facing tool wire",
  classification: "KEEP",
  sourcePaths: ["apps/zcode-cli/packages/contracts/src/model/index.ts"],
  capabilities: [
    "Model tool contract (name, description, schemas, safety flags)",
    "Tool call and tool result round-trip records",
    "Tool choice forms, message roles, content-block kinds, streaming event vocabulary",
  ],
  adaptationNotes: [],
  notes: [
    "The substrate's ModelToolContract.execute member is deliberately dropped — a bridged contract describes a tool; the substrate runtime executes",
  ],
});

/** Surface 4: MCP port (KEEP). */
export const MCP_PORT_SURFACE = surface({
  surfaceId: "mcp-port",
  title: "MCP port and server config",
  classification: "KEEP",
  sourcePaths: ["apps/zcode-cli/packages/contracts/src/interfaces/mcp.port.ts"],
  capabilities: [
    "MCP server config union (stdio / http / sse) with isolation, protocol version and timeout base",
    "MCP tool descriptors with annotation hints (read-only, destructive, idempotent, open-world)",
    "MCP tool call results (content blocks, structured content, error flag, meta)",
    "Server status vocabulary (connecting, connected, disabled, disconnected, failed, untrusted)",
  ],
  adaptationNotes: [],
  notes: [
    "The ZCode-official auth/provenance layer (zcode_official jwt, official MCP trust, quota error codes) is product identity, not neutral platform mechanics — excluded from the bridge pin; the loose legacy config record in packages/shared/src/mcp.ts is superseded by this typed union",
  ],
});

/** Surface 5: MCP registry integration (KEEP). */
export const MCP_REGISTRY_SURFACE = surface({
  surfaceId: "mcp-registry",
  title: "MCP registry integration and naming",
  classification: "KEEP",
  sourcePaths: [
    "apps/zcode-cli/packages/core/src/mcp/index.ts",
    "apps/zcode-cli/packages/core/src/mcp/name.ts",
  ],
  capabilities: [
    "Model-visible MCP tool naming rule (mcp__<sanitized-server>__<sanitized-tool>)",
    "Registration policy (allow / deny lists evaluated over model-visible names, deny wins)",
    "MCP tool output wire schema (content array, structuredContent, isError, _meta)",
  ],
  adaptationNotes: [],
  notes: [
    "The official CUA (computer-use) canonical-name projection is product identity — excluded; the neutral naming and policy rules are pinned",
  ],
});

/** Surface 6: skills (KEEP). */
export const SKILLS_SURFACE = surface({
  surfaceId: "skills",
  title: "Skills",
  classification: "KEEP",
  sourcePaths: [
    "apps/zcode-cli/packages/contracts/src/skills/index.ts",
    "apps/zcode-cli/packages/contracts/src/tools/skill.ts",
  ],
  capabilities: [
    "Skill discovery roots with scope, source and priority",
    "Skill metadata (name, description, when-to-use, frontmatter keys, auto-load safety)",
    "Skill diagnostic codes and the Skill tool structured output",
  ],
  adaptationNotes: [],
  notes: [],
});

/** Surface 7: session events (KEEP). */
export const SESSION_EVENTS_SURFACE = surface({
  surfaceId: "session-events",
  title: "Session events",
  classification: "KEEP",
  sourcePaths: ["apps/zcode-cli/packages/contracts/src/events/session.events.ts"],
  capabilities: [
    "Session event envelope (id, session, turn, trace, sequence, payload)",
    "The full 79-name event vocabulary pinned in substrate declaration order",
    "Tool result payloads and turn-completion result types",
  ],
  adaptationNotes: [],
  notes: [
    "Serialization pin (not a semantic adaptation): the substrate's timestamp Date becomes a strict ISO-8601 UTC string carried as data at the bridge boundary — the accepted capability-lane freshness-stamp discipline",
    "ToolResultPayload display and perf members (UI/telemetry detail) are not pinned",
  ],
});

/** Surface 8: session port and runtime IDs (KEEP_WITH_ADAPTATIONS). */
export const SESSION_PORT_SURFACE = surface({
  surfaceId: "session-port",
  title: "Session port and runtime IDs",
  classification: "KEEP_WITH_ADAPTATIONS",
  sourcePaths: [
    "apps/zcode-cli/packages/contracts/src/interfaces/session.port.ts",
    "apps/zcode-cli/packages/contracts/src/interfaces/shared.ts",
  ],
  capabilities: [
    "Session status vocabulary and the session manager port surface (create, resume, fork, get, list)",
    "Runtime ID prefix law (sess_, turn_, evt_, query_, tool_, msg_, part_, input_, proj_, ws_)",
    "Collaboration modes pinned as observed vocabulary with a product-neutral posture projection",
  ],
  adaptationNotes: [
    "The substrate's coding-flavored collaboration modes (plan/build/edit/yolo/auto) are pinned as OBSERVED vocabulary and projected onto neutral postures (PROPOSE/ACT/AUTO) — a label projection only; even the AUTO posture (application-permission auto-approval) is never financial authorization",
    "ID formatting takes the suffix as explicit data (the substrate's crypto-random suffix generation is runtime machinery outside the bridge)",
  ],
  notes: [],
});

/** Surface 9: subagents (KEEP_WITH_ADAPTATIONS). */
export const SUBAGENTS_SURFACE = surface({
  surfaceId: "subagents",
  title: "Subagents",
  classification: "KEEP_WITH_ADAPTATIONS",
  sourcePaths: [
    "apps/zcode-cli/packages/contracts/src/interfaces/subagent.port.ts",
    "apps/zcode-cli/packages/contracts/src/tools/agent.ts",
    "apps/zcode-cli/packages/core/src/subagent/profile.ts",
  ],
  capabilities: [
    "Subagent run requests and the agent output union (completed | async_launched)",
    "Task snapshots with the 7-value status vocabulary and terminal-state law",
    "Agent profiles (system prompt, tool allow/deny lists, skills, MCP servers, model selection, turn budget)",
  ],
  adaptationNotes: [
    "The substrate's built-in agent types (general-purpose, Explore) and their coding tool lists are recorded as OBSERVED vocabulary — coding-product flavor noted, mechanics pinned",
    "Profile permission modes (auto | plan) are APPLICATION permission modes — never financial authorization",
    "Run-option machinery (AbortSignal, model override, request dependencies) is execution state outside the descriptive bridge",
  ],
  notes: [],
});

/** Surface 10: model and provider selection (KEEP). */
export const MODEL_SELECTION_SURFACE = surface({
  surfaceId: "model-selection",
  title: "Model and provider selection",
  classification: "KEEP",
  sourcePaths: [
    "packages/shared/src/model-selection.ts",
    "packages/provider/src/registry.ts",
  ],
  capabilities: [
    "Strict model selection shape (providerId, modelId, optional reasoningLevel)",
    "Canonical picker form (providerId/modelId[$reasoningLevel]) with formatting and boundary parsing rules",
    "Selection validation vocabulary (provider/model/reasoning-level outcomes)",
  ],
  adaptationNotes: [],
  notes: [
    "The bridge validates selection SHAPE only — provider credentials, registry materialization and account access are runtime machinery in the substrate",
  ],
});

/** Surface 11: dynamic-workflow engine (KEEP_WITH_ADAPTATIONS). */
export const WORKFLOW_ENGINE_SURFACE = surface({
  surfaceId: "workflow-engine",
  title: "Dynamic-workflow engine",
  classification: "KEEP_WITH_ADAPTATIONS",
  sourcePaths: [
    "apps/zcode-cli/packages/dynamic-workflow/src/engine/types.ts",
    "apps/zcode-cli/packages/dynamic-workflow/src/engine/errors.ts",
    "apps/zcode-cli/packages/dynamic-workflow/src/facade/registry.ts",
  ],
  capabilities: [
    "Engine vocabulary: node kinds, run statuses, stop reasons, the 25-kind run event vocabulary",
    "Persona specs, instance/actor references, submit verdicts, ask statistics",
    "The 25-code workflow error vocabulary with mismatch and provider-stop detail",
    "World-read op registry (files/git reads) and artifact op registry (content and preset families)",
  ],
  adaptationNotes: [
    "The migration map lists workflows under PAYSWAP-ADAPT (workflow UX adapts); the ENGINE mechanics are product-neutral and pinned here — the bridge pins vocabulary and journals, never the workflow UX",
    "The facade's files/git world-read ops are pinned as OBSERVED vocabulary (coding-domain flavor noted: glob, read, grep, git-*)",
    "Driver/host-api execution boundaries (createActorSession, worldRead effects, artifact publication) are execution machinery — only their typed shapes are pinned",
  ],
  notes: [
    "Repair/nudge strategy constants pinned (REPAIR_ATTEMPTS 3, NUDGE_ATTEMPTS 1)",
  ],
});

/** Surface 12: dynamic-workflow runtime protocol (KEEP). */
export const WORKFLOW_RUNTIME_SURFACE = surface({
  surfaceId: "workflow-runtime",
  title: "Dynamic-workflow runtime protocol",
  classification: "KEEP",
  sourcePaths: ["apps/zcode-cli/packages/dynamic-workflow-runtime/src/protocol.ts"],
  capabilities: [
    "NDJSON stdio wire between the workflow sandbox child and the host",
    "Child messages (create-actor, request, event, complete) with the per-type member law",
    "Parent responses and the serializable wire error form",
  ],
  adaptationNotes: [],
  notes: [
    "The child entry-file/spawn machinery (child-source.ts, child-entry-file.ts) is host runtime detail — the wire contract is pinned without it",
  ],
});

/** Surface 13: RPC transport wire (KEEP). */
export const RPC_WIRE_SURFACE = surface({
  surfaceId: "rpc-wire",
  title: "RPC transport wire",
  classification: "KEEP",
  sourcePaths: [
    "packages/rpc/src/protocol.ts",
    "packages/rpc/src/channels.shared.ts",
    "packages/rpc/src/serialization.ts",
  ],
  capabilities: [
    "The 13-byte frame header layout (u8 type; big-endian u32 id, ack, length)",
    "Protocol message types (regular, control, ack, disconnect, replay, pause, resume, keepalive)",
    "Channel RPC request/response tags and serialization data type tags",
  ],
  adaptationNotes: [],
  notes: [
    "The header codec is pinned over plain number arrays (no Buffer) — the bridge pins the layout; transport sockets, persistent-protocol replay and flow control are substrate runtime machinery",
  ],
});

/**
 * The full bridged-surface inventory — all 13 surfaces, frozen, in
 * mission-pillar order (tool registry, MCP, workflow/subagents, runtime,
 * selection).
 */
export const ZCODE_BRIDGE_SURFACES: readonly ZcodeBridgeSurfaceObservation[] =
  Object.freeze([
    TOOL_REGISTRY_SURFACE,
    TOOL_DECLARATION_SURFACE,
    MODEL_TOOL_WIRE_SURFACE,
    MCP_PORT_SURFACE,
    MCP_REGISTRY_SURFACE,
    SKILLS_SURFACE,
    SESSION_EVENTS_SURFACE,
    SESSION_PORT_SURFACE,
    SUBAGENTS_SURFACE,
    MODEL_SELECTION_SURFACE,
    WORKFLOW_ENGINE_SURFACE,
    WORKFLOW_RUNTIME_SURFACE,
    RPC_WIRE_SURFACE,
  ]);

/** The number of bridged surfaces (13). */
export const ZCODE_BRIDGE_SURFACE_COUNT = ZCODE_BRIDGE_SURFACES.length;

/** Look up a surface observation by its id. */
export function zcodeBridgeSurfaceById(
  surfaceId: string,
): ZcodeBridgeSurfaceObservation | undefined {
  return ZCODE_BRIDGE_SURFACES.find((item) => item.surfaceId === surfaceId);
}

/** All surfaces under one classification (KEEP or KEEP_WITH_ADAPTATIONS). */
export function zcodeBridgeSurfacesByClassification(
  classification: "KEEP" | "KEEP_WITH_ADAPTATIONS",
): readonly ZcodeBridgeSurfaceObservation[] {
  return Object.freeze(
    ZCODE_BRIDGE_SURFACES.filter((item) => item.classification === classification),
  );
}

/**
 * Verify the inventory law: 13 surfaces, unique kebab-case ids, every
 * surface frozen with the SUBSTRATE authority boundary, every
 * KEEP_WITH_ADAPTATIONS surface carries adaptation notes, and every source
 * path is a non-empty repo-relative string. Returns the surface count —
 * boundary tests assert on it.
 */
export function zcodeBridgeInventoryLaw(): number {
  if (ZCODE_BRIDGE_SURFACES.length !== 13) {
    throw new Error(
      `inventory law: expected 13 bridged surfaces, found ${ZCODE_BRIDGE_SURFACES.length}`,
    );
  }
  const ids = new Set<string>();
  for (const item of ZCODE_BRIDGE_SURFACES) {
    if (ids.has(item.surfaceId)) {
      throw new Error(`inventory law: duplicate surface id '${item.surfaceId}'`);
    }
    ids.add(item.surfaceId);
    if (!Object.isFrozen(item)) {
      throw new Error(`inventory law: surface '${item.surfaceId}' is not frozen`);
    }
    if (item.authority.domain !== "SUBSTRATE" || item.authority.financialAuthority !== false) {
      throw new Error(
        `inventory law: surface '${item.surfaceId}' does not carry the SUBSTRATE-only authority boundary`,
      );
    }
    if (item.classification === "KEEP_WITH_ADAPTATIONS" && item.adaptationNotes.length === 0) {
      throw new Error(
        `inventory law: KEEP_WITH_ADAPTATIONS surface '${item.surfaceId}' carries no adaptation notes`,
      );
    }
    for (const path of item.sourcePaths) {
      if (path.length === 0 || path.startsWith("/") || path.includes("..")) {
        throw new Error(
          `inventory law: surface '${item.surfaceId}' carries a non-repo-relative source path '${path}'`,
        );
      }
    }
  }
  return ZCODE_BRIDGE_SURFACES.length;
}
