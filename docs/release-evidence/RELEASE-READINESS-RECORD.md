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
| Worktree build-manifest digest (tool: `scripts/release/build-release-manifest.mjs`, run at `8420a4d`, the 3/4 code+tooling state; `.git`/`node_modules` ignored per the R6 law) | totalDigest **`a45dd3ba77e0e7717ed482e832e12bea78dd38263872547129d573dd3960127f`** over **8,481 files** (0 symlinks); identity commitSha `8420a4d6dec90007e0ecdb4f008312a5a7429393`, environment label `p8-w3-release-candidate` (labels do not enter the digest) |
| FINAL merged-tree manifest digest | **FILLED at Gate E integration (TL, 2026-10-20)** — `node scripts/release/build-release-manifest.mjs --env payswap-3.0-gate-e-final` on the merged tree at commit `b9f9ab7bcaf3e24207f412bc766ab78f95928b07`: totalDigest **`81e51f174c943c56b02b6aa4ccaa1597da175699d48e29257977d962746e84d9`** over **8,515 files** (0 symlinks). Reproducibility law: any checkout of `b9f9ab7` reproduces this digest byte-identically (`--verify` mode). |

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
