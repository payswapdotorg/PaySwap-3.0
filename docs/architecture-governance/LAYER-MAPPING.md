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
| packages/model-option-map | model option compilation — reclassified platform → contracts by ADR-0003 (2026-10-11): leaf package, zero runtime deps, zero workspace imports, deterministic restricted-CEL typed surface; consumed by packages/shared (contracts). |
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

---

# GOV-W1 reconciliation additions (2026-10-19)

Base `0755624`. 11 lanes merged on main (R1/R2/P7/P6/R3 waves) without
package_layers annotations (audit finding TL-AUDIT-2026-10-19.md §3.3).
The validator's fresh run at base: 49 packages checked, 38 mapped,
11 unmapped (R1 x11). After these 11 additive annotations: 49/49 mapped,
R1 = 0. Mapping law unchanged: a package's layer is DECLARED per its lane
spec (the authority), never guessed from imports; the validator checks
reality against the declaration and reports every disagreement (the honest
baseline — see ADR-0004/0005 for the disagreements that surfaced).

## intelligence (3)

| Package | Why |
| --- | --- |
| packages/agents (@payswap/agents) | Lane spec `spec/agents/AGENT-MODEL.md` "Layer law": layer intelligence; RUNTIME LEAF, zero runtime deps; the ONE accepted sibling import is TYPE-ONLY (`AmountSpec`, `MandateRef`, authority wire types from `@payswap/trust`). R1-W1 rebuild of the accepted-then-lost work/p3-w1; merge 0d0e906. |
| packages/route-compiler (@payswap/route-compiler) | Lane spec `spec/route-compiler/ROUTE-COMPILER.md` §2: "v1 intelligence-layer package", v1 hermetic with zero sibling imports. R3-W1; merge c5a4dc7. |
| packages/lab (@payswap/lab) | Layer's own examples list includes "lab"; P6-W1 law (work-orders.md: "Simulated routes/events are advisory/test evidence only; no production financial authority") matches `cannot_authorize_financial_effects: true`. Merge 2251932 (salvage acceptance). |

## economic (1)

| Package | Why |
| --- | --- |
| packages/execution-graph (@payswap/execution-graph) | Lane spec `spec/execution-graph/EXECUTION-GRAPH.md` "Layer law": layer economic (the layer's own examples list includes "execution-graph"); RUNTIME LEAF; accepted sibling pins TYPE-ONLY to @payswap/economic, @payswap/protocol, @payswap/capability (wire shapes; ADR-0004). R1-W2; merge 6999888. |

## security (1)

| Package | Why |
| --- | --- |
| packages/onchain-security (@payswap/onchain-security) | Lane spec `spec/onchain-security/ONCHAIN-SECURITY.md`: "the security layer (spec/architecture/MODULE-OWNERSHIP.yaml, layer `security`)"; deterministic gates/signer authorization with `cannot_downgrade_block`. R2-W2; merge 95c8d8f. |

## rails (4)

| Package | Why |
| --- | --- |
| packages/onchain-domain (@payswap/onchain-domain) | Lane spec `spec/onchain-domain/ONCHAIN-DOMAIN.md`: "Layer: `rails` (owner: network)". R2-W1; merge a86147a. |
| packages/onchain-adapters (@payswap/onchain-adapters) | Lane spec `spec/onchain-adapters/ONCHAIN-ADAPTERS.md`: "Layer: `rails` (MODULE-OWNERSHIP law: may_depend_on [contracts, capability, trust, financial])"; deliberately dependency-free leaf-in-flight. R2-W3; merge 6402fa9. |
| packages/onchain-extensions (@payswap/onchain-extensions) | Lane spec `spec/onchain-extensions/ONCHAIN-EXTENSIONS.md` "Layer law (R3-W2)": "MODULE-OWNERSHIP places venue packs in layer `rails`". Merge e80c932. |
| packages/merchant (@payswap/merchant) | Lane spec declares NO layer (only derivation, recorded here for TL review): graph.md P5-W3 "merchant/Stripe … provider-verified Stripe paths. Reuse the shared funding/payout/observation/finality/reconciliation lifecycle; do not create a parallel payment engine" — a fiat-payment rail integration domain (rails examples: "fiat, payment"), reusing the financial lifecycle (allowed from rails: may_depend_on includes financial), money movement DELEGATED never owned (spec/merchant/MERCHANT.md law 1). Precedent: @payswap/provider-runtime mapped rails for exactly this provider-bridge shape (P2-W2 acceptance integration). Zero sibling imports today; the annotation is a declaration. Merge bbc9a93. |

## platform (2)

| Package | Why |
| --- | --- |
| packages/zcode-bridge (@payswap/zcode-bridge) | Lane spec `spec/zcode-bridge/ZCODE-BRIDGE.md`: "Layer: platform-adjacent bridge (MODULE-OWNERSHIP: treat as `platform`)". R1-W3; merge c5c5a23. |
| packages/command (@payswap/command) | Lane spec `spec/command/COMMAND.md` "Layer law": "MODULE-OWNERSHIP.yaml layer `platform`" (and §"adds `packages/command: platform` … to MODULE-OWNERSHIP.yaml's package_layers" — the lane itself prescribed this exact annotation). P7-W3; merge 2c10a0e. |

## Disagreements surfaced by the honest mapping (not silenced)

- `agents (intelligence) -> trust` and `execution-graph (economic) ->
  economic/financial/capability` — type-only wire pins; R3 visible; ADR-0004.
- `web (platform) -> provider-runtime (rails)` — test-only pin-mirror
  verification edge; R3+R6 visible; ADR-0005.
- `web -> ui` design-stub relative re-export — toolchain-structural; R6
  visible; ADR-0006. (The twin `pdfJsCMapsPlugin` build-config imports in
  web/desktop vite configs were narrow-fixed this lane: new
  `@zcode/ui/vite/pdfJsCMapsPlugin` package export; the ui test file's
  cross-package relative imports to shared were narrow-fixed via the new
  `@zcode/shared/validationAppSettings` export + root re-export.)

## Post-reconciliation counts

49 packages checked, 49 mapped, 0 unmapped. Annotation keys: 38 + 11 = 49.
Fresh violation totals and per-edge receipts:
`docs/architecture-governance/reports/module-ownership-report.json`
(machine-generated by `node tools/architecture-governance/check-module-ownership.mjs`
— never hand-edited).

## P8 certification wave (2026-10-20, operator-authorized; additive-only)

- `packages/financial-certification: security` — the financial conformance
  suite owns the CERTIFICATION GATE WALL (uniform gates across component
  kinds, escalate-only promotion ledger, digest-chained records). Hard
  policy gates = the security layer's deterministic-gates class; a failed
  gate cannot be downgraded (cannot_downgrade_block). Financial semantics
  are structurally PINNED from protocol/provider-runtime/route-compiler/
  merchant/surface/trust wires (zero imports) — certification-gate and
  evidence authority only, never financial truth (no parallel financial
  authority). Authority: spec/financial-certification/FINANCIAL-CERTIFICATION.md.
- `packages/client-certification: security` — the client-surface honesty
  suite (secret boundary, dead-action audit, truthful states, recipient
  re-verification, sandbox/live separation, a11y/responsive contracts,
  browser-verification contract). Same hard-gate class: failed client
  gates halt release and cannot be waived. Experience implementation stays
  in experience-layer packages; this package certifies their contracts.
  Authority: spec/client-certification/CLIENT-CERTIFICATION.md.

Counts after this wave: 53 packages checked, 53 mapped, 0 unmapped (machine report; base f9392a3 was 51/51 — the closing report's 49/49 was the GOV-era vintage).
