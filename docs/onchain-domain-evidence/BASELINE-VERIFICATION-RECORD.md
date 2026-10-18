# P4-W1 Baseline Verification Record — Onchain Domain

Work order: P4-W1 (spec/dependency/work-orders.md: "Chain/asset/protocol/
wallet/smart-account/onchain execution contracts, family-neutral").
Lane: R2-W1 (Phase 4, worker-1 — onchain; rebuild of the
accepted-then-lost P4-W1 work item).
Branch: `work/r2-w1` (base `69998881ab71a12e71b2e7d600c07dea292671d1` =
main at dispatch — the Phase-3-rebuilt state: agents, execution-graph and
zcode-bridge present and green; verified `git log --oneline -1` after
checkout: `6999888 MERGE R1-W2: execution-graph package — R1 WAVE
COMPLETE`).
Write surface: `packages/onchain-domain/**`, `spec/onchain-domain/**`,
`docs/onchain-domain-evidence/**` (pairwise-disjoint law — zero files
touched outside the surface; the package-local .gitignore is the only
additional artifact).
Old-repo evidence pin: `payswapdotorg/payswap.org@8a735bf1639198c43115087a2992555166a9acf9`
packages/onchain-domain — 11 src files / 3,294 lines, 145 tests in 11
files (mechanically recounted: adversarial 12, asset 17, boundary 5,
chain 24, execution 25, onchain-capabilities 13, onchain-protocol 12,
settlement-mapping 17, smoke 1, type-level 8, wallet 11). Evidence, NOT
authority — the PaySwap 3.0 architecture wins.

## 1. Battery receipts (exact commands, exit codes, counts)

All commands run from `packages/onchain-domain/` on Node v24.21.0 /
TypeScript 6.0.3 / vitest 3.2.7 (the CI-faithful, hermetic battery —
`npm install --no-workspaces` with devDependencies typescript + vitest
ONLY; no parent workspace walk-up masking; `rm -rf node_modules
package-lock.json` first).

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `rm -rf node_modules package-lock.json && npm install --no-workspaces` | 0 | typescript@6.0.3 + vitest@3.2.7 toolchain installed (warnings only: esbuild postinstall not in allowScripts — no impact) |
| 2 | `npx tsc --noEmit` | 0 | strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess + verbatimModuleSyntax, zero diagnostics (src + test + vitest.config.ts) |
| 3 | `npx vitest run` | 0 | **14 files / 197 tests, all PASS** (145 old-test semantics ported/adapted — 0 dropped, 0 weakened — plus 52 net-new test functions; per-file below) |

Per-file test counts (vitest): execution 27, chain 25, pins 24, asset 18,
settlement-mapping 18, onchain-capabilities 15, onchain-protocol 14,
adversarial 12, wallet 11, non-custody 9, boundary 9, type-level 8,
pins-smart-contract 5, smoke 2.

Runtime export surface (node --experimental-strip-types import of
src/index.ts): **102 exports** (prior-art oracle: 92 — beaten).

Every intermediate commit verified tsc-green in isolation:
- `4f1a3f2` (1/4 pinned wire shapes): tsc 0 diagnostics (types + frozen
  vocabularies + canonical identity constructors only).
- `67b24cf` (2/4 implementation): tsc 0 diagnostics.
- `652d61e` (3/4 test suite): tsc 0 + vitest 14f/197t.
- HEAD (4/4 spec + evidence): full battery above.

## 2. Old-suite porting account (145 old tests, 11 files)

| Old suite (tests) | New home | Ported/adapted | Dropped with reason |
|---|---|---|---|
| smoke.test.ts (1) | smoke.test.ts | 1 (verbatim PACKAGE_NAME surface) | — |
| chain.test.ts (24) | chain.test.ts | 24 (ADAPTED: `kind: "READ"` law → the fabric's `executable: false` non-executable arm — the same observation-surface law on the 3.0 discriminator; `ConnectorAuthorityError`/`OnchainCatalogueAuthorityError` → the local typed `CatalogueNotAuthorityError extends OnchainDomainError` (code CATALOGUE_NOT_AUTHORITY — the same INV-13 rejection); §2A fixtures → the pinned catalogue base; implementation fixtures gain the EXACT `capabilityVersion` pin (the 3.0 law)) | — |
| asset.test.ts (17) | asset.test.ts | 17 (verbatim semantics; observation validators imported from the split asset-observation module) | — |
| wallet.test.ts (11) | wallet.test.ts | 11 (verbatim; INV-SC03 citation → the permission-envelope literal) | — |
| execution.test.ts (25) | execution.test.ts | 25 (ADAPTED: canonicalRequest gains `modeVocabularyVersion: "1.0.0"` — the pinned versioned mode contract; old INV-C07/F05 citations → INV-5/INV-6) | — |
| onchain-protocol.test.ts (12) | onchain-protocol.test.ts | 12 (ADAPTED: `validateSmartContractExtension`/`assessSmartContractRisk` from @payswap/capabilities → the pinned structural mirror `validateSmartContractExtensionPin`/`assessPinnedSmartContractRisk` with identical expected profiles; "protocol definition is not an instance" assertion adapted to the 3.0 base — no instanceId/accountRef/tenantRef/authorization/credentialScope/permissionState on a definition + `executable: true` with an opaque execution declaration) | — |
| onchain-capabilities.test.ts (13) | onchain-capabilities.test.ts | 13 (ADAPTED: §2A baseRead/baseAction fixtures → the pinned base arms; the `validateCapabilityDefinition` cross-check → `validatePinnedDefinitionBase`; old rule 26/28 citations → INV-18/INV-20) | — |
| settlement-mapping.test.ts (17) | settlement-mapping.test.ts | 17 (ADAPTED: `settlementAttemptStateMachine` imported from @payswap/settlement → the PINNED transition table + OUTCOME_UNKNOWN exit law (byte-identical values, zero sibling imports); the IN_FLIGHT compiled-against proof runs against `pinnedInFlightTransition`; old INV-X01/X03/F06 citations → INV-4/INV-1) | — |
| adversarial.test.ts (12) | adversarial.test.ts | 12 (verbatim guard semantics; old INV-C09/rule-25/rule-17 citations → INV-7/INV-19/INV-16; the custody export scan unchanged — `WALLET_CUSTODY_MODELS`/`isWalletCustodyModel` remain the only custody-named exports) | — |
| type-level.test.ts (8) | type-level.test.ts | 8 (ADAPTED: old nominal-separation proofs against `Money`/`ExternalFundsPositionObservation` required TYPE-ONLY sibling imports — impossible under the zero-sibling law; equivalent guarantees asserted against LOCALLY DECLARED structural twins (a minimal ledger/balance twin with a different `observationKind` brand) and the pinned `ConnectedInstancePin`; layer-reuse proofs retarget the pinned arms; the INV-SC03/rule-28/INV-F06 literal proofs verbatim) | — |
| boundary.test.ts (5) | boundary.test.ts | 5 semantics across 9 tests (ADAPTED to the v1 hermetic law: old #1 declared-@payswap-deps+relative → src-relative-ONLY; old #2 deps-allowlist → ZERO runtime deps + devDeps-exactly-toolchain + NO tsconfig paths; old #3 test-import-surface → test specifiers relative/vitest/scanner-infra only, zero @payswap/*; old #4 test-deps-allowlist merged into the package.json law; old #5 no-runtime-imports merged into the src/test import laws. NET-NEW law tests: determinism scan, ≤400-line law, no-enum/namespace, node.d.ts cwd-as-function-once) | — |

**Ported/adapted total: 145 of 145 old-test semantics (0 dropped, 0
weakened).** Net-new: **52** (197 total − 145): pins.test.ts 24,
non-custody.test.ts 9, pins-smart-contract.test.ts 5, boundary +4,
execution +2, chain +1, asset +1, onchain-protocol +2,
onchain-capabilities +2, settlement-mapping +1, smoke +1.

## 3. Per-file adaptation receipts (old -> new src)

| Old source (payswap.org@8a735bf) | Lines | New source | Lines | Adaptation |
|---|---|---|---|---|
| src/index.ts | 52 | src/index.ts | 101 | law header updated to canonical INV ids; pins modules added to the export surface; PACKAGE_NAME moved to version.ts |
| src/family.ts | 165 | src/family.ts | 188 | PORT; switch dispatch → frozen total table + fail-closed lookup; own ValidationError |
| src/family-extensions.ts | 275 | src/family-extensions.ts | 296 | PORT; @payswap/protocol ValidationError → local; extension-family vocabulary frozen as const |
| src/chain.ts | 380 | src/chain.ts | 388 | ADAPT: §2A CapabilityDefinition base → pinned non-executable arm (`executable: false` + nonExecutableReason — the kind:READ law); `capabilityId` field → `id` (the fabric's field name); §2A base validation → validatePinnedDefinitionBase; §2A implementation validation → pinned implementation subset (+ the EXACT capabilityVersion pin law); ConnectedCapabilityInstance → ConnectedInstancePin; OnchainCatalogueAuthorityError/ConnectorAuthorityError → local CatalogueNotAuthorityError (both catalogue families rejected with the typed INV-13 error) |
| src/asset.ts | 424 | src/asset.ts + src/asset-observation.ts | 260 + 211 | PORT + SPLIT for the ≤400-line law (old file itself exceeded it); ObservationFreshness now locally owned (old: connectors import); provenance = ProvenanceDescriptorPin |
| src/operations.ts | 186 | src/operations.ts | 205 | PORT + RECONCILE: FinancialEffectClassification (NO_FINANCIAL_EFFECT/MOVES_VALUE/…) → the capability fabric's pinned classes (NO_EFFECT/OBSERVATION_ONLY/PENDING_EXTERNAL_COMMAND/CONSEQUENTIAL_EXTERNAL_EFFECT); MOVES_VALUE → CONSEQUENTIAL_EXTERNAL_EFFECT; approval NO_FINANCIAL_EFFECT → NO_EFFECT; DECLARED_BY_CERTIFIED_METHOD preserved (INV-20) |
| src/wallet.ts | 318 | src/wallet.ts | 330 | PORT; rule-25/INV-SC03 citations → INV-19/permission-envelope literal; RAW_KEY_MATERIAL_PATTERN exported for the adversarial probes |
| src/onchain-protocol.ts | 251 | src/onchain-protocol.ts | 274 | ADAPT: SmartContractExtension/@payswap/capabilities → SmartContractExtensionPin (the structural pin, composed verbatim — never duplicated); §2A base → pinned executable arm (`executable: true` + opaque `execution: object` — the 14-part law is the capability lane's); kind:ACTION → the discriminator law; deterministic identities unchanged |
| src/onchain-capabilities.ts | 407 | src/onchain-capabilities.ts + src/onchain-capability-validation.ts | 197 + 238 | PORT + SPLIT for the ≤400-line law (old file exceeded 400); §2A base → pinned executable arm; rule-26/28 literals → INV-18/INV-20 citations |
| src/execution.ts | 500 | src/execution-directive.ts + src/execution-observation.ts | 244 + 304 | PORT + SPLIT for the ≤400-line law (old file exceeded 400 by 100); ConnectorExecutionRequest → PinnedConnectorExecutionRequest (gains modeVocabularyVersion — the versioned mode contract); INV-C07/F05/E02/X01/F06 citations → INV-5/INV-6/INV-4/INV-1 |
| src/settlement-mapping.ts | 336 | src/settlement-mapping.ts | 397 | PORT; @payswap/settlement machine → the pinned states/events/IN_FLIGHT-transitions/OUTCOME_UNKNOWN-exits (structural shapes only); INV-X01/X02/X03/F06 → INV-4/INV-1 |
| (—) | — | src/version.ts | 74 | NET-NEW: ONCHAIN_DOMAIN_VERSION 1.0.0, provenance record, old-repo evidence pin (the accepted surface/zcode-bridge pattern) |
| (—) | — | src/errors.ts | 103 | NET-NEW: OnchainDomainError taxonomy (code/category/details — the structural discipline of the authority lanes' PaySwapError/CapabilityError), ValidationError, CatalogueNotAuthorityError |
| (—) | — | src/pins.ts | 384 | NET-NEW: the capability-fabric structural pins (definition arms, implementation subset, ConnectedInstancePin INV-13 scope, ProviderCatalogueEntryPin, execution modes + ConnectorExecutionRequest, observation provenance, financial-effect classes) — subset-typed, authority-naming doc comments, byte-identical vocabulary values |
| (—) | — | src/pins-validation.ts | 382 | NET-NEW: structural validators of the pinned subset (definition base discriminator law, INV-13 instance scope, advertisement guard, the explicit-mode + authorization-link request law, the exact version-pin law) |
| (—) | — | src/pins-smart-contract.ts | 303 | NET-NEW: the smart-contract declaration pin (the completeness law) + validateSmartContractExtensionPin + assessPinnedSmartContractRisk (the deterministic risk-profile mirror) |
| (—) | — | src/pins-settlement.ts | 131 | NET-NEW: the settlement machinery pins (states/events/IN_FLIGHT transitions/OUTCOME_UNKNOWN exits + the instruction/attempt/finality reference shapes) |
| (—) | — | src/shared.ts | 56 | NET-NEW: internal guards (the accepted zcode-bridge/capability discipline — one place so every law cites the same shape; NOT exported) |

## 4. Hard-constraint verification (program doctrine)

1. **Zero runtime dependencies; devDependencies typescript + vitest only** —
   package.json carries no `dependencies`; devDependencies sorted ==
   ["typescript", "vitest"]; machine-checked by test/boundary.test.ts.
2. **No `node:` imports in src/** — machine-checked (src specifiers are
   relative ONLY); the ambient node:fs/node:path declarations live in
   test/node.d.ts and are consumed by the test scanners only.
3. **test/node.d.ts: `process.cwd` as a FUNCTION global, declared exactly
   once** — `declare const process: { cwd(): string }`; exactly one
   `declare const process` occurrence; machine-checked.
4. **ZERO sibling imports** — no `@payswap/*` anywhere in src OR test;
   tsconfig.json has NO `paths` entries; machine-checked (src
   relative-only; test relative/vitest/node:fs/node:path only).
5. **File discipline ≤ ~400 lines** — max authored file 397 lines
   (src/settlement-mapping.ts); machine-checked over src + test + configs.
6. **Write surface** — `git diff --name-only
   69998881..HEAD` lists only packages/onchain-domain/**,
   spec/onchain-domain/**, docs/onchain-domain-evidence/** (+
   the package-local .gitignore). pnpm-workspace.yaml, pnpm-lock.yaml,
   MODULE-OWNERSHIP.yaml, .github/workflows and every other package
   untouched (integration = TL accept-time).

## 5. Findings

- **The lost prior build's "pins.ts" reference resolves.** The work order
  cites `packages/agents/src/pins.ts` as the accepted pattern; no such
  file exists at the base SHA (the R1-W1 agents rebuild used
  src/amount.ts as its type-only wire pin). The PATTERN (subset-typed
  structural mirrors with authority-naming doc comments) is what
  transfers; this rebuild names it `src/pins*.ts` inside the package,
  which is where the work order points consumers to look.
- **The 3.0 capability fabric changed the reconciliation surface.** The
  old package extended the §2A fourteen-part CapabilityDefinition (kind
  READ/ACTION) and the old FinancialEffectClassification vocabulary; the
  3.0 fabric (P2-W1, accepted) uses the executable/non-executable
  discriminated union + the fourteen-part declaration as the executable
  arm, and a 4-class FINANCIAL_EFFECT vocabulary. The onchain domain
  reconciles THROUGH the pins (see §3 receipts) — the old vocabulary does
  not transfer, by architecture.
- **The old execution.ts/asset.ts/onchain-capabilities.ts all exceeded
  400 lines** (500/424/407); each is split at a natural seam
  (directive vs observation; definition vs observation; flavor types vs
  dispatch validation).
- **The settlement mapping is now provably consistent without a
  dependency.** The old suite imported the real @payswap/settlement state
  machine for its compiled-against proof; this rebuild pins the machine's
  states/events/IN_FLIGHT transitions/OUTCOME_UNKNOWN exits byte-identical
  and asserts the mapping against the pins — cross-lane consistency
  becomes evidence recorded here (and TL-integration territory), while the
  package stays hermetic.
- **Old invariant numbering does not transfer** (the twice-recorded
  lesson): INV-C05→INV-13, INV-C07→INV-5, INV-C09/rule-21→INV-7,
  INV-E02→INV-5, INV-F01→INV-2, INV-F05→INV-6, INV-F06/rule-29→INV-1,
  INV-X01/X02/X03→INV-4, rule-17→INV-16, rule-23→INV-17, rule-26→INV-18,
  rule-25→INV-19, rule-28→INV-20, INV-SC01/SC04→the
  declaration-completeness law, INV-SC03→the permission-envelope literal.

## 6. Deviations from the prior-art oracle (recorded with reasons)

| # | Oracle | This rebuild | Reason |
|---|---|---|---|
| D-1 | 12 files / 163 tests | 14 test files / 197 tests; 20 src modules + shared.ts | The ≤400-line law forced splitting the old 3 oversized files; the zero-sibling law forced the pins modules; net-new suites (pins, non-custody) cover the 3.0 laws (the structural-pin reconciliation + the NON-CUSTODY document as executable guarantees) |
| D-2 | 92 runtime exports | 102 | The pins surface (mirrors + validators + vocabulary pins) is exported so P4-W2/P4-W3/P5 consumers can validate against the same pinned shapes without importing the authority lanes |
| D-3 | (implied) sibling type-only links like the accepted agents/execution-graph waves | ZERO sibling imports, NO tsconfig paths | The work order's layer law for THIS package is explicit (rails v1: zero sibling imports; re-declare minimal structural types locally) |
| D-4 | `kind: "READ"/"ACTION"` chain/protocol vocabulary | the fabric's executable/non-executable discriminator | The 3.0 capability fabric (accepted P2-W1) owns that law; the old vocabulary does not transfer |
| D-5 | old FinancialEffectClassification values | the fabric's pinned 4-class vocabulary + DECLARED_BY_CERTIFIED_METHOD | Reconciliation duty named by the work order ("onchain-capabilities must reconcile" with packages/capability/src) |
| D-6 | OnchainCatalogueAuthorityError extends ConnectorAuthorityError | CatalogueNotAuthorityError extends OnchainDomainError | Zero sibling imports; the local taxonomy mirrors the capability lane's CatalogueNotAuthorityError discipline (same code CATALOGUE_NOT_AUTHORITY, same INV-13 law) |
| D-7 | (old fixtures) §2A fourteen-part base | pinned catalogue base (id/version/class/provenance + discriminator + opaque execution) | The fourteen-part law is the capability lane's; the onchain domain requires its structural presence only |

## 7. Honest limitations

- The pins' cross-lane consistency is VALUE-pinned and test-asserted within
  this package; a live compile-time check against @payswap/capability /
  @payswap/protocol sources is TL accept-time integration territory (the
  accepted-wave pattern: sibling links land at integration, not in the
  worker lane).
- No onchain-security machinery (P4-W2), no EVM/Solana/UTXO adapters
  (P4-W3), no DEX/bridge/intent extension packs (P5-W2) — this package is
  exactly the P4-W1 vocabulary they build on.
- Sandbox verification only: no live chain I/O is claimed or exercised
  anywhere (observations are declared DATA; there is no transport in this
  package by construction).
