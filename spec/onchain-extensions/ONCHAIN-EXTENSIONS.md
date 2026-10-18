# PaySwap 3.0 Onchain Extensions — Contract Document

Status: FROZEN FOR IMPLEMENTATION (P5-W2; R3-W2 rebuild)
Package: `@payswap/onchain-extensions` (`packages/onchain-extensions`)
Subpaths: `.` (the pack-NEUTRAL vocabulary barrel) · `./packs/uniswap-v2` ·
`./packs/zeroswap-aggregator` · `./packs/solverbatch-intents` ·
`./packs/lockport-bridge` · `./packs/coinramp-offramp` ·
`./packs/tidalpools-liquidity` · `./packs/meridian-lending`
Authority owner: `rails` layer (spec/architecture/MODULE-OWNERSHIP.yaml:
`may_depend_on: [contracts, capability, trust, financial]`); the venue
extension-pack vocabulary is Work Order P5-W2
(spec/dependency/work-orders.md: "onchain extensions — DEX, bridge,
off-ramp, liquidity, lending/staking and intent protocol packs");
migration MMP-23 (spec/migration/MIGRATION-FROM-PAYSWAP-ORG.md and
spec/migration/migration-matrix.json: onchain-venues classified PORT,
authority owner P5-W2)
Evidence: docs/onchain-extensions-evidence/BASELINE-VERIFICATION-RECORD.md
Rebuild: R3-W2 on base 95c8d8fffe1914bf5d032ca79daeacb997af1c30

This document is the contract law of the onchain extension-pack plane. The
package is the implementation; where code and this document disagree, that
is a defect (either fix the code or file an ADR — never silently diverge).

## 1. Position in the architecture

This package OWNS the extension-pack vocabulary for onchain venues — the
versioned, DECLARATIVE descriptor language for venue families:

- what a venue family OFFERS (the six family surfaces: `dex`, `bridge`,
  `off-ramp`, `liquidity`, `lending-staking`, `intent-protocol` — each a
  discriminated `familyExtension` with closed vocabularies);
- how a venue is ADDRESSED (canonical identities: the pack id law
  `onchain-pack/<family>/<packKey>@<semver>`, the pinned
  `capability:chain:` / `capability:protocol:` forms, canonical protocol
  refs, the INV-SC01 smart-contract declarations);
- what a venue DECLARES (constraints/assumptions with
  `authorityCarrier: false`; certification with
  `certificationRequired: true` and `statusCarried: false`; provenance
  with a re-derived content digest over the canonical pack projection);
- how packs COMPOSE (versioned sub-pack references resolved by the
  declarative registry under the PACK_FAMILY_COMPOSITION law);
- the registry + validation machinery itself (fail-closed,
  accumulate-then-throw, validate-then-freeze).

It does NOT own: execution (best execution + route compilation is P5-W1),
chain adapters and finality semantics (P4-W3), signing/simulation/
security gates (P4-W2), the chain/asset/protocol domain vocabulary
(P4-W1 — pinned here structurally), the capability fabric's
certification ledger (P2-W1), merchant checkout (P5-W3), or any fiat
rail behavior (the off-ramp fiat leg is a DECLARED rail reference only).

### Layer law (R3-W2)

MODULE-OWNERSHIP places venue packs in layer `rails`
(`may_depend_on: [contracts, capability, trust, financial]`). For THIS
wave the package is DELIBERATELY dependency-free — the accepted
leaf-in-flight posture: **ZERO-SIBLING leaf under the v1 pattern**: no
`@payswap/*` module specifier anywhere (src or test), no tsconfig
`paths` entries, zero runtime dependencies, devDependencies exactly the
toolchain (`typescript` + `vitest`). The onchain-domain contract shapes
(chain/protocol/operation vocabulary, INV-SC01 smart-contract
declarations) are LOCAL STRUCTURAL PINS under `src/pins/` — same field
names, same literals, zero imports; the TL wires the types at
integration (structural compatibility by construction, the accepted
P4-W3 pattern). Machine-checked by test/boundary.test.ts.

## 2. The declarative law (the mission statement, encoded)

A pack is versioned descriptor DATA + validation + addressing. NEVER
execution, NEVER I/O, NEVER financial authority.

1. TYPE-VISIBLE non-authority: a constraint carries `authorityCarrier:
   false` as a LITERAL type; the certification declaration carries
   `certificationRequired: true` and `statusCarried: false` as LITERAL
   types. Any other value is a validation failure (a pack cannot opt out
   of certification, cannot carry its own certification status, and can
   never smuggle authority through a "constraint").
2. ZERO executable members: a pack (and every nested value) is data —
   no function members anywhere (deep-scanned); the registry surface
   exposes ONLY declarative operations (register/require/pack/packs/
   packsForFamily/has/size — machine-censused); src declares no
   venue-port execution method (quote/planWrite/observeHealth/simulate —
   source-scanned).
3. Determinism: no fetch, no Node globals, no timers, no randomness, no
   wall clock in src (source-scanned); pack builders are pure functions
   (same input, same deeply-equal frozen output).
4. Tamper evidence: `provenance.contentDigest` is re-derived over the
   canonical pack projection (everything except the digest field) at
   validation; disagreement is a validation failure
   (binding-never-security — FNV-1a 64, the accepted digest local-copy
   law).
5. Fail closed everywhere: unknown vocabulary values, non-canonical
   identities, malformed corridors, missing INV-SC01 declarations — all
   rejected with the FULL accumulated error list, never smoothed over.

## 3. The canonical identity laws

- Pack id: `onchain-pack/${family}/${packKey}@${semver}`, DERIVED — the
  family segment equals the pack's family, the version segment equals
  the pack's version, and the packKey equals the venue surface's
  venueKey (a pack is ONE venue).
- Capability ids follow the accepted 3.0 pin convention:
  `capability:chain:${chainKey}` and
  `capability:protocol:${chainKey}:${protocolKey}` (the old-repo forms
  `chain.${chainKey}` / `protocol.${chainKey}:${protocolKey}` are
  superseded — deviation D-2 in the evidence record). Canonical protocol
  refs keep the old form `${chainKey}/protocol:${protocolKey}`.
- The ONE-venue coupling: the protocol descriptor's protocolKey/chainKey,
  the implementation descriptor's protocolKey/chainKey, and the venue
  surface's chains are the SAME venue — the implementation's
  capabilityId is RE-DERIVED, never accepted as declared; the venue
  surface must include the protocol's chainKey.
- The family coupling: `protocol.protocolClass` must satisfy
  PACK_FAMILY_PROTOCOL_CLASSES[family] (dex→DEX, bridge→BRIDGE,
  off-ramp→OTHER, liquidity→DEX|OTHER, lending-staking→LENDING|STAKING,
  intent-protocol→INTENT_NETWORK).
- The INV-SC01 law: at least one complete smart-contract declaration per
  protocol, every contract's chainRef equal to the protocol's chainKey.

## 4. The family surfaces (closed vocabularies, frozen)

Each family extension is a frozen vocabulary + a fail-closed validator:

- `dex` (ADAPT of the old DexCapability flavor): dexKind
  AMM|ORDER_BOOK|RFQ|AGGREGATOR, swap kinds, quote semantics, slippage
  protection, fee model (EMBEDDED_POOL_FEE for the reference v2 venue,
  EXPLICIT_COMPONENT for the aggregator's on-top integrator fee),
  aggregator sources (required when AGGREGATOR, forbidden otherwise).
- `bridge` (NET-NEW): bridge model, declared corridors (source ≠
  destination, canonical chain keys, direction, optional assetRef),
  destination finality requirement, reorg handling, message
  verification, refund model.
- `off-ramp` (NET-NEW): payout handoff model, payout methods, ISO-3166-1
  alpha-2 jurisdictions, KYC requirement (a REQUIREMENT declaration —
  KYC state belongs to the compliance lane), quote validity model, and
  the settlement rail handoff — a DECLARED fiat rail reference; the pack
  never models, executes or verifies the fiat rail.
- `liquidity` (NET-NEW): liquidity model, position shapes, fee tiers in
  basis points (integers 0..10000, no duplicates), impermanent-loss
  disclosure, lockup model (withdrawal-delay description required when
  and only when WITHDRAWAL_DELAY).
- `lending-staking` (NET-NEW): position kind, collateral model, rate
  model + variability, reward streams, unbonding model (delay
  description required when and only when DELAYED), slashing conditions
  (required for staking position kinds, forbidden otherwise).
- `intent-protocol` (ADAPT of the old IntentExecutionCapability flavor):
  settlement model, solver competition, settlement domains, escrow
  model, batch cadence, surplus model.

The three frozen tables in `wire/family-semantics.ts` —
PACK_FAMILY_SEMANTICS (what each family offers + representative
canonical operations + addressing summary), PACK_FAMILY_PROTOCOL_CLASSES
(the class coupling law), PACK_FAMILY_COMPOSITION (which families a
composer may reference: dex←{dex,liquidity}, bridge←{bridge,liquidity},
off-ramp←{off-ramp,dex}, intent-protocol←{dex,bridge}; liquidity and
lending-staking are leaves) — are DATA the validators and registry read.

## 5. The registry + composition (declarative only)

`OnchainExtensionPackRegistry`: register/require/pack/has/packs/
packsForFamily. Checks run BEFORE insertion (a rejected registration
leaves no partial state); registration order is preserved; duplicate
pack ids are rejected; lookups are fail-closed (the registry never
fabricates a pack). Composition: sub-packs are exact versioned
REFERENCES — every referenced pack must be registered BEFORE the
composer (the capability-lane chain rule applied to composition), and
the composer's family must allow each sub-pack's family.
`resolveComposition`/`flattenPackTree`/`findSubPack` are deterministic
projections over the registry.

## 6. The reference packs (the venue registry seed)

Seven packs ship as subpath exports, each validating through the full
battery on construction and carrying its true canonical content digest:
PORT+ADAPT — `uniswap-v2` (the reference DEX: published v2 Router02 +
Factory INV-SC01 declarations, embedded 0.30% pool fee,
router-native-path-selection incumbent baseline),
`zeroswap-aggregator` (independent 0x-style aggregator: RFQ + AMM
sources, explicit integrator fee, smart-source-routing baseline),
`solverbatch-intents` (FULFILLER_SETTLED / OPEN solver competition,
onchain escrow, returned-to-user surplus); NET-NEW family seeds —
`lockport-bridge` (lock-and-mint corridors, light-client verification),
`coinramp-offramp` (custodial settlement handoff to declared fiat
rails), `tidalpools-liquidity` (concentrated liquidity tiers, no
lockup), `meridian-lending` (liquid staking, delayed unbonding,
disclosed slashing). The synthetic deployments are MODELLED shapes — no
claim about any specific real venue.

## 7. Boundary rules (machine-checked by test/boundary.test.ts and test/adversarial.test.ts)

1. Zero runtime dependencies; devDependencies are EXACTLY
   `typescript` + `vitest`; the manifest exposes the core barrel + the
   seven pack subpaths.
2. Every import under src/ is RELATIVE: no `@payswap/*`, no `@zcode/*`,
   no vendor SDK, no `node:` builtin (the leaf-in-flight pins law).
3. test imports touch ONLY the package itself, node builtins and
   vitest.
4. The DETERMINISM LAW: no fetch/Buffer/process/timers/Math.random/
   Date.now in src.
5. tsconfig.json carries NO paths entries.
6. Every file (src AND test) is ≤ 400 lines.
7. No TS enum; no TS namespace (plain-Node type-stripping
   compatibility). `process.cwd` in test/node.d.ts is declared as a
   FUNCTION global — never a string property, never duplicated.
8. The core barrel never imports a pack module (dependency direction
   pack → core); the neutral files carry NO concrete pack vocabulary
   (adversarial scan).
9. Secret-looking literals must carry the FAKE marker or a PUBLIC
   annotation on the literal's line or the line above; no
   credential-gated live test tree exists (deterministic battery only).
