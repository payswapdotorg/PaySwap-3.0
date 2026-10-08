# PaySwap 3.0 Agent Governance

## Authority

The repository is the only implementation authority. Conversation, memory, screenshots, PR prose, worker summaries and chat instructions are non-authoritative unless the underlying requirement or evidence is committed here.

Read before coding:
- `spec/architecture/PAYSWAP-3.0.md`
- `spec/architecture/AUTHORITY-MODEL.md`
- `spec/architecture/INVARIANTS.md`
- `spec/architecture/CAPABILITY-MODEL.md`
- `spec/architecture/SECURITY-MODEL.md`
- `spec/architecture/NON-CUSTODY.md`
- `spec/architecture/ECONOMIC-EXECUTION-GRAPH.md`
- `spec/dependency/graph.md`
- `spec/dependency/work-orders.md`
- `spec/development-state/current-state.json`
- `spec/UPSTREAM-BASE.md`
- `spec/MIGRATION-FROM-PAYSWAP-ORG.md`
- `spec/MIGRATION-FROM-ZCODE.md`

## TL governance

The Tech Lead is an orchestrator, not a fourth coding lane. It derives the active frontier from repository state, activates no more than three pairwise-disjoint Work Orders, verifies worker claims against source/tests/CI/runtime evidence, resolves conflicts, and updates repository state after accepted merges.

The TL may not silently change frozen architecture. Changes require an ADR plus dependency graph/state updates before implementation.

## Worker governance

Each worker reads the applicable architecture and Work Order before coding, stays within assigned scope, writes tests with behavior changes, records external specification provenance, never fabricates provider/financial/security behavior, and reports exact commit/test/limitation evidence.

A missing conversational answer is never a reason to invent architecture. Update the repository through governance.

## Concurrency law

Maximum three workers. Active Work Orders must be pairwise-disjoint by source ownership and contract authority.

Exploit concurrency by:
- splitting platform, domain, capability, security, integration and experience ownership into separate lanes;
- publishing stable public contracts before adapter/consumer work;
- allowing downstream implementation to proceed against accepted contracts while unrelated implementation continues;
- keeping shared-file write contention out of parallel lanes;
- merging in dependency order and rerunning affected gates.

Never trade away authority boundaries, real integration or verification quality merely to keep a worker busy. Never create a duplicate contract, shadow state or production mock to unblock a lane.

## Financial boundary

ZCode permission determines whether a platform/tool action may be invoked. PaySwap authorization determines whether a specific economic effect may occur. These are complementary and never interchangeable.

The only valid consequential path is:
Agent/UI/Plugin/MCP/Workflow -> Economic Proposal/Intent -> Eligibility -> Policy + Security -> PaySwap Authorization -> Financial Protocol -> Connected Capability -> External Effect -> Observation/Finality -> Reconciliation/Evidence.

## Security and data

Raw private keys, seed phrases, passwords, MFA material, API secrets and protected session cookies never enter model context, normal logs or ordinary artifacts.

## Financial truth

One Financial Protocol Authority owns truth. Exact money only. UNKNOWN is not FAILED. Submitted is not finality. External balances are observations, not PaySwap custody. Agents, models, Lab, simulation and optimizers cannot declare financial finality.

## Verification

Use the actual commands in the current repository's package scripts. Do not report tests that were not executed. Financial and UI changes require integration/E2E evidence where applicable. No dead financial buttons or fake success states.
