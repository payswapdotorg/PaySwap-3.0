# @payswap/operations — P8-W3 Verification Record (lane p8-w3)

Rebuild lane p8-w3. Branch `work/p8-w3`; base `b01a0a9`
(the integration commit that closed P8-W1+P8-W2 — 28 work orders
complete, the certification wave's first two lanes landed). Porting
source (evidence, not authority): payswap.org @
`8a735bf1639198c43115087a2992555166a9acf9` — the assigned slice of
packages/operations: 12 src files MINUS `browser-verification.ts`
(sibling W2 owns it — cross-referenced in
docs/client-certification-evidence/P8-W2-VERIFICATION-RECORD.md, not
claimed here) = 11 files, dispositioned below.

Package: `packages/operations` — `@payswap/operations` v0.1.0. Src 25
files / 5,390 lines (above the ~1,800–4,000 envelope — deviation
explained in §5); test 19 files / 2,970 lines (18 runnable test files
+ the house `node.d.ts`); **18 test files / 134 tests ALL PASS**. Spec:
spec/operations/OPERATIONS.md. Substrate tooling:
scripts/release/build-release-manifest.mjs (selftest-clean).

---

## 1. Commits (the 4-commit protocol, linear, no merges)

| # | Subject | SHA |
|---|--------|-----|
| 1/4 | package skeleton + deployment-identity/digest model (manifest/tsconfig/vitest per the house pattern; FNV-1a digest substrate; pins provider-runtime/lab/surface; environment records + configuration contract + completeness + preview/production parity; the four-component digest-chained deployment identity; the reproducible-build contract pinned to scripts/deterministic-tar-archive.mjs) | `92a6ace` |
| 2/4 | observability + rollback + rollout gates + runbook contracts (liveness/readiness law + monotonic digest-anchored evidence counters + protocol-ID-correlated event taxonomy; rollback with compensation evidence + coverage law + order-independence/idempotence + Lab-namespaced rehearsal drills; typed operator actions + assembled runbook with no-orphan-alerts integrity; exact provider environment + append-only activation ledger; progressive exposure ladder; secrets hygiene; digest-chained evidence lineage with deterministic replay; the NO-DEPLOYMENT-EXECUTION law as machine-checkable data + scanner) | `d234fcc` |
| 3/4 | the full test battery + manifest tool (18f/134t ALL PASS + selftest) — the battery, the ≤400-line file-law refactor (compensation/operator-catalog/provider-activation/secrets-rotation extracted), the boundary guard census receipts, scripts/release/build-release-manifest.mjs | `8420a4d` |
| 4/4 | spec + evidence (this record + the lane specification + the Gate E release-readiness record) | (see `git log -1`) |

## 2. Battery receipts (hermetic, recorded at 4/4)

| Command | Result |
|---------|--------|
| `cd packages/operations && npm install --no-workspaces --no-audit --no-fund` | **exit 0** |
| `npx tsc --noEmit` | **exit 0 (0 diagnostics)** |
| `npx vitest run` | **18 test files / 134 tests, ALL PASS** (~3.5s, fully offline, deterministic) |
| `node ../../scripts/release/build-release-manifest.mjs --selftest` | **exit 0 — ALL CHECKS PASSED** (11 checks: determinism two-runs-byte-identical; R1 sorted entries; R6 node_modules ignored; R2 mode normalization; R6/R7 output self-exclusion + determinism; verify pristine-passes / tamper-detected / extra-file-detected / mode-drift-detected / restored-passes) |

Per-file test counts (sum = 134): alerting 5, boundary 9,
deployment-identity 7, digest 5, environment 8, health 10, lineage 7,
no-execution 6, observability 6, operator-actions 6, pins 9,
provider-environment 9, reproducible-build 6, rollback 10, rollout 9,
runbook 7, secrets 10, smoke 5.

## 3. Claims → machine-pinned test sites

| Claim (hard law) | Test site (count) |
|------------------|-------------------|
| 1. Deployment identity: four required components, digest-chained in fixed order, byte-deterministic, tamper-evident; environment records + configuration contract + completeness + preview/production parity | `test/deployment-identity.test.ts` (7) + `test/environment.test.ts` (8) + `test/smoke.test.ts` (5) |
| 2. Reproducible build: the R1–R7 contract declared as data pinned to the substrate tool; canonical manifest stream; manifest shape; stream-identity law; the release tool implements + self-verifies the same laws | `test/reproducible-build.test.ts` (6) + `scripts/release/build-release-manifest.mjs --selftest` (11 checks, exit 0) |
| 3. Observability: protocol-ID-correlated taxonomy; liveness/readiness separation (readiness cites contract-backed sources or fails); monotonic digest-anchored evidence counters; dashboards + alert routing with no orphan alerts | `test/observability.test.ts` (6) + `test/health.test.ts` (10) + `test/alerting.test.ts` (5) |
| 4. Production health + rollback: versioned digest-chained rollback records with compensation evidence; the coverage law (a rollback for every promotion); order-independence + idempotence proofs; Lab-namespaced advisory rehearsals | `test/rollback.test.ts` (10) |
| 5. Runbook contracts: typed operator actions (attenuated authority, checkable preconditions, typed effects emitting taxonomy events, evidence obligations, rollback paths, existing runbook entries); the assembled runbook's no-orphan integrity | `test/operator-actions.test.ts` (6) + `test/runbook.test.ts` (7) |
| 6. Provider environment + rollout: the exact provider environment; structural sandbox/live separation (fake transport can never serve live); append-only activation ledger with fail-closed enablement; progressive exposure ladder with hold/rollback criteria + provider parity | `test/provider-environment.test.ts` (9) + `test/rollout.test.ts` (9) |
| 7. Secrets hygiene: handles never values; the shared fail-closed scanner; the scrubber contract; rotation procedures with overlap windows + epoch-bump obligations | `test/secrets.test.ts` (10) |
| 8. Evidence lineage: digest-chained records, tamper + splice detection, deterministic replay verifies the chain, replay equivalence | `test/lineage.test.ts` (7) |
| 9. No deployment execution: the capability class + digest-anchored operator-authorization boundary + the closed forbidden-execution vocabulary scanned over the REAL src tree | `test/no-execution.test.ts` (6) + `test/boundary.test.ts` (9 — the guard also re-runs the scanner over src) |
| Structural pins are byte-identical closed vocabularies (pins are not imports) | `test/pins.test.ts` (9) |
| Digest substrate: canonical serialization + FNV-1a 64 + deep-freeze | `test/digest.test.ts` (5) |

## 4. Oracle accounting (the 11-file slice, N = N)

| Old file (packages/operations/src @ 8a735bf) | Disposition | Rebuild site |
|----------------------------------------------|-------------|--------------|
| deployment.ts | ADAPTED | src/environment.ts + src/environment-gates.ts + src/deployment-identity.ts — the environment model/configuration contract/parity diff became the typed environment records + the four-component identity (the identity chain is the P8-W3 law; the old module had no identity chain) |
| observability.ts | ADAPTED | src/observability.ts + src/health.ts + src/alerting.ts — the event model split into the correlated taxonomy, the liveness/readiness + counter laws, and the dashboard/alert-routing layer (no-orphan-alerts added) |
| operator-actions.ts | ADAPTED | src/operator-actions.ts + src/operator-catalog.ts — the declaration types + catalog checker kept; the six-action catalog itself extracted as standalone data (the ≤400-line file law) |
| provider-activation.ts | ADAPTED | src/provider-activation.ts + src/provider-environment.ts — the versioned append-only activation ledger + fail-closed enablement kept; the exact provider environment split alongside (structural sandbox/live separation added) |
| provider-rollout.ts | ADAPTED | src/rollout.ts — the rollout-is-data law kept; the exposure ladder, digest-chained stage verdicts and hold/rollback criteria reauthored as the progressive-exposure gate set (parity refined: SANDBOX→LIVE is tier-progressive, not drift) |
| recovery.ts | REWRITTEN | src/rollback.ts + src/compensation.ts — the playbook-data shape became the first-class versioned rollback artifact: typed compensation evidence, the coverage law, the order-independence/idempotence proofs and the Lab-namespaced rehearsal drill (the old module's procedures were console-executable prose; the rebuild is contracts + provable laws) |
| runbook.ts | ADAPTED | src/runbook.ts — the indexed runbook + integrity checker kept; no-orphan-alerts integrity composed with the reauthored alerting layer |
| secrets.ts | ADAPTED | src/secrets.ts + src/secrets-rotation.ts — the handles-never-values law, scanner and scrubber kept; the rotation procedures extracted as standalone data (the ≤400-line file law) |
| digest.ts | ADAPTED | src/digest.ts — the house canonical-serialization + FNV-1a 64 pattern, reauthored locally (the same deliberately-local pattern every sibling package uses) |
| index.ts | ADAPTED | src/index.ts — the barrel (extended to the reauthored module set) |
| types/node-builtins.d.ts | REWRITTEN | test/node.d.ts — the old src-level node-builtin declarations are unnecessary (zero node: imports in src by law); the house test-layer declaration replaces the pattern |

Arithmetic: **11 = 9 ADAPTED + 2 REWRITTEN + 0 PORTED + 0 NET-NEW
(from oracle) + 0 SUPERSEDED-BY-SIBLING** (browser-verification.ts is
excluded from this slice — it is sibling W2's, cross-referenced not
claimed). NET-NEW modules WITHOUT an oracle counterpart (not in the
table, not in the arithmetic): src/reproducible-build.ts (the law-2
contract — the old package had no reproducible-build law),
src/no-execution.ts (the law-9 machine-checkable data + scanner),
src/lineage.ts (the law-8 standalone lineage module with deterministic
replay — the old chain mechanics lived inside the records modules),
src/pins/* (4 files — the certification-era structural-pin house
pattern) and scripts/release/build-release-manifest.mjs (NET-NEW
substrate tooling, per the work order).

## 5. Volume + the envelope deviation

Src 25 files / 5,390 lines (5,365 wc-l + the split-count convention the
census guard pins). The work order's envelope was ~1,800–4,000 lines.
The deviation is deliberate, three causes: (a) NINE hard laws each
encoded as a standalone contract module with fail-closed validation
and law-documentation headers — the slice covers what the old package
spread across operations + certification + lab; (b) the certification
-era structural pins (4 files) and the operator-catalog/rotation data
modules are pure data volume the old package carried in prose specs;
(c) the ≤400-line file law forces four modules to split where the old
package had single 500+-line files. Test volume 19 files / 2,970 lines;
max file 391 lines (the file law, machine-checked).

## 6. Worktree manifest digest (the release identity input)

Tool: `node scripts/release/build-release-manifest.mjs --env
p8-w3-release-candidate`, run over the lane worktree at commit
`8420a4d` (the 3/4 code+tooling state). **CORRECTED 2026-10-20
(post-Gate E audit — see RELEASE-READINESS-RECORD §8):** the
originally-recorded walk (8,481 files / `a45dd3ba…`) counted the lane
worktree's `.git` pointer FILE — R6 ignores `.git` DIRECTORIES, and a
linked worktree carries `.git` as a file, so "clean of untracked
files" was true except for that pointer. The reproducible
committed-tree values are:

- fileCount: **8,480** (symlinkCount 0; `node_modules` ignored per R6)
- totalDigest: **`fabaa261a7a30970f633da7ec21cc6f861b83d695ed5235a5692b806ca0bdbd9`**
- identity: commitSha `8420a4d6dec90007e0ecdb4f008312a5a7429393`,
  environment `p8-w3-release-candidate` (the label does not enter the
  totalDigest — it covers the canonical entry stream only)

Re-run the tool at any CLEAN checkout of `8420a4d` (fresh clone or
`git archive` export — not a linked worktree) to reproduce.

The TL re-runs the tool on the MERGED tree at integration and pins the
final digest in the release-readiness record.

## 7. Limitations (explicit — never overclaimed)

1. **Contracts only — no deployment executed.** The package defines
   and verifies the operational artifacts; nothing here deploys,
   restarts, provisions or touches any environment (law 9,
   machine-checked over the real src tree every battery run).
   Production deployment remains subject to EXPLICIT OPERATOR
   AUTHORIZATION (the standing law).
2. **No live-provider evidence.** Activation records REQUIRE live
   probe evidence as a REFERENCE — this package never produces that
   evidence (it cannot: no network by law). Every record in the
   battery is built over runtime-assembled synthetic fixtures.
3. **The release-readiness record certifies READINESS, not a
   deployment.** The Gate E record (RELEASE-READINESS-RECORD.md)
   assembles the capability + evidence census; executing the release
   is the operator's act, outside this package and this program's
   code.
4. **Digests are content addresses, not cryptography.** FNV-1a 64
   detects structural change (tamper-evident chaining); it is not a
   cryptographic defense (the house pattern, unchanged). The release
   manifest tool uses sha256 for file content (the substrate
   convention), chained through the same non-cryptographic discipline
   for identity linkage.
5. **Rehearsals and drills are advisory, Lab-namespaced.** Rollback
   rehearsals run over DERIVED fixtures and carry the Lab
   replay-namespace brand — they are never production rollback
   evidence (the pinned lab law).
6. **The battery's coverage census (§2 of the release-readiness
   record) is the TEMPLATE + this package's receipts.** The 21-lane
   CI-matrix census table's test-count cells are fill-at-integration
   placeholders the TL completes on the merged tree (single-writer
   law).

## 8. Write surface (this lane wrote NOTHING else)

- `packages/operations/**` — 47 tracked files at 3/4 (25 src + 19
  test + manifest/tsconfig/vitest) + this record's updates
- `scripts/release/build-release-manifest.mjs` — 1 file (NET-NEW
  substrate tooling)
- `spec/operations/OPERATIONS.md` — 1 file
- `docs/release-evidence/P8-W3-VERIFICATION-RECORD.md` — this file
- `docs/release-evidence/RELEASE-READINESS-RECORD.md` — the Gate E
  closure document

No root files, no sibling packages, no CI, no lockfile (the TL wires
MODULE-OWNERSHIP + the CI lane at integration — single-writer law).
The single append to the station worklog outside the worktree is the
delivery protocol's required exception.
