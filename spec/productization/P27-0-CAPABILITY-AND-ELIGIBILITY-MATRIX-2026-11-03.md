# P27-0 — Capability and eligibility matrix (2026-11-03)

**Status:** ACCEPTED (P27-0, the resident-TL source audit) — the initial, retrieval-dated matrix required by ADR-0020 D10.  
**Law:** every provider country/method/currency/limit/entitlement fact below is an **evidence-stamped observation with a retrieval date and source**, not a permanent eligibility table. Facts are re-verified against live provider documentation and real account probes **before they are encoded in any package** (P27-B/P27-C) and again at dispatch where freshness matters. No global "Africa supported" flag exists.  
**Companions:** `spec/productization/P27-0-GAP-MATRIX-2026-11-03.md` (§12 the acceptance appendix) · ADR-0020 · `docs/productization-evidence/P27-OPERATOR-RUN-CARD-2026-11-03.md`.

---

## 1. External facts VERIFIED at the P27-0 station (retrieved 2026-11-03)

| # | Fact | Source (retrieved 2026-11-03) | Status |
|---|---|---|---|
| V1 | Stripe Global Payouts: "Send payouts to more than 160 markets"; "send payouts to customers, affiliates, sellers, or any third party" | docs.stripe.com/global-payouts | VERIFIED |
| V2 | "Global Payouts **requires Treasury**"; "fund your financial account"; "Create recipients with the API or have recipients enter in their own information using prebuilt information collection forms" | docs.stripe.com/global-payouts | VERIFIED |
| V3 | Global Payouts is GA for origin businesses in the **United Kingdom** and the **United States**; businesses in other listed countries (AU, AT, BE, BG, HR, CY, EE, FI, FR, DE, GR, IE, IT, LV, LT, LU, … — extraction partial, re-verify the full list before encoding) can **request private preview** access | docs.stripe.com/global-payouts | VERIFIED |
| V4 | Global Payouts is presented as "a payouts-only solution decoupled from payments", with an explicit Connect-vs-Global-Payouts comparison — **a distinct product, not an alias** | docs.stripe.com/global-payouts | VERIFIED |
| V5 | Fintech payouts are a marketed use case: "Send money directly to recipients from your fintech, insurance business, marketplace or government entity"; "Fintech payouts — Send funds instantly for loan payouts, cash-outs, investment withdrawals and **peer-to-peer transfers**" — i.e. P2P is a **licensed-fintech product context**, never a blanket approval for ordinary merchant accounts | stripe.com/payouts | VERIFIED |
| V6 | Stripe global availability: **Ghana, Kenya, Nigeria and South Africa carry "Extended network" badges** linking to `paystack.com/stripe/{ghana,kenya,nigeria,south-africa}`; Côte d'Ivoire links to `paystack.com/ci/pricing` — a **Paystack onboarding path, not direct Stripe account eligibility** | stripe.com/global (raw HTML, country list items) | VERIFIED |
| V7 | Stripe money-management availability roadmap: **Ghana = GHS · SWIFT · Wire · 6 days · "H2 27"** (status vocabulary on the page: Private preview / Public preview / Coming soon / Under consideration + timeline labels) | stripe.com/money-management/availability | VERIFIED — **DISCREPANCY vs the registration** (see §2, K1) |

## 2. Registration claims NOT confirmed at the station (recorded, never encoded without re-verification)

| # | Registration claim (P27-0 gap matrix §4/§5) | Station finding | Disposition |
|---|---|---|---|
| K1 | "Ghana as a recipient market with GHS/SWIFT labelled **Q4 2026**" | Today's availability page labels Ghana GHS/SWIFT **"H2 27"** | **DISCREPANT** — the dated page wins (V7). Any Global-Payouts Ghana corridor is roadmap-not-available; it must be encoded as an honest conditional opportunity at best, never as an available route. |
| K2 | "stablecoin-wallet payout [Ghana] labelled **Preview**" | **No Ghana stablecoin-wallet payout row found** on the 2026-11-03 availability page. The page's stablecoin mentions are platform features ("Stablecoin funding is available on request in 100+ countries"), not a Ghana payout rail. | **UNCONFIRMED** — do not encode a Ghana stablecoin payout method from this claim. |
| K3 | Paystack recipient types: Ghana `ghipss` (GHS) and `mobile_money` (GHS); Kenya `kepss` (KES/USD) and `mobile_money` (KES); Nigeria `nuban` (NGN); South Africa `basa` (ZAR) | **paystack.com is unreachable from this station** (Cloudflare "Just a moment…" challenge on docs pages; Wayback snapshot fetch and proxy fetch both failed at the station) | **UNVERIFIED AT STATION** — P27-C must re-verify against live docs AND the actual account's transfer-recipient API before encoding any recipient type. |
| K4 | Paystack transfers "available to businesses in Ghana, Nigeria, South Africa and Kenya"; mobile-money transfers "available to businesses in Ghana and Kenya"; "transfers cannot be made to the Bank of Ghana"; source = the integration's balance; OTP/finalize; unique transfer references; webhooks | Same station block as K3 | **UNVERIFIED AT STATION** — same law: live docs + real account probes before encoding. The in-repo transfer lane already pins `source: 'balance'`, reference-idempotency and finalize/verify mechanics (audited); the country/method facts are not encoded anywhere and must not be until re-verified. |

## 3. In-repo capability state (audited at `db1693d`, base `5ca077e`, 2026-11-03)

| Surface | Audited state |
|---|---|
| Stripe catalogue | 644 pinned (stripe/openapi **v2596 @ 2026-09-30.endive**, sha256-pinned); **634 dispatchable** (471 IMPLEMENTED + 163 IMPLEMENTED_WITH_LIMITS); **held ten** (the secrets law: apps/secrets ×3, webhook_endpoints ×3, ephemeral keys ×2, customer-session, terminal connection-token); dispatchable-write tier ledger **CONFIRM 232 / STRONG_CONFIRM 115 / REAUTH 3**; reads 284 at NONE; default wire version **2025-08-27.basil** (per-connection migration verb to the pin exists, default unchanged) |
| Stripe U1/U2/U3 | U1 own-account `CONFIGURED` (SCOPED_API_CREDENTIAL, SANDBOX-only, probe = the only path to ACTIVE); **U2 delegated-OAuth `UNCONFIGURED`** (missing: operator Stripe platform `client_id` + `client_secret`); **U3 Connect platform `UNCONFIGURED`** (missing: platform credentials + a registered connected-account webhook endpoint). `buildStripeAuthorizeUrl` refuses typed (`MISSING_STRIPE_PLATFORM_CONFIGURATION`); the OAuth state registry (mint/consume, 600 s, single-use) is implemented and waits on configuration |
| Stripe REAUTH | ADR-0018 end-to-end: proof mint/verify/consume, 10-minute TTL, digest-scoped, single-use, consumed durably before dispatch, account-mismatch refusal; the three account-link/session operations dispatch at REAUTH |
| INV-25 | Live keys refused at **eight mechanical layers** (transport, scope derivation, U1 lifecycle, probe classification, execution kernel, re-auth proof, harness edge, transcript guards) |
| Paystack | One `own-store-test-mode` form, CONFIGURED, read-only probe (`GET /transaction`); operations `transactions.read`, `transfer.initiate`, `transfer.finalize`, `transfer.verify`; **SANDBOX payout grant re-derived at dispatch inside the seal** (never cached; `sk_live_` never binds); **no recipient plane, no collection/charge surface, no webhook verification, no country/method facts** — the K3/K4 gap |
| Flutterwave | Read-only by law (one operation `flutterwave.balances.read`; GET-only transport; `refuseConsequentialFlutterwaveGrant`); real probe receipts exist (P14-C1/P21-A); execution requires its own ADR-0008-D2-pattern amendment + credentials |
| MTN MoMo | Declaration-only (`UNCONFIGURED`, three typed missing operator items: valid subscription key answering the four 401 endpoints, provisioned API user, API key); no adapter of any kind |
| Routing | `route-compiler`: 10 frozen shapes incl. `cross-provider-corridor` (4 legs; custody continuity INV-C09; authorization lineage per leg; `discoveryPermitsExecution: false` literal). `route-planning`: fail-closed injected ports (stages 2/3/4), hard gates INTENT_WINDOW→HOP_BUDGET→SETTLEMENT_DEADLINE→CANDIDATE_STATUS before deterministic ranking, count-based budgets + truncation receipts, conditional opportunities advisory-only. `capability`: the 4-layer fabric with the INV-13 catalogue/instance separation and the INV-19 opaque credential refs. `protocol`: BEGIN/REPLAY/CONFLICT idempotency, opaque AuthorizationRefs, the reconciliation evidence kinds |
| Composite execution | The P22 composite act: plan-digest-scoped two-act approval, per-leg single-use shares, per-leg idempotency `(mission, operation, legIndex, intentDigest)`, custody-continuity gate (later legs dispatch only when every earlier leg is CONFIRMED), UNKNOWN stops dependents; kernel table stripe + paystack + stellar:testnet; FLW honestly `NO_AUTHORITY_WIRED` |
| Station catches | **C-1** the committed `p26-0-dashboard-parity-FACTS` artifact was the P26-0-registration snapshot (631/13/REAUTH 0) — regenerated at P27-0 to the pinned ledger (**634/10/REAUTH 3**); **C-2** `read-back-routes.ts:8` historical comment said "638 dispatchable / 353 writes" (P25-era prose drift; the true P25 numbers were 631/347) — corrected; **C-3** the P26 operator run card's `cd /home/z/payswap-3.0` path casing — corrected to `/home/z/PaySwap-3.0` |

## 4. Country × product × entitlement matrix (initial, dated 2026-11-03)

Every cell is evidence-bound to §1/§2 rows or the in-repo audit (§3). **"—" means no eligible path exists through that product for that market on today's evidence; it is never silently filled.**

| Market | Direct Stripe account (U1/U2) | Stripe Connect seller (U3) | Global Payouts recipient | Global Payouts origin | Paystack business | Local rails (audited evidence) |
|---|---|---|---|---|---|---|
| Ghana | — (Extended Network → Paystack, V6) | only via an eligible platform's connected-account onboarding (U3 configured; country/capability gates at dispatch) | **H2 27 roadmap** (K1) — conditional opportunity at best | — (GA UK/US only, V3) | registration-claimed, **re-verify K3/K4** | MoMo collection + `ghipss`/`mobile_money` recipients **unverified at station** |
| Kenya | — (Extended Network, V6) | same U3 pattern | same K1-class re-verification per country | — | registration-claimed, re-verify | `kepss`/`mobile_money` unverified at station |
| Nigeria | — (Extended Network, V6) | same U3 pattern | same re-verification | — | registration-claimed, re-verify | `nuban` unverified at station |
| South Africa | — (Extended Network, V6) | same U3 pattern | same re-verification | — | registration-claimed, re-verify | `basa` unverified at station |
| Côte d'Ivoire | — (Extended Network via Paystack CI, V6) | same U3 pattern | same re-verification | — | not claimed | not claimed |
| United States | eligible per Stripe account-opening rules (U2 on operator platform config) | eligible platform/seller pattern | recipient market (per-product matrix at dispatch) | **GA origin (V3)** — Treasury + entitlement + funding + licences required | — (not a Paystack market) | n/a |
| United Kingdom | eligible per Stripe rules | eligible | recipient market | **GA origin (V3)** — same gates | — | n/a |

**The Ghana recipient exclusion** (Bank of Ghana, K4) and every per-country min/max/fee/FX/cutoff fact: re-verified at P27-C encoding time and carried as dated observations with the operation, never hardcoded flags.

## 5. Purpose / regulatory eligibility table (the ADR-0020 D1/D3 law made concrete)

| Transaction class (typed, from real facts) | Stripe Payments (U1/U2 merchant) | Stripe Connect (U3) | Stripe Global Payouts | Paystack collection | Paystack transfer | Required before any route is eligible |
|---|---|---|---|---|---|---|
| Genuine commerce (goods/services, invoice/order evidence) | ✓ | ✓ (direct/destination/separate-transfers per the decided charge model) | ✓ (entitled origin) | ✓ (per account/country) | — (collection product) | purpose evidence; active merchant/seller account; method/country gates |
| Marketplace seller settlement | — (not the product's purpose alone) | ✓ the designed pattern | ✓ (entitled origin) | — | ✓ where the business's own account supports payouts | platform + seller relationship; MoR/liability decision; seller verification |
| Contractor / supplier payment | — | ✓ where the platform model covers it | ✓ the designed third-party payout case | — | ✓ for the business's own contractors | entitlement; recipient verification; funding |
| Reimbursement / refund | ✓ provider-supported refund flows | ✓ | ✓ | refund flows per account | ✓ where supported | provider-supported mechanism only; never a fabricated reversal |
| **Regulated remittance / P2P** | **✗** Stripe restricts personal/P2P money transmission for ordinary accounts; **a Payment Link does not change this (INV-30)** | **✗** Connect is not unrestricted P2P | **only if** the actual PaySwap operator holds the licences AND has Stripe's explicit written product approval for the disclosed model | **✗** not the product's purpose | **✗** a business payout lane is not a personal wallet | licences + explicit provider approval + the ADR-0020 D8 custody evidence — absent any of these: typed exclusion |
| Other / unclear | — | — | — | — | — | the model asks for the missing facts; classification is reviewable and never model-chosen |

**Eligibility decision order (hard gates before ranking, ADR-0020 D6):** purpose class → jurisdiction/licensing → provider product permission → account entitlement (probe-verified, INV-13) → funding → country/method/currency → only then cost/speed ranking with the direct/native baseline included.

## 6. Re-verification obligations placed on the lanes

- **P27-A** re-verifies current Connect account models, capabilities and country eligibility at implementation time against live Stripe docs + the operator's actual platform account.
- **P27-B** re-verifies the full GA/private-preview origin list, the recipient-market matrix, Treasury entitlement and the Ghana corridor status before encoding anything; roadmap labels are conditional opportunities, never routes.
- **P27-C** re-verifies every Paystack recipient type, country/method fact, OTP/finalize behavior and the Bank-of-Ghana exclusion against **live docs and the actual account's API**, then encodes them as dated observations.
- **P27-D** treats node offers the same way: signed and fresh is necessary, provider-evidenced is decisive.
