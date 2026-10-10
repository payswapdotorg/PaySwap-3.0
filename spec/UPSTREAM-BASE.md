# PaySwap 3.0 Upstream Base

Status: CANONICAL

Upstream: `zai-org/ZCode`
Pinned baseline: `29628c9acdb81b703bbd4080c207a0e7ce5e276e`
Upstream release at the pin: ZCode v3.14.3.

The repository is a GitHub fork with the pinned upstream history verified on `main`. Do not silently track upstream `main`.

## Baseline rule

The pinned upstream commit is the platform-substrate baseline. PaySwap changes are layered on top through normal commits. Never rewrite or squash away the upstream lineage merely to make the history look native.

## Update policy

An upstream update requires an ADR recording source/destination SHAs, changed packages, PaySwap impact, security impact, migration decisions, regression results, and rollback considerations. The TL must verify the actual commit graph before accepting the update.

## Current verification

As established during repository setup on 2026-10-08, `payswapdotorg/PaySwap-3.0` `main` contains the upstream ZCode commit `29628c9acdb81b703bbd4080c207a0e7ce5e276e` as its current baseline ancestor. This file is the canonical record of that decision.

## Verification record — P0-W1 (2026-10-10)

Worker-1 re-verified the pinned lineage on a fresh clone at base `e40f2b9cc8da7d5ccfe15c93b43adc2dbf941b6e` (branch `work/p0-w1`) with exact receipts recorded in `docs/platform-lineage/BASELINE-VERIFICATION-RECORD.md`:

- `git merge-base --is-ancestor 29628c9acdb81b703bbd4080c207a0e7ce5e276e e40f2b9` → `LINEAGE_OK` (exit 0); same result against `work/p0-w1` HEAD.
- `git log --oneline 29628c9..e40f2b9 | wc -l` → 25 PaySwap governance commits on top of the pin; governance diff touches governance files only (no `apps/`, `packages/`, root `package.json`, `pnpm-workspace.yaml` or lockfile changes), so upstream history is layered on, not rewritten.
- `git rev-list --count HEAD` → 28 total commits; inherited upstream history below the pin is a 3-commit linear lineage (`77432b6` Initial commit → `872ad96` "feat: open source" → `29628c9` "feat: update v3.14.3") — the upstream's own public shape.
- Read-only reference check `git ls-remote --heads https://github.com/zai-org/ZCode.git` → upstream `main` currently points at exactly `29628c9acdb81b703bbd4080c207a0e7ce5e276e`; no fetch, clone or materialization of upstream was performed, and no upstream remote is configured in the working clone (pin law).
- The inherited platform was additionally confirmed buildable at the pin (install, root typecheck, per-package builds for the KEEP-critical platform packages, `build:bootstrap`, CLI build, `architecture:check`, `lint` — all receipts in the verification record, including two honestly recorded blocked items: the nested CLI workspace's frozen install fails on an inherited lockfile drift, and its turbo typecheck is environmentally unresolvable).

This section is an append-only verification receipt; the rules above are unchanged.