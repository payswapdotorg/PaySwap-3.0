# PaySwap 3.0 Capability Fabric — Contract Document

Status: FROZEN FOR IMPLEMENTATION (P2-W1)
Package: `@payswap/capability` (`packages/capability/`)
Authority owner: Capability and Network Authority (spec/architecture/AUTHORITY-MODEL.md, PaySwap authority 3)
Work order: P2-W1 (spec/dependency/work-orders.md)
Evidence: docs/capability-evidence/BASELINE-VERIFICATION-RECORD.md

This document is the contract law of the capability plane. The package is
the implementation; where code and this document disagree, that is a defect
(either fix the code or file an ADR — never silently diverge).

## 1. Position in the architecture

The capability plane owns CAPABILITY DEFINITIONS, CERTIFICATION and
CONNECTION STATE — the fabric through which every external system (bank,
PSP, card, mobile money, FX, chain, wallet, DEX, bridge, smart-contract
protocol, data provider, expert, agent, future service) becomes reachable
as a first-class PaySwap capability.

It does NOT own: financial truth (INV-1, the financial protocol lane),
money semantics (INV-2, the financial lane's Money/AmountSpec->Money
bridge), account-level authorization (trust lane), hard policy constraints
(policy/governance lane), or execution itself (provider runtime, P2-W2,
owns adapters, credentials and live provider I/O).

### Layer law

`MODULE-OWNERSHIP.yaml` layer `capability` — `may_depend_on:
[contracts, trust]`. P2-W1 pins the package as a RUNTIME LEAF: **zero
runtime dependencies**. The ONE accepted sibling import is TYPE-ONLY
(`AmountSpec`, `ProofLevel`, `ProofRequirement` from `@payswap/trust`, the
accepted wire authority) — erased at runtime, resolved at typecheck time
via tsconfig paths (the accepted P1-W2 integration pattern). The proof-level
VALUES are pinned locally byte-identical (`PROOF_LEVEL_PIN`, 'P0'..'P5')
with cross-lane consistency asserted by tests. Machine-checked by
test/boundary.test.ts: every src import is relative except the type-only
trust link, and no randomness/ambient-clock/timer/fs/network appears in
src/**.

## 2. The canonical hierarchy

```
CapabilityDefinition  ->  ProviderImplementation  ->  ConnectedCapabilityInstance  ->  CapabilityObservation
     (layer 1)                  (layer 2)                     (layer 3)                      (layer 4)
```

- **CapabilityDefinition** (layer 1) — CATALOGUE data: the versioned
  description of POTENTIAL provider behavior (conditions, cost, risk,
  provenance, economic accountability, proof requirements,
  bond/collateral/recourse; capability-class vocabulary carried from the
  old §11 model, including first-class `merchant_acceptance` and
  funding-source classes liquidity/credit/lending).
- **ProviderImplementation** (layer 2) — a provider's concrete, versioned
  implementation of a definition, with an EXACT definition-version pin, an
  opaque `adapterRef` (owned by the provider-runtime lane), documented
  deviations, advisory corridor-scope claims, an optional INV-15
  `nativeOptimization` baseline reference, and an optional versioned
  provider-level corridor restriction set.
- **ConnectedCapabilityInstance** (layer 3) — the scoped, authorized,
  eligible EXECUTION SURFACE for an actual connection: account/tenant
  scope, authorization state, OPAQUE credential reference, geography,
  currencies, permission state, eligibility, provider-neutral
  configuration.
- **CapabilityObservation** (layer 4) — freshness-stamped, versioned
  evidence of current health, scope, eligibility, quota, terms and external
  state. Two-axis availability (capability state × source availability)
  with DERIVED effective availability; timestamps are strict ISO-8601 UTC
  DATA (never an ambient clock).

### Catalogue/instance separation (INV-13)

A `ProviderCatalogueEntry` is a structurally distinct, NON-ASSIGNABLE
advertisement type: no instanceId, no implementationId, no accountRef, no
authorization, no credential scope, no permission state, no eligibility.
Catalogue data NEVER authorizes an effect: `assertConnectedInstance`
rejects catalogue entries with a typed `CatalogueNotAuthorityError`
(code `CATALOGUE_NOT_AUTHORITY`), and the registry refuses to register a
catalogue entry as an instance. Catalogue entries are legal DISCOVERY
seeds (registered in a separate advertisement surface).

## 3. The fourteen-part executable capability declaration

Every EXECUTABLE capability declares (CAPABILITY-MODEL law; fail-closed —
`validateExecutableCapabilityDeclaration` rejects any omission):

1. `semantics` — summary + provider-neutral effect description;
2. `stateMachine` — deterministic declared state table with a TERMINALITY
   law (no transition leaves a terminal state);
3. `preconditions` — what must hold before execution, and who confirms it;
4. `authorizationRequirements` — required scopes / human-approval /
   mandate-kind REFERENCE (verification is the trust lane's authority);
5. `financialEffectClass` — NO_EFFECT | OBSERVATION_ONLY |
   PENDING_EXTERNAL_COMMAND | CONSEQUENTIAL_EXTERNAL_EFFECT;
6. `idempotency` — key scope (ENDPOINT_SPECIFIC default per provider
   contract), retry policy (NEVER_RETRY_AFTER_AMBIGUITY),
   reconciliation requirement;
7. `compensation` — cancellable/refundable/late-return representability;
8. `partialExecution` — supported + semantics;
9. `userActions` — actions a human may/must perform;
10. `providerStateMapping` — consequential state families, preserved in a
    ProviderStateEnvelope (INV-14);
11. `externalReferences` — external IDs, provider revisions, correlation
    requirement;
12. `evidenceRequirements` — which evidence kinds executions must produce
    (funding/conversion/payout/observation/finality/reconciliation/
    authorization/provider-event);
13. `economicTerms` — versioned terms reference + pricing model;
14. `jurisdictionEligibility` — an embedded versioned restriction set OR
    an explicit NONE with justification (silent absence is impossible).

`executable` is a DISCRIMINATED union: executable definitions cannot exist
without the declaration; non-executable definitions carry an explicit
`nonExecutableReason`. `merchant_acceptance` definitions are non-executable
by construction (acceptance is an advertisement surface; funding uses
liquidity/credit/lending capabilities).

## 4. Execution modes (INV-15)

PASS_THROUGH_NATIVE | COMPOSED_PAYSWAP | OPTIMIZED_MULTI_PROVIDER — an
EXPLICIT, VERSIONED vocabulary (`EXECUTION_MODE_VOCABULARY_VERSION`).
The mode is DECLARED on every executable capability (non-empty mode list,
validated) and NEVER inferred. Every execution request carries the mode
plus the mode vocabulary version, the ConnectedCapabilityInstance
reference, an idempotency key and the protocol authorization reference:
`validateExecutionRequest` enforces all of them — no mode, including
PASS_THROUGH_NATIVE, can bypass protocol authorization. The vocabulary
assigns NO priority/rank/score (machine-checked): declaring only
PASS_THROUGH_NATIVE is as legal as only COMPOSED_PAYSWAP; the native path
is never structurally disadvantaged.

## 5. ProviderStateEnvelope (INV-14)

Lossless consequential provider-state preservation: the raw provider-native
`state` is carried VERBATIM (opaque passthrough); the `classification`
(family + lifecycle step) is ADDITIVE metadata, never a replacement. Nine
families (customer_action_required, async_processing, capture, mandate,
refund, dispute, payout, connected_account, other) round-trip losslessly
through the JSON codec (serialize -> parse, machine-checked for every
family). Classification, privacy scope and provenance are MANDATORY
(absence is a validation error). The envelope is a versioned contract
(`schemaVersion: 1`). Canonical state owns protocol truth; the envelope
preserves the provider semantics needed for customer action,
reconciliation, support, audit and reprocessing.

## 6. Observations are evidence, never authorization

An observation's availability is DERIVED from the two axes (an
unreachable/unknown source yields UNKNOWN — never success, never failure;
a fabricated availability that disagrees with the axes is rejected). An
observation of a balance is not PaySwap custody (INV-7); an ELIGIBLE
observation never substitutes for protocol authorization. Observation
versions are strictly monotonic per instance (out-of-order events can never
regress canonical state — registry-enforced).

## 7. Corridor-aware eligibility (Wise §4.1 discipline)

A corridor is a DISCOVERY PROJECTION over versioned capabilities +
restrictions + fresh observations — NOT a new authority, NOT a currency
pair alone, and it can NEVER make an unsupported route executable.

- **Query** (data-only): source/destination country, source/target
  currency, customer type (PERSONAL/BUSINESS), send amount (AmountSpec,
  exact), funding/payout method, recipient type, presented field ids, and
  `asOf` (strict ISO-8601 UTC — evaluation time as DATA; the projection
  never reads a clock).
- **Restriction sets** (versioned, at definition level embedded in part 14
  and optionally at implementation level): country/currency scopes,
  customer types, amount bounds (exact via the pinned AmountSpec wire type
  + internal canonical minor-unit ordering — structural comparison, never
  float, never money arithmetic), methods, recipient types, required
  fields, cutoffs (HH:MM UTC + day rule, evaluated against asOf), and
  versioned pricing/delivery terms references with an honest
  GUARANTEED/INDICATIVE label.
- **Narrowing law**: implementation-level restrictions only NARROW
  definition-level restrictions (scopes shrink, amount bounds tighten,
  required fields grow). Widening is rejected — enforced by the registry at
  implementation registration.
- **Projection** (`projectCorridor`): a pure, deterministic, versioned
  function. Route eligibility is the CONJUNCTION of: instance authorization
  ACTIVE + instance eligibility + required permission scopes + instance
  geography/currencies + implementation corridor claims + two-axis
  availability (DEGRADED stays eligible with a flag; UNKNOWN/UNAVAILABLE
  exclude) + observation eligibility (fail-closed on UNKNOWN) + freshness
  (age vs maxAgeSeconds) + quota + both restriction sets + definition
  executability + cutoffs.
- **Exclusion reasons are surfaced**: every excluded route carries EVERY
  violated check (stable machine code + cause classification
  REGULATORY/CAPABILITY/COMMERCIAL/CAPACITY/RELIABILITY/FRESHNESS + layer
  DEFINITION/IMPLEMENTATION/INSTANCE/OBSERVATION/RESTRICTION + detail).
  The cause taxonomy absorbs the old repository's coverage-gap
  classification.
- **Lineage**: every route evaluation cites capability definition id+
  version, implementation id+version, connected instance id, provider
  name/version, observation version/observedAt and the evaluated
  restriction-set ids@versions; the view carries its own
  `projectionVersion`.
- **No authorization leakage** (machine-checked): the view structurally
  contains no authorization/credential material
  (`assertCorridorViewCarriesNoAuthorization` deep-scans for
  credential/secret/token/… keys); the view is NOT an execution request
  (`corridorViewIsNotAnExecutionRequest` — `validateExecutionRequest`
  rejects it); eligibility output is EVIDENCE for discovery — execution
  still requires a connected instance + explicit mode + protocol
  authorization.
- **No ranking**: the projection preserves input order and assigns NO
  scoring (best-execution ranking is P5-W1's lane).

## 8. Certification

Append-only `CertificationLedger` over canonical subject kinds
(capability_definition, provider_implementation, capability_pack) with
statuses CERTIFIED/SUPERSEDED/REVOKED/RETIRED, mandatory evidence
references for CERTIFIED records, deep-frozen stored clones (caller
objects are never frozen out from under their owner), retirement by
APPENDING a RETIRED record (going-forward unavailability only; in-flight
history immutable), and the smart-contract risk-profile requirement for
subjects declaring smart-contract extensions.

## 9. Connector capability packs

Hierarchical TREES of independently versioned/certified sub-packs
(payments, billing, risk, connect_marketplace, payouts, tax, issuing,
financial_accounts, crypto, native_optimization). Each node declares auth
(provider-neutral), schemas, object mappings with a mandatory
source-of-truth policy (SHARED mappings require a conflict rule), rate
limits, provenance and evidence. Sub-packs map ONLY to capabilities
actually exposed by registered ConnectedCapabilityInstances
(registry-enforced at pack registration). Duplicate packIds across a tree
are rejected.

## 10. Extensions and smart contracts

Extension manifests compose through typed protocol token families and
carry permissions from a vocabulary with NO ledger-write and NO
rail-execute member (extensions never hold direct financial authority).
Smart-contract extensions declare code/chain/authority/pause/oracle/custody
properties in FULL (an omission is a validation error; custodial contracts
must name their custodian); `assessSmartContractRisk` derives the
deterministic upgrade/governance risk profile certification requires;
`searchableByLabAfterCertification` is a flag, never authority.

## 11. The registry

`CapabilityFabricRegistry` — deterministic, in-memory, four-layer chain
with registration laws: no implementation without its registered
definition (exact version pin), no instance without its registered
implementation (catalogue entries rejected outright), strictly monotonic
observation versions, narrowing-law enforcement at implementation
registration, pack exposure checks, and a separate catalogue surface.
`chainCompleteness` reports gaps; `corridorRouteInputs` fabricates nothing
(instances without fresh observations are absent from projection inputs).

## 12. Determinism and boundaries

No ambient clock, network, filesystem or randomness anywhere in src/**
(timestamps and cutoffs are DATA; freshness/cutoff evaluation is against
caller-supplied asOf). Every file <= 400 lines. No TS enum/namespace
(plain-Node type-stripping compatibility). Secrets never enter the
package: credential references are OPAQUE strings (INV-19); the corridor
leakage law is machine-checked. Observations are evidence; catalogue data
never authorizes; the provider-native baseline is never structurally
disadvantaged (INV-15).

## 13. Deviations from the old repository (honest register)

See docs/capability-evidence/BASELINE-VERIFICATION-RECORD.md §3 for the
full decision register, including: D-1 (old coverage-gap.ts standalone
workflow NOT ported — its gap-kind/cause taxonomy is absorbed into the
corridor exclusion-reason vocabulary); D-2 (old graph/resolution two-axis
resolution engine superseded by the corridor projection + registry);
D-3 (subject-kind renames for the canonical hierarchy); D-4 (ProviderState
Envelope re-authored with a schema version); D-5 (restriction sets are
net-new Wise §4.1 contracts, not ported from the old corridor registry).
