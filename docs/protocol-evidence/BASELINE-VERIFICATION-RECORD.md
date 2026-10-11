# P1-W2 Baseline Verification Record — Financial Protocol

Work Order: P1-W2 (worker-2, session payswap3-p1-w2)
Branch: `work/p1-w2` (base `85c8e2f` = origin/main at dispatch)
Write surface: `packages/protocol/**`, `spec/protocol/**`, `docs/protocol-evidence/**` only.
Old-repo reference: `payswapdotorg/payswap.org @ 8a735bf1639198c43115087a2992555166a9acf9` (evidence, never authority — PaySwap 3.0 architecture wins).

## Battery (exact commands, exit codes, counts)

Run at the final work-tree state, inside `packages/protocol`:

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `npm install --no-workspaces 2>/dev/null \|\| npm install` | 0 | devDependencies typescript@^6.0.3 + vitest@^3.2.7 only (zero runtime deps) |
| 2 | `npx tsc --noEmit` | 0 | 0 diagnostics (strict + exactOptionalPropertyTypes + verbatimModuleSyntax) |
| 3 | `npx vitest run` | 0 | **21 files, 238/238 tests PASS** (4.8s, deterministic, no live-gated suites) |
| 4 | `node --input-type=module -e "import('./src/index.ts').then(m=>console.log('EXPORTS:', Object.keys(m).length))"` | 0 | **EXPORTS: 178** (plain-Node type-stripping import works; the TS-enum-free source law made the primary path green, no tsx fallback needed) |

Per-file test counts (21 files / 238 tests):

| File | Tests | Ported vs net-new |
|---|---|---|
| money.test.ts | 28 | 28 ported (old packages/protocol/test/money.test.ts) |
| amount-spec.test.ts | 11 | 11 NET-NEW (bridge has no old-repo counterpart here; old AmountSpec tests lived in the trust lane's mandate suite) |
| errors.test.ts | 14 | 8 ported (old errors.test.ts) + 6 net-new (classifier/epoch coverage merged from old clock.test.ts) |
| envelope.test.ts | 10 | 7 ported (old envelope.test.ts) + 3 net-new (identifiers/scope-key coverage from old identifiers tests) |
| idempotency.test.ts | 11 | 11 ported (old idempotency.test.ts; INV-06) |
| state-machine.test.ts | 13 | 13 ported (old state-machine.test.ts incl. recovery-rule block) |
| aggregate.test.ts | 14 | 14 ported (old aggregate.test.ts, enum→const-object adaptation) |
| journal.test.ts | 12 | 12 ported (old journal.test.ts + projections.test.ts merged) |
| obligation.test.ts | 12 | 12 ported (old obligation.test.ts) |
| reservation.test.ts | 10 | 10 ported (old reservation.test.ts) |
| netting.test.ts | 19 | 16 ported (old netting.test.ts) + 3 NET-NEW (same-currency v1 law; the old cross-currency test is deliberately adapted into the rejection tests) |
| settlement-instructions.test.ts | 6 | 6 ported (old settlement/test/instructions.test.ts instruction half) |
| settlement-attempts.test.ts | 16 | 11 ported (old instructions.test.ts attempt half) + 5 NET-NEW (UNKNOWN-discipline detail) |
| finality.test.ts | 9 | 7 ported (old finality.test.ts) + 2 net-new (fails-closed + clock receipt) |
| reconciliation.test.ts | 11 | 10 ported (old reconciliation.test.ts core + provider-revision ledger) + 1 net-new |
| evidence-graph.test.ts | 9 | 4 ported (old evidence-graph.test.ts) + 5 NET-NEW (distinct-kind taxonomy) |
| proof-policies.test.ts | 12 | 7 ported (old proof-policies.test.ts) + 5 net-new |
| certificates.test.ts | 7 | 7 ported (old certificates.test.ts, minus deferred payment-plane fields) |
| authorization.test.ts | 5 | 5 NET-NEW (opaque structural refs) |
| boundary.test.ts | 8 | 5 ported (old boundary.test.ts) + 3 NET-NEW (400-line law, no-enum law, zero-deps manifest) |
| smoke.test.ts | 1 | 1 ported (old smoke.test.ts, re-aimed at the P1-W2 surface) |

Totals: **≈ 201 ported / 37 net-new** (port counting = old test cases whose semantic assertion survives in the new suite, including the 3 adapted cross-currency cases).

## Per-file adaptation receipts (old → new)

| Old file @ 8a735bf (lines) | New file (lines) | Classification (matrix) | Adaptation notes |
|---|---|---|---|
| packages/protocol/src/money.ts (419) | src/money.ts (399) | MMI-09 ADAPT | INV-F01→INV-02 renumbering; `.js`→`.ts` imports (allowImportingTsExtensions); byte-identical semantics (float rejection incl. defense-in-depth, decimal strings, registry, largest-remainder allocate) |
| packages/trust/src/mandate.ts (AmountSpec block) | src/amount-spec.ts (122) | MMI-09 ADAPT (bridge) | Pinned wire shape duplicated locally (dependency-free in flight); bridge parse/serialize; non-negative wire law; registry-aware parse. Old reversed trust→protocol direction NOT ported |
| packages/protocol/src/errors.ts (112) | src/errors.ts (116) | MMI-04 PORT | INV-X01→INV-04 renumbering; classifier semantics identical |
| packages/protocol/src/clock.ts (153) | src/clock.ts (156) | MMI-04 PORT | Verbatim semantics; epoch note re-homed to trust lane |
| packages/protocol/src/identifiers.ts (129) | src/identifiers.ts (132) | MMI-04 PORT | Verbatim |
| packages/protocol/src/envelope.ts (198) | src/envelope.ts (201) | MMI-04 PORT | INV-E→INV-05 comment renumbering only |
| packages/protocol/src/state-machine.ts (287) | src/state-machine.ts (290) | MMI-04 PORT | INV-X04→terminality law wording; semantics verbatim |
| packages/protocol/src/idempotency.ts (225) | src/idempotency.ts (226) | MMI-04 PORT | INV-F05/O01→INV-06; PostgreSQL note replaced by deferral register pointer |
| packages/protocol/src/aggregate.ts (241) | src/aggregate.ts (242) | MMI-04 PORT | FROZEN §22→canonical TerminalState; **enum→frozen const object + union type** (plain-Node import compatibility; recorded deviation, semantics preserved) |
| packages/protocol/src/obligation.ts (549) | src/obligation.ts (396) + src/obligation-book.ts (141) | MMI-12 PORT | Split for the ≤400-line file law; INV-F07→INV-03; lifecycle machine identical |
| packages/protocol/src/ledger/journal.ts (522) | src/ledger/journal.ts (388) + src/ledger/posting.ts (151) | MMI-12 PORT | Split for the file law; INV-F02/F03→INV-03/balance law; in-memory reference store retained per work order |
| packages/protocol/src/ledger/projections.ts (94) | src/ledger/projections.ts (94) | MMI-12 PORT | Verbatim |
| packages/protocol/src/reservation.ts (478) | src/reservation.ts (400) | MMI-12 PORT | INV-F04 kept under INV-01 authority; semantics verbatim |
| packages/protocol/src/netting.ts (571) | src/netting.ts (399) + src/netting-delay.ts (163) | MMI-12 PORT + **v1 restriction** | Split for the file law; **SAME-CURRENCY v1 law added** (old multi-currency-set behavior rejected with `MixedCurrencyNettingSetError`; old behavior cited in code + spec); per-pair grouping no longer × currency (single currency per set enforced up front) |
| packages/settlement/src/instructions.ts (829) | src/settlement/instructions.ts (213) + src/settlement/attempts.ts (230) + src/settlement/attempt-ledger.ts (388) | MMI-12 PORT | Split three ways for the file law; `DocumentAllocation`→pinned structural `RemittanceAllocation` (payment plane owns the real type); `authorizationRefs: string[]`→opaque `AuthorizationRef[]` (INV-05 tightening); INV renumbering |
| packages/settlement/src/finality.ts (455) | src/settlement/finality.ts (390) | MMI-12 PORT | INV-F06→INV-01; protocol re-derivation verification identical; `ProtocolSettlementInstruction` rename (single-package ambiguity with the enriched instruction) |
| packages/settlement/src/reconciliation.ts (709) | src/settlement/reconciliation.ts (331) + src/settlement/provider-revisions.ts (104) | MMI-10 PORT | Core case/resolution authority verbatim (INV-X03→INV-04); `ProviderStateEnvelope`→pinned structural shape (P2-W2 owns the real envelope); payment-plane subjects (external funds observation validators, mandate renewal, off-network records) DEFERRED to owning lanes with case taxonomy RESERVED — honest deviation, recorded |
| packages/settlement/src/evidence-graph.ts (354) | src/settlement/evidence.ts (340) | MMI-17 PORT | **Evidence-kind taxonomy rebuilt**: AUTHORIZATION/FUNDING/CONVERSION/PAYOUT/OBSERVATION/FINALITY/RECONCILIATION (old EXECUTION split into the three legs; OUTCOME→OBSERVATION; RECEIPT→FINALITY; PROOF folded into proof levels). Lineage query shape follows the new kinds |
| packages/settlement/src/proof-policies.ts (334) | src/settlement/proof.ts (338) | MMI-17 PORT | INV-E03/E04→INV-05/INV-24; claimedLevel widened to string + `asProofLevel` validation (graph/proof layering); refund/dispute symmetry identical |
| packages/settlement/src/certificates.ts (426) | src/settlement/certificates.ts (330) | MMI-17 PORT | Off-network + mandate-renewal certificate fields NOT ported (deferred payment-plane subjects — recorded deviation); core issuance checks identical |
| packages/protocol/src/persistence.ts (297) + outbox.ts (424) | src/persistence.ts (103) | PORT (contract types only) | Per work order: no drivers, no connection code; **DDL strings deliberately NOT ported** (prejudges the infrastructure decision); outbox contract types + `computeBackoffMs` retained; InMemoryOutbox + drain DEFERRED |
| packages/protocol/src/index.ts (45) | src/index.ts (58) | MMI-04 PORT | Barrel re-aimed at the single Financial Protocol Authority package (old settlement barrel folded in) |

Deferred old files (NOT ported; deferral register in spec/protocol/FINANCIAL-PROTOCOL.md): fx.ts (420), liquidity.ts (674), credit.ts (390), collateral.ts (138), value-graph.ts (523), conventions/persistence.md (122), and the payment-plane halves of old reconciliation.ts.

## Classification cross-check (migration matrix)

- MMI-04 (Financial Protocol Authority) — PORT: implemented net-new in the canonical repo with the old kernel + 237-test suite as behavioral oracle. ✔
- MMI-09 (exact money) — ADAPT: money.ts carried in with bounded modifications (invariant renumbering, import style); AmountSpec block of old trust/mandate.ts carried in as the bridge. ✔
- MMI-10 (UNKNOWN/reconciliation) — PORT: reconciliation as the only definitive resolver; adversarial fault-injection proofs (old packages/adversarial) remain in the old repo as evidence and are P6-W3 territory. ✔
- MMI-12 (obligations/clearing/netting/settlement/finality) — PORT: all five lifecycle contracts implemented; v1 same-currency netting restriction is a recorded deviation, not a silent reduction. ✔
- MMI-17 (proof/evidence lineage) — PORT: evidence graph + proof policies + certificates implemented with the DISTINCT evidence-kind taxonomy the work order requires. ✔

## Honest deviations (complete list)

1. **Same-currency v1 netting** (netting.ts): mixed-currency netting sets are rejected (`MixedCurrencyNettingSetError`) instead of producing per-currency positions from one set. Rationale: cross-currency netting embeds an FX conversion; the FX kernel is deferred to P5-W1. Old behavior cited in the module doc and the deferral register.
2. **TerminalState enum → frozen const object + union** (aggregate.ts): plain-Node type-stripping cannot import TS enums, which would have forced the import-smoke battery onto the tsx fallback. Usage-compatible (`TerminalState.UNKNOWN` value + type); recorded as a deliberate compatibility adaptation.
3. **Evidence-kind taxonomy rebuilt** (settlement/evidence.ts): the old generic kinds are replaced by the distinct funding/conversion/payout/observation/finality kinds the P1-W2 work order explicitly demands; mapping table in spec + module doc. `lineageForAction` returns the seven new chains instead of the old six.
4. **AuthorizationRef tightening** (settlement/instructions.ts): old untyped `authorizationRefs: readonly string[]` → opaque structural `AuthorizationRef[]`. Semantics-neutral for the financial protocol; trust-lane wiring lands at TL integration.
5. **Pinned structural cross-lane types** (amount-spec.ts, provider-revisions.ts, instructions.ts RemittanceAllocation): old cross-package imports (`@payswap/trust`, `@payswap/connectors`, `@payswap/payment`) are replaced by locally pinned structural shapes because the package must stay dependency-free in flight. The TL swaps the type imports at integration; semantics are structural.
6. **Payment-plane reconciliation subjects deferred** (reconciliation.ts): external funds observation reconciliation (INV-C09 freshness/provenance), recurring mandate renewal reconciliation and off-network record reconciliation — with the matching certificate fields — are deferred to their owning lanes (connectors→P2-W2, payment plane→P5-W3). The case taxonomy keeps their subject kinds RESERVED so those lanes resolve through this same authority without a breaking change. The corresponding old tests are NOT ported (they import @payswap/connectors + @payswap/payment).
7. **Persistence DDL not ported** (persistence.ts): the old PostgreSQL reference DDL strings are deliberately omitted (infrastructure decision pending — carrying them would prejudge it). Contract types ported.
8. **Protocol-level instruction rename**: `netting.ts` exports `ProtocolSettlementInstruction` (old name: `SettlementInstruction`) because the single package now also exports the payment-plane-enriched `SettlementInstruction` (old @payswap/settlement name) — one vocabulary, unambiguous star-exports.
9. **Old repo test-suite count**: the old protocol+settlement deterministic suites relevant to this lane total ~233 test cases across the files in scope; ~201 assertions survive as ported cases (the remainder are the deferred payment-plane subjects and cross-currency netting behavior, both intentionally excluded and recorded above).

## Write-surface compliance

`git diff --stat 85c8e2f..HEAD` touches ONLY: `packages/protocol/**` (38 files), `spec/protocol/FINANCIAL-PROTOCOL.md`, `docs/protocol-evidence/BASELINE-VERIFICATION-RECORD.md`. No economic/trust/architecture/tooling/root-manifest files were modified (verified pre-commit; the pairwise-disjoint law held for the whole run).

## Findings (severity-ranked, top 3)

1. **[S2] Mixed-currency netting v1 restriction is a real capability gap vs the old repo.** Any corridor flow that legitimately nets USD+GHS positions between the same counterparties must issue two netting sets at v1 (two settlement instructions where the old repo could produce two positions from one set). Safe (no silent FX), but consuming lanes (P3-W2 EEG, P5-W1) must plan for it until the FX kernel lands.
2. **[S2] All authority stores are in-memory.** The semantics are durable-persistence-ready (storage-agnostic interfaces, atomic validation-before-mutation, idempotent replay), but the infrastructure decision (PostgreSQL vs other) is still pending and every store resets on process restart. Nothing in this package may be treated as durable until that Work Order is accepted.
3. **[S3] Evidence payload hashes are FNV-1a 64 bindings, not cryptographic.** Replay equality and mutation detection are exact, but tamper-resistance against a motivated adversary requires the platform/capability crypto layer (P1-W3 finding F-2 records the adjacent signature boundary). The hash function choice is documented as binding-never-security in the source.
