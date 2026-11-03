# P27-C LANE REPORT — Paystack and African local rails (worker-3, 2026-11-03)

**Lane:** P27-C — `packages/provider-runtime/src/adapters/paystack/**` growth + `packages/merchant/src/kes-receiving.ts` growth + the Paystack app surfaces + NEW `scripts/p27/` harnesses + their tests (ADR-0020 D12, file-disjoint).
**Checkout:** `/home/z/PaySwap-3.0-c`, branch `work/p27-c`, base main `6c0aef7`.
**Binding law:** ADR-0020 (D1–D12) · INV-30 (the non-laundering invariant) · D10 (dated evidence, never flags) · D11 (key-ready / exit-2 / OPERATOR_GATED / live refused) · INV-25 (`sk_live_` never binds) · INV-13 (a declared capability is not a dispatchable one) · ADR-0016 D13 (extend, never rewrite).

---

## 1. What was implemented

### 1.1 The recipient plane (the recipient stops being an opaque `RCP_…`)

- **`recipient-facts.ts`** — the registration-claimed candidate recipient-type vocabulary (`ghipss`, `mobile_money`, `nuban`, `basa`, `kepss` — the K3 claim, **names only, never availability facts**); the `PaystackRecipientTypeEvidence` dated-observation record (recipientType × country × currency × status × **sourceUrl × retrievedAt** × evidence tier × the re-verified required wire fields × optional institution exclusions); fail-closed observation validation; the **EMPTY shipped registry** (`PAYSTACK_RECIPIENT_TYPE_EVIDENCE = []`); the evidence lookup; and `PAYSTACK_RECIPIENT_FACTS_STATION_RECORD` — the honest, dated record of this lane's live-doc re-verification attempts (§3 below).
- **`recipient-request.ts`** — the typed request builder, the K3/K4 gate: nothing unverified ever dispatches. A request is admitted ONLY by a VERIFIED dated observation in the registry (`PAYSTACK_RECIPIENT_TYPE_UNVERIFIED` typed refusal otherwise), every re-verified required wire field must be present (`PAYSTACK_RECIPIENT_FIELD_REQUIRED`), and an excluded institution reference refuses (`PAYSTACK_RECIPIENT_INSTITUTION_EXCLUDED` — the Bank-of-Ghana-class exclusion slot, encode-when-re-verified).
- **`recipient-plane.ts`** — the seal-consumer create + list drivers over the real transfer-recipient API (`POST /transferrecipient`, `GET /transferrecipient`), each path re-deriving `derivePaystackSandboxRecipientGrant` at dispatch (never cached; `sk_live_` refused at the derivation), escape-scanned results, INV-04 UNKNOWN laws (a 2xx without the recipient shape is UNKNOWN, never a guessed success), and **`recipientRefOf`** — the transfer-lane wiring that feeds the existing transfer initiate's `recipient` field.

### 1.2 The collection surface (hosted pages / charge / verify / webhook / reconciliation)

- **`collection-execution.ts`** — transaction initialization (`POST /transaction/initialize` — a payment **REQUEST** the customer still authorizes on the provider's hosted page; `confirmedPaid` stays false on a CONFIRMED initialize — honest semantics, ADR-0020 D1) and the verify read-back (`GET /transaction/verify/{reference}` — paid ONLY on the provider's own `success` status word). Unique-reference idempotency is REQUIRED on initialize (the caller-scoped reference is the idempotency key). The collection grant derives at dispatch (`derivePaystackSandboxCollectionGrant`), SANDBOX-only, never cached.
- **`hosted-payment-page.ts`** — the reusable page product (`POST /page`) riding the same collection laws through their one seam each.
- **`webhook-signature.ts` + `webhook-verification.ts`** — the claimed signature scheme (`x-paystack-signature`, HMAC-SHA512 over the RAW body, constant-time comparison through the injected crypto seam — no `===` on digests; the package owns no cryptography) and the full pinned-order verification path (delivery shape → signature → body parse → typed extraction → event-key single-use consumption) with typed events (`charge.success`, `transfer.success`, `transfer.failed`, `transfer.reversed`), `VERIFIED_UNMAPPED` for signature-good events outside the typed vocabulary (fails soft, nothing invented), the replay defense (the scheme carries no timestamp, so the event-key single-use consumption law is the replay defense — `EVENT_ALREADY_CONSUMED`), and the terminal-only reconciliation feed (`transfer.reversed` is an OBSERVATION, never a retroactive resolution). The events.ts ingestor plug (`createPaystackWebhookIngestorVerifier`) rides the same one seam.

### 1.3 The transfer product lane (OTP/finalize wiring in the product lane)

- **`transfer-product-lane.ts`** — the INV-30 typed purpose gate (`refuseIneligiblePaystackPurpose`: TRANSFER = the business-payout product — `MARKETPLACE_SELLER_SETTLEMENT`/`CONTRACTOR_OR_SUPPLIER_PAYMENT`/`REIMBURSEMENT_OR_REFUND`; COLLECTION = `GENUINE_COMMERCE`; `REGULATED_REMITTANCE_P2P` and `UNCLASSIFIED` ALWAYS refuse; the gate reads ONLY the typed class — relabeling/decomposition/hop-chaining change nothing) and the typed lifecycle (`INITIATED_PENDING_FINALIZE` carrying the provider's raw status verbatim → `CONFIRMED_FINAL` only on the provider's own `success` → UNKNOWN stays UNKNOWN → FAILED carries the provider's failure metadata). The driver (`createPaystackTransferProductLane`: `runPayout` → `completeWithOtp` → `reconcile`) rides the UNCHANGED P22-H execution surface (`transfer-execution.ts` — additive only, its laws and tests untouched and green).

### 1.4 The KES receiving slice growth (`packages/merchant`)

- **`kes-receiving.ts`** — the Paystack recipient association: `PinnedPaystackKesRecipientEvidence` (the local structural mirror of the dated observation, pinned by value — zero sibling imports, verified test-only), the claimed KES candidate vocabulary (`kepss`/`mobile_money`), and `defineCorridorKesPaystackRecipientReceiving` — fail-closed on the caller-supplied VERIFIED dated observation (the association type must be a claimed candidate AND agree with its evidence; no verified (KE, KES) observation exists at this station, so the association is unconstructible from shipped constants — the honest state). The KES receiving slice rides the new recipient plane where the facts permit.

### 1.5 The app surfaces (`packages/payswap-app`)

- **`src/lib/paystack-africa-pins.ts`** — the Africa Extended Network onboarding links (the V6-verified `paystack.com/stripe/{ghana,kenya,nigeria,south-africa}` URLs + `paystack.com/ci/` for Côte d'Ivoire, each stamped with the 2026-11-03 retrieval date + the `stripe.com/global` source), the fail-closed market-link resolver, and the honest collection/recipient journey declarations (the D4 same-form law; the K3/K4 OPERATOR_GATED state; the INV-30 purpose law).
- **`src/console/sections/PaystackAfricaCollectionCard.tsx`** — the journeys' render surface (the collection declaration, the K3/K4 gate note, the onboarding links as external anchors), wired into `ConnectionsActivationPanel.tsx` (the Paystack area): its ONE action seeds the SAME `paystack`/`own-store-test-mode` connection journey (never a dead button, zero financial authority; the links never connect anything).
- **`src/lib/agent-provider-entries.ts`** (Paystack rows only) — two new qualifier cards: the local-collection journey and the Africa local-rails (per-country business) journey, both resolving to the SAME existing form/useCaseRef so every journey stays a live path through the existing host form.

### 1.6 The key-ready harness (`scripts/p27/`)

- **`c1-paystack-africa-real-sandbox-journey.ts`** (+ **`c1-harness-lib.ts`**, the ≤400-line split per the `scripts/p21/rail-evidence-lib` precedent) — the real-Paystack-Sandbox journey family mirroring `scripts/p26/a1`: exit 2 without credentials (never a silent pass), `sk_live_` refused (exit 1, INV-25 re-checked at the harness edge), writes double-gated, seven gates (G1 read-only probe · G2 recipient-list read-back · G3 the K3/K4 recipient facts gate · G4 the collection journey · G5 the payout reconcile read-back · G6 the webhook signature self-check with real node:crypto · G7 the INV-30 purpose-gate law), the machine-scanned receipt (refuses to emit if any secret string appears anywhere in the JSON), and the operator's evidence-pack path (§4). All three exit paths verified at this station (exit 2 without creds; exit 1 on a live key; a wiring dry-run with a fake test key hit the REAL api.paystack.co and honestly FAILED the probe with the provider's invalid-key answer while G3/G6/G7 held GREEN).
- **`packages/provider-runtime/test/adapters/paystack-sandbox-harness.test.ts`** — the two-tier companion battery (the `stripe-sandbox-harness.test.ts` precedent): TIER 1 scripted (always runs, credential-free — the same harness journeys over a deterministic fake fetch; NEVER real evidence) + TIER 2 real (skips cleanly with the honest `SCRIPTED_FAKE_ONLY__OPERATOR_GATED` tier marker when `PAYSTACK_SECRET_KEY` is absent).

### 1.7 Registry/declaration/endpoint-map growth (disclosed, additive)

- `capabilities.ts`: the two NEW dispatch-time SANDBOX grants (`derivePaystackSandboxRecipientGrant`, `derivePaystackSandboxCollectionGrant`) — each its own fail-closed derivation, SANDBOX-only, never cached, `sk_live_` refused; the read-only scope fold and `refuseConsequentialPaystackGrant` are UNCHANGED (D4: new operations never widen the read-only scope — proven by tests).
- `declaration.ts` + `https-transport.ts`: five new operation ids (`paystack.transfer_recipient.create`, `paystack.transfer_recipient.list`, `paystack.transaction.initialize`, `paystack.transaction.verify`, `paystack.page.create`) with their endpoint-map rows (POST/POST/POST/GET-path-param/POST); unknown operations still REFUSED BEFORE DISPATCH; the read-only connection form is UNCHANGED in every field (asserted by the P14-C slice tests, re-pinned with a disclosed P27-C comment).
- `provider-runtime/src/index.ts`: the new modules' export surface.

---

## 2. File inventory (created ✚ / changed ✎)

**provider-runtime (Paystack adapter + tests):**
- ✚ `src/adapters/paystack/recipient-facts.ts` · `recipient-request.ts` · `recipient-plane.ts` · `collection-execution.ts` · `hosted-payment-page.ts` · `transfer-product-lane.ts` · `webhook-signature.ts` · `webhook-verification.ts`
- ✎ `src/adapters/paystack/capabilities.ts` (the two new grants) · `declaration.ts` (five new operation ids; the read-only form unchanged) · `https-transport.ts` (five endpoint-map rows) · `transfer-execution.ts` (documentation growth ONLY — the P22-H code paths unchanged) · `src/index.ts` (the new exports)
- ✚ `test/adapters/paystack-recipient-facts.test.ts` (10) · `paystack-recipient-plane.test.ts` (7) · `paystack-collection.test.ts` (12) · `paystack-transfer-product-lane.test.ts` (10) · `paystack-webhook-verification.test.ts` (11) · `paystack-sandbox-harness.test.ts` (7 + 1 operator-gated skip)
- ✎ `test/adapters/paystack-slice.test.ts` (the disclosed P27-C operation-surface re-pin)

**merchant:**
- ✎ `src/kes-receiving.ts` (the recipient association + its fail-closed validation) · `src/index.ts` (the new exports)
- ✎ `test/kes-receiving.test.ts` (the recipient-association battery, fixture observations ONLY — never promoted) · `test/smoke.test.ts` (the disclosed barrel re-pin 235 → 237, the P22-C precedent)

**payswap-app:**
- ✚ `src/lib/paystack-africa-pins.ts` · `src/console/sections/PaystackAfricaCollectionCard.tsx` · `test/payswap/paystack-africa-surfaces.test.tsx` (11)
- ✎ `src/console/sections/ConnectionsActivationPanel.tsx` (the Paystack-area card mount) · `src/lib/agent-provider-entries.ts` (the Paystack entry's two qualifier journeys — Paystack rows only)

**harness:**
- ✚ `scripts/p27/c1-paystack-africa-real-sandbox-journey.ts` · `scripts/p27/c1-harness-lib.ts`

**this report:** ✚ `docs/productization-evidence/P27-C-LANE-REPORT-2026-11-03.md`

**Untouched (verified):** every forbidden file — `route-planning/src/pins/corridor.ts`, `execution-lane-composition.ts`, `connections/capability-bridge.ts`, `connections/probe-contracts.ts`, everything under `adapters/stripe/`, `adapters/flutterwave/`, `adapters/mtn-momo/`, `spec/architecture/invariants.{json,md}`, `MODULE-OWNERSHIP.yaml`, `spec/dependency/*`, `pnpm-lock.yaml`, all desktop host files, all sibling checkouts.

---

## 3. The K3/K4 dated live-doc re-verification record (D10 — the honest record)

**Obligation (the capability matrix §2 K3/K4 + §6):** re-verify every Paystack recipient type, country/method fact, OTP/finalize behavior and the Bank-of-Ghana exclusion against **live docs AND the actual account's API** before encoding, as dated observations.

**Outcome: STILL UNVERIFIED AT STATION — the registry ships EMPTY.** The lane re-attempted the re-verification genuinely on 2026-11-03 (a second full pass beyond the P27-0 station's attempts; every attempt with a real browser User-Agent):

| # | URL attempted | Outcome (2026-11-03, this station) |
|---|---|---|
| 1 | `https://docs.paystack.com/transfer-recipient` | **DNS does not resolve** (curl error 6, NXDOMAIN — confirmed by `getent`) |
| 2 | `https://docs.paystack.com/transfers` | DNS NXDOMAIN |
| 3 | `https://docs.paystack.com/payments/webhooks` | DNS NXDOMAIN |
| 4 | `https://paystack.com/docs/transfers/` | **HTTP 403 — Cloudflare "Just a moment…" managed challenge** (the challenge page's own title, fetched verbatim) |
| 5 | `https://paystack.com/docs/transfer-recipient` | HTTP 403 Cloudflare challenge |
| 6 | `https://paystack.com/docs/payments/webhooks` | HTTP 403 Cloudflare challenge |
| 7 | `https://paystack.com/developers` | HTTP 403 Cloudflare challenge |
| 8 | `https://developer.paystack.com/` | connection failure / NXDOMAIN |
| 9 | `https://paystack.com/docs/transfers/` in a REAL headless Chromium (agent-browser/Playwright) | **still "Just a moment…" after 27 s of waits** — the managed challenge is not passed by a real browser either |
| 10 | `https://web.archive.org/web/2026/https://docs.paystack.com/transfers` | connection timeout |
| 11 | `https://archive.org/wayback/available?url=docs.paystack.com/transfers` | HTTP 429 (rate-limited from this station's IP) |
| 12 | `https://r.jina.ai/https://docs.paystack.com/transfers` | the reader proxy answers the domain cannot be resolved; for `paystack.com` it answers "blocked from anonymous queries (bad IP reputation)" |
| 13 | `https://api.paystack.co/transaction` (no credentials) | **REACHABLE — answers 401 `{"status":false,"message":"No Authorization Header was found"}`** (the honest no-credential answer; the API host is reachable, the docs are not) |

**What this means mechanically (D10/D11):** NO recipient-type, country, method or institution-exclusion fact is encoded anywhere. The candidate names (`ghipss`/`mobile_money`/`nuban`/`basa`/`kepss`) are carried as the registration's **claimed vocabulary only**; the shipped evidence registry is `[]`; the typed request builder refuses every recipient create (`PAYSTACK_RECIPIENT_TYPE_UNVERIFIED`); and both the hermetic battery and the c1 harness's G3 assert the refusal as the GREEN state. The block itself is a **station-environment fact recorded honestly** (`PAYSTACK_RECIPIENT_FACTS_STATION_RECORD`), not a failure of the lane. The Bank-of-Ghana exclusion is NOT encoded (its `excludedInstitutionRefs` slot exists in the observation shape and is enforced when a verified observation carries it — encode-when-re-verified, never before).

**What WAS verified:** the Extended Network onboarding links (V6, verified 2026-11-03 at the P27-0 station from stripe.com/global raw HTML: `paystack.com/stripe/{ghana,kenya,nigeria,south-africa}`, Côte d'Ivoire → `paystack.com/ci/`) are encoded as dated, source-stamped link facts in the app pins (link facts, never account-eligibility facts — V6's own wording: a Paystack onboarding path, not direct Stripe account eligibility).

---

## 4. OPERATOR_GATED items (the standing operator actions)

1. **THE RECIPIENT/COUNTRY/METHOD FACTS (K3/K4)** — the one load-bearing gate. Supply, through the station secret channel: the live-doc re-verified recipient-type observations (source URL + retrieval date + the required wire fields per type) and the real-account probe. The c1 harness's evidence-pack path (`PAYSTACK_RECIPIENT_TYPE/COUNTRY/CURRENCY/SOURCE_URL/RETRIEVED_AT/NAME` + the account-number/bank-code/phone wire fields, + `PAYSTACK_SANDBOX_WRITES_ENABLED=1`) performs the real create and emits the REAL_ACCOUNT_PROBE observation candidate in its machine-scanned receipt; the TL reviews and lands it in `PAYSTACK_RECIPIENT_TYPE_EVIDENCE`. **No fixture observation is ever promoted** (D11).
2. **The real Paystack Sandbox runs** — per the run card §D: connect each participating business's own Paystack account (per country), supply fresh test keys + webhook secrets through the secret channel, configure transfer OTP/approval explicitly. Harness env keys (recorded for the TL): `PAYSTACK_SECRET_KEY` (the primary; the run card's per-business convention is `PAYSTACK_SECRET_KEY_<BUSINESS>`), `PAYSTACK_SANDBOX_WRITES_ENABLED=1` (the writes double-gate), `PAYSTACK_WEBHOOK_SECRET`, `PAYSTACK_TRANSFER_REFERENCE`, `P27C_RECEIPT_PATH`. **None of the real-tier gates have run** — no credentials exist at this station.
3. **The webhook delivery surface** — no inbound public endpoint exists in this station, so live provider→station delivery is NOT claimed and never simulated; the webhook machinery is verified with locally-signed events (real secret material) only.
4. **LIVE everywhere** — remains refused (INV-25; `sk_live_` refused at eight-plus mechanical layers incl. every new P27-C derivation); any live activation is a separate operator order completing ADR-0019's bundle.

---

## 5. The Flutterwave + MTN MoMo re-audit (lane scope; implement NOTHING)

Re-verified against the tree at this lane's tip:

- **Flutterwave — read-only by law, HOLDS.** One operation (`flutterwave.balances.read` → `GET /v3/balances`); the transport's endpoint map is GET-only (`method: 'GET'` in the map's own type); `refuseConsequentialFlutterwaveGrant` binds the read-only scope fold (capabilities.ts L142/L164); INV-25 key-mode law intact (`FLWSECK-` live prefix refused). No write surface, no new operations. Execution still requires its own ADR-0008-D2-pattern amendment + valid credentials (INV-13).
- **MTN MoMo — declaration-only, HOLDS.** `src/adapters/mtn-momo/` contains ONLY `declaration.ts`; status `UNCONFIGURED` with the three exact missing operator items (a valid `Ocp-Apim-Subscription-Key` answering the four 401 endpoints; a provisioned API user `X-Reference-Id`; the API key for that user). No adapter, no transport, no probe exists. A declared integration is not a dispatchable capability.

Nothing was implemented for either provider (the lane's re-audit-only obligation).

---

## 6. Test evidence (all gates, exact numbers, this checkout)

| Gate | Result |
|---|---|
| `packages/provider-runtime` `pnpm test` | **41 files · 586 passed · 6 skipped (592 total) · 0 failed** — baseline 35 files / 529 + 5 skipped; the lane added 6 files / 57 tests, and +1 honest skip (the harness TIER 2 operator-gated marker) |
| `packages/provider-runtime` `pnpm typecheck` | **0 errors** |
| `packages/merchant` `pnpm test` | **26 files · 365 passed · 0 failed** (the extended kes-receiving battery +8 tests; the barrel cap re-pinned 235 → 237 with a disclosed comment) |
| `packages/merchant` `pnpm typecheck` | **0 errors** |
| `packages/payswap-app` `pnpm test` | **67 files · 787 passed · 0 failed** — baseline 66 files / 776 tests; the lane added 1 file / 11 tests |
| root `pnpm lint` (oxlint) | **0 errors** (384 warnings — the pre-existing repo baseline; the lane's own files contribute **zero** warnings after cleanup) |

Harness behavior verified live at this station: exit **2** without credentials; exit **1** on an `sk_live_` key; the wiring dry-run (a fake test key against the REAL `api.paystack.co`) honestly FAILED the probe with the provider's invalid-key answer while G3 (K3/K4 refusal), G6 (webhook self-check with real node:crypto) and G7 (INV-30 refusals) held GREEN; the receipt emitted with **zero** secret occurrences (machine-scanned).

---

## 7. Integration instructions for P27-E (the TL)

1. **The desktop host's Paystack endpoint map** (`packages/desktop/src/host/payswap/connections/host-https-transports.ts`) still pins only the four P22-H operations. When the desktop lane composes the new surfaces, the five new operation rows must land there (mirror of `PAYSTACK_OPERATION_ENDPOINTS`). **Not edited by this lane** (desktop host files are outside P27-C ownership).
2. **The registry evidence landing** — when the operator's re-verified observations arrive (via the c1 harness receipt or a future docs-reachable re-verification), they land in `PAYSTACK_RECIPIENT_TYPE_EVIDENCE` (one dated observation per type × country × currency, with the re-verified required wire fields and the Bank-of-Ghana-class exclusion refs if confirmed). The builder/lookup/association machinery is ready and needs no code change.
3. **The barrel re-pin** — merchant's smoke cap moved 235 → 237 (disclosed in `test/smoke.test.ts`, the P22-C precedent); the desktop test census and any app-surface counts should treat the two new Paystack qualifier cards + the Africa card as disclosed growth.
4. **The run card's harness naming** — the run card §D names `PAYSTACK_SECRET_KEY_<BUSINESS>`; the c1 harness takes the primary `PAYSTACK_SECRET_KEY` (+ the documented companions in §4). If the TL prefers per-business harness runs, the convention maps 1:1 (source the per-business env var into `PAYSTACK_SECRET_KEY`).
5. **The corridor composition** — the recipient association (`defineCorridorKesPaystackRecipientReceiving`) is ready for the corridor's KES arrival wiring the moment a verified (KE, KES) observation exists; `route-planning/src/pins/corridor.ts` is the TL's file and was not touched.

---

## 8. Honest exclusions

- **No recipient/country/method/limit fact is encoded** — K3/K4 remain unverified at this station (the full attempt record in §3). The candidate names ship as names only; every recipient create refuses until the evidence lands. This is the honest state, not a gap in the machinery.
- **No real Paystack account journey has run** — no credentials exist at this station (OPERATOR_GATED; exit-2 law verified). No receipt exists to promote; none was fabricated.
- **Live webhook delivery is not claimed** — no inbound endpoint exists; the webhook machinery is verified with locally-signed events only.
- **`sk_live_` is refused everywhere** — every new derivation (recipient, collection) re-checks the key-mode binding; the deployment is SANDBOX-only (INV-25).
- **No new npm dependencies, no lockfile edit** (the lane-forbidden files untouched).
- **Flutterwave and MTN MoMo** — nothing implemented (re-audit only, §5).
- **The desktop host surface** — not wired (outside P27-C file ownership; the integration instruction is §7.1).

**Laws held on every line:** INV-30 (typed refusals for relabeled purposes — proven at both product seams, in tests and in the harness), D4 (the read-only scope never widens — the connection form is unchanged and its refusal law is asserted), D10 (dated evidence, never flags — the registry ships empty and the gate refuses), D11 (key-ready, exit-2, no fixture promotion), INV-13 (declarations never dispatch), ADR-0016 D13 (the P22-H surface extended, its tests green unmodified).
