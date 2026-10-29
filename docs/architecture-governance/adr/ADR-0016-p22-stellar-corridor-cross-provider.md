# ADR-0016: P22 — the Stellar corridor and the cross-provider journey redo

- **Status:** ACCEPTED (TL-gated, 2026-10-29)
- **Scope:** `@payswap/onchain-domain` + `@payswap/onchain-adapters` + `@payswap/onchain-extensions` + `@payswap/onchain-security` (the STELLAR family, the `stellar:testnet` plane, the deploy vocabulary, the issuer-scoped asset); `@payswap/route-compiler` + `@payswap/route-planning` + `@payswap/opportunities` + `@payswap/financial-certification` + `@payswap/merchant` (the cross-provider corridor shape, the location-pair law growth, the ONCHAIN-rail vocabulary, the leg laws); `@payswap/provider-runtime` (the Paystack execution lane amendment); the desktop host (the Stellar seal/probe/bridge/kernel, the per-provider lane registry, the composite dispatch); `@payswap/app` + `@payswap/surface` + the renderer composition roots (the corridor journey surfaces, the composite-act UI); the E2E law (the CDP corridor journey, the browser J-rows, the live-tier operator gate)
- **Resolves:** the operator's standing follow-on order (recorded at P21-0 §0): *"when you're done redo the same work with any combination of the following providers"* — a Stellar testnet wallet with contract-deployment, the GHS→USDC(Stellar)→KES corridor mandate, over the same Stripe/Flutterwave/Paystack test credentials — PLUS the honest station fact that the eleventh reset destroyed those credentials (the live tier is operator-gated; this ADR registers the gate, it does not remove it)
- **Law hook:** INVARIANTS.md INV-04/07/13/19/20/25 (typed envelopes; observation-grounded; structural mirrors; the contract-call escape hatch; mode honesty); AGENTS.md financial boundary + financial truth; ADR-0008 D2/D5 (the kernel grant law; Stellar belongs to the onchain plane); ADR-0009 (the routine laws); ADR-0014 D7/D9/D11 (the no-route truth; the labeling law; the secret law); ADR-0015 D7 (the no-bypass discipline this wave extends)

## Context

P23 closed the repair-discovery wave with the honest record that the cross-provider
fiat pair remains uncompilable — and the repair catalogue already carries the platform
work item `platform:cross-provider-route-shape` ("a governance-level vocabulary change,
never manufactured this wave"). The operator's P22 order is precisely that change's
mandate: the journey law over any combination of Stellar/Stripe/Flutterwave/Paystack,
with the GHS→USDC(Stellar)→KES corridor and a Stellar testnet wallet with
contract-deployment.

The P22-0 survey (two Explore lanes at base `7e19526`) establishes the facts this ADR
decides against:

1. **The Stellar plane does not exist.** The chain-family vocabulary is frozen at seven
   members with no STELLAR (onchain-domain/src/family.ts:28–36); the environment
   registry has no `stellar:testnet` and fails closed (onchain-adapters/src/environment.ts:55–84);
   'stellar' appears in exactly four app-lane files as coverage labels/fixtures. ADR-0008
   D5 already assigned Stellar to the onchain plane — "not force-fitted into the PSP
   provider runtime."
2. **The corridor is structurally uncompilable.** The compiler dispatches on observed
   location-pair kinds and a fiat origin never reaches a fiat destination
   (route-compiler/src/compiler.ts:121–130); no frozen shape composes
   fiat→chain→fiat (shapes.ts:27–37). The multi-hop surface that DOES exist is the P23
   hypothesis tier — advisory, never-executable, shape-citing only.
3. **Contract deployment has no vocabulary.** The onchain write kinds operate on EXISTING
   contracts (operations.ts:31–38); the nine-stage lifecycle has no deploy stage
   (contract/stages.ts:50–60); the smart-contract surface describes already-deployed
   contracts (pins-smart-contract.ts:99–119).
4. **The execution matrix is Stripe-complete, FLW/Paystack read-only, Stellar-absent.**
   Paystack's consequential grant THROWS by construction and its own code names the
   amendment path ("when a Paystack execution lane is ordered it will need its own ADR
   amendment like ADR-0008 D2" — paystack/capabilities.ts:132–139). The lane composition
   hardcodes `providerId === "stripe"` (execution-lane-composition.ts:117–121). The
   capability bridge silently drops any provider outside {stripe, flutterwave, paystack}
   (capability-bridge.ts:220).
5. **The dispatch law is single-leg.** One command = one `connectionRef`
   (execution-authority.ts:65); the authorization artifact is single-use, 600s,
   preview+digest-bound (authorization-gate.ts:34–47). A three-leg corridor needs a
   composite act or fragmented per-leg missions.
6. **The credentials are gone.** The eleventh reset destroyed
   `secrets/payment-providers.env`; the live tiers (Paystack/FLW probes, Stripe sandbox,
   the REAL Stellar testnet operations) are blocked on operator re-supply.

## Decision

### D1 — the wave and the honest scope reading

P22 registers as the cross-provider journey redo per the operator's order. "Any
combination of the providers" means: the journey law must hold over any combination the
providers' REAL capabilities ground — where a provider is read-only by its own nature
(Flutterwave: transfers terminate at bank/MOMO, ADR-0014 D7), the journey surfaces that
honestly (typed exclusions + repair cards, the P23 machinery) rather than manufacturing a
route. The corridor mandate GHS→USDC(Stellar)→KES is the wave's named deliverable: the
three-leg plan compiles, presents, authorizes and (on the tier available) executes. P22
does not redefine P23's closed surfaces; it DELIVERS the platform work item
`platform:cross-provider-route-shape` the catalogue already carries.

### D2 — the Stellar plane lands on the onchain chain (the family + the environment)

The `CHAIN_FAMILIES` vocabulary grows one member: `STELLAR`, with its semantics table
entry (account-based, finality model per Stellar's 3-second consensus-class, reorg risk
NONE-class — the lane pins the exact semantics values with the battery). The environment
registry grows exactly one entry: `stellar:testnet` (class TESTNET). `stellar:pubnet` is
deliberately NOT registered — a pubnet wave is a future operator order; the registry stays
minimal and honest. The Stellar family adapter implements the `ChainFamilyAdapter`
contract over Horizon (REST — the injected-`fetch` seam, no SDK): the observe stage
(chain head, account, asset positions) at minimum, plus the write path D4/D5 requires.
StrKey address shapes (`G…` accounts, `S…` secrets, `C…` contracts) land as a Stellar
family extension in `onchain-extensions` (the EVM/SOLANA/UTXO precedent). Stellar is
NEVER added to `PAYSWAP_PROBE_PROVIDER_IDS` or the PSP bridge allow-list — the corridor
chain derives from the onchain plane's own four-layer hierarchy (ADR-0008 D5 preserved).

### D3 — the issuer-scoped asset identity

The Stellar family extension carries the issuer-scoped asset shape: an `AssetDefinition`
on a STELLAR-family chain MAY carry `familyExtension` with the issuer account (`G…`) and
the asset code; the canonical assetId disambiguates issuers
(`stellar:testnet/asset:USDC:<issuerAccount>` when the extension is present). The
`declaredPeg` stays descriptive, never authorization. Two issuers of the same code are two
assets — the collision the current shape cannot express is closed. The corridor's USDC is
declared this way with its testnet issuer recorded as evidence.

### D4 — the contract-deployment vocabulary (the order's mandate)

The onchain operation vocabulary grows one kind: `onchain.contract_deploy` (effect class:
its own `DECLARED_BY_CERTIFIED_METHOD`-analog — a deployment is consequential, INV-20's
discipline extends to it). The adapter lifecycle grows the deploy path as an explicitly
scoped sequence: `prepare (the wasm/contract artifact hash) → authorize (the grant law) →
broadcast (the deploy transaction) → observeResult (the contract id) → evidence (the
deployment record: tx hash, contract id, source hash, bytecode hash)`. The
`SmartContractExtensionPin` becomes the DECLARATION surface for what a deployment produced
(the pin's existing laws — declaration completeness, authorities — apply unchanged). The
Stellar adapter implements deploy for Soroban contract upload on `stellar:testnet`; the
classic-asset issuance path (an issuing `G…` account + trustline) is ALSO in scope as the
asset vehicle — the lane's acceptance record names which vehicle the corridor uses, both
are honest on testnet, neither is fabricated.

### D5 — the cross-provider corridor shape (delivering the platform work item)

The frozen route-shape vocabulary grows one shape: `cross-provider-corridor` with the leg
sequence `FIAT_PSP_COLLECT → PSP_STABLECOIN_ISSUANCE → ONCHAIN_TRANSFER → OFF_RAMP_PAYOUT`
(four legs — the mixed-dex-offramp four-leg precedent). The location-pair law grows
EXACTLY ONE pair: `PROVIDER_ACCOUNT → BANK_INSTRUMENT`, admitted ONLY through this shape
AND ONLY when an ONCHAIN position is observed in the middle (the chain hop is grounded in
the onchain plane's observations — never a fabricated middle). The existing nine shapes
stay byte-identical (the byte-compat gate: every existing shape's compilation over the
P23 fixture worlds is byte-identical before/after this wave). The P21 honest no-route law
(ADR-0014 D7) is PRESERVED: without the observed middle, the fiat pair still compiles
NOTHING and the exclusion surfaces with the repair cards. The P23 hypothesis tier is
PRESERVED unchanged: hypotheses never compile; the corridor is a NEW compiled surface
grounded in NEW observations, never a hypothesis promotion.

### D6 — the composite authorization act (one plan, N legs)

The mission demand stays SINGLE (one origin, one destination, one arrival currency — the
nine-field ask loop is unchanged, no tenth field). The multi-leg-ness is a ROUTE property:
the presented preview discloses the leg count, the per-leg lanes and the per-leg custody;
the authorization artifact's scope grows from "the presented preview + intent digest" to
"the presented MULTI-LEG plan + intent digest" (the digest covers every leg). ONE
two-act approval authorizes the plan; the dispatch runtime orchestrates per-leg commands —
each leg is its own `PaymentDispatchCommand` with its own `connectionRef`, its own
single-use artifact-consumption share, and its own idempotency entry keyed
`(mission, operation, legIndex, intentDigest)`. **The partial-failure law:** a leg UNKNOWN
→ the mission goes OUTCOME_UNKNOWN with the per-leg attempt pending reconciliation (the
P20 reconcile plane handles it per-attempt — unchanged); a leg FAILED → the mission stays
open with the legs before it as recorded facts (custody continuity: a later leg NEVER
dispatches after an earlier leg's non-CONFIRMED outcome — the chain stops honestly);
legs never silently skip. The existing single-leg law is the N=1 case, byte-pinned (the
existing dispatch/authorization/idempotency tests stay green unmodified).

### D7 — the no-bypass discipline extended (the closure gate)

Every NEW surface is typed-refused without its grant, and the D7 battery (the P23
precedent) extends over all of them: the deploy operation refuses without the deployment
grant (a smuggled deploy directive never reaches a transport); the composite act refuses a
plan whose digest does not cover every dispatched leg (a leg outside the authorized plan is
a typed AUTHORIZATION_MISMATCH, never a dispatch); the Stellar kernel refuses every mode
except SANDBOX on `stellar:testnet` (a pubnet-shaped target is MODE_NOT_OFFERED, INV-25);
the corridor compile refuses an unobserved middle; the marker-scans (pinned
protocol-command assertions at depth) cover the new DTOs; the structural falses are
re-asserted (hypotheses never compile; discovery never authorizes; the deploy evidence
never fabricates a SmartContractExtensionPin — the pin derives only from a REAL deployment
record).

### D8 — the Paystack execution lane amendment (the off-ramp)

This wave IS the order the Paystack code anticipated: the corridor's KES off-ramp needs a
payout-capable provider. The amendment, scoped exactly: new operation ids
(`paystack.transfer.initiate`/`finalize`/`verify` — the transfer API's real shapes), a
POST-capable transport (the GET-only law relaxes to the operation-endpoint map), a
`createPaystackExecutionKernel` behind `ExecutionAuthorityPort` (the Stripe precedent:
grant derived INSIDE the seal — `sk_test_` derives the payout grant in SANDBOX only;
`sk_live_` refused at the verb, INV-25), and a Paystack read-back (the transfer verify).
**Flutterwave stays read-only, byte-identically** (ADR-0014 D7 — its transfers terminate
at bank/MOMO; that finding is not amended by this wave). The lane composition's
Stripe-hardcode becomes a per-provider kernel table (the generalization E4 names); the
bridge's funding-source fold grows Paystack (its probe reads transactions; balances are
not part of its read surface — the fold stays honest about what it derives).

### D9 — the Stellar seal law (the keypair path)

A `submitStellarSecretKey`-class verb (the naming follows the established verb pattern)
seals the keypair as ONE material `{publicKey, secretKey}` under the durable broker (the
existing AES-256-GCM path, the escape-scan law unchanged). The shape law: the public key
MUST match `^G[A-Z2-7]{55}$` and the secret `^S[A-Z2-7]{55}$` (StrKey base32); a
key-shaped value in any handle/reference/id remains a security incident (the wallet-law
throw). The verification probe is the Horizon account read (the P13 evidence precedent —
read-only). Stellar keypairs are network-agnostic by shape: the CONNECTION declares the
network (`stellar:testnet`); a pubnet-shaped execution target is refused by executionMode
(SANDBOX only, INV-25) — the honest mode gate, not a shape guess. The non-custody wallet
law is preserved: key material exists ONLY inside the seal; every surface sees opaque
`SignerHandle`s.

### D10 — the E2E law and the honest tiers

The CDP corridor journey (a `scripts/p22/` harness on the p21/p23 pattern) drives the REAL
app through: the seeded connection plane (FLW/Paystack/Stripe scripted + the Stellar
connection through the REAL member path), the corridor ask ("GH KE KES", GHS amount), the
compiled four-leg plan's CONTENT assertions (the leg lanes, the custody chain, the USDC
asset with its issuer, the per-leg prerequisites), the composite two-act approval, the
per-leg dispatch over the scripted Stellar transport (the deploy + the transfer), the
read-backs, and the relaunch persistence re-derivation (the digest law). The secret-scan
grows the Stellar shapes (`S…` 56-char base32 — a finding FAILS the receipt). The browser
tier grows the J-rows the no-orphans law requires (the corridor's honest web-tier state —
the unbound notes stay honest). **The live tier is the named operator gate:** the
rail-evidence harness pattern (AES-GCM env-injected keys, REAL fetch, per-provider
activation subtests, machine-scanned receipts) is EXTENDED for the Stellar testnet legs
(the wallet funding check, the contract deployment, the corridor's onchain transfer) and
runs ONLY when `secrets/payment-providers.env` is re-supplied.

### D11 — the hop-bound law

The corridor demand rides the `MOVE`/`CONVERT` direction classes (the vocabulary already
classes them — intentRouter's stems); `PAY` keeps `DIRECT_PAYMENT_MAX_ROUTE_HOPS = 1`
byte-identically (a direct payment demand never silently widens). The intent's
`maxRouteHops` constraint (the canonical 1..8 vocabulary) is the typed surface the
corridor plan's hop count satisfies; the preview discloses the leg count; the ask loop
gains NO new field. A `PAY`-classed intent over the corridor sees the honest exclusion +
the repair cards + the hypothesis (the P23 law unchanged); a `MOVE`/`CONVERT` intent sees
the compiled corridor when the observations ground it.

### D12 — the credential gate and the closure policy

The two hard closure gates (binding P22-D): (1) the no-bypass battery extended over every
new surface (D7); (2) the CDP corridor plan-content E2E on the scripted tier with the
machine-verified, secret-free receipt. The live Stellar testnet tier is a NAMED gate: if
the keys return before closure, the live tier lands inside it; if not, the closure records
the live tier as the STANDING OPERATOR ACTION — an explicit, disclosed carry-forward in
the acceptance record's verdict (the P23 consent-plane precedent), never a silent pass.
No closure claim may assert a live testnet operation that did not occur.

### D13 — the frozen-file law, amended honestly

The P20/P21/P23 "UNTOUCHED by law" list (`payment-dispatch-runtime.ts`,
`authorization-gate.ts`, `mission-execution.ts`, `idempotency.ts`) is AMENDED by this ADR
for exactly one purpose: the composite-act growth (D6). The amendment's discipline: the
single-leg laws are byte-pinned by the existing tests staying green UNMODIFIED (N=1 is the
degenerate case); the new multi-leg laws get their own failing-first batteries; the
dispatch two-phase protocol, the reconcile loop and the idempotency decision table are
EXTENDED (per-leg keys), never rewritten. Any drift beyond D6's scope in those files is a
violation this ADR names in advance.

## Appendix — the frozen cross-lane vocabularies (the pin contract)

The lanes code against these EXACT literals; the A-lane types and the C/H/B pins must
match byte-identically (the ADR-0015 appendix discipline):

- Chain family: `STELLAR` · chain key: `stellar:testnet` · environment class: `TESTNET`
- Rail: `{ railKind: "ONCHAIN", railKey: "stellar:testnet" }` (the chain key IS the rail key)
- Asset: `stellar:testnet/asset:USDC:<issuerG>` (issuer-scoped when the family extension is present); `declaredPeg: { pegKind: "FIAT_PEGGED", declaredBy: <the evidence-backed declarer> }`
- Deploy operation: `onchain.contract_deploy` · the deployment evidence record: `{ txHash, contractId, sourceHash, bytecodeHash }`
- Route shape: `cross-provider-corridor` · legs: `FIAT_PSP_COLLECT → PSP_STABLECOIN_ISSUANCE → ONCHAIN_TRANSFER → OFF_RAMP_PAYOUT` · the new location pair: `PROVIDER_ACCOUNT → BANK_INSTRUMENT` (this shape only, observed-middle only)
- Paystack operations: `paystack.transfer.initiate`, `paystack.transfer.finalize`, `paystack.transfer.verify` · the grant law: `sk_test_` → SANDBOX payout grant; `sk_live_` refused at the verb
- Stellar seal verb: `submitStellarSecretKey` · material: `{ publicKey: ^G[A-Z2-7]{55}$, secretKey: ^S[A-Z2-7]{55}$ }` · probe: the Horizon account read
- Composite act: the artifact scope = the presented multi-leg plan digest (every leg) · idempotency key: `(mission, operation, legIndex, intentDigest)`
- Corridor direction classes: `MOVE`, `CONVERT` (PAY stays max-hops-1)
- Funding/payout method pins: the corridor's GHS on-ramp and KES off-ramp method literals (the FLW/Stripe P21 pins preserved; the new pins named by the C lane and pinned in the appendix's acceptance addendum at P22-C merge — never invented twice)

### Appendix acceptance addendum (recorded at the P22-A/P22-C lane acceptance, 2026-10-29)

The C lane named the corridor's funding/payout method literals (the naming shape: the
FLW/Stripe P21 pin precedent — provider + instrument, grown with the corridor currency
qualifier because the corridor is defined by its currency pair):

- GHS on-ramp funding method: `flutterwave_ghs_mobile_money` (the Flutterwave Ghana
  mobile-money collection — the collect leg's lane)
- KES off-ramp payout method: `paystack_kes_bank_transfer` (the Paystack Kenya
  bank-transfer payout — the payout leg's lane, the beneficiary bank instrument arrival)

Both literals are pinned byte-identically in `packages/route-planning/src/pins/corridor.ts`
(`PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD` / `PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD`)
and mirrored in `packages/merchant/src/kes-receiving.ts` (the KES receiving context's
payout-method association). The A-lane literals (the family member, the chain key, the
environment class, the operation kind, the evidence-record fields, the StrKey patterns,
the assetId format) landed byte-identically to the appendix above — verified at the lane
acceptance.

## Alternatives considered

- **Force-fit Stellar into the PSP provider runtime** (a fourth `PAYSWAP_PROBE_PROVIDER_ID`): rejected — ADR-0008 D5's finding stands (Stellar is an onchain rail; the PSP shapes are credential-keyed business providers; the keypair/network semantics don't fit the probe/key-class vocabulary).
- **Per-leg missions instead of the composite act**: rejected — it fragments the operator's single demand into three approvals and misrepresents one plan as three missions; the partial-failure law (custody continuity) is truer as one mission's per-leg attempts.
- **A generic "composable shapes" engine instead of one new frozen shape**: rejected — the nine-shape freeze exists precisely because route vocabulary is authorization-bearing; one shape, grounded, byte-compat-gated, is the honest increment.
- **Waiting for the credentials before registering**: rejected — the lanes are credential-free (the P23 precedent proved the scripted tier through the REAL member paths); the gate is registered honestly (D12) instead of idling the frontier.
- **Promoting P23 hypotheses into compiled plans**: rejected — hypotheses are advisory by law (ADR-0015 D7); the corridor is a NEW observation-grounded surface, never a hypothesis promotion.

## Authority impact

`ExecutionAuthorityPort` is unchanged (one method; the composite act orchestrates N
commands, each a port call). The authorization gate's artifact scope grows (D6). The
onchain adapter contract grows the deploy path (D4). The lane composition generalizes to
the per-provider kernel table (D8). No composer/LLM/UI surface gains any consequential
door (the D7 no-bypass law extends to every new surface).

## Package/dependency impact

onchain-domain/adapters/extensions/security (A) · route-compiler/route-planning/opportunities/financial-certification/merchant (C) · desktop host + provider-runtime (H) · payswap-app/surface/renderer compositions (B) · desktop tests + journey-verification + scripts/p22 (D). The lanes are file-disjoint; the appendix is the cross-lane contract. The desktop host mirrors (layer law: the host never imports `@payswap/*`) grow structurally for the Stellar/Paystack surfaces.

## Security impact

Key material stays exclusively inside the seal (D9; the escape-scan law unchanged). The
Stellar secret's shape enters the receipt secret-scan (D10). The deploy operation is
consequential (INV-20-class) and grant-gated (D7). No new secret-carrying path exists
besides the one verb. LIVE-class PSP keys and pubnet Stellar targets are refused at the
edge (INV-25).

## Financial-truth impact

The corridor's plan/preview facts are observation-grounded (the observed middle law, D5);
testnet operations are labeled by their evidence tier (the P21 TEST_DATA discipline —
funding facts honestly test-tier, never a live-funds claim); the deploy evidence record is
the only source of a SmartContractExtensionPin (D7 — never fabricated).

## Migration impact

Additive throughout: one family member, one environment entry, one operation kind, one
route shape, one location pair, one shape's worth of leg orchestration. The byte-compat
gates (existing shapes byte-identical; existing single-leg tests green unmodified) are the
migration proof. Rollback = revert the wave's commits (no data migration: the new records
are append-only evidence).

## Verification plan

The P22-0 baselines (this document's gap matrix §header) + the lanes' failing-first
batteries + P22-D's two hard gates (D12) + the live-tier harness (operator-gated).

## Rollback

Revert the P22 commits; the frozen vocabularies return to their P23 state; the platform
work item `platform:cross-provider-route-shape` returns to the catalogue's open platform
gaps (it is the honest pre-P22 state).

## Required updates

JOURNEY-MAP (the corridor journey section) + FEATURE-MAP (the Stellar plane, the corridor
shape, the composite act rows) at P22-D; the P22-DEPENDENCY-GRAPH.json closure; the
current-state registration (this commit); the worklog Task 158 record.
