# PaySwap 3.0 Concurrency Playbook

## Objective
Keep all three worker lanes productive whenever the dependency graph permits, without creating duplicate authority or lowering verification quality.

## Contract-first rule
Concurrency is created by publishing stable contracts, not by copying implementations.
A downstream worker may begin when its required upstream contract is accepted and committed, package ownership is explicit, fixtures can consume the accepted contract, and it does not need to invent missing implementation.

## Preferred lane pattern
Worker 1: domain/economic or platform owner.
Worker 2: financial/trust/security owner.
Worker 3: integration/experience/provider owner.
When a phase has three independent Work Orders, activate all three.

## When blocked
Move the worker to another independent frontier Work Order when one exists. Do not create speculative implementation and do not edit a sibling worker's authoritative files.

## Safe parallel boundaries
Independent domain packages; independent adapters against accepted interfaces; security tests against frozen contracts; UI consumers against a versioned Surface API; migration inventory while contracts are implemented; provider fixtures that cannot execute production effects.

## Unsafe parallel boundaries
Two workers owning the same state machine; two financial write paths; duplicated provider-state or authorization contracts; parallel edits to a frozen architecture file; simulation able to call production adapters; UI-local shadow financial state.

## Integration rhythm
1. Worker publishes contract/implementation on its branch.
2. TL verifies source, callers, tests and evidence.
3. TL merges.
4. TL updates current-state.json.
5. TL recomputes the frontier.
6. Newly unlocked Work Orders are dispatched immediately.
7. Affected downstream tests are rerun after merges.

## Conflict rule
Architecture or authority disagreement pauses only the affected boundary. Resolve with ADR plus graph/state update. Never resolve it by silently choosing a private worker interpretation.

## Quality rule
Concurrency succeeds only when final correctness is unchanged. Three inconsistent implementations are failure, not throughput.