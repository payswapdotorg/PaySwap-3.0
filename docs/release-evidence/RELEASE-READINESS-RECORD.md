# PaySwap 3.0 — Release Readiness Record (Gate E closure)

Status: AUTHORED at lane p8-w3 4/4 (the release lane's deliverable).
This record certifies **RELEASE-READINESS — the capability + the
evidence — NOT a deployment.** Production deployment remains subject
to EXPLICIT OPERATOR AUTHORIZATION (the standing law; see §6).

- Program: PaySwap 3.0 (the payswap.org rebuild on the canonical
  architecture; 28 work orders complete at this lane's base).
- Authoring lane: p8-w3 (branch `work/p8-w3`; work order P8-W3 — the
  operator-authorized final wave's release/operations lane).
- Companion records: docs/release-evidence/P8-W3-VERIFICATION-RECORD.md
  (the lane's claims→tests accounting); spec/operations/OPERATIONS.md
  (the lane specification).

---

## 1. Release identity

| Component | Value |
|-----------|-------|
| Base commit (the P8-W1+P8-W2 integration state; 28 work orders) | `b01a0a9` |
| Release lane branch | `work/p8-w3` — 4 linear commits: `92a6ace` (1/4) → `d234fcc` (2/4) → `8420a4d` (3/4) → 4/4 (this record's commit; see `git log -1`) |
| Worktree build-manifest digest (tool: `scripts/release/build-release-manifest.mjs`, run at `8420a4d`, the 3/4 code+tooling state) | **CORRECTED 2026-10-20 (post-Gate E audit — see §8):** the reproducible committed-tree walk at `8420a4d` is totalDigest **`fabaa261a7a30970f633da7ec21cc6f861b83d695ed5235a5692b806ca0bdbd9`** over **8,480 files** (0 symlinks); identity commitSha `8420a4d6dec90007e0ecdb4f008312a5a7429393`, environment label `p8-w3-release-candidate` (labels do not enter the digest). The originally-recorded walk (`a45dd3ba…` over 8,481 files) counted the lane worktree's `.git` pointer FILE — R6 ignores `.git` DIRECTORIES, and a linked worktree carries `.git` as a file. |
| FINAL merged-tree manifest digest | **CORRECTED 2026-10-20 (post-Gate E audit — see §8):** the reproducible committed-tree digest at commit `b9f9ab7bcaf3e24207f412bc766ab78f95928b07` is totalDigest **`33e05966ea14f5bfa46724ff384adfef5967ad81b45c960cf5eacbd3f3b0835a`** over **8,483 files** (0 symlinks), computed on a clean checkout and machine-verified against the committed artifact `docs/release-evidence/release-manifest-b9f9ab7.json` (`--verify` → PASS, 8,483 files match). Reproducibility law: any clean checkout of `b9f9ab7` (fresh clone or `git archive` export — not a linked worktree, not a battery-dirty tree) reproduces this digest byte-identically. The originally-pinned `81e51f17…` over 8,515 files was produced mid-census over the station working tree and is NOT reproducible from any checkout (§8). |

The deployment-identity contract this feeds is the four-component
digest-chained identity (commit SHA + environment record + build
digest + manifest digest — packages/operations/src/
deployment-identity.ts): a real deployment cites all four, and this
record supplies the manifest-digest input for the release candidate.

## 2. Certification receipts (the P8 wave's gates, exact refs)

| Gate | Receipt |
|------|---------|
| P8-W1 financial certification (`@payswap/financial-certification`) | Evidence record: `docs/financial-certification-evidence/P8-W1-VERIFICATION-RECORD.md`; worker branch head `b4a76199bd019d1966bb240d9bdabf462e3de745` (work/p8-w1 4/4); merge commit `53375e1`. Battery: 16f/134t ALL PASS, tsc 0, hermetic (oracle-exact at station re-run). |
| P8-W2 client certification (`@payswap/client-certification`) | Evidence record: `docs/client-certification-evidence/P8-W2-VERIFICATION-RECORD.md`; worker branch head `f46b4c97dca1b221eb983d84c48391d01e13d8e6` (work/p8-w2 4/4); merge commit `f348784`. Battery: 11f/87t ALL PASS, tsc 0, hermetic (oracle-exact at station re-run). |
| P8 wave integration | Commit `6c3501f`: layer annotations (financial-certification/client-certification = security layer, certification-gate authority not financial truth) + CI matrix 19→21 lanes + lockfile importers (51 packages) + ownership report regenerated 53/53 mapped, drift gate PASS byte-deterministic. State commit: `b01a0a9` (= this lane's base). |
| Gate D browser verification (the live end-to-end acceptance) | `docs/web-evidence/E2E-BROWSER-VERIFICATION-RECORD.md` — 2026-10-19 live acceptance: the real web product built from source, served + driven through the live Chrome browser with the real server and the authenticated operator session; all exercised flows passed (record is TL-authored, no worker self-report). |
| P8-W3 release/operations (`@payswap/operations`) — THIS LANE | Evidence record: `docs/release-evidence/P8-W3-VERIFICATION-RECORD.md`; branch `work/p8-w3` (4/4 linear from `b01a0a9`). Battery: 18f/134t ALL PASS, tsc 0, hermetic; manifest tool selftest 11 checks exit 0. |

## 3. Battery census

This lane's receipts (recorded at 4/4, hermetic offline):

| Command | Result |
|---------|--------|
| `cd packages/operations && npm install --no-workspaces --no-audit --no-fund` | exit 0 |
| `npx tsc --noEmit` | exit 0 (0 diagnostics) |
| `npx vitest run` | **18 test files / 134 tests ALL PASS** |
| `node ../../scripts/release/build-release-manifest.mjs --selftest` | exit 0 — ALL CHECKS PASSED |

Full-tree per-package census TEMPLATE (the 21 CI-matrix lanes; the
test-count cells were FILLED by the TL at Gate E integration: all 22 lanes
re-run by the TL on the merged tree at `b9f9ab7` (2026-10-20, hermetic
per-package `npm install --no-workspaces` + `vitest run`); the operations
row carries this lane's receipts 18f/134t):

| # | Package (CI lane) | Test files | Tests | Result (fill at integration) |
|---|-------------------|-----------:|------:|------------------------------|
| 1 | trust | 11 | 138 | ALL PASS (station re-run) |
| 2 | economic | 11 | 105 | ALL PASS (station re-run) |
| 3 | protocol | 21 | 238 | ALL PASS (station re-run) |
| 4 | provider-runtime | 13 | 159 | ALL PASS (station re-run) |
| 5 | surface | 11 | 106 | ALL PASS (station re-run) |
| 6 | capability | 18 | 230 | ALL PASS (station re-run) |
| 7 | agents | 18 | 158 | ALL PASS (station re-run) |
| 8 | command | 19 | 221 | ALL PASS (station re-run) |
| 9 | execution-graph | 14 | 141 | ALL PASS (station re-run) |
| 10 | lab | 16 | 147 | ALL PASS (station re-run) |
| 11 | merchant | 25 | 353 | ALL PASS (station re-run) |
| 12 | onchain-adapters | 15 | 135 | ALL PASS (station re-run) |
| 13 | onchain-domain | 14 | 197 | ALL PASS (station re-run) |
| 14 | onchain-extensions | 16 | 164 | ALL PASS (station re-run) |
| 15 | onchain-security | 31 | 384 | ALL PASS (station re-run) |
| 16 | route-compiler | 29 | 353 | ALL PASS (station re-run) |
| 17 | zcode-bridge | 19 | 181 | ALL PASS (station re-run) |
| 18 | opportunities | 12 | 181 | ALL PASS (station re-run) |
| 19 | adversarial | 18 | 146 | ALL PASS (station re-run) |
| 20 | financial-certification | 16 | 134 | ALL PASS (station re-run) |
| 21 | client-certification | 11 | 87 | ALL PASS (station re-run) |
| 22 | operations (added at integration; receipts above) | 18 | 134 | ALL PASS (this lane) |
| | **TOTAL (22 CI lanes)** | **376** | **4092** | **ALL PASS** |

Experience-layer station census (outside the CI matrix; pnpm-workspace route,
station re-run 2026-10-20 @ f9392a3 — unchanged by the P8 wave, zero source
overlap): ui 15f/226t · web 14f/116t · desktop 10f/85t. Full-tree station
battery across all 25 battery packages: **415 files / 4519 tests, ALL PASS.**

## 4. Operational readiness (the contracts that make release supportable)

- **Rollback + compensation (first-class).** Every promotion record in
  the functional append-only ledger carries version + digest; the
  coverage law fails closed on any promotion without its rollback
  record; a rollback record carries TYPED compensation evidence
  (UNDO_EFFECT / NET_ADJUSTMENT in exact integer cents /
  EVIDENCE_MARKER, each with its obligation reference and
  reconciliation requirement) plus its operator-authorization
  reference; the compensations are PROVABLY order-independent (every
  permutation yields the identical net-effect digest) and idempotent
  (set semantics). Rehearsal drills are advisory, Lab-namespaced —
  never production evidence.
- **Runbook index (the assembled `OPERATIONS_RUNBOOK`, 9 entries).**
  `rb-unknown-outcome` (UNKNOWN execution/settlement outcome),
  `rb-outbox-backlog` (outbox backlog growing),
  `rb-outbox-ambiguity` (ambiguous outbox publication — drain
  fail-stopped), `rb-security-quarantine`
  (security quarantine of a component), `rb-parity-drift`
  (environment configuration drift), `rb-secret-exposure`
  (secret exposure detected in an operational artifact),
  `rb-rollout-hold` (provider rollout hold / resume),
  `rb-rollback-execution` (rollback execution — compensation
  completion), `rb-restore-replay` (restore/replay drill —
  authoritative reconstruction).
  Every entry references the typed operator action(s) that execute it
  (the six-action catalog: trigger-reconciliation, execute-rollback,
  hold-rollout-stage, resume-rollout, release-quarantine,
  run-restore-replay-drill — each with authority level, checkable
  preconditions, typed effects, evidence obligations, rollback path),
  and every alert the entries cite exists in the declared alert rules
  — no orphan alerts, no untyped operational magic
  (checkRunbookIntegrity + checkOperatorActionCatalog machine-check
  the whole web).
- **Observability contracts.** The liveness/readiness separation law
  (readiness claims cite contract-backed sources or fail); the ten
  evidence counters (CUMULATIVE kinds monotonic — events published,
  outbox, reconciliation cases opened/resolved, terminal transitions,
  unknown outcomes open, rollout stages held, rollbacks executed,
  secret exposures detected — with GAUGE arity declared for depths);
  the protocol-ID-correlated operational event taxonomy; dashboards +
  alert routing with no orphan alerts. No health claim without a
  contract-backed source.
- **Provider environment + rollout.** The exact provider environment
  is a typed record; structural sandbox/live separation (a fake
  transport can never serve live behavior); activation is an
  append-only, evidence-gated ledger (operator input is never proof of
  integration); enablement is data, never a redeploy; the progressive
  exposure ladder (observe → canary-1 → 10% → 50% → full) with
  hold/rollback criteria and digest-chained stage verdicts.
- **Secrets hygiene.** Handles never values; the shared fail-closed
  scanner; the deterministic scrubber contract; rotation procedures
  with bounded overlap windows and epoch-bump obligations for
  authorization-sensitive keys.
- **Evidence lineage.** Every operational record chains to its
  predecessor's digest; verification detects tamper and splice;
  deterministic replay re-derives the chain.

## 5. Reproducible-build readiness

- The contract: `REPRODUCIBLE_BUILD_CONTRACT` (R1–R7) declared as
  data in packages/operations/src/reproducible-build.ts, pinned to the
  substrate tool `scripts/deterministic-tar-archive.mjs` (sorted
  deterministic walk, normalized modes, no ambient metadata, symlink
  link-entries, fail-closed walk, byte-determinism).
- The tool: `scripts/release/build-release-manifest.mjs` — the
  deterministic release-manifest builder over the repo tree (sorted
  POSIX file list, per-file sha256, total digest over the canonical
  entry stream, identity record from `git rev-parse HEAD` + `--env`);
  `--verify <file>` re-verifies a tree against a manifest (exit 0/1);
  `--selftest` proves the laws (11 checks, exit 0 at authoring).
- The receipt: the worktree digest in §1; the final merged-tree digest
  is filled at integration.

## 6. EXPLICIT BOUNDARY — what this record does NOT certify

**Production deployment is NOT executed.** Nothing in this program's
tree deploys, restarts or provisions anything: the operations package
is CONTRACTS + VERIFICATION ONLY (the NO-DEPLOYMENT-EXECUTION law,
machine-checked over its source every battery run), and no other
package in the census executes deployments either. **Production
deployment remains subject to EXPLICIT OPERATOR AUTHORIZATION — the
standing law.** This record certifies RELEASE-READINESS: that the
capability (the contracts + tooling above) and the evidence (the
certification receipts + battery census) exist and are verifiable.
When the operator authorizes a deployment, the four-component
deployment identity (commit SHA + environment record + build digest +
manifest digest), the rollback artifacts, the rollout gates and the
evidence lineage make that deployment — and its rollback, if needed —
verifiable against this record.

## 7. Known limitations carried into any release decision

1. GAP-02 (live-corridor certification is credential-gated and NOT
   performed — the P8-W1 record's honest limitation surface).
2. Live-provider activation requires live probe evidence this program
   does not produce (no network by law); activation records cite it,
   they never fabricate it.
3. The 8 documented ownership-mapping violations carried under
   ADR-0004/0005/0006 (R3×5 + R6×3) at the last integration; the
   operations lane's MODULE-OWNERSHIP annotation is TL-wired at
   integration (single-writer law).
4. The census table §3's full-tree cells are fill-at-integration
   placeholders; the final merged-tree battery re-run supersedes this
   template's blanks.

---

## 8. Evidence correction — the Gate E manifest digest (2026-10-20, post-closing audit)

A station audit performed after the closing report (resident TL,
2026-10-20 ~17:30Z) re-ran the release-manifest tool on a clean
checkout of `b9f9ab7` and found that the pinned final digest DID
NOT reproduce: a clean checkout walks **8,483 files** (totalDigest
`33e05966ea14f5bfa46724ff384adfef5967ad81b45c960cf5eacbd3f3b0835a`),
not the recorded 8,515 / `81e51f17…`.

**Root cause (forensically reconstructed — byte-exact).** The Gate E
manifest run happened mid-census on the station's main working tree
(between the `adversarial` and `client-certification` census lanes,
~16:04Z), and the walk included **32 untracked local artifacts**:
the 17 `husky` install shims under `.husky/_/`, plus 15 per-package
`package-lock.json` files left by the census battery installs
(`trust`, `economic`, `capability`, `agents`, `command`,
`execution-graph`, `lab`, `merchant`, `onchain-adapters`,
`onchain-domain`, `onchain-extensions`, `onchain-security`,
`route-compiler`, `opportunities`, `adversarial`). Reconstructing
exactly that tree — the committed `b9f9ab7` tree plus those 32
files — reproduces the recorded digest `81e51f17…` over 8,515 files
**byte-identically**. The reconstruction is exact; the defect is
confirmed: the recorded value covered the station's working
directory, not the repository.

**Why it matters.** The manifest digest is a component of the
four-component deployment identity (§1). A digest that cannot be
reproduced from a checkout cannot anchor a verifiable deployment,
and the original claim — "any checkout of `b9f9ab7` reproduces this
digest byte-identically" — was false as pinned.

**The correction (docs/state only — zero code change).**

1. §1's final digest is re-pinned to the committed-tree walk:
   `33e05966…` over 8,483 files. The verification artifact is
   committed at `docs/release-evidence/release-manifest-b9f9ab7.json`;
   `node scripts/release/build-release-manifest.mjs --verify
   docs/release-evidence/release-manifest-b9f9ab7.json` on any clean
   checkout of `b9f9ab7` prints `verify: PASS` (proved at station on
   a fresh clone; a deliberately-dirtied tree fails with
   `extra in tree` + digest mismatch).
2. The worktree digest row (§1) and the lane record
   (`docs/release-evidence/P8-W3-VERIFICATION-RECORD.md` §6) are
   corrected for the same defect class at smaller scope: that walk
   (8,481 files) counted the lane worktree's `.git` pointer file.
   The committed-tree walk at `8420a4d` is 8,480 files /
   `fabaa261a7a30970f633da7ec21cc6f861b83d695ed5235a5692b806ca0bdbd9`.
3. `spec/development-state/current-state.json` (P8-W3 receipt +
   notes) and the closing-report addendum are amended to cite the
   corrected values.
4. The originally recorded values remain cited here, never hidden:
   `81e51f17…`/8,515 (station working tree, mid-census) and
   `a45dd3ba…`/8,481 (worktree including its `.git` pointer) are
   historical facts of the Gate E session, reproducible only with
   the local artifacts described above.

**Standing discipline (reaffirmed, extended).** The release-manifest
 tool walks everything except `.git`/`node_modules` DIRECTORIES —
 run it only on a clean checkout (fresh clone or `git archive`
 export), never on a battery-dirty working tree and never on a
 linked worktree (whose `.git` is a file and gets counted). The
 P8-W3 worker's record already stated this discipline for npm
 lockfiles ("local npm lockfile artifact removed first so the walked
 tree = the committed tree"); this correction extends it to the two
 artifact classes that produced this defect (husky shims; the
 worktree `.git` pointer).
