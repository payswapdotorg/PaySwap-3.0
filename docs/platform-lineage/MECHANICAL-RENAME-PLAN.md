# PaySwap 3.0 — Mechanical Rename Plan (ZCode → PaySwap), TL review draft

Status: PROPOSAL. Authored by P0-W1 for TL review. Not executed: package names, workspace filters, import paths, bin names and environment variables are intentionally untouched in `work/p0-w1` (non-breaking law for the baseline work order). Executing this plan is a dedicated, standalone work order with its own ADR and full battery.

## 0. Measured blast radius at base `e40f2b9` (read-only counts)

| Rename surface | Count / location (tracked files, `git grep`) |
|----------------|---------------------------------------------|
| Files containing `@zcode/` (scopes/imports/filters) | 2,211 |
| Files containing `ZCODE_` env vars | 382 |
| Files containing `zcode` (case-insensitive) | 2,978 |
| `package.json` `name` fields containing `zcode` | 31 |
| Binaries (`bin` entries) | 2 — `apps/zcode-cli/packages/cli` (`zcode`), `packages/zcode-server-cli` |
| Directory names | `apps/zcode-cli`, `packages/zcode-cua`, `packages/zcode-server-cli` (+ nested `apps/zcode-cli/*` paths everywhere) |
| Lockfiles | `pnpm-lock.yaml` (root), `apps/zcode-cli/pnpm-lock.yaml` (nested — already drift-affected, see record F2) |
| Data/install paths | `~/.zcode`, `~/.zcode-dev-home`, `ZCODE_DIST_*` installer layout (`dist/zcode/`, `bin/zcode.mjs`) |
| Notices/licenses (DO NOT rename semantics) | `LICENSE`, `NOTICE.md`, `THIRD-PARTY-NOTICES.md`, `docs/ZCODE-PLATFORM-BASELINE.md` attribution, upstream lineage records |

## 1. Guiding rules

1. Fork law first: upstream attribution survives every stage (`LICENSE`/`NOTICE`/`THIRD-PARTY-NOTICES` and lineage records keep ZCode/zai-org references; they are historical facts, not product identity).
2. One decision before anything else: the target scope name (`@payswap/*` assumed below for concreteness — needs an explicit ADR, including registry availability if ever published).
3. Mechanical-only changes: no behavior, no API shape, no config semantics. Each stage is a single reviewable commit with the full battery from `BASELINE-VERIFICATION-RECORD.md` §6 run green before the next stage starts.
4. Client-visible contracts (bin name, env vars, data dirs) get a compatibility window (aliases/dual-read), because deployed desktop installs and docs reference them.

## 2. Stages (order = leaf → root; risk-ranked)

| Stage | Change class | Representative files | Order rationale | Risk |
|-------|-------------|----------------------|------------------|------|
| S1 | Rename `@zcode/*` package `name` fields (31 package.jsons, root + nested workspaces) | all `package.json` | must precede imports/filters so references have a target | HIGH — breaks every import until S2 completes; do S1+S2+S3 in one atomic commit window |
| S2 | Rewrite import specifiers `@zcode/x` → `@payswap/x` in TS/TSX/JS/MJS sources (2,211 files) | `packages/**/src`, `apps/zcode-cli/**/src` | follows S1 | HIGH — codemod must be AST-safe; string-replace risks doc strings and notice text (exclude `NOTICE*`, `THIRD-PARTY*`, `docs/`, `spec/`) |
| S3 | Rewrite workspace filters in scripts (`--filter @zcode/...` in root `package.json` scripts, `apps/zcode-cli` scripts, `mise.toml` tasks, turbo/pipeline configs, knip config, release configs) | `package.json`, `apps/zcode-cli/package.json`, `mise.toml`, `knip.json`, `.release-it.mjs`, turbo configs | same atomic window as S1/S2 | HIGH — silently breaks builds if stale; battery `build:bootstrap` + `--filter @zcode/cli...` equivalent must be re-pointed and green |
| S4 | Regenerate lockfiles: root `pnpm-lock.yaml` + `apps/zcode-cli/pnpm-lock.yaml` (fix F2 drift in the same commit) | both lockfiles | after S1-S3 resolve | HIGH — lockfile churn is the largest diff; frozen-install must pass (record B12 goes green) |
| S5 | Rename workspace directories `apps/zcode-cli` → `apps/payswap-cli` (decide: keep `zcode-cua`/`zcode-server-cli` package dirs in sync with their new names) | `git mv` of 3 dirs + path references in scripts/configs/docs | after S4 (paths inside lockfiles/scripts now stable) | MEDIUM — path references in build scripts (`scripts/build-zcode.mjs`, dev scripts, CI-ish configs) |
| S6 | Rename distribution surface: `dist/zcode/` output, `bin/zcode.mjs`, `zcode.cjs`, `build:zcode` script family, `~/.zcode` runtime data dir, installer layout | `scripts/build-zcode.mjs`, CLI installer docs | after S5; needs compat aliases (`zcode` shim → new bin during one release window) | MEDIUM-HIGH — user-visible; old desktop installs and muscle memory |
| S7 | Rename env vars `ZCODE_*` → `PAYSWAP_*` with dual-read compat layer (read new, fall back to old; deprecation log) | 382 files, concentrated in server/client/desktop/cli entry paths | after S6; compat layer mandatory | MEDIUM — external integrations and `.env` files in the wild |
| S8 | Cosmetic/copy surfaces last: remaining README/docs prose, log prefixes, i18n strings, telemetry product tags | docs, `apps/zcode-cli/packages/i18n`, telemetry | zero build risk | LOW |

## 3. Verification contract per stage

Every stage commit must show, in its message body: `pnpm install` clean, `pnpm typecheck` exit 0, `pnpm build:bootstrap` exit 0, `--filter @payswap/cli... build` (re-pointed) exit 0, `pnpm architecture:check` violations 0, `pnpm lint` 0 errors. S4 additionally: both workspaces `install --frozen-lockfile` green (this closes record finding F2). S6 additionally: extracted-distribution smoke run (`node dist/.../bin/*.mjs --help`). S7 additionally: a dual-read test matrix for each renamed env var.

## 4. Explicit non-goals

- No renaming inside `LICENSE`, `NOTICE.md`, `THIRD-PARTY-NOTICES.md`, upstream lineage records (`spec/UPSTREAM-BASE.md`, `docs/ZCODE-PLATFORM-BASELINE.md` history), or third-party notices — fork attribution is preserved verbatim.
- No renaming of upstream-derived type/protocol names whose semantics are tied to upstream behavior until the GENERALIZE work orders (services/shared/core/bootstrap) have run — renaming those now would churn code that P1-P3 will restructure anyway.

## 5. Scheduling recommendation

Defer S1-S8 until the Phase 2/3 contract set is stable (Surface contracts + capability fabric). The rename is a pure-diff event whose cost grows with every landed PaySwap feature; doing it at the baseline costs ~3k files once, doing it after Phase 3 costs the same plus re-review of economic code. The only stage worth pulling earlier is S4's lockfile resync (F2 fix), which is rename-independent and unblocks standalone CLI development immediately.
