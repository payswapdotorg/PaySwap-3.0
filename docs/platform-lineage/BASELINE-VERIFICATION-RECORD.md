# PaySwap 3.0 — Baseline Verification Record (P0-W1)

Work Order: `P0-W1` (spec/dependency/work-orders.md) — "Verify the already-materialized pinned ZCode fork lineage, rename product identity where appropriate, establish reproducible root tooling, classify inherited modules, and confirm the inherited platform remains buildable before PaySwap feature migration."

Worker: worker-1 (platform lineage and economic kernel lane).
Branch: `work/p0-w1`, base `e40f2b9cc8da7d5ccfe15c93b43adc2dbf941b6e`.
Verification date: 2026-10-10 (UTC).
Environment: fresh clone of `https://github.com/payswapdotorg/PaySwap-3.0.git`, clean worktree (`git status --porcelain` empty before and after the battery; the only tracked-file change in this branch is this documentation).

This record is the P0 evidence artifact for the `upstream_lineage_verified` gate and the reproducible-tooling baseline. Every command below was executed against a clean clone on the exact base SHA; results are recorded verbatim. No upstream re-materialization was performed (pin law); the only upstream contact is a read-only `git ls-remote` reference check.

## 1. Lineage verification

The fork already exists (materialized); P0-W1 verifies it rather than re-creating it.

| # | Command (verbatim) | Result |
|---|-------------------|--------|
| L1 | `git merge-base --is-ancestor 29628c9acdb81b703bbd4080c207a0e7ce5e276e e40f2b9 && echo LINEAGE_OK` | `LINEAGE_OK`, exit 0 |
| L2 | `git merge-base --is-ancestor 29628c9acdb81b703bbd4080c207a0e7ce5e276e HEAD` (branch `work/p0-w1`) | `LINEAGE_OK`, exit 0 |
| L3 | `git log --oneline 29628c9..e40f2b9 \| wc -l` | `25` governance commits on top of the pin |
| L4 | `git rev-list --count HEAD` | `28` total commits (3 inherited upstream + 25 PaySwap governance) |
| L5 | `git log -1 --format='%H %an %ad %s' 29628c9acdb81b703bbd4080c207a0e7ce5e276e` | `29628c9... wuweiqi 2026-09-23 feat: update v3.14.3` |
| L6 | `git rev-parse origin/main` | `e40f2b9cc8da7d5ccfe15c93b43adc2dbf941b6e` (= declared base; canonical main has not moved past the declared base at clone time) |
| L7 | `git rev-list --max-parents=0 HEAD` | `77432b6dbf9f70176ced3f4dcdc25f851c3acb2d` ("Initial commit") |

Inherited upstream history (below the pin) is exactly three linear commits: `77432b6` "Initial commit" (zRzRzRzRzRzRzR) → `872ad96` "feat: open source" (wuweiqi) → `29628c9` "feat: update v3.14.3" (wuweiqi). The upstream public history is therefore a 3-commit squashed lineage; this is the upstream's own shape, not a fork-side rewrite.

Governance layer shape: the 25 PaySwap commits (`P0: ...`) add governance files only — `AGENTS.md`, `README.md`, `docs/FINAL-TL-HANDOFF.md`, `docs/ZCODE-PLATFORM-BASELINE.md`, `spec/**` — with zero changes to `apps/`, `packages/`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `scripts/`, `config/`, `third-party/` or any runtime source. Verified via `git diff --name-only 29628c9..e40f2b9` (22 files, all governance files; 868 insertions / 289 deletions, deletions confined to the replaced README.md/AGENTS.md content and tracked-as-new governance docs). Ancestry is linear (no merges, no rebase across the pin): since the exact pinned commit object `29628c9` is an ancestor of `e40f2b9`, upstream history was not rewritten.

Read-only upstream reference check (no fetch, no clone — pin law respected):

| # | Command | Result |
|---|---------|--------|
| L8 | `git ls-remote --heads https://github.com/zai-org/ZCode.git` | `refs/heads/main -> 29628c9acdb81b703bbd4080c207a0e7ce5e276e`; `refs/heads/feat/ui-plugin -> 662c30be...` |

L8 confirms the pinned SHA is upstream's current `main` tip as of 2026-10-10, i.e. the fork is level with upstream main at the pin and the pin is a real upstream commit (not a fabricated SHA). Note the honest scope of this proof: `ls-remote` proves ref-level identity without materializing objects; proving object-level ancestry inside the canonical repository (L1/L2) is the authoritative lineage evidence. Upstream is not tracked and no upstream remote is configured in the working clone (pin law).

**Lineage verdict: VERIFIED.** `29628c9` (ZCode v3.14.3) is an exact ancestor of base `e40f2b9` and of `work/p0-w1` HEAD; 25 governance commits sit on top; upstream history is unwritten.

## 2. Toolchain and reproducible root tooling

Fresh-clone environment (no repo state carried over):

| Fact | Value | Source |
|------|-------|--------|
| Node.js | `v24.21.0` | system runtime; `node --version` |
| Node (repo pin) | `24.14.0` | `mise.toml [tools]`; `apps/zcode-cli` engines `"node": "24.14.0"`; root engines `">=24.0.0"`; `.nvmrc` `24` |
| pnpm (repo pin) | `10.33.2` | root `package.json` `"packageManager": "pnpm@10.33.2"`; `mise.toml` |
| pnpm (resolved) | `10.33.2` via `corepack` (0.36.0) | `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm --version` → `10.33.2` |
| git | `2.47.3` | `git --version` |

Discovered build/typecheck/test entry points (root `package.json` scripts, `mise.toml` tasks, per-package scripts):

- `pnpm install` — workspace install (`.npmrc`: `node-linker=hoisted`, registry `https://registry.npmjs.org`).
- `pnpm typecheck` — `tsc -b` over project references: `packages/{rpc,provider,provider-node,shared,services,client,server,zcode-server-cli,ui,web}` + `packages/desktop/tsconfig.host.json` (root-level; this is the authoritative typecheck entry).
- `pnpm build` — `pnpm -r build` (recursive over all workspace packages that define `build`).
- `pnpm build:bootstrap` — `pnpm -r --filter "./packages/*" --filter "!@zcode/desktop" build && pnpm --filter @zcode/desktop build:no-runtime-assets` (the repository's own "build everything without remote assets" contract).
- `pnpm bootstrap` / `pnpm bootstrap:with-remote` — install + desktop runtime asset preparation + `build:bootstrap` (full onboarding).
- `pnpm lint` (`oxlint`), `pnpm fmt:check` (`oxfmt`), `pnpm knip`, `pnpm architecture:check` (`node scripts/architecture/architecture-check.mjs check`).
- `pnpm verify:pre-push` — `pnpm run lint && pnpm run architecture:check -- --changed`.
- `mise.toml` tasks: `install`, `bootstrap`, `dev`, `dev-web`, `typecheck`, `lint` (tool pins: node 24.14.0, pnpm 10.33.2; `COREPACK_ENABLE_PROJECT_SPEC=0`, electron mirror env).
- `apps/zcode-cli` is a nested pnpm workspace (own `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`) with `build/check/typecheck/lint` entries; it is also reachable from the root workspace via `pnpm --filter @zcode/cli... build`.
- Test entry points: there is **no root-level `test` script** and no per-package `test` scripts with content in the inherited platform (only empty `test` placeholders in `apps/zcode-cli/packages/{bundled-skills,superpowers-plugin}`). This is a recorded finding, not a gap to paper over — see §5.

## 3. Build battery (exact receipts)

Executed on `work/p0-w1` at base `e40f2b9` (pre-commit, clean tree). Two environment notes are honest parts of the receipt: (a) `@zcode/server`'s build script internally invokes bare `pnpm`, which requires a pnpm shim on `PATH` (`corepack enable --install-directory /home/z/.corepack-bin`, still resolving the pinned pnpm 10.33.2); (b) the web build was first OOM-killed (exit 137) in the 4 GB verification container and passed with `NODE_OPTIONS=--max-old-space-size=1536`. Neither is a source defect; both are reproducibility contract details for this record.

| # | Command (verbatim) | Result |
|---|-------------------|--------|
| B1 | `git merge-base --is-ancestor 29628c9acdb81b703bbd4080c207a0e7ce5e276e HEAD && echo LINEAGE_OK` | `LINEAGE_OK`, exit 0 |
| B2 | `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm install` | `Done in 53s using pnpm v10.33.2`, exit 0 (fresh install; native builds ssh2 + node-pty electron-rebuild OK; husky prepare OK; re-run later: `Done in 15.6s`, exit 0) |
| B3 | `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm typecheck` | `tsc -b ...` exit 0, zero errors (covers rpc, provider, provider-node, shared, services, client, server, zcode-server-cli, ui, web, desktop host) |
| B4 | `corepack pnpm --filter @zcode/rpc build` | exit 0 (`tsc`) |
| B5 | `corepack pnpm --filter @zcode/server build` | **first attempt: FAIL** — `tsup` bundle OK, then `sh: 1: pnpm: not found` / `spawn ENOENT` (nested bare `pnpm` not on PATH under bare corepack). **With pnpm shim on PATH: exit 0** — tsup bundle + `Built dist/remote/zcode-server.cjs` |
| B6 | `corepack pnpm --filter @zcode/web build` | **first attempt: FAIL** — exit 137 (OOM kill after `7737 modules transformed`, 4 GB container). **With `NODE_OPTIONS=--max-old-space-size=1536`: exit 0** — `vite v8.0.8`, `built in 21.53s` |
| B7 | — (`@zcode/client`) | no standalone `build` script exists (source-only package, exports `.`/`./globals`); verification = B3 root typecheck green |
| B8 | `pnpm build:bootstrap` | exit 0 — formal-proof (`built in 320ms`), model-option-map, rpc, provider, provider-node, zcode-server-cli, server, web (`built in 24.87s`), then `@zcode/desktop build:no-runtime-assets` (renderer `built in 24.26s`) |
| B9 | `pnpm --filter @zcode/cli... build` | exit 0 — shared-types, dynamic-workflow, dynamic-workflow-runtime, contracts, adapters, core, i18n, telemetry, tui (`Done in 689ms`), bootstrap, cli (`Done in 3046ms`, `dist/zcode.cjs`) plus the platform deps from B8 |
| B10 | `pnpm architecture:check` | exit 0 — `architecture: OK`, `violations: 0` |
| B11 | `pnpm lint` | exit 0 — `Found 70 warnings and 0 errors`, `942ms on 2613 files` |
| B12 | `pnpm --dir apps/zcode-cli install --frozen-lockfile` | **FAIL (inherited, not environmental)** — `specifiers in the lockfile don't match specifiers in package.json: 1 dependency added (@withfig/autocomplete@2.692.3), 2 removed (@vitest/coverage-v8@^4.1.5, vitest@^4.1.5)`. Clean-tree check before/after: 0 modified files (no writes). See finding F2. |
| B13 | `pnpm --dir apps/zcode-cli typecheck` | **FAIL (environmental)** — `sh: 1: turbo: not found` (turbo is a root-workspace devDependency; the nested workspace's own node_modules is partial). Direct `node_modules/.bin/turbo run typecheck` from `apps/zcode-cli`: **FAIL** — `Unable to find package manager binary: cannot find binary path` (turbo 2.9.14 global vs repo pin `^2.4.0`). Compensating evidence: B9 root-context build of all CLI subpackages is green. |

Battery conclusion: the inherited platform is **buildable and typecheck-clean** at the pinned baseline from the root workspace with the pinned pnpm 10.33.2 on Node 24. The full root build IS defined (`pnpm build`, `pnpm build:bootstrap`, `pnpm bootstrap`); the executed battery deliberately stops short of network-dependent and packaging steps (see §5), all of which are recorded rather than skipped silently.

## 4. Module inventory summary

Full machine-readable inventory: `docs/platform-lineage/module-inventory.json` (34 modules; per-module layer, classification, one-line justification, key files, build status, source metrics, local `@zcode/*` dependencies). Classification per `spec/MIGRATION-FROM-ZCODE.md`; layers per `spec/architecture/MODULE-OWNERSHIP.yaml`.

Counts (34 workspace modules across `packages/*`, `apps/zcode-cli`, `apps/zcode-cli/packages/*`, `apps/zcode-cli/tools/*`):

| Classification | Count | Modules |
|----------------|-------|---------|
| KEEP | 27 | rpc, server, web, client, desktop, formal-proof, model-option-map, provider, provider-node, zcode-cua, zcode-server-cli, zcode-cli (root), adapters, browser-use-plugin, bundled-skills, cli, contracts, dynamic-workflow, dynamic-workflow-runtime, i18n, node-repl-host, shared-types, superpowers-plugin, telemetry, tui, tools/prompt-trajectory, tools/typescript |
| GENERALIZE | 4 | services, shared, bootstrap, core |
| PAYSWAP-ADAPT | 1 | ui |
| DEPRECATE-CANDIDATE | 2 | debug, swift-bridge |

| MODULE-OWNERSHIP layer | Count |
|------------------------|-------|
| platform | 30 |
| contracts | 3 (packages/shared, cli/contracts, cli/shared-types) |
| experience | 1 (packages/ui) |
| economic / trust / capability / financial / rails / intelligence / security | 0 inherited — all PaySwap-built |

Key structural facts: `packages/ui` (≈329k LOC TS) and `apps/zcode-cli` (≈296k LOC TS incl. subpackages) dominate the inherited surface; source-only packages (client, services, shared, ui, zcode-cua) are verified by the root `tsc -b` project-references typecheck rather than standalone builds; `packages/zcode-cua` is an inert fail-closed Computer Use placeholder; `apps/zcode-cli` is a nested pnpm workspace. Critical boundary carried into classification: ZCode application permission (core/permission, platform layer) is not PaySwap financial authorization.

## 5. Honest limitations and findings

What was NOT executed, deliberately and recorded (not silently skipped):

1. `pnpm prepare:desktop-runtime` / `pnpm bootstrap:with-remote` / `prepare:remote-assets` — download remote desktop runtime assets over the network (electron mirror configured in `mise.toml`); out of the minimal reproducible battery and network-shape-dependent.
2. `pnpm build` (full recursive, includes desktop `build` with runtime assets), `pnpm bundle:desktop` (Electron packaging/signing, platform-specific tooling), `pnpm build:zcode` (full CLI distribution packaging incl. `ZCODE_DIST_BASE_URL`-hosted artifacts), `pnpm build:sea` — packaging/distribution steps beyond "platform remains buildable". B8/B9 establish compile-level buildability of every package that defines a build script.
3. `pnpm dev:*` servers, `pnpm knip`, `pnpm fmt:check`, `pnpm release*` — runtime/dev-loop entries, not part of the battery.
4. Test suite: none exists at root or in packages (empty placeholders only) — there is nothing to run; recorded as finding F3.

Findings, severity-ranked:

- **F1 (medium, tooling contract):** root scripts assume a `pnpm` executable on `PATH` (e.g. `@zcode/server` build → `pnpm run build:remote`) while the reproducible entry per `packageManager` is `corepack pnpm`. A contributor following only `corepack pnpm` hits `spawn ENOENT`. Proposal (for TL; not implemented — `package.json` is outside the P0-W1 write surface): standardize `mise` tasks as the tooling contract (mise pins node 24.14.0 + pnpm 10.33.2 and exposes pnpm on PATH), or document `corepack enable` as a required first step in the root tooling contract.
- **F2 (medium, inherited drift):** `apps/zcode-cli/pnpm-lock.yaml` is out of sync with `apps/zcode-cli/package.json` at the pinned baseline (B12 exact specifier diff: `@withfig/autocomplete@2.692.3` added; `@vitest/coverage-v8@^4.1.5` and `vitest@^4.1.5` removed). Standalone nested-workspace bootstrap fails frozen. Root-context development is unaffected (B9 green). Fixing requires a lockfile commit in the CLI app — outside P0-W1's write surface; propose to TL as a P0 follow-up.
- **F3 (medium, verification gap):** the inherited platform has **no root-level or per-package test scripts**. Verification today = typecheck (B3) + builds (B4-B9) + lint (B11) + `architecture:check` (B10). The invariant-suite and acceptance gates required by later phases have no inherited test harness to build on; a root `test` contract must be established (proposal in §6).
- **F4 (low, environment):** web production build exceeds a 4 GB container's default memory budget (B6 first attempt, exit 137); passes with a 1536 MB old-space cap. CI/verification environments should pin `NODE_OPTIONS` or provide ≥8 GB.
- **F5 (low, engine skew):** verification ran Node `v24.21.0` vs the repo pin `24.14.0` (`mise.toml`, CLI engines field). Advisory warning only (`Unsupported engine: wanted 24.14.0`); no failure. Reproducibility note: mise users get the exact pin.
- **F6 (info):** `apps/zcode-cli/packages/superpowers-plugin` tracks only a `LICENSE` file at the pinned baseline (runtime content is materialized outside VCS by the plugin pipeline); `packages/zcode-cua` is a deliberately inert fail-closed placeholder. Both recorded so later phases do not mistake them for missing/abandoned code.

## 6. Root tooling contract proposal (for TL review — not implemented)

The full root build IS defined, so no invented contract is needed; the proposal is to make the existing entries deterministic and documented as the canonical P0+ verification battery:

1. **Toolchain pins (already in repo):** node `24.14.0` and pnpm `10.33.2` via `mise.toml` (authoritative per README.en.md); `corepack` path documented as alternative with one explicit step: `corepack enable` (so nested bare-`pnpm` scripts resolve — addresses F1).
2. **Canonical battery (fresh clone, in order):** `pnpm install` → `pnpm typecheck` → `pnpm build:bootstrap` → `pnpm --filter @zcode/cli... build` → `pnpm architecture:check` → `pnpm lint`. All receipts above (B2, B3, B8, B9, B10, B11) are green under this contract with `NODE_OPTIONS=--max-old-space-size=1536` (F4).
3. **Memory floor:** verification environments should budget ≥1536 MB V8 old-space for the web/desktop renderer builds (or ≥8 GB container memory, uncapped).
4. **Test contract gap (F3):** establish a root `test` script (even initially `tsc -b` + package-scoped runners as they appear) before P1, so the invariant-suite gate has a harness to grow into.
5. **Lockfile repair (F2):** one-line follow-up work order to resync `apps/zcode-cli/pnpm-lock.yaml` with its `package.json` and re-run B12 frozen-green.

## 7. Product identity (P0-W1 scope — non-breaking only)

Executed in this branch (user-visible, non-breaking): `README.md` intro gains explicit fork attribution; `README.en.md` is retitled PaySwap 3.0 with an upstream-attribution intro while keeping every command, environment variable, path and package name intact. `LICENSE`, `NOTICE.md`, `THIRD-PARTY-NOTICES.md` untouched (fork law). The full mechanical rename (`@zcode/*` scopes, workspace filters, import paths, bin names, env vars) is deliberately NOT executed and is proposed as `docs/platform-lineage/MECHANICAL-RENAME-PLAN.md` for TL review (file list + order + risk).

## 8. Deviations

- None in scope. The battery includes two environment accommodations (pnpm shim on PATH for B5; capped V8 heap for B6) and two honest failures (B12 inherited lockfile drift, B13 nested-workspace turbo orchestration) — all recorded above with exact evidence rather than worked around silently.
