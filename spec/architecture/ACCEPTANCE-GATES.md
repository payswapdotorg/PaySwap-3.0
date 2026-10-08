# PaySwap 3.0 Acceptance Gates

A Work Order is accepted only when the relevant gates are evidenced in-repository.

## Architecture
The implementation matches the frozen architecture, module ownership map and active Work Order. Any variance has an accepted ADR.

## Contract integrity
Public contracts are typed, versioned, provider-neutral where appropriate, and have one state owner.

## Financial integrity
Exact/lossless money; deterministic state machines; idempotency; authorization lineage; evidence lineage; UNKNOWN/reconciliation; no hidden custody.

## Capability integrity
Catalogue/implementation/connected-instance/observation separation; provider-state preservation; scope/eligibility freshness; native provider baseline preserved.

## Security
Hard policy/security gates execute outside model authority. BLOCK cannot be downgraded. Secrets never reach model context/logs/artifacts.

## Integration
Production financial effects use real authoritative adapters. No fake success, synthetic provider balance or hidden mock path.

## UI
Web/Desktop/etc consume Surface contracts; UI does not own financial truth. Consequential actions expose authorization/security state and honest UNKNOWN/error states. Browser/device verification is required before release.

## Lab
Simulation/replay cannot call production financial adapters. Promotion requires replay/counterfactual/robustness/shadow/canary evidence.

## Release
Exact commit SHA, test results, environment, deployment identity, runtime health and rollback evidence are recorded.

## Evidence rule
A claim in chat, a worker summary or a green checkbox is not evidence by itself. The repository must contain the underlying source/test/runtime record.
