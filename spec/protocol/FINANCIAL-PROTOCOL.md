# PaySwap 3.0 — Financial Protocol (Work Order P1-W2)

Status: IMPLEMENTED (Phase 1, lane worker-2)
Package: `@payswap/protocol` (`packages/protocol`) — the ONE Financial Protocol Authority implementation for PaySwap 3.0 (INV-01).
Layer: `financial` (MODULE-OWNERSHIP.yaml: may_depend_on [contracts, trust, capability]). For Phase 1 the package is DELIBERATELY dependency-free (zero runtime deps, zero `@zcode/*`, zero sibling `@payswap/*` imports); the trust-lane surfaces it will consume are structurally pinned locally and wired by the TL at integration.

Old-repo evidence (never authority): `payswapdotorg/payswap.org @ 8a735bf1639198c43115087a2992555166a9acf9` — `packages/protocol` (old W1-001/W1-002/W1-003) and `packages/settlement` (old W1-004). PaySwap 3.0 architecture wins; the old kernel + its green tests are the behavioral oracle (migration-matrix entries MMI-04, MMI-09, MMI-10, MMI-12, MMI-17).

## Canonical invariant mapping (old → new)

| Old invariant | Canonical | Enforced in |
|---|---|---|
| INV-F01 exact money (no floats) | INV-02 | `src/money.ts` (`FloatMoneyRejectedError` on every JS-number path) |
| INV-F02 journal append-only; INV-F07 netting derivation preserved; INV-E05 evidence immutable | INV-03 | `src/ledger/*`, `src/netting.ts`, `src/settlement/evidence.ts` |
| INV-X01/X02/X03 UNKNOWN ≠ FAILED; reconcile before consequential retry | INV-04 | `src/errors.ts`, `src/settlement/attempts.ts`, `src/settlement/reconciliation.ts`, `src/aggregate.ts` |
| INV-E01/E02/E03/E04 authorization + evidence lineage, proof levels, provenance caps | INV-05 (+INV-24 no fake success) | `src/authorization.ts`, `src/settlement/evidence.ts`, `src/settlement/proof.ts` |
| INV-F05 + INV-O01 idempotent, replay-safe commands | INV-06 | `src/idempotency.ts`, `src/settlement/attempts.ts` |
| INV-F06 protocol-owned finality | INV-01 | `src/settlement/finality.ts` |
| INV-F04 reservations ≤ available | reservation law under INV-01 | `src/reservation.ts` |
| INV-C06 provider history append-only | INV-14 | `src/settlement/provider-revisions.ts` |
| INV-O02/O03/O04 outbox atomicity, migration compat, replay rebuild | deferred with persistence (below) | `src/persistence.ts` (contract types only) |

## The financial lifecycle (canonical contract)

```
Economic Activity → Fulfillment Activity → Clearing Record → Obligation
                  → Netting Set → Net Position → Settlement Instruction
                  → Settlement Attempt → Rail Operation → Finality Record
```

1. **Fulfillment Activity** (`src/obligation.ts`): one unit of fulfilled economic activity — `debtor` owes `creditor` a positive exact `Money` amount as of `occurredAt`, with optional causation/correlation lineage.
2. **Clearing Record** (`src/obligation.ts`): groups activities cleared together; `netted` marks upstream-net positions; the gross derivation is preserved regardless.
3. **Obligation** (`src/obligation.ts` + `src/obligation-book.ts`): derived PURELY and deterministically by `deriveObligations` — exact integer netting per (debtor, creditor) pair × currency; content-derived ids (`OBL:<record>:<pair>:<currency>`); lifecycle `PENDING → SETTLED | CANCELLED | DEFAULTED` via the deterministic kernel machine (SETTLE guarded to the due window; DEFAULT guarded to strictly after close; terminals monotonic).
4. **Netting Set → Net Position** (`src/netting.ts`): pure function over `(NettingSet, Obligation[])`; exact membership required; every `NetPosition` carries the full gross derivation; `canonicalNetPosition` is the byte-identical canonical rendering. **v1 law: SAME-CURRENCY sets only** (see Known Limitations).
5. **Settlement Instruction** (`src/netting.ts` protocol-level `ProtocolSettlementInstruction`; payment-plane enrichment in `src/settlement/instructions.ts`): exactly one executable movement per net position (sum preserved, content-derived `SI:<set>:<pair>:<currency>` ids); the enriched instruction adds end-to-end remittance references, the EXTERNAL settlement destination (never PaySwap custody) and mandatory authorization lineage (`AuthorizationRef[]`, INV-05).
6. **Settlement Attempt** (`src/settlement/attempts.ts` + `attempt-ledger.ts`): the idempotent (INV-06), retry-safe execution record against an external rail. States: `PENDING → IN_FLIGHT → SUCCEEDED | FAILED | OUTCOME_UNKNOWN`. `OUTCOME_UNKNOWN` is non-terminal and has exactly two exits — `RECONCILE_RESOLVED_SUCCEEDED` / `RECONCILE_RESOLVED_FAILED` — fireable only through a reconciliation resolution carrying evidence. Every external-effect event requires linked evidence ids (START is the only pure local transition).
7. **Rail Operation**: the external effect itself lives outside the protocol (capability/provider lanes, P2); the protocol records its observation through `recordExternalOutcome` with provider evidence.
8. **Finality Record** (`src/settlement/finality.ts`): protocol-owned (INV-01). `FinalityAuthority.declareFinality` verifies, in order: (a) the instruction is EXACTLY a protocol-derived settlement instruction (re-derivation from the netting set + obligations with canonical comparison — hand-minted or tampered instructions cannot finalize); (b) the instruction is fully reconciled (no `OUTCOME_UNKNOWN` attempt, no OPEN case, ≥1 SUCCEEDED attempt — INV-04); (c) the policy-required proof level is satisfied (INV-05/INV-24). SUBMITTED IS NOT FINALITY. FINAL is terminal; the only exit is the declared REVERSE recovery rule, legal only with a compensating-obligation reference.

**Evidence is separate but linked** (`src/settlement/evidence.ts`): every consequential action carries an `ActionEvidenceLineage` queryable per DISTINCT kind.

## Evidence-kind taxonomy (P1-W2 requirement)

The old repo used generic kinds (AUTHORIZATION / EXECUTION / OUTCOME / RECONCILIATION / PROOF / RECEIPT). PaySwap 3.0 requires DISTINCT kinds so funding, conversion, payout, external observation and finality can never be conflated — a "payout sent" record is NOT beneficiary-account credit (INV-24):

| New kind | Documents | Old kind(s) |
|---|---|---|
| `AUTHORIZATION` | why the action was allowed (INV-05) | AUTHORIZATION |
| `FUNDING` | the funding leg (source-side value movement) | EXECUTION |
| `CONVERSION` | the conversion leg (FX conversion executed; kernel deferred, evidence kind reserved) | EXECUTION |
| `PAYOUT` | the payout leg (payment submitted to the rail — PaySwap's outgoing action) | EXECUTION |
| `OBSERVATION` | external observation (what an EXTERNAL system was observed to state — its own kind, never what PaySwap did) | OUTCOME |
| `FINALITY` | protocol-owned finality declarations | RECEIPT |
| `RECONCILIATION` | reconciliation resolutions | RECONCILIATION |

`PROOF` is folded into the proof-level vocabulary (`src/settlement/proof.ts`): every node carries a `claimedLevel` (P0–P5) which is capped by its provenance (`UI_BROWSER_ARTIFACT` never proves more than P0/P1 — `effectiveEvidenceLevel`); `proofSatisfaction` measures the maximum effective level of a chain against the policy-required level; refund/dispute symmetry is enforced by construction and testable via `refundDisputeSymmetricLevels`.

## UNKNOWN vs FAILED (INV-04) — the ambiguity discipline

- `ExternalAmbiguityError` is NOT a failure outcome (`isFailureOutcome` returns `false`); every instance carries `requiresReconciliation: true`.
- A settlement attempt in `OUTCOME_UNKNOWN`:
  - cannot be directly written to a definitive outcome (structurally refused in `recordExternalOutcome`);
  - cannot be retried (`requestRetry` fails closed with `SettlementRetryForbiddenError`);
  - can ONLY exit through `SettlementReconciliationAuthority.resolveCase` → `SettlementAttemptLedger.resolveUnknown`, which requires a principal, a case id and non-empty evidence ids.
- Reconciliation is the ONLY definitive resolver of ambiguous external effects (MMI-10): cases are immutable once resolved; an unresolvable case stays OPEN; finality and certificates are gated on full reconciliation.
- Provider revision history is append-only (`ProviderRevisionLedger`): a divergent re-record of the same revision is rejected (INV-14); identical re-records replay idempotently.

## Exact money (MMI-09) and the AmountSpec bridge

`src/money.ts` is the ONE owner of exact-integer money semantics: `Money { currency: CurrencyCode, value: bigint }` in integer minor units; every JS-number path throws `FloatMoneyRejectedError` (INV-02 — even `0.1`); full arithmetic (`add`, `sub`, `compare`, `equals`, `negate`, `abs`, sign predicates, `multiplyByInteger`, `fromDecimalString` with extra-precision-as-error) and deterministic `allocate` (largest-remainder split, no dust lost, ties by lowest index, symmetric for negatives); a process-local currency registry seeded with USD/EUR/GBP/JPY/GHS/NGN/KES/ZAR (re-registration with different digits rejected).

The pinned cross-lane wire shape (byte-identical pin in all three Phase-1 lanes; the trust lane owns the TYPE):

```ts
interface AmountSpec {
  readonly currency: string;   // /^[A-Z]{3}$/
  readonly minorUnits: string; // /^(0|[1-9][0-9]*)$/
}
```

The bridge (`src/amount-spec.ts`): `amountSpecToMoney` (structural validation + registry lookup + BigInt parse — never a float; non-negative by construction) and `moneyToAmountSpec` (canonical decimal string; negative money refused). The TL swaps the type import to `@payswap/trust` at integration without touching semantics.

## Authorization lineage boundary (INV-05)

Trust artifacts are owned by the trust lane (packages/trust, accepted P1-W3) which was in flight relative to this package's dispatch; the layer law keeps this package dependency-free for Phase 1. Authorization is therefore represented as OPAQUE STRUCTURAL refs (`src/authorization.ts`):

```ts
interface AuthorizationRef {
  readonly artifactId: string;   // trust-lane approval/authorization artifact id (opaque here)
  readonly mandateRef: string;   // mandate under which the artifact was issued (opaque here)
  readonly approverRef: string;  // approving principal (opaque trust-lane reference)
  readonly epoch: bigint;        // security/policy epoch at issuance (non-negative; stale epochs never authorize)
  readonly artifactHash?: string; // optional artifact integrity hash (opaque; signatures are P1-W3 finding F-2 territory)
}
```

No trust semantics are validated here — only structural completeness. This TIGHTENS the old repo's untyped `authorizationRefs: readonly string[]` so artifact/mandate/approver/epoch dimensions cannot be conflated. Trust-lane wiring lands at TL integration.

## Protocol kernel

`errors.ts` (PaySwapError taxonomy with stable codes + categories + the INV-04 classifier), `identifiers.ts` (branded ids; deterministic `IdFactory` over injected clock + monotonic — never entropy), `envelope.ts` (frozen command/event envelopes with causation/correlation lineage surviving end-to-end; PROTOCOL_SCHEMA_VERSION = 1), `clock.ts` (`DeterministicClock` for tests/replay; `SystemProtocolClock` edge adapter; `EpochCounter` with regression detection), `state-machine.ts` (declared graphs; definition-time validation; one rule per (from, on); guards pure; terminals monotonic with explicit recovery-only exits), `idempotency.ts` (BEGIN/REPLAY/CONFLICT discipline; FAILED re-arms; results deterministic), `aggregate.ts` (event-sourced fold; OCC version checks; all-or-nothing rehydration; TerminalState vocabulary with the UNKNOWN reconciliation marker).

## Ledger (in-memory contract types, ported with tests)

`ledger/journal.ts` + `ledger/posting.ts`: append-only double-entry accountability accounting — balanced entries only (zero-sum signed lines), single currency per entry, one currency per account, frozen storage, atomic validation-before-mutation. `ledger/projections.ts`: pure deterministic folds; `rebuildProjection ≡ projectBalances` by construction. NOT a custodial user-balance ledger (INV-07/08): projections describe network obligations/positions and protocol capacity.

## Reservations

`reservation.ts`: atomic holds with `available = projected balance − active (PENDING/ACTIVE) reservations` computed inside the single synchronous `reserve` call; `InsufficientAvailableFundsError` leaves the book untouched; declarative expiry via the injected clock (never timers, never ambient time); terminal states CAPTURED/RELEASED/EXPIRED monotonic.

## Deferral register (a found limitation is a deliverable)

| Deferred item | Old-repo evidence (paths @ 8a735bf) | Reason / dependency |
|---|---|---|
| FX kernel (exact rational quotes, rate/fee/spread provenance) | `packages/protocol/src/fx.ts` (420 lines) | P5-W1 route-optimization dependency; cross-currency netting needs it (see below) |
| Liquidity kernel (observed assets/positions, liquidity reservations, forecasts) | `packages/protocol/src/liquidity.ts` (674 lines) | P5-W1 dependency |
| Credit kernel (credit lines, per-draw CreditExposure — "delay is never hidden credit") | `packages/protocol/src/credit.ts` (390 lines) | P5-W1 dependency |
| Collateral kernel | `packages/protocol/src/collateral.ts` (138 lines) | P5-W1 dependency |
| Value Conversion Graph (bounded route enumeration) | `packages/protocol/src/value-graph.ts` (523 lines) | FX + capability fabric (P2/P5) dependency |
| Durable outbox implementation (InMemoryOutbox + drain fail-stop) | `packages/protocol/src/outbox.ts` (424 lines) | Infrastructure decision pending; CONTRACT TYPES ported (`src/persistence.ts`) |
| Persistence adapters (PostgreSQL event journal/outbox/checkpoints + DDL) | `packages/protocol/src/persistence.ts` (297 lines), `packages/protocol/src/conventions/persistence.md` | Infrastructure decision pending; only contract TYPES ported, no drivers, no connection code, and deliberately NO DDL (the old DDL prejudges PostgreSQL) |
| Payment-plane reconciliation subjects (external funds observation freshness/provenance, recurring mandate renewal, off-network records) | `packages/settlement/src/reconciliation.ts` (the INV-C09 / mandate / off-network sections importing `@payswap/connectors` + `@payswap/payment`) | Owning lanes not yet present (connectors → P2-W2 provider runtime; payment plane → P5-W3); case taxonomy kinds RESERVED so those lanes resolve through this same authority |
| Provider-state classification (`classifyProviderOutcome`) | `packages/execution/src/reconciliation.ts` (via `@payswap/execution`) | Provider runtime lane (P2-W2); the protocol consumes outcomes via `recordExternalOutcome` |
| Cross-currency netting within one set | `packages/protocol/src/netting.ts` old behavior (per-currency positions from one mixed set) | **v1 known limitation** — see below |

## Known limitations (v1)

1. **Same-currency netting only.** A netting set spanning multiple currencies is rejected with `MixedCurrencyNettingSetError` (typed, with offending currency/obligation details). The old repo produced one net position per currency from a mixed set; PaySwap 3.0 v1 defers that because cross-currency netting silently embeds an FX conversion and the FX kernel is deferred to P5-W1. Workaround: net each currency in its own set. (Deliberate deviation from old behavior, recorded here and in the baseline verification record.)
2. **In-memory reference stores.** The obligation book, reservation book, ledger journal, idempotency registrar, evidence graph, attempt ledger, reconciliation authority, finality authority, certificate authority and provider revision ledger are deterministic in-memory reference implementations. Durable persistence is deferred pending the infrastructure decision; production replaces persistence, not semantics.
3. **Opaque authorization refs.** Authorization lineage is structurally complete but semantically opaque until the TL wires the trust lane at integration (mandate validity, attenuation, security-epoch linkage checks live there).
4. **Evidence hash is a binding, not security.** `fnv1a64` payload hashes bind evidence content for replay equality; cryptographic signing is platform/capability territory (P1-W3 finding F-2 records the same boundary).

## Test evidence

21 files / 238 tests, all green (deterministic; no live-gated suites). Ported from the old protocol + settlement suites with adaptations, plus net-new coverage for the P1-W2-specific contracts (AmountSpec bridge, opaque authorization refs, same-currency netting law, distinct evidence kinds, UNKNOWN discipline). Per-file counts and the ported-vs-net-new split are recorded in `docs/protocol-evidence/BASELINE-VERIFICATION-RECORD.md`.

## Boundary law (machine-checked)

Zero runtime dependencies; every import under `src/` is relative; no `Math.random`; host wall clock read ONLY in the `clock.ts` edge adapter; no timers; every file ≤ 400 lines; no TS enums (plain-Node type-stripping compatibility). Enforced by `test/boundary.test.ts`.
