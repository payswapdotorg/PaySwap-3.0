# P14 acceptance record — the payment execution kernel, webhook verification and the verified-credentials provider expansion (2026-10-23)

- **Wave**: P14 (registered from the P13 closure record's carried-forward
  frontier; no new GitHub issue — the openings were named in the record).
- **Base**: the P13 closure `c247e58` → registered at `81882f5`.
- **Lanes**: P14-0 (TL architecture gate, `d4f3791`) → P14-A (the
  execution kernel, `d4b806a`) → P14-B (Stripe webhook machinery,
  `9f9c84c`) → P14-C (the Flutterwave + Paystack slices + the MoMo typed
  prerequisite, `e605ec5`) → P14-D (this integration gate).

## The real-flow gates (all run at the integrated tip, this wave)

| Gate | Result | Evidence |
|---|---|---|
| The U1-execution E2E re-run | **GREEN** — mission `task:PAYMENT_MISSION:65162a9f3ae2f356377ea3adda5a6df0` COMPLETED; PaymentIntent `pi_3UTbq5AkPdhgtN6I1D4zwPRk` create+confirm succeeded inside the credential seal through the real transport; read-back verified | `p14-d-a1-execution-rerun-RECEIPT-2026-10-23.json` (the P14-A original: `p14-a1-execution-real-flow-RECEIPT-2026-10-22.json`) |
| The webhook verification receipt (the REAL whsec_ key) | **GREEN** — 8/8 gates on real key material, locally signed: typed extraction, unmapped-honesty, tamper/wrong-key/expired/future/replay refusals, secret-free results | `p14-d-b1-webhook-rerun-RECEIPT-2026-10-23.json` (the P14-B original: `p14-b1-webhook-real-key-RECEIPT-2026-10-23.json`) |
| The Flutterwave probe E2E | **GREEN** — 8/8 harness gates; connection ACTIVE on probe CONFIRMED; 31 currency wallets read (NGN/KES/GHS/USD/EUR/ZAR/… incl. USDC/USDT) via the real transport (~2.7 s) | `p14-c1-flw-paystack-probe-RECEIPT-2026-10-23.json` |
| The Paystack probe E2E | **GREEN** — 8/8 harness gates; connection ACTIVE on probe CONFIRMED; 6 real transaction references read via the real transport (~0.46 s) | same receipt |

## The integrated batteries (at the P14-D tip)

- provider-runtime: **302/302** (25 files) — +66 this wave (22 webhook
  unit, 44 adapter/registry).
- desktop: **244/244** (24 files) — +8 this wave (5 webhook-feed
  integration, 3 registry/mirror).
- Root `tsc -b` across all packages: **clean** (including the desktop
  host build — see the latent defect note below).
- `oxlint` on every changed file: **0 warnings / 0 errors**.
- `architecture:check`: **0 violations** (baseline 0, new 0).

## Defects found and fixed during the wave (the gates did their job)

1. **P14-B, harness-tier**: the first webhook-module draft consumed the
   event id BEFORE the body shape was proven — an unparseable body would
   have burned the single-consumption budget. Corrected law: only a
   COMPLETE verification consumes; every refusal path leaves the id
   re-deliverable (VERIFIED is answered at most once per id).
2. **P14-C, real pre-existing P13-B pin drift (three instances)**: the
   new `provider-registry-mirror` fidelity test caught that the desktop
   pins had (a) singularized the Stripe U3 useCaseRef
   (`marketplace-connected-account` vs the canonical `-accounts`),
   (b) overclaimed `LIVE` execution modes for U2/U3 (the canonical
   declarations are SANDBOX-only — INV-25), and (c) paraphrased the
   U2/U3 missing-operator-configuration items instead of mirroring them
   verbatim. All three fixed to canonical.
3. **P14-C, latent P14-A defect**: `execution-kernel.ts` imported
   `PaymentResultEnvelope` from the port file that does not re-export it
   — the desktop HOST tsc build had not been part of the P14-A/B gates
   (vitest does not typecheck), so it shipped latent. The full root-tsc
   gate now runs at every lane tip; fixed by importing from the owning
   `contracts.js`.

## Evidence tiers (separated honestly)

- **CONTRACT** (scripted fakes, deterministic): the grant-refusal
  negative controls (restricted-key/live-key refusals for Stripe; the
  fail-closed consequential refusals for Flutterwave + Paystack), the
  UNKNOWN-reconcile loop, the reversal path, the webhook
  tamper/expiry/future/wrong-key/replay negatives, the adapter transport
  mappings, the escape-scan laws.
- **SANDBOX** (real provider test-mode APIs, real key material): the U1
  execution E2E (a REAL test-mode PaymentIntent created, confirmed and
  read back), the Flutterwave + Paystack read-only probes (real wallet +
  transaction reads), the webhook machinery on the real whsec_ key
  (locally signed).
- **LIVE**: **refused** (INV-25 unchanged — no live corridor is derived,
  bound or certified anywhere in this wave).

## Honest boundaries (carried forward, none a P14 blocker)

1. **No live webhook delivery is claimed** (verbatim ADR-0008 D4): no
   inbound public endpoint exists in this station; the battery signs
   events locally with real key material. Live provider→station delivery
   is a deployment-tier concern, recorded — never simulated.
2. **The packaged-app kernel wiring stays honestly unwired** until the
   payments plane is renderer-exposed: the consequential path is proven
   at the harness/composition tier (the same P13 discipline). No
   composer, LLM, router or UI element sees the execution authority.
3. **Flutterwave + Paystack are read-only slices**: no execution surface
   exists for them this wave (fail-closed by construction); an execution
   lane for either needs its own ADR-0008-D2-style amendment.
4. **MTN MoMo stays the typed prerequisite**: credentials invalid as
   provided (401 on collection/disbursement/remittance + the
   provisioning read); the registry names the exact missing
   configuration; no adapter, no dead button.
5. **Stellar stays out of scope** for the PSP runtime (onchain rail — a
   future onchain wave).
6. **The operator key-class guidance stands**: the delivered Stripe key
   is a FULL test secret; production should mint restricted keys (the
   D2 derivation already distinguishes the classes).

## Verdict

**P14 is COMPLETE.** All five work orders accepted at exact commits with
evidence; the three real-flow gates green at the integrated tip; the
batteries, typecheck, lint and architecture gates clean; the evidence
tiers separated; the frontier is empty (the carried-forward openings are
the honest boundaries above, awaiting operator direction).
