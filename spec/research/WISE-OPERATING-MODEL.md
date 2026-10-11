# Wise Operating Model — PaySwap 3.0 Research and Rebuild Blueprint

- **Status:** Advisory external research mapped to existing PaySwap 3.0 architecture; not a new financial authority and not a change to the frozen architecture lock.
- **Research cut-off:** 2026-10-11.
- **Purpose:** Transfer publicly evidenced operating lessons from Wise into testable PaySwap implementation requirements. This is not an attempt to reproduce Wise's private internals.
- **Authority rule:** The frozen architecture, accepted ADRs, source code, tests and current Work Orders remain authoritative. This document supplies evidence and acceptance guidance only.

## 1. Findings supported by public evidence

Wise's FY2026 Form 20-F says that during the year ended 2026-03-31 it moved **$243.5 billion** in cross-border volume for **18.9 million** people and businesses. As of 2026-03-31, it reported **$39 billion** across customers' cash and Wise Assets holdings, including **$9.0 billion** in Wise Assets (assets under custody). It also reported more than **80 regulatory licenses globally**. These are company-reported figures, not independent measurements or PaySwap targets. The $39 billion is a combined holding figure, not all cash and not all money-transmission liabilities.

The same filing says that over half of transactions during the year used Wise's direct connections/integrations to domestic payment systems without relying on a third-party provider to receive or disburse funds. Wise also describes local bank/payment-provider partners, regulatory permissions, internally developed technology, and global operations/support as interdependent infrastructure elements. Direct connections are not universal; partner routes remain necessary where Wise lacks direct access.

The filing separately reports approximately **$29.959 billion** in customer balances and **$295.5 million** in outstanding money-transmission liabilities at 2026-03-31. It defines those transmission liabilities as transfers not yet paid out or delivered to recipients. Do not conflate these balance-sheet categories with each other, a provider-reported balance, an external bank balance, or a PaySwap custody claim.

Wise documents a common API workflow as recipient -> quote -> transfer -> fund -> track. Requirements vary by corridor, amount, recipient type and sender context. Its documented authenticated quote workflow locks the mid-market rate for 30 minutes, and transfer creation uses an operation-specific idempotency field (customerTransactionId for the cited standard-transfer endpoint). The duration and idempotency mechanism are Wise-specific terms, not PaySwap constants.

Wise's transfer statuses include incoming_payment_waiting, incoming_payment_initiated, processing, funds_converted, outgoing_payment_sent, bounced_back, funds_refunded, charged_back, cancelled and unknown. Wise explicitly cautions that outgoing_payment_sent means it sent funds to the recipient bank/payment network; it does not prove the beneficiary bank credited the account. Returns may occur days or weeks after the payout was sent. These names must remain adapter-level evidence, not a hard-coded PaySwap global state enum.

Wise's EU safeguarding page describes its EU entity's customer-fund protection arrangements. That is jurisdiction/entity-specific evidence, not a general rule to apply to every Wise entity or to PaySwap. PaySwap remains non-custodial by default under spec/architecture/NON-CUSTODY.md.

## 2. What public evidence does not disclose

Do not invent or claim to reproduce Wise's:
- internal microservice boundaries, database model or private routing algorithms;
- FX-rate aggregation, hedge thresholds, proprietary fraud models or internal risk thresholds;
- all partner contracts, corridor-level economics or production route availability;
- global licensing footprint, direct payment-network memberships, liquidity or operational capacity.

Software can encode a corridor and orchestrate providers; it cannot create licensing, bank relationships, provider credentials, payment-network membership, settlement liquidity or live operational authority by itself.

## 3. Translate the lesson into existing PaySwap authorities

Wise is a real-world reference, not the owner of PaySwap's contracts. Use the frozen PaySwap architecture, not Wise's product hierarchy.

| Wise operating concern | Canonical PaySwap boundary | Required interpretation |
|---|---|---|
| Sender's economic purpose | EconomicGoal / MoneyMovementIntent | Express the desired outcome and constraints; do not encode a provider's workflow as the financial authority. |
| Supported currency/country/method combination | CapabilityDefinition + ProviderImplementation + ConnectedCapabilityInstance + CapabilityObservation | A corridor is a versioned discovery/projection across capabilities, restrictions and fresh observations, not an independent authority that makes an unsupported route executable. |
| Recipient fields and account checks | Provider-neutral intent/Surface contracts + provider-specific capability requirements | Fields and validation depend on corridor, method, recipient type and provider. Preserve verification outcome, provenance and changes. |
| FX price, fees and delivery estimate | Versioned economic terms / quote contract, referenced by the Economic Execution Graph | Make source/target amounts exact; disclose fee line items and assumptions; record quote provenance and expiry. An estimate is not a guarantee unless a provider-backed contract says so. |
| Funding, conversion, payout | Financial Protocol + connected provider capability | Keep separate state and evidence for each stage. Never turn an acknowledgement into finality. |
| Provider statuses and webhooks | ProviderStateEnvelope + observations + event/evidence records | Preserve the raw provider state and external identifiers; handle duplicates, out-of-order events and delayed returns. Normalization must not erase provider semantics. |
| Reconciliation and returned funds | Financial Protocol Authority | Sole authority for financial truth, obligations, finality, returns and reconciliation. UNKNOWN must remain distinct from FAILED. |
| KYC/KYB, sanctions, fraud, limits and approval | Policy & Governance + Trust/Authorization + Security authorities | Provider/agent/risk-model output is evidence or recommendation; deterministic gates and valid authority determine whether execution may proceed. |
| Treasury/liquidity and alternate routes | Financial/capability models plus later execution/treasury Work Orders | Begin with explicit observations and planning constraints. Do not fabricate reserve balances, guarantee FX exposure, or assume custody. |
| Customer and operator experience | Framework-independent Surface API and Web/Desktop consumers | Show quote assumptions, authorization state, stages, exceptions and honest uncertainty. Keep UI state a projection, never the financial ledger. |
| Optimization and learned routing | Lab/Director, advisory until authorized | Compare eligible native, composed and multi-provider strategies with auditable inputs. Learning cannot authorize or declare finality. |

## 4. Required domain behavior

### 4.1 Corridor and capability discovery

A corridor is not merely a currency pair. Its eligibility can depend on source/destination countries, sender profile, business/personal context, amount, recipient type, funding and payout methods, purpose, account-field requirements, scheme cutoff/calendar, provider limits, pricing availability, delivery estimate and fresh provider health.

A corridor view must reference the underlying capability/provider/connected-instance identities and their versions or observations. It must show why a route is eligible or excluded. Catalogue support alone cannot authorize execution.

### 4.2 Quote as versioned economic terms

A quote is a bounded offer/evidence object, not an authorization and not a booked external effect. At minimum, where applicable, record:
- stable quote ID and version; source and target currencies and exact amounts;
- fee line items, exchange rate, rate source/time and rounding rule;
- sender/profile context and recipient/method assumptions;
- funding and payout routes, provider and execution mode;
- issue and expiry timestamps, delivery estimate and whether it is guaranteed or indicative;
- conditions for locking, refresh, cancellation, and material-change handling;
- evidence and provenance for every externally supplied term.

Do not assume every provider locks a rate for the same duration or at the same lifecycle stage. Exactness must follow PaySwap's Money contract; never use binary floating point for monetary arithmetic. If the quote expires, scope changes, the recipient or amount changes, or a material provider observation changes, revalidate and require renewed customer authorization when the approved terms changed.

### 4.3 One truthful financial lifecycle

Keep distinct records/state for:
1. intent and eligibility;
2. quote/terms and acceptance;
3. funding instruction and evidence that funds were received;
4. conversion execution and actual rate/fees, if applicable;
5. payout instruction, attempt and provider acknowledgement;
6. observation and rail/provider finality;
7. reconciliation and evidence;
8. return, refund, chargeback, cancellation or recourse as applicable.

A provider status is an observation, not automatically PaySwap finality. Keep both original provider status/event payload references and a stable PaySwap projection. Provider-specific rollback or non-monotonic status transitions must not rewrite immutable historical financial facts.

### 4.4 Events, idempotency and ambiguity

- Implement idempotency according to each provider operation's actual contract. Do not assume a universal header or one global key scope.
- Persist idempotency key, command/request ID, provider reference, correlation ID, event ID, event creation/receipt times and processing outcome, with secrets redacted.
- Authenticate webhook signatures where supported; validate timestamp/replay constraints where the provider documents them.
- Make duplicate delivery harmless. Handle out-of-order events without replacing a newer canonical observation with an older one.
- When an API times out or returns an ambiguous response after an effect may have occurred, mark the outcome UNKNOWN and reconcile via provider retrieval/events before retrying a consequential command.
- Keep return and refund paths open after a payout was reported sent. Late events require a compensating/recovery path, not mutation of history.
- Where webhooks are unavailable or not authoritative, use controlled retrieval/reconciliation and record its provenance.

### 4.5 Custody, safeguarding and liquidity boundary

PaySwap 3.0's existing non-custody law remains in force. A ConnectedCapabilityInstance observation of a balance is not a PaySwap-owned balance and does not prove funds are available for another transaction unless contractual provider semantics establish that fact.

Do not create customer e-money liabilities, safeguarded reserve pools, a custodial balance ledger or proprietary FX hedge execution implicitly while building transfers. Any future decision to custody funds, issue liabilities, operate pooled reserves or bear guaranteed-rate FX exposure requires a separately reviewed regulatory/business model, explicit architecture decision, authority and ledger design, provider/legal evidence and operational controls.

Initial liquidity work may model observed availability, prefunding requirements, timing, concentration, currency exposure and fallback routes. A planning estimate cannot authorize an effect or claim that PaySwap owns the underlying funds.

## 5. Work Order map and sequencing

Keep the canonical phase order and existing three pairwise-disjoint worker lanes. This research does not unlock Phase 2 and does not replace or enlarge the current P1 frontier.

- **P1-W1 — Economic model:** define rail-neutral MoneyMovementIntent and candidate compilation so user goal, constraints and economic terms can be represented without a provider-specific transfer engine.
- **P1-W2 — Financial Protocol:** retain one exact-money authority and explicit obligations, reservations, settlement attempts, finality, reconciliation and evidence. FX/liquidity/credit/collateral and persistence work already marked deferred stay deferred unless a separate accepted Work Order changes scope.
- **P2-W1 — Capability/connector contracts:** make corridor requirements, provider semantics, execution modes, limits, pricing/delivery observations and ProviderStateEnvelope explicit and versioned. Keep catalogue vs connected-instance separation.
- **P2-W2 — Provider runtime:** build provider-specific funding/transfer/recipient interactions with credentials isolated from model context, endpoint-accurate idempotency, authenticated event ingestion where supported, raw-state retention and reconciliation retrieval.
- **P2-W3 — Surface/API:** expose provider-neutral quote and recipient requirements, clear fee/rate/expiry/estimate assumptions, progress, exceptions and status projections across clients.
- **P5-W1 — Best execution:** evaluate a provider-native path as the baseline; compare composed or multi-provider paths only when each leg is eligible, observed, priced and explainable. Preserve route/quote/authorization lineage in the Economic Execution Graph.
- **P5-W3 — Merchant/checkout where relevant:** reuse shared financial/capability lifecycle rather than inventing a second transfer or settlement engine. Require provider-verified effects.
- **P8-W1/W2/W3 — Certification/security/release:** test event ordering, duplicate commands/events, ambiguous timeouts, delayed returns, quote expiry, changed beneficiary/price, cancellation/refund, secret boundaries, sandbox/live distinctions, end-to-end behavior, deployment and rollback.

The first live implementation should target one or two corridors for which PaySwap has verified provider access and the applicable legal/operational permissions. The sample GBP->EUR case is a model for questions to ask, not a mandated first corridor.

## 6. Acceptance checklist for a real corridor

Do not mark a corridor or provider capability complete until repository evidence proves all applicable items below.

- [ ] Eligibility and recipient requirements come from versioned contracts and the real provider/corridor specification.
- [ ] Quote terms are exact, time-bounded, auditable, versioned and displayed without hiding fees or converting estimates into guarantees.
- [ ] Transfer intent binds to the intended recipient, accepted quote/version, funding assumptions and idempotency boundary.
- [ ] Funding, conversion, payout, observation, finality and reconciliation are distinct; every transition has source evidence.
- [ ] Duplicate requests/events do not create duplicate effects. Out-of-order events cannot silently regress canonical state.
- [ ] UNKNOWN after timeout or lost acknowledgement cannot trigger a blind retry; reconciliation checks provider state first.
- [ ] A payout reported sent is not presented as beneficiary-account credit unless the provider/rail evidence warrants that claim.
- [ ] Late bounce-back/return, cancellation, refund and chargeback paths are represented, tested and financially reconciled where supported.
- [ ] Every material quote/route/recipient/provider change triggers the required revalidation and renewed approval when terms changed.
- [ ] Provider raw states, references, revisions, fees, times and evidence are retained while customer UI presents an understandable projection.
- [ ] No catalogue-only route, synthetic balance, fake success, hidden mock or UI-owned financial state can cause or simulate production success.
- [ ] Sandbox and live modes are mechanically distinct. Live tests use real authorized integrations and document exact environment, effects, reconciliation evidence and cleanup/compensation.
- [ ] Architecture, typecheck, package tests, relevant integration/E2E checks and the Work Order acceptance record pass at an exact commit SHA.

Sandbox state simulation is valuable for deterministic edge-case coverage, but it is not proof of live provider behavior. A corridor is not certified merely because a transfer can be created in a sandbox.

## 7. Public source register

Sources checked on 2026-10-11. Where documentation changes, the implementation owner must re-open the exact provider endpoint/guide and record the version or retrieval evidence at implementation time.

1. **Wise Group plc, FY2026 Form 20-F**, official SEC filing: https://www.sec.gov/Archives/edgar/data/2099039/000119312526282911/d17323d20f.htm  
   Relevant evidence: operating volumes/customer counts and assets holdings; network design and direct domestic connections; licensing; customer balances and outstanding money-transmission liabilities; disclosed FX exposures. Company-reported and jurisdiction-specific data; not PaySwap requirements.
2. **Wise Platform API reference:** https://docs.wise.com/api-reference  
   Resource model and endpoint reference. Contracts are endpoint-specific.
3. **Wise Platform, Getting started / API concepts:** https://docs.wise.com/guides/developer  
   Quote behavior, 30-minute rate lock for the documented quote workflow, operation-specific idempotency and API integration model.
4. **Wise Platform, Create standard transfers:** https://docs.wise.com/guides/product/send-money/transfers/standard-api-transfers  
   Required authenticated quote, target account, and customerTransactionId idempotency field for the standard-transfer endpoint cited by the guide. Integration model and endpoint requirements apply.
5. **Wise Platform, Transfer statuses:** https://docs.wise.com/guides/product/send-money/tracking/transfer-statuses  
   Provider-specific status semantics, normal and return flows, unknown state and warning that outgoing_payment_sent does not prove beneficiary credit.
6. **Wise Platform, Track transfers:** https://docs.wise.com/guides/product/send-money/tracking/track-transfers  
   Tracking/webhook approach and late returns.
7. **Wise Help Centre, EU safeguarding:** https://wise.com/help/articles/50VrYRVwHcsYeKzvWbjf3n/how-our-eu-entity-wise-europe-sa-safeguards-customer-funds  
   The cited safeguarding explanation is about Wise Europe SA and must not be generalized to every Wise entity or to PaySwap.

## 8. Architectural conclusion

The lesson to take from Wise is a discipline: each quote has explicit terms; each action has a valid authority; every external financial effect has evidence; each provider has real corridor constraints; a sent instruction is not the same as finality; and uncertainty is reconciled rather than hidden.

PaySwap's differentiator remains its frozen architecture: one deterministic financial protocol and capability fabric across multiple providers and rail families, with native pass-through, composed execution and optimized multi-provider strategies sharing the same authorization, evidence, reconciliation and security boundaries.
