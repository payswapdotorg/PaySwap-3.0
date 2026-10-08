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