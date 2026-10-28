# P21 ACCEPTANCE RECORD — 2026-10-28

The cross-provider payment journey wave (the operator's P20-order
journey: Flutterwave-only sender → Stripe-only merchant), registered at
453e280 (P21-0; ADR-0014), closed at 2026-10-28T15:59:43Z.

## The work orders

- **P21-0** (TL, 453e280): the gap matrix + ADR-0014 (D1–D12) + the
  canonical work orders + the graph + the current-state registration.
- **P21-A** (worker, c2047fe; accepted at aea4965): the provider-evidence
  lane — in-app connection activation (FLW + Paystack key submits +
  connectionRunVerificationProbe host-side INSIDE the seal over the REAL
  transports), the connection→capability bridge (INV-13
  machine-enforced), the TEST_DATA merchant directory, the lane-aware
  REAL Stripe kernel (SANDBOX-only behind the lane resolver +
  authorization gate; the unwired authority stays the default), the
  scripts/p21 rail-evidence harnesses.
- **P21-C** (worker, 2bc3eca; accepted at aea4965): the
  counterfactual/opportunity lane — the conditional opportunity
  composition, the wait re-check evaluator, the STALE_OBSERVATION
  incident kind.
- **P21-B** (worker, 557e3a1; accepted at 2083cf6): the journey lane —
  the composer↔mission binding, the stage-progress projection + panel,
  the model/difficulty controls, the wait controls, the connections
  activation UI.
- **P21-D** (TL): the closure wave —
  - a51a30c: the rail-evidence receipt re-run with the fresh operator
    credentials — 3 probes CONFIRMED over real HTTPS + the Stripe
    execution subtest (pi_3UVD6oAkPdhgtN6I1Rg4EVO dispatched, read-back
    succeeded, 1331ms); machine-scanned secret-free.
  - 1f17c62: the full-journey bridge battery — the operator's ordered
    journey end-to-end over the REAL channel + REAL engines + REAL host
    runtime (scripted transport, deterministic replay).
  - 3f4c609: the chain-from-bridge composition (149-A), the
    task-completion projection (149-B), the model-catalog substrate seam
    (149-D), the web-tier E2E journey J24 + the journey-suite
    reconciliation (149-C) — J1–J19 retired REGISTERED, J20–J23
    re-scoped, the zero-height collapse defect caught + fixed.
  - 6d926d5 (151-a): the product connection-plane composition —
    composeNodeConnectionPlane at the host registration root (the
    reviewer gate ①: the model catalog + the provider-rail snapshots
    reach the product composition root; fail-closed default preserved;
    restart-stable).
  - 3d5b120 (151-b): the final-stage verification contract — Gap C
    closed: a confirmed operation with authoritative read-back completes
    the final stage through the typed persisted ATTEMPT_VERIFIED
    verification record; an ambiguous outcome stays UNKNOWN and requires
    the actual reconciliation path; no faked RECONCILED events; the
    stage-10 projection COMPLETED from RECONCILED || ATTEMPT_VERIFIED.
  - c9cf05e (152): the Electron CDP desktop journey — the REAL app
    driven end-to-end (9/9 PASS, screenshots, machine-scanned
    secret-free receipt, persistence SURVIVED). The E2E law caught three
    real product defects — the registration call-shape drop (the model
    catalog + the connection plane silently dropped on the seam object),
    the composition-root boot order (the shared composer controller
    captured unbound seams), the route-planning cache freshness (a
    post-boot mission never entered the cache) — each fixed + pinned by
    a test.

## The evidence tiers

- **HERMETIC** (in-process, deterministic): desktop 51f/436t ·
  payswap-app 54f/566t · surface 19f/234t — green at the tip, re-run
  after every CDP-discovered fix; the scoped tsc gates
  (host/test-check/mirror-check) 0; the app tsc = the 33 pre-existing
  exactly; oxlint 0/0 on the lane files; architecture:check 0/0/0.
- **WEB E2E** (the REAL substrate HTTP server over the built dist): the
  J24 task-tier journey + the honest unbound notes; tier-1 (J24 + the
  manifest enforcement) 7 tests; tier-2 (the J20–J23 composer laws) 8
  tests.
- **DESKTOP E2E** (the REAL Electron app over file://, CDP 9229 under
  Xvfb, isolated userData): the 9-step journey — the honest capability
  note, the REAL model-catalog member (0 options honestly), the
  nine-field ask loop 9/9, the typed BLOCKED preview with all six gate
  reasons VERBATIM, the derived stage checklist + the honest no-intent
  route note, the persisted mission store, the quit/relaunch persistence
  (task + conversation + DRAFT mission SURVIVED). Receipt:
  docs/productization-evidence/p21-d-cdp-desktop-journey-RECEIPT-2026-10-28.json
  (secret-scan CLEAN; 6 screenshots).
- **REAL-DISPATCH (test-mode, operator credentials)**: the a51a30c
  receipt — 3 provider probes CONFIRMED over real HTTPS + the Stripe
  execution subtest (a REAL test-mode PaymentIntent dispatched +
  authoritatively read back). The credentials were destroyed by the
  station resets after the receipt was accepted; the receipt remains
  the live evidence (re-running with fresh operator keys is a
  P22-ready action).
- **LIVE**: **refused** — no live corridor is derived, bound or
  certified anywhere in this wave; the six truth facts stay
  machine-enforced (catalogue≠connected, connected≠eligible,
  FLW-probe≠send, Stripe-test-PM≠FLW-funded, scripted≠provider-evidence,
  acceptance≠settlement).

## Honest boundaries (carried forward, none a P21 blocker)

1. **The live-provider execution legs stay operator-gated**: the station
   payment-providers env was destroyed by the resets; the
   zero-credential CDP journey proves the honest typed outcomes (BLOCKED
   with every gate reason), and the real-dispatch tier is covered by the
   accepted a51a30c receipt. No fabricated route, no synthetic funding
   claim.
2. **The FLW→Stripe intent's honest outcome is NO_ROUTE** (ADR-0014 D7)
   — no FLW send operation exists and none is manufactured; the revise
   path exercises the complete §7 path over the REAL Stripe kernel
   (SANDBOX-only, funding facts honestly TEST_DATA).
3. **P22** (the operator's order): the provider-combination redo
   (Stellar + Paystack; GHS→USDC(Stellar)→KES) — no Stellar adapter
   exists today; the Stellar test keypair was held
   station-secret-store-only.
4. **The CLI-agent skill/MCP candidate, the automatic evidence feeds,
   the protocol-plane evidence bridge** — the P20-recorded
   carry-forwards, unchanged.
5. **docs/customer-journeys/JOURNEY-ACCEPTANCE-RECORD.md** still
   carries the pre-P15-strip verdict matrix; the reconciled truth lives
   in JOURNEY-MAP §5 (manifest-enforced retirement). A docs-only
   refresh is carried forward.
6. **The FEATURE-MAP companion-test claim was doc drift**: the
   `feature-map.test.ts` named in FEATURE-MAP.md since P12-C was never
   authored (a promise without an artifact; the P21-D note at 3f4c609
   accidentally reaffirmed it). Caught at this closure and corrected in
   the FEATURE-MAP preamble; authoring the promised parser test is
   carried forward (P22).

## Verdict

**P21 is COMPLETE.** All five work orders accepted at exact commits with
evidence; the journey proven end-to-end at both user-facing tiers (the
web J24 tier + the Electron CDP desktop tier) with the honest typed
outcomes; the real-dispatch tier evidenced by the accepted
operator-credential receipt; the batteries, the scoped typecheck gates,
lint and the architecture gate clean at the tip; the evidence tiers
separated; the frontier is P22.
