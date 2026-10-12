# P2-W1 Baseline Verification Record — Capability Fabric

Work order: P2-W1 (spec/dependency/work-orders.md: "Capability hierarchy,
ProviderStateEnvelope, observations, certification and execution modes.
Apply corridor-aware eligibility: country/currency, customer type, amount,
recipient/funding/payout method, required fields, limits, pricing/delivery
terms, cutoffs and fresh provider observations. A corridor is a discovery
projection over capabilities, not a new authority or a currency pair
alone. Preserve native provider semantics and catalogue/connected-instance
separation.").
Lane: platform lineage and economic kernel (Phase 2, worker-1).
Branch: `work/p2-w1` (base `3877a5fd19dd7718c57bfec0deb352cf5db61dcc` =
origin/main at dispatch; NOTE: origin/main had advanced to b5f20d6 at
execution time with P2-W2/P2-W3 accepted — the branch was cut from the
MANDATED dispatch SHA per the work order; the write surface is net-new and
pairwise-disjoint from both sibling landings, so the merge surface is clean).
Write surface: `packages/capability/**`, `spec/capability/**`,
`docs/capability-evidence/**` (pairwise-disjoint law — zero files touched
outside the surface; `git diff --stat 3877a5f..HEAD` lists only this
surface plus the package-local .gitignore).
Old-repo evidence pin: `payswapdotorg/payswap.org@8a735bf1639198c43115087a2992555166a9acf9`
(read-only; evidence not authority).

## 1. Battery receipts (exact commands, exit codes, counts)

All commands run from `packages/capability/` on Node v24.21.0 (vitest) /
TypeScript 6.0.x.

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `npm install --no-workspaces 2>/dev/null \|\| npm install` | 0 | first form succeeded directly; typescript@6.0.x + vitest@3.2.x toolchain installed (warnings only: esbuild postinstall not in allowScripts — no impact) |
| 2 | `npx tsc --noEmit` | 0 | strict + exactOptionalPropertyTypes, zero diagnostics (src + test + vitest.config.ts) |
| 3 | `npx vitest run` | 0 | **18 files / 230 tests, all PASS** (101 ported/adapted + 129 net-new; per-file below) |
| 4 | `npx tsx -e "import('./src/index.ts').then(m=>console.log('EXPORTS:', Object.keys(m).length))"` | 0 | `EXPORTS: 107` (tsx present in the environment; the plain-Node type-stripping import path is additionally exercised by vitest's transform pipeline) |

Per-file test counts (vitest): registry 21, executable-declaration 30,
corridor 13, corridor-laws 10, capability-definition 14,
provider-state-envelope 21, provider-implementation 15,
connected-instance 15, restrictions 13, execution-modes 15, packs 12,
observation 11, certification 10, smart-contract 10, extension 9,
boundary 6, smoke 1, availability 4.

### Old-suite porting account (as applicable to the new contracts)

Old suites in this work order's porting surface: capabilities 10 files /
111 tests + the corridor-adjacent connectors suites 6 files / 53 tests
(packs 10, provider-state 9, execution-modes 8, instances 8, observations
9, registry 9) = **164 old tests total**. Porting account:

| Old suite (tests) | New home | Ported/adapted | Dropped with reason |
|---|---|---|---|
| availability.test.ts (4) | availability.test.ts | 4 (verbatim semantics; canonical citation mapping only) | — |
| capability.test.ts (4) | capability-definition.test.ts | 4 (metadata + acceptance §11 semantics; type renamed Capability -> CapabilityDefinition, version added) | — |
| certification.test.ts (9) | certification.test.ts | 9 (append-only ledger, retirement, SC-risk gate) | — |
| extension.test.ts (8) | extension.test.ts | 8 (permissions/token families; canonical citation only) | — |
| smart-contract.test.ts (9) | smart-contract.test.ts | 9 (declaration completeness, risk profiles, Lab flag) | — |
| smoke.test.ts (1) | smoke.test.ts | 1 (adapted export surface) | — |
| boundary.test.ts (4) | boundary.test.ts | 4 (import law + determinism, adapted: type-only trust sibling + 400-line + no-enum + devDeps-exactness laws) | — |
| graph.test.ts (9) | registry.test.ts | 9 (registry chain/query/order laws + two-axis reuse through the corridor projection) | — |
| resolution.test.ts (11) | (superseded) availability + observation + corridor tests | 0 direct | 11: the old class+condition RESOLVER is superseded by the corridor projection (D-2); its two-axis UNKNOWN-preservation laws are preserved verbatim in availability.test.ts, observation.test.ts and the corridor availability exclusions |
| coverage-gap.test.ts (52) | corridor exclusion-reason vocabulary + tests | 0 direct | 52: the standalone Coverage Gap Case workflow (Tier-C onboarding paths, narrowest-integration tiers, browser-session onboarding) is NOT ported — provider-coverage strategy/operations workflow outside the P2-W1 scope list (D-1); the gap-kind + cause-classification CONCEPTS are absorbed into the corridor exclusion vocabulary and re-tested net-new |
| packs.test.ts (10) | packs.test.ts | 10 (tree validation, source-of-truth, helpers) | — |
| provider-state.test.ts (9) | provider-state-envelope.test.ts | 9 (families, lossless round-trip, fail-closed validation) | — |
| execution-modes.test.ts (8) | execution-modes.test.ts | 8 (vocabulary, explicit-mode + authorization-link enforcement) | — |
| instances.test.ts (8) | connected-instance.test.ts | 8 (catalogue rejection INV-13, validation, scope fields) | — |
| observations.test.ts (9) | observation.test.ts | 9 (derived availability, unknown reachability, fabricated-availability rejection) | — |
| registry.test.ts (9) | registry.test.ts | 9 (chain rules, monotonic observations, pack exposure, catalogue refusal) | — |

**Ported/adapted total: 101 of 164 old tests (none weakened). Not ported:
63 (52 coverage-gap + 11 resolution) with documented reasons (D-1, D-2).**
Net-new: **129** (230 total − 101) — the 14-part declaration law (30), the
corridor projection laws (23 across corridor/corridor-laws), corridor
restriction sets + narrowing law (13), freshness stamping (2), plus the
net-new hardening inside ported files (schema-versioned envelope +
versioned mode contracts, exact version pins, proof-level pin,
clone-on-store, per-family deep-freeze assertions, and the registry
narrowing-law cases).

## 2. Per-file adaptation receipts (old -> new)

| Old source (payswap.org@8a735bf) | Lines | New source | Lines | Adaptation |
|---|---|---|---|---|
| packages/capabilities/src/capability.ts | 135 | capability-definition.ts (217) + definition-validation.ts (200) | 417 | ADAPT: Capability -> CapabilityDefinition (layer 1 of the canonical hierarchy) with required `version`; executable/non-executable DISCRIMINATED UNION with the 14-part declaration hook; AcceptanceCapability -> AcceptanceCapabilityDefinition (non-executable by construction); validation split out for the <=400-line law; PROOF_LEVELS value import replaced by the local byte-identical PROOF_LEVEL_PIN (type-only trust link law) |
| packages/capabilities/src/availability.ts | 52 | availability.ts | 68 | PORT: two-axis model + total resolver verbatim semantics; old INV-C01/C02 citations mapped to canonical observation-discipline citations |
| packages/capabilities/src/graph.ts | 361 | registry.ts (336) + registry-support.ts (85) | 421 | ADAPT: CapabilityGraphStore (register + query by class/conditions) superseded by the four-layer CapabilityFabricRegistry with chain laws; acceptance/service-access query concepts carried by the catalogue + definition queries; D-2 |
| packages/capabilities/src/resolution.ts | 136 | corridor-evaluation.ts + availability reuse | — | ADAPT (supersede): class+conditions resolution is replaced by the deterministic corridor route evaluation (the two-axis UNKNOWN-preservation laws are preserved verbatim in availability.ts and the observation tests); D-2 |
| packages/capabilities/src/certification.ts | 366 | certification.ts | 341 | PORT: append-only ledger, retire-by-append, deep-frozen clones, SC-risk gate; subject kinds renamed capability -> capability_definition + net-new provider_implementation (canonical hierarchy); old INV-C03/SC04 citations replaced by canonical ownership citations; D-3 |
| packages/capabilities/src/extension.ts | 166 | extension.ts | 173 | PORT: token families + permission vocabulary + runtime validator; canonical citation for the no-ledger-authority law |
| packages/capabilities/src/smart-contract.ts | 309 | smart-contract.ts | 275 | PORT: declaration-completeness validator, assessSmartContractRisk, Lab-searchable flag; old INV-SC01/SC04 mapped to declaration-completeness + certification laws (canonical INV-20 territory cited) |
| packages/capabilities/src/coverage-gap.ts | 1385 | (absorbed) corridor-types.ts CorridorExclusion codes/causes | — | NOT PORTED as a standalone workflow (D-1); the gap-kind and cause-classification concepts survive as the corridor exclusion vocabulary (REGULATORY/CAPABILITY/COMMERCIAL/CAPACITY/RELIABILITY + net-new FRESHNESS) |
| packages/connectors/src/provider-state.ts | 373 | provider-state-envelope.ts | 363 | RE-AUTHOR: canonical CAPABILITY-MODEL owns the concept (old INV-C06 numbering does not transfer; canonical INV-14 cited); net-new `schemaVersion: 1` versioned contract; families/classification/privacy/provenance/history/actionRequired/failure/lossless codec preserved; frozen-construction shape preserved |
| packages/connectors/src/execution-modes.ts | 141 | execution-modes.ts | 223 | ADAPT: net-new EXECUTION_MODE_VOCABULARY_VERSION + versioned ExecutionModeContract triples; ConnectorExecutionRequest gains modeVocabularyVersion; package-local errors (old imported @payswap/protocol — forbidden sibling for this lane); old INV-C07/C08/F05/F06 citations replaced by CAPABILITY-MODEL + INV-13/INV-15 |
| packages/connectors/src/packs.ts | 360 | packs.ts | 342 | PORT: families, source-of-truth policies, node validation, flatten/find helpers; package-local errors |
| packages/connectors/src/providers.ts | 346 | provider-implementation.ts | 321 | ADAPT: ProviderIdentity + CorridorScope + deviations + nativeOptimization carried; implementation gains EXACT capabilityVersion pin (required) + optional versioned restrictionSet; CorridorQuery renamed ImplementationCorridorQuery (name collision with the corridor projection query); ISO country/currency code validation added to corridor scopes; servesCorridor preserved |
| packages/connectors/src/instances.ts | 366 | connected-instance.ts | 345 | PORT: instance shape + catalogue separation + guards + INV-13 rejection (old INV-C05 -> canonical INV-13; ConnectorAuthorityError -> CatalogueNotAuthorityError with code CATALOGUE_NOT_AUTHORITY); package-local errors |
| packages/connectors/src/observations.ts | 270 | observation.ts | 274 | ADAPT: derived availability + unknownReachability + fabricated-availability rejection preserved; net-new freshness stamping (strict ISO-8601 UTC observedAt DATA); externalState preserved via the new envelope type |
| packages/connectors/src/registry.ts | 421 | registry.ts + registry-support.ts | 421 | ADAPT: chain rules (definition -> implementation -> instance -> observation), monotonic observation versions, catalogue refusal, pack exposure enforcement; net-new narrowing-law enforcement at implementation registration; completeness sweep + corridor bridge extracted for the <=400-line law |
| packages/payment/src/method.ts | 289 | (concepts only) corridor query fields + PaymentMethod separation | — | ADAPT (concept-level): the PaymentMethod-vs-RailCapability separation and PaymentCredentialCapability discipline are reflected as the corridor query's funding/payout method + presented-fields dimensions and the OPAQUE credential-reference law; a standalone payment-method module is NOT created (the payment plane is not in the P2-W1 write-surface mandate; method-kind vocabularies belong to the surface/runtime lanes) |
| (none) | — | canonical.ts (164), shared.ts (42), identifiers.ts (138), errors.ts (147), executable-declaration.ts (231) + executable-declaration-validation.ts (316), restrictions.ts (360), corridor-types.ts (164), corridor-evaluation.ts (346) + corridor-restriction-eval.ts (263), corridor.ts (246), index.ts (91) | 2362 | NET-NEW: canonical-order internals (strict ISO timestamp parser + minor-unit ordering — the trust-lane D-2 discipline, internal-only), branded identifiers, error taxonomy, the 14-part declaration contract + validation, corridor restriction sets + narrowing law, the corridor projection (types, engine, restriction evaluation, projection + leakage laws) |
| packages/capabilities/test/node.d.ts | 22 | test/node.d.ts | 43 | PORT pattern + P1-W2 CI-note (hermetic package-local battery) |
| (test scaffolding) | — | test/fixtures.ts (305), type-utils.ts | — | NET-NEW shared builders (Loose override typing for branded ids) |

Classification (migration matrix legend): package-level **ADAPT** (old
capabilities + connectors corridor-adjacent surface re-authored into the
canonical capability hierarchy); file-level: PORT (availability, extension,
smart-contract, packs, provider-state, instances, observations),
ADAPT (capability-definition, certification, providers->implementation,
registry, graph->registry, execution-modes, resolution->corridor,
method->corridor concepts), NOT PORTED (coverage-gap workflow, D-1),
NET-NEW (canonical internals, identifiers, errors, executable
declaration, restrictions, corridor projection family).

## 3. Decision records

**D-1 — The old Coverage Gap Case workflow is not ported as a standalone
module.** Old coverage-gap.ts (1385 lines, 52 tests) implemented the
Tier-C gap-driven provider-coverage STRATEGY/OPERATIONS workflow
(narrowest-integration tier ranking, onboarding step lists, browser-session
boundary, sanctioned-market policy). The P2-W1 work-order scope list
(hierarchy, ProviderStateEnvelope, execution modes, declaration,
corridor-aware eligibility, certification + observations) contains none of
that workflow; its DISCIPLINE — every gap representable, classified by
cause, never bypassed by a "global coverage" claim — transfers into the
corridor projection's exclusion vocabulary (26 stable machine codes, cause
classification REGULATORY/CAPABILITY/COMMERCIAL/CAPACITY/RELIABILITY +
FRESHNESS, layer attribution, surfaced detail) and the no-bypass law
(catalogue data never authorizes; observations are evidence). A future
work order can build the onboarding workflow on this vocabulary.

**D-2 — The old class+condition resolution engine is superseded, not
ported.** Old resolution.ts + graph.ts answered "which capabilities of
class X with condition kinds Y exist" with a two-axis availability pick.
The canonical corridor discipline (Wise §4.1 + CAPABILITY-MODEL) demands
the richer conjunction (scope + restrictions + fresh observations +
authorization state), which is what `projectCorridor` implements. The
two-axis UNKNOWN-preservation laws are preserved verbatim (availability.ts
+ observation derivation + corridor AVAILABILITY_UNKNOWN handling), and
the registry carries the deterministic registration-order query laws.

**D-3 — Certification subject kinds renamed for the canonical hierarchy.**
Old kinds 'capability' | 'capability_pack' become
'capability_definition' | 'capability_pack' plus net-new
'provider_implementation' (the canonical layer-2 subject). Old invariant
ids (INV-C03/E05/SC04) replaced by canonical citations (append-only
history discipline, INV-3 family; smart-contract risk gate).

**D-4 — ProviderStateEnvelope re-authored with a schema version.** The
work order orders "re-author the lossless provider-state preservation
contract (canonical CAPABILITY-MODEL owns the concept — old INV-C06
numbering does not transfer)". Re-authored: canonical INV-14 citations,
net-new `schemaVersion: 1` (a versioned contract — parse rejects foreign
versions), otherwise the lossless families/classification/privacy/
provenance/history/codec semantics are preserved and re-tested (21 tests
vs old 9).

**D-5 — Corridor restriction sets are net-new, not the old corridor
registry.** Old connectors' CorridorScope/CorridorQuery (a
geography/currency membership registry) survives only as the ADVISORY
implementation-level scope claims. The Wise §4.1 discipline (customer
type, amount, methods, required fields, cutoffs, terms, freshness) is a
net-new versioned contract (`CorridorRestrictionSet`) with the narrowing
law — there was no old-repo counterpart to port.

**D-6 — Type-only sibling link, zero runtime dependencies.** The work
order allows an optional runtime dependency `@payswap/trust workspace:*`
IF types are consumed. Types ARE consumed (AmountSpec for amount-typed
eligibility limits; ProofLevel/ProofRequirement for definition proof
requirements), but via `import type` resolved through tsconfig paths —
the accepted P1-W2 integration pattern (protocol's AmountSpec link). This
keeps the package-local npm battery hermetic (`npm install
--no-workspaces` cannot resolve pnpm workspace protocols) with zero
runtime coupling; the boundary test machine-checks that the trust import
is type-only and that no other non-relative import exists. The TL may
swap to a workspace link at integration exactly as done for protocol.

**D-7 — Internal canonical-order helpers (honest deviation).** Freshness
(age vs maxAgeSeconds), cutoff evaluation (asOf time-of-day vs HH:MM) and
restriction amount bounds require exact ordering over timestamps and
minor-unit strings. Resolution: internal-only `canonical.ts` implements a
strict ISO-8601 UTC parser (civil-calendar integer math, no JS Date), a
total timestamp order, and length+lexicographic minor-unit ordering over
the canonical decimal strings the package already validates — internal
helpers never exported from the index (the trust lane's D-2 discipline).
No Money type, no arithmetic, no currency semantics; the public surface
stays money-free (INV-1 single-owner law).

**D-8 — Execution-request authorization refs are opaque.** Old
execution-modes imported CommandId/PrincipalRef types from
@payswap/protocol (forbidden sibling for this lane). Re-authored with an
opaque structural ProtocolAuthorizationRef (commandId + principal +
authorizationEvidenceRef as strings); the capability fabric never
verifies or interprets authorization (trust/protocol lanes own that).

## 4. Determinism receipts

- Boundary test: no Math.random / crypto.randomUUID / new Date / Date.now /
  performance.now / setTimeout / setInterval / fetch / node:fs / node:path /
  node:process / process.env anywhere under src/** (comments included —
  the scanner is text-based, so even doc references are phrased without the
  forbidden tokens).
- Timestamps are DATA: observations declare observedAt (strict ISO-8601
  UTC, calendar-validated); corridor evaluation receives asOf from the
  caller; age/cutoff arithmetic is deterministic integer math over the
  parsed civil calendar (leap years included, tested).
- projectCorridor is pure: repeated invocation over identical inputs is
  structurally identical (deep-equality + JSON equality, machine-checked);
  a changed input changes the output.
- Registry lookups preserve registration order; observation versions are
  strictly monotonic per instance (out-of-order rejection machine-checked).

## 5. Invariant mapping (canonical ids -> enforcement evidence)

| Canonical invariant | Enforcement in this package |
|---|---|
| INV-7 (external balances are observations, not custody) | observation.ts evidence-not-authorization law; quota observations are counts, never balances |
| INV-13 (catalogue is not executable connected capability) | connected-instance.ts guards + CatalogueNotAuthorityError; registry catalogue refusal; execution-modes instance reference requirement; corridor-view-is-not-execution-request law |
| INV-14 (provider state preserved) | provider-state-envelope.ts (lossless round-trip per family, mandatory classification/privacy/provenance); executable-declaration part 10 |
| INV-15 (provider-native baseline preserved) | execution-modes.ts (no priority/rank/score on the vocabulary; native-only mode lists legal — machine-checked); provider-implementation.ts nativeOptimization; registry.nativeBaselineImplementations |
| INV-16 (no provider leakage into neutral contracts) | provider-implementation.ts (opaque adapterRef, provider-neutral deviations/mappings); packs.ts provider-neutral declarations; boundary test import law |
| INV-4 discipline (UNKNOWN is not FAILED) | availability.ts two-axis resolver; observation derived availability + fabricated-availability rejection; corridor AVAILABILITY_UNKNOWN/OBSERVATION_ELIGIBILITY_UNKNOWN fail-closed exclusions with RELIABILITY cause |
| INV-19 (secrets never enter artifacts) | opaque CredentialScope references only; corridor no-leakage deep scan (machine-checked) |
| INV-26 (no circular package dependencies) | zero runtime dependencies; single type-only external link |

## 6. Limitations (honest register)

1. **No live provider integration.** This package is contracts + a
   deterministic in-memory registry. Real adapters, credential isolation
   and live observations belong to the provider-runtime lane (P2-W2); a
   corridor built only from catalogue data CANNOT exist by construction
   (projection inputs require connected instances + fresh observations).
2. **No route ranking.** The corridor projection preserves input order and
   assigns no score — best execution is P5-W1. This is a law, not a gap.
3. **Corridor terms are references.** Pricing/delivery terms are carried as
   versioned opaque references + the GUARANTEED/INDICATIVE label; the
   quote/terms contract itself is the economic/protocol + Surface lanes'
   authority (P1-W1/P2-W3).
4. **Certification is a ledger, not a verifier.** Certification records
   evidence artifacts; verifying the artifacts is the certification phases'
   concern (P8).
5. **The `asOf` discipline pushes clock responsibility to callers.** By
   design (determinism law): production callers must supply a
   wall-clock-derived asOf at the system edge; the library never reads one.
6. **Old coverage-gap onboarding workflow not ported** (D-1) — the
   narrowest-integration/onboarding mechanics are future work on top of
   the corridor exclusion vocabulary.

## 7. Reproduction

```
cd packages/capability
npm install --no-workspaces 2>/dev/null || npm install   # exit 0
npx tsc --noEmit                                         # exit 0
npx vitest run                                           # 18 files / 230 tests PASS
npx tsx -e "import('./src/index.ts').then(m=>console.log('EXPORTS:', Object.keys(m).length))"  # EXPORTS: 107
```
