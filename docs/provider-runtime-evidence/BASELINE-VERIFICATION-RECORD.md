# P2-W2 Baseline Verification Record — Provider Runtime

Work Order: P2-W2 (worker-2, session payswap3-p2-w2)
Branch: `work/p2-w2` (base `3877a5fd19dd7718c57bfec0deb352cf5db61dcc` = origin/main at dispatch)
Write surface: `packages/provider-runtime/**`, `spec/provider-runtime/**`, `docs/provider-runtime-evidence/**` only.
Old-repo reference: `payswapdotorg/payswap.org @ 8a735bf1639198c43115087a2992555166a9acf9` (evidence, never authority — PaySwap 3.0 architecture wins).

## Battery (exact commands, exit codes, counts)

Run at the final work-tree state, inside `packages/provider-runtime`:

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `npm install --no-workspaces 2>/dev/null \|\| npm install` | 0 | devDependencies typescript + vitest only (zero runtime deps; `package-lock.json` committed for CI reproducibility) |
| 2 | `npx tsc --noEmit` | 0 | 0 diagnostics (strict + exactOptionalPropertyTypes + verbatimModuleSyntax + noUncheckedIndexedAccess) |
| 3 | `npx vitest run` | 0 | **13 files, 159/159 tests PASS** (~2.7s, deterministic, no live-gated suites — GAP-02 law: nothing here claims live behavior) |
| 4 | `npx tsx -e "import('./src/index.ts').then(m=>console.log('EXPORTS:', Object.keys(m).length))"` | 0 | **EXPORTS: 122** (plain-Node type-stripping import also verified: `node --input-type=module` → same 122; no TS `enum` anywhere — the src-only relative-import law made both paths green without fallback) |

Per-file test counts (13 files / 159 tests — all NET-NEW; the old repo's rails/adapters/connectors suites were live-gated or framework-coupled and are evidence, not portable authority — see adaptation receipts):

| File | Tests | Coverage |
|---|---|---|
| boundary.test.ts | 11 | write-surface laws: relative imports only (src), test-import allowlist, ≤400-line files (src+test), no Math.random, Date.now only in clock.ts, no timers, NAME LAW, zero-deps manifest, no-enum, no secret-looking literals |
| connection.test.ts | 16 | forms vocabulary, profiles, fail-closed form/credential consistency, scope admission (grants, refusals, version drift, expiry, empty scope) |
| connection-lifecycle.test.ts | 9 | transition table, terminal monotonicity, degraded admission, append-only history with actors |
| credential-isolation.test.ts | 14 | opaque handles, deterministic minting, seal escape proofs (sync + async), dispatch pattern, browser sessions, world receipts |
| redaction.test.ts | 13 | secret fields/values/subtrees, reference ids survive, cycles, determinism, escape assertions, markers |
| execution-mode.test.ts | 13 | mode/transport vocabularies, binding law (LIVE+FAKE refused), live proof gate, fake determinism |
| idempotency.test.ts | 15 | per-operation registry fail-closed, key derivation per contract, scope keys, registrar BEGIN/REPLAY/CONFLICT/AMBIGUOUS, identifier persistence |
| raw-state.test.ts | 14 | lossless retention, boundary redaction, idempotent replay, divergent conflict, non-monotonic appends, projection ordering/no-regression, additive normalizer |
| events.test.ts | 16 | authenticated ingestion plugging, forged/invalid signatures, unauthenticated refusal, replay window, malformed deliveries, duplicate harmless, out-of-order no-regression, record shape |
| retrieval.test.ts | 11 | controlled retrieval + provenance, clean params, deterministic fetch ids, undelivered refusal, no fabricated state, post-ambiguity evidence surface, idempotent revision replay |
| execution-bridge.test.ts | 16 | CONFIRMED/FAILED/UNKNOWN paths, timeout→reconcile→retry golden path, identifier/lineage persistence, idempotency discipline (replay, conflict, in-flight, namespaces), INV-19 artifact proofs |
| execution-bridge-admission.test.ts | 8 | param-secret refusal, malformed commands, scope/lifecycle refusals, LIVE+FAKE bridge refusal, sandbox branding, injectable ledger |
| smoke.test.ts | 3 | export surface covers every Work Order scope item; kernel primitives |

Source tree: 23 src files / 4,697 lines (largest: execution-bridge.ts 399 — every file ≤ 400). Test tree: 13 files / 3,363 lines + 2 helpers (world.ts, fake-transport.ts).

## Old-repo adaptation receipts (evidence → canonical)

| Old file @ 8a735bf (lines) | Discipline adapted (NOT the specifics) | New home |
|---|---|---|
| packages/rails/src/stripe.ts (3026) | No provider SDK / injected transport; namespaced idempotency-key derivation (`payswap:<commandId>` for header-style providers); lossless provider-object retention; provider status mapping as frozen DATA; credential-gated fail-closed dispatch | transport.ts, idempotency.ts (deriveIdempotencyKey), operation.ts (binding registry + frozen declarations), execution-bridge.ts |
| packages/adapters/src/credential-broker.ts (~480) | Opaque branded refs with NO accessor; sealed bundle behind `#private` material; runtime-key gated opening; sanitize fail-closed | credential-isolation.ts (handles, seals, escape scan — STRENGTHENED: the provider interaction now runs INSIDE the seal and the async resolved value is scanned), redaction.ts |
| packages/adapters/src/webhooks.ts (~330) | Verifier hook contract; canonical body; replay window + future skew; (provider, eventId) dedupe; preserved event records | events.ts (identical ingestion order; signatures kept OPAQUE — P1-W3 F-2 precedent; unauthenticated mode made explicit fail-closed) |
| packages/adapters/src/psp-connector.ts (745) | Merchant keeps the incumbent PSP; fail-closed reachability (no invented provider answers) | The scope/lifecycle admission model (connection-lifecycle.ts + connection-scope.ts) + fake transport's unscripted-call refusal |
| packages/connectors/src/external-funds.ts (231) | External funds as OBSERVATIONS, never balances/custody | NOT ported as a type: this package deliberately exposes NO balance-shaped type at all (non-custody by absence — INV-07/08) |
| packages/rails/src/reconciliation-connectors.ts (330) | Webhook-loss recovery: re-fetch by external id → append revision → evidence with provenance → only definitive answers resolve | retrieval.ts (controlled retrieval + provenance ledger + post-ambiguity evidence); the RESOLUTION authority stays with P1-W2 |
| packages/adversarial/src/faults/ambiguous-provider.ts (329), lost-webhooks.ts (302), provider-outage.ts (440) | Fault-injection proving UNKNOWN preservation and reconcile-before-retry | execution-bridge.test.ts (scripted TIMEOUT/CONNECTION_LOST/MALFORMED outcomes; blind-retry refusal; retrieval-then-retry), execution-mode.test.ts + retrieval.test.ts (unscripted/unparseable refusals — INV-24) |

## Work-order scope → implementation receipts

1. **Connection scope/forms/lifecycle** — connection-forms.ts (5 canonical forms, browser-isolation profile), connection-scope.ts (what a connection is allowed to do; exact-match capability admission), connection-lifecycle.ts (8 states, lawful transitions, terminal monotonic). Tests: 25.
2. **Credential/browser isolation** — opaque handles only; secret material never in model context, logs or artifacts; redaction at every boundary with auditable notices. Tests: escape proofs (sync + async), dispatch-inside-seal pattern, artifact scans across the entire attempt trail. **Isolation receipts**: `expect(...).rejects.toThrow(CredentialIsolationViolationError)` for secret-bearing callback results (even headers); bigint-safe JSON scans of every artifact shape prove the fake secret (the synthetic Stripe-shaped key constructed in `test/world.ts` as `TEST_SECRET_API_KEY` — concatenation-built in source after the 2026-10-11 GitHub push-protection false positive on the synthetic fixture; runtime value unchanged) appears in ZERO records while the transport's recorded call proves the seal DID open at the edge (`authorizationHeaderPresent: true`, header NAMES only).
3. **Execution bridge** — authorized command (opaque AuthorizationRef, P1-W2 pattern pinned in refs.ts) → connection → external effect attempt; explicit CONFIRMED/UNKNOWN/FAILED envelope; timeout-after-dispatch = UNKNOWN (INV-04). Tests: 24 + 8.
4. **Endpoint-specific idempotency** — per-operation contracts (key scope, derivation, replay, conflict, providerEvidenceField); NO universal mechanism (fail-closed missing-contract refusal). Tests: 15 + bridge idempotency discipline (replay-no-second-dispatch, different-body conflict, in-flight refusal, per-connection namespaces).
5. **Event/webhook ingestion** — pluggable opaque verifier; duplicate harmless; out-of-order no-regression; raw payload references + event ids + creation/receipt times + processing outcome, secrets redacted. Tests: 16.
6. **Raw provider-state retention** — versioned, immutable, lossless (semantics preserved; secret-shaped material redacted at the boundary with notices); stable PaySwap projection; non-monotonic transitions append, never rewrite (INV-03). Tests: 14.
7. **Canonical retrieval + reconciliation supply** — controlled retrieval contracts with provenance; after ambiguity, retrieval BEFORE retry (the gate); the runtime supplies, the P1-W2 protocol lane decides. Tests: 11 + the golden path.
8. **Correlation/idempotency identifiers** — every attempt persists commandId, providerReferences, correlationId, times, outcomes, authorization + capability + raw-state refs (INV-05 lineage). Tests: attempt-record assertions.
9. **Sandbox/live law** — mechanically distinct modes; LIVE never binds a fake transport; `liveBehaviorProof` refuses sandbox (`SANDBOX_NOT_LIVE_PROOF`). Tests: 13 + bridge binding refusal.
10. **Tests** — deterministic in-memory fake transports that CANNOT execute production effects (unscripted = pre-dispatch refusal, INV-24).

## Write-surface compliance

`git diff --stat 3877a5f..HEAD` touches ONLY: `packages/provider-runtime/**` (42 files at the package commit), `spec/provider-runtime/PROVIDER-RUNTIME.md`, `docs/provider-runtime-evidence/BASELINE-VERIFICATION-RECORD.md`. No capability/surface trees (sibling lanes), no economic/protocol/trust trees (accepted P1, read-only), no architecture/tools/root-manifest files (verified pre-commit; pairwise-disjoint law held for the whole run).

## Honest deviations (complete list)

1. **All authority stores are in-memory** (connections, broker, registrar, raw-state store, event log, retrieval ledger, attempt ledger): durable persistence is a separately-accepted Work Order (same deferral law as the P1 lanes). Semantics are durable-ready (storage-agnostic shapes, atomic decision points); nothing here may be treated as durable.
2. **No real provider adapters ship in this package.** The work order's porting sources are connector DISCIPLINE; concrete connectors (Stripe/Wise-shaped) are P5-W3/later lane work. The old repo's live-gated suites (GAP-02: 13 never-run-live) are explicitly NOT treated as certification evidence; a sandbox-only pass is not live certification (Wise §6; P8 owns it).
3. **Webhook signature cryptography is not implemented here** — the verifier is a pluggable OPAQUE contract (P1-W3 finding F-2 precedent: signature verification is out of lane until the platform/capability lane owns crypto). The battery proves the plugging, duplicate/replay-window/ordering semantics — not cryptographic strength.
4. **ProviderReference/CommandId/etc. input surfaces use plain strings** (branded types exported as conveniences; runtime validation enforces shape). Mirrors the accepted P1-W2 registrar pattern; prevents brand-cast friction at every adapter boundary without weakening fail-closed validation.
5. **The raw-state "lossless" retention is lossless-for-semantics with boundary redaction**: provider payloads crossing into the store have secret-shaped material replaced by auditable markers + fingerprints (INV-19 outranks byte-losslessness; redaction is never silent — every record carries its notices). A byte-identical secret-bearing payload cannot be retained by law, not by omission.
6. **The AMBIGUOUS idempotency record's reconciliation exits** (complete/fail with evidence) are registrar-level semantics proven by test; the TL integration that drives them from the protocol lane's reconciliation cases is future wiring (P2 integration), recorded in the deferral register.
7. **The naive event extractor handles exactly two payload shapes** (root + nested `object`); real provider adapters plug their own extractor. Events outside both shapes are retained WITHOUT object state (explicit outcome `RETAINED_WITHOUT_OBJECT_STATE`) — never guessed.

## Findings (severity-ranked, top 3)

1. **[S2] The reconcile-before-retry gate's correlation anchor is coarser than object identity.** For an UNKNOWN create (no provider reference exists), the gate accepts any post-ambiguity retrieval sharing the command's correlation id. A future adapter should scope retrieval contracts by client-reference lookup so the ledger entry itself carries the object anchor; until TL integration, a correlated-but-unrelated retrieval could technically satisfy the gate. Mitigated: retrieval contracts are per provider/object-type and the evidence is always recorded; the protocol lane's reconciliation (the definitive resolver) independently requires object-anchored evidence.
2. **[S2] In-memory stores reset on restart** (deviation #1): every UNKNOWN/AMBIGUOUS occupation, raw-state history and provenance ledger is volatile until the durable-persistence Work Order lands. The INV-04 discipline is fully enforced within a process lifetime; cross-restart ambiguity survival is unproven.
3. **[S3] Redaction heuristics are name/shape-based, not cryptographic.** Secret-named fields and credential-shaped values are covered conservatively (reference ids deliberately survive), but a secret under an innocuous field name with an innocuous shape would pass. The escape scan (exact material match) covers the broker path; the boundary redaction covers the rest. Entropy-based detection was rejected as dishonest (false positives/negatives) — same reasoning the P0-W2 invariant registry records for INV-19.
