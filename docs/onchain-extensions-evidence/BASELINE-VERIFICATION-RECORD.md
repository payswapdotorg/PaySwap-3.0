# P5-W2 Baseline Verification Record — Onchain Extensions (R3-W2 rebuild)

Work order: P5-W2 (spec/dependency/work-orders.md: "onchain extensions —
DEX, bridge, off-ramp, liquidity, lending/staking and intent protocol
packs"), rebuilt under lane R3-W2 (a rebuild of the accepted-then-lost
work/p5-w2, whose verified results are the prior-art oracle below).
Branch: `work/r3-w2` (base `95c8d8fffe1914bf5d032ca79daeacb997af1c30` =
main: "MERGE R2-W2: onchain-security rebuild — R2 wave 2/3", verified
with `git log --oneline -1` after checkout).
Write surface: `packages/onchain-extensions/**`, `spec/onchain-extensions/**`,
`docs/onchain-extensions-evidence/**` (pairwise-disjoint law; hard
constraint 8: zero files touched outside the surface — verified by the
manifest diff in §6).
Old-repo evidence pin: `payswapdotorg/payswap.org@8a735bf1639198c43115087a2992555166a9acf9`
(read-only; classified PORT per spec/migration/migration-matrix.json
MMP-23 — onchain-venues, 5 src / 7 test files, "7f/61t PASS", authority
owner P5-W2; evidence, never authority — PaySwap 3.0 architecture wins).

## 1. Battery receipts (exact commands, exit codes, counts)

All commands run from `packages/onchain-extensions/` on Node v24.21.0
(the CI-faithful battery, from a clean tree).

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `rm -rf node_modules package-lock.json && npm install --no-workspaces` | 0 | toolchain installed (devDependencies exactly `typescript@^6.0.3` + `vitest@^3.2.7`; zero runtime dependencies) |
| 2 | `npx tsc --noEmit` | 0 | **zero diagnostics** |
| 3 | `npx vitest run` | 0 | **16 files / 164 tests, all PASS** (~3.4s, fully offline) |
| 4 | export census (plain-Node type-stripping import of `src/index.ts`) | 0 | **91 named runtime exports** from the pack-neutral core barrel |

Prior-art oracle (the lost accepted build, work/p5-w2): tsc 0 diagnostics;
vitest **15 files / 151 tests, all PASS** (~3.3s, fully offline). Reproduced
and exceeded on every axis: 0 = 0 diagnostics; **16 ≥ 15 files; 164 ≥ 151
tests**; ~3.4s offline ≈ ~3.3s offline. Old evidence carried: onchain-venues
61 tests (venue registry/capability seed); the pack vocabulary beyond
venues is NET-NEW per graph.md P5-W2.

## 2. Test classification (old evidence → new suite)

The old 61 tests in 7 files are ALL ported + adapted (never weakened —
the old suite's execution-oriented assertions become the declarative-law
equivalents; see D-1/D-6); 9 net-new files cover the 3.0 vocabulary, the
boundary guard and the declarative law.

| New file | Tests | Class | Notes |
|----------|-------|-------|-------|
| smoke.test.ts | 5 | PORT+ADAPT | old smoke (2) + the old adversarial export-census law + subpath import census |
| adversarial.test.ts | 10 | PORT+ADAPT | all 10 old adversarial laws: core-barrel neutrality → pack neutrality, dependency direction, vendor-SDK scan, secret-field guard (3), no live endpoints, neutral-surface census |
| pack-contract.test.ts | 12 | PORT+ADAPT | old pack-contract (9): full-battery validation, protocol binding coupling, INV-SC01 completeness, deterministic identity + venue coupling, ONE-venue rejections; + family-segment/version-segment/protocol-class couplings |
| uniswap.test.ts | 12 | PORT+ADAPT | old uniswap (14): published constants, immutable/non-custodial declarations, embedded pool fee, incumbent baseline; the v2 math/quote/planWrite tests adapt to surface-law assertions (D-1) |
| aggregator.test.ts | 8 | PORT+ADAPT | old aggregator (11): independent identity, multi-source declaration, explicit fee on top, own baseline |
| intents.test.ts | 8 | PORT+ADAPT | old intents (9): FULFILLER_SETTLED/OPEN flavor, limit law, settlement-observation seam |
| registry.test.ts | 13 | NET-NEW | adapts the old best-execution-integration role (6): cross-pack composition/competition → registry composition laws, sub-packs-before-composer, family compatibility, fail-closed lookups, no partial state, tree projections |
| boundary.test.ts | 13 | NET-NEW | the P4-W3-strengthened zero-sibling guard (relative-only src imports, no @payswap/@zcode, test allowlist, ≤400-line file law on src AND test, determinism, manifest, tsconfig no-paths, no enum, secret heuristic, no live tree, pack→core direction) |
| wire-families.test.ts | 10 | NET-NEW | six-family vocabulary, guards, semantics/protocol-class/composition tables (totality + frozen) |
| wire-dex.test.ts | 10 | NET-NEW | DEX surface: kinds, swap kinds, quote/slippage/fee vocabularies, aggregator-source coupling |
| wire-bridge.test.ts | 9 | NET-NEW | bridge surface: models, corridors (source ≠ destination, canonical keys), finality/reorg/verification/refund vocabularies |
| wire-offramp.test.ts | 9 | NET-NEW | off-ramp surface: handoff models, payout methods, ISO-3166-1 jurisdictions, KYC, rail handoff |
| wire-liquidity.test.ts | 10 | NET-NEW | liquidity surface: models, fee-tier bounds/duplicates, lockup coupling, IL disclosure |
| wire-lending-staking.test.ts | 9 | NET-NEW | lending-staking surface: position kinds, slashing coupling, unbonding coupling, rate/collateral vocabularies |
| addressing.test.ts | 12 | NET-NEW | pack id law (derive/parse round-trip/fail-closed), pinned addressing forms, canonical projection, digest order-independence, tamper detection |
| declarative-law.test.ts | 14 | NET-NEW | THE DECLARATIVE LAW: zero function members (deep scan), registry surface census, no execution methods in src, authorityCarrier literal enforcement (3), certification literals (3) + status key census, builder purity, frozen tables |
| **Total** | **164** | 7 ported+adapted (all 61 old tests) + 9 net-new | all PASS |

## 3. Per-file source adaptation receipts (old → new)

Old src: 5 files / 1,830 lines (plus 7 test files / 1,741 lines and a
243-line helper). New src: 25 files / 4,065 lines; new test tree: 18
files / 2,713 lines. Every new file ≤ 400 lines (machine-checked; max
src: wire/families.ts 349; max test: fixtures.ts 305, boundary.test.ts
257).

| Old source | Old L | New source | New L | Adaptation |
|------------|-------|------------|-------|------------|
| src/index.ts (VenueExtensionPack + validation) | 162 | src/wire/core.ts + src/validation/core.ts + src/addressing.ts | 223 + 169 + 93 | PORT+ADAPT: the pack made declarative (venue port dropped — D-1); packId law extended with the family segment (D-3); digest-based tamper evidence added |
| src/capability-base.ts (§2A builders) | 139 | — (absorbed) | 0 | NOT ported as builders: the §2A capability-base layering belongs to the accepted capability fabric (D-5); the precondition texts survive as pack constraints |
| src/uniswap/index.ts | 586 | src/packs/uniswap-v2.ts | 196 | PORT+ADAPT: published constants + both INV-SC01 declarations + AMM surface + baseline declaration kept as DATA; v2 math, quote(), planWrite(), simulate() dropped (D-1) |
| src/aggregator/index.ts | 507 | src/packs/zeroswap-aggregator.ts | 169 | PORT+ADAPT: synthetic settlement declaration + AGGREGATOR surface (RFQ+AMM sources, EXPLICIT_COMPONENT fee); runtime source composition dropped (D-1) |
| src/intents/index.ts | 436 | src/packs/solverbatch-intents.ts | 176 | PORT+ADAPT: intent flavor vocabulary + escrow declaration + limit/settlement-observation constraints; quote()/buildIntentSettlementObservation() dropped (D-1) |
| — (NET-NEW) | — | src/pins/onchain-domain.ts + src/pins/smart-contract.ts | 143 + 274 | NET-NEW structural pins of the onchain-domain/capabilities vocabulary (chain/protocol/operation + INV-SC01 + protocol descriptor validators), reconciled with the accepted 3.0 pins (D-2, D-4) |
| — (NET-NEW) | — | src/wire/families.ts + src/wire/family-semantics.ts | 349 + 148 | NET-NEW six-family vocabulary + the three frozen declarative tables |
| — (NET-NEW) | — | src/validation/{helpers,families-swap,families-transfer,families-yield,members}.ts | 79 + 106 + 137 + 151 + 311 | NET-NEW fail-closed validation battery (accumulate law) |
| — (NET-NEW) | — | src/registry.ts | 156 | NET-NEW declarative registry + composition projections |
| — (NET-NEW) | — | src/packs/{lockport-bridge,coinramp-offramp,tidalpools-liquidity,meridian-lending}.ts | 174 + 178 + 161 + 173 | NET-NEW family seeds (synthetic model deployments) |
| — (NET-NEW) | — | src/{version,errors,shared,digest}.ts + src/index.ts | 23 + 113 + 63 + 73 + 227 | NET-NEW package scaffolding (the accepted lane shapes) |
| test/helpers.ts | 243 | test/fixtures.ts + test/node.d.ts | 305 + 43 | PORT+ADAPT: deterministic fixture builders per family + variant/tampered helpers with digest re-derivation; currency registration dropped (D-7); process.cwd-as-function declared (D-9) |

Every new file ≤ 400 lines (max: 349). Zero `@payswap/*` module specifiers
anywhere (machine-checked). All seven shipped packs validate through the
full battery on every construction and carry their true canonical content
digests.

## 4. Deviations from the old evidence (recorded with reasons)

| # | Deviation | Reason |
|---|-----------|--------|
| D-1 | The ExecutionVenue port (quote/observeHealth/planWrite/simulate), the v2 constant-product math, the RFQ/AMM runtime composition and buildIntentSettlementObservation() are NOT ported; packs are pure descriptor data | The R3-W2 mission statement: "Pack definitions are DECLARATIVE… never execution, never financial authority." Execution belongs to best-execution (P5-W1) and the adapters (P4-W3); the old venue-port tests adapt to surface-law assertions |
| D-2 | Addressing forms renamed: `protocol.${chainKey}:${protocolKey}` → `capability:protocol:${chainKey}:${protocolKey}`; `chain.${chainKey}` → `capability:chain:${chainKey}` | The accepted 3.0 structural pins (packages/onchain-adapters/src/pins/onchain-domain/instance.ts) renamed the chain form; the protocol form follows the same accepted convention; canonicalProtocolRef keeps the old `${chainKey}/protocol:${protocolKey}` form (the protocolRef field form the accepted directive pin consumes) |
| D-3 | Pack id law extended: `venue-pack/${venueId}@${version}` → `onchain-pack/${family}/${packKey}@${version}` with venueKey coupling | The package now spans six families (graph.md P5-W2); the family segment makes the family coupling machine-checkable while preserving the old one-venue coupling law |
| D-4 | Zero sibling imports (old package depended on @payswap/protocol, onchain-domain, onchain-security, best-execution, capabilities, trust) → local structural pins + digest local copy | Hard constraint 4 (the leaf-in-flight law, matching every accepted 3.0 wave); the TL wires the types at integration |
| D-5 | capability-base.ts builders (venueActionCapabilityDefinition / venueConnectedProtocolInstance) not ported | The §2A CapabilityDefinition→Implementation→Instance layering is owned by the accepted capability fabric (P2-W1); duplicating it here would create a parallel vocabulary (the work-order law: packs compose the canonical models, never duplicate them); the precondition texts survive as declarative constraints |
| D-6 | The old best-execution-integration suite (6 engine tests) and the INV-C05 engine-refusal tests are adapted into registry composition laws + declarative-law literals instead of an engine integration | Zero-sibling law forbids importing the engine; the engine is P5-W1's to test against real venue packs at TL integration; the catalogue-never-authorizes discipline is enforced STRONGER here (type-visible literals + deep scans vs engine-behavior probes) |
| D-7 | The old helpers' registerCurrency(USC/ETH/DAI) money registration is dropped | No money arithmetic remains in a declarative package (D-1); the protocol money law is consumed where amounts exist (execution lanes), never here |
| D-8 | Old src files up to 586 lines; new files split to ≤ 400 (src 5→24 files, validation split into a directory) | Hard constraint 6 (the file law, machine-checked on src AND test) |
| D-9 | test/node.d.ts added (process.cwd as a FUNCTION global) | Hard constraint 3 (the process law of the accepted CI battery: npm install --no-workspaces ships no @types/node) |
| D-10 | The prior-art oracle's exact 15-file/151-test shape is exceeded (16/164) | "Reproduce or beat": the net-new declarative-law + per-family suites add coverage; the oracle's file/test arithmetic is not itself a contract |

## 5. Findings

1. The old venue registry/capability seed is fully absorbed: uniswap-v2
   (published v2 constants carried as PUBLIC-annotated public identifiers,
   both INV-SC01 declarations ported shape-verbatim), zeroswap-aggregator
   and solverbatch-intents (synthetic model deployments, headers preserved
   in spirit) — all three now declarative packs validating through the
   same battery as everything else.
2. The pack vocabulary beyond venues is NET-NEW per graph.md P5-W2, as
   the work order anticipated: bridge, off-ramp, liquidity and
   lending-staking family surfaces + the semantics/protocol-class/
   composition tables are seeded here (four synthetic model packs:
   lockport-bridge, coinramp-offramp, tidalpools-liquidity,
   meridian-lending).
3. The declarative law is TYPE-VISIBLE, not comment-deep:
   `authorityCarrier: false`, `certificationRequired: true`,
   `statusCarried: false` and `benchmarkBaseline: true` are LITERAL
   types machine-checked by validation; the deep function-member scan and
   the registry method census make "never execution" testable rather
   than aspirational.
4. Net-new tamper evidence: provenance.contentDigest over the canonical
   pack projection (key-order-independent canonical serialization) —
   silent mutation of any shipped pack is a validation failure.
5. The PUBLIC-annotation discipline: the boundary secret-scan checks the
   literal's line and the line above, so public-identifier constants
   (published mainnet addresses, synthetic fixture addresses) carry
   inline `// PUBLIC:` markers directly above the literal.
6. No deviations from the hard constraints were needed; the battery runs
   fully offline with the exact CI commands.

## 6. Manifest receipt

`git diff --name-only 95c8d8fffe1914bf5d032ca79daeacb997af1c30..HEAD`
contains ONLY paths under `packages/onchain-extensions/`,
`spec/onchain-extensions/` and `docs/onchain-extensions-evidence/`
(hard constraint 8 — pnpm-workspace.yaml, pnpm-lock.yaml,
MODULE-OWNERSHIP.yaml, .github/workflows, other packages and other
spec/ paths untouched). SHA-256 manifest: `~/MANIFEST.sha256`
(workspace delivery).
