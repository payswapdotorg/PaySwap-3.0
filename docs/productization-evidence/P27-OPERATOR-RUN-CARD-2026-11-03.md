# P27 OPERATOR RUN CARD (2026-11-03)

**Wave:** P27 — Stripe U2/U3, Connect, Global Payouts, Paystack/Africa, and the PaySwap node network.  
**Law:** the code makes every flow READY; only the operator can register, approve or supply external financial products and credentials. **No credentials in issues, PRs, chat, fixtures, source, CI logs or evidence bundles** (INV-19). Secrets land ONLY in the station secret store: `/home/z/my-project/secrets/payment-providers.env` (mode 600, gitignored, never committed, never echoed). Repository work never configures an external account by itself.

---

## A. The standing Stripe Sandbox re-supply (carried from P26-B / D-6 — still the standing action)

Nothing has run the real-Sandbox harnesses yet; they remain key-ready and exit-2 without credentials.

```bash
cd /home/z/PaySwap-3.0
source /home/z/my-project/secrets/payment-providers.env
A1_RECEIPT_PATH=docs/productization-evidence/p26-b-a1-catalogue-real-sandbox-RECEIPT-<date>.json \
  npx tsx scripts/p26/a1-catalogue-real-sandbox-journey.ts
```

| Env var | Purpose |
|---|---|
| `STRIPE_SANDBOX_SECRET_KEY` | `rk_test_…` preferred (minimum `Account: Read`, `Customers: Read`, `Products: Read`; + `Products: Write` for the write journey) |
| `STRIPE_SANDBOX_WRITES_ENABLED=1` | the double-gate for the two-phase write journey |
| `STRIPE_WEBHOOK_SECRET` | optional today (the P14-b1 webhook-journey extension) |

Exit codes: `0` all non-skipped gates GREEN · `1` any RED · `2` credentials absent (**never a silent pass**). Receipts are secret-scanned before emit and land in `docs/productization-evidence/`.

## B. Stripe U2 (existing-account delegated OAuth) + U3 (Connect platform) — P27-A

1. Register/verify the **Stripe platform application** (Stripe Dashboard → Connect settings): obtain the OAuth `client_id`; create the `client_secret`.
2. Decide and approve with Stripe the **account model(s), capabilities, charge model (direct / destination / separate charges and transfers), platform country and liability model** for the actual PaySwap business model — the ADR-0020 D4/U3 lane implements against the operator's written decision.
3. Register the exact **redirect/callback URLs** and a publicly reachable **webhook endpoint** for connected-account events; create the **signing secret(s)**.
4. Supply through the secret channel:
   - `STRIPE_PLATFORM_CLIENT_ID`, `STRIPE_PLATFORM_CLIENT_SECRET`
   - `STRIPE_CONNECT_WEBHOOK_SECRET` (+ the registered endpoint URL in the lane's configuration surface)
5. Confirm Stripe's approval of PaySwap's **disclosed actual business model**. Any personal-remittance/P2P usage needs explicit product/provider and legal approval — **ordinary Payment Links do not supply it** (INV-30).

Sandbox first; **LIVE remains refused under INV-25** — live activation is a separate operator order completing ADR-0019's bundle.

## C. Stripe Global Payouts — P27-B

1. Confirm the origin business is in a **GA country (published GA list: United Kingdom, United States as of 2026-11-03)** or obtain **written private-preview access** for a specifically listed market.
2. Activate **Treasury** (Global Payouts requires it), the financial account, and the Global Payouts entitlement; fund the financial account.
3. Obtain/confirm the **licences and permissions Stripe requires for the true business activity** (fintech P2P is a licensed-product context only).
4. Obtain the **current origin/destination/method matrix in writing** — including the Ghana corridor status (today's public roadmap labels Ghana GHS/SWIFT **"H2 27"**; there is no confirmed Ghana stablecoin-wallet payout rail — see the capability matrix §2 K1/K2).
5. Supply through the secret channel: the payouts-slice credential per the lane's landed run-card extension (entitled test-mode key; never live).

Absent any of these, the Global-Payouts slice stays honestly unavailable — **no aliasing of ordinary payouts, Connect transfers or PaymentIntents** (ADR-0020 D4).

## D. Paystack Africa — P27-C

1. Connect **each participating business's own Paystack business account** (per country: Ghana, Nigeria, South Africa, Kenya as entitled); enable the actual payment/transfer products for that account and country.
2. Supply distinct **Sandbox keys and webhook secrets** through the secret channel: `PAYSTACK_SECRET_KEY_<BUSINESS>` naming per the lane's landed configuration surface.
3. Configure **transfer OTP/approval requirements explicitly** on the account.
4. Fresh credentials only — previous P22/P26-era records are not a substitute for current station credentials.

The lane re-verifies every country/method/recipient-type fact (ghipss/mobile_money/nuban/basa/kepss, the Bank-of-Ghana exclusion, MoMo transfer markets) against **live docs and the actual account's API** before encoding (capability matrix §2 K3/K4 — the docs were unreachable from the P27-0 station).

## E. Multi-node network — P27-D (operator-gated at the seam)

No external registration is required to build the enrollment/attestation/offer machinery (in-repo contract tier). Operating a real second node requires: an independently provisioned PaySwap station, its own provider accounts, its accountable legal principal's attestation, and signed capability offers. **A node that takes custody or transmits funds on behalf of others must present its licence/programme evidence** (ADR-0020 D8) before any custody-bearing leg is eligible.

## F. What P27 will never do without a further operator order

- Enable LIVE anywhere (INV-25; ADR-0019's activation bundle is the named prerequisite set).
- Treat a test balance, quote, liquidity estimate, pending status or simulated leg as settled funds.
- Represent a Payment Link, Connect badge or marketed "160+ markets" headline as account entitlement.
- Enable a P2P/remittance corridor without licences + explicit provider approval.

## G. Receipt and evidence law (unchanged)

Every real run produces a machine-scanned, secret-free receipt under `docs/productization-evidence/`; the harness family refuses to emit on any leak; fixture receipts are never promoted; every operator-gated tier that did not run is recorded as the standing operator action in the acceptance record — **never a silent pass**.
