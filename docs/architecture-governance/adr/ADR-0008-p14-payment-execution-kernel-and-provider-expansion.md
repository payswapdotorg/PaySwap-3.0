# ADR-0008: the payment execution kernel, webhook verification and the provider expansion (P14)

- **Date**: 2026-10-22
- **Status**: accepted (P14-0, the architecture gate)
- **Context**: the P13 closure left the payment execution kernel UNWIRED
  by law (the probe is read-only; no charge/transfer was ever
  dispatched), the webhook secret unexercised, and the Flutterwave /
  Paystack credentials banked with no adapters. The operator's
  credential drop makes all three executable honestly. Gap matrix:
  `spec/productization/P14-0-GAP-MATRIX-2026-10-22.md`.

## D1 — The execution kernel composes BEHIND the existing typed port; the port is not amended

`packages/desktop/src/host/payswap/payments/execution-authority.ts` is
the ONLY consequential door out of the mission runtime (ADR-0007 D7) and
it is already correctly typed: the command carries the consumed
authorization lineage, the compiled intent, the idempotency/correlation
references and the INV-25 mode; the answer is the pinned result envelope
or a typed refusal. P14-A composes the REAL kernel behind it — the
desktop adapter that (1) admits the connection (ACTIVE + the execution
grant), (2) opens the seal through
`ConnectionSessionAuthority.withSealedCredential`, (3) dispatches the
write operation through the real transport, (4) classifies the answer
into the envelope. The port's contract, the mission runtime's registrar
discipline, and the refusal vocabulary are UNCHANGED — `NO_AUTHORITY_WIRED`
remains the honest default for any deployment that does not compose a
kernel. No composer, LLM, router or UI element ever sees the kernel.

## D2 — The grant derivation law (amending the P13-B read-only default, fail-closed)

The P13-B law (`refuseConsequentialStripeGrant` throws on
`CREATE_EXTERNAL_EFFECT` / `CANCEL_OR_REVERSE_EFFECT`) was the honest
default for a READ-ONLY restricted key and stays exactly true for that
key class. P14 adds the derivation:

- A FULL test secret key (`sk_test_…`) bound to a SANDBOX connection may
  derive the SANDBOX execution grant — the write operation classes for
  the payment-intent surface, recorded in the connection scope at
  kernel dispatch (not silently, not from a UI choice).
- A RESTRICTED key (`rk_test_…`) derives ONLY its declared scopes; a
  read-only restricted key NEVER derives an execution grant (the P13-B
  throw remains the enforcement point).
- LIVE keys (`sk_live_…` / `rk_live_…`) are refused by this deployment
  entirely (INV-25 — unchanged; a sandbox verification never certifies a
  live corridor, and this station holds no live credentials).
- The grant check runs INSIDE the kernel, on the SEALED material's key
  class, at dispatch time — never in the renderer, never in the mission
  runtime, never cached across dispatches.

**Operator note (honest)**: the delivered key is a FULL test secret key,
not the restricted key ADR-0007 D1 prefers for production. The SANDBOX
corridor proceeds with it; production deployments should mint a
restricted `rk_` key scoped to the exact write operations. Recorded as
guidance, not a blocker.

## D3 — The Stripe write surface is four additive operations with the INV-04 loop as the design center

`adapters/stripe/https-transport.ts` extends its endpoint map additively
(the two read endpoints are untouched):

| Operation id | Endpoint | Purpose |
|---|---|---|
| `stripe.payment_intent.create` | `POST /v1/payment_intents` | the consequential create (amount, currency, metadata: the mission/correlation refs) |
| `stripe.payment_intent.confirm` | `POST /v1/payment_intents/:id/confirm` | confirmation with the PUBLISHED Stripe test payment-method token (`pm_card_visa` — public test vocabulary, not a secret) |
| `stripe.payment_intent.retrieve` | `GET /v1/payment_intents/:id` | the reconciliation read — the UNKNOWN resolver |
| `stripe.payment_intent.cancel` | `POST /v1/payment_intents/:id/cancel` | the reversal path for the cancel/compensation semantics |

The kernel's UNKNOWN discipline: any timeout / connection-loss /
uninterpretable answer after a potentially-effective dispatch is UNKNOWN
(INV-04) and reconciles by RETRIEVING the intent by id before any
conclusion or retry — no duplicate write, no guessed finality. The
idempotency: Stripe's `Idempotency-Key` header carries the mission
registrar's key; a replay returns the original result (proven in the
battery). Test-mode only: the connection's INV-25 SANDBOX mode binds the
whole corridor; nothing in this wave touches live money and the receipts
say so.

## D4 — Webhook verification is real-key machinery with an honest no-live-delivery boundary

The verification module implements Stripe's pinned scheme: the
`Stripe-Signature` header carries `t=<timestamp>` and
`v1=<hex>`; the signature is HMAC-SHA256 over `"<t>.<body>"` with the
`whsec_` secret; verification requires (1) a fresh `t` within the
pinned tolerance (300 s, Stripe's default), (2) a constant-time `v1`
match, (3) single consumption of the event id (replay protection — a
monotonic consumed-set, persisted with the mission store's durability
law). Verified events extract to the typed payment-intent vocabulary and
feed the mission reconciliation path (the reconciled-attempt law).
The battery signs events LOCALLY with the REAL operator key — the
machinery is verified with real key material, and the record states the
boundary verbatim: no inbound public endpoint exists in this station, so
live provider→station delivery is NOT claimed and never simulated.
Tampered bodies, expired timestamps, wrong keys and replays are negative
controls (each must be refused, typed).

## D5 — The provider expansion follows the P13-B vertical-slice shape; MTN MoMo is a typed prerequisite, Stellar is out of scope

Flutterwave and Paystack each land the five-file slice shape:
declaration (registry entry + typed connection forms), capabilities (the
key-prefix mode law — Flutterwave `FLWSECK_TEST-…` = test; Paystack
`sk_test_`/`sk_live_` exactly mirrors Stripe's), https transport
(injected fetch; api.flutterwave.com / api.paystack.co; Bearer), and the
read-only verification probe (Flutterwave `GET /v3/balances`; Paystack
`GET /transaction` — both verified 200 with the operator keys). The
never-ACTIVE law, the seal pattern and the INV-25 binding apply
identically. MTN MoMo: its credentials are invalid as provided (401 on
collection/disbursement/remittance and the provisioning read), so it is
DECLARED with the typed prerequisite naming the exact missing
configuration (a valid subscription key) — no adapter, no dead button,
nothing unverifiable. Stellar: the keypair is testnet-valid but Stellar
is an onchain rail owned by the onchain plane (`packages/onchain-*`) —
recorded for a future onchain wave, not force-fitted into the PSP
provider runtime.

## D6 — The file-disjoint lane map (the P14-A/B/C unlock)

| Lane | Owns (exclusive) |
|---|---|
| P14-A | `provider-runtime/src/adapters/stripe/payment-execution.ts` (new) + `https-transport.ts` (the endpoint-map extension) + `capabilities.ts` (the D2 grant law); `desktop/src/host/payswap/payments/execution-kernel.ts` (new) + the payments node composition; the execution battery |
| P14-B | `provider-runtime/src/adapters/stripe/webhook-verification.ts` (new) + `webhook-events.ts` (new); `desktop/src/host/payswap/payments/webhook-feed.ts` (new); the webhook battery |
| P14-C | `provider-runtime/src/adapters/flutterwave/` + `adapters/paystack/` (new dirs) + `registry-declaration.ts`; `desktop/src/host/payswap/connections/provider-pins.ts` + `record-store.ts` (the registry views); the adapter batteries |

Disjointness holds: no file appears in two lanes; the shared contracts
need no change (the port, the envelope, the registry vocabulary and the
pins' member-set laws are already pinned; extensions are additive data).

## Consequences

- The kernel, the webhooks and the two new providers can dispatch in
  parallel after this gate; P14-D (TL) integrates, runs the real-flow
  gates (the U1-execution E2E, the webhook receipt, the two probe E2Es)
  and closes the wave with the honest evidence-tier separation.
- The wave stays honest by construction: LIVE is refused everywhere
  (INV-25); webhook live-delivery is not claimed; MoMo is a typed
  prerequisite; Stellar is recorded, not force-fitted.
- The payment-mission runtime's laws are unchanged and un-amended — the
  kernel composes behind the port; the registrar discipline stays
  authoritative.
