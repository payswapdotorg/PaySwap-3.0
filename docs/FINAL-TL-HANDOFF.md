# Final TL Handoff — PaySwap 3.0

This repository is the sole source of truth. A fresh TL must not need this conversation or another architect.

## Read order

1. `spec/development-state/current-state.json`
2. `spec/dependency/graph.md`
3. `spec/dependency/work-orders.md`
4. `spec/architecture/PAYSWAP-3.0.md`
5. `spec/architecture/AUTHORITY-MODEL.md`
6. `spec/architecture/INVARIANTS.md`
7. `spec/architecture/CAPABILITY-MODEL.md`
8. `spec/architecture/SECURITY-MODEL.md`
9. `spec/architecture/NON-CUSTODY.md`
10. `spec/architecture/ECONOMIC-EXECUTION-GRAPH.md`
11. `spec/MIGRATION-FROM-ZCODE.md`
12. `spec/MIGRATION-FROM-PAYSWAP-ORG.md`
13. `spec/UPSTREAM-BASE.md`

## Mission

Transform the ZCode fork into PaySwap 3.0: an agent-native universal economic operating system with a deterministic financial authority and one capability fabric across fiat, onchain and future rails.

## First action

Start exactly from the P0 frontier. Do not jump to payments/blockchain/UI features.

P0-W1, P0-W2 and P0-W3 are intentionally independent and must run concurrently.

## Three worker operating law

Maximum three workers. Never use the TL as a coding lane.

Worker 1 owns platform lineage plus economic-kernel work.
Worker 2 owns financial authority plus trust/security.
Worker 3 owns migration, experience and integrations.

Keep the workers concurrently productive whenever the graph allows it. The preferred pattern is contract-first parallelism: one worker may publish a stable contract while another implements an independent consumer and the third builds migration/evidence or another disjoint contract.

Workers must not edit each other's authoritative files during parallel execution. Shared contracts are synchronized only at explicit integration points.

Downstream work may begin against an accepted contract even while unrelated upstream implementation continues. It may not invent a replacement authority or mock missing financial behavior.

## Integration law

After each accepted Work Order:
- verify the source directly;
- verify exact test/typecheck results;
- inspect callers and dependency direction;
- run the affected architecture/security gates;
- record exact commit SHA and evidence in `current-state.json`;
- recompute the frontier before dispatching more work.

## Architecture law

ZCode is the platform substrate.
PaySwap is the economic authority.

ZCode permission does not equal financial authorization.

Agent/model/tool/plugin/MCP/workflow output is proposal input, never financial truth.

Provider catalogue does not authorize execution.
External balances are observations.
Blockchain is one rail family.
Simulation never becomes production authority.
Security intelligence can never downgrade BLOCK.

## UI law

Build a new PaySwap Web interface on the ZCode Web substrate. The old Vercel `payswap-web` is reference material only.

Build PaySwap Desktop on the ZCode native shell.

All clients consume framework-independent PaySwap Surface contracts.

Primary experience is outcome-first: Pay, Receive, Move, Convert, Checkout, with operational areas for Payments, Accounts, Activity, Opportunities, Connections, Capabilities, Security, Reports, Developers and Settings.

## Financial law

All consequential effects use the canonical financial lifecycle and carry authorization/evidence lineage. Exact money only. UNKNOWN is not FAILED. No blind retry after ambiguity. Finality is observed/reconciled, not inferred from submission.

## Onchain law

Initial chain families are EVM, Solana and UTXO. Keep core chain-family neutral. Consequential supported writes use prepare -> simulate where supported -> security -> diff -> authorization -> pre-effect recheck -> broadcast -> observation/finality -> reconciliation/evidence.

## Merchant law

Merchant pricing remains fiat-denominated by default. Customers may use eligible crypto/onchain methods. Stripe is represented as a real provider capability; native Stripe effects must be provider-verified. Never fabricate Stripe balances or settlement.

## Lab law

Lab discovers strategies, Organizations, routes, capabilities and opportunities. Its outputs are advisory until they pass deterministic PaySwap policy, security, authorization and financial protocol gates.

## Definition of done

A phase or Work Order is not complete because a worker says so. Completion requires source truth, green tests/typechecks, relevant integration evidence, failure/UNKNOWN/security coverage, exact commit identity, and repository state update. Phase 8 additionally requires real browser/client verification, reproducible deployment and rollback evidence.
