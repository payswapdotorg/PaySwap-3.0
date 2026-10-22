# P13 credential inventory — the operator test-credential drop (2026-10-22)

- **Event**: the operator delivered TEST-mode/sandbox credentials for five
  payment providers in the session chat (the operator's own delivery
  choice). Station handling: moved IMMEDIATELY to the station secret store
  (`secrets/payment-providers.env`, mode 600, gitignored — the
  `my-project` `.gitignore` was hardened in the same window with
  `/secrets/` and verified via `git check-ignore`). No credential value is
  reproduced in this record, in any receipt, or in any committed artifact
  (machine-verified: a secret-leak scan of the committed receipt returns
  CLEAN).
- **Provenance law (ADR-0007 D8)** says test credentials arrive "through
  the secret channel (never chat)". The deviation is recorded honestly:
  the operator chose the chat channel; the station secured the material
  into the secret store within minutes and all consumption ran from there
  (environment variable → the harness), never from chat text and never
  through any LLM context beyond this one-time operator handoff.

## Live read-only verification (station → provider API, same day)

| Provider | Mode | Check (read-only) | Result | Evidence |
|---|---|---|---|---|
| Stripe | test | `GET /v1/balance` with the secret key | **VALID** — HTTP 200, `livemode:false`, test balance readable (USD/EUR) | station log 2026-10-22; the U1 receipt below |
| Flutterwave | test | `GET /v3/balances` with the secret key | **VALID** — HTTP 200, `status:success`, NGN/KES/GHS/USD test wallets | station log 2026-10-22 |
| Paystack | test | `GET /transaction?perPage=1` with the secret key | **VALID** — HTTP 200, 6 test transactions retrievable | station log 2026-10-22 |
| Stellar | testnet | `GET /accounts/<pubkey>` on horizon-testnet + horizon (pubnet) | **VALID (TESTNET)** — the account exists on TESTNET (native XLM balance, friendbot-class funding) and does NOT exist on pubnet (404) | station log 2026-10-22 |
| MTN MoMo (Ghana) | sandbox | `POST /collection/token/` (also disbursement, remittance) + `GET /v1_0/apiuser/<uuid>` | **INVALID AS PROVIDED** — HTTP 401 "invalid subscription key" on all three products and the provisioning read | station log 2026-10-22 |

## The U1 real-flow E2E (the credentials gate — now run)

`scripts/p13/u1-stripe-real-flow-e2e.ts` (committed; credential-gated on
`STRIPE_SECRET_KEY`, exit 2 without it — the honest pre-drop state)
composed the REAL machinery — `createNodeConnectionSessionAuthority`
(node:fs record store) + a REAL AES-256-GCM `ICredentialService`
(node:crypto; the substrate safeStorage-backed service boundary is
documented in the receipt) + `StripeHttpsTransport` on `globalThis.fetch`
+ `createStripeVerificationProbe` in SANDBOX mode — and ran:

- seed → `PROPOSED`; seal the operator's `sk_test_…` key →
  `PENDING_VERIFICATION` (opaque handle; storage-key law
  `payswap.connection.<connectionId>.credential` held);
- the read-only probe (`GET /v1/balance` + `GET /v1/account`) INSIDE the
  credential seal, through the real HTTPS transport → **CONFIRMED**
  (account `acct_1FPs7UAkPdhgtN6I`, ~886 ms for both reads);
- `recordVerificationOutcome` → **ACTIVE** — the ONLY ACTIVE path, on real
  provider evidence.

All nine gates held, including the pinned negative controls: never-ACTIVE
before the probe (N1), INV-25 live-key refusal (N2: a fake `rk_live_…`
key refused by the seal verb), the seal escape-scan throw (N3: a consumer
result carrying the secret THROWS), convergence (N4: re-seed RESUMES the
same connection id), restart record stability (N5).

Receipt (secret-free, machine-scanned):
`docs/productization-evidence/p13-u1-real-flow-RECEIPT-2026-10-22.json`
— run at 2026-10-22T22:33Z, all 9 gates held, final state ACTIVE via
`PROBE_CONFIRMED`.

## Honest boundaries (unchanged laws, updated facts)

- **Sandbox gate: PASSED** (the U1 slice ran against the real Stripe test
  API end-to-end). This certifies the SANDBOX corridor only — it never
  certifies a LIVE corridor (INV-25; a live key remains refused by this
  deployment).
- The Stripe publishable key and webhook secret were delivered but are
  NOT exercised by the U1 probe (which needs only the secret key); webhook
  signature verification requires an endpoint + delivered events — future
  work, honestly open.
- Flutterwave / Paystack / Stellar are verified VALID at the API level
  (read-only), but no PaySwap adapters exist for them in this tree — the
  registry declares exactly one provider (Stripe). Their credentials are
  banked in the station secret store for the future wave that builds
  those adapters.
- MTN MoMo credentials are invalid as provided (401 on every product +
  provisioning read). The operator may re-drop a valid subscription key;
  nothing is simulated.
- The Stellar keypair is a TESTNET keypair (account exists on testnet
  only). No transaction was signed or submitted; the check was read-only.
