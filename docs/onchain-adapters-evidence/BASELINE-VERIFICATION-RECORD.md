# P4-W3 (R2-W3) Baseline Verification Record — Onchain Adapters

Work Order: P4-W3 (lane R2-W3; rebuild of the accepted-then-lost work item)
Branch: `work/r2-w3` (base `69998881ab71a12e71b2e7d600c07dea292671d1` = main, the Phase-3-rebuilt state — verified `git log --oneline -1` = `6999888 MERGE R1-W2: execution-graph package — R1 WAVE COMPLETE`)
Write surface: `packages/onchain-adapters/**`, `spec/onchain-adapters/**`, `docs/onchain-adapters-evidence/**` only.
Old-repo reference: `payswapdotorg/payswap.org @ 8a735bf1639198c43115087a2992555166a9acf9` (evidence, never authority — PaySwap 3.0 architecture wins).

## Battery (exact commands, exit codes, counts)

Run at the final work-tree state, inside `packages/onchain-adapters`, from a CLEAN state:

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `rm -rf node_modules package-lock.json && npm install --no-workspaces` | 0 | devDependencies typescript + vitest only (zero runtime deps) |
| 2 | `npx tsc --noEmit` | 0 | 0 diagnostics (strict + exactOptionalPropertyTypes + verbatimModuleSyntax + noUncheckedIndexedAccess) |
| 3 | `npx vitest run` | 0 | **15 files, 135/135 tests PASS** (~3.8s, deterministic, fully offline — no live-gated suites: GAP-02 law, nothing here claims live behavior) |
| 4 | import-smoke (`npx tsx -e "import(...)..."`) | 0 | **EXPORTS — core: 95, evm: 8, solana: 8, utxo: 6** (plain-Node type-stripping import; no TS enum anywhere) |

Per-file test counts (15 files / 135 tests):

| File | Tests | Coverage |
|---|---|---|
| boundary.test.ts | 13 | write-surface laws: relative imports only (src), no-sibling pins law, test-import allowlist, ≤400-line files (src+test), DETERMINISM LAW (no fetch/Buffer/process/timers), no Math.random/Date.now, manifest law, tsconfig-no-paths, no-enum, secret-literal guard (FAKE/PUBLIC registry), GAP-02 receipt (no live tree), core-barrel-never-imports-family |
| contract.test.ts | 15 | frozen family-adapter contract: per-family explicit lifecycle declaration (loop), identity/family/environment consistency, explicit semantics, append-only frozen evidence, undeclared-stage fail-closed, UTXO simulate unsupported |
| environment.test.ts | 11 | structural environment discriminator: frozen registry, fail-closed unknown keys, derived tokens, runtime re-derivation, testnet-never-production (envelope + forged class + branded token), public endpoint declarations, diversity law, environment class on every record |
| lifecycle-evm.test.ts | 8 | EVM golden nine-stage path (incl. EIP-712 payload binding, 1559 fee, finality candidate + guidance), settlement mapping (production), envelope chain-confusion, node-rejection table (FAILED/already-known/unclassified-UNKNOWN), unsupported operations, chain-id mismatch |
| lifecycle-solana.test.ts | 6 | Solana golden path (genesis cross-check, blockhash window, SIGNATURE_FEE, envelope payload), fork disappearance → UNKNOWN, signature err → FAILED, processed-only → BROADCAST, cluster mismatch, simulation fail-closed |
| lifecycle-utxo.test.ts | 8 | UTXO golden path gate-only (simulate unsupported), reorg vanish + containing-block change → UNKNOWN, in-mempool BROADCAST, unobserved-ref UNKNOWN, above-tip UNKNOWN, genesis mismatch, balances as OBSERVATIONS |
| unknown-paths.test.ts | 10 | reorg paths (vanishing receipt, changed block), canonical UNKNOWN settlement path, staleness guards (stale/future heads, prepare refusal, expired directive), expired handoff, drifted-recheck VOID, freshness window |
| unknown-paths-2.test.ts | 8 | finalize-ambiguous (ambiguous receipt status, above-head ×2), unreachable rails (head probe, post-submission broadcast, simulation ambiguity, position unobservable), deterministic reconciliation plan + non-UNKNOWN refusal |
| operation-machine.test.ts | 6 | NET-NEW: pure state-machine laws (authorize-before-broadcast, one-write-per-execution, reorg ambiguity, reconciliation-only exit, terminal monotonicity, IDLE-entry observations) + adapter enforcement (forged handoff refused, golden spine observable) |
| pins.test.ts | 19 | NET-NEW: structural-pin laws — directive operation-table coupling, key-material handle rejection, amount exactness, observation outcome couplings, catalogue-never-authorizes, settlement mapping totality + protocol-vocabulary membership, write-request validation, simulation law, canonical digest, secret boundary |
| secrets-boundary.test.ts | 5 | rule-25 negatives: key-material handles rejected at prepare, prepared/authorized/observations/mapping scan clean, EIP-712 payload clean |
| semantics.test.ts | 8 | explicit family semantics: exact-integer fees, inexpressible-requires-reason, verbatim UTXO rate, mempool-policy provenance, family mismatch, undeclared families, positive-integer guidance, frozen profiles |
| settlement-gate.test.ts | 6 | production-only envelope (TESTNET/REGTEST/SIMULATION refused), cross-chain confusion, canonical rail-outcome mapping, protocol event vocabulary, finality never permitted, full production mapping |
| smoke.test.ts | 3 | export surface covers every Work Order scope item; family subpaths |
| transport.test.ts | 9 | transport contracts: endpoint validation, unclassified chainKeys, PRODUCTION diversity, exact wire helpers, scripted-double determinism (unscripted = provider error; unreachability as data) |

Trees: src 56 files / 9,187 lines (max 396 — every file ≤ 400); test 20 files / 4,391 lines (max 385). Machine-checked by the boundary test on src AND test.

## Old-repo adaptation receipts (evidence → canonical)

The old deterministic suite could NOT be re-run in this station: its package.json depends on unpublished workspace siblings (`@payswap/onchain-domain`, `@payswap/onchain-security`, `@payswap/protocol`, `@payswap/trust`, `@payswap/connectors`, `@payswap/capabilities`) — `npm install --no-workspaces` 404s. Classification therefore proceeded from full source analysis of the old test tree at 8a735bf.

| Old file @ 8a735bf (source `it(` count; runtime incl. family loops) | Disposition | New home |
|---|---|---|
| contract.test.ts (12 source; ~20 runtime) | PORTED+ADAPTED (semantics half split out) | contract.test.ts (15) + semantics.test.ts (8) |
| environment.test.ts (11) | PORTED (diversity/endpoint checks split to transport.test.ts; settlement-envelope negatives consolidated into settlement-gate.test.ts) | environment.test.ts (11) + transport.test.ts (9) + settlement-gate.test.ts (6) |
| lifecycle-evm.test.ts (8) | PORTED (authorize now drives the injected kernel port; the real-kernel import is the composition root's) | lifecycle-evm.test.ts (8) |
| lifecycle-solana.test.ts (6) | PORTED (same kernel-port adaptation) | lifecycle-solana.test.ts (6) |
| lifecycle-utxo.test.ts (8) | PORTED (same kernel-port adaptation) | lifecycle-utxo.test.ts (8) |
| unknown-paths.test.ts (18) | PORTED (split into two files for the ≤400-line law) | unknown-paths.test.ts (10) + unknown-paths-2.test.ts (8) |
| no-vendor.test.ts (10) | SUPERSEDED by the accepted 3.0 boundary pattern (stronger: the old suite asserted `@payswap/*`-imports-ALLOWED; the 3.0 leaf-in-flight law asserts ZERO sibling imports + the determinism/no-I/O laws the old package did not carry) | boundary.test.ts (13) |
| secrets-boundary.test.ts (5) | PORTED (scanner ported with the derived-public-identifier exemption vocabulary) | secrets-boundary.test.ts (5) |
| smoke.test.ts (5) | PORTED (consolidated to 3 broader its) | smoke.test.ts (3) |
| helpers.ts (390) + adapter-fixture.ts (231) | PORTED as fixtures (scripted transports verbatim; the kernel seam gains the deterministic fake) | test/fixtures/{scripted-transport,world,adapters,fake-kernel}.ts |
| test/live/{evm,solana,utxo}.live.test.ts + capture.ts (3 suites) | **EXCLUDED — GAP-02**: credential/network-gated by the old repo's own config (`vitest.live.config.ts`, `npm run test:live`), NEVER part of deterministic evidence (migration-matrix note). Not ported; no live tree exists in this package (machine-checked by the boundary test). Live certification is P8. | — |

NET-NEW for the 3.0 laws: operation-machine.test.ts (6), pins.test.ts (19), plus the boundary extensions (determinism/no-I/O, GAP-02 receipt, core-barrel-never-imports-family, tsconfig-no-paths).

## Prior-art oracle comparison (the lost accepted build — reproduce or beat)

| Metric | Prior art (work/p4-w3) | This rebuild | Verdict |
|---|---|---|---|
| Battery files / tests | 13 / 126, all PASS | **15 / 135**, all PASS | BEAT |
| tsc diagnostics | 0 | 0 | TIED |
| Core barrel exports | 88 | **95** (runtime) | BEAT |
| Family subpath exports | evm 6 / solana 7 / utxo 6 | evm 8 / solana 8 / utxo 6 | BEAT/TIED |
| src tree | 47 files / 8,962 lines (max 399) | **56 files / 9,187 lines** (max 396) | BEAT |
| test tree | 18 files / 4,055 lines (max 372) | **20 files / 4,391 lines** (max 385) | BEAT |
| Every file ≤ 400 | yes (machine-checked) | yes (machine-checked) | TIED |
| Old deterministic evidence classified | 82 (live excluded per GAP-02) | all 9 files classified file-by-file; live excluded-with-reason | TIED |

## Work-order scope → implementation receipts

1. **Adapter contracts** — the frozen nine-stage `ChainFamilyAdapter` interface + explicit per-stage support (unsupported fails closed: UTXO simulate) + per-stage IO types (`contract/*`). Tests: 15 + family lifecycles.
2. **Transport shapes** — vendor-neutral `RpcTransport`/`RestTransport` CONTRACTS (zero I/O in this package — the 3.0 determinism law), endpoint profiles, call-level provenance, result unions with unreachability as data, the PRODUCTION provider-diversity law, exact-integer wire helpers. Tests: 9 + boundary.
3. **Environment/semantics mapping** — the structural environment discriminator (registry + branded types + re-derivation) + explicit family fee/finality/reorg profiles with fail-closed inexpressibility. Tests: 11 + 8.
4. **Lifecycle management** — the shared `BaseChainFamilyAdapter` machinery + the NET-NEW pure operation state machine (authorize-before-broadcast, one-write-per-execution, reorg ambiguity, reconciliation-only exit, terminal monotonicity). Tests: 6 + enforcement paths.
5. **Settlement gate** — the production-only envelope + the pinned canonical mapping (rail id, rail outcomes, attempt-event candidates as members of the accepted protocol vocabulary) + the protocol-owned-finality restatement. Tests: 6 + family mappings.
6. **Error taxonomy** — the self-contained PaySwapError-shaped taxonomy (six adapter error classes + ValidationError base). Exercised across every fail-closed path.
7. **Deterministic law (no live network calls)** — the whole battery runs offline; transports are contracts; scripted doubles never invent provider answers; GAP-02 receipt machine-checked.

## Write-surface compliance

`git diff --stat 6999888..HEAD` touches ONLY: `packages/onchain-adapters/**` (80 files), `spec/onchain-adapters/ONCHAIN-ADAPTERS.md`, `docs/onchain-adapters-evidence/BASELINE-VERIFICATION-RECORD.md`. No sibling package trees (P4-W1/P4-W2 in flight — pairwise-disjoint law held), no accepted P1–P3 trees, no root manifest/workflow/architecture files (CI matrix + ownership annotation are TL accept-time integration, per the work order).

## Honest deviations (complete list)

1. **The onchain-security kernel is an INJECTED PORT, not an import** (the agents-lane authority-port pattern). The old adapters hard-imported `OnchainWritePipeline`; the 3.0 leaf-in-flight law forbids sibling imports, and P4-W2 is in flight. The port mirrors the old pipeline's public step surface stage-for-stage; the battery drives a deterministic fake (configurable only in the fail-closed directions). The old tests' authorize-stage scenarios (ALLOW golden path, drifted-recheck VOID, expired handoff) are preserved through the port.
2. **The concrete fetch-based transports are NOT ported** (HttpJsonRpcTransport/HttpRestTransport with endpoint failover over globalThis.fetch): the 3.0 determinism law makes transports CONTRACTS with zero I/O in src. The failover/provenance DISCIPLINE (first-reachable-endpoint serves, served-by recording, unreachable-as-data) is pinned in the contract shapes; production HTTP wiring is composition-root work.
3. **`Buffer`-dependent base64 replaced by a pure codec** (solana/base58.ts): the old `#deriveFee` used Node's Buffer; the boundary law forbids ambient host globals in src.
4. **File-law decomposition**: the old single-file modules (lifecycle 824, evm 897, solana 872, utxo 792 lines) are split into per-concern modules (56 src files) with the `FamilyStageContext` seam — the ≤400-line law is machine-checked on src AND test, which the old repo did not enforce.
5. **The old no-vendor law (`src/** imports ONLY @payswap/* + relative`) is INVERTED** to the 3.0 leaf-in-flight law (ZERO sibling imports; structural pins locally). Stronger, not weaker: the boundary test asserts every src module specifier is relative.
6. **Secret-literal guard extended with a PUBLIC-identifier registry**: base58 alphabets, chain genesis hashes, blockhash/address fixtures are long mixed-class literals that are PUBLIC constants; each is line-annotated `PUBLIC` and the boundary test exempts annotated lines (FAKE marker unchanged for synthetic credential fixtures). Without this, honest public-identity constants would be merge-blocked.
7. **`settlementAttemptEventCandidate` asserts vocabulary membership, not the protocol state machine**: the old test imported `@payswap/settlement`'s state machine directly; the 3.0 battery asserts the candidate literals are members of the accepted protocol vocabulary by name (recorded in test comments) — the definitive wiring is TL integration.
8. **The old suite's runtime test count** (MMP-18 says 9f/90t; the work-order brief says 82; source analysis counts 83 `it(` declarations / ~91 runtime with the family loop) could not be reconciled by execution (see adaptation receipts — the old suite cannot install). The classification table records source-level counts; this rebuild ports every deterministic scenario and adds net-new coverage (135 total).
9. **Old `node:` usage**: none existed in the old src (verified); the 3.0 battery adds the machine check anyway.

## Findings (severity-ranked, top 3)

1. **[S2] The authorized-write set is per-adapter-instance and in-memory.** The authorize-before-broadcast law is enforced by the tracker's authorized-write set and execution bindings, which reset on restart (the durable-persistence deferral). Within a process lifetime the law is total; cross-restart, a composition root must re-derive authorization from persisted evidence before broadcasting.
2. **[S2] The kernel-port fake's gates approximate the real gate dimensions.** The deterministic fake evaluates chains/assets/destinations/routes/unlimited-approvals — the dimensions the adapter contract depends on — but the real P4-W2 kernel owns the full gate semantics. The port's structural shape (not the fake's policy table) is the integration contract; drift risk is bounded by the TL wiring's type-level assertion.
3. **[S3] The Solana raw-text lamports extraction regex (`/"value"\s*:\s*(\d+)/`) assumes the response layout.** A provider that reorders JSON fields or nests differently returns POSITION_UNOBSERVABLE (fail closed — never a fabricated balance), but a layout change would degrade observations until the parser is updated. The same discipline governs the UTXO fee-bucket raw-text extraction.
