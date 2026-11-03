# ADR-0019 — P26: the live-mode READINESS framework (specification now, activation never implied)

- **Status:** PROPOSED → ACCEPTED (P26-0, the architecture gate — the specification is the deliverable; NO code activates live mode in P26)
- **Date:** 2026-11-03
- **Deciders:** resident TL (the takeover station, P26-0)
- **Supersedes:** none. Narrows nothing in INV-25; extends ADR-0017 D14 by writing down exactly what D14 demands, so a future activation order has a reviewed target instead of a blank page.
- **Resolves:** the operator's P26 item 4 — "complete live-mode readiness: separate live credentials, production authorization, risk controls, financial approval policies, audit evidence and reconciliation from Sandbox mode."

## Context

The connector is Sandbox-only **by law**: live keys (`sk_live_`/`rk_live_`) are refused at three layers (the U1 verb, the verification probe, the transport edge — INV-25, ADR-0017 D14). The operator's P26 order asks for live-mode **readiness**, not activation: the separation of concerns, the authorization model, the risk controls and the audit/reconciliation shape must exist as reviewed specification so that "a separate, reviewed live-mode authorization and security release" (the operator's own framing) has something concrete to review. This ADR is that specification. **It switches nothing on.** Every mechanism in this ADR that is implementable without live keys may land as code (the separation plane); anything that would accept, route or dispatch live material is defined-only and remains typed-refused exactly as today.

## The decisions

### D1 — The credential separation plane (implementable now)

A live credential class `STRIPE_LIVE_RESTRICTED_KEY` is specified with its own acceptance law: `rk_live_` ONLY (never `sk_live_` full-secret keys — the P13 operator guidance "production should mint restricted keys" becomes law), key-class marker and mode pinned at seal time, live connections stored under a **distinct storage namespace** (`payswap.connection.live.<id>`) never interchangeable with sandbox records, and every surfaced fact (UI, model context, receipts, logs) carrying the explicit `LIVE` marker — a live connection is never rendered or described as sandbox and vice versa. The INV-25 refusal edges stay in place until the activation order; the classes and namespaces exist now so the activation diff is a reviewed gate, not a rewrite.

### D2 — The activation law (defined-only)

Live mode activates ONLY by: (a) a separate operator order naming the account and the date; (b) the live-certification evidence bundle of D5 complete; (c) the per-account activation record (who ordered, what evidence, which key id, at what time — append-only); (d) an explicit per-connection live opt-in by the principal through the security field (never a default, never inherited, never model-proposed). Absent ALL four, the existing typed refusals are the behavior. "Make it work" never infers live consent (D14's law, restated as the activation law's first clause).

### D3 — The risk-control plane (specified now, enforced at activation)

The live surface is bounded by: **velocity caps** (per-connection and per-principal limits on live FINANCIAL_CREATE and FINANCIAL_IRREVERSIBLE dispatches, per rolling window, enforced host-side before the seal opens); **payee allowlists** (a reviewed list per connection for transfer/payout-class destinations — a destination outside the list is a typed refusal, never a prompt); **emergency revocation** (a single operator act that freezes all live dispatch and forces re-authorization of every pending action, recorded in the audit trail with the revoking principal); **dual control** for live STRONG_CONFIRM actions above a reviewed threshold (two distinct principals: one prepares-and-approves, one releases — the authorization artifact carries both); and **distinct approval tiers for live** (the tier table may only ever INCREASE for live dispatch: what is CONFIRM in sandbox is at least STRONG_CONFIRM live for financial classes — never the reverse).

### D4 — The audit and reconciliation separation (implementable now)

Live dispatch records are append-only, tamper-evident (the existing store law), and segregated: live receipts never co-mingle with sandbox evidence in any surfaced view or export. Reconciliation for live UNKNOWN outcomes requires the derived read-back route PLUS the operator's Stripe-side confirmation (a Dashboard-side observation recorded as external evidence) before any retry — a live UNKNOWN is never retried on PaySwap's own observation alone. The financial-certification evidence class (the existing `financial-certification` package's vocabulary) grows its live tier naming exactly these artifacts.

### D5 — The live-certification evidence bundle (defined-only; the activation's gate)

Activation requires, committed and reviewed: (1) the real-Sandbox acceptance receipts for every operation class the live surface will open (the P26-B tier, green); (2) the live key-class verification receipt (a probe against the live account proving the key class and the account identity); (3) the risk-control configuration as reviewed data (caps, allowlists, thresholds, the dual-control roster); (4) the rollback drill (the emergency revocation exercised against the live connection and its receipt); (5) the operator's activation order recorded. Nothing in this bundle exists today; that is the honest state, and this ADR does not pretend otherwise.

### D6 — What lands in P26

The separation plane (D1's namespaces/classes/markers where they cost nothing), this specification, and the gap-matrix record naming the D2–D5 bundle as the standing activation prerequisites. **No live key is accepted, no live dispatch path opens, no refusal edge is removed in P26.** The next ADR in this lineage is the activation order itself, and it will cite this one section by section.

## Work orders spawned (the dependency graph records the machine truth)

- **P26-0** (resident-TL): this ADR + the gap matrix rows that name the activation prerequisites as carry-forwards.
- No implementation work order is spawned for activation — deliberately. The graph records the frontier as empty of live work until the operator orders it.

## Consequences

"Live-mode readiness" becomes a reviewed, citable specification instead of a phrase. The activation path is long, named and evidence-gated — by design, because the thing being activated is real money movement. The Sandbox product loses nothing: every separation that lands (namespaces, markers, segregated audit) makes the Sandbox surface MORE honest too, since mode is never ambiguous anywhere it is surfaced.
