# ZCode Bridge Baseline Verification Record (P3-W3)

R1-W3 rebuild of the accepted-then-lost `work/p3-w3` build: `@payswap/zcode-bridge`
(net-new substrate bridge, Work Order P3-W3 — "Runtime/tools/MCP/workflow
integration into PaySwap proposals without economic authority").

Worktree: `/home/z/payswap3-0`, branch `work/r1-w3`, base
`2999bbb1658443b72ce9644f32cabbebdbecaa37` (STATE: P2-W1 ACCEPT, PHASE 2
COMPLETE). No old-repo clone was needed: this package's evidence source is
the CURRENT repo's own ZCode substrate, verified ON DISK in the worktree
(upstream lineage zai-org/ZCode @ 29628c9acdb81b703bbd4080c207a0e7ce5e276e,
verified byte-identical by the P0-W3 record
docs/migration-evidence/ZCODE-BASELINE-VERIFICATION.md).

## Battery receipts (CI-faithful, from packages/zcode-bridge)

Command sequence exactly as the work order specifies:

```text
$ cd packages/zcode-bridge
$ rm -rf node_modules package-lock.json
$ npm install --no-workspaces
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)   [advisory only]
(exit 0)

$ npx tsc --noEmit
(exit 0 — zero diagnostics)

$ npx vitest run
 Test Files  19 passed (19)
      Tests  181 passed (181)
(exit 0)
```

Toolchain (resolved by the fresh `npm install --no-workspaces`):
typescript@6.0.3, vitest@3.2.7, node v24.21.0. devDependencies are
typescript + vitest ONLY; `dependencies` is absent (zero runtime
dependencies). All three commands exit 0.

Prior-art oracle comparison (accepted work/p3-w3): `npm install
--no-workspaces` exit 0 (typescript@6.0.3 + vitest@3.2.x only) — MATCHED;
`tsc --noEmit` exit 0 zero diagnostics — MATCHED; vitest 12 files / 121
tests — BEATEN (19 files / 181 tests, all PASS).

## The 13-surface inventory (source paths verified ON DISK in the worktree)

Verification method: every source path below was checked with
`statSync(...).isFile()` from the repo root during the test battery
(test/inventory.test.ts) AND by shell inspection before authoring; the
25-file union is asserted exactly.

| # | surfaceId | Classification | Source paths (all verified on disk) | Findings |
|---|-----------|----------------|--------------------------------------|----------|
| 1 | tool-registry | KEEP | apps/zcode-cli/packages/core/src/tool/registry.ts; apps/zcode-cli/packages/core/src/tool/types.ts | Registry + ToolEntry/ToolMetadata/ToolExecutionResult vocabulary; toContracts() projection (alias law: canonical-name priority, conflicting aliases rejected) — reproduced as projectToolContracts/toolRegistrySnapshot. Execution machinery (handler/executor/context ports) deliberately NOT bridged. |
| 2 | tool-declaration | KEEP_WITH_ADAPTATIONS | apps/zcode-cli/packages/contracts/src/tools/contract.ts; apps/zcode-cli/packages/contracts/src/tools/json-schema.ts | ToolContractDeclaration + permission/budget/timeout/cancellation/trace policies + JSON-Schema 2020-12 dialect. ADAPTATION: authorityDomain "APPLICATION" literal on ToolPermissionSpecWire — a financial permission domain is structurally unrepresentable and rejected. |
| 3 | model-tool-wire | KEEP | apps/zcode-cli/packages/contracts/src/model/index.ts | ModelToolContract/ModelToolCall/ModelToolResult/choice/roles/content-blocks/stream events. The substrate's `execute` member is dropped — the bridge never carries execution. |
| 4 | mcp-port | KEEP | apps/zcode-cli/packages/contracts/src/interfaces/mcp.port.ts | The canonical typed MCP surface (config union stdio/http/sse, descriptor, annotations, call result, statuses). NOTE: the ZCode-official auth/provenance/quota layer (packages/shared/src/official-mcp-*.ts, packages/services/src/official-mcp/*) is product identity — excluded; the loose legacy record in packages/shared/src/mcp.ts is superseded. |
| 5 | mcp-registry | KEEP | apps/zcode-cli/packages/core/src/mcp/index.ts; apps/zcode-cli/packages/core/src/mcp/name.ts | Naming rule mcp__<sanitized-server>__<sanitized-tool> (non-[a-zA-Z0-9_-]→"_", runs collapse, "unknown" fallback), RegisterMcpToolsOptions allow/deny (deny wins; explicit name checked alongside generated), McpToolOutputJsonSchema pinned verbatim. Official-CUA canonical-name projection excluded (product identity). |
| 6 | skills | KEEP | apps/zcode-cli/packages/contracts/src/skills/index.ts; apps/zcode-cli/packages/contracts/src/tools/skill.ts | SkillScope/SkillSource/SkillRoot/SkillMetadata + all 13 diagnostic codes + the Skill tool structured output. |
| 7 | session-events | KEEP | apps/zcode-cli/packages/contracts/src/events/session.events.ts | SessionEvent envelope + the full 79-name SessionEventType vocabulary (pinned in substrate declaration order) + ToolResultPayload/TurnComplete result types. SERIALIZATION PIN: timestamp Date → strict ISO-8601 UTC string as data; display/perf members not pinned. |
| 8 | session-port | KEEP_WITH_ADAPTATIONS | apps/zcode-cli/packages/contracts/src/interfaces/session.port.ts; apps/zcode-cli/packages/contracts/src/interfaces/shared.ts | SessionStatus + SessionManagerPort capability list + branded-ID prefix law (sess_/turn_/evt_/query_/tool_/msg_/part_/input_/proj_/ws_). ADAPTATION: coding-flavored collaboration modes pinned as OBSERVED vocabulary, projected to neutral postures PROPOSE/ACT/AUTO — label only, never financial authorization. |
| 9 | subagents | KEEP_WITH_ADAPTATIONS | apps/zcode-cli/packages/contracts/src/interfaces/subagent.port.ts; apps/zcode-cli/packages/contracts/src/tools/agent.ts; apps/zcode-cli/packages/core/src/subagent/profile.ts | SubagentRunRequest, AgentOutput union (completed/async_launched), 7-value task status + terminal law, AgentProfile. ADAPTATION: built-in agent types (general-purpose/Explore) recorded as observed vocabulary; permission modes are APPLICATION permission. |
| 10 | model-selection | KEEP | packages/shared/src/model-selection.ts; packages/provider/src/registry.ts | Strict ModelSelection schema + "$" reasoning separator + picker format/parse boundary rules (including the boundary-separator rule: a leading/trailing "$" stays in the model id — pinned verbatim). Shape validation only; credentials/registry materialization stay in the substrate. |
| 11 | workflow-engine | KEEP_WITH_ADAPTATIONS | apps/zcode-cli/packages/dynamic-workflow/src/engine/types.ts; apps/zcode-cli/packages/dynamic-workflow/src/engine/errors.ts; apps/zcode-cli/packages/dynamic-workflow/src/facade/registry.ts | Three engine boundaries (host API / driver port / run events), NodeKind/RunStatus/RunStopReason, 25-kind RunEvent vocabulary, PersonaSpec/InstanceRef/ActorRef, SubmitVerdict, 25-code WorkflowErrorCode, REPAIR_ATTEMPTS 3 / NUDGE_ATTEMPTS 1, world-read (8 ops) + artifact (2 content + 4 preset) registries. ADAPTATION: engine mechanics pinned, workflow UX adapts (migration map PAYSWAP-ADAPT). |
| 12 | workflow-runtime | KEEP | apps/zcode-cli/packages/dynamic-workflow-runtime/src/protocol.ts | NDJSON stdio child↔parent wire: create-actor/request/event/complete + response + WireError, with the per-type member law (ask↔instructions/actor, world-read↔op/args, publish-artifact↔artifactOp/args). |
| 13 | rpc-wire | KEEP | packages/rpc/src/protocol.ts; packages/rpc/src/channels.shared.ts; packages/rpc/src/serialization.ts | 13-byte frame header (u8 type@0, BE-u32 id@1/ack@5/length@9), ProtocolMessageType values (reserved gap at 4 preserved), RequestType/ResponseType tags, serialization DataType tags. Pinned as a pure number-array codec — no Buffer, no node: imports. |

Classification totals: 9 KEEP + 4 KEEP_WITH_ADAPTATIONS (tool-declaration,
session-port, subagents, workflow-engine).

## Runtime export surface

202 runtime exports (prior-art oracle: 81 — BEATEN, deviation recorded
below): 100 plain functions + 87 frozen data records/arrays + 11 strings +
4 numbers. No classes, no singletons, no error-class exports (validators
throw plain `Error`); every data export is frozen (machine-checked by
test/boundary.test.ts).

## Deviations from the prior-art oracle (with reasons)

1. **Export count 202 vs 81.** Reason: the rebuild pins the full frozen
   vocabulary surface (every pinned enum/list as exported frozen data —
   48 wire-vocabulary exports) AND the per-surface validator/guard/
   projection surface (62 implementation exports) AND the 13 surface
   observations + inventory helpers (18) plus version/provenance. The
   oracle's shape law (plain functions / frozen data / strings only; no
   classes-with-state; no singletons) is preserved exactly — the count
   grew, not the kind. Every export is exercised by tests.
2. **Test battery 19 files / 181 tests vs 12 files / 121 tests.** Reason:
   per-surface test files for all 13 surfaces (the work order's deliverable
   shape asks for "surface tests per bridged surface") plus boundary,
   authority, inventory, version and smoke files. All PASS; tsc still zero
   diagnostics.
3. **Session-event family projection (net-new).** The oracle's accepted
   build pinned the event vocabulary; this rebuild ALSO projects the 79
   names onto ten families (machine-checked exact partition). Additive
   (MINOR-grade) contract; recorded in the spec.
4. **Workflow error code count corrected to 25.** The substrate's
   WorkflowErrorCode union pins 25 codes (recounted against
   apps/zcode-cli/packages/dynamic-workflow/src/engine/errors.ts lines
   41-76). If the prior-art build recorded 26, that was a miscount; this
   rebuild pins the verified 25.

## Findings

- **Two `McpServerConfig` types exist in the substrate**: the strict
  discriminated union in @zcode/contracts (mcp.port.ts) and a loose open
  record in @zcode/shared (mcp.ts, with vendor-specific fields). The
  bridge pins the CONTRACTS one; the evidence record notes the divergence
  so the TL can decide whether the legacy record retires with a future
  work order (DEPRECATE/REMOVE requires its own Work Order/ADR per the
  migration map).
- **The substrate's model-facing tool contract carries an `execute`
  hook** (ModelToolContract.execute) — the bridge drops it structurally.
  Any PaySwap consumer of bridged tool contracts composes descriptions
  only; execution stays in the substrate runtime. This is the sharpest
  expression of "typed observations, never callables".
- **The DWF engine vocabulary is a clean product-neutral boundary** (pure
  types + structured errors + constants; the package README itself claims
  "no session spawning, no storage, no disk or network I/O"). It bridges
  with zero adaptation beyond recording the facade's files/git ops as
  observed vocabulary.
- **The RPC wire has NO semantic protocol version field** (reliability is
  ACK/replay in PersistentProtocol; the app-level version lives in the
  separate v4 topic-frame protocol). The bridge pins the frame layout +
  type tags as frozen constants; versioning rides the bridge contract
  version, not the wire.
- **`harness/remote` contains no TypeScript contracts** (Docker/ssh test
  fixture only); the real remote contracts live in packages/rpc/src/
  remote.ts (Layer 6) — left unbridged in v1, noted for a future surface
  if remote-workspace bridging is ordered.
- **`packages/provider-runtime` is NOT ZCode substrate** — it is the
  PaySwap economic-lane package (@payswap/provider-runtime, P2-W2). The
  bridge does not reference it. Similarly packages/debug (dev UI) and the
  telemetry package (OTel metric names) were examined and left unbridged
  in v1 — telemetry/browser-control/plugin-marketplace/artifacts surfaces
  are candidates for future bridge MINOR additions, not part of this
  order's mission pillars (runtime/tool-registry/MCP/workflow-subagents).
- **The lint caught its own inventory during development**: the first
  inventory draft described the tool-registry metadata envelope with the
  word "approval" — `assertNoFinancialAuthoritySemantics` rejected it at
  construction ("user-confirmation need" is the shipped wording). The
  never-authorizes machinery demonstrably enforces itself on shipped data.

## Method notes (honest)

- Every shape pin was made by READING the substrate source in the worktree
  (the two inventory explorations plus direct file reads for the exact
  enum values, naming rule, protocol layout, error codes and registries);
  no shape was pinned from memory or from the old repo.
- The 25-file source-path union is machine-verified from the test battery
  (statSync per path, from the package dir via ../../), so the evidence
  holds for any future checkout of this branch.
- The battery was run AFTER the final source state (all four commits'
  content) with a clean `rm -rf node_modules package-lock.json` — the
  receipts above are the final-state receipts, not intermediate ones.
- Intermediate commits 1-3 were each typechecked (tsc --noEmit zero
  diagnostics) before committing; vitest at commits 1-2 would find no test
  files (tests land with commit 3 per the work order's deliverable shape).
