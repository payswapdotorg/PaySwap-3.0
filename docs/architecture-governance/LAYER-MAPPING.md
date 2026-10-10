# P0-W2 Declared-Layer Mapping Rationale

How every workspace package at base e40f2b9 was mapped to a declared layer in
the additive `package_layers` block of `spec/architecture/MODULE-OWNERSHIP.yaml`.

## Mapping law

1. The annotation block is ADDITIVE ONLY — no existing rule, layer, allow-list
   or forbid-list entry was touched (pairwise-disjoint and scope law).
2. A package's layer is **declared**, not inferred from imports; the validator
   checks reality against the declaration and reports every disagreement as a
   violation (the honest baseline).
3. `contracts` is reserved for provider-neutral shared protocols/types that
   the frozen architecture designates as the dependency floor.
4. Everything else in the inherited ZCode substrate is `platform` (the
   architecture's own platform examples list: rpc, transport, session, client,
   web, desktop, cli, telemetry, browser, plugins).
5. No package was mapped to economic/trust/capability/financial/rails/
   intelligence/security/experience layers: **those layers have no packages
   yet**. Mapping a platform package into a future authority layer to reduce
   violations would have been dishonest guesswork; the validator would then
   enforce fabricated constraints. Unmapped packages would be R1 violations;
   instead every real package is mapped to its honest inherited layer
   (platform), and the platform-vs-target disagreement shows up as R3
   violations — visible, counted, remediable by ADR.

## Per-package rationale

### contracts (3)

| Package | Why |
| --- | --- |
| packages/shared (@zcode/shared) | Root shared protocols/types consumed by literally every other package (16 dependents); zero framework imports (R7-verified). The architecture's contracts examples: "shared-protocols". |
| apps/zcode-cli/packages/contracts (@zcode/contracts) | CLI-scoped typed contracts surface (20 export keys), imports only @zcode/shared. |
| apps/zcode-cli/packages/shared-types (@zcode/shared-types) | Pure type-only shared surface, zero deps. |

### platform (29)

| Package | Why (examples from the layer's own vocabulary) |
| --- | --- |
| packages/rpc | rpc/transport (layer example: "rpc"). |
| packages/provider | model providers (platform authority owns model/tool selection). |
| packages/provider-node | provider runtime host. |
| packages/model-option-map | model option compilation (platform model config data). |
| packages/services | sessions, storage, process mgmt (layer example: "session"). |
| packages/client | client connectivity (layer example: "client"). |
| packages/server | server runtime (transport/session host). |
| packages/zcode-server-cli | server CLI entry. |
| packages/ui | web UI components (layer example "web"; UI *framework*, not the future PaySwap experience layer — see note). |
| packages/web | web app (layer example: "web"). |
| packages/desktop | desktop shell (layer example: "desktop"). |
| packages/formal-proof | d3-based internal proof-trace visualization tool — dev tooling, not a domain contract (has zero workspace deps but imports the d3 UI framework at runtime). |
| packages/zcode-cua | computer-use agent browser control (layer example: "browser"). |
| apps/zcode-cli | CLI app shell (layer example: "cli"). |
| apps/zcode-cli/packages/adapters | tool/provider adapters platform plumbing. |
| apps/zcode-cli/packages/bootstrap | CLI composition root. |
| apps/zcode-cli/packages/browser-use-plugin | plugin (layer example: "plugins"). |
| apps/zcode-cli/packages/cli | CLI command surface. |
| apps/zcode-cli/packages/core | CLI core runtime. |
| apps/zcode-cli/packages/debug | debug tooling. |
| apps/zcode-cli/packages/dynamic-workflow | workflow engine (platform workflows). |
| apps/zcode-cli/packages/dynamic-workflow-runtime | workflow runtime. |
| apps/zcode-cli/packages/i18n | localization platform utility. |
| apps/zcode-cli/packages/node-repl-host | REPL runtime host. |
| apps/zcode-cli/packages/swift-bridge | native bridge. |
| apps/zcode-cli/packages/telemetry | telemetry (layer example: "telemetry"). |
| apps/zcode-cli/packages/tui | terminal UI. |
| apps/zcode-cli/tools/prompt-trajectory | dev tool. |
| apps/zcode-cli/tools/typescript | vendored TS tool. |

### Note on ui/web/desktop vs the future `experience` layer

The frozen policy's `experience` layer (surface, web-ui, desktop-ui, mobile,
extension) is where PaySwap product surfaces will live (P7). The inherited
ZCode UI substrate is *platform* (it is the ZCode platform's own UI, which the
architecture explicitly calls the "ZCode-derived Web substrate" — a platform
substrate PaySwap will build ON). When P7-W1/W2 create PaySwap surface
packages, they get `experience` annotations; the substrate underneath stays
platform. This is the architectural thesis: "composed, not fused".

### Directories intentionally NOT annotated

- `apps/zcode-cli/packages/bundled-skills` and `superpowers-plugin`: content
  directories with no package.json — not workspace packages (annotating them
  would trip the validator's stale-annotation fail-closed check).

## Annotation counts vs discovery

34 annotation keys were first written; the validator's stale-annotation check
flagged exactly the 2 non-package directories; they were removed from the
annotation block (34 → 32). Discovered workspace packages: 32 = annotated 32.
No package is unmapped (R1 = 0 in the baseline).
