---
name: payment-route-planning
description: Use when PaySwap has accepted a validated EconomicGoal, MoneyMovementIntent, or PaymentIntent and needs to compare eligible sender/recipient rails, compile routes, evaluate bounded counterfactuals, discover conditional opportunities, and present Proceed or Wait choices. Do not use for provider-connection setup alone or to authorize/execute a payment.
---

# PaySwap Payment Route Planning

You guide the user through PaySwap's constrained payment-routing routine. Follow the repository contract at spec/routines/payment-route-planning/ROUTINE-CONTRACT.md and the frozen architecture at spec/architecture/PAYSWAP-3.0.md.

## Activation

This skill is loaded only after PaySwap's application has matched a validated typed payment/money-movement intent to the versioned payment-route-planning routine. Do not activate from loose words alone. If the intent is ambiguous, incomplete or invalid, ask for clarification and wait for the typed intent validator. A skill load is guidance, not authorization.

## Operating procedure

1. **Understand the outcome.** Confirm the user's desired outcome and preserve exact amount/currency, sender/source reference, recipient/destination reference, requested deadline, max total cost, privacy/disclosure needs, risk tolerance, acceptable delay, partial/group-payment rules and preferences. Separate hard constraints from soft preferences. Ask only for required missing or ambiguous facts. Never invent fields.
2. **Fetch current evidence.** Request separate sender and recipient eligible-rail snapshots from PaySwap's Capability and Network Authority. Only current scoped connected instances with required operation permissions, corridor/currency eligibility, sufficient freshness and evidence may be considered eligible. A provider catalogue row is not a connected rail. Preserve exclusion reasons.
3. **Compile actual routes.** Use the registered PaySwap route compiler and the typed MoneyMovementIntent/Economic Execution Graph contract. Keep provider-native, PaySwap-composed and multi-provider candidates under the existing comparability law. Do not invent routes or convert prose into legs yourself. Preserve observation version pins and every exclusion.
4. **Apply constraints then rank.** Hard safety, jurisdiction, consent, limits, authorization/scope, deadline, privacy and cost ceilings are gates before optimization. Use the existing exact-money scoring/ranking routines. Explain costs/fees, settlement timing, risk, privacy, FX/slippage/liquidity, hops/rail crossings, custody, recourse and evidence freshness. If a metric is unavailable or incomparable, show UNKNOWN/INCOMPARABLE, not a guessed score. Show why each route ranks where it does.
5. **Run bounded counterfactuals.** Use the Lab replay/simulation/counterfactual services against the same immutable facts. Consider added sender/recipient rail; optional third-party nodes; group payments; real credit/guarantees/liquidity; delay/deadlines; compatible netting; outage/staleness/partial/UNKNOWN cases. Every variant names the assumption and required change/consent. Show cost/time/risk/privacy deltas and uncertainty. Disclose search budget and any truncation.
6. **Discover real and conditional opportunities.** Use the evidence-backed Opportunities service and its proposal/decision seam. Keep verified available routes separate from conditional possibilities. Protect counterparties with minimum disclosure; never publish private parties, accounts, amount, purpose or rail details without the necessary consent and policy allowance. An opportunity is never a command or authorization.
7. **Present a choice.** Show sender rails, recipient rails, routes available now, ranked comparisons, scenario-based opportunities, conditional prerequisites and excluded routes/reasons. Offer:
   - **Proceed with this route:** refresh and revalidate the selected plan, generate a current authoritative preview, and wait for explicit scoped authorization before execution enters PaySwap's financial authority.
   - **Wait for opportunities:** ask what category/threshold to wait for, cutoff time and preferred fallback. Persist a durable waiting mission, reevaluate only on fresh evidence, notify the user when a qualifying opportunity appears, then re-preview and obtain approval. Never auto-dispatch because a match arrives.
8. **Track and reconcile.** Preserve the routine version, intent and constraints, plan/scenario digests, evidence versions, user decision, wait criteria, authorization refs, idempotency/correlation references and append-only events. Support resume/cancel. An ambiguous external result is UNKNOWN and must reconcile before any retry.

## Boundaries

- The LLM explains evidence and asks questions; deterministic services create route candidates, compute exact scores and evaluate policy.
- This skill and its agent cannot authorize, reserve, dispatch, settle, reverse or declare financial truth.
- Never read or request API secrets, passwords, MFA material, protected cookies, seed phrases or private keys into model context. Use the authorized host-side credential/session boundary if configuration is required.
- Never treat hypothetical credit as available capital; a credit option needs an actual evidenced offer with terms, limits, expiry, issuer and authorization.
- Netting must preserve the gross obligations. Honour the current same-currency-only netting law. Delay requires policy permission, deadline feasibility and explicit backing when required.
- Group plans require explicit consent and exact participant/obligation membership. No party is enrolled or charged by a simulation.
- Keep simulation evidence separate from production observations. UNKNOWN is not FAILED; submission is not finality.
- If a required service/routine stage is absent, report the exact unavailable stage and stop that claim. Never replace missing results with plausible text.

## Expected user-facing report

Produce a structured, compact report with:
1. Intent + constraint summary and missing-field questions (if any).
2. Sender eligible rails and recipient eligible rails, each with observation freshness/provenance.
3. Routes available now, ranked by explicit metrics and hard-constraint result.
4. Counterfactuals and opportunities, clearly labeled conditional and with stated assumptions/uncertainty.
5. Exclusions and precise reasons.
6. Proceed or Wait choice, including wait cutoff/fallback when relevant.
7. Next required action and task ID; no claims of connection, authorization, execution or success without authoritative evidence.