# PaySwap 3.0 Architecture Lock

Status: FROZEN FOR IMPLEMENTATION
Version: 3.0-foundation-2026-10-08

## Product definition

PaySwap is a universal economic operating system. It lets humans, agents, merchants, developers and external applications accomplish economic goals across fiat, onchain and future rails through one capability fabric and one deterministic financial protocol.

## Architectural thesis

ZCode supplies the platform substrate: Web/Desktop/CLI surfaces, sessions, runtime, transport/RPC, model providers, tool registry, MCP, plugins, skills, subagents, workflows, browser control, artifacts and telemetry.

PaySwap supplies the economic authority: goals, intents, capability discovery, authorization, policy, financial protocol, settlement, reconciliation, evidence, security, opportunities and Lab learning.

These are composed, not fused. ZCode platform authorities cannot commit economic effects. PaySwap financial authorities cannot depend on a UI, model, runtime or framework.

## Canonical topology

Experience / Agent -> Economic Goal -> Intent -> Capability Discovery -> Strategy / Organization -> Economic Execution Graph -> Eligibility + Policy + Security -> PaySwap Authorization -> Financial Protocol -> Connected Capability -> External Effect -> Observation / Finality -> Reconciliation / Evidence -> Learning.

## Five PaySwap authorities

1. Financial Protocol Authority: obligations, reservations, clearing, netting, settlement, finality, reconciliation, recourse and financial evidence.
2. Trust and Authorization Authority: principals, AgentPrincipals, mandates, delegation, approval artifacts, signer authorization, credential/session references and security epochs.
3. Capability and Network Authority: capability definitions, provider implementations, connected instances, observations, certification and marketplace state.
4. Policy and Governance Authority: compliance, sanctions, risk, velocity/spend limits, incentives, eligibility and effective configuration epochs.
5. Intelligence and Learning Authority: candidate plans, strategies, Organizations, experiments, opportunities, optimization and learned/adversarial signals. It never commits financial truth.

## Economic model

EconomicGoal, MoneyMovementIntent, PaymentIntent, ServiceAccessIntent and FinancialOpportunity are first-class objects. They compile into shared execution machinery instead of parallel payment engines.

## Financial protocol

Economic Activity -> Fulfillment Activity -> Clearing Record -> Obligation -> Netting Set -> Net Position -> Settlement Instruction -> Settlement Attempt -> Rail Operation -> Finality Record.

Evidence is separate but linked. Exact/lossless money is mandatory. UNKNOWN is not FAILED. Submitted is not finality.

## Capability model

CapabilityDefinition -> ProviderImplementation -> ConnectedCapabilityInstance -> CapabilityObservation.

Provider catalogue data never authorizes execution. Provider state needed for customer action, reconciliation and audit is preserved. Provider-native optimization remains a candidate baseline alongside composed and multi-provider execution.

## Economic Execution Graph

Every multi-step economic plan is a typed, versioned graph preserving intent lineage, authority lineage, state observations, policy/security decisions, idempotency, finality, evidence and recourse semantics.

## Rail families

FIAT, ONCHAIN and OTHER/FUTURE are peer settlement-rail families. Blockchain is not a parallel financial system and never gets a separate financial ledger or finality authority.

## Agent model

Agent Body is the stable capability identity. Agent Instance is Body plus model/algorithm and runtime. Agent Package bundles bodies, extensions, required capabilities, evaluation and provenance. Strategy describes what should happen. Organization describes who or what executes it. Director combines deterministic controls with replaceable learned components.

## Lab

The Reality Engineering Lab searches strategies, Organizations, capabilities, route structures, provider choices, timing and interventions using replay, counterfactuals, robustness, shadow and canary promotion. Learning output remains advisory until it crosses PaySwap authorities.

## Product surfaces

The primary Web product is a new PaySwap UI built on the ZCode-derived Web substrate. The ZCode-derived Desktop shell becomes PaySwap Desktop. Mobile, browser extension, SDK/API, embedded checkout and external-agent surfaces consume the same framework-independent PaySwap Surface API.

The old `payswap-web` deployment is reference/migration material, not the canonical new frontend.

## UX benchmark

PaySwap should feel like a mature Stripe-class financial operating system: outcome-first actions, clear operational states, excellent search/command, progressive disclosure, explicit test/live and network context, human-readable security, accessible responsive design, and no fake financial success. Stripe is a benchmark and provider capability, not PaySwap architecture.

## Security

LLMs, agents, workflows, plugins, UIs, optimizers and simulations propose. Deterministic PaySwap policy, security, authorization and Financial Protocol decide and commit.

## Architecture change law

Workers may not silently change this lock. A required change must be proposed as an ADR, accepted by the TL, and then reflected in the dependency graph and current-state before implementation continues.