# PaySwap 3.0 Dependency Graph

Maximum concurrent workers: 3. Active Work Orders must be pairwise-disjoint.

## Phase 0 - foundation
P0-W1: upstream lineage/platform bootstrap — Worker 1.
P0-W2: architecture contracts/authority/invariants — Worker 2.
P0-W3: migration inventory/baseline verification — Worker 3.
All three are independent.

## Phase 1 - economic kernel
P1-W1: economic model + intent compiler — Worker 1.
P1-W2: financial protocol — Worker 2.
P1-W3: trust/authorization/policy/security boundary — Worker 3.
Depends on Phase 0.

## Phase 2 - capability fabric
P2-W1: capability/connector contracts — Worker 1.
P2-W2: provider runtime + credential/browser broker — Worker 2.
P2-W3: framework-independent Surface/API discovery contracts — Worker 3.
Depends on Phase 1.

## Phase 3 - agent/economic plane
P3-W1: Agent Body/Instance/Package + Organization — Worker 1.
P3-W2: Economic Execution Graph + strategy/Director — Worker 2.
P3-W3: ZCode runtime/tool/MCP bridge — Worker 3.
Depends on accepted Phase 1/2 contracts.

## Phase 4 - onchain
P4-W1: chain/asset/protocol/wallet/smart-account domain — Worker 1.
P4-W2: signer authorization/security/simulation/recheck — Worker 2.
P4-W3: EVM/Solana/UTXO adapters and lifecycle — Worker 3.
Depends on Phase 2 and Phase 3 interfaces.

## Phase 5 - execution
P5-W1: best execution + mixed-rail route compiler — Worker 1.
P5-W2: DEX/bridge/off-ramp/protocol extension packs — Worker 2.
P5-W3: merchant checkout + Stripe capability integration — Worker 3.
Depends on relevant Phase 2/4 foundations.

## Phase 6 - intelligence
P6-W1: Lab/replay/simulation — Worker 1.
P6-W2: FinancialOpportunity — Worker 2.
P6-W3: adversarial threat intelligence — Worker 3.
Depends on stable Phase 3-5 contracts.

## Phase 7 - product
P7-W1: PaySwap Surface + primary Web UI — Worker 1.
P7-W2: PaySwap Desktop on ZCode-derived shell — Worker 2.
P7-W3: universal command/agent interaction + browser Extension/API — Worker 3.
Depends on stable Phases 1-6.

## Phase 8 - certification
P8-W1: financial conformance — Worker 1.
P8-W2: security + UX/client/browser certification — Worker 2.
P8-W3: deployment/observability/rollback — Worker 3.
Depends on Phase 7.

## Concurrency law
Use stable contract boundaries to keep all three lanes productive whenever the frontier permits. Never use duplicate authority, hidden state, mocks or reduced verification merely to increase parallel throughput.