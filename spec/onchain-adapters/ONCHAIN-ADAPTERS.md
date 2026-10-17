# PaySwap 3.0 — Onchain Adapters (Work Order P4-W3, lane R2-W3)

Status: IMPLEMENTED (Phase 4, lane worker-3; rebuild of the accepted-then-lost P4-W3 work item on the Phase-3-rebuilt main).
Package: `@payswap/onchain-adapters` (`packages/onchain-adapters`) — the DETERMINISTIC multi-chain adapter contract layer: EVM/Solana/UTXO chain-family adapters implementing the frozen nine-stage adapter lifecycle (observe → prepare → simulate → authorize → broadcast → observe → finality → reconcile → evidence) behind injected provider transports, feeding the onchain-security kernel through an injected structural port and mapping observations into the canonical settlement vocabulary behind a production-only gate.
Layer: `rails` (MODULE-OWNERSHIP law: may_depend_on [contracts, capability, trust, financial]). For THIS wave the package is DELIBERATELY dependency-free (the accepted leaf-in-flight pattern of `@payswap/provider-runtime`): zero runtime deps, zero `@payswap/*` imports, zero `node:` imports in src — the onchain-domain (P4-W1, in flight under the pairwise-disjoint law) and onchain-security (P4-W2, in flight) contract shapes are LOCAL STRUCTURAL PINS (`src/pins/*`), structurally identical to the old-repo reference and wired by the TL at integration.

Old-repo evidence (never authority): `payswapdotorg/payswap.org @ 8a735bf1639198c43115087a2992555166a9acf9` — `packages/onchain-adapters` (src 11 files / 4,996 lines; deterministic tests 9 files, MMP-18; 3 live suites network-gated by the old repo's own config and NEVER deterministic evidence — GAP-02). The old suite could not be re-run in the R2-W3 station (its package.json requires unpublished workspace siblings); classification proceeded from source analysis, recorded file-by-file in the baseline verification record.

## The determinism law (the 3.0 adaptation)

Transports are CONTRACTS — typed request/response shapes (`RpcTransport` / `RestTransport` ports, `EndpointProfile`, `ServedBy` provenance, `RpcCallResult` / `RestCallResult` unions with `TRANSPORT_UNREACHABLE` as a reachability FACT). NOTHING in this package performs I/O: the old repo's concrete fetch-based HTTP transports (`HttpJsonRpcTransport` / `HttpRestTransport`) are deliberately NOT ported — concrete transport wiring is composition-root work, injected against these ports. The per-operation lifecycle is a PURE STATE MACHINE (`src/lifecycle/operation-machine.ts`). `Date.now` never appears in src (observation instants are inputs; `Date.parse`/`new Date(ms)` formatting is deterministic); no entropy anywhere (deterministic sequence evidence ids, FNV-1a content digests — binding-never-security). The boundary test machine-checks all of it.

## Canonical law mapping

| Law | Enforced in |
|---|---|
| Submitted ≠ finality (rule 29) | observation outcome couplings (pinned validator: BROADCAST never carries a finality candidate); `RAIL_EFFECT_PENDING` mapping; `submittedNotFinal` literal |
| UNKNOWN ≠ FAILED (INV-X01/INV-04 discipline) | outcome unions; broadcast/observe-result classification tables (unclassified provider responses and post-submission unreachability are OUTCOME_UNKNOWN); the state machine's reorg law (CONFIRMED → UNKNOWN, never FAILED) |
| Blind retry structurally forbidden (INV-X02) | the operation state machine: NO transition exists from OUTCOME_UNKNOWN back to AUTHORIZED/BROADCAST; `ReconciliationPlan.blindRetryForbidden` is a literal `true` |
| Reconciliation is the only resolver (INV-X03) | `ReconciliationPlan.resolver: 'SETTLEMENT_RECONCILIATION_AUTHORITY'`; the state machine's only OUTCOME_UNKNOWN exit is PLAN_RECONCILIATION |
| Finality is protocol-owned (INV-F06) | `OnchainFinalityCandidate` literals (`candidateOnly`/`requiresProtocolFinality`); `adapterObservationPermitsFinalityDeclaration()` is `false` always; the settlement gate never constructs a finality record |
| Testnet never production | the STRUCTURAL environment discriminator: frozen chain-identity registry + branded `RailEnvironment<Class>` + runtime re-derivation (a forged class string cannot pass); the production settlement envelope re-classifies the chainKey |
| Catalogue never authorizes (INV-C05) | `assertOnchainExecutionScope` rejects chain catalogue shapes at prepare |
| External positions are OBSERVATIONS, never custody | `AssetPositionProbe` / pinned `AssetObservation` (freshness + provenance; no balance type exists in this package) |
| Money exactness | exact integer decimal strings everywhere (wire helpers `parseExactDecimal` / `hexQuantityToDecimal`; Solana raw-text lamports extraction above MAX_SAFE_INTEGER; UTXO verbatim fee-bucket text) |
| Semantics explicit per family; fail closed when inexpressible | `semantics.ts` + `SemanticNotExpressibleError` (EVM non-1559 blocks, missing UTXO fee buckets, unpriceable Solana messages) |
| No vendor is a core dependency | transport contracts + the PRODUCTION provider-diversity law (≥ 2 distinct providers); the public endpoint profiles are declared DATA, never auto-connected |
| Secrets never enter agent-facing contracts (rule 25 / INV-19) | `secrets.ts` (the ported secret-boundary kernel: forbidden key names, secret-shaped values, derived-public-identifier exemptions) + every adapter-authored artifact scanned at construction |
| The adapter never authorizes (kernel owns authority) | the INJECTED `OnchainSecurityKernelPort` (the agents-lane authority-port pattern): gates → expectedDiff → authorizationRequest → artifact → recheck → handoff; no ALLOW, no handoff; BLOCK never overridden; VOIDED recheck → re-request |

## The lifecycle spine (the frozen contract)

`observe` (heads + positions as observations; unreachable = availability UNKNOWN) → `prepare` (validated directive + connected instance + fresh head → kernel write request + family plan; chain-identity cross-checks: EVM `eth_chainId`, Solana genesis hash, UTXO genesis block) → `simulate` (an OBSERVATION, never authority; UTXO declares it UNSUPPORTED and fails closed) → `authorize` (the injected kernel port; deterministic instants at/+1/+2) → `broadcast` (the trusted-surface-signed payload; deterministic node-rejection tables; unclassified → UNKNOWN) → `observe` result (receipts / signature statuses / tx status with reorg+fork detection via remembered confirmation anchors) → `finality` (candidate vs declared family guidance — never finality) → `reconcile` (OUTCOME_UNKNOWN only; instructions, never resolution) → `evidence` (append-only, deterministic sequence refs).

The per-operation tracker (`operation-machine.ts`, NET-NEW) makes the spine laws mechanical: authorize-before-broadcast (the BROADCAST event exists only over authorized writes — the authorized-write set is the proof), one-write-per-execution binding, reorg ambiguity, reconciliation as the ONLY exit from UNKNOWN, terminal monotonicity. Observable via `adapter.operationLifecycle(executionRef)`; enforced fail-closed inside `assertBroadcastable` / `evaluateFinality` / `reconciliationPlan`.

## Family modules (subpath exports; the core barrel never imports them)

- **EVM** (`@payswap/onchain-adapters/evm`): GAS_AUCTION/EIP-1559 fees (non-1559 blocks fail closed — no legacy approximation), ERC20 transfer/approve + native transfer encoding, family-owned EIP-712 typed-data signing adapter (the trusted surface signs), receipt-based observation with containing-block reorg detection.
- **Solana** (`/solana`): SIGNATURE_FEE via `getFeeForMessage` on a minimal 1-signature message built from the decoded blockhash (pure base58/base64 codecs — zero ambient host APIs), the raw-text lamports EXACTNESS LAW, signature-status observation with fork detection, signing-envelope authorization binding.
- **UTXO** (`/utxo`): SATOSHI_PER_VBYTE fees as verbatim decimal text with a provenanced MempoolPolicy declaration (BIP-125/CPFP), genesis-block identity verification, SIMULATE structurally unsupported (`UnsupportedLifecycleStageError`), Esplora-style status observation with depth + reorg detection.

## Settlement mapping (no parallel ledger)

Adapters map into the canonical settlement machinery through the PINNED mapping vocabulary (`src/pins/onchain-domain/settlement-mapping.ts`), RECONCILED with the ACCEPTED `@payswap/protocol` settlement-attempt event vocabulary: the candidate literals (`CONFIRM_SUCCEEDED` / `CONFIRM_FAILED` / `OUTCOME_UNKNOWN`) are by-name members of the accepted protocol machine's events (machine-checked by test; the TL wiring asserts structural identity at integration). The production gate (`settlement-gate.ts`) is the one thing the neutral vocabulary deliberately does not carry: only a PRODUCTION envelope (structural + runtime re-derived from chain identity) may map observations; cross-chain observations are chain-confusion attacks and fail closed.

## Determinism and test discipline

All battery time is caller-supplied (`NOW` fixtures); transports are SCRIPTED doubles (an unscripted call is a provider ERROR — an invented answer would be fake success); the kernel port double is deterministic and configurable only in its fail-closed directions (BLOCK / recheck-VOID). 15 files / 135 tests, fully offline. The boundary test machine-checks: relative-imports-only src (zero siblings, zero `node:`), test-import allowlist, ≤400-line files (src AND test), no fetch/Buffer/process/timers/Math.random/Date.now in src, tsconfig without paths, the manifest law, no TS enum, secret-literal guard with an explicit PUBLIC-identifier registry, the GAP-02 receipt (no live tree), and the core-barrel-never-imports-family law.

## Deferral register (honest limitations — each a DELIVERABLE, not a hidden gap)

1. **Structural pins, not sibling links**: the onchain-domain/onchain-security shapes are LOCAL mirrors until P4-W1/P4-W2 land; the TL wiring (type-level assertion + runtime link, the accepted integration pattern) is integration work recorded here, not done covertly.
2. **The kernel port is a seam, not the kernel**: authorize-stage authority semantics live with P4-W2; this package drives the port and fails closed at every step. The deterministic fake proves the plumbing, never authorization strength.
3. **Concrete transport wiring (production HTTP with endpoint failover) is composition-root work**: the ports and the failover/provenance DISCIPLINE are pinned here; the old repo's fetch transports were live-coupled and are not ported (deviation recorded).
4. **In-memory evidence/anchors/tracker**: durable persistence is a separately-accepted Work Order (the same deferral law as the accepted lanes).
5. **Family coverage waves**: Solana SPL token positions/transfers and UTXO consolidation/coin-selection are not declared (fail closed — never approximated); DEX/bridge/intent packs are P5-W2.
6. **Live certification is P8**: nothing here claims live behavior (GAP-02 law); the old repo's 3 live suites are excluded-with-reason in the evidence record.
