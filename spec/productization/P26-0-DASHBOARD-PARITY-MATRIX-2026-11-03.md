# P26-0 — THE STRIPE DASHBOARD PARITY MATRIX (2026-11-03)

**Wave:** P26 · **Owner:** resident TL · **The operator's question this answers:** *"Compare the actual Stripe Dashboard navigation and capabilities against PaySwap's API catalogue. Identify Dashboard features that are not represented in the public GA API, require special configuration, or need manual intervention. Do not assume 644 API operations means 644 Dashboard features."*

**Method (two halves, joined):**
- **The mechanical half** — `scripts/p26/dashboard-parity-facts.ts` partitions the committed census (644 pinned operations × the overlay) by a reviewed family→Dashboard-area table into **21 areas**, totality-checked (the generator refuses to emit unless the 149 families partition exactly into the 644 operations). Artifact: `docs/productization-evidence/p26-0-dashboard-parity-FACTS-2026-11-03.json`. No count in §2 is asserted from memory.
- **The research half** — the Dashboard's capability surface inventoried from **Stripe's own documentation** (docs.stripe.com + support.stripe.com, ~100 pages fetched 2026-11-02/03; every Dashboard-only claim in §3 carries its citation). The live Dashboard requires login, so the navigation structure follows Stripe's authoritative "Web Dashboard" doc (`docs.stripe.com/dashboard/basics`) plus the dashboard.stripe.com URLs Stripe's docs cite; items not literally enumerated there are marked UNCERTAIN. **Never scraping, never automation** (ADR-0017 D13).

**The headline:** the Dashboard and the public GA API are *substantially but not completely overlapping surfaces*. The catalogue side maps to 21 Dashboard areas with 631/644 operations dispatchable today (634 after P26-A's re-auth un-hold). The Dashboard side contains a documented **Dashboard-only surface of at least 19 capability classes with no public GA API** (§3) — credential lifecycle, team/security management, Radar rule authoring, event resend, self-account bank/payout-schedule editing and more — plus account-gated products (§4) and ergonomics divergences (§5). **644 API operations ≠ 644 Dashboard features, and neither set contains the other.**

---

## §1 — The Dashboard navigation inventory (the research half)

From `docs.stripe.com/dashboard/basics` ("Primary navigation") and the dashboard.stripe.com URLs cited across Stripe's docs:

| Nav area | Dashboard surface | Appears |
| --- | --- | --- |
| **Home** | Widget analytics, customizable charts, notifications | always |
| **Balances** | Balance, payouts (schedule + manual/instant pay-out), top-ups, All-Activity export | always |
| **Transactions (Payments)** | All payments/fees/transfers; filters; CSV export; payment detail (risk, related objects) | always |
| **Customers** | Customer CRUD, detail (subscriptions, payment methods, invoices, quotes), pending invoice items, CSV export | always |
| **Product catalog** | Products & prices management | always |
| **Shortcuts** | Pinned + recent pages | always |
| **Payments area** | Acceptance/authentication/fraud/dispute/payment-method analytics; **Disputes**; **Radar**; **Payment Links**; **Terminal readers** | always (product-dependent sub-items) |
| **Billing** | Subscriptions, invoices (create/send/void/edit-draft/collect/duplicate), quotes, discounts, revenue reports, Simulations, migration toolkit | with Billing |
| **Reporting** | Reports hub (prebuilt, scheduled, custom columns), **Sigma**, Data management (imports), Revenue Recognition | with Reporting products |
| **More** | Workflows, Tax, Connect, Identity, Atlas, Issuing, Financial Connections, Capital, Climate, Treasury | when enabled/eligible |
| **Developers (Workbench)** | API keys, API versions, webhooks/event destinations, events (payloads/deliveries/**Resend**), logs, Errors, Inspector, Shell (read-only live), Health, Apps | always (Workbench replaces the legacy Developers Dashboard) |
| **Settings** | Personal (profile/password/sessions) · Account/Business (details, health, public info, payouts/bank, legal entity, custom domains, branding, Checkout, PCI, documents, team & security, security history, approvals, linked external accounts) · Product settings (Billing, Financial Connections, Radar + risk controls, Issuing, Identity, Sigma, Connect, payment methods, Tax, data pipeline) | always |
| **Cross-cutting** | Global search (`is:` operators, org-wide) · Sandboxes (account picker) · Organizations (cross-account views) · Stripe Console (AI conversational surface — **private preview**) · Mobile app (tap-to-pay, invoices, Payment Links iOS) · Express Dashboard (connected accounts) | various |

UNCERTAIN (docs do not publish a pixel-level sidebar enumeration): exact ordering/labels beyond this doc; whether Home is the literal first label at all times.

## §2 — The parity table (the two halves joined)

Mechanical columns from the FACTS artifact (families / operations / dispatchable-at-P25 / held); the disposition column is the reviewed judgment. `IWЛ` = IMPLEMENTED_WITH_LIMITS.

| Dashboard area | Families (ops) | Dispatchable | Held | PaySwap disposition for a connected user |
| --- | --- | --- | --- | --- |
| **Home** | 0 (0) | 0 | 0 | **DASHBOARD-ONLY** — Home widgets/notifications have no API. The conversational surface covers the underlying DATA (via reads), not the widget layer. |
| **Balances & Payouts** | 7 (26) | 26 | 0 | Full parity incl. instant payouts (`POST /v1/payouts` — commonly assumed Dashboard-only; it is not). Bank-account/payout-schedule editing for the OWN account is Dashboard-only (§3.8). |
| **Transactions / Payments** | 9 (58) | 58 | 0 | Full parity: list/filter/search (model-driven), refunds, captures, cancels, source/setup-intent lifecycles. |
| **Customers** | 8 (61) | 58 | 3 | Parity except the held: customer-session client secret + ephemeral keys (mobile SDK surfaces — the secrets law). Portal config/sessions dispatch. |
| **Product catalog** | 7 (31) | 31 | 0 | Full parity (products, prices, plans, trial offers, shipping rates). |
| **Billing / Invoicing** | 18 (110) | 110 | 0 | The API's deepest area — full lifecycle parity incl. the never-collapsed invoice lifecycle and quotes. The subscription **CSV migration toolkit** is Dashboard-only (§3.16). |
| **Checkout & Payment Links** | 3 (11) | 11 | 0 | Full parity. Custom-domain setup is Dashboard-only (§3.17). |
| **Disputes** | 1 (4) | 4 | 0 | Parity in capability (evidence submission IS API-settable); the Dashboard's guided form/CE 3.0 ergonomics are richer (§5.9). |
| **Radar / Risk** | 5 (15) | 15 | 0 | Read/analyze/review-approve parity; **rule authoring and risk-controls are Dashboard-only** (§3.9, §3.11) — the biggest Radar gap. |
| **Tax** | 9 (27) | 27 | 0 | Parity incl. Registrations + Settings APIs (both GA). Activation itself is a Settings act. |
| **Connect** | 8 (59) | 56 | 3 | Parity for account management; the 3 held are the P26-A un-hold candidates (account links/sessions — the re-auth flow). |
| **Terminal** | 4 (26) | 25 | 1 | Reader/location/config parity; connection-token minting held (the secrets law). Reader ACTIVATION is a Dashboard act (§4). |
| **Issuing** | 10 (32) | 32 IWL | 0 | Entitlement-gated parity (the honest IWL state says so upfront). |
| **Treasury** | 11 (33) | 33 IWL | 0 | Entitlement-gated parity. |
| **Financial Connections** | 8 (21) | 21 | 0 | Parity; the featured-institutions product SETTINGS are Dashboard-only (§4). |
| **Climate** | 4 (9) | 9 IWL | 0 | Entitlement-gated parity. |
| **Identity** | 3 (8) | 8 IWL | 0 | Entitlement-gated parity. |
| **Reporting & Data** | 6 (8) | 8 | 0 | Report RUNS + Sigma query HISTORY parity; **schedules/email delivery, the reports UI and Sigma scheduling are Dashboard-only** (§3.12, §3.13). The new Queries/Reports API narrows but does not close this. |
| **Developer tools** | 10 (32) | 26 | 6 | Events/webhook-destinations/apps/files dispatch; **held: raw webhook-endpoint CRUD (the D12 host plane owns destinations), app secrets (create/delete/reveal — the secrets law)**. API-key lifecycle + event resend + test-event triggering are Dashboard-only (§3.1–3.4). |
| **Settings / Account** | 11 (29) | 29 | 0 | The API-settable settings (payment-method configs/domains, Apple Pay domains, 3DS, mandates, external accounts for CONNECTED accounts) dispatch; **the self-account security/team/branding/payout surfaces are Dashboard-only** (§3.5–3.8, §3.18). |
| **Test helpers** | 7 (44) | 44 IWL | 0 | Test-mode only by law (INV-25) — parity with the Dashboard's test-mode tools incl. test clocks. |
| **TOTAL** | **149 (644)** | **631** | **13** | → **634/10 after P26-A** |

## §3 — THE DASHBOARD-ONLY SURFACES (no public GA API — the critical list)

Each row: what the Dashboard can do that NO public GA API operation can do, with the Stripe doc as evidence. These are capability CLASSES, not catalogue rows — they can never be "covered" by the connector; the honest product behavior is the typed `STRIPE_DASHBOARD_ACTION_REQUIRED` note (ADR-0017 D13).

1. **API key lifecycle** — create/reveal/rotate/expire/rename secret & restricted keys, agent-tagged keys, access policies (IP/ASN/country/Tor). `docs.stripe.com/keys`. Only exception: hosting-platform "managed API keys" (preview). *PaySwap disposition: key management stays in the host credential plane (sealed, operator-side) — which is a BETTER home than chat; the RAK's restricted-key guidance is the product's own law.*
2. **Webhook signing-secret reveal & roll** — `docs.stripe.com/webhooks`, `docs.stripe.com/events/manage-webhook-endpoints`. *PaySwap owns destination secrets in the sealed D12 plane (whsec_ broker) — reveal/roll-through-chat is prohibited by the secrets law, correctly.*
3. **Resend a webhook event** (≤15 days) — `docs.stripe.com/webhooks`; CLI ≤30 days. No REST endpoint (Events API is list/retrieve; v2 adds only `ping`).
4. **Trigger arbitrary test events** — Dashboard/CLI/VS Code only; no REST API. `docs.stripe.com/webhooks`, `docs.stripe.com/billing/testing`.
5. **2FA/passkeys/backup codes/SMS; password; active-session management** — `support.stripe.com/questions/enable-two-step-authentication` + siblings. No users/auth API. *PaySwap's own session/security plane governs PaySwap access; the Stripe-account security tier is Dashboard-only, correctly.*
6. **Team member management: invites, 25+ roles, user groups, require-2FA, SCIM/SSO** — `docs.stripe.com/get-started/account/teams(/roles)`, `docs.stripe.com/get-started/account/sso`. No users/roles API resources.
7. **Close your own Stripe account** — owner-only, Settings path. `support.stripe.com/questions/close-a-stripe-account`. (`DELETE /v1/accounts/:id` is connected-accounts-only.)
8. **Bank account & payout schedule for the OWN platform account** — `docs.stripe.com/payouts`; connected-account equivalents ARE API-settable (`docs.stripe.com/connect/manage-payout-schedule`). UNCERTAIN whether legacy self-account `POST /v1/account` still accepts `settings.payouts` (not in the current public reference).
9. **Radar rules authoring/management** (incl. Radar Assistant, testing/backtesting, gradual rollout) — `docs.stripe.com/radar/rules`. Lists DO have an API (value_lists/value_list_items — dispatchable).
10. **Radar review-queue assignments & Smart Refunds recommendations** — `docs.stripe.com/radar/transaction-reviews`; the Reviews API is read/approve only.
11. **Radar risk settings/controls & backtesting** (fraudulent-card, EFW control, adaptive 3DS, dynamic thresholds, simulations) — `docs.stripe.com/radar/risk-settings`. EFW API is read-only.
12. **Sigma scheduled queries: scheduling, email subscribers, previews** — `docs.stripe.com/data/schedule-queries`; the API lists past runs only. (Also: Sigma runs on live-mode data only — an environment divergence the honest state surfaces.)
13. **Scheduled financial reports (email delivery), Home/Payments analytics dashboards, report filters/columns UI, recommendations** — `docs.stripe.com/reports/options`, `docs.stripe.com/payments/analytics(/recommendations)`. Report CONTENTS are regenerable via the Reporting/Queries APIs (dispatchable); the delivery/scheduling layer is not.
14. **Stripe Apps marketplace browsing/install-review flow** — `marketplace.stripe.com`; note the App Installs API EXISTS and dispatches (the install/uninstall lifecycle is API-capable).
15. **Workflows visual builder/editing/run inspection** — `docs.stripe.com/workflows` (on-demand triggers are invokable via API per the docs; the builder is not).
16. **Subscription CSV migration toolkit** (bulk import) — `docs.stripe.com/billing/subscriptions/import-subscriptions-toolkit`.
17. **Checkout custom domain setup** (DNS verification/TLS) — `docs.stripe.com/payments/checkout/custom-domains` (≠ payment_method_domains, which is GA and dispatchable).
18. **Own-account business/branding/public-info settings** (logo, statement descriptor, support details, Checkout policies) — connected-account branding IS API-settable; own-account is Dashboard-only. `docs.stripe.com/get-started/account/branding`.
19. **Early-access opt-in, approvals (two-party) rules, sandboxes management, org creation, test/live toggle** — `docs.stripe.com/dashboard/basics`, `docs.stripe.com/account/approvals`, `docs.stripe.com/sandboxes`. *Note: Dashboard approvals rules GOVERN API actions (incl. agent-key payouts) — a live-mode interaction ADR-0019's risk plane must account for.*

## §4 — The account-gated / special-configuration surfaces (API exists; entitlement decides)

Treasury (US/UK public preview; stablecoin balances preview) · Issuing (commercial CA/US/UK/EEA + stablecoin programs; consumer US) · Terminal (reader activation is a Dashboard act; hardware orders) · Sigma (paid; live-mode only) · Radar for Fraud Teams (rules/reviews/advanced controls need the paid plan) · Tax (activation) · Identity (activation) · Financial Connections (enable; featured-institutions product settings Dashboard-only) · Capital (eligibility offers; no request API) · Connect (platform enablement + onboarding type; cross-border payouts eligibility-gated) · Instant Payouts (eligibility; Balances API exposes `instant_available`) · Organizations (shared customers: preview). Private previews at research time: Stripe Console, Checkout studio, Provisioning API, managed API keys, AU Treasury.

*PaySwap disposition: all of these dispatch with the honest `IMPLEMENTED_WITH_LIMITS` state (121 account-gated operations at P25) — Stripe's own entitlement decides per account; the state says so BEFORE dispatch, never after a surprise 403.*

## §5 — The known divergences (both directions, honestly recorded)

**Dashboard-richer (capability parity, ergonomics not):** the dispute guided form (auto-captured background evidence, CE 3.0 pre-population — the API accepts the same fields); the payment-methods dynamic rules/A-B tooling (`payment_method_configurations` is the API subset); the invoice editor's live preview (the API has create_preview — dispatchable); Express/hosted onboarding UIs (API onboarding exists but Stripe discourages it).

**API-only (PaySwap can, Dashboard doesn't need to):** the programmatic surface itself — idempotent dispatch, pagination walking, search endpoints, webhook event-destination schema versioning, v2 thin events.

**Commonly-misjudged as Dashboard-only but actually API-backed (verified):** instant payout initiation (`POST /v1/payouts` method=instant); dispute evidence submission; tax registrations AND settings; webhook endpoint CRUD (though PaySwap holds it host-side); test clocks; app installs; report runs.

## §6 — The verdict against the operator's question

- **Is every Dashboard feature available through PaySwap chat?** No — and no honest system can claim it: §3's 19 Dashboard-only classes have no public API to call. What PaySwap CAN do is name them exactly (`STRIPE_DASHBOARD_ACTION_REQUIRED`) instead of failing opaquely — which the connector's honest-state law already does.
- **Is every API operation available through PaySwap chat?** 631/644 today; 634/644 after P26-A (the re-auth un-hold); the remaining 10 are the secrets law (correctly held) — and the Dashboard-only list in §3 is NOT reachable by ANY API client, PaySwap or otherwise.
- **What the parity gap actually consists of:** (a) the Dashboard-only classes (§3) — irreducible without Stripe shipping APIs; (b) entitlement gates (§4) — Stripe decides; (c) ergonomics (§5) — the conversational surface's own value proposition; (d) the held secrets-law operations — deliberate, reviewed, correct.
- **The conversational advantage, recorded for balance:** the Dashboard cannot do "show me all customers who paid more than $500 in the last 30 days, grouped by country" in one sentence — the connector can (multi-read + aggregation through the model, then prepared actions for anything consequential).

## §7 — Reproducibility

`npx tsx scripts/p26/dashboard-parity-facts.ts` regenerates the FACTS artifact byte-consistently from the committed census; the generator fails closed on any partition drift (it caught one missed family during authoring — the check works). The research half's citations are inline (§1, §3, §4); fetch dates 2026-11-02/03. The matrix is a P26-0 snapshot: a Stripe release after the v2596 pin (or a Dashboard change) requires a re-run of both halves — the re-pin path is ADR-0017 D2's law.
