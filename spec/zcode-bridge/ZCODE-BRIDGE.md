# PaySwap 3.0 ZCode Bridge — Contract Document

Status: FROZEN FOR IMPLEMENTATION (P3-W3)
Package: `@payswap/zcode-bridge` (`packages/zcode-bridge/`)
Layer: platform-adjacent bridge (MODULE-OWNERSHIP: treat as `platform`; may_depend_on [contracts, platform])
Consumers: agent model (P3-W1), execution graph (P3-W2), intelligence lanes (P6), experience shells (P7)
Work order: P3-W3 (spec/dependency/work-orders.md: "Runtime/tools/MCP/workflow integration into PaySwap proposals without economic authority")
Migration authority: spec/MIGRATION-FROM-ZCODE.md (the migration map governs what may be bridged)
Evidence: docs/zcode-bridge-evidence/BASELINE-VERIFICATION-RECORD.md

This document is the contract law of the ZCode bridge. The package is the
implementation; where code and this document disagree, that is a defect
(either fix the code or file an ADR — never silently diverge).

## 1. Position in the architecture

The bridge exposes the PINNED ZCode platform substrate — runtime, tool
registry, MCP, workflow/subagents — to PaySwap as typed, versioned,
framework-free contracts. It is a NET-NEW substrate bridge (P3-W3), pinned
against this repository's own ZCode substrate worktree (upstream lineage
zai-org/ZCode @ 29628c9, P0-W3 verified).

The bridge owns DESCRIPTION ONLY:

- the pinned wire shapes of 13 substrate surfaces (tool registry and
  declarations, model-facing tool wire, MCP server/tool contracts and
  naming, skills, session events and session/runtime IDs, subagents,
  model/provider selection, the dynamic-workflow engine vocabulary, its
  runtime NDJSON protocol, the RPC transport wire);
- validators, guards and projections over those shapes;
- the migration-map classification of every bridged surface
  (KEEP / KEEP_WITH_ADAPTATIONS) as typed, frozen observations.

It does NOT own and can NEVER hold: financial authority
(`no_parallel_financial_authority`; the financial semantics — obligation,
clearing, settlement, reservation, netting, custody, finality — live in
the financial/economic layers ONLY), execution (no handler, no `execute`,
no port invocation — the substrate runtime executes), application
permission decisions (the substrate's permission system is APPLICATION
permission; the bridge labels it, never exercises it), or any proxying of
financial calls (a substrate capability surfaces as a typed observation,
never as a callable).

### Layer law

`MODULE-OWNERSHIP.yaml` treats `packages/zcode-bridge` as `platform`
(may_depend_on [contracts, platform]) with the absolute constraint above.
P3-W3 pins the bridge as a ZERO-DEPENDENCY leaf: **zero runtime
dependencies, zero PaySwap sibling imports, zero non-relative imports in
src** (machine-checked by test/boundary.test.ts). Cross-plane shapes the
PaySwap lanes own (AmountSpec, observations, surface contracts) are NOT
imported; the bridge's outputs are framework-independent on the same
discipline as the accepted `@payswap/surface` contracts.

### Critical boundary (migration map)

"ZCode application permission is not PaySwap financial authorization."
Enforced structurally: `AuthorityBoundary` carries `domain: "SUBSTRATE"`,
`financialAuthority: false` (a literal type) and
`applicationPermissionOnly: true` (a literal type). There is no
`"FINANCIAL"` member in `BridgeAuthorityDomain`. A tool permission spec
claiming any authority domain other than the literal `"APPLICATION"` is
rejected by the validator. A capability description carrying
financial-authority vocabulary (authorize, settle, capture, payout,
refund, chargeback, custody, obligation, clearing, netting, reservation,
finality, ...) is rejected by the advisory lint
(`assertNoFinancialAuthoritySemantics`, whole-word, case-insensitive,
enumerated inflections — "network" can never trip a `net*` rule).

## 2. The 13 bridged surfaces

Each surface ships as a frozen `ZcodeBridgeSurfaceObservation`: kebab-case
id, title, migration-map classification, repo-relative source paths
verified on disk in the worktree, descriptive capabilities, the SUBSTRATE
authority stamp, the substrate pin, the bridge version, adaptation notes
(required when KEEP_WITH_ADAPTATIONS) and free-form pin notes.

| # | surfaceId | classification | source (repo-relative) |
|---|-----------|----------------|------------------------|
| 1 | `tool-registry` | KEEP | apps/zcode-cli/packages/core/src/tool/registry.ts; apps/zcode-cli/packages/core/src/tool/types.ts |
| 2 | `tool-declaration` | KEEP_WITH_ADAPTATIONS | apps/zcode-cli/packages/contracts/src/tools/contract.ts; apps/zcode-cli/packages/contracts/src/tools/json-schema.ts |
| 3 | `model-tool-wire` | KEEP | apps/zcode-cli/packages/contracts/src/model/index.ts |
| 4 | `mcp-port` | KEEP | apps/zcode-cli/packages/contracts/src/interfaces/mcp.port.ts |
| 5 | `mcp-registry` | KEEP | apps/zcode-cli/packages/core/src/mcp/index.ts; apps/zcode-cli/packages/core/src/mcp/name.ts |
| 6 | `skills` | KEEP | apps/zcode-cli/packages/contracts/src/skills/index.ts; apps/zcode-cli/packages/contracts/src/tools/skill.ts |
| 7 | `session-events` | KEEP | apps/zcode-cli/packages/contracts/src/events/session.events.ts |
| 8 | `session-port` | KEEP_WITH_ADAPTATIONS | apps/zcode-cli/packages/contracts/src/interfaces/session.port.ts; apps/zcode-cli/packages/contracts/src/interfaces/shared.ts |
| 9 | `subagents` | KEEP_WITH_ADAPTATIONS | apps/zcode-cli/packages/contracts/src/interfaces/subagent.port.ts; apps/zcode-cli/packages/contracts/src/tools/agent.ts; apps/zcode-cli/packages/core/src/subagent/profile.ts |
| 10 | `model-selection` | KEEP | packages/shared/src/model-selection.ts; packages/provider/src/registry.ts |
| 11 | `workflow-engine` | KEEP_WITH_ADAPTATIONS | apps/zcode-cli/packages/dynamic-workflow/src/engine/types.ts; apps/zcode-cli/packages/dynamic-workflow/src/engine/errors.ts; apps/zcode-cli/packages/dynamic-workflow/src/facade/registry.ts |
| 12 | `workflow-runtime` | KEEP | apps/zcode-cli/packages/dynamic-workflow-runtime/src/protocol.ts |
| 13 | `rpc-wire` | KEEP | packages/rpc/src/protocol.ts; packages/rpc/src/channels.shared.ts; packages/rpc/src/serialization.ts |

9 KEEP + 4 KEEP_WITH_ADAPTATIONS (tool-declaration, session-port,
subagents, workflow-engine). The adaptations:

- **tool-declaration**: `ToolPermissionSpecWire.authorityDomain` is the
  literal `"APPLICATION"` (the critical boundary made structural);
  provider-native `args` pinned as opaque passthrough.
- **session-port**: the coding-flavored collaboration modes
  (plan/build/edit/yolo/auto) pinned as OBSERVED vocabulary and projected
  onto neutral postures (PROPOSE/ACT/AUTO). The posture is a LABEL ONLY —
  even AUTO (the substrate's application-permission auto-consent) is never
  financial authorization. ID formatting takes the suffix as explicit data
  (no ambient randomness).
- **subagents**: the built-in agent types (general-purpose, Explore) and
  their coding tool lists recorded as OBSERVED vocabulary; profile
  permission modes are APPLICATION permission modes; run-option machinery
  (AbortSignal, model override) is execution state outside the bridge.
- **workflow-engine**: the migration map lists workflows under
  PAYSWAP-ADAPT (the workflow UX adapts); the ENGINE mechanics are
  product-neutral and pinned — vocabulary, journals, verdicts, error
  codes. The facade's files/git world-read ops are pinned as OBSERVED
  vocabulary (coding-domain flavor noted).

Pins recorded as NOTES (not adaptations): session-events carries the
ISO-8601 UTC timestamp-as-data serialization pin (the substrate's
`timestamp: Date` becomes a strict string at the bridge boundary — the
accepted capability-lane freshness-stamp discipline) and omits the
display/perf members of ToolResultPayload; mcp-port excludes the
ZCode-official auth/provenance/quota layer (product identity, not neutral
platform mechanics) and supersedes the loose legacy config record in
packages/shared/src/mcp.ts; model-tool-wire drops the substrate's
`ModelToolContract.execute` member (a bridged contract describes a tool;
the substrate runtime executes); rpc-wire pins the frame header codec over
plain number arrays (no Buffer — no node: imports in src).

## 3. The pinned vocabularies (frozen data)

All vocabularies are frozen arrays/maps pinned in substrate declaration
order (see src/wire/*): TOOL_RISK_LEVELS, TOOL_SIDE_EFFECT_SCOPES,
TOOL_EXECUTION_MODES, TOOL_PERMISSION_PATTERN_SOURCES, TOOL_DENY_PRIORITIES,
TOOL_RESULT_BUDGET_STRATEGIES, TOOL_CANCELLATION_CLEANUPS,
TOOL_TRACE_RECORD_LEVELS, TOOL_JSON_SCHEMA_DIALECT, MODEL_MESSAGE_ROLES,
MODEL_CONTENT_BLOCK_KINDS, MODEL_TOOL_CHOICE_KINDS, MODEL_STREAM_EVENT_KINDS,
MCP_SERVER_TRANSPORT_TYPES, MCP_PROTOCOL_VERSIONS, MCP_SERVER_ISOLATIONS,
MCP_SERVER_STATUS_KINDS, MCP_TOOL_ANNOTATION_HINTS, MCP_TOOL_OUTPUT_JSON_SCHEMA
(verbatim), MCP_TOOL_NAME_PREFIX/SEPARATOR/FALLBACK, SKILL_SCOPES,
SKILL_SOURCES, SKILL_DIAGNOSTIC_CODES (13), SESSION_EVENT_TYPES (79),
SESSION_EVENT_FAMILIES (10 families, exact partition — machine-checked),
TURN_COMPLETE_RESULT_TYPES, SESSION_STATUSES, OBSERVED_COLLABORATION_MODES,
COLLABORATION_MODE_POSTURES, SUBAGENT_TASK_STATUSES (7) +
SUBAGENT_TERMINAL_STATUSES, AGENT_PERMISSION_MODES, AGENT_PROFILE_SOURCES,
MODEL_REASONING_SEPARATOR ("$"), DWF_NODE_KINDS (5), DWF_RUN_STATUSES (5),
DWF_RUN_STOP_REASONS (5), DWF_RUN_EVENT_KINDS (25),
DWF_WORKFLOW_ERROR_CODES (25), DWF_PROVIDER_STOP_KINDS (6),
DWF_WORLD_READ_OPS (8), DWF_ARTIFACT_CONTENT_OPS (2) +
DWF_ARTIFACT_PRESET_OPS (4), DWF_REPAIR_ATTEMPTS (3) / DWF_NUDGE_ATTEMPTS (1),
RPC_HEADER_SIZE (13) + field layout, RPC_PROTOCOL_MESSAGE_TYPES (the
reserved gap at 4 is preserved), RPC_REQUEST_TYPES, RPC_RESPONSE_TYPES,
RPC_SERIALIZATION_DATA_TYPES, RUNTIME_ID_PREFIXES (sess_, turn_, evt_,
query_, tool_, msg_, part_, input_, proj_, ws_).

## 4. Versioning and stability

`ZCODE_BRIDGE_VERSION` ("1.0.0") follows the accepted semver-as-policy
discipline: MAJOR on breaking shape changes (requires a work order naming
the bridge + a spec/zcode-bridge update), MINOR on additive contracts
(a new bridged surface, a newly observed vocabulary member), PATCH on
wording/pure fixes. Every runtime consumer records the version it compiled
against. The substrate pin (`SUBSTRATE_PIN` =
29628c9acdb81b703bbd4080c207a0e7ce5e276e) travels on every surface
observation and on the provenance record.

## 5. Package-local law (machine-checked)

- Zero runtime dependencies; devDependencies typescript + vitest ONLY.
- No `node:` imports in src (tests may use them for boundary scanning);
  `test/node.d.ts` declares `process.cwd` as a FUNCTION global exactly
  once.
- No ambient clock, locale, randomness, environment or crypto in src —
  timestamps, IDs and randomness are explicit DATA.
- Every authored file <= 400 lines (lockfile exempt).
- The runtime export surface is plain functions / frozen data / strings /
  numbers only: no classes, no singletons. Errors are plain `Error`
  instances thrown by validators; the bridge exports no error class.
- No exported symbol name carries an authority verb
  (authorize/commit/execute/sign/capture/settle/refund/approve/dispatch/pay/
  hold/reserve).

## 6. Integration boundary (TL accept-time step)

This work order does NOT touch pnpm-workspace.yaml, pnpm-lock.yaml,
MODULE-OWNERSHIP.yaml, .github/workflows, packages/* other than
packages/zcode-bridge, or spec/* other than spec/zcode-bridge/. The
Tech Lead wires the package into the workspace (package_layers annotation
as `platform`-adjacent bridge) at integration time. Until then the package
is hermetic: `npm install --no-workspaces && npx tsc --noEmit && npx
vitest run` from the package directory is the CI-faithful battery.
