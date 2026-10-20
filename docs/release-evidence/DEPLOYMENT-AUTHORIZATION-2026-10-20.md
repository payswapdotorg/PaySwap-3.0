# PaySwap 3.0 — Deployment Authorization Record (2026-10-20)

Status: AUTHORED by the resident TL at station, 2026-10-20 ~18:05Z.
This record captures the operator's PRODUCTION-DEPLOYMENT
AUTHORIZATION and assembles the verifiable identity inputs for that
act. Per the standing law (`spec/operations/OPERATIONS.md` §4;
`docs/release-evidence/RELEASE-READINESS-RECORD.md` §6), EXECUTING a
production deployment is a separate operator act on operator
infrastructure — this record is the authorization capture plus the
execution package, NOT an execution. Nothing in the program's tree
deploys, provisions or restarts anything (the no-deployment-execution
law, machine-checked every battery run).

## 1. The authorization

- Operator instruction: **"go"** — received 2026-10-20 ~17:25Z (UTC) in
  session `web-a95c8999-6661-4553-8cd4-51eedc9f4b24`, chat
  `31007aa4-a27f-408a-8da2-871cbf878596`, trace
  `1a15a572c639b141`, responding to the release-ready closing report
  (`docs/TL-CLOSING-REPORT-2026-10-20-P8-ADDENDUM.md`) whose stated
  remaining human step was exactly this authorization: "EXECUTING a
  production deployment remains a separate operator act requiring
  explicit authorization."
- Capture precedent: the P8 wave's authorization was captured the
  same way (addendum header — chat `web-a95c8999`, trace
  `1a159c052ff7e9c9`, "go", 2026-10-20).

## 2. The release-candidate identity (three of four components machine-pinned)

Per `packages/operations/src/deployment-identity.ts`, a deployment is
identified by EXACTLY four digest-chained components. This program
pins three; the fourth is the operator's target environment and is
deliberately NOT fabricated here.

| Component | Value | Pinned by |
|---|---|---|
| commit SHA | `b9f9ab7bcaf3e24207f412bc766ab78f95928b07` | git — the Gate E integration state, the code-complete release candidate. Every commit after it on `main` is docs/state only: `7dfece3` (Gate E record), `71e3d22` (state + addendum), `25fdece` (evidence correction §8 of the readiness record), and this record's commit. A deployment builds the `b9f9ab7` tree; deploying a later tip instead requires verifying the docs-only delta (enumerated above). |
| manifest digest | `33e05966ea14f5bfa46724ff384adfef5967ad81b45c960cf5eacbd3f3b0835a` over 8,483 files (0 symlinks) | `node scripts/release/build-release-manifest.mjs` on a clean checkout of `b9f9ab7`. Verification artifact: `docs/release-evidence/release-manifest-b9f9ab7.json` — `--verify` prints PASS (8,483 files match) on a clean checkout; a dirtied tree fails closed. Corrected value — the originally-pinned `81e51f17…`/8,515 covered the station's mid-census working tree (readiness record §8). |
| build digest | `016c0748e57eb39fb53a212f20813ff5d02b58d064b57f8345d13c84780618aa` | `computeDeterministicSourceSha256` (`scripts/deterministic-tar-archive.mjs`) over the `git archive b9f9ab7` clean export — station-computed 2026-10-20, reproducible from any checkout (`git archive` is deterministic given the commit). |
| environment record | **OPERATOR INPUT — not pinned by this program** | The deployment target per `packages/operations/src/environment.ts`: tier, region, execution mode (`SANDBOX`/`LIVE` — only `production` tier may declare `LIVE`), the environment-manifest fingerprint and the provider-bindings fingerprint. This station has no production environment, and the program's laws forbid fabricating one. The operator's deployment assembles `defineEnvironmentRecord(...)` with their real target values; `verifyDeploymentIdentity` then re-derives the digest-chained identity over all four components. |

## 3. The execution path (operator-side; every artifact already in the tree)

1. **Environment record** — assemble the typed target record
   (`environment.ts`); the environment gates
   (`environment-gates.ts`) fail closed on any drift between the
   declared target and the deployed substrate.
2. **Build** — produce the deterministic archive from the `b9f9ab7`
   tree (`scripts/deterministic-tar-archive.mjs`); the build digest
   must equal §2's pinned value.
3. **Manifest check** — `node scripts/release/build-release-manifest.mjs
   --verify docs/release-evidence/release-manifest-b9f9ab7.json`
   against the checkout being deployed: PASS required.
4. **Rollout** — the tier-progressive rollout plan (`rollout.ts`):
   SANDBOX→LIVE direction only, provider activation via the
   append-only activation ledger (`provider-activation.ts`,
   fail-closed enablement; live activation requires live probe
   evidence — cited, never fabricated, per GAP-02).
5. **Secrets** — the rotation procedures (`secrets-rotation.ts`,
   `secrets.ts` hygiene laws) before any LIVE credential enters the
   target.
6. **Verification** — the browser-verification contract
   (`packages/client-certification` — the repeatable Gate D form:
   six checks, eleven-area completeness, viewport matrix,
   console-error law, protocol correlation, INV-E04 ceiling) against
   the deployed surface.
7. **Operations** — the runbook index is live from day one
   (`runbook.ts`, 9 entries: `rb-unknown-outcome`,
   `rb-outbox-backlog`, `rb-outbox-ambiguity`,
   `rb-security-quarantine`, `rb-parity-drift`,
   `rb-secret-exposure`, `rb-rollout-hold`,
   `rb-rollback-execution`, `rb-restore-replay`) with the typed
   six-action operator catalog; rollback carries its compensation
   record (order-independent, idempotent — machine-proven).
8. **Evidence lineage** — the deployment cites the four-component
   identity; every subsequent operational artifact chains to it
   (`lineage.ts`).

## 4. The boundary (unchanged, restated)

- This station EXECUTED NOTHING: no deployment, no provisioning, no
  live-provider activation, no credential handling. The
  no-deployment-execution law held through the authorization capture.
- GAP-02 stands: live-corridor certification is credential-gated and
  was NOT performed; live-provider activation requires live probe
  evidence this program does not produce (no network by law).
- The four-verdict determination is unchanged by this record:
  implementation complete ✓ · integration complete ✓ ·
  release-ready ✓ (Gate E closed, with the §8 evidence correction
  applied) · not-yet-ready ✗.

## 5. Station receipts of this authorization session (2026-10-20)

- Remote `main` verified before any action: `71e3d22` (ls-remote with
  the operator PAT).
- The Gate E manifest-digest defect found and corrected (commit
  `25fdece`; readiness record §8): forensic reconstruction of the
  original dirty-tree walk is byte-exact, the corrected
  committed-tree digests are machine-verified (`--verify` PASS /
  FAIL proven both ways), and the release-candidate build digest was
  computed on the clean export.
- Governance re-run on the corrected tree: invariants 29/29 (zero
  failures); module ownership 54/54 mapped, violations exactly the 8
  documented carries (R3×5 + R6×3) — zero new.
