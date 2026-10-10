# PaySwap 3.0

PaySwap 3.0 is a universal economic operating system built from the ZCode platform substrate and governed by a deterministic PaySwap financial protocol. This repository is a GitHub fork of `zai-org/ZCode` pinned at baseline `29628c9acdb81b703bbd4080c207a0e7ce5e276e` (ZCode v3.14.3); upstream attribution, license and third-party notices are preserved, and upstream history is never rewritten.

## Repository authority

This repository is the sole source of truth for PaySwap 3.0. Conversation history, model memory, screenshots without provenance, PR prose, worker claims, and chat instructions are non-authoritative unless the underlying requirement or evidence is committed here.

Authority order:
1. source code, tests, schemas, migrations and deployment configuration;
2. frozen architecture and accepted ADRs;
3. development state and dependency graph;
4. active Work Orders;
5. recorded CI, integration, browser and deployment evidence;
6. versioned external specifications/research recorded in the repository;
7. conversation and agent claims.

## Architecture

Canonical architecture: `spec/architecture/PAYSWAP-3.0.md`.

PaySwap 3.0 combines the ZCode cross-platform agent/application substrate with PaySwap's deterministic economic and financial kernel, one capability/connector fabric, an Economic Execution Graph, Lab/Director learning, and framework-independent Surface contracts for Web, Desktop, Mobile, Extension, SDK/API and agent surfaces.

Core law: intelligence proposes; deterministic PaySwap authorities decide and commit.

## Product UI

The primary Web product is a new PaySwap interface built on the ZCode-derived Web substrate. The old `payswap-web` deployment/repository is only reference material. The ZCode-derived Desktop shell is adapted into PaySwap Desktop. All product clients share PaySwap Surface contracts.

## Upstream lineage

Upstream: `zai-org/ZCode`
Pinned baseline: `29628c9acdb81b703bbd4080c207a0e7ce5e276e`
Upstream release at the pin: v3.14.3.

`spec/UPSTREAM-BASE.md` records the lineage and update policy. Do not silently track upstream `main`.

## Implementation

Start with `spec/development-state/current-state.json`, then `spec/dependency/graph.md` and `spec/dependency/work-orders.md`. The TL dispatches only from the active frontier and keeps at most three pairwise-disjoint worker lanes active.

No financial, provider, blockchain, merchant, or UI feature is complete without source verification, tests, integration evidence where required, and the failure/UNKNOWN/security paths.
