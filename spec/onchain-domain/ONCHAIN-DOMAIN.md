# PaySwap 3.0 Onchain Domain — Contract Document

Status: FROZEN FOR IMPLEMENTATION (P4-W1, lane R2-W1)
Package: `@payswap/onchain-domain` (`packages/onchain-domain/`)
Layer: `rails` (spec/architecture/MODULE-OWNERSHIP.yaml — owner: network)
Work order: P4-W1 (spec/dependency/work-orders.md: "Chain/asset/protocol/
wallet/smart-account/onchain execution contracts, family-neutral")
Migration matrix: MMI-18 (onchain capability/security family)
Evidence: docs/onchain-domain-evidence/BASELINE-VERIFICATION-RECORD.md
Old-repo evidence pin: `payswapdotorg/payswap.org@8a735bf`
packages/onchain-domain (11 src files / 145 tests) — evidence, NOT
authority; the PaySwap 3.0 architecture wins.

This document is the contract law of the onchain domain. The package is
the implementation; where code and this document disagree, that is a
defect (either fix the code or file an ADR — never silently diverge).

## 1. Position in the architecture

The onchain domain owns the FRAMEWORK-INDEPENDENT, RAIL-AGNOSTIC onchain
vocabulary: chain families and optional family-scoped extensions,
chain/asset/protocol catalogue entries and connected instances, exact
onchain asset amounts, the deterministic onchain operation semantics, the
wallet/signer/smart-account capability declarations, the onchain execution
directive/request/observation vocabulary, and the canonical settlement
mapping into the protocol settlement machinery. Phase 4 security (P4-W2)
and adapters (P4-W3) build on it; Phase 5 routing (P5-W1/P5-W2) consumes
it.

It does NOT own: financial truth (INV-1, the financial protocol lane —
this package maps observations INTO the settlement machinery and never
constructs settlement state or finality), the capability hierarchy and
its fourteen-part executable declaration law (the capability lane owns
them; this package pins their wire shapes), account-level authorization
(trust lane), agent-side smart-account operation (the intelligence lane's
`@payswap/agents` owns session-key envelopes and the root-credential
boundary — this package owns the ONCHAIN smart-account capability shapes
only, per the authority-owner classification), or live chain I/O (the
provider-runtime lane + the P4-W3 adapters own transports).

### Layer law

`MODULE-OWNERSHIP.yaml` layer `rails` — `may_depend_on: [contracts,
capability, trust, financial]`. P4-W1 pins the package as a v1 HERMETIC
RAILS PACKAGE: **zero runtime dependencies AND zero sibling imports**
(no `@payswap/*` anywhere, no tsconfig `paths` entries). Where a PaySwap
contract shape owned by an authority lane is needed, it is re-declared
locally as a MINIMAL SUBSET-TYPED STRUCTURAL MIRROR with an
authority-naming doc comment (the accepted structural-pin pattern):

- `src/pins.ts` — the capability fabric mirrors: the definition base and
  its executable/non-executable arms, the layer-2 implementation subset
  (identity + the EXACT version-pin law), the layer-3
  `ConnectedInstancePin` (the INV-13 authorization scope), the
  `ProviderCatalogueEntryPin` (the INV-13 advertisement), the execution
  modes + `PinnedConnectorExecutionRequest` (the explicit-mode +
  protocol-authorization-link law), observation provenance, and the
  financial-effect classes;
- `src/pins-smart-contract.ts` — the smart-contract declaration (the
  declaration-completeness law) + the mirrored deterministic risk profile;
- `src/pins-settlement.ts` — the settlement attempt states/events, the
  IN_FLIGHT transition table and the OUTCOME_UNKNOWN exit law (INV-4);
- `src/pins-validation.ts` — the structural validators of the pinned
  subset (never re-owning the authority lanes' full laws).

Vocabulary VALUES are pinned byte-identical to the authority lanes; their
cross-lane consistency is asserted by test/pins.test.ts (value pinning,
never value imports — a value import would be a runtime dependency).
Machine-checked by test/boundary.test.ts: every src import is relative,
every test import is relative/vitest/scanner-infra, tsconfig carries no
`paths`, devDependencies are exactly typescript + vitest, and no
randomness/ambient-clock/locale/environment appears in src/**.

## 2. Chain families and the family-neutral core (INV-16/INV-17)

A chain family is a peer settlement-rail family classification — INV-17:
blockchain is ONE settlement rail family, never a parallel financial
system. The declared families (EVM, SOLANA, UTXO, MOVE, COSMOS, SUBSTRATE,
OTHER) each carry deterministic guidance-default semantics (address model,
finality model, reorg risk) in a frozen total table; the defaults are
DESCRIPTIVE ONLY — every chain descriptor declares its own finality
semantics and that declaration governs. The finality/reorg consistency
coupling is enforced: probabilistic or hybrid finality implies reorg risk
PRESENT; deterministic or instant implies NONE (reorg risk is never
assumed away). `OTHER` requires a declared family label.

The neutral chain identity is the canonical chain key
`${namespace}:${network}` (`CHAIN_KEY_PATTERN`). Family-specific shapes
(numeric chain ids, address/token standards, execution-cost model wording)
live EXCLUSIVELY in `src/family-extensions.ts` — the only module that may
carry them — and are carried through the neutral contracts ONLY as the
opaque, OPTIONAL `familyExtension` unions: a chain, asset, instance or
observation is fully valid without one (adversarially scanned).

## 3. The catalogue contracts (INV-13 — the catalogue never authorizes)

- **ChainDefinition** (layer 1, the pinned NON-executable arm) — the
  descriptive catalogue of a chain: canonical identity, family, display
  name, native asset reference, declared finality semantics, optional
  family extension. Deterministic identity: `id === chain.${chainKey}`. A
  chain catalogue entry is an OBSERVATION SURFACE: consequential writes
  are onchain execution capabilities, never chain definitions (the old
  `kind: "READ"` law, carried on the fabric's own executable/non-executable
  discriminator).
- **ChainImplementation** (layer 2, the pinned implementation subset) — a
  provider's concrete implementation of chain access + the canonical
  chainKey, with the EXACT capability-version pin.
- **ConnectedChainInstance** (layer 3, the pinned instance scope) — the
  ONLY chain-shaped authorization scope: real account/tenant,
  authorization, opaque credential scope, geography/currencies, permission
  state, eligibility, configuration + chainKey/family/instance extension,
  with the deterministic `chain.${chainKey}` capability-id linkage.
- **AssetDefinition** — the descriptive asset catalogue (canonical
  identity `${chainKey}/asset:${symbol}`, class, exact minor-unit scale,
  chain scope, optional declared PEG CLAIM — a claim, never an assumption,
  mandatory provenance).
- **AssetObservation** — an observation of external state (INV-7): a
  time-stamped report of an amount at an external location with MANDATORY
  freshness, provenance and observer identity, nominally branded
  (`observationKind: "AssetObservation"`), structurally never a balance,
  with no path to PaySwap custody. Exact integer minor units only (INV-2).
- **ProtocolDefinition** (the pinned EXECUTABLE arm) / implementation /
  connected instance — a deployed smart-contract system (DEX, bridge,
  lending market, intent network...). The descriptor composes the PINNED
  smart-contract declarations (never duplicated): every contract declares
  source/bytecode provenance, upgrade/admin/pause/oracle/custody
  properties in full — an undeclared property is rejected, never assumed;
  a custodial contract MUST name its custodian; every declared contract
  lives on the protocol's chain. Deterministic identities:
  `${chainKey}/protocol:${protocolKey}` and `protocol.${chainKey}:${protocolKey}`.

The catalogue-never-authorizes discipline is enforced at the execution
boundary: `assertConnectedChainInstance` rejects chain catalogue shapes
(chain definitions, bare descriptors) and provider catalogue entries (the
pinned advertisement shape) with the typed `CatalogueNotAuthorityError`;
anything else must validate as a genuinely connected instance.

## 4. The operation semantics table (INV-18/INV-20)

The six consequential-write operations (`onchain.transfer`, `.approval`,
`.contract_call`, `.swap`, `.bridge`, `.intent`) have exactly one frozen
semantics entry each: description, financial effect (RECONCILED to the
capability fabric's pinned classes — `CONSEQUENTIAL_EXTERNAL_EFFECT` for
value movement, `NO_EFFECT` for approval, which is security-consequential
but moves no value; the old per-side-effect vocabulary does not transfer),
reversibility, `consequentialWrite: true` (a literal — every operation
requires the protocol authorization link, INV-5), and the deterministic
required-field coupling enforced by the execution directive validator. The
generic contract interaction's financial effect is
`DECLARED_BY_CERTIFIED_METHOD` — never defaulted, never guessed (INV-20).
Unknown operations fail closed.

## 5. Wallet, signer and smart-account shapes (the non-custody law)

The custody vocabulary declares WHO controls keys (six models:
non-custodial external, self-custodial, smart account, custodial
provider, hardware, hybrid) — the material itself never appears. The
`SignerHandle` is an OPAQUE reference bound to a connected capability
instance; its validator rejects key-material-shaped ids (raw 32-byte hex,
± 0x prefix) outright — a handle that IS key material is a security
incident, not a handle (INV-19). `SmartAccountCapabilityDeclaration`
carries `permissionEnvelopeRequired: true` as a LITERAL type — an
unbounded smart-account capability is unconstructible; policy-limited
automation, session keys, batching and gas sponsorship are DECLARED
capabilities; the recovery model is declared, never assumed. The
agent-side smart-account shapes (session-key envelopes,
root-credential-in-context guards) are the intelligence lane's — never
duplicated here.

## 6. The onchain capability flavors

Eight flavors extend the pinned EXECUTABLE definition arm with an `onchain`
flavor declaration discriminated by `capabilityKind`: wallet, signer,
smart_account, onchain_execution, contract_interaction, dex, bridge,
intent. Deterministic dispatch: `validateOnchainCapabilityDefinition`
validates the pinned base, then exactly the declared flavor; unknown
discriminants and missing declarations fail closed. The structural safety
literals are unweakenable: `preBroadcastRecheckRequired: true` (INV-18),
`controlledEscapeHatch: true` + `certificationRequired: true` +
`unknownWritePolicy ∈ {BLOCK, REQUIRE_ESCALATION}` (INV-20 — there is no
allow-silent policy anywhere in the vocabulary).

## 7. The execution contracts (INV-4/INV-5/INV-6/INV-15/INV-1)

- **OnchainExecutionDirective** — the provider-neutral payload: operation,
  chainKey, family, opaque destination/spender references, canonical asset
  reference, exact amount, canonical protocol reference, MANDATORY expiry
  (the authorization layer evaluates it before authorization), the opaque
  signer handle, and an opaque family-scoped payload the core never
  interprets. Validated against the semantics table coupling.
- **OnchainExecutionRequest** — extends the pinned canonical connector
  execution request: explicit `executionMode` + `modeVocabularyVersion`
  ('1.0.0', the pinned versioned mode contract — INV-15: no mode
  including PASS_THROUGH_NATIVE bypasses protocol authorization),
  `capabilityInstanceId` (a connected instance, never a catalogue entry —
  INV-13), `idempotencyKey` (INV-6), and `protocolAuthorization`
  (commandId + principal + evidence reference — INV-5).
- **OnchainExecutionObservation** — an observation of an external attempt,
  UNKNOWN-capable: FAILED ⇒ failure descriptor REQUIRED; OUTCOME_UNKNOWN ⇒
  explicit reason REQUIRED and failure descriptor FORBIDDEN (INV-4);
  BROADCAST ⇒ finality candidate FORBIDDEN (submitted is not finality);
  evidence references MANDATORY (INV-5); a finality candidate, when
  present, is `candidateOnly: true` + `requiresProtocolFinality: true`
  (INV-1 — declaring finality from an observation is structurally
  impossible). No transport failure class exists: transport ambiguity is
  OUTCOME_UNKNOWN, never FAILED.

## 8. The settlement mapping (INV-1/INV-4/INV-17 — structural shapes only)

Onchain state enters PaySwap ONLY as observations mapped into the CANONICAL
settlement machinery owned by the Financial Protocol Authority:

- `onchainRailId(chainKey)` = `onchain.${chainKey}` — the deterministic
  rail id an onchain settlement attempt carries (INV-17);
- `mapObservationToRailOutcome` — total, deterministic, UNKNOWN-preserving:
  BROADCAST → PENDING (submitted not final), CONFIRMED → OBSERVED
  (finality CANDIDATE only), FAILED → FAILED, OUTCOME_UNKNOWN → UNKNOWN
  with `requiresReconciliation: true`;
- `settlementAttemptEventCandidate` — the pinned-machine-compatible event
  candidates; BROADCAST suggests NO event;
- `mapToRailOperation` — the observation→rail-operation linkage record
  referencing canonical instruction/attempt ids;
- `validateOnchainSettlementLinkage` — canonical ids + the deterministic
  rail id; `finalityRecordId` is an OPTIONAL id reference minted by the
  settlement FinalityAuthority — this package constructs no finality
  (`observationPermitsFinalityDeclaration` is structurally `false`).

## 9. Determinism and boundaries

No ambient clock, randomness, locale, environment, filesystem or network
in src/** (machine-checked). All validators are pure total functions;
validated records are deep-frozen. Identities are canonical and
deterministic (chain keys, asset refs, protocol refs, capability ids, rail
ids). Every file is ≤ 400 lines; no TS enum; no TS namespace. The
package-local acceptance battery is hermetic (`npm install --no-workspaces`
with devDependencies typescript + vitest ONLY) — see the evidence record
for receipts.

## 10. Deviations from the old repository (honest register)

The old `@payswap/connectors` §2A fourteen-part base, `kind: READ|ACTION`
and per-side-effect financial classifications do NOT transfer — they are
replaced by the capability fabric's discriminator/declaration law and
financial-effect classes via the structural pins (recorded in the evidence
record §3). The old sibling dependencies (@payswap/protocol,
@payswap/connectors, @payswap/capabilities) are replaced by the local
subset-typed pins. The old `OnchainCatalogueAuthorityError extends
ConnectorAuthorityError` is replaced by the local
`CatalogueNotAuthorityError extends OnchainDomainError` (the same typed
INV-13 rejection, structurally consistent with the capability lane's
taxonomy). Old invariant citations (INV-C05/C07/C09/E02/F01/F05/F06/X01/
X02/X03, rules 17/21/23/24/25/26/28/29, INV-SC01/SC03/SC04) map to the
canonical ids cited throughout.
