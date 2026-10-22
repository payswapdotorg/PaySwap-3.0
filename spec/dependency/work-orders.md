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

## P10-A - console workspace presentation contracts
Operator TL handoff: Agent Console Productization (2026-10-21). Implement the PaySwap Agent Workspace presentation contracts in `@payswap/surface` per spec/surface/CONSOLE-WORKSPACE.md: the eight-section workspace IA + routing table, the pinned mission vocabulary (MissionIntakeInput/MissionRecord/MissionSummary/MissionDetail/MissionEvent/MissionRungState, byte-exact to §3), validateMissionIntake (fail-closed structural validation), foldMissionLadder (the §4 verbatim typed-prerequisite ladder), the workspace store port type + adapter laws (§5), the section fold laws as pure functions (§6: overview/missions/agents/approvals/connections/activity/lab/settings view-model folds with honest empty states), the authority-verb ban extended to this family. Node tests for every law; zero runtime dependencies; deterministic; the surface package stays a hermetic contracts leaf.

## P10-B - desktop mission-intake store and console mounts
Operator TL handoff: Agent Console Productization. Implement the desktop/web console integration: the DESKTOP_PROFILE workspace store in `packages/desktop/src/host/payswap/` (structurally pinned mission-intake shapes + pin-registry entry + fidelity fixture; a pure WorkspaceStoreCore with JSON snapshot persistence via injected fs/directory; append-only events; malformed-record quarantine), extension of IPaySwapDesktopService with the WorkspaceStorePort methods + an honest deploymentFacts() getter (host-computed, never renderer-invented; composition wiring with the PaySwap user-data directory seam; the host never imports @payswap/* — structural pins only; existing signatures/tests stay green); the desktop renderer mount (payswapDesktop.ts surface tri-state product|console|console-advanced with console sub-path pass-through; ProductSurface.tsx renders the workspace at #/console via an injected renderWorkspace prop — the same injection pattern as renderConsole — and the ZCode Root at #/console/advanced with the back affordance; a renderer-side payswap-desktop channel client + store adapter with a descriptor drift test vs host/contracts.ts; document titles); the web mount (webRouteGate /console/advanced split; the /console workspace mount path with the BROWSER_PROFILE localStorage adapter, honestly labeled; web mount tests). The final real-component imports (renderer main.tsx / web main.tsx wiring to @payswap/app) are TL-wired at integration.

## P10-C - Agent Workspace views
Operator TL handoff: Agent Console Productization. Implement the workspace experience in `@payswap/app` per spec/surface/CONSOLE-WORKSPACE.md: the pinned mirror of the §3/§5 shapes (src/console/contracts.ts + a recorded-fixture drift test), the PaySwapAgentWorkspace shell (eight-section navigation, PaySwap chrome with the ps- design system, back-to-product affordance, document-title helper, honest not-found), the section components (overview with real in-progress missions/attention/recent activity + designed empty; missions with the creation intake + validation findings + the intent-review step + detail ladder + event timeline + evidence note; agents/approvals/connections/activity/lab/settings per §6 with honest empty states, vocabulary-as-reference clearly labeled, UNKNOWN rendered with role="status", settings with identity + upstream attribution + advanced developer workspace entry + store durability fact), the store-port React binding (load/create/record-intent/revise/archive with loading + typed-error states). WCAG 2.2 AA (keyboard, focus, landmarks, aria-current, reduced motion), responsive 1280/1440/390. Component tests via the static-markup oracle. Zero ZCode branding in the eight sections.

## P10-D - console journeys, evidence and J14 acceptance
Operator TL handoff: Agent Console Productization. After P10-A/B/C integrate: the console journey specs (JOURNEY-MAP.md flows 15-19: console-workspace, console-mission-lifecycle, console-honest-empties, console-advanced, console-a11y-responsive) in @payswap/journey-verification with manifest/coverage registration; the station desktop GUI inspection (Xvfb method) with screenshots (PaySwap home, console overview, mission detail, approval detail honest-empty, no-provider state, UNKNOWN/reconciliation reference rendering); the JOURNEY-ACCEPTANCE-RECORD J14 verdict updated only on passing evidence; development-state closure.

## P11 - workspace design port (the operator's target design)
Operator design directive (2026-10-21, chat web-a95c8999): "move the current app from current to target" — the current.png/target.png pair (the dark ZCode-style chat home → the PaySwap Agent Workspace light/emerald design; Task 99 realized it at the :3000 preview and the operator confirmed the productization wave). Port the target design into the shipped console per the AMENDED spec/surface/CONSOLE-WORKSPACE.md, presentation-contract amendment only (§2 IA/routing, §3/§4/§5 pinned shapes, §7, §9 unchanged; foldWorkspaceOverview unchanged): the §1 framing rename Agent Console → Agent Workspace including the pinned document-title literals (surface + app mirror + web/desktop mounts + journey specs); the §6 overview outcome-first home (the outcome question, the mission intake-entry card whose goal content prefills the missions creation intake, the four PAY/RECEIVE/MOVE/CONVERT outcome shortcuts with direction prefill, the "Your workspace" honest note with the live mission count and the two-reason designed-empty line; the attention line, the in-progress list and the capped recent-activity folds retained); the §8 chrome laws (topbar "Agent Workspace" framing + back-to-product control, sidebar section icons under a "Workspace" label with Settings pinned at the section end, mobile horizontal-scroll nav with icons, the workspace footer with the honest store fact + live mission count; icons presentation-only, aria-hidden, never replacing text labels). Full discipline: pinned-test and journey-spec updates, the pin-law version bumps to 1.2.0, the v1.2.0 release train (tag → release workflow → CI install-verify), the station published-asset GUI check, and the J14 re-verification on passing evidence.
