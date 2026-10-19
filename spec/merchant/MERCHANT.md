# @payswap/merchant — Lane Specification (P5-W3, lane R3-W3)

Status: DELIVERED (4-commit protocol complete; see docs/merchant-evidence/BASELINE-VERIFICATION-RECORD.md)
Package: `packages/merchant` — `@payswap/merchant` v0.1.0
Work Order: P5-W3 (merchant checkout + Stripe capability integration)
Rebuild lane: R3-W3 (recovery of the two lost worker-side builds; base `c5a4dc79490eae36adb5fe2b06a4340e572442f4`)
Porting source (evidence, not authority): payswap.org @ `8a735bf1639198c43115087a2992555166a9acf9` — packages/merchant-checkout (170 test sites / 13 files) + packages/merchant-crypto (191 test sites / 10 files)

## 1. What this package is

The Stripe-class merchant flow as ONE deterministic, zero-dependency
package: merchant onboarding, crypto acceptance activation, checkout
flows, the wallet-payment path, the payment lifecycle, typed webhooks,
refunds, settlement configuration and the two provider-verified Stripe
settlement paths. It is the merchant lane the ACCEPTED R3-W1
route-compiler seam awaits (`MERCHANT_SETTLEMENT_AUTHORITY = "P5-W3"`).

## 2. The five load-bearing laws

1. **Money movement is DELEGATED, never owned.** The wallet-payment
   path is a TYPED INJECTION PORT with a HANDOFF-ONLY exit
   (`src/pins/wallet-payment.ts`): the port declares exactly ONE
   method (`handoff`); there is no execute/settle/confirm/broadcast/
   sign member anywhere, so a local parallel payment engine is
   structurally unrepresentable. The handoff request carries the
   PINNED `SettlementInstructionId` typed reference (the protocol
   lane owns instruction semantics; this package only references
   them). The money lifecycle itself is PINNED, never owned
   (`src/pins/protocol.ts` pins the canonical settlement-attempt
   machine: SUCCEEDED/FAILED terminal; OUTCOME_UNKNOWN exits ONLY
   through reconciliation).
2. **NEVER infer success from submission.** The intent settles ONLY
   from the attempt's own state; a SUBMITTED handoff receipt maps to
   submission EVIDENCE ONLY (the no-success-inference law is typed in
   `handoffReceiptObservation`). Definitive outcomes are
   evidence-mandatory. `SyntheticStripeBalanceError` fires on any
   Stripe balance effect without provider evidence — a synthetic
   balance effect is unconstructible. NO Stripe network call exists
   in this package (`src/stripe-paths.ts` builds typed request
   DESCRIPTORS over the pinned PSP surface; the provider runtime
   executes them).
3. **UNKNOWN is first-class; reconciliation is the only ambiguity
   exit; terminal states are monotonic.** Every local work-item
   machine (onboarding, intent, attempt, session, refund) is built on
   the local deterministic kernel (`src/kernel.ts`) with explicit
   injected instants — no ambient clock, no randomness, no I/O.
4. **The secret boundary is enforced by construction (INV-19).**
   `src/secrets.ts` re-declares the accepted onchain-security kernel
   law byte-identically (raw 32-byte key shape `/^(0x)?[0-9a-fA-F]{64}$/`,
   BIP-39 12/24-word shape, forbidden key names, derived-identifier
   exemptions) and EXTENDS it with the Stripe sk_/rk_/whsec_ key
   shapes. NO over-broad bearer regex exists anywhere; public
   addresses and publishable keys are never flagged. Every
   agent-facing artifact is scanned at construction.
5. **Zero sibling imports — the leaf-in-flight law.** Every
   cross-lane contract shape is a LOCAL STRUCTURAL PIN
   (`src/pins/*.ts`, each naming its authority): protocol
   (SettlementInstructionId, money, the pinned attempt lifecycle),
   capability (execution modes — CREDITED to the capability lane,
   byte-identical, INV-15: no priority), the payment plane (method
   kinds, acceptance, destinations, recourse, material terms), the
   onchain kernel (ChainRef/AssetIdentity shape laws), the
   provider-state envelope (INV-14), the ACCEPTED R3-W1
   route-compiler seam (modes, the P5-W3 marker, the verbatim
   honest-unavailability notice), and the Stripe PSP surface
   (byte-verified vs the old rails/adapters evidence: API base,
   version, 12 resource paths, the 7-row PaymentIntent status
   mapping, the `payswap:`-namespaced idempotency derivation).

## 3. Module families

- **Kernel** — `kernel.ts` (bigint-aware `stableStringify` canonical
  digest + FNV-1a 64 + deepFreeze; the deterministic state machine),
  `errors.ts` (21-class typed taxonomy), `identifiers.ts` (the
  branded id family + the pinned SettlementInstructionId validator).
- **Crypto family** — `assets.ts` (exact bigint minor-unit amounts),
  `quotes.ts` (exact-ratio quotes, INV-2 cross-multiplication,
  expiry AT boundary), `acceptance-policy.ts` +
  `acceptance-evaluate.ts` (the narrowing policy + the two-plane
  matchers), `intent.ts`, `attempt.ts` + `attempt-outcomes.ts`,
  `session.ts` (the work-item machines).
- **Settlement family** — `settlement-routes.ts` +
  `settlement-confirmations.ts` (the two route families with
  anti-conflation guards; provider-verified confirmations),
  `capabilities.ts` (the two capability descriptors over the pinned
  execution-mode vocabulary), `settlement-config.ts` (configuration
  as typed data; the Stripe connection as a lossless provider-state
  envelope; the DOCUMENTED mode↔route-family mapping onto the R3-W1
  seam), `settlement-paths.ts` (decision-time selection with the
  mandated notice on every fallback; settlement execution),
  `stripe-paths.ts` (typed, byte-verified, NO network).
- **Merchant journey** — `onboarding.ts` (fiat-denominated; never
  implies rail connectivity — `ConnectivityImpliedError`),
  `activation.ts` (a narrowing view, immutable deactivation history),
  `checkout-support.ts` (rail bindings + the human-readable payment
  summary), `checkout.ts` (quotes-as-observations, exact display
  amounts), `authorization.ts` (content-addressed customer approval),
  `wallet-payment.ts` (the port guard + the typed handoff).
- **Lifecycle plane** — `lifecycle.ts` + `lifecycle-outcomes.ts` (the
  composite attempt with MANDATORY authorization lineage),
  `webhooks.ts` (idempotent inbox; evidence, never authority),
  `refunds.ts` + `refunds-flow.ts` (honest NOT_SUPPORTED; immutable
  originals), `api-contracts.ts` + `api-dispatch.ts` (the typed API
  surface walking the REAL functions), `evidence.ts` (deterministic,
  regenerable journey evidence).

## 4. Battery (hermetic)

```
cd packages/merchant && rm -rf node_modules package-lock.json
npm install --no-workspaces    # exit 0
npx tsc --noEmit               # 0 diagnostics
npx vitest run                 # 25 files / 353 tests, ALL PASS, ~6s, fully offline
```

## 5. Known limitations (honest, recorded — never hidden)

1. **The chain-vocabulary seam.** The shared fixture corpus splits
   the merchant `ChainId` vocabulary ("chain.eth-mainnet") from the
   kernel `ChainRef` vocabulary ("eth:mainnet"). The composite submit
   law (`authorization.chainRef === quote.chainId`) is therefore
   exercised over chain-aligned fixture twins — exactly how the old
   corpus bound its two vocabularies with one `CHAIN_REF` string. A
   future lane iteration may unify the shared fixtures the same way.
2. **The dispatch resolve path** (fixed this lane, see the evidence
   record): `payment/attempt.resolve` now leaves an OUTCOME_UNKNOWN
   intent through `resolveIntentUnknown`; the defect was latent in the
   old repo's api.ts as well.
3. The capability descriptors are LOCAL structural pins (SUBSET-typed)
   of the capability lane's full `CapabilityDefinition`; the TL wires
   the authoritative shapes at integration (the leaf-in-flight law —
   same as the accepted R3-W1/R3-W2 siblings).

## 6. Ownership + write surface

This package owns `packages/merchant/**`, `spec/merchant/**`,
`docs/merchant-evidence/**` — nothing else. Zero runtime
dependencies; devDependencies exactly `typescript` + `vitest`; every
file ≤ 400 lines; fully offline deterministic tests only.
