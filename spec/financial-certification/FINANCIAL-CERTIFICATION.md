# @payswap/financial-certification — Lane Specification (P8-W1, lane p8-w1)

Status: DELIVERED (4-commit protocol complete; see docs/financial-certification-evidence/P8-W1-VERIFICATION-RECORD.md)
Package: `packages/financial-certification` — `@payswap/financial-certification` v0.1.0
Work Order: P8-W1 (financial invariant/conformance certification — the operator-authorized final wave's financial lane)
Rebuild lane: p8-w1 (base `f9392a3` = origin/main at dispatch, the TL closing report tip)
Porting source (evidence, not authority): payswap.org @ `8a735bf` — the assigned slice of packages/certification + packages/journeys (39 files; dispositions in the evidence record)

## 1. What this package is

The financial invariant/conformance certification suite for fiat
corridors, as ONE deterministic, zero-dependency package: the nine hard
laws as a first-class registry, the per-law conformance verifiers
(quote honesty, endpoint idempotency, funding/payout separation, event
ordering with a total-order proof, ambiguous timeout -> UNKNOWN ->
reconciliation, late-event honesty), the uniform certification gate
wall (one decision pipeline, literal-true requirements, no
component-kind branch expressible), the versioned suites with honest
NOT_APPLICABLE declaration, the versioned digest-chained certification
records, the escalate-only promotion ledger with irreversible halts and
remediation-only clearing, and the GAP-02 live-corridor limitation
surface. The suite is HERMETIC by law: it certifies SUBMITTED
ARTIFACTS (the deterministic dispatch logs, event sets, leg
observations, ambiguity dossiers and late-event probes a corridor
implementation under certification produces over synthetic,
contract-level fixtures) — it never contacts a live provider, never
simulates a financial effect, and never claims live certification.

## 2. Layer law (the declared layer)

- **Declared layer: `security`** (deterministic-gates class). The
  package matches `security.cannot_downgrade_block`: a FAILED
  certification gate halts promotion and CANNOT be downgraded or
  waived — escalate-only. The waiver request is a typed always-throwing
  function (`requestGateWaiver`), the requirements object's seven
  requirements are LITERAL `true` types (a downgraded object is not
  constructible through the type system, and the runtime guard rejects
  untyped attempts), and the promotion ledger turns failed gates into
  irreversible per-subject-version halts that only a NEW passing
  certification evaluation carrying remediation evidence can clear.
- **The package owns CERTIFICATION-GATE and EVIDENCE authority, NOT
  financial truth.** Money semantics (exact integer money, allocation,
  balance projection) stay pinned to `packages/protocol` wires
  (`src/pins/protocol.ts`); mandates/grants stay pinned to
  `packages/trust` (`src/pins/trust.ts`); quote freshness/expiry stay
  pinned to `packages/route-compiler` + `packages/merchant`
  (`src/pins/route-compiler.ts`, `src/pins/merchant.ts`); provider
  outcome/event vocabularies stay pinned to `packages/provider-runtime`
  (`src/pins/provider-runtime.ts`); the customer-facing late stages
  stay pinned to `packages/surface` (`src/pins/surface.ts`). This
  package re-derives NONE of them; it verifies artifacts that CARRY
  them. `may_depend_on [trust, capability, contracts]` is satisfied
  trivially: zero imports, pins only (the leaf-in-flight law).
- Promotion artifacts are CONTRACTS, not deployments: applying a
  promotion to production traffic is a protocol-authority operation
  outside this package.

## 3. The nine hard laws (each machine-enforced + test-proven)

1. **Quote honesty (FIN-LAW-01).** Expired quotes are inert (never
   executable — expiry AT the boundary per the pinned merchant law;
   the inclusive staleness bound per the pinned route-compiler law);
   a material change on ANY axis (beneficiary, payout amount, payout
   currency, fiat price, rail) invalidates the quote AND every command
   built on it; an INDICATIVE quote can never ground a command; quote
   freshness is carried (both windows), never assumed; commands must
   carry the quote's digest (the binding).
2. **Endpoint idempotency (FIN-LAW-02).** Replaying a command at the
   same endpoint with the same idempotency key yields the RECORDED
   outcome, never a second external effect; distinct keys are distinct
   intents (two keys never collapse into one effect); the same key
   with a different intent must surface as a typed conflict — never a
   silent second success, never a re-execution; keys derive per the
   pinned namespaced per-operation contract law (there is NO
   universal mechanism).
3. **Funding/payout separation (FIN-LAW-03).** The two legs are
   separately authorized (distinct grants — one mandate may scope
   both, the issued instruments must differ), separately observed
   (own non-empty evidence), separately reconciled (own records); no
   fused leg, no cross-leg shortcut (payout never observed only
   through funding evidence), no hidden custody (the payout
   destination is an EXTERNAL provider instrument — a PaySwap-internal
   destination is unrepresentable).
4. **Event ordering robustness (FIN-LAW-04).** Duplicate
   commands/events dedupe harmlessly by (provider, eventId);
   out-of-order provider events and delayed returns never regress the
   canonical (newest-revision) state — non-canonical revisions are
   retained and flagged SUPERSEDED_BY_NEWER_OBSERVATION; the
   reconciled state is a PURE FUNCTION OF THE EVENT SET (the declared
   total order (provider, externalId, revision, eventId) with an
   order-independence proof across every derived and supplied
   permutation, duplicate-appended variants included); same-revision
   lifecycle conflicts are surfaced, never silently absorbed.
5. **Ambiguous timeout -> UNKNOWN -> reconciliation (FIN-LAW-05).** A
   timeout (or connection loss, or unparseable answer) NEVER resolves
   to failure or success directly — the classifier's return type
   admits only the UNKNOWN record (with the pinned ambiguity reason
   and requiresReconciliation: true); ONLY external evidence (provider
   statement/retrieval) closes an UNKNOWN — internal closure is a
   violation and throws; an honestly-open UNKNOWN is pending
   reconciliation, never auto-resolved.
6. **Late returns/refunds/chargebacks (FIN-LAW-06).** First-class late
   events RE-OPEN reconciled state (no silent absorption); the
   reopened record carries the prior record's reference AND digest
   (history is never rewritten); receivedAt >= occurredAt (impossible
   ordering fails closed); the late kind maps onto the pinned
   customer-visible surface stage (RETURNED/REFUNDED/CHARGEBACK).
7. **Gate wall (FIN-LAW-07).** Certification suites are UNIFORM across
   component kinds (corridor/provider/route): the decision input
   structurally omits the component kind and the incumbent flag (no
   kind-specific branch is expressible); THE requirements object is a
   single frozen constant of literal-true types; an incumbent/native
   baseline is gated IDENTICALLY; a FAILED gate halts promotion
   irreversibly (escalate-only) and the waiver request always throws.
8. **Evidence lineage (FIN-LAW-08).** Every certification record is
   versioned (recordVersion 1) and DIGEST-CHAINED (each digest covers
   every field INCLUDING the predecessor's digest — tampering with any
   historical record breaks every later digest); the ledger is
   append-only; records are BYTE-DETERMINISTIC functions of their
   inputs (canonical rendering + FNV-1a 64 content addressing); every
   PASSING verdict must cite evidence (a pass is never fabricated).
9. **No live-corridor claim (FIN-LAW-09).** The suite is
   deterministic/hermetic BY LAW; live-corridor certification is
   credential-gated (the GAP-02 class) and exported as a first-class
   frozen limitation; live-claiming evidence kinds
   (LIVE_PROVIDER_EXECUTION, LIVE_CORRIDOR_RUN, MOCK_AS_LIVE,
   SYNTHETIC_PROVIDER_BALANCE, and any LIVE_/MOCK_AS_LIVE marker) are
   rejected at the record boundary, at the gate wall and in the
   verifier — no fake success, no mock-as-live, no synthetic provider
   balance, and the honest remediation is always the hermetic marker
   (SYNTHETIC_CONTRACT_LEVEL).

## 4. The certification pipeline

A corridor/provider/route implementation under certification submits a
DOSSIER of deterministic artifacts (dispatch logs, quote observations
+ commands, leg pairs, event sets, ambiguity dossiers, late-event
probes, hermetic evidence). The pipeline: per-law verifiers produce
`ConformanceVerdict`s (passed DERIVED from violations, digests
content-addressed) -> the uniform gate wall runs the seven gates
(kind-blind) -> the versioned suite evaluation accounts every required
scenario (PASS / FAIL / honestly-declared NOT_APPLICABLE) and gate ->
the record ledger appends the digest-chained certification record ->
the promotion ledger orders the versioned promotion artifact (a
contract, not a deployment), halting irreversibly on any failed gate.

## 5. Hard constraints (all machine-enforced by test/boundary.test.ts)

Zero runtime dependencies; devDependencies exactly `typescript`
(^6.0.3) + `vitest` (^3.2.7); manifest shape per the house pattern
(exports `./src/index.ts`). No `node:` imports in src; no `@payswap/*`
anywhere; tsconfig carries NO paths entries; every import under src/
and test/ is relative; no provider/vendor vocabulary in src (the
corridor-neutrality law); no financial-execution machinery in src (the
certification-not-truth law); no randomness, ambient clock,
floating-point parsing, network or Node globals in src; every file
<= 400 lines; no secret-shaped literals (fixtures assembled at
runtime; digest strings are content addresses, not credentials).

## 6. The GAP-02 live-corridor limitation (explicit)

Live-corridor certification — real provider credentials, real rails,
real money movement — is OUT OF SCOPE for this package by law. It is
credential-gated (the GAP-02 class) and requires operator
authorization this package does not hold and cannot simulate. The
limitation is exported as the frozen `LIVE_CORRIDOR_LIMITATION` fact
(enabled: literal false, limitationClass "GAP-02") and is recorded in
the evidence record. What this package certifies is hermetic,
deterministic, contract-level conformance: the subject's own
mapping/contract code exercised over synthetic fixtures. It never
claims live certification, and it rejects any artifact that does.

## 7. Integration notes (TL-owned, single-writer law)

The TL adds the MODULE-OWNERSHIP annotation (layer `security`,
deterministic-gates class) and the CI lane at integration, and wires
the authoritative sibling imports in place of the structural pins
(byte-identical VALUE pins, subset-typed STRUCTURE pins — verified by
test/pins.test.ts truth tables). Root files (lockfile, workflows,
pnpm-workspace) are untouched by this lane.
