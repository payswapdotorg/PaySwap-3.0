# GOV-W1 Verification Record — governance reconciliation

- Work order: GOV-W1 (dispatched 2026-10-19, packet `pkt_gov-w1.md`; audit
  `spec/development-state/TL-AUDIT-2026-10-19.md` §4 GOV lane scope)
- Lane: `work/gov-w1` (this repository, branch off base `0755624`
  "P7-E2E (Gate D) accepted" — verified `git log --oneline -1` before work)
- Worker: GOV-W1 (governance lane)
- Date: 2026-10-19/20
- Source of truth: repository only. Every count below was derived by running
  commands in the clone at base `0755624`; no worker self-report from other
  lanes was trusted without a repo artifact.

## 1. Records reconciliation (spec/development-state/current-state.json)

**Before:** 14 `completed_work_orders` records; the accepted merges
R1-W1/R1-W2/R1-W3, R2-W1/R2-W2/R2-W3, P7-W1/P7-W2/P7-W3 (9 merges) were
unrecorded (audit finding §3.1). **After:** 23 records covering EVERY accepted
merge on main (derived from `git log --oneline --merges`: 22 merges) plus the
P7-E2E Gate D closure record.

New records (each: id, status COMPLETE, worker_branch, worker_head_sha = merge
second parent, base_sha = dispatch base per the accept commit, accepted_via_merge
= merge SHA + date, evidence = merge-message battery digest + lane
`docs/<package>-evidence/**` + `spec/<package>/**`, completed_at = commit date;
field vocabulary matches the existing P0/R3 records — no new fields):

| id | package | merge | battery (merge message / evidence record) | completed_at |
| --- | --- | --- | --- | --- |
| R1-W1 | @payswap/agents | 0d0e906 | tsc 0; 18f/158t ALL PASS (92 ported + 66 net-new) | 2026-10-17T08:47:35Z |
| R1-W3 | @payswap/zcode-bridge | c5c5a23 | tsc 0; 19f/181t ALL PASS | 2026-10-17T09:08:16Z |
| R1-W2 | @payswap/execution-graph | 6999888 | tsc 0; 14f/141t ALL PASS | 2026-10-17T09:48:13Z |
| R2-W3 | @payswap/onchain-adapters | 6402fa9 | tsc 0; 15f/135t ALL PASS (oracle 13f/126t beaten) | 2026-10-17T13:11:38Z |
| P7-W2 | @zcode/desktop | fb074b4 | tsc -b desktop-host 0; 10f/85t ALL PASS (pnpm --filter, workspace battery) | 2026-10-17T17:40:14Z |
| P7-W3 | @payswap/command | 2c10a0e | tsc 0; 19f/221t ALL PASS | 2026-10-17T17:45:22Z |
| R2-W2 | @payswap/onchain-security | 95c8d8f | tsc 0; 31f/384t ALL PASS (oracle 31/331 exceeded) | 2026-10-17T22:50:42Z |
| P7-W1 | @zcode/ui + @zcode/web | 22b0534 | ui 15f/226t + web 14f/116t ALL PASS (workspace batteries) | 2026-10-18T00:09:33Z |
| R2-W1 | @payswap/onchain-domain | a86147a | tsc 0; 14f/197t ALL PASS | 2026-10-18T00:14:03Z |

Frontier: `GOV-W1` removed on completion → `["P6-W2","P6-W3","P8-W1","P8-W2",
"P8-W3"]`; `active_work_orders` stays `[]`; a state-transition note appended to
the existing `notes` field. Existing P0–P2/R3/P6-W1/P7-E2E records untouched.

## 2. CI matrix expansion (.github/workflows/ci.yml)

**Before:** `packages` job matrix = 6 entries (trust, economic, protocol,
provider-runtime, surface, capability) of 31 real `packages/*` dirs.
**After:** 17 entries — every package with a HERMETIC station battery (own
package.json + src + test; typescript + vitest devDeps; zero runtime and zero
`workspace:*` dependencies). Each runs the exact station battery unchanged:
`npm install --no-workspaces` → `npx tsc --noEmit` → `npx vitest run`.

Full inventory (31 dirs → battery → covered?):

| package | hermetic battery? | in matrix | note |
| --- | --- | --- | --- |
| trust | yes | YES (existing) | 11f/138t |
| economic | yes | YES (existing) | 11f/105t |
| protocol | yes | YES (existing) | 21f/238t |
| provider-runtime | yes | YES (existing) | 13f/159t |
| surface | yes | YES (existing) | 11f/106t |
| capability | yes | YES (existing) | 18f/230t |
| agents | yes | YES (NEW) | 18f/158t — station-verified this lane |
| command | yes | YES (NEW) | 19f/221t — verified |
| execution-graph | yes | YES (NEW) | 14f/141t — verified |
| lab | yes | YES (NEW) | 16f/147t — verified |
| merchant | yes | YES (NEW) | 25f/353t — verified |
| onchain-adapters | yes | YES (NEW) | 15f/135t — verified |
| onchain-domain | yes | YES (NEW) | 14f/197t — verified |
| onchain-extensions | yes | YES (NEW) | 16f/164t — verified |
| onchain-security | yes | YES (NEW) | 31f/384t — verified |
| route-compiler | yes | YES (NEW) | 29f/353t — verified |
| zcode-bridge | yes | YES (NEW) | 19f/181t — verified |
| ui | NO — test/ + vitest devDep but `workspace:*` deps (@zcode/provider, rpc, services, shared) + tsconfig project references; battery runs under pnpm workspace (`npx vitest run` in-dir per P7-W1 evidence: 15f/226t) | no | uncovered-by-station-battery; workspace-run evidence exists |
| web | NO — `workspace:*` deps (@zcode/client, shared, ui); `npm install --no-workspaces` cannot resolve them; battery = `pnpm --filter @zcode/web test` (14f/116t, P7-E2E-verified) | no | same |
| desktop | NO — vitest provided by workspace root (not in devDeps) + electron/node-pty postinstall; battery = `pnpm --filter @zcode/desktop test` (10f/85t) | no | same |
| services | NO — 3 test files but no test script, no vitest devDep, workspace deps | no | no executable battery declared |
| client | no test dir | no | no-test package |
| formal-proof | no test dir | no | no-test package |
| model-option-map | no test dir | no | no-test package |
| provider | no test dir | no | no-test package |
| provider-node | no test dir | no | no-test package |
| rpc | no test dir | no | no-test package |
| server | no test dir | no | no-test package |
| shared | no test dir | no | no-test package |
| zcode-cua | no test dir (no src either) | no | no-test package |
| zcode-server-cli | no test dir | no | no-test package |

No fake steps were invented for uncovered packages. The governance,
architecture, lint, typecheck jobs are preserved byte-identical (git diff of
the job blocks shows only the packages-matrix line and the header comment
changed).

Station-battery receipts for the 11 NEW matrix entries (run this lane in the
clone at base 0755624, `packages/<p>` cwd; install/tsc/vitest exit codes):

```
agents:            install 0, tsc 0, vitest 0  (Tests 158 passed)
command:           install 0, tsc 0, vitest 0  (Tests 221 passed)
execution-graph:   install 0, tsc 0, vitest 0  (Tests 141 passed)
lab:               install 0, tsc 0, vitest 0  (Tests 147 passed)
merchant:          install 0, tsc 0, vitest 0  (Tests 353 passed)
onchain-adapters:  install 0, tsc 0, vitest 0  (Tests 135 passed)
onchain-domain:    install 0, tsc 0, vitest 0  (Tests 197 passed)
onchain-extensions:install 0, tsc 0, vitest 0  (Tests 164 passed)
onchain-security:  install 0, tsc 0, vitest 0  (Tests 384 passed)
route-compiler:    install 0, tsc 0, vitest 0  (Tests 353 passed)
zcode-bridge:      install 0, tsc 0, vitest 0  (Tests 181 passed)
```

Every count EXACT-matches the lane's merge-commit/evidence battery — the
matrix entries are real, reproducible batteries.

## 3. Ownership coverage + fresh R6 derivation

**Coverage before:** 38 of 49 discovered workspace packages mapped
(11 R1-unmapped: agents, command, execution-graph, lab, merchant,
onchain-adapters, onchain-domain, onchain-extensions, onchain-security,
route-compiler, zcode-bridge). **After:** 49/49 mapped, 0 unmapped; every real
package dir appears exactly once (31 `packages/*` + 18 `apps/zcode-cli*`).
Layer per lane spec (authority); merchant derived from graph.md P5-W3 +
rails precedent (lane spec declares no layer — flagged for TL review in
LAYER-MAPPING.md). Additive-only; no existing layer rule, allow-list,
forbid-list, authority or dependency_rules entry modified.

**Fresh derivation (the audit's instruction: never trust the handoff's
"3 R6" claim).** FINDING: the COMMITTED report at base 0755624 was STALE —
it claimed `R6 x3` (the handoff-era V-52..V-54), while a fresh run at the
same tree yields `R1 x11, R3 x1, R6 x5` = 17 violations. Consequence: the CI
governance drift gate (`git diff --exit-code` on the report) was FAILING on
main before this lane. The report is now regenerated by the tool and
committed (byte-deterministic across runs — verified by consecutive-run
diff).

| rule | base (fresh run) | after GOV-W1 | disposition |
| --- | --- | --- | --- |
| R1-unmapped-package | 11 | 0 | fixed by the 11 additive annotations |
| R2-must-not-depend-on | 0 | 0 | — |
| R3-not-in-may-depend-on | 1 | 5 | web->provider-runtime (pre-existing, now ADR-0005) + 4 NEW honest violations surfaced by mapping agents/execution-graph to their spec-declared layers (type-only wire pins; ADR-0004). NOT suppressed, NOT silenced by reclassification or allow-list loosening. |
| R4-cycle | 0 | 0 | — |
| R5-deep-import | 0 | 0 | — |
| R6-cross-package-relative | 5 | 3 | 4 occurrences narrow-fixed (below); 3 structural entries remain (web->surface x4, web->provider-runtime x1, web->ui design-stub x1) → ADR-0005/0006 |
| R7-contracts-framework-import | 0 | 0 | — |
| **total** | **17** | **8** | |

Narrow fixes applied (the TL-handoff-scheduled class; every touched file is
an R6 violation site — no other package src/test edited):

1. `packages/ui/test/nonCliAcpRetirement.test.ts` — 2 cross-package relative
   imports (`../../shared/src/validationAppSettings.js`,
   `../../shared/src/validation.js`) → `@zcode/shared/validationAppSettings`
   + `@zcode/shared`. Additive exports entry `"./validationAppSettings":
   "./src/validationAppSettings.ts"` in `packages/shared/package.json`
   (zod schemas; `zcodeTaskMetaSchema` already root-re-exported via
   `export * from "./validation.js"`). The test file is OUTSIDE ui's vitest
   include (`test/payswap/**`) and ui's tsconfig include (`src/**`) —
   provably inert to every battery; the import now honors the package
   boundary.
2. `packages/web/vite.config.ts` + `packages/desktop/vite.config.ts` —
   `../ui/vite/pdfJsCMapsPlugin.js` → `@zcode/ui/vite/pdfJsCMapsPlugin`.
   Additive exports entry in `packages/ui/package.json`. Precedent for
   package-subpath imports in these exact configs: desktop's vite.config
   already imports `@zcode/shared/zcodeEndpoint` (exports → src TS single
   module, same class as the pdfJsCMapsPlugin module).

Structural violations → ADR stubs (status PROPOSED, numbered next; visible in
the report, never suppressed):

- `ADR-0004-type-only-wire-pins.md` — agents(intelligence)->trust;
  execution-graph(economic)->economic/protocol/capability. All occurrences
  are `import type` (verified: zero value imports from @payswap/* in either
  src tree); the layer allow-lists predate the pattern. Proposes a
  type-only-aware policy; until accepted the 4 R3s stay counted.
- `ADR-0005-web-pin-mirror-verification-edge.md` — web->provider-runtime
  (R3 platform->rails + R6) and web->surface (R6 x4), all inside
  `test/payswap/pin-mirror.test.ts` (P7-E2E-accepted suite). The package-
  export migration requires workspace devDeps + pnpm lockfile regeneration
  (toolchain unavailable in this lane; a stale lockfile would break CI
  frozen-lockfile installs) AND the layer adjudication regardless. Proposes
  a test-only verification-edge policy or a tooled migration.
- `ADR-0006-web-design-stub-re-export.md` — web->ui design.ts relative
  re-export (vitest externalizes bare @zcode/* workspace imports; a package
  import would break the suite). Proposes substrate-level options.

## 4. Command log (every command, exit code)

Run in the clone at `/home/z/my-project/payswap3-0`, branch `work/gov-w1`,
unless noted. (npm-based station batteries ran with `--no-audit --no-fund` for
noise reduction only; the CI matrix runs the bare commands.)

| # | command | exit |
| --- | --- | --- |
| 1 | `git clone https://github.com/payswapdotorg/PaySwap-3.0.git payswap3-0` | 0 |
| 2 | `git log --oneline -1` (base verify → `0755624`) | 0 |
| 3 | `git checkout -b work/gov-w1` | 0 |
| 4 | `git log --oneline --merges` (22 merges derived) | 0 |
| 5 | `ls packages/` (31 dirs) | 0 |
| 6 | `node tools/architecture-governance/check-module-ownership.mjs` (BASELINE fresh run: 49 checked, 38 mapped, 17 violations R1x11/R3x1/R6x5) | 1 |
| 7 | `node tools/architecture-governance/check-invariants.mjs` (baseline) | 0 |
| 8–40 | station battery × 11 new matrix packages (`npm install --no-workspaces`; `npx tsc --noEmit`; `npx vitest run`) | all 0 (counts in §2) |
| 41 | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` (5 jobs, 17 matrix entries) | 0 |
| 42 | `node -e JSON.parse(current-state.json)` (23 records; frontier/active verified) | 0 |
| 43 | `node tools/architecture-governance/check-invariants.mjs` (post records change) | 0 |
| 44 | `node tools/architecture-governance/check-module-ownership.mjs` (post annotations+fixes: 49/49 mapped, 8 violations R3x5/R6x3) | 1 |
| 45 | `node tools/architecture-governance/check-invariants.mjs` (post change) | 0 |
| 46 | `node --test "tools/architecture-governance/test/*.test.mjs"` (28/28 pass) | 0 |
| 47 | report determinism: run check-module-ownership twice, `diff` reports | identical (0) |
| 48 | `python3 -c "import yaml; yaml.safe_load(open('spec/architecture/MODULE-OWNERSHIP.yaml'))"` | 0 |
| 49 | `git diff --exit-code -- docs/architecture-governance/reports/module-ownership-report.json` (post commit 3: drift gate) | 0 (PASS) |
| 50 | final battery re-run post commit 3: ownership 1 (honest 8), invariants 0, tool tests 0 | 1 / 0 / 0 |

## 5. Limitations (honest, recorded)

1. The narrow R6 fixes touch ui/web/desktop/shared config + one inert test
   file; their full batteries (workspace/pnpm-dependent, electron build)
   could NOT be re-run in this sandbox (pnpm toolchain unavailable). Risk
   contained: the ui test file is outside every battery's include; the
   exports-map additions are purely additive; the vite-config import style
   has in-file precedent (`@zcode/shared/zcodeEndpoint`). The P7-E2E gate
   re-verification (web/desktop) is TL territory if deemed necessary.
2. ADR-0004/0005/0006 are stubs (Proposed). The 8 remaining violations
   (R3x5, R6x3) are REAL, counted, and machine-reported — accepting the
   ADRs (policy change + engine extension + report regen per INV-29) is the
   TL's call, not this lane's.
3. merchant's layer (rails) is derived (graph.md P5-W3 + provider-runtime
   precedent) because its lane spec declares no layer; flagged for TL review
   in LAYER-MAPPING.md.
4. The station batteries created untracked `package-lock.json` files in 6
   packages that do not commit locks; they were removed from the working
   tree and are NOT part of any commit (outside the write surface).
5. CI YAML was validated by parsing (python3/pyyaml) + inspection; GitHub
   Actions execution itself was not observable from this sandbox.
