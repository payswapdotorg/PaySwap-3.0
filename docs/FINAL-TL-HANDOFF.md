# Final TL Handoff — PaySwap 3.0

This repository is the sole source of truth. A fresh TL must not need the architect conversation, model memory, screenshots, PR prose or worker summaries to recover the program state. Follow source, tests, accepted ADRs, canonical state and recorded verification evidence.

## Current verified takeover snapshot — 2026-10-11

- Implementation/source review was performed against code HEAD `a1cc2103ae8dde0f02cf859ee1dfdfccf2ec53d1` before the documentation corrections in this audit. Always read live `main` and `current-state.json` at handoff time; do not treat this historical audit SHA as the active ref.
- Upstream substrate: `zai-org/ZCode` v3.14.3, pinned at `29628c9acdb81b703bbd4080c207a0e7ce5e276e`. Preserve the real fork lineage; never silently track upstream `main`.
- **Phase 0 is COMPLETE**: P0-W1 lineage/platform baseline, P0-W2 architecture governance and P0-W3 migration inventory/evidence were accepted and merged.
- **P1-W3 is COMPLETE/ACCEPTED**: `packages/trust` is the trust/policy/security boundary leaf. Its independent battery passed TypeScript and 138/138 Vitest tests; the package has zero runtime dependencies and no PaySwap sibling imports. See `spec/trust/TRUST-BOUNDARY.md` and `docs/trust-evidence/BASELINE-VERIFICATION-RECORD.md`.
- **Active frontier remains P1-W1 and P1-W2.** `spec/development-state/current-state.json` intentionally retains their status as `DISPATCHED` until acceptance, but its platform verification records say the prompts were server-accepted and **generation never started** because the agent platform account usage quota blocked admission. No recoverable worker artifacts exist for these two lanes. A recovery/re-dispatch sentinel is recorded there. Do not represent either lane as implemented or failed.
- P1-W1 owns `packages/economic/**`, `spec/economic/**`, `docs/economic-evidence/**`: EconomicGoal (net-new; GAP-01 says the reference repo has no code implementation), intents and deterministic validation/candidate compilation.
- P1-W2 owns `packages/protocol/**`, `spec/protocol/**`, `docs/protocol-evidence/**`: exact Money/arithmetic, obligations, clearing, reservations, same-currency v1 netting, settlement, finality, reconciliation/evidence. FX/liquidity/credit/collateral and persistence adapters are explicitly deferred in the state record.
- **Phase 2 dispatch is HELD** until P1-W1/P1-W2 are accepted and their stable contracts are integrated.
- The audited code HEAD's [CI run 38111858629](https://github.com/payswapdotorg/PaySwap-3.0/actions/runs/38111858629) succeeded for governance, architecture, lint, typecheck and packages (trust). Evaluate every later commit against its own Actions run; never infer current green status from this historical receipt. A successful CI run proves only the gates it runs; the package matrix currently covers trust, not economic/protocol packages.
- The latest strict ownership report has **3 remaining R6 cross-package-relative-import violations** (V-52..V-54), tracked for Phase 2 integration. ADR-0001/0002/0003 accept the platform-internal and contracts-composition policy and reclassify the leaf model-option-map package; these changes do not refactor inherited source.
- Branch protection was recorded as requested with required checks `governance`, `architecture`, `lint`, `typecheck`, `packages`. Verify that the rule is actually enabled in repository settings before relying on it; a request/commit note alone is not proof of enforcement.
- Production deployment remains unauthorized pending operator decision.

## Read order

1. `spec/development-state/current-state.json` — active frontier, worker dispatch state, closed gates, deferred work and evidence log.
2. `spec/dependency/graph.md` and `spec/dependency/work-orders.md` — sequencing and ownership.
3. `spec/dependency/CONCURRENCY-PLAYBOOK.md` — safe contract-first concurrency rules.
4. `spec/architecture/PAYSWAP-3.0.md`
5. `spec/architecture/AUTHORITY-MODEL.md`
6. `spec/architecture/INVARIANTS.md` and `spec/architecture/invariants.json`
7. `spec/architecture/CAPABILITY-MODEL.md`
8. `spec/architecture/SECURITY-MODEL.md` and `spec/architecture/NON-CUSTODY.md`
9. `spec/architecture/ECONOMIC-EXECUTION-GRAPH.md` and `spec/architecture/MODULE-OWNERSHIP.yaml`
10. `spec/architecture/ACCEPTANCE-GATES.md`
11. `spec/UPSTREAM-BASE.md`, `spec/MIGRATION-FROM-ZCODE.md`, `spec/MIGRATION-FROM-PAYSWAP-ORG.md`
12. `spec/migration/MIGRATION-MATRIX.md`, `spec/migration/MIGRATION-MATRIX-PACKAGES.md` and `docs/migration-evidence/BASELINE-VERIFICATION-RECORD.md`
13. `docs/architecture-governance/VIOLATION-REGISTER.md`, `docs/architecture-governance/adr/` and `tools/architecture-governance/README.md`
14. This handoff is a guide, not a substitute for current state or source/test evidence.

## Immediate TL actions

1. Recover/re-dispatch P1-W1 and P1-W2 from their staged repository work packets when the worker platform can actually admit generation. Confirm a worker turn began; a sent/accepted prompt is not completed work. Respect the maximum of three workers; the three active Work Orders must be pairwise-disjoint.
2. Keep the shared `AmountSpec` wire shape pinned across lanes: `currency: /^[A-Z]{3}$/` and `minorUnits` as a canonical non-negative decimal-integer string matching `/^(0|[1-9][0-9]*)$/`. Trust owns the public wire type; the financial lane owns Money semantics and the bridge. Resolve the duplicate structural pins at integration without reversing the dependency direction.
3. For each lane, independently inspect the actual source and tests, verify its write surface, execute the package-local battery, inspect callers/dependency direction and relevant governance checks, then merge only after evidence-backed acceptance. Record exact merge/commit SHAs and test receipts in `current-state.json`.
4. Recompute the frontier from the graph and state only after acceptance. Do not dispatch Phase 2 until both P1-W1 and P1-W2 are integrated and accepted.
5. Keep the three R6 boundary defects visible. The scheduled fixes are to export `pdfJsCmapsPlugin` from the `@zcode/ui` package surface for Web/Desktop build configs, and replace the test-only cross-package-relative import with the package export. Do not silently waive them or refactor unrelated inherited code.
6. Resolve or explicitly carry the remaining verified findings: the inherited nested `apps/zcode-cli` frozen-lockfile/typecheck issue; 13 credential/network-gated suites in the old-repository baseline (not evidence of live provider behavior); GAP-03 ownership decision for retired `participation`/`campaigns`; GAP-04 phase-by-phase migration-map revalidation; GAP-05 developer API vs ZCode platform API boundary; and P1-W3's opaque signature verification and model-only/in-memory lifecycle limits.
7. Do not claim provider, onchain, mixed-rail, merchant, opportunity, adversarial, client/browser, release or rollback gates as complete until their specific source and evidence exist. The old repository is reference evidence, never the new system's authority.

## Mission

Transform the ZCode fork into PaySwap 3.0: an agent-native universal economic operating system with deterministic economic/financial authorities and one capability fabric across fiat, onchain and future rails.

ZCode supplies Web/Desktop/CLI surfaces, sessions, runtime, transport/RPC, model providers, tool registry, MCP, plugins, skills, subagents, workflows, browser control, artifacts and telemetry.

PaySwap supplies economic goals/intents, capability discovery, policy/security/authorization, the financial protocol, settlement/finality, reconciliation/evidence, opportunities and Lab learning. These are composed, not fused.

## Authority and financial laws

- ZCode application permission and PaySwap financial authorization are complementary but never interchangeable.
- The only valid consequential path is: Agent/UI/Plugin/MCP/Workflow -> Economic Proposal/Intent -> Eligibility -> Policy + Security -> PaySwap Authorization -> Financial Protocol -> Connected Capability -> External Effect -> Observation/Finality -> Reconciliation/Evidence.
- One Financial Protocol Authority; exact/lossless money only. UNKNOWN is not FAILED. Submission is not finality. Ambiguous outcomes must be reconciled, not blindly retried.
- External balances are observations, not PaySwap custody. No hidden custody or unilateral withdrawal authority.
- Agents, LLMs, workflows, plugins, Lab, optimizers and simulations propose; they cannot commit financial truth. Security/adversarial intelligence cannot downgrade BLOCK.
- Provider catalogue data never authorizes an effect. Preserve provider state where needed for action, reconciliation and audit; provider-native execution remains a candidate baseline.
- Blockchain is one rail family, not a parallel financial system.
- Raw private keys, seed phrases, passwords, MFA material, API secrets and protected session cookies never enter model context, normal logs or ordinary artifacts.

## Product and UI law

Build a new PaySwap Web interface on the ZCode-derived Web substrate and PaySwap Desktop on the ZCode-derived native shell. The old `payswap-web` deployment/repository is reference/migration material only. Web, Desktop, Mobile, Extension and SDK/API consume framework-independent PaySwap Surface contracts.

The intended UI is a mature Stripe-class, outcome-first financial operating system (Pay, Receive, Move, Convert, Checkout) with operational areas for Payments, Accounts, Activity, Opportunities, Connections, Capabilities, Security, Reports, Developers and Settings. Stripe is a capability/provider benchmark, not the architecture. No dead financial actions, fake success states or fabricated provider effects.

## Acceptance law

A Work Order is complete only when source, contracts, callers, tests, typecheck, architecture/security gates, limitations, exact commit identity and repository state support it. Financial/capability changes require real adapter and integration evidence where applicable; UI changes require browser/device verification. Lab promotion requires replay/counterfactual/robustness/shadow/canary evidence. Phase 8 additionally requires reproducible deployment, runtime health and rollback evidence.

Frozen architecture changes require an accepted ADR plus dependency-graph and state updates before implementation continues. Never lower verification quality to keep a worker busy.
