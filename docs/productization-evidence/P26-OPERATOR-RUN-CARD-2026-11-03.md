# P26 OPERATOR RUN CARD — the real Stripe Sandbox tier (2026-11-03)

**The standing operator action, made runnable.** No Stripe key exists at any operator store at P26 registration (gap-matrix D-6 — the P14-era key died with the prior station). The harness below is committed, key-ready, and follows the receipt law. **Nothing is simulated: without the key it exits 2 and records nothing.**

## What you supply

1. A **Stripe Sandbox (test-mode) API key** for the account you want the journeys run against. A **restricted key** (`rk_test_…`) is preferred (the P13 key-class guidance; grant at minimum `Account: Read`, `Customers: Read`, `Products: Read` — plus `Products: Write` for the write journey). A full test secret (`sk_test_…`) also works. **Live keys (`sk_live_`/`rk_live_`) are refused at every edge (INV-25).**
2. Whether the **write journey** may run (it creates a product, reads it back, and archives it — all in test mode).

## Where the key goes (the station secret store — never chat, never the repo)

```bash
# /home/z/my-project/secrets/payment-providers.env   (mode 600, gitignored — the P13-CREDENTIAL-INVENTORY law)
export STRIPE_SANDBOX_SECRET_KEY="rk_test_…"
export STRIPE_SANDBOX_WRITES_ENABLED=1   # only if the write journey may run
```

## The run (one command, four gates)

```bash
cd /home/z/payswap-3.0
source /home/z/my-project/secrets/payment-providers.env
A1_RECEIPT_PATH=docs/productization-evidence/p26-b-a1-catalogue-real-sandbox-RECEIPT-<date>.json \
  npx tsx scripts/p26/a1-catalogue-real-sandbox-journey.ts
```

Exit `0` = every non-skipped gate GREEN · exit `1` = a gate failed (the receipt names it) · exit `2` = no key (nothing ran, nothing recorded).

## The gates

| Gate | What it proves | Tier |
| --- | --- | --- |
| **G1 READ_JOURNEY** | `GetAccount` + `GetCustomers` + `GetProducts` over the REAL catalogue transport — genuine reads against the real account (livemode=false asserted by the receipt's detail) | REAL_SANDBOX |
| **G2 VERSION_AB** | The same account read returned 200 under **both** wire versions (`2025-08-27.basil` — the per-connection default — and `2026-09-30.endive` — the catalogue pin): the P26-C migration's real-Sandbox evidence path | REAL_SANDBOX |
| **G3 WRITE_JOURNEY** | The two-phase write over the real transport: create product → derived read-back (`GetProductsId`) → archive — **double-gated** on `STRIPE_SANDBOX_WRITES_ENABLED=1`; without it the gate records SKIPPED honestly | REAL_SANDBOX (opt-in) |
| **G4 REAUTH_PROBE_LAW** | The re-authentication flow's probe mechanics against the real account (ADR-0018 D1's same-account law exercised on the live wire; the full proof-machinery battery is the desktop tier) | REAL_SANDBOX |

## The receipt law (what you get back)

The receipt JSON is **machine-scanned**: if it would contain the key in any form, the harness refuses to emit it. It carries the gates with their results, the run window, and honest notes naming the credential source (the station secret store) — never the credential. Commit the receipt as `docs/productization-evidence/p26-b-a1-catalogue-real-sandbox-RECEIPT-<date>.json`; the P26 acceptance record cites it.

## The other real tiers (honest, unchanged)

- **The live substrate runtime** (a real conversational journey over a live workspace agent runtime) — the composition-tier proof is `agent-conversation-plane.test.ts`; the live tier remains the standing operator action.
- **Electron CDP receipts** (the p22/p23 pattern) — the operator's desktop verification pass.
- **The webhook journey** (`STRIPE_WEBHOOK_SECRET`, the P14 b1 pattern) — extendable into `scripts/p26/` on demand.
