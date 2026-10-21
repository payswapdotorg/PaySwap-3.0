# PaySwap 3.0 Work Order Catalog

## How to use external operating-model research
Use research as provider-grounded design evidence, never as a replacement for the frozen PaySwap architecture. Wise-specific field names, 30-minute quote behavior, state names, idempotency mechanisms, legal permissions and safeguarding claims must not become universal PaySwap contracts. The advisory Wise blueprint is in spec/research/WISE-OPERATING-MODEL.md. Requirements become binding only where mapped to the existing Work Order, accepted contract and tests below.

## P0-W1 - upstream/platform baseline and repository integration
Verify the already-materialized pinned ZCode fork lineage, rename product identity where appropriate, establish reproducible root tooling, classify inherited modules, and confirm the inherited platform remains buildable before PaySwap feature migration.

## P0-W2 - architecture governance
Turn architecture, authority, invariants and ownership into machine-checkable repository controls where practical; establish PaySwap module policy without breaking inherited runtime unnecessarily.

## P0-W3 - migration/baseline evidence
Inspect old PaySwap and ZCode source, tests and dependencies; create a verified migration matrix and baseline verification record. Inventory only; do not create parallel implementation.

## P1-W1 - economic model
EconomicGoal, intents, deterministic validation and candidate compilation. Keep MoneyMovementIntent rail/provider-neutral; quote or corridor details must be versioned economic inputs and must not establish authorization or financial finality.

## P1-W2 - financial protocol
Exact money, obligations, clearing, reservations, netting, settlement, finality, reconciliation and evidence. Preserve distinct evidence for funding, conversion, payout, observation and finality. UNKNOWN after a potentially effective external command must be reconciled before consequential retry. FX/liquidity/credit/collateral and persistence work remains deferred as recorded in current-state unless separately accepted.

## P1-W3 - trust/policy/security boundary
Principals, mandates, attenuation, approval artifacts, policy and security-epoch linkage.

## P2-W1 - capability fabric
Capability hierarchy, ProviderStateEnvelope, observations, certification and execution modes. Apply corridor-aware eligibility: country/currency, customer type, amount, recipient/funding/payout method, required fields, limits, pricing/delivery terms, cutoffs and fresh provider observations. A corridor is a discovery projection over capabilities, not a new authority or a currency pair alone. Preserve native provider semantics and catalogue/connected-instance separation.

## P2-W2 - provider runtime
Real provider adapters, connection scope, credential/browser isolation and execution bridge. Implement endpoint-specific idempotency, event/webhook authentication where supported, duplicate/out-of-order event handling, raw provider-state retention, correlation/idempotency identifiers, canonical provider retrieval and reconciliation after ambiguity. Keep secrets outside model context and logs. A sandbox must never be represented as proof of live behavior.

## P2-W3 - Surface/API
Framework-independent PaySwap Surface contracts and capability/operation discovery projections. Surface quote amount/currency, fee lines, rate/provenance, expiry, funding and recipient assumptions, delivery estimate (label guarantee vs estimate), authorization changes and understandable progress/return/unknown states. UI remains a projection and cannot own financial truth.

## P3-W1 - agent model
Agent Body/Instance/Package, Organizations, memory boundary and communications.

## P3-W2 - execution graph
Economic Execution Graph, strategy model and Director integration. Preserve quote/route/provider observation versions and invalidate affected authorization when material execution terms change.

## P3-W3 - ZCode bridge
Runtime/tools/MCP/workflow integration into PaySwap proposals without economic authority.

## P4-W1 - onchain domain
Chain/asset/protocol/wallet/smart-account/onchain execution contracts, family-neutral.

## P4-W2 - onchain security
Signing requests, simulation, state diff, scoped authorization, security gate and immediate recheck.

## P4-W3 - onchain adapters
EVM/Solana/UTXO observation/execution/finality/reorg semantics behind injected provider transports.

## P5-W1 - route optimization
Best execution, route scoring and mixed-rail deterministic compilation. A provider-native path is the baseline candidate; composed/multi-provider routes are comparable only when each leg has current eligibility, credible pricing, actual connection/permission, funding/payout constraints and auditable assumptions. Preserve route, quote, authority and evidence lineage. Liquidity estimates are not custody or authorization; do not invent Wise's private routing or hedging algorithms.

## P5-W2 - onchain extensions
DEX, bridge, off-ramp, liquidity, lending/staking and intent protocol packs.

## P5-W3 - merchant/Stripe
Merchant onboarding, checkout, crypto acceptance, refunds where supported and provider-verified Stripe paths. Reuse the shared funding/payout/observation/finality/reconciliation lifecycle; do not create a parallel payment engine or infer success from submission.

## P6-W1 - Lab
Replay, counterfactuals, fault injection, Organization/Strategy search, robustness, shadow and canary. Simulated routes/events are advisory/test evidence only; no production financial authority.

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
Financial invariant/conformance suite plus real provider/rail evidence where enabled. For any certified fiat corridor, test quote expiry/material changes, endpoint idempotency, funding/payout separation, duplicate and out-of-order provider events, ambiguous timeout -> UNKNOWN -> reconciliation, and late returns/refunds/chargebacks where supported. Verify the actual external effect and its reconciliation at an exact commit and environment; a sandbox-only pass is not live certification.

## P8-W2 - security/client certification
Adversarial tests, secret boundary, accessibility, responsive UI, browser/device verification and dead-action audit. Verify authorized recipient changes, fresh eligibility and quote conditions, truthful customer-facing states, sandbox/live separation and no hidden fake-success/mock path.

## P8-W3 - release
Reproducible build/deploy, observability, production health and rollback. Record exact provider environment, deployment identity, event/reconciliation evidence, support/operational readiness and rollback/compensation evidence. Production release remains subject to explicit operator authorization.

Every Work Order requires source verification, exact tests, explicit limitations, real integration evidence where required, and state update with exact commit SHA. See spec/architecture/ACCEPTANCE-GATES.md for the overall evidence rule.
## P9-A - PaySwap-native product identity and UX
Operator handoff: GitHub Issue #1 (2026-10-21). Make the default experience PaySwap-native across Web and Desktop per spec/productization/PRODUCT-IDENTITY.md: extract the PaySwap application experience into a shared package consumed by web and desktop; flip the route contract (§3) — / opens PaySwap, the agent console becomes the supporting /console surface; replace every user-visible inherited identity in the default experience (titles, favicon, boot/loading, onboarding, navigation, empty states, settings, help/about, errors, notifications) with the original PaySwap identity and design system; WCAG 2.2 AA core experience; every visible action works or states its typed prerequisite. Upstream attribution preserved as attribution, never as the brand.

## P9-B - downloadable/installable GitHub distribution
Operator handoff: GitHub Issue #1. Ubuntu x86_64 first: adapt electron-builder to produce a real .deb and (where the substrate supports it) an AppImage under the canonical identity (PRODUCT-IDENTITY.md §1); a reproducible tag-triggered GitHub Actions release workflow building from a clean checkout with the committed lockfile and attaching real binaries + SHA-256 checksums to a versioned GitHub Release; README "Download PaySwap for Ubuntu" + a full install/launch/upgrade/uninstall/troubleshooting/verification section; source builds demoted to the developer path. Never advertise an untested artifact; never fake a release.

## P9-C - product journeys, tests and install verification
Operator handoff: GitHub Issue #1. Make the product claims testable per spec/productization/JOURNEY-MAP.md: the Playwright browser acceptance suite (first launch, navigation, journey entry, setup-required, error/unknown, settings/about, no-ZCode-branding, legacy redirects, responsive, accessibility) running against a served production build in CI; the workspace-dependent test coverage (ui/web/desktop + journeys) as a reliable CI job per the issue's directive; the install-verification flow for the published release artifacts (checksum, apt install, launch, branding, data path, upgrade/uninstall, no-provider launch) with evidence tied to the exact commit; the user-journey matrix acceptance record with truthful per-journey verdicts.
