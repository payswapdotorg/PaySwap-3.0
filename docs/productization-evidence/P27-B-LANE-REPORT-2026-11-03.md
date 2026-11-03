# P27-B LANE REPORT — Stripe Global Payouts (worker-2, 2026-11-03)

**Lane:** P27-B — the dedicated Stripe Global Payouts product slice (ADR-0020 D4/D10/D11/D12; the P27-0 capability matrix §4/§5; the P27-DEPENDENCY-GRAPH P27-B entry, verbatim law).
**Station:** /home/z/PaySwap-3.0-b, branch `work/p27-b` (from main `6c0aef7`). Every file this lane created or touched is listed in §2 — nothing outside the D12 file-disjoint ownership was edited.

---

## 1. What was implemented

Global Payouts as a **distinct, separately-entitled product slice** over the PINNED Stripe census — never an alias of ordinary `POST /v1/payouts`, Connect transfers or PaymentIntents (ADR-0020 D4, typed + test-enforced):

1. **The product declaration** (`payouts-product.ts`): the product identity (`stripe.global-payouts`, requires-Treasury, funds-from-financial-account, recipients-may-be-any-third-party, the dated evidence stamp), the **31-operation pinned census inventory** (each entry census-resolved at module load — a missing/non-dispatchable operation is a load-time error, never a silent gap), the **never-alias surface** (14 typed-forbidden operation ids + `StripeGlobalPayoutsAliasRefusal`), and the **census-gap record** (§5 below).
2. **The dated-evidence layer** (`payouts-evidence.ts` + `payouts-evidence-markets.ts`): every country/method/currency/limit fact as an evidence-stamped observation retrieved 2026-11-03 — the GA origin list (GB, US), the **full 22-country private-preview origin list** (completing the P27-0 matrix's partial extraction), the 12-row sender-country payout-method matrix, the 7-row sending-limit table, the **107-row recipient-market matrix** (Ghana ABSENT — the K1 law), and the 94-row / 14-row receiving minimum/maximum tables (minor units, verbatim).
3. **The typed fail-closed eligibility gates** (`payouts-eligibility-verdict.ts` + `payouts-eligibility.ts`): the ten-gate chain in the capability matrix §5's order — purpose classification (D3) → INV-30 relabeling → P2P licences + written provider approval (V5) → origin GA/private-preview (V3) → Treasury entitlement (V2) → funding → recipient market → recipient currency (GA vs private-preview column) → payout method (GA vs preview) → amounts (sending bounds + same-currency receiving bounds; cross-currency bounds deferred to the provider-given quote, never local FX math). The three honest verdicts: **ELIGIBLE / OPERATOR_GATED / REFUSED** — the last carrying the conditional-opportunity note (the Ghana H2 27 roadmap label) on the refusal, never as a route.
4. **The product journey** (`payouts-journey-contracts.ts` + `payouts-journey.ts` + `payouts-journey-executor.ts`): frozen, census-resolved dispatch plans and the executor — recipient creation (pinned v2 core accounts), the **hosted recipient-information form** (pinned `PostV2CoreAccountLinks` at its REAUTH tier — refuses without the host proof reference, ADR-0018), the **third-party outbound payment** (pinned v1 Treasury `PostTreasuryOutboundPayments`, STRONG_CONFIRM by the product law, v1 idempotency-key bound, `end_user_details.present` third-party proof, `destination_payment_method_data` inline destination), status read-back, the dated cancellable law (cancel only while processing AND provider-`cancelable`), the reconciliation reads (outbound payments + transactions + transaction entries), the return/exception vocabulary, and the sandbox return simulations (the pinned test_helpers family, test-mode-only plans). **A plan exists ONLY for an ELIGIBLE verdict** — every other verdict yields the typed NOT_PLANNED record. INV-04: UNKNOWN_AFTER_DISPATCH carries the reconcile read-back, never a blind retry.
5. **The dated status/event/exception vocabulary** (`payouts-status.ts`): the live docs' OutboundPayment statuses (processing/failed/canceled/posted/returned), PayoutIntent statuses (disclosure — the v2 surface is unpinned), status-detail reasons (under_review / review_rejected / fx_rate_drift_exceeded_after_review), the provider error codes, the fail-closed classifier (unrecognized bodies → UNRECOGNIZED, never a guessed status — INV-24) and the posted-is-not-delivery honesty note.
6. **The capability slice** (`payouts-capability.ts` + `payouts-capability-corridors.ts`): the structural D10 dated-observation contract + validator, the 10-row live-doc re-verification record, the never-alias surfaces carried as data, the dated corridor restriction sets (definition-level + 7 per-method implementation sets, every set NARROWING the definition-level set), and the rail capability definition — **NON-EXECUTABLE BY CONSTRUCTION (INV-13)** with the explicit reason until the operator's real, entitled, probe-verified account exists.
7. **The key-ready harness** (`scripts/p27/b1-global-payouts-journey.ts` + `scripts/p27/b1-harness-core.ts`): the a1-precedent twin — env-keyed `STRIPE_SANDBOX_SECRET_KEY` + the `STRIPE_SANDBOX_WRITES_ENABLED=1` double-gate, **exit 2 without credentials** (verified), **live keys refused exit 1 (INV-25, verified)**, six gates (the eligibility-gate law, the census-integrity law, the account + Treasury entitlement probe, the recipient-plane read, the double-gated write journey payout→read-back→cancel, the reconciliation reads), the honest **entitlement-class recognizer** (Treasury/permission refusals are SKIPPED/OPERATOR_GATED, never RED), and the machine-scanned secret-free receipt (verified: the receipt refused to leak the key even in provider error text).
8. **Hermetic tests** for all of the above (§3) — fake/scripted transports per the existing CONTRACT tier patterns, zero network, zero credentials.

## 2. File inventory (every file this lane owns; nothing else was touched)

**packages/provider-runtime/src/adapters/stripe/catalogue/ (NEW `payouts-*.ts`):**
`payouts-product.ts` · `payouts-evidence.ts` · `payouts-evidence-markets.ts` · `payouts-eligibility-verdict.ts` · `payouts-eligibility.ts` · `payouts-status.ts` · `payouts-journey-contracts.ts` · `payouts-journey-executor.ts` · `payouts-journey.ts`

**packages/provider-runtime/test/adapters/ (NEW):**
`stripe-global-payouts-product.test.ts` · `stripe-global-payouts-eligibility.test.ts` · `stripe-global-payouts-journey.test.ts` · `stripe-global-payouts-lifecycle.test.ts`

**packages/capability/src/ (NEW):** `payouts-capability.ts` · `payouts-capability-corridors.ts`
**packages/capability/test/ (NEW):** `payouts-capability.test.ts`

**scripts/p27/ (NEW):** `b1-global-payouts-journey.ts` · `b1-harness-core.ts`

**docs/productization-evidence/ (NEW):** this lane report.

No shared/sibling file was edited (not `declaration.ts`, `oauth-state.ts`, `connect-*`, `transport/*`, `census.ts`, `read-back-routes.ts`, `spec-pin.ts`, `overlay.ts`, `resource-packs.ts`, `implemented-operations.ts`, `MODULE-OWNERSHIP.yaml`, `invariants.*`, `spec/dependency/*`, `pnpm-lock.yaml`, `execution-lane-composition.ts`, `capability-bridge.ts`, `probe-contracts.ts`, `corridor.ts`). The slice consumes the existing census/read-back/seam modules read-only — the ADR-0016 D13 extend-don't-rewrite law.

## 3. Exact test evidence (run at this station on `work/p27-b`)

| Gate | Result |
|---|---|
| `cd packages/provider-runtime && pnpm test` | **39 files / 604 passed + 5 skipped (609)** — baseline 35f/529t+5sk stays green, the lane adds 4 files and 75 tests, all green, zero modifications to pre-existing tests |
| `cd packages/provider-runtime && pnpm typecheck` | **0 errors** |
| `cd packages/capability && pnpm test` | **19 files / 241 passed (241)** — all green (the lane adds `payouts-capability.test.ts`: 11 tests) |
| `cd packages/capability && pnpm typecheck` | **0 errors** |
| `pnpm lint` (root, oxlint) | **0 errors** (384 warnings, all pre-existing in files outside this lane; this lane's two lint warnings found during the run were fixed at source) |
| Harness credential law | `npx tsx scripts/p27/b1-global-payouts-journey.ts` → **exit 2** without credentials (verified); a `sk_live_/rk_live_` key → **exit 1, LIVE KEY REFUSED (INV-25, verified)** |
| Harness machinery dry-run | with a bogus test key and the receipt redirected outside the evidence tree: G1/G2 GREEN (the in-repo laws), G3/G4 RED with the provider's real 401 answers (the bogus key is not a credential — the run proves the gate machinery + the secret-scan receipt law end-to-end; **no receipt was written into the repo**) |

The new-test census: product/census/never-alias 12 tests · eligibility gates 25 tests · journey write planes 14 tests · lifecycle/reconciliation/UNKNOWN/never-alias/census-gap/idempotency 16 tests · capability slice 11 tests.

## 4. The dated live-doc re-verification record (ADR-0020 D10 — retrieved 2026-11-03 at the P27-B station, every page HTTP 200)

**Method:** every page was fetched live and machine-diffed against the encoded facts (the full-page extraction, not spot quotes). The recipient matrix, receiving bounds, sending limits and method tables were programmatically compared row-by-row.

| URL | Re-verified finding |
|---|---|
| `docs.stripe.com/global-payouts` | V1/V2/V4 facts verbatim; **GA origins: the page's machine country list `["US","GB"]`**; **private preview: the full 22-country list `AU AT BE BG HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES`** (completing the P27-0 matrix's partial extraction, which ended at LU "…"); "Global Payouts requires Treasury … fund your financial account"; "payouts-only solution decoupled from payments"; "Create recipients with the API or … prebuilt information collection forms" |
| `docs.stripe.com/global-payouts/recipient-countries` | **the 107-row matrix: ZERO diffs against the encoded 107 rows** (both currency columns, row by row); the table "applies to all supported sender countries (US and UK)"; private-preview currencies are API-gated ("request access"); **GHANA ABSENT — zero GH rows (the K1 law)**; Nigeria also absent (the Africa Extended Network path is Paystack onboarding, V6 — an honest exclusion, not a Global-Payouts market) |
| `docs.stripe.com/global-payouts/payout-methods` | the sender-country method tables: US 8 rows (ach/fedwire/fps/sepa/local/swift GA, cards GA, **crypto_wallets PUBLIC PREVIEW**) + `link` (payouts to Link users — a separate flow, see §7 exclusions) + an Apple Pay private-preview note on the US cards row; UK 4 rows — all matching the encoded matrix exactly, arrival labels verbatim; **the 7 sending-limit rows and the 94-row minimum / 14-row maximum receiving tables match with ONE CORRECTION (§5 below)** |
| `docs.stripe.com/global-payouts/send-money` | "Send payouts to recipients from your financial account in Stripe Treasury"; the live API code path is `POST /v2/money_management/outbound_payments` (wire version `2026-10-28.endive`) — **NOT pinned (the census gap)**; Confirmation of Payee (UK GBP→UK) with the `outbound_payment_recipient_verification_missing` refusal code |
| `docs.stripe.com/global-payouts/send-money/stablecoins` | crypto-wallet payouts are **PUBLIC PREVIEW, "available to businesses in the US, except businesses located in New York"**; USDC/OUSD; **the crypto-wallet recipient list DOES include Ghana** — the dated extension of the P27-0 K2 record (which found no Ghana stablecoin row on the money-management availability page): an honest PREVIEW observation, encoded as OPERATOR_GATED conditional, **never a bank rail, never a UK-origin route** |
| `docs.stripe.com/global-payouts/manage-payouts` | the OutboundPayment status vocabulary (processing/failed/canceled/posted/returned) + PayoutIntent vocabulary (pending/processing/requires_action/posted/canceled — disclosure; the v2 API is unpinned); status-detail reasons (under_review, review_rejected, fx_rate_drift_exceeded_after_review) + `outbound_payment_cannot_be_processed`; "cancel the payout while its OutboundPayment's cancelable field is true"; "a posted status doesn't guarantee … their bank might delay the release of funds"; returns "in a separate transaction … typically within 2–3 business days"; the restricted-key law ("full-access secret keys (`sk_live_...`) don't work in live mode") + the five restricted-key permission names (encoded in the capability record) |
| `docs.stripe.com/global-payouts/recipient-creation` | recipients are v2 **Account** objects; "submit them with the Accounts API" (`v2/core/accounts`) — the pinned v2 core family; the hosted form is an **Account Link** (single-use, expires ~5 minutes after creation; "Authenticate the recipient in your application before you redirect them") |
| `docs.stripe.com/connect/cross-border-payouts-to-recipients/compare-global-payouts` | V4 verbatim: Global Payouts — "Funds come from your financial account balance, and aren't directly associated with payments. Recipients can be any external party." vs Connect payouts — "Recipients must be connected accounts." |
| `stripe.com/money-management/availability` | **K1 re-verified verbatim: Ghana · GHS · SWIFT · Wire · 6 days · "H2 27"** — the Ghana corridor stays a roadmap conditional opportunity at best, never an available route |
| `stripe.com/payouts` | V5 verbatim: "Send money directly to recipients from your fintech, insurance business, marketplace or government entity"; "Fintech payouts — … loan payouts, cash-outs, investment withdrawals and peer-to-peer transfers" — a licensed-fintech product context (the landing page also notes Global Payouts is "best for businesses that already hold the licenses required to move money themselves") |
| `docs.stripe.com/global-payouts/supplemental-pricing-information` | exists (per-payout fee + FX fee) — carried as the corridor sets' termsRef; no numeric fee encoded (the account's own pricing governs) |

**THE RE-VERIFICATION CAUGHT ONE REAL ENCODING BUG (why D10 exists):** the US USD **Wire** maximum was initially encoded as 10,000,000,000 minor units; the live table's own minor-unit parenthetical for the 10,000,000 USD maximum is **`1000000000` (1,000,000,000 minor = $10,000,000 — a 10× misread)**. The dated page wins: the encoded bound, the corridor set and both test batteries now carry the verified 1,000,000,000 value with an at-the-bound test (the previous lane-session draft asserted the wrong value; the re-verification diff caught and fixed it before commit).

## 5. The pinned-census audit of the Global-Payouts operation families (the census law: implemented over the PIN, never a silent expansion)

**Census at pin v2596 (2026-09-30.endive): 644 operations; the slice uses 31, ALL resolving dispatchable** (module-load fail-closed + test-enforced):

| Family (pinned) | Operations and census facts |
|---|---|
| v1 Treasury outbound payments | `PostTreasuryOutboundPayments` POST `/v1/treasury/outbound_payments` **CONFIRM / IMPLEMENTED_WITH_LIMITS** (the product law imposes the stricter STRONG_CONFIRM on the money movement — see the family-derivation note below) · `GetTreasuryOutboundPayments`/`GetTreasuryOutboundPaymentsId` NONE / IWL · `PostTreasuryOutboundPaymentsIdCancel` **STRONG_CONFIRM / IWL** |
| v1 Treasury financial accounts (the V2 prerequisite) | `GetTreasuryFinancialAccounts`, `GetTreasuryFinancialAccountsFinancialAccount`, `GetTreasuryFinancialAccountsFinancialAccountFeatures` — NONE / IWL |
| v1 Treasury ledger (reconciliation) | `GetTreasuryTransactions(+Id)`, `GetTreasuryTransactionEntries(+Id)` — NONE / IWL |
| v1 Treasury return/exception surfaces | `GetTreasuryReceivedDebits(+Id)`, `GetTreasuryDebitReversals(+DebitReversal)` NONE / IWL · `PostTreasuryDebitReversals` CONFIRM / IWL |
| v1 test helpers treasury (sandbox only) | `Post…IdPost` / `…IdFail` / `…IdReturn` — CONFIRM / IWL (test-mode-only plans, `sandboxOnly: true`) |
| v2 core accounts/links/events (the recipient plane) | `PostV2CoreAccounts`, `PostV2CoreAccountsId`, `PostV2CoreAccountsAccountIdPersons` CONFIRM / **IMPLEMENTED** · `GetV2CoreAccounts(…)` reads NONE / IMPLEMENTED · **`PostV2CoreAccountLinks` REAUTH / IMPLEMENTED** (the hosted form's tier — the slice's only REAUTH operation, consistent with the 3-REAUTH ledger) · `GetV2CoreEvents(+Id)` NONE / IMPLEMENTED |
| v1 events (reconciliation) | `GetEvents`, `GetEventsId` — NONE / IMPLEMENTED |
| The never-alias families (pinned, dispatchable, TYPED-FORBIDDEN for this product) | `PostPayouts`/`PostPayoutsPayout`/`PostPayoutsPayoutCancel`/`PostPayoutsPayoutReverse` STRONG_CONFIRM · `PostTransfers` STRONG_CONFIRM · `PostPaymentIntents`/`PostCheckoutSessions`/`PostPaymentLinks` — **the refusal is the product law (D4), never a claim the operations do not exist** (test-enforced both ways) |

**THE CENSUS GAP (typed, disclosed, never silently expanded):** the live docs' product API surface is the **v2 `money_management` family** (`payout_intents`, `outbound_payments`, `recipient_verifications`, `payout_methods`, `outbound_setup_intents`, `transactions.list`, `transaction_entries.list`; wire version `2026-10-28.endive` on the send-money page, `2026-10-28.preview` in the stablecoins flow; plus the `v2.money_management.payout_intent.*` / `outbound_payment.*` event types). **None of it is in the pinned census** (the pinned v2 namespaces are billing/commerce/core only — test-enforced; the spec-pin's SDK-family delta records the v2 money-management surface as Stripe-internal, 59 operations, disclosure only). The slice therefore executes over the pinned v1 Treasury outbound-payment family + the pinned v2 core accounts/links family, and `payouts-product.ts` carries the typed `UNPINNED_API_SURFACE` disclosure + the 16 doc-named operations the pin cannot dispatch; the transport refuses them fail-closed (`UNKNOWN_OPERATION`, test-enforced). Also not pinned (recorded here for the TL): `PostTreasuryOutboundPaymentsIdUpdateTrackingDetails`, the Treasury financial-account **forwarding-accounts** family, and `PostTestHelpersTreasuryOutboundPaymentsIdAdvanceTravelRuleAcceptance`.

**The 3-segment family-derivation catch (tier honesty):** the census derives the outbound-payment **create** at CONFIRM (the create-at-collection family derivation) while its `/cancel` sub-action derives STRONG_CONFIRM. A third-party money movement out of a Treasury financial account is a STRONG_CONFIRM-class effect by the product law, so the plan carries the **stricter of census tier and product law** (STRONG_CONFIRM), test-enforced; the census derivation itself is untouched (the census files are shared — a drift note for P27-E, not a lane edit).

## 6. Every OPERATOR_GATED item (typed conditionals — never routes, never silent passes)

1. **PRIVATE_PREVIEW_ORIGIN_REQUEST** — any of the 22 private-preview origins (AU AT BE BG HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES): the written Stripe private-preview grant is the operator's action.
2. **TREASURY_ENTITLEMENT** — Global Payouts requires Treasury (V2): activating Treasury + the Global-Payouts entitlement on the actual account is the operator's action (run card §C).
3. **FUNDING_PROOF** — "fund your financial account": funding is the operator's action, re-proven at dispatch.
4. **P2P_LICENCE_AND_PROVIDER_APPROVAL** — INV-30/§5: regulated remittance/P2P needs the operator's licences AND Stripe's explicit written product approval for the disclosed model (V5; absent either: typed conditional, never a route).
5. **PRIVATE_PREVIEW_RECIPIENT_CURRENCY** — the dated table's private-preview currency column ("request access"): e.g. USD to FR/DE/IT/GB receivers is API-gated.
6. **PREVIEW_PAYOUT_METHOD** — crypto-wallet payouts: PUBLIC PREVIEW, US-origin only (New York excluded); the GH crypto-wallet observation rides this gate.
7. **CROSS_CURRENCY_QUOTE_REQUIRED** — cross-currency journeys defer the receiving-currency bounds to the provider-given quote at review time (re-proven at dispatch; no local FX math exists in the package).
8. **The harness's real-Sandbox tiers** — G3–G6 of the b1 harness are OPERATOR_GATED on credential/entitlement re-supply (the standing run-card §C actions); a Treasury/permission-class provider refusal is recorded SKIPPED with the provider's typed error code, never RED.
9. **The capability definition is NON-EXECUTABLE (INV-13)** until the operator's real, entitled, probe-verified account exists — the explicit `nonExecutableReason` says so; an executable fourteen-part declaration requires real account evidence, never documentation.

**The Ghana corridor (K1)** stays exactly as the dated evidence says: **REFUSED as a recipient market** (`RECIPIENT_MARKET_NOT_AVAILABLE`) with the conditional-opportunity note carrying the "H2 27" roadmap label; the stablecoins-page GH row is a US-origin PUBLIC-PREVIEW crypto-wallet observation only — **never a bank rail, never a UK-origin route, never encoded as available** (tests pin all three).

## 7. Honest exclusions

- **The v2 money_management surface is not implemented** — it is not in the pinned census; adopting it is a TL pin decision (generate → diff → review → adopt), recorded as the standing integration instruction.
- **`link` (payouts to Link users) and Apple Pay payouts are not encoded** — the live US method table names `link` as a separate flow's capability token and Apple Pay as a private preview on the cards row; neither is part of the pinned execution surface (the slice executes over v1 Treasury), so a `link`-method journey is honestly refused as not-on-the-dated-matrix. Recorded here for the TL rather than silently widened.
- **PayoutIntents (the scheduled/confirm path) are not executable over the pin** — their status vocabulary is recorded (payouts-status.ts, disclosure only); the two-phase confirm/fx-quote refresh flows ride the unpinned v2 surface.
- **Confirmation of Payee is not encoded as a gate** — it is UK GBP→UK-specific and enforced by the provider (`outbound_payment_recipient_verification_missing`); the slice records the fact and lets the provider's typed refusal surface (no CoP check is fabricated locally).
- **No desktop/app surfaces were touched** (P27-A/P27-E territory) — the slice is provider-runtime + capability + harness only, per D12.
- **No real-Sandbox receipt exists** — nothing was run against a real entitled account; no fixture was promoted to evidence (D11).

## 8. Integration instructions for P27-E (the TL's lane)

1. **The pin decision (the big one):** adopt the v2 `money_management` surface or keep the v1 Treasury slice. The typed `STRIPE_GLOBAL_PAYOUTS_CENSUS_GAP` + `UNPINNED_API_SURFACE` refusal are the machine-citable records; adopting requires the reviewed pin change (the generate → diff → review → adopt path), then the journey's payout plane re-points from `PostTreasuryOutboundPayments` to the v2 outbound-payments/payout-intent surface (the eligibility/evidence layers stay as-is — they are API-agnostic).
2. **Wire the product into the composition seam** (`execution-lane-composition.ts` / `connections/capability-bridge.ts` — P27-E files): the slice is deliberately un-wired there (D12); the journey driver + the capability definition are the ready seams, and the corridor pins (`route-planning/src/pins/corridor.ts`) are P27-E's to grow if the TL wants a Global-Payouts corridor shape.
3. **The tier-drift note:** the census derives `PostTreasuryOutboundPayments` at CONFIRM while the product law demands STRONG_CONFIRM (stricter-of, honored in the slice). If the TL wants the census tier ledger to say STRONG_CONFIRM at source, that is a census/overlay decision (shared files — not editable from this lane).
4. **Unpinned adjacent operations recorded:** outbound-payment tracking-details update, financial-account forwarding accounts, the travel-rule test helper — all NOT_PINNED; none block the journey, all worth remembering at the next re-pin.
5. **Desktop proof plumbing:** the hosted-form plan dispatches at REAUTH; the host proof-reference mint/verify/consume machinery is the desktop's (P27-A/ADR-0018). The slice's `reauthenticationProofRef` seam is ready for that wiring — no proof logic was duplicated here (no parallel kernel).
6. **The OPERATOR_GATED list (§6) maps 1:1 to run-card §C** — no run-card edit is requested; the standing actions are already correctly stated there.
7. **`MODULE-OWNERSHIP.yaml`** needs no lane edit (package-level law); the two new capability src files sit inside `packages/capability` (the capability fabric layer) and the nine new provider-runtime src files inside the rails package — if the TL's ownership report lists per-file surfaces, add them from §2.

## 9. Verdict

The lane is complete against its scope: the dedicated product slice (recipients + hosted forms + third-party payout + status/events + read-back + reconciliation + returns/exceptions), the typed fail-closed eligibility/entitlement/origin gates, the never-alias law at the type level with typed-refusal tests, the dated D10 evidence layer re-verified live (with one real encoding bug caught and fixed by the re-verification itself), the INV-13 fail-closed capability definitions, the key-ready exit-2 harness, and the hermetic batteries — all gates green (§3). Everything the operator must still do is honestly typed as OPERATOR_GATED (§6); nothing is aliased, nothing simulated, nothing live.
