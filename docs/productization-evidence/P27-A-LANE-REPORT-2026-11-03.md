# P27-A LANE REPORT — Stripe U2 (delegated OAuth) + U3 (Connect platform) — key-ready machinery, honestly UNCONFIGURED (2026-11-03)

**Lane:** P27-A (worker-1) · **Branch:** `work/p27-a` · **Base:** `6c0aef7` (main @ P27-0) · **Commits:** `b0c27bb` (recovered from the killed first dispatch), `d86d3b4`, `df1c979`, + this report.
**Order:** ADR-0020 (D1–D12) · the P27-0 capability matrix §5/§6 · the P27 operator run card §B · work order: "Configure a real Stripe platform application and existing-account OAuth flow; implement U3 platform and connected-seller lifecycle… Sandbox first; no LIVE activation. Connect is not unrestricted P2P."
**The reality this lane landed against:** NO Stripe platform application exists. The operator has NOT supplied `STRIPE_PLATFORM_CLIENT_ID`, `STRIPE_PLATFORM_CLIENT_SECRET` or `STRIPE_CONNECT_WEBHOOK_SECRET`, and has NOT recorded the §B.2 model/liability decisions. Everything below is therefore **FULL MACHINERY, KEY-READY**: every flow is implemented and hermetically tested; every operator-missing item surfaces as a typed `UNCONFIGURED` / `OPERATOR_GATED` verdict mapped 1:1 to run card §B; the real-Sandbox harness exits 2 without credentials. A typed UNCONFIGURED verdict is a deliverable. **Nothing was ever faked.**

---

## 1. Implementation inventory (26 files, +5,053/−33 at df1c979)

### provider-runtime (the U2/U3 owned surface)
| File | What landed |
|---|---|
| `adapters/stripe/oauth-state.ts` | U2/U3 missing-operator-configuration constants re-mapped 1:1 to run-card §B (§B.1/§B.3/§B.4/§B.5 for U2; §B.1–§B.5 for U3); the single-use state registry (mint/consume, 600 s, monotonic replay refusal) unchanged and green. |
| `adapters/stripe/oauth-token-exchange.ts` (NEW, 311 lines) | The platform-configuration resolver (typed `MISSING_STRIPE_PLATFORM_CONFIGURATION`), the code→token and deauthorize wire-request builders (the platform secret travels ONLY in the HTTP Basic header), the typed OAuth error classification (`access_denied`/`invalid_grant`/`invalid_client`/`invalid_scope`), the fail-closed token-response parser (`livemode:true` refused — INV-25), the U2 material validation (live tokens never seal). |
| `adapters/stripe/declaration.ts` | The U2/U3 rows stay honestly `UNCONFIGURED`, now carrying the §B-mapped items verbatim (imported from oauth-state.ts — single source) + the key-ready summaries. |
| `test/adapters/stripe-oauth-token-exchange.test.ts` (NEW, 19 tests) | Hermetic, zero network; live-shaped fixtures built by concatenation (ADR-0018 push-protection law; the boundary secret-literal battery caught and fixed un-FAKE-marked fixtures). |

### desktop host (new connect-* members)
| File | What landed |
|---|---|
| `stripe/connect-platform-gates.ts` (285) | The typed operator-gate surface: platform credentials (§B.1/§B.4), registered redirect URL (§B.3), connect webhook endpoint + `whsec_` shape (§B.3/§B.4), the account-model decision + capability-consistency law (§B.2), the charge-model/topology decision (§B.2), the business-model approval (§B.5 — never satisfiable by code). INV-25 live-secret refusal; escape-scan (no secret-shaped material in any record). |
| `stripe/connect-observations.ts` (130) | The D10 dated connected-account observation (payouts/charges/details, requirements due lists, per-capability status + requirements, country, service agreement) — the account's own objects only, never flags; unobserved fields stay null. |
| `stripe/connect-account-lifecycle.ts` (398) | U3 lifecycle: `PostAccounts` creation under the CURRENT controller-properties model (top-level schema names + nested-object values — see §4 the fix), `PostAccountLinks` hosted onboarding at REAUTH (a live digest-scoped proof consumed BEFORE the wire — ADR-0018), `GetAccountsAccount` observation, monotonic identity binding (provider account ↔ seller principal), INV-04 reconciliation read-back. Census fail-closed (`UNPINNED_API_SURFACE`); the absent §B.2 decision is the typed `ACCOUNT_MODEL_UNDECIDED` gate — never a default. |
| `stripe/connect-u2-flow.ts` (363) | The host U2 composition: begin-authorization (single-use state + authorize URL + browser open), typed return handling (`USER_DENIED` verbatim, resumable), code→token exchange over the injected transport, seal + **never-ACTIVE read-back probe** (ACTIVE only on the provider's own CONFIRMED answer), deauthorize, `EXCHANGE_UNKNOWN` for undelivered exchanges (the code is single-use — reconcile, never blind-retry). |
| `stripe/connect-webhook-events.ts` (242) | Connected-account webhooks: the `STRIPE_CONNECT_WEBHOOK_SECRET` gate (no event is ever accepted unconfigured), the existing pinned signature scheme through the injected verifier, the typed event vocabulary (`account.updated` → the dated observation; `account.application.deauthorized`; `payout.paid`/`payout.failed` → observations only; anything else signed → `VERIFIED_UNMAPPED`), single-consumption per event id. |
| `stripe/connect-topology.ts` (259) | Charge/transfer/payout topology bound to the §B.2 decisions (DIRECT / DESTINATION / SEPARATE_CHARGES_AND_TRANSFERS — the census-prepared action refs per leg with read-back operations), the merchant-of-record + dispute/refund liability record, and the **INV-30 purpose gate** (Connect is not unrestricted P2P; regulated remittance/P2P is the typed exclusion with `requiresProviderProductAndLegalApproval: true`). Prepared-action references only — zero financial authority. |
| `connections/connect-connection-views.ts` (167) | The additive connection-plane views (the P27-E seam): both forms UNCONFIGURED + machinery `KEY_READY` (the two-half honesty), the seed verb returning the typed `OPERATOR_GATED` verdict while UNCONFIGURED, the projection onto the shared `DesktopProviderFormView` contract. |
| `connections/provider-pins.ts` | The pin mirror updated field-for-field (the §B-mapped items + key-ready summaries). |
| 6 NEW tests (`connect-platform-gates/u2-flow/account-lifecycle/webhook-events/topology/connection-views`) | 75 desktop tests, hermetic (scripted transports, locally signed events, the REAL pinned census + the REAL schema validator where the wire shape matters). |
| `tsconfig.test-check.json` | The six new test files registered (the scoped-tsc gate). |

### payswap-app (the U2/U3 surfaces — additive)
| File | What landed |
|---|---|
| `src/pins/connect-form-pins.ts` (NEW, 167) | The structural pins of the desktop host's connect views (by-value mirror; the app never imports the host — the mirror battery drives the REAL host source), the seed-verdict projection (deterministic data, zero authority), the honest gate/machinery notes. |
| `src/console/sections/ConnectFormsPanel.tsx` (NEW, 160) | The two connect-form cards: the UNCONFIGURED pill, the KEY_READY machinery line, every §B-mapped missing item verbatim, the U3 INV-30 disclosure, the typed OPERATOR_GATED seed answer. **No credential inputs of any kind** (zero financial authority — asserted by test). |
| `src/console/ConsoleSectionSwitch.tsx` | THE ONE SHARED-FILE EDIT (recorded for P27-E): +1 import, the panel rendered as a sibling of `ConnectionsSection` inside the connections route (an additive registration point; the big section files were NOT grown). |
| `src/lib/agent-provider-entries.ts` | The two stale Stripe U2/U3 qualifier cardLines updated to the current controller-properties model + key-ready machinery state (the "Express/Custom" phrasing was deprecated-model-stale). No router/vocabulary change (`marketplace-onboarding` mention vocabulary untouched — its battery stays green unmodified). |
| 2 NEW tests | `connect-form-pins-mirror.test.ts` (drives the REAL desktop host source — 9 tests) + `connect-forms-panel.test.tsx` (jsdom — 6 tests). |

### harness
| File | What landed |
|---|---|
| `scripts/p27/a1-connect-real-sandbox-journey.ts` (NEW, 396) | The key-ready real-Sandbox harness (the a1 precedent): **exit 2** without `STRIPE_PLATFORM_CLIENT_ID`/`STRIPE_PLATFORM_CLIENT_SECRET`; **exit 1** on a live-shaped platform secret (INV-25 at the harness's own edge); the **wiring dry-run** (`P27_A1_WIRING_DRY_RUN=1`) composes every REAL module (state registry, OAuth builders/parsers, platform gates, the lifecycle plan vs the pinned census + the REAL strict schema validator, the connect webhook module over the REAL signature verifier, the topology resolver, the INV-30 purpose gate) with ZERO network and records its receipt OUTSIDE the evidence tree (`/tmp/p27-a-a1-connect-wiring-dry-run-RECEIPT.json` — fixture receipts are never promoted). Real tier: the platform-key read, the optional real U2 token exchange (`STRIPE_U2_AUTHORIZATION_CODE` from the operator's browser round-trip), the double-gated connected-account creation + observation. All exit paths verified (§5). |

---

## 2. The dated re-verification record (the P27-0 matrix §6 duty — retrieved 2026-11-03, THIS lane's station)

| # | Source (retrieved 2026-11-03) | What it said (dated observation) |
|---|---|---|
| R1 | docs.stripe.com/connect/service-agreement-types | Connected accounts are under `full` or `recipient` service agreements; **the type cannot be modified after acceptance**; full creates the Stripe↔account service relationship and can process card payments / request `card_payments`; recipient is transfers-only (no card_payments), **transfers take an additional 24 hours**, and is available in **select countries**; creation specifies the agreement via `tos_acceptance[service_agreement]` **with controller properties**. |
| R2 | docs.stripe.com/connect/standard-accounts | "Deprecated feature — the information on this page applies only to platforms that already use legacy connected account types (Standard, Express, or Custom accounts). If you're setting up a new Connect platform… see the Interactive platform guide." (The express/custom pages carry the same notice.) → the lane encodes the CURRENT controller-properties model; the legacy `type=` parameter is NOT in the creation plan (asserted by test). |
| R3 | docs.stripe.com/connect/oauth-standard-accounts | The code→token exchange is `POST https://connect.stripe.com/oauth/token` authenticated with the platform's secret API key over HTTP Basic (`-u sk_test_...:`), body `code` + `grant_type=authorization_code`; the response carries `token_type`, `scope`, `livemode`, `stripe_user_id`; the documented error shape is `{ "error": "invalid_grant", "error_description": "Authorization c…" }`. → exactly what `oauth-token-exchange.ts` builds/parses. |
| R4 | docs.stripe.com/api/account_links/create | `POST /v1/account_links` with `account`, `refresh_url`, `return_url`, `type=account_onboarding` → a short-lived `url` + `expires_at`. **DATED OBSERVATION: the page's example now pins `Stripe-Version: 2026-10-28.endive`** — newer than this repo's census pin (`v2596 @ 2026-09-30.endive`). The census law governs: **no pin expansion** (recorded below in §6); the lifecycle dispatches at the repo's pinned version. |
| R5 | docs.stripe.com/connect/required-verification-information (+ the capabilities section tree) | Country/requirements eligibility is presented per-account via the capabilities/requirements objects (the API-computed per-account model) — never a hardcoded country list in this lane (D10: the account's own objects are the evidence). |
| R6 | docs.stripe.com/connect/direct-charges · /destination-charges · /separate-charges-and-transfers | Direct charges carry the connected account in the `Stripe-Account` header (data scoped to the connected account); destination charges bind `payment_intent_data[transfer_data][destination]` (optionally `on_behalf_of` + `application_fee_amount`); separate charges and transfers charge the platform then move the seller's portion via transfers. → the topology mechanism notes, verbatim. |
| R7 | **The operator's actual platform account** | **NOT VERIFIABLE — no platform credentials exist in this deployment** (run card §B is the standing operator action). Recorded honestly; never guessed. |

The P27-0 matrix rows V1–V7 (Global Payouts, availability, Extended Network) are P27-B's lane and were NOT re-verified here.

---

## 3. The OPERATOR_GATED list — every item mapped 1:1 to run card §B

| Run-card §B item | The typed gate in the tree (today's honest verdict) |
|---|---|
| **§B.1** Register/verify the Stripe platform application (client_id; client_secret) | `MISSING_STRIPE_PLATFORM_CONFIGURATION` (provider-runtime) · `platformCredentials: UNCONFIGURED` (connect-platform-gates) · the U2/U3 declaration rows · harness exit 2 |
| **§B.2** The decided account model (service agreement + controller settings) | `ACCOUNT_MODEL_UNDECIDED` (lifecycle `planOf`) · `accountModelDecision: UNCONFIGURED` (gates) — **never a default guess**; `STRIPE_CONNECT_ACCOUNT_MODEL_JSON` is the harness's decision channel |
| **§B.2** The decided charge model / platform country / MoR + dispute/refund liability | `OPERATOR_GATED` (connect-topology `resolveStripeConnectTopology`) — no charge model, no liability record exists until the operator records one (a wrong MoR default would be a legal error, not a convenience) |
| **§B.3** The registered redirect/callback URL | The U2 missing-item list + the harness's registered-redirect gate (authorize refuses typed without it) |
| **§B.3** The publicly reachable connected-account webhook endpoint | `connectWebhookEndpoint: UNCONFIGURED` (gates) · the webhook module's `UNCONFIGURED` verdict (no event accepted unconfigured) |
| **§B.4** `STRIPE_CONNECT_WEBHOOK_SECRET` through the secret channel | The webhook module's typed gate (whsec_-shape checked); harness G6 SKIPPED without it |
| **§B.5** Stripe's approval of the disclosed actual business model | `businessModelApproval: UNCONFIGURED` — **never satisfiable by code** (carried verbatim in both forms' missing items) |
| **§A (standing)** Sandbox credential re-supply for real runs | The harness real tier is exit-2 key-ready (the P26-B a1 law, carried) |

**INV-30 at this lane's edges:** `classifyStripeConnectPurposeEligibility` encodes the matrix §5 Connect column exactly — REGULATED_REMITTANCE_OR_P2P is never eligible through Connect alone (`requiresProviderProductAndLegalApproval: true`); the U3 app card and the connect view carry the disclosure verbatim.

---

## 4. The defect the wiring dry-run caught (the fix is part of this lane)

The first-composed `PostAccounts` plan emitted **bracket-named flat parameters** (`controller[stripe_dashboard][type]` as a parameter NAME). The real dispatch stack's strict validator knows only the **top-level** body-property names — those parameters would have been `UNKNOWN_PARAMETER` refusals at dispatch (invisible to the hermetic lifecycle tests, which ride a scripted transport). Fixed: the plan now emits top-level schema names with **nested-object values** (`controller: { stripe_dashboard: { type } … }`), which the strict validator accepts and the v1 form encoder flattens into the documented wire notation. The harness's G4 wiring gate now validates the plan against the REAL pinned schema on every run — this class of bug cannot recur silently. (Found by running the dry-run BEFORE the fix; G4 was RED, then GREEN.)

## 5. Battery evidence (before → after; every number re-run at the final tree)

| Battery | Recorded baseline (main @ 6c0aef7) | This lane (final) |
|---|---|---|
| provider-runtime vitest | 35 files / 529 passed + 5 skipped | **36 files / 548 passed + 5 skipped** (+1 file, +19 tests — the token-exchange battery; zero baseline tests touched) |
| provider-runtime tsc --noEmit | 0 | **0** |
| desktop vitest | 80 files + 2 skipped / 696 tests + 2 skipped | **86 files + 2 skipped / 771 tests + 2 skipped** (+6 files, +75 tests) |
| desktop scoped tsc trio (host / test-check / mirror-check) | 0 / 0 / 0 | **0 / 0 / 0** |
| payswap-app vitest | 66 files / 776 tests | **68 files / 789 tests** (+2 files, +13 tests) |
| root `pnpm lint` (oxlint) | 0 errors (384 warnings pre-exist) | **0 errors (384 warnings — unchanged)** |
| `architecture-check.mjs check` | 0 violations | **0 violations** |
| harness exit paths | — | **exit 2** (no platform credentials — verified) · **exit 1** (live-shaped platform secret — verified) · **wiring dry-run exit 0**: 5 GREEN + 2 honest SKIPPED, 0 RED, secret-free receipt at `/tmp` (verified) |

## 6. Census-gap record

**One dated gap, recorded, fail-closed, no pin expansion:** live docs.stripe.com/api/account_links/create now shows `Stripe-Version: 2026-10-28.endive` (R4) — newer than the pinned census `stripe-openapi/v2596 @ 2026-09-30.endive`. The lane dispatches only inside the pin; a pin refresh is a P27-E/operator decision. **No operations outside the pin were used or added**: every lifecycle/topology operation resolves in the pinned census (asserted by tests + the harness's G7 census law).

## 7. Honest exclusions and boundaries

1. **No real OAuth/onboarding run happened** — impossible without §B.1/§B.3; the harness exits 2 and nothing is simulated. The U2 ACTIVE state requires the provider's own probe answer; no code path fakes it.
2. **No connected account was ever created** (the write is double-gated and the §B.2 decision is absent) — the observation records are typed structures over the account's own objects, not observations of a real account.
3. **No charge/transfer/payout leg executes in this lane** — connect-topology PREPARES typed action references only; dispatch belongs to the prepared-action executor + the approval tiers (the connection plane holds zero financial authority).
4. **The real-delivery webhook tier is gated**: G6 verifies the signature scheme + module over a locally signed event; an actual Stripe delivery needs the registered public endpoint (§B.3).
5. **The host `beginAuthorization` browser-open is injectable** (`openExternal`) — the desktop composition root binds it at the P27-E wiring; this lane does not open browsers from tests.
6. **Country eligibility is never encoded** — D10: the account's own requirements/capabilities objects are the evidence (R5).
7. **The killed first dispatch's in-flight work was adopted, not discarded**: `b0c27bb` was its only commit (recovered from the working tree; its uncommitted U3 host files are the d86d3b4 inventory). Its FAKE-marker defect was caught by the provider-runtime boundary battery and fixed here.

## 8. Shared-file needs and seams for P27-E (the merge reconciliation list)

| Surface | The seam P27-E owns |
|---|---|
| `packages/payswap-app/src/console/ConsoleSectionSwitch.tsx` | **Edited by this lane** (+4 lines: the additive `ConnectFormsPanel` sibling render inside the connections route). P27-C (Paystack app surfaces) may touch the same area — additive siblings, no rewrites. |
| `packages/payswap-app/src/lib/agent-provider-entries.ts` | **Edited by this lane** (the two Stripe U2/U3 qualifier cardLines only). P27-C owns the Paystack entries in the same file — reconcile additively. |
| `packages/desktop/tsconfig.test-check.json` | **Edited by this lane** (six new test files registered). Sibling lanes registering their own tests append to the same list. |
| `connections/connect-connection-views.ts` | The registration point P27-E wires into the session authority at integration (this lane never edited the authority). The `statusOverride` seam on `seedConnectSetupTask` is where the CONFIGURED flip lands when §B arrives. |
| Host credential source | The connect modules take `credentials: () => StripeConnectPlatformCredentialsInput` as an injected seam — P27-E binds the station secret store (STRIPE_PLATFORM_CLIENT_ID/SECRET, STRIPE_CONNECT_WEBHOOK_SECRET) at the composition edge. |
| REAUTH plane | `createOnboardingLink` requires a composed `StripeReauthenticationPort` (ADR-0018) — the existing desktop reauthentication.ts binds at the P27-E composition; an uncomposed plane refuses `REAUTH_REQUIRED` honestly. |
| Operator decisions channel | §B.2 decisions need a durable operator-decision record surface (`STRIPE_CONNECT_ACCOUNT_MODEL_JSON` is the harness channel; the product channel is P27-E's integration). |

## 9. Defects observed outside this lane's ownership (recorded, not fixed)

- `scripts/p26/a1-catalogue-real-sandbox-journey.ts` constructs `new StripeCatalogueTransport(realFetchBinding)` — the constructor takes `options.fetchImpl`, so a positional function argument throws `StripeCatalogueTransport requires an injected fetch binding` at construction. The P26 harness has never run its real tier (no credentials ever existed), so this never surfaced; it will throw the moment the operator supplies `STRIPE_SANDBOX_SECRET_KEY`. One-line fix (`new StripeCatalogueTransport({ fetchImpl: realFetchBinding })`) — P26-B's file, left for P27-E per the file-disjoint law. The P27-A harness uses the correct constructor shape.

---

**Honesty over completeness.** Both forms are UNCONFIGURED because the operator gates are open — and the machinery behind every gate is implemented, composed against the pinned census, hermetically tested (107 new tests across three packages), and waiting on §B. No credential was faked, no eligibility fact invented, no LIVE key accepted, no invariant weakened.
