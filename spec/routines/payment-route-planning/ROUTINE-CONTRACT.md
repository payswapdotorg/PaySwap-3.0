# Payment Route Planning Routine — frozen-architecture contract

**Status:** P16 implementation target; not a claim that the full routine is currently wired.
**Architecture:** spec/architecture/PAYSWAP-3.0.md — FROZEN FOR IMPLEMENTATION.
**Implementation issue:** [P16 #6](https://github.com/payswapdotorg/PaySwap-3.0/issues/6).
**Portable agent skill:** skills/payment-route-planning/SKILL.md.

## Decision: use a layered routine, not a prompt-only agent

Treat the routine as four related but separate artifacts:

1. **Trigger and typed intent:** a deterministic PaySwap entrypoint fires only after the application has accepted a validated EconomicGoal / MoneyMovementIntent (and PaymentIntent when commerce lineage applies). Natural language is how the user expresses intent; it is not the financial input contract. The parser/clarification loop must produce a validated, versioned intent or stop to ask the user.
2. **On-demand skill:** the payment-route-planning Agent Skill provides portable procedural instructions, references and explanation patterns. The agent discovers the skill by short metadata and loads SKILL.md only on a matching typed intent; larger scenario/schema references are loaded only when needed. The skill tells the agent how to gather missing fields and explain the plan, but is NOT the route compiler, workflow engine, authorization mechanism or source of truth.
3. **Typed routine definition and deterministic planner:** a versioned, schema-validated routine contract binds trigger, stages, inputs/outputs, prerequisites, resource budgets, handlers, state transitions and evidence requirements to existing PaySwap domain APIs. A deterministic orchestrator calls the canonical capability discovery, route compiler, Lab replay/counterfactual and opportunity/protocol seams. The LLM may explain results and ask questions; it cannot invent inputs, route candidates, score components or state.
4. **Durable mission state machine:** persist the routine version, input digest, stage, checkpoints, source observation versions, candidate/exclusion digests, user decisions, opportunity wait conditions, authorization references, execution correlation, events, and recovery state. The runtime resumes from persisted checkpoints after restart/provider/user wait. Any state-changing external action is separately authorized by existing PaySwap authorities.

This combines the progressive-disclosure benefits of Agent Skills with typed workflow contracts and deterministic financial services. A skill alone would be too weak: an instruction file cannot prove rail eligibility, guarantee a search was complete, hold durable state, enforce idempotency or authorize a payment.

## Trigger semantics

The trigger is **an accepted typed intent event**, not a free-text keyword, not an LLM's unvalidated guess, not a provider webhook and not the mere opening of the composer.

Trigger event contract to implement under existing module/layer rules:
- stable event/intent ID and schema version;
- validated intent reference/digest plus an immutable intent snapshot/version;
- principal/tenant/session references and authority-lineage reference (opaque refs only);
- exact amount/currency where required, sender/source and recipient/destination references, user hard constraints and time bounds;
- requested capabilities/context references and caller-supplied evaluation instant;
- explicit origin channel (Pay action, agent text, supported voice transcript if/when voice is implemented, checkout/API, external agent);
- idempotency/correlation key.

If the text says “pay”, “send”, “transfer”, “pay this invoice” or equivalent but required fields are missing/ambiguous, route to structured clarification and emit a NEEDS_INPUT stage; do not start a fabricated plan. If it is clearly another task (for example, connect Stripe), do not invoke this routine. Pay/Receive/Move/Convert and commerce PaymentIntent may map into the common planning routine only through the validated intent-to-Goal contract. Routing hints are explicit inputs, never inferred hidden facts.

## Stage contract

| Stage | Responsible authority / existing seam | Result |
|---|---|---|
| 0. Match + load | typed intent router + skill provider + routine registry | routine ID/version selected deterministically; skill lazy-loaded; source and routine digests pinned |
| 1. Validate / clarify | economic input validators + shared agent surface | complete validated intent and explicit hard/soft constraints, or NEEDS_INPUT |
| 2. Discover sender rails | Capability and Network Authority / current instance + observation APIs | versioned eligible sender rail snapshot + exclusion reasons |
| 3. Discover recipient rails | Capability and Network Authority / independently grounded receiving observations | versioned eligible recipient rail snapshot + exclusion reasons |
| 4. Compile available routes | packages/route-compiler + corridor/location/quote/venue observations | supported route-plan candidates + exclusions; discovery output is never executable authority |
| 5. Apply hard gates and rank | Policy/Governance + Security + existing exact-money route scoring/ranking | only hard-eligible candidates participate; transparent metrics and deterministic ordering; UNKNOWN/incomparable fields retained |
| 6. Explore bounded counterfactuals | packages/lab replay/simulation/counterfactual APIs | conditional scenarios and deltas against identical frozen base facts, never production evidence |
| 7. Discover offers/opportunities | packages/opportunities + existing advisory opportunity-to-proposal-to-decision seam | evidence-backed offers/proposals with provenance, privacy controls, expiration and opt-in semantics |
| 8. Present user choices | shared agent composer + mission UI | distinct current routes vs conditional opportunities; Proceed / Wait choice and exclusions, metrics, evidence freshness and search coverage |
| 9a. Proceed now | fresh revalidation + preview → Trust/Authorization → Financial Protocol and connected capability | selected graph revalidated against current observations; explicit scoped approval; authorized operation; evidence/reconciliation |
| 9b. Wait | durable mission/scheduler driven by new observations/offers | waits only under explicit criteria/deadline; reevaluates on new evidence; notifies user; no automatic dispatch merely because an offer arrives |
| 10. Reconcile + close | Financial Protocol Authority and observations/finality | confirmed/failed/UNKNOWN backed by evidence, durable report and append-only timeline; learning remains advisory |

## Routine manifest requirements

The implementation must define a machine-readable, versioned routine manifest with at least:
- routineId, schemaVersion, immutable routineVersion / digest;
- trigger event types and typed intent predicate;
- routine skill identifier + content digest;
- inputs and validators; required vs optional fields; hard constraints vs preferences;
- deterministic ordered stages with typed handler IDs, capability/prerequisite contracts and output schemas;
- explicit alternative/conditional stages for counterfactual and wait paths;
- bounded search policy (depth/hops, candidates, participants, scenarios, time/compute budget);
- freshness rules, required evidence, route ranking policy/version and deterministic tie-breakers;
- pause/resume/checkpoint/cancel/expiry/error policies;
- permitted tool/service scopes for the task;
- authority/effect class for every handler; no direct effect handler in discovery, skill or LLM paths;
- compatibility policy and migration behavior;
- tests/evidence references and lifecycle state.

Validate manifest shape, schema version, digest, handler allowlist and capability bindings before loading/executing. Do not execute shell/script/code bundled in an arbitrary skill as part of the financial plan. Routine handlers are trusted first-party code that are registered through the existing module and authority boundaries. Version changes are pinned per mission; a running mission is not silently rewritten to use a new routine.

## Why these patterns fit (research synthesis)

- **Agent Skills / progressive disclosure:** standardized SKILL.md folders advertise short name/description, load full instructions on demand, then read references/scripts only if needed. Useful for procedural guidance and portable domain expertise, not a financial authority boundary. See [Agent Skills specification](https://agentskills.io/) and [OpenAI Skills docs](https://developers.openai.com/api/docs/guides/tools-skills).
- **Typed tools / resources / prompts (MCP):** keep roles distinct. Application-owned read-only context/resources provide observations and policy facts; typed tools invoke bounded service operations; prompts are reusable user/agent templates. Do not expose an unrestricted generic money-moving tool to a planner. See [MCP server primitives](https://modelcontextprotocol.io/specification/draft/server/index) and [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/).
- **Deterministic service orchestration:** compile and score through PaySwap's route-compiler and capability seams, use Lab for reproducible replay/counterfactuals, and use the opportunities package for evidence-backed proposals. Keep provider-native execution as a baseline candidate. No package should be reimplemented inside an LLM prompt.
- **Durable workflow/checkpointing:** use PaySwap's existing mission/task/agent runtime and persistence seam to record stage transitions and resume on waits/restarts. External durable-workflow products illustrate the pattern (checkpointed graphs and long-running human waits), but do not add a new orchestration dependency by default: the frozen architecture and repo implementations decide whether one is warranted. See [Temporal Durable AI](https://docs.temporal.io/ai) and [LangGraph human-in-the-loop](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph).
- **Manager + bounded specialist pattern:** one user-facing PaySwap agent owns the conversation and delegates discrete, typed, non-authoritative calculations to route discovery, Lab and opportunity services. Subagents may parallelize independent read-only analyses but cannot receive authority or make irreversible decisions. See [OpenAI orchestration patterns](https://developers.openai.com/api/docs/guides/agents/orchestration).

## Deterministic planning rules

- Discover sender and recipient rails independently; a rail is eligible only if an actual connected instance is scoped, fresh enough, authorized for the operation class, available and eligible for the required corridor.
- Compile route candidates through the existing route compiler. Every unsupported candidate shape produces explicit exclusion reasons. Search is bounded and must disclose truncation; never claim to have explored all possibilities when capped.
- Apply hard constraints before soft preference ranking. Return transparent dimensions and Pareto/non-dominated options where trade-offs conflict. Keep provider-native baseline, composed and multi-provider plans comparable only when existing comparability laws permit.
- Use exact money, caller-supplied time, canonical ordering and reproducible digests. Do not guess currency conversion, fees, risk, health, delay, liquidity or outcome.
- Counterfactuals vary named assumptions over the same immutable fact snapshot. They never update actual obligations, reservations, balances, financial state, authority or opportunities.
- Netting, credit, group payments and delay use existing protocol semantics and explicit backing/consent. Current same-currency netting limitation remains in force unless the frozen architecture is amended.
- Conditional future rail, credit, partner or third-party participation is not a currently available route. Preserve the distinction in both the typed model and UI.
- Offers to other nodes are minimum-disclosure, opt-in, time-bounded and revocable. A public capability or an agent-generated proposal is not participant consent.
- A Wait choice creates a durable waiting mission; it never authorizes an automatic payment when an opportunity arrives. Re-plan with fresh evidence and ask for a new preview/approval as required.
- UNKNOWN remains distinct from FAILED; external timeout after a possible effect requires reconciliation and idempotent continuation, never blind retry.

## Acceptance criteria

- A validated intent emits exactly one routine start for an idempotency/correlation key, and the correct versioned routine/skill is loaded deterministically.
- A non-payment intent, malformed intent or missing required field cannot invoke downstream route compilation; incomplete intents pause at NEEDS_INPUT.
- Routine/skill load failure is surfaced clearly and fails closed; no implicit fallback to LLM-only routing.
- Independent sender/recipient snapshots contain source/version/freshness, distinguish catalogue from connected instances and expose all typed exclusions.
- Route compiler results, scoring and scenario results are passed through typed contracts, never regenerated from LLM prose. Identical inputs/time/seeds produce byte-identical plan/scenario digests and deterministic ordering.
- Scenario suite includes rail added on each side, third-party intermediary/provider, group payment, committed credit/liquidity, delay/deadline, netting and provider outage/staleness/partial/UNKNOWN.
- User is shown available-now routes separately from conditional opportunities and may choose Proceed or Wait; waiting can be cancelled/resumed and never dispatches itself.
- Revalidation invalidates stale plans. Material route/amount/destination/policy change requires a new preview and fresh explicit scoped authorization.
- Every effect is created by existing PaySwap authorities with lineage, idempotency and authoritative reconciliation. Offline/contract/sandbox/live proof tiers are separate.