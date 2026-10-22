# P13 closure record — the credentials gate satisfied (2026-10-22)

- **Amends**: `P13-D-ACCEPTANCE-RECORD-2026-10-22.md` — its LIVE tier
  ("NONE — the credentials law") and its open-state clause ("P13 REMAINS
  OPEN per the work-order law").
- **Trigger**: the operator test-credential drop (inventory:
  `P13-CREDENTIAL-INVENTORY-2026-10-22.md`).
- **The gate**: P13-D's work-order law — "Keep P13 open if account
  credentials or a genuinely live test is unavailable." Both conditions
  are now satisfied: credentials exist in the station secret store, and
  the genuinely-live test RAN GREEN.

## The LIVE tier, updated

| Item | Before (28a5ece) | Now |
|---|---|---|
| U1 real-flow E2E (own-store test-mode key → read-only probe → ACTIVE) | operator-gated, NOT run | **RUN AND GREEN** — all 9 harness gates held; ACTIVE reached via `PROBE_CONFIRMED` on account `acct_1FPs7UAkPdhgtN6I` through the real HTTPS transport inside the credential seal |
| Sandbox gate | NOT passed | **PASSED** (the U1 slice against the real Stripe test API; SANDBOX corridor only — INV-25 live-key refusal verified live in the same run) |
| Simulated evidence | none | still none — the run used the real provider, the real transport, the real seal; the only harness substitution (the AES-256-GCM credential service standing in for the substrate safeStorage-backed service) is real authenticated encryption and is documented in the receipt |

Evidence: `docs/productization-evidence/p13-u1-real-flow-RECEIPT-2026-10-22.json`
(harness `scripts/p13/u1-stripe-real-flow-e2e.ts`, run 2026-10-22T22:33Z;
batteries at the closure commit: provider-runtime 236/236, desktop
220/220, architecture:check 0 violations).

## State correction (a real defect, fixed in the same closure)

The P13-A/B/C closure commit (e76bae5) claimed the dependency-graph
statuses were updated, but the committed diff only removed a trailing
newline — `spec/dependency/P13-DEPENDENCY-GRAPH.json` still showed
P13-A/B/C QUEUED and P13-D BLOCKED, contradicting the canonical
current-state (all COMPLETE). This closure sets the graph to the true
accepted state with evidence pointers.

## Wave disposition

**P13 (Issue #3) is CLOSED** — all five work orders (P13-0/A/B/C/D)
COMPLETE; the credentials-gated condition that held the wave open is
satisfied by the live U1 run above. Carried forward honestly for future
waves (NOT P13 blockers):

- the payment execution kernel composition (the typed UNWIRED authority
  port — no financial dispatch happened in this run; the probe is
  read-only by construction);
- voice remains declared-unsupported (never simulated);
- the Stripe publishable key/webhook secret and the Flutterwave /
  Paystack / Stellar credential sets are banked and API-verified
  (read-only) but have no adapters in this tree yet; MTN MoMo
  credentials are invalid as provided (401) — the operator may re-drop.
