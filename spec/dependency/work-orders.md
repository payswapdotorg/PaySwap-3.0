# PaySwap 3.0 Work Order Catalog

## P0-W1 - upstream/platform baseline and repository integration
Verify the already-materialized pinned ZCode fork lineage, rename product identity where appropriate, establish reproducible root tooling, classify inherited modules, and confirm the inherited platform remains buildable before PaySwap feature migration.

## P0-W2 - architecture governance
Turn architecture, authority, invariants and ownership into machine-checkable repository controls where practical; establish PaySwap module policy without breaking inherited runtime unnecessarily.

## P0-W3 - migration/baseline evidence
Inspect old PaySwap and ZCode source, tests and dependencies; create a verified migration matrix and baseline verification record. Inventory only; do not create parallel implementation.

## P1-W1 - economic model
EconomicGoal, intents, deterministic validation and candidate compilation.

## P1-W2 - financial protocol
Exact money, obligations, clearing, reservations, netting, settlement, finality, reconciliation and evidence.

## P1-W3 - trust/policy/security boundary
Principals, mandates, attenuation, approval artifacts, policy and security-epoch linkage.

## P2-W1 - capability fabric
Capability hierarchy, ProviderStateEnvelope, observations, certification and execution modes.

## P2-W2 - provider runtime
Real provider adapters, connection scope, credential/browser isolation and execution bridge.

## P2-W3 - Surface/API
Framework-independent PaySwap Surface contracts and capability/operation discovery projections.

## P3-W1 - agent model
Agent Body/Instance/Package, Organizations, memory boundary and communications.

## P3-W2 - execution graph
Economic Execution Graph, strategy model and Director integration.

## P3-W3 - ZCode bridge
Runtime/tools/MCP/workflow integration into PaySwap proposals without economic authority.

## P4-W1 - onchain domain
Chain/asset/protocol/wallet/smart-account/onchain execution contracts, family-neutral.

## P4-W2 - onchain security
Signing requests, simulation, state diff, scoped authorization, security gate and immediate recheck.

## P4-W3 - onchain adapters
EVM/Solana/UTXO observation/execution/finality/reorg semantics behind injected provider transports.

## P5-W1 - route optimization
Best execution, route scoring and mixed-rail deterministic compilation.

## P5-W2 - onchain extensions
DEX, bridge, off-ramp, liquidity, lending/staking and intent protocol packs.

## P5-W3 - merchant/Stripe
Merchant onboarding, checkout, crypto acceptance, refunds where supported and provider-verified Stripe paths.

## P6-W1 - Lab
Replay, counterfactuals, fault injection, Organization/Strategy search, robustness, shadow and canary.

## P6-W2 - opportunities
Evidence-backed FinancialOpportunity discovery across rails; no direct authorization.

## P6-W3 - security intelligence
Adversarial onchain/provider threat intelligence and immune-system integration; deterministic BLOCK remains authoritative.

## P7-W1 - Web
New PaySwap Surface + Web product on ZCode-derived Web substrate.

## P7-W2 - Desktop
PaySwap Desktop on the ZCode-derived native shell using shared Surface/backend contracts.

## P7-W3 - universal interaction
Command surface, agent interaction, browser Extension boundary and developer/external-agent APIs.

## P8-W1 - financial certification
Financial invariant/conformance suite plus real provider/rail evidence where enabled.

## P8-W2 - security/client certification
Adversarial tests, secret boundary, accessibility, responsive UI, browser/device verification and dead-action audit.

## P8-W3 - release
Reproducible build/deploy, observability, production health and rollback.

Every Work Order requires source verification, exact tests, explicit limitations, real integration evidence where required, and state update with exact commit SHA.