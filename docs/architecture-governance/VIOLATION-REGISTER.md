# P0-W2 Baseline Violation Register (inherited tree @ e40f2b9)

**Machine report:** `reports/module-ownership-report.json`
**Command:** `node tools/architecture-governance/check-module-ownership.mjs` — **exit 1**
**Mode:** strict (gate semantics). This is the HONEST BASELINE of the inherited
ZCode tree measured against the frozen PaySwap 3.0 layer policy. Nothing was
refactored to improve these numbers: a violation found is a deliverable.

## Headline numbers

| Metric | Value |
| --- | --- |
| Workspace packages checked | 32 (all mapped) |
| Package-level import edges | 76 |
| Layer rules (layers in policy) | 10 |
| Violations | **54** (54 error / 0 warn) |
| R3 not-in-may_depend_on | 51 |
| R6 cross-package relative | 3 |
| R2 / R4 / R5 / R7 | 0 / 0 / 0 / 0 |
| Packages FAIL | 25 (PASS: 7) |

The inherited tree predates the ownership map; every violation below is
**expected** and records where the PaySwap target architecture and the
inherited ZCode substrate disagree. Remediation proposals are exactly that —
proposals for later Work Orders with TL acceptance. Nothing here was fixed.

## Severity model

- **S1 (structural)** — an edge direction that contradicts the frozen layer
  policy *by layer class*: the target architecture cannot host this direction
  without a policy change (ADR territory) or a structural remediation.
- **S2 (structural, intra-platform)** — platform→platform edges. They violate
  the letter of `platform.may_depend_on: [contracts]` but stay inside the
  platform authority (no financial/trust boundary crossing). Remediation is
  consolidation, not authority surgery.
- **S3 (hygiene)** — boundary-integrity defects that don't change layer
  direction but bypass package interfaces.

## S2 — platform→platform edges outside may_depend_on (49 violations)

Layer policy: `platform.may_depend_on: [contracts]`. The inherited platform
substrate is composed of 30+ cooperating packages that import each other
freely. All 49 edges are platform→platform. Representative edges
(by import occurrence count):

| # | Edge | Occurrences | Remediation proposal |
| --- | --- | --- | --- |
| V-01 | packages/ui -> packages/services | 191 | Propose an explicit `platform-internal` sub-layering ADR: platform packages that consume other platform packages' *contracts* (typed surfaces) rather than implementations; or introduce `platform.may_depend_on: [contracts, platform]` via ADR if the substrate is to stay monolithic until PaySwap surfaces replace it. No source change before ADR acceptance. |
| V-02 | apps/.../bootstrap -> apps/.../adapters | 162 | Same ADR decision as V-01; bootstrap is a composition root — a composition root legitimately depends on everything it composes. Propose a `composition-roots` exemption class in the policy (additive annotation), or accept as documented S2 baseline. |
| V-03 | apps/.../bootstrap -> apps/.../core | 92 | Same as V-02. |
| V-04 | apps/.../bootstrap -> apps/.../dynamic-workflow | 82 | Same as V-02. |
| V-05 | apps/.../cli -> apps/.../tui | 72 | Terminal UI consumed by CLI shell — platform-internal; same ADR decision as V-01. |
| V-06 | packages/desktop -> packages/services | 60 | Desktop shell consumes platform services; same as V-01. |
| V-07 | apps/.../tui -> apps/.../i18n | 58 | i18n is effectively a contracts-grade utility; candidate reclassification `platform -> contracts` for i18n/shared-types-like packages in the next policy revision (additive annotation change, TL-gated). |
| V-08 | apps/.../cli -> apps/.../bootstrap | 46 | Composition-root inversion (cli loads bootstrap); same ADR decision as V-02. |
| V-09 | packages/services -> packages/rpc | 35 | Services consume RPC transport — classic platform-internal; same as V-01. |
| V-10 | packages/ui -> packages/provider | 33 | UI renders provider-derived model state; same as V-01. |
| V-11 | apps/.../contracts -> packages/shared | 30 | contracts→contracts edge (see S1 section — counted there). |
| V-12 | apps/.../cli -> apps/.../i18n | 22 | Same as V-07. |

(Remaining 37 edges are the same class: full enumerated list with file/line
evidence in `reports/module-ownership-report.json` → `violations[]`.)

## S1 — contracts-layer edges outside may_depend_on (2 violations)

`contracts.may_depend_on: []` — contracts are the floor of the graph.

| # | Edge | Occurrences | Why S1 | Remediation proposal |
| --- | --- | --- | --- | --- |
| V-50 | apps/zcode-cli/packages/contracts -> packages/shared | 30 | The CLI contracts package (declared contracts) imports another contracts package. Contracts composing contracts is archivable but violates the empty allow-list as written. | Either (a) accept `contracts.may_depend_on: [contracts]` by ADR (contracts composing contracts is domain-normal), or (b) merge the small typed surface into the CLI contracts package during P2-W3 surface work. Proposal: (a) — smallest change, honest semantics. |
| V-51 | packages/shared -> packages/model-option-map | 1 | The root contracts package imports a platform package (model option compilation). A contracts→platform edge points the wrong way under the frozen policy. | Long-term: move `compileModelOptionMap`'s pure mapping data into shared (contracts) and keep compilation in platform. Short-term: record as accepted baseline deviation; P1-W1 economic-model work will touch model config anyway. |

## S3 — boundary hygiene (3 violations)

| # | Edge | Occurrence | Remediation proposal |
| --- | --- | --- | --- |
| V-52 | packages/desktop -> packages/ui | vite.config.ts:8 imports `../ui/vite/pdfJsCmapsPlugin.js` | Build-config sharing across package roots. Proposal: publish the plugin from `@zcode/ui` exports map (`./vite-plugins`) and import by name during P7-W2 desktop work. |
| V-53 | packages/ui -> packages/shared | test/nonCliAcpRetirement.test.ts:6-7 relative-imports shared sources | Test-only bypass. Proposal: import via `@zcode/shared` subpath exports (the needed paths are already exported). |
| V-54 | packages/web -> packages/ui | vite.config.ts:7 same plugin pattern as V-52 | Same remediation as V-52, during P7-W1 web work. |

## Non-violations worth recording (honest positives)

- **R2 must_not_depend_on: 0.** No platform package reaches any
  financial-implementation surface (none exists yet — trivially true today,
  non-trivially guarded for the future).
- **R4 cycles: 0.** The 76-edge import graph is acyclic.
- **R5 deep imports: 0.** Every cross-package subpath import in the tree is
  covered by the target's exports map — the inherited tree is disciplined here.
- **R7 contracts framework freedom: 0.** All three contracts-layer packages
  (shared, cli/contracts, cli/shared-types) are free of UI/app framework
  imports — INV-27 is machine-checked green today.
- **Unresolved external specifiers: 248** (not violations): tooling scripts
  importing build-time externals (esbuild, typescript) not declared in their
  package.json, plus test-time imports. 40 of them are `#`-prefixed
  subpath-import specifiers (package.json `imports` field), which the
  resolver classifies as external — a documented scanner limitation recorded
  in the report, harmless for layer-direction analysis (`#` imports stay
  inside the importing package). Enumerated (first 50) in the report for
  dependency-hygiene follow-up; out of P0-W2 scope to remediate.

## What was deliberately NOT done

- No package was refactored, moved, or re-exported to reduce violations.
- No policy rule was edited (only additive `package_layers` annotations were
  appended; all pre-existing rules are byte-identical).
- No violation was downgraded or hidden; `--mode baseline` exists but the
  baseline report was produced in strict mode.
